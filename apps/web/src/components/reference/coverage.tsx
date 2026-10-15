import type { FrameworkNode } from '@atrium/schema';
import { cn, Tooltip } from '@atrium/ui';

const n = (v: number) => v.toLocaleString('en-GB');

/** Lighter and striped: covered only through another framework. */
const THROUGH = 'bg-good/30';
const THROUGH_STRIPES = {
  backgroundImage: 'repeating-linear-gradient(135deg, var(--good) 0 1.5px, transparent 1.5px 4px)',
};

/** The striped part of the bar on its own, as a key next to what it stands for. */
export function ThroughSwatch({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('mt-1.5 h-1.5 w-3.5 shrink-0 rounded-full', THROUGH, className)}
      style={THROUGH_STRIPES}
    />
  );
}

/**
 * How much is covered: mapped directly in green, then, lighter and striped, what is covered only
 * through another framework (an application mapped to a TAM application that realizes it).
 * Anything at all keeps a sliver of at least `min` percent, so it never looks empty.
 */
export function CoverageBar({
  covered,
  through = 0,
  total,
  label,
  min = 4,
  className,
}: {
  covered: number;
  through?: number;
  total: number;
  label: string;
  min?: number;
  className?: string;
}) {
  const pct = (v: number) => (total ? (v / total) * 100 : 0);
  const direct = covered > 0 ? Math.min(100, Math.max(pct(covered), min)) : 0;
  const more = through > 0 ? Math.min(100 - direct, Math.max(pct(through), min)) : 0;
  return (
    <div
      className={cn('flex h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
      role="progressbar"
      aria-label={label}
      aria-valuetext={
        more
          ? `${Math.round(pct(covered))}% mapped, ${Math.round(pct(through))}% more through other frameworks`
          : `${Math.round(direct)}%`
      }
      aria-valuenow={direct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          'h-full shrink-0 rounded-full bg-good transition-[width] duration-500',
          more > 0 && 'rounded-r-none',
        )}
        style={{ width: `${direct}%` }}
      />
      {more > 0 && (
        <div
          data-through
          className={cn(
            'h-full shrink-0 rounded-r-full transition-[width] duration-500',
            THROUGH,
            !direct && 'rounded-l-full',
          )}
          style={{ width: `${more}%`, ...THROUGH_STRIPES }}
        />
      )}
    </div>
  );
}

/** How much of a branch is mapped: a bar and "covered/size", with the detail on hover. */
export function BranchCoverage({ node, wide }: { node: FrameworkNode; wide?: boolean }) {
  const through = node.coveredThrough;
  const tip = `${n(node.covered)} of ${n(node.size)} elements in this branch are mapped, by ${n(node.mappedBelow)} of your elements${
    through
      ? `. ${n(through)} more ${through === 1 ? 'is' : 'are'} covered through other frameworks, by ${n(node.mappedThroughBelow)} of your elements`
      : ''
  }`;
  return (
    <Tooltip content={tip}>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <CoverageBar
          covered={node.covered}
          through={through}
          total={node.size}
          label={`${node.name}: mapped in this branch`}
          className={wide ? 'flex-1' : through ? 'w-10' : 'w-14'}
        />
        <span
          className={cn(
            'shrink-0 text-[11px] tabular',
            node.covered ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {n(node.covered)}/{n(node.size)}
          {through > 0 && (
            <span className="text-muted-foreground">
              {' '}
              +{n(through)}
              <span className="sr-only"> through other frameworks</span>
            </span>
          )}
        </span>
      </span>
    </Tooltip>
  );
}
