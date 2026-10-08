import { expect, test } from '../helpers';
import { ADMIN, ADMIN_STATE } from './accounts';

test('team server: the first person creates the admin account', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Set up Atrium' })).toBeVisible();
  await page.getByLabel('Your name').fill(ADMIN.name);
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Create admin account' }).click();
  await expect(page.getByText('One living map of how your organization works')).toBeVisible();
  await page.context().storageState({ path: ADMIN_STATE });
});

test('team server: signing out and in again', async ({ browser }) => {
  const context = await browser.newContext({ storageState: ADMIN_STATE });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByText(ADMIN.name).first()).toBeVisible();
  await context.close();

  const fresh = await browser.newContext();
  const login = await fresh.newPage();
  await login.goto('/');
  await expect(login.getByRole('heading', { name: /Sign in to/ })).toBeVisible();
  await login.getByLabel('Email').fill(ADMIN.email);
  await login.getByLabel('Password').fill('wrong password!');
  await login.getByRole('button', { name: 'Sign in' }).click();
  await expect(login.getByText(/don.t match|incorrect/i)).toBeVisible();
  await login.getByLabel('Password').fill(ADMIN.password);
  await login.getByRole('button', { name: 'Sign in' }).click();
  await expect(login.getByText('One living map of how your organization works')).toBeVisible();
  await fresh.close();
});

test('team server: the API refuses anonymous requests', async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL });
  expect((await anon.get('/api/v1/elements')).status()).toBe(401);
  await anon.dispose();
});
