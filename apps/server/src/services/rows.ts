import type { Db } from '@atrium/db';
import type { Element, Relation } from '@atrium/schema';

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? ''));

export const ELEMENT_COLUMNS = `id, type, key, name, description, domain_id, parent_id, owner, lifecycle,
  lifecycle_dates, classification, attributes, tags, external_ids, source, layer, pack, quality,
  health, health_reasons, suggestions, created_at, created_by, updated_at, updated_by, version`;

// biome-ignore lint/suspicious/noExplicitAny: database rows
export function rowToElement(r: any): Element {
  return {
    id: r.id,
    type: r.type,
    key: r.key ?? null,
    name: r.name,
    description: r.description ?? '',
    domainId: r.domainId ?? null,
    parentId: r.parentId ?? null,
    owner: r.owner ?? null,
    lifecycle: r.lifecycle ?? null,
    lifecycleDates: r.lifecycleDates ?? {},
    classification: r.classification,
    attributes: r.attributes ?? {},
    tags: r.tags ?? [],
    externalIds: r.externalIds ?? {},
    source: r.source ?? null,
    layer: r.layer,
    pack: r.pack ?? null,
    quality: r.quality ?? 0,
    health: r.health ?? null,
    healthReasons: r.healthReasons ?? [],
    suggestions: r.suggestions ?? {},
    createdAt: iso(r.createdAt),
    createdBy: r.createdBy ?? null,
    updatedAt: iso(r.updatedAt),
    updatedBy: r.updatedBy ?? null,
    version: r.version ?? 1,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: database rows
export function rowToRelation(r: any): Relation {
  return {
    id: r.id,
    type: r.type,
    sourceId: r.sourceId,
    targetId: r.targetId,
    attributes: r.attributes ?? {},
    createdAt: iso(r.createdAt),
    createdBy: r.createdBy ?? null,
  };
}

export async function selectElement(db: Db, id: string): Promise<Element | null> {
  const rows = await db.unsafe(
    `select ${ELEMENT_COLUMNS} from elements where id = $1 and deleted_at is null`,
    [id],
  );
  return rows[0] ? rowToElement(rows[0]) : null;
}

export async function insertElementRow(db: Db, el: Element): Promise<void> {
  await db`
    insert into elements (
      id, type, key, name, description, domain_id, parent_id, owner, lifecycle, lifecycle_dates,
      classification, attributes, tags, external_ids, source, layer, pack, quality, health,
      health_reasons, suggestions, created_at, created_by, updated_at, updated_by, version
    ) values (
      ${el.id}, ${el.type}, ${el.key}, ${el.name}, ${el.description}, ${el.domainId}, ${el.parentId},
      ${el.owner}, ${el.lifecycle}, ${db.json(el.lifecycleDates as never)}, ${el.classification},
      ${db.json(el.attributes as never)}, ${el.tags}::text[], ${db.json(el.externalIds as never)},
      ${el.source}, ${el.layer}, ${el.pack}, ${el.quality}, ${el.health}, ${el.healthReasons}::text[],
      ${db.json(el.suggestions as never)}, ${el.createdAt}, ${el.createdBy}, ${el.updatedAt},
      ${el.updatedBy}, ${el.version}
    )
    on conflict (id) do update set
      deleted_at = null, type = excluded.type, key = excluded.key, name = excluded.name,
      description = excluded.description, domain_id = excluded.domain_id, parent_id = excluded.parent_id,
      owner = excluded.owner, lifecycle = excluded.lifecycle, lifecycle_dates = excluded.lifecycle_dates,
      classification = excluded.classification, attributes = excluded.attributes, tags = excluded.tags,
      external_ids = excluded.external_ids, quality = excluded.quality, health = excluded.health,
      health_reasons = excluded.health_reasons, suggestions = excluded.suggestions,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by, version = elements.version + 1`;
}

export async function updateElementRow(db: Db, el: Element): Promise<void> {
  await db`
    update elements set
      key = ${el.key}, name = ${el.name}, description = ${el.description}, domain_id = ${el.domainId},
      parent_id = ${el.parentId}, owner = ${el.owner}, lifecycle = ${el.lifecycle},
      lifecycle_dates = ${db.json(el.lifecycleDates as never)}, classification = ${el.classification},
      attributes = ${db.json(el.attributes as never)}, tags = ${el.tags}::text[],
      external_ids = ${db.json(el.externalIds as never)}, quality = ${el.quality}, health = ${el.health},
      health_reasons = ${el.healthReasons}::text[], suggestions = ${db.json(el.suggestions as never)},
      updated_at = ${el.updatedAt}, updated_by = ${el.updatedBy}, version = version + 1
    where id = ${el.id}`;
}

export async function softDeleteElementRow(db: Db, id: string, by: string): Promise<void> {
  await db`update elements set deleted_at = now(), updated_by = ${by} where id = ${id}`;
}

export async function insertRelationRow(db: Db, r: Relation): Promise<void> {
  await db`
    insert into relations (id, type, source_id, target_id, attributes, created_at, created_by)
    values (${r.id}, ${r.type}, ${r.sourceId}, ${r.targetId}, ${db.json(r.attributes as never)},
            ${r.createdAt}, ${r.createdBy})
    on conflict (id) do update set deleted_at = null, attributes = excluded.attributes`;
}

export async function softDeleteRelationRow(db: Db, id: string): Promise<void> {
  await db`update relations set deleted_at = now() where id = ${id}`;
}
