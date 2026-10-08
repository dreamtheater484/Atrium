import Papa from 'papaparse';
import { type CellScalar, gridToSheet } from './tabular';
import { cleanText } from './text';
import type { ParsedSheet } from './types';

const DELIMITERS = [',', ';', '\t', '|'];

/**
 * Picks the delimiter that splits the first lines into the most consistent number of
 * columns (quote-aware). More robust than PapaParse's own guess for short files.
 */
function guessDelimiter(body: string): string {
  const sample = body
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(0, 30)
    .join('\n');
  let best = { delimiter: ',', score: 0 };
  for (const delimiter of DELIMITERS) {
    const rows = Papa.parse<string[]>(sample, { delimiter, skipEmptyLines: 'greedy' }).data;
    if (!rows.length) continue;
    const freq = new Map<number, number>();
    for (const row of rows) freq.set(row.length, (freq.get(row.length) ?? 0) + 1);
    let mode = 1;
    let modeCount = 0;
    for (const [width, n] of freq) {
      if (n > modeCount || (n === modeCount && width > mode)) {
        mode = width;
        modeCount = n;
      }
    }
    if (mode < 2) continue;
    // Consistency first, then the number of columns.
    const score = (modeCount / rows.length) * 1000 + mode;
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

/**
 * Reads CSV (or TSV, or semicolon-separated) text. The delimiter is detected automatically,
 * including Excel's "sep=;" first line; title rows above the headers are skipped.
 */
export function readCsv(text: string, name: string): { sheet?: ParsedSheet; warnings: string[] } {
  const warnings: string[] = [];
  let body = text.replace(/^\uFEFF/, '');
  let delimiter = '';
  let rowOffset = 1;
  const sep = /^sep=(.)\r?\n/i.exec(body);
  if (sep) {
    delimiter = sep[1]!;
    body = body.slice(sep[0].length);
    rowOffset = 2;
  }
  const result = Papa.parse<string[]>(body, {
    delimiter: delimiter || guessDelimiter(body),
    skipEmptyLines: false,
    header: false,
  });
  const problems = result.errors;
  for (const e of problems.slice(0, 3)) {
    warnings.push(`Line ${(e.row ?? 0) + rowOffset}: ${e.message}`);
  }
  if (problems.length > 3)
    warnings.push(`${problems.length - 3} more problems reading the CSV file`);

  const grid: CellScalar[][] = result.data.map((row) =>
    row.map((cell) => {
      const t = cleanText(String(cell ?? ''));
      return t === '' ? null : t;
    }),
  );
  const sheet = gridToSheet(name, grid, undefined, rowOffset);
  if (!sheet?.rows.length) {
    warnings.push('The file has no data rows');
    return { warnings };
  }
  return { sheet, warnings };
}
