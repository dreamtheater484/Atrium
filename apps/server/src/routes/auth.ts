import { asSystem } from '@atrium/db';
import type { FastifyInstance } from 'fastify';
import * as oidc from 'openid-client';
import { z } from 'zod';
import { createSession, SESSION_COOKIE, setSessionCookie } from '../auth/auth';
import { hashPassword, newSecret, sha256, verifyPassword } from '../auth/crypto';
import { badRequest, forbidden, HttpError, unauthorized } from '../http/errors';
import { route } from '../http/route';
import { audit } from '../services/audit';
import type { Deps } from '../services/deps';
import { getWorkspace } from '../services/workspace';

// Brute-force protection: at most 10 login attempts per minute per IP.
const attempts = new Map<string, { start: number; n: number }>();
function throttle(ip: string) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.start > 60_000) {
    attempts.set(ip, { start: now, n: 1 });
    return;
  }
  if (++a.n > 10)
    throw new HttpError(429, 'Too many attempts. Wait a minute and try again.', 'rate_limited');
}

let oidcConfig: Promise<oidc.Configuration> | null = null;

export function authRoutes(deps: Deps) {
  const { sql, config } = deps;
  const needsSetup = async () => {
    if (config.mode !== 'team') return false;
    const [r] = await asSystem(
      sql,
      (tx) =>
        tx`select count(*)::int as n from users where role = 'admin' and (password_hash is not null or oidc_subject is not null) and not disabled`,
    );
    return Number(r?.n ?? 0) === 0;
  };
  return [
    route({
      method: 'GET',
      url: '/api/auth/info',
      summary: 'What the sign-in page needs to know',
      tag: 'Auth',
      access: 'public',
      handler: async () => {
        const ws = await getWorkspace(sql, config.workspaceName);
        return {
          mode: config.mode,
          workspaceName: ws.name,
          sso: config.oidc ? { label: config.oidc.label } : null,
          needsSetup: await needsSetup(),
        };
      },
    }),
    route({
      method: 'POST',
      url: '/api/auth/setup',
      summary: 'Create the first admin account (team mode, first run only)',
      tag: 'Auth',
      access: 'public',
      body: z.object({
        name: z.string().trim().min(1).max(120),
        email: z.email(),
        password: z.string().min(10, 'Use at least 10 characters'),
      }),
      handler: async ({ body, req, reply }) => {
        if (!(await needsSetup())) throw forbidden('Atrium is already set up. Sign in instead.');
        const hash = await hashPassword(body.password);
        const [u] = await asSystem(
          sql,
          (tx) => tx`
          insert into users (email, name, role, password_hash, onboarded) values (${body.email.toLowerCase()}, ${body.name}, 'admin', ${hash}, false)
          on conflict (email) do update set password_hash = excluded.password_hash, role = 'admin', name = excluded.name
          returning id`,
        );
        setSessionCookie(
          reply,
          await createSession(sql, u!.id as string, req.headers['user-agent']),
          config,
        );
        return { ok: true };
      },
    }),
    route({
      method: 'POST',
      url: '/api/auth/login',
      summary: 'Sign in with email and password',
      tag: 'Auth',
      access: 'public',
      body: z.object({ email: z.string().trim().min(3), password: z.string().min(1) }),
      handler: async ({ body, req, reply }) => {
        throttle(req.ip);
        const [u] = await asSystem(
          sql,
          (tx) =>
            tx`select * from users where lower(email) = ${body.email.toLowerCase()} and not disabled`,
        );
        const ok = u?.passwordHash
          ? await verifyPassword(body.password, u.passwordHash as string)
          : false;
        if (!u || !ok) throw unauthorized("That email and password don't match.");
        setSessionCookie(
          reply,
          await createSession(sql, u.id as string, req.headers['user-agent']),
          config,
        );
        await audit(
          sql,
          { ...req.ctx, userId: u.id as string, name: u.name as string, kind: 'user' },
          'auth.login',
        );
        return { ok: true };
      },
    }),
    route({
      method: 'POST',
      url: '/api/auth/logout',
      summary: 'Sign out',
      tag: 'Auth',
      access: 'public',
      handler: async ({ req, reply }) => {
        const cookie = req.cookies?.[SESSION_COOKIE];
        if (cookie)
          await asSystem(sql, (tx) => tx`delete from sessions where id = ${sha256(cookie)}`);
        reply.clearCookie(SESSION_COOKIE, { path: '/' });
        return { ok: true };
      },
    }),
    route({
      method: 'GET',
      url: '/api/auth/invite/:token',
      summary: 'Look up an invite link',
      tag: 'Auth',
      access: 'public',
      params: z.object({ token: z.string().min(20) }),
      handler: async ({ params }) => {
        const [i] = await asSystem(
          sql,
          (tx) => tx`
          select u.name, u.email from invites i join users u on u.id = i.user_id
          where i.token_hash = ${sha256(params.token)} and i.used_at is null and i.expires_at > now()`,
        );
        if (!i)
          throw badRequest('This invite link has expired or was already used. Ask for a new one.');
        return { name: i.name, email: i.email };
      },
    }),
    route({
      method: 'POST',
      url: '/api/auth/invite/:token',
      summary: 'Accept an invite and choose a password',
      tag: 'Auth',
      access: 'public',
      params: z.object({ token: z.string().min(20) }),
      body: z.object({ password: z.string().min(10, 'Use at least 10 characters') }),
      handler: async ({ params, body, req, reply }) => {
        const hash = await hashPassword(body.password);
        const userId = await asSystem(sql, async (tx) => {
          const [i] = await tx`update invites set used_at = now()
            where token_hash = ${sha256(params.token)} and used_at is null and expires_at > now() returning user_id`;
          if (!i)
            throw badRequest(
              'This invite link has expired or was already used. Ask for a new one.',
            );
          await tx`update users set password_hash = ${hash}, disabled = false where id = ${i.userId}`;
          return i.userId as string;
        });
        setSessionCookie(
          reply,
          await createSession(sql, userId, req.headers['user-agent']),
          config,
        );
        return { ok: true };
      },
    }),
  ];
}

