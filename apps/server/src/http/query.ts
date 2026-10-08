import type { Db } from '@atrium/db';
import { z } from 'zod';
import { notFound } from './errors';

export const boolParam = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0', ''])])
  .optional()
  .transform((v) => v === true || v === 'true' || v === '1');

export const listParam = z
  .string()
  .optional()
  .transform((v) =>
    v
      ? v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
  );

export const idParams = z.object({ id: z.string().uuid('Not a valid id') });

/**
 * `?scenario=` accepts a scenario id, or "target" for the current target state.
 * Returns undefined for today.
 */
export async function resolveScenario(
  db: Db,
  value: string | undefined | null,
): Promise<string | undefined> {
  if (!value || value === 'today') return undefined;
  if (value === 'target') {
    const [t] = await db`select id from scenarios where is_target and archived_at is null limit 1`;
    if (!t) throw notFound('A target state');
    return t.id as string;
  }
  const [s] = await db`select id from scenarios where id = ${value} and archived_at is null`;
  if (!s) throw notFound('That scenario');
  return s.id as string;
}
