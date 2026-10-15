import {
  assembleSources,
  type PackElement,
  type SourceFile,
  type SourceSheet,
} from '@atrium/packs-core';
import { describe, expect, it } from 'vitest';
import { applicationReader } from './applications';
import { etomReader } from './etom';
import { functionalReader } from './functional';
import { tmforumReaders } from './index';
import { sidReader } from './sid';

// Small synthetic workbooks in the layouts TM Forum publishes. The names are invented: the
// repository holds no TM Forum content.

function sheet(name: string, headers: string[], rows: unknown[][]): SourceSheet {
  return {
    name,
    headers,
    rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? null]))),
  };
}

const cover = sheet('Document Title', ['Standard', 'Date'], [['Version 26.0.0', 'IPR Mode: RAND']]);
const notice = sheet('Document Notice', ['Notice', 'x'], [['Copyright', '']]);

const byId = (els: PackElement[]) => new Map(els.map((e) => [e.sourceId, e]));

describe('eTOM workbook', () => {
  const H = [
    'Process',
    'Process identifier',
    'Level',
    'Extended Description',
    'Brief Description',
    'Domain',
    'Vertical Group',
    'UID',
    'Issue',
  ];
  const file: SourceFile = {
    name: 'GB921_Processes_v26.0.xlsx',
    sheets: [
      cover,
      notice,
      sheet('eTOM26.0', H, [
        [
          'Widget Strategy',
          '1.1.1',
          2,
          'Long text &amp; more',
          'Plan widgets',
          'Widget Domain',
          'Strategy',
          10,
        ],
        [
          'Widget Strategy',
          '1.1.1',
          2,
          'Long text &amp; more',
          'Plan widgets',
          'Widget Domain',
          'Assurance',
          10,
        ],
        ['Gather Widget Facts', '1.1.1.1', 3, '', 'Collect facts', '', '', 11],
        [
          'Orphan Step [**]',
          '1.1.1.2.1',
          4,
          '',
          'A step whose parent was removed',
          'Widget Domain',
          '',
          12,
        ],
        ['Sell Gadgets', '1.12.1', 2, '', 'Sell', 'Gadget Domain', 'Fulfillment', 13],
      ]),
      sheet('eTOM Deleted', H, [['Old Process', '1.1.9', 2, '', '', '', '', 99]]),
      sheet('All 26.0 changes ', ['new process', 'x'], [['Widget Strategy', '1.1.1']]),
    ],
  };

  it('is recognised by its columns, and only by the eTOM reader', () => {
    expect(tmforumReaders.filter((r) => r.recognises(file))).toEqual([etomReader]);
  });

  it('loads each process once, adds the level 1 domains and keeps the hierarchy', () => {
    const r = etomReader.read(file);
    const els = byId(r.elements);
    expect(r.version).toBe('26.0');
    expect([...els.keys()].sort()).toEqual(
      [
        'etom:1.1',
        'etom:1.1.1',
        'etom:1.1.1.1',
        'etom:1.1.1.2.1',
        'etom:1.12',
        'etom:1.12.1',
      ].sort(),
    );
    expect(els.get('etom:1.1')!.name).toBe('Widget Domain');
    expect(els.get('etom:1.1')!.parentSourceId).toBeUndefined();
    expect(els.get('etom:1.12')!.name).toBe('Gadget Domain');
    expect(els.get('etom:1.1.1')).toMatchObject({
      name: 'Widget Strategy',
      description: 'Plan widgets',
      parentSourceId: 'etom:1.1',
      attributes: {
        level: 'Level 2',
        domain: 'Widget Domain',
        verticalGroups: ['Strategy', 'Assurance'],
        extendedDescription: 'Long text & more',
        uid: '10',
      },
    });
    // The domain comes from the level 1 group when the row leaves it empty.
    expect(els.get('etom:1.1.1.1')!.attributes!.domain).toBe('Widget Domain');
    // "1.1.1.2" is missing: the step goes under "1.1.1", and the marker leaves the name.
    expect(els.get('etom:1.1.1.2.1')).toMatchObject({
      name: 'Orphan Step',
      parentSourceId: 'etom:1.1.1',
      attributes: { marker: '[**]' },
    });
    expect(r.sheets.filter((s) => s.loaded).map((s) => s.name)).toEqual(['eTOM26.0']);
    expect(r.sheets.find((s) => s.name === 'eTOM Deleted')!.note).toMatch(/removed/);
    expect(r.notes.join(' ')).toMatch(/1 row repeat/);
  });
});

