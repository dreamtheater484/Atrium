import { expect, test, withinBudget } from '../helpers';

test('J1 · first run: load the sample and see the capability map', async ({ page }) => {
  const started = Date.now();
  await page.goto('/');
  await expect(page.getByText('One living map of how your organization works')).toBeVisible();

  await page.getByRole('button', { name: 'Load the sample' }).click();

  await expect(page).toHaveURL(/type=capability.*view=map|view=map.*type=capability/);
  await expect(page.getByText('Customer Management').first()).toBeVisible();
  await expect(page.getByText('Customer Bill Management').first()).toBeVisible();

  await withinBudget(page, 5, 'J1');
  expect(Date.now() - started).toBeLessThan(5 * 60_000);
});

test('J1 · the landing page shows what needs attention', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  await expect(page.getByText('Fill the gaps').first()).toBeVisible();
  await expect(page.getByText('Waiting for review').first()).toBeVisible();
});
