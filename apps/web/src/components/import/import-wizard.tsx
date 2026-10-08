import {
  ELEMENT_TYPE_DEFS,
  ELEMENT_TYPE_LIST,
  type ElementType,
  enumLabel,
  LIFECYCLE_PHASES,
  RELATION_COLUMNS,
  typeDef,
} from '@atrium/schema';
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Progress,
  Select,
  TypeIcon,
  toast,
} from '@atrium/ui';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Check,
  ChevronDown,
  ChevronRight,
  EyeOff,
  FileUp,
  Link2,
  Sparkles,
  TriangleAlert,
  Undo2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { useInvalidateModel } from '../../lib/queries';
import { ui, useUi } from '../../lib/store';

type Target =
  | { kind: 'core'; field: string }
  | { kind: 'attribute'; key: string }
  | { kind: 'relation'; relation: string; direction: 'out' | 'in'; targetType: ElementType }
  | { kind: 'lifecycle_date'; phase: string }
  | { kind: 'level'; level: number }
  | { kind: 'ignore' };

interface SheetPreview {
  index: number;
  file: string;
  name: string;
  rows: number;
  role: 'elements' | 'relations' | 'skip';
  type: ElementType;
  typeReason: string;
  confidence: number;
  remembered: boolean;
  columns: Array<{
    header: string;
    target: Target;
    label: string;
    confidence: number;
    samples: string[];
  }>;
  outcome: { create: number; update: number; unchanged: number; similar: number; skipped: number };
  examples: Array<{
    row: number;
    name: string;
    outcome: 'create' | 'update' | 'unchanged';
    match?: string;
    how?: string;
    fields?: string[];
  }>;
  warnings: string[];
}

interface Preview {
  importId: string;
  files: Array<{ name: string; format: string; warnings: string[] }>;
  sheets: SheetPreview[];
  models: Array<{
    file: string;
    elements: number;
    relations: number;
    byType: Record<string, number>;
  }>;
  totals: { create: number; update: number; unchanged: number; relations: number };
  mode: 'direct' | 'suggestion';
}

interface Result {
  changesetId: string | null;
  applied: boolean;
  created: number;
  updated: number;
  linked: number;
  warnings: string[];
}

const encode = (t: Target) => JSON.stringify(t);

function targetOptions(type: ElementType) {
  const def = ELEMENT_TYPE_DEFS[type];
  const opts: Array<{ value: string; label: string; hint?: string }> = [
    { value: encode({ kind: 'ignore' }), label: 'Ignore this column' },
    ...[
      'name',
      'key',
      'description',
      'owner',
      'domain',
      'parent',
      'lifecycle',
      'classification',
      'tags',
      'team',
      'external_id',
    ].map((f) => ({
      value: encode({ kind: 'core', field: f }),
      label: {
        name: 'Name',
        key: 'Key',
        description: 'Description',
        owner: 'Owner',
        domain: 'Domain',
        parent: 'Part of',
        lifecycle: 'Lifecycle',
        classification: 'Classification',
        tags: 'Tags',
        team: 'Team',
        external_id: 'ID in source system',
      }[f]!,
      hint: 'Field',
    })),
    ...def.attributes.map((a) => ({
      value: encode({ kind: 'attribute', key: a.key }),
      label: a.label,
      hint: 'Field',
    })),
    ...LIFECYCLE_PHASES.map((p) => ({
      value: encode({ kind: 'lifecycle_date', phase: p }),
      label: `${enumLabel(p)} date`,
      hint: 'Date',
    })),
    ...RELATION_COLUMNS.map((r) => ({
      value: encode({
        kind: 'relation',
        relation: r.relation,
        direction: r.direction,
        targetType: r.targetType,
      }),
      label: `${r.relation.replace('_', ' ')} → ${typeDef(r.targetType).plural.toLowerCase()}`,
      hint: 'Link',
    })),
    ...[1, 2, 3].map((l) => ({
      value: encode({ kind: 'level', level: l }),
      label: `Hierarchy level ${l}`,
      hint: 'Level',
    })),
  ];
  return opts;
}

