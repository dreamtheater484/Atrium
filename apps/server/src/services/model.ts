import { randomUUID } from 'node:crypto';
import { type Db, withScope } from '@atrium/db';
import {
  allowedRelations,
  type CreateElementInput,
  type CreateRelationInput,
  type Element,
  type ElementType,
  lifecycleAt,
  RELATION_TYPE_DEFS,
  type Relation,
  slugify,
  todayIso,
  typeDef,
  type UpdateElementInput,
} from '@atrium/schema';
import { actorName, type RequestContext } from '../auth/context';
import { badRequest, conflict, forbidden, notFound } from '../http/errors';
import { audit } from './audit';
import {
  applyChangeToBase,
  directChangeset,
  draftSuggestion,
  openChangeset,
  recordChange,
  scenarioWorkset,
} from './changesets';
import type { Deps } from './deps';
import { refreshDerived } from './derived';
import { inferVersion } from './eol';
import { ModelIndex } from './model-index';
import { canEditDirectly, canEditScenarios, canSuggest } from './policy';
import { type ResolvedState, resolveState } from './store';

export type EditMode = 'direct' | 'suggestion' | 'scenario';

export interface EditOptions {
  scenarioId?: string | null;
  /** Agent/CI proposals: title and description of the suggestion. */
  proposal?: { title: string; description?: string };
  /** Write into an existing changeset (imports, sync, multi-step proposals). */
  changesetId?: string;
  /** Force a mode (imports decide once for the whole file). */
  mode?: EditMode;
}

export interface EditResult<T = Element> {
  item: T | null;
  mode: EditMode;
  changesetId: string;
}

/** Types that get a readable key automatically ("billing-service"). */
const KEYED_TYPES = new Set<ElementType>([
  'application',
  'interface',
  'technology',
  'team',
  'domain',
  'data_object',
]);

export function decideMode(
  ctx: RequestContext,
  el: Element | null,
  index: ModelIndex,
  opts: EditOptions,
): EditMode {
  if (opts.mode) return opts.mode;
  if (opts.scenarioId) {
    if (!canEditScenarios(ctx)) throw forbidden('Only architects can change scenarios.');
    return 'scenario';
  }
  if (canEditDirectly(ctx, el, index)) return 'direct';
  if (canSuggest(ctx)) return 'suggestion';
  throw forbidden(
    ctx.kind === 'token'
      ? 'This token is read-only. Create a token that can propose changes.'
      : 'You can view this model but not change it.',
  );
}

async function targetChangeset(
  db: Db,
  ctx: RequestContext,
  mode: EditMode,
  opts: EditOptions,
  title: string,
): Promise<{ id: string; compress: boolean }> {
  if (opts.changesetId) return { id: opts.changesetId, compress: mode !== 'direct' };
  if (mode === 'scenario')
    return { id: await scenarioWorkset(db, ctx, opts.scenarioId!), compress: true };
  if (mode === 'suggestion') {
    if (ctx.kind !== 'user') {
      const id = await openChangeset(db, ctx, {
        kind: 'suggestion',
        status: 'open',
        title: opts.proposal?.title ?? title,
        description: opts.proposal?.description,
      });
      return { id, compress: true };
    }
    return { id: await draftSuggestion(db, ctx), compress: true };
  }
  return { id: await directChangeset(db, ctx, title), compress: false };
}

function uniqueKey(base: string, type: ElementType, index: ModelIndex, selfId?: string): string {
  let key = base || 'item';
  let n = 2;
  while (true) {
    const hit = index.byKey(type, key);
    if (!hit || hit.id === selfId) return key;
    key = `${base}-${n++}`;
  }
}

