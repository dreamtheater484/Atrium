// Loads the Acme Telco sample model into an empty workspace.
//   seed            load the sample (refuses when the workspace has data)
//   seed --reset    clear the model first (people and tokens are kept)
import { asSystem, createDb, migrate } from '@atrium/db';
import { acmeTelco } from '@atrium/demo-data';
import { ensureSoloUser } from '../auth/auth';
import { loadConfig } from '../config';
import { NoAssistant } from '../services/ai';
import type { Deps } from '../services/deps';
import { EolService } from '../services/eol';
import { RealtimeHub } from '../services/realtime';
import { clearModel, loadDataset } from '../services/seed';
import { ModelStore } from '../services/store';

const config = loadConfig();
const sql = createDb({ url: config.databaseUrl });
try {
  await migrate(sql);
  if (config.mode === 'solo') await ensureSoloUser(sql);
  const deps: Deps = {
    config,
    sql,
    store: new ModelStore(sql),
    hub: new RealtimeHub(),
    eol: new EolService(sql, false),
    ai: new NoAssistant(),
  };
  if (process.argv.includes('--reset')) {
    await clearModel(deps);
    console.log('Cleared the model');
  }
  const [{ n }] = await asSystem(
    sql,
    (tx) => tx`select count(*)::int as n from elements where layer = 'org' and deleted_at is null`,
  );
  if (n > 0) {
    console.log(`The workspace already has ${n} elements. Run with --reset to replace them.`);
    process.exitCode = 1;
  } else {
    const { elements, relations } = await loadDataset(deps, acmeTelco);
    console.log(`Loaded the Acme Telco sample: ${elements} elements, ${relations} relations`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
