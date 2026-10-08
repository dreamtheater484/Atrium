import { z } from 'zod';
import { notFound } from '../http/errors';
import { idParams } from '../http/query';
import { route } from '../http/route';
import type { Deps } from '../services/deps';

const widget = z.object({
  id: z.string().max(100),
  widget: z.string().max(60),
  size: z.enum(['s', 'm', 'l']),
});
const body = z.object({
  name: z.string().trim().min(1).max(120),
  widgets: z.array(widget).max(40),
});

// biome-ignore lint/suspicious/noExplicitAny: database row
const toSpec = (r: any) => ({
  id: r.id as string,
  name: r.name as string,
  description: 'Your dashboard',
  template: false,
  widgets: r.widgets,
  ownerId: r.ownerId,
});

/** Saved dashboards. Built-in templates live in the web app and need no storage. */
export function dashboardRoutes(deps: Deps) {
  const { sql } = deps;
  return [
    route({
      method: 'GET',
      url: '/api/v1/dashboards',
      summary: 'Saved dashboards',
      tag: 'Dashboards',
      access: 'user',
      handler: async ({ ctx }) =>
        (
          await sql`select * from dashboards where owner_id = ${ctx.userId} or owner_id is null order by name`
        ).map(toSpec),
    }),
    route({
      method: 'POST',
      url: '/api/v1/dashboards',
      summary: 'Save a new dashboard',
      tag: 'Dashboards',
      access: 'user',
      body,
      handler: async ({ body, ctx }) => {
        const [r] = await sql`insert into dashboards (name, widgets, owner_id)
          values (${body.name}, ${sql.json(body.widgets as never)}, ${ctx.userId}) returning *`;
        return toSpec(r);
      },
    }),
    route({
      method: 'PUT',
      url: '/api/v1/dashboards/:id',
      summary: 'Update a dashboard',
      tag: 'Dashboards',
      access: 'user',
      params: idParams,
      body,
      handler: async ({ params, body, ctx }) => {
        const [r] =
          await sql`update dashboards set name = ${body.name}, widgets = ${sql.json(body.widgets as never)}, updated_at = now()
          where id = ${params.id} and (owner_id = ${ctx.userId} or owner_id is null) returning *`;
        if (!r) throw notFound('That dashboard');
        return toSpec(r);
      },
    }),
    route({
      method: 'DELETE',
      url: '/api/v1/dashboards/:id',
      summary: 'Delete a dashboard',
      tag: 'Dashboards',
      access: 'user',
      params: idParams,
      handler: async ({ params, ctx }) => {
        await sql`delete from dashboards where id = ${params.id} and owner_id = ${ctx.userId}`;
        return { ok: true };
      },
    }),
  ];
}
