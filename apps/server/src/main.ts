import { asSystem, createDb, migrate } from '@atrium/db';
import { buildApp } from './app';
import { ensureSoloUser, type UserRow } from './auth/auth';
import { loadConfig } from './config';
import { allRoutes } from './routes';
import { NoAssistant, RuleBasedAssistant } from './services/ai';
import type { Deps } from './services/deps';
import { refreshAllDerived } from './services/derived';
import { EolService } from './services/eol';
import { RealtimeHub } from './services/realtime';
import { ModelStore } from './services/store';

const config = loadConfig();
const sql = createDb({ url: config.databaseUrl });

const migration = await migrate(sql);
if (migration.applied.length) console.log(`Database migrated: ${migration.applied.join(', ')}`);

let soloUser: UserRow | null = config.mode === 'solo' ? await ensureSoloUser(sql) : null;

const deps: Deps = {
  config,
  sql,
  store: new ModelStore(sql),
  hub: new RealtimeHub(),
  eol: new EolService(sql, config.eolLookup),
  ai: config.ai === 'off' ? new NoAssistant() : new RuleBasedAssistant(),
  onUserChanged: () => {
    if (config.mode === 'solo') void ensureSoloUser(sql).then((u) => (soloUser = u));
  },
};

// Health depends on today's date (end-of-life dates pass), so derived fields are refreshed
// at startup and once a day.
const refresh = async () => {
  const changed = await asSystem(sql, (tx) => refreshAllDerived(tx));
  if (changed) {
    deps.store.bump();
    console.log(`Refreshed health and quality for ${changed} elements`);
  }
};
await refresh();
setInterval(() => void refresh().catch((e) => console.error(e)), 24 * 3600 * 1000).unref();

const app = await buildApp({ deps, soloUser: () => soloUser, extraRoutes: allRoutes });

const shutdown = async () => {
  await app.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: config.host });
console.log(`\n  Atrium is running at ${config.publicUrl}  (${config.mode} mode)\n`);
