import {
  type CapabilityCell,
  type CapabilityMapData,
  type Element,
  type ElementType,
  type GraphData,
  type GraphEdge,
  type GraphNode,
  type Health,
  type ImpactNode,
  type ImpactResult,
  lifecycleAt,
  RELATION_TYPE_DEFS,
  type RelationType,
  todayIso,
  typeDef,
} from '@atrium/schema';
import type { RequestContext } from '../auth/context';
import { notFound } from '../http/errors';
import type { Deps } from './deps';
import { ModelIndex } from './model-index';
import { capabilityCost } from './stats';
import { type ResolvedState, resolveState } from './store';

const worst = (hs: Array<Health | null>): Health | null =>
  hs.includes('act') ? 'act' : hs.includes('watch') ? 'watch' : hs.includes('good') ? 'good' : null;

function aliveAt(e: Element, at: string) {
  const p = lifecycleAt(e.lifecycle, e.lifecycleDates, at);
  return p !== 'not_yet' && p !== 'retired';
}

function markOf(state: ResolvedState, id: string): GraphNode['mark'] {
  return state.marks.added.has(id) ? 'added' : state.marks.changed.has(id) ? 'changed' : undefined;
}

/* ------------------------------------------------------------------ */
/* Impact: what breaks if this changes                                 */
/* ------------------------------------------------------------------ */

