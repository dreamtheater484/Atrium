// Dev helper: screenshot pages in light and dark. Usage: node e2e/shoot.mjs <outDir> <path> [path...]
import { chromium } from '@playwright/test';

const [out, ...paths] = process.argv.slice(2);
const base = process.env.ATRIUM_URL ?? 'http://localhost:5173';
const themes = (process.env.THEMES ?? 'light,dark').split(',');
const browser = await chromium.launch();
for (const theme of themes) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: theme,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${theme}] pageerror`, e.message));
  page.on('console', (m) => m.type() === 'error' && console.log(`[${theme}] console`, m.text()));
  for (const p of paths) {
    await page.goto(base + p, { waitUntil: 'networkidle' });
    await page.waitForTimeout(Number(process.env.WAIT ?? 800));
    const name = `${p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}-${theme}.png`;
    await page.screenshot({ path: `${out}/${name}`, fullPage: process.env.FULL === '1' });
    console.log('saved', name);
  }
  await ctx.close();
}
await browser.close();
