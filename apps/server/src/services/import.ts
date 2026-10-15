import { randomUUID } from 'node:crypto';
import {
  type Candidate,
  type ColumnTarget,
  detectElementType,
  guessMapping,
  type NormalizedModel,
  type ParsedFile,
  type ParsedSheet,
  parseFile,
  type SheetMapping,
  sheetToCandidates,
} from '@atrium/importers';
import {
  ELEMENT_TYPE_DEFS,
  ELEMENT_TYPES,
  type Element,
  type ElementType,
  enumLabel,
  normalizeName,
  RELATION_TYPE_DEFS,
  RELATION_TYPES,
  type RelationType,
  similarity,
  typeDef,
} from '@atrium/schema';
import type { RequestContext } from '../auth/context';
import { badRequest, notFound } from '../http/errors';
import { audit } from './audit';
import { ChangeBuilder } from './builder';
import type { Deps } from './deps';
import { referencePackFor } from './packs';
import { canEditDirectly } from './policy';
import { resolveState } from './store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StoredImport {
  id: string;
  createdAt: number;
  userId: string | null;
  files: Array<{ name: string; parsed: ParsedFile }>;
  sheets: Array<{
    fileIndex: number;
    sheet: ParsedSheet;
    /** `elements`: one element per row; `relations`: one link per row; `skip`: leave the sheet out. */
    role: SheetRole;
    type: ElementType;
    mapping: SheetMapping;
    remembered: boolean;
  }>;
  models: Array<{ fileIndex: number; model: NormalizedModel }>;
  /** Files that are reference material for a pack (TM Forum workbooks): left out by default. */
  reference: ReferenceFile[];
}

interface ReferenceFile {
  file: string;
  packId: string;
  packName: string;
  label: string;
}

/** Parsed uploads waiting for the person to confirm (kept for 30 minutes). */
const pending = new Map<string, StoredImport>();
setInterval(() => {
  const cutoff = Date.now() - 30 * 60_000;
  for (const [k, v] of pending) if (v.createdAt < cutoff) pending.delete(k);
}, 60_000).unref();

const signature = (sheet: ParsedSheet) => sheet.headers.map(normalizeName).sort().join('|');

export type SheetRole = 'elements' | 'relations' | 'skip';

const NOTE_SHEETS =
  /^(read ?me|about|info|instructions?|notes?|help|legend|summary|contents|cover)$/i;

/** Columns of a sheet that lists one link per row (as Atrium's own Excel export does). */
function relationColumns(sheet: ParsedSheet) {
  const find = (...names: string[]) => sheet.headers.find((h) => names.includes(normalizeName(h)));
  const from = find('from', 'source', 'from element', 'source element');
  const to = find('to', 'target', 'to element', 'target element');
  const type = find('type', 'relation', 'relationship', 'relation type', 'link', 'link type');
  if (!from || !to || !type) return null;
  return {
    from,
    to,
    type,
    fromType: find('from type', 'source type'),
    toType: find('to type', 'target type'),
  };
}

function guessRole(sheet: ParsedSheet): SheetRole {
  if (NOTE_SHEETS.test(sheet.name.trim())) return 'skip';
  if (relationColumns(sheet)) return 'relations';
  return 'elements';
}

const RELATION_WORDS = new Map<string, { type: RelationType; reverse: boolean }>();
for (const t of RELATION_TYPES) {
  const d = RELATION_TYPE_DEFS[t];
  RELATION_WORDS.set(normalizeName(t.replace(/_/g, ' ')), { type: t, reverse: false });
  RELATION_WORDS.set(normalizeName(d.label), { type: t, reverse: false });
  RELATION_WORDS.set(normalizeName(d.inverseLabel), { type: t, reverse: true });
}
const TYPE_WORDS = new Map<string, ElementType>();
for (const t of ELEMENT_TYPES) {
  const d = ELEMENT_TYPE_DEFS[t];
  for (const w of [t.replace(/_/g, ' '), d.label, d.plural]) TYPE_WORDS.set(normalizeName(w), t);
}

interface LinkEnd {
  name: string;
  type?: ElementType;
}

