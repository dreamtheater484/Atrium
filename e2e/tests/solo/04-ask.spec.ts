import { expect, test, withinBudget } from '../helpers';

test('J4 · "what breaks if we retire Legacy CRM?" in one search', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Search or ask/ })).toBeVisible();
  await page.keyboard.press('Control+K');
  await page
    .getByPlaceholder(/Search anything, or ask/)
    .fill('what breaks if we retire Legacy CRM');
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Changing Legacy CRM affects/)).toBeVisible();
  await expect(dialog.getByRole('button').filter({ hasText: /\w/ }).nth(1)).toBeVisible();
  await withinBudget(page, 0, 'J4');

  // One more click shows the picture.
  await dialog.getByRole('button', { name: /Show the impact graph/ }).click();
  await expect(page.getByText(/Changing Legacy CRM affects/)).toBeVisible();
});

test('J4 · impact is one click away from any element', async ({ page }) => {
  await page.goto('/explore?type=application&q=Legacy%20CRM');
  await page
    .getByRole('row')
    .filter({ hasText: 'Legacy CRM' })
    .getByText('Legacy CRM', { exact: true })
    .click();
  await page.getByRole('button', { name: 'Impact' }).click();
  await expect(page.getByText(/Changing Legacy CRM affects/)).toBeVisible();
});
