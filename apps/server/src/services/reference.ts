import {
  type Element,
  type ElementType,
  type FrameworkLinkSummary,
  type FrameworkNode,
  type FrameworkNodeDetail,
  type FrameworkNodeLink,
  type FrameworkRef,
  type FrameworkTree,
  RELATION_TYPE_DEFS,
  type Relation,
  referenceKey,
  referenceLevel,
} from '@atrium/schema';
import type { RequestContext } from '../auth/context';
import { notFound } from '../http/errors';
import type { Deps } from './deps';
import { ModelIndex } from './model-index';
import { resolveState } from './store';

/**
 * Installed reference frameworks as trees: one framework of one pack at a time, with how much
 * of your own model maps to each element ("maps to") and to everything below it, so the gaps
 * against the standard show. Reads the in-memory model, so a 3,000-element framework is cheap.
 */

interface StoredFramework {
  id: string;
  name: string;
  elementType: ElementType;
  description?: string;
  version?: string;
}

export interface PackInfo {
  id: string;
  name: string;
  version: string;
  frameworks: StoredFramework[];
}

async function installedPacks(deps: Deps): Promise<Map<string, PackInfo>> {
  const rows = await deps.sql`select id, name, version, manifest from reference_packs`;
  return new Map(
    rows.map((r) => [
      r.id as string,
      {
        id: r.id as string,
        name: r.name as string,
        version: r.version as string,
        frameworks: (r.manifest as { frameworks?: StoredFramework[] } | null)?.frameworks ?? [],
      },
    ]),
  );
}

const frameworkOf = (el: Element) => String(el.attributes.framework ?? '');

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function bySiblingOrder(a: Element, b: Element) {
  const ka = referenceKey(a);
  const kb = referenceKey(b);
  if (ka && kb) return collator.compare(ka, kb) || collator.compare(a.name, b.name);
  return collator.compare(a.name, b.name);
}

export interface Members {
  index: ModelIndex;
  packId: string;
  frameworkId: string;
  members: Element[];
  inFramework: Set<string>;
  children: Map<string, Element[]>;
  roots: Element[];
  parentOf: (el: Element) => string | null;
}

/** The elements of one framework and its hierarchy, siblings in key order; null when none. */
export function frameworkMembers(
  index: ModelIndex,
  packId: string,
  frameworkId: string,
): Members | null {
  const members: Element[] = [];
  for (const e of index.model.elements.values())
    if (e.layer === 'reference' && e.pack === packId && frameworkOf(e) === frameworkId)
      members.push(e);
  if (!members.length) return null;
  const inFramework = new Set(members.map((m) => m.id));
  const parentOf = (el: Element) =>
    el.parentId && inFramework.has(el.parentId) && el.parentId !== el.id ? el.parentId : null;
  const children = new Map<string, Element[]>();
  const roots: Element[] = [];
  for (const m of members) {
    const p = parentOf(m);
    if (!p) roots.push(m);
    else children.set(p, [...(children.get(p) ?? []), m]);
  }
  roots.sort(bySiblingOrder);
  for (const list of children.values()) list.sort(bySiblingOrder);
  return { index, packId, frameworkId, members, inFramework, children, roots, parentOf };
}

async function loadFramework(
  deps: Deps,
  ctx: RequestContext,
  packId: string,
  frameworkId: string,
  scenarioId?: string,
): Promise<Members> {
  const state = await resolveState(deps.store, deps.sql, ctx, { scenarioId });
  const members = frameworkMembers(new ModelIndex(state), packId, frameworkId);
  if (!members) throw notFound('That framework (install its pack first)');
  return members;
}

/** Your elements that map to a reference element. */
function mappers(index: ModelIndex, id: string): Relation[] {
  return index.incoming(id, 'maps_to').filter((r) => index.get(r.sourceId)?.layer === 'org');
}

/** Relations to reference elements of other frameworks. */
function crossLinks(index: ModelIndex, el: Element, inFramework: Set<string>) {
  const out: Array<{ rel: Relation; other: Element; direction: 'out' | 'in' }> = [];
  for (const rel of index.outgoing(el.id)) {
    const other = index.get(rel.targetId);
    if (other?.layer === 'reference' && !inFramework.has(other.id))
      out.push({ rel, other, direction: 'out' });
  }
  for (const rel of index.incoming(el.id)) {
    const other = index.get(rel.sourceId);
    if (other?.layer === 'reference' && !inFramework.has(other.id))
      out.push({ rel, other, direction: 'in' });
  }
  return out;
}

function relationLabel(type: Relation['type'], direction: 'out' | 'in') {
  const def = RELATION_TYPE_DEFS[type];
  return direction === 'out' ? def.label : (def.inverseLabel ?? def.label);
}

