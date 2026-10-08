import { randomUUID } from 'node:crypto';
import { asSystem } from '@atrium/db';
import type { Scenario } from '@atrium/schema';
import { z } from 'zod';
import { forbidden, notFound } from '../http/errors';
import { idParams } from '../http/query';
import { route } from '../http/route';
import { audit } from '../services/audit';
import type { Deps } from '../services/deps';
import { canEditScenarios } from '../services/policy';
import { approve } from '../services/review';

// biome-ignore lint/suspicious/noExplicitAny: database row
function toScenario(s: any): Scenario {
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? '',
    isTarget: s.isTarget,
    targetDate: s.targetDate ?? null,
    createdBy: s.createdBy ?? null,
    createdAt: new Date(s.createdAt).toISOString(),
    updatedAt: new Date(s.updatedAt).toISOString(),
    changeCount: Number(s.changeCount ?? 0),
  };
}

export function scenarioRoutes(deps: Deps) {
  const { sql } = deps;
  const body = z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(5000).optional(),
    isTarget: z.boolean().optional(),
    targetDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish(),
  });
  return [
    route({
      method: 'POST',
      url: '/api/v1/scenarios',
      summary: 'Create a target state or what-if scenario',
      tag: 'Scenarios',
      access: 'user',
      body,
      handler: async ({ body, ctx }) => {
        if (!canEditScenarios(ctx)) throw forbidden('Only architects can create scenarios.');
        const id = randomUUID();
        const row = await asSystem(sql, async (tx) => {
          if (body.isTarget) await tx`update scenarios set is_target = false where is_target`;
          const [r] = await tx`
            insert into scenarios (id, name, description, is_target, target_date, created_by)
            values (${id}, ${body.name}, ${body.description ?? ''}, ${!!body.isTarget}, ${body.targetDate ?? null}, ${ctx.name})
            returning *`;
          await audit(tx, ctx, 'scenario.create', { type: 'scenario', id }, { name: body.name });
          return r;
        });
        deps.hub.broadcast({ type: 'model.changed', ids: [], by: ctx.name, scenarioId: id });
        return toScenario(row);
      },
    }),
    route({
      method: 'PATCH',
      url: '/api/v1/scenarios/:id',
      summary: 'Rename a scenario, change its date, or make it the target',
      tag: 'Scenarios',
      access: 'user',
      params: idParams,
      body: body.partial(),
      handler: async ({ params, body, ctx }) => {
        if (!canEditScenarios(ctx)) throw forbidden();
        const row = await asSystem(sql, async (tx) => {
          if (body.isTarget)
            await tx`update scenarios set is_target = false where is_target and id <> ${params.id}`;
          const [r] = await tx`
            update scenarios set
              name = coalesce(${body.name ?? null}, name),
              description = coalesce(${body.description ?? null}, description),
              is_target = coalesce(${body.isTarget ?? null}, is_target),
              target_date = coalesce(${body.targetDate ?? null}::date, target_date),
              updated_at = now()
            where id = ${params.id} and archived_at is null returning *`;
          return r;
        });
        if (!row) throw notFound('That scenario');
        return toScenario(row);
      },
    }),
    route({
      method: 'DELETE',
      url: '/api/v1/scenarios/:id',
      summary: 'Archive a scenario',
      tag: 'Scenarios',
      access: 'user',
      params: idParams,
      handler: async ({ params, ctx }) => {
        if (!canEditScenarios(ctx)) throw forbidden();
        await sql`update scenarios set archived_at = now(), is_target = false where id = ${params.id}`;
        await audit(sql, ctx, 'scenario.archive', { type: 'scenario', id: params.id });
        return { ok: true };
      },
    }),
    route({
      method: 'POST',
      url: '/api/v1/scenarios/:id/apply',
      summary: 'Make a scenario reality: apply its changes to today',
      tag: 'Scenarios',
      access: 'user',
      params: idParams,
      handler: async ({ params, ctx }) => {
        if (!canEditScenarios(ctx)) throw forbidden();
        const sets =
          await sql`select id from changesets where scenario_id = ${params.id} and kind = 'scenario' and status = 'draft'`;
        for (const s of sets) {
          // Re-use the review path so history, derived fields and notifications stay consistent.
          await sql`update changesets set status = 'open', submitted_at = now() where id = ${s.id}`;
          await approve(deps, ctx, s.id as string, 'Applied from scenario');
        }
        await sql`update scenarios set archived_at = now(), is_target = false where id = ${params.id}`;
        return { ok: true, applied: sets.length };
      },
    }),
  ];
}
