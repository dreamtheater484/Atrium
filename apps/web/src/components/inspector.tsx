import { typeDef } from '@atrium/schema';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
  TypeIcon,
  toast,
} from '@atrium/ui';
import { useNavigate } from '@tanstack/react-router';
import { Expand, Link2, MoreHorizontal, Network, Trash2, X, Zap } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import { useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { setViewing } from '../lib/live';
import { queryClient, useDeleteElement, useElement, useElements } from '../lib/queries';
import { inspect, useUi } from '../lib/store';
import {
  CoreFields,
  ElementHeaderMeta,
  HealthPanel,
  Relations,
  Suggestions,
  TitleField,
} from './element-editor';

/**
 * The inspector: click anything anywhere and its details open on the right,
 * without leaving the page you're on.
 */
export function Inspector() {
  const id = useUi((s) => s.inspectId);
  const q = useElement(id);
  const el = q.data;
  const navigate = useNavigate();
  const remove = useDeleteElement();
  const domains = useElements({ type: 'domain', limit: 200 }, { enabled: !!id });
  const domainNames = useMemo(
    () => new Map((domains.data?.items ?? []).map((d) => [d.id, d.name])),
    [domains.data],
  );

  useEffect(() => {
    setViewing(id);
  }, [id]);

  useEffect(() => {
    if (q.isError) inspect(null);
  }, [q.isError]);

  return (
    <D.Root open={!!id} onOpenChange={(o) => !o && inspect(null)} modal={false}>
      <D.Portal>
        <D.Content
          onInteractOutside={(e) => {
            // Keep the panel open while clicking around the page; it follows your selection.
            const target = e.target as HTMLElement;
            if (
              target.closest('main') ||
              target.closest('[data-radix-popper-content-wrapper]') ||
              target.closest('[role="dialog"]')
            )
              e.preventDefault();
          }}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="no-print fixed top-14 right-0 bottom-0 z-40 flex w-[440px] max-w-[100vw] flex-col border-l border-border bg-surface shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right-6 data-[state=open]:duration-200"
          aria-describedby={undefined}
        >
          <D.Title className="sr-only">{el?.name ?? 'Details'}</D.Title>
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            {el && <TypeIcon type={el.type} size="sm" />}
            <span className="text-xs font-medium text-muted-foreground">
              {el ? typeDef(el.type).label : 'Loading'}
            </span>
            <div className="flex-1" />
            {el && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    navigate({
                      to: '/explore',
                      search: { view: 'graph', focus: el.id, type: el.type },
                    })
                  }
                >
                  <Zap /> Impact
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Open full page"
                  onClick={() => navigate({ to: '/e/$id', params: { id: el.id } })}
                >
                  <Expand />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label="More">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onSelect={() => {
                        void navigator.clipboard.writeText(`${location.origin}/e/${el.id}`);
                        toast.success('Link copied');
                      }}
                    >
                      <Link2 /> Copy link
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        navigate({
                          to: '/explore',
                          search: { view: 'graph', focus: el.id, type: el.type },
                        })
                      }
                    >
                      <Network /> Show in graph
                    </DropdownMenuItem>
                    {el.layer === 'org' && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-act-foreground"
                          onSelect={() => {
                            const name = el.name;
                            remove.mutate(el.id, {
                              onSuccess: (res) => {
                                inspect(null);
                                if (res.mode === 'direct') {
                                  toast(`Removed ${name}`, {
                                    description: 'You can undo this from Changes → History.',
                                    action: {
                                      label: 'Undo',
                                      onClick: () => void undoLast(res.changesetId),
                                    },
                                  });
                                }
                              },
                            });
                          }}
                        >
                          <Trash2 /> Remove
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            <D.Close asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Close">
                <X />
              </Button>
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {!el ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-7 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <TitleField el={el} className="-ml-1" />
                  <ElementHeaderMeta el={el} />
                </div>
                <HealthPanel el={el} />
                <Suggestions el={el} domainNames={domainNames} />
                <section>
                  <CoreFields el={el} compact />
                </section>
                <section className="border-t border-border pt-4">
                  <h4 className="mb-2 text-xs font-semibold">Connections</h4>
                  <Relations el={el} compact />
                </section>
                {el.children.length > 0 && (
                  <section className="border-t border-border pt-4">
                    <h4 className="mb-2 text-xs font-semibold">Contains · {el.children.length}</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {el.children.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => inspect(c.id)}
                          className="rounded-lg border border-border px-2 py-0.5 text-[13px] hover:bg-surface-2"
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export async function undoLast(changesetId: string) {
  try {
    await api(`/changesets/${changesetId}/undo`, { method: 'POST' });
    toast.success('Undone');
    await queryClient.invalidateQueries({ queryKey: ['model'] });
  } catch (e) {
    toast.error((e as Error).message);
  }
}
