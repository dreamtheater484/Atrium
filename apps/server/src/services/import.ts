import { randomUUID } from 'node:crypto';
import {
  type Candidate,
  type ColumnTarget,
  detectElementType,
  guessMapping,
  type NormalizedModel,
  type ParsedFile,
  type ParsedSheet,
  parseFile,
  type SheetMapping,
  sheetToCandidates,
} from '@atrium/importers';
import {
  ELEMENT_TYPE_DEFS,
  type Element,
  type ElementType,
  enumLabel,
  normalizeName,
  similarity,
  typeDef,
} from '@atrium/schema';
import type { RequestContext } from '../auth/context';
import { badRequest, notFound } from '../http/errors';
import { audit } from './audit';
import { ChangeBuilder } from './builder';
import type { Deps } from './deps';
import { canEditDirectly } from './policy';
import { resolveState } from './store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StoredImport {
  id: string;
  createdAt: number;
  userId: string | null;
  files: Array<{ name: string; parsed: ParsedFile }>;
  sheets: Array<{
    fileIndex: number;
    sheet: ParsedSheet;
    type: ElementType;
    mapping: SheetMapping;
    remembered: boolean;
  }>;
  models: Array<{ fileIndex: number; model: NormalizedModel }>;
}

/** Parsed uploads waiting for the person to confirm (kept for 30 minutes). */
const pending = new Map<string, StoredImport>();
setInterval(() => {
  const cutoff = Date.now() - 30 * 60_000;
  for (const [k, v] of pending) if (v.createdAt < cutoff) pending.delete(k);
}, 60_000).unref();

const signature = (sheet: ParsedSheet) => sheet.headers.map(normalizeName).sort().join('|');

export function targetLabel(t: ColumnTarget, type: ElementType): string {
  switch (t.kind) {
    case 'core':
      return {
        name: 'Name',
        key: 'Key',
        description: 'Description',
        owner: 'Owner',
        domain: 'Domain',
        parent: 'Part of',
        lifecycle: 'Lifecycle',
        classification: 'Classification',
        tags: 'Tags',
        team: 'Team',
        external_id: 'ID in source system',
      }[t.field];
    case 'attribute':
      return ELEMENT_TYPE_DEFS[type].attributes.find((a) => a.key === t.key)?.label ?? t.key;
    case 'relation':
      return `Link: ${t.relation.replace('_', ' ')} ${typeDef(t.targetType).label.toLowerCase()}`;
    case 'lifecycle_date':
      return `${enumLabel(t.phase)} date`;
    case 'level':
      return `Level ${t.level}`;
    default:
      return 'Ignore';
  }
}

/* ------------------------------------------------------------------ */
/* Matching                                                             */
/* ------------------------------------------------------------------ */

interface MatchIndex {
  byId: Map<string, Element>;
  byExternal: Map<string, Element>;
  byKey: Map<string, Element>;
  byName: Map<string, Element>;
  all: Element[];
}

function matchIndex(elements: Iterable<Element>): MatchIndex {
  const idx: MatchIndex = {
    byId: new Map(),
    byExternal: new Map(),
    byKey: new Map(),
    byName: new Map(),
    all: [],
  };
  for (const e of elements) {
    if (e.layer !== 'org') continue;
    idx.all.push(e);
    idx.byId.set(e.id, e);
    for (const v of Object.values(e.externalIds))
      idx.byExternal.set(`${e.type}:${String(v).toLowerCase()}`, e);
    if (e.key) idx.byKey.set(`${e.type}:${e.key.toLowerCase()}`, e);
    idx.byName.set(`${e.type}:${normalizeName(e.name)}`, e);
  }
  return idx;
}

function findMatch(
  idx: MatchIndex,
  type: ElementType,
  c: { name: string; key?: string; externalId?: string },
): { el: Element; how: 'id' | 'external' | 'key' | 'name' | 'similar' } | null {
  if (c.externalId && UUID.test(c.externalId)) {
    const el = idx.byId.get(c.externalId);
    if (el) return { el, how: 'id' };
  }
  if (c.externalId) {
    const el = idx.byExternal.get(`${type}:${c.externalId.toLowerCase()}`);
    if (el) return { el, how: 'external' };
  }
  if (c.key) {
    const el = idx.byKey.get(`${type}:${c.key.toLowerCase()}`);
    if (el) return { el, how: 'key' };
  }
  const exact = idx.byName.get(`${type}:${normalizeName(c.name)}`);
  if (exact) return { el: exact, how: 'name' };
  let best: Element | null = null;
  let bestScore = 0;
  for (const e of idx.all) {
    if (e.type !== type) continue;
    const s = similarity(e.name, c.name);
    if (s > bestScore) {
      best = e;
      bestScore = s;
    }
  }
  return best && bestScore >= 0.86 ? { el: best, how: 'similar' } : null;
}

