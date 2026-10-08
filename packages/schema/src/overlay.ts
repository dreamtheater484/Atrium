import type { Change } from './changes';
import type { Element, Relation } from './element';

export interface ModelSnapshot {
  elements: Map<string, Element>;
  relations: Map<string, Relation>;
}

export interface OverlayMarks {
  added: Set<string>;
  changed: Set<string>;
  removed: Set<string>;
}

/**
 * Applies scenario changes on top of a snapshot of today's model. Changes are
 * replayed in order; the latest state of an entity wins.
 */
export function applyOverlay(
  base: ModelSnapshot,
  changes: Change[],
): ModelSnapshot & { marks: OverlayMarks } {
  const elements = new Map(base.elements);
  const relations = new Map(base.relations);
  const marks: OverlayMarks = { added: new Set(), changed: new Set(), removed: new Set() };
  const ordered = [...changes].sort((a, b) =>
    a.createdAt === b.createdAt ? a.seq - b.seq : a.createdAt < b.createdAt ? -1 : 1,
  );
  for (const ch of ordered) {
    const target = ch.entity === 'element' ? elements : relations;
    if (ch.op === 'delete') {
      if (target.has(ch.entityId)) {
        target.delete(ch.entityId);
        if (marks.added.has(ch.entityId)) marks.added.delete(ch.entityId);
        else marks.removed.add(ch.entityId);
      }
      continue;
    }
    const after = ch.after as unknown as Element & Relation;
    if (!after) continue;
    const existed = target.has(ch.entityId);
    target.set(ch.entityId, after as never);
    if (ch.op === 'create' && !existed) marks.added.add(ch.entityId);
    else if (!marks.added.has(ch.entityId)) marks.changed.add(ch.entityId);
  }
  // Drop relations whose ends no longer exist.
  for (const [id, r] of relations) {
    if (!elements.has(r.sourceId) || !elements.has(r.targetId)) relations.delete(id);
  }
  return { elements, relations, marks };
}

export type FieldDiff = { field: string; before: unknown; after: unknown };

/** Field-level difference between two versions of an element. */
export function diffElement(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): FieldDiff[] {
  if (!before || !after) return [];
  const fields = [
    'name',
    'key',
    'description',
    'domainId',
    'parentId',
    'owner',
    'lifecycle',
    'lifecycleDates',
    'classification',
    'tags',
  ];
  const diffs: FieldDiff[] = [];
  for (const f of fields) {
    if (JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null)) {
      diffs.push({ field: f, before: before[f] ?? null, after: after[f] ?? null });
    }
  }
  const ba = (before.attributes ?? {}) as Record<string, unknown>;
  const aa = (after.attributes ?? {}) as Record<string, unknown>;
  for (const k of new Set([...Object.keys(ba), ...Object.keys(aa)])) {
    if (JSON.stringify(ba[k] ?? null) !== JSON.stringify(aa[k] ?? null)) {
      diffs.push({ field: `attributes.${k}`, before: ba[k] ?? null, after: aa[k] ?? null });
    }
  }
  return diffs;
}
