import { Button, cn, Tooltip } from '@atrium/ui';
import { Clock, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { ui, useUi } from '../lib/store';

function quarters(fromYear: number, toYear: number) {
  const out: string[] = [];
  for (let y = fromYear; y <= toYear; y++)
    for (const m of ['01', '04', '07', '10']) out.push(`${y}-${m}-01`);
  return out;
}

function label(iso: string) {
  const [y, m] = iso.split('-');
  return `Q${Math.floor((Number(m) - 1) / 3) + 1} ${y}`;
}

/** Move through time: the model as it was, is, or is planned to be on a date. */
export function TimeSlider({ className }: { className?: string }) {
  const at = useUi((s) => s.at);
  const year = new Date().getFullYear();
  const steps = useMemo(() => quarters(year - 2, year + 4), [year]);
  const today = new Date().toISOString().slice(0, 10);
  const todayIndex = steps.findIndex((s) => s > today) - 1;
  const index = at
    ? Math.max(
        0,
        steps.findIndex((s) => s >= at),
      )
    : todayIndex;
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Clock className="size-3.5 text-muted-foreground" />
      <input
        type="range"
        min={0}
        max={steps.length - 1}
        step={1}
        value={index}
        aria-label="Model date"
        onChange={(e) => {
          const i = Number(e.target.value);
          ui.set({ at: i === todayIndex ? null : steps[i]! });
        }}
        className="h-1.5 w-40 cursor-pointer accent-[var(--primary)]"
      />
      <span
        className={cn(
          'w-16 text-xs font-medium tabular',
          at ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {at ? label(at) : 'Today'}
      </span>
      {at && (
        <Tooltip content="Back to today">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => ui.set({ at: null })}
            aria-label="Back to today"
          >
            <RotateCcw />
          </Button>
        </Tooltip>
      )}
    </div>
  );
}
