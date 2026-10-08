# Atrium: implementation plan

*Atrium (enterprise architecture toolkit) · Draft 2 · 2026-10-08*

---

## Executive summary

**What we're building**
A web app where an organization keeps **one shared, always-current map of how it works**: what the business does, which applications support it, what data moves between them, and what technology they run on. It works like Google Maps for an organization's IT landscape.

**Who it's for**
- **Architects** build and maintain the map.
- **Managers** use it to decide: where the risks are, where the money goes, what the plan is.
- **Engineers and their AI coding assistants** use it to build software that fits the bigger picture.

**Why it's different**
1. **Effortless.** It fills itself in wherever it can. Drop in a spreadsheet and it recognizes the columns, removes duplicates, and suggests what's missing. There are no save buttons and very few clicks.
2. **Beautiful.** Diagrams and dashboards are drawn automatically from the data, in light and dark mode, and export straight to PowerPoint.
3. **Made for AI-assisted development.** AI coding assistants can read the architecture and its rules while they write code, and can *suggest* updates to the map. They never change it on their own, and they only see what they're allowed to see.
4. **Starts small, grows easily.** Try it on one laptop, then move it to a shared team server or the cloud without changing anything.
5. **Industry-ready.** It's prepared to load industry reference models, starting with the telecom standards from TM Forum.

**Also included:** five short, polished demo videos: an overview, one each for architects, managers and engineers, and one on AI-assisted development. They're generated from the real app, so they stay up to date.

**How we build it:** in six phases plus one extension. Each phase ends with something you can use and demo.

---

## 1. Design rule number one: no friction

Ease of use comes before everything else, including the structure we discussed earlier. Concretely:

| Rule | What it means in practice |
|---|---|
| Few clicks | Every core task is at most 3 clicks from Home. The journey budgets in section 3 are checked by automated tests. |
| Fill automatically | Derive what can be derived, suggest what can be guessed, and ask only for the rest (section 5). |
| No save buttons | Everything saves automatically. Undo replaces "Are you sure?" dialogs, except for permanent deletion. |
| Edit in place | Click a value and type. There are no separate edit screens. |
| Never an empty screen | Sample data, templates, and a hint showing the next step |
| Bring data in any way | Drop a file anywhere to import it, or paste straight from Excel into any table. |
| One search box | Find anything, or ask a question in plain language ("What depends on SAP ECC?"). |
| Plain words | "Today / Target / Scenario" and "Suggest change", never "branch / changeset / merge" |
| Smart defaults | Your role, owner, domain and classification are set for you. Settings are optional. |

### What changed from the earlier design, and why

| Earlier | Now | Why |
|---|---|---|
| 9 navigation sections | 5 sections plus global actions | Fewer choices |
| Views separate from the inventory | **Explore** shows the same data as a table, map or graph | One place to look |
| A separate Governance section | Principles, standards and decisions are ordinary elements in Explore | One way of working |
| A separate Import section | A **+ Add** button and drag-and-drop anywhere | Nothing to hunt for |
| Branches, changesets, proposals | A **Today / Target / Scenario** switch, automatic drafts, one **Submit for review** button | No git vocabulary |
| Review for every change | Domain owners save directly (with history and undo); everyone else's edits become suggestions; solo mode has no reviews | Reviews only where they add value |
| An Agents section | **Connect coding agent** in your profile menu: one command to copy and paste | Engineers are set up in 30 seconds |

---

## 2. Users

| Role | Main question | Default Home |
|---|---|---|
| Architect | "Is our map right, and where are we heading?" | Reviews waiting, data-quality gaps, recent changes |
| Manager (technically minded) | "Where are the risk, cost and opportunities?" | Portfolio health, cost per capability, upcoming end-of-life, roadmap |
| Engineer | "What does my service touch, and which rules apply?" | My services, dependencies, applicable standards, agent connection |
| AI coding agent | "What context and guardrails apply to this code?" | None; it uses the MCP server and API (section 7) |

The role comes from the person's SSO group, or is asked once at first login. Anyone can switch it.

---

## 3. Key journeys and friction budgets

Each journey serves three purposes: it's the **design target**, an **automated end-to-end test** (including a click count), and a **scene in the demo videos**.

