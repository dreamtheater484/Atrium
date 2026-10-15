// Production build: one bundled server file plus the files it reads at runtime.
//
// dist/
//   main.js            server (all dependencies bundled)
//   migrate.js, seed.js  maintenance commands
//   migrations/        SQL migrations
//   data/              bundled end-of-life snapshot
//   packs/             reference packs shipped with Atrium
//   cli/atrium.js      the CLI, served at /cli/atrium.mjs
//   public/            the web app (when apps/web has been built)
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = join(here, 'dist');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: {
    main: 'src/main.ts',
    migrate: 'src/scripts/migrate.ts',
    seed: 'src/scripts/seed.ts',
  },
  outdir: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // No shared chunks: code that finds its files next to itself (import.meta.url) must live in dist/.
  splitting: false,
  // Optional native speed-ups of `ws`; it works without them.
  external: ['bufferutil', 'utf-8-validate'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  legalComments: 'none',
  sourcemap: 'linked',
  logLevel: 'warning',
});

const copy = (from, to, filter) => {
  if (!existsSync(from)) return false;
  cpSync(from, join(out, to), { recursive: true, filter });
  return true;
};
copy(join(root, 'packages/db/migrations'), 'migrations');
copy(join(here, 'src/data'), 'data');
// Pack manifests and content only: a pack's importer code is bundled into main.js. The path is
// tested relative to packs/, as the checkout itself may sit in a folder called "src" (Docker).
const packs = join(root, 'packs');
const skip = /(^|[\\/])(node_modules|src|\.turbo)([\\/]|$)/;
copy(packs, 'packs', (src) => !skip.test(relative(packs, src)));
if (!copy(join(root, 'apps/cli/dist/atrium.js'), 'cli/atrium.js'))
  console.warn('apps/cli is not built yet: /cli/atrium.mjs will be missing.');
if (!copy(join(root, 'apps/web/dist'), 'public'))
  console.warn('apps/web is not built yet: the server will run without the web app.');

console.log('Built apps/server/dist');
