import { enumLabel, type Health, LIFECYCLE_PHASES, type LifecyclePhase } from '@atrium/schema';
import {
  Button,
  Card,
  cn,
  EmptyState,
  formatDate,
  formatMoney,
  HealthDot,
  MarkBadge,
  Segmented,
  Skeleton,
  Switch,
  Tooltip,
  TypeIcon,
  toast,
} from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useScenario } from '../lib/queries';
import { inspect } from '../lib/store';

interface RoadmapData {
  initiatives: Array<{
    id: string;
    name: string;
    status: string | null;
    start: string | null;
    end: string | null;
    progress: number | null;
    budget: number | null;
    owner: string | null;
    mark?: 'added' | 'changed' | 'removed';
    impacts: Array<{ id: string; name: string; type: string }>;
  }>;
  lifecycles: Array<{
    id: string;
    name: string;
    type: 'application' | 'technology';
    domainName: string | null;
    lifecycle: LifecyclePhase | null;
    dates: Partial<Record<LifecyclePhase, string>>;
    health: Health | null;
    mark?: 'added' | 'changed' | 'removed';
  }>;
}

const PHASE_CLASS: Record<LifecyclePhase, string> = {
  plan: 'bg-layer-strategy-soft border-layer-strategy/40',
  build: 'bg-primary-soft border-primary/40',
  active: 'bg-good-soft border-good/40',
  phase_out: 'bg-watch-soft border-watch/50',
  retired: 'bg-surface-3 border-border',
};

const STATUS_CLASS: Record<string, string> = {
  running: 'bg-primary text-primary-foreground',
  planned: 'bg-primary-soft text-primary-soft-foreground border border-primary/30',
  done: 'bg-good-soft text-good-foreground',
  on_hold: 'bg-watch-soft text-watch-foreground',
  cancelled: 'bg-surface-3 text-muted-foreground line-through',
};

function toTime(iso: string) {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
}

