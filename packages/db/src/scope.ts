import type { Sql, Tx } from './client';

/** What a caller may see. Users see everything; agent and CI tokens are limited. */
export interface AccessScope {
  /** Highest classification rank visible: 0 public … 3 restricted. */
  maxRank: number;
  /** Domain ids the caller is limited to; empty means all domains. */
  domainIds: string[];
}

export const FULL_SCOPE: AccessScope = { maxRank: 3, domainIds: [] };

/**
 * Runs `fn` in a transaction as the restricted role `atrium_app`, so Postgres
 * row-level security enforces the scope as well as the application code.
 */
export async function withScope<T>(sql: Sql, scope: AccessScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx`set local role atrium_app`;
    await tx`select
      set_config('atrium.max_rank', ${String(scope.maxRank)}, true),
      set_config('atrium.domains', ${scope.domainIds.join(',')}, true)`;
    return fn(tx);
  })) as T;
}

/** Runs `fn` in a transaction with full access (system jobs, migrations, admin tasks). */
export async function asSystem<T>(sql: Sql, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withScope(sql, FULL_SCOPE, fn);
}
