import { asSystem } from '@atrium/db';
import { acmeTelco } from '@atrium/demo-data';
import {
  type CurrentUser,
  ELEMENT_TYPE_LIST,
  ENUM_LABELS,
  RELATION_TYPE_LIST,
  ROLES,
  type WorkspaceInfo,
} from '@atrium/schema';
import { z } from 'zod';
import { conflict, forbidden } from '../http/errors';
import { route } from '../http/route';
import type { Deps } from '../services/deps';
import { isAdmin } from '../services/policy';
import { clearModel, loadDataset } from '../services/seed';
import { getSetting, getWorkspace, setSetting, updateWorkspace } from '../services/workspace';
import { toScenario } from './scenarios';

interface Prefs {
  homeRole: string | null;
}

export function systemRoutes(deps: Deps) {
  const { sql, config } = deps;
  return [
    route({
      method: 'GET',
      url: '/api/health',
      summary: 'Health check',
      tag: 'System',
      access: 'public',
      handler: async () => {
        await sql`select 1`;
        return { ok: true, version: config.version, mode: config.mode };
      },
    }),
    route({
      method: 'GET',
      url: '/api/v1/meta',
      summary: 'The metamodel: element types, attributes and relation types',
      tag: 'System',
      access: 'any',
      handler: async () => ({
        elementTypes: ELEMENT_TYPE_LIST,
        relationTypes: RELATION_TYPE_LIST,
        labels: ENUM_LABELS,
      }),
    }),
    route({
      method: 'GET',
      url: '/api/v1/workspace',
      summary: 'Workspace information',
      tag: 'System',
      access: 'any',
      handler: async ({ ctx }): Promise<WorkspaceInfo> => {
        const ws = await getWorkspace(sql, config.workspaceName);
        const snapshot = await deps.store.snapshot(ctx.scope);
        const orgCount = [...snapshot.elements.values()].filter((e) => e.layer === 'org').length;
        const scenarios = await sql`
          select s.*, (select count(*)::int from changes c join changesets cs on cs.id = c.changeset_id
                       where cs.scenario_id = s.id and cs.status in ('draft','open')) as change_count
          from scenarios s where archived_at is null order by is_target desc, created_at`;
        return {
          name: ws.name,
          publicUrl: config.publicUrl,
          mode: config.mode,
          version: config.version,
          elementCount: orgCount,
          hasData: orgCount > 0,
          scenarios: scenarios.map(toScenario),
          features: {
            ai:
              deps.ai.name === 'off' ? 'off' : deps.research.name === 'anthropic' ? 'live' : 'mock',
            eolLookup: config.eolLookup,
            sso: !!config.oidc,
            research: { label: deps.research.label, live: deps.research.live },
          },
        };
      },
    }),
    route({
      method: 'GET',
      url: '/api/v1/me',
      summary: 'The signed-in person',
      tag: 'System',
      access: 'user',
      handler: async ({ ctx }): Promise<CurrentUser & { homeRole: string }> => {
        const [u] = await asSystem(sql, (tx) => tx`select * from users where id = ${ctx.userId}`);
        const prefs = await getSetting<Prefs>(sql, `prefs:${ctx.userId}`, { homeRole: null });
        return {
          id: ctx.userId!,
          name: ctx.name,
          email: ctx.email,
          role: ctx.role,
          teamIds: ctx.teamIds,
          mode: config.mode,
          theme: (u?.theme as CurrentUser['theme']) ?? 'system',
          onboarded: !!u?.onboarded,
          homeRole: prefs.homeRole ?? (config.mode === 'solo' ? 'architect' : ctx.role),
        };
      },
    }),
    route({
      method: 'PATCH',
      url: '/api/v1/me',
      summary: 'Update your name, theme or home view',
      tag: 'System',
      access: 'user',
      body: z.object({
        name: z.string().trim().min(1).max(120).optional(),
        theme: z.enum(['light', 'dark', 'system']).optional(),
        onboarded: z.boolean().optional(),
        homeRole: z.enum(ROLES).optional(),
      }),
      handler: async ({ body, ctx }) => {
        await asSystem(sql, async (tx) => {
          if (body.name) await tx`update users set name = ${body.name} where id = ${ctx.userId}`;
          if (body.theme) await tx`update users set theme = ${body.theme} where id = ${ctx.userId}`;
          if (body.onboarded !== undefined)
            await tx`update users set onboarded = ${body.onboarded} where id = ${ctx.userId}`;
          if (body.homeRole)
            await setSetting(tx, `prefs:${ctx.userId}`, { homeRole: body.homeRole });
        });
        if (body.name) deps.onUserChanged?.();
        return { ok: true };
      },
    }),
    route({
      method: 'POST',
      url: '/api/v1/onboarding/sample',
      summary: 'Load the Acme Telco sample model',
      tag: 'System',
      access: 'user',
      handler: async ({ ctx }) => {
        if (!isAdmin(ctx)) throw forbidden('Only admins can load sample data.');
        const snapshot = await deps.store.snapshot(ctx.scope);
        if ([...snapshot.elements.values()].some((e) => e.layer === 'org')) {
          throw conflict('Your workspace already has data. Clear it first to load the sample.');
        }
        return loadDataset(deps, acmeTelco);
      },
    }),
    route({
      method: 'POST',
      url: '/api/v1/onboarding/reset',
      summary: 'Remove all model data (keeps people and tokens)',
      tag: 'System',
      access: 'user',
      body: z.object({ confirm: z.literal('DELETE') }),
      handler: async ({ ctx }) => {
        if (!isAdmin(ctx)) throw forbidden('Only admins can clear the workspace.');
        await clearModel(deps);
        return { ok: true };
      },
    }),
    route({
      method: 'PATCH',
      url: '/api/v1/workspace',
      summary: 'Rename the workspace',
      tag: 'System',
      access: 'user',
      body: z.object({ name: z.string().trim().min(1).max(80) }),
      handler: async ({ body, ctx }) => {
        if (!isAdmin(ctx)) throw forbidden();
        return updateWorkspace(sql, config.workspaceName, { name: body.name });
      },
    }),
  ];
}
