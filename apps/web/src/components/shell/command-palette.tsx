import type { AskAnswer } from '@atrium/schema';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  Dialog,
  DialogContent,
  DialogTitle,
  TypeIcon,
} from '@atrium/ui';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import {
  ArrowRight,
  Blocks,
  Bot,
  CalendarRange,
  ChartColumn,
  FileUp,
  GitPullRequestArrow,
  House,
  Moon,
  Network,
  Plus,
  Settings,
  Sparkles,
  Table2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useScenario, useSearch } from '../../lib/queries';
import { inspect, openAdd, openImport, ui, useUi } from '../../lib/store';
import { useTheme } from '../../lib/theme';

const QUESTION = /^(what|which|who|where|how|show|list|is|are|does|do|find|why|when)\b|\?$/i;

export function CommandPalette() {
  const open = useUi((s) => s.commandOpen);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const router = useRouter();
  const { resolved, setTheme } = useTheme();
  const scenario = useScenario();
  const search = useSearch(q, { limit: 12, layer: 'all' });
  const ask = useMutation({
    mutationFn: (question: string) => api<AskAnswer>('/ask', { body: { q: question, scenario } }),
  });
  const isQuestion = QUESTION.test(q.trim()) && q.trim().split(/\s+/).length >= 2;
  const hits = search.data ?? [];
  // Offer to ask only once the search is done, so a quick Enter opens the top result rather
  // than asking a question while results are still on their way.
  const settled = !search.isFetching && !search.isPlaceholderData;
  const offerAsk = !!q && (isQuestion || (settled && hits.length === 0));
  const top = isQuestion || !hits.length ? (offerAsk ? '__ask' : '') : hits[0]!.id;
  const [selected, setSelected] = useState('');
  useEffect(() => setSelected(top), [top]);

  useEffect(() => {
    if (!open) {
      setQ('');
      ask.reset();
    }
  }, [open, ask.reset]);

  const close = () => ui.set({ commandOpen: false });
  const go = (fn: () => void) => {
    close();
    fn();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => ui.set({ commandOpen: o })}>
      <DialogContent
        className="top-[18%] max-w-[620px] translate-y-0 overflow-hidden p-0"
        hideClose
      >
        <DialogTitle className="sr-only">Search or ask</DialogTitle>
        <Command
          shouldFilter={false}
          loop
          value={q ? selected : undefined}
          onValueChange={setSelected}
        >
          <CommandInput
            value={q}
            onValueChange={(v) => {
              setQ(v);
              if (ask.data) ask.reset();
            }}
            placeholder="Search anything, or ask: what depends on Billing?"
          />
          {ask.data ? (
            <div className="max-h-[60vh] overflow-y-auto p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" /> {ask.data.interpretation}
              </div>
              <p className="mb-3 text-[13px] leading-relaxed">{ask.data.answer}</p>
              <div className="flex flex-col gap-0.5">
                {ask.data.elements.slice(0, 15).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
                    onClick={() => go(() => inspect(e.id))}
                  >
                    <TypeIcon type={e.type} size="xs" />
                    {e.name}
                  </button>
                ))}
              </div>
              {ask.data.link && (
                <button
                  type="button"
                  className="mt-3 flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
                  onClick={() => go(() => router.history.push(ask.data!.link!.to))}
                >
                  {ask.data.link.label} <ArrowRight className="size-3.5" />
                </button>
              )}
            </div>
          ) : (
            <CommandList>
              {q && !search.isFetching && !isQuestion && (
                <CommandEmpty>No matches. Try fewer words, or ask a question.</CommandEmpty>
              )}
              {offerAsk && (
                <CommandGroup heading="Ask Atrium">
                  <CommandItem value="__ask" onSelect={() => ask.mutate(q)}>
                    <Sparkles className="text-primary" />
                    <span className="flex-1">{ask.isPending ? 'Thinking…' : `“${q}”`}</span>
                    <span className="text-[11px] text-muted-foreground">Enter</span>
                  </CommandItem>
                </CommandGroup>
              )}
              {q && hits.length > 0 && (
                <CommandGroup heading="Results">
                  {hits.map((h) => (
                    <CommandItem key={h.id} value={h.id} onSelect={() => go(() => inspect(h.id))}>
                      <TypeIcon type={h.type} size="sm" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{h.name}</span>
                        {h.snippet && (
                          <span className="truncate text-[11px] text-muted-foreground">
                            {h.snippet}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {h.layer === 'reference' ? 'Reference' : (h.domainName ?? '')}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {!q && (
                <>
                  <CommandGroup heading="Go to">
                    <CommandItem onSelect={() => go(() => navigate({ to: '/' }))}>
                      <House /> Home
                    </CommandItem>
                    <CommandItem
                      onSelect={() =>
                        go(() =>
                          navigate({
                            to: '/explore',
                            search: { type: 'application', view: 'table' },
                          }),
                        )
                      }
                    >
                      <Table2 /> Applications
                    </CommandItem>
                    <CommandItem
                      onSelect={() =>
                        go(() =>
                          navigate({ to: '/explore', search: { type: 'capability', view: 'map' } }),
                        )
                      }
                    >
                      <Blocks /> Capability map
                    </CommandItem>
                    <CommandItem
                      onSelect={() =>
                        go(() =>
                          navigate({
                            to: '/explore',
                            search: { type: 'application', view: 'graph' },
                          }),
                        )
                      }
                    >
                      <Network /> Dependency graph
                    </CommandItem>
                    <CommandItem onSelect={() => go(() => navigate({ to: '/dashboards' }))}>
                      <ChartColumn /> Dashboards
                    </CommandItem>
                    <CommandItem onSelect={() => go(() => navigate({ to: '/roadmap' }))}>
                      <CalendarRange /> Roadmap
                    </CommandItem>
                    <CommandItem onSelect={() => go(() => navigate({ to: '/changes' }))}>
                      <GitPullRequestArrow /> Changes
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                  <CommandGroup heading="Do">
                    <CommandItem onSelect={() => go(() => openAdd(null))}>
                      <Plus /> Add an element
                    </CommandItem>
                    <CommandItem onSelect={() => go(() => openImport())}>
                      <FileUp /> Import a file
                    </CommandItem>
                    <CommandItem onSelect={() => go(() => ui.set({ connectAgentOpen: true }))}>
                      <Bot /> Connect a coding agent
                    </CommandItem>
                    <CommandItem
                      onSelect={() => go(() => setTheme(resolved === 'dark' ? 'light' : 'dark'))}
                    >
                      <Moon /> Switch to {resolved === 'dark' ? 'light' : 'dark'} mode
                    </CommandItem>
                    <CommandItem onSelect={() => go(() => navigate({ to: '/settings' }))}>
                      <Settings /> Settings
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          )}
        </Command>
      </DialogContent>
    </Dialog>
  );
}