interface LinkRow {
  row: number;
  type: RelationType;
  from: LinkEnd;
  to: LinkEnd;
}

/** Reads a relations sheet into links; rows it can't understand become warnings. */
function sheetToLinks(sheet: ParsedSheet): { links: LinkRow[]; warnings: string[] } {
  const cols = relationColumns(sheet);
  const links: LinkRow[] = [];
  const warnings: string[] = [];
  if (!cols) return { links, warnings: ['This sheet needs "From", "To" and "Type" columns.'] };
  const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
  sheet.rows.forEach((r, i) => {
    const kind = RELATION_WORDS.get(normalizeName(text(r[cols.type])));
    const fromName = text(r[cols.from]);
    const toName = text(r[cols.to]);
    if (!fromName || !toName) return;
    if (!kind) {
      warnings.push(`Row ${i + 2}: "${text(r[cols.type])}" is not a link type Atrium knows.`);
      return;
    }
    const a: LinkEnd = {
      name: fromName,
      type: cols.fromType ? TYPE_WORDS.get(normalizeName(text(r[cols.fromType]))) : undefined,
    };
    const b: LinkEnd = {
      name: toName,
      type: cols.toType ? TYPE_WORDS.get(normalizeName(text(r[cols.toType]))) : undefined,
    };
    links.push({
      row: i + 2,
      type: kind.type,
      from: kind.reverse ? b : a,
      to: kind.reverse ? a : b,
    });
  });
  return { links, warnings };
}

export function targetLabel(t: ColumnTarget, type: ElementType): string {
  switch (t.kind) {
    case 'core':
      return {
        name: 'Name',
        key: 'Key',
        description: 'Description',
        owner: 'Owner',
        domain: 'Domain',
        parent: 'Part of',
        lifecycle: 'Lifecycle',
        classification: 'Classification',
        tags: 'Tags',
        team: 'Team',
        external_id: 'ID in source system',
      }[t.field];
    case 'attribute':
      return ELEMENT_TYPE_DEFS[type].attributes.find((a) => a.key === t.key)?.label ?? t.key;
    case 'relation':
      return `Link: ${t.relation.replace('_', ' ')} ${typeDef(t.targetType).label.toLowerCase()}`;
    case 'lifecycle_date':
      return `${enumLabel(t.phase)} date`;
    case 'level':
      return `Level ${t.level}`;
    default:
      return 'Ignore';
  }
}

/* ------------------------------------------------------------------ */
/* Matching                                                             */
/* ------------------------------------------------------------------ */

interface MatchIndex {
  byId: Map<string, Element>;
  byExternal: Map<string, Element>;
  byKey: Map<string, Element>;
  byName: Map<string, Element>;
  all: Element[];
}

function matchIndex(elements: Iterable<Element>): MatchIndex {
  const idx: MatchIndex = {
    byId: new Map(),
    byExternal: new Map(),
    byKey: new Map(),
    byName: new Map(),
    all: [],
  };
  for (const e of elements) {
    if (e.layer !== 'org') continue;
    idx.all.push(e);
    idx.byId.set(e.id, e);
    for (const v of Object.values(e.externalIds))
      idx.byExternal.set(`${e.type}:${String(v).toLowerCase()}`, e);
    if (e.key) idx.byKey.set(`${e.type}:${e.key.toLowerCase()}`, e);
    idx.byName.set(`${e.type}:${normalizeName(e.name)}`, e);
  }
  return idx;
}

