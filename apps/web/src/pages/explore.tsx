import {
  ELEMENT_TYPE_DEFS,
  ELEMENT_TYPE_LIST,
  type ElementType,
  type MapOverlay,
  typeDef,
} from '@atrium/schema';
import {
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Segmented,
  Select,
  Switch,
  TypeIcon,
  toast,
} from '@atrium/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  Blocks,
  ChevronDown,
  Download,
  LayoutGrid,
  Library,
  ListTree,
  Network,
  Plus,
  Radar,
  Search,
  Table2,
  X,
} from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { CoverageBar } from '../components/reference/coverage';
import { FrameworkTreeView } from '../components/reference/framework-tree';
import { TimeSlider } from '../components/time-slider';
import { CapabilityMapView } from '../components/views/capability-map';
import { GraphView } from '../components/views/graph-view';
import { LandscapeView } from '../components/views/landscape';
import { RadarView } from '../components/views/radar';
import { TableView } from '../components/views/table-view';
import { download } from '../lib/api';
import {
  useCounts,
  useFrameworkTree,
  useInstalledFrameworks,
  usePacks,
  useScenario,
} from '../lib/queries';
import { openAdd } from '../lib/store';
import type { ExploreSearch, ExploreView } from '../router';

const GROUPS: Array<{ label: string; types: ElementType[] }> = [
  { label: 'Business', types: ['capability', 'business_process', 'domain'] },
  { label: 'Applications and data', types: ['application', 'interface', 'data_object'] },
  { label: 'Technology', types: ['technology'] },
  { label: 'Contracts', types: ['contract'] },
  { label: 'Change and governance', types: ['initiative', 'decision', 'standard', 'principle'] },
  { label: 'People', types: ['team'] },
];

/** "end of support", "integrations with other applications"... for the filter chip. */
function missingLabel(type: ElementType | undefined, field: string): string {
  const def = type ? ELEMENT_TYPE_DEFS[type] : null;
  const [kind, key] = field.split('.');
  if (kind === 'attributes') {
    const attrs = def ? def.attributes : ELEMENT_TYPE_LIST.flatMap((d) => d.attributes);
    return (attrs.find((a) => a.key === key)?.label ?? key ?? '').toLowerCase();
  }
  const rel = def?.expectedRelations?.find(
    (r) => (r.key ?? (Array.isArray(r.relation) ? r.relation[0] : r.relation)) === key,
  );
  return (rel?.label ?? key ?? '').toLowerCase();
}

function viewsFor(type: ElementType | undefined): ExploreView[] {
  switch (type) {
    case 'capability':
      return ['map', 'table', 'graph'];
    case 'application':
      return ['table', 'landscape', 'graph'];
    case 'technology':
      return ['table', 'radar', 'landscape', 'graph'];
    case 'interface':
    case 'data_object':
      return ['table', 'graph'];
    default:
      return ['table'];
  }
}

const VIEW_META: Record<ExploreView, { label: string; icon: React.ReactNode }> = {
  table: { label: 'Table', icon: <Table2 /> },
  map: { label: 'Map', icon: <Blocks /> },
  graph: { label: 'Graph', icon: <Network /> },
  landscape: { label: 'Landscape', icon: <LayoutGrid /> },
  radar: { label: 'Radar', icon: <Radar /> },
  tree: { label: 'Tree', icon: <ListTree /> },
};

const OVERLAYS: Array<{ value: MapOverlay; label: string }> = [
  { value: 'health', label: 'Health' },
  { value: 'cost', label: 'Cost' },
  { value: 'coverage', label: 'Coverage' },
  { value: 'lifecycle', label: 'Lifecycle' },
  { value: 'time', label: 'TIME' },
  { value: 'importance', label: 'Importance' },
  { value: 'quality', label: 'Data quality' },
  { value: 'none', label: 'None' },
];

