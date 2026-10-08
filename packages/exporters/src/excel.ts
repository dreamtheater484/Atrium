import {
  type AttributeDef,
  CLASSIFICATIONS,
  ELEMENT_TYPE_DEFS,
  ELEMENT_TYPES,
  type Element,
  type ElementType,
  enumLabel,
  LIFECYCLE_PHASES,
  RELATION_TYPE_DEFS,
  RELATION_TYPES,
  type RelationType,
} from '@atrium/schema';
import ExcelJS from 'exceljs';
import { PALETTE, tint } from './color';
import {
  attributeText,
  formatDisplayDate,
  humanizeKey,
  indexById,
  isEmpty,
  parseIsoDate,
  readingOrder,
  relationHeader,
  toNumber,
  typeLabel,
} from './model';
import type { ExportModel } from './types';

export interface ExcelExportOptions {
  /** Only export these element types (default: every type that has elements). */
  types?: ElementType[];
}

/* ------------------------------------------------------------------ */
/* Look and feel                                                         */
/* ------------------------------------------------------------------ */

const FONT = 'Calibri';
const argb = (hex: string) => `FF${hex}`;

const FMT = {
  currency: '"€"#,##0',
  number: '#,##0',
  percent: '0"%"',
  fraction: '0%',
  date: 'd mmm yyyy',
  whole: '0',
} as const;

type ColumnGroup = 'core' | 'attribute' | 'relation' | 'derived';

const HEADER_FILL: Record<ColumnGroup, string> = {
  core: 'ECEEFB',
  attribute: 'ECEEFB',
  relation: 'E6F2F6',
  derived: 'F1F2F5',
};

const LAYER_TAB: Record<string, string> = {
  strategy: 'D97706',
  business: 'CA8A04',
  application: PALETTE.accent,
  data: '0891B2',
  technology: PALETTE.good,
  governance: '7C3AED',
  organization: '64748B',
};

const HEALTH_COLOR: Record<string, string> = {
  good: PALETTE.good,
  watch: PALETTE.watch,
  act: PALETTE.act,
};

const MAX_CELL = 32767;
/** Data validations reach this far below the data so new rows get dropdowns too. */
const VALIDATION_HEADROOM = 500;

interface ColumnSpec {
  header: string;
  group: ColumnGroup;
  value: (el: Element) => ExcelJS.CellValue;
  numFmt?: string;
  wrap?: boolean;
  /** Fixed width in characters; otherwise computed from the content. */
  width?: number;
  maxWidth?: number;
  /** Dropdown values offered in Excel. */
  list?: string[];
  rating?: boolean;
  note?: string;
  role?: 'id' | 'name' | 'health' | 'quality';
}

/* ------------------------------------------------------------------ */
/* Column definitions                                                   */
/* ------------------------------------------------------------------ */

function attributeCell(def: AttributeDef | undefined, raw: unknown): ExcelJS.CellValue {
  if (isEmpty(raw)) return null;
  switch (def?.kind) {
    case 'currency':
    case 'number':
    case 'percent':
    case 'rating':
      return toNumber(raw) ?? attributeText(def, raw);
    case 'date':
      return parseIsoDate(raw) ?? attributeText(def, raw);
    default: {
      if (!def && typeof raw === 'number') return raw;
      return attributeText(def, raw) || null;
    }
  }
}

function attributeFormat(def: AttributeDef): string | undefined {
  switch (def.kind) {
    case 'currency':
      return FMT.currency;
    case 'number':
      return FMT.number;
    case 'percent':
      return FMT.percent;
    case 'rating':
      return FMT.whole;
    case 'date':
      return FMT.date;
    default:
      return undefined;
  }
}

function targetHint(type: RelationType): string | undefined {
  const to = RELATION_TYPE_DEFS[type].to;
  if (to.length > 3) return 'Names of related elements, separated by commas.';
  const names = to.map((t) => ELEMENT_TYPE_DEFS[t].plural.toLowerCase());
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : names[0];
  return `Names of ${list}, separated by commas.`;
}

