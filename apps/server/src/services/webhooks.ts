import { createHmac, randomUUID } from 'node:crypto';
import type { Db } from '@atrium/db';
import { badRequest, notFound } from '../http/errors';
import type { RealtimeEvent, RealtimeHub } from './realtime';
import { getSetting, setSetting } from './workspace';

export interface Webhook {
  id: string;
  url: string;
  /** Used to sign each delivery: X-Atrium-Signature: sha256=<hmac of the body>. */
  secret: string;
  events: Array<'model.changed' | 'changeset.updated'>;
  createdAt: string;
  createdBy: string;
  lastDelivery: { at: string; status: number | null; error?: string } | null;
}

const KEY = 'webhooks';
const BATCH_MS = 2000;

export async function listWebhooks(db: Db): Promise<Webhook[]> {
  return getSetting<Webhook[]>(db, KEY, []);
}

export function publicHook(h: Webhook) {
  return { ...h, secret: `${h.secret.slice(0, 8)}…` };
}

export async function addWebhook(db: Db, url: string, by: string): Promise<Webhook> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw badRequest('That is not a valid address.');
  }
  if (!['https:', 'http:'].includes(parsed.protocol))
    throw badRequest('Use an http or https address.');
  const hooks = await listWebhooks(db);
  const hook: Webhook = {
    id: randomUUID(),
    url: parsed.toString(),
    secret: `whsec_${randomUUID().replace(/-/g, '')}`,
    events: ['model.changed', 'changeset.updated'],
    createdAt: new Date().toISOString(),
    createdBy: by,
    lastDelivery: null,
  };
  await setSetting(db, KEY, [...hooks, hook]);
  return hook;
}

export async function removeWebhook(db: Db, id: string) {
  const hooks = await listWebhooks(db);
  if (!hooks.some((h) => h.id === id)) throw notFound('That webhook');
  await setSetting(
    db,
    KEY,
    hooks.filter((h) => h.id !== id),
  );
}

export const sign = (secret: string, body: string) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

export async function deliver(db: Db, hook: Webhook, payload: unknown) {
  const body = JSON.stringify(payload);
  let status: number | null = null;
  let error: string | undefined;
  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Atrium-Webhooks',
        'x-atrium-event': (payload as { event: string }).event,
        'x-atrium-signature': sign(hook.secret, body),
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    status = res.status;
  } catch (e) {
    error = (e as Error).message;
  }
  // Remember the outcome so admins can see whether deliveries work.
  const hooks = await listWebhooks(db);
  const h = hooks.find((x) => x.id === hook.id);
  if (h) {
    h.lastDelivery = { at: new Date().toISOString(), status, ...(error ? { error } : {}) };
    await setSetting(db, KEY, hooks);
  }
  return { status, error };
}

/**
 * Sends model changes to registered webhooks. Events within two seconds are batched, so a big
 * import is one delivery. The payload says what changed; receivers fetch details from the API.
 */
export function startWebhooks(db: Db, hub: RealtimeHub) {
  let pending: RealtimeEvent[] = [];
  let timer: NodeJS.Timeout | null = null;
  const flush = async () => {
    timer = null;
    const events = pending;
    pending = [];
    const hooks = await listWebhooks(db);
    if (!hooks.length) return;
    const ids = [...new Set(events.flatMap((e) => (e.type === 'model.changed' ? e.ids : [])))];
    const changesets = events
      .filter(
        (e): e is Extract<RealtimeEvent, { type: 'changeset.updated' }> =>
          e.type === 'changeset.updated',
      )
      .map((e) => ({ id: e.id, status: e.status, title: e.title, by: e.by }));
    const by = [...new Set(events.map((e) => ('by' in e ? e.by : null)).filter(Boolean))];
    for (const hook of hooks) {
      const types = new Set(events.map((e) => e.type));
      if (!hook.events.some((t) => types.has(t))) continue;
      void deliver(db, hook, {
        event: changesets.length && !ids.length ? 'changeset.updated' : 'model.changed',
        at: new Date().toISOString(),
        elementIds: ids,
        changesets,
        by,
      });
    }
  };
  return hub.subscribe((event) => {
    if (event.type !== 'model.changed' && event.type !== 'changeset.updated') return;
    pending.push(event);
    if (!timer) timer = setTimeout(() => void flush().catch(() => {}), BATCH_MS);
  });
}
