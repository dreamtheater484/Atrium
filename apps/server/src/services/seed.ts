import { randomUUID } from 'node:crypto';
import { asSystem, type Db } from '@atrium/db';
import type { SeedChange, SeedDataset, SeedElement, SeedRelation } from '@atrium/demo-data';
import { type Element, lifecycleAt, type Relation, todayIso, typeDef } from '@atrium/schema';
import { SYSTEM } from '../auth/context';
import { openChangeset, recordChange } from './changesets';
import type { Deps } from './deps';
import { refreshAllDerived } from './derived';
import { inferVersion } from './eol';
import { insertElementRow, insertRelationRow } from './rows';
import { updateWorkspace } from './workspace';

function toElement(s: SeedElement, refs: Map<string, string>, by: string): Element {
  const now = new Date().toISOString();
  const dates = s.lifecycleDates ?? {};
  const phase = lifecycleAt(null, dates, todayIso());
  return {
    id: refs.get(s.ref)!,
    type: s.type,
    key: s.key ?? null,
    name: s.name,
    description: s.description ?? '',
    domainId: s.domain ? (refs.get(s.domain) ?? null) : null,
    parentId: s.parent ? (refs.get(s.parent) ?? null) : null,
    owner: s.owner ?? null,
    lifecycle: typeDef(s.type).hasLifecycle
      ? (s.lifecycle ?? (phase && phase !== 'not_yet' ? phase : null))
      : null,
    lifecycleDates: dates,
    classification: s.classification ?? 'internal',
    attributes: { ...(s.attributes ?? {}) },
    tags: s.tags ?? [],
    externalIds: s.externalIds ?? {},
    source: 'sample',
    layer: 'org',
    pack: null,
    quality: 0,
    health: null,
    healthReasons: [],
    suggestions: {},
    createdAt: now,
    createdBy: by,
    updatedAt: now,
    updatedBy: by,
    version: 1,
  };
}

function toRelation(r: SeedRelation, refs: Map<string, string>, by: string): Relation | null {
  const sourceId = refs.get(r.from);
  const targetId = refs.get(r.to);
  if (!sourceId || !targetId) return null;
  return {
    id: randomUUID(),
    type: r.type,
    sourceId,
    targetId,
    attributes: r.attributes ?? {},
    createdAt: new Date().toISOString(),
    createdBy: by,
  };
}

/** Turns seed changes into recorded changes against the elements already loaded. */
async function recordSeedChanges(
  db: Db,
  changesetId: string,
  changes: SeedChange[],
  refs: Map<string, string>,
  current: Map<string, Element>,
  relations: Relation[],
  by: string,
) {
  for (const ch of changes) {
    if (ch.op === 'create') {
      refs.set(ch.element.ref, refs.get(ch.element.ref) ?? randomUUID());
      const el = toElement(ch.element, refs, by);
      current.set(el.id, el);
      await recordChange(db, changesetId, 'create', 'element', el.id, null, el, true);
    } else if (ch.op === 'update') {
      const id = refs.get(ch.ref);
      const before = id ? current.get(id) : undefined;
      if (!before) continue;
      const { domain, parent, attributes, ...rest } = ch.set;
      const after: Element = {
        ...before,
        ...(rest as Partial<Element>),
        domainId: domain ? (refs.get(domain) ?? before.domainId) : before.domainId,
        parentId: parent ? (refs.get(parent) ?? before.parentId) : before.parentId,
        attributes: { ...before.attributes, ...(attributes ?? {}) },
      };
      current.set(after.id, after);
      await recordChange(db, changesetId, 'update', 'element', after.id, before, after, true);
    } else if (ch.op === 'delete') {
      const id = refs.get(ch.ref);
      const before = id ? current.get(id) : undefined;
      if (!before) continue;
      await recordChange(db, changesetId, 'delete', 'element', before.id, before, null, true);
    } else if (ch.op === 'relate') {
      const rel = toRelation(ch.relation, refs, by);
      if (rel) await recordChange(db, changesetId, 'create', 'relation', rel.id, null, rel, true);
    } else if (ch.op === 'unrelate') {
      const s = refs.get(ch.relation.from);
      const t = refs.get(ch.relation.to);
      const rel = relations.find(
        (r) => r.type === ch.relation.type && r.sourceId === s && r.targetId === t,
      );
      if (rel) await recordChange(db, changesetId, 'delete', 'relation', rel.id, rel, null, true);
    }
  }
}

