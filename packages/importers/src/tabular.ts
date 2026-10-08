import { cleanHeader, columnLetter, norm } from './text';
import type { ParsedSheet } from './types';
import { headerVocabulary } from './vocabulary';

/** A cell after reading: text, number, boolean or empty. Dates are already 'YYYY-MM-DD' text. */
export type CellScalar = string | number | boolean | null;

/** Horizontal merges in a grid: "row,col" (0-based) → column of the merge's first cell. */
export type HorizontalMerges = Map<string, number>;

/** How many header-row candidates to look at before giving up (title rows, notes, blank rows). */
const HEADER_SCAN_ROWS = 10;

function isEmpty(v: CellScalar | undefined): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function nonEmptyCount(row: readonly CellScalar[]): number {
  let n = 0;
  for (const v of row) if (!isEmpty(v)) n++;
  return n;
}

/** Distinct text cells that do not look like numbers. */
function textCount(row: readonly CellScalar[]): number {
  const seen = new Set<string>();
  for (const v of row) {
    if (typeof v === 'string' && v.trim() && !/^[-+]?[\d.,\s%]+$/.test(v)) seen.add(v.trim().toLowerCase());
  }
  return seen.size;
}

function headerText(v: CellScalar | undefined): string {
  if (isEmpty(v)) return '';
  return cleanHeader(String(v));
}

/** Finds the header row: the first row of at least two text cells that is about as wide as the table. */
function findHeaderRow(grid: readonly CellScalar[][]): number {
  const firstRows: number[] = [];
  for (let r = 0; r < grid.length && firstRows.length < HEADER_SCAN_ROWS; r++) {
    if (nonEmptyCount(grid[r]!) > 0) firstRows.push(r);
  }
  if (firstRows.length === 0) return -1;
  const widest = Math.max(...firstRows.map((r) => nonEmptyCount(grid[r]!)));
  const minWidth = Math.max(2, Math.ceil(widest * 0.5));
  const header = firstRows.find((r) => textCount(grid[r]!) >= 2 && nonEmptyCount(grid[r]!) >= minWidth);
  return header ?? firstRows[0]!;
}

/**
 * A group header row ("Ownership" merged over "Business owner" and "IT owner") followed by
 * the real headers. Only recognised with merge information (Excel), and only when the second
 * row is all text and contains at least one word the importer knows.
 */
function isTwoLevelHeader(
  grid: readonly CellScalar[][],
  h: number,
  merges: HorizontalMerges | undefined,
): boolean {
  if (!merges || h + 1 >= grid.length) return false;
  const width = grid[h]!.length;
  const groupCols: number[] = [];
  for (let c = 0; c < width; c++) if (merges.has(`${h},${c}`)) groupCols.push(c);
  if (groupCols.length < 2) return false;
  const next = grid[h + 1]!;
  if (groupCols.filter((c) => !isEmpty(next[c])).length < 2) return false;
  if (next.some((v) => !isEmpty(v) && typeof v !== 'string')) return false;
  if (textCount(next) < 2) return false;
  const vocab = headerVocabulary();
  return next.some((v) => typeof v === 'string' && vocab.has(norm(v)));
}

/**
 * Turns a grid of cells into a sheet: finds the header row (skipping titles and notes),
 * names blank header columns that hold data ("Column C"), de-duplicates headers, and
 * drops empty rows and repeated header rows.
 *
 * @param rowOffset added to grid indexes to get 1-based source row numbers.
 */
export function gridToSheet(
  name: string,
  grid: CellScalar[][],
  merges?: HorizontalMerges,
  rowOffset = 1,
): ParsedSheet | undefined {
  const width = grid.reduce((w, row) => Math.max(w, row.length), 0);
  if (width === 0) return undefined;
  const h = findHeaderRow(grid);
  if (h < 0) return undefined;

  const twoLevel = isTwoLevelHeader(grid, h, merges);
  const lastHeaderRow = twoLevel ? h + 1 : h;
  const dataStart = lastHeaderRow + 1;

  const groupText = (c: number): string => {
    const master = merges?.get(`${h},${c}`);
    return headerText(grid[h]![master ?? c]);
  };
  const rawHeaders: string[] = [];
  for (let c = 0; c < width; c++) {
    if (!twoLevel) {
      rawHeaders.push(headerText(grid[h]![c]));
      continue;
    }
    const sub = headerText(grid[h + 1]![c]);
    rawHeaders.push(sub || groupText(c));
  }
  if (twoLevel) {
    // A sub header used under several groups ("Name" under two owners) gets its group as prefix.
    const counts = new Map<string, number>();
    for (const t of rawHeaders) if (t) counts.set(t.toLowerCase(), (counts.get(t.toLowerCase()) ?? 0) + 1);
    for (let c = 0; c < width; c++) {
      const t = rawHeaders[c]!;
      const group = groupText(c);
      if (t && (counts.get(t.toLowerCase()) ?? 0) > 1 && group && group !== t) rawHeaders[c] = `${group} ${t}`;
    }
  }

  const headers: string[] = [];
  const columns: number[] = [];
  const used = new Set<string>();
  for (let c = 0; c < width; c++) {
    let text = rawHeaders[c] ?? '';
    if (!text) {
      const hasData = grid.slice(dataStart).some((row) => !isEmpty(row[c]));
      if (!hasData) continue;
      text = `Column ${columnLetter(c)}`;
    }
    let unique = text;
    for (let i = 2; used.has(unique.toLowerCase()); i++) unique = `${text} (${i})`;
    used.add(unique.toLowerCase());
    headers.push(unique);
    columns.push(c);
  }

  const rows: Array<Record<string, unknown>> = [];
  const rowNumbers: number[] = [];
  const headerKeys = headers.map((x) => x.toLowerCase());
  const repeatThreshold = Math.max(2, Math.ceil(columns.length * 0.6));
  for (let r = dataStart; r < grid.length; r++) {
    const row = grid[r]!;
    if (columns.every((c) => isEmpty(row[c]))) continue;
    const repeats = columns.filter(
      (c, i) => typeof row[c] === 'string' && headerText(row[c]).toLowerCase() === headerKeys[i],
    ).length;
    if (repeats >= repeatThreshold) continue;
    const record: Record<string, unknown> = {};
    columns.forEach((c, i) => {
      const v = row[c];
      record[headers[i]!] = isEmpty(v) ? null : v;
    });
    rows.push(record);
    rowNumbers.push(r + rowOffset);
  }

  return { name, headers, rows, rowNumbers, headerRow: lastHeaderRow + rowOffset };
}