/* ------------------------------------------------------------------ */
/* Preview                                                              */
/* ------------------------------------------------------------------ */

export interface SheetPreview {
  index: number;
  file: string;
  name: string;
  rows: number;
  type: ElementType;
  typeReason: string;
  confidence: number;
  remembered: boolean;
  columns: Array<{
    header: string;
    target: ColumnTarget;
    label: string;
    confidence: number;
    samples: string[];
  }>;
  outcome: { create: number; update: number; unchanged: number; similar: number; skipped: number };
  examples: Array<{
    row: number;
    name: string;
    outcome: 'create' | 'update' | 'unchanged';
    match?: string;
    how?: string;
    fields?: string[];
  }>;
  warnings: string[];
}

export interface ImportPreview {
  importId: string;
  files: Array<{ name: string; format: string; warnings: string[] }>;
  sheets: SheetPreview[];
  models: Array<{
    file: string;
    elements: number;
    relations: number;
    byType: Record<string, number>;
  }>;
  totals: { create: number; update: number; unchanged: number; relations: number };
  mode: 'direct' | 'suggestion';
}

function candidateDiff(c: Candidate, el: Element, domainName: string | null): string[] {
  const fields: string[] = [];
  if (c.description && c.description.trim() !== el.description.trim()) fields.push('description');
  if (c.owner && c.owner !== el.owner) fields.push('owner');
  if (c.lifecycle && c.lifecycle !== el.lifecycle) fields.push('lifecycle');
  if (c.classification && c.classification !== el.classification) fields.push('classification');
  if (c.domainName && normalizeName(c.domainName) !== normalizeName(domainName ?? ''))
    fields.push('domain');
  for (const [k, v] of Object.entries(c.attributes)) {
    if (
      v !== undefined &&
      v !== null &&
      v !== '' &&
      JSON.stringify(v) !== JSON.stringify(el.attributes[k])
    )
      fields.push(k);
  }
  return fields;
}

