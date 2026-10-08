import { randomUUID } from 'node:crypto';
import type { Db } from '@atrium/db';
import type { ChangeOp, ChangesetKind, ChangesetStatus, Element, Relation } from '@atrium/schema';
import { actorName, type RequestContext } from '../auth/context';
import {
  insertElementRow,
  insertRelationRow,
  rowToElement,
  selectElement,
  softDeleteElementRow,
  softDeleteRelationRow,
  updateElementRow,
} from './rows';

export interface OpenChangesetOptions {
  kind: ChangesetKind;
  status: ChangesetStatus;
  title: string;
  description?: string;
  scenarioId?: string | null;
}

export async function openChangeset(
  db: Db,
  ctx: RequestContext,
  o: OpenChangesetOptions,
): Promise<string> {
  const id = randomUUID();
  await db`
    insert into changesets (id, kind, status, title, description, scenario_id, author_id, author_name,
                            author_token_id, author_kind, submitted_at, decided_at)
    values (${id}, ${o.kind}, ${o.status}, ${o.title}, ${o.description ?? ''}, ${o.scenarioId ?? null},
            ${ctx.userId}, ${actorName(ctx)}, ${ctx.token?.id ?? null}, ${ctx.authorKind},
            ${o.status === 'open' ? new Date() : null}, ${o.status === 'applied' ? new Date() : null})`;
  return id;
}

/** Groups a person's direct edits made within a few minutes into one history entry. */
export async function directChangeset(db: Db, ctx: RequestContext, title: string): Promise<string> {
  if (ctx.userId) {
    const [recent] = await db`
      select id from changesets
      where author_id = ${ctx.userId} and kind = 'direct' and status = 'applied'
        and created_at > now() - interval '10 minutes'
      order by created_at desc limit 1`;
    if (recent) return recent.id as string;
  }
  return openChangeset(db, ctx, { kind: 'direct', status: 'applied', title });
}

/** The caller's personal draft of suggestions (unsubmitted). */
export async function draftSuggestion(db: Db, ctx: RequestContext): Promise<string> {
  const [existing] = await db`
    select id from changesets
    where author_id = ${ctx.userId} and kind = 'suggestion' and status = 'draft'
    order by created_at desc limit 1`;
  if (existing) return existing.id as string;
  return openChangeset(db, ctx, {
    kind: 'suggestion',
    status: 'draft',
    title: 'Suggested changes',
  });
}

/** The shared working set of a scenario. */
export async function scenarioWorkset(
  db: Db,
  ctx: RequestContext,
  scenarioId: string,
): Promise<string> {
  const [existing] = await db`
    select id from changesets
    where scenario_id = ${scenarioId} and kind = 'scenario' and status = 'draft'
    order by created_at limit 1`;
  // Editing a scenario that was submitted or agreed puts it back to draft: it changed since.
  await db`update scenarios set review_status = 'draft' where id = ${scenarioId} and review_status <> 'draft'`;
  if (existing) return existing.id as string;
  return openChangeset(db, ctx, {
    kind: 'scenario',
    status: 'draft',
    title: 'Scenario changes',
    scenarioId,
  });
}

async function nextSeq(db: Db, changesetId: string): Promise<number> {
  const [r] =
    await db`select coalesce(max(seq), 0) + 1 as n from changes where changeset_id = ${changesetId}`;
  return Number(r?.n ?? 1);
}

/**
 * Records a change. When `compress` is set and the changeset already has a change for
 * the same entity, the two are merged so a draft shows one clean before/after per item.
 */
export async function recordChange(
  db: Db,
  changesetId: string,
  op: ChangeOp,
  entity: 'element' | 'relation',
  entityId: string,
  before: object | null,
  after: object | null,
  compress = false,
): Promise<void> {
  if (compress) {
    const [prev] = await db`
      select id, op, before from changes
      where changeset_id = ${changesetId} and entity_id = ${entityId}
      order by seq desc limit 1`;
    if (prev) {
      const prevOp = prev.op as ChangeOp;
      // create + delete cancels out
      if (prevOp === 'create' && op === 'delete') {
        await db`delete from changes where id = ${prev.id}`;
        return;
      }
      const mergedOp: ChangeOp = prevOp === 'create' ? 'create' : op;
      const mergedBefore = prev.before ?? null;
      if (
        mergedOp === 'update' &&
        JSON.stringify(stripMeta(mergedBefore)) === JSON.stringify(stripMeta(after))
      ) {
        await db`delete from changes where id = ${prev.id}`; // back to where it started
        return;
      }
      await db`
        update changes set op = ${mergedOp}, after = ${after ? db.json(after as never) : null},
          created_at = now()
        where id = ${prev.id}`;
      return;
    }
  }
  await db`
    insert into changes (changeset_id, seq, op, entity, entity_id, before, after)
    values (${changesetId}, ${await nextSeq(db, changesetId)}, ${op}, ${entity}, ${entityId},
            ${before ? db.json(before as never) : null}, ${after ? db.json(after as never) : null})`;
}

