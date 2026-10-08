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
  TYPE_ICONS,
  TypeIcon,
  toast,
} from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  type Edge,
  type EdgeProps,
  Handle,
  type InternalNode,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useInternalNode,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { toPng, toSvg } from 'html-to-image';
import { Crosshair, Download, Network, Zap } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { GROUP_HEADER, GROUP_PREFIX, layout } from '../../lib/layout';
import { useElement, useScenario } from '../../lib/queries';
import { inspect, ui, useUi } from '../../lib/store';
import { usePalette } from '../charts/echart';
import { ElementPicker } from '../element-picker';

type Mode = 'dependencies' | 'dataflow' | 'impact' | 'context';
const NODE_W = 216;
const NODE_H = 64;

type AtriumNode = Node<
  { node: GraphNode; focus: boolean; notation: 'cards' | 'archimate' },
  'atrium'
>;
type DomainNode = Node<{ label: string; count: number }, 'domain'>;

const DomainBox = memo(function DomainBox({ data }: NodeProps<DomainNode>) {
  return (
    <div className="size-full rounded-2xl border border-border bg-surface-2/60">
      <div
        className="flex items-center gap-2 px-4 text-[12px] font-semibold text-muted-foreground"
        style={{ height: GROUP_HEADER }}
      >
        {data.label} <span className="font-normal text-subtle-foreground">{data.count}</span>
      </div>
    </div>
  );
});

