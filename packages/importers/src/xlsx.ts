import ExcelJS from 'exceljs';
import { type CellScalar, type HorizontalMerges, gridToSheet } from './tabular';
import { cleanText } from './text';
import type { ParsedSheet } from './types';
import { isoFromDate } from './values';

function richTextToString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'richText' in v && Array.isArray(v.richText)) {
    return v.richText.map((part: { text?: unknown }) => (typeof part.text === 'string' ? part.text : '')).join('');
  }
  return '';
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Reads one cell's value: rich text and links become text, formulas their result, dates ISO text. */
function scalarOf(value: ExcelJS.CellValue, numFmt: string | undefined): CellScalar {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return cleanText(value) || null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // Keep the meaning of percent-formatted cells: 0.45 shown as 45% stays "45%".
    if (numFmt?.includes('%')) return `${round(value * 100, 4)}%`;
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return isoFromDate(value) ?? null;
  if (typeof value === 'object') {
    if ('richText' in value) return cleanText(richTextToString(value)) || null;
    if ('hyperlink' in value) {
      const text = cleanText(richTextToString((value as { text?: unknown }).text));
      const link = String(value.hyperlink ?? '').replace(/^mailto:/i, '');
      return text || link || null;
    }
    if ('formula' in value || 'sharedFormula' in value) {
      const result = (value as { result?: unknown }).result;
      if (result === undefined || result === null) return null;
      if (typeof result === 'object' && !(result instanceof Date) && 'error' in result) return null;
      return scalarOf(result as ExcelJS.CellValue, numFmt);
    }
    if ('error' in value) return null;
  }
  return null;
}

function worksheetGrid(ws: ExcelJS.Worksheet): { grid: CellScalar[][]; merges: HorizontalMerges } {
  let width = 0;
  ws.eachRow({ includeEmpty: false }, (row) => {
    width = Math.max(width, row.cellCount);
  });
  const merges: HorizontalMerges = new Map();
  const grid: CellScalar[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.findRow(r);
    const out: CellScalar[] = new Array<CellScalar>(width).fill(null);
    if (row) {
      for (let c = 1; c <= width; c++) {
        const cell = row.getCell(c);
        const master = cell.master;
        if (master && master.address !== cell.address) {
          if (master.row === r) {
            // Horizontal merge: the value belongs to the first cell only.
            merges.set(`${r - 1},${c - 1}`, master.col - 1);
            merges.set(`${r - 1},${master.col - 1}`, master.col - 1);
          } else if (master.col === c) {
            // Vertical merge: repeat the value down (e.g. one "Domain" cell for several rows).
            out[c - 1] = scalarOf(master.value, master.numFmt);
          }
          continue;
        }
        out[c - 1] = scalarOf(cell.value, cell.numFmt);
      }
    }
    grid.push(out);
  }
  return { grid, merges };
}

function toLoadable(data: Uint8Array): Buffer {
  const B = (globalThis as { Buffer?: typeof Buffer }).Buffer;
  // exceljs is typed for Node Buffers; JSZip underneath also accepts a Uint8Array in browsers.
  return B ? B.from(data.buffer, data.byteOffset, data.byteLength) : (data as unknown as Buffer);
}

/** Reads every visible worksheet of an .xlsx file. */
export async function readXlsx(data: Uint8Array): Promise<{ sheets: ParsedSheet[]; warnings: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(toLoadable(data));
  const sheets: ParsedSheet[] = [];
  const warnings: string[] = [];
  for (const ws of workbook.worksheets) {
    if (ws.state && ws.state !== 'visible') {
      warnings.push(`Skipped the hidden sheet "${ws.name}"`);
      continue;
    }
    const { grid, merges } = worksheetGrid(ws);
    const sheet = gridToSheet(ws.name, grid, merges);
    if (!sheet || sheet.rows.length === 0) {
      if (grid.some((row) => row.some((v) => v !== null))) {
        warnings.push(`The sheet "${ws.name}" has no data rows under its headers`);
      }
      continue;
    }
    sheets.push(sheet);
  }
  return { sheets, warnings };
}
