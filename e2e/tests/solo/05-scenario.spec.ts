import { expect, resetClicks, test, toast, withinBudget } from '../helpers';

test('J5 · sketch a scenario, edit in place, submit it and get it agreed', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await resetClicks(page);

  // No set-up: name it and start editing.
  await page.getByRole('button', { name: /^Scenarios/ }).click();
  await page.getByRole('menuitem', { name: 'New scenario' }).click();
  await page.getByLabel('Name').fill('Retire Siebel early');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Retire Siebel early').first()).toBeVisible();
  await expect(page.getByText(/Changes you make here only affect this scenario/)).toBeVisible();

  // Edit an element right where it is.
  await page.getByRole('button', { name: /Search or ask/ }).click();
  await page.getByPlaceholder(/Search anything, or ask/).fill('Siebel CRM 8');
  await expect(
    page.getByRole('option', { name: /Siebel CRM 8/, selected: true }).first(),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await page.getByRole('combobox', { name: 'Lifecycle' }).click();
  await page.getByRole('option', { name: 'Retired' }).click();
  await expect(page.getByText(/\(1 so far\)/)).toBeVisible();

  // Submit the scenario for review.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: "See what's different" }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await toast(page, 'Sent for review');
  await withinBudget(page, 10, 'J5');

  // The reviewer agrees; today stays as it was.
  await page.getByRole('button', { name: 'Agree' }).click();
  await toast(page, /Agreed/);
  await expect(page.getByText('Agreed').first()).toBeVisible();

  const today = (await (
    await request.get('/api/v1/elements', { params: { type: 'application', q: 'Siebel CRM 8' } })
  ).json()) as { items: Array<{ name: string; lifecycle: string }> };
  expect(today.items.find((e) => e.name === 'Siebel CRM 8')?.lifecycle).not.toBe('retired');
});

test('J5 · the roadmap shows the target state with the time slider', async ({ page }) => {
  await page.goto('/roadmap');
  await expect(page.getByText('Initiatives').first()).toBeVisible();
  await expect(page.getByText('Legacy retirement programme').first()).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PowerPoint' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pptx$/);
});
