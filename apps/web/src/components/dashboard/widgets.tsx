import { enumLabel, type Health } from '@atrium/schema';
import {
  Badge,
  Button,
  type ChartPalette,
  cn,
  formatDate,
  formatMoney,
  HEALTH_CLASSES,
  HealthDot,
  Progress,
  TypeIcon,
} from '@atrium/ui';
import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Overview } from '../../lib/overview';
import { inspect } from '../../lib/store';
import { EChart, type EChartsOption } from '../charts/echart';
import { openResearch } from '../research/research-dialog';

/** "Known for 52 of 63 applications · €2.4M estimated" */
export function costCoverage(data: Overview): string {
  const c = data.completeness.cost;
  const parts = [
    c.known < c.total
      ? `Known for ${c.known} of ${c.total} applications`
      : 'Known for every application',
  ];
  if (c.estimated) parts.push(`${formatMoney(c.estimated)} estimated`);
  return parts.join(' · ');
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 100);

function CompletenessRow({
  label,
  known,
  total,
  detail,
  onClick,
  action,
}: {
  label: string;
  known: number;
  total: number;
  detail: string;
  onClick: () => void;
  action?: ReactNode;
}) {
  const p = pct(known, total);
  return (
    <div className="flex flex-col gap-1 rounded-lg px-2 py-1.5 hover:bg-surface-2">
      <button type="button" onClick={onClick} className="flex flex-col gap-1 text-left">
        <span className="flex w-full items-baseline gap-2 text-[13px]">
          <span className="font-medium">{label}</span>
          <span className="text-xs text-muted-foreground tabular">
            {known} of {total}
          </span>
          <span className="ml-auto text-xs font-medium tabular">{p}%</span>
        </span>
        <Progress
          value={p}
          tone={p >= 90 ? 'good' : p >= 60 ? 'watch' : 'act'}
          label={`${label}: ${p}% known`}
        />
      </button>
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{detail}</span>
        {action}
      </span>
    </div>
  );
}

export type WidgetSize = 's' | 'm' | 'l';

export interface WidgetContext {
  data: Overview;
  p: ChartPalette;
  go: (to: string) => void;
}

export interface WidgetDef {
  id: string;
  title: string;
  description: string;
  size: WidgetSize;
  /** Which home/dashboard audiences this suits */
  audience: Array<'architect' | 'manager' | 'engineer'>;
  render: (ctx: WidgetContext) => ReactNode;
  /** Native PowerPoint slide for exports */
  slide?: (ctx: Omit<WidgetContext, 'go'>) => unknown;
}

function Row({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
    >
      {children}
    </button>
  );
}

function Kpi({
  value,
  label,
  hint,
  tone,
  onClick,
}: {
  value: ReactNode;
  label: string;
  hint?: string;
  tone?: 'good' | 'watch' | 'act';
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full w-full flex-col justify-center gap-1 text-left"
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-3xl font-semibold tracking-tight tabular',
          tone &&
            {
              good: 'text-good-foreground',
              watch: 'text-watch-foreground',
              act: 'text-act-foreground',
            }[tone],
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </button>
  );
}

const healthDonut = (data: Overview, p: ChartPalette): EChartsOption => {
  const h = data.applications.health;
  const color: Record<string, string> = {
    good: p.good,
    watch: p.watch,
    act: p.act,
    unknown: p.unknown,
  };
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    // A title rather than a centre label: pie labels are drawn once per slice and stack up.
    title: {
      text: String(data.applications.total),
      subtext: 'applications',
      left: 'center',
      top: 'middle',
      itemGap: 2,
      textStyle: { fontSize: 26, fontWeight: 650, color: p.text },
      subtextStyle: { fontSize: 12, color: p.muted },
    },
    series: [
      {
        type: 'pie',
        radius: ['60%', '85%'],
        padAngle: 2,
        itemStyle: { borderRadius: 6 },
        label: { show: false },
        data: (['good', 'watch', 'act', 'unknown'] as const)
          .filter((k) => h[k])
          .map((k) => ({
            name: enumLabel(k) || 'Unknown',
            value: h[k],
            itemStyle: { color: color[k] },
          })),
      },
    ],
  };
};

