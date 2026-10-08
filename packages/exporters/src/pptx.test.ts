import { describe, expect, it } from 'vitest';
import { exportPptx } from './pptx';
import type { DeckSpec, SlideSpec } from './types';

/**
 * pptxgenjs stores zip entries uncompressed by default, so slide names and XML are
 * readable straight from the bytes.
 */
function inspect(bytes: Uint8Array) {
  const raw = Buffer.from(bytes).toString('utf8');
  const slides = new Set([...raw.matchAll(/ppt\/slides\/slide(\d+)\.xml/g)].map((m) => Number(m[1])));
  const charts = new Set([...raw.matchAll(/ppt\/charts\/chart(\d+)\.xml/g)].map((m) => Number(m[1])));
  return { raw, has: (s: string) => raw.includes(s), slides: slides.size, charts: charts.size };
}

const deck = (slides: SlideSpec[]): DeckSpec => ({
  title: 'Architecture review Q4',
  subtitle: 'Where the application landscape stands and what we change next',
  workspaceName: 'Acme Telco',
  date: '2026-10-08',
  slides,
});

const isZip = (bytes: Uint8Array) => bytes.length > 1000 && bytes[0] === 0x50 && bytes[1] === 0x4b;

const capabilityMap = (cols: number, boxes: number): SlideSpec => ({
  kind: 'capabilityMap',
  title: 'Capability map',
  subtitle: 'Coloured by application health',
  legend: [
    { label: 'Good', color: '#2f9e7a' },
    { label: 'Watch', color: 'rgb(224, 165, 38)' },
    { label: 'Act', color: '#d9534f' },
    { label: 'Not rated', color: '#c7cbd4' },
  ],
  columns: Array.from({ length: cols }, (_, c) => ({
    name: `Level 1 capability ${c + 1}`,
    children: Array.from({ length: boxes }, (_, b) => ({
      name: `Sub-capability ${c + 1}.${b + 1} with a longer name`,
      color: ['#2f9e7a', '#e0a526', '#d9534f', '#c7cbd4'][(c + b) % 4]!,
      note: `${b % 4} apps · €${(b + 1) * 10}K`,
    })),
  })),
});

