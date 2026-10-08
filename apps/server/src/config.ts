import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Button label on the login page, e.g. "Microsoft Entra ID". */
  label: string;
  /** Role given to people signing in for the first time. */
  defaultRole: 'architect' | 'manager' | 'engineer' | 'viewer';
}

export interface Config {
  port: number;
  host: string;
  databaseUrl: string;
  /** solo: one person, no login, no reviews. team: accounts, SSO, reviews. */
  mode: 'solo' | 'team';
  publicUrl: string;
  /** Solo mode answers only requests addressed to these host names (besides localhost). */
  allowedHosts: string[];
  workspaceName: string;
  webDist: string | null;
  /** Look up end-of-life dates on endoflife.date. Off means only the bundled snapshot is used. */
  eolLookup: boolean;
  ai: 'mock' | 'off';
  oidc: OidcConfig | null;
  secureCookies: boolean;
  logLevel: string;
  version: string;
}

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function findWebDist(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.ATRIUM_WEB_DIST,
    join(here, 'public'),
    resolve(here, '../../web/dist'),
    resolve(here, '../../../apps/web/dist'),
  ].filter(Boolean) as string[];
  return candidates.find((c) => existsSync(join(c, 'index.html'))) ?? null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.ATRIUM_MODE === 'team' ? 'team' : 'solo';
  const port = Number(env.PORT ?? 7300);
  // Solo mode only listens on this computer unless told otherwise.
  const host = env.HOST ?? (mode === 'solo' ? '127.0.0.1' : '0.0.0.0');
  const publicUrl = (env.ATRIUM_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, '');
  const oidc =
    env.OIDC_ISSUER && env.OIDC_CLIENT_ID
      ? {
          issuer: env.OIDC_ISSUER,
          clientId: env.OIDC_CLIENT_ID,
          clientSecret: env.OIDC_CLIENT_SECRET ?? '',
          label: env.OIDC_LABEL ?? 'Single sign-on',
          defaultRole: (env.OIDC_DEFAULT_ROLE as OidcConfig['defaultRole']) ?? 'viewer',
        }
      : null;
  return {
    port,
    host,
    databaseUrl: env.DATABASE_URL ?? 'postgres://atrium:atrium@localhost:5433/atrium',
    mode,
    publicUrl,
    allowedHosts: (env.ATRIUM_ALLOWED_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
    workspaceName: env.ATRIUM_WORKSPACE_NAME ?? 'Atrium',
    webDist: findWebDist(),
    eolLookup: bool(env.ATRIUM_EOL_LOOKUP, false),
    ai: env.ATRIUM_AI === 'off' ? 'off' : 'mock',
    oidc,
    secureCookies: bool(env.ATRIUM_SECURE_COOKIES, publicUrl.startsWith('https://')),
    logLevel: env.LOG_LEVEL ?? 'warn',
    version: env.ATRIUM_VERSION ?? '0.1.0',
  };
}
