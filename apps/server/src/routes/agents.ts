import { type AtriumBackend, createAtriumMcpServer } from '@atrium/mcp';
import { enumLabel, normalizeName, RELATION_TYPE_DEFS } from '@atrium/schema';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RequestContext } from '../auth/context';
import { notFound } from '../http/errors';
import { route } from '../http/route';
import { audit } from '../services/audit';
import { findService, serviceContextMarkdown } from '../services/context';
import type { Deps } from '../services/deps';
import { ModelIndex } from '../services/model-index';
import { canSuggest } from '../services/policy';
import { elementDetail } from '../services/read';
import { search } from '../services/search';
import { checkAgainstStandards } from '../services/standards-check';
import { resolveState } from '../services/store';
import { proposalSchema, propose, syncAtriumYaml } from '../services/sync';
import { computeImpact } from '../services/views';

const checkBody = z.object({
  service: z.string().optional(),
  technologies: z.array(z.object({ name: z.string(), version: z.string().optional() })).optional(),
  dependencies: z.array(z.string()).optional(),
  data: z.array(z.string()).optional(),
  hosting: z.string().optional(),
});

/** The Atrium backend for MCP tools, bound to one caller and their scope. */
export function backendFor(deps: Deps, ctx: RequestContext): AtriumBackend {
  const index = async () =>
    new ModelIndex(await resolveState(deps.store, deps.sql, ctx, { includeDrafts: false }));
  const logged = async <T>(tool: string, args: unknown, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } finally {
      if (ctx.kind === 'token')
        await audit(deps.sql, ctx, `mcp.${tool}`, undefined, { args }).catch(() => {});
    }
  };
  const resolve = async (ref: string) => {
    const idx = await index();
    const el = findService(idx, ref);
    if (!el) throw notFound(`"${ref}"`);
    return { idx, el };
  };
  return {
    canPropose: canSuggest(ctx),
    whoami: async () => ({
      workspace: deps.config.workspaceName,
      url: deps.config.publicUrl,
      connectedAs: ctx.name,
      kind: ctx.kind === 'token' ? ctx.token?.kind : 'person',
      canPropose: canSuggest(ctx),
      canSeeUpTo: ctx.kind === 'token' ? enumLabel(ctx.token!.maxClassification) : 'Everything',
      limitedToDomains: ctx.token?.domainIds?.length ?? 0,
    }),
    search: (q, opts) =>
      logged('search', { q, ...opts }, async () =>
        (await search(deps, ctx, q, { types: opts.types as never, limit: opts.limit ?? 15 })).map(
          (h) => ({
            id: h.id,
            type: h.type,
            name: h.name,
            key: h.key,
            domain: h.domainName,
            summary: h.snippet,
          }),
        ),
      ),
    getElement: (ref) =>
      logged('get_element', { ref }, async () => {
        const idx = await index();
        const el = findService(idx, ref);
        if (!el) return null;
        const d = await elementDetail(deps, ctx, el.id);
        return {
          id: d.id,
          type: d.type,
          key: d.key,
          name: d.name,
          description: d.description,
          domain: d.domainName,
          owner: d.owner,
          lifecycle: d.lifecycle,
          classification: d.classification,
          health: d.health,
          healthReasons: d.healthReasons,
          attributes: Object.fromEntries(
            Object.entries(d.attributes).filter(([k]) => !k.startsWith('_')),
          ),
          relations: d.relations.map((r) => ({
            relation:
              r.direction === 'out'
                ? RELATION_TYPE_DEFS[r.type].label
                : RELATION_TYPE_DEFS[r.type].inverseLabel,
            element: r.other.name,
            key: r.other.key,
            type: r.other.type,
          })),
          url: `${deps.config.publicUrl}/e/${d.id}`,
        };
      }),
    serviceContext: (ref) =>
      logged(
        'get_service_context',
        { ref },
        async () => (await serviceContextMarkdown(deps, ctx, ref)).markdown,
      ),
    dependencies: (ref, direction, depth) =>
      logged('find_dependencies', { ref, direction, depth }, async () => {
        const { idx, el } = await resolve(ref);
        const walk = (dir: 'up' | 'down') => {
          const out: Array<{
            name: string;
            key: string | null;
            type: string;
            via: string;
            depth: number;
          }> = [];
          const seen = new Set([el.id]);
          let frontier = [el.id];
          for (let d = 1; d <= depth; d++) {
            const next: string[] = [];
            for (const id of frontier) {
              const rels =
                dir === 'up'
                  ? idx
                      .outgoing(id)
                      .filter((r) => ['depends_on', 'consumes', 'uses'].includes(r.type))
                  : idx
                      .incoming(id)
                      .filter((r) => ['depends_on', 'consumes', 'uses'].includes(r.type));
              for (const r of rels) {
                const otherId = dir === 'up' ? r.targetId : r.sourceId;
                if (seen.has(otherId)) continue;
                seen.add(otherId);
                const o = idx.get(otherId)!;
                out.push({
                  name: o.name,
                  key: o.key,
                  type: o.type,
                  via: RELATION_TYPE_DEFS[r.type].label,
                  depth: d,
                });
                next.push(otherId);
                // An interface leads to whoever provides or consumes it.
                if (o.type === 'interface') {
                  for (const p of dir === 'up'
                    ? idx.sources(o.id, 'exposes')
                    : idx.sources(o.id, 'consumes')) {
                    if (seen.has(p.id)) continue;
                    seen.add(p.id);
                    out.push({
                      name: p.name,
                      key: p.key,
                      type: p.type,
                      via: dir === 'up' ? `provides ${o.name}` : `uses ${o.name}`,
                      depth: d,
                    });
                  }
                }
              }
              if (dir === 'down') {
                for (const api of idx.targets(id, 'exposes')) {
                  for (const c of idx.sources(api.id, 'consumes')) {
                    if (seen.has(c.id)) continue;
                    seen.add(c.id);
                    out.push({
                      name: c.name,
                      key: c.key,
                      type: c.type,
                      via: `uses ${api.name}`,
                      depth: d,
                    });
                    next.push(c.id);
                  }
                }
              }
            }
            frontier = next;
          }
          return out;
        };
        return {
          element: { name: el.name, key: el.key, type: el.type },
          upstream: direction === 'downstream' ? undefined : walk('up'),
          downstream: direction === 'upstream' ? undefined : walk('down'),
        };
      }),
    impact: (ref) =>
      logged('impact_of', { ref }, async () => {
        const { idx, el } = await resolve(ref);
        const r = computeImpact(idx, el.id);
        return {
          summary: r.summary,
          // Tells the agent the list may be incomplete (applications without mapped integrations).
          ...(r.caveat ? { caveat: r.caveat } : {}),
          affected: r.nodes.map((n) => ({
            name: n.element.name,
            key: n.element.key,
            type: n.element.type,
            steps: n.depth,
            via: RELATION_TYPE_DEFS[n.via].label,
          })),
        };
      }),
    listStandards: (f) =>
      logged('list_standards', f, async () => {
        const idx = await index();
        return idx
          .ofType('standard')
          .filter((s) => !f.category || s.attributes.category === f.category)
          .filter(
            (s) =>
              !f.technology ||
              ((s.attributes.match as string[]) ?? []).some((m) =>
                normalizeName(m).includes(normalizeName(f.technology!).split(' ')[0]!),
              ),
          )
          .map((s) => ({
            name: s.name,
            level: s.attributes.level,
            category: s.attributes.category,
            effect: s.attributes.effect,
            technologies: s.attributes.match,
            rule: s.attributes.rule ?? s.description,
          }));
      }),
    listDecisions: (f) =>
      logged('list_decisions', f, async () => {
        const idx = await index();
        let decisions = idx.ofType('decision');
        if (f.element) {
          const el = findService(idx, f.element);
          if (el)
            decisions = [
              ...idx.targets(el.id, 'governed_by'),
              ...idx.sources(el.id, 'governed_by'),
            ].filter((d) => d.type === 'decision');
        }
        return decisions
          .filter((d) => !f.status || d.attributes.status === f.status)
          .map((d) => ({
            name: d.name,
            status: d.attributes.status,
            date: d.attributes.date,
            context: d.attributes.context,
            decision: d.attributes.decision ?? d.description,
            consequences: d.attributes.consequences,
          }));
      }),
    checkStandards: (input) =>
      logged('check_against_standards', input, () => checkAgainstStandards(deps, ctx, input)),
    propose: (input) =>
      logged('propose_change', { title: (input as { title?: string }).title }, () =>
        propose(deps, ctx, proposalSchema.parse(input)),
      ),
  };
}

