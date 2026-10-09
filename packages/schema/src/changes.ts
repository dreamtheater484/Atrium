import { z } from 'zod';

export const CHANGESET_KINDS = [
  'direct',
  'suggestion',
  'scenario',
  'import',
  'sync',
  'pack',
  'undo',
  'research',
] as const;
export type ChangesetKind = (typeof CHANGESET_KINDS)[number];

/**
 * draft     – being edited (personal suggestions not yet submitted, scenario work)
 * open      – submitted for review
 * applied   – applied to the model (direct edits, approved suggestions)
 * rejected  – declined by a reviewer
 * withdrawn – cancelled by the author
 */
export const CHANGESET_STATUS = ['draft', 'open', 'applied', 'rejected', 'withdrawn'] as const;
export type ChangesetStatus = (typeof CHANGESET_STATUS)[number];

export const CHANGE_OPS = ['create', 'update', 'delete'] as const;
export type ChangeOp = (typeof CHANGE_OPS)[number];

export const changeSchema = z.object({
  id: z.string(),
  changesetId: z.string(),
  seq: z.number(),
  op: z.enum(CHANGE_OPS),
  entity: z.enum(['element', 'relation']),
  entityId: z.string(),
  /** Full previous state (element or relation), null for create. */
  before: z.record(z.string(), z.unknown()).nullable(),
  /** Full new state, null for delete. */
  after: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});
export type Change = z.infer<typeof changeSchema>;

export const changesetSchema = z.object({
  id: z.string(),
  kind: z.enum(CHANGESET_KINDS),
  status: z.enum(CHANGESET_STATUS),
  title: z.string(),
  description: z.string(),
  scenarioId: z.string().nullable(),
  authorId: z.string().nullable(),
  authorName: z.string().nullable(),
  authorTokenId: z.string().nullable(),
  /** "user", "agent", "ci" or "system" */
  authorKind: z.enum(['user', 'agent', 'ci', 'system']),
  reviewerId: z.string().nullable(),
  reviewerName: z.string().nullable(),
  decisionNote: z.string().nullable(),
  createdAt: z.string(),
  submittedAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
  changeCount: z.number(),
});
export type Changeset = z.infer<typeof changesetSchema>;

export const scenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  isTarget: z.boolean(),
  targetDate: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  changeCount: z.number(),
  /** Review of the scenario as a whole; agreeing does not apply it to today. */
  reviewStatus: z.enum(['draft', 'in_review', 'agreed']),
  submittedBy: z.string().nullable(),
  submittedAt: z.string().nullable(),
  reviewedBy: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  reviewNote: z.string().nullable(),
});
export type Scenario = z.infer<typeof scenarioSchema>;

/** Which version of the model a request looks at. */
export type ModelState = { kind: 'today' } | { kind: 'scenario'; scenarioId: string };
