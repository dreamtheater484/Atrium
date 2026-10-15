import type { FrameworkNode } from '@atrium/schema';
import { cn, Progress, Tooltip } from '@atrium/ui';

/** How much of a branch is mapped: a bar and "covered/size", with the detail on hover. */
export function BranchCoverage({ node, wide }: { node: FrameworkNode; wide?: boolean }) {
  const pct = node.size ? (node.covered / node.size) * 100 : 0;
  return (
    <Tooltip
      content={`${node.covered} of ${node.size} elements in this branch are mapped, by ${node.mappedBelow} of your elements`}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Progress
          value={pct > 0 ? Math.max(pct, 4) : 0}
          tone="good"
          label={`${node.name}: mapped in this branch`}
          className={wide ? 'flex-1' : 'w-14'}
        />
        <span
          className={cn(
            'shrink-0 text-[11px] tabular',
            node.covered ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {node.covered.toLocaleString('en-GB')}/{node.size.toLocaleString('en-GB')}
        </span>
      </span>
    </Tooltip>
  );
}
