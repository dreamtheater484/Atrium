import {
  type AttributeDef,
  ELEMENT_TYPE_DEFS,
  type ElementRow,
  type ElementType,
  enumLabel,
  LIFECYCLE_PHASES,
  typeDef,
} from '@atrium/schema';
import {
  Badge,
  Button,
  Checkbox,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  formatDate,
  formatMoney,
  HealthBadge,
  LifecycleBadge,
  MarkBadge,
  Progress,
  Rating,
  Skeleton,
  TimeBadge,
  toast,
  Tooltip,
  TypeIcon,
} from '@atrium/ui';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ClipboardPaste, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useDeleteElement, useElements, useUpdateElement } from '../../lib/queries';
import { inspect, openAdd, openImport, useUi } from '../../lib/store';
import { ElementPicker } from '../element-picker';
import { AttributeField, InlineText } from '../fields';

function attrCell(def: AttributeDef, value: unknown) {
  if (value === undefined || value === null || value === '') return <span className="text-subtle-foreground">—</span>;
  switch (def.kind) {
    case 'currency':
      return <span className="tabular">{formatMoney(Number(value))}</span>;
    case 'rating':
      return <Rating value={value as number} />;
    case 'date':
      return <span className="tabular">{formatDate(value as string)}</span>;
    case 'percent':
      return <span className="tabular">{String(value)}%</span>;
    case 'number':
      return <span className="tabular">{Number(value).toLocaleString('en-GB')}</span>;
    case 'list':
      return <span className="truncate">{Array.isArray(value) ? value.join(', ') : String(value)}</span>;
    case 'enum':
      return def.key === 'time' ? <TimeBadge value={value as string} /> : <span>{enumLabel(value as string)}</span>;
    default:
      return <span className="truncate">{String(value)}</span>;
  }
}

/** A cell that shows a value and becomes an editor on click (autosaves). */
function EditableCell({ row, def }: { row: ElementRow; def: AttributeDef }) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateElement();
  if (row.layer === 'reference') return attrCell(def, row.attributes[def.key]);
  if (def.kind === 'rating') {
    return <Rating value={row.attributes[def.key] as number} onChange={(v) => update.mutate({ id: row.id, patch: { attributes: { [def.key]: v } } })} />;
  }
  if (!editing) {
    return (
      <button type="button" className="flex h-full w-full items-center truncate text-left" onClick={(e) => { e.stopPropagation(); setEditing(true); }}>
        {attrCell(def, row.attributes[def.key])}
      </button>
    );
  }
  return (
    <div onClick={(e) => e.stopPropagation()} onBlur={() => setTimeout(() => setEditing(false), 150)} className="w-full">
      <AttributeField
        def={def}
        value={row.attributes[def.key]}
        onSave={(v) => {
          update.mutate({ id: row.id, patch: { attributes: { [def.key]: v as never } } });
          setEditing(false);
        }}
      />
    </div>
  );
}

function SortIcon({ dir }: { dir: false | 'asc' | 'desc' }) {
  if (!dir) return null;
  return dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
}

