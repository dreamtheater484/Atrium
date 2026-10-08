import type { AccessScope } from '@atrium/db';
import { type Classification, classificationRank, type Role } from '@atrium/schema';

export interface TokenInfo {
  id: string;
  name: string;
  kind: 'agent' | 'ci' | 'api';
  canPropose: boolean;
  domainIds: string[] | null;
  maxClassification: Classification;
  rateLimitPerMinute: number;
  userId: string | null;
  client: string | null;
}

export interface RequestContext {
  kind: 'user' | 'token' | 'anonymous' | 'system';
  userId: string | null;
  name: string;
  email: string | null;
  role: Role;
  teamIds: string[];
  token: TokenInfo | null;
  scope: AccessScope;
  authorKind: 'user' | 'agent' | 'ci' | 'system';
  ip: string;
  mode: 'solo' | 'team';
}

export function tokenScope(t: TokenInfo): AccessScope {
  return { maxRank: classificationRank(t.maxClassification), domainIds: t.domainIds ?? [] };
}

export const ANONYMOUS = (mode: 'solo' | 'team', ip = ''): RequestContext => ({
  kind: 'anonymous',
  userId: null,
  name: 'Anonymous',
  email: null,
  role: 'viewer',
  teamIds: [],
  token: null,
  scope: { maxRank: 0, domainIds: [] },
  authorKind: 'user',
  ip,
  mode,
});

export const SYSTEM = (mode: 'solo' | 'team'): RequestContext => ({
  kind: 'system',
  userId: null,
  name: 'Atrium',
  email: null,
  role: 'admin',
  teamIds: [],
  token: null,
  scope: { maxRank: 3, domainIds: [] },
  authorKind: 'system',
  ip: '',
  mode,
});

/** Display name used in history ("Anna Kumar", "Claude Code (agent token)"). */
export function actorName(ctx: RequestContext): string {
  if (ctx.kind === 'token' && ctx.token) {
    return `${ctx.token.name} (${ctx.token.kind === 'ci' ? 'CI' : ctx.token.kind === 'agent' ? 'agent' : 'API'})`;
  }
  return ctx.name;
}

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext;
  }
  interface FastifyContextConfig {
    access?: 'public' | 'user' | 'any';
  }
}
