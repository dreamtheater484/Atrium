import type { ElementType } from '@atrium/schema';
import { typeDef } from '@atrium/schema';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  formatDate,
  Input,
  Label,
  TypeIcon,
  toast,
} from '@atrium/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { FileUp, Link2, Map as MapIcon, Package, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useInvalidateModel } from '../../lib/queries';
import { MapToPackDialog } from './map-to-pack-dialog';

interface Pack {
  id: string;
  name: string;
  publisher: string;
  description: string;
  license: string;
  homepage?: string;
  frameworks: Array<{ id: string; name: string; elementType: ElementType; description?: string }>;
  bundled: boolean;
  installed: {
    version: string;
    elements: number;
    installedAt: string;
    frameworks?: Record<string, { elements: number; version?: string }>;
  } | null;
}

interface FilesReport {
  version: string;
  versionFrom: 'entered' | 'files' | 'date';
  files: Array<{
    name: string;
    reader: string | null;
    sheets: Array<{ name: string; loaded: boolean; note: string }>;
    notes: string[];
  }>;
  frameworks: Array<{ id: string; name: string; elementType: ElementType; elements: number }>;
  notes: string[];
}

interface FilesPreview {
  report: FilesReport;
  installedVersion: string | null;
  validation: { ok: boolean; errors: string[]; warnings: string[]; counts: Record<string, number> };
  diff: {
    added: number;
    renamed: number;
    changed: number;
    removed: number;
    unchanged: number;
    removedMapped: Array<{ name: string; mappings: number; replacement: string | null }>;
  };
}

