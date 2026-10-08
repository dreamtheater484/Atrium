import type { Db } from '@atrium/db';

export interface WorkspaceSettings {
  name: string;
  sampleLoaded: boolean;
  onboardedAt: string | null;
  /** In team mode, should architects' edits outside their own domains need review? */
  reviewOutsideOwnDomain: boolean;
}

const DEFAULTS: WorkspaceSettings = {
  name: 'Atrium',
  sampleLoaded: false,
  onboardedAt: null,
  reviewOutsideOwnDomain: true,
};

export async function getSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const [row] = await db`select value from settings where key = ${key}`;
  if (!row) return fallback;
  const value = row.value as unknown;
  // Objects get defaults for keys added later; lists and plain values are returned as stored.
  return value && typeof value === 'object' && !Array.isArray(value) && !Array.isArray(fallback)
    ? ({ ...fallback, ...(value as object) } as T)
    : (value as T);
}

export async function setSetting(db: Db, key: string, value: unknown): Promise<void> {
  await db`
    insert into settings (key, value) values (${key}, ${db.json(value as never)})
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

export async function getWorkspace(db: Db, defaultName: string): Promise<WorkspaceSettings> {
  return getSetting(db, 'workspace', { ...DEFAULTS, name: defaultName });
}

export async function updateWorkspace(
  db: Db,
  defaultName: string,
  patch: Partial<WorkspaceSettings>,
) {
  const current = await getWorkspace(db, defaultName);
  const next = { ...current, ...patch };
  await setSetting(db, 'workspace', next);
  return next;
}
