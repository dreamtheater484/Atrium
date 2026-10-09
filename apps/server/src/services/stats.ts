import {
  addDaysIso,
  type Element,
  type ElementSummary,
  type ElementType,
  type Health,
  hasSupportDates,
  isVendorProduct,
  lifecycleAt,
  missingFields,
  relationCount,
  supportStatus,
  todayIso,
  typeDef,
} from '@atrium/schema';
import type { RequestContext } from '../auth/context';
import { appCost, costModel } from './costs';
import type { Deps } from './deps';
import { ModelIndex } from './model-index';
import { resolveState } from './store';

export interface Overview {
  generatedAt: string;
  at: string;
  counts: Partial<Record<ElementType, number>>;
  applications: {
    total: number;
    /** Own costs plus active contracts, each counted once. */
    cost: number;
    health: Record<Health | 'unknown', number>;
    byLifecycle: Record<string, number>;
    byTime: Record<string, number>;
    byHosting: Record<string, number>;
    byDomain: Array<{ id: string | null; name: string; count: number; cost: number; act: number }>;
    fitScatter: Array<{
      id: string;
      name: string;
      business: number;
      technical: number;
      cost: number;
      time: string | null;
    }>;
  };
  quality: {
    average: number;
    complete: number;
    total: number;
    gaps: Array<ElementSummary & { quality: number; missing: string[]; domainName: string | null }>;
  };
  risks: Array<ElementSummary & { reasons: string[]; domainName: string | null; cost: number }>;
  eol: Array<{
    id: string;
    name: string;
    eolDate: string;
    /** Out of support (not covered by extended support we pay for). */
    past: boolean;
    /** Until when the vendor offers paid extended support. */
    extendedDate: string | null;
    /** We pay for that extended support. */
    onExtended: boolean;
    apps: Array<{ id: string; name: string }>;
  }>;
  initiatives: Array<{
    id: string;
    name: string;
    status: string | null;
    start: string | null;
    end: string | null;
    progress: number | null;
    budget: number | null;
    impacts: number;
  }>;
  capabilities: {
    total: number;
    withoutApps: Array<{ id: string; name: string }>;
    overlaps: Array<{ id: string; name: string; apps: string[] }>;
    costByCapability: Array<{ id: string; name: string; cost: number; health: Health | null }>;
  };
  technology: { total: number; byRadar: Record<string, number> };
  /** How complete the data behind the numbers is. */
  completeness: Completeness;
  myServices: Array<
    ElementSummary & {
      domainName: string | null;
      dependsOn: number;
      usedBy: number;
      reasons: string[];
      standards: number;
    }
  >;
}

export interface Completeness {
  cost: {
    /** Live applications with a known cost (their own figure or a contract share). */
    known: number;
    total: number;
    /** Money that is an estimate rather than an actual figure. */
    estimated: number;
    /** Contract money shared out over applications. */
    viaContracts: number;
    /** Contract money that covers no live application. */
    unallocated: number;
  };
  integrations: { mapped: number; standalone: number; total: number };
  /** End-of-support dates for versioned technologies and vendor products. */
  support: { known: number; total: number };
}

const INTEGRATION = typeDef('application').expectedRelations!.find((r) => r.key === 'integration')!;

/** Live applications that exchange data with others (or are marked standalone). */
export function hasIntegrations(index: ModelIndex, app: Element): boolean {
  return relationCount(INTEGRATION, index.relCounts(app.id)) > 0;
}

/** Elements that should have an end-of-support date. */
export function needsSupportDates(e: Element): boolean {
  if (e.layer !== 'org') return false;
  if (e.type === 'technology') return hasSupportDates(e.attributes);
  if (e.type === 'application') return isVendorProduct(e.attributes);
  return false;
}

