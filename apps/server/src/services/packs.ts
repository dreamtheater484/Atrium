import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asSystem } from '@atrium/db';
import { parseFile } from '@atrium/importers';
import { tmforumReaders } from '@atrium/pack-tmforum';
import {
  assembleSources,
  diffPack,
  type PackContent,
  type PackDiff,
  type PackElement,
  packContentSchema,
  readByColumns,
  type SheetReport,
  type SourceReader,
  type SourceResult,
  validatePack,
} from '@atrium/packs-core';
import type { Element, ElementType } from '@atrium/schema';
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
  /** Release of the installed content (set when installing). */
  version?: string;
  detect?: { sheetWords?: string[]; headerWords?: string[] };
}

/** Packs whose source files have dedicated readers; other files fall back to column detection. */
const PACK_READERS: Record<string, SourceReader[]> = { tmforum: tmforumReaders };

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
  installed: {
    version: string;
    elements: number;
    installedAt: string;
    /** Per framework: elements installed and the release they came from. */
    frameworks: Record<string, { elements: number; version?: string }>;
  } | null;
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
    await deps.sql`select id, version, manifest, element_count, installed_at from reference_packs`;
  const counts = await deps.sql`
    select pack, attributes->>'framework' as framework, count(*)::int as n from elements
    where layer = 'reference' and deleted_at is null group by 1, 2`;
  const inst = new Map(installed.map((r) => [r.id as string, r]));
  const installedInfo = (i: (typeof installed)[number]): AvailablePack['installed'] => {
    const stored = (i.manifest as { frameworks?: FrameworkConfig[] } | null)?.frameworks ?? [];
    const versions = new Map(stored.map((f) => [f.id, f.version]));
    const frameworks: Record<string, { elements: number; version?: string }> = {};
    for (const c of counts.filter((c) => c.pack === i.id))
      frameworks[String(c.framework ?? '')] = {
        elements: c.n as number,
        version: versions.get(c.framework as string),
      };
    return {
      version: i.version as string,
      elements: Number(i.elementCount),
      installedAt: new Date(i.installedAt as string).toISOString(),
      frameworks,
    };
  };
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
      installed: i ? installedInfo(i) : null,
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
      installed: installedInfo(i),
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
/* Source files → pack (TM Forum and similar sources)                  */
/* ------------------------------------------------------------------ */

export interface FilesReport {
  version: string;
  /** Where the version came from: typed in, stated in the files, or today's date. */
  versionFrom: 'entered' | 'files' | 'date';
  files: Array<{ name: string; reader: string | null; sheets: SheetReport[]; notes: string[] }>;
  /** Frameworks in these files: an update replaces only these and leaves the others. */
  frameworks: Array<{ id: string; name: string; elementType: ElementType; elements: number }>;
  notes: string[];
}

/**
 * Builds a pack from source files. Files a pack reader recognises (such as TM Forum's
 * workbooks) are read by it; other spreadsheets fall back to finding id, name, parent and
 * description columns for the frameworks without a reader.
 */
export async function packFromFiles(
  deps: Deps,
  packId: string,
  version: string | undefined,
  files: Array<{ name: string; data: Uint8Array }>,
): Promise<{ content: PackContent; report: FilesReport }> {
  const meta = (await listPacksStatic()).find((p) => p.id === packId);
  if (!meta) throw notFound('That pack');
  const readers = PACK_READERS[packId] ?? [];
  const withReader = new Set(readers.map((r) => r.framework));
  const fallback = meta.frameworks.filter((f) => !withReader.has(f.id));
  const results: SourceResult[] = [];
  const reportFiles: FilesReport['files'] = [];
  for (const f of files) {
    const parsed = await parseFile(f.name, f.data);
    if (!parsed.sheets) {
      reportFiles.push({
        name: f.name,
        reader: null,
        sheets: [],
        notes: [parsed.warnings[0] ?? 'Not a spreadsheet; skipped.'],
      });
      continue;
    }
    const source = { name: f.name, sheets: parsed.sheets };
    const reader = readers.find((r) => r.recognises(source));
    const res = reader
      ? reader.read(source)
      : readByColumns(source, fallback, meta.columns, { strict: readers.length > 0 });
    results.push(res);
    reportFiles.push({
      name: f.name,
      reader: reader?.label ?? null,
      sheets: res.sheets,
      notes: [...parsed.warnings, ...res.notes],
    });
  }
  const installed = (await installedRefs(deps, packId)).map((r) => ({
    sourceId: r.el.key ?? '',
    framework: String(r.el.attributes.framework ?? ''),
    name: r.el.name,
  }));
  const assembled = assembleSources(
    results,
    installed,
    Object.fromEntries(meta.frameworks.map((f) => [f.id, f.name])),
  );
  const entered = version?.trim();
  const finalVersion = entered || assembled.version || new Date().toISOString().slice(0, 10);
  const content: PackContent = {
    format: 'atrium-pack',
    manifest: {
      id: meta.id,
      name: meta.name,
      version: finalVersion,
      publisher: meta.publisher,
      description: meta.description,
      license: meta.license,
      homepage: meta.homepage,
      frameworks: meta.frameworks,
    },
    elements: assembled.elements,
    relations: assembled.relations,
  };
  const counts = new Map<string, number>();
  for (const e of assembled.elements) counts.set(e.framework, (counts.get(e.framework) ?? 0) + 1);
  return {
    content,
    report: {
      version: finalVersion,
      versionFrom: entered ? 'entered' : assembled.version ? 'files' : 'date',
      files: reportFiles,
      frameworks: meta.frameworks
        .filter((f) => counts.has(f.id))
        .map((f) => ({
          id: f.id,
          name: f.name,
          elementType: f.elementType,
          elements: counts.get(f.id)!,
        })),
      notes: assembled.notes,
    },
  };
}

