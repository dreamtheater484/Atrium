// Dev helper: screenshot dialogs and flows that need clicks. Usage: node e2e/shoot-flows.mjs <outDir>
import { chromium } from '@playwright/test';

const out = process.argv[2];
const base = process.env.ATRIUM_URL ?? 'http://localhost:5173';
const theme = process.env.THEME ?? 'dark';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: theme,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
const shot = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}-${theme}.png` });
  console.log('saved', name);
};

await page.goto(`${base}/dashboards?id=portfolio`, { waitUntil: 'networkidle' });
await shot('dash');
await page.goto(`${base}/explore?type=technology&view=radar`, { waitUntil: 'networkidle' });
await shot('radar');
await page.goto(`${base}/settings?tab=agents`, { waitUntil: 'networkidle' });
await shot('settings-agents');
await page.goto(`${base}/settings?tab=packs`, { waitUntil: 'networkidle' });
await shot('settings-packs');
await page
  .getByRole('button', { name: /connect/i })
  .first()
  .click()
  .catch((e) => console.log('no connect button', e.message));
await shot('connect-dialog');
await page.keyboard.press('Escape');
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page
  .getByRole('button', { name: /^add$/i })
  .first()
  .click()
  .catch(() => {});
await page.waitForTimeout(300);
await shot('add-menu');
await page.keyboard.press('Escape');
await page
  .goto(`${base}/e/${process.env.APP_ID ?? ''}`, { waitUntil: 'networkidle' })
  .catch(() => {});
await browser.close();
