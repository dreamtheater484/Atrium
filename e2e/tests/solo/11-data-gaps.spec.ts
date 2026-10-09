import { expect, resetClicks, test, toast, withinBudget } from '../helpers';

// The solo test server runs with canned research results (e2e/fixtures/research.json) instead of
// a live AI provider, so these journeys are repeatable and free.

test('J11 · see how complete costs, integrations and support dates are', async ({ page }) => {
  await page.goto('/dashboards?id=portfolio');
  await expect(page.getByText('Data completeness').first()).toBeVisible();
  await expect(page.getByText(/through contracts/).first()).toBeVisible();
  await expect(page.getByText(/Known for \d+ of \d+ applications/).first()).toBeVisible();

  // One click shows exactly which applications have no mapped integrations.
  await page
    .getByRole('button', { name: /^Integrations \d+ of \d+/ })
    .first()
    .click();
  await expect(page).toHaveURL(/missing=relation\.integration/);
  await expect(page.getByText('Missing integrations with other applications')).toBeVisible();
  await expect(page.getByRole('row', { name: /Rollout Tracker/ })).toBeVisible();
  // Retired applications are not gaps.
  await expect(page.getByRole('row', { name: /Legacy Order Entry/ })).toHaveCount(0);
});

test('J12 · research missing support dates and approve them with their sources', async ({
  page,
}) => {
  await page.goto('/dashboards?id=portfolio');
  await resetClicks(page);
  await page.getByRole('button', { name: 'Find dates' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Only product names, vendors and versions/)).toBeVisible();
  await expect(dialog.getByText(/classified above internal/)).toBeVisible();
  await dialog.getByRole('button', { name: /^Look up \d+ dates?$/ }).click();
  await dialog.getByRole('button', { name: /^Review \d+ dates?$/ }).click();

  // Every date comes with the page it was found on.
  await expect(page.getByText(/found by research/)).toBeVisible();
  await expect(page.getByRole('link', { name: /wavecraft\.example/ })).toBeVisible();
  await expect(page.getByText(/end of standard support 30 June 2027/)).toBeVisible();
  // A result without a source is never offered.
  await expect(page.getByText('Integration Bus')).toHaveCount(0);

  // Drop the one we don't trust, approve the rest.
  await page.getByRole('button', { name: 'Drop the change to Amazon S3' }).click();
  await expect(page.getByText('Amazon S3')).toHaveCount(0);
  await page.getByRole('button', { name: 'Approve and apply' }).click();
  await toast(page, /Applied|Approved/);
  await withinBudget(page, 5, 'J12');

  // The date is now in the model, with where it came from.
  await page.goto('/explore?type=application&q=Wavecraft');
  await page.getByText('Wavecraft Planner', { exact: true }).first().click();
  await expect(page.getByText(/Found by research/)).toBeVisible();
  await expect(page.getByText('Extended support until').first()).toBeVisible();
});

test('J13 · a lump-sum contract is shared over the applications it covers', async ({ page }) => {
  await page.goto('/explore?type=contract');
  await expect(page.getByRole('row', { name: /Netrix Network Suite licence/ })).toBeVisible();
  await page.getByText('Netrix Network Suite licence', { exact: true }).click();
  await expect(page.getByText(/Shared by \d+ applications/)).toBeVisible();

  await page.goto('/explore?type=application&q=Network%20Inventory');
  await page.getByText('Network Inventory', { exact: true }).first().click();
  await expect(page.getByText(/from .*Netrix Network Suite licence/)).toBeVisible();
});