function findMatch(
  idx: MatchIndex,
  type: ElementType,
  c: { name: string; key?: string; externalId?: string },
): { el: Element; how: 'id' | 'external' | 'key' | 'name' | 'similar' } | null {
  // Atrium's own ArchiMate export writes ids as "id-<uuid>".
  const own = c.externalId?.replace(/^id-(?=[0-9a-f]{8}-)/i, '');
  if (own && UUID.test(own)) {
    const el = idx.byId.get(own);
    if (el && el.type === type) return { el, how: 'id' };
  }
  if (c.externalId) {
    const el = idx.byExternal.get(`${type}:${c.externalId.toLowerCase()}`);
    if (el) return { el, how: 'external' };
  }
  if (c.key) {
    const el = idx.byKey.get(`${type}:${c.key.toLowerCase()}`);
    if (el) return { el, how: 'key' };
  }
  const exact = idx.byName.get(`${type}:${normalizeName(c.name)}`);
  if (exact) return { el: exact, how: 'name' };
  let best: Element | null = null;
  let bestScore = 0;
  for (const e of idx.all) {
    if (e.type !== type) continue;
    const s = similarity(e.name, c.name);
    if (s > bestScore) {
      best = e;
      bestScore = s;
    }
  }
  return best && bestScore >= 0.86 ? { el: best, how: 'similar' } : null;
}

/** Types the far end of a link column may have, the column's own type first. */
function farTypes(r: Candidate['relations'][number]): ElementType[] {
  const def = RELATION_TYPE_DEFS[r.relation];
  const allowed = r.direction === 'out' ? def.to : def.from;
  return [r.targetType, ...allowed.filter((t) => t !== r.targetType)];
}

/**
 * List cells are split on commas, which breaks names that contain one ("API first, events for
 * change"). Glue neighbours back together when only the joined name is known.
 */
function rejoin(names: string[], known: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (let i = 0; i < names.length; i++) {
    let name = names[i]!;
    if (!known(name)) {
      for (let j = i + 1; j < Math.min(names.length, i + 4); j++) {
        const joined = names.slice(i, j + 1).join(', ');
        if (known(joined)) {
          name = joined;
          i = j;
          break;
        }
      }
    }
    out.push(name);
  }
  return out;
}

