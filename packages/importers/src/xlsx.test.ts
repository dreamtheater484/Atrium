import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { sheetToCandidates } from './candidates';
import { detectElementType } from './detect-type';
import { guessMapping } from './mapping';
import { parseFile } from './parse-file';
import type { ParsedSheet } from './types';

function setRow(ws: ExcelJS.Worksheet, row: number, values: ExcelJS.CellValue[]): void {
  values.forEach((v, i) => {
    if (v !== undefined && v !== null) ws.getCell(row, i + 1).value = v;
  });
}

async function toBytes(wb: ExcelJS.Workbook): Promise<Uint8Array> {
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as unknown as ArrayBuffer);
}

/** A typical messy portfolio export: title rows, merged cells, links, formulas, mixed formats. */
async function messyPortfolio(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Application Portfolio');
  ws.getCell('A1').value = 'ACME Application Portfolio — Q3 2026';
  ws.mergeCells('A1:N1');
  ws.getCell('A2').value = 'Exported from the CMDB on 30 September 2026';
  setRow(ws, 4, [
    'Application Name',
    null,
    'Business Owner',
    'Annual Cost (€)',
    'Status',
    'Capability',
    'Depends on',
    'Hosting',
    'Go-live date',
    'Criticality',
    'Vendor',
    'Notes',
    'Domain',
    'Technical fit',
  ]);
  ws.mergeCells('A4:B4'); // the name header spans an empty helper column

  setRow(ws, 5, [
    { richText: [{ text: 'SAP ', font: { bold: true } }, { text: 'ECC' }] },
    null,
    'Jane Doe',
    '€ 1.2M',
    'In production',
    'Finance; Procurement',
    'Oracle DB, Salesforce',
    'On-prem',
    new Date(Date.UTC(2012, 4, 1)),
    'Tier 1',
    { text: 'SAP', hyperlink: 'https://www.sap.com' },
    'Core ERP',
    'Corporate',
    0.8,
  ]);
  setRow(ws, 6, [
    'Salesforce',
    null,
    'John Smith',
    250000,
    'Live',
    'Customer Management',
    null,
    'SaaS',
    '15-03-2016',
    'High',
    'Salesforce',
    null,
    null,
    0.6,
  ]);
  setRow(ws, 7, [
    { formula: 'CONCAT("Legacy"," CRM")', result: 'Legacy CRM' },
    null,
    'Jane Doe',
    '$40,000',
    'Decommissioned',
    'Customer Management',
    'Salesforce',
    'AWS',
    'Q1 2009',
    'Low',
    'Siebel',
    '-',
    'Sales',
    0.2,
  ]);
  ws.getCell('D6').numFmt = '€#,##0';
  for (const r of [5, 6, 7]) ws.getCell(`N${r}`).numFmt = '0%';
  ws.mergeCells('M5:M6'); // one "Corporate" cell for two applications
  // row 8 empty, row 9 has no name, row 10 is a totals row
  setRow(ws, 9, [null, null, 'Nobody']);
  setRow(ws, 10, ['Total', null, null, { formula: 'SUM(D5:D7)', result: 1490000 }]);

  const lists = wb.addWorksheet('Lists', { state: 'hidden' });
  setRow(lists, 1, ['Status', 'Hosting']);
  setRow(lists, 2, ['Live', 'SaaS']);

  const caps = wb.addWorksheet('Capability Map');
  setRow(caps, 1, ['Level 1', 'Level 2', 'Level 3', 'Description', 'Owner']);
  setRow(caps, 2, [
    'Customer Management',
    'Customer Onboarding',
    'KYC Check',
    'Verify identity',
    'Ann',
  ]);
  setRow(caps, 3, ['Customer Management', 'Customer Onboarding', 'Contract Setup']);
  setRow(caps, 4, ['Customer Management', 'Customer Service', null, 'Handle requests']);
  setRow(caps, 5, ['Finance', null, null, 'Money matters', 'Bob']);
  setRow(caps, 6, ['Finance', 'Accounting', 'General Ledger']);
  return toBytes(wb);
}

