# Development

## Requirements

Node 24 (22 works), pnpm 12 (`corepack enable`), Docker for PostgreSQL.

```bash
pnpm install
pnpm db:up          # PostgreSQL 17 on localhost:5433
pnpm dev            # server on :7300 (tsx watch) and web on :5173 (Vite)
```

Open <http://localhost:5173>. The database is migrated on start; `pnpm db:seed` loads the sample
(`--reset` to replace what is there).

## Layout

| Path | What |
|---|---|
| `apps/server` | Fastify API, MCP server, auth, import/export, packs. Hand-written SQL with postgres.js |
| `apps/web` | React 19 + Vite + Tailwind 4 app; TanStack Router and Query; React Flow + ELK; ECharts |
| `apps/cli` | The `atrium` CLI, bundled to one file and served by the server at `/cli/atrium.mjs` |
| `apps/videos` | Demo video scripts, screen capture, voiceover and Remotion compositions |
| `packages/schema` | The metamodel, shared types and derivation rules (quality, health, lifecycle) |
| `packages/db` | Migrations, connection, row-level security scope helpers |
| `packages/importers` | Excel/CSV/ArchiMate/Backstage/atrium.yaml parsing and column recognition |
| `packages/exporters` | Excel workbook, ArchiMate exchange XML and native PowerPoint decks |
| `packages/mcp` | The MCP tool definitions (transport-independent) |
| `packages/packs-core` | The reference pack format and update diffing |
| `packages/ui` | Design tokens (light and dark), primitives and chart theme |
| `packages/demo-data` | The Acme Telco sample |
| `packs/` | Reference packs shipped with Atrium (starter, TM Forum importer) |
| `deploy/` | Docker Compose files and Terraform examples |
| `e2e/` | Playwright journeys, accessibility and screenshot tests |

## Checks

```bash
pnpm lint           # Biome
pnpm typecheck
pnpm test           # unit tests (Vitest)
pnpm build          # web, CLI, then the server bundle in apps/server/dist
pnpm e2e            # needs the build and the dev database
```

The end-to-end suite starts two built servers on fresh databases (solo on :7401, team on
:7402) and walks the journeys from the implementation plan (J1–J10) with their click budgets,
checks WCAG AA with axe in both themes, and compares screenshots in both themes. Update the
screenshots on purpose with `pnpm e2e --update-snapshots`.

## Demo videos

See [apps/videos/README.md](../apps/videos/README.md).

## Conventions

- Plain language in the interface, no jargon where a word will do; British spelling.
- No save buttons: edits apply (or become suggestions) immediately and can be undone.
- Every API route is declared once with zod schemas; `/api/openapi.json` is generated from them.
- Anything an agent or token can read goes through the same scoped queries as people.
