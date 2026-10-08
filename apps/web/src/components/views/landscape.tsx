import {
  type ElementType,
  enumLabel,
  type GraphNode,
  type MapOverlay,
  typeDef,
} from '@atrium/schema';
import { cn, EmptyState, formatMoney, HealthDot, MarkBadge, Skeleton } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid } from 'lucide-react';
import { useMemo } from 'react';
import { api } from '../../lib/api';
import { useScenario } from '../../lib/queries';
import { inspect, useUi } from '../../lib/store';
import { OverlayLegend } from './capability-map';

interface Group {
  id: string | null;
  name: string;
  items: GraphNode[];
}

function tone(n: GraphNode, overlay: MapOverlay, costQ: number[]): string {
  switch (overlay) {
    case 'health':
      return n.health === 'good'
        ? 'bg-good-soft border-good/40'
        : n.health === 'watch'
          ? 'bg-watch-soft border-watch/50'
          : n.health === 'act'
            ? 'bg-act-soft border-act/40'
            : 'bg-surface-2 border-border';
    case 'cost': {
      const c = Number(n.attributes.annual_cost ?? 0);
      if (!c) return 'bg-surface-2 border-border';
      const i = costQ.filter((q) => c > q).length;
      return [
        'bg-seq-1 border-seq-2',
        'bg-seq-2 border-seq-3',
        'bg-seq-3 border-seq-4 text-white dark:text-foreground',
        'bg-seq-4 border-seq-5 text-white',
        'bg-seq-5 border-seq-5 text-white',
      ][i]!;
    }
    case 'lifecycle':
      return n.lifecycle === 'active'
        ? 'bg-good-soft border-good/40'
        : n.lifecycle === 'phase_out'
          ? 'bg-watch-soft border-watch/50'
          : n.lifecycle === 'retired'
            ? 'bg-act-soft border-act/40 line-through'
            : n.lifecycle === 'plan' || n.lifecycle === 'build'
              ? 'bg-primary-soft border-primary/30'
              : 'bg-surface-2 border-border';
    case 'time': {
      const t = n.attributes.time as string;
      return t === 'invest'
        ? 'bg-good-soft border-good/40'
        : t === 'migrate'
          ? 'bg-watch-soft border-watch/50'
          : t === 'eliminate'
            ? 'bg-act-soft border-act/40'
            : 'bg-surface-2 border-border';
    }
    default:
      return 'bg-surface border-border';
  }
}

export function LandscapeView({
  type,
  overlay,
  q,
  health,
}: {
  type: ElementType;
  overlay: MapOverlay;
  q?: string;
  health?: string;
}) {
  const scenario = useScenario();
  const at = useUi((s) => s.at) ?? undefined;
  const { data, isLoading } = useQuery({
    queryKey: ['model', 'landscape', scenario, at, type],
    queryFn: () => api<Group[]>('/views/landscape', { query: { scenario, at, type } }),
  });
  const costQ = useMemo(() => {
    const v = (data ?? [])
      .flatMap((g) => g.items.map((i) => Number(i.attributes.annual_cost ?? 0)))
      .filter(Boolean)
      .sort((a, b) => a - b);
    return v.length
      ? [0.2, 0.4, 0.6, 0.8].map((x) => v[Math.floor(x * (v.length - 1))]!)
      : [0, 0, 0, 0];
  }, [data]);
  const needle = q?.toLowerCase();
  const groups = (data ?? [])
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          (!needle || i.name.toLowerCase().includes(needle)) &&
          (!health || (health === 'unknown' ? !i.health : i.health === health)),
      ),
    }))
    .filter((g) => g.items.length);

  if (isLoading)
    return (
      <div className="grid gap-4 p-6 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    );
  if (!groups.length)
    return (
      <EmptyState icon={<LayoutGrid />} title="Nothing to show" className="mt-16">
        Try another filter or date.
      </EmptyState>
    );

  return (
    <div className="h-full overflow-auto px-6 py-5">
      <div className="mb-4">
        <OverlayLegend
          overlay={overlay === 'coverage' || overlay === 'importance' ? 'health' : overlay}
          costQ={costQ}
        />
      </div>
      <div className="columns-1 gap-4 lg:columns-2 2xl:columns-3">
        {groups.map((g) => (
          <section
            key={g.id ?? 'none'}
            className="mb-4 break-inside-avoid rounded-2xl border border-border bg-surface p-4 shadow-sm"
          >
            <header className="mb-3 flex items-baseline justify-between gap-2">
              <button
                type="button"
                className="text-[14px] font-semibold tracking-tight hover:underline disabled:no-underline"
                disabled={!g.id}
                onClick={() => g.id && inspect(g.id)}
              >
                {g.name}
              </button>
              <span className="text-[11px] text-muted-foreground tabular">
                {g.items.length}{' '}
                {g.items.length === 1
                  ? typeDef(type).label.toLowerCase()
                  : typeDef(type).plural.toLowerCase()}
                {type === 'application'
                  ? ` · ${formatMoney(g.items.reduce((s, i) => s + Number(i.attributes.annual_cost ?? 0), 0))}`
                  : ''}
              </span>
            </header>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
              {g.items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => inspect(n.id)}
                  className={cn(
                    'flex min-h-[56px] flex-col justify-between gap-1 rounded-lg border px-2.5 py-2 text-left transition hover:-translate-y-px hover:shadow-md',
                    tone(n, overlay, costQ),
                  )}
                >
                  <span className="flex items-start gap-1.5">
                    <span className="line-clamp-2 flex-1 text-[12px] leading-tight font-semibold">
                      {n.name}
                    </span>
                    {overlay !== 'health' && (type === 'application' || type === 'technology') && (
                      <HealthDot health={n.health} className="mt-1" />
                    )}
                  </span>
                  <span className="flex items-center gap-1 truncate text-[10.5px] opacity-75">
                    <MarkBadge mark={n.mark} />
                    {type === 'technology'
                      ? n.attributes.version
                        ? `v${n.attributes.version}`
                        : ''
                      : (n.attributes.vendor as string) ||
                        enumLabel(n.attributes.hosting as string)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