/** The element a link end refers to, by name and (when given) type. */
function findEnd(idx: MatchIndex, end: LinkEnd, allowed: readonly ElementType[]) {
  for (const t of end.type ? [end.type] : allowed) {
    const m = findMatch(idx, t, { name: end.name });
    if (m) return m.el;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Preview                                                              */
/* ------------------------------------------------------------------ */

export interface SheetPreview {
  index: number;
  file: string;
  name: string;
  rows: number;
  role: SheetRole;
  type: ElementType;
  typeReason: string;
  confidence: number;
  remembered: boolean;
  columns: Array<{
    header: string;
    target: ColumnTarget;
    label: string;
    confidence: number;
    samples: string[];
  }>;
  outcome: { create: number; update: number; unchanged: number; similar: number; skipped: number };
  examples: Array<{
    row: number;
    name: string;
    outcome: 'create' | 'update' | 'unchanged';
    match?: string;
    how?: string;
    fields?: string[];
  }>;
  warnings: string[];
}

export interface ImportPreview {
  importId: string;
  files: Array<{ name: string; format: string; warnings: string[] }>;
  sheets: SheetPreview[];
  models: Array<{
    file: string;
    elements: number;
    relations: number;
    byType: Record<string, number>;
  }>;
  totals: { create: number; update: number; unchanged: number; relations: number };
  mode: 'direct' | 'suggestion';
  /** Files that belong in a reference pack rather than in your own model. */
  reference: ReferenceFile[];
}

function candidateDiff(c: Candidate, el: Element, domainName: string | null): string[] {
  const fields: string[] = [];
  if (c.description && c.description.trim() !== el.description.trim()) fields.push('description');
  if (c.owner && c.owner !== el.owner) fields.push('owner');
  if (c.lifecycle && c.lifecycle !== el.lifecycle) fields.push('lifecycle');
  if (c.classification && c.classification !== el.classification) fields.push('classification');
  if (c.domainName && normalizeName(c.domainName) !== normalizeName(domainName ?? ''))
    fields.push('domain');
  for (const [k, v] of Object.entries(c.attributes)) {
    if (
      v !== undefined &&
      v !== null &&
      v !== '' &&
      JSON.stringify(v) !== JSON.stringify(el.attributes[k])
    )
      fields.push(k);
  }
  return fields;
}

async function buildPreview(
  deps: Deps,
  ctx: RequestContext,
  stored: StoredImport,
): Promise<ImportPreview> {
  const state = await resolveState(deps.store, deps.sql, ctx, { includeDrafts: false });
  const idx = matchIndex(state.elements.values());
  const domainName = (id: string | null) => (id ? (state.elements.get(id)?.name ?? null) : null);
  const totals = { create: 0, update: 0, unchanged: 0, relations: 0 };
  const linked = new Set(
    [...state.relations.values()].map((r) => `${r.type}|${r.sourceId}|${r.targetId}`),
  );
  const exists = (type: RelationType, from: string, to: string) =>
    linked.has(`${type}|${from}|${to}`);
  const sheets: SheetPreview[] = stored.sheets.map((s, i) => {
    const base = {
      index: i,
      file: stored.files[s.fileIndex]!.name,
      name: s.sheet.name,
      rows: s.sheet.rows.length,
      role: s.role,
      type: s.type,
      remembered: s.remembered,
    };
    if (s.role !== 'elements') {
      const outcome = { create: 0, update: 0, unchanged: 0, similar: 0, skipped: 0 };
      const { links, warnings } =
        s.role === 'relations' ? sheetToLinks(s.sheet) : { links: [], warnings: [] };
      for (const l of links) {
        const def = RELATION_TYPE_DEFS[l.type];
        const from = findEnd(idx, l.from, def.from);
        const to = findEnd(idx, l.to, def.to);
        if (from && to && exists(l.type, from.id, to.id)) outcome.unchanged++;
        else {
          outcome.create++;
          totals.relations++;
        }
      }
      if (s.role === 'skip') outcome.skipped = s.sheet.rows.length;
      const pack = stored.reference.find((r) => r.file === base.file);
      return {
        ...base,
        typeReason:
          s.role === 'relations'
            ? 'One link per row: a type, where it starts and where it points.'
            : pack
              ? `Part of the ${pack.label}, so it is left out: load it into the pack instead.`
              : 'Looks like notes rather than data, so it is left out.',
        confidence: 1,
        columns: [],
        outcome,
        examples: [],
        warnings: warnings.slice(0, 20),
      };
    }
    const { candidates, warnings } = sheetToCandidates(s.sheet, s.mapping);
    const outcome = {
      create: 0,
      update: 0,
      unchanged: 0,
      similar: 0,
      skipped: s.sheet.rows.length - candidates.length,
    };
    const examples: SheetPreview['examples'] = [];
    for (const c of candidates) {
      const m = findMatch(idx, c.type, c);
      // Only links that don't exist yet count as news.
      for (const r of c.relations) {
        const known = (name: string) => !!findEnd(idx, { name }, farTypes(r));
        for (const name of rejoin(r.names, known)) {
          const other = findEnd(idx, { name }, farTypes(r));
          const [from, to] = r.direction === 'out' ? [m?.el, other] : [other, m?.el];
          if (!from || !to || !exists(r.relation, from.id, to.id)) totals.relations++;
        }
      }
      let ex: SheetPreview['examples'][number];
      if (!m) {
        outcome.create++;
        ex = { row: c.row, name: c.name, outcome: 'create' };
      } else {
        const fields = candidateDiff(c, m.el, domainName(m.el.domainId));
        if (m.how === 'similar') outcome.similar++;
        if (fields.length) {
          outcome.update++;
          ex = {
            row: c.row,
            name: c.name,
            outcome: 'update',
            match: m.el.name,
            how: m.how,
            fields,
          };
        } else {
          outcome.unchanged++;
          ex = { row: c.row, name: c.name, outcome: 'unchanged', match: m.el.name, how: m.how };
        }
      }
      if (examples.length < 12 && (ex.outcome !== 'unchanged' || examples.length < 4))
        examples.push(ex);
    }
    totals.create += outcome.create;
    totals.update += outcome.update;
    totals.unchanged += outcome.unchanged;
    return {
      ...base,
      typeReason: detectElementType(s.sheet).reason,
      confidence: s.mapping.confidence,
      columns: s.sheet.headers.map((h) => {
        const target = s.mapping.columns[h] ?? { kind: 'ignore' as const };
        return {
          header: h,
          target,
          label: targetLabel(target, s.type),
          confidence: s.mapping.columnConfidence[h] ?? 0,
          samples: s.sheet.rows
            .map((r) => r[h])
            .filter((v) => v !== null && v !== undefined && v !== '')
            .slice(0, 3)
            .map((v) => (Array.isArray(v) ? v.join(', ') : String(v)).slice(0, 60)),
        };
      }),
      outcome,
      examples,
      warnings: warnings.slice(0, 20),
    };
  });
  const models = stored.models.map((m) => {
    const byType: Record<string, number> = {};
    const refs = new Map<string, Element>();
    const byRef = new Map(m.model.elements.map((e) => [e.ref, e]));
    for (const e of m.model.elements) {
      byType[e.type] = (byType[e.type] ?? 0) + 1;
      const match = findMatch(idx, e.type, {
        name: e.name,
        key: e.key,
        externalId: Object.values(e.externalIds)[0],
      });
      if (match) refs.set(e.ref, match.el);
      if (!match) {
        if (!e.placeholder) totals.create++;
        continue;
      }
      if (e.placeholder) continue;
      const fields = candidateDiff(
        {
          row: 0,
          type: e.type,
          name: e.name,
          description: e.description,
          owner: e.owner,
          lifecycle: e.lifecycle,
          classification: e.classification,
          domainName: e.domainRef ? byRef.get(e.domainRef)?.name : undefined,
          attributes: e.attributes ?? {},
          relations: [],
        },
        match.el,
        domainName(match.el.domainId),
      );
      if (fields.length) totals.update++;
      else totals.unchanged++;
    }
    for (const r of m.model.relations) {
      const from = refs.get(r.from);
      const to = refs.get(r.to);
      if (!from || !to || !exists(r.type, from.id, to.id)) totals.relations++;
    }
    return {
      file: stored.files[m.fileIndex]!.name,
      elements: m.model.elements.length,
      relations: m.model.relations.length,
      byType,
    };
  });
  return {
    importId: stored.id,
    files: stored.files.map((f) => ({
      name: f.name,
      format: f.parsed.format,
      warnings: f.parsed.warnings.slice(0, 20),
    })),
    sheets,
    models,
    totals,
    mode:
      ctx.kind === 'user' && canEditDirectly(ctx, null, { get: () => undefined } as never)
        ? 'direct'
        : 'suggestion',
    reference: stored.reference,
  };
}

export async function previewImport(
  deps: Deps,
  ctx: RequestContext,
  files: Array<{ name: string; data: Uint8Array }>,
): Promise<ImportPreview> {
  if (!files.length) throw badRequest('Choose a file to import.');
  const stored: StoredImport = {
    id: randomUUID(),
    createdAt: Date.now(),
    userId: ctx.userId,
    files: [],
    sheets: [],
    models: [],
    reference: [],
  };
  for (const f of files) {
    const parsed = await parseFile(f.name, f.data);
    if (parsed.format === 'unknown')
      throw badRequest(
        `${f.name} isn't a format Atrium can read. Use Excel (.xlsx), CSV, ArchiMate exchange (.xml), Backstage (catalog-info.yaml) or atrium.yaml.`,
      );
    const fileIndex = stored.files.push({ name: f.name, parsed }) - 1;
    // A standard's reference model (a TM Forum workbook) goes into its pack, not your model.
    const pack = parsed.sheets
      ? await referencePackFor({ name: f.name, sheets: parsed.sheets })
      : undefined;
    if (pack) stored.reference.push({ file: f.name, ...pack });
    for (const sheet of parsed.sheets ?? []) {
      if (!sheet.rows.length) continue;
      if (pack) {
        stored.sheets.push({
          fileIndex,
          sheet,
          role: 'skip',
          type: detectElementType(sheet).type,
          mapping: guessMapping(sheet, detectElementType(sheet).type),
          remembered: false,
        });
        continue;
      }
      const [remembered] =
        await deps.sql`select element_type, mapping from import_mappings where signature = ${signature(sheet)}`;
      const role = guessRole(sheet);
      if (remembered && role === 'elements') {
        stored.sheets.push({
          fileIndex,
          sheet,
          role,
          type: remembered.elementType as ElementType,
          mapping: remembered.mapping as SheetMapping,
          remembered: true,
        });
      } else {
        const type = detectElementType(sheet).type;
        stored.sheets.push({
          fileIndex,
          sheet,
          role,
          type,
          mapping: guessMapping(sheet, type),
          remembered: false,
        });
      }
    }
    if (parsed.model) stored.models.push({ fileIndex, model: parsed.model });
  }
  if (!stored.sheets.length && !stored.models.length)
    throw badRequest('The file has no rows to import.');
  pending.set(stored.id, stored);
  return buildPreview(deps, ctx, stored);
}

function getStored(id: string, ctx: RequestContext) {
  const s = pending.get(id);
  if (!s || s.userId !== ctx.userId)
    throw notFound('That import (it may have expired; upload the file again)');
  return s;
}

export async function updateImportSheet(
  deps: Deps,
  ctx: RequestContext,
  importId: string,
  sheetIndex: number,
  patch: { role?: SheetRole; type?: ElementType; columns?: Record<string, ColumnTarget> },
) {
  const stored = getStored(importId, ctx);
  const s = stored.sheets[sheetIndex];
  if (!s) throw notFound('That sheet');
  if (patch.role) {
    if (patch.role === 'relations' && !relationColumns(s.sheet))
      throw badRequest('A links sheet needs "From", "To" and "Type" columns.');
    s.role = patch.role;
  }
  if (patch.type) s.role = 'elements';
  if (patch.type && patch.type !== s.type) {
    s.type = patch.type;
    s.mapping = guessMapping(s.sheet, patch.type);
  }
  if (patch.columns) {
    s.mapping = {
      ...s.mapping,
      elementType: s.type,
      columns: { ...s.mapping.columns, ...patch.columns },
    };
    for (const h of Object.keys(patch.columns)) s.mapping.columnConfidence[h] = 1;
  }
  return buildPreview(deps, ctx, stored);
}

/* ------------------------------------------------------------------ */
/* Apply                                                                */
/* ------------------------------------------------------------------ */

export async function applyImport(
  deps: Deps,
  ctx: RequestContext,
  importId: string,
  opts: { skipSheets?: number[] } = {},
) {
  const stored = getStored(importId, ctx);
  const state = await resolveState(deps.store, deps.sql, ctx, { includeDrafts: false });
  const b = new ChangeBuilder(deps, ctx, state);
  const idx = matchIndex(state.elements.values());
  const made = new Map<string, Element>(); // `${type}:${normalized name}` → element created in this import
  // Keys are unique per type: a second, differently named row with a key already in use is
  // imported without it (and a warning) rather than failing the whole import.
  const keysUsed = new Set(idx.byKey.keys());
  let created = 0;
  let updated = 0;
  let linked = 0;
  // Links that already existed (in the model or earlier in this import) are not counted again.
  const counted = new Set<string>();
  const count = (rel: { id: string } | null) => {
    if (!rel || state.relations.has(rel.id) || counted.has(rel.id)) return;
    counted.add(rel.id);
    linked++;
  };

  const ensure = async (
    type: ElementType,
    name: string,
    extra: Partial<Candidate> = {},
  ): Promise<Element | undefined> => {
    const n = normalizeName(name);
    if (!n) return undefined;
    const key = `${type}:${n}`;
    const madeHit = made.get(key);
    if (madeHit) return madeHit;
    const m = findMatch(idx, type, { name, key: extra.key });
    if (m) return b.get(m.el.id) ?? m.el;
    const el = await b.create({
      type,
      name,
      source: 'import',
      ...(extra.domainName ? { domainId: (await ensure('domain', extra.domainName))?.id } : {}),
    });
    made.set(key, el);
    created++;
    return el;
  };

  const upsert = async (
    c: Candidate | (Candidate & { externalIds?: Record<string, string> }),
    fileName: string,
  ) => {
    const domain = c.domainName ? await ensure('domain', c.domainName) : undefined;
    const parent = c.parentName
      ? await ensure(c.type, c.parentName, { domainName: c.domainName })
      : undefined;
    const match =
      findMatch(idx, c.type, c) ??
      (made.get(`${c.type}:${normalizeName(c.name)}`)
        ? { el: made.get(`${c.type}:${normalizeName(c.name)}`)!, how: 'name' as const }
        : null);
    const attributes = Object.fromEntries(
      Object.entries(c.attributes).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    );
    const externalIds =
      c.externalId && !UUID.test(c.externalId)
        ? { [fileName.replace(/\.[^.]+$/, '')]: c.externalId }
        : undefined;
    let el: Element;
    if (match) {
      const current = b.get(match.el.id) ?? match.el;
      const next = b.update(current.id, {
        description: c.description || undefined,
        owner: c.owner || undefined,
        lifecycle: c.lifecycle,
        lifecycleDates: c.lifecycleDates
          ? { ...current.lifecycleDates, ...c.lifecycleDates }
          : undefined,
        classification: c.classification,
        domainId: domain?.id,
        parentId: parent?.id,
        tags: c.tags?.length ? [...new Set([...current.tags, ...c.tags])] : undefined,
        attributes: Object.keys(attributes).length ? attributes : undefined,
        externalIds: externalIds ? { ...current.externalIds, ...externalIds } : undefined,
      });
      if (next && next !== current) updated++;
      el = next ?? current;
    } else {
      const keyId = c.key ? `${c.type}:${c.key.toLowerCase()}` : undefined;
      const keyFree = !!keyId && !keysUsed.has(keyId);
      if (keyId && !keyFree)
        b.warnings.push(
          `"${c.name}": its key "${c.key}" is already used by another element of this type, so it was imported without a key.`,
        );
      if (keyFree) keysUsed.add(keyId);
      el = await b.create({
        type: c.type,
        name: c.name,
        key: keyFree ? c.key : undefined,
        description: c.description,
        owner: c.owner,
        lifecycle: c.lifecycle,
        lifecycleDates: c.lifecycleDates,
        classification: c.classification,
        domainId: domain?.id,
        parentId: parent?.id,
        tags: c.tags,
        attributes,
        externalIds,
        source: 'import',
      });
      made.set(`${c.type}:${normalizeName(c.name)}`, el);
      created++;
    }
    if (c.teamName) {
      const team = await ensure('team', c.teamName);
      if (team) count(b.link('owned_by', el.id, team.id));
    }
    return el;
  };

  // Tabular sheets, capabilities and domains first so links can find them.
  const order: ElementType[] = [
    'domain',
    'team',
    'capability',
    'business_process',
    'data_object',
    'technology',
    'application',
    'interface',
  ];
  const active = stored.sheets
    .map((s, i) => ({ ...s, i }))
    .filter((s) => !opts.skipSheets?.includes(s.i) && s.role !== 'skip');
  const sheets = active
    .filter((s) => s.role === 'elements')
    .sort((a, b2) => (order.indexOf(a.type) + 1 || 99) - (order.indexOf(b2.type) + 1 || 99));
  const pendingRelations: Array<{ el: Element; c: Candidate }> = [];
  for (const s of sheets) {
    const { candidates } = sheetToCandidates(s.sheet, { ...s.mapping, elementType: s.type });
    for (const c of candidates) {
      const el = await upsert({ ...c, type: s.type }, stored.files[s.fileIndex]!.name);
      pendingRelations.push({ el, c });
    }
  }
  for (const { el, c } of pendingRelations) {
    for (const r of c.relations) {
      const types = farTypes(r);
      const find = (name: string) =>
        types
          .map((t) => made.get(`${t}:${normalizeName(name)}`) ?? findMatch(idx, t, { name })?.el)
          .find(Boolean);
      for (const name of rejoin(r.names, (n) => !!find(n))) {
        // A "Governed by" column can name standards, principles and decisions alike.
        const known = find(name);
        const target = known ? (b.get(known.id) ?? known) : await ensure(r.targetType, name);
        if (!target) continue;
        const rel =
          r.direction === 'out'
            ? b.link(r.relation, el.id, target.id)
            : b.link(r.relation, target.id, el.id);
        count(rel);
      }
    }
  }

  // Sheets with one link per row, once every element exists.
  const relationSheets = active.filter((x) => x.role === 'relations');
  if (relationSheets.length) {
    const lookup = matchIndex(b.index.model.elements.values());
    const end = async (e: LinkEnd, allowed: readonly ElementType[]) =>
      findEnd(lookup, e, allowed) ??
      made.get(`${e.type}:${normalizeName(e.name)}`) ??
      (e.type ? await ensure(e.type, e.name) : null);
    for (const s of relationSheets) {
      for (const l of sheetToLinks(s.sheet).links) {
        const def = RELATION_TYPE_DEFS[l.type];
        const from = await end(l.from, def.from);
        const to = await end(l.to, def.to);
        if (from && to) count(b.link(l.type, from.id, to.id));
      }
    }
  }

  // Model formats (ArchiMate, Backstage, atrium.yaml)
  for (const m of stored.models) {
    const refs = new Map<string, Element>();
    const fileName = stored.files[m.fileIndex]!.name;
    const els = [...m.model.elements].sort(
      (a, b2) => (order.indexOf(a.type) + 1 || 99) - (order.indexOf(b2.type) + 1 || 99),
    );
    for (const e of els) {
      const domainName = e.domainRef
        ? m.model.elements.find((x) => x.ref === e.domainRef)?.name
        : undefined;
      const parentName = e.parentRef
        ? m.model.elements.find((x) => x.ref === e.parentRef)?.name
        : undefined;
      const existing = findMatch(idx, e.type, {
        name: e.name,
        key: e.key,
        externalId: Object.values(e.externalIds)[0],
      });
      if (e.placeholder && existing) {
        refs.set(e.ref, b.get(existing.el.id) ?? existing.el);
        continue;
      }
      const el = await upsert(
        {
          row: 0,
          type: e.type,
          name: e.name,
          key: e.key,
          description: e.description,
          owner: e.owner,
          domainName,
          parentName,
          lifecycle: e.lifecycle,
          lifecycleDates: e.lifecycleDates,
          classification: e.classification,
          tags: e.tags,
          attributes: e.attributes ?? {},
          relations: [],
          externalId: Object.values(e.externalIds)[0],
        },
        fileName,
      );
      refs.set(e.ref, el);
    }
    for (const r of m.model.relations) {
      const from = refs.get(r.from);
      const to = refs.get(r.to);
      if (from && to) count(b.link(r.type, from.id, to.id));
    }
  }

  const direct = ctx.kind === 'user' && canEditDirectly(ctx, null, b.index);
  const title = `Imported ${stored.files.map((f) => f.name).join(', ')}`;
  const res = await b.commit({
    kind: 'import',
    mode: direct ? 'direct' : 'suggestion',
    title,
    description: `${created} added, ${updated} updated, ${linked} links.`,
  });

  // Remember column mappings so the next import of the same layout needs no clicks.
  for (const s of sheets) {
    await deps.sql`
      insert into import_mappings (signature, element_type, mapping) values (${signature(s.sheet)}, ${s.type}, ${deps.sql.json({ ...s.mapping, elementType: s.type } as never)})
      on conflict (signature) do update set element_type = excluded.element_type, mapping = excluded.mapping, updated_at = now()`;
  }
  await deps.sql`insert into import_runs (file_name, format, status, summary, changeset_id, created_by)
    values (${stored.files.map((f) => f.name).join(', ')}, ${stored.files[0]!.parsed.format}, ${res.applied ? 'applied' : 'submitted'},
            ${deps.sql.json({ created, updated, linked, warnings: b.warnings.length } as never)}, ${res.changesetId}, ${ctx.name})`;
  await audit(
    deps.sql,
    ctx,
    'import.apply',
    { type: 'changeset', id: res.changesetId },
    { created, updated, linked },
  );
  pending.delete(importId);
  return {
    changesetId: res.changesetId,
    applied: res.applied,
    created,
    updated,
    linked,
    warnings: b.warnings.slice(0, 30),
  };
}
