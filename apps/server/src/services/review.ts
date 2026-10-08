import { asSystem, withScope } from '@atrium/db';
import {
  type Changeset,
  type ChangesetDetail,
  diffElement,
  ELEMENT_TYPE_DEFS,
  type Element,
  type ElementType,
  enumLabel,
  RELATION_TYPE_DEFS,
  type Relation,
} from '@atrium/schema';
import { actorName, type RequestContext } from '../auth/context';
import { badRequest, forbidden, notFound } from '../http/errors';
import { audit } from './audit';
import { applyChangeToBase, openChangeset, recordChange } from './changesets';
import type { Deps } from './deps';
import { refreshDerived } from './derived';
import { ModelIndex } from './model-index';
import { canReview } from './policy';
import { rowToChange } from './store';

// biome-ignore lint/suspicious/noExplicitAny: database row
export function rowToChangeset(r: any): Changeset {
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    title: r.title,
    description: r.description ?? '',
    scenarioId: r.scenarioId ?? null,
    authorId: r.authorId ?? null,
    authorName: r.authorName ?? null,
    authorTokenId: r.authorTokenId ?? null,
    authorKind: r.authorKind,
    reviewerId: r.reviewerId ?? null,
    reviewerName: r.reviewerName ?? null,
    decisionNote: r.decisionNote ?? null,
    createdAt: iso(r.createdAt)!,
    submittedAt: iso(r.submittedAt),
    decidedAt: iso(r.decidedAt),
    changeCount: Number(r.changeCount ?? 0),
  };
}

const LIST_SQL = `
  select s.*, (select count(*) from changes c where c.changeset_id = s.id)::int as change_count
  from changesets s`;

export async function changesSummary(deps: Deps, ctx: RequestContext) {
  const [row] = await deps.sql`
    select
      (select count(*)::int from changesets where status = 'open' and scenario_id is null) as waiting,
      (select count(*)::int from scenarios where review_status = 'in_review' and archived_at is null) as scenarios_waiting,
      (select count(*)::int from changes c join changesets s on s.id = c.changeset_id
        where s.author_id = ${ctx.userId} and s.kind = 'suggestion' and s.status = 'draft') as draft_changes,
      (select id from changesets where author_id = ${ctx.userId} and kind = 'suggestion' and status = 'draft' limit 1) as draft_id,
      (select count(*)::int from changesets where author_id = ${ctx.userId} and status = 'open') as my_open`;
  return {
    waitingForReview: canReview(ctx)
      ? Number(row?.waiting ?? 0) + Number(row?.scenariosWaiting ?? 0)
      : 0,
    scenariosInReview: canReview(ctx) ? Number(row?.scenariosWaiting ?? 0) : 0,
    myDraftChanges: Number(row?.draftChanges ?? 0),
    myDraftId: (row?.draftId as string) ?? null,
    myOpen: Number(row?.myOpen ?? 0),
  };
}

export async function listChangesets(
  deps: Deps,
  ctx: RequestContext,
  f: {
    status?: string;
    kind?: string;
    scenarioId?: string;
    mine?: boolean;
    limit?: number;
    elementId?: string;
  },
): Promise<Changeset[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (f.status) add("s.status = any(string_to_array(?, ','))", f.status);
  if (f.kind) add("s.kind = any(string_to_array(?, ','))", f.kind);
  if (f.scenarioId) add('s.scenario_id = ?', f.scenarioId);
  else where.push("(s.kind <> 'scenario')");
  if (f.mine) add('s.author_id = ?', ctx.userId);
  if (f.elementId)
    add(
      'exists (select 1 from changes c where c.changeset_id = s.id and c.entity_id = ?)',
      f.elementId,
    );
  // Drafts are private to their author.
  add("(s.status <> 'draft' or s.author_id = ? or s.kind = 'scenario')", ctx.userId);
  params.push(f.limit ?? 100);
  const rows = await deps.sql.unsafe(
    `${LIST_SQL} where ${where.join(' and ')} order by coalesce(s.decided_at, s.submitted_at, s.created_at) desc limit $${params.length}`,
    params as never[],
  );
  return rows.map(rowToChangeset).filter((c) => c.changeCount > 0 || c.status === 'open');
}

function label(field: string, type: ElementType | undefined): string {
  if (field.startsWith('attributes.')) {
    const key = field.slice(11);
    return (type && ELEMENT_TYPE_DEFS[type].attributes.find((a) => a.key === key)?.label) ?? key;
  }
  return (
    {
      name: 'Name',
      key: 'Key',
      description: 'Description',
      domainId: 'Domain',
      parentId: 'Part of',
      owner: 'Owner',
      lifecycle: 'Lifecycle',
      lifecycleDates: 'Phase dates',
      classification: 'Classification',
      tags: 'Tags',
    }[field] ?? field
  );
}

