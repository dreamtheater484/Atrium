import { describe, expect, it } from 'vitest';
import { diffPack, type PackContent, type PackElement } from './index';
import {
  assembleSources,
  cellText,
  emptyResult,
  nearestAncestor,
  readByColumns,
  type SourceResult,
} from './sources';

const el = (sourceId: string, name: string, extra: Partial<PackElement> = {}): PackElement => ({
  sourceId,
  framework: 'apps',
  type: 'application',
  name,
  ...extra,
});

const result = (extra: Partial<SourceResult>): SourceResult => ({ ...emptyResult(), ...extra });

describe('cellText', () => {
  it('trims and decodes the HTML entities some exports leave in', () => {
    expect(cellText('  Plan &amp; Build &#8211; &lt;draft&gt; ')).toBe('Plan & Build – <draft>');
    expect(cellText(5.1)).toBe('5.1');
    expect(cellText(null)).toBe('');
  });
});

describe('nearestAncestor', () => {
  it('skips missing levels', () => {
    const ids = new Set(['1', '1.2']);
    expect(nearestAncestor('1.2.3.4', (id) => ids.has(id))).toBe('1.2');
    expect(nearestAncestor('1.2.3.4', (id) => ids.has(id), 3)).toBeUndefined();
  });
});

describe('readByColumns', () => {
  const file = {
    name: 'x.xlsx',
    sheets: [
      { name: 'Cover', headers: ['Name', 'Date'], rows: [{ Name: 'Read me', Date: '2026' }] },
      {
        name: 'Components',
        headers: ['Component ID', 'Component name', 'Description'],
        rows: [
          { 'Component ID': 'C1', 'Component name': 'Catalogue', Description: 'Holds offers' },
        ],
      },
    ],
  };
  const fw = [
    {
      id: 'components',
      name: 'Components',
      elementType: 'application' as const,
      detect: { sheetWords: ['component'], headerWords: ['component'] },
    },
  ];
  const columns = { id: ['component id'], name: ['component name', 'name'] };

  it('takes any sheet for a lone framework, unless strict', () => {
    expect(readByColumns(file, fw, columns).elements.map((e) => e.name)).toEqual([
      'Read me',
      'Catalogue',
    ]);
    const strict = readByColumns(file, fw, columns, { strict: true });
    expect(strict.elements.map((e) => e.name)).toEqual(['Catalogue']);
    expect(strict.sheets[0]).toMatchObject({ name: 'Cover', loaded: false });
  });
});

describe('assembleSources', () => {
  it('keeps an element once and fills gaps from later copies', () => {
    const a = assembleSources([
      result({ elements: [el('a:1', 'Billing')] }),
      result({ elements: [el('a:1', 'Billing', { description: 'Bills customers' })] }),
    ]);
    expect(a.elements).toEqual([el('a:1', 'Billing', { description: 'Bills customers' })]);
    expect(a.notes.join(' ')).toMatch(/more than one file/);
  });

  it('resolves links by name, using installed elements for frameworks not in the files', () => {
    const links = [
      { type: 'realizes' as const, from: 'a:1', framework: 'fn', name: 'Rating' },
      { type: 'realizes' as const, from: 'a:1', framework: 'fn', name: 'Unknown' },
    ];
    const alone = assembleSources([result({ elements: [el('a:1', 'Billing')], links })], [], {
      fn: 'Function list',
    });
    expect(alone.relations).toEqual([]);
    expect(alone.notes.join(' ')).toMatch(/2 links to the Function list can't be made/);

    const withInstalled = assembleSources(
      [result({ elements: [el('a:1', 'Billing')], links })],
      [{ sourceId: 'fn:9', framework: 'fn', name: 'rating' }],
    );
    expect(withInstalled.relations).toEqual([{ type: 'realizes', from: 'a:1', to: 'fn:9' }]);
    expect(withInstalled.notes.join(' ')).toMatch(
      /1 link named an element that isn't in the files/,
    );
    expect(withInstalled.frameworks).toEqual(['apps']);
  });

  it('reports a version only when the files agree', () => {
    expect(
      assembleSources([result({ version: '26.0' }), result({ version: '26.0' })]).version,
    ).toBe('26.0');
    expect(
      assembleSources([result({ version: '26.0' }), result({ version: '25.5' })]).version,
    ).toBeUndefined();
  });
});

describe('diffPack with attributes', () => {
  const pack = (elements: PackElement[]): PackContent => ({
    format: 'atrium-pack',
    manifest: {
      id: 't',
      name: 'T',
      version: '1',
      publisher: '',
      description: '',
      license: '',
      frameworks: [{ id: 'apps', name: 'Apps', elementType: 'application' }],
    },
    elements,
    relations: [],
  });
  const installed = (
    id: string,
    key: string,
    name: string,
    attributes?: Record<string, unknown>,
  ) => ({
    id,
    key,
    name,
    type: 'application' as const,
    mappedFrom: 0,
    attributes,
  });

  it('counts changed attributes as a change, whatever their key order', () => {
    const diff = diffPack(
      [
        installed('x', 'a:1', 'Billing', { level: 'Level 1', domain: 'Customer' }),
        installed('y', 'a:2', 'Rating', { level: 'Level 1' }),
      ],
      pack([
        el('a:1', 'Billing', { attributes: { domain: 'Customer', level: 'Level 1' } }),
        el('a:2', 'Rating', { attributes: { level: 'Level 2' } }),
      ]),
    );
    expect(diff.unchanged).toBe(1);
    expect(diff.changed.map((c) => c.id)).toEqual(['y']);
  });

  it('never matches by name an element still present under its own id', () => {
    const diff = diffPack(
      [installed('x', 'a:1', 'Billing'), installed('y', 'a:2', 'Billing')],
      pack([el('a:3', 'Billing'), el('a:1', 'Billing'), el('a:2', 'Billing')]),
    );
    expect(diff.added.map((a) => a.sourceId)).toEqual(['a:3']);
    expect(diff.unchanged).toBe(2);
  });
});
