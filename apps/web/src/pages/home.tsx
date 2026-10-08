import { enumLabel, type Health } from '@atrium/schema';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  formatDate,
  formatMoney,
  HEALTH_CLASSES,
  HealthDot,
  Progress,
  Segmented,
  Skeleton,
  Stat,
  TypeIcon,
  timeAgo,
} from '@atrium/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  Bot,
  Building2,
  CircleAlert,
  FileSpreadsheet,
  Gauge,
  Layers3,
  ListChecks,
  Rocket,
  Sparkles,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { useMemo } from 'react';
import { EChart, type EChartsOption, usePalette } from '../components/charts/echart';
import { api } from '../lib/api';
import { useChangesets, useChangesSummary } from '../lib/changes';
import { type Overview, useOverview } from '../lib/overview';
import { useInvalidateModel, useMe, useWorkspace } from '../lib/queries';
import { inspect, openAdd, openImport, ui } from '../lib/store';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function HomePage() {
  const me = useMe().data;
  const ws = useWorkspace().data;
  const qc = useQueryClient();
  const role = me?.homeRole ?? 'architect';
  const setRole = useMutation({
    mutationFn: (homeRole: string) => api('/me', { method: 'PATCH', body: { homeRole } }),
    onMutate: (homeRole) => qc.setQueryData(['me'], { ...me, homeRole }),
  });
  const firstName = me?.name && me.name !== 'You' ? me.name.split(' ')[0] : null;

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-6 px-6 py-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-muted-foreground">
            {formatDate(new Date().toISOString())} · {ws?.name}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
        </div>
        {ws?.hasData && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Show me the view for</span>
            <Segmented
              value={role === 'admin' || role === 'viewer' ? 'architect' : role}
              onValueChange={(v) => setRole.mutate(v)}
              options={[
                { value: 'architect', label: 'Architects' },
                { value: 'manager', label: 'Managers' },
                { value: 'engineer', label: 'Engineers' },
              ]}
            />
          </div>
        )}
      </header>
      {!ws?.hasData ? (
        <Onboarding />
      ) : role === 'manager' ? (
        <ManagerHome />
      ) : role === 'engineer' ? (
        <EngineerHome />
      ) : (
        <ArchitectHome />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onboarding (journey J1: first map in under 5 minutes)               */
/* ------------------------------------------------------------------ */

function Onboarding() {
  const navigate = useNavigate();
  const invalidate = useInvalidateModel();
  const sample = useMutation({
    mutationFn: () => api<{ elements: number }>('/onboarding/sample', { method: 'POST' }),
    onSuccess: () => {
      invalidate();
      navigate({ to: '/explore', search: { type: 'capability', view: 'map', overlay: 'health' } });
    },
  });
  return (
    <div className="flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <Badge tone="primary" className="mb-3">
            <Sparkles /> Welcome to Atrium
          </Badge>
          <h2 className="text-xl font-semibold tracking-tight">
            One living map of how your organization works
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            Capabilities, applications, data and technology, and how they connect. Architects keep
            it right, managers use it to decide, and engineers and their AI assistants build with
            it. Pick a way to start; you can always change your mind.
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StartCard
          icon={<Building2 />}
          title="Explore a sample"
          text="Acme Telco: a realistic telecom landscape with 65 applications, a target state and open suggestions."
          action={
            <Button variant="primary" onClick={() => sample.mutate()} disabled={sample.isPending}>
              {sample.isPending ? 'Loading…' : 'Load the sample'} <ArrowRight />
            </Button>
          }
          recommended
        />
        <StartCard
          icon={<FileSpreadsheet />}
          title="Bring your own spreadsheet"
          text="Drop an Excel or CSV file with applications or capabilities. Atrium recognises the columns for you."
          action={
            <Button onClick={() => openImport()}>
              Choose a file <ArrowRight />
            </Button>
          }
        />
        <StartCard
          icon={<Layers3 />}
          title="Start from scratch"
          text="Begin with your top-level capabilities. Press N anywhere to add something."
          action={
            <Button onClick={() => openAdd('capability')}>
              Add a capability <ArrowRight />
            </Button>
          }
        />
      </div>
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Bot className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">Using an AI coding assistant?</p>
          <p className="text-[13px] text-muted-foreground">
            Connect it so it can read your architecture and standards while it writes code.
          </p>
        </div>
        <Button onClick={() => ui.set({ connectAgentOpen: true })}>Connect coding agent</Button>
      </Card>
    </div>
  );
}

function StartCard({
  icon,
  title,
  text,
  action,
  recommended,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action: React.ReactNode;
  recommended?: boolean;
}) {
  return (
    <Card
      className={cn(
        'flex flex-col gap-3 p-5',
        recommended && 'border-primary/40 ring-1 ring-primary/20',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-foreground [&_svg]:size-5">
          {icon}
        </span>
        {recommended && <Badge tone="primary">Quickest</Badge>}
      </div>
      <div className="flex-1">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{text}</p>
      </div>
      <div>{action}</div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                          */
/* ------------------------------------------------------------------ */

function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ListRow({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2"
    >
      {children}
    </button>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[92px] rounded-xl" />
      ))}
    </div>
  );
}

function GapsList({ data }: { data: Overview }) {
  return (
    <div className="flex flex-col">
      {data.quality.gaps.map((g) => (
        <ListRow key={g.id} onClick={() => inspect(g.id)}>
          <TypeIcon type={g.type} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{g.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              Missing {g.missing.slice(0, 3).join(', ').toLowerCase()}
              {g.missing.length > 3 ? ` and ${g.missing.length - 3} more` : ''}
            </span>
          </span>
          <span className="w-20">
            <Progress
              value={g.quality}
              tone={g.quality >= 85 ? 'good' : g.quality >= 60 ? 'watch' : 'act'}
            />
          </span>
        </ListRow>
      ))}
      {data.quality.gaps.length === 0 && (
        <p className="py-4 text-center text-[13px] text-muted-foreground">
          Everything is complete. Nicely done.
        </p>
      )}
    </div>
  );
}

function RiskList({ data, limit = 6 }: { data: Overview; limit?: number }) {
  return (
    <div className="flex flex-col">
      {data.risks.slice(0, limit).map((r) => (
        <ListRow key={r.id} onClick={() => inspect(r.id)}>
          <HealthDot health={r.health} className="size-2.5" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{r.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {r.reasons[0] ?? 'Needs attention'}
            </span>
          </span>
          <span className="text-xs text-muted-foreground tabular">
            {r.cost ? formatMoney(r.cost) : ''}
          </span>
        </ListRow>
      ))}
      {data.risks.length === 0 && (
        <p className="py-4 text-center text-[13px] text-muted-foreground">No risks found.</p>
      )}
    </div>
  );
}

function EolList({ data, limit = 6 }: { data: Overview; limit?: number }) {
  return (
    <div className="flex flex-col">
      {data.eol.slice(0, limit).map((t) => (
        <ListRow key={t.id} onClick={() => inspect(t.id)}>
          <TypeIcon type="technology" size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{t.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {t.apps.length} application{t.apps.length === 1 ? '' : 's'}:{' '}
              {t.apps
                .slice(0, 3)
                .map((a) => a.name)
                .join(', ')}
            </span>
          </span>
          <Badge tone={t.past ? 'act' : 'watch'}>
            {t.past ? 'Ended' : 'Ends'} {formatDate(t.eolDate)}
          </Badge>
        </ListRow>
      ))}
      {data.eol.length === 0 && (
        <p className="py-4 text-center text-[13px] text-muted-foreground">
          Nothing reaches end of life within a year.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Architect                                                            */
/* ------------------------------------------------------------------ */

function ArchitectHome() {
  const { data } = useOverview();
  const summary = useChangesSummary().data;
  const open = useChangesets({ status: 'open', limit: 5 }).data ?? [];
  const recent = useChangesets({ status: 'applied', limit: 6 }).data ?? [];
  const navigate = useNavigate();
  if (!data) return <StatsSkeleton />;
  const total = Object.values(data.counts).reduce((s, n) => s + (n ?? 0), 0);
  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat
          label="In the model"
          value={total.toLocaleString('en-GB')}
          hint={`${data.counts.application ?? 0} applications, ${data.counts.capability ?? 0} capabilities`}
          icon={<Layers3 />}
          onClick={() => navigate({ to: '/explore' })}
        />
        <Stat
          label="Data quality"
          value={`${data.quality.average}%`}
          hint={`${data.quality.total - data.quality.complete} elements have gaps`}
          tone={data.quality.average >= 85 ? 'good' : data.quality.average >= 60 ? 'watch' : 'act'}
          icon={<ListChecks />}
          onClick={() => navigate({ to: '/explore', search: { gaps: true, type: 'application' } })}
        />
        <Stat
          label="Waiting for review"
          value={summary?.waitingForReview ?? 0}
          hint="Suggestions from people and agents"
          icon={<Sparkles />}
          tone={summary?.waitingForReview ? 'primary' : undefined}
          onClick={() => navigate({ to: '/changes' })}
        />
        <Stat
          label="Need attention"
          value={data.applications.health.act}
          hint={`${data.applications.health.watch} more to watch`}
          tone="act"
          icon={<TriangleAlert />}
          onClick={() =>
            navigate({ to: '/explore', search: { type: 'application', health: 'act' } })
          }
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title="Fill the gaps"
          description="The elements missing the most information"
          className="lg:col-span-2"
          action={
            <Button
              size="sm"
              variant="soft"
              onClick={() =>
                navigate({ to: '/explore', search: { gaps: true, type: 'application' } })
              }
            >
              Fill the gaps <ArrowRight />
            </Button>
          }
        >
          <GapsList data={data} />
        </Section>
        <Section
          title="Waiting for review"
          action={
            <Button size="sm" variant="ghost" onClick={() => navigate({ to: '/changes' })}>
              All
            </Button>
          }
        >
          <div className="flex flex-col">
            {open.map((c) => (
              <ListRow
                key={c.id}
                onClick={() => navigate({ to: '/changes', search: { id: c.id } })}
              >
                {c.authorKind === 'agent' ? (
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <Bot className="size-3.5" />
                  </span>
                ) : (
                  <Avatar name={c.authorName ?? '?'} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {c.authorName} · {c.changeCount} change{c.changeCount === 1 ? '' : 's'} ·{' '}
                    {timeAgo(c.submittedAt ?? c.createdAt)}
                  </span>
                </span>
              </ListRow>
            ))}
            {open.length === 0 && (
              <p className="py-4 text-center text-[13px] text-muted-foreground">
                Nothing to review.
              </p>
            )}
          </div>
        </Section>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title="Capability coverage"
          description="Capabilities without an application, and possible overlap"
        >
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="text-xl font-semibold tabular">
                {data.capabilities.withoutApps.length}
              </div>
              <div className="text-xs text-muted-foreground">Gaps</div>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="text-xl font-semibold tabular">
                {data.capabilities.overlaps.length}
              </div>
              <div className="text-xs text-muted-foreground">3+ applications</div>
            </div>
          </div>
          {data.capabilities.overlaps.slice(0, 3).map((o) => (
            <ListRow key={o.id} onClick={() => inspect(o.id)}>
              <TypeIcon type="capability" size="sm" />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              <Badge tone="watch">{o.apps.length} apps</Badge>
            </ListRow>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() =>
              navigate({
                to: '/explore',
                search: { type: 'capability', view: 'map', overlay: 'coverage' },
              })
            }
          >
            Open the capability map <ArrowRight />
          </Button>
        </Section>
        <Section title="End of life" description="Technologies past or near end of support">
          <EolList data={data} limit={5} />
        </Section>
        <Section title="Recently changed">
          <div className="flex flex-col">
            {recent.map((c) => (
              <ListRow
                key={c.id}
                onClick={() => navigate({ to: '/changes', search: { id: c.id, tab: 'history' } })}
              >
                <Avatar name={c.authorName ?? '?'} size="sm" />
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className="text-[11px] text-muted-foreground">
                  {timeAgo(c.decidedAt ?? c.createdAt)}
                </span>
              </ListRow>
            ))}
            {recent.length === 0 && (
              <p className="py-4 text-center text-[13px] text-muted-foreground">No changes yet.</p>
            )}
          </div>
        </Section>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Manager                                                              */
/* ------------------------------------------------------------------ */

function ManagerHome() {
  const { data } = useOverview();
  const p = usePalette();
  const navigate = useNavigate();

  const healthOption = useMemo<EChartsOption | null>(() => {
    if (!data) return null;
    const h = data.applications.health;
    const items: Array<{ name: string; value: number; key: Health | 'unknown' }> = [
      { name: 'Good', value: h.good, key: 'good' },
      { name: 'Watch', value: h.watch, key: 'watch' },
      { name: 'Act', value: h.act, key: 'act' },
      { name: 'Unknown', value: h.unknown, key: 'unknown' },
    ];
    const color = { good: p.good, watch: p.watch, act: p.act, unknown: p.unknown };
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [
        {
          type: 'pie',
          radius: ['62%', '86%'],
          padAngle: 2,
          itemStyle: { borderRadius: 6 },
          label: {
            show: true,
            position: 'center',
            formatter: () =>
              `${Math.round((h.good / Math.max(1, data.applications.total)) * 100)}%\nhealthy`,
            fontSize: 18,
            fontWeight: 600,
            color: p.text,
            lineHeight: 22,
          },
          data: items
            .filter((i) => i.value > 0)
            .map((i) => ({ name: i.name, value: i.value, itemStyle: { color: color[i.key] } })),
        },
      ],
    };
  }, [data, p]);

  const costOption = useMemo<EChartsOption | null>(() => {
    if (!data) return null;
    const rows = [...data.applications.byDomain].reverse();
    return {
      grid: { left: 8, right: 56, top: 4, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (v: number) => formatMoney(v),
      },
      xAxis: { type: 'value', show: false },
      yAxis: { type: 'category', data: rows.map((r) => r.name), axisLabel: { color: p.muted } },
      series: [
        {
          type: 'bar',
          data: rows.map((r) => r.cost),
          barWidth: 14,
          itemStyle: { color: p.primary, borderRadius: [0, 6, 6, 0] },
          label: {
            show: true,
            position: 'right',
            color: p.muted,
            fontSize: 11,
            formatter: (v: { value: number }) => formatMoney(v.value),
          },
        },
      ],
    };
  }, [data, p]);

  const fitOption = useMemo<EChartsOption | null>(() => {
    if (!data) return null;
    const timeColor: Record<string, string> = {
      invest: p.good,
      tolerate: p.unknown,
      migrate: p.watch,
      eliminate: p.act,
    };
    const maxCost = Math.max(1, ...data.applications.fitScatter.map((d) => d.cost));
    const jitter = (id: string) => ((id.charCodeAt(0) + id.charCodeAt(5)) % 7) / 20 - 0.15;
    return {
      grid: { left: 36, right: 16, top: 16, bottom: 36 },
      tooltip: {
        formatter: (q: { data: { name: string; value: number[]; time: string } }) =>
          `<b>${q.data.name}</b><br/>Business fit ${Math.round(q.data.value[0]!)} · Technical fit ${Math.round(q.data.value[1]!)}<br/>${formatMoney(q.data.value[2]!)} · ${enumLabel(q.data.time) || 'No TIME rating'}`,
      },
      xAxis: {
        type: 'value',
        min: 0.5,
        max: 5.5,
        name: 'Business fit',
        nameLocation: 'middle',
        nameGap: 24,
        interval: 1,
      },
      yAxis: {
        type: 'value',
        min: 0.5,
        max: 5.5,
        name: 'Technical fit',
        nameLocation: 'middle',
        nameGap: 24,
        interval: 1,
      },
      series: [
        {
          type: 'scatter',
          symbolSize: (v: number[]) => 8 + Math.sqrt(v[2]! / maxCost) * 30,
          data: data.applications.fitScatter.map((d) => ({
            name: d.name,
            id: d.id,
            time: d.time,
            value: [d.business + jitter(d.id), d.technical + jitter(d.id.slice(3)), d.cost],
            itemStyle: {
              color: timeColor[d.time ?? ''] ?? p.primary,
              opacity: 0.8,
              borderColor: p.surface,
              borderWidth: 1,
            },
          })),
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: p.border, type: 'dashed' },
            data: [{ xAxis: 3 }, { yAxis: 3 }],
            label: { show: false },
          },
        },
      ],
    };
  }, [data, p]);

  if (!data) return <StatsSkeleton />;
  const healthyPct = Math.round(
    (data.applications.health.good / Math.max(1, data.applications.total)) * 100,
  );
  const eolPast = data.eol.filter((e) => e.past).length;
  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat
          label="Applications in use"
          value={data.applications.total}
          hint={`Across ${data.applications.byDomain.length} domains`}
          icon={<Layers3 />}
          onClick={() => navigate({ to: '/explore', search: { type: 'application' } })}
        />
        <Stat
          label="Annual run cost"
          value={formatMoney(data.applications.cost)}
          hint="Sum of application costs"
          icon={<Wallet />}
          onClick={() => navigate({ to: '/dashboards' })}
        />
        <Stat
          label="Healthy"
          value={`${healthyPct}%`}
          hint={`${data.applications.health.act} need action now`}
          tone={healthyPct >= 60 ? 'good' : 'watch'}
          icon={<Gauge />}
          onClick={() =>
            navigate({
              to: '/explore',
              search: { type: 'application', view: 'landscape', overlay: 'health' },
            })
          }
        />
        <Stat
          label="End-of-life exposure"
          value={data.eol.length}
          hint={`${eolPast} already unsupported`}
          tone={eolPast ? 'act' : 'watch'}
          icon={<CircleAlert />}
          onClick={() =>
            navigate({ to: '/explore', search: { type: 'technology', view: 'radar' } })
          }
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title="Portfolio health"
          description="Worked out from fit, technology and lifecycle"
        >
          {healthOption && (
            <EChart
              option={healthOption}
              height={220}
              ariaLabel="Portfolio health"
              onClick={(e) =>
                navigate({
                  to: '/explore',
                  search: { type: 'application', health: e.name.toLowerCase() },
                })
              }
            />
          )}
          <div className="mt-2 flex justify-center gap-4 text-xs text-muted-foreground">
            {(['good', 'watch', 'act'] as const).map((h) => (
              <span key={h} className="flex items-center gap-1.5">
                <span className={cn('size-2 rounded-full', HEALTH_CLASSES[h].dot)} /> {enumLabel(h)}{' '}
                {data.applications.health[h]}
              </span>
            ))}
          </div>
        </Section>
        <Section
          title="Where the money goes"
          description="Annual application cost per domain"
          className="lg:col-span-2"
        >
          {costOption && <EChart option={costOption} height={260} ariaLabel="Cost per domain" />}
        </Section>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title="Invest, tolerate, migrate or eliminate"
          description="Each bubble is an application; size shows cost"
          className="lg:col-span-2"
        >
          {fitOption && (
            <EChart
              option={fitOption}
              height={300}
              ariaLabel="Business and technical fit"
              onClick={(e) => inspect((e.data as { id: string }).id)}
            />
          )}
          <div className="mt-1 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
            {[
              ['invest', p.good],
              ['tolerate', p.unknown],
              ['migrate', p.watch],
              ['eliminate', p.act],
            ].map(([k, c]) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: c }} /> {enumLabel(k!)}
              </span>
            ))}
          </div>
        </Section>
        <Section
          title="Top risks"
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                navigate({ to: '/explore', search: { type: 'application', health: 'act' } })
              }
            >
              All
            </Button>
          }
        >
          <RiskList data={data} />
        </Section>
      </div>
      <Section
        title="Change in flight"
        description="Running and planned initiatives"
        action={
          <Button size="sm" variant="ghost" onClick={() => navigate({ to: '/roadmap' })}>
            Roadmap <ArrowRight />
          </Button>
        }
      >
        <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
          {data.initiatives
            .filter((i) => i.status !== 'done' && i.status !== 'cancelled')
            .slice(0, 8)
            .map((i) => (
              <ListRow key={i.id} onClick={() => inspect(i.id)}>
                <Rocket className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {enumLabel(i.status)} · {formatDate(i.start)} – {formatDate(i.end)}
                    {i.budget ? ` · ${formatMoney(i.budget)}` : ''}
                  </span>
                </span>
                <span className="w-24">
                  <Progress value={i.progress ?? 0} />
                </span>
              </ListRow>
            ))}
        </div>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Engineer                                                             */
/* ------------------------------------------------------------------ */

function EngineerHome() {
  const { data } = useOverview();
  const me = useMe().data;
  const navigate = useNavigate();
  if (!data) return <StatsSkeleton />;
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title="Your services"
          description={
            me?.teamIds.length
              ? 'Owned by your team'
              : 'Join a team in Settings to see your services here'
          }
          className="lg:col-span-2"
        >
          {data.myServices.length === 0 ? (
            <div className="flex flex-col items-start gap-2 py-2">
              <p className="text-[13px] text-muted-foreground">
                You aren't linked to a team yet, so here are the applications needing attention
                instead.
              </p>
              <RiskList data={data} limit={5} />
              <Button
                size="sm"
                variant="soft"
                onClick={() => navigate({ to: '/settings', search: { tab: 'profile' } })}
              >
                Choose my team
              </Button>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {data.myServices.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => inspect(s.id)}
                  className="flex flex-col gap-1.5 rounded-xl border border-border p-3 text-left transition hover:border-border-strong hover:shadow-sm"
                >
                  <span className="flex items-center gap-2">
                    <TypeIcon type={s.type} size="sm" />
                    <span className="flex-1 truncate text-[13px] font-semibold">{s.name}</span>
                    <HealthDot health={s.health} />
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Needs {s.dependsOn} · Needed by {s.usedBy} · {s.standards} standards
                  </span>
                  {s.reasons[0] && (
                    <span className="truncate text-[11px] text-act-foreground">{s.reasons[0]}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </Section>
        <Card className="flex flex-col gap-3 p-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Bot className="size-5" />
          </span>
          <div>
            <h3 className="text-[14px] font-semibold">Architecture in your editor</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Connect your coding agent. It reads service context and standards while it codes, and
              can suggest updates to the map.
            </p>
          </div>
          <Button variant="primary" onClick={() => ui.set({ connectAgentOpen: true })}>
            Connect coding agent
          </Button>
          <Link
            to="/settings"
            search={{ tab: 'agents' }}
            className="text-xs text-muted-foreground hover:underline"
          >
            Manage tokens
          </Link>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Technology to move off" description="Past or near end of life">
          <EolList data={data} />
        </Section>
        <Section
          title="Technology radar"
          description="What to adopt, try, assess or avoid"
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                navigate({ to: '/explore', search: { type: 'technology', view: 'radar' } })
              }
            >
              Open radar <ArrowRight />
            </Button>
          }
        >
          <div className="grid grid-cols-4 gap-3">
            {(['adopt', 'trial', 'assess', 'hold'] as const).map((r) => (
              <div key={r} className="rounded-lg bg-surface-2 p-3 text-center">
                <div className="text-xl font-semibold tabular">
                  {data.technology.byRadar[r] ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">{enumLabel(r)}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
