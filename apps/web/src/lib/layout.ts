import ELK, { type ElkNode } from 'elkjs/lib/elk-api.js';
import ElkWorker from 'elkjs/lib/elk-worker.min.js?worker';

let elk: InstanceType<typeof ELK> | null = null;

function getElk() {
  elk ??= new ELK({ workerFactory: () => new ElkWorker() as never });
  return elk;
}

export interface LayoutInput {
  nodes: Array<{ id: string; width: number; height: number }>;
  edges: Array<{ id: string; source: string; target: string }>;
  direction?: 'RIGHT' | 'DOWN';
}

/** Automatic layout with ELK (layered), computed off the main thread. */
export async function layout(input: LayoutInput): Promise<Map<string, { x: number; y: number }>> {
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': input.direction ?? 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      'elk.spacing.nodeNode': '28',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.separateConnectedComponents': 'true',
      'elk.spacing.componentComponent': '60',
      'elk.edgeRouting': 'SPLINES',
    },
    children: input.nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
    edges: input.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const result = await getElk().layout(graph);
  const pos = new Map<string, { x: number; y: number }>();
  for (const c of result.children ?? []) pos.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
  return pos;
}