/** Single sign-on with any OpenID Connect provider (Entra ID, Okta, Google, Keycloak…). */
export function registerOidc(app: FastifyInstance, deps: Deps) {
  const { config, sql } = deps;
  if (!config.oidc) return;
  const o = config.oidc;
  const redirectUri = `${config.publicUrl}/api/auth/oidc/callback`;
  const getConfig = () => {
    oidcConfig ??= oidc
      .discovery(new URL(o.issuer), o.clientId, o.clientSecret || undefined)
      .catch((e) => {
        oidcConfig = null;
        throw e;
      });
    return oidcConfig;
  };

  app.get('/api/auth/oidc/start', { config: { access: 'public' } }, async (_req, reply) => {
    const cfg = await getConfig();
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const url = oidc.buildAuthorizationUrl(cfg, {
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
    });
    reply.setCookie('atrium_oidc', `${state}.${verifier}`, {
      path: '/api/auth/oidc',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.secureCookies,
      maxAge: 600,
    });
    return reply.redirect(url.href);
  });

  app.get('/api/auth/oidc/callback', { config: { access: 'public' } }, async (req, reply) => {
    const [state, verifier] = (req.cookies.atrium_oidc ?? '').split('.');
    if (!state || !verifier) return reply.redirect('/?login=expired');
    const cfg = await getConfig();
    const tokens = await oidc.authorizationCodeGrant(cfg, new URL(req.url, config.publicUrl), {
      pkceCodeVerifier: verifier,
      expectedState: state,
    });
    const claims = tokens.claims();
    if (!claims?.sub) return reply.redirect('/?login=failed');
    const email = (claims.email as string | undefined)?.toLowerCase() ?? null;
    const name = (claims.name as string | undefined) ?? email ?? 'New user';
    const user = await asSystem(sql, async (tx) => {
      const [bySub] = await tx`select * from users where oidc_subject = ${claims.sub}`;
      if (bySub) return bySub;
      if (email) {
        const [byEmail] =
          await tx`update users set oidc_subject = ${claims.sub} where lower(email) = ${email} returning *`;
        if (byEmail) return byEmail;
      }
      const [created] =
        await tx`insert into users (email, name, role, oidc_subject) values (${email}, ${name}, ${o.defaultRole}, ${claims.sub}) returning *`;
      return created;
    });
    if (user!.disabled) return reply.redirect('/?login=disabled');
    reply.clearCookie('atrium_oidc', { path: '/api/auth/oidc' });
    setSessionCookie(
      reply,
      await createSession(sql, user!.id as string, req.headers['user-agent']),
      config,
    );
    return reply.redirect('/');
  });
}

export function newInviteToken() {
  return newSecret();
}
