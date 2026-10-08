import { describe, expect, it } from 'vitest';
import { normalizeValue } from './normalize';
import type { ColumnTarget } from './types';
import {
  isBlank,
  parseBoolean,
  parseDate,
  parseMoney,
  parseNumber,
  parsePercent,
  parseRating,
  parseUrl,
  splitList,
} from './values';

describe('parseMoney', () => {
  it.each([
    ['€ 1.2M', 1_200_000],
    ['1.200.000', 1_200_000],
    ['1,200,000', 1_200_000],
    ['250k', 250_000],
    ['$40,000', 40_000],
    ['€ 1.200', 1_200],
    ['1.200,50', 1_200.5],
    ['1,200.50', 1_200.5],
    ['EUR 15 000', 15_000],
    ["CHF 1'250'000", 1_250_000],
    ['€ 1.200,-', 1_200],
    ['(500)', -500],
    ['-€500', -500],
    ['2.5 mln', 2_500_000],
    ['1,5M', 1_500_000],
    ['€ 3 bn', 3_000_000_000],
    ['45000 per year', 45_000],
    ['€12k p.a.', 12_000],
    [42_000, 42_000],
    ['0,250', 0.25],
  ])('%s → %s', (raw, expected) => {
    expect(parseMoney(raw)).toBe(expected);
  });

  it.each(['abc', 'ten thousand', '10-20k', ''])('rejects %s', (raw) => {
    expect(parseMoney(raw)).toBeUndefined();
  });
});

describe('parseNumber', () => {
  it.each([
    ['1.5', 1.5],
    ['1,5', 1.5],
    ['1,200', 1_200],
    ['3 400', 3_400],
    ['12.5k', 12_500],
    [7, 7],
  ])('%s → %s', (raw, expected) => {
    expect(parseNumber(raw)).toBe(expected);
  });
});

describe('parsePercent', () => {
  it.each([
    ['45%', 45],
    ['45 %', 45],
    [0.45, 45],
    ['0.45', 45],
    [80, 80],
    ['12,5%', 12.5],
  ])('%s → %s', (raw, expected) => {
    expect(parsePercent(raw)).toBe(expected);
  });
});

describe('parseDate', () => {
  it.each([
    ['2026-03-15', '2026-03-15'],
    ['2026/3/5', '2026-03-05'],
    ['2026-03-15T10:00:00Z', '2026-03-15'],
    ['15-03-2026', '2026-03-15'],
    ['15.03.2026', '2026-03-15'],
    ['03/15/2026', '2026-03-15'],
    ['15/03/2026', '2026-03-15'],
    ['03/04/2026', '2026-03-04'],
    ['03-04-2026', '2026-04-03'],
    ['5-1-26', '2026-01-05'],
    ['Q3 2026', '2026-07-01'],
    ['2026 Q1', '2026-01-01'],
    ['q4-27', '2027-10-01'],
    ['H2 2026', '2026-07-01'],
    ['2027', '2027-01-01'],
    ['FY2028', '2028-01-01'],
    ['2026-07', '2026-07-01'],
    ['07/2026', '2026-07-01'],
    ['March 2026', '2026-03-01'],
    ['15 March 2026', '2026-03-15'],
    ['March 15, 2026', '2026-03-15'],
    ['1st Mar 2026', '2026-03-01'],
    ['Jan-26', '2026-01-01'],
    ['15 mei 2026', '2026-05-15'],
    ['3. Oktober 2026', '2026-10-03'],
    [46096, '2026-03-15'],
    ['46096', '2026-03-15'],
    [2027, '2027-01-01'],
  ])('%s → %s', (raw, expected) => {
    expect(parseDate(raw)).toBe(expected);
  });

  it('uses a column-level day/month order for ambiguous dates', () => {
    expect(parseDate('03/04/2026', 'dmy')).toBe('2026-04-03');
    expect(parseDate('03.04.2026', 'mdy')).toBe('2026-03-04');
  });

  it.each(['31-02-2026', 'soon', '13/13/2026', 'Q5 2026', '12345678901234567'])(
    'rejects %s',
    (raw) => {
      expect(parseDate(raw)).toBeUndefined();
    },
  );

  it('reads Date objects in UTC', () => {
    expect(parseDate(new Date(Date.UTC(2025, 11, 31)))).toBe('2025-12-31');
  });
});

