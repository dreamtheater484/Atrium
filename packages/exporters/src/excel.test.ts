import { CORE_FIELDS, ELEMENT_TYPE_DEFS, RELATION_TYPE_DEFS } from '@atrium/schema';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { sampleModel } from './__fixtures__/model';
import { exportExcel } from './excel';

async function open(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  return wb;
}

function headers(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    out[col - 1] = String(cell.value);
  });
  return out;
}

/** Row objects keyed by header, for readable assertions. */
function rows(ws: ExcelJS.Worksheet): Array<Record<string, ExcelJS.CellValue>> {
  const head = headers(ws);
  const out: Array<Record<string, ExcelJS.CellValue>> = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const rec: Record<string, ExcelJS.CellValue> = {};
    head.forEach((h, i) => {
      rec[h] = row.getCell(i + 1).value;
    });
    out.push(rec);
  });
  return out;
}

describe('exportExcel', () => {
  it('writes one sheet per element type, then Relations and README', async () => {
    const wb = await open(await exportExcel(sampleModel()));
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Domains',
      'Teams',
      'Capabilities',
      'Applications',
      'Interfaces',
      'Data objects',
      'Technologies',
      'Initiatives',
      'Relations',
      'README',
    ]);
  });

  it('uses headers the importer recognises, in the documented order', async () => {
    const wb = await open(await exportExcel(sampleModel()));
    const apps = headers(wb.getWorksheet('Applications')!);
    expect(apps.slice(0, 4)).toEqual(['ID', 'Key', 'Name', 'Description']);
    expect(apps).toContain('Domain');
    expect(apps).not.toContain('Parent'); // applications are not hierarchical
    const lc = apps.indexOf('Lifecycle');
    expect(apps.slice(lc, lc + 3)).toEqual(['Lifecycle', 'Active date', 'Phase out date']);
    expect(apps).not.toContain('Plan date'); // no values, no column
    for (const attr of ELEMENT_TYPE_DEFS.application.attributes) expect(apps).toContain(attr.label);
    expect(apps).toContain('Sla hours'); // attribute outside the metamodel still round-trips
    for (const h of [
      'Supports',
      'Runs on',
      'Sends data to',
      'Provides',
      'Uses interface',
      'Manages',
      'Owned by',
      'Replaces',
      'Depends on',
    ]) {
      expect(apps).toContain(h);
    }
    expect(apps.slice(-2)).toEqual(['Quality %', 'Health']);
    // Attributes come before relations, relations before the derived columns.
    expect(apps.indexOf('Annual cost')).toBeLessThan(apps.indexOf('Supports'));

    // Every header is something Atrium knows: a core field, an attribute label, a lifecycle
    // date, a relation label or a derived column.
    const relationHeaders = Object.values(RELATION_TYPE_DEFS).map(
      (r) => r.label.charAt(0).toUpperCase() + r.label.slice(1),
    );
    const core = CORE_FIELDS.map((f) => f.label);
    for (const ws of wb.worksheets.slice(0, -2)) {
      const type = Object.values(ELEMENT_TYPE_DEFS).find((d) => d.plural === ws.name)!;
      const attrs = type.attributes.map((a) => a.label);
      for (const h of headers(ws)) {
        const known =
          h === 'ID' ||
          core.includes(h as (typeof core)[number]) ||
          attrs.includes(h) ||
          / date$/.test(h) ||
          relationHeaders.includes(h) ||
          h === 'Quality %' ||
          h === 'Health' ||
          h === 'Sla hours';
        expect(known, `${ws.name}: ${h}`).toBe(true);
      }
    }
  });

  it('writes typed values: labels for enums, numbers for money, real dates, joined names', async () => {
    const model = sampleModel();
    const wb = await open(await exportExcel(model));
    const ws = wb.getWorksheet('Applications')!;
    const byName = Object.fromEntries(rows(ws).map((r) => [r.Name, r]));
    const crm = byName['CRM Suite']!;
    const crmEl = model.elements.find((e) => e.name === 'CRM Suite')!;
    expect(crm.ID).toBe(crmEl.id);
    expect(crm.Key).toBe('APP-001');
    expect(crm.Domain).toBe('Customer');
    expect(crm.Owner).toBe('Jane Doe');
    expect(crm.Lifecycle).toBe('Active');
    expect(crm['Active date']).toBeInstanceOf(Date);
    expect((crm['Active date'] as Date).toISOString().slice(0, 10)).toBe('2021-03-01');
    expect(crm.Classification).toBe('Internal');
    expect(crm.Tags).toBe('crm, core');
    expect(crm.Hosting).toBe('SaaS');
    expect(crm['Business criticality']).toBe('High');
    expect(crm.TIME).toBe('Invest');
    expect(crm['Annual cost']).toBe(120000);
    expect(crm['Business fit']).toBe(4);
    expect(crm.Link).toBe('https://crm.example.com');
    expect(crm.Supports).toBe('Customer Management, Customer Onboarding');
    expect(crm['Runs on']).toBe('PostgreSQL 16');
    expect(crm['Sends data to']).toBe('Billing Engine');
    expect(crm.Provides).toBe('Customer API');
    expect(crm['Quality %']).toBe(92);
    expect(crm.Health).toBe('Good');

    const engine = byName['Billing Engine']!;
    expect(engine.Description).toBe('Rates usage & produces <invoices> for "all" customers.');
    expect(engine['Annual cost']).toBe(85000.5);
    expect(engine.Lifecycle).toBe('Phase out');
    expect(engine['Owned by']).toBe('Billing Squad');
    expect(engine['Uses interface']).toBe('Customer API');
    expect(engine.Manages).toBe('Invoice');
    expect(engine.Replaces).toBe('Legacy Portal');
    expect(engine.Health).toBe('Act');

    // Number formats and styling.
    const head = headers(ws);
    const costCell = ws.getRow(2).getCell(head.indexOf('Annual cost') + 1);
    expect(costCell.numFmt).toContain('€');
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(ws.getRow(1).getCell(1).fill).toMatchObject({ type: 'pattern', pattern: 'solid' });
    expect(ws.getRow(2).getCell(head.indexOf('Description') + 1).alignment?.wrapText).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
    // Dropdown on the Lifecycle column.
    const lifecycle = ws.getRow(2).getCell(head.indexOf('Lifecycle') + 1);
    expect(lifecycle.dataValidation?.type).toBe('list');
    expect(String(lifecycle.dataValidation?.formulae?.[0])).toContain('Phase out');
  });

  it('keeps parents above children and resolves parent and domain names', async () => {
    const wb = await open(await exportExcel(sampleModel()));
    const caps = rows(wb.getWorksheet('Capabilities')!);
    expect(caps.map((r) => r.Name)).toEqual([
      'Billing',
      'Invoicing',
      'Customer Management',
      'Customer Onboarding',
    ]);
    expect(caps[1]).toMatchObject({ Parent: 'Billing', Domain: 'Finance' });
    expect(caps[0]).toMatchObject({ 'Strategic importance': 'Medium' });
    const initiatives = rows(wb.getWorksheet('Initiatives')!);
    expect(initiatives[0]!.Start).toBeInstanceOf(Date);
    expect(initiatives[0]!.Budget).toBe(1500000);
    expect(initiatives[0]!.Progress).toBe(40);
    expect(initiatives[0]!.Changes).toBe('Billing Engine');
  });

  it('lists every resolvable relation once on the Relations sheet', async () => {
    const model = sampleModel();
    const wb = await open(await exportExcel(model));
    const ws = wb.getWorksheet('Relations')!;
    expect(headers(ws)).toEqual(['Type', 'From type', 'From', 'To type', 'To']);
    const rels = rows(ws);
    expect(rels).toHaveLength(model.relations.length - 1); // the dangling one is skipped
    expect(rels).toContainEqual({
      Type: 'Runs on',
      'From type': 'Application',
      From: 'Billing Engine',
      'To type': 'Technology',
      To: 'Java 8',
    });
  });

  it('explains round-tripping on the README sheet', async () => {
    const wb = await open(await exportExcel(sampleModel()));
    const ws = wb.getWorksheet('README')!;
    expect(ws.getCell('B2').value).toBe('Atrium export');
    const all: string[] = [];
    ws.eachRow((row) => row.eachCell((c) => all.push(String(c.value))));
    const textBlob = all.join('\n');
    expect(textBlob).toContain('Acme Telco');
    expect(textBlob).toMatch(/ID/);
    expect(textBlob).toMatch(/import/i);
  });

  it('honours the types option', async () => {
    const wb = await open(
      await exportExcel(sampleModel(), { types: ['application', 'technology'] }),
    );
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Applications',
      'Technologies',
      'Relations',
      'README',
    ]);
    // Names of filtered-out elements are still resolved.
    expect(rows(wb.getWorksheet('Applications')!).find((r) => r.Name === 'CRM Suite')!.Domain).toBe(
      'Customer',
    );
  });

  it('copes with an empty model', async () => {
    const bytes = await exportExcel({
      elements: [],
      relations: [],
      workspaceName: 'Empty',
      generatedAt: '2026-10-08',
    });
    const wb = await open(bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Relations', 'README']);
  });
});