function buildColumns(
  type: ElementType,
  elements: Element[],
  byId: Map<string, Element>,
  outgoing: Map<string, Map<RelationType, string[]>>,
): ColumnSpec[] {
  const def = ELEMENT_TYPE_DEFS[type];
  const nameOf = (id: string | null) => (id ? (byId.get(id)?.name ?? null) : null);
  const any = (pred: (el: Element) => boolean) => elements.some(pred);

  const cols: ColumnSpec[] = [
    {
      header: 'ID',
      group: 'core',
      value: (el) => el.id,
      width: 12,
      role: 'id',
      note: 'Atrium identifier. Keep it to update this element on re-import; leave it empty for new rows.',
    },
    { header: 'Key', group: 'core', value: (el) => el.key, maxWidth: 24 },
    { header: 'Name', group: 'core', value: (el) => el.name, maxWidth: 42, role: 'name' },
    {
      header: 'Description',
      group: 'core',
      value: (el) => el.description || null,
      width: 60,
      wrap: true,
    },
  ];

  if (type !== 'domain' || any((el) => !!el.domainId)) {
    cols.push({
      header: 'Domain',
      group: 'core',
      value: (el) => nameOf(el.domainId),
      maxWidth: 30,
    });
  }
  if (def.hierarchical || any((el) => !!el.parentId)) {
    cols.push({
      header: 'Parent',
      group: 'core',
      value: (el) => nameOf(el.parentId),
      maxWidth: 34,
    });
  }
  cols.push({ header: 'Owner', group: 'core', value: (el) => el.owner, maxWidth: 30 });

  if (def.hasLifecycle || any((el) => !!el.lifecycle)) {
    cols.push({
      header: 'Lifecycle',
      group: 'core',
      value: (el) => (el.lifecycle ? enumLabel(el.lifecycle) : null),
      list: LIFECYCLE_PHASES.map(enumLabel),
    });
  }
  for (const phase of LIFECYCLE_PHASES) {
    if (!any((el) => !!el.lifecycleDates?.[phase])) continue;
    cols.push({
      header: `${enumLabel(phase)} date`,
      group: 'core',
      value: (el) => parseIsoDate(el.lifecycleDates?.[phase]) ?? el.lifecycleDates?.[phase] ?? null,
      numFmt: FMT.date,
    });
  }
  cols.push({
    header: 'Classification',
    group: 'core',
    value: (el) => enumLabel(el.classification) || null,
    list: CLASSIFICATIONS.map(enumLabel),
  });
  cols.push({
    header: 'Tags',
    group: 'core',
    value: (el) => (el.tags.length ? el.tags.join(', ') : null),
    maxWidth: 30,
  });

  const used = new Set(cols.map((c) => c.header.toLowerCase()));
  for (const attr of def.attributes) {
    used.add(attr.label.toLowerCase());
    cols.push({
      header: attr.label,
      group: 'attribute',
      value: (el) => attributeCell(attr, el.attributes?.[attr.key]),
      numFmt: attributeFormat(attr),
      wrap: attr.kind === 'longtext',
      width: attr.kind === 'longtext' ? 50 : undefined,
      list: attr.kind === 'enum' && attr.options ? attr.options.map(enumLabel) : undefined,
      rating: attr.kind === 'rating',
      note: attr.derived ? `${attr.help ?? ''} Filled in by Atrium.`.trim() : attr.help,
    });
  }

  // Attributes outside the metamodel (for example from packs) still round-trip.
  const known = new Set(def.attributes.map((a) => a.key));
  const extra = new Set<string>();
  for (const el of elements) {
    for (const [k, v] of Object.entries(el.attributes ?? {})) {
      if (!known.has(k) && !k.startsWith('_') && !isEmpty(v)) extra.add(k);
    }
  }
  for (const key of [...extra].sort()) {
    const header = humanizeKey(key);
    if (used.has(header.toLowerCase())) continue;
    used.add(header.toLowerCase());
    cols.push({
      header,
      group: 'attribute',
      value: (el) => attributeCell(undefined, el.attributes?.[key]),
    });
  }

  const expected = new Set(
    (def.expectedRelations ?? []).filter((r) => r.direction === 'out').map((r) => r.relation),
  );
  for (const rel of RELATION_TYPES) {
    if (!RELATION_TYPE_DEFS[rel].from.includes(type)) continue;
    const present = any((el) => (outgoing.get(el.id)?.get(rel)?.length ?? 0) > 0);
    if (!present && !expected.has(rel)) continue;
    const header = relationHeader(rel);
    if (used.has(header.toLowerCase())) continue;
    used.add(header.toLowerCase());
    cols.push({
      header,
      group: 'relation',
      value: (el) => {
        const names = outgoing.get(el.id)?.get(rel);
        return names?.length ? names.join(', ') : null;
      },
      maxWidth: 40,
      note: targetHint(rel),
    });
  }

  cols.push({
    header: 'Quality %',
    group: 'derived',
    value: (el) => (Number.isFinite(el.quality) ? el.quality : null),
    numFmt: FMT.percent,
    role: 'quality',
    note: 'Share of expected information that is filled in. Calculated by Atrium; ignored on import.',
  });
  cols.push({
    header: 'Health',
    group: 'derived',
    value: (el) => (el.health ? enumLabel(el.health) : null),
    role: 'health',
    note: 'Derived from fit ratings, technology end-of-life and lifecycle. Ignored on import.',
  });
  return cols;
}

