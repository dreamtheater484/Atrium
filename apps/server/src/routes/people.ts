import { asSystem } from '@atrium/db';
import { CLASSIFICATIONS, ROLES } from '@atrium/schema';
import { z } from 'zod';
import { newSecret, sha256 } from '../auth/crypto';
import { badRequest, forbidden, notFound } from '../http/errors';
import { boolParam, idParams } from '../http/query';
import { route } from '../http/route';
import { audit } from '../services/audit';
import type { Deps } from '../services/deps';
import { canReview, isAdmin } from '../services/policy';

// biome-ignore lint/suspicious/noExplicitAny: database row
const toUser = (u: any) => ({
  id: u.id as string,
  name: u.name as string,
  email: (u.email as string) ?? null,
  role: u.role as string,
  teamIds: (u.teamIds as string[]) ?? [],
  disabled: !!u.disabled,
  sso: !!u.oidcSubject,
  hasPassword: !!u.passwordHash,
  lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
  createdAt: new Date(u.createdAt).toISOString(),
});

// biome-ignore lint/suspicious/noExplicitAny: database row
const toToken = (t: any) => ({
  id: t.id as string,
  name: t.name as string,
  kind: t.kind as string,
  prefix: t.prefix as string,
  client: (t.client as string) ?? null,
  canPropose: !!t.canPropose,
  domainIds: (t.domainIds as string[] | null) ?? null,
  maxClassification: t.maxClassification as string,
  userName: (t.userName as string) ?? null,
  expiresAt: t.expiresAt ? new Date(t.expiresAt).toISOString() : null,
  lastUsedAt: t.lastUsedAt ? new Date(t.lastUsedAt).toISOString() : null,
  revokedAt: t.revokedAt ? new Date(t.revokedAt).toISOString() : null,
  createdAt: new Date(t.createdAt).toISOString(),
});

