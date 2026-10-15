import type { Element, Relation } from '@atrium/schema';
import { describe, expect, it } from 'vitest';
import { ModelIndex } from './model-index';
import {
  buildFrameworkNode,
  buildFrameworkTree,
  frameworkMembers,
  type PackInfo,
} from './reference';

const ref = (
  id: string,
  framework: string,
  parentId: string | null = null,
  attributes: Record<string, unknown> = {},
) =>
  ({
    id,
    type: framework === 'apps' ? 'application' : 'business_process',
    key: `${framework}:${id}`,
    name: `Process ${id}`,
    description: '',
    parentId,
    layer: 'reference',
    pack: 'tmf',
    attributes: { framework, ...attributes },
  }) as unknown as Element;

const own = (id: string) =>
  ({ id, type: 'business_process', name: id, layer: 'org', attributes: {} }) as unknown as Element;

const rel = (type: Relation['type'], sourceId: string, targetId: string) =>
  ({ id: `${sourceId}-${type}-${targetId}`, type, sourceId, targetId }) as Relation;

const packs = new Map<string, PackInfo>([
  [
    'tmf',
    {
      id: 'tmf',
      name: 'TM Forum frameworks',
      version: '26.0',
      frameworks: [
        { id: 'etom', name: 'eTOM', elementType: 'business_process' },
        { id: 'apps', name: 'Applications', elementType: 'application' },
      ],
    },
  ],
]);

function members(elements: Element[], relations: Relation[] = []) {
  const index = new ModelIndex({
    elements: new Map(elements.map((e) => [e.id, e])),
    relations: new Map(relations.map((r) => [r.id, r])),
  });
  return frameworkMembers(index, 'tmf', 'etom')!;
}

function tree(elements: Element[], relations: Relation[] = []) {
  return buildFrameworkTree(members(elements, relations), packs);
}

