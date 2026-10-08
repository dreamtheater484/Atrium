import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { detectFormat } from './detect-format';
import { parseFile } from './parse-file';

const enc = (s: string) => new TextEncoder().encode(s);

const ARCHIMATE_HEAD = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" identifier="m1"><name>x</name></model>`;

describe('detectFormat', () => {
  it('recognises xlsx by its zip signature, whatever the name', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('A').getCell('A1').value = 'x';
    const bytes = new Uint8Array((await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer);
    expect(detectFormat('apps.xlsx', bytes)).toBe('xlsx');
    expect(detectFormat('download', bytes)).toBe('xlsx');
  });

  it.each([
    ['apps.csv', 'Name,Owner\nCRM,Jane\n', 'csv'],
    ['apps.txt', 'Name;Owner\nCRM;Jane\n', 'csv'],
    ['no-extension', 'Name\tOwner\nCRM\tJane\nERP\tJohn\n', 'csv'],
    ['apps.json', '[{"name":"CRM"}]', 'json'],
    ['export', '{"Applications":[{"name":"CRM"}]}', 'json'],
    ['model.xml', ARCHIMATE_HEAD, 'archimate'],
    ['model', ARCHIMATE_HEAD, 'archimate'],
    [
      'catalog-info.yaml',
      'apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: x\n',
      'backstage',
    ],
    ['all.yaml', '---\n# comment\napiVersion: "backstage.io/v1alpha1"\nkind: Group\n', 'backstage'],
    [
      'atrium.yaml',
      'apiVersion: atrium/v1\nkind: Service\nmetadata:\n  key: x\n  name: X\n',
      'atrium-yaml',
    ],
    ['entity.json', '{"apiVersion":"backstage.io/v1alpha1","kind":"Component"}', 'backstage'],
    ['other.yaml', 'foo: bar\n', 'unknown'],
    ['page.xml', '<html><body/></html>', 'unknown'],
    ['empty.csv', '', 'unknown'],
    ['notes.md', '# Notes\nJust some text here\n', 'unknown'],
  ])('%s → %s', (name, content, expected) => {
    expect(detectFormat(name, enc(content))).toBe(expected);
  });

  it('handles UTF-16 text exported by Excel ("Unicode text")', () => {
    const text = '\uFEFFName\tOwner\r\nCRM\tJane\r\n';
    const bytes = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      bytes[i * 2] = text.charCodeAt(i) & 0xff;
      bytes[i * 2 + 1] = text.charCodeAt(i) >> 8;
    }
    expect(detectFormat('export.txt', bytes)).toBe('csv');
  });

  it('flags legacy .xls files with a helpful message', async () => {
    const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(detectFormat('old.xls', bytes)).toBe('unknown');
    const parsed = await parseFile('old.xls', bytes);
    expect(parsed.warnings[0]).toMatch(/Save it as .xlsx/);
  });

  it('explains unsupported files', async () => {
    const parsed = await parseFile('notes.md', enc('# Notes\n'));
    expect(parsed.format).toBe('unknown');
    expect(parsed.warnings[0]).toMatch(/could not recognise/);
  });
});