/* ------------------------------------------------------------------ */
/* Sheet rendering                                                      */
/* ------------------------------------------------------------------ */

function displayLength(value: ExcelJS.CellValue, numFmt?: string): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Date) return 11;
  if (typeof value === 'number') {
    const digits = Math.round(Math.abs(value)).toLocaleString('en-US').length;
    return digits + (numFmt?.includes('€') || numFmt?.includes('%') ? 2 : 0);
  }
  const text = String(value);
  return Math.max(...text.split('\n').map((l) => l.length));
}

function columnWidth(col: ColumnSpec, values: ExcelJS.CellValue[]): number {
  if (col.width) return col.width;
  const words = col.header.split(/\s+/);
  const headerNeed = Math.max(
    Math.max(...words.map((w) => w.length)),
    Math.ceil(col.header.length * 0.6),
  );
  let longest = 0;
  for (const v of values) longest = Math.max(longest, displayLength(v, col.numFmt));
  const raw = Math.max(headerNeed + 4, longest + 2);
  return Math.min(Math.max(raw, 9), col.maxWidth ?? 36);
}

function colLetter(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

type ValidationTarget = {
  dataValidations: { add(address: string, validation: ExcelJS.DataValidation): void };
};

function addValidation(ws: ExcelJS.Worksheet, address: string, dv: ExcelJS.DataValidation) {
  (ws as unknown as ValidationTarget).dataValidations.add(address, dv);
}

const thinLine = (hex: string): Partial<ExcelJS.Border> => ({
  style: 'thin',
  color: { argb: argb(hex) },
});

function styleHeader(row: ExcelJS.Row, groups: ColumnGroup[]) {
  row.height = 32;
  groups.forEach((group, i) => {
    const cell = row.getCell(i + 1);
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: argb(PALETTE.text) } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(HEADER_FILL[group]) } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = {
      bottom: {
        style: 'medium',
        color: { argb: argb(group === 'relation' ? '0891B2' : PALETTE.accent) },
      },
      right: thinLine('FFFFFF'),
    };
  });
}

