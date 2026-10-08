import {
  type AttributeDef,
  type Element,
  ELEMENT_TYPE_DEFS,
  enumLabel,
  RELATION_TYPE_DEFS,
  type RelationType,
} from '@atrium/schema';

export function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Column header for an outgoing relation, e.g. "Supports" or "Runs on". */
export function relationHeader(type: RelationType): string {
  return capitalise(RELATION_TYPE_DEFS[type].label);
}

export function typeLabel(type: Element['type']): string {
  return ELEMENT_TYPE_DEFS[type].label;
}

export function indexById(elements: Element[]): Map<string, Element> {
  return new Map(elements.map((e) => [e.id, e]));
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Parses "YYYY-MM-DD" (optionally with a time part) to a UTC Date; null when unparseable. */
export function parseIsoDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;
  const m = ISO_DATE.exec(value.trim());
  if (!m) return null;
  if (value.trim().length === 10) {
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-08" → "8 Oct 2026"; other strings are returned unchanged. */
export function formatDisplayDate(value: string): string {
  const d = parseIsoDate(value);
  if (!d) return value;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter((v) => v.trim() !== '');
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return isEmpty(value) ? [] : [String(value)];
}

/** An attribute value as human text: enum labels, comma-joined lists, Yes/No, ISO dates. */
export function attributeText(def: AttributeDef | undefined, value: unknown): string {
  if (isEmpty(value)) return '';
  const kind = def?.kind;
  if (kind === 'enum' && typeof value === 'string') return enumLabel(value);
  if (kind === 'list' || Array.isArray(value)) return asList(value).join(', ');
  if (kind === 'boolean' || typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (kind === 'date') {
    const d = parseIsoDate(value);
    return d ? d.toISOString().slice(0, 10) : String(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(/[\s€$£,]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** "sla_hours" → "Sla hours", for attributes that are not in the metamodel. */
export function humanizeKey(key: string): string {
  return capitalise(key.replace(/[_-]+/g, ' ').trim());
}

/**
 * Orders elements for reading: hierarchical types put each parent directly above its
 * children (alphabetical within a level), flat types are alphabetical. Also returns depth.
 */
export function readingOrder(elements: Element[]): Array<{ element: Element; depth: number }> {
  const ids = new Set(elements.map((e) => e.id));
  const children = new Map<string | null, Element[]>();
  for (const el of elements) {
    const parent = el.parentId && ids.has(el.parentId) ? el.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(el);
    children.set(parent, list);
  }
  const byName = (a: Element, b: Element) =>
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true });
  const out: Array<{ element: Element; depth: number }> = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const el of (children.get(parent) ?? []).sort(byName)) {
      if (seen.has(el.id)) continue;
      seen.add(el.id);
      out.push({ element: el, depth });
      walk(el.id, depth + 1);
    }
  };
  walk(null, 0);
  // Cycles in the parent chain would leave elements unvisited; append them flat.
  for (const el of [...elements].sort(byName)) {
    if (!seen.has(el.id)) out.push({ element: el, depth: 0 });
  }
  return out;
}
