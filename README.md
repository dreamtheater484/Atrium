# Atrium

**One shared, living map of how your organisation works.** Capabilities, applications, data and
technology, and how they connect. Architects keep it right, managers use it to decide, and
engineers (and their AI coding assistants) build with it.

- **Effortless.** Drop in a spreadsheet, a CMDB export or an ArchiMate file. Atrium recognises
  the columns, merges duplicates and fills in what it can work out: versions, end-of-life dates,
  owners and likely links. No save buttons.
- **Honest about gaps.** Dashboards say how complete costs, integrations and support dates are.
  Lump-sum contracts are shared over what they cover, and missing end-of-support dates can be
  researched (endoflife.date, then Claude with web search) and approved with their sources.
- **Clear.** Capability maps, dependency graphs, landscapes, a technology radar, a roadmap with a
  time slider and role dashboards, all drawn from the data, in light and dark mode. Export to
  PowerPoint (native, editable charts), Excel, CSV and ArchiMate.
- **Made for AI-assisted development.** Coding assistants connect over the Model Context Protocol
  and read service context, dependencies and standards while they code. They can *suggest*
  updates; an architect approves them. Scoped, revocable tokens, row-level security, and every
  request logged.
- **Starts on one computer.** One Docker command. Move to a shared team server or the cloud with
  one export and one import.

## Try it

You need Docker.

```bash
docker build -t atrium:latest .
docker compose -f deploy/docker-compose.yml up -d
```

Open <http://localhost:7300> and click **Load the sample**: a fictional telecom company, Acme
Telco, with 65 applications, a target state for 2028 and suggestions waiting for review.

For a shared server with sign-in and HTTPS, see [docs/deployment.md](docs/deployment.md).

## Connect a coding assistant

In Atrium, open **Settings → Agents and tokens → Connect coding agent**, choose your tool and copy
the command. For Claude Code it is a single `claude mcp add …` line. Details, the CLI and CI
sync: [docs/agents.md](docs/agents.md).

## Documentation

| | |
|---|---|
| [User guide](docs/user-guide.md) | Journeys for architects, managers and engineers |
| [Deployment](docs/deployment.md) | One PC, team server, Azure, AWS, backups, settings |
| [Agents and CLI](docs/agents.md) | MCP tools, `atrium` CLI, CI sync, the security model |
| [atrium.yaml](docs/atrium-yaml.md) | Describing a service next to its code |
| [Development](docs/development.md) | Repository layout, tests, demo videos |
| [Implementation plan](docs/implementation-plan.md) | What was planned, decided and built |

## Demo videos

Five short videos are generated from the real app (screens, CLI and agent output are captured,
not drawn): a two-minute tour, and one each for architects, managers, engineers and AI-assisted
coding. See [apps/videos](apps/videos/README.md) to capture, voice and render them.

## Status

Version 0.1. Built in phases 0–5 of the [implementation plan](docs/implementation-plan.md). The
TM Forum reference pack is prepared (importer and mappings) but ships without TM Forum content,
which you load from your own licensed files.