/** The pack a file is reference material for, when one of its readers recognises it. */
export async function referencePackFor(file: {
  name: string;
  sheets: Array<{ name: string; headers: string[]; rows: Array<Record<string, unknown>> }>;
}): Promise<{ packId: string; packName: string; label: string } | undefined> {
  for (const [packId, readers] of Object.entries(PACK_READERS)) {
    const reader = readers.find((r) => r.recognises(file));
    if (!reader) continue;
    const meta = (await listPacksStatic()).find((p) => p.id === packId);
    return { packId, packName: meta?.name ?? packId, label: reader.label };
  }
  return undefined;
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

/**
 * Which installed frameworks an update replaces. Files hold one framework each, so an upload of
 * only the SID file must leave the installed eTOM alone; a complete pack file replaces everything.
 */
export type PackScope = string[] | undefined;

const frameworkOf = (el: Element) => String(el.attributes.framework ?? '');

export async function previewPack(
  deps: Deps,
  content: PackContent,
  scope?: PackScope,
): Promise<{
  validation: ReturnType<typeof validatePack>;
  diff: PackDiff;
  installedVersion: string | null;
}> {
  const validation = validatePack(content);
  const all = await installedRefs(deps, content.manifest.id);
  const byId = new Map(all.map((i) => [i.el.id, i.el]));
  const installed = scope ? all.filter((i) => scope.includes(frameworkOf(i.el))) : all;
  const diff = diffPack(
    installed.map((i) => {
      const { framework: _, ...attributes } = i.el.attributes;
      return {
        id: i.el.id,
        key: i.el.key,
        name: i.el.name,
        type: i.el.type,
        mappedFrom: i.mapped,
        description: i.el.description,
        parentKey: byId.get(i.el.parentId ?? '')?.key ?? null,
        attributes,
      };
    }),
    content,
  );
  const [row] =
    await deps.sql`select version from reference_packs where id = ${content.manifest.id}`;
  return { validation, diff, installedVersion: (row?.version as string) ?? null };
}

export async function installPack(
  deps: Deps,
  ctx: RequestContext,
  content: PackContent,
  scope?: PackScope,
) {
  const { validation, diff } = await previewPack(deps, content, scope);
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
    const installed = await installedRefs(deps, packId);
    for (const r of installed) if (r.el.key) idBySource.set(r.el.key, r.el.id);
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
    // 3. hierarchy (unchanged elements keep their parent)
    for (const e of [
      ...diff.added,
      ...diff.renamed.map((r) => r.element),
      ...diff.changed.map((c) => c.element),
    ]) {
      const id = idBySource.get(e.sourceId);
      const parent = e.parentSourceId ? idBySource.get(e.parentSourceId) : null;
      if (id) await tx`update elements set parent_id = ${parent ?? null} where id = ${id}`;
    }
    // 4. relations inside the pack: those from the frameworks being replaced now match the files
    const inScope = new Set(
      installed.filter((r) => !scope || scope.includes(frameworkOf(r.el))).map((r) => r.el.id),
    );
    for (const e of content.elements) inScope.add(idBySource.get(e.sourceId)!);
    const packIds = new Set(idBySource.values());
    const wanted = new Map<string, { type: string; source: string; target: string }>();
    for (const r of content.relations) {
      const source = idBySource.get(r.from);
      const target = idBySource.get(r.to);
      if (source && target)
        wanted.set(`${r.type}|${source}|${target}`, { type: r.type, source, target });
    }
    const current = await tx`
      select id, type, source_id, target_id from relations
      where deleted_at is null and type <> 'maps_to' and source_id in (
        select id from elements where pack = ${packId} and deleted_at is null)`;
    const stale: string[] = [];
    for (const r of current) {
      const k = `${r.type}|${r.sourceId}|${r.targetId}`;
      if (wanted.has(k)) wanted.delete(k);
      else if (inScope.has(r.sourceId as string) && packIds.has(r.targetId as string))
        stale.push(r.id as string);
    }
    if (stale.length) await tx`update relations set deleted_at = now() where id in ${tx(stale)}`;
    const fresh = [...wanted.values()].map((r) => ({
      type: r.type,
      sourceId: r.source,
      targetId: r.target,
      createdBy: ctx.name,
    }));
    for (let i = 0; i < fresh.length; i += 1000)
      await tx`insert into relations ${tx(fresh.slice(i, i + 1000))} on conflict do nothing`;
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
    // Each framework remembers the release it was last loaded from.
    const [prev] = await tx`select manifest from reference_packs where id = ${packId}`;
    const prevVersions = new Map(
      ((prev?.manifest as { frameworks?: FrameworkConfig[] } | undefined)?.frameworks ?? []).map(
        (f) => [f.id, f.version],
      ),
    );
    const loaded = new Set(content.elements.map((e) => e.framework));
    const manifest = {
      ...content.manifest,
      frameworks: content.manifest.frameworks.map((f) => ({
        ...f,
        version: loaded.has(f.id) ? content.manifest.version : prevVersions.get(f.id),
      })),
    };
    const [{ n }] = await tx`
      select count(*)::int as n from elements where pack = ${packId} and deleted_at is null`;
    await tx`
      insert into reference_packs (id, name, version, manifest, element_count, installed_by)
      values (${packId}, ${content.manifest.name}, ${content.manifest.version}, ${tx.json(manifest as never)}, ${n as number}, ${ctx.name})
      on conflict (id) do update set name = excluded.name, version = excluded.version, manifest = excluded.manifest,
        element_count = excluded.element_count, installed_at = now(), installed_by = excluded.installed_by`;
    return { moved, flagged, links: fresh.length, unlinked: stale.length };
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