/** Fills in everything Atrium can work out for a new element. */
export async function autofillNew(
  deps: Deps,
  ctx: RequestContext,
  input: CreateElementInput,
  index: ModelIndex,
  extra: Partial<Element> = {},
): Promise<Element> {
  const now = new Date().toISOString();
  const parent = index.get(input.parentId ?? null);
  if (input.parentId && !parent) throw badRequest('The parent does not exist.');
  if (parent && parent.type !== input.type)
    throw badRequest(`The parent must also be a ${typeDef(input.type).label.toLowerCase()}.`);
  const domainId = input.domainId ?? parent?.domainId ?? null;
  const domain = index.get(domainId);
  const attributes: Record<string, unknown> = { ...(input.attributes ?? {}) };
  for (const [k, v] of Object.entries(attributes)) if (v === null || v === '') delete attributes[k];

  const personName = ctx.kind === 'user' && ctx.name && ctx.name !== 'You' ? ctx.name : null;
  const owner =
    input.owner ??
    parent?.owner ??
    (input.type !== 'domain' && input.type !== 'team' ? domain?.owner : null) ??
    personName ??
    null;

  let classification =
    input.classification ?? parent?.classification ?? domain?.classification ?? 'internal';
  if (!input.classification && input.type === 'data_object') {
    const s = attributes.sensitivity as string | undefined;
    if (s && s !== 'none' && classification === 'internal') classification = 'confidential';
  }

  const lifecycleDates = input.lifecycleDates ?? {};
  const fromDates = lifecycleAt(null, lifecycleDates, todayIso());
  const lifecycle =
    input.lifecycle ??
    (fromDates && fromDates !== 'not_yet' ? fromDates : fromDates === 'not_yet' ? 'plan' : null);

  if (input.type === 'technology') await fillTechnology(deps, input.name, attributes);

  const key =
    input.key ??
    (KEYED_TYPES.has(input.type) ? uniqueKey(slugify(input.name), input.type, index) : null);

  const el: Element = {
    id: randomUUID(),
    type: input.type,
    key,
    name: input.name.trim(),
    description: input.description ?? '',
    domainId,
    parentId: input.parentId ?? null,
    owner,
    lifecycle: typeDef(input.type).hasLifecycle ? lifecycle : null,
    lifecycleDates,
    classification,
    attributes,
    tags: input.tags ?? [],
    externalIds: input.externalIds ?? {},
    source: input.source ?? null,
    layer: 'org',
    pack: null,
    quality: 0,
    health: null,
    healthReasons: [],
    suggestions: {},
    createdAt: now,
    createdBy: actorName(ctx),
    updatedAt: now,
    updatedBy: actorName(ctx),
    version: 1,
    ...extra,
  };
  return { ...el, ...index.derive(el) };
}

/** Version from the name, end-of-life date from endoflife.date (bundled snapshot or live). */
async function fillTechnology(deps: Deps, name: string, attributes: Record<string, unknown>) {
  if (!attributes.version) {
    const v = inferVersion(name);
    if (v) attributes.version = v;
  }
  if (!attributes.eol_date) {
    const info = await deps.eol.lookup(
      name,
      attributes.product as string,
      attributes.version as string,
    );
    if (info?.eolDate) {
      attributes.eol_date = info.eolDate;
      if (info.extendedDate && !attributes.extended_support_date)
        attributes.extended_support_date = info.extendedDate;
      attributes._eol = {
        product: info.product,
        cycle: info.cycle,
        source: info.source,
        url: `https://endoflife.date/${info.product}`,
        ...(info.extendedDate ? { extended: true } : {}),
      };
      if (!attributes.product) attributes.product = info.product;
    }
  }
}

export function applyPatch(current: Element, patch: UpdateElementInput): Element {
  const next: Element = { ...current, attributes: { ...current.attributes } };
  const simple = [
    'name',
    'key',
    'description',
    'domainId',
    'parentId',
    'owner',
    'lifecycle',
    'classification',
    'tags',
    'externalIds',
  ] as const;
  for (const f of simple) {
    if (patch[f] !== undefined)
      (next as Record<string, unknown>)[f] = patch[f] ?? (f === 'description' ? '' : null);
  }
  if (patch.tags === null) next.tags = [];
  if (patch.lifecycleDates !== undefined) {
    next.lifecycleDates = Object.fromEntries(
      Object.entries(patch.lifecycleDates).filter(([, v]) => !!v),
    );
    if (patch.lifecycle === undefined) {
      const at = lifecycleAt(null, next.lifecycleDates, todayIso());
      if (at && at !== 'not_yet') next.lifecycle = at;
    }
  }
  if (patch.attributes) {
    for (const [k, v] of Object.entries(patch.attributes)) {
      if (v === null || v === undefined || v === '') delete next.attributes[k];
      else next.attributes[k] = v;
    }
    // A manually set end-of-support date is no longer "automatic" (research sends its source along).
    if (patch.attributes.eol_date !== undefined && patch.attributes._eol === undefined)
      delete next.attributes._eol;
  }
  // Accepting a value removes its pending suggestion.
  if (Object.keys(current.suggestions).length) {
    const suggestions = { ...current.suggestions };
    for (const f of Object.keys(suggestions)) {
      const [head, attr] = f.split('.');
      if (
        (attr && patch.attributes?.[attr] !== undefined) ||
        (!attr && (patch as Record<string, unknown>)[head!] !== undefined)
      ) {
        delete suggestions[f];
      }
    }
    next.suggestions = suggestions;
  }
  return next;
}