| # | Journey | Who | Budget |
|---|---|---|---|
| J1 | First run: start the app, load sample data or your own file, see your first capability map | Anyone | under 5 minutes, at most 5 clicks |
| J2 | Import an Excel list of applications: columns mapped, duplicates merged, gaps filled | Architect | under 10 minutes for 500 rows |
| J3 | Open portfolio health, drill into a red area, export to PowerPoint | Manager | at most 3 clicks |
| J4 | "What breaks if we retire system X?" | Architect, manager | one search |
| J5 | Build a target-state scenario and roadmap, then submit it for review | Architect | No set-up steps: draw and edit |
| J6 | Review and approve a suggestion, whether from a person or an agent | Architect | at most 2 clicks |
| J7 | Connect a service repo and a coding agent | Engineer | 1 command for each |
| J8 | An agent fetches context and checks standards while coding | Agent | Automatic |
| J9 | Install the TM Forum pack and map applications to it | Architect | AI suggests mappings; accept in bulk |
| J10 | Move from a laptop to a team server | Admin | 1 export plus 1 import |

---

## 4. The app at a glance

**Navigation (5 sections):** Home · Explore · Dashboards · Roadmap · Changes

**Always visible:**
- **Search / ask** (Ctrl+K)
- **+ Add**: a new element, an import, or a view
- **Today / Target / Scenario** switch, plus a time slider on maps
- Who's online, and notifications
- **Profile menu:** theme (light, dark, system), Connect coding agent, Settings (users, integrations, industry packs, agent tokens and audit log)

| Section | What it does |
|---|---|
| Home | Role-aware overview with a suggested next step |
| Explore | All elements, shown as a **table** (spreadsheet-style, inline and bulk edit), a **map** (capability map, landscape) or a **graph** (dependencies, data flow). Overlays for health, cost, lifecycle and risk. Notation toggle: clean cards or ArchiMate symbols. |
| Dashboards | Curated templates per role, a builder, share link, PowerPoint and PDF export |
| Roadmap | Timeline of initiatives and application lifecycles, with scenarios side by side |
| Changes | Suggestions waiting for review (with a visual diff), and the full history of changes |

**Inspector panel:** clicking anything (a box, row, chart bar or search result) opens its details on the right, with **Impact**, **Suggest change** and **Open full page**. You never lose your place.

---

## 5. Automatic filling

| Field or task | How it gets filled |
|---|---|
| ID, created and updated by and when, source, history | Always automatic |
| Owner, domain, classification | Inherited from the parent capability or domain, or set to the person creating it |
| Import column mapping | Detected from headers and sample values; you confirm once and it's remembered for next time |
| Duplicates | Fuzzy name and external-ID matching, with a one-click merge |
| Dependencies and interfaces | From engineers' `atrium.yaml` files, Backstage, and cloud resource tags |
| Cost per capability | Rolled up automatically from application costs |
| Technology end-of-life dates | Looked up on endoflife.date (optional, and switched off when running offline) |
| Description, capability mapping, TM Forum mapping | AI suggestions shown greyed out: press Tab or click to accept, or bulk-accept from a queue |
| Missing data | A data-quality score per element, plus a **Fill the gaps** queue that walks you through what's missing, one keystroke per field |
| Engineer `atrium.yaml` | `atrium init` pre-fills it from the repo: package files, Dockerfiles, any existing Backstage file |

**Rule:** values worked out by the app are filled in directly. Values *guessed* by AI are always visibly marked as suggestions until a person accepts them. Everything works without AI (with rule-based fallbacks); AI is optional and you choose the provider, including a local model.

---

## 6. Data model

- **Core element types:** Capability, Business process, Application, Interface, Data object, Technology component, Initiative, Principle, Standard, Decision (ADR), Team, Domain.
- **Relations:** supports, realizes, depends on, flows to, owned by, governed by, **maps to (reference)**.
- **Common fields:** name, description, owner, domain, lifecycle, classification, tags, external IDs, source, quality score. Custom fields per type are stored as JSONB.
- **Two layers:**
  - The **organization model**, which you edit.
  - The **reference layer**: industry packs, read-only.

  The two are linked by "maps to".
- **States and history:** every change is recorded in a changeset. Today, Target and Scenarios are views over those changesets, so you can see the full history at any point in time.
- **Built for multiple users from day one**, even in solo mode, so moving to a team server never needs a rewrite.
- **ArchiMate mapping** for import and export.

