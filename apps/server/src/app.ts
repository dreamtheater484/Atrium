import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuth, type UserRow } from './auth/auth';
import { HttpError } from './http/errors';
import { type AnyRoute, openApiDocument, registerRoutes } from './http/route';
import { elementRoutes } from './routes/elements';
import { systemRoutes } from './routes/system';
import type { Deps } from './services/deps';

export interface AppOptions {
  deps: Deps;
  soloUser: () => UserRow | null;
  /** Extra route groups (added as features land). */
  extraRoutes?: (deps: Deps) => AnyRoute[];
  logger?: boolean;
}

export async function buildApp({ deps, soloUser, extraRoutes, logger = true }: AppOptions): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: logger ? { level: config.logLevel } : false,
    bodyLimit: 50 * 1024 * 1024,
    trustProxy: true,
  });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 10 } });
  await app.register(websocket);

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'DENY');
    return payload;
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.status).send({ error: err.code, message: err.message, details: err.details });
    }
    const e = err as Error & { statusCode?: number };
    const status = e.statusCode ?? 500;
    if (status >= 500) req.log.error(e);
    const message = status >= 500 ? 'Something went wrong on the server. Try again, or check the server log.' : e.message;
    return reply.code(status).send({ error: status >= 500 ? 'server_error' : 'bad_request', message });
  });

  registerAuth(app, deps.sql, config, soloUser);

  const routes: AnyRoute[] = [...systemRoutes(deps), ...elementRoutes(deps), ...(extraRoutes?.(deps) ?? [])];
  registerRoutes(app, routes);

  app.get('/api/openapi.json', { config: { access: 'public' } }, async () =>
    openApiDocument(routes, { version: config.version, serverUrl: config.publicUrl }),
  );

  app.get('/api/v1/live', { websocket: true, config: { access: 'user' } }, (socket, req) => {
    deps.hub.add(socket as never, { id: req.ctx.userId ?? 'anonymous', name: req.ctx.name });
  });

  // The web app (single-page) is served from the same origin.
  if (config.webDist && existsSync(join(config.webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: false, index: false });
    app.get('/*', { config: { access: 'public' } }, (req, reply) => {
      const url = req.url.split('?')[0]!;
      if (url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found', message: 'No such endpoint.' });
      const file = url.slice(1);
      if (file && !file.includes('..') && existsSync(join(config.webDist!, file))) {
        const immutable = file.startsWith('assets/');
        reply.header('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
        return reply.sendFile(file);
      }
      reply.header('Cache-Control', 'no-cache');
      return reply.sendFile('index.html');
    });
  } else {
    app.get('/', { config: { access: 'public' } }, async () => ({
      name: 'Atrium API',
      message: 'The web app is not built. Run `pnpm dev` for development or `pnpm build` for production.',
    }));
  }

  return app;
}
