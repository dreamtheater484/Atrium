import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asSystem } from '@atrium/db';
import { type ParsedSheet, parseFile } from '@atrium/importers';
import {
  diffPack,
  type PackContent,
  type PackDiff,
  type PackElement,
  packContentSchema,
  validatePack,
} from '@atrium/packs-core';
import { type Element, type ElementType, normalizeName } from '@atrium/schema';
import type { RequestContext } from '../auth/context';
import { SYSTEM } from '../auth/context';
import { badRequest, notFound } from '../http/errors';
import { audit } from './audit';
import { ChangeBuilder } from './builder';
import { applyChangeToBase, openChangeset, recordChange } from './changesets';
import type { Deps } from './deps';
import { refreshDerived } from './derived';
import { ModelIndex } from './model-index';
import { canEditDirectly } from './policy';
import { ELEMENT_COLUMNS, rowToElement } from './rows';
import { resolveState } from './store';

interface FrameworkConfig {
  id: string;
  name: string;
  elementType: ElementType;
  description?: string;
  detect?: { sheetWords?: string[]; headerWords?: string[] };
}

export interface AvailablePack {
  id: string;
  name: string;
  publisher: string;
  description: string;
  license: string;
  homepage?: string;
  frameworks: FrameworkConfig[];
  columns?: Record<string, string[]>;
  bundled: boolean;
  installed: { version: string; elements: number; installedAt: string } | null;
}

function packsDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    process.env.ATRIUM_PACKS_DIR,
    join(here, 'packs'),
    resolve(here, '../../../../packs'),
    resolve(here, '../../../packs'),
  ]
    .filter(Boolean)
    .find((d) => existsSync(d!)) as string | null;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function listPacks(deps: Deps): Promise<AvailablePack[]> {
  const dir = packsDir();
  const installed =
    await deps.sql`select id, version, element_count, installed_at from reference_packs`;
  const inst = new Map(installed.map((r) => [r.id as string, r]));
  const packs: AvailablePack[] = [];
  for (const name of dir ? readdirSync(dir) : []) {
    const m = readJson<Omit<AvailablePack, 'installed' | 'bundled'> & { bundled?: boolean }>(
      join(dir!, name, 'manifest.json'),
    );
    if (!m) continue;
    const i = inst.get(m.id);
    packs.push({
      ...m,
      bundled: !!m.bundled && existsSync(join(dir!, name, 'pack.json')),
      installed: i
        ? {
            version: i.version as string,
            elements: Number(i.elementCount),
            installedAt: new Date(i.installedAt as string).toISOString(),
          }
        : null,
    });
    inst.delete(m.id);
  }
  // Packs installed from uploaded files that have no folder here.
  for (const [id, i] of inst) {
    packs.push({
      id,
      name: id,
      publisher: '',
      description: 'Installed from a file',
      license: '',
      frameworks: [],
      bundled: false,
      installed: {
        version: i.version as string,
        elements: Number(i.elementCount),
        installedAt: new Date(i.installedAt as string).toISOString(),
      },
    });
  }
  return packs;
}

