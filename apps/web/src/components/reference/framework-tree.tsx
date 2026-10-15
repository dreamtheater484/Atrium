import type { FrameworkNode, FrameworkTree } from '@atrium/schema';
import { Badge, Button, cn, Skeleton, Tooltip } from '@atrium/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Link2 } from 'lucide-react';
import {
  type KeyboardEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BranchCoverage } from './coverage';
import { NodePanel } from './node-panel';

export type FrameworkShow = 'mapped' | 'gaps' | undefined;

interface Model {
  byId: Map<string, FrameworkNode>;
  /** Children in order; the key null holds the top level. */
  children: Map<string | null, FrameworkNode[]>;
  /** Elements that have children. */
  parents: string[];
}

function buildModel(nodes: FrameworkNode[]): Model {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string | null, FrameworkNode[]>();
  for (const n of nodes) {
    const key = n.parentId && byId.has(n.parentId) ? n.parentId : null;
    const list = children.get(key);
    if (list) list.push(n);
    else children.set(key, [n]);
  }
  return { byId, children, parents: [...children.keys()].filter((k): k is string => !!k) };
}

function ancestorsOf(model: Model, id: string): string[] {
  const out: string[] = [];
  let p = model.byId.get(id)?.parentId;
  while (p && model.byId.has(p) && out.length < model.byId.size) {
    out.push(p);
    p = model.byId.get(p)!.parentId;
  }
  return out;
}