describe('framework tree', () => {
  const etom = [
    ref('1', 'etom', null, { level: 'Level 1', domain: 'Market' }),
    ref('1.10', 'etom', '1'),
    ref('1.2', 'etom', '1'),
    ref('1.2.1', 'etom', '1.2'),
    ref('1.2.2', 'etom', '1.2'),
  ];

  it('lists parents before their children, siblings in key order', () => {
    const t = tree(etom);
    expect(t.nodes.map((n) => n.key)).toEqual(['1', '1.2', '1.2.1', '1.2.2', '1.10']);
    expect(t.nodes.map((n) => n.depth)).toEqual([1, 2, 3, 3, 2]);
    expect(t.nodes[0]).toMatchObject({ level: 'Level 1', domain: 'Market', parentId: null });
    // Without a level or domain of its own, the depth and the top of its branch stand in.
    expect(t.nodes[1]).toMatchObject({ level: 'Level 2', domain: 'Process 1', parentId: '1' });
  });

  it('rolls coverage up its branches, counting each of your elements once', () => {
    const t = tree(
      [...etom, own('order'), own('billing')],
      [
        rel('maps_to', 'order', '1.2.1'),
        rel('maps_to', 'order', '1.2.2'),
        rel('maps_to', 'billing', '1.2.2'),
        // A reference element mapping to another is not your model covering it.
        rel('maps_to', '1.10', '1.2'),
      ],
    );
    const byKey = new Map(t.nodes.map((n) => [n.key, n]));
    expect(byKey.get('1.2.2')).toMatchObject({ mapped: 2, mappedBelow: 2, size: 1, covered: 1 });
    expect(byKey.get('1.2')).toMatchObject({ mapped: 0, mappedBelow: 2, size: 3, covered: 2 });
    expect(byKey.get('1')).toMatchObject({ mappedBelow: 2, size: 5, covered: 2 });
    expect(byKey.get('1.10')).toMatchObject({ mappedBelow: 0, covered: 0 });
    expect(t.totals).toMatchObject({ nodes: 5, covered: 2, mappedElements: 2, candidates: 2 });
  });

  it('counts links to other frameworks', () => {
    const t = tree(
      [...etom, ref('a', 'apps'), ref('b', 'apps')],
      [rel('realizes', 'a', '1.2'), rel('realizes', 'b', '1.2'), rel('realizes', 'a', '1.10')],
    );
    expect(t.nodes.find((n) => n.key === '1.2')?.links).toBe(2);
    expect(t.links).toEqual([
      {
        type: 'realizes',
        label: 'realized by',
        direction: 'in',
        framework: {
          packId: 'tmf',
          packName: 'TM Forum frameworks',
          id: 'apps',
          name: 'Applications',
        },
        count: 3,
        elements: 2,
      },
    ]);
  });

  describe('coverage through other frameworks', () => {
    const elements = [
      ...etom,
      ref('a', 'apps'),
      ref('b', 'apps'),
      ref('c', 'apps'),
      ref('d', 'apps'),
      own('crm'),
      own('erp'),
      own('order'),
      own('billing'),
    ];
    const relations = [
      // Your applications map to the other framework's, which realize or support these.
      rel('maps_to', 'crm', 'a'),
      rel('realizes', 'a', '1.2.1'),
      rel('maps_to', 'erp', 'b'),
      rel('maps_to', 'erp', 'd'),
      rel('realizes', 'b', '1.2.2'),
      rel('supports', 'b', '1.10'),
      rel('supports', 'd', '1.10'),
      rel('maps_to', 'order', '1.2.2'),
      // None of these pass coverage on:
      rel('realizes', 'c', '1.2'), // nothing of yours maps to c
      rel('flows_to', 'a', '1.2'), // not a link that covers
      rel('realizes', '1', 'a'), // the wrong way round: 1 realizes a, a doesn't cover 1
      rel('maps_to', 'billing', '1.2.2'),
      rel('realizes', '1.2.2', '1.2.1'), // inside the framework: billing maps to 1.2.2 only
    ];

    it('counts it per element and rolls it up its branches, apart from direct mappings', () => {
      const t = tree(elements, relations);
      const byKey = new Map(t.nodes.map((n) => [n.key, n]));
      expect(byKey.get('1.2.1')).toMatchObject({
        mapped: 0,
        mappedThrough: 1,
        mappedThroughBelow: 1,
        covered: 0,
        coveredThrough: 1,
      });
      // Mapped directly as well: covered, not covered through.
      expect(byKey.get('1.2.2')).toMatchObject({
        mapped: 2,
        mappedThrough: 1,
        covered: 1,
        coveredThrough: 0,
      });
      // erp reaches it through two applications, and counts once.
      expect(byKey.get('1.10')).toMatchObject({ mappedThrough: 1, coveredThrough: 1 });
      expect(byKey.get('1.2')).toMatchObject({
        mappedThrough: 0,
        mappedBelow: 2,
        mappedThroughBelow: 2,
        size: 3,
        covered: 1,
        coveredThrough: 1,
      });
      expect(byKey.get('1')).toMatchObject({
        mappedThrough: 0,
        mappedThroughBelow: 2,
        size: 5,
        covered: 1,
        coveredThrough: 2,
      });
      expect(t.totals).toMatchObject({ covered: 1, coveredThrough: 2, mappedThroughElements: 2 });
      expect(t.through).toEqual([
        {
          framework: {
            packId: 'tmf',
            packName: 'TM Forum frameworks',
            id: 'apps',
            name: 'Applications',
          },
          covered: 2,
          mappedElements: 2,
        },
      ]);
    });

    it('lists what reaches an element, and through what', () => {
      const m = members(elements, relations);
      const fn = buildFrameworkNode(m, packs, '1.10');
      expect(fn.mappedFrom).toEqual([]);
      expect(fn.mappedThrough).toHaveLength(1);
      expect(fn.mappedThrough[0]!.framework.name).toBe('Applications');
      expect(fn.mappedThrough[0]!.items).toEqual([
        {
          element: expect.objectContaining({ id: 'erp', name: 'erp', domainName: null }),
          via: [
            { id: 'b', key: 'b', name: 'Process b', label: 'supports' },
            { id: 'd', key: 'd', name: 'Process d', label: 'supports' },
          ],
        },
      ]);
      expect(buildFrameworkNode(m, packs, '1.2.1').mappedThrough[0]!.items).toEqual([
        expect.objectContaining({
          element: expect.objectContaining({ id: 'crm' }),
          via: [{ id: 'a', key: 'a', name: 'Process a', label: 'realizes' }],
        }),
      ]);
      expect(buildFrameworkNode(m, packs, '1.2').mappedThrough).toEqual([]);
      expect(buildFrameworkNode(m, packs, '1').mappedThrough).toEqual([]);
    });

    it('is empty without links', () => {
      const t = tree(etom);
      expect(t.nodes.every((n) => n.mappedThrough === 0 && n.coveredThrough === 0)).toBe(true);
      expect(t.totals).toMatchObject({ coveredThrough: 0, mappedThroughElements: 0 });
      expect(t.through).toEqual([]);
    });
  });

  it('keeps elements caught in a parent loop instead of dropping them', () => {
    const t = tree([ref('x', 'etom', 'y'), ref('y', 'etom', 'x')]);
    expect(t.nodes).toHaveLength(2);
  });
});
