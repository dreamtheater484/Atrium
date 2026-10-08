import type { ElementType } from '@atrium/schema';
import {
  Badge,
  Button,
  Checkbox,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
  Skeleton,
  TypeIcon,
  toast,
} from '@atrium/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useInvalidateModel } from '../../lib/queries';

interface Suggestion {
  element: { id: string; name: string; type: ElementType; domainName: string | null };
  match: {
    id: string;
    name: string;
    parentName: string | null;
    confidence: number;
    reason: string;
  };
}

interface Suggestions {
  suggestions: Suggestion[];
  mapped: number;
  candidates: number;
  referenceCount: number;
  referenceCovered: number;
}

/** Strong matches start ticked, so the usual path is one click on "Map". */
const PRESELECT = 0.7;

/** Journey J9: map your own model to a reference pack in bulk. */
export function MapToPackDialog({
  pack,
  onOpenChange,
}: {
  pack: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const invalidate = useInvalidateModel();
  const data = useQuery({
    queryKey: ['model', 'pack-mappings', pack?.id],
    queryFn: () => api<Suggestions>(`/packs/${pack!.id}/mapping-suggestions`),
    enabled: !!pack,
  });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (data.data)
      setPicked(
        new Set(
          data.data.suggestions
            .filter((s) => s.match.confidence >= PRESELECT)
            .map((s) => s.element.id),
        ),
      );
  }, [data.data]);
  const list = data.data?.suggestions ?? [];
  const apply = useMutation({
    mutationFn: () =>
      api<{ linked: number; applied: boolean }>(`/packs/${pack!.id}/mappings`, {
        body: {
          pairs: list
            .filter((s) => picked.has(s.element.id))
            .map((s) => ({ sourceId: s.element.id, targetId: s.match.id })),
        },
      }),
    onSuccess: (r) => {
      invalidate();
      toast.success(
        r.applied
          ? `Mapped ${r.linked} elements to ${pack!.name}`
          : `${r.linked} mappings sent for review`,
      );
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const all = list.length > 0 && picked.size === list.length;
  const coverage = useMemo(() => {
    const d = data.data;
    if (!d?.referenceCount) return 0;
    return Math.round((d.referenceCovered / d.referenceCount) * 100);
  }, [data.data]);

  return (
    <Dialog open={!!pack} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Map your model to {pack?.name}</DialogTitle>
          <DialogDescription>
            Atrium suggests the closest reference element for each of yours. Strong matches are
            already ticked: check them and click Map. You can change any mapping later.
          </DialogDescription>
        </DialogHeader>
        {data.isLoading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-[13px]">
              <div className="rounded-lg bg-surface-2 p-3">
                <div className="text-lg font-semibold tabular">{data.data?.mapped ?? 0}</div>
                <div className="text-xs text-muted-foreground">
                  of {data.data?.candidates ?? 0} already mapped
                </div>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <div className="text-lg font-semibold tabular">{list.length}</div>
                <div className="text-xs text-muted-foreground">suggested now</div>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <div className="text-lg font-semibold tabular">{coverage}%</div>
                <Progress value={coverage} className="mt-1" />
                <div className="mt-1 text-xs text-muted-foreground">of the reference covered</div>
              </div>
            </div>
            {list.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted-foreground">
                Nothing left to suggest: everything that matches is mapped.
              </p>
            ) : (
              <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-border">
                <label className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface px-3 py-2 text-xs font-medium text-muted-foreground">
                  <Checkbox
                    checked={all ? true : picked.size ? 'indeterminate' : false}
                    onCheckedChange={() =>
                      setPicked(all ? new Set() : new Set(list.map((s) => s.element.id)))
                    }
                    aria-label="Select all"
                  />
                  Your element
                  <span className="ml-auto">Reference element · how sure</span>
                </label>
                {list.map((s) => {
                  const on = picked.has(s.element.id);
                  return (
                    <label
                      key={s.element.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-[13px] last:border-0 hover:bg-surface-2',
                        !on && 'text-muted-foreground',
                      )}
                    >
                      <Checkbox
                        checked={on}
                        onCheckedChange={() => {
                          const next = new Set(picked);
                          if (on) next.delete(s.element.id);
                          else next.add(s.element.id);
                          setPicked(next);
                        }}
                        aria-label={`Map ${s.element.name}`}
                      />
                      <TypeIcon type={s.element.type} size="xs" />
                      <span className="min-w-0 flex-1 truncate font-medium">{s.element.name}</span>
                      <ArrowRight className="size-3.5 shrink-0 text-subtle-foreground" />
                      <span className="min-w-0 flex-1 truncate" title={s.match.reason}>
                        {s.match.name}
                        {s.match.parentName && (
                          <span className="text-xs text-muted-foreground">
                            {' '}
                            · {s.match.parentName}
                          </span>
                        )}
                      </span>
                      <Badge
                        tone={
                          s.match.confidence >= 0.85
                            ? 'good'
                            : s.match.confidence >= PRESELECT
                              ? 'primary'
                              : 'neutral'
                        }
                      >
                        {Math.round(s.match.confidence * 100)}%
                      </Badge>
                    </label>
                  );
                })}
              </div>
            )}
          </>
        )}
        <DialogFooter>
          <span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" /> Suggested by matching names and descriptions
          </span>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!picked.size || apply.isPending}
            onClick={() => apply.mutate()}
          >
            Map {picked.size} {picked.size === 1 ? 'element' : 'elements'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
