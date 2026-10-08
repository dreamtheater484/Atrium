import type { Element } from '@atrium/schema';
import type { RequestContext } from '../auth/context';
import type { ModelIndex } from './model-index';

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Can this person suggest changes at all? */
export function canSuggest(ctx: RequestContext): boolean {
  if (ctx.kind === 'token') return !!ctx.token?.canPropose;
  return ctx.role !== 'viewer' && ctx.kind === 'user';
}

/** Can this person edit scenarios (target state, what-if)? */
export function canEditScenarios(ctx: RequestContext): boolean {
  return ctx.kind === 'user' && (ctx.mode === 'solo' || ctx.role === 'admin' || ctx.role === 'architect');
}

/** Can this person approve or reject suggestions? */
export function canReview(ctx: RequestContext): boolean {
  return ctx.kind === 'user' && (ctx.mode === 'solo' || ctx.role === 'admin' || ctx.role === 'architect');
}

export function isAdmin(ctx: RequestContext): boolean {
  return ctx.kind === 'user' && (ctx.mode === 'solo' || ctx.role === 'admin');
}

const ENGINEER_TYPES = new Set(['application', 'interface', 'data_object', 'technology']);

/**
 * Who saves directly and whose edits become suggestions. Reviews only where they add value:
 * - solo mode: everything is direct
 * - admins: direct
 * - architects: direct in domains they own, domains without an owner, or elements without a domain
 * - engineers: direct on elements owned by their team (applications, interfaces, data, technology)
 * - everyone else, and every agent or CI token: suggestion
 */
export function canEditDirectly(ctx: RequestContext, el: Element | null, index: ModelIndex): boolean {
  if (ctx.kind !== 'user') return false;
  if (ctx.mode === 'solo' || ctx.role === 'admin') return true;
  if (el?.layer === 'reference') return false;
  if (ctx.role === 'architect') {
    if (!el) return true;
    const domain = el.type === 'domain' ? el : index.get(el.domainId);
    if (!domain) return true;
    if (!domain.owner) return true;
    return same(domain.owner, ctx.name) || same(domain.owner, ctx.email);
  }
  if (ctx.role === 'engineer') {
    if (!el || !ENGINEER_TYPES.has(el.type)) return false;
    const teams = index.targets(el.id, 'owned_by').map((t) => t.id);
    return teams.some((t) => ctx.teamIds.includes(t));
  }
  return false;
}
