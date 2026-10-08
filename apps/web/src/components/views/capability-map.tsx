import type { CapabilityCell, CapabilityMapData, MapOverlay } from '@atrium/schema';
import { enumLabel } from '@atrium/schema';
import { cn, EmptyState, formatMoney, HealthDot, MarkBadge, Skeleton, Tooltip } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { Blocks } from 'lucide-react';
import { useMemo } from 'react';
import { api } from '../../lib/api';
import { useScenario } from '../../lib/queries';
import { inspect, openAdd, useUi } from '../../lib/store';

export function useCapabilityMap(opts: { layer?: 'org' | 'reference'; pack?: string } = {}) {
  const scenario = useScenario();
  const at = useUi((s) => s.at) ?? undefined;
  return useQuery({
    queryKey: ['model', 'capability-map', scenario, at, opts],
    queryFn: () =>
      api<CapabilityMapData>('/views/capability-map', { query: { scenario, at, ...opts } }),
  });
}

interface Tone {
  bg: string;
  border: string;
  text?: string;
}

const TONES = {
  good: { bg: 'bg-good-soft', border: 'border-good/40' },
  watch: { bg: 'bg-watch-soft', border: 'border-watch/50' },
  act: { bg: 'bg-act-soft', border: 'border-act/40' },
  neutral: { bg: 'bg-surface-2', border: 'border-border' },
  seq: [
    { bg: 'bg-seq-1', border: 'border-seq-2' },
    { bg: 'bg-seq-2', border: 'border-seq-3' },
    { bg: 'bg-seq-3', border: 'border-seq-4', text: 'text-white dark:text-foreground' },
    { bg: 'bg-seq-4', border: 'border-seq-5', text: 'text-white' },
    { bg: 'bg-seq-5', border: 'border-seq-5', text: 'text-white' },
  ] as Tone[],
};

function flatten(cells: CapabilityCell[]): CapabilityCell[] {
  return cells.flatMap((c) => [c, ...flatten(c.children)]);
}

function quantiles(values: number[]): number[] {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [0, 0, 0, 0];
  return [0.2, 0.4, 0.6, 0.8].map((q) => v[Math.floor(q * (v.length - 1))]!);
}

export function overlayTone(cell: CapabilityCell, overlay: MapOverlay, costQ: number[]): Tone {
  switch (overlay) {
    case 'health':
      return cell.health ? TONES[cell.health] : TONES.neutral;
    case 'coverage': {
      const n = cell.apps.length + cell.children.reduce((s, c) => s + c.apps.length, 0);
      if (n === 0) return TONES.act;
      return cell.apps.length >= 3 ? TONES.watch : TONES.good;
    }
    case 'cost': {
      if (!cell.cost) return TONES.neutral;
      const i = costQ.filter((q) => cell.cost > q).length;
      return TONES.seq[Math.min(4, i)]!;
    }
    case 'lifecycle': {
      const ending = cell.apps.filter(
        (a) => a.lifecycle === 'phase_out' || a.lifecycle === 'retired',
      ).length;
      if (!cell.apps.length) return TONES.neutral;
      return ending / cell.apps.length >= 0.5 ? TONES.act : ending > 0 ? TONES.watch : TONES.good;
    }
    case 'time': {
      const counts: Record<string, number> = {};
      for (const a of cell.apps) if (a.time) counts[a.time] = (counts[a.time] ?? 0) + 1;
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
      return top === 'invest'
        ? TONES.good
        : top === 'migrate'
          ? TONES.watch
          : top === 'eliminate'
            ? TONES.act
            : TONES.neutral;
    }
    case 'importance':
      return cell.importance === 'high'
        ? TONES.seq[3]!
        : cell.importance === 'medium'
          ? TONES.seq[1]!
          : TONES.neutral;
    case 'quality':
      return cell.quality >= 85 ? TONES.good : cell.quality >= 60 ? TONES.watch : TONES.act;
    default:
      return TONES.neutral;
  }
}

