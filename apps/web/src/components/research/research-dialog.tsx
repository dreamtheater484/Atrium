import { enumLabel } from '@atrium/schema';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
  Skeleton,
  TypeIcon,
} from '@atrium/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Globe, ListOrdered, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';
import { api } from '../../lib/api';
import { useInvalidateModel } from '../../lib/queries';
import { ui, useUi } from '../../lib/store';

interface Candidates {
  provider: { name: string; label: string; live: boolean };
  candidates: Array<{
    id: string;
    name: string;
    type: 'technology' | 'application';
    reason: 'missing' | 'stale';
  }>;
  withheld: number;
  limit: number;
  maxClassification: string;
}

interface Job {
  id: string;
  status: 'running' | 'done' | 'failed';
  total: number;
  done: number;
  found: number;
  provider: string;
  changesetId: string | null;
  error: string | null;
}

export function openResearch() {
  ui.set({ researchOpen: true });
}

/**
 * Finds missing end-of-support dates: endoflife.date first, then the AI provider with web
 * search. What it finds comes back as one suggestion to review, with a source for every date.
 */
export function ResearchDialog() {
  const open = useUi((s) => s.researchOpen);
  const close = () => ui.set({ researchOpen: false });
  const navigate = useNavigate();
  const invalidate = useInvalidateModel();
  const data = useQuery({
    queryKey: ['research', 'support'],
    queryFn: () => api<Candidates>('/research/support'),
    enabled: open,
    staleTime: 0,
  });
  const start = useMutation({
    mutationFn: () => api<Job>('/research/support', { body: {} }),
  });
  const jobId = start.data?.id;
  const job = useQuery({
    queryKey: ['research', 'job', jobId],
    queryFn: () => api<Job>(`/research/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data?.status === 'running' || !q.state.data ? 1500 : false),
  });
  const current = job.data ?? start.data;
  const finished = current && current.status !== 'running';
  useEffect(() => {
    if (finished) invalidate();
  }, [finished, invalidate]);
  useEffect(() => {
    if (!open) start.reset();
  }, [open, start.reset]);

  const c = data.data;
  const count = Math.min(c?.candidates.length ?? 0, c?.limit ?? 0);
  const extra = c?.provider.live ? c.provider.label : null;
  const ai = c?.provider.name === 'anthropic';

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? openResearch() : close())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Find end-of-support dates</DialogTitle>
          <DialogDescription>
            {extra
              ? `Checks endoflife.date first, then ${extra}. You review every date and its source before anything changes.`
              : 'Checks endoflife.date. You review every date before anything changes.'}
          </DialogDescription>
        </DialogHeader>

        {!c ? (
          <Skeleton className="h-28" />
        ) : current ? (
          <div className="flex flex-col gap-3 py-1">
            <Progress
              value={(current.done / Math.max(1, current.total)) * 100}
              label="Research progress"
            />
            <p className="text-[13px] text-muted-foreground" aria-live="polite">
              {current.status === 'running'
                ? `Looked up ${current.done} of ${current.total}… ${current.found} found so far.`
                : current.status === 'failed'
                  ? (current.error ?? 'Research stopped.')
                  : current.found
                    ? `Found dates for ${current.found} of ${current.total}. They are waiting for your review.`
                    : `Nothing found for these ${current.total}. ${extra ? '' : 'Connect an AI provider to search vendor sites as well.'}`}
            </p>
          </div>
        ) : count === 0 ? (
          <p className="py-2 text-[13px] text-muted-foreground">
            Every technology and vendor product has an end-of-support date, or was checked recently.
            {c.withheld
              ? ` ${c.withheld} more are classified above ${enumLabel(c.maxClassification).toLowerCase()} and are not sent out.`
              : ''}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-2">
              {c.candidates.slice(0, count).map((x) => (
                <div key={x.id} className="flex items-center gap-2 text-[13px]">
                  <TypeIcon type={x.type} size="xs" />
                  <span className="min-w-0 flex-1 truncate">{x.name}</span>
                  {x.reason === 'stale' && (
                    <span className="text-[11px] text-muted-foreground">check again</span>
                  )}
                </div>
              ))}
            </div>
            <ul className="flex flex-col gap-1.5 text-[12.5px] text-muted-foreground">
              {c.candidates.length > count && (
                <li className="flex gap-2">
                  <ListOrdered className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  The {count} most important of {c.candidates.length} first: technologies many
                  applications use, then the most critical applications. Run it again for the rest.
                </li>
              )}
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
                Only product names, vendors and versions are looked up
                {c.withheld
                  ? `; ${c.withheld} item${c.withheld === 1 ? ' is' : 's are'} classified above ${enumLabel(c.maxClassification).toLowerCase()} and stay${c.withheld === 1 ? 's' : ''} private`
                  : ''}
                .
              </li>
              <li className="flex gap-2">
                <Globe className="mt-0.5 size-3.5 shrink-0 text-primary" />
                {ai
                  ? 'Each lookup searches the web and costs a few cents.'
                  : extra
                    ? `Results come from ${extra}.`
                    : 'No AI provider is connected, so only endoflife.date is checked. See Settings to connect one.'}
              </li>
            </ul>
          </div>
        )}

        <DialogFooter>
          {finished && current?.changesetId ? (
            <Button
              variant="primary"
              onClick={() => {
                close();
                navigate({ to: '/changes', search: { id: current.changesetId! } });
              }}
            >
              Review {current.found} date{current.found === 1 ? '' : 's'} <ArrowRight />
            </Button>
          ) : finished ? (
            <Button onClick={close}>Close</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!count || !!current || start.isPending}
                onClick={() => start.mutate()}
              >
                {current ? 'Looking up…' : `Look up ${count} date${count === 1 ? '' : 's'}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