export async function changesetDetail(
  deps: Deps,
  ctx: RequestContext,
  id: string,
): Promise<ChangesetDetail> {
  const [row] = await deps.sql.unsafe(`${LIST_SQL} where s.id = $1`, [id]);
  if (!row) throw notFound('That change');
  const cs = rowToChangeset(row);
  if (cs.status === 'draft' && cs.authorId !== ctx.userId && cs.kind !== 'scenario')
    throw notFound('That change');
  const changes = (
    await deps.sql`select * from changes where changeset_id = ${id} order by seq`
  ).map(rowToChange);
  const snapshot = await deps.store.snapshot(ctx.scope);
  const index = new ModelIndex(snapshot);
  const nameOf = (eid: string) => {
    const created = changes.find((c) => c.entityId === eid && c.after)?.after as
      | Element
      | undefined;
    return index.get(eid)?.name ?? created?.name ?? 'an element';
  };
  const display = (field: string, v: unknown): unknown => {
    if (v === null || v === undefined) return null;
    if (field === 'domainId' || field === 'parentId') return nameOf(v as string);
    if (typeof v === 'string' && ['lifecycle', 'classification'].includes(field))
      return enumLabel(v);
    if (field.startsWith('attributes.') && typeof v === 'string' && /^[a-z_]+$/.test(v))
      return enumLabel(v);
    return v;
  };
  return {
    ...cs,
    canReview: cs.status === 'open' && canReview(ctx),
    changes: changes.map((c) => {
      if (c.entity === 'element') {
        const el = (c.after ?? c.before) as unknown as Element;
        const fields =
          c.op === 'update'
            ? diffElement(c.before, c.after)
                .filter((d) => !d.field.startsWith('attributes._'))
                .map((d) => ({
                  field: d.field,
                  label: label(d.field, el.type),
                  before: display(d.field, d.before),
                  after: display(d.field, d.after),
                }))
            : [];
        return {
          id: c.id,
          op: c.op,
          entity: c.entity,
          entityId: c.entityId,
          name: el.name,
          type: el.type,
          fields,
        };
      }
      const rel = (c.after ?? c.before) as unknown as Relation;
      const def = RELATION_TYPE_DEFS[rel.type];
      return {
        id: c.id,
        op: c.op,
        entity: c.entity,
        entityId: c.entityId,
        name: `${nameOf(rel.sourceId)} ${def?.label ?? rel.type} ${nameOf(rel.targetId)}`,
        type: rel.type,
        fields: [],
      };
    }),
  };
}

async function loadChangeset(deps: Deps, id: string) {
  const [row] = await deps.sql`select * from changesets where id = ${id}`;
  if (!row) throw notFound('That change');
  return rowToChangeset(row);
}

async function notify(
  deps: Deps,
  userId: string | null,
  title: string,
  body: string,
  link: string,
) {
  if (!userId) return;
  await asSystem(
    deps.sql,
    (tx) =>
      tx`insert into notifications (user_id, kind, title, body, link) values (${userId}, 'review', ${title}, ${body}, ${link})`,
  );
  deps.hub.broadcast({ type: 'notification', userId, title });
}

/** Tells every architect and admin (except the person asking) that something needs a review. */
export async function notifyReviewers(
  deps: Deps,
  ctx: RequestContext,
  title: string,
  body: string,
  link: string,
) {
  const reviewers = await asSystem(
    deps.sql,
    (tx) =>
      tx`select id from users where role in ('admin', 'architect') and not disabled and id is distinct from ${ctx.userId}`,
  );
  for (const r of reviewers) await notify(deps, r.id as string, title, body, link);
}

export async function submitDraft(
  deps: Deps,
  ctx: RequestContext,
  id: string,
  title?: string,
  description?: string,
) {
  const cs = await loadChangeset(deps, id);
  if (cs.authorId !== ctx.userId) throw forbidden('Only the author can submit this.');
  if (cs.status !== 'draft') throw badRequest('This was already submitted.');
  await deps.sql`update changesets set status = 'open', submitted_at = now(),
    title = ${title?.trim() || cs.title}, description = ${description ?? cs.description} where id = ${id}`;
  deps.hub.broadcast({
    type: 'changeset.updated',
    id,
    status: 'open',
    title: title || cs.title,
    by: actorName(ctx),
  });
  return { ok: true };
}

export async function withdraw(deps: Deps, ctx: RequestContext, id: string) {
  const cs = await loadChangeset(deps, id);
  if (cs.authorId !== ctx.userId && !canReview(ctx)) throw forbidden();
  if (!['draft', 'open'].includes(cs.status))
    throw badRequest('Only pending changes can be withdrawn.');
  await deps.sql`update changesets set status = 'withdrawn', decided_at = now() where id = ${id}`;
  deps.hub.broadcast({
    type: 'changeset.updated',
    id,
    status: 'withdrawn',
    title: cs.title,
    by: actorName(ctx),
  });
  return { ok: true };
}

