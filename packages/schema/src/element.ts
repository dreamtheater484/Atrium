import { z } from 'zod';
import {
  CLASSIFICATIONS,
  ELEMENT_TYPES,
  HEALTH,
  LAYERS,
  LIFECYCLE_PHASES,
  type LifecyclePhase,
} from './enums';
import { RELATION_TYPES } from './metamodel';

export const lifecycleDatesSchema = z
  .object({
    plan: z.string().optional(),
    build: z.string().optional(),
    active: z.string().optional(),
    phase_out: z.string().optional(),
    retired: z.string().optional(),
  })
  .partial();
export type LifecycleDates = Partial<Record<LifecyclePhase, string>>;

/** A value Atrium (or the AI assistant) proposes for a field; shown greyed until accepted. */
export const suggestionSchema = z.object({
  value: z.unknown(),
  reason: z.string(),
  source: z.enum(['rules', 'ai', 'import', 'pack']),
  confidence: z.number().min(0).max(1),
});
export type FieldSuggestion = z.infer<typeof suggestionSchema>;

export const elementSchema = z.object({
  id: z.string(),
  type: z.enum(ELEMENT_TYPES),
  key: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  domainId: z.string().nullable(),
  parentId: z.string().nullable(),
  owner: z.string().nullable(),
  lifecycle: z.enum(LIFECYCLE_PHASES).nullable(),
  lifecycleDates: lifecycleDatesSchema,
  classification: z.enum(CLASSIFICATIONS),
  attributes: z.record(z.string(), z.unknown()),
  tags: z.array(z.string()),
  externalIds: z.record(z.string(), z.string()),
  source: z.string().nullable(),
  layer: z.enum(LAYERS),
  pack: z.string().nullable(),
  quality: z.number(),
  health: z.enum(HEALTH).nullable(),
  healthReasons: z.array(z.string()),
  suggestions: z.record(z.string(), suggestionSchema),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
  version: z.number(),
});
export type Element = z.infer<typeof elementSchema>;

export const relationSchema = z.object({
  id: z.string(),
  type: z.enum(RELATION_TYPES),
  sourceId: z.string(),
  targetId: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
});
export type Relation = z.infer<typeof relationSchema>;

const nameField = z.string().trim().min(1, 'Name is required').max(200);

export const createElementInput = z.object({
  type: z.enum(ELEMENT_TYPES),
  name: nameField,
  key: z.string().trim().max(120).nullish(),
  description: z.string().max(20000).optional(),
  domainId: z.string().nullish(),
  parentId: z.string().nullish(),
  owner: z.string().max(200).nullish(),
  lifecycle: z.enum(LIFECYCLE_PHASES).nullish(),
  lifecycleDates: lifecycleDatesSchema.optional(),
  classification: z.enum(CLASSIFICATIONS).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  externalIds: z.record(z.string(), z.string()).optional(),
  source: z.string().nullish(),
});
export type CreateElementInput = z.infer<typeof createElementInput>;

/** Patch semantics: only provided fields change; attribute keys set to null are removed. */
export const updateElementInput = z.object({
  name: nameField.optional(),
  key: z.string().trim().max(120).nullish(),
  description: z.string().max(20000).optional(),
  domainId: z.string().nullish(),
  parentId: z.string().nullish(),
  owner: z.string().max(200).nullish(),
  lifecycle: z.enum(LIFECYCLE_PHASES).nullish(),
  lifecycleDates: lifecycleDatesSchema.optional(),
  classification: z.enum(CLASSIFICATIONS).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  externalIds: z.record(z.string(), z.string()).optional(),
});
export type UpdateElementInput = z.infer<typeof updateElementInput>;

export const createRelationInput = z.object({
  type: z.enum(RELATION_TYPES),
  sourceId: z.string(),
  targetId: z.string(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreateRelationInput = z.infer<typeof createRelationInput>;

/** Fields of an element that users edit directly (used by diffing and history). */
export const EDITABLE_FIELDS = [
  'name',
  'key',
  'description',
  'domainId',
  'parentId',
  'owner',
  'lifecycle',
  'lifecycleDates',
  'classification',
  'attributes',
  'tags',
  'externalIds',
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];