function frameworkRef(packs: Map<string, PackInfo>, el: Element): FrameworkRef {
  const pack = packs.get(el.pack ?? '');
  const id = frameworkOf(el);
  return {
    packId: el.pack ?? '',
    packName: pack?.name ?? el.pack ?? '',
    id,
    name: pack?.frameworks.find((f) => f.id === id)?.name ?? id,
  };
}

export async function frameworkTree(
  deps: Deps,
  ctx: RequestContext,
  packId: string,
  frameworkId: string,
  opts: { scenarioId?: string } = {},
): Promise<FrameworkTree> {
  const members = await loadFramework(deps, ctx, packId, frameworkId, opts.scenarioId);
  return buildFrameworkTree(members, await installedPacks(deps));
}

/** The framework in tree order with coverage rolled up from the leaves. */
export function buildFrameworkTree(m: Members, packs: Map<string, PackInfo>): FrameworkTree {
  const { index, packId, frameworkId, members, inFramework, children, roots } = m;
  const pack = packs.get(packId);
  const config = pack?.frameworks.find((f) => f.id === frameworkId);

  // Tree order, depth and the top-level element of each branch (for the domain).
  const order: Array<{ el: Element; depth: number; root: Element }> = [];
  const seen = new Set<string>();
  const walk = (el: Element, depth: number, root: Element) => {
    if (seen.has(el.id)) return;
    seen.add(el.id);
    order.push({ el, depth, root });
    for (const c of children.get(el.id) ?? []) walk(c, depth + 1, root);
  };
  for (const r of roots) walk(r, 1, r);
  // A parent loop in the source would hide its elements; show them at the top instead.
  for (const m of members) if (!seen.has(m.id)) walk(m, 1, m);

  // Coverage, from the leaves up. Sets hold your element ids, so each counts once per branch.
  const direct = new Map<string, Set<string>>();
  for (const m of members) {
    const rels = mappers(index, m.id);
    if (rels.length) direct.set(m.id, new Set(rels.map((r) => r.sourceId)));
  }
  const below = new Map<string, Set<string>>();
  const size = new Map<string, number>();
  const covered = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const { el } = order[i]!;
    let set: Set<string> | undefined;
    let n = 1;
    let c = direct.has(el.id) ? 1 : 0;
    for (const child of children.get(el.id) ?? []) {
      n += size.get(child.id) ?? 0;
      c += covered.get(child.id) ?? 0;
      const cs = below.get(child.id);
      if (cs?.size) {
        set ??= new Set();
        for (const x of cs) set.add(x);
      }
    }
    const own = direct.get(el.id);
    if (own) {
      set ??= new Set();
      for (const x of own) set.add(x);
    }
    if (set) below.set(el.id, set);
    size.set(el.id, n);
    covered.set(el.id, c);
  }

  const linkGroups = new Map<string, FrameworkLinkSummary & { ids: Set<string> }>();
  const nodes: FrameworkNode[] = order.map(({ el, depth, root }) => {
    const links = crossLinks(index, el, inFramework);
    for (const l of links) {
      const fw = frameworkRef(packs, l.other);
      const k = `${l.rel.type}|${l.direction}|${fw.packId}|${fw.id}`;
      const g = linkGroups.get(k) ?? {
        type: l.rel.type,
        label: relationLabel(l.rel.type, l.direction),
        direction: l.direction,
        framework: fw,
        count: 0,
        elements: 0,
        ids: new Set<string>(),
      };
      g.count++;
      g.ids.add(el.id);
      linkGroups.set(k, g);
    }
    const domain = el.attributes.domain;
    return {
      id: el.id,
      parentId: depth > 1 ? (el.parentId ?? null) : null,
      key: referenceKey(el),
      name: el.name,
      level: referenceLevel(el, depth),
      domain: typeof domain === 'string' && domain ? domain : root !== el ? root.name : null,
      description: el.description,
      depth,
      mapped: direct.get(el.id)?.size ?? 0,
      mappedBelow: below.get(el.id)?.size ?? 0,
      size: size.get(el.id) ?? 1,
      covered: covered.get(el.id) ?? 0,
      links: links.length,
    };
  });

  const allMapped = new Set<string>();
  for (const s of direct.values()) for (const x of s) allMapped.add(x);
  const elementType = config?.elementType ?? members[0]!.type;
  return {
    pack: { id: packId, name: pack?.name ?? packId, version: pack?.version ?? '' },
    framework: {
      id: frameworkId,
      name: config?.name ?? frameworkId,
      elementType,
      description: config?.description ?? null,
      version: config?.version ?? pack?.version ?? null,
    },
    nodes,
    totals: {
      nodes: nodes.length,
      covered: direct.size,
      mappedElements: allMapped.size,
      candidates: index.ofType(elementType, 'org').length,
    },
    links: [...linkGroups.values()]
      .map(({ ids, ...g }) => ({ ...g, elements: ids.size }))
      .sort((a, b) => b.count - a.count),
  };
}