/** Lays out a data sheet: values, widths, formats, frozen header, filter and dropdowns. */
function writeTable(
  ws: ExcelJS.Worksheet,
  cols: ColumnSpec[],
  rows: Array<{ values: ExcelJS.CellValue[]; depth?: number }>,
  freezeColumns: number,
) {
  ws.columns = cols.map((c, i) => ({
    header: c.header,
    key: `c${i}`,
    width: columnWidth(
      c,
      rows.map((r) => r.values[i] ?? null),
    ),
  }));

  // Column-level formats first: cells created later inherit them, and so do values that
  // people type into new rows in Excel.
  cols.forEach((c, i) => {
    const column = ws.getColumn(i + 1);
    if (c.numFmt) column.numFmt = c.numFmt;
    if (c.wrap) column.alignment = { vertical: 'top', wrapText: true };
  });

  for (const r of rows) {
    const row = ws.addRow(
      r.values.map((v) =>
        typeof v === 'string' && v.length > MAX_CELL ? v.slice(0, MAX_CELL) : v,
      ),
    );
    for (let colNumber = 1; colNumber <= cols.length; colNumber++) {
      const col = cols[colNumber - 1]!;
      const cell = row.getCell(colNumber);
      cell.font = { name: FONT, size: 11, color: { argb: argb(PALETTE.text) } };
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: !!col.wrap };
      cell.border = { bottom: thinLine('E3E6EC'), right: thinLine('F0F1F4') };
      if (typeof cell.value === 'number' || cell.value instanceof Date) {
        cell.alignment = { vertical: 'top', horizontal: 'right' };
      }
      if (col.numFmt === FMT.percent && typeof cell.value === 'number' && col.role !== 'quality') {
        const v = cell.value;
        if (v > 0 && v < 1 && !Number.isInteger(v)) cell.numFmt = FMT.fraction;
      }
      switch (col.role) {
        case 'id': {
          cell.font = { name: FONT, size: 9, color: { argb: argb(PALETTE.faint) } };
          const long = typeof cell.value === 'string' && cell.value.length > 14;
          // "fill" clips long ids at the column edge instead of spilling into the next cell.
          cell.alignment = { vertical: 'top', horizontal: long ? 'fill' : 'left' };
          break;
        }
        case 'name':
          cell.font = { name: FONT, size: 11, bold: true, color: { argb: argb(PALETTE.text) } };
          cell.alignment = {
            vertical: 'top',
            horizontal: 'left',
            indent: Math.min(r.depth ?? 0, 6),
          };
          break;
        case 'health': {
          const key = typeof cell.value === 'string' ? cell.value.toLowerCase() : '';
          const color = HEALTH_COLOR[key];
          if (color) {
            cell.font = { name: FONT, size: 11, bold: true, color: { argb: argb(color) } };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: argb(tint(color, 0.85)) },
            };
          }
          break;
        }
        case 'quality': {
          if (typeof cell.value === 'number') {
            const color =
              cell.value >= 80 ? PALETTE.good : cell.value >= 50 ? PALETTE.watch : PALETTE.act;
            cell.font = { name: FONT, size: 11, color: { argb: argb(color) } };
          }
          break;
        }
        default:
          if (col.group === 'derived') {
            cell.font = { name: FONT, size: 11, color: { argb: argb(PALETTE.muted) } };
          }
      }
    }
  }

  const header = ws.getRow(1);
  styleHeader(
    header,
    cols.map((c) => c.group),
  );
  cols.forEach((c, i) => {
    if (c.note) header.getCell(i + 1).note = c.note;
  });

  const lastCol = colLetter(cols.length);
  const lastRow = Math.max(rows.length + 1, 2);
  ws.autoFilter = `A1:${lastCol}${lastRow}`;
  ws.views = [
    {
      state: 'frozen',
      xSplit: freezeColumns,
      ySplit: 1,
      topLeftCell: `${colLetter(freezeColumns + 1)}2`,
      activeCell: `${colLetter(freezeColumns + 1)}2`,
      showGridLines: false,
    },
  ];

  const validationEnd = rows.length + 1 + VALIDATION_HEADROOM;
  cols.forEach((c, i) => {
    const range = `${colLetter(i + 1)}2:${colLetter(i + 1)}${validationEnd}`;
    const list = c.list ? `"${c.list.join(',')}"` : '';
    if (c.list && list.length <= 255) {
      addValidation(ws, range, {
        type: 'list',
        allowBlank: true,
        formulae: [list],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: c.header,
        error: `Atrium expects one of: ${c.list.join(', ')}.`,
      });
    } else if (c.rating) {
      addValidation(ws, range, {
        type: 'whole',
        operator: 'between',
        allowBlank: true,
        formulae: [1, 5],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: c.header,
        error: 'Use a rating from 1 to 5.',
      });
    }
  });
}

/* ------------------------------------------------------------------ */
/* README                                                               */
/* ------------------------------------------------------------------ */

