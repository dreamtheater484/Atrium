import ELK, { type ElkNode } from 'elkjs/lib/elk-api.js';
import ElkWorker from 'elkjs/lib/elk-worker.min.js?worker';

let elk: InstanceType<typeof ELK> | null = null;

function getElk() {
  elk ??= new ELK({ workerFactory: () => new ElkWorker() as never });
  return elk;
}

export interface LayoutInput {
  /** `group` puts the node inside a labelled box; positions of grouped nodes are relative to it. */
  nodes: Array<{ id: string; width: number; height: number; group?: string }>;
  edges: Array<{ id: string; source: string; target: string }>;
  direction?: 'RIGHT' | 'DOWN';
  /** `stress` spreads a small, densely linked graph over two dimensions. */
  algorithm?: 'layered' | 'stress';
}

export interface Placed {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export const GROUP_PREFIX = 'group:';
export const GROUP_HEADER = 34;

/** Automatic layout with ELK (layered), computed off the main thread. */
export async function layout(input: LayoutInput): Promise<Map<string, Placed>> {
  const leaf = (n: LayoutInput['nodes'][number]): ElkNode => ({
    id: n.id,
    width: n.width,
    height: n.height,
  });
  const groups = new Map<string, ElkNode>();
  const top: ElkNode[] = [];
  for (const n of input.nodes) {
    if (!n.group) {
      top.push(leaf(n));
      continue;
    }
    let g = groups.get(n.group);
    if (!g) {
      g = {
        id: GROUP_PREFIX + n.group,
        children: [],
        layoutOptions: {
          'elk.padding': `[top=${GROUP_HEADER + 10},left=16,bottom=16,right=16]`,
          'elk.algorithm': 'layered',
          'elk.direction': input.direction ?? 'RIGHT',
          'elk.spacing.nodeNode': '18',
          'elk.layered.spacing.nodeNodeBetweenLayers': '48',
        },
      };
      groups.set(n.group, g);
      top.push(g);
    }
    g.children!.push(leaf(n));
  }
  const graph: ElkNode = {
    id: 'root',
    layoutOptions:
      input.algorithm === 'stress'
        ? {
            'elk.algorithm': 'stress',
            'elk.stress.desiredEdgeLength': '300',
            'elk.spacing.nodeNode': '60',
          }
        : {
            'elk.algorithm': 'layered',
            'elk.direction': input.direction ?? 'RIGHT',
            'elk.layered.spacing.nodeNodeBetweenLayers': groups.size ? '70' : '90',
            'elk.spacing.nodeNode': groups.size ? '40' : '28',
            'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
            'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
            'elk.separateConnectedComponents': 'true',
            'elk.spacing.componentComponent': '60',
            'elk.edgeRouting': 'SPLINES',
            ...(groups.size ? { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' } : {}),
          },
    children: top,
    edges: input.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const result = await getElk().layout(graph);
  const pos = new Map<string, Placed>();
  for (const c of result.children ?? []) {
    pos.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, width: c.width, height: c.height });
    for (const k of c.children ?? []) pos.set(k.id, { x: k.x ?? 0, y: k.y ?? 0 });
  }
  return pos;
}
