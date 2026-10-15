import { type ElementType, normalizeName, type RelationType } from '@atrium/schema';
import type { PackElement, PackRelation } from './index';

/**
 * Turning source files (for example TM Forum's Excel workbooks) into pack elements. A pack can
 * ship readers that know its sources' layouts; files no reader recognises fall back to finding
 * id, name, parent and description columns by their headers.
 */

/** One worksheet as read from a file: rows keyed by header, in sheet order. */
export interface SourceSheet {
  name: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
}

export interface SourceFile {
  name: string;
  sheets: SourceSheet[];
}

/** A relation to an element known only by name, such as an application naming its functions. */
export interface NameLink {
  type: RelationType;
  from: string;
  /** Framework the target belongs to. */
  framework: string;
  name: string;
}

export interface SheetReport {
  name: string;
  loaded: boolean;
  /** What was loaded from the sheet, or why it was skipped. */
  note: string;
}

/** What a reader made of one file. */
export interface SourceResult {
  elements: PackElement[];
  relations: PackRelation[];
  links: NameLink[];
  sheets: SheetReport[];
  /** Things worth knowing: repaired ids, merged duplicates, rows left out. */
  notes: string[];
  /** Release stated in the file, such as "26.0". */
  version?: string;
}

/** Knows the layout of one kind of source file. */
export interface SourceReader {
  /** Framework the reader's elements belong to (an id from the pack manifest). */
  framework: string;
  /** What the file is, for messages ("eTOM workbook (GB921)"). */
  label: string;
  recognises(file: SourceFile): boolean;
  read(file: SourceFile): SourceResult;
}

export function emptyResult(): SourceResult {
  return { elements: [], relations: [], links: [], sheets: [], notes: [] };
}

/* ------------------------------------------------------------------ */
/* Cell helpers                                                        */
/* ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Text of a cell: trimmed, with HTML entities some exports leave behind ("&amp;") decoded. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = Array.isArray(value) ? value.join(', ') : String(value);
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === '#') {
        const n =
          code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
        return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[code.toLowerCase()] ?? m;
    })
    .trim();
}

/** The sheet's header that is `name` once case and punctuation are ignored. */
export function headerOf(sheet: SourceSheet, name: string): string | undefined {
  const want = normalizeName(name);
  return sheet.headers.find((h) => normalizeName(h) === want);
}

/** Whether the sheet has all these headers (case and punctuation ignored). */
export function hasHeaders(sheet: SourceSheet, names: string[]): boolean {
  return names.every((n) => headerOf(sheet, n) !== undefined);
}

/** "1.2.3" style identifiers. */
export function isDotted(id: string, minParts = 2): boolean {
  return /^\d+(\.\d+)*$/.test(id) && id.split('.').length >= minParts;
}

/** The closest ancestor of a dotted id that exists ("1.2.3.4" → "1.2" when "1.2.3" is missing). */
export function nearestAncestor(
  id: string,
  exists: (id: string) => boolean,
  minParts = 1,
): string | undefined {
  const parts = id.split('.');
  for (let n = parts.length - 1; n >= minParts; n--) {
    const candidate = parts.slice(0, n).join('.');
    if (exists(candidate)) return candidate;
  }
  return undefined;
}

/** Drops empty values so stored attributes stay small. */
export function compact(attrs: Record<string, unknown>): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
}

/* ------------------------------------------------------------------ */
/* Fallback: find the columns by their headers                          */
/* ------------------------------------------------------------------ */

export interface FrameworkColumns {
  id: string;
  name: string;
  elementType: ElementType;
  detect?: { sheetWords?: string[]; headerWords?: string[] };
}

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
  sheet: SourceSheet,
  frameworks: FrameworkColumns[],
  strict: boolean,
): FrameworkColumns | undefined {
  let best: FrameworkColumns | undefined;
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
  return best ?? (frameworks.length === 1 && !strict ? frameworks[0] : undefined);
}

/**
 * Reads sheets no pack reader recognises: works out the framework from the sheet's name and
 * headers, then takes id, name, parent and description columns. Dotted ids ("1.2.3") imply
 * their parent ("1.2"). With `strict`, a sheet must match a framework's words to be read,
 * even when there is only one framework to choose from.
 */
