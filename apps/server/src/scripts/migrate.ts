// Brings the database schema up to date. The server also does this on start; this command is
// for deployments that run migrations as a separate step.
import { createDb, migrate } from '@atrium/db';
import { loadConfig } from '../config';

const config = loadConfig();
const sql = createDb({ url: config.databaseUrl });
try {
  const { applied } = await migrate(sql);
  console.log(applied.length ? `Applied ${applied.join(', ')}` : 'Database is up to date');
} finally {
  await sql.end({ timeout: 5 });
}
