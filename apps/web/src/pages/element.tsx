import type { ImpactResult } from '@atrium/schema';
import { typeDef } from '@atrium/schema';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  TypeIcon,
  timeAgo,
} from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, History, MessageSquare, Network, Undo2, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  CoreFields,
  ElementHeaderMeta,
  HealthPanel,
  Relations,
  Suggestions,
  TitleField,
} from '../components/element-editor';
import { api } from '../lib/api';
import { useChangesetAction, useChangesets } from '../lib/changes';
import { setViewing } from '../lib/live';
import { useElement, useElements, useScenario } from '../lib/queries';
import { inspect } from '../lib/store';

interface Comment {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

function ImpactPanel({ id }: { id: string }) {
  const scenario = useScenario();
  const { data } = useQuery({
    queryKey: ['model', 'impact', id, scenario],
    queryFn: () => api<ImpactResult>(`/elements/${id}/impact`, { query: { scenario } }),
  });
  const navigate = useNavigate();
  if (!data) return <Skeleton className="h-40" />;
  const byDepth = new Map<number, typeof data.nodes>();
  for (const n of data.nodes) byDepth.set(n.depth, [...(byDepth.get(n.depth) ?? []), n]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-watch-soft p-4 text-watch-foreground">
        <Zap className="size-5" />
        <p className="flex-1 text-[13px] font-medium">{data.summary}</p>
        <Button
          size="sm"
          onClick={() =>
            navigate({ to: '/explore', search: { view: 'graph', focus: id, type: data.root.type } })
          }
        >
          <Network /> Show as graph
        </Button>
      </div>
      {[...byDepth.entries()].map(([depth, nodes]) => (
        <div key={depth}>
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
            {depth === 1 ? 'Directly affected' : `${depth} steps away`} · {nodes.length}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {nodes.map((n) => (
              <button
                key={n.element.id}
                type="button"
                onClick={() => inspect(n.element.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-[13px] shadow-sm hover:border-border-strong"
              >
                <TypeIcon type={n.element.type} size="xs" /> {n.element.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryPanel({ id }: { id: string }) {
  const { data } = useChangesets({
    elementId: id,
    status: 'applied,open,rejected',
    limit: 50,
  } as never);
  const action = useChangesetAction();
  const navigate = useNavigate();
  if (!data) return <Skeleton className="h-40" />;
  if (!data.length) return <EmptyState icon={<History />} title="No history yet" />;
  return (
    <ol className="relative ml-3 border-l border-border">
      {data.map((c) => (
        <li key={c.id} className="mb-4 ml-5">
          <span className="absolute -left-3 mt-0.5">
            <Avatar name={c.authorName ?? '?'} size="sm" />
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="text-[13px] font-medium hover:underline"
              onClick={() => navigate({ to: '/changes', search: { id: c.id, tab: 'history' } })}
            >
              {c.title}
            </button>
            {c.status === 'open' && <Badge tone="watch">Waiting for review</Badge>}
            {c.status === 'rejected' && <Badge tone="act">Declined</Badge>}
            {c.kind === 'import' && <Badge>Import</Badge>}
            {c.authorKind === 'agent' && <Badge tone="primary">Agent</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {c.authorName} · {timeAgo(c.decidedAt ?? c.submittedAt ?? c.createdAt)} ·{' '}
            {c.changeCount} change{c.changeCount === 1 ? '' : 's'}
          </p>
          {c.status === 'applied' && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-1 -ml-2 text-muted-foreground"
              onClick={() => action.mutate({ id: c.id, action: 'undo' })}
            >
              <Undo2 /> Undo
            </Button>
          )}
        </li>
      ))}
    </ol>
  );
}

function CommentsPanel({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['comments', id],
    queryFn: () => api<Comment[]>(`/elements/${id}/comments`),
  });
  const [body, setBody] = useState('');
  const add = useMutation({
    mutationFn: () => api(`/elements/${id}/comments`, { body: { body } }),
    onSuccess: () => {
      setBody('');
      void qc.invalidateQueries({ queryKey: ['comments', id] });
    },
  });
  return (
    <div className="flex flex-col gap-4">
      {(data ?? []).map((c) => (
        <div key={c.id} className="flex gap-3">
          <Avatar name={c.authorName} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{c.authorName}</span> ·{' '}
              {timeAgo(c.createdAt)}
            </p>
            <p className="text-[13px] whitespace-pre-wrap">{c.body}</p>
          </div>
        </div>
      ))}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) add.mutate();
        }}
      >
        <Textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Ask a question or leave a note. Use @name to mention someone."
        />
        <div>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!body.trim() || add.isPending}
          >
            Comment
          </Button>
        </div>
      </form>
    </div>
  );
}

export function ElementPage() {
  const { id } = useParams({ from: '/e/$id' });
  const { data: el, isError } = useElement(id);
  const domains = useElements({ type: 'domain', limit: 200 });
  const domainNames = useMemo(
    () => new Map((domains.data?.items ?? []).map((d) => [d.id, d.name])),
    [domains.data],
  );
  useEffect(() => {
    setViewing(id);
    return () => setViewing(null);
  }, [id]);

  if (isError)
    return (
      <EmptyState title="This element doesn't exist" className="mt-24">
        It may have been removed. You can restore it from Changes → History.
      </EmptyState>
    );
  if (!el) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <Skeleton className="mb-4 h-8 w-1/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  const def = typeDef(el.type);
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-6 py-6">
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Link
          to="/explore"
          search={{ type: el.type }}
          className="flex items-center gap-1 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> {def.plural}
        </Link>
        {el.parentName && (
          <>
            <span>/</span>
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => el.parentId && inspect(el.parentId)}
            >
              {el.parentName}
            </button>
          </>
        )}
      </div>
      <div className="flex items-start gap-4">
        <TypeIcon type={el.type} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <TitleField el={el} className="text-2xl" />
          <ElementHeaderMeta el={el} />
        </div>
      </div>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="impact">
            <Zap /> Impact
          </TabsTrigger>
          <TabsTrigger value="history">
            <History /> History
          </TabsTrigger>
          <TabsTrigger value="comments">
            <MessageSquare /> Comments
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
            <div className="flex flex-col gap-4">
              <HealthPanel el={el} />
              <Suggestions el={el} domainNames={domainNames} />
              <Card className="p-4">
                <CoreFields el={el} />
              </Card>
            </div>
            <div className="flex flex-col gap-4">
              <Card className="p-4">
                <h3 className="mb-3 text-[13px] font-semibold">Connections</h3>
                <Relations el={el} />
              </Card>
              {el.children.length > 0 && (
                <Card className="p-4">
                  <h3 className="mb-2 text-[13px] font-semibold">
                    Contains · {el.children.length}
                  </h3>
                  <div className="flex flex-col">
                    {el.children.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => inspect(c.id)}
                        className="flex items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] hover:bg-surface-2"
                      >
                        <TypeIcon type={c.type} size="xs" /> {c.name}
                      </button>
                    ))}
                  </div>
                </Card>
              )}
              {el.missing.length > 0 && (
                <Card className="p-4">
                  <h3 className="mb-2 text-[13px] font-semibold">Still missing</h3>
                  <ul className="flex flex-col gap-1 text-[13px] text-muted-foreground">
                    {el.missing.map((m) => (
                      <li key={m.field}>· {m.label}</li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="impact" className="pt-5">
          <ImpactPanel id={el.id} />
        </TabsContent>
        <TabsContent value="history" className="pt-5">
          <HistoryPanel id={el.id} />
        </TabsContent>
        <TabsContent value="comments" className="max-w-2xl pt-5">
          <CommentsPanel id={el.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