export function readByColumns(
  file: SourceFile,
  frameworks: FrameworkColumns[],
  columns: Record<string, string[]> = {},
  { strict = false }: { strict?: boolean } = {},
): SourceResult {
  const out = emptyResult();
  for (const sheet of file.sheets) {
    const fw = frameworks.length ? detectFramework(sheet, frameworks, strict) : undefined;
    if (!fw) {
      out.sheets.push({
        name: sheet.name,
        loaded: false,
        note: "Couldn't tell which framework this is",
      });
      continue;
    }
    const idCol = findColumn(sheet.headers, columns.id ?? ['id']);
    const nameCol = findColumn(sheet.headers, columns.name ?? ['name']);
    const parentCol = findColumn(sheet.headers, columns.parent ?? ['parent']);
    const descCol = findColumn(sheet.headers, columns.description ?? ['description']);
    if (!nameCol) {
      out.sheets.push({ name: sheet.name, loaded: false, note: 'No name column found' });
      continue;
    }
    let n = 0;
    for (const row of sheet.rows) {
      const name = cellText(row[nameCol]);
      if (!name) continue;
      const sourceId =
        (idCol && cellText(row[idCol])) || `${fw.id}:${normalizeName(name).replace(/ /g, '-')}`;
      let parent = parentCol ? cellText(row[parentCol]) || undefined : undefined;
      if (!parent && isDotted(sourceId)) parent = sourceId.split('.').slice(0, -1).join('.');
      out.elements.push({
        sourceId,
        framework: fw.id,
        type: fw.elementType,
        name,
        description: descCol ? cellText(row[descCol]) || undefined : undefined,
        parentSourceId: parent,
      });
      n++;
    }
    out.sheets.push({
      name: sheet.name,
      loaded: n > 0,
      note: `${plural(n, 'element')} (${fw.name})`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Combining files                                                     */
/* ------------------------------------------------------------------ */

export interface KnownElement {
  sourceId: string;
  framework: string;
  name: string;
}

export interface AssembledSources {
  elements: PackElement[];
  relations: PackRelation[];
  /** Frameworks the files hold elements for: an update replaces only these. */
  frameworks: string[];
  notes: string[];
  /** The release the files state, when they agree on one. */
  version?: string;
}

/**
 * Combines what the readers made of several files. An element that appears in more than one
 * file is kept once (later copies only fill gaps). Links by name are resolved against the
 * elements in these files and, for frameworks not in them, the ones already installed.
 */
export function assembleSources(
  results: SourceResult[],
  installed: KnownElement[] = [],
  frameworkNames: Record<string, string> = {},
): AssembledSources {
  const byId = new Map<string, PackElement>();
  const notes: string[] = [];
  let merged = 0;
  for (const r of results) {
    for (const e of r.elements) {
      const prev = byId.get(e.sourceId);
      if (!prev) {
        byId.set(e.sourceId, e);
        continue;
      }
      merged++;
      prev.description ??= e.description;
      prev.parentSourceId ??= e.parentSourceId;
      if (e.attributes) prev.attributes = { ...e.attributes, ...prev.attributes };
    }
  }
  if (merged)
    notes.push(`${plural(merged, 'element')} appeared in more than one file or sheet; kept once.`);
  const elements = [...byId.values()];
  const frameworks = [...new Set(elements.map((e) => e.framework))];

  const relations: PackRelation[] = [];
  const seen = new Set<string>();
  const add = (rel: PackRelation) => {
    const k = `${rel.type}|${rel.from}|${rel.to}`;
    if (seen.has(k) || rel.from === rel.to) return;
    seen.add(k);
    relations.push(rel);
  };
  for (const r of results) for (const rel of r.relations) add(rel);

  const links = results.flatMap((r) => r.links);
  if (links.length) {
    const candidates = new Map<string, string>();
    // Two elements with one name: always pick the same one, whether read now or installed.
    const index = (framework: string, name: string, sourceId: string) => {
      const k = `${framework}|${normalizeName(name)}`;
      const prev = candidates.get(k);
      if (!prev || sourceId.localeCompare(prev, 'en', { numeric: true }) < 0)
        candidates.set(k, sourceId);
    };
    for (const e of elements) index(e.framework, e.name, e.sourceId);
    const loaded = new Set(frameworks);
    const known = new Set(frameworks);
    for (const i of installed) {
      known.add(i.framework);
      if (!loaded.has(i.framework)) index(i.framework, i.name, i.sourceId);
    }
    const missing = new Map<string, number>();
    let unmatched = 0;
    for (const l of links) {
      const to = candidates.get(`${l.framework}|${normalizeName(l.name)}`);
      if (to) add({ type: l.type, from: l.from, to });
      else if (!known.has(l.framework))
        missing.set(l.framework, (missing.get(l.framework) ?? 0) + 1);
      else unmatched++;
    }
    for (const [fw, n] of missing)
      notes.push(
        `${plural(n, 'link')} to the ${frameworkNames[fw] ?? fw} can't be made: add that file to the same upload to include them.`,
      );
    if (unmatched)
      notes.push(
        `${plural(unmatched, 'link')} named an element that isn't in the files; left out.`,
      );
  }

  const versions = [...new Set(results.map((r) => r.version).filter(Boolean))] as string[];
  return {
    elements,
    relations,
    frameworks,
    notes,
    version: versions.length === 1 ? versions[0] : undefined,
  };
}
