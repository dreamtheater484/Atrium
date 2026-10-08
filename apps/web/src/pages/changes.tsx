import type { Changeset, Scenario } from '@atrium/schema';
import { RELATION_TYPE_DEFS } from '@atrium/schema';
import {
  Avatar,
  Badge,
  Button,
  Card,
  cn,
  EmptyState,
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  TypeIcon,
  timeAgo,
  toast,
} from '@atrium/ui';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  Bot,
  Check,
  CircleSlash,
  FlaskConical,
  GitPullRequestArrow,
  History,
  Inbox,
  Minus,
  Plus,
  Target,
  Undo2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useChangeset, useChangesetAction, useChangesets, useChangesSummary } from '../lib/changes';
import { useInvalidateModel, useMe, useWorkspace } from '../lib/queries';
import { inspect, ui } from '../lib/store';

type Tab = 'review' | 'mine' | 'history' | 'scenarios';

function AuthorAvatar({ c }: { c: Changeset }) {
  if (c.authorKind === 'agent' || c.authorKind === 'ci') {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Bot className="size-3.5" />
      </span>
    );
  }
  return <Avatar name={c.authorName ?? '?'} />;
}

function StatusBadge({ c }: { c: Changeset }) {
  const map: Record<string, [string, 'neutral' | 'primary' | 'good' | 'watch' | 'act']> = {
    draft: ['Draft', 'neutral'],
    open: ['Waiting for review', 'watch'],
    applied: ['Applied', 'good'],
    rejected: ['Declined', 'act'],
    withdrawn: ['Withdrawn', 'neutral'],
  };
  const [label, tone] = map[c.status] ?? [c.status, 'neutral'];
  return <Badge tone={tone}>{label}</Badge>;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object')
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${k}: ${x}`)
      .join(', ');
  return String(v);
}

function Detail({ id, onDone }: { id: string; onDone: () => void }) {
  const { data } = useChangeset(id);
  const action = useChangesetAction();
  const me = useMe().data;
  const [note, setNote] = useState('');
  const [title, setTitle] = useState('');
  const invalidate = useInvalidateModel();
  const discard = useMutation({
    mutationFn: (changeId: string) =>
      api(`/changesets/${id}/changes/${changeId}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(),
  });
  useEffect(
    () => setTitle(data?.title === 'Suggested changes' ? '' : (data?.title ?? '')),
    [data?.title],
  );
  if (!data) return <Skeleton className="h-80" />;
  const run = (a: 'approve' | 'reject' | 'withdraw' | 'undo' | 'submit') =>
    action.mutate(
      { id, action: a, note: note || undefined, title: title || undefined },
      {
        onSuccess: (r) => {
          toast.success(
            r?.message ??
              {
                approve: 'Approved and applied',
                reject: 'Declined',
                withdraw: 'Withdrawn',
                undo: 'Undone',
                submit: 'Sent for review',
              }[a],
          );
          if (a !== 'undo') onDone();
        },
      },
    );
  const mineDraft =
    data.status === 'draft' && data.authorId === me?.id && data.kind === 'suggestion';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <AuthorAvatar c={data} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">{data.title}</h2>
          <p className="text-[13px] text-muted-foreground">
            {data.authorName} · {timeAgo(data.submittedAt ?? data.createdAt)} ·{' '}
            {data.changes.length} change{data.changes.length === 1 ? '' : 's'}
            {data.authorKind === 'agent'
              ? ' · proposed by an AI coding agent'
              : data.authorKind === 'ci'
                ? ' · synced from a repository'
                : ''}
          </p>
        </div>
        <StatusBadge c={data} />
      </div>
      {data.description && (
        <p className="rounded-xl bg-surface-2 p-3 text-[13px] whitespace-pre-wrap">
          {data.description}
        </p>
      )}
      {data.decisionNote && (
        <p className="text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">{data.reviewerName}:</span>{' '}
          {data.decisionNote}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {data.changes.map((c) => (
          <Card key={c.id} className="p-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-md',
                  c.op === 'create'
                    ? 'bg-good-soft text-good-foreground'
                    : c.op === 'delete'
                      ? 'bg-act-soft text-act-foreground'
                      : 'bg-primary-soft text-primary-soft-foreground',
                )}
              >
                {c.op === 'create' ? (
                  <Plus className="size-3" />
                ) : c.op === 'delete' ? (
                  <Minus className="size-3" />
                ) : (
                  <span className="text-[10px] font-bold">~</span>
                )}
              </span>
              {c.entity === 'element' && <TypeIcon type={c.type as never} size="xs" />}
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-[13px] font-medium hover:underline"
                onClick={() => c.entity === 'element' && inspect(c.entityId)}
              >
                {c.entity === 'relation' ? `Link: ${c.name}` : c.name}
              </button>
              <span className="text-[11px] text-muted-foreground">
                {c.op === 'create'
                  ? c.entity === 'relation'
                    ? 'New link'
                    : 'New'
                  : c.op === 'delete'
                    ? 'Removed'
                    : `${c.fields.length} field${c.fields.length === 1 ? '' : 's'}`}
              </span>
              {(mineDraft || (data.kind === 'scenario' && data.status === 'draft')) && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Drop this change"
                  onClick={() => discard.mutate(c.id)}
                >
                  <X />
                </Button>
              )}
            </div>
            {c.fields.length > 0 && (
              <div className="mt-2 grid grid-cols-[110px_1fr_1fr] gap-x-3 gap-y-1 text-[12.5px]">
                {c.fields.map((f) => (
                  <div key={f.field} className="contents">
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="truncate rounded bg-act-soft/60 px-1.5 text-act-foreground line-through decoration-1">
                      {fmt(f.before)}
                    </span>
                    <span className="truncate rounded bg-good-soft/70 px-1.5 text-good-foreground">
                      {fmt(f.after)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
        {data.changes.length === 0 && (
          <p className="text-[13px] text-muted-foreground">No changes left in this set.</p>
        )}
      </div>
      {data.canReview && (
        <Card className="flex flex-col gap-2 p-3">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for the author"
          />
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => run('approve')} disabled={action.isPending}>
              <Check /> Approve and apply
            </Button>
            <Button onClick={() => run('reject')} disabled={action.isPending}>
              <CircleSlash /> Decline
            </Button>
          </div>
        </Card>
      )}
      {mineDraft && (
        <Card className="flex flex-col gap-2 p-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Give it a title, e.g. Update CRM ownership"
          />
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why? (optional, helps the reviewer)"
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() =>
                action.mutate(
                  {
                    id,
                    action: 'submit',
                    title: title || undefined,
                    description: note || undefined,
                  },
                  {
                    onSuccess: () => {
                      toast.success('Sent for review');
                      onDone();
                    },
                  },
                )
              }
              disabled={!data.changes.length}
            >
              <GitPullRequestArrow /> Submit for review
            </Button>
            <Button onClick={() => run('withdraw')}>Discard all</Button>
          </div>
        </Card>
      )}
      {data.status === 'open' && data.authorId === me?.id && !data.canReview && (
        <Button className="self-start" onClick={() => run('withdraw')}>
          Withdraw
        </Button>
      )}
      {data.status === 'applied' && (
        <Button className="self-start" onClick={() => run('undo')}>
          <Undo2 /> Undo this change
        </Button>
      )}
    </div>
  );
}

function ScenarioStatus({ s }: { s: Scenario }) {
  return s.reviewStatus === 'agreed' ? (
    <Badge tone="good">
      <Check /> Agreed
    </Badge>
  ) : s.reviewStatus === 'in_review' ? (
    <Badge tone="primary">In review</Badge>
  ) : (
    <Badge>Draft</Badge>
  );
}

function ScenarioPanel({ id }: { id: string }) {
  const ws = useWorkspace().data;
  const scenario = ws?.scenarios.find((s) => s.id === id);
  const sets = useChangesets({ scenarioId: id, kind: 'scenario', status: 'draft' }).data ?? [];
  const invalidate = useInvalidateModel();
  const apply = useMutation({
    mutationFn: () => api<{ applied: number }>(`/scenarios/${id}/apply`, { method: 'POST' }),
    onSuccess: () => {
      invalidate();
      ui.set({ scenario: 'today' });
      toast.success('Scenario applied to today');
    },
  });
  const makeTarget = useMutation({
    mutationFn: () => api(`/scenarios/${id}`, { method: 'PATCH', body: { isTarget: true } }),
    onSuccess: () => invalidate(),
  });
  const me = useMe().data;
  const reviewer = !!me && (me.mode === 'solo' || me.role === 'admin' || me.role === 'architect');
  const [note, setNote] = useState('');
  const review = useMutation({
    mutationFn: (v: { kind: 'submit' | 'agree' | 'send_back' }) =>
      v.kind === 'submit'
        ? api(`/scenarios/${id}/submit`, { body: { note: note || undefined } })
        : api(`/scenarios/${id}/review`, { body: { decision: v.kind, note: note || undefined } }),
    onSuccess: (_, v) => {
      invalidate();
      setNote('');
      toast.success(
        v.kind === 'submit'
          ? 'Sent for review'
          : v.kind === 'agree'
            ? 'Agreed. Today is unchanged until you apply it.'
            : 'Sent back to the author',
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!scenario) return null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
          {scenario.isTarget ? <Target className="size-4" /> : <FlaskConical className="size-4" />}
        </span>
        <div className="flex-1">
          <h2 className="text-lg font-semibold tracking-tight">{scenario.name}</h2>
          <p className="text-[13px] text-muted-foreground">
            {scenario.description || 'No description'}
          </p>
        </div>
      </div>
      <Card className="flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <ScenarioStatus s={scenario} />
          <span className="text-muted-foreground">
            {scenario.reviewStatus === 'in_review'
              ? `Submitted by ${scenario.submittedBy ?? 'someone'} ${timeAgo(scenario.submittedAt)}`
              : scenario.reviewStatus === 'agreed'
                ? `Agreed by ${scenario.reviewedBy ?? 'a reviewer'} ${timeAgo(scenario.reviewedAt)}`
                : scenario.reviewedBy
                  ? `Sent back by ${scenario.reviewedBy} ${timeAgo(scenario.reviewedAt)}`
                  : 'Not reviewed yet'}
          </span>
        </div>
        {scenario.reviewNote && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px]">{scenario.reviewNote}</p>
        )}
        {(scenario.reviewStatus === 'draft' ||
          (scenario.reviewStatus === 'in_review' && reviewer)) && (
          <>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                scenario.reviewStatus === 'draft'
                  ? 'What should reviewers look at? (optional)'
                  : 'Note for the author (optional)'
              }
            />
            <div className="flex gap-2">
              {scenario.reviewStatus === 'draft' ? (
                <Button
                  variant="primary"
                  disabled={!scenario.changeCount || review.isPending}
                  onClick={() => review.mutate({ kind: 'submit' })}
                >
                  <GitPullRequestArrow /> Submit for review
                </Button>
              ) : (
                <>
                  <Button
                    variant="primary"
                    disabled={review.isPending}
                    onClick={() => review.mutate({ kind: 'agree' })}
                  >
                    <Check /> Agree
                  </Button>
                  <Button
                    disabled={review.isPending}
                    onClick={() => review.mutate({ kind: 'send_back' })}
                  >
                    <Undo2 /> Send back
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => ui.set({ scenario: scenario.isTarget ? 'target' : scenario.id })}
        >
          View this scenario
        </Button>
        {!scenario.isTarget && (
          <Button onClick={() => makeTarget.mutate()}>Make it the target</Button>
        )}
        <Button onClick={() => apply.mutate()} disabled={apply.isPending}>
          Apply to today
        </Button>
      </div>
      {sets.map((s) => (
        <Detail key={s.id} id={s.id} onDone={() => {}} />
      ))}
      {sets.length === 0 && (
        <p className="text-[13px] text-muted-foreground">
          No differences from today yet. Switch to the scenario and start editing.
        </p>
      )}
    </div>
  );
}

export function ChangesPage() {
  const search = useSearch({ from: '/changes' }) as { id?: string; tab?: string };
  const navigate = useNavigate({ from: '/changes' });
  const summary = useChangesSummary().data;
  const ws = useWorkspace().data;
  const tab =
    (search.tab as Tab) ??
    (summary?.waitingForReview ? 'review' : summary?.myDraftChanges ? 'mine' : 'history');
  const filter =
    tab === 'review'
      ? { status: 'open' }
      : tab === 'mine'
        ? { mine: true, status: 'draft,open,rejected', kind: 'suggestion' }
        : { status: 'applied', limit: 200 };
  const list = useChangesets(filter);
  const selected = search.id;
  const waitingScenarios = (ws?.scenarios ?? []).filter((s) => s.reviewStatus === 'in_review');

  return (
    <div className="mx-auto flex h-full max-w-[1320px] flex-col px-6 py-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Changes</h1>
        <p className="text-[13px] text-muted-foreground">
          Suggestions waiting for review, your own drafts, and everything that changed.
        </p>
      </div>
      <Tabs
        className="flex min-h-0 flex-1 flex-col"
        value={tab}
        onValueChange={(t) => navigate({ search: { tab: t } })}
      >
        <TabsList>
          <TabsTrigger value="review">
            <Inbox /> Waiting for review{' '}
            {summary?.waitingForReview ? (
              <Badge tone="primary">{summary.waitingForReview}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="mine">
            <GitPullRequestArrow /> Your suggestions{' '}
            {summary?.myDraftChanges ? (
              <Badge tone="watch">{summary.myDraftChanges} unsent</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History /> History
          </TabsTrigger>
          <TabsTrigger value="scenarios">
            <FlaskConical /> Scenarios
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value={tab}
          className="mt-4 grid min-h-0 flex-1 gap-5 lg:grid-cols-[380px_1fr]"
        >
          <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
            {tab === 'scenarios'
              ? (ws?.scenarios ?? []).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => navigate({ search: { tab, id: s.id } })}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2',
                      selected === s.id && 'bg-surface-2',
                    )}
                  >
                    {s.isTarget ? (
                      <Target className="size-4 text-primary" />
                    ) : (
                      <FlaskConical className="size-4 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{s.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {s.changeCount} differences from today
                      </span>
                    </span>
                    {s.reviewStatus !== 'draft' && <ScenarioStatus s={s} />}
                  </button>
                ))
              : list.isLoading
                ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)
                : [
                    ...(tab === 'review' ? waitingScenarios : []).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => navigate({ search: { tab: 'scenarios', id: s.id } })}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <span className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-primary">
                          {s.isTarget ? (
                            <Target className="size-3.5" />
                          ) : (
                            <FlaskConical className="size-3.5" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{s.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {s.submittedBy} · {timeAgo(s.submittedAt)} · {s.changeCount} differences
                          </span>
                        </span>
                        <Badge tone="primary">Scenario</Badge>
                      </button>
                    )),
                    ...(list.data ?? []).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => navigate({ search: { tab, id: c.id } })}
                        className={cn(
                          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2',
                          selected === c.id && 'bg-surface-2',
                        )}
                      >
                        <AuthorAvatar c={c} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{c.title}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {c.authorName} · {timeAgo(c.decidedAt ?? c.submittedAt ?? c.createdAt)}{' '}
                            · {c.changeCount}
                          </span>
                        </span>
                        {tab !== 'history' && <StatusBadge c={c} />}
                      </button>
                    )),
                  ]}
            {tab !== 'scenarios' &&
              !list.isLoading &&
              !list.data?.length &&
              !(tab === 'review' && waitingScenarios.length) && (
                <EmptyState
                  icon={tab === 'review' ? <Inbox /> : <History />}
                  title={
                    tab === 'review'
                      ? 'Nothing to review'
                      : tab === 'mine'
                        ? 'No suggestions'
                        : 'No history yet'
                  }
                >
                  {tab === 'review'
                    ? "When people or agents suggest changes, they'll appear here."
                    : tab === 'mine'
                      ? 'When you edit something you don’t own, your edits collect here until you submit them.'
                      : ''}
                </EmptyState>
              )}
          </div>
          <div className="min-h-0 overflow-y-auto pb-10">
            {selected ? (
              tab === 'scenarios' ? (
                <ScenarioPanel id={selected} />
              ) : (
                <Detail id={selected} onDone={() => navigate({ search: { tab } })} />
              )
            ) : (
              <EmptyState
                icon={<GitPullRequestArrow />}
                title="Pick something on the left"
                className="mt-16"
              >
                Every change shows exactly what was different, field by field.{' '}
                {RELATION_TYPE_DEFS.supports ? '' : ''}
              </EmptyState>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
