import {
  ELEMENT_TYPES,
  type ElementType,
  normalizeName,
  RELATION_TYPES,
  type RelationType,
} from '@atrium/schema';
import { z } from 'zod';

/**
 * Industry reference packs load a standard reference model (for example TM Forum's eTOM,
 * SID, ODA Components and Functional Framework) as a read-only layer. Your own elements
 * link to it with "maps to". A pack keeps one version only: installing a new version
 * replaces the old one and migrates your mappings.
 */

export const packManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string(),
  version: z.string(),
  publisher: z.string(),
  description: z.string(),
  /** Licence or terms the content is used under. Shown before install. */
  license: z.string(),
  homepage: z.string().optional(),
  frameworks: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      /** Which Atrium element type the framework's elements become. */
      elementType: z.enum(ELEMENT_TYPES),
      description: z.string().optional(),
    }),
  ),
});
export type PackManifest = z.infer<typeof packManifestSchema>;

export const packElementSchema = z.object({
  /** Stable id from the source (e.g. eTOM "1.2.3"), unique within the pack. Survives renames. */
  sourceId: z.string(),
  framework: z.string(),
  type: z.enum(ELEMENT_TYPES),
  name: z.string(),
  description: z.string().optional(),
  parentSourceId: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  /** Earlier source ids this element replaces (for mapping migration across versions). */
  replaces: z.array(z.string()).optional(),
});
export type PackElement = z.infer<typeof packElementSchema>;

export const packRelationSchema = z.object({
  type: z.enum(RELATION_TYPES),
  from: z.string(),
  to: z.string(),
});
export type PackRelation = z.infer<typeof packRelationSchema>;

export const packContentSchema = z.object({
  format: z.literal('atrium-pack'),
  manifest: packManifestSchema,
  elements: z.array(packElementSchema),
  relations: z.array(packRelationSchema).default([]),
});
export type PackContent = z.infer<typeof packContentSchema>;

export interface PackValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  counts: Record<string, number>;
}

export function validatePack(content: PackContent): PackValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const counts: Record<string, number> = {};
  const frameworks = new Set(content.manifest.frameworks.map((f) => f.id));
  for (const e of content.elements) {
    if (ids.has(e.sourceId)) errors.push(`Duplicate id ${e.sourceId}`);
    ids.add(e.sourceId);
    if (!frameworks.has(e.framework))
      errors.push(`${e.sourceId}: unknown framework "${e.framework}"`);
    counts[e.framework] = (counts[e.framework] ?? 0) + 1;
  }
  const byId = new Map(content.elements.map((e) => [e.sourceId, e]));
  for (const e of content.elements) {
    if (e.parentSourceId) {
      const parent = byId.get(e.parentSourceId);
      if (!parent)
        warnings.push(
          `${e.sourceId}: parent ${e.parentSourceId} is missing; placed at the top level`,
        );
      else if (parent.type !== e.type)
        errors.push(`${e.sourceId}: parent ${e.parentSourceId} has a different type`);
    }
  }
  for (const r of content.relations) {
    if (!byId.has(r.from) || !byId.has(r.to))
      warnings.push(`Relation ${r.from} → ${r.to} refers to a missing element; skipped`);
  }
  return { ok: errors.length === 0, errors, warnings, counts };
}

export interface InstalledReference {
  id: string;
  key: string | null;
  name: string;
  type: ElementType;
  mappedFrom: number;
}

export interface PackDiff {
  added: PackElement[];
  renamed: Array<{ element: PackElement; from: string; id: string }>;
  changed: Array<{ element: PackElement; id: string }>;
  removed: Array<InstalledReference & { replacement?: PackElement }>;
  unchanged: number;
}

/**
 * Compares the installed version with an incoming one. Elements are matched on their stable
 * source id, then on "replaces", then on name, so renames and re-numbering keep your mappings.
 */
/** JSON with object keys sorted, so equal values compare equal whatever their key order. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

export function diffPack(
  installed: Array<
    InstalledReference & {
      description?: string;
      parentKey?: string | null;
      /** Compared when given (without the "framework" attribute Atrium adds). */
      attributes?: Record<string, unknown>;
    }
  >,
  incoming: PackContent,
): PackDiff {
  const byKey = new Map(installed.filter((i) => i.key).map((i) => [i.key!, i]));
  // Matching on name is for elements whose id changed: never take one still present under its own id.
  const incomingIds = new Set(incoming.elements.map((e) => e.sourceId));
  const byName = new Map(
    installed
      .filter((i) => !i.key || !incomingIds.has(i.key))
      .map((i) => [`${i.type}:${normalizeName(i.name)}`, i]),
  );
  const used = new Set<string>();
  const diff: PackDiff = { added: [], renamed: [], changed: [], removed: [], unchanged: 0 };
  for (const e of incoming.elements) {
    let hit = byKey.get(e.sourceId);
    if (!hit) for (const old of e.replaces ?? []) hit ??= byKey.get(old);
    hit ??= byName.get(`${e.type}:${normalizeName(e.name)}`);
    if (!hit || used.has(hit.id)) {
      diff.added.push(e);
      continue;
    }
    used.add(hit.id);
    if (hit.name !== e.name) diff.renamed.push({ element: e, from: hit.name, id: hit.id });
    else if (
      (hit.description ?? '') !== (e.description ?? '') ||
      (hit.parentKey ?? undefined) !== e.parentSourceId ||
      hit.key !== e.sourceId ||
      (hit.attributes !== undefined &&
        stableJson(hit.attributes) !== stableJson(e.attributes ?? {}))
    )
      diff.changed.push({ element: e, id: hit.id });
    else diff.unchanged++;
  }
  for (const i of installed) {
    if (used.has(i.id)) continue;
    const replacement = incoming.elements.find((e) => e.replaces?.includes(i.key ?? ''));
    diff.removed.push({ ...i, replacement });
  }
  return diff;
}

/** Relation types a pack may contain between its own elements. */
export const PACK_RELATIONS: RelationType[] = [
  'realizes',
  'supports',
  'depends_on',
  'flows_to',
  'exposes',
  'consumes',
  'stores',
  'uses',
];

export * from './sources';
