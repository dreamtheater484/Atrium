import {
  createElementInput,
  createRelationInput,
  ELEMENT_TYPES,
  type ElementType,
  HEALTH,
  LIFECYCLE_PHASES,
  updateElementInput,
} from '@atrium/schema';
import { z } from 'zod';
import { boolParam, idParams, listParam, resolveScenario } from '../http/query';
import { route } from '../http/route';
import type { Deps } from '../services/deps';
import { createElement, createRelation, deleteElement, deleteRelation, updateElement } from '../services/model';
import { elementDetail, listElements, typeCounts } from '../services/read';
import { search } from '../services/search';

const scenarioQuery = z.object({ scenario: z.string().optional() });

const listQuery = z.object({
  type: z.enum(ELEMENT_TYPES).optional(),
  types: listParam,
  q: z.string().optional(),
  domainId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  lifecycle: z.enum(LIFECYCLE_PHASES).optional(),
  health: z.enum([...HEALTH, 'unknown']).optional(),
  layer: z.enum(['org', 'reference', 'all']).optional(),
  pack: z.string().optional(),
  gaps: boolParam,
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.string().optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(10000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  scenario: z.string().optional(),
});

export function elementRoutes(deps: Deps) {
  return [
    route({
      method: 'GET',
      url: '/api/v1/elements',
      summary: 'List elements, with filters',
      tag: 'Model',
      access: 'any',
      query: listQuery,
      handler: async ({ query, ctx }) => {
        const scenarioId = await resolveScenario(deps.sql, query.scenario);
        return listElements(deps, ctx, { ...query, types: query.types as ElementType[] | undefined, scenarioId });
      },
    }),
    route({
      method: 'GET',
      url: '/api/v1/elements/counts',
      summary: 'Number of elements per type',
      tag: 'Model',
      access: 'any',
      query: scenarioQuery,
      handler: async ({ query, ctx }) => typeCounts(deps, ctx, await resolveScenario(deps.sql, query.scenario)),
    }),
    route({
      method: 'GET',
      url: '/api/v1/elements/:id',
      summary: 'One element with its relations, gaps and suggestions',
      tag: 'Model',
      access: 'any',
      params: idParams,
      query: scenarioQuery,
      handler: async ({ params, query, ctx }) =>
        elementDetail(deps, ctx, params.id, { scenarioId: await resolveScenario(deps.sql, query.scenario) }),
    }),
    route({
      method: 'POST',
      url: '/api/v1/elements',
      summary: 'Create an element (direct, as a suggestion, or in a scenario)',
      tag: 'Model',
      access: 'any',
      query: scenarioQuery,
      body: createElementInput,
      handler: async ({ body, query, ctx }) => {
        const r = await createElement(deps, ctx, body, { scenarioId: await resolveScenario(deps.sql, query.scenario) });
        return { element: r.item, mode: r.mode, changesetId: r.changesetId };
      },
    }),
    route({
      method: 'PATCH',
      url: '/api/v1/elements/:id',
      summary: 'Change fields of an element',
      tag: 'Model',
      access: 'any',
      params: idParams,
      query: scenarioQuery,
      body: updateElementInput,
      handler: async ({ params, body, query, ctx }) => {
        const r = await updateElement(deps, ctx, params.id, body, {
          scenarioId: await resolveScenario(deps.sql, query.scenario),
        });
        return { element: r.item, mode: r.mode, changesetId: r.changesetId };
      },
    }),
    route({
      method: 'DELETE',
      url: '/api/v1/elements/:id',
      summary: 'Remove an element (can be undone from history)',
      tag: 'Model',
      access: 'any',
      params: idParams,
      query: scenarioQuery,
      handler: async ({ params, query, ctx }) => {
        const r = await deleteElement(deps, ctx, params.id, { scenarioId: await resolveScenario(deps.sql, query.scenario) });
        return { mode: r.mode, changesetId: r.changesetId };
      },
    }),
    route({
      method: 'POST',
      url: '/api/v1/relations',
      summary: 'Link two elements',
      tag: 'Model',
      access: 'any',
      query: scenarioQuery,
      body: createRelationInput,
      handler: async ({ body, query, ctx }) => {
        const r = await createRelation(deps, ctx, body, { scenarioId: await resolveScenario(deps.sql, query.scenario) });
        return { relation: r.item, mode: r.mode, changesetId: r.changesetId };
      },
    }),
    route({
      method: 'DELETE',
      url: '/api/v1/relations/:id',
      summary: 'Remove a link between two elements',
      tag: 'Model',
      access: 'any',
      params: idParams,
      query: scenarioQuery,
      handler: async ({ params, query, ctx }) => {
        const r = await deleteRelation(deps, ctx, params.id, { scenarioId: await resolveScenario(deps.sql, query.scenario) });
        return { mode: r.mode, changesetId: r.changesetId };
      },
    }),
    route({
      method: 'GET',
      url: '/api/v1/elements/:id/comments',
      summary: 'Comments on an element',
      tag: 'Model',
      access: 'user',
      params: idParams,
      handler: async ({ params }) => {
        const rows = await deps.sql`select id, author_name, body, created_at from comments where element_id = ${params.id} order by created_at`;
        return rows.map((r) => ({ id: r.id, authorName: r.authorName, body: r.body, createdAt: new Date(r.createdAt as string).toISOString() }));
      },
    }),
    route({
      method: 'POST',
      url: '/api/v1/elements/:id/comments',
      summary: 'Comment on an element',
      tag: 'Model',
      access: 'user',
      params: idParams,
      body: z.object({ body: z.string().trim().min(1).max(5000) }),
      handler: async ({ params, body, ctx }) => {
        const [r] = await deps.sql`insert into comments (element_id, author_id, author_name, body)
          values (${params.id}, ${ctx.userId}, ${ctx.name}, ${body.body}) returning id`;
        // Notify people mentioned with @Name
        for (const m of body.body.matchAll(/@([A-Z][\w-]+(?:\s[A-Z][\w-]+)?)/g)) {
          const [u] = await deps.sql`select id from users where name ilike ${`${m[1]}%`} limit 1`;
          if (u) {
            await deps.sql`insert into notifications (user_id, kind, title, body, link)
              values (${u.id}, 'mention', ${`${ctx.name} mentioned you`}, ${body.body.slice(0, 200)}, ${`/e/${params.id}`})`;
            deps.hub.broadcast({ type: 'notification', userId: u.id as string, title: `${ctx.name} mentioned you` });
          }
        }
        return { id: r!.id };
      },
    }),
    route({
      method: 'GET',
      url: '/api/v1/search',
      summary: 'Search everything you can see',
      tag: 'Model',
      access: 'any',
      query: z.object({
        q: z.string(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        types: listParam,
        layer: z.enum(['org', 'reference', 'all']).optional(),
        scenario: z.string().optional(),
      }),
      handler: async ({ query, ctx }) =>
        search(deps, ctx, query.q, {
          limit: query.limit,
          types: query.types as ElementType[] | undefined,
          layer: query.layer,
          scenarioId: await resolveScenario(deps.sql, query.scenario),
        }),
    }),
  ];
}