export function ExplorePage() {
  const search = useSearch({ from: '/explore' }) as ExploreSearch;
  const navigate = useNavigate({ from: '/explore' });
  const counts = useCounts().data ?? {};
  const packs = usePacks();
  const hasPacks = (packs.data ?? []).some((p) => p.installed);
  const installed = useInstalledFrameworks();
  const scenario = useScenario();
  // A reference framework instead of your own elements: ?pack=tmforum&framework=etom
  const reference = search.pack && search.framework ? search : null;
  const refPack = reference ? packs.data?.find((p) => p.id === reference.pack) : undefined;
  const refFramework = refPack?.frameworks.find((f) => f.id === reference?.framework);
  const tree = useFrameworkTree(reference?.pack, reference?.framework);
  const refType = tree.data?.framework.elementType ?? refFramework?.elementType;
  const type = reference
    ? refType
    : (search.type ?? (search.gaps || search.missing ? undefined : 'application'));
  const available: ExploreView[] = reference ? ['tree', 'table'] : viewsFor(type);
  const view =
    search.view && available.includes(search.view)
      ? search.view
      : search.focus
        ? 'graph'
        : available[0]!;
  const [q, setQ] = useState(search.q ?? '');
  const overlay = search.overlay ?? (view === 'map' ? 'health' : 'health');
  const set = (patch: Partial<ExploreSearch>) =>
    navigate({ search: (s: ExploreSearch) => ({ ...s, ...patch }), replace: true });

  useEffect(() => setQ(search.q ?? ''), [search.q]);
  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.q ?? '') !== q) set({ q: q || undefined });
    }, 250);
    return () => clearTimeout(t);
  });

  const def = type ? typeDef(type) : null;
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const refName = tree.data?.framework.name ?? refFramework?.name ?? 'Reference framework';
  const refCount =
    tree.data?.totals.nodes ??
    refPack?.installed?.frameworks?.[reference?.framework ?? '']?.elements;
  // Something is covered through another framework (a TAM application that realizes it).
  const hasThrough = (tree.data?.totals.coveredThrough ?? 0) > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3 border-b border-border bg-surface px-6 pt-5 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          {def ? <TypeIcon type={type!} size="md" /> : null}
          {reference ? (
            <>
              <h1 className="text-xl font-semibold tracking-tight">{refName}</h1>
              <span className="text-[13px] text-muted-foreground tabular">
                {refCount?.toLocaleString('en-GB') ?? ''}
              </span>
              <Badge tone="outline">
                <Library /> {tree.data?.pack.name ?? refPack?.name ?? 'Reference'}
                {tree.data?.framework.version ? ` ${tree.data.framework.version}` : ''}
              </Badge>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight">
                {search.gaps && !def ? 'Fill the gaps' : (def?.plural ?? 'Everything')}
              </h1>
              <span className="text-[13px] text-muted-foreground tabular">
                {type ? (counts[type] ?? 0) : total}
              </span>
            </>
          )}
          <div className="flex-1" />
          {installed.length > 0 && (
            <FrameworkMenu
              installed={installed}
              current={reference ? `${reference.pack}/${reference.framework}` : undefined}
              onOpen={(pack, framework) => navigate({ search: { pack, framework, view: 'tree' } })}
            />
          )}
          {available.length > 1 && (
            <Segmented
              value={view}
              onValueChange={(v) =>
                set({ view: v, focus: v === 'graph' ? search.focus : undefined })
              }
              options={available.map((v) => ({
                value: v,
                label: VIEW_META[v].label,
                icon: VIEW_META[v].icon,
              }))}
            />
          )}
          {!reference && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="md">
                  <Download /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-60">
                <DropdownMenuLabel>{def ? def.plural : 'Everything'}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => exportFile('xlsx', type, scenario)}>
                  Excel workbook
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportFile('csv', type, scenario)}>
                  CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Whole model</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => exportFile('xlsx', undefined, scenario)}>
                  Excel, all types
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportFile('archimate', undefined, scenario)}>
                  ArchiMate exchange file
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportFile('json', undefined, scenario)}>
                  Atrium bundle (JSON)
                </DropdownMenuItem>
                {view === 'map' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => exportFile('pptx-map', type, scenario, overlay)}
                    >
                      Capability map as PowerPoint
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {def && !reference && (
            <Button variant="primary" onClick={() => openAdd(type!)}>
              <Plus /> New {def.label.toLowerCase()}
            </Button>
          )}
        </div>
        <div className="-mx-1 flex items-center gap-1 overflow-x-auto pb-0.5">
          {GROUPS.map((g, gi) => (
            <div
              key={g.label}
              className={cn(
                'flex shrink-0 items-center gap-1',
                gi > 0 && 'border-l border-border pl-1',
              )}
            >
              {g.types.map((t) => {
                const d = ELEMENT_TYPE_LIST.find((x) => x.type === t)!;
                const active = !reference && t === type;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      navigate({ search: { type: t, overlay: search.overlay }, replace: false })
                    }
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium transition-colors',
                      active
                        ? 'bg-primary-soft text-primary-soft-foreground'
                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                    )}
                  >
                    <TypeIcon type={t} size="xs" className={cn(!active && 'opacity-80')} />
                    {d.plural}
                    <span className="text-[11px] font-normal tabular">{counts[t] ?? 0}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface/60 px-6 py-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-subtle-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              reference
                ? `Search ${refName}…`
                : `Filter ${def?.plural.toLowerCase() ?? 'everything'}…`
            }
            aria-label={reference ? `Search ${refName}` : undefined}
            className="pl-8"
          />
        </div>
        {reference && view === 'tree' && (
          <Segmented
            size="md"
            value={search.show ?? 'all'}
            onValueChange={(v) => set({ show: v === 'all' ? undefined : v })}
            options={[
              { value: 'all', label: 'Everything' },
              { value: 'mapped', label: 'Mapped' },
              { value: 'gaps', label: 'Gaps' },
            ]}
          />
        )}
        {reference && view === 'tree' && search.show && hasThrough && (
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Switch
              checked={!!search.through}
              onCheckedChange={(c) => set({ through: c || undefined })}
            />{' '}
            Count coverage through links
          </label>
        )}
        {!reference &&
          !(view === 'table' && search.layer === 'reference') &&
          (view === 'table' || view === 'landscape') &&
          (type === 'application' || type === 'technology' || view === 'table') && (
            <Select
              size="md"
              value={search.health ?? null}
              onValueChange={(v) => set({ health: v ?? undefined })}
              options={[
                { value: 'act', label: 'Needs action' },
                { value: 'watch', label: 'Watch' },
                { value: 'good', label: 'Good' },
                { value: 'unknown', label: 'Unknown health' },
              ]}
              placeholder="Any health"
              allowClear
              className="w-40"
              aria-label="Health filter"
            />
          )}
        {!reference && view === 'table' && search.missing && (
          <Badge tone="primary" className="gap-1">
            Missing {missingLabel(type, search.missing)}
            <button
              type="button"
              aria-label="Show everything"
              className="-mr-1 rounded hover:bg-primary/10"
              onClick={() => set({ missing: undefined })}
            >
              <X className="size-3" />
            </button>
          </Badge>
        )}
        {!reference && view === 'table' && search.layer !== 'reference' && (
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Switch
              checked={!!search.gaps}
              onCheckedChange={(c) => set({ gaps: c || undefined })}
            />{' '}
            Only with gaps
          </label>
        )}
        {(view === 'map' || view === 'landscape') && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Colour by</span>
            <Select
              size="md"
              value={overlay}
              onValueChange={(v) => set({ overlay: (v as MapOverlay) ?? undefined })}
              options={OVERLAYS.filter(
                (o) => view === 'map' || !['coverage', 'importance'].includes(o.value),
              )}
              className="w-36"
              aria-label="Overlay"
            />
          </div>
        )}
        {!reference && view === 'table' && hasPacks && (
          <Segmented
            size="md"
            value={search.layer ?? 'org'}
            onValueChange={(v) => set({ layer: v === 'reference' ? 'reference' : undefined })}
            options={[
              { value: 'org', label: 'Your model' },
              { value: 'reference', label: 'Reference' },
            ]}
          />
        )}
        <div className="flex-1" />
        {reference && tree.data && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular">
              {tree.data.totals.covered.toLocaleString('en-GB')} of{' '}
              {tree.data.totals.nodes.toLocaleString('en-GB')} mapped
            </span>
            {hasThrough && (
              <span className="tabular">
                +{tree.data.totals.coveredThrough.toLocaleString('en-GB')} through links
              </span>
            )}
            <CoverageBar
              covered={tree.data.totals.covered}
              through={tree.data.totals.coveredThrough}
              total={tree.data.totals.nodes}
              min={2}
              label="Elements of the framework with a mapping"
              className="w-24"
            />
          </span>
        )}
        {!reference && view !== 'table' && view !== 'radar' && view !== 'tree' && <TimeSlider />}
      </div>
      <div className="min-h-0 flex-1">
        {reference && view === 'tree' && (
          <FrameworkTreeView
            data={tree.data}
            isLoading={tree.isLoading}
            error={tree.error}
            q={q}
            show={search.show}
            through={!!search.through && hasThrough}
            selected={search.node}
            onSelect={(id) => set({ node: id })}
          />
        )}
        {reference && view === 'table' && (
          <TableView
            type={type}
            q={search.q}
            layer="reference"
            pack={reference.pack}
            framework={reference.framework}
          />
        )}
        {!reference && view === 'table' && (
          <TableView
            type={type}
            q={search.q}
            gaps={search.gaps}
            missing={search.missing}
            health={search.health}
            layer={search.layer}
            onToggleGaps={() => {
              toast('Showing only elements with gaps');
            }}
          />
        )}
        {view === 'map' && <CapabilityMapView overlay={overlay} q={search.q} />}
        {view === 'graph' && (
          <GraphView
            type={type ?? 'application'}
            focus={search.focus}
            onFocus={(id) => set({ focus: id })}
            domain={search.domain}
            onDomain={(id) => set({ domain: id })}
            initialMode={search.mode}
          />
        )}
        {view === 'landscape' && (
          <LandscapeView
            type={type ?? 'application'}
            overlay={overlay}
            q={search.q}
            health={search.health}
          />
        )}
        {view === 'radar' && <RadarView q={search.q} />}
      </div>
    </div>
  );
}

