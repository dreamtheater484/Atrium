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
import { FileUp, Map as MapIcon, Package, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useInvalidateModel } from '../../lib/queries';

interface Pack {
  id: string;
  name: string;
  publisher: string;
  description: string;
  license: string;
  homepage?: string;
  frameworks: Array<{ id: string; name: string; elementType: ElementType; description?: string }>;
  bundled: boolean;
  installed: { version: string; elements: number; installedAt: string } | null;
}

interface FilesPreview {
  warnings: string[];
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
      return api<FilesPreview & { added?: number; moved?: number; flagged?: number }>(
        `/packs/${loading!.id}/files`,
        {
          body: form,
          query: { version: version || undefined, install: doInstall ? 'true' : undefined },
        },
      );
    },
    onSuccess: (r, vars) => {
      if (vars.install) {
        refresh();
        setLoading(null);
        toast.success(
          `Installed. ${r.moved ? `${r.moved} mappings moved to new elements. ` : ''}${r.flagged ? `${r.flagged} mappings need a look.` : ''}`,
        );
      } else setPreview(r);
    },
  });

  return (
    <div className="flex flex-col gap-4">
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
            {p.frameworks.map((f) => (
              <Badge key={f.id} tone="outline">
                <TypeIcon type={f.elementType} size="xs" /> {f.name} →{' '}
                {typeDef(f.elementType).plural.toLowerCase()}
              </Badge>
            ))}
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
              Drop the spreadsheets you are licensed to use. Atrium works out which framework each
              sheet holds and shows the changes before anything is installed.
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
              <Label>Version (as published)</Label>
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g. 24.5"
              />
            </div>
            {preview && (
              <div className="rounded-xl bg-surface-2 p-3 text-[13px]">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <Badge tone="good">{preview.diff.added} new</Badge>
                  <Badge tone="primary">{preview.diff.renamed} renamed</Badge>
                  <Badge>{preview.diff.changed} changed</Badge>
                  <Badge tone="act">{preview.diff.removed} removed</Badge>
                  <Badge>{preview.diff.unchanged} unchanged</Badge>
                </div>
                {preview.diff.removedMapped.length > 0 && (
                  <p className="text-xs text-watch-foreground">
                    {preview.diff.removedMapped.length} removed elements have mappings. They move to
                    the replacement where the source names one; the rest are flagged for review.
                  </p>
                )}
                <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                  {preview.warnings.slice(0, 8).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            {!preview ? (
              <Button
                variant="primary"
                disabled={!files.length || upload.isPending}
                onClick={() => upload.mutate({ install: false })}
              >
                Check the files
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={upload.isPending || !preview.validation.ok}
                onClick={() => upload.mutate({ install: true })}
              >
                Install
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
