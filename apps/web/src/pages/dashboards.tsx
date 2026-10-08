import {
  Button,
  Card,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Skeleton,
  toast,
} from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Download,
  LayoutDashboard,
  Link2,
  Pencil,
  Plus,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePalette } from '../components/charts/echart';
import {
  type DashboardSpec,
  type DashboardWidget,
  SIZE_CLASS,
  TEMPLATES,
  WIDGET_MAP,
  WIDGETS,
  type WidgetSize,
} from '../components/dashboard/widgets';
import { api, download } from '../lib/api';
import { useOverview } from '../lib/overview';
import { useMe, useScenario } from '../lib/queries';

function useDashboards() {
  return useQuery({ queryKey: ['dashboards'], queryFn: () => api<DashboardSpec[]>('/dashboards') });
}

export function DashboardsPage() {
  const { id } = useSearch({ from: '/dashboards' }) as { id?: string };
  const navigate = useNavigate({ from: '/dashboards' });
  const router = useRouter();
  const me = useMe().data;
  const saved = useDashboards().data ?? [];
  const all = [...TEMPLATES, ...saved];
  const role = me?.homeRole ?? 'architect';
  const current =
    all.find((d) => d.id === id) ?? TEMPLATES.find((t) => t.role === role) ?? TEMPLATES[0]!;
  const { data } = useOverview();
  const p = usePalette();
  const qc = useQueryClient();
  const scenario = useScenario();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DashboardWidget[]>([]);
  const [name, setName] = useState('');
  const [catalog, setCatalog] = useState(false);

  const save = useMutation({
    mutationFn: (spec: { id?: string; name: string; widgets: DashboardWidget[] }) =>
      spec.id && !TEMPLATES.some((t) => t.id === spec.id)
        ? api<DashboardSpec>(`/dashboards/${spec.id}`, {
            method: 'PUT',
            body: { name: spec.name, widgets: spec.widgets },
          })
        : api<DashboardSpec>('/dashboards', { body: { name: spec.name, widgets: spec.widgets } }),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['dashboards'] });
      navigate({ search: { id: d.id } });
      setEditing(false);
      toast.success('Dashboard saved');
    },
  });
  const remove = useMutation({
    mutationFn: (dashId: string) => api(`/dashboards/${dashId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboards'] });
      navigate({ search: {} });
    },
  });

  const widgets = editing ? draft : current.widgets;
  const go = (to: string) => router.history.push(to);

  const startEdit = () => {
    setDraft(current.widgets.map((w) => ({ ...w })));
    setName(current.template ? `My ${current.name.toLowerCase()}` : current.name);
    setEditing(true);
  };

  const exportPptx = async () => {
    if (!data) return;
    const slides = widgets
      .map((w) => WIDGET_MAP.get(w.widget)?.slide?.({ data, p }))
      .filter(Boolean);
    const kpis = widgets.filter((w) => w.widget.startsWith('kpi-')).map((w) => w.widget);
    try {
      toast('Building your presentation…');
      const res = await fetch('/api/v1/export/dashboard', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-atrium-csrf': '1' },
        body: JSON.stringify({ title: current.name, kpis, slides, scenario }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${current.name}.pptx`;
      a.click();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const groups = useMemo(() => ['manager', 'architect', 'engineer'] as const, []);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-6 py-6">
      <div className="no-print flex flex-wrap items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg px-1 text-xl font-semibold tracking-tight hover:bg-surface-2"
            >
              <LayoutDashboard className="size-5 text-primary" />
              {editing ? 'Editing dashboard' : current.name}
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            {groups.map((g) => (
              <div key={g}>
                <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">
                  For {g}s
                </div>
                {TEMPLATES.filter((t) => t.role === g).map((t) => (
                  <DropdownMenuItem key={t.id} onSelect={() => navigate({ search: { id: t.id } })}>
                    {t.name}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
            {saved.length > 0 && (
              <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">
                Your dashboards
              </div>
            )}
            {saved.map((d) => (
              <DropdownMenuItem key={d.id} onSelect={() => navigate({ search: { id: d.id } })}>
                {d.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {!editing && <p className="text-[13px] text-muted-foreground">{current.description}</p>}
        <div className="flex-1" />
        {editing ? (
          <>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-56"
              aria-label="Dashboard name"
            />
            <Button onClick={() => setCatalog(true)}>
              <Plus /> Add widget
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                save.mutate({
                  id: current.template ? undefined : current.id,
                  name: name || 'My dashboard',
                  widgets: draft,
                })
              }
            >
              <Check /> Save
            </Button>
          </>
        ) : (
          <>
            <Button onClick={startEdit}>
              {current.template ? <Copy /> : <Pencil />} {current.template ? 'Customise' : 'Edit'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Download /> Share
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => void exportPptx()}>
                  <Download /> PowerPoint (editable charts)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => window.print()}>
                  <Printer /> Print or save as PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    void navigator.clipboard.writeText(
                      `${location.origin}/dashboards?id=${current.id}`,
                    );
                    toast.success('Link copied');
                  }}
                >
                  <Link2 /> Copy link
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    void download(
                      '/export',
                      { format: 'xlsx', type: 'application', scenario },
                      'applications.xlsx',
                    )
                  }
                >
                  <Download /> Underlying data (Excel)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {!current.template && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete dashboard"
                onClick={() => remove.mutate(current.id)}
              >
                <Trash2 />
              </Button>
            )}
          </>
        )}
      </div>
      <h1 className="hidden text-2xl font-semibold print:block">{current.name}</h1>
      {!data ? (
        <div className="grid grid-cols-12 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className={cn('h-56 rounded-xl', i < 4 ? 'col-span-3' : 'col-span-6')}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {widgets.map((w, i) => {
            const def = WIDGET_MAP.get(w.widget);
            if (!def) return null;
            return (
              <Card
                key={`${w.id}-${i}`}
                className={cn(
                  SIZE_CLASS[w.size],
                  'flex flex-col break-inside-avoid',
                  editing && 'ring-2 ring-primary/20',
                )}
              >
                <div className="flex items-start gap-2 px-4 pt-3.5">
                  {w.size !== 's' && (
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[13px] font-semibold">{def.title}</h3>
                      <p className="text-xs text-muted-foreground">{def.description}</p>
                    </div>
                  )}
                  {w.size === 's' && <div className="flex-1" />}
                  {editing && (
                    <div className="no-print flex shrink-0 items-center gap-0.5">
                      <select
                        value={w.size}
                        aria-label="Size"
                        onChange={(e) =>
                          setDraft((d) =>
                            d.map((x, j) =>
                              j === i ? { ...x, size: e.target.value as WidgetSize } : x,
                            ),
                          )
                        }
                        className="h-7 rounded-md border border-border bg-surface px-1 text-xs"
                      >
                        <option value="s">Small</option>
                        <option value="m">Half</option>
                        <option value="l">Full</option>
                      </select>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Move earlier"
                        onClick={() =>
                          setDraft((d) =>
                            i === 0
                              ? d
                              : [...d.slice(0, i - 1), d[i]!, d[i - 1]!, ...d.slice(i + 1)],
                          )
                        }
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Move later"
                        onClick={() =>
                          setDraft((d) =>
                            i === d.length - 1
                              ? d
                              : [...d.slice(0, i), d[i + 1]!, d[i]!, ...d.slice(i + 2)],
                          )
                        }
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Remove widget"
                        onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
                      >
                        <X />
                      </Button>
                    </div>
                  )}
                </div>
                <div className={cn('flex-1 px-4 pb-4', w.size === 's' ? 'pt-0' : 'pt-2')}>
                  {def.render({ data, p, go })}
                </div>
              </Card>
            );
          })}
          {editing && (
            <button
              type="button"
              onClick={() => setCatalog(true)}
              className="col-span-12 flex h-24 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-[13px] text-muted-foreground hover:border-primary hover:text-primary xl:col-span-6"
            >
              <Plus className="size-4" /> Add a widget
            </button>
          )}
        </div>
      )}
      <Dialog open={catalog} onOpenChange={setCatalog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add a widget</DialogTitle>
            <DialogDescription>
              Every widget updates live and follows the Today / Target switch.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto sm:grid-cols-2">
            {WIDGETS.map((wd) => (
              <button
                key={wd.id}
                type="button"
                onClick={() => {
                  setDraft((d) => [
                    ...d,
                    { id: `${wd.id}-${Date.now()}`, widget: wd.id, size: wd.size },
                  ]);
                  setCatalog(false);
                }}
                className="flex flex-col gap-0.5 rounded-xl border border-border p-3 text-left transition hover:border-primary hover:bg-primary-soft/30"
              >
                <span className="text-[13px] font-semibold">{wd.title}</span>
                <span className="text-xs text-muted-foreground">{wd.description}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
