import type { Element, Relation } from '@atrium/schema';

/** Everything an export needs. Domain and parent names are resolved through ids in `elements`. */
export interface ExportModel {
  elements: Element[];
  relations: Relation[];
  workspaceName: string;
  /** ISO timestamp of the export. */
  generatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Slide deck specification                                             */
/* ------------------------------------------------------------------ */

export type Tone = 'good' | 'watch' | 'act' | 'neutral';
export type CellTone = 'good' | 'watch' | 'act';

export interface Kpi {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}

export interface KpiSlideSpec {
  kind: 'kpis';
  title: string;
  /** Up to six cards; extra ones are ignored. */
  kpis: Kpi[];
}

export interface LegendItem {
  label: string;
  color: string;
}

export interface CapabilityBox {
  name: string;
  color: string;
  textColor?: string;
  note?: string;
}

export interface CapabilityColumn {
  name: string;
  color?: string;
  children: CapabilityBox[];
}

export interface CapabilityMapSlideSpec {
  kind: 'capabilityMap';
  title: string;
  subtitle?: string;
  legend: LegendItem[];
  columns: CapabilityColumn[];
}

export interface ChartSeries {
  name: string;
  values: number[];
  color?: string;
}

export interface ChartSlideSpec {
  kind: 'bar' | 'doughnut';
  title: string;
  subtitle?: string;
  labels: string[];
  series: ChartSeries[];
  /** `percent` accepts fractions (0.42) or whole percentages (42). */
  valueFormat?: 'money' | 'number' | 'percent';
}

export type TableCellSpec = string | { text: string; tone?: CellTone };

export interface TableSlideSpec {
  kind: 'table';
  title: string;
  columns: string[];
  /** Paginated automatically to extra slides when there are more than 12 rows. */
  rows: TableCellSpec[][];
}

export interface RoadmapBar {
  label: string;
  /** ISO date (YYYY-MM-DD). */
  start: string;
  end: string;
  color: string;
}

export interface RoadmapLane {
  name: string;
  bars: RoadmapBar[];
}

export interface RoadmapSlideSpec {
  kind: 'roadmap';
  title: string;
  /** ISO date (YYYY-MM-DD) of the left edge of the timeline. */
  start: string;
  end: string;
  lanes: RoadmapLane[];
}

export interface TextSlideSpec {
  kind: 'text';
  title: string;
  bullets: string[];
}

export type SlideSpec =
  | KpiSlideSpec
  | CapabilityMapSlideSpec
  | ChartSlideSpec
  | TableSlideSpec
  | RoadmapSlideSpec
  | TextSlideSpec;

export interface DeckSpec {
  title: string;
  subtitle?: string;
  workspaceName: string;
  /** Shown on the title slide and in the footer; ISO dates are formatted as "8 Oct 2026". */
  date: string;
  slides: SlideSpec[];
}
