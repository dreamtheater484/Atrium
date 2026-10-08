import {
  type Element,
  type ElementType,
  normalizeName,
  type SearchHit,
  similarity,
} from '@atrium/schema';
import type { RequestContext } from '../auth/context';
import type { Deps } from './deps';
import { ModelIndex } from './model-index';
import { resolveState } from './store';

export function scoreElement(el: Element, q: string, words: string[]): number {
  const name = normalizeName(el.name);
  const key = (el.key ?? '').toLowerCase();
  let score = 0;
  if (name === q || key === q) score = 100;
  else if (name.startsWith(q)) score = 85;
  else if (key.startsWith(q)) score = 75;
  else if (name.includes(q)) score = 65;
  else if (words.length > 1 && words.every((w) => name.includes(w))) score = 55;
  else {
    const desc = normalizeName(el.description);
    const tags = el.tags.join(' ').toLowerCase();
    if (words.every((w) => tags.includes(w))) score = 40;
    else if (words.every((w) => desc.includes(w) || name.includes(w))) score = 30;
    const sim = similarity(el.name, q);
    if (sim > 0.35) score = Math.max(score, Math.round(sim * 60));
  }
  if (!score) return 0;
  if (el.layer === 'org') score += 5;
  if (el.type === 'application' || el.type === 'capability') score += 2;
  return score;
}

/** Fast, typo-tolerant search over everything the caller can see. */
export async function search(
  deps: Deps,
  ctx: RequestContext,
  query: string,
  opts: {
    limit?: number;
    types?: ElementType[];
    scenarioId?: string;
    layer?: 'org' | 'reference' | 'all';
  } = {},
): Promise<SearchHit[]> {
  const q = normalizeName(query);
  if (!q) return [];
  const words = q.split(' ').filter(Boolean);
  const state = await resolveState(deps.store, deps.sql, ctx, { scenarioId: opts.scenarioId });
  const index = new ModelIndex(state);
  const hits: SearchHit[] = [];
  for (const el of state.elements.values()) {
    if (opts.types && !opts.types.includes(el.type)) continue;
    if (opts.layer && opts.layer !== 'all' && el.layer !== opts.layer) continue;
    const score = scoreElement(el, q, words);
    if (!score) continue;
    hits.push({
      id: el.id,
      type: el.type,
      name: el.name,
      key: el.key,
      domainName: index.domainName(el),
      snippet: el.description.slice(0, 140),
      layer: el.layer,
      score,
    });
  }
  return hits
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, opts.limit ?? 20);
}

/** Finds the best single match for a name typed by a person or found in a file. */
export function bestMatch(
  index: ModelIndex,
  name: string,
  types?: ElementType[],
): Element | undefined {
  const q = normalizeName(name);
  if (!q) return undefined;
  const words = q.split(' ');
  let best: Element | undefined;
  let bestScore = 0;
  for (const el of index.model.elements.values()) {
    if (types && !types.includes(el.type)) continue;
    const s = scoreElement(el, q, words);
    if (s > bestScore) {
      best = el;
      bestScore = s;
    }
  }
  return bestScore >= 60 ? best : undefined;
}
