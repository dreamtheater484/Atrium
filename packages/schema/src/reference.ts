import type { Element } from './element';

/**
 * A reference element's own id as its framework writes it: "1.1.3" for the stored key
 * "etom:1.1.3". Null when there is none or it only repeats the name (SID entities).
 */
export function referenceKey(el: Pick<Element, 'key' | 'name' | 'attributes'>): string | null {
  if (!el.key) return null;
  const fw = String(el.attributes.framework ?? '');
  const key = fw && el.key.startsWith(`${fw}:`) ? el.key.slice(fw.length + 1) : el.key;
  return key.trim().toLowerCase() === el.name.trim().toLowerCase() ? null : key;
}

/** "Level 3", "ABE", "Aggregate function level 1"… as the framework names it. */
export function referenceLevel(el: Pick<Element, 'attributes'>, depth: number): string {
  const level = el.attributes.level;
  return typeof level === 'string' && level ? level : `Level ${depth}`;
}
