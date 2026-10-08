import {
  type Element,
  type ElementDetail,
  type ElementRow,
  type ElementType,
  type FieldSuggestion,
  type Health,
  lifecycleAt,
  missingFields,
  RELATION_TYPE_DEFS,
  type RelationView,
  type SuggestedRelation,
  typeDef,
} from '@atrium/schema';
import type { RequestContext } from '../auth/context';
import { notFound } from '../http/errors';
import type { Deps } from './deps';
import { ModelIndex } from './model-index';
import { canEditDirectly } from './policy';
import { type ResolvedState, resolveState } from './store';

export interface ListQuery {
  type?: ElementType;
  types?: ElementType[];
  q?: string;
  domainId?: string;
  parentId?: string;
  lifecycle?: string;
  health?: Health | 'unknown';
  layer?: 'org' | 'reference' | 'all';
  pack?: string;
  /** Only elements with missing information. */
  gaps?: boolean;
  /** Model date (YYYY-MM-DD) for lifecycle filtering. */
  at?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  scenarioId?: string;
}

export function toRow(el: Element, index: ModelIndex, marks?: ResolvedState['marks']): ElementRow {
  return {
    ...el,
    domainName: index.domainName(el),
    parentName: index.get(el.parentId)?.name ?? null,
    level: typeDef(el.type).hierarchical ? index.depth(el.id) : 1,
    teamNames: index.targets(el.id, 'owned_by').map((t) => t.name),
    capabilityNames: index.targets(el.id, 'supports').map((t) => t.name),
    relationCount: index.outgoing(el.id).length + index.incoming(el.id).length,
    mark: marks?.added.has(el.id) ? 'added' : marks?.changed.has(el.id) ? 'changed' : undefined,
  };
}

function sortValue(row: ElementRow, sort: string): unknown {
  if (sort.startsWith('attributes.')) return row.attributes[sort.slice(11)];
  return (row as unknown as Record<string, unknown>)[sort];
}

export async function listElements(deps: Deps, ctx: RequestContext, q: ListQuery) {
  const state = await resolveState(deps.store, deps.sql, ctx, { scenarioId: q.scenarioId });
  const index = new ModelIndex(state);
  const layer = q.layer ?? 'org';
  const types = q.types ?? (q.type ? [q.type] : null);
  const needle = q.q?.trim().toLowerCase();
  let items = [...state.elements.values()].filter((e) => {
    if (layer !== 'all' && e.layer !== layer) return false;
    if (q.pack && e.pack !== q.pack) return false;
    if (types && !types.includes(e.type)) return false;
    if (q.domainId && e.domainId !== q.domainId && e.id !== q.domainId) return false;
    if (q.parentId && e.parentId !== q.parentId) return false;
    if (q.lifecycle && e.lifecycle !== q.lifecycle) return false;
    if (q.health) {
      if (q.health === 'unknown' ? e.health !== null : e.health !== q.health) return false;
    }
    if (q.at) {
      const phase = lifecycleAt(e.lifecycle, e.lifecycleDates, q.at);
      if (phase === 'not_yet') return false;
    }
    if (needle) {
      const hay =
        `${e.name} ${e.key ?? ''} ${e.description} ${e.tags.join(' ')} ${e.owner ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  if (q.gaps) items = items.filter((e) => e.quality < 100);
  const rows = items.map((e) => toRow(e, index, state.marks));
  const sort = q.sort ?? 'name';
  const dir = q.dir === 'desc' ? -1 : 1;
  rows.sort((a, b) => {
    const va = sortValue(a, sort);
    const vb = sortValue(b, sort);
    if (va === vb) return a.name.localeCompare(b.name);
    if (va === undefined || va === null || va === '') return 1;
    if (vb === undefined || vb === null || vb === '') return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
  });
  const total = rows.length;
  const offset = q.offset ?? 0;
  const limit = Math.min(q.limit ?? 5000, 10000);
  return { items: rows.slice(offset, offset + limit), total };
}

/** Counts per element type, for the type chips in Explore. */
export async function typeCounts(deps: Deps, ctx: RequestContext, scenarioId?: string) {
  const state = await resolveState(deps.store, deps.sql, ctx, { scenarioId });
  const counts: Record<string, number> = {};
  for (const e of state.elements.values()) {
    if (e.layer !== 'org') continue;
    counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  return counts;
}

export async function elementDetail(
  deps: Deps,
  ctx: RequestContext,
  id: string,
  opts: { scenarioId?: string } = {},
): Promise<ElementDetail & { suggestedRelations: SuggestedRelation[] }> {
  const state = await resolveState(deps.store, deps.sql, ctx, { scenarioId: opts.scenarioId });
  const index = new ModelIndex(state);
  const el = index.get(id);
  if (!el) throw notFound('That element');
  const relations: RelationView[] = [];
  for (const r of index.outgoing(id)) {
    const other = index.get(r.targetId);
    if (other) relations.push({ ...r, other: index.summary(other), direction: 'out' });
  }
  for (const r of index.incoming(id)) {
    const other = index.get(r.sourceId);
    if (other) relations.push({ ...r, other: index.summary(other), direction: 'in' });
  }
  relations.sort(
    (a, b) =>
      Object.keys(RELATION_TYPE_DEFS).indexOf(a.type) -
        Object.keys(RELATION_TYPE_DEFS).indexOf(b.type) || a.other.name.localeCompare(b.other.name),
  );
  const children = (index.children.get(id) ?? [])
    .map((c) => index.get(c))
    .filter(Boolean)
    .map((c) => index.summary(c!))
    .sort((a, b) => a.name.localeCompare(b.name));

  const suggestions: Record<string, FieldSuggestion> = {
    ...el.suggestions,
    ...(el.layer === 'org' ? deps.ai.suggestFields(el, index) : {}),
  };
  const suggestedRelations: SuggestedRelation[] = [];
  if (el.layer === 'org') {
    if (el.type === 'application' && index.outgoing(id, 'supports').length === 0) {
      suggestedRelations.push({
        relation: 'supports',
        targetType: 'capability',
        matches: deps.ai.suggestRelated(el, index, 'capability'),
      });
    }
    const refs = index.ofType(el.type, 'reference');
    if (refs.length) {
      suggestedRelations.push({
        relation: 'maps_to',
        targetType: el.type,
        matches: deps.ai.suggestMappings(el, index),
      });
    }
  }
  const [pending] = await deps.sql`
    select count(distinct s.id)::int as n from changes c join changesets s on s.id = c.changeset_id
    where c.entity_id = ${id} and s.status = 'open'`;

  return {
    ...el,
    suggestions,
    domainName: index.domainName(el),
    parentName: index.get(el.parentId)?.name ?? null,
    relations,
    children,
    missing: missingFields(el, index.relCounts(id)),
    canEditDirectly: opts.scenarioId ? true : canEditDirectly(ctx, el, index),
    scenarioMark: state.marks.added.has(id)
      ? 'added'
      : state.marks.changed.has(id)
        ? 'changed'
        : undefined,
    pendingSuggestions: Number(pending?.n ?? 0),
    suggestedRelations: suggestedRelations.filter((s) => s.matches.length),
  };
}