export function OverlayLegend({ overlay, costQ }: { overlay: MapOverlay; costQ: number[] }) {
  const item = (cls: string, label: string) => (
    <span key={label} className="flex items-center gap-1.5">
      <span className={cn('size-3 rounded border', cls)} /> {label}
    </span>
  );
  const legends: Partial<Record<MapOverlay, React.ReactNode[]>> = {
    health: [
      item('bg-good-soft border-good/40', 'Good'),
      item('bg-watch-soft border-watch/50', 'Watch'),
      item('bg-act-soft border-act/40', 'Act'),
      item('bg-surface-2 border-border', 'No applications or unknown'),
    ],
    coverage: [
      item('bg-act-soft border-act/40', 'Gap: no application'),
      item('bg-good-soft border-good/40', 'Covered'),
      item('bg-watch-soft border-watch/50', '3+ applications: possible overlap'),
    ],
    cost: [
      item('bg-seq-1 border-seq-2', `Up to ${formatMoney(costQ[0])}`),
      item('bg-seq-3 border-seq-4', 'Middle'),
      item('bg-seq-5 border-seq-5', `Over ${formatMoney(costQ[3])}`),
      item('bg-surface-2 border-border', 'No cost data'),
    ],
    lifecycle: [
      item('bg-good-soft border-good/40', 'Current'),
      item('bg-watch-soft border-watch/50', 'Some phasing out'),
      item('bg-act-soft border-act/40', 'Mostly phasing out'),
    ],
    time: [
      item('bg-good-soft border-good/40', 'Mostly invest'),
      item('bg-watch-soft border-watch/50', 'Mostly migrate'),
      item('bg-act-soft border-act/40', 'Mostly eliminate'),
      item('bg-surface-2 border-border', 'Tolerate or not rated'),
    ],
    importance: [
      item('bg-seq-4 border-seq-5', 'High'),
      item('bg-seq-2 border-seq-3', 'Medium'),
      item('bg-surface-2 border-border', 'Low or not set'),
    ],
    quality: [
      item('bg-good-soft border-good/40', 'Complete'),
      item('bg-watch-soft border-watch/50', 'Partly'),
      item('bg-act-soft border-act/40', 'Mostly missing'),
    ],
  };
  const items = legends[overlay];
  if (!items) return null;
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">{items}</div>
  );
}

function appsTooltip(cell: CapabilityCell) {
  if (!cell.apps.length) return cell.children.length ? null : 'No application supports this yet';
  return (
    <div className="flex flex-col gap-0.5">
      {cell.apps.slice(0, 8).map((a) => (
        <span key={a.id} className="flex items-center gap-1.5">
          <HealthDot health={a.health} /> {a.name}
          {a.time ? <span className="opacity-60">· {enumLabel(a.time)}</span> : null}
        </span>
      ))}
      {cell.apps.length > 8 && <span className="opacity-60">and {cell.apps.length - 8} more</span>}
    </div>
  );
}

function Leaf({
  cell,
  overlay,
  costQ,
}: {
  cell: CapabilityCell;
  overlay: MapOverlay;
  costQ: number[];
}) {
  const tone = overlayTone(cell, overlay, costQ);
  return (
    <Tooltip content={appsTooltip(cell)} side="right">
      <button
        type="button"
        onClick={() => inspect(cell.id)}
        className={cn(
          'flex min-h-[40px] w-full flex-col justify-center gap-0.5 rounded-lg border px-2.5 py-1.5 text-left text-[12px] leading-tight font-medium transition hover:-translate-y-px hover:shadow-md',
          tone.bg,
          tone.border,
          tone.text,
        )}
      >
        <span className="flex items-start gap-1">
          <span className="flex-1">{cell.name}</span>
          <MarkBadge mark={cell.mark} />
        </span>
        {cell.apps.length > 0 && (
          <span className="flex items-center gap-0.5">
            {cell.apps.slice(0, 10).map((a) => (
              <HealthDot key={a.id} health={a.health} className="size-1.5" />
            ))}
            <span className="ml-1 text-[10px] font-normal opacity-70">{cell.apps.length}</span>
          </span>
        )}
      </button>
    </Tooltip>
  );
}

