import {
  type ArchitectureLayer,
  type ElementType,
  enumLabel,
  type Health,
  type LifecyclePhase,
  typeDef,
} from '@atrium/schema';
import {
  AppWindow,
  Blocks,
  Compass,
  Cpu,
  Database,
  Flag,
  Layers,
  type LucideIcon,
  Plug,
  Scale,
  ShieldCheck,
  Users,
  Workflow,
} from 'lucide-react';
import type * as React from 'react';
import { cn } from './primitives';

export const TYPE_ICONS: Record<ElementType, LucideIcon> = {
  domain: Layers,
  team: Users,
  capability: Blocks,
  business_process: Workflow,
  application: AppWindow,
  interface: Plug,
  data_object: Database,
  technology: Cpu,
  initiative: Flag,
  principle: Compass,
  standard: ShieldCheck,
  decision: Scale,
};

export const LAYER_CLASSES: Record<
  ArchitectureLayer,
  { chip: string; text: string; border: string; bg: string }
> = {
  strategy: {
    chip: 'bg-layer-strategy-soft text-layer-strategy',
    text: 'text-layer-strategy',
    border: 'border-layer-strategy',
    bg: 'bg-layer-strategy',
  },
  business: {
    chip: 'bg-layer-business-soft text-layer-business',
    text: 'text-layer-business',
    border: 'border-layer-business',
    bg: 'bg-layer-business',
  },
  application: {
    chip: 'bg-layer-application-soft text-layer-application',
    text: 'text-layer-application',
    border: 'border-layer-application',
    bg: 'bg-layer-application',
  },
  data: {
    chip: 'bg-layer-data-soft text-layer-data',
    text: 'text-layer-data',
    border: 'border-layer-data',
    bg: 'bg-layer-data',
  },
  technology: {
    chip: 'bg-layer-technology-soft text-layer-technology',
    text: 'text-layer-technology',
    border: 'border-layer-technology',
    bg: 'bg-layer-technology',
  },
  governance: {
    chip: 'bg-layer-governance-soft text-layer-governance',
    text: 'text-layer-governance',
    border: 'border-layer-governance',
    bg: 'bg-layer-governance',
  },
  organization: {
    chip: 'bg-layer-organization-soft text-layer-organization',
    text: 'text-layer-organization',
    border: 'border-layer-organization',
    bg: 'bg-layer-organization',
  },
};

export function layerOf(type: ElementType) {
  return LAYER_CLASSES[typeDef(type).layer];
}

export function TypeIcon({
  type,
  className,
  size = 'md',
}: {
  type: ElementType;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const Icon = TYPE_ICONS[type];
  const dim = {
    xs: 'size-4 [&_svg]:size-2.5 rounded',
    sm: 'size-5 [&_svg]:size-3 rounded-md',
    md: 'size-7 [&_svg]:size-3.5 rounded-lg',
    lg: 'size-10 [&_svg]:size-5 rounded-xl',
  }[size];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        dim,
        layerOf(type).chip,
        className,
      )}
      title={typeDef(type).label}
    >
      <Icon strokeWidth={2.2} />
    </span>
  );
}

export const HEALTH_CLASSES: Record<
  Health | 'unknown',
  { dot: string; badge: string; fill: string; soft: string }
> = {
  good: {
    dot: 'bg-good',
    badge: 'bg-good-soft text-good-foreground',
    fill: 'var(--good)',
    soft: 'var(--good-soft)',
  },
  watch: {
    dot: 'bg-watch',
    badge: 'bg-watch-soft text-watch-foreground',
    fill: 'var(--watch)',
    soft: 'var(--watch-soft)',
  },
  act: {
    dot: 'bg-act',
    badge: 'bg-act-soft text-act-foreground',
    fill: 'var(--act)',
    soft: 'var(--act-soft)',
  },
  unknown: {
    dot: 'bg-unknown',
    badge: 'bg-surface-2 text-muted-foreground',
    fill: 'var(--unknown)',
    soft: 'var(--unknown-soft)',
  },
};

const HEALTH_LABEL = { good: 'Good', watch: 'Watch', act: 'Act', unknown: 'Unknown' };

export function HealthDot({ health, className }: { health: Health | null; className?: string }) {
  const h = health ?? 'unknown';
  return (
    <span
      className={cn('inline-block size-2 shrink-0 rounded-full', HEALTH_CLASSES[h].dot, className)}
      title={`Health: ${HEALTH_LABEL[h]}`}
    />
  );
}