---

## 7. AI-assisted development (the key feature)

**What agents get, through the MCP server**

| Tool | Purpose |
|---|---|
| `search`, `get_element` | Look things up |
| `get_service_context` | Everything about one service in a single call: purpose, owner, dependencies, data, standards, decisions |
| `find_dependencies`, `impact_of` | What this touches, and what breaks if it changes |
| `list_standards`, `list_decisions` | The rules that apply |
| `check_against_standards` | Check proposed code or design against the standards before opening a PR |
| `propose_change` | Suggest a model update. This is the **only** write action, and it always needs approval. |

**How they connect**
- **One click in the UI:** Connect coding agent → pick the tool (Claude Code, Cursor, Copilot, other) → the scope is pre-filled from your team → copy one command.
- **Remote:** MCP over HTTP with OAuth.
- **Local:** stdio through the CLI.
- **Without MCP:** CI generates an `ARCHITECTURE.md` context file in each service repo.
- **Engineers' files:** `atrium.yaml` in each service repo. CI syncs it, accepting fields the team owns directly and turning the rest into suggestions.

**Security**
- Each token is scoped to its teams and domains, and has a maximum classification level it can see.
- Read-only by default, with expiry and rotation.
- Writes are suggestions only.
- Every query and suggestion is audit-logged, with rate limits per token.
- Responses mark model content as *data*, which protects agents against prompt injection hidden in descriptions.
- The model never stores secrets.
- Access rules are enforced twice: in the app's policy layer and by Postgres row-level security.

---

## 8. Import and export

| | v1 | Later |
|---|---|---|
| Import | Excel/CSV wizard (auto-mapping, preview of changes, merge), smart paste, ArchiMate Exchange Format (Archi, Sparx), Backstage, JSON, `atrium.yaml` | ServiceNow CMDB, AWS/Azure inventory, LeanIX and Ardoq migration, TM Forum pack |
| Export | PowerPoint (themed), PDF, PNG, SVG, Excel, JSON, ArchiMate, share link | Scheduled PDF reports |

Every import shows **what will change** before it's applied. Re-importing the same file updates records instead of duplicating them, because records are matched on their external IDs.

---

## 9. Visualization and dashboards

- **Generated views:**
  - Capability map
  - Application landscape
  - Dependency graph
  - Data flow
  - Roadmap
  - Technology radar
  - Gap and overlap heatmap against a reference model
- **Overlays:** health, cost, lifecycle, risk, TIME rating, classification.
- **Time slider and scenario compare** on every map.
- **Layout:** automatic, and any manual adjustments are kept.
- **Dashboards:** one template per role that's useful immediately, plus a drag-and-drop builder. Click any chart to open the inspector.
- **Color:** it always means something, and always comes with a legend. The palette is safe for color-blind viewers and passes contrast checks in both themes.
- **Exports:** they use the same rendering engine, so they look exactly like the screen.

---

## 10. Light and dark mode

- **Design tokens** (color, type, spacing) are defined for both themes, so components never use hard-coded colors.
- The app follows the operating-system setting, with a manual toggle.
- **Charts and diagrams** take their colors from the same tokens, so ECharts and React Flow switch theme along with the rest.
- **Exports:** you pick the theme. PowerPoint defaults to light, for printing and projectors.
- **Checks:** WCAG AA contrast in both themes, and automated screenshot comparisons for every screen in both themes.

---

## 11. Industry reference packs (extension, with groundwork done now)

**Idea:** a *pack* loads an industry's standard reference model as a read-only layer. Your own elements link to it with "maps to". That gives you gap and overlap heatmaps, comparisons with the standard, and agents that can answer questions like "which ODA component covers this?"

**First pack: TM Forum (telecom), latest versions only**

| Framework | Becomes |
|---|---|
| eTOM (Business Process Framework) | Reference business processes, with levels kept as a hierarchy |
| SID (Information Framework) | Reference data objects (domains, aggregate business entities, entities) |
| ODA Functional Framework | Reference application functions and capabilities |
| ODA Components | Reference application components, linked to the Open APIs they expose and use, and to Functional Framework and SID elements |

Links between frameworks are kept.