function Level2({
  cell,
  overlay,
  costQ,
}: {
  cell: CapabilityCell;
  overlay: MapOverlay;
  costQ: number[];
}) {
  if (!cell.children.length) return <Leaf cell={cell} overlay={overlay} costQ={costQ} />;
  const tone = overlayTone(cell, overlay, costQ);
  return (
    <div className={cn('rounded-lg border p-1.5', tone.border, 'bg-surface')}>
      <button
        type="button"
        onClick={() => inspect(cell.id)}
        className="mb-1 flex w-full items-center gap-1.5 px-1 text-left text-[12px] font-semibold hover:underline"
      >
        <span className={cn('size-2 rounded-sm', tone.bg, 'border', tone.border)} />
        {cell.name}
        <MarkBadge mark={cell.mark} />
      </button>
      <div className="grid gap-1">
        {cell.children.map((c) => (
          <Leaf key={c.id} cell={c} overlay={overlay} costQ={costQ} />
        ))}
      </div>
    </div>
  );
}

export function CapabilityMap({
  data,
  overlay,
  q,
}: {
  data: CapabilityMapData;
  overlay: MapOverlay;
  q?: string;
}) {
  const costQ = useMemo(() => quantiles(flatten(data.roots).map((c) => c.cost)), [data]);
  const needle = q?.toLowerCase();
  const roots = needle
    ? data.roots.filter((r) =>
        flatten([r]).some(
          (c) =>
            c.name.toLowerCase().includes(needle) ||
            c.apps.some((a) => a.name.toLowerCase().includes(needle)),
        ),
      )
    : data.roots;
  return (
    <div className="flex flex-col gap-4">
      <OverlayLegend overlay={overlay} costQ={costQ} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] items-start gap-4">
        {roots.map((root) => (
          <section
            key={root.id}
            className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3 shadow-sm"
          >
            <button
              type="button"
              onClick={() => inspect(root.id)}
              className="group flex flex-col gap-0.5 px-1 text-left"
            >
              {root.domainName && (
                <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {root.domainName}
                </span>
              )}
              <span className="flex items-center gap-2 text-[14px] font-semibold tracking-tight group-hover:underline">
                {root.name}
                <MarkBadge mark={root.mark} />
              </span>
              <span className="text-[11px] text-muted-foreground tabular">
                {flatten([root]).reduce((s, c) => s + c.apps.length, 0)} application links
                {root.cost ? ` · ${formatMoney(root.cost)}/yr` : ''}
              </span>
            </button>
            <div className="grid gap-1.5">
              {root.children.map((c) => (
                <Level2 key={c.id} cell={c} overlay={overlay} costQ={costQ} />
              ))}
              {root.children.length === 0 && <Leaf cell={root} overlay={overlay} costQ={costQ} />}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function CapabilityMapView({ overlay, q }: { overlay: MapOverlay; q?: string }) {
  const { data, isLoading } = useCapabilityMap();
  return (
    <div className="h-full overflow-auto px-6 py-5" id="capability-map">
      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      ) : !data?.roots.length ? (
        <EmptyState
          icon={<Blocks />}
          title="No capabilities yet"
          className="mt-16"
          action={
            <button
              type="button"
              className="text-[13px] font-medium text-primary hover:underline"
              onClick={() => openAdd('capability')}
            >
              Add your first capability
            </button>
          }
        >
          Capabilities describe what the business does. Start with five to ten top-level ones.
        </EmptyState>
      ) : (
        <CapabilityMap data={data} overlay={overlay} q={q} />
      )}
    </div>
  );
}
