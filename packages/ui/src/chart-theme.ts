/**
 * Charts and diagrams read their colours from the same CSS variables as the rest of the UI,
 * converted to rgb() because chart libraries don't parse oklch().
 */
let canvas: HTMLCanvasElement | null = null;
const cache = new Map<string, string>();

export function toRgb(color: string): string {
  const hit = cache.get(color);
  if (hit) return hit;
  if (typeof document === 'undefined') return color;
  canvas ??= document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return color;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const out = a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a! / 255).toFixed(3)})`;
  cache.set(color, out);
  return out;
}

export function cssVar(name: string, el?: HTMLElement): string {
  if (typeof document === 'undefined') return '#888';
  const raw = getComputedStyle(el ?? document.documentElement).getPropertyValue(name).trim();
  return raw ? toRgb(raw) : '#888';
}

export interface ChartPalette {
  text: string;
  muted: string;
  subtle: string;
  border: string;
  surface: string;
  surface2: string;
  primary: string;
  primarySoft: string;
  good: string;
  watch: string;
  act: string;
  unknown: string;
  seq: string[];
  categorical: string[];
}

export function chartPalette(): ChartPalette {
  return {
    text: cssVar('--foreground'),
    muted: cssVar('--muted-foreground'),
    subtle: cssVar('--subtle-foreground'),
    border: cssVar('--border'),
    surface: cssVar('--surface'),
    surface2: cssVar('--surface-2'),
    primary: cssVar('--primary'),
    primarySoft: cssVar('--primary-soft'),
    good: cssVar('--good'),
    watch: cssVar('--watch'),
    act: cssVar('--act'),
    unknown: cssVar('--unknown'),
    seq: ['--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5'].map((v) => cssVar(v)),
    categorical: [
      '--primary',
      '--layer-data',
      '--layer-business',
      '--layer-governance',
      '--layer-application',
      '--layer-strategy',
      '--layer-technology',
      '--layer-organization',
    ].map((v) => cssVar(v)),
  };
}

/** An ECharts theme object built from the current tokens. */
export function echartsTheme(p: ChartPalette = chartPalette()) {
  const axis = {
    axisLine: { lineStyle: { color: p.border } },
    axisTick: { show: false },
    axisLabel: { color: p.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: p.border, type: [3, 3] } },
    nameTextStyle: { color: p.muted },
  };
  return {
    color: p.categorical,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'Inter Variable, Inter, system-ui, sans-serif', color: p.text },
    title: { textStyle: { color: p.text, fontWeight: 600 } },
    legend: { textStyle: { color: p.muted, fontSize: 11 }, icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
    tooltip: {
      backgroundColor: p.surface,
      borderColor: p.border,
      borderWidth: 1,
      padding: [6, 10],
      textStyle: { color: p.text, fontSize: 12 },
      extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);',
    },
    categoryAxis: axis,
    valueAxis: axis,
    timeAxis: axis,
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
  };
}