describe('exportPptx', () => {
  it('renders every slide kind into a valid pptx', async () => {
    const bytes = await exportPptx(
      deck([
        {
          kind: 'kpis',
          title: 'Portfolio at a glance',
          kpis: [
            { label: 'Applications', value: '214', hint: '12 added this quarter' },
            { label: 'Annual run cost', value: '€18.4M', tone: 'neutral' },
            { label: 'Healthy', value: '61%', tone: 'good', hint: 'Good health' },
            { label: 'To watch', value: '27', tone: 'watch' },
            { label: 'Act now', value: '9', tone: 'act', hint: 'Past end of life' },
            { label: 'Data quality', value: '78%' },
          ],
        },
        capabilityMap(5, 4),
        {
          kind: 'bar',
          title: 'Run cost by domain',
          subtitle: 'Annual cost, euro',
          labels: ['Customer', 'Finance', 'Network', 'Operations'],
          series: [{ name: 'Cost', values: [4_200_000, 2_100_000, 7_800_000, 950_000], color: '#4f46e5' }],
          valueFormat: 'money',
        },
        {
          kind: 'bar',
          title: 'Health by domain',
          labels: ['Customer', 'Finance', 'Network', 'Operations', 'Shared services platform', 'HR', 'Legal', 'Marketing', 'Sales'],
          series: [
            { name: 'Good', values: [10, 8, 12, 4, 3, 2, 1, 5, 6], color: '#2f9e7a' },
            { name: 'Watch', values: [3, 2, 5, 1, 0, 1, 0, 2, 1], color: '#e0a526' },
            { name: 'Act', values: [1, 0, 2, 1, 0, 0, 0, 1, 0], color: '#d9534f' },
          ],
        },
        {
          kind: 'doughnut',
          title: 'Applications by health',
          labels: ['Good', 'Watch', 'Act', 'Unknown'],
          series: [{ name: 'Applications', values: [131, 58, 9, 16] }],
        },
        {
          kind: 'doughnut',
          title: 'Hosting mix',
          labels: ['SaaS', 'Public cloud', 'Private cloud', 'On-premise'],
          series: [{ name: 'Share', values: [0.42, 0.18, 0.1, 0.3] }],
          valueFormat: 'percent',
        },
        {
          kind: 'table',
          title: 'Applications to act on',
          columns: ['Application', 'Owner', 'Annual cost', 'Health'],
          rows: [
            ['Billing Engine', 'John Roe', '€85K', { text: 'Act', tone: 'act' }],
            ['CRM Suite', 'Jane Doe', '€120K', { text: 'Good', tone: 'good' }],
            ['Data Lake', 'Sam Poe', '€300K', { text: 'Watch', tone: 'watch' }],
          ],
        },
        {
          kind: 'roadmap',
          title: 'Modernisation roadmap',
          start: '2026-01-01',
          end: '2027-12-31',
          lanes: [
            {
              name: 'Billing',
              bars: [
                { label: 'Replace Billing Engine', start: '2026-02-01', end: '2026-11-30', color: '#4f46e5' },
                { label: 'Decommission', start: '2026-10-01', end: '2027-01-31', color: '#d9534f' },
                { label: 'Tiny', start: '2027-03-01', end: '2027-03-10', color: '#e0a526' },
              ],
            },
            {
              name: 'Customer',
              bars: [{ label: 'CRM consolidation', start: '2025-06-01', end: '2028-06-30', color: 'rgb(47,158,122)' }],
            },
            { name: 'Empty lane', bars: [] },
          ],
        },
        {
          kind: 'text',
          title: 'Recommendations',
          bullets: [
            'Retire the three applications past end of life before Q2.',
            'Consolidate the two CRM systems.',
            'Fill in owners for the 14 applications without one.',
          ],
        },
      ]),
    );
    expect(isZip(bytes)).toBe(true);
    const { has, slides, charts } = inspect(bytes);
    expect(slides).toBe(10); // title + 9
    expect(charts).toBe(4);
    // Native content, never pictures.
    expect(has('<p:pic>')).toBe(false);
    expect(has('Portfolio at a glance')).toBe(true);
    expect(has('Acme Telco · Atrium · 8 Oct 2026')).toBe(true);
    expect(has('Replace Billing Engine')).toBe(true);
    expect(has('Today')).toBe(true);
    expect(has('<a:tbl>')).toBe(true);
    expect(has('type="slidenum"')).toBe(true);
  });

  it('fits a capability map with 8 columns of 12 boxes on one slide', async () => {
    const bytes = await exportPptx(deck([capabilityMap(8, 12)]));
    expect(isZip(bytes)).toBe(true);
    const { has, slides } = inspect(bytes);
    expect(slides).toBe(2);
    expect(has('Sub-capability 8.12 with a longer name')).toBe(true);
  });

  it('copes with very large and very small capability maps', async () => {
    const bytes = await exportPptx(deck([capabilityMap(10, 15), capabilityMap(3, 40), capabilityMap(14, 2), capabilityMap(1, 0)]));
    expect(isZip(bytes)).toBe(true);
    // 14 columns split over two slides.
    expect(inspect(bytes).slides).toBe(1 + 1 + 1 + 2 + 1);
  });

  it('paginates long tables to 12 rows per slide', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => [
      `Application ${i + 1}`,
      `Owner ${i + 1}`,
      `€${(i + 1) * 5}K`,
      { text: ['Good', 'Watch', 'Act'][i % 3]!, tone: (['good', 'watch', 'act'] as const)[i % 3] },
    ]);
    const bytes = await exportPptx(
      deck([{ kind: 'table', title: 'All applications', columns: ['Name', 'Owner', 'Cost', 'Health'], rows }]),
    );
    expect(isZip(bytes)).toBe(true);
    const { has, slides } = inspect(bytes);
    expect(slides).toBe(1 + 3);
    expect(has('Application 30')).toBe(true);
    expect(has('3 / 3')).toBe(true);
  });

  it('handles empty inputs without throwing', async () => {
    const bytes = await exportPptx(
      deck([
        { kind: 'kpis', title: 'Nothing yet', kpis: [] },
        { kind: 'capabilityMap', title: 'Empty map', legend: [], columns: [] },
        { kind: 'bar', title: 'No data', labels: [], series: [] },
        { kind: 'doughnut', title: 'No data', labels: ['A'], series: [{ name: 'S', values: [0] }] },
        { kind: 'table', title: 'Empty table', columns: ['A', 'B'], rows: [] },
        { kind: 'roadmap', title: 'Empty roadmap', start: 'not a date', end: '', lanes: [] },
        { kind: 'text', title: 'No bullets', bullets: [] },
      ]),
    );
    expect(isZip(bytes)).toBe(true);
    expect(inspect(bytes).slides).toBe(8);
  });

  it('paginates roadmaps with many lanes and uses more than ten doughnut slices sensibly', async () => {
    const lanes = Array.from({ length: 24 }, (_, i) => ({
      name: `Lane ${i + 1}`,
      bars: [
        { label: `Work ${i + 1}a`, start: '2026-01-15', end: '2026-08-01', color: '#4f46e5' },
        { label: `Work ${i + 1}b`, start: '2026-05-01', end: '2027-02-01', color: '#2f9e7a' },
      ],
    }));
    const labels = Array.from({ length: 14 }, (_, i) => `Vendor ${i + 1}`);
    const bytes = await exportPptx(
      deck([
        { kind: 'roadmap', title: 'Everything', start: '2026-01-01', end: '2027-06-30', lanes },
        { kind: 'doughnut', title: 'Spend by vendor', labels, series: [{ name: 'Spend', values: labels.map((_, i) => (i + 1) * 1000) }], valueFormat: 'money' },
      ]),
    );
    expect(isZip(bytes)).toBe(true);
    const { has, slides } = inspect(bytes);
    expect(slides).toBeGreaterThan(3);
    expect(has('Other')).toBe(true);
  });
});
