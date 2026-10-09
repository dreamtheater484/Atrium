import { randomUUID } from 'node:crypto';
import { classificationRank, type Element, lifecycleAt, todayIso } from '@atrium/schema';
import type { RequestContext } from '../auth/context';
import { forbidden } from '../http/errors';
import { audit } from './audit';
import { ChangeBuilder } from './builder';
import type { Deps } from './deps';
import { canReview } from './policy';
import type { LifecycleFinding, ResearchQuery } from './researchers';
import { needsSupportDates } from './stats';
import { resolveState } from './store';

/** Dates found by research are checked again after this many days. */
const STALE_DAYS = 180;
/** A product nothing was found for is not looked up again for this many days. */
const RETRY_DAYS = 30;
const CONCURRENCY = 3;

export interface ResearchCandidate {
  id: string;
  name: string;
  type: 'technology' | 'application';
  reason: 'missing' | 'stale';
}

export interface ResearchJob {
  id: string;
  status: 'running' | 'done' | 'failed';
  total: number;
  done: number;
  found: number;
  provider: string;
  startedAt: string;
  changesetId: string | null;
  error: string | null;
  items: Array<{ id: string; name: string; outcome: 'found' | 'not_found' | 'failed' | null }>;
}

/** Elements whose support dates could be researched, and those held back as too sensitive. */
export async function researchCandidates(deps: Deps, ctx: RequestContext) {
  const state = await resolveState(deps.store, deps.sql, ctx, {});
  const today = todayIso();
  const checks = new Map(
    (await deps.sql`select element_id, checked_at, outcome from lifecycle_checks`).map((r) => [
      r.element_id as string,
      r as { checked_at: Date; outcome: string },
    ]),
  );
  const daysAgo = (d: Date) => (Date.now() - new Date(d).getTime()) / 86_400_000;
  const maxRank = classificationRank(deps.config.aiMaxClassification);
  const candidates: Array<ResearchCandidate & { priority: number }> = [];
  let withheld = 0;
  // How many applications run on each technology.
  const users = new Map<string, number>();
  for (const r of state.relations.values())
    if (r.type === 'uses') users.set(r.targetId, (users.get(r.targetId) ?? 0) + 1);
  for (const e of state.elements.values()) {
    if (!needsSupportDates(e)) continue;
    const phase = lifecycleAt(e.lifecycle, e.lifecycleDates, today);
    if (phase === 'retired' || phase === 'not_yet') continue;
    const check = checks.get(e.id);
    const source = (e.attributes._eol as { source?: string } | undefined)?.source;
    let reason: ResearchCandidate['reason'] | null = null;
    if (!e.attributes.eol_date) {
      if (check?.outcome !== 'not_found' || daysAgo(check.checked_at) > RETRY_DAYS)
        reason = 'missing';
    } else if (source === 'research' && check && daysAgo(check.checked_at) > STALE_DAYS) {
      reason = 'stale';
    }
    if (!reason) continue;
    if (classificationRank(e.classification) > maxRank) {
      withheld++;
      continue;
    }
    candidates.push({
      id: e.id,
      name: e.name,
      type: e.type as ResearchCandidate['type'],
      reason,
      priority: priority(e, users),
    });
  }
  // Most important first, so a capped run covers what matters most.
  candidates.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
  return {
    provider: { name: deps.research.name, label: deps.research.label, live: deps.research.live },
    candidates: candidates.map(({ priority: _, ...c }) => c),
    withheld,
    limit: deps.config.researchLimit,
    maxClassification: deps.config.aiMaxClassification,
  };
}

