// Dev helper: screenshot the bulk mapping dialog. Usage: node e2e/shoot-map.mjs <outDir>
import { chromium } from '@playwright/test';

const out = process.argv[2];
const base = process.env.ATRIUM_URL ?? 'http://localhost:5173';
const theme = process.env.THEME ?? 'dark';
const browser = await chromium.launch();
const page = await (
  await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme })
).newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}/settings?tab=packs`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Map your model' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/map-dialog-${theme}.png` });
console.log('saved');
await browser.close();