function bars(
  labels: string[],
  values: number[],
  p: ChartPalette,
  money = false,
  color?: string,
): EChartsOption {
  return {
    grid: { left: 8, right: money ? 64 : 32, top: 4, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: number) => (money ? formatMoney(v) : String(v)),
    },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: [...labels].reverse(),
      axisLabel: { color: p.muted, width: 150, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        data: [...values].reverse(),
        barWidth: 12,
        itemStyle: { color: color ?? p.primary, borderRadius: [0, 6, 6, 0] },
        label: {
          show: true,
          position: 'right',
          color: p.muted,
          fontSize: 11,
          formatter: (v: { value: number }) => (money ? formatMoney(v.value) : String(v.value)),
        },
      },
    ],
  };
}

function donut(
  entries: Array<[string, number]>,
  _p: ChartPalette,
  colors?: string[],
): EChartsOption {
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, left: 'center' },
    series: [
      {
        type: 'pie',
        radius: ['50%', '75%'],
        center: ['50%', '44%'],
        padAngle: 2,
        itemStyle: { borderRadius: 5 },
        label: { show: false },
        data: entries.map(([name, value], i) => ({
          name,
          value,
          itemStyle: colors ? { color: colors[i % colors.length] } : undefined,
        })),
      },
    ],
  };
}