export function agentRoutes(deps: Deps) {
  return [
    route({
      method: 'GET',
      url: '/api/v1/context/:service',
      summary: 'Architecture context for one service, as Markdown (ARCHITECTURE.md)',
      tag: 'Agents',
      access: 'any',
      params: z.object({ service: z.string().min(1) }),
      handler: async ({ params, ctx, reply }) => {
        const { markdown } = await serviceContextMarkdown(deps, ctx, params.service);
        if (ctx.kind === 'token')
          await audit(deps.sql, ctx, 'context.read', { type: 'service', id: params.service });
        reply.header('content-type', 'text/markdown; charset=utf-8');
        return markdown;
      },
    }),
    route({
      method: 'POST',
      url: '/api/v1/check',
      summary: 'Check a service or a planned design against standards, radar and end-of-life dates',
      tag: 'Agents',
      access: 'any',
      body: checkBody,
      handler: async ({ body, ctx }) => checkAgainstStandards(deps, ctx, body),
    }),
    route({
      method: 'POST',
      url: '/api/v1/sync',
      summary: 'Sync a service from its atrium.yaml (used by CI)',
      tag: 'Agents',
      access: 'any',
      body: z.object({
        yaml: z.union([z.string(), z.record(z.string(), z.unknown())]),
        source: z.string().max(500).optional(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ body, ctx }) =>
        syncAtriumYaml(deps, ctx, body.yaml, { dryRun: body.dryRun, source: body.source }),
    }),
    route({
      method: 'POST',
      url: '/api/v1/proposals',
      summary: 'Propose several related changes for review',
      tag: 'Agents',
      access: 'any',
      body: proposalSchema,
      handler: async ({ body, ctx }) => propose(deps, ctx, body),
    }),
  ];
}

/**
 * MCP over Streamable HTTP (stateless). Each request gets a fresh server bound to the
 * caller's token, so every tool only sees what that token may see.
 */
export function registerMcp(app: FastifyInstance, deps: Deps) {
  app.post('/mcp', { config: { access: 'any' } }, async (req, reply) => {
    const server = createAtriumMcpServer(backendFor(deps, req.ctx), {
      version: deps.config.version,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
  const notAllowed = async (
    _req: unknown,
    reply: { code: (n: number) => { send: (b: unknown) => unknown } },
  ) =>
    reply.code(405).send({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Atrium uses stateless MCP over POST.',
      },
      id: null,
    });
  app.get('/mcp', { config: { access: 'any' } }, notAllowed as never);
  app.delete('/mcp', { config: { access: 'any' } }, notAllowed as never);
}