async function buildPreview(
  deps: Deps,
  ctx: RequestContext,
  stored: StoredImport,
): Promise<ImportPreview> {
  const state = await resolveState(deps.store, deps.sql, ctx, { includeDrafts: false });
  const idx = matchIndex(state.elements.values());
  const domainName = (id: string | null) => (id ? (state.elements.get(id)?.name ?? null) : null);
  const totals = { create: 0, update: 0, unchanged: 0, relations: 0 };
  const sheets: SheetPreview[] = stored.sheets.map((s, i) => {
    const { candidates, warnings } = sheetToCandidates(s.sheet, s.mapping);
    const outcome = {
      create: 0,
      update: 0,
      unchanged: 0,
      similar: 0,
      skipped: s.sheet.rows.length - candidates.length,
    };
    const examples: SheetPreview['examples'] = [];
    for (const c of candidates) {
      const m = findMatch(idx, c.type, c);
      totals.relations += c.relations.reduce((n, r) => n + r.names.length, 0);
      let ex: SheetPreview['examples'][number];
      if (!m) {
        outcome.create++;
        ex = { row: c.row, name: c.name, outcome: 'create' };
      } else {
        const fields = candidateDiff(c, m.el, domainName(m.el.domainId));
        if (m.how === 'similar') outcome.similar++;
        if (fields.length) {
          outcome.update++;
          ex = {
            row: c.row,
            name: c.name,
            outcome: 'update',
            match: m.el.name,
            how: m.how,
            fields,
          };
        } else {
          outcome.unchanged++;
          ex = { row: c.row, name: c.name, outcome: 'unchanged', match: m.el.name, how: m.how };
        }
      }
      if (examples.length < 12 && (ex.outcome !== 'unchanged' || examples.length < 4))
        examples.push(ex);
    }
    totals.create += outcome.create;
    totals.update += outcome.update;
    totals.unchanged += outcome.unchanged;
    return {
      index: i,
      file: stored.files[s.fileIndex]!.name,
      name: s.sheet.name,
      rows: s.sheet.rows.length,
      type: s.type,
      typeReason: detectElementType(s.sheet).reason,
      confidence: s.mapping.confidence,
      remembered: s.remembered,
      columns: s.sheet.headers.map((h) => {
        const target = s.mapping.columns[h] ?? { kind: 'ignore' as const };
        return {
          header: h,
          target,
          label: targetLabel(target, s.type),
          confidence: s.mapping.columnConfidence[h] ?? 0,
          samples: s.sheet.rows
            .map((r) => r[h])
            .filter((v) => v !== null && v !== undefined && v !== '')
            .slice(0, 3)
            .map((v) => (Array.isArray(v) ? v.join(', ') : String(v)).slice(0, 60)),
        };
      }),
      outcome,
      examples,
      warnings: warnings.slice(0, 20),
    };
  });
  const models = stored.models.map((m) => {
    const byType: Record<string, number> = {};
    for (const e of m.model.elements) {
      byType[e.type] = (byType[e.type] ?? 0) + 1;
      const match = findMatch(idx, e.type, {
        name: e.name,
        key: e.key,
        externalId: Object.values(e.externalIds)[0],
      });
      if (match) totals.update++;
      else if (!e.placeholder) totals.create++;
    }
    totals.relations += m.model.relations.length;
    return {
      file: stored.files[m.fileIndex]!.name,
      elements: m.model.elements.length,
      relations: m.model.relations.length,
      byType,
    };
  });
  return {
    importId: stored.id,
    files: stored.files.map((f) => ({
      name: f.name,
      format: f.parsed.format,
      warnings: f.parsed.warnings.slice(0, 20),
    })),
    sheets,
    models,
    totals,
    mode:
      ctx.kind === 'user' && canEditDirectly(ctx, null, { get: () => undefined } as never)
        ? 'direct'
        : 'suggestion',
  };
}

export async function previewImport(
  deps: Deps,
  ctx: RequestContext,
  files: Array<{ name: string; data: Uint8Array }>,
): Promise<ImportPreview> {
  if (!files.length) throw badRequest('Choose a file to import.');
  const stored: StoredImport = {
    id: randomUUID(),
    createdAt: Date.now(),
    userId: ctx.userId,
    files: [],
    sheets: [],
    models: [],
  };
  for (const f of files) {
    const parsed = await parseFile(f.name, f.data);
    if (parsed.format === 'unknown')
      throw badRequest(
        `${f.name} isn't a format Atrium can read. Use Excel (.xlsx), CSV, ArchiMate exchange (.xml), Backstage (catalog-info.yaml) or atrium.yaml.`,
      );
    const fileIndex = stored.files.push({ name: f.name, parsed }) - 1;
    for (const sheet of parsed.sheets ?? []) {
      if (!sheet.rows.length) continue;
      const [remembered] =
        await deps.sql`select element_type, mapping from import_mappings where signature = ${signature(sheet)}`;
      if (remembered) {
        stored.sheets.push({
          fileIndex,
          sheet,
          type: remembered.elementType as ElementType,
          mapping: remembered.mapping as SheetMapping,
          remembered: true,
        });
      } else {
        const type = detectElementType(sheet).type;
        stored.sheets.push({
          fileIndex,
          sheet,
          type,
          mapping: guessMapping(sheet, type),
          remembered: false,
        });
      }
    }
    if (parsed.model) stored.models.push({ fileIndex, model: parsed.model });
  }
  if (!stored.sheets.length && !stored.models.length)
    throw badRequest('The file has no rows to import.');
  pending.set(stored.id, stored);
  return buildPreview(deps, ctx, stored);
}

function getStored(id: string, ctx: RequestContext) {
  const s = pending.get(id);
  if (!s || s.userId !== ctx.userId)
    throw notFound('That import (it may have expired; upload the file again)');
  return s;
}