function writeReadme(
  ws: ExcelJS.Worksheet,
  model: ExportModel,
  sheets: Array<{ name: string; count: number; what: string }>,
) {
  ws.views = [{ showGridLines: false }];
  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 26;
  ws.getColumn(3).width = 96;
  const base: Partial<ExcelJS.Font> = { name: FONT, size: 11, color: { argb: argb(PALETTE.text) } };
  let r = 2;
  const put = (
    label: string,
    text: string,
    font: Partial<ExcelJS.Font> = base,
    labelFont: Partial<ExcelJS.Font> = { ...base, bold: true },
  ) => {
    const row = ws.getRow(r++);
    row.getCell(2).value = label || null;
    row.getCell(3).value = text || null;
    row.getCell(2).font = labelFont;
    row.getCell(3).font = font;
    row.getCell(2).alignment = { vertical: 'top' };
    row.getCell(3).alignment = { vertical: 'top', wrapText: true };
    return row;
  };
  const heading = (text: string) => {
    r++;
    const row = ws.getRow(r++);
    row.getCell(2).value = text;
    row.getCell(2).font = {
      name: FONT,
      size: 13,
      bold: true,
      color: { argb: argb(PALETTE.accent) },
    };
    row.height = 22;
  };

  const title = ws.getRow(r++);
  title.getCell(2).value = 'Atrium export';
  title.getCell(2).font = { name: FONT, size: 22, bold: true, color: { argb: argb(PALETTE.text) } };
  title.height = 34;
  put(
    'Workspace',
    model.workspaceName,
    { ...base, bold: true },
    { ...base, color: { argb: argb(PALETTE.muted) } },
  );
  put(
    'Generated',
    formatDisplayDate(model.generatedAt) +
      (model.generatedAt.length > 10 ? ` (${model.generatedAt})` : ''),
    base,
    { ...base, color: { argb: argb(PALETTE.muted) } },
  );

  heading('What is in this workbook');
  const head = put('Sheet', 'Contents', { ...base, bold: true });
  for (const c of [2, 3]) {
    head.getCell(c).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: argb(HEADER_FILL.core) },
    };
    head.getCell(c).border = { bottom: { style: 'medium', color: { argb: argb(PALETTE.accent) } } };
  }
  for (const s of sheets) {
    const row = put(s.name, s.what);
    for (const c of [2, 3]) row.getCell(c).border = { bottom: thinLine('E3E6EC') };
  }

  heading('Bring your changes back into Atrium');
  const steps = [
    'Edit values directly in the sheets. Add new rows at the bottom of a sheet and leave their ID empty.',
    'Keep the ID column: it tells Atrium which existing element a row updates. Rows without an ID are created as new elements.',
    'Keep the header names and sheet names as they are; Atrium uses them to recognise element types and fields.',
    'In Atrium, open Import, choose this file and review the proposed changes before applying them.',
  ];
  for (const [i, s] of steps.entries()) put(`Step ${i + 1}`, s);

  heading('Column guide');
  const guide: Array<[string, string]> = [
    ['ID', 'Atrium identifier, used to match rows on re-import. Do not change it.'],
    ['Key', 'Optional short code, such as an application number from your CMDB.'],
    ['Domain, Parent', 'Names of the domain and parent element. They must match existing names.'],
    [
      'Lifecycle',
      'Plan, Build, Active, Phase out or Retired. Date columns hold the date each phase starts.',
    ],
    ['Tags and lists', 'Several values in one cell are separated by commas.'],
    [
      'Relation columns',
      'Columns such as "Supports" or "Runs on" list the names of related elements, separated by commas. The Relations sheet lists every relation once.',
    ],
    [
      'Dropdowns',
      'Columns with a fixed set of values (Lifecycle, Hosting, TIME…) offer a dropdown.',
    ],
    ['Money', 'Amounts are in euro, stored as plain numbers.'],
    ['Quality %, Health', 'Calculated by Atrium. Shown for reference and ignored on import.'],
  ];
  for (const [label, text] of guide) put(label, text);
}

/* ------------------------------------------------------------------ */
/* Entry point                                                          */
/* ------------------------------------------------------------------ */

