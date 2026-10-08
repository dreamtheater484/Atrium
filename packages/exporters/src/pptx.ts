import PptxGenJS from 'pptxgenjs';
import { mix, PALETTE, readableText, TONE_COLOR, tint, toHex } from './color';
import { formatDisplayDate, parseIsoDate } from './model';
import type {
  CapabilityColumn,
  CapabilityMapSlideSpec,
  CellTone,
  ChartSlideSpec,
  DeckSpec,
  KpiSlideSpec,
  RoadmapBar,
  RoadmapLane,
  RoadmapSlideSpec,
  SlideSpec,
  TableCellSpec,
  TableSlideSpec,
  TextSlideSpec,
} from './types';

type Slide = PptxGenJS.Slide;
type TextRun = PptxGenJS.TextProps;
type TextOptions = PptxGenJS.TextPropsOptions;

/* ------------------------------------------------------------------ */
/* Design tokens (inches unless noted)                                  */
/* ------------------------------------------------------------------ */

const W = 13.333;
const H = 7.5;
const MX = 0.6;
const CW = W - 2 * MX;
const BOTTOM = 6.72;
const FONT = 'Segoe UI';
const MASTER = 'ATRIUM';
const TABLE_ROWS_PER_SLIDE = 12;
const MAX_MAP_COLUMNS = 10;

/** Categorical colours for charts, starting with Atrium indigo. */
const SERIES_COLORS = [
  PALETTE.accent,
  PALETTE.good,
  PALETTE.watch,
  '0EA5E9',
  PALETTE.act,
  '8B5CF6',
  '14B8A6',
  'F97316',
  '64748B',
  'EC4899',
  PALETTE.unknown,
];

/** Labels that get their health colour automatically in doughnuts. */
const SEMANTIC_COLORS: Record<string, string> = {
  good: PALETTE.good,
  healthy: PALETTE.good,
  watch: PALETTE.watch,
  act: PALETTE.act,
  unknown: PALETTE.unknown,
  'not rated': PALETTE.unknown,
  'no data': PALETTE.unknown,
};

const TONE_TEXT: Record<CellTone, string> = {
  good: mix(PALETTE.good, '000000', 0.15),
  watch: mix(PALETTE.watch, '000000', 0.3),
  act: mix(PALETTE.act, '000000', 0.12),
};