const META = new Set([
  'updatedAt',
  'updatedBy',
  'version',
  'quality',
  'health',
  'healthReasons',
  'createdAt',
  'createdBy',
]);
function stripMeta(v: unknown): unknown {
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).filter(([k]) => !META.has(k)),
  );
}

const ELEMENT_FIELDS = [
  'name',
  'key',
  'description',
  'domainId',
  'parentId',
  'owner',
  'lifecycle',
  'lifecycleDates',
  'classification',
  'tags',
  'externalIds',
  'suggestions',
] as const;

/**
 * Applies a recorded change to today's model using a three-way merge: only the fields
 * the change actually modified are written, so concurrent edits to other fields survive.
 * Returns the ids touched.
 */
export async function applyChangeToBase(
  db: Db,
  ch: {
    op: ChangeOp;
    entity: 'element' | 'relation';
    entityId: string;
    before: unknown;
    after: unknown;
  },
  by: string,
): Promise<{ touched: string[]; skipped?: string }> {
  const now = new Date().toISOString();
  if (ch.entity === 'element') {
    const current = await selectElement(db, ch.entityId);
    if (ch.op === 'delete') {
      if (!current) return { touched: [], skipped: 'already deleted' };
      await softDeleteElementRow(db, ch.entityId, by);
      const rels = await db`update relations set deleted_at = now()
        where (source_id = ${ch.entityId} or target_id = ${ch.entityId}) and deleted_at is null
        returning source_id, target_id`;
      return {
        touched: [
          ch.entityId,
          ...rels.flatMap((r) => [r.sourceId as string, r.targetId as string]),
        ],
      };
    }
    const after = ch.after as Element;
    if (ch.op === 'create' || !current) {
      if (current) return { touched: [], skipped: 'already exists' };
      await insertElementRow(db, { ...after, id: ch.entityId, updatedAt: now, updatedBy: by });
      return { touched: [ch.entityId, after.domainId, after.parentId].filter(Boolean) as string[] };
    }
    const before = (ch.before ?? {}) as Record<string, unknown>;
    const merged: Element = { ...current };
    for (const f of ELEMENT_FIELDS) {
      if (JSON.stringify(before[f] ?? null) !== JSON.stringify((after as never)[f] ?? null)) {
        (merged as Record<string, unknown>)[f] = (after as never)[f];
      }
    }
    const ba = (before.attributes ?? {}) as Record<string, unknown>;
    const aa = after.attributes ?? {};
    const attrs = { ...current.attributes };
    for (const k of new Set([...Object.keys(ba), ...Object.keys(aa)])) {
      if (JSON.stringify(ba[k] ?? null) !== JSON.stringify(aa[k] ?? null)) {
        if (aa[k] === undefined || aa[k] === null) delete attrs[k];
        else attrs[k] = aa[k];
      }
    }
    merged.attributes = attrs;
    merged.updatedAt = now;
    merged.updatedBy = by;
    await updateElementRow(db, merged);
    return { touched: [ch.entityId] };
  }

  // relations
  const rel = (ch.after ?? ch.before) as Relation;
  if (ch.op === 'delete') {
    const rows = await db`
      update relations set deleted_at = now()
      where deleted_at is null and (id = ${ch.entityId}
        or (type = ${rel.type} and source_id = ${rel.sourceId} and target_id = ${rel.targetId}))
      returning id`;
    return rows.length
      ? { touched: [rel.sourceId, rel.targetId] }
      : { touched: [], skipped: 'already removed' };
  }
  const [exists] = await db`
    select id from relations where deleted_at is null and type = ${rel.type}
      and source_id = ${rel.sourceId} and target_id = ${rel.targetId}`;
  if (exists && ch.op === 'create') return { touched: [], skipped: 'already exists' };
  const [ends] = await db`
    select count(*)::int as n from elements where id in (${rel.sourceId}, ${rel.targetId}) and deleted_at is null`;
  if (Number(ends?.n) < 2) return { touched: [], skipped: 'an end no longer exists' };
  if (exists) {
    await db`update relations set attributes = ${db.json(rel.attributes as never)} where id = ${exists.id}`;
  } else {
    await insertRelationRow(db, { ...rel, id: ch.entityId, createdBy: rel.createdBy ?? by });
  }
  return { touched: [rel.sourceId, rel.targetId] };
}

export { rowToElement, softDeleteRelationRow };