const CRITICALITY_WEIGHT: Record<string, number> = {
  mission_critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Technologies first, weighted by how many applications run on them; then vendor applications
 * by business criticality and cost.
 */
function priority(e: Element, users: Map<string, number>): number {
  if (e.type === 'technology') return 1_000_000 + (users.get(e.id) ?? 0);
  const crit = CRITICALITY_WEIGHT[e.attributes.criticality as string] ?? 0;
  const cost = Number(e.attributes.annual_cost) || 0;
  return crit * 100_000 + Math.min(99_999, Math.round(cost / 1000));
}

const jobs = new Map<string, ResearchJob>();

export function researchJob(id: string): ResearchJob | undefined {
  return jobs.get(id);
}

function query(e: Element): ResearchQuery {
  const text = (k: string) =>
    typeof e.attributes[k] === 'string' ? (e.attributes[k] as string) : undefined;
  return {
    name: e.name,
    kind: e.type === 'technology' ? 'technology' : 'application',
    vendor: text('vendor'),
    product: text('product'),
    version: text('version'),
  };
}

/** endoflife.date first (free, exact); the AI provider only for what it doesn't know. */
async function lookup(
  deps: Deps,
  e: Element,
): Promise<{ finding: LifecycleFinding; by: string } | null> {
  const q = query(e);
  // endoflife.date lists technologies; matching application names against it gives false hits.
  const info = e.type === 'technology' ? await deps.eol.lookup(q.name, q.product, q.version) : null;
  if (info?.eolDate)
    return {
      by: 'endoflife.date',
      finding: {
        endOfSupport: info.eolDate,
        extendedSupport: info.extendedDate,
        supportModel: null,
        sourceUrl: `https://endoflife.date/${info.product}`,
        quote: `${info.product} ${info.cycle}: end of support ${info.eolDate}${info.extendedDate ? `, extended support until ${info.extendedDate}` : ''}`,
        confidence: 'high',
        note: null,
      },
    };
  const finding = await deps.research.research(q);
  return finding ? { finding, by: deps.research.label } : null;
}

/**
 * Looks up support dates in the background and sends what it finds for review as one
 * suggestion. Nothing changes in the model until a person approves it.
 */
export async function startResearch(
  deps: Deps,
  ctx: RequestContext,
  ids?: string[],
): Promise<ResearchJob> {
  if (!canReview(ctx)) throw forbidden('Only architects can start research.');
  const { candidates } = await researchCandidates(deps, ctx);
  const chosen = (ids ? candidates.filter((c) => ids.includes(c.id)) : candidates).slice(
    0,
    deps.config.researchLimit,
  );
  const job: ResearchJob = {
    id: randomUUID(),
    status: 'running',
    total: chosen.length,
    done: 0,
    found: 0,
    provider: deps.research.label,
    startedAt: new Date().toISOString(),
    changesetId: null,
    error: null,
    items: chosen.map((c) => ({ id: c.id, name: c.name, outcome: null })),
  };
  jobs.set(job.id, job);
  await audit(deps.sql, ctx, 'research.start', undefined, {
    items: chosen.length,
    provider: deps.research.label,
  });
  void run(deps, ctx, job).catch((e) => {
    job.status = 'failed';
    job.error = (e as Error).message;
  });
  return job;
}

async function run(deps: Deps, ctx: RequestContext, job: ResearchJob) {
  const state = await resolveState(deps.store, deps.sql, ctx, {});
  const results = new Map<string, { finding: LifecycleFinding; by: string }>();
  let authError: string | null = null;
  const queue = [...job.items];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const el = state.elements.get(item.id);
      let outcome: 'found' | 'not_found' | 'failed' = 'not_found';
      let detail: Record<string, unknown> = {};
      if (el && !authError) {
        try {
          const hit = await lookup(deps, el);
          if (hit) {
            results.set(el.id, hit);
            outcome = 'found';
            detail = { ...hit.finding };
          }
        } catch (e) {
          outcome = 'failed';
          const status = (e as { status?: number }).status;
          if (status === 401 || status === 403) authError = 'The AI provider rejected the API key.';
          detail = { error: (e as Error).message.slice(0, 300) };
        }
      } else if (authError) outcome = 'failed';
      item.outcome = outcome;
      job.done++;
      if (outcome === 'found') job.found++;
      await deps.sql`
        insert into lifecycle_checks (element_id, outcome, source, detail)
        values (${item.id}, ${outcome}, ${results.get(item.id)?.by ?? deps.research.label}, ${deps.sql.json(detail as never)})
        on conflict (element_id) do update set checked_at = now(), outcome = excluded.outcome,
          source = excluded.source, detail = excluded.detail`;
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (results.size) {
    // Build on the latest model, so edits made meanwhile are kept.
    const fresh = await resolveState(deps.store, deps.sql, ctx, {});
    const b = new ChangeBuilder(deps, ctx, fresh);
    const today = todayIso();
    for (const [id, { finding: f, by }] of results) {
      const el = fresh.elements.get(id);
      if (!el) continue;
      const attributes: Record<string, unknown> = {
        _eol: {
          source: by === 'endoflife.date' ? 'live' : 'research',
          by,
          url: f.sourceUrl,
          quote: f.quote,
          confidence: f.confidence,
          note: f.note,
          checkedAt: today,
          ...(f.extendedSupport ? { extended: true } : {}),
        },
      };
      if (f.endOfSupport) attributes.eol_date = f.endOfSupport;
      if (f.extendedSupport) attributes.extended_support_date = f.extendedSupport;
      if (el.type === 'technology' && f.supportModel && f.supportModel !== 'versioned')
        attributes.support_model = f.supportModel;
      b.update(id, { attributes: attributes as never });
    }
    const n = b.changes.length;
    const res = await b.commit({
      kind: 'research',
      mode: 'suggestion',
      title: `Support dates for ${n} item${n === 1 ? '' : 's'}`,
      description: `Found with ${deps.research.label === 'endoflife.date only' ? 'endoflife.date' : `endoflife.date and ${deps.research.label}`} on ${today}. Each change shows where the dates come from: check the sources before approving. Only product names, vendors and versions were looked up.`,
    });
    job.changesetId = res.changesetId;
  }
  job.status = authError && !results.size ? 'failed' : 'done';
  job.error = authError;
  // Keep finished jobs for an hour so the page can still show the outcome.
  setTimeout(() => jobs.delete(job.id), 3_600_000).unref();
}

/** The latest research check per element, for the inspector. */
export async function lastCheck(deps: Deps, id: string) {
  const [row] = await deps.sql`
    select checked_at, outcome, source from lifecycle_checks where element_id = ${id}`;
  return row
    ? {
        checkedAt: (row.checked_at as Date).toISOString(),
        outcome: row.outcome as string,
        source: row.source as string | null,
      }
    : null;
}