describe('parseRating', () => {
  it.each([
    [4, 4],
    ['4', 4],
    ['4 - Good', 4],
    ['High (4)', 4],
    ['very low', 1],
    ['Poor', 2],
    ['average', 3],
    ['Good', 4],
    ['Excellent', 5],
    ['very high', 5],
    ['80%', 4],
    ['100%', 5],
    [0.6, 3],
    ['7/10', 4],
    ['3 out of 5', 3],
    ['★★★☆☆', 3],
    [8, 4],
    ['Optimised', 5],
    ['Quantitatively managed', 4],
  ])('%s → %s', (raw, expected) => {
    expect(parseRating(raw)).toBe(expected);
  });

  it.each(['maybe', 0, 'n/a'])('rejects %s', (raw) => {
    expect(parseRating(raw)).toBeUndefined();
  });
});

describe('parseBoolean, splitList, parseUrl, isBlank', () => {
  it('reads yes/no in several notations', () => {
    expect(['Yes', 'y', 'TRUE', 'x', 'ja', '✓', 1].map(parseBoolean)).toEqual(Array(7).fill(true));
    expect(['No', 'n', 'false', 'nee', 0].map(parseBoolean)).toEqual(Array(5).fill(false));
    expect(parseBoolean('perhaps')).toBeUndefined();
  });

  it('splits lists on commas, semicolons, pipes and new lines', () => {
    expect(splitList('SAP ECC, Salesforce; Workday | ServiceNow\nJira')).toEqual([
      'SAP ECC',
      'Salesforce',
      'Workday',
      'ServiceNow',
      'Jira',
    ]);
    expect(splitList('• CRM\n• ERP\n• crm')).toEqual(['CRM', 'ERP']);
    expect(splitList(['a', 'b, c'])).toEqual(['a', 'b', 'c']);
    expect(splitList('n/a')).toEqual([]);
  });

  it('completes links', () => {
    expect(parseUrl('confluence.acme.com/x')).toBe('https://confluence.acme.com/x');
    expect(parseUrl('https://acme.com')).toBe('https://acme.com');
    expect(parseUrl('jane@acme.com')).toBe('mailto:jane@acme.com');
    expect(parseUrl('see wiki')).toBeUndefined();
  });

  it('treats placeholders as empty', () => {
    for (const v of [null, undefined, '', '  ', '-', 'n/a', 'N.A.', 'TBD', 'unknown', '#N/A']) {
      expect(isBlank(v)).toBe(true);
    }
    expect(isBlank('None')).toBe(false);
    expect(isBlank(0)).toBe(false);
  });
});

