import {
  type ElementType,
  RELATION_TYPE_DEFS,
  type RelationType,
  normalizeName,
  typeDef,
} from '@atrium/schema';
import type { NormalizedElement, NormalizedModel, NormalizedRelation } from './types';

/**
 * Collects elements and relations for a model import, then validates them against the
 * metamodel: relations between types Atrium does not allow are dropped with a summary
 * warning, as are relations to unknown elements and invalid parent/domain links.
 */
export class ModelBuilder {
  private readonly elements = new Map<string, NormalizedElement>();
  private readonly pending: NormalizedRelation[] = [];
  readonly warnings: string[] = [];

  /** Adds an element. A real element replaces a placeholder with the same ref. */
  add(element: NormalizedElement): NormalizedElement {
    const existing = this.elements.get(element.ref);
    if (existing && !(existing.placeholder && !element.placeholder)) return existing;
    if (existing) {
      element.externalIds = { ...existing.externalIds, ...element.externalIds };
    }
    this.elements.set(element.ref, element);
    return element;
  }

  get(ref: string): NormalizedElement | undefined {
    return this.elements.get(ref);
  }

  has(ref: string): boolean {
    return this.elements.has(ref);
  }

  /** The first element of a type whose name matches (after normalisation). */
  findByName(type: ElementType, name: string): NormalizedElement | undefined {
    const key = normalizeName(name);
    for (const el of this.elements.values()) {
      if (el.type === type && normalizeName(el.name) === key) return el;
    }
    return undefined;
  }

  /** Elements added so far (live objects; no validation). */
  list(): NormalizedElement[] {
    return [...this.elements.values()];
  }

  relate(type: RelationType, from: string, to: string): void {
    this.pending.push({ type, from, to });
  }

  warn(message: string): void {
    this.warnings.push(message);
  }

  build(): NormalizedModel {
    const warnings = [...this.warnings];
    const relations: NormalizedRelation[] = [];
    const seen = new Set<string>();
    const invalid = new Map<string, number>();
    let missing = 0;
    for (const rel of this.pending) {
      const from = this.elements.get(rel.from);
      const to = this.elements.get(rel.to);
      if (!from || !to) {
        missing++;
        continue;
      }
      if (rel.from === rel.to) continue;
      const def = RELATION_TYPE_DEFS[rel.type];
      if (!def.from.includes(from.type) || !def.to.includes(to.type)) {
        const key = `"${def.label}" from ${typeDef(from.type).label.toLowerCase()} to ${typeDef(to.type).label.toLowerCase()}`;
        invalid.set(key, (invalid.get(key) ?? 0) + 1);
        continue;
      }
      const key = `${rel.type}|${rel.from}|${rel.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      relations.push(rel);
    }
    for (const [what, n] of invalid) {
      warnings.push(`Skipped ${n} ${n === 1 ? 'relation' : 'relations'} ${what}: Atrium does not allow that combination`);
    }
    if (missing) {
      warnings.push(`Skipped ${missing} ${missing === 1 ? 'relation' : 'relations'} to elements that are not in the file`);
    }

    const elements = [...this.elements.values()].map((el) => ({ ...el }));
    for (const el of elements) {
      if (el.parentRef) {
        const parent = this.elements.get(el.parentRef);
        if (!parent || parent.type !== el.type || !typeDef(el.type).hierarchical) {
          el.parentRef = undefined;
        }
      }
      if (el.domainRef) {
        const domain = this.elements.get(el.domainRef);
        if (!domain || domain.type !== 'domain' || el.type === 'domain') el.domainRef = undefined;
      }
      for (const key of Object.keys(el) as Array<keyof NormalizedElement>) {
        if (el[key] === undefined) delete el[key];
      }
    }
    return { elements, relations, warnings };
  }
}
