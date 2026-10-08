import { ELEMENT_TYPES, type ElementType } from '@atrium/schema';
import { z } from 'zod';
import { idParams, listParam, resolveScenario } from '../http/query';
import { route } from '../http/route';
import { ask } from '../services/ask';
import type { Deps } from '../services/deps';
import { overview } from '../services/stats';
import {
  capabilityMap,
  type GraphMode,
  graph,
  impact,
  landscape,
  roadmap,
} from '../services/views';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export function viewRoutes(deps: Deps) {
  return [
    route({
      method: 'GET',
      url: '/api/v1/stats/overview',
      summary: 'Portfolio overview: health, cost, risks, end of life, quality',
      tag: 'Views',
      access: 'any',
      query: z.object({ scenario: z.string().optional(), at: date }),
      handler: async ({ query, ctx }) =>
        overview(deps, ctx, {
          scenarioId: await resolveScenario(deps.sql, query.scenario),
          at: query.at,
        }),
    }),
    route({
      method: 'GET',
      url: '/api/v1/elements/:id/impact',
      summary: 'What is affected if this element changes or is retired',
      tag: 'Views',
      access: 'any',
      params: idParams,
      query: z.object({
        scenario: z.string().optional(),
        depth: z.coerce.number().int().min(1).max(8).optional(),
      }),
      handler: async ({ params, query, ctx }) =>
        impact(deps, ctx, params.id, {
          scenarioId: await resolveScenario(deps.sql, query.scenario),
          depth: query.depth,
        }),
    }),
    route({
      method: 'GET',
      url: '/api/v1/views/graph',
      summary: 'Nodes and edges for dependency, data-flow, context or impact graphs',
      tag: 'Views',
      access: 'any',
      query: z.object({
        focus: z.string().uuid().optional(),
        depth: z.coerce.number().int().min(1).max(6).optional(),
        mode: z.enum(['dependencies', 'dataflow', 'impact', 'context']).optional(),
        types: listParam,
        domainId: z.string().uuid().optional(),
        scenario: z.string().optional(),
        at: date,
        limit: z.coerce.number().int().min(10).max(2000).optional(),
      }),
      handler: async ({ query, ctx }) =>
        graph(deps, ctx, {
          ...query,
          mode: query.mode as GraphMode | undefined,
          types: query.types?.filter((t) => (ELEMENT_TYPES as readonly string[]).includes(t)) as
            | ElementType[]
            | undefined,
          scenarioId: await resolveScenario(deps.sql, query.scenario),
        }),
    }),
    route({
      method: 'GET',
      url: '/api/v1/views/capability-map',
      summary: 'Capability hierarchy with supporting applications, cost and health',
      tag: 'Views',
      access: 'any',
      query: z.object({
        scenario: z.string().optional(),
        at: date,
        domainId: z.string().uuid().optional(),
        layer: z.enum(['org', 'reference']).optional(),
        pack: z.string().optional(),
      }),
      handler: async ({ query, ctx }) =>
        capabilityMap(deps, ctx, {
          ...query,
          scenarioId: await resolveScenario(deps.sql, query.scenario),
        }),
    }),
    route({
      method: 'GET',
      url: '/api/v1/views/landscape',
      summary: 'Elements grouped by domain',
      tag: 'Views',
      access: 'any',
      query: z.object({
        scenario: z.string().optional(),
        at: date,
        type: z.enum(ELEMENT_TYPES).optional(),
      }),
      handler: async ({ query, ctx }) =>
        landscape(deps, ctx, {
          ...query,
          scenarioId: await resolveScenario(deps.sql, query.scenario),
        }),
    }),
    route({
      method: 'GET',
      url: '/api/v1/views/roadmap',
      summary: 'Initiatives and lifecycles over time',
      tag: 'Views',
      access: 'any',
      query: z.object({ scenario: z.string().optional() }),
      handler: async ({ query, ctx }) =>
        roadmap(deps, ctx, { scenarioId: await resolveScenario(deps.sql, query.scenario) }),
    }),
    route({
      method: 'POST',
      url: '/api/v1/ask',
      summary: 'Ask a question about the architecture in plain language',
      tag: 'Views',
      access: 'any',
      body: z.object({ q: z.string().min(1).max(500), scenario: z.string().optional() }),
      handler: async ({ body, ctx }) =>
        ask(deps, ctx, body.q, await resolveScenario(deps.sql, body.scenario)),
    }),
  ];
}
