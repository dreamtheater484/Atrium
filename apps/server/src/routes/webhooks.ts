import { z } from 'zod';
import { forbidden, notFound } from '../http/errors';
import { idParams } from '../http/query';
import { route } from '../http/route';
import { audit } from '../services/audit';
import type { Deps } from '../services/deps';
import { isAdmin } from '../services/policy';
import { addWebhook, deliver, listWebhooks, publicHook, removeWebhook } from '../services/webhooks';

export function webhookRoutes(deps: Deps) {
  const { sql } = deps;
  const adminOnly = (ctx: Parameters<typeof isAdmin>[0]) => {
    if (!isAdmin(ctx)) throw forbidden('Only admins can manage webhooks.');
  };
  return [
    route({
      method: 'GET',
      url: '/api/v1/webhooks',
      summary: 'Addresses Atrium notifies when the model changes',
      tag: 'Webhooks',
      access: 'user',
      handler: async ({ ctx }) => {
        adminOnly(ctx);
        return (await listWebhooks(sql)).map(publicHook);
      },
    }),
    route({
      method: 'POST',
      url: '/api/v1/webhooks',
      summary: 'Add a webhook; the response shows its signing secret once',
      tag: 'Webhooks',
      access: 'user',
      body: z.object({ url: z.string().url().max(500) }),
      handler: async ({ body, ctx }) => {
        adminOnly(ctx);
        const hook = await addWebhook(sql, body.url, ctx.name);
        await audit(
          sql,
          ctx,
          'webhook.create',
          { type: 'webhook', id: hook.id },
          { url: hook.url },
        );
        return hook;
      },
    }),
    route({
      method: 'POST',
      url: '/api/v1/webhooks/:id/test',
      summary: 'Send a test delivery',
      tag: 'Webhooks',
      access: 'user',
      params: idParams,
      handler: async ({ params, ctx }) => {
        adminOnly(ctx);
        const hook = (await listWebhooks(sql)).find((h) => h.id === params.id);
        if (!hook) throw notFound('That webhook');
        return deliver(sql, hook, {
          event: 'ping',
          at: new Date().toISOString(),
          elementIds: [],
          changesets: [],
          by: [ctx.name],
        });
      },
    }),
    route({
      method: 'DELETE',
      url: '/api/v1/webhooks/:id',
      summary: 'Remove a webhook',
      tag: 'Webhooks',
      access: 'user',
      params: idParams,
      handler: async ({ params, ctx }) => {
        adminOnly(ctx);
        await removeWebhook(sql, params.id);
        await audit(sql, ctx, 'webhook.delete', { type: 'webhook', id: params.id });
        return { ok: true };
      },
    }),
  ];
}