/** Applies a set of recorded changes to today's model. */
async function applyAll(deps: Deps, ctx: RequestContext, changesetId: string, inverse = false) {
  const changes = (
    await deps.sql`select * from changes where changeset_id = ${changesetId} order by seq`
  ).map(rowToChange);
  const ordered = inverse ? [...changes].reverse() : changes;
  const skipped: string[] = [];
  await withScope(deps.sql, ctx.scope, async (tx) => {
    const touched: string[] = [];
    let undoSet: string | null = null;
    if (inverse) {
      undoSet = await openChangeset(tx, ctx, { kind: 'undo', status: 'applied', title: 'Undo' });
    }
    for (const c of ordered) {
      const ch = inverse
        ? {
            op:
              c.op === 'create'
                ? ('delete' as const)
                : c.op === 'delete'
                  ? ('create' as const)
                  : ('update' as const),
            entity: c.entity,
            entityId: c.entityId,
            before: c.after,
            after: c.before,
          }
        : c;
      const res = await applyChangeToBase(tx, ch, actorName(ctx));
      if (res.skipped) skipped.push(res.skipped);
      touched.push(...res.touched);
      if (undoSet)
        await recordChange(
          tx,
          undoSet,
          ch.op,
          ch.entity,
          ch.entityId,
          ch.before as object,
          ch.after as object,
        );
    }
    await refreshDerived(tx, touched);
  });
  deps.store.bump();
  deps.hub.broadcast({ type: 'model.changed', ids: [], by: actorName(ctx) });
  return skipped;
}

export async function approve(deps: Deps, ctx: RequestContext, id: string, note?: string) {
  if (!canReview(ctx)) throw forbidden('Only architects can approve suggestions.');
  const cs = await loadChangeset(deps, id);
  if (cs.status !== 'open') throw badRequest('This suggestion is not waiting for review.');
  const skipped = await applyAll(deps, ctx, id);
  await deps.sql`update changesets set status = 'applied', reviewer_id = ${ctx.userId}, reviewer_name = ${ctx.name},
    decision_note = ${note ?? null}, decided_at = now() where id = ${id}`;
  await audit(
    deps.sql,
    ctx,
    'changeset.approve',
    { type: 'changeset', id },
    { title: cs.title, skipped },
  );
  await notify(
    deps,
    cs.authorId,
    `${ctx.name} approved “${cs.title}”`,
    note ?? '',
    `/changes?id=${id}`,
  );
  deps.hub.broadcast({
    type: 'changeset.updated',
    id,
    status: 'applied',
    title: cs.title,
    by: actorName(ctx),
  });
  return {
    ok: true,
    message: skipped.length
      ? `Applied. ${skipped.length} item(s) were already up to date.`
      : 'Applied.',
  };
}

export async function reject(deps: Deps, ctx: RequestContext, id: string, note?: string) {
  if (!canReview(ctx)) throw forbidden('Only architects can decline suggestions.');
  const cs = await loadChangeset(deps, id);
  if (cs.status !== 'open') throw badRequest('This suggestion is not waiting for review.');
  await deps.sql`update changesets set status = 'rejected', reviewer_id = ${ctx.userId}, reviewer_name = ${ctx.name},
    decision_note = ${note ?? null}, decided_at = now() where id = ${id}`;
  await audit(deps.sql, ctx, 'changeset.reject', { type: 'changeset', id }, { title: cs.title });
  await notify(
    deps,
    cs.authorId,
    `${ctx.name} declined “${cs.title}”`,
    note ?? '',
    `/changes?id=${id}`,
  );
  deps.hub.broadcast({
    type: 'changeset.updated',
    id,
    status: 'rejected',
    title: cs.title,
    by: actorName(ctx),
  });
  return { ok: true };
}

/** Reverts an applied change set (history → undo). */
export async function undo(deps: Deps, ctx: RequestContext, id: string) {
  const cs = await loadChangeset(deps, id);
  if (cs.status !== 'applied') throw badRequest('Only applied changes can be undone.');
  if (cs.authorId !== ctx.userId && !canReview(ctx))
    throw forbidden('You can only undo your own changes.');
  const [state] = await deps.sql`select undone_at from changesets where id = ${id}`;
  if (state?.undoneAt) throw badRequest('This was already undone.');
  const skipped = await applyAll(deps, ctx, id, true);
  await deps.sql`update changesets set undone_at = now(), undone_by = ${ctx.name} where id = ${id}`;
  await audit(deps.sql, ctx, 'changeset.undo', { type: 'changeset', id }, { title: cs.title });
  return {
    ok: true,
    message: skipped.length
      ? `Undone, except ${skipped.length} item(s) that changed since.`
      : 'Undone.',
  };
}

export async function discardChange(
  deps: Deps,
  ctx: RequestContext,
  changesetId: string,
  changeId: string,
) {
  const cs = await loadChangeset(deps, changesetId);
  if (!['draft', 'open'].includes(cs.status))
    throw badRequest('Only pending changes can be edited.');
  if (cs.authorId !== ctx.userId && !(cs.kind === 'scenario' && canReview(ctx))) throw forbidden();
  await deps.sql`delete from changes where id = ${changeId} and changeset_id = ${changesetId}`;
  return { ok: true };
}
