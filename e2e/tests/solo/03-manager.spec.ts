import { expect, resetClicks, test, withinBudget } from '../helpers';

test('J3 · portfolio health to PowerPoint in three clicks', async ({ page }) => {
  await page.goto('/');
  await resetClicks(page);

  await page.getByRole('link', { name: 'Dashboards' }).click();
  await expect(page.getByText('Applications in use')).toBeVisible();

  await page.getByRole('button', { name: 'Share' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /PowerPoint/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.pptx$/);
  const bytes = await (await file.createReadStream()).toArray();
  expect(Buffer.concat(bytes).subarray(0, 2).toString()).toBe('PK');

  await withinBudget(page, 3, 'J3');
});

test('J3 · a red number leads to the applications behind it', async ({ page }) => {
  await page.goto('/dashboards?id=portfolio');
  await page.getByText('Healthy', { exact: true }).click();
  await expect(page).toHaveURL(/health=act/);
  await expect(page.getByRole('row').nth(1)).toBeVisible();
});

test('J3 · a manager opens Atrium on the manager view', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Managers' }).click();
  await expect(page.getByText('Annual run cost').first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('Annual run cost').first()).toBeVisible();
  // Back to the architect view for the next journeys.
  await page.getByRole('radio', { name: 'Architects' }).click();
});
