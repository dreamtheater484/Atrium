import { describe, expect, it } from 'vitest';
import { sheetToCandidates } from './candidates';
import { detectElementType } from './detect-type';
import { guessMapping } from './mapping';
import { parseFile } from './parse-file';

const enc = (s: string) => new TextEncoder().encode(s);

describe('CSV import', () => {
  it('reads a semicolon CSV with a BOM, decimal commas and European dates', async () => {
    const csv = [
      '\uFEFFApplicatie;Owner;Kosten per jaar;Lifecycle;Go live;Hosting',
      'Exact Online;Ria;"€ 12.500,00";Productie;01-02-2019;SaaS',
      'AFAS Profit;Joost;1.200.000;uitgefaseerd;31-12-2010;on-prem',
      ';;;;;',
      'Topdesk;Mila;250k;in ontwikkeling;Q1 2027;Azure',
    ].join('\r\n');
    const parsed = await parseFile('applicaties.csv', enc(csv));
    expect(parsed.format).toBe('csv');
    expect(parsed.warnings).toEqual([]);
    const sheet = parsed.sheets![0]!;
    expect(sheet.name).toBe('applicaties');
    expect(sheet.headers).toEqual([
      'Applicatie',
      'Owner',
      'Kosten per jaar',
      'Lifecycle',
      'Go live',
      'Hosting',
    ]);
    expect(sheet.rows).toHaveLength(3);
    expect(sheet.rowNumbers).toEqual([2, 3, 5]);

    expect(detectElementType(sheet).type).toBe('application');
    const mapping = guessMapping(sheet, 'application');
    expect(mapping.columns).toMatchObject({
      Applicatie: { kind: 'core', field: 'name' },
      Owner: { kind: 'core', field: 'owner' },
      'Kosten per jaar': { kind: 'attribute', key: 'annual_cost' },
      Lifecycle: { kind: 'core', field: 'lifecycle' },
      'Go live': { kind: 'lifecycle_date', phase: 'active' },
      Hosting: { kind: 'attribute', key: 'hosting' },
    });
    const { candidates, warnings } = sheetToCandidates(sheet, mapping);
    expect(warnings).toEqual([]);
    expect(
      candidates.map((c) => [
        c.name,
        c.attributes.annual_cost,
        c.lifecycle,
        c.lifecycleDates?.active,
        c.attributes.hosting,
      ]),
    ).toEqual([
      ['Exact Online', 12_500, 'active', '2019-02-01', 'saas'],
      ['AFAS Profit', 1_200_000, 'retired', '2010-12-31', 'on_premise'],
      ['Topdesk', 250_000, 'build', '2027-01-01', 'public_cloud'],
    ]);
  });

  it('honours an Excel "sep=" line and skips a title row', async () => {
    const csv =
      'sep=;\nTechnology export\nName;Version;End of life\nPostgreSQL;14;12-11-2026\nJava;8;Dec 2030\n';
    const parsed = await parseFile('stack.txt', enc(csv));
    expect(parsed.format).toBe('csv');
    const sheet = parsed.sheets![0]!;
    expect(sheet.headers).toEqual(['Name', 'Version', 'End of life']);
    expect(sheet.headerRow).toBe(3);
    const detected = detectElementType(sheet);
    expect(detected.type).toBe('technology');
    const mapping = guessMapping(sheet, detected.type);
    expect(mapping.columns['End of life']).toEqual({ kind: 'attribute', key: 'eol_date' });
    const { candidates } = sheetToCandidates(sheet, mapping);
    expect(candidates.map((c) => [c.name, c.attributes.version, c.attributes.eol_date])).toEqual([
      ['PostgreSQL', '14', '2026-11-12'],
      ['Java', '8', '2030-12-01'],
    ]);
  });

  it('reads tab separated and comma separated files with quoted cells', async () => {
    const tsv = 'Name\tDescription\nCRM\t"Customer data, leads"\n';
    const t = await parseFile('apps.tsv', enc(tsv));
    expect(t.sheets![0]!.rows).toEqual([{ Name: 'CRM', Description: 'Customer data, leads' }]);

    const csv = 'Name,Depends on\n"Billing","CRM; ERP"\nERP,\n';
    const c = await parseFile('apps.csv', enc(csv));
    expect(c.sheets![0]!.rows).toEqual([
      { Name: 'Billing', 'Depends on': 'CRM; ERP' },
      { Name: 'ERP', 'Depends on': null },
    ]);
  });

  it('decodes Windows-1252 files saved by older Excel versions', async () => {
    // "Café;Coût" in Windows-1252: é = 0xE9, û = 0xFB.
    const bytes = new Uint8Array([
      0x4e, 0x61, 0x6d, 0x65, 0x3b, 0x43, 0x6f, 0xfb, 0x74, 0x0a, 0x43, 0x61, 0x66, 0xe9, 0x3b,
      0x31, 0x30, 0x0a,
    ]);
    const parsed = await parseFile('legacy.csv', bytes);
    expect(parsed.sheets![0]!.headers).toEqual(['Name', 'Coût']);
    expect(parsed.sheets![0]!.rows[0]).toEqual({ Name: 'Café', Coût: '10' });
  });
});

describe('JSON import', () => {
  it('reads an array of objects as one sheet, flattening nested objects', async () => {
    const json = JSON.stringify([
      { name: 'CRM', owner: { name: 'Jane' }, dependsOn: ['ERP', { name: 'Billing' }], cost: 1000 },
      { name: 'ERP', lifecycle: 'live' },
    ]);
    const parsed = await parseFile('apps.json', enc(json));
    expect(parsed.format).toBe('json');
    const sheet = parsed.sheets![0]!;
    expect(sheet.name).toBe('apps');
    expect(sheet.headers).toEqual(['name', 'owner.name', 'dependsOn', 'cost', 'lifecycle']);
    expect(sheet.rows[0]).toEqual({
      name: 'CRM',
      'owner.name': 'Jane',
      dependsOn: ['ERP', 'Billing'],
      cost: 1000,
      lifecycle: null,
    });
    const mapping = guessMapping(sheet, 'application');
    expect(mapping.columns['owner.name']).toEqual({ kind: 'core', field: 'owner' });
    expect(mapping.columns.dependsOn).toMatchObject({ kind: 'relation', relation: 'depends_on' });
    const { candidates } = sheetToCandidates(sheet, mapping);
    expect(candidates[0]!.relations[0]!.names).toEqual(['ERP', 'Billing']);
    expect(candidates[1]!.lifecycle).toBe('active');
  });

  it('reads { sheetName: [...] } as several sheets', async () => {
    const json = JSON.stringify({
      Applications: [{ Name: 'CRM' }],
      Capabilities: [{ Name: 'Sales' }, { Name: 'Billing' }],
      meta: { exported: '2026-01-01' },
    });
    const parsed = await parseFile('export.json', enc(json));
    expect(parsed.sheets!.map((s) => [s.name, s.rows.length])).toEqual([
      ['Applications', 1],
      ['Capabilities', 2],
    ]);
    expect(detectElementType(parsed.sheets![1]!).type).toBe('capability');
  });

  it('reports invalid JSON instead of throwing', async () => {
    const parsed = await parseFile('broken.json', enc('{ "a": '));
    expect(parsed.sheets).toEqual([]);
    expect(parsed.warnings[0]).toMatch(/not valid JSON/);
  });
});