export async function updateImportSheet(
  deps: Deps,
  ctx: RequestContext,
  importId: string,
  sheetIndex: number,
  patch: { type?: ElementType; columns?: Record<string, ColumnTarget> },
) {
  const stored = getStored(importId, ctx);
  const s = stored.sheets[sheetIndex];
  if (!s) throw notFound('That sheet');
  if (patch.type && patch.type !== s.type) {
    s.type = patch.type;
    s.mapping = guessMapping(s.sheet, patch.type);
  }
  if (patch.columns) {
    s.mapping = {
      ...s.mapping,
      elementType: s.type,
      columns: { ...s.mapping.columns, ...patch.columns },
    };
    for (const h of Object.keys(patch.columns)) s.mapping.columnConfidence[h] = 1;
  }
  return buildPreview(deps, ctx, stored);
}

/* ------------------------------------------------------------------ */
/* Apply                                                                */
/* ------------------------------------------------------------------ */

export async function applyImport(
  deps: Deps,
  ctx: RequestContext,
  importId: string,
  opts: { skipSheets?: number[] } = {},
) {
  const stored = getStored(importId, ctx);
  const state = await resolveState(deps.store, deps.sql, ctx, { includeDrafts: false });
  const b = new ChangeBuilder(deps, ctx, state);
  const idx = matchIndex(state.elements.values());
  const made = new Map<string, Element>(); // `${type}:${normalized name}` → element created in this import
  let created = 0;
  let updated = 0;
  let linked = 0;

  const ensure = async (
    type: ElementType,
    name: string,
    extra: Partial<Candidate> = {},
  ): Promise<Element | undefined> => {
    const n = normalizeName(name);
    if (!n) return undefined;
    const key = `${type}:${n}`;
    const madeHit = made.get(key);
    if (madeHit) return madeHit;
    const m = findMatch(idx, type, { name, key: extra.key });
    if (m) return b.get(m.el.id) ?? m.el;
    const el = await b.create({
      type,
      name,
      source: 'import',
      ...(extra.domainName ? { domainId: (await ensure('domain', extra.domainName))?.id } : {}),
    });
    made.set(key, el);
    created++;
    return el;
  };

  const upsert = async (
    c: Candidate | (Candidate & { externalIds?: Record<string, string> }),
    fileName: string,
  ) => {
    const domain = c.domainName ? await ensure('domain', c.domainName) : undefined;
    const parent = c.parentName
      ? await ensure(c.type, c.parentName, { domainName: c.domainName })
      : undefined;
    const match =
      findMatch(idx, c.type, c) ??
      (made.get(`${c.type}:${normalizeName(c.name)}`)
        ? { el: made.get(`${c.type}:${normalizeName(c.name)}`)!, how: 'name' as const }
        : null);
    const attributes = Object.fromEntries(
      Object.entries(c.attributes).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    );
    const externalIds =
      c.externalId && !UUID.test(c.externalId)
        ? { [fileName.replace(/\.[^.]+$/, '')]: c.externalId }
        : undefined;
    let el: Element;
    if (match) {
      const current = b.get(match.el.id) ?? match.el;
      const next = b.update(current.id, {
        description: c.description || undefined,
        owner: c.owner || undefined,
        lifecycle: c.lifecycle,
        lifecycleDates: c.lifecycleDates
          ? { ...current.lifecycleDates, ...c.lifecycleDates }
          : undefined,
        classification: c.classification,
        domainId: domain?.id,
        parentId: parent?.id,
        tags: c.tags?.length ? [...new Set([...current.tags, ...c.tags])] : undefined,
        attributes: Object.keys(attributes).length ? attributes : undefined,
        externalIds: externalIds ? { ...current.externalIds, ...externalIds } : undefined,
      });
      if (next && next !== current) updated++;
      el = next ?? current;
    } else {
      el = await b.create({
        type: c.type,
        name: c.name,
        key: c.key,
        description: c.description,
        owner: c.owner,
        lifecycle: c.lifecycle,
        lifecycleDates: c.lifecycleDates,
        classification: c.classification,
        domainId: domain?.id,
        parentId: parent?.id,
        tags: c.tags,
        attributes,
        externalIds,
        source: 'import',
      });
      made.set(`${c.type}:${normalizeName(c.name)}`, el);
      created++;
    }
    if (c.teamName) {
      const team = await ensure('team', c.teamName);
      if (team && b.link('owned_by', el.id, team.id)) linked++;
    }
    return el;
  };

  // Tabular sheets, capabilities and domains first so links can find them.
  const order: ElementType[] = [
    'domain',
    'team',
    'capability',
    'business_process',
    'data_object',
    'technology',
    'application',
    'interface',
  ];
  const sheets = stored.sheets
    .map((s, i) => ({ ...s, i }))
    .filter((s) => !opts.skipSheets?.includes(s.i))
    .sort((a, b2) => (order.indexOf(a.type) + 1 || 99) - (order.indexOf(b2.type) + 1 || 99));
  const pendingRelations: Array<{ el: Element; c: Candidate }> = [];
  for (const s of sheets) {
    const { candidates } = sheetToCandidates(s.sheet, { ...s.mapping, elementType: s.type });
    for (const c of candidates) {
      const el = await upsert({ ...c, type: s.type }, stored.files[s.fileIndex]!.name);
      pendingRelations.push({ el, c });
    }
  }
  for (const { el, c } of pendingRelations) {
    for (const r of c.relations) {
      for (const name of r.names) {
        const target = await ensure(r.targetType, name);
        if (!target) continue;
        const rel =
          r.direction === 'out'
            ? b.link(r.relation, el.id, target.id)
            : b.link(r.relation, target.id, el.id);
        if (rel) linked++;
      }
    }
  }

  // Model formats (ArchiMate, Backstage, atrium.yaml)
  for (const m of stored.models) {
    const refs = new Map<string, Element>();
    const fileName = stored.files[m.fileIndex]!.name;
    const els = [...m.model.elements].sort(
      (a, b2) => (order.indexOf(a.type) + 1 || 99) - (order.indexOf(b2.type) + 1 || 99),
    );
    for (const e of els) {
      const domainName = e.domainRef
        ? m.model.elements.find((x) => x.ref === e.domainRef)?.name
        : undefined;
      const parentName = e.parentRef
        ? m.model.elements.find((x) => x.ref === e.parentRef)?.name
        : undefined;
      const existing = findMatch(idx, e.type, {
        name: e.name,
        key: e.key,
        externalId: Object.values(e.externalIds)[0],
      });
      if (e.placeholder && existing) {
        refs.set(e.ref, b.get(existing.el.id) ?? existing.el);
        continue;
      }
      const el = await upsert(
        {
          row: 0,
          type: e.type,
          name: e.name,
          key: e.key,
          description: e.description,
          owner: e.owner,
          domainName,
          parentName,
          lifecycle: e.lifecycle,
          lifecycleDates: e.lifecycleDates,
          classification: e.classification,
          tags: e.tags,
          attributes: e.attributes ?? {},
          relations: [],
          externalId: Object.values(e.externalIds)[0],
        },
        fileName,
      );
      refs.set(e.ref, el);
    }
    for (const r of m.model.relations) {
      const from = refs.get(r.from);
      const to = refs.get(r.to);
      if (from && to && b.link(r.type, from.id, to.id)) linked++;
    }
  }

  const direct = ctx.kind === 'user' && canEditDirectly(ctx, null, b.index);
  const title = `Imported ${stored.files.map((f) => f.name).join(', ')}`;
  const res = await b.commit({
    kind: 'import',
    mode: direct ? 'direct' : 'suggestion',
    title,
    description: `${created} added, ${updated} updated, ${linked} links.`,
  });

  // Remember column mappings so the next import of the same layout needs no clicks.
  for (const s of sheets) {
    await deps.sql`
      insert into import_mappings (signature, element_type, mapping) values (${signature(s.sheet)}, ${s.type}, ${deps.sql.json({ ...s.mapping, elementType: s.type } as never)})
      on conflict (signature) do update set element_type = excluded.element_type, mapping = excluded.mapping, updated_at = now()`;
  }
  await deps.sql`insert into import_runs (file_name, format, status, summary, changeset_id, created_by)
    values (${stored.files.map((f) => f.name).join(', ')}, ${stored.files[0]!.parsed.format}, ${res.applied ? 'applied' : 'submitted'},
            ${deps.sql.json({ created, updated, linked, warnings: b.warnings.length } as never)}, ${res.changesetId}, ${ctx.name})`;
  await audit(
    deps.sql,
    ctx,
    'import.apply',
    { type: 'changeset', id: res.changesetId },
    { created, updated, linked },
  );
  pending.delete(importId);
  return {
    changesetId: res.changesetId,
    applied: res.applied,
    created,
    updated,
    linked,
    warnings: b.warnings.slice(0, 30),
  };
}