describe('normalizeValue', () => {
  const lifecycle: ColumnTarget = { kind: 'core', field: 'lifecycle' };
  const attr = (key: string): ColumnTarget => ({ kind: 'attribute', key });

  it.each([
    ['In production', 'active'],
    ['Live', 'active'],
    ['operational', 'active'],
    ['Production (since 2019)', 'active'],
    ['Decommissioned', 'retired'],
    ['retired', 'retired'],
    ['End of Life', 'retired'],
    ['Sunset', 'phase_out'],
    ['Phasing out', 'phase_out'],
    ['Planned retirement', 'phase_out'],
    ['Planned', 'plan'],
    ['Idea', 'plan'],
    ['In development', 'build'],
    ['Pilot', 'build'],
    ['Pre-production', 'build'],
    ['Phase out', 'phase_out'],
    ['ACTIVE', 'active'],
  ])('lifecycle %s → %s', (raw, expected) => {
    expect(normalizeValue(lifecycle, raw, 'application')).toEqual({ value: expected });
  });

  it('warns about fuzzy and unknown lifecycle values', () => {
    const fuzzy = normalizeValue(lifecycle, 'Decomissioned', 'application');
    expect(fuzzy.value).toBe('retired');
    expect(fuzzy.warning).toMatch(/Read "Decomissioned" as lifecycle phase "Retired"/);
    const unknown = normalizeValue(lifecycle, 'Purple', 'application');
    expect(unknown.value).toBeUndefined();
    expect(unknown.warning).toMatch(/not a known lifecycle phase/);
  });

  it.each([
    ['Tier 1', 'mission_critical'],
    ['Critical', 'mission_critical'],
    ['Business critical', 'mission_critical'],
    ['Tier 2', 'high'],
    ['High', 'high'],
    ['Medium', 'medium'],
    ['Not critical', 'low'],
    ['1', 'mission_critical'],
    [3, 'medium'],
  ])('criticality %s → %s', (raw, expected) => {
    expect(normalizeValue(attr('criticality'), raw, 'application').value).toBe(expected);
  });

  it.each([
    ['Cloud', 'public_cloud'],
    ['AWS', 'public_cloud'],
    ['Azure', 'public_cloud'],
    ['On-prem', 'on_premise'],
    ['On premises', 'on_premise'],
    ['SaaS', 'saas'],
    ['Cloud (SaaS)', 'saas'],
    ['Private cloud', 'private_cloud'],
    ['VMware', 'private_cloud'],
  ])('hosting %s → %s', (raw, expected) => {
    expect(normalizeValue(attr('hosting'), raw, 'application').value).toBe(expected);
  });

  it.each([
    ['T', 'tolerate'],
    ['Invest', 'invest'],
    ['Migrate', 'migrate'],
    ['eliminate', 'eliminate'],
  ])('TIME %s → %s', (raw, expected) => {
    expect(normalizeValue(attr('time'), raw, 'application').value).toBe(expected);
  });

  it.each([
    ['Confidential', 'confidential'],
    ['C2', 'confidential'],
    ['Internal use only', 'internal'],
    ['Strictly confidential', 'restricted'],
    ['TLP:RED', 'restricted'],
    ['Public', 'public'],
  ])('classification %s → %s', (raw, expected) => {
    expect(
      normalizeValue({ kind: 'core', field: 'classification' }, raw, 'application').value,
    ).toBe(expected);
  });

  it('normalises other enums by synonyms', () => {
    expect(normalizeValue(attr('protocol'), 'Kafka', 'interface').value).toBe('event');
    expect(normalizeValue(attr('protocol'), 'SFTP', 'interface').value).toBe('file');
    expect(normalizeValue(attr('frequency'), 'Nightly', 'interface').value).toBe('daily');
    expect(normalizeValue(attr('radar'), 'Deprecated', 'technology').value).toBe('hold');
    expect(normalizeValue(attr('sensitivity'), 'PII', 'data_object').value).toBe('personal');
    expect(normalizeValue(attr('status'), 'In progress', 'initiative').value).toBe('running');
    expect(normalizeValue(attr('importance'), 'Core', 'capability').value).toBe('high');
  });

  it('normalises numbers, money, ratings, dates and lists', () => {
    expect(normalizeValue(attr('annual_cost'), '€ 1.2M', 'application')).toEqual({
      value: 1_200_000,
    });
    expect(normalizeValue(attr('users'), '1,250', 'application')).toEqual({ value: 1_250 });
    expect(normalizeValue(attr('business_fit'), 'Good', 'application')).toEqual({ value: 4 });
    expect(normalizeValue(attr('eol_date'), 'Q3 2026', 'technology')).toEqual({
      value: '2026-07-01',
    });
    expect(normalizeValue(attr('progress'), '45%', 'initiative')).toEqual({ value: 45 });
    expect(normalizeValue(attr('match'), 'Java 8; Python 2', 'standard')).toEqual({
      value: ['Java 8', 'Python 2'],
    });
    expect(normalizeValue({ kind: 'core', field: 'tags' }, 'erp, finance', 'application')).toEqual({
      value: ['erp', 'finance'],
    });
    expect(
      normalizeValue({ kind: 'lifecycle_date', phase: 'active' }, '01-02-2020', 'application'),
    ).toEqual({ value: '2020-02-01' });
  });

  it('explains values it cannot read', () => {
    expect(normalizeValue(attr('annual_cost'), 'expensive', 'application').warning).toMatch(
      /as an amount/,
    );
    expect(normalizeValue(attr('eol_date'), 'soon', 'technology').warning).toMatch(/as a date/);
  });

  it('returns undefined without warning for blanks and ignored columns', () => {
    expect(normalizeValue(attr('annual_cost'), 'n/a', 'application')).toEqual({ value: undefined });
    expect(normalizeValue({ kind: 'ignore' }, 'x', 'application')).toEqual({ value: undefined });
  });

  it('turns relation cells into name lists and keeps names on one line', () => {
    const rel: ColumnTarget = {
      kind: 'relation',
      relation: 'depends_on',
      direction: 'out',
      targetType: 'application',
    };
    expect(normalizeValue(rel, 'CRM; ERP', 'application')).toEqual({ value: ['CRM', 'ERP'] });
    expect(normalizeValue({ kind: 'core', field: 'name' }, '  SAP\n ECC ', 'application')).toEqual({
      value: 'SAP ECC',
    });
    expect(normalizeValue({ kind: 'core', field: 'external_id' }, 1001, 'application')).toEqual({
      value: '1001',
    });
  });
});