**Easy to update**
- A pack holds **one version only**: the latest.
- **Updating:** drop in the new source files, or fetch them automatically where TM Forum publishes machine-readable public sources. The app detects which framework and version they are, shows what was added, changed, renamed or deprecated, migrates your existing mappings automatically, and flags any it couldn't migrate for review.
- **Pack format:**
  ```
  packs/tmforum/
    manifest.yaml     id, frameworks, supported source formats, licence note
    importers/        one parser per framework and source format
    mappings/         rules from source types to core types
    tests/fixtures/   small synthetic samples (no licensed content)
  ```

**Licensing:** TM Forum material is largely member content. By default the repo ships the **importers and mapping rules, not the content**. Users load files they're licensed to use. Any bundled content needs a redistribution check first.

**Groundwork in phases 0 and 1:** the reference layer and "maps to" relation in the schema, the pack manifest format, and a pack manager skeleton with a small test pack. The TM Forum importers come later, as the extension.

---

## 12. Demo videos (5)

| # | Title | Audience | Length | Story |
|---|---|---|---|---|
| 1 | The 2-minute tour | Everyone | ~2 min | The problem (scattered spreadsheets, outdated diagrams), the idea, the three audiences, the value |
| 2 | From spreadsheet to target state | Architects | ~4 min | Import, auto-fill, capability map, scenario and roadmap, review, TM Forum preview |
| 3 | Decisions in three clicks | Managers | ~3 min | Portfolio health, cost per capability, end-of-life risk, roadmap, PowerPoint export |
| 4 | Architecture where you work | Engineers | ~3 min | My services, `atrium.yaml`, CI sync, API, `ARCHITECTURE.md` |
| 5 | Architecture-aware AI coding | Engineers, architects | ~4 min | An agent connects, fetches context, checks standards, suggests a model update, and an architect approves it; the security model explained visually |

**How they're made (reproducible from the repo)**
1. **Scripts and storyboards** are written in Markdown in `apps/videos/scripts/`.
2. **Demo data:** a fictional company, "Acme Telco", seeded with realistic data that suits the TM Forum story.
3. **Screen footage:** a recording mode of the Playwright journeys from section 3 runs the real app with smooth cursor movement and highlighted clicks. It captures high-resolution frames, not Playwright's default low-bitrate video.
4. **Composition:** Remotion (React-based video) reuses the app's own design tokens and fonts. It adds title cards, animated concept diagrams, zoom and pan, and burned-in captions.
5. **Sound:** a voiceover generated from the script by a **free, open-source text-to-speech model** whose license allows commercial use, so videos can be re-rendered whenever the app changes. During development, Kokoro (Apache 2.0) runs on the build PC. For the final render, the best free GPU models are compared on an RTX 5090. Music is optional and must be royalty-free.
6. **Output:** 1080p MP4 in **dark mode** (light mode is optional), plus SRT captions and poster images, published as release assets and on the docs site (not committed to git).
7. **Staying current:** CI re-renders the videos on every release, so they never show outdated screens.

---

## 13. Technical architecture

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere |
| Repo | pnpm workspaces + Turborepo |
| Frontend | React + Vite single-page app; TanStack Router, Query and Table (virtualized) |
| UI | Tailwind + shadcn/ui (Radix), Lucide icons; tokens for both themes |
| Diagrams | React Flow + ELK.js (in a web worker) |
| Charts | ECharts, themed from the tokens |
| Backend | Node.js + Fastify, which also serves the frontend |
| Schemas | Zod, defined once in `packages/schema` and used to generate OpenAPI, validation and MCP tool definitions |
| Database | Postgres + Drizzle ORM; JSONB, recursive queries, full-text search, pg_trgm, row-level security |
| Jobs and real-time | pg-boss for background jobs; WebSockets + Postgres LISTEN/NOTIFY |
| Auth | Better Auth: solo mode, local accounts, OIDC SSO (SAML later) |
| MCP | Official TypeScript MCP SDK: Streamable HTTP with OAuth, plus stdio through the CLI |
| AI | v1 ships rule-based auto-fill and a **mock AI provider**, behind a provider-agnostic interface. Turning on real AI (Claude, or a local model) later is a configuration change. |
| Import and export | ExcelJS, fast-xml-parser, pptxgenjs, Playwright (PDF and PNG) |
| Videos | Remotion + Playwright recording mode |
| Tests | Vitest, Playwright end-to-end (journeys and click budgets), visual regression in both themes, axe for accessibility |