interface Ctx {
  pptx: PptxGenJS;
  today: Date;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                        */
/* ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Rough rendered width of `text` in inches for Segoe UI at `pt`. */
function textWidth(text: string, pt: number, bold = false): number {
  return text.length * pt * (bold ? 0.0082 : 0.0076);
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function text(slide: Slide, content: string | TextRun[], opts: TextOptions) {
  slide.addText(content, { fontFace: FONT, color: PALETTE.text, margin: 0, ...opts });
}

function newSlide(ctx: Ctx): Slide {
  return ctx.pptx.addSlide({ masterName: MASTER });
}

/** Slide title with the indigo accent bar; returns the y where content starts. */
function addTitle(
  slide: Slide,
  title: string,
  subtitle?: string,
  page?: { n: number; of: number },
): number {
  slide.addShape('roundRect', {
    x: MX,
    y: 0.5,
    w: 0.46,
    h: 0.07,
    fill: { color: PALETTE.accent },
    rectRadius: 0.035,
  });
  const runs: TextRun[] = [{ text: title, options: { bold: true } }];
  if (page && page.of > 1) {
    runs.push({ text: `   ${page.n} / ${page.of}`, options: { bold: false, color: PALETTE.faint, fontSize: 16 } });
  }
  const size = title.length > 70 ? 20 : title.length > 50 ? 23 : 26;
  text(slide, runs, { x: MX, y: 0.66, w: CW, h: 0.55, fontSize: size, valign: 'top', fit: 'shrink' });
  if (subtitle) {
    text(slide, subtitle, {
      x: MX,
      y: 1.2,
      w: CW,
      h: 0.34,
      fontSize: 13,
      color: PALETTE.muted,
      valign: 'top',
    });
    return 1.78;
  }
  return 1.55;
}

function emptyNote(slide: Slide, top: number, message: string) {
  text(slide, message, {
    x: MX,
    y: top,
    w: CW,
    h: BOTTOM - top,
    fontSize: 14,
    italic: true,
    color: PALETTE.faint,
    align: 'center',
    valign: 'middle',
  });
}

/* ------------------------------------------------------------------ */
/* Number formatting                                                    */
/* ------------------------------------------------------------------ */

type ValueFormat = NonNullable<ChartSlideSpec['valueFormat']>;

function isFractionScale(values: number[]): boolean {
  return values.length > 0 && values.every((v) => Math.abs(v) <= 1);
}

/** Excel/PowerPoint number format for chart labels; zeros stay blank to avoid clutter. */
function chartFormatCode(format: ValueFormat, values: number[]): string {
  switch (format) {
    case 'money':
      return '[>=1000000]"€"#,##0.0,,"M";[>=1000]"€"#,##0,"K";"€"#,##0';
    case 'percent':
      return isFractionScale(values) ? '0%;-0%;;' : '0"%";-0"%";;';
    default:
      return '#,##0;-#,##0;;';
  }
}

function formatValue(v: number, format: ValueFormat, fraction: boolean): string {
  if (format === 'money') {
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}€${Math.round(abs / 1_000)}K`;
    return `${sign}€${Math.round(abs)}`;
  }
  if (format === 'percent') return `${Math.round(fraction ? v * 100 : v)}%`;
  return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/* ------------------------------------------------------------------ */
/* Title slide                                                          */
/* ------------------------------------------------------------------ */

function titleSlide(ctx: Ctx, deck: DeckSpec) {
  const s = newSlide(ctx);
  const panelX = 8.75;
  s.addShape('rect', { x: panelX, y: 0, w: W - panelX, h: H, fill: { color: tint(PALETTE.accent, 0.93) } });

  // A small abstract capability map: native shapes, so it stays crisp and editable.
  const cols = [
    [tint(PALETTE.good, 0.2), tint(PALETTE.accent, 0.55), tint(PALETTE.good, 0.45), PALETTE.unknown],
    [
      tint(PALETTE.accent, 0.55),
      tint(PALETTE.watch, 0.15),
      tint(PALETTE.good, 0.2),
      tint(PALETTE.accent, 0.75),
      tint(PALETTE.good, 0.45),
    ],
    [tint(PALETTE.act, 0.15), tint(PALETTE.accent, 0.55), tint(PALETTE.good, 0.2)],
  ];
  const colW = 1.08;
  const gap = 0.16;
  const boxH = 0.5;
  const headH = 0.4;
  const total = headH + gap + 5 * boxH + 4 * gap;
  const x0 = panelX + (W - panelX - (3 * colW + 2 * gap)) / 2;
  const y0 = (H - total) / 2 - 0.1;
  cols.forEach((boxes, c) => {
    const x = x0 + c * (colW + gap);
    s.addShape('roundRect', {
      x,
      y: y0,
      w: colW,
      h: headH,
      fill: { color: c === 1 ? PALETTE.accent : PALETTE.text },
      rectRadius: 0.07,
    });
    boxes.forEach((color, r) => {
      const y = y0 + headH + gap + r * (boxH + gap);
      s.addShape('roundRect', { x, y, w: colW, h: boxH, fill: { color }, rectRadius: 0.07 });
      s.addShape('roundRect', {
        x: x + 0.14,
        y: y + boxH / 2 - 0.03,
        w: colW * (r % 2 ? 0.45 : 0.6),
        h: 0.06,
        fill: { color: 'FFFFFF', transparency: 25 },
        rectRadius: 0.03,
      });
    });
  });

  text(s, 'ATRIUM', {
    x: MX,
    y: 0.62,
    w: 4,
    h: 0.3,
    fontSize: 12,
    bold: true,
    color: PALETTE.accent,
    charSpacing: 4,
  });
  s.addShape('roundRect', {
    x: MX,
    y: 2.3,
    w: 0.9,
    h: 0.09,
    fill: { color: PALETTE.accent },
    rectRadius: 0.045,
  });
  const titleSize = deck.title.length > 70 ? 30 : deck.title.length > 45 ? 34 : 40;
  text(s, deck.title, {
    x: MX,
    y: 2.58,
    w: panelX - MX - 0.6,
    h: 1.55,
    fontSize: titleSize,
    bold: true,
    valign: 'top',
    lineSpacingMultiple: 0.95,
    fit: 'shrink',
  });
  if (deck.subtitle) {
    text(s, deck.subtitle, {
      x: MX,
      y: 4.2,
      w: panelX - MX - 0.6,
      h: 0.95,
      fontSize: 18,
      color: PALETTE.muted,
      valign: 'top',
    });
  }
  text(
    s,
    [
      { text: deck.workspaceName, options: { bold: true, breakLine: true } },
      { text: formatDisplayDate(deck.date), options: { color: PALETTE.muted } },
    ],
    { x: MX, y: 5.6, w: panelX - MX - 0.6, h: 0.75, fontSize: 13, valign: 'top', paraSpaceAfter: 3 },
  );
}

/* ------------------------------------------------------------------ */
/* KPI cards                                                            */
/* ------------------------------------------------------------------ */

function kpiSlide(ctx: Ctx, spec: KpiSlideSpec) {
  const s = newSlide(ctx);
  const top = addTitle(s, spec.title);
  const kpis = spec.kpis.slice(0, 6);
  if (!kpis.length) return emptyNote(s, top, 'No figures to show yet.');

  const n = kpis.length;
  const cols = n <= 4 ? n : 3;
  const rows = Math.ceil(n / cols);
  const gap = 0.3;
  const areaH = BOTTOM - top - 0.1;
  const cardW = (CW - gap * (cols - 1)) / cols;
  const cardH = rows === 1 ? Math.min(2.7, areaH) : (areaH - gap) / 2;
  const y0 = rows === 1 ? top + (areaH - cardH) / 2 - 0.15 : top + 0.05;
  const pad = cardW > 3 ? 0.34 : 0.26;
  const innerW = cardW - 2 * pad;
  // One geometry for every card, so values line up across a row.
  const anyHint = kpis.some((k) => k.hint);
  const hintH = anyHint ? 0.34 : 0;
  const valueOffset = pad + 0.6;
  const valueH = cardH - valueOffset - pad - (anyHint ? hintH + 0.04 : 0);
  const longest = Math.max(...kpis.map((k) => k.value.length), 1);
  const valueSize = clamp(Math.min(48, (valueH * 72) / 1.3, innerW / (longest * 0.0085)), 16, 48);

  kpis.forEach((k, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const x = MX + ((cols - inRow) * (cardW + gap)) / 2 + c * (cardW + gap);
    const y = y0 + r * (cardH + gap);
    const tone = TONE_COLOR[k.tone ?? 'neutral'];

    s.addShape('roundRect', {
      x,
      y,
      w: cardW,
      h: cardH,
      fill: { color: tint(tone, 0.92) },
      rectRadius: 0.14,
      objectName: `KPI ${i + 1}`,
    });
    s.addShape('roundRect', {
      x: x + pad,
      y: y + pad,
      w: 0.42,
      h: 0.08,
      fill: { color: tone },
      rectRadius: 0.04,
    });
    text(s, k.label, {
      x: x + pad,
      y: y + pad + 0.2,
      w: innerW,
      h: 0.36,
      fontSize: 13,
      color: PALETTE.muted,
      valign: 'top',
    });
    text(s, k.value, {
      x: x + pad,
      y: y + valueOffset,
      w: innerW,
      h: valueH,
      fontSize: valueSize,
      bold: true,
      valign: 'middle',
    });
    if (k.hint) {
      text(s, k.hint, {
        x: x + pad,
        y: y + cardH - pad - hintH,
        w: innerW,
        h: hintH,
        fontSize: 11.5,
        color: PALETTE.muted,
        valign: 'bottom',
      });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Capability map                                                       */
/* ------------------------------------------------------------------ */

function capabilityMapSlides(ctx: Ctx, spec: CapabilityMapSlideSpec) {
  const pages =
    spec.columns.length > MAX_MAP_COLUMNS + 2
      ? chunk(spec.columns, MAX_MAP_COLUMNS)
      : [spec.columns];
  pages.forEach((columns, i) => {
    capabilityMapSlide(ctx, spec, columns, { n: i + 1, of: pages.length });
  });
}

function capabilityMapSlide(
  ctx: Ctx,
  spec: CapabilityMapSlideSpec,
  columns: CapabilityColumn[],
  page: { n: number; of: number },
) {
  const s = newSlide(ctx);
  const top = addTitle(s, spec.title, spec.subtitle, page);
  if (!columns.length) return emptyNote(s, top, 'No capabilities to show yet.');

  const legendH = spec.legend.length ? 0.42 : 0;
  const areaTop = top;
  const availH = BOTTOM - legendH - areaTop;
  const n = columns.length;
  const colGap = n > 7 ? 0.1 : 0.16;
  const headerH = clamp(availH * 0.12, 0.44, 0.62);
  const pad = n > 7 ? 0.06 : 0.09;
  const boxGap = 0.06;
  const minBoxH = 0.24;
  const boxSpace = availH - headerH - 2 * pad - 0.04;
  const rowsFit = Math.max(1, Math.floor((boxSpace + boxGap) / (minBoxH + boxGap)));

  // Columns with more boxes than fit get sub-columns, and a proportionally wider column.
  const subCols = columns.map((c) => Math.max(1, Math.ceil(c.children.length / rowsFit)));
  const rowsPer = columns.map((c, i) => Math.ceil(c.children.length / subCols[i]!));
  const rows = Math.max(1, ...rowsPer);
  const weights = subCols.map((k) => 1 + (k - 1) * 0.85);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const usableW = CW - colGap * (n - 1);
  const boxH = Math.min(0.62, (boxSpace - boxGap * (rows - 1)) / rows);
  const containerH = headerH + pad + rows * boxH + (rows - 1) * boxGap + pad + 0.04;

  let x = MX;
  columns.forEach((col, ci) => {
    const colW = (usableW * weights[ci]!) / weightSum;
    const headFill = toHex(col.color, PALETTE.text);
    s.addShape('roundRect', {
      x,
      y: areaTop,
      w: colW,
      h: containerH,
      fill: { color: PALETTE.soft },
      rectRadius: 0.1,
    });
    const headSize = clamp(Math.min(colW * 8.5, (headerH * 72) / 2.5), 7.5, 13);
    text(s, col.name, {
      shape: 'roundRect',
      x,
      y: areaTop,
      w: colW,
      h: headerH,
      fill: { color: headFill },
      rectRadius: 0.1,
      fontSize: headSize,
      bold: true,
      color: readableText(headFill),
      align: 'center',
      valign: 'middle',
      margin: 3,
      fit: 'shrink',
      objectName: `Capability ${col.name}`,
    });

    const k = subCols[ci]!;
    const perCol = rowsPer[ci]!;
    const boxW = (colW - 2 * pad - (k - 1) * boxGap) / k;
    col.children.forEach((box, bi) => {
      const sc = Math.floor(bi / perCol);
      const r = bi % perCol;
      const bx = x + pad + sc * (boxW + boxGap);
      const by = areaTop + headerH + pad + 0.04 + r * (boxH + boxGap);
      const fill = toHex(box.color, PALETTE.unknown);
      const color = box.textColor ? toHex(box.textColor, PALETTE.text) : readableText(fill);
      const showNote = !!box.note && boxH >= 0.42;
      let nameSize = clamp(Math.min((boxH * 72) / (showNote ? 3.1 : 2.3), boxW * 10.5), 6.5, 12);
      if (box.name.length * nameSize * 0.0076 > boxW * 2.2) nameSize = Math.max(6.5, nameSize - 1.5);
      const runs: TextRun[] = [{ text: box.name, options: { bold: true, breakLine: showNote } }];
      if (showNote) {
        runs.push({
          text: box.note!,
          options: { fontSize: Math.max(6, nameSize * 0.82), bold: false, transparency: 20 },
        });
      }
      text(s, runs, {
        shape: 'roundRect',
        x: bx,
        y: by,
        w: boxW,
        h: boxH,
        fill: { color: fill },
        rectRadius: Math.min(0.07, boxH / 3),
        fontSize: nameSize,
        color,
        align: 'center',
        valign: 'middle',
        margin: 2,
        fit: 'shrink',
      });
    });
    x += colW + colGap;
  });

  if (spec.legend.length) addLegend(s, spec.legend, BOTTOM - 0.26);
}

function addLegend(slide: Slide, items: Array<{ label: string; color: string }>, y: number) {
  let size = 10.5;
  const needed = (pt: number) =>
    items.reduce((sum, it) => sum + 0.18 + 0.08 + textWidth(it.label, pt) + 0.32, 0);
  while (needed(size) > CW && size > 7) size -= 0.5;
  let x = MX;
  for (const it of items) {
    const w = textWidth(it.label, size) + 0.12;
    if (x + 0.26 + w > W - MX) break;
    slide.addShape('roundRect', {
      x,
      y: y + 0.02,
      w: 0.18,
      h: 0.18,
      fill: { color: toHex(it.color) },
      rectRadius: 0.04,
    });
    text(slide, it.label, { x: x + 0.26, y: y - 0.02, w, h: 0.26, fontSize: size, color: PALETTE.muted, valign: 'middle' });
    x += 0.26 + w + 0.24;
  }
}

/* ------------------------------------------------------------------ */
/* Charts                                                               */
/* ------------------------------------------------------------------ */

const NO_SHADOW: PptxGenJS.ShadowProps = { type: 'none' };

function chartSlide(ctx: Ctx, spec: ChartSlideSpec) {
  const s = newSlide(ctx);
  const top = addTitle(s, spec.title, spec.subtitle);
  const series = spec.series.filter((x) => x.values.length);
  if (!spec.labels.length || !series.length) return emptyNote(s, top, 'No data to chart yet.');
  if (spec.kind === 'bar') barChart(s, spec, top);
  else doughnutChart(s, spec, top);
}

function barChart(s: Slide, spec: ChartSlideSpec, top: number) {
  const format = spec.valueFormat ?? 'number';
  const all = spec.series.flatMap((x) => x.values);
  const code = chartFormatCode(format, all);
  const horizontal = spec.labels.length > 7 || spec.labels.some((l) => l.length > 14);
  const colors = spec.series.map((x, i) => toHex(x.color, SERIES_COLORS[i % SERIES_COLORS.length]));
  const multi = spec.series.length > 1;
  const labelSize = spec.labels.length > 14 ? 9 : spec.labels.length > 10 ? 10 : 11.5;

  s.addChart(
    'bar',
    spec.series.map((x) => ({
      name: x.name,
      labels: spec.labels,
      values: spec.labels.map((_, i) => x.values[i] ?? 0),
    })),
    {
      x: MX,
      y: top + 0.05,
      w: CW,
      h: BOTTOM - top - 0.05,
      barDir: horizontal ? 'bar' : 'col',
      barGrouping: 'clustered',
      barGapWidthPct: multi ? 70 : 55,
      barOverlapPct: multi ? -8 : 0,
      chartColors: colors,
      shadow: NO_SHADOW,
      showValue: true,
      dataLabelPosition: 'outEnd',
      dataLabelFormatCode: code,
      dataLabelFontFace: FONT,
      dataLabelFontSize: labelSize,
      dataLabelColor: PALETTE.text,
      valLabelFormatCode: code,
      valAxisLabelFormatCode: code,
      valAxisHidden: true,
      valGridLine: { style: 'none' },
      catGridLine: { style: 'none' },
      valAxisMinVal: all.every((v) => v >= 0) ? 0 : undefined,
      catAxisLabelFontFace: FONT,
      catAxisLabelFontSize: labelSize,
      catAxisLabelColor: PALETTE.muted,
      catAxisLineShow: true,
      catAxisLineColor: PALETTE.line,
      catAxisMajorTickMark: 'none',
      // Horizontal bars read top-down in the order given.
      catAxisOrientation: (horizontal ? 'maxMin' : 'minMax') as 'minMax',
      showLegend: multi,
      legendPos: 't',
      legendFontFace: FONT,
      legendFontSize: 11,
      legendColor: PALETTE.muted,
      showTitle: false,
      altText: spec.title,
    },
  );
}

function doughnutChart(s: Slide, spec: ChartSlideSpec, top: number) {
  const format = spec.valueFormat ?? 'number';
  const first = spec.series[0]!;
  let labels = spec.labels.slice();
  let values = labels.map((_, i) => Math.max(0, first.values[i] ?? 0));
  // More than ten slices is unreadable: keep the nine largest and fold the rest into "Other".
  if (labels.length > 10) {
    const order = values.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
    const keep = order.slice(0, 9).map(([, i]) => i).sort((a, b) => a - b);
    const rest = order.slice(9).reduce((sum, [v]) => sum + v, 0);
    labels = [...keep.map((i) => labels[i]!), 'Other'];
    values = [...keep.map((i) => values[i]!), rest];
  }
  let paletteIndex = 0;
  const colors = labels.map((l) => {
    const semantic = SEMANTIC_COLORS[l.trim().toLowerCase()];
    if (semantic) return semantic;
    if (l === 'Other') return PALETTE.unknown;
    return SERIES_COLORS[paletteIndex++ % SERIES_COLORS.length]!;
  });
  if (labels.length === 1 && first.color) colors[0] = toHex(first.color);
  const total = values.reduce((a, b) => a + b, 0);
  const fraction = isFractionScale(values);

  const avail = BOTTOM - top;
  const size = Math.min(avail, 5.0);
  const cx = MX + 0.3;
  const cy = top + (avail - size) / 2;
  s.addChart('doughnut', [{ name: first.name, labels, values }], {
    x: cx,
    y: cy,
    w: size,
    h: size,
    holeSize: 64,
    chartColors: colors,
    dataBorder: { pt: 2, color: 'FFFFFF' },
    dataNoEffects: true,
    shadow: NO_SHADOW,
    showPercent: true,
    showValue: false,
    showLegend: false,
    showTitle: false,
    dataLabelFormatCode: '0%',
    dataLabelColor: 'FFFFFF',
    dataLabelFontFace: FONT,
    dataLabelFontSize: 11,
    dataLabelFontBold: true,
    layout: { x: 0.04, y: 0.04, w: 0.92, h: 0.92 },
    altText: spec.title,
  });

  // The total in the hole of the doughnut.
  const centre = format === 'percent' ? first.name : formatValue(total, format, fraction);
  const centreRuns: TextRun[] = [
    { text: centre, options: { bold: true, fontSize: centre.length > 9 ? 18 : 28 } },
  ];
  if (format !== 'percent') {
    centreRuns[0]!.options!.breakLine = true;
    centreRuns.push({ text: 'Total', options: { fontSize: 12, color: PALETTE.muted } });
  }
  text(
    s,
    centreRuns,
    {
      x: cx + size / 2 - 1.2,
      y: cy + size / 2 - 0.5,
      w: 2.4,
      h: 1.0,
      align: 'center',
      valign: 'middle',
    },
  );

  // A legend with values, built from native shapes so it can be restyled freely.
  const lx = cx + size + 0.7;
  const lw = W - MX - lx;
  const rowH = clamp(avail / Math.max(labels.length, 1), 0.32, 0.56);
  const fontSize = rowH < 0.4 ? 11 : 13;
  const ly = top + (avail - rowH * labels.length) / 2;
  labels.forEach((label, i) => {
    const y = ly + i * rowH;
    const pct = total > 0 ? Math.round((values[i]! / total) * 100) : 0;
    s.addShape('ellipse', {
      x: lx,
      y: y + rowH / 2 - 0.09,
      w: 0.18,
      h: 0.18,
      fill: { color: colors[i]! },
    });
    text(s, label, { x: lx + 0.32, y, w: lw - 2.6, h: rowH, fontSize, valign: 'middle', fit: 'shrink' });
    text(s, formatValue(values[i]!, format, fraction), {
      x: lx + lw - 2.25,
      y,
      w: 1.3,
      h: rowH,
      fontSize,
      bold: true,
      align: 'right',
      valign: 'middle',
    });
    text(s, `${pct}%`, {
      x: lx + lw - 0.85,
      y,
      w: 0.85,
      h: rowH,
      fontSize: fontSize - 1,
      color: PALETTE.muted,
      align: 'right',
      valign: 'middle',
    });
    if (i < labels.length - 1) {
      s.addShape('line', {
        x: lx,
        y: y + rowH,
        w: lw,
        h: 0,
        line: { color: PALETTE.line, width: 0.75 },
      });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Tables                                                               */
/* ------------------------------------------------------------------ */

const cellText = (c: TableCellSpec | undefined) => (c === undefined ? '' : typeof c === 'string' ? c : c.text);
const NUMERIC = /^[€$£]?\s?[-+]?[\d.,]+\s?(%|[KkMm]|bn)?$/;

function tableSlides(ctx: Ctx, spec: TableSlideSpec) {
  const ncol = Math.max(1, spec.columns.length);
  // Column widths from content, shared by every page so columns don't jump around.
  const weights = Array.from({ length: ncol }, (_, i) => {
    const longest = Math.max(
      (spec.columns[i] ?? '').length,
      ...spec.rows.map((r) => Math.min(cellText(r[i]).length, 48)),
    );
    return clamp(longest, 4, 48);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  let colW = weights.map((w) => Math.max(0.8, (w / sum) * CW));
  const scale = CW / colW.reduce((a, b) => a + b, 0);
  colW = colW.map((w) => w * scale);
  const numeric = Array.from({ length: ncol }, (_, i) => {
    const vals = spec.rows.map((r) => cellText(r[i]).trim()).filter(Boolean);
    return vals.length > 0 && vals.filter((v) => NUMERIC.test(v)).length / vals.length >= 0.8;
  });

  const pages = chunk(spec.rows, TABLE_ROWS_PER_SLIDE);
  pages.forEach((rows, p) => {
    const s = newSlide(ctx);
    const top = addTitle(s, spec.title, undefined, { n: p + 1, of: pages.length });
    const none: PptxGenJS.BorderProps = { type: 'none' };
    const header: PptxGenJS.TableCell[] = Array.from({ length: ncol }, (_, i) => ({
      text: spec.columns[i] ?? '',
      options: {
        bold: true,
        color: PALETTE.muted,
        fontSize: 10.5,
        fill: { color: PALETTE.soft },
        align: numeric[i] ? 'right' : 'left',
        border: [none, none, { type: 'solid', pt: 1.5, color: PALETTE.accent }, none],
      },
    }));
    const body: PptxGenJS.TableRow[] = rows.map((row) =>
      Array.from({ length: ncol }, (_, i) => {
        const cell = row[i];
        const tone = typeof cell === 'object' ? cell.tone : undefined;
        const base: PptxGenJS.TableCellProps = {
          color: PALETTE.text,
          fontSize: 11,
          align: numeric[i] ? 'right' : 'left',
          border: [none, none, { type: 'solid', pt: 0.75, color: PALETTE.line }, none],
        };
        if (tone) {
          base.bold = true;
          base.color = TONE_TEXT[tone];
          base.fill = { color: tint(TONE_COLOR[tone], 0.86) };
        }
        return { text: cellText(cell), options: base };
      }),
    );
    if (!rows.length) {
      body.push([
        {
          text: 'No rows to show.',
          options: { colspan: ncol, italic: true, color: PALETTE.faint, fontSize: 11 },
        },
      ]);
    }
    s.addTable([header, ...body], {
      x: MX,
      y: top + 0.05,
      w: CW,
      colW,
      rowH: [0.4, ...body.map(() => 0.36)],
      fontFace: FONT,
      valign: 'middle',
      margin: [0.05, 0.12, 0.05, 0.12],
    });
  });
}

/* ------------------------------------------------------------------ */
/* Roadmap                                                              */
/* ------------------------------------------------------------------ */

const DAY = 86_400_000;

function quarterStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
}

function addMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
}

interface PlacedBar {
  bar: RoadmapBar;
  x: number;
  w: number;
  labelInside: boolean;
  labelX: number;
  labelW: number;
  row: number;
}

interface PlacedLane {
  lane: RoadmapLane;
  bars: PlacedBar[];
  rows: number;
}

function roadmapSlides(ctx: Ctx, spec: RoadmapSlideSpec) {
  const barDates = spec.lanes.flatMap((l) =>
    l.bars.flatMap((b) => [parseIsoDate(b.start), parseIsoDate(b.end)]),
  );
  const known = barDates.filter((d): d is Date => !!d).map((d) => d.getTime());
  let start = parseIsoDate(spec.start) ?? (known.length ? new Date(Math.min(...known)) : ctx.today);
  let end =
    parseIsoDate(spec.end) ??
    (known.length ? new Date(Math.max(...known)) : new Date(ctx.today.getTime() + 365 * DAY));
  if (end.getTime() < start.getTime()) [start, end] = [end, start];
  if (end.getTime() === start.getTime()) end = new Date(start.getTime() + 90 * DAY);
  const from = quarterStart(start);
  let to = addMonths(quarterStart(end), 3);
  if (end.getTime() === quarterStart(end).getTime() && end.getTime() > from.getTime()) to = end;

  const quarters: Date[] = [];
  for (let q = from; q.getTime() < to.getTime(); q = addMonths(q, 3)) quarters.push(q);

  const labelColW = 2.05;
  const x0 = MX + labelColW + 0.15;
  const x1 = W - MX;
  const span = to.getTime() - from.getTime();
  const xOf = (d: Date) => x0 + ((d.getTime() - from.getTime()) / span) * (x1 - x0);

  const barGap = 0.08;
  const lanePad = 0.12;
  const minBarH = 0.22;
  const font = (h: number) => clamp(h * 72 * 0.42, 8, 11);

  // Place bars in sub-rows so that bars (and labels that sit beside them) never overlap.
  const placeLane = (lane: RoadmapLane, barH: number): PlacedLane => {
    const size = font(barH);
    const rowsEnd: number[] = [];
    const bars: PlacedBar[] = [];
    const sorted = lane.bars
      .map((bar) => ({ bar, s: parseIsoDate(bar.start), e: parseIsoDate(bar.end) }))
      .filter((b): b is { bar: RoadmapBar; s: Date; e: Date } => !!b.s && !!b.e)
      .filter((b) => b.e.getTime() > from.getTime() && b.s.getTime() < to.getTime())
      .sort((a, b) => a.s.getTime() - b.s.getTime());
    for (const { bar, s, e } of sorted) {
      const bx = xOf(new Date(Math.max(s.getTime(), from.getTime())));
      const bw = Math.max(0.1, xOf(new Date(Math.min(Math.max(e.getTime(), s.getTime()), to.getTime()))) - bx);
      const lw = textWidth(bar.label, size, true) + 0.2;
      const inside = lw <= bw;
      let labelX = bx + 0.04;
      if (!inside) labelX = bx + bw + 0.06 + lw <= x1 ? bx + bw + 0.06 : Math.max(x0, bx - 0.06 - lw);
      const extStart = Math.min(bx, labelX);
      const extEnd = Math.max(bx + bw, inside ? bx + bw : labelX + lw);
      let row = rowsEnd.findIndex((endX) => endX + 0.05 <= extStart);
      if (row === -1) {
        row = rowsEnd.length;
        rowsEnd.push(extEnd);
      } else rowsEnd[row] = extEnd;
      bars.push({ bar, x: bx, w: bw, labelInside: inside, labelX, labelW: lw, row });
    }
    return { lane, bars, rows: Math.max(1, rowsEnd.length) };
  };

  // Paginate lanes so that bars never get thinner than minBarH.
  const headerH = 0.62;
  const laneTopOffset = headerH + 0.12;
  // Leaves room below the lanes for the "Today" marker label.
  const available = (top: number) => BOTTOM - top - laneTopOffset - 0.3;
  const titleTop = 1.55;
  const laneNeed = (rows: number, h: number) => rows * h + (rows - 1) * barGap + 2 * lanePad;
  const pages: RoadmapLane[][] = [];
  let current: RoadmapLane[] = [];
  let used = 0;
  for (const lane of spec.lanes) {
    const need = laneNeed(placeLane(lane, minBarH).rows, minBarH);
    if (current.length && used + need > available(titleTop)) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(lane);
    used += need;
  }
  pages.push(current);

  pages.forEach((lanes, p) => {
    const s = newSlide(ctx);
    const top = addTitle(s, spec.title, undefined, { n: p + 1, of: pages.length });
    const avail = available(top);
    // Largest bar height (≤ 0.42") at which every lane still fits.
    let barH = 0.42;
    let placed = lanes.map((l) => placeLane(l, barH));
    const fits = (pl: PlacedLane[], h: number) => pl.reduce((sum, l) => sum + laneNeed(l.rows, h), 0) <= avail;
    while (barH > minBarH && !fits(placed, barH)) {
      barH = Math.max(minBarH, barH - 0.02);
      placed = lanes.map((l) => placeLane(l, barH));
    }

    // Header: years and quarters, with soft bands down the whole timeline.
    const lanesTop = top + laneTopOffset;
    const lanesH = placed.reduce((sum, l) => sum + laneNeed(l.rows, barH), 0);
    const showQuarterLabels = quarters.length <= 24;
    quarters.forEach((q, i) => {
      const qx = xOf(q);
      const qw = xOf(addMonths(q, 3)) - qx;
      if (i % 2 === 1) {
        s.addShape('rect', { x: qx, y: top + 0.3, w: qw, h: lanesH + laneTopOffset - 0.3, fill: { color: 'F7F8FB' } });
      }
      if (showQuarterLabels) {
        text(s, `Q${Math.floor(q.getUTCMonth() / 3) + 1}`, {
          x: qx,
          y: top + 0.3,
          w: qw,
          h: 0.3,
          fontSize: quarters.length > 16 ? 8 : 10,
          color: PALETTE.muted,
          align: 'center',
          valign: 'middle',
        });
      }
      if (q.getUTCMonth() === 0 || i === 0) {
        const yearEnd = Math.min(xOf(new Date(Date.UTC(q.getUTCFullYear() + 1, 0, 1))), x1);
        text(s, String(q.getUTCFullYear()), {
          x: qx + 0.06,
          y: top,
          w: Math.max(0.5, yearEnd - qx - 0.06),
          h: 0.3,
          fontSize: 11,
          bold: true,
          valign: 'middle',
        });
        if (i > 0) {
          s.addShape('line', {
            x: qx,
            y: top,
            w: 0,
            h: lanesH + laneTopOffset,
            line: { color: PALETTE.line, width: 1 },
          });
        }
      }
    });
    s.addShape('line', {
      x: MX,
      y: lanesTop,
      w: CW,
      h: 0,
      line: { color: PALETTE.text, width: 1 },
    });

    let y = lanesTop;
    placed.forEach((pl, li) => {
      const laneH = laneNeed(pl.rows, barH);
      text(s, pl.lane.name, {
        x: MX,
        y,
        w: labelColW,
        h: laneH,
        fontSize: 12,
        bold: true,
        valign: 'middle',
        fit: 'shrink',
      });
      const size = font(barH);
      for (const b of pl.bars) {
        const by = y + lanePad + b.row * (barH + barGap);
        const fill = toHex(b.bar.color, PALETTE.accent);
        if (b.labelInside) {
          text(s, b.bar.label, {
            shape: 'roundRect',
            x: b.x,
            y: by,
            w: b.w,
            h: barH,
            fill: { color: fill },
            rectRadius: Math.min(barH / 2, 0.09),
            fontSize: size,
            bold: true,
            color: readableText(fill),
            valign: 'middle',
            margin: 5,
          });
        } else {
          s.addShape('roundRect', {
            x: b.x,
            y: by,
            w: b.w,
            h: barH,
            fill: { color: fill },
            rectRadius: Math.min(barH / 2, b.w / 2, 0.09),
          });
          text(s, b.bar.label, {
            x: b.labelX,
            y: by,
            w: b.labelW,
            h: barH,
            fontSize: size,
            bold: true,
            color: PALETTE.text,
            valign: 'middle',
            align: b.labelX < b.x ? 'right' : 'left',
          });
        }
      }
      y += laneH;
      if (li < placed.length - 1) {
        s.addShape('line', { x: MX, y, w: CW, h: 0, line: { color: PALETTE.line, width: 0.75 } });
      }
    });
    if (!placed.length || placed.every((l) => l.bars.length === 0)) {
      text(s, 'Nothing scheduled in this period.', {
        x: x0,
        y: lanesTop + 0.2,
        w: x1 - x0,
        h: 0.4,
        fontSize: 12,
        italic: true,
        color: PALETTE.faint,
        align: 'center',
      });
    }

    // Today marker.
    const now = ctx.today.getTime();
    if (now >= from.getTime() && now <= to.getTime()) {
      const tx = xOf(ctx.today);
      const lineH = Math.max(lanesH, 0.6);
      s.addShape('line', {
        x: tx,
        y: lanesTop,
        w: 0,
        h: lineH,
        line: { color: PALETTE.act, width: 1.5, dashType: 'dash' },
      });
      text(s, 'Today', {
        shape: 'roundRect',
        x: tx - 0.32,
        y: lanesTop + lineH + 0.03,
        w: 0.64,
        h: 0.22,
        fill: { color: PALETTE.act },
        rectRadius: 0.11,
        fontSize: 8.5,
        bold: true,
        color: 'FFFFFF',
        align: 'center',
        valign: 'middle',
      });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Bullets                                                              */
/* ------------------------------------------------------------------ */

function textSlide(ctx: Ctx, spec: TextSlideSpec) {
  const s = newSlide(ctx);
  const top = addTitle(s, spec.title);
  const bullets = spec.bullets.map((b) => b.trim()).filter(Boolean);
  if (!bullets.length) return;
  const n = bullets.length;
  const twoCols = n > 10;
  const size = n <= 4 ? 20 : n <= 6 ? 18 : n <= 8 ? 16 : n <= 10 ? 15 : 14;
  const half = Math.ceil(n / 2);
  const groups = twoCols ? [bullets.slice(0, half), bullets.slice(half)] : [bullets];
  const gap = 0.5;
  const colW = twoCols ? (CW - gap) / 2 : Math.min(CW, 10.8);
  groups.forEach((items, gi) => {
    text(
      s,
      items.map((b, i) => ({
        text: b,
        options: {
          bullet: { indent: Math.round(size * 1.2) },
          breakLine: i < items.length - 1,
          paraSpaceAfter: Math.round(size * 0.65),
        },
      })),
      {
        x: MX + gi * (colW + gap),
        y: top + 0.15,
        w: colW,
        h: BOTTOM - top - 0.15,
        fontSize: size,
        valign: 'top',
        lineSpacingMultiple: 1.08,
        fit: 'shrink',
      },
    );
  });
}

/* ------------------------------------------------------------------ */
/* Deck                                                                 */
/* ------------------------------------------------------------------ */

function renderSlide(ctx: Ctx, spec: SlideSpec) {
  switch (spec.kind) {
    case 'kpis':
      return kpiSlide(ctx, spec);
    case 'capabilityMap':
      return capabilityMapSlides(ctx, spec);
    case 'bar':
    case 'doughnut':
      return chartSlide(ctx, spec);
    case 'table':
      return tableSlides(ctx, spec);
    case 'roadmap':
      return roadmapSlides(ctx, spec);
    case 'text':
      return textSlide(ctx, spec);
  }
}

/**
 * Builds a 16:9 PowerPoint deck from native, editable shapes, tables and charts:
 * a title slide, then one slide per spec (tables and roadmaps paginate themselves).
 */
export async function exportPptx(deck: DeckSpec): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Atrium';
  pptx.company = deck.workspaceName;
  pptx.title = deck.title;
  pptx.subject = deck.subtitle ?? deck.title;
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };

  const footer = `${deck.workspaceName} · Atrium · ${formatDisplayDate(deck.date)}`;
  pptx.defineSlideMaster({
    title: MASTER,
    background: { color: 'FFFFFF' },
    objects: [
      { line: { x: MX, y: 6.98, w: CW, h: 0, line: { color: 'ECEEF2', width: 0.75 } } },
      {
        text: {
          text: footer,
          options: {
            x: MX,
            y: 7.04,
            w: CW - 1.2,
            h: 0.28,
            fontFace: FONT,
            fontSize: 9,
            color: PALETTE.faint,
            margin: 0,
            valign: 'middle',
          },
        },
      },
    ],
    slideNumber: {
      x: W - MX - 1,
      y: 7.04,
      w: 1,
      h: 0.28,
      fontFace: FONT,
      fontSize: 9,
      color: PALETTE.faint,
      align: 'right',
      valign: 'middle',
      margin: 0,
    },
  });

  const ctx: Ctx = { pptx, today: parseIsoDate(deck.date) ?? new Date() };
  titleSlide(ctx, deck);
  for (const spec of deck.slides) renderSlide(ctx, spec);

  const out = await pptx.write({ outputType: 'uint8array' });
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
}