export function computeImpact(index: ModelIndex, rootId: string, maxDepth = 4): ImpactResult {
  const root = index.get(rootId);
  if (!root) throw notFound('That element');
  const seen = new Map<string, ImpactNode>();
  let frontier = [rootId];
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const r of index.outgoing(id)) {
        const def = RELATION_TYPE_DEFS[r.type];
        if (def.impact !== 'forward' && def.impact !== 'both') continue;
        if (r.targetId === rootId || seen.has(r.targetId)) continue;
        const t = index.get(r.targetId);
        if (!t || t.layer !== 'org') continue;
        seen.set(t.id, { element: index.summary(t), depth, via: r.type, fromId: id });
        next.push(t.id);
      }
      for (const r of index.incoming(id)) {
        const def = RELATION_TYPE_DEFS[r.type];
        if (def.impact !== 'backward' && def.impact !== 'both') continue;
        if (r.sourceId === rootId || seen.has(r.sourceId)) continue;
        const s = index.get(r.sourceId);
        if (!s || s.layer !== 'org') continue;
        seen.set(s.id, { element: index.summary(s), depth, via: r.type, fromId: id });
        next.push(s.id);
      }
    }
    frontier = next;
  }
  const nodes = [...seen.values()].sort((a, b) => a.depth - b.depth || a.element.name.localeCompare(b.element.name));
  const byType = new Map<ElementType, number>();
  for (const n of nodes) byType.set(n.element.type, (byType.get(n.element.type) ?? 0) + 1);
  const parts = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${n} ${n === 1 ? typeDef(t).label.toLowerCase() : typeDef(t).plural.toLowerCase()}`);
  const summary = nodes.length
    ? `Changing ${root.name} affects ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}${nodes.some((n) => n.depth > 1) ? ', directly or through others' : ''}.`
    : `Nothing else in the model depends on ${root.name}.`;
  return { root: index.summary(root), nodes, summary };
}

export async function impact(deps: Deps, ctx: RequestContext, id: string, opts: { scenarioId?: string; depth?: number } = {}) {
  const state = await resolveState(deps.store, deps.sql, ctx, { scenarioId: opts.scenarioId });
  return computeImpact(new ModelIndex(state), id, opts.depth ?? 4);
}

/* ------------------------------------------------------------------ */
/* Graph                                                               */
/* ------------------------------------------------------------------ */

export type GraphMode = 'dependencies' | 'dataflow' | 'impact' | 'context';

const MODE_RELATIONS: Record<Exclude<GraphMode, 'impact'>, RelationType[]> = {
  dependencies: ['depends_on', 'uses', 'exposes', 'consumes'],
  dataflow: ['flows_to', 'exposes', 'consumes', 'stores'],
  context: ['supports', 'depends_on', 'flows_to', 'uses', 'stores', 'exposes', 'consumes', 'owned_by', 'realizes', 'governed_by', 'impacts', 'maps_to'],
};

function toNode(index: ModelIndex, state: ResolvedState, e: Element): GraphNode {
  return {
    id: e.id,
    type: e.type,
    name: e.name,
    health: e.health,
    lifecycle: e.lifecycle,
    domainName: index.domainName(e),
    layer: e.layer,
    mark: markOf(state, e.id),
    attributes: {
      annual_cost: e.attributes.annual_cost,
      time: e.attributes.time,
      hosting: e.attributes.hosting,
      vendor: e.attributes.vendor,
      version: e.attributes.version,
      protocol: e.attributes.protocol,
      eol_date: e.attributes.eol_date,
      radar: e.attributes.radar,
    },
  };
}

export async function graph(
  deps: Deps,
  ctx: RequestContext,
  opts: { focus?: string; depth?: number; mode?: GraphMode; types?: ElementType[]; domainId?: string; scenarioId?: string; at?: string; limit?: number },
): Promise<GraphData & { truncated: boolean; summary?: string }> {
  const state = await resolveState(deps.store, deps.sql, ctx, { scenarioId: opts.scenarioId });
  const index = new ModelIndex(state);
  const at = opts.at ?? todayIso();
  const mode = opts.mode ?? (opts.focus ? 'context' : 'dependencies');
  const limit = opts.limit ?? 400;
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const addEdge = (id: string, type: RelationType, source: string, target: string) => {
    if (!nodes.has(source) || !nodes.has(target)) return;
    edges.set(id, { id, type, source, target, label: RELATION_TYPE_DEFS[type].label, mark: markOf(state, id) });
  };

  if (mode === 'impact' && opts.focus) {
    const result = computeImpact(index, opts.focus, opts.depth ?? 4);
    const root = index.get(opts.focus)!;
    nodes.set(root.id, toNode(index, state, root));
    for (const n of result.nodes) nodes.set(n.element.id, toNode(index, state, index.get(n.element.id)!));
    for (const n of result.nodes) {
      const rel =
        index.outgoing(n.fromId, n.via).find((r) => r.targetId === n.element.id) ??
        index.incoming(n.fromId, n.via).find((r) => r.sourceId === n.element.id);
      if (rel) addEdge(rel.id, rel.type, rel.sourceId, rel.targetId);
    }
    return { nodes: [...nodes.values()], edges: [...edges.values()], truncated: false, summary: result.summary };
  }

  const rels = MODE_RELATIONS[mode as Exclude<GraphMode, 'impact'>];
  const typeOk = (e: Element) =>
    e.layer === 'org' && aliveAt(e, at) && (!opts.types || opts.types.includes(e.type) || e.id === opts.focus);

  if (opts.focus) {
    const root = index.get(opts.focus);
    if (!root) throw notFound('That element');
    nodes.set(root.id, toNode(index, state, root));
    let frontier = [root.id];
    for (let d = 0; d < (opts.depth ?? 1) && frontier.length && nodes.size < limit; d++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const r of [...index.outgoing(id), ...index.incoming(id)]) {
          if (!rels.includes(r.type)) continue;
          const otherId = r.sourceId === id ? r.targetId : r.sourceId;
          const other = index.get(otherId);
          if (!other || (other.layer !== 'org' && r.type !== 'maps_to') || !aliveAt(other, at)) continue;
          if (opts.types && !opts.types.includes(other.type) && d > 0) continue;
          if (!nodes.has(otherId)) {
            nodes.set(otherId, toNode(index, state, other));
            next.push(otherId);
          }
        }
      }
      frontier = next;
    }
  } else {
    const candidates = [...state.elements.values()].filter(
      (e) => typeOk(e) && (!opts.domainId || e.domainId === opts.domainId) && (opts.types ?? ['application']).includes(e.type),
    );
    for (const e of candidates.slice(0, limit)) nodes.set(e.id, toNode(index, state, e));
    // Pull in direct neighbours of allowed relation types so the picture is complete (interfaces, tech).
    if (!opts.types || opts.types.length > 1) {
      for (const id of [...nodes.keys()]) {
        for (const r of [...index.outgoing(id), ...index.incoming(id)]) {
          if (!rels.includes(r.type) || nodes.size >= limit) continue;
          const otherId = r.sourceId === id ? r.targetId : r.sourceId;
          const other = index.get(otherId);
          if (other && typeOk(other) && (!opts.types || opts.types.includes(other.type))) nodes.set(otherId, toNode(index, state, other));
        }
      }
    }
  }
  for (const id of nodes.keys()) {
    for (const r of index.outgoing(id)) {
      if (rels.includes(r.type) || (opts.focus && (r.sourceId === opts.focus || r.targetId === opts.focus))) {
        addEdge(r.id, r.type, r.sourceId, r.targetId);
      }
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()], truncated: nodes.size >= limit };
}

/* ------------------------------------------------------------------ */
/* Capability map                                                      */
/* ------------------------------------------------------------------ */

export async function capabilityMap(
  deps: Deps,
  ctx: RequestContext,
  opts: { scenarioId?: string; at?: string; domainId?: string; layer?: 'org' | 'reference'; pack?: string },
): Promise<CapabilityMapData> {
  const state = await resolveState(deps.store, deps.sql, ctx, { scenarioId: opts.scenarioId });
  const index = new ModelIndex(state);
  const at = opts.at ?? todayIso();
  const layer = opts.layer ?? 'org';
  const caps = index.ofType('capability', layer).filter((c) => (!opts.pack || c.pack === opts.pack));
  const appIds = new Set<string>();
  let totalCost = 0;

  const build = (c: Element, level: number): CapabilityCell => {
    const apps = index
      .sources(c.id, layer === 'org' ? 'supports' : 'maps_to')
      .flatMap((s) => (layer === 'org' ? [s] : index.sources(s.id, 'supports').concat(s.type === 'application' ? [s] : [])))
      .filter((a) => a.type === 'application' && a.layer === 'org' && aliveAt(a, at));
    const uniqueApps = [...new Map(apps.map((a) => [a.id, a])).values()];
    for (const a of uniqueApps) appIds.add(a.id);
    const children = (index.children.get(c.id) ?? [])
      .map((id) => index.get(id)!)
      .filter((x) => x && x.layer === layer)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((x) => build(x, level + 1));
    const cost = layer === 'org' ? capabilityCost(index, c.id) : uniqueApps.reduce((s, a) => s + Number(a.attributes.annual_cost ?? 0), 0);
    return {
      id: c.id,
      name: c.name,
      level,
      parentId: c.parentId,
      domainName: index.domainName(c),
      importance: (c.attributes.importance as string) ?? null,
      apps: uniqueApps
        .map((a) => ({
          id: a.id,
          name: a.name,
          health: a.health,
          time: (a.attributes.time as string) ?? null,
          lifecycle: a.lifecycle,
          cost: Number(a.attributes.annual_cost ?? 0),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      cost,
      health: worst([...uniqueApps.map((a) => a.health), ...children.map((ch) => ch.health)]),
      quality: c.quality,
      mark: markOf(state, c.id),
      children,
    };
  };

  const roots = caps
    .filter((c) => !c.parentId || !index.get(c.parentId))
    .filter((c) => !opts.domainId || c.domainId === opts.domainId)
    .sort((a, b) => (index.domainName(a) ?? '').localeCompare(index.domainName(b) ?? '') || a.name.localeCompare(b.name))
    .map((c) => build(c, 1));
  for (const id of appIds) totalCost += Number(index.get(id)?.attributes.annual_cost ?? 0);
  return { roots, totals: { capabilities: caps.length, applications: appIds.size, cost: totalCost } };
}

/* ------------------------------------------------------------------ */
/* Landscape: applications grouped by domain                           */
/* ------------------------------------------------------------------ */

export async function landscape(deps: Deps, ctx: RequestContext, opts: { scenarioId?: string; at?: string; type?: ElementType }) {
  const state = await resolveState(deps.store, deps.sql, ctx, { scenarioId: opts.scenarioId });
  const index = new ModelIndex(state);
  const at = opts.at ?? todayIso();
  const type = opts.type ?? 'application';
  const items = index.ofType(type).filter((e) => aliveAt(e, at) || lifecycleAt(e.lifecycle, e.lifecycleDates, at) === 'retired');
  const groups = new Map<string, { id: string | null; name: string; items: GraphNode[] }>();
  for (const e of items) {
    const key = e.domainId ?? 'none';
    const g = groups.get(key) ?? { id: e.domainId, name: index.domainName(e) ?? 'No domain', items: [] };
    const node = toNode(index, state, e);
    node.lifecycle = (lifecycleAt(e.lifecycle, e.lifecycleDates, at) as never) ?? e.lifecycle;
    g.items.push(node);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, items: g.items.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : a.name.localeCompare(b.name)));
}

/* ------------------------------------------------------------------ */
/* Roadmap                                                             */
/* ------------------------------------------------------------------ */

export async function roadmap(deps: Deps, ctx: RequestContext, opts: { scenarioId?: string }) {
  const state = await resolveState(deps.store, deps.sql, ctx, { scenarioId: opts.scenarioId });
  const index = new ModelIndex(state);
  const initiatives = index.ofType('initiative').map((i) => ({
    id: i.id,
    name: i.name,
    status: (i.attributes.status as string) ?? null,
    start: (i.attributes.start_date as string) ?? null,
    end: (i.attributes.end_date as string) ?? null,
    progress: i.attributes.progress === undefined ? null : Number(i.attributes.progress),
    budget: i.attributes.budget === undefined ? null : Number(i.attributes.budget),
    owner: i.owner,
    mark: markOf(state, i.id),
    impacts: index.targets(i.id, 'impacts').map((t) => ({ id: t.id, name: t.name, type: t.type })),
  }));
  const lifecycles = [...index.ofType('application'), ...index.ofType('technology')]
    .filter((e) => Object.keys(e.lifecycleDates).length > 0 || (e.type === 'technology' && e.attributes.eol_date))
    .map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      domainName: index.domainName(e),
      lifecycle: e.lifecycle,
      dates: e.type === 'technology' && e.attributes.eol_date && !e.lifecycleDates.retired
        ? { ...e.lifecycleDates, retired: e.attributes.eol_date as string }
        : e.lifecycleDates,
      health: e.health,
      mark: markOf(state, e.id),
    }));
  return { initiatives, lifecycles };
}