export function peopleRoutes(deps: Deps) {
  const { sql, config } = deps;
  return [
    /* ---------------- People ---------------- */
    route({
      method: 'GET',
      url: '/api/v1/users',
      summary: 'People with access to this workspace',
      tag: 'People',
      access: 'user',
      handler: async () =>
        (
          await asSystem(
            sql,
            (tx) =>
              tx`select * from users where email is distinct from 'you@localhost' order by name`,
          )
        ).map(toUser),
    }),
    route({
      method: 'POST',
      url: '/api/v1/users',
      summary: 'Add a person and get an invite link to share with them',
      tag: 'People',
      access: 'user',
      body: z.object({
        name: z.string().trim().min(1).max(120),
        email: z.email(),
        role: z.enum(ROLES),
        teamIds: z.array(z.string().uuid()).optional(),
      }),
      handler: async ({ body, ctx }) => {
        if (!isAdmin(ctx)) throw forbidden('Only admins can add people.');
        const token = newSecret();
        const user = await asSystem(sql, async (tx) => {
          const [u] = await tx`
            insert into users (email, name, role, team_ids) values (${body.email.toLowerCase()}, ${body.name}, ${body.role}, ${body.teamIds ?? []}::uuid[])
            on conflict (email) do update set name = excluded.name, role = excluded.role
            returning *`;
          await tx`insert into invites (token_hash, user_id, created_by, expires_at)
                   values (${sha256(token)}, ${u!.id}, ${ctx.name}, now() + interval '14 days')`;
          await audit(
            tx,
            ctx,
            'user.invite',
            { type: 'user', id: u!.id as string },
            { role: body.role },
          );
          return u;
        });
        return { user: toUser(user), inviteUrl: `${config.publicUrl}/invite/${token}` };
      },
    }),
    route({
      method: 'POST',
      url: '/api/v1/users/:id/invite',
      summary: 'Create a fresh invite (or password reset) link',
      tag: 'People',
      access: 'user',
      params: idParams,
      handler: async ({ params, ctx }) => {
        if (!isAdmin(ctx)) throw forbidden();
        const token = newSecret();
        await asSystem(
          sql,
          (tx) => tx`insert into invites (token_hash, user_id, created_by, expires_at)
          values (${sha256(token)}, ${params.id}, ${ctx.name}, now() + interval '14 days')`,
        );
        return { inviteUrl: `${config.publicUrl}/invite/${token}` };
      },
    }),
    route({
      method: 'PATCH',
      url: '/api/v1/users/:id',
      summary: "Change someone's role, teams or access",
      tag: 'People',
      access: 'user',
      params: idParams,
      body: z.object({
        role: z.enum(ROLES).optional(),
        teamIds: z.array(z.string().uuid()).optional(),
        disabled: z.boolean().optional(),
        name: z.string().trim().min(1).max(120).optional(),
      }),
      handler: async ({ params, body, ctx }) => {
        const self = params.id === ctx.userId;
        if (!isAdmin(ctx) && !(self && body.role === undefined && body.disabled === undefined))
          throw forbidden();
        if (self && body.disabled) throw badRequest("You can't disable your own account.");
        const [u] = await asSystem(
          sql,
          (tx) => tx`
          update users set
            role = coalesce(${body.role ?? null}, role),
            team_ids = coalesce(${body.teamIds ?? null}::uuid[], team_ids),
            disabled = coalesce(${body.disabled ?? null}, disabled),
            name = coalesce(${body.name ?? null}, name)
          where id = ${params.id} returning *`,
        );
        if (!u) throw notFound('That person');
        if (body.disabled)
          await asSystem(sql, (tx) => tx`delete from sessions where user_id = ${params.id}`);
        if (self) deps.onUserChanged?.();
        return toUser(u);
      },
    }),

    /* ---------------- Agent, CI and API tokens ---------------- */
    route({
      method: 'GET',
      url: '/api/v1/tokens',
      summary: 'Tokens for coding agents, CI and the API',
      tag: 'Tokens',
      access: 'user',
      query: z.object({ all: boolParam }),
      handler: async ({ query, ctx }) => {
        const all = query.all && isAdmin(ctx);
        const rows = await asSystem(
          sql,
          (tx) => tx`
          select t.*, u.name as user_name from api_tokens t left join users u on u.id = t.user_id
          where ${all ? tx`true` : tx`t.user_id = ${ctx.userId}`}
          order by t.revoked_at nulls first, t.created_at desc`,
        );
        return rows.map(toToken);
      },
    }),
    route({
      method: 'POST',
      url: '/api/v1/tokens',
      summary: 'Create a token. The secret is shown once.',
      tag: 'Tokens',
      access: 'user',
      body: z.object({
        name: z.string().trim().min(1).max(80),
        kind: z.enum(['agent', 'ci', 'api']),
        client: z.string().max(40).optional(),
        canPropose: z.boolean().default(false),
        domainIds: z.array(z.string().uuid()).nullable().optional(),
        maxClassification: z.enum(CLASSIFICATIONS).default('internal'),
        expiresInDays: z.number().int().min(1).max(730).nullable().default(90),
      }),
      handler: async ({ body, ctx }) => {
        if (ctx.role === 'viewer') throw forbidden('Viewers cannot create tokens.');
        if (body.maxClassification === 'restricted' && !isAdmin(ctx))
          throw forbidden('Only admins can create tokens that see restricted information.');
        const secret = newSecret('atr_');
        const [t] = await asSystem(sql, async (tx) => {
          const rows = await tx`
            insert into api_tokens (name, kind, token_hash, prefix, user_id, can_propose, domain_ids, max_classification, client, expires_at)
            values (${body.name}, ${body.kind}, ${sha256(secret)}, ${secret.slice(0, 10)}, ${ctx.userId}, ${body.canPropose},
                    ${body.domainIds?.length ? body.domainIds : null}::uuid[], ${body.maxClassification}, ${body.client ?? null},
                    ${body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 864e5) : null})
            returning *`;
          await audit(
            tx,
            ctx,
            'token.create',
            { type: 'token', id: rows[0]!.id as string },
            {
              kind: body.kind,
              canPropose: body.canPropose,
              maxClassification: body.maxClassification,
            },
          );
          return rows;
        });
        return { token: secret, ...toToken(t) };
      },
    }),
    route({
      method: 'DELETE',
      url: '/api/v1/tokens/:id',
      summary: 'Revoke a token immediately',
      tag: 'Tokens',
      access: 'user',
      params: idParams,
      handler: async ({ params, ctx }) => {
        const rows = await asSystem(
          sql,
          (tx) => tx`
          update api_tokens set revoked_at = now()
          where id = ${params.id} and revoked_at is null and (user_id = ${ctx.userId} or ${isAdmin(ctx)}) returning id`,
        );
        if (!rows.length) throw notFound('That token');
        await audit(sql, ctx, 'token.revoke', { type: 'token', id: params.id });
        return { ok: true };
      },
    }),
    route({
      method: 'GET',
      url: '/api/v1/audit',
      summary: 'Audit log: logins, agent activity, approvals, exports',
      tag: 'Tokens',
      access: 'user',
      query: z.object({
        tokenId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(1000).optional(),
        agentsOnly: boolParam,
      }),
      handler: async ({ query, ctx }) => {
        if (!canReview(ctx) && !query.tokenId) throw forbidden();
        if (query.tokenId && !canReview(ctx)) {
          const [own] = await asSystem(
            sql,
            (tx) =>
              tx`select 1 from api_tokens where id = ${query.tokenId!} and user_id = ${ctx.userId}`,
          );
          if (!own) throw forbidden();
        }
        const rows = await asSystem(
          sql,
          (tx) => tx`
          select a.*, t.name as token_name from audit_log a left join api_tokens t on t.id = a.token_id
          where ${query.tokenId ? tx`a.token_id = ${query.tokenId}` : tx`true`}
            and ${query.agentsOnly ? tx`a.token_id is not null` : tx`true`}
          order by a.at desc limit ${query.limit ?? 200}`,
        );
        return rows.map((r) => ({
          id: Number(r.id),
          at: new Date(r.at as string).toISOString(),
          actorKind: r.actorKind,
          actorName: r.tokenName ?? r.actorName,
          action: r.action,
          targetType: r.targetType,
          targetId: r.targetId,
          details: r.details,
        }));
      },
    }),

    /* ---------------- Notifications ---------------- */
    route({
      method: 'GET',
      url: '/api/v1/notifications',
      summary: 'Your notifications',
      tag: 'People',
      access: 'user',
      handler: async ({ ctx }) => {
        const rows =
          await sql`select * from notifications where user_id = ${ctx.userId} order by created_at desc limit 50`;
        return rows.map((n) => ({
          id: n.id,
          kind: n.kind,
          title: n.title,
          body: n.body,
          link: n.link,
          createdAt: new Date(n.createdAt as string).toISOString(),
          read: !!n.readAt,
        }));
      },
    }),
    route({
      method: 'POST',
      url: '/api/v1/notifications/read',
      summary: 'Mark all notifications as read',
      tag: 'People',
      access: 'user',
      handler: async ({ ctx }) => {
        await sql`update notifications set read_at = now() where user_id = ${ctx.userId} and read_at is null`;
        return { ok: true };
      },
    }),
  ];
}