/** Splits an application's cost evenly over the capabilities it supports. */
export function capabilityCost(index: ModelIndex, capId: string): number {
  let total = 0;
  const ids = [capId, ...index.descendants(capId)];
  const seen = new Set<string>();
  for (const id of ids) {
    for (const app of index.sources(id, 'supports')) {
      if (app.type !== 'application') continue;
      const key = `${app.id}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const n = Math.max(
        1,
        index.targets(app.id, 'supports').filter((t) => t.type === 'capability').length,
      );
      total += appCost(index, app.id).total / n;
    }
  }
  return Math.round(total);
}

const worst = (hs: Array<Health | null>): Health | null =>
  hs.includes('act') ? 'act' : hs.includes('watch') ? 'watch' : hs.includes('good') ? 'good' : null;

export async function overview(
  deps: Deps,
  ctx: RequestContext,
  opts: { scenarioId?: string; at?: string } = {},
): Promise<Overview> {
  const state = await resolveState(deps.store, deps.sql, ctx, { scenarioId: opts.scenarioId });
  const index = new ModelIndex(state);
  const at = opts.at ?? todayIso();
  const alive = (e: Element) => {
    const p = lifecycleAt(e.lifecycle, e.lifecycleDates, at);
    return p !== 'not_yet' && p !== 'retired';
  };
  const org = [...state.elements.values()].filter((e) => e.layer === 'org');
  const counts: Partial<Record<ElementType, number>> = {};
  for (const e of org) counts[e.type] = (counts[e.type] ?? 0) + 1;

  const apps = org.filter((e) => e.type === 'application' && alive(e));
  const costs = costModel(index, at);
  const costOf = (a: Element) => appCost(index, a.id, at).total;
  const health = { good: 0, watch: 0, act: 0, unknown: 0 };
  const byLifecycle: Record<string, number> = {};
  const byTime: Record<string, number> = {};
  const byHosting: Record<string, number> = {};
  const byDomain = new Map<
    string | null,
    { id: string | null; name: string; count: number; cost: number; act: number }
  >();
  for (const a of apps) {
    const c = costOf(a);
    health[a.health ?? 'unknown']++;
    const phase = lifecycleAt(a.lifecycle, a.lifecycleDates, at) as string | null;
    byLifecycle[phase ?? 'unknown'] = (byLifecycle[phase ?? 'unknown'] ?? 0) + 1;
    const t = (a.attributes.time as string) ?? 'unknown';
    byTime[t] = (byTime[t] ?? 0) + 1;
    const h = (a.attributes.hosting as string) ?? 'unknown';
    byHosting[h] = (byHosting[h] ?? 0) + 1;
    const d = byDomain.get(a.domainId) ?? {
      id: a.domainId,
      name: index.domainName(a) ?? 'No domain',
      count: 0,
      cost: 0,
      act: 0,
    };
    d.count++;
    d.cost += c;
    if (a.health === 'act') d.act++;
    byDomain.set(a.domainId, d);
  }

  const scored = org.filter((e) =>
    ['application', 'capability', 'interface', 'technology', 'data_object'].includes(e.type),
  );
  const average = scored.length
    ? Math.round(scored.reduce((s, e) => s + e.quality, 0) / scored.length)
    : 100;
  const gaps = scored
    .filter((e) => e.quality < 100)
    .sort(
      (a, b) =>
        (a.type === 'application' ? -1 : 0) - (b.type === 'application' ? -1 : 0) ||
        a.quality - b.quality,
    )
    .slice(0, 8)
    .map((e) => ({
      ...index.summary(e),
      quality: e.quality,
      missing: missingFields(e, index.relCounts(e.id)).map((m) => m.label),
      domainName: index.domainName(e),
    }));

  const risks = apps
    .filter((a) => a.health === 'act' || a.health === 'watch')
    .sort(
      (a, b) =>
        (a.health === 'act' ? -1 : 1) - (b.health === 'act' ? -1 : 1) || costOf(b) - costOf(a),
    )
    .slice(0, 10)
    .map((a) => ({
      ...index.summary(a),
      reasons: a.healthReasons,
      domainName: index.domainName(a),
      cost: costOf(a),
    }));

  const horizon = addDaysIso(at, 365);
  const eol = org
    .filter(
      (t) =>
        t.type === 'technology' &&
        typeof t.attributes.eol_date === 'string' &&
        (t.attributes.eol_date as string) <= horizon,
    )
    .map((t) => ({
      id: t.id,
      name: t.name,
      eolDate: t.attributes.eol_date as string,
      past: ['ended', 'extendable'].includes(
        supportStatus(
          t.attributes.eol_date as string,
          t.attributes.extended_support_date as string | undefined,
          at,
          t.attributes.extended_support === true,
        ) ?? '',
      ),
      extendedDate: (t.attributes.extended_support_date as string) ?? null,
      onExtended: t.attributes.extended_support === true,
      apps: index
        .sources(t.id, 'uses')
        .filter((a) => a.type === 'application' && alive(a))
        .map((a) => ({ id: a.id, name: a.name })),
    }))
    .sort((a, b) => a.eolDate.localeCompare(b.eolDate));

  const initiatives = org
    .filter((e) => e.type === 'initiative')
    .map((i) => ({
      id: i.id,
      name: i.name,
      status: (i.attributes.status as string) ?? null,
      start: (i.attributes.start_date as string) ?? null,
      end: (i.attributes.end_date as string) ?? null,
      progress: i.attributes.progress === undefined ? null : Number(i.attributes.progress),
      budget: i.attributes.budget === undefined ? null : Number(i.attributes.budget),
      impacts: index.outgoing(i.id, 'impacts').length,
    }))
    .sort((a, b) => (a.start ?? '9999').localeCompare(b.start ?? '9999'));

  const caps = org.filter((e) => e.type === 'capability');
  const leafOrAll = caps;
  const withoutApps = leafOrAll
    .filter(
      (c) => !index.children.get(c.id)?.length && index.sources(c.id, 'supports').length === 0,
    )
    .map((c) => ({ id: c.id, name: c.name }));
  const overlaps = caps
    .map((c) => ({
      c,
      apps: index.sources(c.id, 'supports').filter((a) => a.type === 'application' && alive(a)),
    }))
    .filter((x) => x.apps.length >= 3)
    .map((x) => ({ id: x.c.id, name: x.c.name, apps: x.apps.map((a) => a.name) }))
    .sort((a, b) => b.apps.length - a.apps.length);
  const costByCapability = caps
    .filter((c) => !c.parentId)
    .map((c) => {
      const ids = [c.id, ...index.descendants(c.id)];
      const appsHealth = ids.flatMap((id) => index.sources(id, 'supports').map((a) => a.health));
      return {
        id: c.id,
        name: c.name,
        cost: capabilityCost(index, c.id),
        health: worst(appsHealth),
      };
    })
    .sort((a, b) => b.cost - a.cost);

  const techs = org.filter((e) => e.type === 'technology');
  const byRadar: Record<string, number> = {};
  for (const t of techs) {
    const r = (t.attributes.radar as string) ?? 'unrated';
    byRadar[r] = (byRadar[r] ?? 0) + 1;
  }

  const supportScope = org.filter((e) => needsSupportDates(e) && alive(e));
  const completeness: Completeness = {
    cost: {
      known: apps.filter((a) => appCost(index, a.id, at).known).length,
      total: apps.length,
      estimated: Math.round(costs.estimated),
      viaContracts: Math.round(costs.viaContracts),
      unallocated: Math.round(costs.unallocated),
    },
    integrations: {
      mapped: apps.filter((a) => hasIntegrations(index, a)).length,
      standalone: apps.filter((a) => a.attributes.standalone === true && !hasIntegrations(index, a))
        .length,
      total: apps.length,
    },
    support: {
      known: supportScope.filter((e) => typeof e.attributes.eol_date === 'string').length,
      total: supportScope.length,
    },
  };

  const myServices = ctx.teamIds.length
    ? org
        .filter(
          (e) =>
            (e.type === 'application' || e.type === 'interface') &&
            index.targets(e.id, 'owned_by').some((t) => ctx.teamIds.includes(t.id)),
        )
        .map((e) => ({
          ...index.summary(e),
          domainName: index.domainName(e),
          dependsOn: index.outgoing(e.id, 'depends_on').length,
          usedBy: index.incoming(e.id, 'depends_on').length,
          reasons: e.healthReasons,
          standards: index.outgoing(e.id, 'governed_by').length,
        }))
    : [];

  return {
    generatedAt: new Date().toISOString(),
    at,
    counts,
    applications: {
      total: apps.length,
      cost: Math.round(costs.total),
      health,
      byLifecycle,
      byTime,
      byHosting,
      byDomain: [...byDomain.values()].sort((a, b) => b.cost - a.cost),
      fitScatter: apps
        .filter((a) => a.attributes.business_fit && a.attributes.technical_fit)
        .map((a) => ({
          id: a.id,
          name: a.name,
          business: Number(a.attributes.business_fit),
          technical: Number(a.attributes.technical_fit),
          cost: costOf(a),
          time: (a.attributes.time as string) ?? null,
        })),
    },
    quality: {
      average,
      complete: scored.filter((e) => e.quality >= 100).length,
      total: scored.length,
      gaps,
    },
    risks,
    eol,
    initiatives,
    capabilities: { total: caps.length, withoutApps, overlaps, costByCapability },
    technology: { total: techs.length, byRadar },
    completeness,
    myServices,
  };
}
