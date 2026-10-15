import { expect, test } from '../helpers';

// Screens people see most, in both themes. Update the pictures on purpose with
//   pnpm e2e --update-snapshots
const SCREENS: Array<[string, string]> = [
  ['home', '/'],
  ['capability-map', '/explore?type=capability&view=map'],
  ['applications', '/explore?type=application'],
  ['framework', '/explore?pack=starter-capabilities&framework=capabilities'],
  ['dashboard', '/dashboards?id=portfolio'],
  ['roadmap', '/roadmap'],
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} mode`, () => {
    test.use({ colorScheme: theme });
    for (const [name, path] of SCREENS) {
      test(`looks right: ${name}`, async ({ page }) => {
        await page.clock.install({ time: new Date('2026-10-08T10:00:00Z') });
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
        await expect(page).toHaveScreenshot(`${name}-${theme}.png`, {
          // Relative times and presence change from run to run.
          mask: [
            page.getByText(/\b(ago|just now)\b/),
            page.locator('[aria-label="People online"]'),
          ],
        });
      });
    }
  });
}