function bundledContent(id: string): PackContent | null {
  const dir = packsDir();
  if (!dir) return null;
  for (const name of readdirSync(dir)) {
    const file = join(dir, name, 'pack.json');
    const content = readJson<PackContent>(file);
    if (content?.manifest?.id === id) return packContentSchema.parse(content);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Spreadsheets → pack (TM Forum and similar sources)                  */
/* ------------------------------------------------------------------ */

function findColumn(headers: string[], words: string[] = []): string | undefined {
  const norm = headers.map((h) => [h, normalizeName(h)] as const);
  for (const w of words) {
    const exact = norm.find(([, n]) => n === normalizeName(w));
    if (exact) return exact[0];
  }
  for (const w of words) {
    const partial = norm.find(([, n]) => n.includes(normalizeName(w)));
    if (partial) return partial[0];
  }
  return undefined;
}

function detectFramework(
  sheet: ParsedSheet,
  frameworks: FrameworkConfig[],
): FrameworkConfig | undefined {
  let best: FrameworkConfig | undefined;
  let bestScore = 0;
  const sheetName = normalizeName(sheet.name);
  const headers = sheet.headers.map(normalizeName).join(' ');
  for (const f of frameworks) {
    let score = 0;
    for (const w of f.detect?.sheetWords ?? [])
      if (sheetName.includes(normalizeName(w))) score += 3;
    for (const w of f.detect?.headerWords ?? []) if (headers.includes(normalizeName(w))) score += 1;
    if (score > bestScore) {
      best = f;
      bestScore = score;
    }
  }
  return best ?? (frameworks.length === 1 ? frameworks[0] : undefined);
}

/** Builds a pack from source spreadsheets: finds id, name, parent and description columns. */
export async function packFromFiles(
  packId: string,
  version: string,
  files: Array<{ name: string; data: Uint8Array }>,
) {
  const meta = (await listPacksStatic()).find((p) => p.id === packId);
  if (!meta) throw notFound('That pack');
  const elements: PackElement[] = [];
  const warnings: string[] = [];
  for (const f of files) {
    const parsed = await parseFile(f.name, f.data);
    if (parsed.format === 'atrium-yaml' || parsed.format === 'unknown') {
      warnings.push(`${f.name}: not a spreadsheet; skipped.`);
      continue;
    }
    for (const sheet of parsed.sheets ?? []) {
      const fw = detectFramework(sheet, meta.frameworks);
      if (!fw) {
        warnings.push(`${f.name} / ${sheet.name}: couldn't tell which framework this is; skipped.`);
        continue;
      }
      const cols = meta.columns ?? {};
      const idCol = findColumn(sheet.headers, cols.id ?? ['id']);
      const nameCol = findColumn(sheet.headers, cols.name ?? ['name']);
      const parentCol = findColumn(sheet.headers, cols.parent ?? ['parent']);
      const descCol = findColumn(sheet.headers, cols.description ?? ['description']);
      if (!nameCol) {
        warnings.push(`${f.name} / ${sheet.name}: no name column found; skipped.`);
        continue;
      }
      let n = 0;
      for (const row of sheet.rows) {
        const name = String(row[nameCol] ?? '').trim();
        if (!name) continue;
        const sourceId =
          String(row[idCol ?? ''] ?? '').trim() ||
          `${fw.id}:${normalizeName(name).replace(/ /g, '-')}`;
        // Dotted identifiers (eTOM "1.2.3") imply the parent "1.2".
        let parent = parentCol ? String(row[parentCol] ?? '').trim() || undefined : undefined;
        if (!parent && /^\d+(\.\d+)+$/.test(sourceId))
          parent = sourceId.split('.').slice(0, -1).join('.');
        elements.push({
          sourceId,
          framework: fw.id,
          type: fw.elementType,
          name,
          description: descCol ? String(row[descCol] ?? '').trim() || undefined : undefined,
          parentSourceId: parent,
        });
        n++;
      }
      warnings.push(`${f.name} / ${sheet.name}: ${n} ${fw.name} elements.`);
    }
  }
  const content: PackContent = {
    format: 'atrium-pack',
    manifest: {
      id: meta.id,
      name: meta.name,
      version,
      publisher: meta.publisher,
      description: meta.description,
      license: meta.license,
      homepage: meta.homepage,
      frameworks: meta.frameworks,
    },
    elements,
    relations: [],
  };
  return { content, warnings };
}

async function listPacksStatic(): Promise<AvailablePack[]> {
  const dir = packsDir();
  const out: AvailablePack[] = [];
  for (const name of dir ? readdirSync(dir) : []) {
    const m = readJson<AvailablePack>(join(dir!, name, 'manifest.json'));
    if (m) out.push({ ...m, installed: null, bundled: false });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Install, update, remove                                             */
/* ------------------------------------------------------------------ */

async function installedRefs(deps: Deps, packId: string) {
  const rows = await asSystem(deps.sql, (tx) =>
    tx.unsafe(
      `select ${ELEMENT_COLUMNS}, (select count(*) from relations r where r.target_id = e.id and r.type = 'maps_to' and r.deleted_at is null)::int as mapped
               from elements e where layer = 'reference' and pack = $1 and deleted_at is null`,
      [packId],
    ),
  );
  return rows.map((r) => ({ el: rowToElement(r), mapped: Number(r.mapped) }));
}

export async function previewPack(
  deps: Deps,
  content: PackContent,
): Promise<{
  validation: ReturnType<typeof validatePack>;
  diff: PackDiff;
  installedVersion: string | null;
}> {
  const validation = validatePack(content);
  const installed = await installedRefs(deps, content.manifest.id);
  const byId = new Map(installed.map((i) => [i.el.id, i.el]));
  const diff = diffPack(
    installed.map((i) => ({
      id: i.el.id,
      key: i.el.key,
      name: i.el.name,
      type: i.el.type,
      mappedFrom: i.mapped,
      description: i.el.description,
      parentKey: byId.get(i.el.parentId ?? '')?.key ?? null,
    })),
    content,
  );
  const [row] =
    await deps.sql`select version from reference_packs where id = ${content.manifest.id}`;
  return { validation, diff, installedVersion: (row?.version as string) ?? null };
}

export async function installPack(deps: Deps, ctx: RequestContext, content: PackContent) {
  const { validation, diff } = await previewPack(deps, content);
  if (!validation.ok)
    throw badRequest(`The pack has problems: ${validation.errors.slice(0, 5).join('; ')}`);
  const sys = SYSTEM(ctx.mode);
  const packId = content.manifest.id;
  const now = new Date().toISOString();
  const result = await asSystem(deps.sql, async (tx) => {
    const cs = await openChangeset(tx, sys, {
      kind: 'pack',
      status: 'applied',
      title: `${diff.added.length && diff.renamed.length + diff.changed.length + diff.removed.length === 0 ? 'Installed' : 'Updated'} ${content.manifest.name} ${content.manifest.version}`,
    });
    const idBySource = new Map<string, string>();
    for (const r of await installedRefs(deps, packId))
      if (r.el.key) idBySource.set(r.el.key, r.el.id);
    const touched: string[] = [];
    const base = (e: PackElement, id: string): Element => ({
      id,
      type: e.type,
      key: e.sourceId,
      name: e.name,
      description: e.description ?? '',
      domainId: null,
      parentId: null,
      owner: null,
      lifecycle: null,
      lifecycleDates: {},
      classification: 'public',
      attributes: { ...(e.attributes ?? {}), framework: e.framework },
      tags: [content.manifest.name],
      externalIds: { [packId]: e.sourceId },
      source: `pack:${packId}`,
      layer: 'reference',
      pack: packId,
      quality: 100,
      health: null,
      healthReasons: [],
      suggestions: {},
      createdAt: now,
      createdBy: ctx.name,
      updatedAt: now,
      updatedBy: ctx.name,
      version: 1,
    });
    // 1. additions
    for (const e of diff.added) {
      const el = base(e, randomUUID());
      await recordChange(tx, cs, 'create', 'element', el.id, null, el);
      await applyChangeToBase(
        tx,
        { op: 'create', entity: 'element', entityId: el.id, before: null, after: el },
        ctx.name,
      );
      idBySource.set(e.sourceId, el.id);
    }
    // 2. renames and changes keep the same id, so mappings stay
    for (const r of [...diff.renamed, ...diff.changed]) {
      const [cur] = await tx.unsafe(`select ${ELEMENT_COLUMNS} from elements where id = $1`, [
        r.id,
      ]);
      if (!cur) continue;
      const before = rowToElement(cur);
      const after = {
        ...base(r.element, r.id),
        createdAt: before.createdAt,
        createdBy: before.createdBy,
      };
      await recordChange(tx, cs, 'update', 'element', r.id, before, after);
      await applyChangeToBase(
        tx,
        { op: 'update', entity: 'element', entityId: r.id, before, after },
        ctx.name,
      );
      idBySource.set(r.element.sourceId, r.id);
    }
    // 3. hierarchy
    for (const e of content.elements) {
      const id = idBySource.get(e.sourceId);
      const parent = e.parentSourceId ? idBySource.get(e.parentSourceId) : null;
      if (id) await tx`update elements set parent_id = ${parent ?? null} where id = ${id}`;
    }
    // 4. relations inside the pack
    for (const r of content.relations) {
      const s = idBySource.get(r.from);
      const t = idBySource.get(r.to);
      if (!s || !t) continue;
      await tx`insert into relations (type, source_id, target_id, created_by) values (${r.type}, ${s}, ${t}, ${ctx.name}) on conflict do nothing`;
    }
    // 5. removals: move mappings to the replacement when the source says so, otherwise flag them
    let moved = 0;
    let flagged = 0;
    for (const r of diff.removed) {
      const replacementId = r.replacement ? idBySource.get(r.replacement.sourceId) : undefined;
      const maps =
        await tx`select id, source_id from relations where target_id = ${r.id} and type = 'maps_to' and deleted_at is null`;
      for (const m of maps) {
        if (replacementId) {
          await tx`insert into relations (type, source_id, target_id, created_by) values ('maps_to', ${m.sourceId}, ${replacementId}, ${ctx.name}) on conflict do nothing`;
          moved++;
        } else {
          await tx`update elements set suggestions = suggestions || ${tx.json({ 'relation.maps_to': { value: null, reason: `${r.name} was removed from ${content.manifest.name} ${content.manifest.version}. Map this to its successor.`, source: 'pack', confidence: 1 } } as never)} where id = ${m.sourceId}`;
          flagged++;
        }
      }
      const [cur] = await tx.unsafe(`select ${ELEMENT_COLUMNS} from elements where id = $1`, [
        r.id,
      ]);
      if (cur) {
        await recordChange(tx, cs, 'delete', 'element', r.id, rowToElement(cur), null);
        const res = await applyChangeToBase(
          tx,
          { op: 'delete', entity: 'element', entityId: r.id, before: null, after: null },
          ctx.name,
        );
        touched.push(...res.touched);
      }
    }
    await refreshDerived(tx, touched);
    await tx`
      insert into reference_packs (id, name, version, manifest, element_count, installed_by)
      values (${packId}, ${content.manifest.name}, ${content.manifest.version}, ${tx.json(content.manifest as never)}, ${content.elements.length}, ${ctx.name})
      on conflict (id) do update set name = excluded.name, version = excluded.version, manifest = excluded.manifest,
        element_count = excluded.element_count, installed_at = now(), installed_by = excluded.installed_by`;
    return { moved, flagged };
  });
  await audit(
    deps.sql,
    ctx,
    'pack.install',
    { type: 'pack', id: packId },
    { version: content.manifest.version, added: diff.added.length, removed: diff.removed.length },
  );
  deps.store.bump();
  deps.hub.broadcast({ type: 'model.changed', ids: [], by: ctx.name });
  return {
    ...result,
    added: diff.added.length,
    renamed: diff.renamed.length,
    changed: diff.changed.length,
    removed: diff.removed.length,
    unchanged: diff.unchanged,
  };
}

export async function installBundled(deps: Deps, ctx: RequestContext, packId: string) {
  const content = bundledContent(packId);
  if (!content) throw notFound('That pack');
  return installPack(deps, ctx, content);
}

export async function uninstallPack(deps: Deps, ctx: RequestContext, packId: string) {
  await asSystem(deps.sql, async (tx) => {
    await tx`update relations set deleted_at = now() where deleted_at is null and (source_id in (select id from elements where pack = ${packId}) or target_id in (select id from elements where pack = ${packId}))`;
    await tx`update elements set deleted_at = now() where pack = ${packId} and deleted_at is null`;
    await tx`delete from reference_packs where id = ${packId}`;
  });
  await audit(deps.sql, ctx, 'pack.uninstall', { type: 'pack', id: packId });
  deps.store.bump();
  deps.hub.broadcast({ type: 'model.changed', ids: [], by: ctx.name });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Bulk mapping to a reference pack                                     */
/* ------------------------------------------------------------------ */

export interface MappingSuggestion {
  element: { id: string; name: string; type: ElementType; domainName: string | null };
  match: {
    id: string;
    name: string;
    parentName: string | null;
    confidence: number;
    reason: string;
  };
}

/** For each of your elements not yet mapped to this pack, its closest reference element. */
export async function mappingSuggestions(deps: Deps, ctx: RequestContext, packId: string) {
  const state = await resolveState(deps.store, deps.sql, ctx, {});
  const index = new ModelIndex(state);
  const refs = [...state.elements.values()].filter(
    (e) => e.layer === 'reference' && e.pack === packId,
  );
  if (!refs.length) throw notFound('That pack (install it first)');
  const types = new Set(refs.map((r) => r.type));
  const inPack = new Set(refs.map((r) => r.id));
  const suggestions: MappingSuggestion[] = [];
  let mapped = 0;
  let candidates = 0;
  for (const el of state.elements.values()) {
    if (el.layer !== 'org' || !types.has(el.type)) continue;
    candidates++;
    if (index.outgoing(el.id, 'maps_to').some((r) => inPack.has(r.targetId))) {
      mapped++;
      continue;
    }
    const best = deps.ai.suggestMappings(el, index, 8).find((m) => inPack.has(m.id));
    if (!best) continue;
    const target = index.get(best.id)!;
    suggestions.push({
      element: { id: el.id, name: el.name, type: el.type, domainName: index.domainName(el) },
      match: {
        id: best.id,
        name: best.name,
        parentName: target.parentId ? (index.get(target.parentId)?.name ?? null) : null,
        confidence: best.confidence,
        reason: best.reason,
      },
    });
  }
  suggestions.sort((a, b) => b.match.confidence - a.match.confidence);
  const covered = new Set(
    [...state.relations.values()]
      .filter((r) => r.type === 'maps_to' && inPack.has(r.targetId))
      .map((r) => r.targetId),
  );
  return {
    suggestions,
    mapped,
    candidates,
    referenceCount: refs.length,
    referenceCovered: covered.size,
  };
}

/** Adds the chosen "maps to" links in one change (a suggestion when the person can't edit directly). */
export async function applyMappings(
  deps: Deps,
  ctx: RequestContext,
  packId: string,
  pairs: Array<{ sourceId: string; targetId: string }>,
) {
  const state = await resolveState(deps.store, deps.sql, ctx, {});
  const b = new ChangeBuilder(deps, ctx, state);
  let linked = 0;
  for (const p of pairs) {
    const target = state.elements.get(p.targetId);
    const source = state.elements.get(p.sourceId);
    if (source?.layer !== 'org' || target?.layer !== 'reference' || target.pack !== packId)
      continue;
    if (b.link('maps_to', p.sourceId, p.targetId)) linked++;
  }
  const direct = ctx.kind === 'user' && canEditDirectly(ctx, null, b.index);
  const res = await b.commit({
    kind: 'pack',
    mode: direct ? 'direct' : 'suggestion',
    title: `Mapped ${linked} element${linked === 1 ? '' : 's'} to ${packId}`,
  });
  return { ...res, linked };
}