export function PacksPanel() {
  const packs = useQuery({ queryKey: ['packs'], queryFn: () => api<Pack[]>('/packs') });
  const invalidate = useInvalidateModel();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<Pack | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [version, setVersion] = useState('');
  const [preview, setPreview] = useState<FilesPreview | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mapping, setMapping] = useState<Pack | null>(null);

  const refresh = () => {
    invalidate();
    void packs.refetch();
  };
  const install = useMutation({
    mutationFn: (id: string) => api<{ added: number }>(`/packs/${id}/install`, { body: {} }),
    onSuccess: (r) => {
      refresh();
      toast.success(`Installed: ${r.added} reference elements`);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/packs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      toast.success('Pack removed');
    },
  });
  const upload = useMutation({
    mutationFn: ({ install: doInstall }: { install: boolean }) => {
      const form = new FormData();
      for (const f of files) form.append('file', f, f.name);
      return api<
        FilesPreview & {
          added?: number;
          changed?: number;
          renamed?: number;
          removed?: number;
          links?: number;
          moved?: number;
          flagged?: number;
        }
      >(`/packs/${loading!.id}/files`, {
        body: form,
        query: { version: version || undefined, install: doInstall ? 'true' : undefined },
      });
    },
    onSuccess: (r, vars) => {
      if (vars.install) {
        refresh();
        setLoading(null);
        const changes = (r.added ?? 0) + (r.changed ?? 0) + (r.renamed ?? 0) + (r.removed ?? 0);
        toast.success(
          `Installed ${r.report.frameworks.map((f) => f.name).join(', ')} ${r.report.version}. ${count(changes, 'element')} added or updated${r.links ? `, ${count(r.links, 'link')} added` : ''}. ${r.moved ? `${count(r.moved, 'mapping')} moved to new elements. ` : ''}${r.flagged ? `${count(r.flagged, 'mapping')} need a look.` : ''}`,
        );
      } else setPreview(r);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <MapToPackDialog pack={mapping} onOpenChange={(o) => !o && setMapping(null)} />
      <Card className="p-5">
        <h2 className="text-[14px] font-semibold">Industry reference packs</h2>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
          A pack loads a standard reference model as a read-only layer. Link your own capabilities,
          processes, data and applications to it with “maps to”, then compare: where do you match
          the standard, where are the gaps? Only the latest version of a pack is kept; updating
          moves your mappings along.
        </p>
      </Card>
      {(packs.data ?? []).map((p) => (
        <Card key={p.id} className="flex flex-col gap-3 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Package className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-semibold">{p.name}</h3>
                {p.installed ? (
                  <Badge tone="good">Version {p.installed.version} installed</Badge>
                ) : (
                  <Badge>Not installed</Badge>
                )}
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">{p.description}</p>
              <p className="mt-1 text-xs text-subtle-foreground">{p.license}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {p.frameworks.map((f) => {
              const inst = p.installed?.frameworks?.[f.id];
              return (
                <Badge key={f.id} tone={inst ? 'good' : 'outline'}>
                  <TypeIcon type={f.elementType} size="xs" /> {f.name} →{' '}
                  {typeDef(f.elementType).plural.toLowerCase()}
                  {inst &&
                    ` · ${inst.elements.toLocaleString('en-GB')}${inst.version ? ` from ${inst.version}` : ''}`}
                </Badge>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {p.bundled ? (
              <Button
                variant={p.installed ? 'secondary' : 'primary'}
                onClick={() => install.mutate(p.id)}
                disabled={install.isPending}
              >
                {p.installed ? 'Reinstall' : 'Install'}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  setLoading(p);
                  setFiles([]);
                  setPreview(null);
                  setVersion('');
                }}
              >
                <FileUp /> {p.installed ? 'Update with new files' : 'Add source files'}
              </Button>
            )}
            {p.installed && (
              <>
                <Button variant="primary" onClick={() => setMapping(p)}>
                  <Link2 /> Map your model
                </Button>
                <Button
                  onClick={() => {
                    const fw = p.frameworks.find((f) => f.elementType === 'capability');
                    if (fw)
                      navigate({
                        to: '/explore',
                        search: { type: 'capability', view: 'table', layer: 'reference' },
                      });
                    else
                      navigate({
                        to: '/explore',
                        search: {
                          type: p.frameworks[0]?.elementType ?? 'capability',
                          layer: 'reference',
                        },
                      });
                  }}
                >
                  <MapIcon /> Browse
                </Button>
                <Button
                  variant="ghost"
                  className="text-act-foreground"
                  onClick={() => remove.mutate(p.id)}
                >
                  <Trash2 /> Remove
                </Button>
              </>
            )}
            {p.installed && (
              <span className="self-center text-xs text-muted-foreground">
                {p.installed.elements} elements · installed {formatDate(p.installed.installedAt)}
              </span>
            )}
          </div>
        </Card>
      ))}
      <Dialog open={!!loading} onOpenChange={(o) => !o && setLoading(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{loading?.name}: add source files</DialogTitle>
            <DialogDescription>
              Choose the spreadsheets you are licensed to use, several at once if you like. Atrium
              works out which framework each file holds and shows the changes before anything is
              installed. Frameworks you don't include stay as they are.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-xl border-2 border-dashed border-border p-6 text-center text-[13px] text-muted-foreground hover:border-primary"
            >
              {files.length
                ? files.map((f) => f.name).join(', ')
                : 'Click to choose Excel or CSV files'}
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                setFiles(Array.from(e.target.files ?? []));
                setPreview(null);
              }}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="pack-version">Version (as published)</Label>
              <Input
                id="pack-version"
                value={version}
                onChange={(e) => {
                  setVersion(e.target.value);
                  setPreview(null);
                }}
                placeholder="Taken from the files when left empty"
              />
            </div>
            {preview && <FilesPreviewPanel preview={preview} />}
          </div>
          <DialogFooter>
            {!preview ? (
              <Button
                variant="primary"
                disabled={!files.length || upload.isPending}
                onClick={() => upload.mutate({ install: false })}
              >
                {upload.isPending ? 'Reading the files…' : 'Check the files'}
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={upload.isPending || !preview.validation.ok}
                onClick={() => upload.mutate({ install: true })}
              >
                {upload.isPending ? 'Installing… this can take a minute' : 'Install'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const count = (n: number, one: string) =>
  `${n.toLocaleString('en-GB')} ${n === 1 ? one : `${one}s`}`;

/** What the files hold, what changes, and what was left out and why. */
function FilesPreviewPanel({ preview }: { preview: FilesPreview }) {
  const { report, diff, validation } = preview;
  const versionNote = {
    entered: 'as entered',
    files: 'from the files',
    date: "today's date: the files don't state a release",
  }[report.versionFrom];
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3 text-[13px]">
      <div>
        <p className="font-medium">
          Version {report.version}{' '}
          <span className="font-normal text-muted-foreground">({versionNote})</span>
        </p>
        <ul className="mt-1.5 flex flex-col gap-1">
          {report.frameworks.map((f) => (
            <li key={f.id} className="flex items-center gap-2">
              <TypeIcon type={f.elementType} size="xs" />
              <span className="min-w-0 flex-1">{f.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {f.elements.toLocaleString('en-GB')} {typeDef(f.elementType).plural.toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="good">{diff.added.toLocaleString('en-GB')} new</Badge>
        <Badge tone="primary">{diff.renamed.toLocaleString('en-GB')} renamed</Badge>
        <Badge>{diff.changed.toLocaleString('en-GB')} changed</Badge>
        <Badge tone="act">{diff.removed.toLocaleString('en-GB')} removed</Badge>
        <Badge>{diff.unchanged.toLocaleString('en-GB')} unchanged</Badge>
      </div>
      {diff.removedMapped.length > 0 && (
        <p className="text-xs text-watch-foreground">
          {diff.removedMapped.length} removed elements have mappings. They move to the replacement
          where the source names one; the rest are flagged for review.
        </p>
      )}
      {!validation.ok && (
        <div className="text-xs text-act-foreground">
          <p className="font-medium">These files can't be installed:</p>
          <ul className="mt-1 list-disc pl-5">
            {validation.errors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {validation.errors.length > 8 && <li>and {validation.errors.length - 8} more</li>}
          </ul>
        </div>
      )}
      {report.notes.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-muted-foreground">
          {report.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">What was read from each file</summary>
        <div className="mt-2 flex flex-col gap-2">
          {report.files.map((f) => (
            <div key={f.name}>
              <p className="font-medium text-foreground">
                {f.name}{' '}
                <span className="font-normal text-muted-foreground">
                  · {f.reader ?? 'read by its column headers'}
                </span>
              </p>
              <ul className="mt-0.5 pl-3">
                {f.sheets.map((sh) => (
                  <li key={sh.name}>
                    {sh.loaded ? '✓' : '–'} {sh.name}: {sh.note}
                  </li>
                ))}
              </ul>
              {f.notes.length > 0 && (
                <ul className="mt-0.5 list-disc pl-5">
                  {f.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