const ElementNode = memo(function ElementNode({ data }: NodeProps<AtriumNode>) {
  const { node, focus, notation } = data;
  const Icon = TYPE_ICONS[node.type];
  const layer = layerOf(node.type);
  const subtitle =
    node.type === 'technology'
      ? [
          node.attributes.version && `v${node.attributes.version}`,
          node.attributes.eol_date && `EOL ${node.attributes.eol_date}`,
        ]
          .filter(Boolean)
          .join(' · ')
      : node.type === 'interface'
        ? enumLabel(node.attributes.protocol as string)
        : node.type === 'domain'
          ? [
              `${node.attributes.app_count} applications`,
              node.attributes.annual_cost ? formatMoney(Number(node.attributes.annual_cost)) : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : [
              node.domainName,
              node.attributes.annual_cost ? formatMoney(Number(node.attributes.annual_cost)) : null,
            ]
              .filter(Boolean)
              .join(' · ');
  if (notation === 'archimate') {
    return (
      <div
        className={cn(
          'relative flex h-[64px] w-[216px] items-center rounded-sm border-2 px-3 text-[12px] font-medium',
          layer.border,
          'bg-surface',
          focus && 'ring-4 ring-primary/30',
        )}
        style={{
          background: `color-mix(in oklch, var(--layer-${typeDef(node.type).layer}) 18%, var(--surface))`,
        }}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!size-1.5 !border-0 !bg-border-strong"
        />
        <span className="line-clamp-2 pr-5">{node.name}</span>
        <Icon className={cn('absolute top-1.5 right-1.5 size-3.5', layer.text)} />
        <Handle
          type="source"
          position={Position.Right}
          className="!size-1.5 !border-0 !bg-border-strong"
        />
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
      <Handle
        type="target"
        position={Position.Left}
        className={cn(
          '!size-1.5 !border-0 !bg-border-strong',
          node.type === 'domain' && '!opacity-0',
        )}
      />
      <span
        className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', layer.chip)}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-semibold">{node.name}</span>
          <MarkBadge mark={node.mark} />
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {subtitle || typeDef(node.type).label}
        </span>
      </span>
      {(node.type === 'application' || node.type === 'technology') && (
        <HealthDot health={node.health} className="size-2.5" />
      )}
      {node.type === 'domain' && Number(node.attributes.act) > 0 && (
        <span
          className="rounded-full bg-act-soft px-1.5 py-0.5 text-[10px] font-semibold text-act-foreground"
          title="Applications that need action"
        >
          {String(node.attributes.act)}
        </span>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className={cn(
          '!size-1.5 !border-0 !bg-border-strong',
          node.type === 'domain' && '!opacity-0',
        )}
      />
    </div>
  );
});

const nodeTypes = { atrium: ElementNode, domain: DomainBox };

function centre(n: InternalNode) {
  const w = n.measured.width ?? NODE_W;
  const h = n.measured.height ?? NODE_H;
  return {
    x: n.internals.positionAbsolute.x + w / 2,
    y: n.internals.positionAbsolute.y + h / 2,
    w,
    h,
  };
}

/** Where the line from a node's centre towards a point leaves its box. */
function exit(n: InternalNode, toward: { x: number; y: number }) {
  const c = centre(n);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const k = 1 / Math.max(Math.abs(dx) / (c.w / 2 + 4), Math.abs(dy) / (c.h / 2 + 4), 1e-6);
  return { x: c.x + dx * k, y: c.y + dy * k };
}

/** Straight centre-to-centre edge; used where nodes are spread in two dimensions. */
function FloatingEdge({
  id,
  source,
  target,
  markerStart,
  markerEnd,
  style,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  data,
}: EdgeProps) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t) return null;
  const sc = centre(s);
  const tc = centre(t);
  // Links in both directions sit side by side instead of on top of each other.
  const off = (data as { offset?: number } | undefined)?.offset ?? 0;
  const len = Math.hypot(tc.x - sc.x, tc.y - sc.y) || 1;
  const ox = (-(tc.y - sc.y) / len) * off;
  const oy = ((tc.x - sc.x) / len) * off;
  const a = exit(s, { x: tc.x + ox, y: tc.y + oy });
  const b = exit(t, { x: sc.x + ox, y: sc.y + oy });
  const [x1, y1, x2, y2] = [a.x + ox, a.y + oy, b.x + ox, b.y + oy];
  return (
    <BaseEdge
      id={id}
      path={`M ${x1},${y1} L ${x2},${y2}`}
      markerStart={markerStart}
      markerEnd={markerEnd}
      style={style}
      label={label}
      labelX={(x1 + x2) / 2}
      labelY={(y1 + y2) / 2}
      labelStyle={labelStyle}
      labelShowBg
      labelBgStyle={labelBgStyle}
      labelBgPadding={labelBgPadding}
      labelBgBorderRadius={labelBgBorderRadius}
    />
  );
}

const edgeTypes = { floating: FloatingEdge };

export function useGraph(params: {
  focus?: string;
  mode: Mode;
  depth: number;
  types?: ElementType[];
  domainId?: string;
}) {
  const scenario = useScenario();
  const at = useUi((s) => s.at) ?? undefined;
  return useQuery({
    queryKey: ['model', 'graph', scenario, at, params],
    queryFn: () =>
      api<GraphData & { truncated: boolean; summary?: string }>('/views/graph', {
        query: {
          focus: params.focus,
          mode: params.mode,
          depth: params.depth,
          types: params.types,
          domainId: params.domainId,
          scenario,
          at,
        },
      }),
  });
}

const width = (e: GraphData['edges'][number]) =>
  e.weight ? Math.min(1.25 + e.weight * 0.5, 6) : e.type === 'depends_on' ? 1.5 : 1.25;

function GraphCanvas({
  data,
  focus,
  notation,
  onDomain,
}: {
  data: GraphData;
  focus?: string;
  notation: 'cards' | 'archimate';
  onDomain: (id: string) => void;
}) {
  const p = usePalette();
  const [nodes, setNodes] = useState<Array<AtriumNode | DomainNode>>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const { fitView } = useReactFlow();
  // Busy pictures only label the edge under the pointer.
  const quiet = data.edges.length > 30;
  // The domain map spreads in two dimensions with straight arrows.
  const spread = !focus && data.nodes.length > 1 && data.nodes.every((n) => n.type === 'domain');
  const edges = useMemo<Edge[]>(
    () =>
      data.edges.map((e) => {
        const base =
          e.type === 'flows_to'
            ? p.primary
            : e.type === 'supports'
              ? p.good
              : e.mark === 'added'
                ? p.good
                : p.subtle;
        const color = hovered === e.id ? p.primary : base;
        const twoWay =
          spread && data.edges.some((x) => x.source === e.target && x.target === e.source);
        const marker = {
          type: MarkerType.ArrowClosed,
          color,
          width: 18 / width(e),
          height: 18 / width(e),
        };
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: spread ? 'floating' : 'default',
          data: { offset: twoWay ? 5 : 0 },
          label: !quiet || hovered === e.id ? e.label : undefined,
          zIndex: hovered === e.id ? 10 : 0,
          animated: e.type === 'flows_to',
          style: {
            stroke: color,
            strokeWidth: width(e),
            strokeDasharray: e.type === 'uses' ? '4 3' : undefined,
          },
          labelStyle: { fill: p.muted, fontSize: 10, fontWeight: 500 },
          labelBgStyle: { fill: p.surface, fillOpacity: 0.9 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
          // Markers scale with the stroke, so keep the arrowhead the same size on thick lines.
          markerEnd: marker,
          markerStart: e.twoWay ? { ...marker, orient: 'auto-start-reverse' } : undefined,
        };
      }),
    [data.edges, p, hovered, quiet, spread],
  );

  useEffect(() => {
    let cancelled = false;
    const groupOf = (n: GraphNode) => (data.grouped ? (n.domainName ?? 'No domain') : undefined);
    void layout({
      nodes: data.nodes.map((n) => ({
        id: n.id,
        width: NODE_W,
        height: NODE_H,
        group: groupOf(n),
      })),
      edges: data.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      algorithm: spread ? 'stress' : 'layered',
    }).then((pos) => {
      if (cancelled) return;
      const groups = new Map<string, number>();
      for (const n of data.nodes) {
        const g = groupOf(n);
        if (g) groups.set(g, (groups.get(g) ?? 0) + 1);
      }
      // Parents must come before their children.
      const boxes: DomainNode[] = [...groups].map(([label, count]) => {
        const at = pos.get(GROUP_PREFIX + label);
        return {
          id: GROUP_PREFIX + label,
          type: 'domain',
          position: { x: at?.x ?? 0, y: at?.y ?? 0 },
          style: { width: at?.width, height: at?.height },
          data: { label, count },
          selectable: false,
          zIndex: -1,
        };
      });
      setNodes([
        ...boxes,
        ...data.nodes.map(
          (n): AtriumNode => ({
            id: n.id,
            type: 'atrium',
            position: pos.get(n.id) ?? { x: 0, y: 0 },
            data: { node: n, focus: n.id === focus, notation },
            ...(groupOf(n) ? { parentId: GROUP_PREFIX + groupOf(n) } : {}),
          }),
        ),
      ]);
      requestAnimationFrame(() => fitView({ padding: 0.15, duration: 300 }));
    });
    return () => {
      cancelled = true;
    };
  }, [data, focus, notation, fitView, spread]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={(changes) =>
        setNodes((ns) =>
          ns.map((n) => {
            const c = changes.find((x) => 'id' in x && x.id === n.id && x.type === 'position');
            return c && 'position' in c && c.position ? { ...n, position: c.position } : n;
          }),
        )
      }
      onNodeClick={(_, n) => {
        if (n.type !== 'atrium') return;
        if (n.data.node.type === 'domain' && !focus) onDomain(n.id);
        else inspect(n.id);
      }}
      onEdgeMouseEnter={(_, e) => setHovered(e.id)}
      onEdgeMouseLeave={() => setHovered(null)}
      fitView
      minZoom={0.15}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color={p.border} />
      <Controls showInteractive={false} className="!rounded-lg !border !border-border !shadow-sm" />
      {data.nodes.length > 40 && (
        <MiniMap
          pannable
          zoomable
          nodeColor={() => p.primarySoft}
          maskColor="rgba(0,0,0,0.05)"
          className="!rounded-lg !border !border-border"
        />
      )}
    </ReactFlow>
  );
}

async function exportImage(kind: 'png' | 'svg') {
  const el = document.querySelector('.react-flow') as HTMLElement | null;
  if (!el) return;
  const bg = getComputedStyle(document.body).backgroundColor;
  const filter = (n: HTMLElement) =>
    !n.classList?.contains('react-flow__controls') && !n.classList?.contains('react-flow__minimap');
  const url =
    kind === 'png'
      ? await toPng(el, { backgroundColor: bg, pixelRatio: 2, filter })
      : await toSvg(el, { backgroundColor: bg, filter });
  const a = document.createElement('a');
  a.href = url;
  a.download = `atrium-graph.${kind}`;
  a.click();
  toast.success(`Saved atrium-graph.${kind}`);
}

export function GraphView({
  type,
  focus,
  onFocus,
  domain,
  onDomain,
  initialMode,
}: {
  type: ElementType;
  initialMode?: 'impact';
  focus?: string;
  onFocus: (id: string | undefined) => void;
  domain?: string;
  onDomain: (id: string | undefined) => void;
}) {
  const [mode, setMode] = useState<Mode>(focus ? (initialMode ?? 'context') : 'dependencies');
  const [depth, setDepth] = useState(focus ? 1 : 1);
  const notation = useUi((s) => s.notation);
  useEffect(() => {
    if (focus && mode === 'dependencies') setMode(initialMode ?? 'context');
  }, [focus, mode, initialMode]);
  const types: ElementType[] | undefined = focus
    ? undefined
    : type === 'application'
      ? ['application', 'interface']
      : [type];
  const { data, isLoading } = useGraph({
    focus,
    mode,
    depth,
    types,
    domainId: focus ? undefined : domain,
  });
  const domainName = useElement(focus ? null : domain).data?.name;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2">
        <ElementPicker
          types={[
            'application',
            'capability',
            'interface',
            'technology',
            'data_object',
            'business_process',
            'initiative',
          ]}
          value={null}
          onChange={(v) => v && onFocus(v.id)}
          trigger={
            <Button size="sm">
              <Crosshair /> {focus ? 'Centre on another' : 'Centre on…'}
            </Button>
          }
        />
        {focus && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onFocus(undefined);
              setMode('dependencies');
            }}
          >
            Show everything
          </Button>
        )}
        {!focus && domain && (
          <Button size="sm" variant="ghost" onClick={() => onDomain(undefined)}>
            All domains <span className="text-subtle-foreground">/</span>{' '}
            <span className="font-semibold">{domainName ?? '…'}</span>
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
          <Segmented
            size="sm"
            value={String(depth)}
            onValueChange={(d) => setDepth(Number(d))}
            options={[
              { value: '1', label: '1 step' },
              { value: '2', label: '2 steps' },
              { value: '3', label: '3 steps' },
            ]}
          />
        )}
        <div className="flex-1" />
        <Segmented
          size="sm"
          value={notation}
          onValueChange={(n) => ui.set({ notation: n })}
          options={[
            { value: 'cards', label: 'Cards' },
            { value: 'archimate', label: 'ArchiMate' },
          ]}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" aria-label="Download image">
              <Download />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => void exportImage('png')}>PNG image</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportImage('svg')}>
              SVG (scalable)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {data?.summary && (
        <div className="flex items-center gap-2 border-b border-border bg-watch-soft px-6 py-2 text-[13px] text-watch-foreground">
          <Zap className="size-4" /> {data.summary}
        </div>
      )}
      {data?.note && (
        <div className="border-b border-border bg-surface-2 px-6 py-1.5 text-xs text-muted-foreground">
          {data.note}
        </div>
      )}
      {data?.truncated && (
        <div className="border-b border-border bg-surface-2 px-6 py-1.5 text-xs text-muted-foreground">
          Showing the first {data.nodes.length} elements. Centre on one to see its surroundings.
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {isLoading ? (
          <Skeleton className="absolute inset-6 rounded-2xl" />
        ) : !data?.nodes.length ? (
          <EmptyState icon={<Network />} title="Nothing to draw" className="mt-16">
            Link applications with “depends on” or interfaces to see them here.
          </EmptyState>
        ) : (
          <ReactFlowProvider>
            <GraphCanvas
              data={data}
              focus={focus}
              notation={notation}
              onDomain={(id) => onDomain(id)}
            />
          </ReactFlowProvider>
        )}
      </div>
      <div className="flex items-center gap-4 border-t border-border px-6 py-1.5 text-[11px] text-muted-foreground">
        {(
          ['application', 'interface', 'technology', 'capability', 'data_object'] as ElementType[]
        ).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <TypeIcon type={t} size="xs" /> {typeDef(t).label}
          </span>
        ))}
        <span className="ml-auto">Click a box for details · drag to rearrange</span>
      </div>
    </div>
  );
}
