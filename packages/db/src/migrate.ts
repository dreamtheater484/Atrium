import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from './client';

export function migrationsDir(): string {
  // Works from source (src/) and from the bundled server (dist/ with migrations copied next to it).
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.ATRIUM_MIGRATIONS_DIR,
    join(here, '..', 'migrations'),
    join(here, 'migrations'),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      readdirSync(c);
      return c;
    } catch {
      // try next
    }
  }
  throw new Error(`Migrations folder not found (looked in ${candidates.join(', ')})`);
}

export interface MigrationResult {
  applied: string[];
  current: string | null;
}

/** Applies pending SQL migrations in order, each in its own transaction. */
export async function migrate(sql: Sql, dir = migrationsDir()): Promise<MigrationResult> {
  await sql`create table if not exists schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )`;
  // Only one Atrium instance migrates at a time.
  await sql`select pg_advisory_lock(727274)`;
  try {
    const done = new Set(
      (await sql<{ version: string }[]>`select version from schema_migrations`).map(
        (r) => r.version,
      ),
    );
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const applied: string[] = [];
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (done.has(version)) continue;
      const body = readFileSync(join(dir, file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (version) values (${version})`;
      });
      applied.push(version);
    }
    const last = files.at(-1)?.replace(/\.sql$/, '') ?? null;
    return { applied, current: last };
  } finally {
    await sql`select pg_advisory_unlock(727274)`;
  }
}
