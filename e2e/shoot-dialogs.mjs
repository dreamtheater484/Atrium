// Dev helper: screenshot the connect-agent dialog and the import wizard. Usage: node e2e/shoot-dialogs.mjs <outDir> <csvPath>
import { chromium } from '@playwright/test';

const [out, csv] = process.argv.slice(2);
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
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}-${theme}.png` });
  console.log('saved', name);
};
await page.goto(`${base}/settings?tab=agents`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Connect coding agent' }).click();
await shot('connect-dialog');
await page.keyboard.press('Escape');
await page.goto(`${base}/explore?type=application`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Export' }).click();
await shot('export-menu');
await page.keyboard.press('Escape');
if (csv) {
  await page.getByRole('button', { name: 'More ways to add' }).click();
  await page.getByRole('menuitem', { name: /import/i }).click();
  await shot('import-empty');
  await page.locator('input[type=file]').first().setInputFiles(csv);
  await page.waitForTimeout(2500);
  await shot('import-wizard');
}
await browser.close();
