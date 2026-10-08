import type { ElementType, GraphData, GraphNode } from '@atrium/schema';
import { enumLabel, typeDef } from '@atrium/schema';
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  formatMoney,
  HealthDot,
  layerOf,
  MarkBadge,
  Segmented,
  Skeleton,
  toast,
  TYPE_ICONS,
  TypeIcon,
} from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { toPng, toSvg } from 'html-to-image';
import { Crosshair, Download, Network, Zap } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { layout } from '../../lib/layout';
import { useScenario } from '../../lib/queries';
import { inspect, ui, useUi } from '../../lib/store';
import { usePalette } from '../charts/echart';
import { ElementPicker } from '../element-picker';

type Mode = 'dependencies' | 'dataflow' | 'impact' | 'context';
const NODE_W = 216;
const NODE_H = 64;

type AtriumNode = Node<{ node: GraphNode; focus: boolean; notation: 'cards' | 'archimate' }, 'atrium'>;

const ElementNode = memo(function ElementNode({ data }: NodeProps<AtriumNode>) {
  const { node, focus, notation } = data;
  const Icon = TYPE_ICONS[node.type];
  const layer = layerOf(node.type);
  const subtitle =
    node.type === 'technology'
      ? [node.attributes.version && `v${node.attributes.version}`, node.attributes.eol_date && `EOL ${node.attributes.eol_date}`].filter(Boolean).join(' · ')
      : node.type === 'interface'
        ? enumLabel(node.attributes.protocol as string)
        : [node.domainName, node.attributes.annual_cost ? formatMoney(Number(node.attributes.annual_cost)) : null].filter(Boolean).join(' · ');
  if (notation === 'archimate') {
    return (
      <div className={cn('relative flex h-[64px] w-[216px] items-center rounded-sm border-2 px-3 text-[12px] font-medium', layer.border, 'bg-surface', focus && 'ring-4 ring-primary/30')} style={{ background: `color-mix(in oklch, var(--layer-${typeDef(node.type).layer}) 18%, var(--surface))` }}>
        <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-border-strong" />
        <span className="line-clamp-2 pr-5">{node.name}</span>
        <Icon className={cn('absolute top-1.5 right-1.5 size-3.5', layer.text)} />
        <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-border-strong" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        'flex h-[64px] w-[216px] items-center gap-2.5 rounded-xl border bg-surface px-3 shadow-sm transition-shadow hover:shadow-md',
        focus ? 'border-primary ring-4 ring-primary/20' : 'border-border',
        node.mark === 'added' && 'border-good border-dashed',
        node.lifecycle === 'retired' && 'opacity-60',
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-border-strong" />
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', layer.chip)}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-semibold">{node.name}</span>
          <MarkBadge mark={node.mark} />
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">{subtitle || typeDef(node.type).label}</span>
      </span>
      {(node.type === 'application' || node.type === 'technology') && <HealthDot health={node.health} className="size-2.5" />}
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-border-strong" />
    </div>
  );
});

const nodeTypes = { atrium: ElementNode };

export function useGraph(params: { focus?: string; mode: Mode; depth: number; types?: ElementType[] }) {
  const scenario = useScenario();
  const at = useUi((s) => s.at) ?? undefined;
  return useQuery({
    queryKey: ['model', 'graph', scenario, at, params],
    queryFn: () =>
      api<GraphData & { truncated: boolean; summary?: string }>('/views/graph', {
        query: { focus: params.focus, mode: params.mode, depth: params.depth, types: params.types, scenario, at },
      }),
  });
}

function GraphCanvas({ data, focus, notation }: { data: GraphData; focus?: string; notation: 'cards' | 'archimate' }) {
  const p = usePalette();
  const [nodes, setNodes] = useState<AtriumNode[]>([]);
  const { fitView } = useReactFlow();
  const edges = useMemo<Edge[]>(
    () =>
      data.edges.map((e) => {
        const color = e.type === 'flows_to' ? p.primary : e.type === 'supports' ? p.good : e.mark === 'added' ? p.good : p.subtle;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'default',
          label: e.label,
          animated: e.type === 'flows_to',
          style: { stroke: color, strokeWidth: e.type === 'depends_on' ? 1.5 : 1.25, strokeDasharray: e.type === 'uses' ? '4 3' : undefined },
          labelStyle: { fill: p.muted, fontSize: 10, fontWeight: 500 },
          labelBgStyle: { fill: p.surface, fillOpacity: 0.9 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        };
      }),
    [data.edges, p],
  );

  useEffect(() => {
    let cancelled = false;
    void layout({
      nodes: data.nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
      edges: data.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    }).then((pos) => {
      if (cancelled) return;
      setNodes(
        data.nodes.map((n) => ({
          id: n.id,
          type: 'atrium',
          position: pos.get(n.id) ?? { x: 0, y: 0 },
          data: { node: n, focus: n.id === focus, notation },
        })),
      );
      requestAnimationFrame(() => fitView({ padding: 0.15, duration: 300 }));
    });
    return () => {
      cancelled = true;
    };
  }, [data, focus, notation, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={(changes) =>
        setNodes((ns) =>
          ns.map((n) => {
            const c = changes.find((x) => 'id' in x && x.id === n.id && x.type === 'position');
            return c && 'position' in c && c.position ? { ...n, position: c.position } : n;
          }),
        )
      }
      onNodeClick={(_, n) => inspect(n.id)}
      fitView
      minZoom={0.15}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color={p.border} />
      <Controls showInteractive={false} className="!rounded-lg !border !border-border !shadow-sm" />
      {data.nodes.length > 40 && <MiniMap pannable zoomable nodeColor={() => p.primarySoft} maskColor="rgba(0,0,0,0.05)" className="!rounded-lg !border !border-border" />}
    </ReactFlow>
  );
}

async function exportImage(kind: 'png' | 'svg') {
  const el = document.querySelector('.react-flow') as HTMLElement | null;
  if (!el) return;
  const bg = getComputedStyle(document.body).backgroundColor;
  const filter = (n: HTMLElement) => !n.classList?.contains('react-flow__controls') && !n.classList?.contains('react-flow__minimap');
  const url = kind === 'png' ? await toPng(el, { backgroundColor: bg, pixelRatio: 2, filter }) : await toSvg(el, { backgroundColor: bg, filter });
  const a = document.createElement('a');
  a.href = url;
  a.download = `atrium-graph.${kind}`;
  a.click();
  toast.success(`Saved atrium-graph.${kind}`);
}

export function GraphView({ type, focus, onFocus }: { type: ElementType; focus?: string; onFocus: (id: string | undefined) => void }) {
  const [mode, setMode] = useState<Mode>(focus ? 'context' : 'dependencies');
  const [depth, setDepth] = useState(focus ? 1 : 1);
  const notation = useUi((s) => s.notation);
  useEffect(() => {
    if (focus && mode === 'dependencies') setMode('context');
  }, [focus, mode]);
  const types: ElementType[] | undefined = focus ? undefined : type === 'application' ? ['application', 'interface'] : [type];
  const { data, isLoading } = useGraph({ focus, mode, depth, types });

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2">
        <ElementPicker
          types={['application', 'capability', 'interface', 'technology', 'data_object', 'business_process', 'initiative']}
          value={null}
          onChange={(v) => v && onFocus(v.id)}
          trigger={
            <Button size="sm">
              <Crosshair /> {focus ? 'Centre on another' : 'Centre on…'}
            </Button>
          }
        />
        {focus && (
          <Button size="sm" variant="ghost" onClick={() => { onFocus(undefined); setMode('dependencies'); }}>
            Show everything
          </Button>
        )}
        <Segmented
          size="sm"
          value={mode}
          onValueChange={(m) => setMode(m)}
          options={[
            ...(focus ? [{ value: 'context' as Mode, label: 'Everything around it' }] : []),
            { value: 'dependencies', label: 'Dependencies' },
            { value: 'dataflow', label: 'Data flow' },
            ...(focus ? [{ value: 'impact' as Mode, label: 'Impact', icon: <Zap /> }] : []),
          ]}
        />
        {focus && mode !== 'impact' && (
          <Segmented size="sm" value={String(depth)} onValueChange={(d) => setDepth(Number(d))} options={[{ value: '1', label: '1 step' }, { value: '2', label: '2 steps' }, { value: '3', label: '3 steps' }]} />
        )}
        <div className="flex-1" />
        <Segmented size="sm" value={notation} onValueChange={(n) => ui.set({ notation: n })} options={[{ value: 'cards', label: 'Cards' }, { value: 'archimate', label: 'ArchiMate' }]} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" aria-label="Download image">
              <Download />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => void exportImage('png')}>PNG image</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportImage('svg')}>SVG (scalable)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {data?.summary && (
        <div className="flex items-center gap-2 border-b border-border bg-watch-soft px-6 py-2 text-[13px] text-watch-foreground">
          <Zap className="size-4" /> {data.summary}
        </div>
      )}
      {data?.truncated && <div className="border-b border-border bg-surface-2 px-6 py-1.5 text-xs text-muted-foreground">Showing the first {data.nodes.length} elements. Centre on one to see its surroundings.</div>}
      <div className="relative min-h-0 flex-1">
        {isLoading ? (
          <Skeleton className="absolute inset-6 rounded-2xl" />
        ) : !data?.nodes.length ? (
          <EmptyState icon={<Network />} title="Nothing to draw" className="mt-16">
            Link applications with “depends on” or interfaces to see them here.
          </EmptyState>
        ) : (
          <ReactFlowProvider>
            <GraphCanvas data={data} focus={focus} notation={notation} />
          </ReactFlowProvider>
        )}
      </div>
      <div className="flex items-center gap-4 border-t border-border px-6 py-1.5 text-[11px] text-muted-foreground">
        {(['application', 'interface', 'technology', 'capability', 'data_object'] as ElementType[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <TypeIcon type={t} size="xs" /> {typeDef(t).label}
          </span>
        ))}
        <span className="ml-auto">Click a box for details · drag to rearrange</span>
      </div>
    </div>
  );
}