describe('Excel import', () => {
  it('reads a messy workbook: title rows, merged header, rich text, links, formulas, dates', async () => {
    const parsed = await parseFile('portfolio export.xlsx', await messyPortfolio());
    expect(parsed.format).toBe('xlsx');
    expect(parsed.warnings).toContain('Skipped the hidden sheet "Lists"');
    expect(parsed.sheets?.map((s) => s.name)).toEqual(['Application Portfolio', 'Capability Map']);

    const sheet = parsed.sheets![0]!;
    expect(sheet.headerRow).toBe(4);
    expect(sheet.headers).toEqual([
      'Application Name',
      'Business Owner',
      'Annual Cost (€)',
      'Status',
      'Capability',
      'Depends on',
      'Hosting',
      'Go-live date',
      'Criticality',
      'Vendor',
      'Notes',
      'Domain',
      'Technical fit',
    ]);
    expect(sheet.rows[0]).toMatchObject({
      'Application Name': 'SAP ECC',
      'Go-live date': '2012-05-01',
      Vendor: 'SAP',
      Domain: 'Corporate',
      'Technical fit': '80%',
    });
    expect(sheet.rows[1]).toMatchObject({ Domain: 'Corporate', 'Annual Cost (€)': 250000 });
    expect(sheet.rows[2]!['Application Name']).toBe('Legacy CRM');
    expect(sheet.rowNumbers).toEqual([5, 6, 7, 9, 10]);
  });

  it('detects applications and maps every column without help', async () => {
    const parsed = await parseFile('portfolio.xlsx', await messyPortfolio());
    const sheet = parsed.sheets![0]!;
    const detected = detectElementType(sheet);
    expect(detected.type).toBe('application');
    expect(detected.confidence).toBeGreaterThan(0.8);
    expect(detected.reason).toMatch(/Application Portfolio/);

    const mapping = guessMapping(sheet, detected.type);
    expect(mapping.columns).toEqual({
      'Application Name': { kind: 'core', field: 'name' },
      'Business Owner': { kind: 'core', field: 'owner' },
      'Annual Cost (€)': { kind: 'attribute', key: 'annual_cost' },
      Status: { kind: 'core', field: 'lifecycle' },
      Capability: {
        kind: 'relation',
        relation: 'supports',
        direction: 'out',
        targetType: 'capability',
      },
      'Depends on': {
        kind: 'relation',
        relation: 'depends_on',
        direction: 'out',
        targetType: 'application',
      },
      Hosting: { kind: 'attribute', key: 'hosting' },
      'Go-live date': { kind: 'lifecycle_date', phase: 'active' },
      Criticality: { kind: 'attribute', key: 'criticality' },
      Vendor: { kind: 'attribute', key: 'vendor' },
      Notes: { kind: 'core', field: 'description' },
      Domain: { kind: 'core', field: 'domain' },
      'Technical fit': { kind: 'attribute', key: 'technical_fit' },
    });
    expect(mapping.confidence).toBeGreaterThan(0.85);

    const { candidates, warnings } = sheetToCandidates(sheet, mapping, { today: '2026-10-01' });
    expect(candidates).toHaveLength(3);
    expect(candidates[0]).toEqual({
      row: 5,
      type: 'application',
      name: 'SAP ECC',
      owner: 'Jane Doe',
      description: 'Core ERP',
      domainName: 'Corporate',
      lifecycle: 'active',
      lifecycleDates: { active: '2012-05-01' },
      attributes: {
        annual_cost: 1_200_000,
        hosting: 'on_premise',
        criticality: 'mission_critical',
        vendor: 'SAP',
        technical_fit: 4,
      },
      relations: [
        {
          relation: 'supports',
          direction: 'out',
          targetType: 'capability',
          names: ['Finance', 'Procurement'],
        },
        {
          relation: 'depends_on',
          direction: 'out',
          targetType: 'application',
          names: ['Oracle DB', 'Salesforce'],
        },
      ],
    });
    expect(candidates[1]).toMatchObject({
      name: 'Salesforce',
      lifecycle: 'active',
      lifecycleDates: { active: '2016-03-15' },
      domainName: 'Corporate',
      attributes: { annual_cost: 250_000, hosting: 'saas', criticality: 'high', technical_fit: 3 },
    });
    expect(candidates[2]).toMatchObject({
      name: 'Legacy CRM',
      lifecycle: 'retired',
      lifecycleDates: { active: '2009-01-01' },
      domainName: 'Sales',
      attributes: {
        annual_cost: 40_000,
        hosting: 'public_cloud',
        criticality: 'low',
        technical_fit: 1,
      },
      relations: [
        {
          relation: 'supports',
          direction: 'out',
          targetType: 'capability',
          names: ['Customer Management'],
        },
        {
          relation: 'depends_on',
          direction: 'out',
          targetType: 'application',
          names: ['Salesforce'],
        },
      ],
    });
    expect(candidates[2]!.description).toBeUndefined();
    expect(warnings).toEqual([
      'Row 9 skipped: it has no name',
      'Row 10 skipped: it looks like a totals row',
    ]);
  });

  it('turns a Level 1/2/3 capability map into a hierarchy', async () => {
    const parsed = await parseFile('portfolio.xlsx', await messyPortfolio());
    const sheet = parsed.sheets![1]!;
    const detected = detectElementType(sheet);
    expect(detected.type).toBe('capability');

    const mapping = guessMapping(sheet, 'capability');
    expect(mapping.columns).toEqual({
      'Level 1': { kind: 'level', level: 1 },
      'Level 2': { kind: 'level', level: 2 },
      'Level 3': { kind: 'level', level: 3 },
      Description: { kind: 'core', field: 'description' },
      Owner: { kind: 'core', field: 'owner' },
    });

    const { candidates, warnings } = sheetToCandidates(sheet, mapping);
    expect(warnings).toEqual([]);
    const summary = candidates.map((c) => [c.name, c.parentName ?? null]);
    expect(summary).toEqual([
      ['Customer Management', null],
      ['Customer Onboarding', 'Customer Management'],
      ['KYC Check', 'Customer Onboarding'],
      ['Contract Setup', 'Customer Onboarding'],
      ['Customer Service', 'Customer Management'],
      ['Finance', null],
      ['Accounting', 'Finance'],
      ['General Ledger', 'Accounting'],
    ]);
    const byName = Object.fromEntries(candidates.map((c) => [c.name, c]));
    expect(byName['KYC Check']).toMatchObject({
      description: 'Verify identity',
      owner: 'Ann',
      row: 2,
    });
    expect(byName['Customer Service']!.description).toBe('Handle requests');
    expect(byName.Finance).toMatchObject({ description: 'Money matters', owner: 'Bob', row: 5 });
    expect(byName['Customer Management']!.description).toBeUndefined();
    expect(candidates.every((c) => c.type === 'capability')).toBe(true);
  });

  it('understands a two-row header with merged group cells', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    setRow(ws, 1, ['Application', 'Ownership', null, 'Costs', null]);
    setRow(ws, 2, [null, 'Business Owner', 'IT Owner', 'Licence', 'Run cost']);
    ws.mergeCells('A1:A2');
    ws.mergeCells('B1:C1');
    ws.mergeCells('D1:E1');
    setRow(ws, 3, ['Workday', 'Kim', 'HR IT', 120000, '80k']);
    setRow(ws, 4, ['Jira', 'Lee', 'Dev Tools', 15000, '5k']);
    const parsed = await parseFile('apps.xlsx', await toBytes(wb));
    const sheet = parsed.sheets![0]!;
    expect(sheet.headers).toEqual([
      'Application',
      'Business Owner',
      'IT Owner',
      'Licence',
      'Run cost',
    ]);
    expect(sheet.headerRow).toBe(2);
    expect(sheet.rows).toHaveLength(2);

    expect(detectElementType(sheet).type).toBe('application');
    const mapping = guessMapping(sheet, 'application');
    expect(mapping.columns.Application).toEqual({ kind: 'core', field: 'name' });
    expect(mapping.columns['Business Owner']).toEqual({ kind: 'core', field: 'owner' });
    expect(mapping.columns['IT Owner']).toEqual({ kind: 'core', field: 'team' });
    expect(mapping.columns['Run cost']).toEqual({ kind: 'attribute', key: 'annual_cost' });

    const { candidates } = sheetToCandidates(sheet, mapping);
    expect(candidates.map((c) => [c.name, c.teamName, c.attributes.annual_cost])).toEqual([
      ['Workday', 'HR IT', 80_000],
      ['Jira', 'Dev Tools', 5_000],
    ]);
  });

  it('finds the name column and lifecycle from values when headers are unfamiliar', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Export');
    setRow(ws, 1, ['Systeem', 'Fase', 'Website']);
    setRow(ws, 2, ['Exact Online', 'Live', 'https://exact.com']);
    setRow(ws, 3, ['AFAS', 'Retired', 'https://afas.nl']);
    setRow(ws, 4, ['Topdesk', 'Pilot', 'www.topdesk.com']);
    const parsed = await parseFile('export.xlsx', await toBytes(wb));
    const sheet = parsed.sheets![0]!;
    const detected = detectElementType(sheet);
    expect(detected.type).toBe('application');
    const mapping = guessMapping(sheet, detected.type);
    expect(mapping.columns).toEqual({
      Systeem: { kind: 'core', field: 'name' },
      Fase: { kind: 'core', field: 'lifecycle' },
      Website: { kind: 'attribute', key: 'url' },
    });
    const { candidates } = sheetToCandidates(sheet, mapping);
    expect(candidates.map((c) => [c.name, c.lifecycle, c.attributes.url])).toEqual([
      ['Exact Online', 'active', 'https://exact.com'],
      ['AFAS', 'retired', 'https://afas.nl'],
      ['Topdesk', 'build', 'https://www.topdesk.com'],
    ]);
  });
});