/** Search words: every one must appear in the key, name, level, domain or description. */
export function searchWords(q: string): string[] {
  return q.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function matches(n: FrameworkNode, words: string[]) {
  const hay =
    `${n.key ?? ''} ${n.name} ${n.level} ${n.domain ?? ''} ${n.description}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const pattern = new RegExp(
    `(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi',
  );
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-watch-soft text-foreground">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** Expanded branches per framework, kept while you look at another one. */
const remembered = new Map<string, Set<string>>();

interface Row {
  node: FrameworkNode;
  hasChildren: boolean;
  open: boolean;
  match: boolean;
}

const ROW = 36;

/**
 * One framework as a tree: lazy in what it draws (only the expanded branches, and only the rows
 * on screen), so the 3,000 processes of eTOM scroll as smoothly as the 30 of a starter pack.
 * Search and the mapped/gaps filters show the matches inside their branches; a match opens up
 * again to everything below it.
 */
export function FrameworkTreeView({
  data,
  isLoading,
  error,
  q,
  show,
  through = false,
  selected,
  onSelect,
}: {
  data: FrameworkTree | undefined;
  isLoading: boolean;
  error?: Error | null;
  q: string;
  show: FrameworkShow;
  /** Count what's covered through other frameworks as mapped, for the filters. */
  through?: boolean;
  selected: string | undefined;
  onSelect: (id: string | undefined) => void;
}) {
  const model = useMemo(() => buildModel(data?.nodes ?? []), [data]);
  const memoryKey = data ? `${data.pack.id}/${data.framework.id}` : '';
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedFor, setExpandedFor] = useState('');
  // A different framework: back to how it was left, or its top two levels.
  if (data && expandedFor !== memoryKey) {
    const roots = model.children.get(null) ?? [];
    setExpandedFor(memoryKey);
    setExpanded(
      remembered.get(memoryKey) ??
        new Set(
          roots.length <= 12 ? roots.filter((r) => model.children.has(r.id)).map((r) => r.id) : [],
        ),
    );
  }
  useEffect(() => {
    if (expandedFor) remembered.set(expandedFor, expanded);
  }, [expanded, expandedFor]);

  const words = searchWords(useDeferredValue(q));
  const wordsKey = words.join(' ');
  const filtering = words.length > 0 || !!show;

  // What the search and filter pick out, and the branches that lead to them.
  const { included, lead } = useMemo(() => {
    if (!filtering) return { included: null, lead: new Set<string>() };
    const w = wordsKey ? wordsKey.split(' ') : [];
    const mapped = (n: FrameworkNode) => n.mapped > 0 || (through && n.mappedThrough > 0);
    const gap = (n: FrameworkNode) => n.mappedBelow === 0 && !(through && n.mappedThroughBelow > 0);
    const included = new Set<string>();
    for (const n of model.byId.values()) {
      if (show === 'mapped' && !mapped(n)) continue;
      if (show === 'gaps') {
        if (!gap(n)) continue;
        // Without a search, only where a gap starts: the rest of it is inside.
        const parent = n.parentId ? model.byId.get(n.parentId) : undefined;
        if (!w.length && parent && gap(parent)) continue;
      }
      if (w.length && !matches(n, w)) continue;
      included.add(n.id);
    }
    const lead = new Set<string>();
    for (const id of included) for (const a of ancestorsOf(model, id)) lead.add(a);
    return { included, lead };
  }, [filtering, wordsKey, show, through, model]);

  // While filtering, branches leading to matches start open; your clicks override that.
  const [toggles, setToggles] = useState<{ for: unknown; map: Map<string, boolean> }>({
    for: null,
    map: new Map(),
  });
  const filterToggles = useMemo(
    () => (toggles.for === included ? toggles.map : new Map<string, boolean>()),
    [toggles, included],
  );
  const isOpen = useCallback(
    (id: string) => (filtering ? (filterToggles.get(id) ?? lead.has(id)) : expanded.has(id)),
    [filtering, filterToggles, lead, expanded],
  );

  const rows = useMemo(() => {
    const out: Row[] = [];
    const walk = (parent: string | null, free: boolean) => {
      for (const node of model.children.get(parent) ?? []) {
        const match = !!included?.has(node.id);
        if (filtering && !free && !match && !lead.has(node.id)) continue;
        const hasChildren = model.children.has(node.id);
        const open = hasChildren && isOpen(node.id);
        out.push({ node, hasChildren, open, match });
        if (open) walk(node.id, free || match);
      }
    };
    walk(null, false);
    return out;
  }, [model, included, lead, filtering, isOpen]);

  const setOpen = (id: string, open: boolean) => {
    if (filtering) {
      const map = new Map(filterToggles);
      map.set(id, open);
      setToggles({ for: included, map });
    } else {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (open) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  };
  const setAll = (open: boolean) => {
    if (filtering)
      setToggles({ for: included, map: new Map(model.parents.map((id) => [id, open])) });
    else setExpanded(open ? new Set(model.parents) : new Set());
  };

  // Opening an element from elsewhere (a link, the details panel) shows it in the tree.
  const scrollTo = useRef<string | null>(null);
  const [lastSelected, setLastSelected] = useState<string | undefined>(undefined);
  if (selected !== lastSelected && model.byId.size) {
    setLastSelected(selected);
    if (selected && model.byId.has(selected)) {
      scrollTo.current = selected;
      const up = ancestorsOf(model, selected);
      if (filtering) {
        if (up.some((a) => !isOpen(a))) {
          const map = new Map(filterToggles);
          for (const a of up) map.set(a, true);
          setToggles({ for: included, map });
        }
      } else if (up.some((a) => !expanded.has(a))) {
        setExpanded((prev) => new Set([...prev, ...up]));
      }
    }
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW,
    overscan: 16,
    getItemKey: (i) => rows[i]!.node.id,
  });
  useEffect(() => {
    const id = scrollTo.current;
    if (!id) return;
    const i = rows.findIndex((r) => r.node.id === id);
    if (i >= 0) {
      virtualizer.scrollToIndex(i, { align: 'auto' });
      scrollTo.current = null;
    }
  }, [rows, virtualizer]);

  // Keyboard: arrows move, right and left open and close, Enter shows the details.
  const [focusId, setFocusId] = useState<string | null>(null);
  const focusAfterRender = useRef(false);
  const focusIndex = Math.max(
    0,
    rows.findIndex((r) => r.node.id === (focusId ?? selected)),
  );
  useEffect(() => {
    if (!focusAfterRender.current) return;
    focusAfterRender.current = false;
    requestAnimationFrame(() =>
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-node="${rows[focusIndex]?.node.id}"]`)
        ?.focus(),
    );
  });
  const moveTo = (i: number) => {
    const row = rows[Math.max(0, Math.min(rows.length - 1, i))];
    if (!row) return;
    setFocusId(row.node.id);
    focusAfterRender.current = true;
    virtualizer.scrollToIndex(rows.indexOf(row), { align: 'auto' });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const row = rows[focusIndex];
    if (!row) return;
    const handled = () => e.preventDefault();
    switch (e.key) {
      case 'ArrowDown':
        handled();
        moveTo(focusIndex + 1);
        break;
      case 'ArrowUp':
        handled();
        moveTo(focusIndex - 1);
        break;
      case 'Home':
        handled();
        moveTo(0);
        break;
      case 'End':
        handled();
        moveTo(rows.length - 1);
        break;
      case 'ArrowRight':
        handled();
        if (row.hasChildren && !row.open) setOpen(row.node.id, true);
        else if (row.open) moveTo(focusIndex + 1);
        break;
      case 'ArrowLeft': {
        handled();
        if (row.open) setOpen(row.node.id, false);
        else if (row.node.parentId) moveTo(rows.findIndex((r) => r.node.id === row.node.parentId));
        break;
      }
      case 'Enter':
      case ' ':
        handled();
        onSelect(row.node.id);
        break;
    }
  };

  const found = included?.size ?? 0;
  const count = (one: string, many: string) =>
    `${found.toLocaleString('en-GB')} ${found === 1 ? one : many}`;
  const heading = !filtering
    ? 'Name'
    : words.length
      ? count('match', 'matches')
      : show === 'gaps'
        ? through
          ? count(
              'branch with nothing mapped, directly or through links',
              'branches with nothing mapped, directly or through links',
            )
          : count('branch with nothing mapped', 'branches with nothing mapped')
        : through
          ? count(
              'element mapped, directly or through links',
              'elements mapped, directly or through links',
            )
          : count('element with a mapping', 'elements with a mapping');

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-surface-2/90 px-3 text-xs font-medium text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">{data ? heading : 'Name'}</span>
          <Tooltip content="Open everything">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Open everything"
              onClick={() => setAll(true)}
              disabled={!data}
            >
              <ChevronsUpDown />
            </Button>
          </Tooltip>
          <Tooltip content="Close everything">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Close everything"
              onClick={() => setAll(false)}
              disabled={!data}
            >
              <ChevronsDownUp />
            </Button>
          </Tooltip>
          <span className="w-16 text-right">Mapped</span>
          <span className="w-40 pl-4">In this branch</span>
        </div>
        <div ref={scrollRef} className="@container min-h-0 flex-1 overflow-auto">
          {error && !data ? (
            <p className="p-6 text-[13px] text-muted-foreground">
              {error.message || "This framework isn't installed."} Install it under Settings →
              Packs.
            </p>
          ) : isLoading || !data ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-7" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-[13px] text-muted-foreground">
              {show === 'mapped' && !words.length
                ? 'Nothing in your model maps to this framework yet.'
                : show === 'gaps' && !words.length
                  ? 'No gaps: every branch has something mapped to it.'
                  : 'Nothing matches. Try other words.'}
            </p>
          ) : (
            <div
              role="tree"
              aria-label={data.framework.name}
              tabIndex={-1}
              onKeyDown={onKeyDown}
              className="relative text-[13px]"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((vi) => {
                const row = rows[vi.index]!;
                return (
                  <TreeRow
                    key={row.node.id}
                    row={row}
                    words={words}
                    top={vi.start}
                    selected={row.node.id === selected}
                    focusable={vi.index === focusIndex}
                    dimmed={filtering && !row.match}
                    onToggle={() => setOpen(row.node.id, !row.open)}
                    onSelect={() => {
                      setFocusId(row.node.id);
                      onSelect(row.node.id);
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
      <aside
        className="flex w-[380px] shrink-0 flex-col border-l border-border bg-surface"
        aria-label="Details"
      >
        {data && (
          <NodePanel
            tree={data}
            nodeId={selected && model.byId.has(selected) ? selected : undefined}
            onSelect={onSelect}
          />
        )}
      </aside>
    </div>
  );
}

function TreeRow({
  row,
  words,
  top,
  selected,
  focusable,
  dimmed,
  onToggle,
  onSelect,
}: {
  row: Row;
  words: string[];
  top: number;
  selected: boolean;
  focusable: boolean;
  dimmed: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const n = row.node;
  return (
    <div
      role="treeitem"
      aria-level={n.depth}
      aria-expanded={row.hasChildren ? row.open : undefined}
      aria-selected={selected}
      tabIndex={focusable ? 0 : -1}
      data-node={n.id}
      onClick={onSelect}
      className={cn(
        'absolute left-0 flex w-full cursor-default items-center gap-2 border-b border-border/60 pr-3 outline-none transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        selected && 'bg-primary-soft/60 hover:bg-primary-soft/70',
      )}
      style={{
        height: ROW,
        transform: `translateY(${top}px)`,
        paddingLeft: 8 + (n.depth - 1) * 16,
      }}
    >
      {row.hasChildren ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-surface-3 hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', row.open && 'rotate-90')} />
        </button>
      ) : (
        <span className="size-5 shrink-0" />
      )}
      <span
        className={cn('flex min-w-0 flex-1 items-center gap-2', dimmed && 'text-muted-foreground')}
      >
        {n.key && (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular">
            <Highlight text={n.key} words={words} />
          </span>
        )}
        <span className={cn('truncate', row.hasChildren && 'font-medium')}>
          <Highlight text={n.name} words={words} />
        </span>
        <Badge tone="outline" className="shrink-0 font-normal">
          {n.level}
        </Badge>
        {n.links > 0 && (
          <Tooltip content={`${n.links} ${n.links === 1 ? 'link' : 'links'} to other frameworks`}>
            <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground tabular">
              <Link2 className="size-3" />
              {n.links}
              <span className="sr-only"> links to other frameworks</span>
            </span>
          </Tooltip>
        )}
        <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground @4xl:block">
          {n.description.split('\n')[0]}
        </span>
      </span>
      <span className="w-16 shrink-0 text-right">
        {n.mapped > 0 ? (
          <span className="inline-flex min-w-6 justify-center rounded-md bg-good-soft px-1.5 text-[11px] font-semibold text-good-foreground tabular">
            {n.mapped}
            <span className="sr-only"> of your elements map here</span>
          </span>
        ) : n.mappedThrough > 0 ? null : (
          <span className="text-subtle-foreground" aria-hidden>
            –
          </span>
        )}
        {n.mappedThrough > 0 && (
          <Tooltip
            content={`${n.mappedThrough} of your ${n.mappedThrough === 1 ? 'elements covers' : 'elements cover'} this through other frameworks`}
          >
            <span
              data-through
              className={cn(
                'inline-flex min-w-6 justify-center rounded-md px-1 outline-1 -outline-offset-1 outline-good outline-dashed text-[11px] text-good-foreground tabular',
                n.mapped > 0 && 'ml-1',
              )}
            >
              {n.mappedThrough}
              <span className="sr-only"> of your elements reach here through other frameworks</span>
            </span>
          </Tooltip>
        )}
      </span>
      <span className="flex w-40 shrink-0 items-center gap-2 pl-4">
        {row.hasChildren ? <BranchCoverage node={n} /> : null}
      </span>
    </div>
  );
}
