// Starts the built Atrium server on a fresh, empty database for the end-to-end tests.
//   node e2e/start-server.mjs <name> <port> <solo|team>
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const [name, port, mode = 'solo'] = process.argv.slice(2);
const main = new URL('../apps/server/dist/main.js', import.meta.url);
if (!existsSync(main)) {
  console.error('Build first: pnpm build');
  process.exit(1);
}

// postgres.js is a dependency of packages/db, so resolve it from there.
const require = createRequire(new URL('../packages/db/package.json', import.meta.url));
const postgres = require('postgres');
const admin = process.env.E2E_DATABASE_URL ?? 'postgres://atrium:atrium@localhost:5433/atrium';
const database = `atrium_e2e_${name}`;
const sql = postgres(admin, { max: 1, onnotice: () => {} });
await sql.unsafe(`drop database if exists ${database} with (force)`);
await sql.unsafe(`create database ${database}`);
await sql.end();

const url = new URL(admin);
url.pathname = `/${database}`;
Object.assign(process.env, {
  DATABASE_URL: url.toString(),
  PORT: port,
  ATRIUM_MODE: mode,
  ATRIUM_PUBLIC_URL: `http://localhost:${port}`,
  ATRIUM_WORKSPACE_NAME: mode === 'team' ? 'Acme Architecture' : 'Atrium',
  ATRIUM_EOL_LOOKUP: 'false',
  LOG_LEVEL: 'warn',
});
await import(main.href);