function validateElement(el: Element, index: ModelIndex) {
  const def = typeDef(el.type);
  if (el.parentId) {
    if (!def.hierarchical) throw badRequest(`${def.plural} can't have a parent.`);
    const parent = index.get(el.parentId);
    if (!parent) throw badRequest('The parent does not exist.');
    if (parent.type !== el.type)
      throw badRequest(`The parent must also be a ${def.label.toLowerCase()}.`);
    // no cycles
    let cur: Element | undefined = parent;
    const seen = new Set<string>();
    while (cur) {
      if (cur.id === el.id) throw badRequest("An element can't be placed under itself.");
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      cur = index.get(cur.parentId);
    }
  }
  if (el.domainId) {
    const d = index.get(el.domainId);
    if (d?.type !== 'domain') throw badRequest('The domain does not exist.');
  }
  if (el.key) {
    const clash = index.byKey(el.type, el.key);
    if (clash && clash.id !== el.id && clash.layer === el.layer) {
      throw conflict(`The key "${el.key}" is already used by ${clash.name}.`);
    }
  }
}

async function afterDirectWrite(
  deps: Deps,
  ctx: RequestContext,
  ids: Array<string | null | undefined>,
  scenarioId?: string | null,
) {
  deps.store.bump();
  deps.hub.broadcast({
    type: 'model.changed',
    ids: ids.filter(Boolean) as string[],
    by: actorName(ctx),
    scenarioId,
  });
}

function afterIndirectWrite(
  deps: Deps,
  ctx: RequestContext,
  mode: EditMode,
  opts: EditOptions,
  changesetId: string,
  ids: string[],
) {
  if (mode === 'scenario') {
    deps.hub.broadcast({
      type: 'model.changed',
      ids,
      by: actorName(ctx),
      scenarioId: opts.scenarioId,
    });
  } else if (ctx.kind !== 'user' && !opts.changesetId) {
    deps.hub.broadcast({
      type: 'changeset.updated',
      id: changesetId,
      status: 'open',
      title: opts.proposal?.title ?? 'New suggestion',
      by: actorName(ctx),
    });
  }
}

async function stateFor(
  deps: Deps,
  ctx: RequestContext,
  opts: EditOptions,
): Promise<ResolvedState> {
  return resolveState(deps.store, deps.sql, ctx, { scenarioId: opts.scenarioId });
}

export async function createElement(
  deps: Deps,
  ctx: RequestContext,
  input: CreateElementInput,
  opts: EditOptions = {},
): Promise<EditResult> {
  const state = await stateFor(deps, ctx, opts);
  const index = new ModelIndex(state);
  const mode = decideMode(ctx, null, index, opts);
  const el = await autofillNew(deps, ctx, input, index);
  validateElement(el, index);
  const changesetId = await withScope(deps.sql, ctx.scope, async (tx) => {
    const cs = await targetChangeset(tx, ctx, mode, opts, `Added ${el.name}`);
    await recordChange(tx, cs.id, 'create', 'element', el.id, null, el, cs.compress);
    if (mode === 'direct') {
      await applyChangeToBase(
        tx,
        { op: 'create', entity: 'element', entityId: el.id, before: null, after: el },
        actorName(ctx),
      );
      await refreshDerived(tx, [el.id]);
    }
    if (ctx.kind === 'token')
      await audit(
        tx,
        ctx,
        'element.propose_create',
        { type: 'element', id: el.id },
        { name: el.name, type: el.type },
      );
    return cs.id;
  });
  if (mode === 'direct') await afterDirectWrite(deps, ctx, [el.id]);
  else afterIndirectWrite(deps, ctx, mode, opts, changesetId, [el.id]);
  return { item: el, mode, changesetId };
}

