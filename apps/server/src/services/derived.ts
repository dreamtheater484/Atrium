import type { Db } from '@atrium/db';
import type { Element } from '@atrium/schema';
import { ModelIndex } from './model-index';
import { ELEMENT_COLUMNS, rowToElement, rowToRelation } from './rows';
import { loadSnapshot } from './store';

async function persist(
  db: Db,
  el: Element,
  d: Pick<Element, 'quality' | 'health' | 'healthReasons'>,
) {
  if (
    d.quality === el.quality &&
    d.health === el.health &&
    JSON.stringify(d.healthReasons) === JSON.stringify(el.healthReasons)
  ) {
    return false;
  }
  await db`update elements set quality = ${d.quality}, health = ${d.health},
             health_reasons = ${d.healthReasons}::text[] where id = ${el.id}`;
  return true;
}

/**
 * Recomputes quality and health for the given elements, plus every application running on
 * a touched technology (an end-of-life date change ripples to its users).
 */
export async function refreshDerived(db: Db, ids: Array<string | null | undefined>): Promise<void> {
  const uniq = [...new Set(ids.filter(Boolean) as string[])];
  if (!uniq.length) return;
  const users = await db`
    select distinct r.source_id as id from relations r join elements t on t.id = r.target_id
    where r.type = 'uses' and r.deleted_at is null and t.type = 'technology' and t.id = any(${uniq}::uuid[])`;
  const all = [...new Set([...uniq, ...users.map((u) => u.id as string)])];
  const els = (
    await db.unsafe(
      `select ${ELEMENT_COLUMNS} from elements where id = any($1::uuid[]) and deleted_at is null`,
      [all],
    )
  ).map(rowToElement);
  const rels = (
    await db`select id, type, source_id, target_id, attributes, created_at, created_by from relations
             where deleted_at is null and (source_id = any(${all}::uuid[]) or target_id = any(${all}::uuid[]))`
  ).map(rowToRelation);
  const techIds = [...new Set(rels.filter((r) => r.type === 'uses').map((r) => r.targetId))];
  const techs = techIds.length
    ? (
        await db.unsafe(
          `select ${ELEMENT_COLUMNS} from elements where id = any($1::uuid[]) and deleted_at is null`,
          [techIds],
        )
      ).map(rowToElement)
    : [];
  const index = new ModelIndex({
    elements: new Map([...techs, ...els].map((e) => [e.id, e])),
    relations: new Map(rels.map((r) => [r.id, r])),
  });
  for (const el of els) await persist(db, el, index.derive(el));
}

/** Recomputes derived fields for the whole model (after imports, at startup). */
export async function refreshAllDerived(db: Db): Promise<number> {
  const snapshot = await loadSnapshot(db);
  const index = new ModelIndex(snapshot);
  let changed = 0;
  for (const el of snapshot.elements.values()) {
    if (await persist(db, el, index.derive(el))) changed++;
  }
  return changed;
}
