import { z } from 'zod';
import { notFound } from '../http/errors';
import { idParams } from '../http/query';
import { route } from '../http/route';
import type { Deps } from '../services/deps';
import { researchCandidates, researchJob, startResearch } from '../services/research';

export function researchRoutes(deps: Deps) {
  return [
    route({
      method: 'GET',
      url: '/api/v1/research/support',
      summary: 'Technologies and vendor products whose support dates can be researched',
      tag: 'Research',
      access: 'user',
      handler: async ({ ctx }) => researchCandidates(deps, ctx),
    }),
    route({
      method: 'POST',
      url: '/api/v1/research/support',
      summary:
        'Research support dates (endoflife.date, then the AI provider); results come back as a suggestion to review',
      tag: 'Research',
      access: 'user',
      body: z.object({ ids: z.array(z.string().uuid()).max(500).optional() }),
      handler: async ({ body, ctx }) => startResearch(deps, ctx, body.ids),
    }),
    route({
      method: 'GET',
      url: '/api/v1/research/jobs/:id',
      summary: 'Progress of a research run',
      tag: 'Research',
      access: 'user',
      params: idParams,
      handler: async ({ params }) => {
        const job = researchJob(params.id);
        if (!job) throw notFound('That research run');
        return job;
      },
    }),
  ];
}
