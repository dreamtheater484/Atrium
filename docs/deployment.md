# Deploying Atrium

Atrium is one container plus PostgreSQL 17. The same image runs on a laptop, a team server or a
cloud platform; only the settings differ.

| Where | Use | How |
|---|---|---|
| One computer | Try it, or work alone | `deploy/docker-compose.yml` (solo mode) |
| Team server | A shared workspace with sign-in | `deploy/team/` (team mode, Caddy for HTTPS) |
| Azure | Managed, no servers to look after | `deploy/azure/` (Container Apps + PostgreSQL Flexible Server) |
| AWS | Managed, no servers to look after | `deploy/aws/` (ECS Fargate + RDS) |

## Build the image

```bash
docker build -t atrium:latest .
```

The runtime image contains only the bundled server, the web app and the CLI (about 290 MB). To
publish it for a cloud deployment, tag and push it to your registry, for example
`ghcr.io/your-org/atrium:0.1.0`.

## One computer (solo mode)

```bash
docker compose -f deploy/docker-compose.yml up -d
```

Open <http://localhost:7300>. There is no sign-in. Solo mode only answers requests addressed to
`localhost` (even inside a container), so another website can't reach it through your browser.
To use a different port: `ATRIUM_PORT=7500 docker compose -f deploy/docker-compose.yml up -d`.

## Team server

1. Point a DNS name (for example `atrium.example.com`) at the server, and open ports 80 and 443.
2. `cp deploy/team/.env.example deploy/team/.env` and fill it in (domain, a long database
   password, optional single sign-on).
3. `docker compose -f deploy/team/docker-compose.yml --env-file deploy/team/.env up -d`

Caddy gets a certificate from Let's Encrypt automatically. The first person to open the site
creates the admin account and can then invite colleagues (Settings → People) or let them sign in
with single sign-on.

### Single sign-on

Any OpenID Connect provider works (Microsoft Entra ID, Okta, Google, Keycloak…). Register an app
with the redirect URI `https://<your domain>/api/auth/oidc/callback`, then set `OIDC_ISSUER`,
`OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`. New people get `OIDC_DEFAULT_ROLE` (viewer unless you
change it); an admin can change roles later.

## Moving from a laptop to the team server

1. On the laptop: Settings → Data and backup → **Download backup** (one JSON file with the model,
   scenarios, suggestions and history).
2. On the new server, as the admin: Settings → Data and backup → **Restore a backup**. The
   workspace must be empty.

## Azure and AWS

Both folders are small Terraform examples meant as a starting point:

```bash
cd deploy/azure   # or deploy/aws
terraform init
terraform apply -var="image=ghcr.io/your-org/atrium:0.1.0" -var="name=atrium-acme"
```

- **Azure:** Container Apps (one replica) and PostgreSQL Flexible Server 17 with `pg_trgm`
  allow-listed. The output shows the URL and the redirect URI for single sign-on.
- **AWS:** ECS Fargate (one task) behind an Application Load Balancer with HTTPS (pass
  `certificate_arn` and `public_url`), RDS for PostgreSQL 17, the database URL in Secrets
  Manager.

Run one instance: live updates and the in-memory model cache assume a single server. That is
plenty for hundreds of people; the database is where the data lives.

## Backups

- **Built in:** Settings → Data and backup → Download backup. Restorable into an empty workspace.
- **Database:** take regular PostgreSQL backups. On the team server, for example:
  `docker compose -f deploy/team/docker-compose.yml exec db pg_dump -U atrium atrium > backups/atrium-$(date +%F).sql`.
  Managed databases on Azure and AWS keep 14 days of automatic backups in the examples.

## Upgrading

Take a backup first (see above), then pull or build the new image and restart the container.
Database migrations run automatically at start-up (`node migrate.js` runs them on their own if your platform prefers a separate step).

## Researching end-of-support dates

Atrium fills in end-of-support dates from endoflife.date by itself. For what that doesn't cover
(vendor applications, commercial middleware), it can ask Claude to search the vendor's site:

```bash
ATRIUM_AI=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

Then use **Find dates** on the dashboard or home page. What is sent: product names, vendors and
versions, only for elements classified `internal` or lower (change with
`ATRIUM_AI_MAX_CLASSIFICATION`). What comes back: dates with the page they were found on and a
quote from it, as one suggestion to review. Results without a source are dropped. Each lookup
costs a few cents (web search plus tokens); one run looks up at most `ATRIUM_RESEARCH_LIMIT`
items, and products checked recently are skipped.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `postgres://atrium:atrium@localhost:5433/atrium` | PostgreSQL connection |
| `ATRIUM_MODE` | `solo` | `solo`: one person, no sign-in. `team`: accounts, roles, reviews |
| `ATRIUM_PUBLIC_URL` | `http://localhost:<PORT>` | The address people and agents use; links and redirects are built from it |
| `PORT` / `HOST` | `7300` / `127.0.0.1` (solo), `0.0.0.0` (team, container) | Where the server listens |
| `ATRIUM_WORKSPACE_NAME` | `Atrium` | Name shown in the app and exports (admins can change it in Settings) |
| `ATRIUM_ALLOWED_HOSTS` | | Extra host names solo mode answers to, comma separated |
| `ATRIUM_EOL_LOOKUP` | `false` | Look up end-of-life dates on endoflife.date (otherwise a bundled snapshot is used) |
| `ATRIUM_AI` | `mock` | `mock`: rule-based suggestions, no external service. `anthropic`: also lets Claude research end-of-support dates on the web. `off`: none |
| `ANTHROPIC_API_KEY` | | Needed for `ATRIUM_AI=anthropic` |
| `ATRIUM_AI_MODEL` | `claude-opus-5-5` | The Claude model used for research |
| `ATRIUM_AI_EFFORT` | `medium` | `low`, `medium` or `high`: how thoroughly Claude searches |
| `ATRIUM_AI_MAX_CLASSIFICATION` | `internal` | Elements classified above this are never researched |
| `ATRIUM_RESEARCH_LIMIT` | `50` | Most items one research run looks up |
| `ATRIUM_SECURE_COOKIES` | `true` when the public URL is https | Secure session cookies |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | | Single sign-on |
| `OIDC_LABEL` | `Single sign-on` | Button text on the sign-in page |
| `OIDC_DEFAULT_ROLE` | `viewer` | Role for people signing in for the first time |
| `LOG_LEVEL` | `warn` | `info` or `debug` for more detail |

## Security notes

- Passwords are hashed with scrypt; sessions are HTTP-only cookies; every change from a browser
  needs a header other websites can't send.
- What a person or token can read is limited by classification and, for tokens, by domain. This
  is enforced in the application and again by PostgreSQL row-level security.
- Tokens are stored only as a fingerprint, expire, are rate limited and can be revoked at once.
  Everything they do is in the audit log (Settings → Agents and tokens).
- Webhooks (Settings → Agents and tokens) are signed with a per-webhook secret
  (`x-atrium-signature: sha256=<HMAC of the body>`). Only admins can add them.
