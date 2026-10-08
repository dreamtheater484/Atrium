import { asSystem, FULL_SCOPE, type Sql } from '@atrium/db';
import type { Classification, Role } from '@atrium/schema';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config';
import { HttpError, unauthorized } from '../http/errors';
import { ANONYMOUS, type RequestContext, type TokenInfo, tokenScope } from './context';
import { newSecret, sha256 } from './crypto';

export const SESSION_COOKIE = 'atrium_session';
const SESSION_DAYS = 14;
const SOLO_EMAIL = 'you@localhost';

export interface UserRow {
  id: string;
  email: string | null;
  name: string;
  role: Role;
  teamIds: string[];
  theme: 'light' | 'dark' | 'system';
  onboarded: boolean;
  disabled: boolean;
}

export async function ensureSoloUser(sql: Sql): Promise<UserRow> {
  return asSystem(sql, async (tx) => {
    const [existing] = await tx`select * from users where email = ${SOLO_EMAIL}`;
    if (existing) return existing as unknown as UserRow;
    const [created] = await tx`
      insert into users (email, name, role) values (${SOLO_EMAIL}, 'You', 'admin') returning *`;
    return created as unknown as UserRow;
  });
}

export function userContext(u: UserRow, mode: 'solo' | 'team', ip: string): RequestContext {
  return {
    kind: 'user',
    userId: u.id,
    name: u.name,
    email: u.email === SOLO_EMAIL ? null : u.email,
    role: mode === 'solo' ? 'admin' : u.role,
    teamIds: u.teamIds ?? [],
    token: null,
    scope: FULL_SCOPE,
    authorKind: 'user',
    ip,
    mode,
  };
}

export async function createSession(sql: Sql, userId: string, userAgent?: string): Promise<string> {
  const token = newSecret();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await asSystem(sql, async (tx) => {
    await tx`insert into sessions (id, user_id, expires_at, user_agent)
             values (${sha256(token)}, ${userId}, ${expires}, ${userAgent ?? null})`;
    await tx`update users set last_login_at = now() where id = ${userId}`;
  });
  return token;
}

export function setSessionCookie(reply: FastifyReply, token: string, config: Config) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    maxAge: SESSION_DAYS * 86400,
  });
}

// Simple fixed-window rate limiter per token.
const windows = new Map<string, { start: number; count: number }>();
function rateLimited(tokenId: string, perMinute: number): boolean {
  const now = Date.now();
  const w = windows.get(tokenId);
  if (!w || now - w.start > 60_000) {
    windows.set(tokenId, { start: now, count: 1 });
    return false;
  }
  w.count++;
  return w.count > perMinute;
}

const lastUsedWrites = new Map<string, number>();

export async function authenticateToken(sql: Sql, raw: string, ip: string, mode: 'solo' | 'team'): Promise<RequestContext> {
  const rows = await asSystem(sql, (tx) => tx`
    select t.*, u.name as user_name, u.role as user_role, u.team_ids as user_team_ids, u.disabled as user_disabled
    from api_tokens t left join users u on u.id = t.user_id
    where t.token_hash = ${sha256(raw)}`);
  const t = rows[0];
  if (!t || t.revokedAt || (t.expiresAt && new Date(t.expiresAt as string) < new Date()) || t.userDisabled) {
    throw unauthorized('This token is not valid. It may have expired or been revoked.');
  }
  const token: TokenInfo = {
    id: t.id as string,
    name: t.name as string,
    kind: t.kind as TokenInfo['kind'],
    canPropose: !!t.canPropose,
    domainIds: (t.domainIds as string[] | null) ?? null,
    maxClassification: t.maxClassification as Classification,
    rateLimitPerMinute: Number(t.rateLimitPerMinute ?? 120),
    userId: (t.userId as string) ?? null,
    client: (t.client as string) ?? null,
  };
  if (rateLimited(token.id, token.rateLimitPerMinute)) {
    throw new HttpError(429, 'Too many requests for this token. Try again in a minute.', 'rate_limited');
  }
  const last = lastUsedWrites.get(token.id) ?? 0;
  if (Date.now() - last > 60_000) {
    lastUsedWrites.set(token.id, Date.now());
    void asSystem(sql, (tx) => tx`update api_tokens set last_used_at = now() where id = ${token.id}`).catch(() => {});
  }
  return {
    kind: 'token',
    userId: token.userId,
    name: token.name,
    email: null,
    role: 'viewer',
    teamIds: (t.userTeamIds as string[]) ?? [],
    token,
    scope: tokenScope(token),
    authorKind: token.kind === 'ci' ? 'ci' : 'agent',
    ip,
    mode,
  };
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Resolves who is calling for every request and enforces the route's access level. */
export function registerAuth(app: FastifyInstance, sql: Sql, config: Config, soloUser: () => UserRow | null) {
  app.decorateRequest('ctx', null as unknown as RequestContext);
  app.addHook('onRequest', async (req: FastifyRequest) => {
    const access = req.routeOptions.config?.access ?? 'user';
    const ip = req.ip;
    // Solo mode has no login, so only answer requests addressed to this computer. This blocks
    // DNS-rebinding tricks where another website points its own hostname at 127.0.0.1.
    if (config.mode === 'solo' && config.host === '127.0.0.1') {
      const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
      if (!['localhost', '127.0.0.1', '[::1]'].includes(host) && !host.endsWith('.localhost')) {
        throw new HttpError(421, 'Atrium only answers requests for localhost in solo mode.', 'misdirected');
      }
    }
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      req.ctx = await authenticateToken(sql, header.slice(7).trim(), ip, config.mode);
      if (access === 'user') throw new HttpError(403, 'This endpoint is for people, not tokens.', 'forbidden');
      return;
    }
    if (config.mode === 'solo') {
      const u = soloUser();
      req.ctx = u ? userContext(u, 'solo', ip) : ANONYMOUS(config.mode, ip);
    } else {
      const cookie = req.cookies?.[SESSION_COOKIE];
      if (cookie) {
        const rows = await asSystem(sql, (tx) => tx`
          select u.* from sessions s join users u on u.id = s.user_id
          where s.id = ${sha256(cookie)} and s.expires_at > now() and not u.disabled`);
        if (rows[0]) req.ctx = userContext(rows[0] as unknown as UserRow, 'team', ip);
      }
      req.ctx ??= ANONYMOUS(config.mode, ip);
    }
    if (access !== 'public' && req.ctx.kind === 'anonymous') throw unauthorized();
    // Atrium's own pages always send this header. Other websites can't (it forces a CORS
    // preflight, which Atrium never allows), so cross-site form posts are blocked — also in
    // solo mode, where there is no login to protect the local server.
    if (MUTATING.has(req.method) && req.ctx.kind !== 'token' && !req.headers['x-atrium-csrf']) {
      throw new HttpError(403, 'Missing request header. Reload the page and try again.', 'csrf');
    }
  });
}