/** Loads a sample dataset (Acme Telco) into an empty workspace. */
export async function loadDataset(
  deps: Deps,
  dataset: SeedDataset,
): Promise<{ elements: number; relations: number }> {
  const ctx = SYSTEM(deps.config.mode);
  const by = 'Atrium sample data';
  const refs = new Map<string, string>();
  for (const e of dataset.elements) refs.set(e.ref, randomUUID());
  const elements = dataset.elements.map((e) => toElement(e, refs, by));
  for (const el of elements) {
    if (el.type === 'technology' && !el.attributes.version) {
      const v = inferVersion(el.name);
      if (v) el.attributes.version = v;
    }
    if (el.type === 'technology' && !el.attributes.eol_date) {
      const info = await deps.eol.lookup(
        el.name,
        el.attributes.product as string,
        el.attributes.version as string,
      );
      if (info?.eolDate) {
        el.attributes.eol_date = info.eolDate;
        if (info.extendedDate) el.attributes.extended_support_date = info.extendedDate;
        el.attributes._eol = {
          product: info.product,
          cycle: info.cycle,
          source: info.source,
          url: `https://endoflife.date/${info.product}`,
          ...(info.extendedDate ? { extended: true } : {}),
        };
      }
    }
  }
  const relations = dataset.relations
    .map((r) => toRelation(r, refs, by))
    .filter(Boolean) as Relation[];

  await asSystem(deps.sql, async (tx) => {
    // Domains first, then parents before children.
    const ordered = [...elements].sort(
      (a, b) => (a.type === 'domain' ? -1 : 0) - (b.type === 'domain' ? -1 : 0),
    );
    const inserted = new Set<string>();
    const pending = [...ordered];
    let guard = 0;
    while (pending.length && guard++ < 20) {
      for (let i = pending.length - 1; i >= 0; i--) {
        const el = pending[i]!;
        const ready =
          (!el.parentId || inserted.has(el.parentId)) &&
          (!el.domainId || inserted.has(el.domainId) || el.type === 'domain');
        if (!ready) continue;
        await insertElementRow(tx, el);
        inserted.add(el.id);
        pending.splice(i, 1);
      }
    }
    for (const r of relations) await insertRelationRow(tx, r);

    // Teams for demo users
    for (const u of dataset.users) {
      const teamIds = u.teams.map((t) => refs.get(t)).filter(Boolean) as string[];
      await tx`
        insert into users (email, name, role, team_ids, onboarded)
        values (${u.email}, ${u.name}, ${u.role}, ${teamIds}::uuid[], true)
        on conflict (email) do update set team_ids = excluded.team_ids`;
    }

    const current = new Map(elements.map((e) => [e.id, e]));
    for (const sc of dataset.scenarios) {
      const scenarioId = randomUUID();
      if (sc.isTarget) await tx`update scenarios set is_target = false where is_target`;
      await tx`
        insert into scenarios (id, name, description, is_target, target_date, created_by)
        values (${scenarioId}, ${sc.name}, ${sc.description}, ${sc.isTarget}, ${sc.targetDate}, ${by})`;
      const csId = await openChangeset(tx, ctx, {
        kind: 'scenario',
        status: 'draft',
        title: sc.name,
        scenarioId,
      });
      await recordSeedChanges(tx, csId, sc.changes, new Map(refs), new Map(current), relations, by);
    }

    for (const sg of dataset.suggestions) {
      const csId = randomUUID();
      const [author] = await tx`select id from users where name = ${sg.authorName}`;
      await tx`
        insert into changesets (id, kind, status, title, description, author_id, author_name, author_kind, submitted_at)
        values (${csId}, 'suggestion', 'open', ${sg.title}, ${sg.description}, ${author?.id ?? null},
                ${sg.authorName}, ${sg.authorKind}, now() - interval '2 hours')`;
      await recordSeedChanges(
        tx,
        csId,
        sg.changes,
        new Map(refs),
        new Map(current),
        relations,
        sg.authorName,
      );
    }

    await refreshAllDerived(tx);
    await updateWorkspace(tx, deps.config.workspaceName, { sampleLoaded: true });
  });
  deps.store.bump();
  deps.hub.broadcast({ type: 'model.changed', ids: [], by });
  return { elements: elements.length, relations: relations.length };
}

/** Removes every element, relation, scenario and change. Users and tokens stay. */
export async function clearModel(deps: Deps): Promise<void> {
  await asSystem(deps.sql, async (tx) => {
    await tx`delete from changesets`;
    await tx`delete from scenarios`;
    await tx`delete from relations`;
    await tx`delete from comments`;
    await tx`delete from elements`;
    await tx`delete from reference_packs`;
    await updateWorkspace(tx, deps.config.workspaceName, { sampleLoaded: false });
  });
  deps.store.bump();
  deps.hub.broadcast({ type: 'model.changed', ids: [], by: 'Atrium' });
}
