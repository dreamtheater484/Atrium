import {
  computeHealth,
  computeQuality,
  type Element,
  type ElementSummary,
  type ElementType,
  type ModelSnapshot,
  type Relation,
  type RelationCounts,
  type RelationType,
  type TechSignal,
} from '@atrium/schema';

/** Adjacency lists and lookups over a model snapshot. Cheap to build, used per request. */
export class ModelIndex {
  readonly out = new Map<string, Relation[]>();
  readonly in = new Map<string, Relation[]>();
  readonly children = new Map<string, string[]>();
  readonly byType = new Map<ElementType, Element[]>();
  private byKeyCache: Map<string, Element> | null = null;

  constructor(readonly model: ModelSnapshot) {
    for (const r of model.relations.values()) {
      push(this.out, r.sourceId, r);
      push(this.in, r.targetId, r);
    }
    for (const e of model.elements.values()) {
      push(this.byType, e.type, e);
      if (e.parentId) push(this.children, e.parentId, e.id);
    }
  }

  get(id: string | null | undefined): Element | undefined {
    return id ? this.model.elements.get(id) : undefined;
  }

  ofType(type: ElementType, layer: 'org' | 'reference' | 'all' = 'org'): Element[] {
    const list = this.byType.get(type) ?? [];
    return layer === 'all' ? list : list.filter((e) => e.layer === layer);
  }

  outgoing(id: string, type?: RelationType): Relation[] {
    const list = this.out.get(id) ?? [];
    return type ? list.filter((r) => r.type === type) : list;
  }

  incoming(id: string, type?: RelationType): Relation[] {
    const list = this.in.get(id) ?? [];
    return type ? list.filter((r) => r.type === type) : list;
  }

  targets(id: string, type: RelationType): Element[] {
    return this.outgoing(id, type)
      .map((r) => this.get(r.targetId))
      .filter(Boolean) as Element[];
  }

  sources(id: string, type: RelationType): Element[] {
    return this.incoming(id, type)
      .map((r) => this.get(r.sourceId))
      .filter(Boolean) as Element[];
  }

  relCounts(id: string): RelationCounts {
    const counts: RelationCounts = { out: {}, in: {} };
    for (const r of this.outgoing(id)) counts.out[r.type] = (counts.out[r.type] ?? 0) + 1;
    for (const r of this.incoming(id)) counts.in[r.type] = (counts.in[r.type] ?? 0) + 1;
    return counts;
  }

  techSignals(id: string): TechSignal[] {
    return this.targets(id, 'uses').map((t) => ({
      name: t.name,
      eolDate: (t.attributes.eol_date as string) ?? null,
      extendedDate: (t.attributes.extended_support_date as string) ?? null,
      onExtended: t.attributes.extended_support === true,
      radar: (t.attributes.radar as string) ?? null,
      lifecycle: t.lifecycle,
    }));
  }

  depth(id: string): number {
    let d = 1;
    let cur = this.get(id);
    const seen = new Set<string>();
    while (cur?.parentId && !seen.has(cur.parentId)) {
      seen.add(cur.parentId);
      cur = this.get(cur.parentId);
      d++;
    }
    return d;
  }

  /** Elements below `id` in the hierarchy (not including itself). */
  descendants(id: string): string[] {
    const result: string[] = [];
    const stack = [...(this.children.get(id) ?? [])];
    while (stack.length) {
      const next = stack.pop()!;
      if (result.includes(next)) continue;
      result.push(next);
      stack.push(...(this.children.get(next) ?? []));
    }
    return result;
  }

  byKey(type: ElementType, key: string): Element | undefined {
    if (!this.byKeyCache) {
      this.byKeyCache = new Map();
      for (const e of this.model.elements.values()) {
        if (e.key) this.byKeyCache.set(`${e.type}:${e.key.toLowerCase()}`, e);
      }
    }
    return this.byKeyCache.get(`${type}:${key.toLowerCase()}`);
  }

  domainName(el: Element): string | null {
    return this.get(el.domainId)?.name ?? null;
  }

  summary(el: Element): ElementSummary {
    return {
      id: el.id,
      type: el.type,
      name: el.name,
      key: el.key,
      layer: el.layer,
      health: el.health,
      lifecycle: el.lifecycle,
    };
  }

  /** Recomputes the derived fields (quality, health) for an element in this model. */
  derive(el: Element): Pick<Element, 'quality' | 'health' | 'healthReasons'> {
    const quality = computeQuality(el, this.relCounts(el.id));
    const h = computeHealth(el, el.type === 'application' ? this.techSignals(el.id) : []);
    return { quality, health: h.health, healthReasons: h.reasons };
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