**Principle:** Postgres is the only runtime dependency. There's no Redis, Elasticsearch or Neo4j.

**Repo layout**
```
atrium/
  apps/
    web/              React app
    server/           API, MCP endpoint, jobs, WebSockets
    cli/              atrium CLI: init, sync, import/export, MCP stdio bridge
    videos/           Remotion project, scripts, voiceover
  packages/
    schema/           metamodel and types (single source of truth)
    ui/               design system and tokens (light and dark)
    db/               database schema and migrations
    importers/        Excel, ArchiMate, Backstage, JSON, atrium.yaml
    exporters/        PPTX, PDF, PNG, SVG, Excel, JSON, ArchiMate
    mcp/              MCP tools and access policies
    packs-core/       pack format, loader, update and migration
  packs/
    tmforum/          importers and mappings (no licensed content)
  e2e/                journeys: tests and video recording
  deploy/             docker compose, Caddy, cloud examples
  docs/
```

---

## 14. Deployment

| Stage | How |
|---|---|
| One PC | `docker compose up` (app + Postgres), reachable only from that PC, solo mode (no login, no reviews). Needs Docker or Podman. |
| Team server | The same compose file plus Caddy (automatic TLS), SSO and scheduled backups |
| Cloud | The same image: Azure Container Apps + Azure Database for PostgreSQL, or AWS ECS Fargate + RDS. One Terraform example each. No Kubernetes. |
| Updates | Back up automatically, then migrate the database automatically |
| Laptop to server | Export a bundle on the laptop and import it on the server (J10) |

---

## 15. Quality targets

- All journeys J1–J10 pass end-to-end within their click and time budgets.
- WCAG AA in both themes. No visual regressions between releases.
- **Performance:** 50,000 elements; views of 2,000 nodes render in under 1 second; search in under 200 ms.
- **Security:** dependency scanning in CI, OWASP checks, an MCP access test suite proving that tokens can't see beyond their scope.

---

## 16. Phased roadmap

| Phase | Delivers | Unlocks |
|---|---|---|
| **0. Foundations** | Monorepo, CI, design system in light and dark, schema and database, solo mode, Docker Compose, Acme Telco demo data, reference-layer groundwork | Nothing user-facing yet |
| **1. Model and Explore** | Table and element pages, inspector, edit in place, autosave and undo, search, history, rule-based auto-fill, Excel import wizard, smart paste, JSON export | J1, J2 |
| **2. Views and dashboards** | Capability map, landscape, dependency graph and data flow; overlays; time slider; role dashboards and builder; PowerPoint, PDF, PNG, SVG and Excel export; ArchiMate import and export; **video pipeline started** | J3, J4 |
| **3. Teamwork** | Today, Target and Scenarios; automatic drafts; suggestions and reviews; presence, comments and notifications; SSO, roles and row-level security; team-server setup; backups; laptop-to-server move | J5, J6, J10 |
| **4. Engineers and agents** | REST API and OpenAPI, webhooks, CLI, `atrium.yaml` with CI sync, Backstage import, MCP server, Connect coding agent flow, scoped tokens, audit log, `ARCHITECTURE.md` generation | J7, J8 |
| **5. Smart assist and launch** | AI suggestions, plain-language questions, end-of-life lookup, Fill the gaps queue, local model option; **5 demo videos final**; docs site; cloud templates | Improves every journey |
| **Extension: TM Forum** | eTOM, SID, ODA Components and Functional Framework importers; update wizard; mapping suggestions; telecom dashboards and heatmaps | J9 |

---

## 17. Open decisions

1. **License and business model:** open source, open-core, or commercial. For now: private, all rights reserved.
2. **TM Forum:** membership and redistribution rights, which decide whether we ship content or importers only.
3. **Video hosting:** GitHub Releases, a docs site, or both. For now: rendered locally and not committed.
4. **Trademark check for "Atrium"** before any public release. The npm name `atrium` is already taken, so a published CLI would use a scoped name.

**Decided**
- **Name:** Atrium. The CLI is `atrium` and the engineers' file is `atrium.yaml`.
- **AI:** rule-based auto-fill and a mock provider first. Real AI is switched on later.
- **Video tooling:** Remotion, used only for the demo videos and not part of the app.
- **Voiceover:** a free, open-source text-to-speech model, with the final render on an RTX 5090.
