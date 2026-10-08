import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { CSRF, expect, resetClicks, test, withinBudget } from '../helpers';

const DOMAINS = ['Customer', 'Enterprise', 'Resource', 'Service', 'Product', 'Partner'];
const STATUS = ['Production', 'Live', 'Pilot', 'Decommissioning', 'Planned'];
const HOSTING = ['SaaS', 'On-prem', 'AWS', 'Azure', 'Private cloud'];

/** 500 rows the way they arrive from a CMDB: odd headers, mixed values, a few known systems. */
function portfolioCsv(): string {
  const rows = [
    'Application Name,Business Owner,Domain,Status,Yearly Cost (EUR),Vendor,Hosting,Depends on',
  ];
  for (let i = 1; i <= 497; i++) {
    const n = String(i).padStart(3, '0');
    rows.push(
      [
        `Portfolio App ${n}`,
        `Owner ${(i % 23) + 1}`,
        DOMAINS[i % DOMAINS.length],
        STATUS[i % STATUS.length],
        String(20_000 + i * 1_000),
        i % 3 ? 'In-house' : 'Vendor Corp',
        HOSTING[i % HOSTING.length],
        i > 1 ? `Portfolio App ${String(i - 1).padStart(3, '0')}` : '',
      ].join(','),
    );
  }
  // Already in the sample model: these must update, not duplicate.
  rows.push('Siebel CRM 8,Hannah Schmidt,Customer,Phasing out,1200000,Oracle,On-prem,');
  rows.push('Payment Gateway,Julia Novak,Customer,Production,210000,Payvana,SaaS,');
  rows.push('Order Hub,Pieter de Vries,Customer,Production,690000,In-house,Private cloud,');
  const dir = mkdtempSync(join(tmpdir(), 'atrium-e2e-'));
  const file = join(dir, 'application-portfolio.csv');
  writeFileSync(file, `${rows.join('\n')}\n`);
  return file;
}

async function openImport(page: Page, file: string) {
  await page.getByRole('button', { name: 'More ways to add' }).click();
  await page.getByRole('menuitem', { name: /Import a file/ }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Drop files here, or click to choose').click();
  await (await chooser).setFiles(file);
}

test('J2 · import 500 applications: columns mapped, known systems updated', async ({
  page,
  request,
}) => {
  const file = portfolioCsv();
  const started = Date.now();
  await page.goto('/');
  await resetClicks(page);
  await openImport(page, file);

  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByText('7 of 8 columns recognised').or(dialog.getByText('8 of 8 columns recognised')),
  ).toBeVisible();
  await expect(dialog.getByText('497 new')).toBeVisible();
  await expect(dialog.getByText('3 updated')).toBeVisible();

  await dialog.getByRole('button', { name: /^Import \d+ items$/ }).click();
  await expect(dialog.getByText('Import finished')).toBeVisible({ timeout: 60_000 });
  await withinBudget(page, 5, 'J2');
  expect(Date.now() - started, 'J2 must take well under 10 minutes').toBeLessThan(120_000);

  const res = await request.get('/api/v1/elements', {
    params: { type: 'application', q: 'Portfolio App', limit: 1000 },
  });
  const { items } = (await res.json()) as { items: Array<{ name: string; owner: string }> };
  expect(items.filter((e) => e.name.startsWith('Portfolio App')).length).toBe(497);

  const siebel = (await (
    await request.get('/api/v1/elements', { params: { type: 'application', q: 'Siebel CRM 8' } })
  ).json()) as { items: Array<{ name: string }> };
  expect(siebel.items.filter((e) => e.name === 'Siebel CRM 8')).toHaveLength(1);
});

test('J2 · importing the same file again changes nothing', async ({ page }) => {
  await page.goto('/');
  await openImport(page, portfolioCsv());
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Same layout as last time')).toBeVisible();
  await expect(dialog.getByText('500 unchanged')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Nothing new to import' })).toBeDisabled();
});

test('J2 · an import can be undone in one click', async ({ page, request }) => {
  const dir = mkdtempSync(join(tmpdir(), 'atrium-e2e-'));
  const file = join(dir, 'two-apps.csv');
  writeFileSync(file, 'Name,Owner\nUndo Me One,Ann\nUndo Me Two,Bob\n');
  await page.goto('/');
  await openImport(page, file);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^Import 2 items$/ }).click();
  await dialog.getByRole('button', { name: 'Undo import' }).click();
  await expect
    .poll(async () => {
      const r = await request.get('/api/v1/elements', { params: { q: 'Undo Me' }, headers: CSRF });
      return ((await r.json()) as { items: unknown[] }).items.length;
    })
    .toBe(0);
});
