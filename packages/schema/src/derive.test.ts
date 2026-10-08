import { describe, expect, it } from 'vitest';
import {
  computeHealth,
  computeQuality,
  lifecycleAt,
  missingFields,
  similarity,
  slugify,
} from './derive';
import { applyOverlay } from './overlay';
import type { Element } from './element';

const app = (attrs: Record<string, unknown> = {}, extra: Partial<Element> = {}) =>
  ({
    type: 'application',
    description: '',
    owner: null,
    domainId: null,
    lifecycle: null,
    attributes: attrs,
    layer: 'org',
    ...extra,
  }) as Element;

describe('quality', () => {
  it('scores an empty application low and lists what is missing', () => {
    const missing = missingFields(app());
    expect(missing.map((m) => m.field)).toContain('owner');
    expect(missing.map((m) => m.field)).toContain('attributes.vendor');
    expect(computeQuality(app())).toBeLessThan(20);
  });

  it('scores a complete application at 100', () => {
    const full = app(
      {
        vendor: 'SAP',
        hosting: 'saas',
        annual_cost: 1000,
        criticality: 'high',
        time: 'invest',
        business_fit: 4,
        technical_fit: 4,
      },
      {
        description: 'Handles all invoicing for consumer customers.',
        owner: 'Anna',
        domainId: 'd1',
        lifecycle: 'active',
      },
    );
    expect(computeQuality(full, { out: { supports: 1, owned_by: 1 }, in: {} })).toBe(100);
  });

  it('reference elements always count as complete', () => {
    expect(computeQuality(app({}, { layer: 'reference' }))).toBe(100);
  });
});

describe('health', () => {
  const today = '2026-10-08';
  it('flags applications on end-of-life technology', () => {
    const h = computeHealth(app({ technical_fit: 4, business_fit: 4 }), [
      { name: 'Java 8', eolDate: '2026-03-31' },
    ], today);
    expect(h.health).toBe('act');
    expect(h.reasons[0]).toContain('Java 8');
  });
  it('watches average fit', () => {
    expect(computeHealth(app({ technical_fit: 3, business_fit: 4 }), [], today).health).toBe('watch');
  });
  it('is unknown without any signals', () => {
    expect(computeHealth(app(), [], today).health).toBeNull();
  });
  it('is good when everything is fine', () => {
    expect(computeHealth(app({ technical_fit: 5, business_fit: 4 }), [], today).health).toBe('good');
  });
});

describe('lifecycleAt', () => {
  const dates = { plan: '2025-01-01', active: '2026-01-01', retired: '2028-01-01' };
  it('derives the phase from dates', () => {
    expect(lifecycleAt(null, dates, '2024-06-01')).toBe('not_yet');
    expect(lifecycleAt(null, dates, '2025-06-01')).toBe('plan');
    expect(lifecycleAt(null, dates, '2027-06-01')).toBe('active');
    expect(lifecycleAt(null, dates, '2028-06-01')).toBe('retired');
  });
  it('falls back to the stored phase', () => {
    expect(lifecycleAt('active', {}, '2027-01-01')).toBe('active');
  });
});

describe('matching helpers', () => {
  it('slugifies names', () => {
    expect(slugify('Billing Service (EU)')).toBe('billing-service-eu');
  });
  it('rates similar names highly', () => {
    expect(similarity('Salesforce Sales Cloud', 'SalesForce Sales-Cloud')).toBeGreaterThan(0.8);
    expect(similarity('Billing', 'Inventory')).toBeLessThan(0.2);
  });
});

describe('overlay', () => {
  it('marks added, changed and removed elements', () => {
    const base = {
      elements: new Map([
        ['a', { id: 'a', name: 'A' } as Element],
        ['b', { id: 'b', name: 'B' } as Element],
      ]),
      relations: new Map(),
    };
    const t = '2026-01-01T00:00:00Z';
    const result = applyOverlay(base, [
      { id: '1', changesetId: 'c', seq: 1, op: 'update', entity: 'element', entityId: 'a', before: null, after: { id: 'a', name: 'A2' }, createdAt: t },
      { id: '2', changesetId: 'c', seq: 2, op: 'delete', entity: 'element', entityId: 'b', before: null, after: null, createdAt: t },
      { id: '3', changesetId: 'c', seq: 3, op: 'create', entity: 'element', entityId: 'c', before: null, after: { id: 'c', name: 'C' }, createdAt: t },
    ]);
    expect(result.elements.get('a')?.name).toBe('A2');
    expect(result.marks.changed.has('a')).toBe(true);
    expect(result.marks.removed.has('b')).toBe(true);
    expect(result.marks.added.has('c')).toBe(true);
  });
});
