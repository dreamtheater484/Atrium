import { asSystem } from '@atrium/db';
import { badRequest, conflict } from '../http/errors';
import type { Deps } from './deps';
import { refreshAllDerived } from './derived';
import { getWorkspace, setSetting } from './workspace';

export const BUNDLE_FORMAT = 'atrium-bundle';
export const BUNDLE_VERSION = 1;

const TABLES = [
  'elements',
  'relations',
  'scenarios',
  'changesets',
  'changes',
  'comments',
  'dashboards',
  'saved_views',
  'reference_packs',
  'import_mappings',
] as const;

/**
 * Everything needed to recreate the model elsewhere: the laptop → team server move,
 * backups, and handing a model to a colleague. People, sessions and tokens are left out on purpose.
 */
export async function exportBundle(deps: Deps) {
  return asSystem(deps.sql, async (tx) => {
    const out: Record<string, unknown> = {
      format: BUNDLE_FORMAT,
      version: BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      workspace: await getWorkspace(tx, deps.config.workspaceName),
    };
    for (const t of TABLES) {
      // Raw rows (snake_case) so a restore is a straight insert.
      out[t] = await tx
        .unsafe(
          `select * from ${t}${t === 'elements' || t === 'relations' ? ' where deleted_at is null' : ''}`,
        )
        .then((rows) =>
          rows.map((r) =>
            Object.fromEntries(
              Object.entries(r).map(([k, v]) => [
                k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
                v,
              ]),
            ),
          ),
        );
    }
    return out;
  });
}

export async function restoreBundle(deps: Deps, bundle: Record<string, unknown>) {
  if (bundle.format !== BUNDLE_FORMAT) throw badRequest("That isn't an Atrium backup file.");
  if (Number(bundle.version) > BUNDLE_VERSION)
    throw badRequest('This backup comes from a newer Atrium. Update this installation first.');
  const counts = await asSystem(deps.sql, async (tx) => {
    const [{ n }] =
      (await tx`select count(*)::int as n from elements where deleted_at is null and layer = 'org'`) as unknown as [
        { n: number },
      ];
    if (n > 0)
      throw conflict(
        'Restore needs an empty workspace. Clear it first (Settings → Data and backup), or import into a fresh installation.',
      );
    const counts: Record<string, number> = {};
    const columns = async (table: string) =>
      new Set(
        (
          await tx`select column_name from information_schema.columns where table_name = ${table}`
        ).map((r) => r.columnName as string),
      );
    for (const t of TABLES) {
      const rows = (bundle[t] as Array<Record<string, unknown>> | undefined) ?? [];
      if (!rows.length) continue;
      const allowed = await columns(t);
      const generated = new Set(['classification_rank', 'search']);
      // Elements reference each other (parent, domain): insert without those links first.
      for (const raw of rows) {
        const row = Object.fromEntries(
          Object.entries(raw)
            .filter(([k]) => allowed.has(k) && !generated.has(k))
            .map(([k, v]) => {
              if (t === 'changesets' && ['author_id', 'reviewer_id', 'author_token_id'].includes(k))
                return [k, null];
              if ((t === 'dashboards' || t === 'saved_views') && k === 'owner_id') return [k, null];
              if (t === 'comments' && k === 'author_id') return [k, null];
              if (t === 'elements' && (k === 'parent_id' || k === 'domain_id')) return [k, null];
              return [k, v];
            }),
        );
        const keys = Object.keys(row);
        const values = keys.map((k) => {
          const v = row[k];
          return v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)
            ? JSON.stringify(v)
            : v;
        });
        await tx.unsafe(
          `insert into ${t} (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) on conflict do nothing`,
          values as never[],
        );
      }
      counts[t] = rows.length;
    }
    // Now restore the element hierarchy and domains.
    for (const raw of (bundle.elements as Array<Record<string, unknown>> | undefined) ?? []) {
      if (raw.parent_id || raw.domain_id) {
        await tx`update elements set parent_id = ${(raw.parent_id as string) ?? null}, domain_id = ${(raw.domain_id as string) ?? null} where id = ${raw.id as string}`;
      }
    }
    if (bundle.workspace) await setSetting(tx, 'workspace', bundle.workspace);
    await refreshAllDerived(tx);
    return counts;
  });
  deps.store.bump();
  deps.hub.broadcast({ type: 'model.changed', ids: [], by: 'Restore' });
  return { elements: counts.elements ?? 0, relations: counts.relations ?? 0, counts };
}