/** Exports the model as a styled Excel workbook that Atrium's importer can read back. */
export async function exportExcel(
  model: ExportModel,
  opts: ExcelExportOptions = {},
): Promise<Uint8Array> {
  const byId = indexById(model.elements);
  const wanted = new Set(opts.types ?? ELEMENT_TYPES);
  const types = ELEMENT_TYPES.filter(
    (t) => wanted.has(t) && model.elements.some((e) => e.type === t),
  );

  const outgoing = new Map<string, Map<RelationType, string[]>>();
  const validRelations = model.relations.filter(
    (r) => byId.has(r.sourceId) && byId.has(r.targetId),
  );
  for (const rel of validRelations) {
    const byType = outgoing.get(rel.sourceId) ?? new Map<RelationType, string[]>();
    const names = byType.get(rel.type) ?? [];
    names.push(byId.get(rel.targetId)!.name);
    byType.set(rel.type, names);
    outgoing.set(rel.sourceId, byType);
  }
  for (const byType of outgoing.values()) {
    for (const [k, names] of byType) {
      byType.set(
        k,
        [...new Set(names)].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
      );
    }
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Atrium';
  wb.lastModifiedBy = 'Atrium';
  wb.title = `${model.workspaceName} – Atrium export`;
  const created = parseIsoDate(model.generatedAt);
  if (created) {
    wb.created = created;
    wb.modified = created;
  }

  const summary: Array<{ name: string; count: number; what: string }> = [];
  for (const type of types) {
    const def = ELEMENT_TYPE_DEFS[type];
    const elements = model.elements.filter((e) => e.type === type);
    const cols = buildColumns(type, elements, byId, outgoing);
    const ordered = readingOrder(elements);
    const ws = wb.addWorksheet(def.plural, {
      properties: { tabColor: { argb: argb(LAYER_TAB[def.layer] ?? PALETTE.accent) } },
    });
    writeTable(
      ws,
      cols,
      ordered.map(({ element, depth }) => ({
        values: cols.map((c) => c.value(element)),
        depth: def.hierarchical ? depth : 0,
      })),
      3,
    );
    summary.push({
      name: def.plural,
      count: elements.length,
      what: `${elements.length} ${elements.length === 1 ? def.label.toLowerCase() : def.plural.toLowerCase()}. ${def.description}`,
    });
  }

  // Relations sheet: every relation once, readable both ways.
  const relRows = validRelations
    .filter((r) => wanted.has(byId.get(r.sourceId)!.type) || wanted.has(byId.get(r.targetId)!.type))
    .map((r) => {
      const from = byId.get(r.sourceId)!;
      const to = byId.get(r.targetId)!;
      return [relationHeader(r.type), typeLabel(from.type), from.name, typeLabel(to.type), to.name];
    })
    .sort((a, b) => {
      for (let i = 0; i < a.length; i++) {
        const c = a[i]!.localeCompare(b[i]!, 'en', { sensitivity: 'base', numeric: true });
        if (c) return c;
      }
      return 0;
    });
  const relWs = wb.addWorksheet('Relations', {
    properties: { tabColor: { argb: argb('64748B') } },
  });
  const relCols: ColumnSpec[] = [
    {
      header: 'Type',
      group: 'relation',
      value: () => null,
      maxWidth: 22,
      list: RELATION_TYPES.map(relationHeader),
    },
    { header: 'From type', group: 'core', value: () => null, maxWidth: 20 },
    { header: 'From', group: 'core', value: () => null, maxWidth: 40, role: 'name' },
    { header: 'To type', group: 'core', value: () => null, maxWidth: 20 },
    { header: 'To', group: 'core', value: () => null, maxWidth: 40, role: 'name' },
  ];
  writeTable(
    relWs,
    relCols,
    relRows.map((values) => ({ values })),
    1,
  );
  summary.push({
    name: 'Relations',
    count: relRows.length,
    what: `${relRows.length} relations, one per row: type, the element it starts from and the element it points to.`,
  });
  summary.push({ name: 'README', count: 0, what: 'This page.' });

  writeReadme(
    wb.addWorksheet('README', { properties: { tabColor: { argb: argb(PALETTE.faint) } } }),
    model,
    summary,
  );

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
