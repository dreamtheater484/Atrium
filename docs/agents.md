# Agents, CLI and CI

Atrium is built so coding assistants can follow your architecture and help keep it current,
without being able to change it on their own.

## Connect a coding assistant

Settings → Agents and tokens → **Connect coding agent**. Choose the tool, choose what it may see,
and copy what it shows:

- **Claude Code:** one command, `claude mcp add --transport http atrium <url>/mcp --header "Authorization: Bearer <token>"`.
- **Cursor, VS Code / Copilot:** a JSON snippet for the tool's MCP configuration file.
- **Other MCP clients:** the HTTP address and header, or `atrium mcp` for tools that only speak
  stdio.
- **CI pipeline:** a token for `atrium sync` (see below).

Each connection gets its own token. It sees information up to the classification level you pick
(Confidential by default; Restricted is admin-only) and, optionally, only some domains.

## What the assistant can do

The MCP server at `/mcp` offers these tools:

| Tool | What it answers |
|---|---|
| `whoami` | Which workspace and token this is, and what it may do |
| `search` | Find elements by words, optionally by type |
| `get_element` | One element with its fields and links |
| `get_service_context` | Everything about a service in one Markdown page: purpose, owners, capabilities, dependencies, consumers, interfaces, data, technology, standards and decisions |
| `find_dependencies` | What a service depends on and what depends on it |
| `impact_of` | What could break if an element changes or goes away |
| `list_standards` | The standards that apply, optionally for one technology |
| `list_decisions` | Architecture decisions, by element or status |
| `check_against_standards` | Check a service, or planned technologies, dependencies, data and hosting, against standards, the radar, end-of-life dates and lifecycles |
| `propose_change` | Suggest updates to the model (only when the token may suggest). An architect reviews them |

Answers are wrapped in `<atrium-data>` and marked as data, so text stored in the model can't act
as instructions to the assistant.

## The `atrium` CLI

Every Atrium server serves its CLI, so its version always matches:

```bash
curl -o atrium.mjs https://<your atrium>/cli/atrium.mjs
node atrium.mjs --help
```

| Command | What it does |
|---|---|
| `atrium login --url <url> --token <token>` | Remember the server and token (in `~/.atrium/config.json`) |
| `atrium init` | Write `atrium.yaml` from what is in the repository: package files, Dockerfile, compose files, Backstage catalog files and the git remote |
| `atrium check` | Check `atrium.yaml` against standards, the radar and end-of-life dates. Exits with 1 only for errors |
| `atrium sync` | Send `atrium.yaml` to Atrium. `--dry-run` shows what would change |
| `atrium context [service]` | Write `ARCHITECTURE.md` for the service from the live model (`--stdout` to print) |
| `atrium export --format xlsx\|csv\|json\|archimate` | Download the model |
| `atrium mcp` | Run as a stdio MCP server that forwards to Atrium over HTTPS |
| `atrium whoami` | Show the server, token and permissions |

`ATRIUM_URL` and `ATRIUM_TOKEN` work instead of `login`, which is what you want in CI.

## Keeping the model in step from CI

```yaml
# .github/workflows/atrium.yml (GitHub Actions; other CI systems are the same three lines)
on: { push: { branches: [main] }, pull_request: {} }
jobs:
  architecture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: curl -fsSo atrium.mjs "$ATRIUM_URL/cli/atrium.mjs"
        env: { ATRIUM_URL: "${{ vars.ATRIUM_URL }}" }
      - run: node atrium.mjs check
        env: { ATRIUM_URL: "${{ vars.ATRIUM_URL }}", ATRIUM_TOKEN: "${{ secrets.ATRIUM_TOKEN }}" }
      - if: github.ref == 'refs/heads/main'
        run: node atrium.mjs sync --source "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY@$GITHUB_SHA"
        env: { ATRIUM_URL: "${{ vars.ATRIUM_URL }}", ATRIUM_TOKEN: "${{ secrets.ATRIUM_TOKEN }}" }
```

`sync` only adds and updates; it never deletes. Changes to services the token's team owns are
applied straight away; anything else becomes a suggestion for an architect.

## The security model

1. **Its own token.** Stored as a fingerprint, with an expiry date and a rate limit. Revoke it at
   any time.
2. **Sees only what you allow.** Up to a classification level and, optionally, some domains.
   Enforced by Atrium and again by PostgreSQL row-level security.
3. **Suggests, never changes.** `propose_change` and `sync` for other teams' services create
   suggestions. Nothing changes until a person approves.
4. **Data, not instructions.** Everything returned is wrapped and labelled as data.
5. **Every request logged.** Settings → Agents and tokens shows who asked what, with which token.

## REST API

The same information is available over a REST API; the OpenAPI description is at
`/api/openapi.json`. Use a token as `Authorization: Bearer <token>`.

## Webhooks

Admins can register addresses in Settings → Agents and tokens → Webhooks. Atrium posts a JSON
message when the model changes (changes within two seconds are batched):

```json
{ "event": "model.changed", "at": "2026-10-08T20:44:48Z", "elementIds": ["…"], "changesets": [], "by": ["Ada Admin"] }
```

The `x-atrium-signature` header is `sha256=` plus the HMAC-SHA256 of the body with the webhook's
secret. Fetch details from the REST API.
