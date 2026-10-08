import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SOLO } from '../../playwright.config';
import { expect, resetClicks, test, toast, withinBudget } from '../helpers';
import { ADMIN_STATE } from './accounts';

test.use({ storageState: ADMIN_STATE });

test('J10 · move from a laptop to the team server: one export, one import', async ({
  page,
  playwright,
  request,
}) => {
  // On the laptop (the solo server): download everything.
  const laptop = await playwright.request.newContext({ baseURL: SOLO });
  const bundle = await laptop.get('/api/v1/bundle');
  expect(bundle.ok()).toBeTruthy();
  const file = join(mkdtempSync(join(tmpdir(), 'atrium-move-')), 'atrium-backup.json');
  writeFileSync(file, await bundle.body());
  const laptopCounts = await (await laptop.get('/api/v1/elements/counts')).json();
  await laptop.dispose();

  // On the team server: restore it.
  await page.goto('/settings?tab=data');
  await resetClicks(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore a backup' }).click();
  await (await chooser).setFiles(file);
  await toast(page, /Restored \d+ elements/);
  await withinBudget(page, 2, 'J10');

  const serverCounts = await (await request.get('/api/v1/elements/counts')).json();
  expect(serverCounts).toEqual(laptopCounts);

  await page.goto('/explore?type=capability&view=map');
  await expect(page.getByText('Customer Management').first()).toBeVisible();
});
