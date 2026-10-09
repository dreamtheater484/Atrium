/**
 * Refreshes the bundled end-of-life snapshot from endoflife.date (MIT licensed data).
 * Atrium uses the snapshot offline; live lookups are optional (ATRIUM_EOL_LOOKUP=on).
 *
 *   pnpm --filter @atrium/server exec tsx src/scripts/fetch-eol.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EOL_PRODUCTS } from '../services/eol';

interface Cycle {
  cycle: string;
  eol: string | boolean;
  releaseDate?: string;
  lts?: boolean | string;
  extendedSupport?: string | boolean;
}

const out: Record<
  string,
  Array<{ c: string; eol: string | boolean; r?: string; x?: string | boolean }>
> = {};
for (const product of Object.keys(EOL_PRODUCTS)) {
  const res = await fetch(`https://endoflife.date/api/${product}.json`);
  if (!res.ok) {
    console.warn(`skip ${product}: ${res.status}`);
    continue;
  }
  const cycles = (await res.json()) as Cycle[];
  out[product] = cycles.map((c) => ({
    c: String(c.cycle),
    eol: c.eol,
    r: c.releaseDate,
    ...(c.extendedSupport !== undefined ? { x: c.extendedSupport } : {}),
  }));
  console.log(`${product}: ${cycles.length} cycles`);
}
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'eol-snapshot.json');
writeFileSync(
  file,
  `${JSON.stringify({ source: 'https://endoflife.date (MIT)', fetchedAt: new Date().toISOString().slice(0, 10), products: out })}\n`,
);
console.log(`wrote ${file}`);
