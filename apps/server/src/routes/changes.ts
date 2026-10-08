import { z } from 'zod';
import { boolParam, idParams } from '../http/query';
import { route } from '../http/route';
import type { Deps } from '../services/deps';
import {
  approve,
  changesetDetail,
  changesSummary,
  discardChange,
  listChangesets,
  reject,
  submitDraft,
  undo,
  withdraw,
} from '../services/review';

const actionBody = z.object({
  note: z.string().max(2000).optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
});

export function changeRoutes(deps: Deps) {
  return [
    route({
      method: 'GET',
      url: '/api/v1/changesets/summary',
      summary: 'Counts for the Changes badge',
      tag: 'Changes',
      access: 'user',
      handler: async ({ ctx }) => changesSummary(deps, ctx),
    }),
    route({
      method: 'GET',
      url: '/api/v1/changesets',
      summary: 'Suggestions, history and scenario work',
      tag: 'Changes',
      access: 'user',
      query: z.object({
        status: z.string().optional(),
        kind: z.string().optional(),
        scenarioId: z.string().uuid().optional(),
        elementId: z.string().uuid().optional(),
        mine: boolParam,
        limit: z.coerce.number().int().min(1).max(500).optional(),
      }),
      handler: async ({ query, ctx }) => listChangesets(deps, ctx, query),
    }),
    route({
      method: 'GET',
      url: '/api/v1/changesets/:id',
      summary: 'A change set with a field-by-field diff',
      tag: 'Changes',
      access: 'any',
      params: idParams,
      handler: async ({ params, ctx }) => changesetDetail(deps, ctx, params.id),
    }),
    route({
      method: 'POST',
      url: '/api/v1/changesets/:id/submit',
      summary: 'Submit your draft suggestions for review',
      tag: 'Changes',
      access: 'user',
      params: idParams,
      body: actionBody,
      handler: async ({ params, body, ctx }) =>
        submitDraft(deps, ctx, params.id, body.title, body.description),
    }),
    route({
      method: 'POST',
      url: '/api/v1/changesets/:id/approve',
      summary: 'Approve a suggestion and apply it',
      tag: 'Changes',
      access: 'user',
      params: idParams,
      body: actionBody,
      handler: async ({ params, body, ctx }) => approve(deps, ctx, params.id, body.note),
    }),
    route({
      method: 'POST',
      url: '/api/v1/changesets/:id/reject',
      summary: 'Decline a suggestion',
      tag: 'Changes',
      access: 'user',
      params: idParams,
      body: actionBody,
      handler: async ({ params, body, ctx }) => reject(deps, ctx, params.id, body.note),
    }),
    route({
      method: 'POST',
      url: '/api/v1/changesets/:id/withdraw',
      summary: 'Withdraw a suggestion',
      tag: 'Changes',
      access: 'user',
      params: idParams,
      body: actionBody,
      handler: async ({ params, ctx }) => withdraw(deps, ctx, params.id),
    }),
    route({
      method: 'POST',
      url: '/api/v1/changesets/:id/undo',
      summary: 'Undo an applied change',
      tag: 'Changes',
      access: 'user',
      params: idParams,
      body: actionBody,
      handler: async ({ params, ctx }) => undo(deps, ctx, params.id),
    }),
    route({
      method: 'DELETE',
      url: '/api/v1/changesets/:id/changes/:changeId',
      summary: 'Drop one change from a draft or scenario',
      tag: 'Changes',
      access: 'user',
      params: z.object({ id: z.string().uuid(), changeId: z.string().uuid() }),
      handler: async ({ params, ctx }) => discardChange(deps, ctx, params.id, params.changeId),
    }),
  ];
}
