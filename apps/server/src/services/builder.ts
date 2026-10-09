import { randomUUID } from 'node:crypto';
import { withScope } from '@atrium/db';
import {
  type ChangeOp,
  type CreateElementInput,
  type Element,
  type ElementType,
  normalizeName,
  type Relation,
  type RelationType,
  type UpdateElementInput,
} from '@atrium/schema';
import { actorName, type RequestContext } from '../auth/context';
import { applyChangeToBase, openChangeset, recordChange, scenarioWorkset } from './changesets';
import type { Deps } from './deps';
import { refreshDerived } from './derived';
import { applyPatch, autofillNew, validateRelation } from './model';
import { ModelIndex } from './model-index';
import { bestMatch } from './search';
import type { ResolvedState } from './store';

interface PendingChange {
  op: ChangeOp;
  entity: 'element' | 'relation';
  id: string;
  before: object | null;
  after: object | null;
}

export interface CommitOptions {
  kind: 'direct' | 'suggestion' | 'import' | 'sync' | 'pack' | 'scenario' | 'research';
  mode: 'direct' | 'suggestion' | 'scenario';
  title: string;
  description?: string;
  scenarioId?: string;
}

/**
 * Builds a set of related changes in memory (create a service, link it to its dependencies,
 * add its technologies…) and commits them as one change set: applied directly, sent for
 * review, or added to a scenario. Later steps can refer to elements created by earlier ones.
 */
export class ChangeBuilder {
  readonly changes: PendingChange[] = [];
  readonly warnings: string[] = [];
  private elements: Map<string, Element>;
  private relations: Map<string, Relation>;
  private idx: ModelIndex | null = null;

  constructor(
    private deps: Deps,
    private ctx: RequestContext,
    state: ResolvedState,
  ) {
    this.elements = new Map(state.elements);
    this.relations = new Map(state.relations);
  }

  get index(): ModelIndex {
    this.idx ??= new ModelIndex({ elements: this.elements, relations: this.relations });
    return this.idx;
  }

  private dirty() {
    this.idx = null;
  }

  get(id: string) {
    return this.elements.get(id);
  }

  /** Finds an element by id, key or (fuzzy) name. */
  find(types: ElementType[], ref: string | null | undefined): Element | undefined {
    if (!ref) return undefined;
    const direct = this.elements.get(ref);
    if (direct && types.includes(direct.type)) return direct;
    for (const t of types) {
      const byKey = this.index.byKey(t, ref);
      if (byKey) return byKey;
    }
    const n = normalizeName(ref);
    const exact = [...this.elements.values()].find(
      (e) => types.includes(e.type) && normalizeName(e.name) === n,
    );
    return exact ?? bestMatch(this.index, ref, types);
  }

  async create(input: CreateElementInput, extra: Partial<Element> = {}): Promise<Element> {
    const el = await autofillNew(this.deps, this.ctx, input, this.index, extra);
    this.elements.set(el.id, el);
    this.changes.push({ op: 'create', entity: 'element', id: el.id, before: null, after: el });
    this.dirty();
    return el;
  }

  update(id: string, patch: UpdateElementInput): Element | null {
    const current = this.elements.get(id);
    if (!current) return null;
    const next = {
      ...applyPatch(current, patch),
      updatedAt: new Date().toISOString(),
      updatedBy: actorName(this.ctx),
    };
    if (
      JSON.stringify({ ...next, updatedAt: '', updatedBy: '' }) ===
      JSON.stringify({ ...current, updatedAt: '', updatedBy: '' })
    )
      return current;
    const existing = this.changes.find((c) => c.entity === 'element' && c.id === id);
    if (existing) existing.after = next;
    else this.changes.push({ op: 'update', entity: 'element', id, before: current, after: next });
    this.elements.set(id, next);
    this.dirty();
    return next;
  }

  remove(id: string) {
    const current = this.elements.get(id);
    if (!current) return;
    for (const r of [...this.index.outgoing(id), ...this.index.incoming(id)]) this.unlink(r.id);
    this.changes.push({ op: 'delete', entity: 'element', id, before: current, after: null });
    this.elements.delete(id);
    this.dirty();
  }

  link(
    type: RelationType,
    sourceId: string,
    targetId: string,
    attributes: Record<string, unknown> = {},
  ): Relation | null {
    const exists = this.index.outgoing(sourceId, type).find((r) => r.targetId === targetId);
    if (exists) return exists;
    try {
      validateRelation({ type, sourceId, targetId }, this.index);
    } catch (e) {
      this.warnings.push((e as Error).message);
      return null;
    }
    const rel: Relation = {
      id: randomUUID(),
      type,
      sourceId,
      targetId,
      attributes,
      createdAt: new Date().toISOString(),
      createdBy: actorName(this.ctx),
    };
    this.relations.set(rel.id, rel);
    this.changes.push({ op: 'create', entity: 'relation', id: rel.id, before: null, after: rel });
    this.dirty();
    return rel;
  }

  unlink(relationId: string) {
    const rel = this.relations.get(relationId);
    if (!rel) return;
    this.relations.delete(relationId);
    this.changes.push({
      op: 'delete',
      entity: 'relation',
      id: relationId,
      before: rel,
      after: null,
    });
    this.dirty();
  }

  async commit(
    o: CommitOptions,
  ): Promise<{ changesetId: string | null; applied: boolean; count: number }> {
    if (!this.changes.length) return { changesetId: null, applied: false, count: 0 };
    const by = actorName(this.ctx);
    const id = await withScope(this.deps.sql, this.ctx.scope, async (tx) => {
      const csId =
        o.mode === 'scenario' && o.scenarioId
          ? await scenarioWorkset(tx, this.ctx, o.scenarioId)
          : await openChangeset(tx, this.ctx, {
              kind: o.kind === 'scenario' ? 'suggestion' : o.kind,
              status: o.mode === 'direct' ? 'applied' : 'open',
              title: o.title,
              description: o.description,
            });
      const touched: string[] = [];
      for (const c of this.changes) {
        await recordChange(
          tx,
          csId,
          c.op,
          c.entity,
          c.id,
          c.before,
          c.after,
          o.mode === 'scenario',
        );
        if (o.mode === 'direct') {
          const res = await applyChangeToBase(
            tx,
            { op: c.op, entity: c.entity, entityId: c.id, before: c.before, after: c.after },
            by,
          );
          touched.push(...res.touched);
        }
      }
      if (o.mode === 'direct') await refreshDerived(tx, touched);
      return csId;
    });
    if (o.mode === 'direct') {
      this.deps.store.bump();
      this.deps.hub.broadcast({ type: 'model.changed', ids: [], by });
    } else if (o.mode === 'scenario') {
      this.deps.hub.broadcast({ type: 'model.changed', ids: [], by, scenarioId: o.scenarioId });
    } else {
      this.deps.hub.broadcast({
        type: 'changeset.updated',
        id,
        status: 'open',
        title: o.title,
        by,
      });
    }
    return { changesetId: id, applied: o.mode === 'direct', count: this.changes.length };
  }
}