export async function updateElement(
  deps: Deps,
  ctx: RequestContext,
  id: string,
  patch: UpdateElementInput,
  opts: EditOptions = {},
): Promise<EditResult> {
  const state = await stateFor(deps, ctx, opts);
  const index = new ModelIndex(state);
  const current = index.get(id);
  if (!current) throw notFound('That element');
  if (current.layer === 'reference' && ctx.mode === 'team' && ctx.role !== 'admin') {
    throw forbidden('Reference models are read-only. Map your own elements to them instead.');
  }
  const mode = decideMode(ctx, current, index, opts);
  let next = applyPatch(current, patch);
  if (
    next.type === 'technology' &&
    (patch.name || patch.attributes?.version || patch.attributes?.product)
  ) {
    if (current.attributes._eol || !current.attributes.eol_date) {
      delete next.attributes.eol_date;
      if ((current.attributes._eol as { extended?: boolean } | undefined)?.extended)
        delete next.attributes.extended_support_date;
      delete next.attributes._eol;
      await fillTechnology(deps, next.name, next.attributes);
    }
  }
  if (patch.key === undefined && patch.name && !current.key && KEYED_TYPES.has(next.type)) {
    next.key = uniqueKey(slugify(next.name), next.type, index, next.id);
  }
  validateElement(next, index);
  next = {
    ...next,
    ...index.derive(next),
    updatedAt: new Date().toISOString(),
    updatedBy: actorName(ctx),
  };
  const changesetId = await withScope(deps.sql, ctx.scope, async (tx) => {
    const cs = await targetChangeset(tx, ctx, mode, opts, `Edited ${current.name}`);
    await recordChange(tx, cs.id, 'update', 'element', id, current, next, cs.compress);
    if (mode === 'direct') {
      await applyChangeToBase(
        tx,
        { op: 'update', entity: 'element', entityId: id, before: current, after: next },
        actorName(ctx),
      );
      await refreshDerived(tx, [id, current.domainId, next.domainId]);
    }
    if (ctx.kind === 'token')
      await audit(
        tx,
        ctx,
        'element.propose_update',
        { type: 'element', id },
        { fields: Object.keys(patch) },
      );
    return cs.id;
  });
  if (mode === 'direct') await afterDirectWrite(deps, ctx, [id]);
  else afterIndirectWrite(deps, ctx, mode, opts, changesetId, [id]);
  return { item: next, mode, changesetId };
}

export async function deleteElement(
  deps: Deps,
  ctx: RequestContext,
  id: string,
  opts: EditOptions = {},
): Promise<EditResult> {
  const state = await stateFor(deps, ctx, opts);
  const index = new ModelIndex(state);
  const current = index.get(id);
  if (!current) throw notFound('That element');
  const mode = decideMode(ctx, current, index, opts);
  const children = index.children.get(id) ?? [];
  const changesetId = await withScope(deps.sql, ctx.scope, async (tx) => {
    const cs = await targetChangeset(tx, ctx, mode, opts, `Removed ${current.name}`);
    // Children move up one level instead of disappearing.
    for (const childId of children) {
      const child = index.get(childId)!;
      const moved = { ...child, parentId: current.parentId };
      await recordChange(tx, cs.id, 'update', 'element', childId, child, moved, cs.compress);
      if (mode === 'direct') {
        await applyChangeToBase(
          tx,
          { op: 'update', entity: 'element', entityId: childId, before: child, after: moved },
          actorName(ctx),
        );
      }
    }
    // Record the relations that go with it, so undo brings them back.
    for (const r of [...index.outgoing(id), ...index.incoming(id)]) {
      await recordChange(tx, cs.id, 'delete', 'relation', r.id, r, null, cs.compress);
    }
    await recordChange(tx, cs.id, 'delete', 'element', id, current, null, cs.compress);
    if (mode === 'direct') {
      const res = await applyChangeToBase(
        tx,
        { op: 'delete', entity: 'element', entityId: id, before: current, after: null },
        actorName(ctx),
      );
      await refreshDerived(
        tx,
        res.touched.filter((t) => t !== id),
      );
    }
    return cs.id;
  });
  if (mode === 'direct') await afterDirectWrite(deps, ctx, [id]);
  else afterIndirectWrite(deps, ctx, mode, opts, changesetId, [id]);
  return { item: current, mode, changesetId };
}