export const WIDGETS: WidgetDef[] = [
  {
    id: 'kpi-apps',
    title: 'Applications in use',
    description: 'Number of live applications',
    size: 's',
    audience: ['manager', 'architect'],
    render: ({ data, go }) => (
      <Kpi
        label="Applications in use"
        value={data.applications.total}
        hint={`Across ${data.applications.byDomain.length} domains`}
        onClick={() => go('/explore?type=application')}
      />
    ),
  },
  {
    id: 'kpi-cost',
    title: 'Annual run cost',
    description: 'Total yearly application cost',
    size: 's',
    audience: ['manager'],
    render: ({ data, go }) => (
      <Kpi
        label="Annual run cost"
        value={formatMoney(data.applications.cost)}
        hint={costCoverage(data)}
        onClick={() => go('/explore?type=application&missing=attributes.annual_cost')}
      />
    ),
  },
  {
    id: 'kpi-healthy',
    title: 'Healthy share',
    description: 'Share of applications in good health',
    size: 's',
    audience: ['manager', 'architect'],
    render: ({ data, go }) => {
      const pct = Math.round(
        (data.applications.health.good / Math.max(1, data.applications.total)) * 100,
      );
      return (
        <Kpi
          label="Healthy"
          value={`${pct}%`}
          hint={`${data.applications.health.act} need action`}
          tone={pct >= 60 ? 'good' : 'watch'}
          onClick={() => go('/explore?type=application&health=act')}
        />
      );
    },
  },
  {
    id: 'kpi-eol',
    title: 'End-of-life exposure',
    description: 'Technologies past or near end of life',
    size: 's',
    audience: ['manager', 'engineer', 'architect'],
    render: ({ data, go }) => (
      <Kpi
        label="End-of-life exposure"
        value={data.eol.length}
        hint={`${data.eol.filter((e) => e.past).length} already unsupported`}
        tone={data.eol.some((e) => e.past) ? 'act' : 'watch'}
        onClick={() => go('/explore?type=technology&view=radar')}
      />
    ),
  },
  {
    id: 'kpi-quality',
    title: 'Data quality',
    description: 'Average completeness of the model',
    size: 's',
    audience: ['architect'],
    render: ({ data, go }) => (
      <Kpi
        label="Data quality"
        value={`${data.quality.average}%`}
        hint={`${data.quality.total - data.quality.complete} elements with gaps`}
        tone={data.quality.average >= 85 ? 'good' : data.quality.average >= 60 ? 'watch' : 'act'}
        onClick={() => go('/explore?gaps=true&type=application')}
      />
    ),
  },
  {
    id: 'health',
    title: 'Portfolio health',
    description: 'Applications by health',
    size: 'm',
    audience: ['manager', 'architect'],
    render: ({ data, p, go }) => (
      <EChart
        option={healthDonut(data, p)}
        height={240}
        onClick={(e) => go(`/explore?type=application&health=${e.name.toLowerCase()}`)}
        ariaLabel="Portfolio health"
      />
    ),
    slide: ({ data, p }) => ({
      kind: 'doughnut',
      title: 'Portfolio health',
      subtitle: `${data.applications.total} applications`,
      labels: ['Good', 'Watch', 'Act', 'Unknown'],
      series: [
        {
          name: 'Applications',
          values: [
            data.applications.health.good,
            data.applications.health.watch,
            data.applications.health.act,
            data.applications.health.unknown,
          ],
        },
      ],
      colors: [p.good, p.watch, p.act, p.unknown],
    }),
  },
  {
    id: 'cost-domain',
    title: 'Cost per domain',
    description: 'Where the money goes',
    size: 'm',
    audience: ['manager'],
    render: ({ data, p }) => {
      const rows = data.applications.byDomain.filter((d) => d.cost > 0);
      const c = data.completeness.cost;
      return (
        <div className="flex flex-col gap-1">
          <EChart
            option={bars(
              rows.map((d) => d.name),
              rows.map((d) => d.cost),
              p,
              true,
            )}
            height={250}
            ariaLabel="Cost per domain"
          />
          <p className="text-[11px] text-muted-foreground">
            {c.known < c.total ? `Costs known for ${c.known} of ${c.total} applications. ` : ''}
            {c.viaContracts
              ? 'Contract costs are shared evenly by the applications they cover.'
              : ''}
          </p>
        </div>
      );
    },
    slide: ({ data }) => ({
      kind: 'bar',
      title: 'Cost per domain',
      subtitle: 'Annual application cost',
      labels: data.applications.byDomain.map((d) => d.name),
      series: [{ name: 'Annual cost', values: data.applications.byDomain.map((d) => d.cost) }],
      valueFormat: 'money',
    }),
  },
  {
    id: 'cost-capability',
    title: 'Cost per capability',
    description: 'Application cost split over the capabilities they support',
    size: 'm',
    audience: ['manager', 'architect'],
    render: ({ data, p }) => {
      const rows = data.capabilities.costByCapability.slice(0, 10);
      return (
        <EChart
          option={bars(
            rows.map((r) => r.name),
            rows.map((r) => r.cost),
            p,
            true,
            p.categorical[1],
          )}
          height={280}
          ariaLabel="Cost per capability"
        />
      );
    },
    slide: ({ data }) => ({
      kind: 'bar',
      title: 'Cost per capability',
      labels: data.capabilities.costByCapability.slice(0, 10).map((r) => r.name),
      series: [
        {
          name: 'Annual cost',
          values: data.capabilities.costByCapability.slice(0, 10).map((r) => r.cost),
        },
      ],
      valueFormat: 'money',
    }),
  },
  {
    id: 'time',
    title: 'TIME quadrant',
    description: 'Business fit against technical fit; size shows cost',
    size: 'l',
    audience: ['manager', 'architect'],
    render: ({ data, p }) => {
      const timeColor: Record<string, string> = {
        invest: p.good,
        tolerate: p.unknown,
        migrate: p.watch,
        eliminate: p.act,
      };
      const maxCost = Math.max(1, ...data.applications.fitScatter.map((d) => d.cost));
      const jit = (s: string) => ((s.charCodeAt(1) + s.charCodeAt(4)) % 9) / 22 - 0.18;
      const option: EChartsOption = {
        grid: { left: 40, right: 16, top: 24, bottom: 40 },
        tooltip: {
          formatter: (q: { data: { name: string; time: string; cost: number } }) =>
            `<b>${q.data.name}</b><br/>${formatMoney(q.data.cost)} · ${enumLabel(q.data.time) || 'Not rated'}`,
        },
        xAxis: {
          type: 'value',
          min: 0.5,
          max: 5.5,
          interval: 1,
          name: 'Business fit',
          nameLocation: 'middle',
          nameGap: 26,
        },
        yAxis: {
          type: 'value',
          min: 0.5,
          max: 5.5,
          interval: 1,
          name: 'Technical fit',
          nameLocation: 'middle',
          nameGap: 26,
        },
        series: [
          {
            type: 'scatter',
            data: data.applications.fitScatter.map((d) => ({
              name: d.name,
              id: d.id,
              time: d.time,
              cost: d.cost,
              value: [d.business + jit(d.id), d.technical + jit(d.id.slice(2)), d.cost],
              symbolSize: 8 + Math.sqrt(d.cost / maxCost) * 32,
              itemStyle: {
                color: timeColor[d.time ?? ''] ?? p.primary,
                opacity: 0.82,
                borderColor: p.surface,
                borderWidth: 1,
              },
            })),
            markArea: {
              silent: true,
              itemStyle: { color: 'transparent' },
              label: { color: p.subtle, fontSize: 11, fontWeight: 600 },
              data: [
                [{ name: 'Invest', coord: [3, 3] }, { coord: [5.5, 5.5] }],
                [{ name: 'Tolerate', coord: [0.5, 3] }, { coord: [3, 5.5] }],
                [{ name: 'Migrate', coord: [3, 0.5] }, { coord: [5.5, 3] }],
                [{ name: 'Eliminate', coord: [0.5, 0.5] }, { coord: [3, 3] }],
              ],
            },
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: p.border, type: 'dashed' },
              label: { show: false },
              data: [{ xAxis: 3 }, { yAxis: 3 }],
            },
          },
        ],
      };
      return (
        <EChart
          option={option}
          height={340}
          onClick={(e) => inspect((e.data as { id: string }).id)}
          ariaLabel="TIME quadrant"
        />
      );
    },
  },
  {
    id: 'lifecycle',
    title: 'Lifecycle',
    description: 'Applications by lifecycle phase',
    size: 'm',
    audience: ['architect', 'manager'],
    render: ({ data, p }) => {
      const order = ['plan', 'build', 'active', 'phase_out', 'retired', 'unknown'];
      const entries = order
        .filter((k) => data.applications.byLifecycle[k])
        .map(
          (k) => [enumLabel(k) || 'Unknown', data.applications.byLifecycle[k]!] as [string, number],
        );
      return (
        <EChart
          option={donut(entries, p, [
            p.categorical[5]!,
            p.primary,
            p.good,
            p.watch,
            p.unknown,
            p.border,
          ])}
          height={240}
          ariaLabel="Lifecycle"
        />
      );
    },
  },
  {
    id: 'hosting',
    title: 'Hosting mix',
    description: 'Where applications run',
    size: 'm',
    audience: ['architect', 'manager', 'engineer'],
    render: ({ data, p }) => {
      const entries = Object.entries(data.applications.byHosting).map(
        ([k, v]) => [enumLabel(k) || 'Unknown', v] as [string, number],
      );
      return <EChart option={donut(entries, p)} height={240} ariaLabel="Hosting mix" />;
    },
  },
  {
    id: 'risks',
    title: 'Top risks',
    description: 'Applications that need attention',
    size: 'm',
    audience: ['manager', 'architect', 'engineer'],
    render: ({ data }) => (
      <div className="flex flex-col">
        {data.risks.slice(0, 7).map((r) => (
          <Row key={r.id} onClick={() => inspect(r.id)}>
            <HealthDot health={r.health} className="size-2.5" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{r.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {r.reasons[0]}
              </span>
            </span>
            <span className="text-xs text-muted-foreground tabular">
              {r.cost ? formatMoney(r.cost) : ''}
            </span>
          </Row>
        ))}
      </div>
    ),
    slide: ({ data }) => ({
      kind: 'table',
      title: 'Top risks',
      columns: ['Application', 'Health', 'Why', 'Annual cost'],
      rows: data.risks.map((r) => [
        r.name,
        { text: enumLabel(r.health ?? '') || '—', tone: r.health ?? undefined },
        r.reasons[0] ?? '',
        r.cost ? formatMoney(r.cost) : '—',
      ]),
    }),
  },
  {
    id: 'eol',
    title: 'End of life',
    description: 'Technologies past or near end of life, and who uses them',
    size: 'm',
    audience: ['engineer', 'architect', 'manager'],
    render: ({ data }) => (
      <div className="flex flex-col">
        {data.eol.slice(0, 7).map((t) => (
          <Row key={t.id} onClick={() => inspect(t.id)}>
            <TypeIcon type="technology" size="xs" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{t.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {t.apps.length} applications
              </span>
            </span>
            <Badge tone={t.past ? 'act' : 'watch'}>
              {!t.past && t.onExtended && t.extendedDate
                ? `Extended to ${formatDate(t.extendedDate)}`
                : formatDate(t.eolDate)}
            </Badge>
          </Row>
        ))}
      </div>
    ),
    slide: ({ data }) => ({
      kind: 'table',
      title: 'End-of-life exposure',
      columns: ['Technology', 'End of life', 'Applications'],
      rows: data.eol.map((t) => [
        t.name,
        { text: formatDate(t.eolDate), tone: t.past ? 'act' : 'watch' },
        t.apps.map((a) => a.name).join(', '),
      ]),
    }),
  },
  {
    id: 'initiatives',
    title: 'Initiatives',
    description: 'Change in flight',
    size: 'm',
    audience: ['manager', 'architect'],
    render: ({ data }) => (
      <div className="flex flex-col">
        {data.initiatives
          .filter((i) => i.status !== 'done' && i.status !== 'cancelled')
          .slice(0, 7)
          .map((i) => (
            <Row key={i.id} onClick={() => inspect(i.id)}>
              <TypeIcon type="initiative" size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{i.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {enumLabel(i.status)} · ends {formatDate(i.end)}
                </span>
              </span>
              <span className="w-20">
                <Progress value={i.progress ?? 0} />
              </span>
            </Row>
          ))}
      </div>
    ),
  },
  {
    id: 'coverage',
    title: 'Capability coverage',
    description: 'Gaps and possible overlaps',
    size: 'm',
    audience: ['architect'],
    render: ({ data, go }) => (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ['Capabilities', data.capabilities.total],
            ['Gaps', data.capabilities.withoutApps.length],
            ['Overlaps', data.capabilities.overlaps.length],
          ].map(([l, v]) => (
            <div key={l as string} className="rounded-lg bg-surface-2 p-2">
              <div className="text-xl font-semibold tabular">{v}</div>
              <div className="text-[11px] text-muted-foreground">{l}</div>
            </div>
          ))}
        </div>
        {data.capabilities.withoutApps.slice(0, 4).map((c) => (
          <Row key={c.id} onClick={() => inspect(c.id)}>
            <span className="size-2 rounded-full bg-act" />
            <span className="flex-1 truncate">{c.name}</span>
            <span className="text-[11px] text-muted-foreground">No application</span>
          </Row>
        ))}
        <button
          type="button"
          className="self-start text-xs font-medium text-primary hover:underline"
          onClick={() => go('/explore?type=capability&view=map&overlay=coverage')}
        >
          Open coverage map
        </button>
      </div>
    ),
  },
  {
    id: 'quality-gaps',
    title: 'Fill the gaps',
    description: 'Elements missing the most information',
    size: 'm',
    audience: ['architect'],
    render: ({ data }) => (
      <div className="flex flex-col">
        {data.quality.gaps.slice(0, 7).map((g) => (
          <Row key={g.id} onClick={() => inspect(g.id)}>
            <TypeIcon type={g.type} size="xs" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{g.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                Missing {g.missing.slice(0, 3).join(', ').toLowerCase()}
              </span>
            </span>
            <span className="w-16">
              <Progress
                value={g.quality}
                tone={g.quality >= 85 ? 'good' : g.quality >= 60 ? 'watch' : 'act'}
              />
            </span>
          </Row>
        ))}
      </div>
    ),
  },
  {
    id: 'completeness',
    title: 'Data completeness',
    description: 'How complete costs, integrations and support dates are',
    size: 'm',
    audience: ['architect', 'manager'],
    render: ({ data, go }) => {
      const c = data.completeness;
      const money = [
        c.cost.viaContracts ? `${formatMoney(c.cost.viaContracts)} through contracts` : null,
        c.cost.estimated ? `${formatMoney(c.cost.estimated)} estimated` : null,
      ].filter(Boolean);
      return (
        <div className="flex flex-col gap-1.5">
          <CompletenessRow
            label="Run costs"
            known={c.cost.known}
            total={c.cost.total}
            detail={money.join(' · ') || 'Applications with an annual cost'}
            onClick={() => go('/explore?type=application&missing=attributes.annual_cost')}
          />
          <CompletenessRow
            label="Integrations"
            known={c.integrations.mapped + c.integrations.standalone}
            total={c.integrations.total}
            detail={`Applications with mapped integrations${c.integrations.standalone ? `, or marked standalone (${c.integrations.standalone})` : ''}`}
            onClick={() => go('/explore?type=application&missing=relation.integration')}
          />
          <CompletenessRow
            label="End-of-support dates"
            known={c.support.known}
            total={c.support.total}
            detail="Versioned technologies and vendor products"
            onClick={() => go('/explore?missing=attributes.eol_date')}
            action={
              c.support.known < c.support.total ? (
                <Button size="sm" variant="soft" onClick={openResearch}>
                  <Sparkles /> Find dates
                </Button>
              ) : null
            }
          />
        </div>
      );
    },
    slide: ({ data }) => {
      const c = data.completeness;
      const row = (label: string, known: number, total: number) => [
        label,
        `${known} of ${total}`,
        {
          text: `${pct(known, total)}%`,
          tone: pct(known, total) >= 90 ? 'good' : pct(known, total) >= 60 ? 'watch' : 'act',
        },
      ];
      return {
        kind: 'table',
        title: 'Data completeness',
        columns: ['Data', 'Known', 'Share'],
        rows: [
          row('Run costs', c.cost.known, c.cost.total),
          row(
            'Integrations',
            c.integrations.mapped + c.integrations.standalone,
            c.integrations.total,
          ),
          row('End-of-support dates', c.support.known, c.support.total),
        ],
      };
    },
  },
  {
    id: 'radar',
    title: 'Technology radar',
    description: 'Technologies per ring',
    size: 's',
    audience: ['engineer', 'architect'],
    render: ({ data, go }) => (
      <button
        type="button"
        className="grid h-full w-full grid-cols-2 gap-2"
        onClick={() => go('/explore?type=technology&view=radar')}
      >
        {(['adopt', 'trial', 'assess', 'hold'] as const).map((r) => (
          <div key={r} className="rounded-lg bg-surface-2 p-2 text-center">
            <div className="text-lg font-semibold tabular">{data.technology.byRadar[r] ?? 0}</div>
            <div className="text-[11px] text-muted-foreground">{enumLabel(r)}</div>
          </div>
        ))}
      </button>
    ),
  },
  {
    id: 'health-by-domain',
    title: 'Health per domain',
    description: 'Applications needing action, by domain',
    size: 'm',
    audience: ['manager', 'architect'],
    render: ({ data }) => (
      <div className="flex flex-col gap-2">
        {data.applications.byDomain.map((d) => (
          <div key={d.name} className="flex items-center gap-3 text-[13px]">
            <span className="w-32 truncate">{d.name}</span>
            <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className={cn('h-full', HEALTH_CLASSES.act.dot)}
                style={{ width: `${(d.act / Math.max(1, d.count)) * 100}%` }}
              />
              <div
                className={cn('h-full', HEALTH_CLASSES.good.dot)}
                style={{
                  width: `${((d.count - d.act) / Math.max(1, d.count)) * 100}%`,
                  opacity: 0.35,
                }}
              />
            </div>
            <span className="w-16 text-right text-xs text-muted-foreground tabular">
              {d.act}/{d.count}
            </span>
          </div>
        ))}
      </div>
    ),
  },
];

export const WIDGET_MAP = new Map(WIDGETS.map((w) => [w.id, w]));

export interface DashboardWidget {
  id: string;
  widget: string;
  size: WidgetSize;
}

export interface DashboardSpec {
  id: string;
  name: string;
  description: string;
  role?: string;
  template: boolean;
  widgets: DashboardWidget[];
}

const w = (widget: string, size?: WidgetSize): DashboardWidget => ({
  id: widget,
  widget,
  size: size ?? WIDGET_MAP.get(widget)!.size,
});

export const TEMPLATES: DashboardSpec[] = [
  {
    id: 'portfolio',
    name: 'Portfolio health',
    description: 'For managers: health, cost and risk at a glance',
    role: 'manager',
    template: true,
    widgets: [
      w('kpi-apps'),
      w('kpi-cost'),
      w('kpi-healthy'),
      w('kpi-eol'),
      w('health'),
      w('cost-domain'),
      w('time'),
      w('risks'),
      w('initiatives'),
      w('completeness'),
    ],
  },
  {
    id: 'cost',
    name: 'Cost and value',
    description: 'Where the money goes and what it buys',
    role: 'manager',
    template: true,
    widgets: [
      w('kpi-cost'),
      w('kpi-apps'),
      w('kpi-healthy'),
      w('cost-domain'),
      w('cost-capability'),
      w('time'),
    ],
  },
  {
    id: 'architecture',
    name: 'Architecture quality',
    description: 'For architects: coverage, gaps and data quality',
    role: 'architect',
    template: true,
    widgets: [
      w('kpi-quality'),
      w('kpi-apps'),
      w('kpi-healthy'),
      w('kpi-eol'),
      w('coverage'),
      w('completeness'),
      w('quality-gaps'),
      w('lifecycle'),
      w('health-by-domain'),
    ],
  },
  {
    id: 'technology',
    name: 'Technology risk',
    description: 'For engineers: end of life, radar and hosting',
    role: 'engineer',
    template: true,
    widgets: [
      w('kpi-eol'),
      w('radar'),
      w('kpi-healthy'),
      w('kpi-apps'),
      w('eol'),
      w('hosting'),
      w('risks'),
    ],
  },
];

export const SIZE_CLASS: Record<WidgetSize, string> = {
  s: 'col-span-12 sm:col-span-6 xl:col-span-3',
  m: 'col-span-12 xl:col-span-6',
  l: 'col-span-12',
};

export type { Health };
