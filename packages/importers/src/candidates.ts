import {
  type ElementType,
  type LifecyclePhase,
  attributeDef,
  lifecycleAt,
  todayIso,
} from '@atrium/schema';
import { normalizeValue } from './normalize';
import { norm } from './text';
import type {
  Candidate,
  CandidateRelation,
  ColumnTarget,
  NormalizeOptions,
  ParsedSheet,
  SheetMapping,
} from './types';
import { toText } from './values';

export interface CandidateOptions {
  /** Today's date (YYYY-MM-DD), used to work out a lifecycle phase from phase dates. */
  today?: string;
}

const TOTAL_ROWS = new Set(['total', 'totals', 'grand total', 'sum', 'subtotal', 'sub total', 'totaal', 'summe', 'gesamt']);

const DMY_RE = /^\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\s*$/;

/**
 * Decides per date column whether 03/04/2026 means 3 April or 4 March, by looking for a
 * value that is only valid one way (13/04/2026 or 04/13/2026).
 */
function inferDateOrder(sheet: ParsedSheet, header: string): NormalizeOptions['dateOrder'] {
  let dmy = false;
  let mdy = false;
  for (const row of sheet.rows) {
    const m = DMY_RE.exec(toText(row[header]));
    if (!m) continue;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  if (dmy && !mdy) return 'dmy';
  if (mdy && !dmy) return 'mdy';
  return undefined;
}

function isDateTarget(target: ColumnTarget, type: ElementType): boolean {
  if (target.kind === 'lifecycle_date') return true;
  return target.kind === 'attribute' && attributeDef(type, target.key)?.kind === 'date';
}

function newCandidate(row: number, type: ElementType, name: string): Candidate {
  return { row, type, name, attributes: {}, relations: [] };
}

function addRelation(c: Candidate, rel: Omit<CandidateRelation, 'names'>, names: string[]): void {
  const existing = c.relations.find(
    (r) => r.relation === rel.relation && r.direction === rel.direction && r.targetType === rel.targetType,
  );
  const target = existing ?? {
    relation: rel.relation,
    direction: rel.direction,
    targetType: rel.targetType,
    names: [],
  };
  for (const n of names) {
    if (!target.names.some((x) => norm(x) === norm(n))) target.names.push(n);
  }
  if (!existing) c.relations.push(target);
}

/** Fills empty fields of `into` from `from`; lists and relations are combined. */
function merge(into: Candidate, from: Candidate): void {
  const fields = [
    'key', 'externalId', 'description', 'owner', 'domainName', 'parentName', 'teamName',
    'lifecycle', 'classification',
  ] as const;
  for (const f of fields) {
    if (into[f] === undefined && from[f] !== undefined) (into as unknown as Record<string, unknown>)[f] = from[f];
  }
  if (from.lifecycleDates) into.lifecycleDates = { ...from.lifecycleDates, ...into.lifecycleDates };
  if (from.tags) into.tags = [...new Set([...(into.tags ?? []), ...from.tags])];
  for (const [k, v] of Object.entries(from.attributes)) if (into.attributes[k] === undefined) into.attributes[k] = v;
  for (const r of from.relations) addRelation(into, r, r.names);
}

/**
 * Reads the rows of a sheet into element candidates using a column mapping. Values are
 * normalised (dates, money, enums, ...); rows without a name are skipped with a warning;
 * "Level 1/2/3" columns create the parent elements; repeated names are merged.
 */
export function sheetToCandidates(
  sheet: ParsedSheet,
  mapping: SheetMapping,
  options: CandidateOptions = {},
): { candidates: Candidate[]; warnings: string[] } {
  const type = mapping.elementType;
  const today = options.today ?? todayIso();
  const warnings: string[] = [];
  const columns = Object.entries(mapping.columns).filter(
    ([header, t]) => t.kind !== 'ignore' && sheet.headers.includes(header),
  );
  const levelColumns = columns
    .filter((entry): entry is [string, Extract<ColumnTarget, { kind: 'level' }>] => entry[1].kind === 'level')
    .sort((a, b) => a[1].level - b[1].level);
  const dateOrders = new Map<string, NormalizeOptions['dateOrder']>();
  for (const [header, target] of columns) {
    if (isDateTarget(target, type)) dateOrders.set(header, inferDateOrder(sheet, header));
  }

  const byName = new Map<string, Candidate>();
  /** Names that came from their own row (not only as a level parent), with that row. */
  const explicitRow = new Map<string, number>();
  const ordered: Candidate[] = [];

  const ensure = (name: string, row: number): Candidate => {
    const key = norm(name);
    let c = byName.get(key);
    if (!c) {
      c = newCandidate(row, type, name);
      byName.set(key, c);
      ordered.push(c);
    }
    return c;
  };

  sheet.rows.forEach((row, i) => {
    const rowNo = sheet.rowNumbers?.[i] ?? (sheet.headerRow ?? 1) + i + 1;
    const c = newCandidate(rowNo, type, '');
    const levels = new Map<number, string>();

    for (const [header, target] of columns) {
      const result = normalizeValue(target, row[header], type, { dateOrder: dateOrders.get(header) });
      if (result.warning) warnings.push(`Row ${rowNo}, ${header}: ${result.warning}`);
      const value = result.value;
      if (value === undefined) continue;
      switch (target.kind) {
        case 'core':
          switch (target.field) {
            case 'name': c.name = String(value); break;
            case 'key': c.key = String(value); break;
            case 'external_id': c.externalId = String(value); break;
            case 'description': c.description = String(value); break;
            case 'owner': c.owner = String(value); break;
            case 'domain': c.domainName = String(value); break;
            case 'parent': c.parentName = String(value); break;
            case 'team': c.teamName = String(value); break;
            case 'lifecycle': c.lifecycle = value as LifecyclePhase; break;
            case 'classification': c.classification = value as Candidate['classification']; break;
            case 'tags': c.tags = [...new Set([...(c.tags ?? []), ...(value as string[])])]; break;
          }
          break;
        case 'attribute':
          c.attributes[target.key] = value;
          break;
        case 'relation':
          addRelation(c, target, value as string[]);
          break;
        case 'lifecycle_date':
          c.lifecycleDates = { ...c.lifecycleDates, [target.phase]: String(value) };
          break;
        case 'level':
          levels.set(target.level, String(value));
          break;
      }
    }

    // Hierarchy from level columns: the deepest filled level is the row's element.
    const chain = levelColumns.map(([, t]) => levels.get(t.level)).filter((v): v is string => !!v);
    if (!c.name && chain.length) c.name = chain.pop()!;
    else if (c.name && chain.length && norm(chain[chain.length - 1]!) === norm(c.name)) chain.pop();

    if (!c.name && type === 'interface') c.name = interfaceName(c) ?? '';
    if (!c.name) {
      warnings.push(`Row ${rowNo} skipped: it has no name`);
      return;
    }
    if (TOTAL_ROWS.has(norm(c.name))) {
      warnings.push(`Row ${rowNo} skipped: it looks like a totals row`);
      return;
    }

    chain.forEach((parentName, j) => {
      const parent = ensure(parentName, rowNo);
      if (j > 0 && !parent.parentName) parent.parentName = chain[j - 1];
    });
    if (!c.parentName && chain.length) c.parentName = chain[chain.length - 1];

    // Relations to itself (an application "depending on" itself) are noise.
    for (const r of c.relations) {
      if (r.targetType === type) r.names = r.names.filter((n) => norm(n) !== norm(c.name));
    }
    c.relations = c.relations.filter((r) => r.names.length > 0);

    const key = norm(c.name);
    const firstRow = explicitRow.get(key);
    if (firstRow !== undefined) {
      warnings.push(`Row ${rowNo}: "${c.name}" also appears on row ${firstRow}; the rows were merged`);
    } else {
      explicitRow.set(key, rowNo);
    }
    const existing = byName.get(key);
    if (existing) {
      if (firstRow === undefined) existing.row = rowNo;
      merge(existing, c);
    } else {
      byName.set(key, c);
      ordered.push(c);
    }
  });

  for (const c of ordered) finish(c, today);
  return { candidates: ordered, warnings };
}

/** For interface lists without a name column: "CRM → ERP". */
function interfaceName(c: Candidate): string | undefined {
  const source = c.relations.find((r) => r.relation === 'exposes' && r.direction === 'in')?.names[0];
  const target = c.relations.find((r) => r.relation === 'consumes' && r.direction === 'in')?.names[0];
  return source && target ? `${source} → ${target}` : undefined;
}

function finish(c: Candidate, today: string): void {
  if (!c.lifecycle && c.lifecycleDates && Object.keys(c.lifecycleDates).length) {
    const phase = lifecycleAt(null, c.lifecycleDates, today);
    if (phase === 'not_yet') c.lifecycle = 'plan';
    else if (phase) c.lifecycle = phase;
  }
  if (c.parentName && norm(c.parentName) === norm(c.name)) delete c.parentName;
  for (const key of Object.keys(c) as Array<keyof Candidate>) {
    if (c[key] === undefined) delete c[key];
  }
}
