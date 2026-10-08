import { CSRF, expect, mcp, test, text, toast } from '../helpers';
import { ADMIN_STATE, ENGINEER, ENGINEER_STATE } from './accounts';

test('team: an admin invites an engineer, who picks a password and is in', async ({ browser }) => {
  const admin = await browser.newContext({ storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto('/settings?tab=people');
  await page.getByRole('button', { name: 'Add person' }).click();
  await page.getByLabel('Name').fill(ENGINEER.name);
  await page.getByLabel('Email').fill(ENGINEER.email);
  await page.getByRole('combobox', { name: 'Role' }).click();
  await page.getByRole('option', { name: 'Engineer' }).click();
  await page.getByRole('button', { name: 'Create invite' }).click();
  const link = await page
    .getByRole('dialog', { name: 'Share this invite link' })
    .getByRole('textbox')
    .inputValue();
  expect(link).toMatch(/\/invite\//);
  await admin.close();

  const eng = await browser.newContext();
  const invite = await eng.newPage();
  await invite.goto(link);
  await expect(invite.getByRole('heading', { name: 'Welcome, Eli' })).toBeVisible();
  await invite.getByLabel('New password').fill(ENGINEER.password);
  await invite.getByRole('button', { name: 'Start using Atrium' }).click();
  await expect(invite.getByText(ENGINEER.name).first()).toBeVisible();
  await eng.storageState({ path: ENGINEER_STATE });
  await eng.close();
});

test('team: an engineer edits something they do not own; it becomes a suggestion', async ({
  browser,
}) => {
  const eng = await browser.newContext({ storageState: ENGINEER_STATE });
  const page = await eng.newPage();
  await page.goto('/explore?type=application&q=Product%20Catalog');
  await page
    .getByRole('row')
    .filter({ hasText: 'Product Catalog' })
    .getByText('Product Catalog', { exact: true })
    .click();
  await page.getByRole('combobox', { name: 'Lifecycle' }).click();
  await page.getByRole('option', { name: 'Phase out' }).click();
  await toast(page, 'Saved as a suggestion');

  await page.goto('/changes?tab=mine');
  await page
    .getByRole('button', { name: /Suggested changes/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await toast(page, 'Sent for review');
  await eng.close();

  // The architect approves it.
  const admin = await browser.newContext({ storageState: ADMIN_STATE });
  const review = await admin.newPage();
  await review.goto('/changes?tab=review');
  await review
    .getByRole('button', { name: new RegExp(ENGINEER.name) })
    .first()
    .click();
  await review.getByRole('button', { name: 'Approve and apply' }).click();
  await toast(review, /Approved and applied|Applied/);
  await admin.close();
});

test('team: a token only sees what it may see, enforced by the database', async ({ browser }) => {
  const admin = await browser.newContext({ storageState: ADMIN_STATE });
  const res = await admin.request.post('/api/v1/tokens', {
    headers: CSRF,
    data: { name: 'Internal-only agent', kind: 'agent', maxClassification: 'internal' },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const { token } = (await res.json()) as { token: string };
  await admin.close();

  const api = await browser.newContext();
  const found = text(
    await mcp(api.request, token, 'tools/call', { name: 'search', arguments: { query: 'Order' } }),
  );
  // Other elements may mention Order Hub in their descriptions; what matters is the element itself.
  const json = found.slice(found.indexOf('['), found.lastIndexOf(']') + 1);
  const names = (JSON.parse(json) as Array<{ name: string }>).map((e) => e.name);
  expect(names).not.toContain('Order Hub'); // confidential
  expect(names).toContain('Legacy Order Entry'); // internal, so visible

  const direct = await api.request.get('/api/v1/elements', {
    params: { q: 'Order Hub' },
    headers: { authorization: `Bearer ${token}` },
  });
  const { items } = (await direct.json()) as { items: Array<{ name: string }> };
  expect(items.map((i) => i.name)).not.toContain('Order Hub');
  await api.close();
});