export function TableView({
  type,
  q,
  gaps,
  health,
}: {
  type?: ElementType;
  q?: string;
  gaps?: boolean;
  health?: string;
  onToggleGaps?: () => void;
}) {
  const at = useUi((s) => s.at) ?? undefined;
  const { data, isLoading } = useElements({ type, q, gaps, health, at, limit: 5000 });
  const update = useUpdateElement();
  const remove = useDeleteElement();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const def = type ? ELEMENT_TYPE_DEFS[type] : null;

  const columns = useMemo<ColumnDef<ElementRow>[]>(() => {
    const cols: ColumnDef<ElementRow>[] = [
      {
        id: 'select',
        size: 36,
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all"
            checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? 'indeterminate' : false}
            onCheckedChange={(c) => table.toggleAllRowsSelected(!!c)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox aria-label={`Select ${row.original.name}`} checked={row.getIsSelected()} onCheckedChange={(c) => row.toggleSelected(!!c)} onClick={(e) => e.stopPropagation()} />
        ),
        enableSorting: false,
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Name',
        size: 300,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={(e) => { e.stopPropagation(); inspect(r.id); }}>
              <TypeIcon type={r.type} size="sm" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-medium hover:underline" style={{ paddingLeft: typeDef(r.type).hierarchical ? (r.level - 1) * 12 : 0 }}>
                    {r.name}
                  </span>
                  <MarkBadge mark={r.mark} />
                  {Object.keys(r.suggestions ?? {}).length > 0 && <Sparkles className="size-3 text-primary" />}
                </span>
                {r.key && <span className="block truncate font-mono text-[10px] text-subtle-foreground">{r.key}</span>}
              </span>
            </button>
          );
        },
      },
    ];
    if (!type || type !== 'domain') {
      cols.push({ id: 'domain', accessorKey: 'domainName', header: 'Domain', size: 140, cell: ({ getValue }) => <span className="truncate text-muted-foreground">{(getValue() as string) ?? '—'}</span> });
    }
    cols.push({
      id: 'owner',
      accessorKey: 'owner',
      header: 'Owner',
      size: 150,
      cell: ({ row }) =>
        row.original.layer === 'reference' ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div onClick={(e) => e.stopPropagation()} className="w-full">
            <InlineText value={row.original.owner} placeholder="Add owner" onSave={(owner) => update.mutate({ id: row.original.id, patch: { owner } })} className="-mx-1.5" />
          </div>
        ),
    });
    if (!def || def.hasLifecycle) {
      cols.push({
        id: 'lifecycle',
        accessorKey: 'lifecycle',
        header: 'Lifecycle',
        size: 110,
        sortingFn: (a, b) => LIFECYCLE_PHASES.indexOf(a.original.lifecycle as never) - LIFECYCLE_PHASES.indexOf(b.original.lifecycle as never),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button type="button" className="rounded-md">
                <LifecycleBadge lifecycle={row.original.lifecycle} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-36">
              {LIFECYCLE_PHASES.map((p) => (
                <DropdownMenuItem key={p} onSelect={() => update.mutate({ id: row.original.id, patch: { lifecycle: p } })}>
                  <LifecycleBadge lifecycle={p} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      });
    }
    if (!type || type === 'application' || type === 'technology') {
      cols.push({
        id: 'health',
        accessorKey: 'health',
        header: 'Health',
        size: 100,
        sortingFn: (a, b) => ['act', 'watch', 'good', null].indexOf(a.original.health) - ['act', 'watch', 'good', null].indexOf(b.original.health),
        cell: ({ row }) => (
          <Tooltip content={row.original.healthReasons.join(' · ') || null}>
            <span>
              <HealthBadge health={row.original.health} />
            </span>
          </Tooltip>
        ),
      });
    }
    if (def) {
      for (const a of def.attributes.filter((x) => x.column)) {
        cols.push({
          id: `attr:${a.key}`,
          accessorFn: (r) => r.attributes[a.key] as never,
          header: a.label,
          size: a.kind === 'rating' ? 110 : a.kind === 'currency' ? 120 : 130,
          cell: ({ row }) => <EditableCell row={row.original} def={a} />,
        });
      }
    }
    if (type === 'application') {
      cols.push({
        id: 'capabilities',
        accessorFn: (r) => r.capabilityNames.join(', '),
        header: 'Supports',
        size: 200,
        cell: ({ row }) => <span className="truncate text-muted-foreground">{row.original.capabilityNames.join(', ') || '—'}</span>,
      });
      cols.push({
        id: 'teams',
        accessorFn: (r) => r.teamNames.join(', '),
        header: 'Team',
        size: 140,
        cell: ({ row }) => <span className="truncate text-muted-foreground">{row.original.teamNames.join(', ') || '—'}</span>,
      });
    }
    cols.push({
      id: 'quality',
      accessorKey: 'quality',
      header: 'Complete',
      size: 100,
      cell: ({ row }) =>
        row.original.layer === 'reference' ? null : (
          <span className="flex w-full items-center gap-2">
            <Progress value={row.original.quality} tone={row.original.quality >= 85 ? 'good' : row.original.quality >= 60 ? 'watch' : 'act'} />
            <span className="w-8 text-right text-[11px] text-muted-foreground tabular">{row.original.quality}%</span>
          </span>
        ),
    });
    return cols;
  }, [type, def, update]);

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    state: { sorting, rowSelection: selection },
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    getRowId: (r) => r.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => 44, overscan: 12 });
  const selected = Object.keys(selection).filter((k) => selection[k]);
  const width = table.getTotalSize();

  const bulk = (patch: Parameters<typeof update.mutate>[0]['patch']) => {
    for (const id of selected) update.mutate({ id, patch });
    toast.success(`Updated ${selected.length} item${selected.length === 1 ? '' : 's'}`);
    setSelection({});
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-6">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <EmptyState
        icon={<Plus />}
        title={q || gaps || health ? 'Nothing matches' : `No ${def?.plural.toLowerCase() ?? 'elements'} yet`}
        className="mt-16"
        action={
          !q && !gaps && (
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => openAdd(type ?? null)}>
                Add {def?.label.toLowerCase() ?? 'something'}
              </Button>
              <Button onClick={() => openImport()}>Import a file</Button>
            </div>
          )
        }
      >
        {q || gaps || health ? 'Try a different filter.' : 'Add them one by one, import a spreadsheet, or paste rows straight from Excel.'}
      </EmptyState>
    );
  }

  return (
    <div
      className="relative flex h-full flex-col"
      onPaste={(e) => {
        const target = e.target as HTMLElement;
        if (['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
        const text = e.clipboardData.getData('text/plain');
        if (text.includes('\t') && text.includes('\n')) {
          e.preventDefault();
          openImport([new File([text], `pasted-${type ?? 'rows'}.tsv`, { type: 'text/tab-separated-values' })]);
        }
      }}
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" tabIndex={-1}>
        <div style={{ minWidth: width }} className="text-[13px]">
          <div className="sticky top-0 z-10 flex border-b border-border bg-surface-2/90 backdrop-blur">
            {table.getHeaderGroups()[0]!.headers.map((h) => (
              <div
                key={h.id}
                style={{ width: h.getSize(), flex: h.column.id === 'name' ? `1 0 ${h.getSize()}px` : undefined }}
                className={cn('flex h-9 shrink-0 items-center gap-1 px-3 text-xs font-medium text-muted-foreground', h.column.getCanSort() && 'cursor-pointer select-none hover:text-foreground')}
                onClick={h.column.getToggleSortingHandler()}
              >
                {flexRender(h.column.columnDef.header, h.getContext())}
                <SortIcon dir={h.column.getIsSorted()} />
              </div>
            ))}
          </div>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index]!;
              return (
                <div
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className="group absolute left-0 flex w-full cursor-default border-b border-border transition-colors hover:bg-surface-2/60 data-[state=selected]:bg-primary-soft/50"
                  style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}
                  onClick={() => inspect(row.original.id)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <div
                      key={cell.id}
                      style={{ width: cell.column.getSize(), flex: cell.column.id === 'name' ? `1 0 ${cell.column.getSize()}px` : undefined }}
                      className="flex shrink-0 items-center overflow-hidden px-3"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-border bg-surface px-4 text-xs text-muted-foreground">
        <span className="tabular">
          {rows.length.toLocaleString('en-GB')} {rows.length === 1 ? (def?.label.toLowerCase() ?? 'item') : (def?.plural.toLowerCase() ?? 'items')}
        </span>
        <span className="hidden items-center gap-1 md:flex">
          · <ClipboardPaste className="size-3" /> Paste rows from Excel to add them
        </span>
      </div>
      {selected.length > 0 && (
        <div className="absolute bottom-12 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
          <Badge tone="primary" className="mx-1">{selected.length} selected</Badge>
          {type !== 'domain' && (
            <ElementPicker
              types={['domain']}
              onChange={(v) => v && bulk({ domainId: v.id })}
              trigger={<Button size="sm" variant="ghost">Set domain</Button>}
            />
          )}
          {(!def || def.hasLifecycle) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost">Set lifecycle</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Lifecycle</DropdownMenuLabel>
                {LIFECYCLE_PHASES.map((p) => (
                  <DropdownMenuItem key={p} onSelect={() => bulk({ lifecycle: p })}>
                    <LifecycleBadge lifecycle={p} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-act-foreground"
            onClick={() => {
              for (const id of selected) remove.mutate(id);
              toast(`Removed ${selected.length} item${selected.length === 1 ? '' : 's'}`, { description: 'Undo from Changes → History.' });
              setSelection({});
            }}
          >
            <Trash2 /> Remove
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setSelection({})} aria-label="Clear selection">
            <X />
          </Button>
        </div>
      )}
    </div>
  );
}