function SheetCard({
  sheet,
  preview,
  onChange,
}: {
  sheet: SheetPreview;
  preview: Preview;
  onChange: (p: Preview) => void;
}) {
  const [open, setOpen] = useState(sheet.role === 'elements' && sheet.confidence < 0.75);
  const patch = useMutation({
    mutationFn: (body: {
      role?: SheetPreview['role'];
      type?: ElementType;
      columns?: Record<string, Target>;
    }) =>
      api<Preview>(`/import/${preview.importId}/sheets/${sheet.index}`, { method: 'PATCH', body }),
    onSuccess: onChange,
  });
  const def = typeDef(sheet.type);
  const mapped = sheet.columns.filter((c) => c.target.kind !== 'ignore').length;
  const kind = sheet.role === 'elements' ? sheet.type : `role:${sheet.role}`;
  return (
    <div className="rounded-xl border border-border">
      <div className="flex flex-wrap items-center gap-3 p-3">
        {sheet.role === 'elements' ? (
          <TypeIcon type={sheet.type} size="md" />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground">
            {sheet.role === 'relations' ? (
              <Link2 className="size-4" />
            ) : (
              <EyeOff className="size-4" />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            {sheet.name}
            {sheet.remembered && (
              <Badge tone="primary">
                <Sparkles /> Same layout as last time
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {sheet.role === 'elements'
              ? `${sheet.rows} rows from ${sheet.file} · ${mapped} of ${sheet.columns.length} columns recognised`
              : `${sheet.rows} rows from ${sheet.file} · ${sheet.typeReason}`}
          </div>
        </div>
        <div className="w-44">
          <Select
            size="sm"
            value={kind}
            onValueChange={(v) =>
              v &&
              patch.mutate(
                v.startsWith('role:')
                  ? { role: v.slice(5) as SheetPreview['role'] }
                  : { type: v as ElementType },
              )
            }
            options={[
              ...ELEMENT_TYPE_LIST.map((d) => ({ value: d.type, label: d.plural })),
              { value: 'role:relations', label: 'Links between elements' },
              { value: 'role:skip', label: 'Skip this sheet' },
            ]}
            aria-label="These rows are"
          />
        </div>
      </div>
      {sheet.role === 'relations' && (
        <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2 text-xs">
          <Badge tone="good">{sheet.outcome.create} new links</Badge>
          <Badge>{sheet.outcome.unchanged} already there</Badge>
          {sheet.warnings.length > 0 && (
            <Badge tone="watch">{sheet.warnings.length} rows not understood</Badge>
          )}
        </div>
      )}
      {sheet.role === 'elements' && (
        <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2 text-xs">
          <Badge tone="good">{sheet.outcome.create} new</Badge>
          <Badge tone="primary">{sheet.outcome.update} updated</Badge>
          <Badge>{sheet.outcome.unchanged} unchanged</Badge>
          {sheet.outcome.similar > 0 && (
            <Badge tone="watch">{sheet.outcome.similar} matched by similar name</Badge>
          )}
          {sheet.outcome.skipped > 0 && (
            <Badge tone="act">{sheet.outcome.skipped} rows skipped</Badge>
          )}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="ml-auto flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}{' '}
            Check columns
          </button>
        </div>
      )}
      {open && sheet.role === 'elements' && (
        <div className="border-t border-border p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_220px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-[12.5px]">
            <div className="text-[11px] font-medium text-muted-foreground">Column in your file</div>
            <div className="text-[11px] font-medium text-muted-foreground">Becomes</div>
            <div className="text-[11px] font-medium text-muted-foreground">Example values</div>
            {sheet.columns.map((c) => (
              <div key={c.header} className="contents">
                <div className="flex items-center gap-1.5 truncate font-medium">
                  {c.target.kind !== 'ignore' && c.confidence >= 0.8 ? (
                    <Check className="size-3.5 shrink-0 text-good" />
                  ) : c.target.kind !== 'ignore' ? (
                    <TriangleAlert className="size-3.5 shrink-0 text-watch" />
                  ) : (
                    <span className="size-3.5" />
                  )}
                  <span className="truncate">{c.header}</span>
                </div>
                <Select
                  size="sm"
                  value={encode(c.target)}
                  onValueChange={(v) =>
                    v && patch.mutate({ columns: { [c.header]: JSON.parse(v) } })
                  }
                  options={targetOptions(sheet.type)}
                  aria-label={`Map ${c.header}`}
                />
                <div className="truncate text-muted-foreground">{c.samples.join(' · ') || '—'}</div>
              </div>
            ))}
          </div>
          {sheet.examples.length > 0 && (
            <div className="mt-3 flex flex-col gap-1 text-xs">
              {sheet.examples.slice(0, 6).map((e) => (
                <div key={e.row} className="flex items-center gap-2">
                  <span className="w-10 text-muted-foreground tabular">Row {e.row}</span>
                  <Badge
                    tone={
                      e.outcome === 'create'
                        ? 'good'
                        : e.outcome === 'update'
                          ? 'primary'
                          : 'neutral'
                    }
                  >
                    {e.outcome === 'create' ? 'New' : e.outcome === 'update' ? 'Update' : 'Same'}
                  </Badge>
                  <span className="truncate">{e.name}</span>
                  {e.match && e.how === 'similar' && (
                    <span className="text-watch-foreground">matches “{e.match}”</span>
                  )}
                  {e.fields && (
                    <span className="truncate text-muted-foreground">
                      changes {e.fields.join(', ')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {sheet.warnings.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-xs text-watch-foreground">
              {sheet.warnings.slice(0, 5).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Atrium remembers these choices for the next file with the same columns. {def.label}{' '}
            names already in Atrium are updated, not duplicated.
          </p>
        </div>
      )}
    </div>
  );
}

/** Journey J2: drop a spreadsheet, check the summary, click Import. */
export function ImportWizard() {
  const open = useUi((s) => s.importOpen);
  const files = useUi((s) => s.importFiles);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const invalidate = useInvalidateModel();
  const navigate = useNavigate();

  const upload = useMutation({
    mutationFn: (list: File[]) => {
      const form = new FormData();
      for (const f of list) form.append('file', f, f.name);
      return api<Preview>('/import/preview', { body: form });
    },
    onSuccess: (p) => {
      setPreview(p);
      setError(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'The file could not be read.'),
  });
  const apply = useMutation({
    mutationFn: () => api<Result>(`/import/${preview!.importId}/apply`, { body: {} }),
    onSuccess: (r) => {
      setResult(r);
      invalidate();
    },
  });
  const undo = useMutation({
    mutationFn: () => api(`/changesets/${result!.changesetId}/undo`, { body: {} }),
    onSuccess: () => {
      invalidate();
      toast.success('Import undone');
      close();
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: start when opened with files
  useEffect(() => {
    if (open && files.length) upload.mutate(files);
    if (!open) {
      setPreview(null);
      setResult(null);
      setError(null);
    }
  }, [open, files]);

  const close = () => ui.set({ importOpen: false, importFiles: [] });
  const mainType = preview?.sheets[0]?.type;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{result ? 'Import finished' : 'Import'}</DialogTitle>
          <DialogDescription>
            {result
              ? result.applied
                ? 'Everything is in the model. You can undo the whole import with one click.'
                : 'Your import was sent for review, because some of it touches domains you don’t own.'
              : 'Excel, CSV, ArchiMate exchange files, Backstage catalog files and atrium.yaml. Atrium works out what each column means.'}
          </DialogDescription>
        </DialogHeader>

        {!preview && !result && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const list = Array.from(e.dataTransfer.files);
              if (list.length) upload.mutate(list);
            }}
            className={cn(
              'flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border px-6 py-12 text-center transition hover:border-primary hover:bg-primary-soft/30',
              upload.isPending && 'pointer-events-none opacity-70',
            )}
          >
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              {upload.isPending ? (
                <Upload className="size-5 animate-bounce" />
              ) : (
                <FileUp className="size-5" />
              )}
            </span>
            <span className="text-sm font-semibold">
              {upload.isPending ? 'Reading your file…' : 'Drop files here, or click to choose'}
            </span>
            <span className="text-xs text-muted-foreground">
              Tip: you can also paste rows from Excel straight into any table.
            </span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".xlsx,.csv,.tsv,.txt,.json,.xml,.yaml,.yml"
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                if (list.length) upload.mutate(list);
                e.target.value = '';
              }}
            />
          </button>
        )}
        {error && (
          <p className="rounded-lg bg-act-soft px-3 py-2 text-[13px] text-act-foreground">
            {error}
          </p>
        )}

        {preview && !result && (
          <div className="flex max-h-[62vh] flex-col gap-3 overflow-y-auto pr-1">
            <div className="grid grid-cols-4 gap-2">
              {[
                ['New', preview.totals.create, 'text-good-foreground'],
                ['Updated', preview.totals.update, 'text-primary-soft-foreground'],
                ['Unchanged', preview.totals.unchanged, 'text-muted-foreground'],
                ['Links', preview.totals.relations, 'text-foreground'],
              ].map(([l, v, cls]) => (
                <div key={l as string} className="rounded-xl bg-surface-2 p-3">
                  <div className={cn('text-xl font-semibold tabular', cls as string)}>
                    {v as number}
                  </div>
                  <div className="text-xs text-muted-foreground">{l}</div>
                </div>
              ))}
            </div>
            {preview.sheets.map((s) => (
              <SheetCard key={s.index} sheet={s} preview={preview} onChange={setPreview} />
            ))}
            {preview.models.map((m) => (
              <div key={m.file} className="rounded-xl border border-border p-3 text-[13px]">
                <div className="font-semibold">{m.file}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {Object.entries(m.byType).map(([t, n]) => (
                    <Badge key={t}>
                      {n}{' '}
                      {n === 1
                        ? typeDef(t as ElementType).label.toLowerCase()
                        : typeDef(t as ElementType).plural.toLowerCase()}
                    </Badge>
                  ))}
                  <Badge>{m.relations} links</Badge>
                </div>
              </div>
            ))}
            {preview.files.flatMap((f) => f.warnings).length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Notes from reading the file</summary>
                <ul className="mt-1 list-disc pl-5">
                  {preview.files
                    .flatMap((f) => f.warnings)
                    .slice(0, 10)
                    .map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {preview && !result && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {preview.mode === 'direct'
                ? 'Applied straight away, and you can undo it.'
                : 'Sent to an architect for review.'}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Choose another file
              </Button>
              <Button variant="primary" onClick={() => apply.mutate()} disabled={apply.isPending}>
                {apply.isPending
                  ? 'Importing…'
                  : `Import ${preview.totals.create + preview.totals.update} items`}
              </Button>
            </div>
          </div>
        )}
        {apply.isPending && <Progress value={70} className="animate-pulse" />}

        {result && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Added', result.created],
                ['Updated', result.updated],
                ['Links', result.linked],
              ].map(([l, v]) => (
                <div key={l as string} className="rounded-xl bg-good-soft p-3">
                  <div className="text-xl font-semibold text-good-foreground tabular">
                    {v as number}
                  </div>
                  <div className="text-xs text-good-foreground/80">{l}</div>
                </div>
              ))}
            </div>
            {result.warnings.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {result.warnings.slice(0, 6).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <div className="flex justify-between gap-2">
              {result.applied && result.changesetId && (
                <Button variant="ghost" onClick={() => undo.mutate()} disabled={undo.isPending}>
                  <Undo2 /> Undo import
                </Button>
              )}
              <div className="flex-1" />
              <Button
                variant="primary"
                onClick={() => {
                  close();
                  if (mainType === 'capability')
                    navigate({ to: '/explore', search: { type: 'capability', view: 'map' } });
                  else
                    navigate({
                      to: '/explore',
                      search: { type: mainType ?? 'application', gaps: true },
                    });
                }}
              >
                {mainType === 'capability' ? 'Open the capability map' : 'Fill the gaps'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
