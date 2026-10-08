import { type AccessScope, type Db, type Sql, withScope } from '@atrium/db';
import {
  applyOverlay,
  type Change,
  classificationRank,
  type Element,
  type ModelSnapshot,
  type OverlayMarks,
  type Relation,
} from '@atrium/schema';
import type { RequestContext } from '../auth/context';
import { ELEMENT_COLUMNS, rowToElement, rowToRelation } from './rows';

interface CacheEntry {
  version: number;
  snapshot: ModelSnapshot;
}

/**
 * Keeps an in-memory snapshot of the model per access scope. Views, search and
 * dashboards read from it, which keeps them fast and makes scenario overlays cheap.
 * Every write bumps the version so the next read reloads.
 */
export class ModelStore {
  private version = 0;
  private cache = new Map<string, CacheEntry>();
  private pending = new Map<string, Promise<ModelSnapshot>>();
  private listeners = new Set<() => void>();

  constructor(private sql: Sql) {}

  get currentVersion() {
    return this.version;
  }

  bump() {
    this.version++;
    for (const l of this.listeners) l();
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async snapshot(scope: AccessScope): Promise<ModelSnapshot> {
    const key = `${scope.maxRank}|${[...scope.domainIds].sort().join(',')}`;
    const hit = this.cache.get(key);
    if (hit && hit.version === this.version) return hit.snapshot;
    const inflight = this.pending.get(key);
    if (inflight) return inflight;
    const version = this.version;
    const p = withScope(this.sql, scope, (tx) => loadSnapshot(tx))
      .then((snapshot) => {
        this.cache.set(key, { version, snapshot });
        return snapshot;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, p);
    return p;
  }
}

export async function loadSnapshot(db: Db): Promise<ModelSnapshot> {
  const [els, rels] = await Promise.all([
    db.unsafe(`select ${ELEMENT_COLUMNS} from elements where deleted_at is null`),
    db`select id, type, source_id, target_id, attributes, created_at, created_by
       from relations where deleted_at is null`,
  ]);
  const elements = new Map<string, Element>();
  for (const r of els) {
    const e = rowToElement(r);
    elements.set(e.id, e);
  }
  const relations = new Map<string, Relation>();
  for (const r of rels) {
    const rel = rowToRelation(r);
    relations.set(rel.id, rel);
  }
  return { elements, relations };
}

/** Which version of the model to show. */
export interface StateRequest {
  /** Scenario id; omitted means today. */
  scenarioId?: string | null;
  /** Include the caller's own unsubmitted suggestions (default true). */
  includeDrafts?: boolean;
}

export interface ResolvedState extends ModelSnapshot {
  marks: OverlayMarks;
  scenarioId: string | null;
}

// biome-ignore lint/suspicious/noExplicitAny: database rows
export function rowToChange(r: any): Change {
  return {
    id: r.id,
    changesetId: r.changesetId,
    seq: r.seq,
    op: r.op,
    entity: r.entity,
    entityId: r.entityId,
    before: r.before ?? null,
    after: r.after ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  };
}

function visibleTo(scope: AccessScope, el: Record<string, unknown> | null): boolean {
  if (!el) return true;
  const rank = classificationRank((el.classification as never) ?? 'internal');
  if (rank > scope.maxRank) return false;
  if (scope.domainIds.length && el.domainId && !scope.domainIds.includes(el.domainId as string)) {
    return false;
  }
  return true;
}

/** Today's model, or a scenario, as the caller is allowed to see it. */
export async function resolveState(
  store: ModelStore,
  db: Db,
  ctx: RequestContext,
  req: StateRequest = {},
): Promise<ResolvedState> {
  const base = await store.snapshot(ctx.scope);
  let changes: Change[] = [];
  if (req.scenarioId) {
    const rows = await db`
      select c.* from changes c join changesets s on s.id = c.changeset_id
      where s.scenario_id = ${req.scenarioId} and s.kind = 'scenario' and s.status in ('draft', 'open')
      order by c.created_at, c.seq`;
    changes = rows.map(rowToChange);
  } else if (req.includeDrafts !== false && ctx.userId && ctx.kind === 'user') {
    const rows = await db`
      select c.* from changes c join changesets s on s.id = c.changeset_id
      where s.author_id = ${ctx.userId} and s.kind = 'suggestion' and s.status = 'draft'
      order by c.created_at, c.seq`;
    changes = rows.map(rowToChange);
  }
  if (ctx.kind === 'token') {
    changes = changes.filter((c) => c.entity === 'relation' || visibleTo(ctx.scope, c.after));
  }
  if (changes.length === 0) {
    return {
      elements: base.elements,
      relations: base.relations,
      marks: { added: new Set(), changed: new Set(), removed: new Set() },
      scenarioId: req.scenarioId ?? null,
    };
  }
  const result = applyOverlay(base, changes);
  return { ...result, scenarioId: req.scenarioId ?? null };
}