export function HealthBadge({ health, className }: { health: Health | null; className?: string }) {
  const h = health ?? 'unknown';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        HEALTH_CLASSES[h].badge,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', HEALTH_CLASSES[h].dot)} />
      {HEALTH_LABEL[h]}
    </span>
  );
}

const LIFECYCLE_STYLE: Record<LifecyclePhase, string> = {
  plan: 'bg-layer-strategy-soft text-layer-strategy',
  build: 'bg-primary-soft text-primary-soft-foreground',
  active: 'bg-good-soft text-good-foreground',
  phase_out: 'bg-watch-soft text-watch-foreground',
  retired: 'bg-surface-2 text-muted-foreground line-through decoration-1',
};

export function LifecycleBadge({
  lifecycle,
  className,
}: {
  lifecycle: LifecyclePhase | null;
  className?: string;
}) {
  if (!lifecycle) return <span className={cn('text-xs text-subtle-foreground', className)}>—</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        LIFECYCLE_STYLE[lifecycle],
        className,
      )}
    >
      {enumLabel(lifecycle)}
    </span>
  );
}

const TIME_STYLE: Record<string, string> = {
  invest: 'bg-good-soft text-good-foreground',
  tolerate: 'bg-surface-2 text-muted-foreground',
  migrate: 'bg-watch-soft text-watch-foreground',
  eliminate: 'bg-act-soft text-act-foreground',
};

export function TimeBadge({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  if (!value) return <span className="text-xs text-subtle-foreground">—</span>;
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        TIME_STYLE[value],
        className,
      )}
    >
      {enumLabel(value)}
    </span>
  );
}

export function MarkBadge({ mark }: { mark?: 'added' | 'changed' | 'removed' | null }) {
  if (!mark) return null;
  const style = {
    added: 'bg-good-soft text-good-foreground',
    changed: 'bg-primary-soft text-primary-soft-foreground',
    removed: 'bg-act-soft text-act-foreground',
  }[mark];
  return (
    <span className={cn('rounded px-1 text-[10px] font-semibold uppercase tracking-wide', style)}>
      {mark === 'added' ? 'New' : mark === 'changed' ? 'Changed' : 'Removed'}
    </span>
  );
}

/** 1–5 rating shown as five small bars; clickable when onChange is given. */
export function Rating({
  value,
  onChange,
  className,
}: {
  value: number | null | undefined;
  onChange?: (v: number | null) => void;
  className?: string;
}) {
  const v = Number(value) || 0;
  const tone = v >= 4 ? 'bg-good' : v === 3 ? 'bg-watch' : v > 0 ? 'bg-act' : 'bg-surface-3';
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is always set, just chosen at runtime
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role={onChange ? 'radiogroup' : 'img'}
      aria-label={`${v || 'No'} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={!onChange}
          aria-label={`${i} of 5`}
          onClick={(e) => {
            e.stopPropagation();
            onChange?.(i === v ? null : i);
          }}
          className={cn(
            'h-3 w-1.5 rounded-sm transition-colors',
            i <= v ? tone : 'bg-surface-3',
            onChange && 'cursor-pointer hover:opacity-80',
          )}
        />
      ))}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-1 flex size-11 items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-foreground [&_svg]:size-5">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold">{title}</h3>
      {children && <p className="max-w-sm text-[13px] text-muted-foreground">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  icon,
  className,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'good' | 'watch' | 'act' | 'primary';
  icon?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const toneText = tone
    ? {
        good: 'text-good-foreground',
        watch: 'text-watch-foreground',
        act: 'text-act-foreground',
        primary: 'text-primary-soft-foreground',
      }[tone]
    : '';
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 text-left shadow-sm',
        onClick && 'cursor-pointer transition hover:border-border-strong hover:shadow-md',
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </span>
      <span className={cn('text-2xl font-semibold tracking-tight tabular', toneText)}>{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </Comp>
  );
}

export function formatMoney(
  value: number | null | undefined,
  opts: { compact?: boolean } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (opts.compact !== false && Math.abs(n) >= 1000) {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'EUR',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < -45) {
    const f = -s;
    if (f < 3600) return `in ${Math.round(f / 60)} min`;
    if (f < 86400) return `in ${Math.round(f / 3600)} h`;
    if (f < 86400 * 60) return `in ${Math.round(f / 86400)} days`;
    return formatDate(iso);
  }
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return formatDate(iso);
}
