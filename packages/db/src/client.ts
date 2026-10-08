import postgres from 'postgres';

export type Sql = postgres.Sql<Record<string, unknown>>;
export type Tx = postgres.TransactionSql<Record<string, unknown>>;
/** Either a pool or a transaction; services accept both. */
export type Db = Sql | Tx;

export interface DbOptions {
  url: string;
  max?: number;
  debug?: boolean;
}

/**
 * Creates the connection pool. Column names are converted between snake_case (SQL)
 * and camelCase (TypeScript) automatically.
 */
export function createDb(opts: DbOptions): Sql {
  return postgres(opts.url, {
    max: opts.max ?? 10,
    // Only column names: keys inside JSON attributes (annual_cost, phase_out) must stay as stored.
    transform: { column: { from: postgres.toCamel, to: postgres.fromCamel } },
    onnotice: () => {},
    connection: { application_name: 'atrium' },
    types: {
      // Return dates as ISO strings rather than Date objects, so JSON stays predictable.
      date: {
        to: 1082,
        from: [1082],
        serialize: (x: string) => x,
        parse: (x: string) => x,
      },
    },
  }) as unknown as Sql;
}

export function defaultDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? 'postgres://atrium:atrium@localhost:5433/atrium';
}