describe('SID workbook', () => {
  const H = ['ABE Name', 'BE Name', 'Attribute Name', 'Origin', 'Stereotype', 'Documentation'];
  const rows = [
    ['Business Entity.Widget Domain', '', '', '', '', 'All about widgets'],
    ['Widget Domain.Widget ABE', '', '', '', '', 'Widgets and their parts'],
    ['', 'WidgetSpec', '', '', '', 'Describes a widget'],
    ['', '', 'name', 'RootEntity', '«required»', ''],
    ['', '', 'colour', 'WidgetSpec', '', ''],
    ['Widget ABE.Widget Part ABE', '', '', '', '', ''],
    ['', 'WidgetPart', '', '', '', ''],
    ['Business Entity.Gadget Domain', '', '', '', '', ''],
    ['Gadget Domain.Gadget ABE', '', '', '', '', ''],
    ['', 'WidgetSpec', '', '', '', ''],
    ['Figures Package.Loose ABE', '', '', '', '', ''],
  ];
  const file: SourceFile = {
    name: 'GB922_SID_v26.0.xlsx',
    sheets: [cover, sheet('All Domains', H, rows), sheet('Widget', H, rows.slice(0, 7))],
  };

  it('reads the outline: domains, ABEs, entities and their attributes', () => {
    const r = sidReader.read(file);
    const els = byId(r.elements);
    expect(els.get('sid:Widget Domain')).toMatchObject({
      type: 'data_object',
      description: 'All about widgets',
      parentSourceId: undefined,
      attributes: { level: 'Domain' },
    });
    expect(els.get('sid:Widget Part ABE')!.parentSourceId).toBe('sid:Widget ABE');
    expect(els.get('sid:WidgetSpec')).toMatchObject({
      parentSourceId: 'sid:Widget ABE',
      attributes: {
        level: 'Business entity',
        attributeNames: ['name', 'colour'],
        alsoIn: ['Gadget ABE'],
      },
    });
    // A parent that is never listed itself becomes a top-level group.
    expect(els.get('sid:Figures Package')).toMatchObject({ parentSourceId: undefined });
    expect(r.sheets.find((s) => s.name === 'Widget')!.note).toMatch(/Same content/);
  });
});

describe('Functional Framework workbook', () => {
  const FH = [
    'Domain',
    'AF Lev.1',
    "AF Lev.2'",
    'Function Name',
    'Function ID',
    'UID',
    'Description',
    'Vertical',
  ];
  const AH = ['AF', 'ID', 'UID', 'Hierarchy', 'Description', 'Column F', 'Column G'];
  const file: SourceFile = {
    name: 'GB1033F_Functional_Framework_v26.0.xlsx',
    sheets: [
      cover,
      sheet('Functions', FH, [
        [
          'Widget Domain',
          'Widget Management',
          'Widget Design',
          'Draw Widget',
          3,
          100,
          'Draws',
          'Fulfillment, Billing',
        ],
        [
          '',
          'Aggregated Function TBD',
          'Aggregated Function TBD L2',
          'Paint Widget',
          4,
          101,
          'Paints',
        ],
        ['Widget Domain', 'Widget Management', 'Widget Design', 'Paint Widget', 4, 101, 'Paints'],
        ['Widget Domain', 'Widget Management', 'Widget Design', 'Old Function (deleted)', 5, 102],
        ['Widget Domain', 'Widget Management', 'Widget Pricing', 'Price Widget', 6, 103],
        ['', 'Aggregated Function TBD', 'Aggregated Function TBD L2', 'Loose Function', 7, 104],
      ]),
      sheet('AF All', AH, [
        ['Widget Management', '1.1.1', 1, 1, 'Manages widgets', 'It also counts them (e', ', g)'],
        ['Widget Design', '1.1.1.1', 2, 2, 'Designs widgets'],
        ['Widget Pricing', '1.4.2.1', 3, 2, 'Prices widgets'],
      ]),
    ],
  };

  it('builds domain → aggregate functions → functions', () => {
    const r = functionalReader.read(file);
    const els = byId(r.elements);
    expect(els.get('oda-ff:Widget Domain')!.type).toBe('capability');
    expect(els.get('oda-ff:Widget Domain')!.parentSourceId).toBeUndefined();
    expect(els.get('oda-ff:1.1.1')).toMatchObject({
      name: 'Widget Management',
      parentSourceId: 'oda-ff:Widget Domain',
      description: 'Manages widgets. It also counts them (e. , g)',
    });
    expect(els.get('oda-ff:1.1.1.1')!.parentSourceId).toBe('oda-ff:1.1.1');
    // No "1.4.2": placed under the level 1 function the function list names.
    expect(els.get('oda-ff:1.4.2.1')!.parentSourceId).toBe('oda-ff:1.1.1');
    expect(els.get('oda-ff:3')).toMatchObject({
      name: 'Draw Widget',
      parentSourceId: 'oda-ff:1.1.1.1',
      attributes: { level: 'Function', verticals: ['Fulfillment', 'Billing'], uid: '100' },
    });
    // The repeat in a real aggregate function wins over the placeholder row.
    expect(els.get('oda-ff:4')!.parentSourceId).toBe('oda-ff:1.1.1.1');
    expect(els.has('oda-ff:5')).toBe(false);
    expect(els.get('oda-ff:7')!.parentSourceId).toBe('oda-ff:ungrouped');
    expect(r.notes.join(' ')).toMatch(/1 function marked deleted/);
  });
});

