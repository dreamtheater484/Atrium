import type { Db } from '@atrium/db';
import type { RequestContext } from '../auth/context';

/** Append-only audit trail: logins, agent queries, suggestions, approvals, exports. */
export async function audit(
  db: Db,
  ctx: RequestContext,
  action: string,
  target?: { type: string; id?: string | null },
  details: Record<string, unknown> = {},
): Promise<void> {
  await db`
    insert into audit_log (actor_kind, actor_id, actor_name, token_id, action, target_type, target_id, details, ip)
    values (${ctx.kind === 'token' ? (ctx.token?.kind ?? 'token') : ctx.kind}, ${ctx.userId}, ${ctx.name},
            ${ctx.token?.id ?? null}, ${action}, ${target?.type ?? null}, ${target?.id ?? null},
            ${db.json(details as never)}, ${ctx.ip || null})`;
}
