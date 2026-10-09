import { type Element, lifecycleAt, todayIso } from '@atrium/schema';
import type { ModelIndex } from './model-index';

/** A contract's share of an application's cost. */
export interface ContractShare {
  contractId: string;
  name: string;
  amount: number;
  estimate: boolean;
}

export interface AppCost {
  /** The application's own annual cost, when someone entered one. */
  own: number | null;
  /** Shares of the contracts that cover it (directly or through a technology it runs on). */
  shares: ContractShare[];
  /** Own cost plus contract shares. */
  total: number;
  /** At least part of the cost is known. */
  known: boolean;
  /** How much of the total is an estimate rather than an actual figure. */
  estimated: number;
}

export interface CostModel {
  apps: Map<string, AppCost>;
  /** All application costs and active contracts, each counted once. */
  total: number;
  /** Contract money that covers no live application (for example, only a database licence). */
  unallocated: number;
  /** Contract money shared out over applications. */
  viaContracts: number;
  estimated: number;
}

const NONE: AppCost = { own: null, shares: [], total: 0, known: false, estimated: 0 };

export function money(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const isEstimate = (e: Element) => e.attributes.cost_basis === 'estimate';

function alive(e: Element, at: string) {
  const p = lifecycleAt(e.lifecycle, e.lifecycleDates, at);
  return p !== 'not_yet' && p !== 'retired';
}

const cache = new WeakMap<ModelIndex, Map<string, CostModel>>();

/**
 * What each application costs a year: its own figure plus an even share of every contract that
 * covers it. A contract that covers a technology is shared by the applications running on it.
 */
export function costModel(index: ModelIndex, at: string = todayIso()): CostModel {
  let byDate = cache.get(index);
  if (!byDate) {
    byDate = new Map();
    cache.set(index, byDate);
  }
  const hit = byDate.get(at);
  if (hit) return hit;

  const apps = new Map<string, AppCost>();
  let total = 0;
  let estimated = 0;
  let unallocated = 0;
  let viaContracts = 0;
  const live = index.ofType('application').filter((a) => alive(a, at));
  for (const a of live) {
    const own = money(a.attributes.annual_cost);
    const est = own !== null && isEstimate(a) ? own : 0;
    apps.set(a.id, { own, shares: [], total: own ?? 0, known: own !== null, estimated: est });
    total += own ?? 0;
    estimated += est;
  }
  for (const c of index.ofType('contract')) {
    const amount = money(c.attributes.annual_cost);
    const end = c.attributes.end_date as string | undefined;
    if (amount === null || (end && end < at)) continue;
    total += amount;
    if (isEstimate(c)) estimated += amount;
    const covered = new Set<string>();
    for (const t of index.targets(c.id, 'covers')) {
      if (t.type === 'application') covered.add(t.id);
      if (t.type === 'technology')
        for (const a of index.sources(t.id, 'uses'))
          if (a.type === 'application') covered.add(a.id);
    }
    const ids = [...covered].filter((id) => apps.has(id));
    if (!ids.length) {
      unallocated += amount;
      continue;
    }
    const share = amount / ids.length;
    viaContracts += amount;
    for (const id of ids) {
      const cost = apps.get(id)!;
      cost.shares.push({ contractId: c.id, name: c.name, amount: share, estimate: isEstimate(c) });
      cost.total += share;
      cost.known = true;
      if (isEstimate(c)) cost.estimated += share;
    }
  }
  const model = { apps, total, unallocated, viaContracts, estimated };
  byDate.set(at, model);
  return model;
}

/** The yearly cost of one application (own plus contract shares). */
export function appCost(index: ModelIndex, id: string, at?: string): AppCost {
  const hit = costModel(index, at).apps.get(id);
  if (hit) return hit;
  // Not live at that date: just its own figure.
  const el = index.get(id);
  const own = el ? money(el.attributes.annual_cost) : null;
  if (!el || own === null) return NONE;
  return { own, shares: [], total: own, known: true, estimated: isEstimate(el) ? own : 0 };
}
