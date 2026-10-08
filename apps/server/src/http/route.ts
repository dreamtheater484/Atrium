import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestContext } from '../auth/context';
import { badRequest } from './errors';

export type Access =
  /** No authentication needed (login page, health check). */
  | 'public'
  /** A signed-in person. */
  | 'user'
  /** A signed-in person or an API/agent/CI token. */
  | 'any';

export interface HandlerArgs<Q, B, P> {
  query: Q;
  body: B;
  params: P;
  ctx: RequestContext;
  req: FastifyRequest;
  reply: FastifyReply;
}

export interface RouteDef<Q = unknown, B = unknown, P = unknown> {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  summary: string;
  tag: string;
  access?: Access;
  query?: z.ZodType<Q>;
  body?: z.ZodType<B>;
  params?: z.ZodType<P>;
  /** Raw body handling (file uploads): skip JSON body validation. */
  multipart?: boolean;
  handler: (args: HandlerArgs<Q, B, P>) => Promise<unknown>;
}

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous route list
export type AnyRoute = RouteDef<any, any, any>;

export function route<Q = unknown, B = unknown, P = unknown>(def: RouteDef<Q, B, P>): AnyRoute {
  return def as AnyRoute;
}

function parse<T>(schema: z.ZodType<T> | undefined, value: unknown, where: string): T {
  if (!schema) return value as T;
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join('.') || where;
    throw badRequest(`${path}: ${first?.message ?? 'invalid value'}`, z.treeifyError(result.error));
  }
  return result.data;
}

export function registerRoutes(app: FastifyInstance, routes: AnyRoute[]) {
  for (const r of routes) {
    app.route({
      method: r.method,
      url: r.url,
      config: { access: r.access ?? 'user' },
      handler: async (req, reply) => {
        const ctx = req.ctx;
        const query = parse(r.query, req.query, 'query');
        const params = parse(r.params, req.params, 'params');
        const body = r.multipart ? undefined : parse(r.body, req.body, 'body');
        const result = await r.handler({ query, body, params, ctx, req, reply });
        if (reply.sent) return reply;
        if (result === undefined) return reply.code(204).send();
        return result;
      },
    });
  }
}

/** Builds an OpenAPI 3.1 document from the registered routes. */
export function openApiDocument(routes: AnyRoute[], info: { version: string; serverUrl: string }) {
  const paths: Record<string, Record<string, unknown>> = {};
  const toJson = (s: z.ZodType) => {
    try {
      return z.toJSONSchema(s, { unrepresentable: 'any', io: 'input' });
    } catch {
      return {};
    }
  };
  for (const r of routes) {
    if (!r.url.startsWith('/api/v1/')) continue;
    const path = r.url.replace(/:([a-zA-Z]+)/g, '{$1}');
    const params: unknown[] = [];
    for (const m of r.url.matchAll(/:([a-zA-Z]+)/g)) {
      params.push({ name: m[1], in: 'path', required: true, schema: { type: 'string' } });
    }
    if (r.query) {
      const js = toJson(r.query) as { properties?: Record<string, unknown>; required?: string[] };
      for (const [name, schema] of Object.entries(js.properties ?? {})) {
        params.push({ name, in: 'query', required: js.required?.includes(name) ?? false, schema });
      }
    }
    const op: Record<string, unknown> = {
      summary: r.summary,
      tags: [r.tag],
      parameters: params,
      responses: { '200': { description: 'OK' } },
      security: r.access === 'public' ? [] : [{ bearer: [] }, { session: [] }],
    };
    if (r.body) {
      op.requestBody = {
        required: true,
        content: { 'application/json': { schema: toJson(r.body) } },
      };
    }
    if (r.multipart) {
      op.requestBody = {
        required: true,
        content: {
          'multipart/form-data': {
            schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
          },
        },
      };
    }
    paths[path] ??= {};
    paths[path][r.method.toLowerCase()] = op;
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Atrium API',
      version: info.version,
      description:
        'The Atrium REST API. Authenticate with a session (browser) or a bearer token created under Settings → Agents and tokens.',
    },
    servers: [{ url: info.serverUrl }],
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer' },
        session: { type: 'apiKey', in: 'cookie', name: 'atrium_session' },
      },
    },
    paths,
  };
}