const DETAIL_LABELS: Record<string, string> = {
  extendedDescription: 'Extended description',
  verticalGroups: 'Vertical groups',
  verticals: 'Vertical groups',
  uid: 'TM Forum UID',
  attributeNames: 'Attributes',
  alsoIn: 'Also in',
  functions: 'Functions it contains',
  marker: 'Marker',
};

const humanize = (key: string) =>
  DETAIL_LABELS[key] ??
  key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());

const MAPPED_BELOW_LIMIT = 100;

export async function frameworkNode(
  deps: Deps,
  ctx: RequestContext,
  packId: string,
  frameworkId: string,
  nodeId: string,
  opts: { scenarioId?: string } = {},
): Promise<FrameworkNodeDetail> {
  const { index, inFramework, children, parentOf } = await loadFramework(
    deps,
    ctx,
    packId,
    frameworkId,
    opts.scenarioId,
  );
  const el = index.get(nodeId);
  if (!el || !inFramework.has(nodeId)) throw notFound('That element of the framework');
  const packs = await installedPacks(deps);

  const path: FrameworkNodeDetail['path'] = [];
  const seen = new Set([el.id]);
  for (let p = parentOf(el); p && !seen.has(p); p = parentOf(index.get(p)!)) {
    seen.add(p);
    const a = index.get(p)!;
    path.unshift({ id: a.id, key: referenceKey(a), name: a.name });
  }

  const links: FrameworkNodeLink[] = crossLinks(index, el, inFramework)
    .map(({ rel, other, direction }) => ({
      relationId: rel.id,
      type: rel.type,
      label: relationLabel(rel.type, direction),
      direction,
      other: {
        id: other.id,
        key: referenceKey(other),
        name: other.name,
        level: typeof other.attributes.level === 'string' ? other.attributes.level : null,
        framework: frameworkRef(packs, other),
      },
    }))
    .sort(
      (a, b) =>
        a.label.localeCompare(b.label) ||
        a.other.framework.name.localeCompare(b.other.framework.name) ||
        collator.compare(a.other.key ?? a.other.name, b.other.key ?? b.other.name),
    );

  const details: FrameworkNodeDetail['details'] = [];
  for (const [k, v] of Object.entries(el.attributes)) {
    if (['framework', 'level', 'domain'].includes(k)) continue;
    if (k === 'functions' && links.some((l) => l.type === 'realizes')) continue;
    if (Array.isArray(v) && v.length) details.push({ label: humanize(k), value: v.map(String) });
    else if (typeof v === 'string' || typeof v === 'number')
      details.push({ label: humanize(k), value: String(v) });
  }

  const mappedFrom = mappers(index, el.id)
    .map((r) => {
      const src = index.get(r.sourceId)!;
      return {
        relationId: r.id,
        element: { ...index.summary(src), domainName: index.domainName(src) },
      };
    })
    .sort((a, b) => a.element.name.localeCompare(b.element.name));

  // Your elements mapped further down, grouped by element.
  const byElement = new Map<string, Array<{ id: string; key: string | null; name: string }>>();
  const stack = [...(children.get(el.id) ?? [])];
  const visited = new Set<string>();
  while (stack.length) {
    const d = stack.pop()!;
    if (visited.has(d.id)) continue;
    visited.add(d.id);
    for (const r of mappers(index, d.id))
      byElement.set(r.sourceId, [
        ...(byElement.get(r.sourceId) ?? []),
        { id: d.id, key: referenceKey(d), name: d.name },
      ]);
    stack.push(...(children.get(d.id) ?? []));
  }
  const items = [...byElement.entries()]
    .map(([id, to]) => ({
      element: index.summary(index.get(id)!),
      to: to.sort((a, b) => collator.compare(a.key ?? a.name, b.key ?? b.name)),
    }))
    .sort((a, b) => a.element.name.localeCompare(b.element.name));

  const domain = el.attributes.domain;
  return {
    id: el.id,
    sourceKey: el.key,
    key: referenceKey(el),
    name: el.name,
    description: el.description,
    level: referenceLevel(el, path.length + 1),
    domain: typeof domain === 'string' && domain ? domain : (path[0]?.name ?? null),
    details,
    path,
    children: children.get(el.id)?.length ?? 0,
    mappedFrom,
    mappedBelow: { elements: items.length, items: items.slice(0, MAPPED_BELOW_LIMIT) },
    links,
  };
}
