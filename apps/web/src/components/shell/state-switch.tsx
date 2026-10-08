import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  formatDate,
  Tooltip,
} from '@atrium/ui';
import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, FlaskConical, Plus, Target, X } from 'lucide-react';
import { useState } from 'react';
import { useWorkspace } from '../../lib/queries';
import { ui, useUi } from '../../lib/store';
import { NewScenarioDialog } from '../scenarios/new-scenario-dialog';

/** Today / Target / Scenario: which version of the model you're looking at. Plain words, no git. */
export function StateSwitch() {
  const scenario = useUi((s) => s.scenario);
  const ws = useWorkspace().data;
  const [creating, setCreating] = useState(false);
  const target = ws?.scenarios.find((s) => s.isTarget);
  const others = ws?.scenarios.filter((s) => !s.isTarget) ?? [];
  const current = ws?.scenarios.find((s) => s.id === scenario);
  const isOther = scenario !== 'today' && scenario !== 'target' && !current?.isTarget;

  const pill = (active: boolean) =>
    cn(
      'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-all',
      active
        ? 'bg-surface text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground',
    );

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5"
      role="tablist"
      aria-label="Model version"
    >
      <button
        type="button"
        role="tab"
        aria-selected={scenario === 'today'}
        className={pill(scenario === 'today')}
        onClick={() => ui.set({ scenario: 'today', at: null })}
      >
        Today
      </button>
      {target ? (
        <Tooltip
          content={
            target.targetDate
              ? `Target state for ${formatDate(target.targetDate)}`
              : 'Agreed target state'
          }
        >
          <button
            type="button"
            role="tab"
            aria-selected={scenario === 'target' || current?.isTarget}
            className={pill(scenario === 'target' || !!current?.isTarget)}
            onClick={() => ui.set({ scenario: 'target', at: null })}
          >
            <Target className="size-3.5" />
            {target.name}
          </button>
        </Tooltip>
      ) : (
        <button type="button" className={pill(false)} onClick={() => setCreating(true)}>
          <Target className="size-3.5" /> Plan target
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={pill(isOther)} aria-label="Scenarios">
            {isOther && current ? (
              <>
                <FlaskConical className="size-3.5" />
                <span className="max-w-[140px] truncate">{current.name}</span>
              </>
            ) : (
              'Scenarios'
            )}
            <ChevronDown className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>What-if scenarios</DropdownMenuLabel>
          {others.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No scenarios yet.</div>
          )}
          {others.map((s) => (
            <DropdownMenuItem key={s.id} onSelect={() => ui.set({ scenario: s.id, at: null })}>
              <FlaskConical />
              <span className="flex-1 truncate">{s.name}</span>
              <span className="text-[11px] text-muted-foreground tabular">{s.changeCount}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus /> New scenario
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewScenarioDialog open={creating} onOpenChange={setCreating} makeTarget={!target} />
    </div>
  );
}

export function ScenarioBanner() {
  const scenario = useUi((s) => s.scenario);
  const ws = useWorkspace().data;
  const navigate = useNavigate();
  if (scenario === 'today') return null;
  const current =
    scenario === 'target'
      ? ws?.scenarios.find((s) => s.isTarget)
      : ws?.scenarios.find((s) => s.id === scenario);
  if (!current) return null;
  return (
    <div className="no-print flex h-9 shrink-0 items-center gap-2 border-b border-primary/20 bg-primary-soft px-4 text-[13px] text-primary-soft-foreground">
      {current.isTarget ? <Target className="size-4" /> : <FlaskConical className="size-4" />}
      <span className="font-medium">{current.name}</span>
      <span className="hidden opacity-80 md:inline">
        · Changes you make here only affect this {current.isTarget ? 'target state' : 'scenario'}
        {current.changeCount ? ` (${current.changeCount} so far)` : ''}.
      </span>
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        className="text-primary-soft-foreground hover:bg-primary/10"
        onClick={() => navigate({ to: '/changes', search: { tab: 'scenarios', id: current.id } })}
      >
        See what's different
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-primary-soft-foreground hover:bg-primary/10"
        aria-label="Back to today"
        onClick={() => ui.set({ scenario: 'today', at: null })}
      >
        <X />
      </Button>
    </div>
  );
}
