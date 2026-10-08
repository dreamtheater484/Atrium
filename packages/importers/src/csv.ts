import Papa from 'papaparse';
import { type CellScalar, gridToSheet } from './tabular';
import { cleanText } from './text';
import type { ParsedSheet } from './types';

const DELIMITERS = [',', ';', '\t', '|'];

/**
 * Reads CSV (or TSV, or semicolon-separated) text. The delimiter is detected automatically,
 * including Excel's "sep=;" first line; title rows above the headers are skipped.
 */
export function readCsv(text: string, name: string): { sheet?: ParsedSheet; warnings: string[] } {
  const warnings: string[] = [];
  let body = text.replace(/^﻿/, '');
  let delimiter = '';
  let rowOffset = 1;
  const sep = /^sep=(.)\r?\n/i.exec(body);
  if (sep) {
    delimiter = sep[1]!;
    body = body.slice(sep[0].length);
    rowOffset = 2;
  }
  const result = Papa.parse<string[]>(body, {
    delimiter,
    delimitersToGuess: DELIMITERS,
    skipEmptyLines: false,
    header: false,
  });
  const problems = result.errors.filter((e) => e.code !== 'UndetectableDelimiter');
  for (const e of problems.slice(0, 3)) {
    warnings.push(`Line ${(e.row ?? 0) + rowOffset}: ${e.message}`);
  }
  if (problems.length > 3) warnings.push(`${problems.length - 3} more problems reading the CSV file`);

  const grid: CellScalar[][] = result.data.map((row) =>
    row.map((cell) => {
      const t = cleanText(String(cell ?? ''));
      return t === '' ? null : t;
    }),
  );
  const sheet = gridToSheet(name, grid, undefined, rowOffset);
  if (!sheet || sheet.rows.length === 0) warnings.push('The file has no data rows');
  return { sheet: sheet && sheet.rows.length ? sheet : undefined, warnings };
}