export function RoadmapPage() {
  const scenario = useScenario();
  const { data, isLoading } = useQuery({
    queryKey: ['model', 'roadmap', scenario],
    queryFn: () => api<RoadmapData>('/views/roadmap', { query: { scenario } }),
  });
  const year = new Date().getUTCFullYear();
  const [span, setSpan] = useState<'3' | '5' | '8'>('5');
  const [onlyChanging, setOnlyChanging] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const start = toTime(`${year - 1}-01-01`);
  const end = toTime(`${year - 1 + Number(span)}-01-01`);
  const pct = (iso: string | null | undefined, fallback: number) => {
    const t = iso ? toTime(iso) : fallback;
    return Math.max(0, Math.min(100, ((t - start) / (end - start)) * 100));
  };
  const today = pct(new Date().toISOString(), start);
  const years = Array.from({ length: Number(span) }, (_, i) => year - 1 + i);

  const groups = useMemo(() => {
    const apps = (data?.lifecycles ?? []).filter((l) => l.type === 'application');
    const filtered = onlyChanging
      ? apps.filter((a) =>
          Object.values(a.dates).some(
            (d) =>
              d &&
              toTime(d) >= start &&
              toTime(d) <= end &&
              (d >= `${year}` || a.dates.retired || a.dates.phase_out),
          ),
        )
      : apps;
    const map = new Map<string, typeof apps>();
    for (const a of filtered)
      map.set(a.domainName ?? 'No domain', [...(map.get(a.domainName ?? 'No domain') ?? []), a]);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data, onlyChanging, start, end, year]);

  const techs = (data?.lifecycles ?? []).filter(
    (l) =>
      l.type === 'technology' &&
      l.dates.retired &&
      toTime(l.dates.retired) >= start &&
      toTime(l.dates.retired) <= end,
  );

  const exportPptx = async () => {
    if (!data) return;
    const color = (s: string | null) =>
      ({
        running: '#4f46e5',
        planned: '#a5b4fc',
        done: '#2f9e7a',
        on_hold: '#e0a526',
        cancelled: '#c7cbd4',
      })[s ?? 'planned'] ?? '#a5b4fc';
    const phaseColor: Record<string, string> = {
      plan: '#c4b5fd',
      build: '#a5b4fc',
      active: '#86efac',
      phase_out: '#fcd34d',
      retired: '#e5e7eb',
    };
    const lanes = [
      {
        name: 'Initiatives',
        bars: data.initiatives
          .filter((i) => i.start && i.end)
          .map((i) => ({ label: i.name, start: i.start!, end: i.end!, color: color(i.status) })),
      },
      ...groups.slice(0, 6).map(([name, apps]) => ({
        name,
        bars: apps.flatMap((a) => {
          const phases = LIFECYCLE_PHASES.filter((p) => a.dates[p]);
          return phases.map((p, i) => ({
            label: `${a.name}: ${enumLabel(p)}`,
            start: a.dates[p]!,
            end: a.dates[phases[i + 1]!] ?? `${year - 1 + Number(span)}-01-01`,
            color: phaseColor[p]!,
          }));
        }),
      })),
    ];
    try {
      const res = await fetch('/api/v1/export/dashboard', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-atrium-csrf': '1' },
        body: JSON.stringify({
          title: 'Roadmap',
          slides: [
            {
              kind: 'roadmap',
              title: 'Roadmap',
              start: `${year - 1}-01-01`,
              end: `${year - 1 + Number(span)}-01-01`,
              lanes,
            },
          ],
          scenario,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await res.blob());
      a.download = 'Roadmap.pptx';
      a.click();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const Axis = (
    <div className="relative h-8 border-b border-border">
      {years.map((y, i) => (
        <div
          key={y}
          className="absolute top-0 h-full border-l border-border pl-1.5 text-xs font-medium text-muted-foreground"
          style={{ left: `${(i / years.length) * 100}%`, width: `${100 / years.length}%` }}
        >
          {y}
          <div className="absolute bottom-0 left-0 flex w-full">
            {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
              <span key={q} className="flex-1 pl-1 text-[10px] text-muted-foreground">
                {Number(span) <= 5 ? q : ''}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const Grid = ({ children, height = 34 }: { children: React.ReactNode; height?: number }) => (
    <div className="relative" style={{ height }}>
      {years.map((y, i) => (
        <div
          key={y}
          className="absolute top-0 h-full border-l border-border/60"
          style={{ left: `${(i / years.length) * 100}%` }}
        />
      ))}
      <div className="absolute top-0 z-10 h-full w-px bg-act/70" style={{ left: `${today}%` }} />
      {children}
    </div>
  );

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-6 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <CalendarRange className="size-5 text-primary" />
        <h1 className="text-xl font-semibold tracking-tight">Roadmap</h1>
        <p className="text-[13px] text-muted-foreground">
          Initiatives and lifecycles over time. The red line is today.
        </p>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Switch checked={onlyChanging} onCheckedChange={setOnlyChanging} /> Only what changes
        </label>
        <Segmented
          size="md"
          value={span}
          onValueChange={setSpan}
          options={[
            { value: '3', label: '3 years' },
            { value: '5', label: '5 years' },
            { value: '8', label: '8 years' },
          ]}
        />
        <Button onClick={() => void exportPptx()}>
          <Download /> PowerPoint
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : !data?.initiatives.length && !data?.lifecycles.length ? (
        <EmptyState icon={<CalendarRange />} title="Nothing on the roadmap yet" className="mt-16">
          Add initiatives with start and end dates, or give applications lifecycle dates.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[280px_1fr]">
            <div className="sticky left-0 border-r border-border bg-surface" />
            {Axis}
            <div className="border-r border-b border-border bg-surface-2/60 px-4 py-2 text-xs font-semibold">
              Initiatives
            </div>
            <div className="border-b border-border bg-surface-2/60" />
            {data.initiatives.map((i) => (
              <div key={i.id} className="contents">
                <button
                  type="button"
                  onClick={() => inspect(i.id)}
                  className="flex items-center gap-2 border-r border-border px-4 text-left text-[13px] hover:bg-surface-2"
                >
                  <TypeIcon type="initiative" size="xs" />
                  <span className="truncate">{i.name}</span>
                  <MarkBadge mark={i.mark} />
                </button>
                <Grid>
                  {i.start && i.end && (
                    <Tooltip
                      content={`${formatDate(i.start)} – ${formatDate(i.end)} · ${enumLabel(i.status)}${i.budget ? ` · ${formatMoney(i.budget)}` : ''} · changes ${i.impacts.length} elements`}
                    >
                      <button
                        type="button"
                        onClick={() => inspect(i.id)}
                        className={cn(
                          'absolute top-1.5 flex h-[22px] items-center overflow-hidden rounded-md px-2 text-[11px] font-medium shadow-sm',
                          STATUS_CLASS[i.status ?? 'planned'],
                        )}
                        style={{
                          left: `${pct(i.start, start)}%`,
                          width: `${Math.max(1, pct(i.end, end) - pct(i.start, start))}%`,
                        }}
                      >
                        {i.progress ? (
                          <span
                            className="absolute bottom-0 left-0 h-[3px] bg-current opacity-60"
                            style={{ width: `${i.progress}%` }}
                          />
                        ) : null}
                        <span className="relative truncate">{i.name}</span>
                      </button>
                    </Tooltip>
                  )}
                </Grid>
              </div>
            ))}
            {groups.map(([domain, apps]) => (
              <div key={domain} className="contents">
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [domain]: !c[domain] }))}
                  className="flex items-center gap-1.5 border-t border-r border-b border-border bg-surface-2/60 px-4 py-2 text-left text-xs font-semibold"
                >
                  {collapsed[domain] ? (
                    <ChevronRight className="size-3.5" />
                  ) : (
                    <ChevronDown className="size-3.5" />
                  )}
                  {domain}{' '}
                  <span className="font-normal text-muted-foreground">· {apps.length}</span>
                </button>
                <div className="border-t border-b border-border bg-surface-2/60" />
                {!collapsed[domain] &&
                  apps.map((a) => {
                    const phases = LIFECYCLE_PHASES.filter((p) => a.dates[p]);
                    return (
                      <div key={a.id} className="contents">
                        <button
                          type="button"
                          onClick={() => inspect(a.id)}
                          className="flex items-center gap-2 border-r border-border px-4 text-left text-[13px] hover:bg-surface-2"
                        >
                          <HealthDot health={a.health} />
                          <span className="truncate">{a.name}</span>
                          <MarkBadge mark={a.mark} />
                        </button>
                        <Grid height={30}>
                          {phases.map((p, idx) => {
                            const from = a.dates[p]!;
                            const to = phases[idx + 1]
                              ? a.dates[phases[idx + 1]!]
                              : p === 'retired'
                                ? from
                                : undefined;
                            const left = pct(from, start);
                            const right = to ? pct(to, end) : 100;
                            if (p === 'retired') {
                              return (
                                <Tooltip key={p} content={`Retired ${formatDate(from)}`}>
                                  <span
                                    className="absolute top-2 size-3.5 -translate-x-1/2 rotate-45 rounded-sm border-2 border-act bg-surface"
                                    style={{ left: `${left}%` }}
                                  />
                                </Tooltip>
                              );
                            }
                            if (right <= 0 || left >= 100) return null;
                            return (
                              <Tooltip key={p} content={`${enumLabel(p)} from ${formatDate(from)}`}>
                                <span
                                  className={cn(
                                    'absolute top-1.5 h-[18px] border',
                                    idx === 0 ? 'rounded-l-md' : '',
                                    !to || phases[idx + 1] === 'retired' ? 'rounded-r-md' : '',
                                    PHASE_CLASS[p],
                                  )}
                                  style={{
                                    left: `${left}%`,
                                    width: `${Math.max(0.4, right - left)}%`,
                                  }}
                                />
                              </Tooltip>
                            );
                          })}
                        </Grid>
                      </div>
                    );
                  })}
              </div>
            ))}
            {techs.length > 0 && (
              <>
                <div className="border-t border-r border-b border-border bg-surface-2/60 px-4 py-2 text-xs font-semibold">
                  Technology end of life
                </div>
                <div className="border-t border-b border-border bg-surface-2/60" />
                <div className="flex items-center border-r border-border px-4 text-[13px] text-muted-foreground">
                  {techs.length} technologies
                </div>
                <Grid height={44}>
                  {techs.map((t, i) => (
                    <Tooltip
                      key={t.id}
                      content={`${t.name}: end of life ${formatDate(t.dates.retired)}`}
                    >
                      <button
                        type="button"
                        aria-label={`${t.name}: end of life ${formatDate(t.dates.retired)}`}
                        onClick={() => inspect(t.id)}
                        className="absolute flex -translate-x-1/2 flex-col items-center"
                        style={{ left: `${pct(t.dates.retired, start)}%`, top: i % 2 ? 22 : 4 }}
                      >
                        <span
                          className={cn(
                            'size-3 rotate-45 rounded-sm',
                            t.dates.retired! < new Date().toISOString() ? 'bg-act' : 'bg-watch',
                          )}
                        />
                      </button>
                    </Tooltip>
                  ))}
                </Grid>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            {(['plan', 'build', 'active', 'phase_out'] as const).map((p) => (
              <span key={p} className="flex items-center gap-1.5">
                <span className={cn('h-2.5 w-5 rounded border', PHASE_CLASS[p])} /> {enumLabel(p)}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rotate-45 rounded-sm border-2 border-act" /> Retired
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
