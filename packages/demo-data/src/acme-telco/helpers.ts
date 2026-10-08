import type { RelationType } from '@atrium/schema';
import type { SeedRelation } from '../types';

/** A single relation between two refs. */
export function rel(
  type: RelationType,
  from: string,
  to: string,
  attributes?: Record<string, unknown>,
): SeedRelation {
  return attributes ? { type, from, to, attributes } : { type, from, to };
}

/** One relation of `type` from `from` to each of `targets`. */
export function fanOut(
  type: RelationType,
  from: string,
  targets: readonly string[],
): SeedRelation[] {
  return targets.map((to) => rel(type, from, to));
}

/** One relation of `type` from each of `sources` to `to`. */
export function fanIn(type: RelationType, sources: readonly string[], to: string): SeedRelation[] {
  return sources.map((from) => rel(type, from, to));
}

/** Removes keys whose value is undefined, so optional attributes stay truly absent. */
export function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Vendor name used for software Acme Telco builds and runs itself. */
export const IN_HOUSE = 'Acme Telco (in-house)';
