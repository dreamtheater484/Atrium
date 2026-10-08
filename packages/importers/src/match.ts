import { normalizeName, similarity } from '@atrium/schema';

export interface NameMatch {
  /** The matching candidate, as given. */
  name: string;
  /** Index of the match in the candidate list. */
  index: number;
  /** 1 for an exact match after normalisation, otherwise the similarity (0..1). */
  score: number;
  exact: boolean;
}

/**
 * Finds the candidate that best matches a name: equal after normalisation first
 * ("SAP-ECC" = "sap ecc"), then equal without spaces ("Sales Force" = "Salesforce"),
 * then the most similar name at or above `threshold`.
 */
export function matchName(
  name: string,
  candidates: readonly string[],
  threshold = 0.8,
): NameMatch | undefined {
  const target = normalizeName(name);
  if (!target) return undefined;
  const index = candidates.findIndex((c) => normalizeName(c) === target);
  if (index >= 0) return { name: candidates[index]!, index, score: 1, exact: true };

  const compactTarget = target.replace(/ /g, '');
  const compactIndex = candidates.findIndex((c) => normalizeName(c).replace(/ /g, '') === compactTarget);
  if (compactIndex >= 0) {
    return { name: candidates[compactIndex]!, index: compactIndex, score: 0.95, exact: false };
  }

  let best: NameMatch | undefined;
  candidates.forEach((c, i) => {
    const score = similarity(name, c);
    if (score >= threshold && (!best || score > best.score)) {
      best = { name: c, index: i, score: Math.round(score * 1000) / 1000, exact: false };
    }
  });
  return best;
}
