import type { Element, Relation } from '@atrium/schema';
import { describe, expect, it } from 'vitest';
import { appCost, costModel } from './costs';
import { ModelIndex } from './model-index';

const el = (id: string, type: Element['type'], attributes: Record<string, unknown> = {}) =>
  ({
    id,
    type,
    name: id,
    layer: 'org',
    lifecycle: 'active',
    lifecycleDates: {},
    attributes,
  }) as unknown as Element;

const rel = (type: Relation['type'], sourceId: string, targetId: string) =>
  ({ id: `${sourceId}-${type}-${targetId}`, type, sourceId, targetId }) as Relation;

function index(elements: Element[], relations: Relation[]) {
  return new ModelIndex({
    elements: new Map(elements.map((e) => [e.id, e])),
    relations: new Map(relations.map((r) => [r.id, r])),
  });
}

describe('cost model', () => {
  const today = '2026-10-09';

  it('shares a lump-sum contract evenly over what it covers', () => {
    const idx = index(
      [
        el('crm', 'application', { annual_cost: 100 }),
        el('erp', 'application'),
        el('lic', 'contract', { annual_cost: 300 }),
      ],
      [rel('covers', 'lic', 'crm'), rel('covers', 'lic', 'erp')],
    );
    const m = costModel(idx, today);
    expect(m.total).toBe(400);
    expect(m.viaContracts).toBe(300);
    expect(appCost(idx, 'crm', today)).toMatchObject({ own: 100, total: 250, known: true });
    expect(appCost(idx, 'erp', today)).toMatchObject({ own: null, total: 150, known: true });
  });

  it('shares a contract on a technology over the applications running on it', () => {
    const idx = index(
      [
        el('a', 'application'),
        el('b', 'application'),
        el('db', 'technology'),
        el('ula', 'contract', { annual_cost: 1000, cost_basis: 'estimate' }),
      ],
      [rel('uses', 'a', 'db'), rel('uses', 'b', 'db'), rel('covers', 'ula', 'db')],
    );
    expect(appCost(idx, 'a', today).total).toBe(500);
    expect(appCost(idx, 'a', today).estimated).toBe(500);
    expect(costModel(idx, today).estimated).toBe(1000);
  });

  it('keeps contract money that covers no live application apart, and ignores ended contracts', () => {
    const idx = index(
      [
        el('db', 'technology'),
        el('lic', 'contract', { annual_cost: 200 }),
        el('old', 'contract', { annual_cost: 999, end_date: '2025-01-01' }),
        el('app', 'application'),
      ],
      [rel('covers', 'lic', 'db'), rel('covers', 'old', 'app')],
    );
    const m = costModel(idx, today);
    expect(m.unallocated).toBe(200);
    expect(m.total).toBe(200);
    expect(appCost(idx, 'app', today).known).toBe(false);
  });
});