describe('Application Framework (TAM) workbook', () => {
  const H = [
    'TMF Application',
    'Level',
    'Application Identifier',
    'Documentation',
    'Domain',
    'TMF_Function',
    'Issues',
  ];
  const file: SourceFile = {
    name: 'GB929F_Application_Framework_v26.0.xlsx',
    sheets: [
      cover,
      sheet('TAM 26.0', H, [
        // Excel stored "5.10" as the number 5.1, so two applications share "5.1".
        ['Invoice Dispute Management', 1, 5.1, '', 'Customer Domain'],
        ['Customer Records', 1, 5.1, '', 'Customer Domain', 'Draw Widget'],
        ['Customer Records', 1, 5.1, '', 'Customer Domain', 'Paint Widget'],
        ['Record Search', 2, '5.1.1', '', 'Customer Domain'],
        ['Invoice Dispute Intake', 2, '5.10.1', '', 'Customer Domain', 'Price Widget'],
        [
          'Withdrawn App (Deleted)',
          1,
          '5.3 (This Application ID has been deliberately unused!)',
          'Deleted',
          'Customer Domain',
        ],
        ['Deep App', 3, '5.1.9.1', 'TBA', 'Customer Domain'],
      ]),
      sheet(
        'Functions 26.0',
        ['Domain', 'Vertical', 'Function Name', 'Function ID', 'Description'],
        [['Widget Domain', 'Billing', 'Draw Widget', 3, 'Draws']],
      ),
    ],
  };

  it('puts back ids Excel stored as numbers, using the sub-applications', () => {
    const r = applicationReader.read(file);
    const els = byId(r.elements);
    expect(els.get('tam:5')!.name).toBe('Customer Domain');
    expect(els.get('tam:5')!.parentSourceId).toBeUndefined();
    expect(els.get('tam:5.1')).toMatchObject({
      name: 'Customer Records',
      parentSourceId: 'tam:5',
      attributes: { level: 'Level 1', functions: ['Draw Widget', 'Paint Widget'] },
    });
    expect(els.get('tam:5.10')!.name).toBe('Invoice Dispute Management');
    expect(els.get('tam:5.10.1')!.parentSourceId).toBe('tam:5.10');
    expect(els.get('tam:5.1.9.1')).toMatchObject({
      parentSourceId: 'tam:5.1',
      description: undefined,
    });
    expect([...els.values()].some((e) => e.name.includes('Withdrawn'))).toBe(false);
    expect(r.links).toContainEqual({
      type: 'realizes',
      from: 'tam:5.1',
      framework: 'oda-ff',
      name: 'Paint Widget',
    });
    expect(r.sheets.find((s) => s.name === 'Functions 26.0')!.note).toMatch(/GB1033F/);
  });

  it('links applications to the Functional Framework when both files are loaded', () => {
    const fn: SourceFile = {
      name: 'ff.xlsx',
      sheets: [
        sheet(
          'Functions',
          ['Domain', 'AF Lev.1', "AF Lev.2'", 'Function Name', 'Function ID'],
          [
            ['Widget Domain', '', '', 'Draw Widget', 3],
            ['Widget Domain', '', '', 'Paint Widget', 4],
          ],
        ),
      ],
    };
    const a = assembleSources([applicationReader.read(file), functionalReader.read(fn)]);
    const realizes = a.relations.filter((r) => r.from === 'tam:5.1').map((r) => r.to);
    expect(realizes.sort()).toEqual(['oda-ff:3', 'oda-ff:4']);
    expect(a.notes.join(' ')).toMatch(/1 link named an element that isn't in the files/);
  });
});