/** The installed reference frameworks, pack by pack, to browse one of them. */
function FrameworkMenu({
  installed,
  current,
  onOpen,
}: {
  installed: ReturnType<typeof useInstalledFrameworks>;
  current: string | undefined;
  onOpen: (pack: string, framework: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="md" variant={current ? 'secondary' : undefined}>
          <Library /> Reference frameworks <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {installed.map(({ pack, frameworks }, i) => (
          <Fragment key={pack.id}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{pack.name}</DropdownMenuLabel>
            {frameworks.map((f) => (
              <DropdownMenuItem
                key={f.id}
                onSelect={() => onOpen(pack.id, f.id)}
                className={cn(current === `${pack.id}/${f.id}` && 'bg-primary-soft/60 font-medium')}
              >
                <TypeIcon type={f.elementType} size="xs" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-[11px] text-muted-foreground tabular">
                  {f.elements.toLocaleString('en-GB')}
                </span>
              </DropdownMenuItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

async function exportFile(
  format: string,
  type: ElementType | undefined,
  scenario: string | undefined,
  overlay?: string,
) {
  try {
    toast('Preparing your file…');
    await download('/export', { format, type, scenario, overlay }, `atrium.${format}`);
  } catch (e) {
    toast.error((e as Error).message);
  }
}
