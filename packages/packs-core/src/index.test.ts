import { describe, expect, it } from 'vitest';
import { diffPack, type PackContent, type PackElement, validatePack } from './index';

const pack = (elements: PackElement[], relations: PackContent['relations'] = []): PackContent => ({
  format: 'atrium-pack',
  manifest: {
    id: 'test',
    name: 'Test pack',
    version: '2',
    publisher: 'Test',
    description: '',
    license: 'Test only',
    frameworks: [{ id: 'proc', name: 'Processes', elementType: 'business_process' }],
  },
  elements,
  relations,
});

const el = (sourceId: string, name: string, extra: Partial<PackElement> = {}): PackElement => ({
  sourceId,
  framework: 'proc',
  type: 'business_process',
  name,
  ...extra,
});

const installed = (id: string, key: string, name: string, extra = {}) => ({
  id,
  key,
  name,
  type: 'business_process' as const,
  mappedFrom: 1,
  ...extra,
});

describe('validatePack', () => {
  it('accepts a well-formed pack and counts per framework', () => {
    const v = validatePack(pack([el('1', 'Sell'), el('1.1', 'Quote', { parentSourceId: '1' })]));
    expect(v.ok).toBe(true);
    expect(v.counts).toEqual({ proc: 2 });
  });

  it('rejects duplicate ids and unknown frameworks, and warns on dangling references', () => {
    const v = validatePack(
      pack(
        [el('1', 'Sell'), el('1', 'Sell again'), el('2', 'Bill', { framework: 'nope' })],
        [{ type: 'flows_to', from: '1', to: '9' }],
      ),
    );
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/Duplicate id 1/);
    expect(v.errors.join(' ')).toMatch(/unknown framework "nope"/);
    expect(v.warnings.join(' ')).toMatch(/missing element/);
  });
});

describe('diffPack', () => {
  it('keeps mappings across renames, re-numbering and replacements', () => {
    const before = [
      installed('a', '1', 'Sell'),
      installed('b', '2', 'Bill customers', { description: 'Old text' }),
      installed('c', '3', 'Old process'),
      installed('d', '4', 'Retired process'),
      installed('e', '5', 'Same'),
    ];
    const diff = diffPack(
      before,
      pack([
        el('1', 'Sell products'), // renamed, same id
        el('2', 'Bill customers', { description: 'New text' }), // changed
        el('3.1', 'Newer process', { replaces: ['3'] }), // re-numbered and renamed
        el('6', 'Brand new'), // added
        el('5', 'Same'), // unchanged
      ]),
    );
    expect(diff.renamed.map((r) => [r.id, r.from, r.element.name])).toEqual([
      ['a', 'Sell', 'Sell products'],
      ['c', 'Old process', 'Newer process'],
    ]);
    expect(diff.changed.map((c) => c.id)).toEqual(['b']);
    expect(diff.added.map((a) => a.sourceId)).toEqual(['6']);
    expect(diff.removed.map((r) => r.id)).toEqual(['d']);
    expect(diff.unchanged).toBe(1);
  });

  it('matches on name when the source id changed without a "replaces" hint', () => {
    const diff = diffPack(
      [installed('a', 'X1', 'Order handling')],
      pack([el('Y1', 'Order Handling')]),
    );
    expect(diff.added).toHaveLength(0);
    expect(diff.renamed.map((r) => r.id)).toEqual(['a']);
  });
});
