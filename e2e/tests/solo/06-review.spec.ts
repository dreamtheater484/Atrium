import { expect, resetClicks, test, toast, withinBudget } from '../helpers';

test('J6 · review and approve an agent suggestion in two clicks', async ({ page }) => {
  await page.goto('/changes?tab=review');
  await resetClicks(page);

  await page.getByRole('button', { name: /Partner Portal now runs on Node\.js 22/ }).click();
  await expect(page.getByText(/Claude Code \(agent\)/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Approve and apply' }).click();
  await toast(page, /Approved and applied|Applied/);

  await withinBudget(page, 2, 'J6');
});

test('J6 · approved changes are in the history and can be undone', async ({ page }) => {
  await page.goto('/changes?tab=history');
  await page.getByRole('button', { name: /Partner Portal now runs on Node\.js 22/ }).click();
  await expect(page.getByRole('button', { name: 'Undo this change' })).toBeVisible();
});