export function validateRelation(input: CreateRelationInput, index: ModelIndex) {
  const source = index.get(input.sourceId);
  const target = index.get(input.targetId);
  if (!source || !target) throw notFound('One of the elements');
  if (source.id === target.id) throw badRequest("An element can't relate to itself.");
  const def = RELATION_TYPE_DEFS[input.type];
  if (!def.from.includes(source.type) || !def.to.includes(target.type)) {
    const ok = allowedRelations(source.type, target.type);
    throw badRequest(
      `A ${typeDef(source.type).label.toLowerCase()} can't "${def.label}" a ${typeDef(target.type).label.toLowerCase()}.` +
        (ok.length ? ` Try: ${ok.map((t) => RELATION_TYPE_DEFS[t].label).join(', ')}.` : ''),
    );
  }
  if (input.type === 'maps_to' && target.layer !== 'reference') {
    throw badRequest('"Maps to" links your model to a reference model element.');
  }
  return { source, target };
}

export async function createRelation(
  deps: Deps,
  ctx: RequestContext,
  input: CreateRelationInput,
  opts: EditOptions = {},
): Promise<EditResult<Relation>> {
  const state = await stateFor(deps, ctx, opts);
  const index = new ModelIndex(state);
  const { source } = validateRelation(input, index);
  const existing = index
    .outgoing(input.sourceId, input.type)
    .find((r) => r.targetId === input.targetId);
  if (existing) return { item: existing, mode: 'direct', changesetId: '' };
  const mode = decideMode(ctx, source, index, opts);
  const rel: Relation = {
    id: randomUUID(),
    type: input.type,
    sourceId: input.sourceId,
    targetId: input.targetId,
    attributes: input.attributes ?? {},
    createdAt: new Date().toISOString(),
    createdBy: actorName(ctx),
  };
  const changesetId = await withScope(deps.sql, ctx.scope, async (tx) => {
    const cs = await targetChangeset(tx, ctx, mode, opts, `Linked ${source.name}`);
    await recordChange(tx, cs.id, 'create', 'relation', rel.id, null, rel, cs.compress);
    if (mode === 'direct') {
      await applyChangeToBase(
        tx,
        { op: 'create', entity: 'relation', entityId: rel.id, before: null, after: rel },
        actorName(ctx),
      );
      await refreshDerived(tx, [rel.sourceId, rel.targetId]);
    }
    if (ctx.kind === 'token')
      await audit(
        tx,
        ctx,
        'relation.propose_create',
        { type: 'relation', id: rel.id },
        { type: rel.type },
      );
    return cs.id;
  });
  if (mode === 'direct') await afterDirectWrite(deps, ctx, [rel.sourceId, rel.targetId]);
  else afterIndirectWrite(deps, ctx, mode, opts, changesetId, [rel.sourceId, rel.targetId]);
  return { item: rel, mode, changesetId };
}

export async function deleteRelation(
  deps: Deps,
  ctx: RequestContext,
  id: string,
  opts: EditOptions = {},
): Promise<EditResult<Relation>> {
  const state = await stateFor(deps, ctx, opts);
  const index = new ModelIndex(state);
  const rel = state.relations.get(id);
  if (!rel) throw notFound('That relation');
  const mode = decideMode(ctx, index.get(rel.sourceId) ?? null, index, opts);
  const changesetId = await withScope(deps.sql, ctx.scope, async (tx) => {
    const cs = await targetChangeset(tx, ctx, mode, opts, 'Removed a link');
    await recordChange(tx, cs.id, 'delete', 'relation', id, rel, null, cs.compress);
    if (mode === 'direct') {
      await applyChangeToBase(
        tx,
        { op: 'delete', entity: 'relation', entityId: id, before: rel, after: null },
        actorName(ctx),
      );
      await refreshDerived(tx, [rel.sourceId, rel.targetId]);
    }
    return cs.id;
  });
  if (mode === 'direct') await afterDirectWrite(deps, ctx, [rel.sourceId, rel.targetId]);
  else afterIndirectWrite(deps, ctx, mode, opts, changesetId, [rel.sourceId, rel.targetId]);
  return { item: rel, mode, changesetId };
}
