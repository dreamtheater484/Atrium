import { type ElementRow, enumLabel, RADAR_RINGS } from '@atrium/schema';
import { Badge, cn, EmptyState, formatDate, Skeleton, Tooltip } from '@atrium/ui';
import { Radar as RadarIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useElements } from '../../lib/queries';
import { inspect } from '../../lib/store';

const QUADRANTS = [
  { name: 'Languages and frameworks', categories: ['language', 'framework', 'runtime'] },
  { name: 'Platforms and infrastructure', categories: ['platform', 'os', 'cloud_service'] },
  { name: 'Data', categories: ['database'] },
  { name: 'Tools and middleware', categories: ['middleware', 'tool', 'other'] },
];

const RING_R = [110, 190, 255, 310];
const SIZE = 680;
const C = SIZE / 2;

function seeded(id: string, salt: number) {
  let h = salt;
  for (const ch of id) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return (h % 1000) / 1000;
}

function blipColor(t: ElementRow) {
  return t.health === 'act'
    ? 'var(--act)'
    : t.health === 'watch'
      ? 'var(--watch)'
      : t.health === 'good'
        ? 'var(--good)'
        : 'var(--subtle-foreground)';
}

/** Technology radar: what to adopt, trial, assess or hold, by area. */
export function RadarView({ q }: { q?: string }) {
  const { data, isLoading } = useElements({ type: 'technology', limit: 2000, q });
  const [hover, setHover] = useState<string | null>(null);
  const placed = useMemo(() => {
    const items = (data?.items ?? []).filter((t) => t.attributes.radar);
    return items.map((t, i) => {
      const qi = Math.max(
        0,
        QUADRANTS.findIndex((qd) => qd.categories.includes(t.attributes.category as string)),
      );
      const ring = RADAR_RINGS.indexOf(t.attributes.radar as never);
      const r0 = ring === 0 ? 30 : RING_R[ring - 1]! + 12;
      const r1 = RING_R[ring]! - 14;
      const r = r0 + seeded(t.id, 7) * (r1 - r0);
      const a0 = (qi * Math.PI) / 2 + 0.12;
      const a1 = ((qi + 1) * Math.PI) / 2 - 0.12;
      const a = a0 + seeded(t.id, 13) * (a1 - a0);
      return {
        t,
        n: i + 1,
        x: C + r * Math.cos(a - Math.PI),
        y: C + r * Math.sin(a - Math.PI),
        qi,
        ring,
      };
    });
  }, [data]);
  const unrated = (data?.items ?? []).filter((t) => !t.attributes.radar);

  if (isLoading) return <Skeleton className="m-6 h-[600px] rounded-2xl" />;
  if (!placed.length) {
    return (
      <EmptyState icon={<RadarIcon />} title="No technologies on the radar yet" className="mt-16">
        Give technologies a radar ring (adopt, trial, assess or hold) and a category, and they
        appear here.
      </EmptyState>
    );
  }

  return (
    <div className="flex h-full gap-6 overflow-auto px-6 py-5">
      <div className="shrink-0">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          className="max-w-full"
          role="img"
          aria-label="Technology radar"
        >
          {[...RING_R].reverse().map((r, i) => (
            <circle
              key={r}
              cx={C}
              cy={C}
              r={r}
              fill={i % 2 ? 'var(--surface)' : 'var(--surface-2)'}
              stroke="var(--border)"
            />
          ))}
          <line
            x1={C - RING_R[3]!}
            y1={C}
            x2={C + RING_R[3]!}
            y2={C}
            stroke="var(--border-strong)"
          />
          <line
            x1={C}
            y1={C - RING_R[3]!}
            x2={C}
            y2={C + RING_R[3]!}
            stroke="var(--border-strong)"
          />
          {RADAR_RINGS.map((ring, i) => (
            <text
              key={ring}
              x={C + 6}
              y={
                C -
                (i === 0 ? 0 : RING_R[i - 1]!) -
                (RING_R[i]! - (i === 0 ? 0 : RING_R[i - 1]!)) / 2
              }
              fontSize="11"
              fontWeight="600"
              fill="var(--muted-foreground)"
            >
              {enumLabel(ring)}
            </text>
          ))}
          {QUADRANTS.map((qd, i) => {
            const pos = [
              [16, 20, 'start'],
              [SIZE - 16, 20, 'end'],
              [SIZE - 16, SIZE - 12, 'end'],
              [16, SIZE - 12, 'start'],
            ][i]!;
            return (
              <text
                key={qd.name}
                x={pos[0] as number}
                y={pos[1] as number}
                textAnchor={pos[2] as 'start'}
                fontSize="12"
                fontWeight="600"
                fill="var(--foreground)"
              >
                {qd.name}
              </text>
            );
          })}
          {placed.map((p) => (
            <g
              key={p.t.id}
              className="cursor-pointer"
              onClick={() => inspect(p.t.id)}
              onMouseEnter={() => setHover(p.t.id)}
              onMouseLeave={() => setHover(null)}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={hover === p.t.id ? 11 : 9}
                fill={blipColor(p.t)}
                stroke="var(--surface)"
                strokeWidth="2"
              />
              <text
                x={p.x}
                y={p.y + 3.5}
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill="white"
              >
                {p.n}
              </text>
            </g>
          ))}
        </svg>
        <div className="mt-2 flex justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-good" /> Supported
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-watch" /> End of life soon
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-act" /> Past end of life
          </span>
        </div>
      </div>
      <div className="grid min-w-[280px] flex-1 content-start gap-4 sm:grid-cols-2">
        {QUADRANTS.map((qd, qi) => (
          <div key={qd.name}>
            <h3 className="mb-2 text-xs font-semibold">{qd.name}</h3>
            {RADAR_RINGS.map((ring, ri) => {
              const items = placed.filter((p) => p.qi === qi && p.ring === ri);
              if (!items.length) return null;
              return (
                <div key={ring} className="mb-2">
                  <div className="mb-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    {enumLabel(ring)}
                  </div>
                  {items.map((p) => (
                    <Tooltip
                      key={p.t.id}
                      content={
                        p.t.attributes.eol_date
                          ? `End of life ${formatDate(p.t.attributes.eol_date as string)}`
                          : null
                      }
                    >
                      <button
                        type="button"
                        onClick={() => inspect(p.t.id)}
                        onMouseEnter={() => setHover(p.t.id)}
                        onMouseLeave={() => setHover(null)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-[12.5px] hover:bg-surface-2',
                          hover === p.t.id && 'bg-surface-2',
                        )}
                      >
                        <span
                          className="flex size-4 items-center justify-center rounded-full text-[9px] font-bold text-foreground"
                          style={{
                            background: `color-mix(in oklch, ${blipColor(p.t)} 28%, var(--surface))`,
                            boxShadow: `inset 0 0 0 1.5px ${blipColor(p.t)}`,
                          }}
                        >
                          {p.n}
                        </span>
                        <span className="truncate">{p.t.name}</span>
                      </button>
                    </Tooltip>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
        {unrated.length > 0 && (
          <div className="sm:col-span-2">
            <h3 className="mb-2 text-xs font-semibold">Not on the radar yet</h3>
            <div className="flex flex-wrap gap-1.5">
              {unrated.map((t) => (
                <button key={t.id} type="button" onClick={() => inspect(t.id)}>
                  <Badge tone="outline">{t.name}</Badge>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
