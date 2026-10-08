import { expect, resetClicks, test, toast, withinBudget } from '../helpers';

test('J9 · install a reference pack and map the model to it in bulk', async ({ page, request }) => {
  await page.goto('/settings?tab=packs');
  await resetClicks(page);

  const card = page
    .locator('div')
    .filter({ hasText: /^Starter capability reference/ })
    .first();
  await page.getByRole('button', { name: 'Install' }).first().click();
  await toast(page, /Installed/);
  void card;

  await page.getByRole('button', { name: 'Map your model' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Identity and access management').first()).toBeVisible();
  const map = dialog.getByRole('button', { name: /^Map \d+ elements$/ });
  await expect(map).toBeEnabled();
  await map.click();
  await toast(page, /Mapped \d+ elements/);
  await withinBudget(page, 3, 'J9');

  const res = await request.get('/api/v1/packs/starter-capabilities/mapping-suggestions');
  const data = (await res.json()) as { mapped: number; referenceCovered: number };
  expect(data.mapped).toBeGreaterThan(10);
  expect(data.referenceCovered).toBeGreaterThan(5);
});

test('J9 · the reference layer can be browsed next to your own map', async ({ page }) => {
  await page.goto('/explore?type=capability&view=table&layer=reference');
  await expect(page.getByText('Identity and access management').first()).toBeVisible();
});