describe('sheetToCandidates', () => {
  const sheet = (rows: Array<Record<string, unknown>>, name = 'Apps'): ParsedSheet => ({
    name,
    headers: Object.keys(rows[0]!),
    rows,
  });

  it('merges rows that repeat a name and drops self references', () => {
    const s = sheet([
      { Name: 'CRM', 'Depends on': 'ERP, CRM', Tags: 'sales' },
      { Name: 'crm', 'Depends on': 'Billing', Tags: 'core' },
    ]);
    const { candidates, warnings } = sheetToCandidates(s, guessMapping(s, 'application'));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.relations[0]!.names).toEqual(['ERP', 'Billing']);
    expect(candidates[0]!.tags).toEqual(['sales', 'core']);
    expect(warnings).toEqual(['Row 3: "crm" also appears on row 2; the rows were merged']);
  });

  it('works out the lifecycle from phase dates when there is no status column', () => {
    const s = sheet([
      { Name: 'Old', 'Go-live': '2010-01-01', 'Retirement date': '2020-06-30' },
      { Name: 'Current', 'Go-live': '2015', 'Retirement date': 'Q4 2030' },
      { Name: 'Future', 'Go-live': '2031-01-01', 'Retirement date': null },
    ]);
    const mapping = guessMapping(s, 'application');
    expect(mapping.columns['Retirement date']).toEqual({
      kind: 'lifecycle_date',
      phase: 'retired',
    });
    const { candidates } = sheetToCandidates(s, mapping, { today: '2026-10-08' });
    expect(candidates.map((c) => c.lifecycle)).toEqual(['retired', 'active', 'plan']);
    expect(candidates[1]!.lifecycleDates).toEqual({ active: '2015-01-01', retired: '2030-10-01' });
  });

  it('names interfaces after their source and target when there is no name column', () => {
    const s = sheet(
      [
        {
          'Source system': 'CRM',
          'Target system': 'ERP',
          Protocol: 'REST',
          Frequency: 'Real-time',
        },
        {
          'Source system': 'ERP',
          'Target system': 'Data Warehouse',
          Protocol: 'SFTP',
          Frequency: 'Nightly',
        },
      ],
      'Interfaces',
    );
    expect(detectElementType(s).type).toBe('interface');
    const mapping = guessMapping(s, 'interface');
    expect(mapping.columns['Source system']).toEqual({
      kind: 'relation',
      relation: 'exposes',
      direction: 'in',
      targetType: 'application',
    });
    const { candidates } = sheetToCandidates(s, mapping);
    expect(candidates.map((c) => [c.name, c.attributes.protocol, c.attributes.frequency])).toEqual([
      ['CRM → ERP', 'rest', 'realtime'],
      ['ERP → Data Warehouse', 'file', 'daily'],
    ]);
  });

  it('reads "L1/L2 Capability" columns, using leaf-level detail columns and ignoring others', () => {
    const s = sheet(
      [
        {
          'L1 Capability': 'Sales',
          'L1 Description': 'Selling',
          'L2 Capability': 'Pricing',
          'L2 Description': 'Set prices',
          Applications: 'PriceFX',
        },
        {
          'L1 Capability': 'Sales',
          'L1 Description': 'Selling',
          'L2 Capability': 'Quoting',
          'L2 Description': 'Make quotes',
          Applications: 'CPQ, CRM',
        },
      ],
      'BCM',
    );
    const mapping = guessMapping(s, detectElementType(s).type);
    expect(mapping.elementType).toBe('capability');
    expect(mapping.columns).toEqual({
      'L1 Capability': { kind: 'level', level: 1 },
      'L1 Description': { kind: 'ignore' },
      'L2 Capability': { kind: 'level', level: 2 },
      'L2 Description': { kind: 'core', field: 'description' },
      Applications: {
        kind: 'relation',
        relation: 'supports',
        direction: 'in',
        targetType: 'application',
      },
    });
    const { candidates } = sheetToCandidates(s, mapping);
    expect(candidates.map((c) => [c.name, c.parentName, c.description])).toEqual([
      ['Sales', undefined, undefined],
      ['Pricing', 'Sales', 'Set prices'],
      ['Quoting', 'Sales', 'Make quotes'],
    ]);
    expect(candidates[2]!.relations).toEqual([
      { relation: 'supports', direction: 'in', targetType: 'application', names: ['CPQ', 'CRM'] },
    ]);
  });

  it('lets the values decide between look-alike targets ("Status" as radar ring or lifecycle)', () => {
    const radar = sheet(
      [
        { Name: 'PostgreSQL', Version: '16', Status: 'Adopt' },
        { Name: 'CouchDB', Version: '3', Status: 'Hold' },
      ],
      'Tech Radar',
    );
    expect(guessMapping(radar, 'technology').columns.Status).toEqual({
      kind: 'attribute',
      key: 'radar',
    });

    const lifecycle = sheet(
      [
        { Name: 'PostgreSQL', Version: '16', Status: 'In production' },
        { Name: 'CouchDB', Version: '3', Status: 'Decommissioned' },
      ],
      'Technologies',
    );
    expect(guessMapping(lifecycle, 'technology').columns.Status).toEqual({
      kind: 'core',
      field: 'lifecycle',
    });
  });
});

describe('percent formats', () => {
  it('scales real percent formats but keeps a quoted % label as is', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Initiatives');
    setRow(ws, 1, ['Name', 'Progress', 'Share']);
    setRow(ws, 2, ['Data platform 2.0', 55, 0.25]);
    ws.getCell('B2').numFmt = '0"%"';
    ws.getCell('C2').numFmt = '0%';
    const parsed = await parseFile('initiatives.xlsx', await toBytes(wb));
    const row = parsed.sheets![0]!.rows[0]!;
    expect(row.Progress).toBe('55%');
    expect(row.Share).toBe('25%');
  });
});
