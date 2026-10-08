import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../helpers';

const PAGES = [
  '/',
  '/explore?type=application',
  '/explore?type=capability&view=map',
  '/explore?type=application&view=landscape',
  '/explore?type=technology&view=radar',
  '/dashboards?id=portfolio',
  '/roadmap',
  '/changes',
  '/settings',
  '/settings?tab=agents',
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} mode`, () => {
    test.use({ colorScheme: theme });
    for (const path of PAGES) {
      test(`WCAG AA on ${path}`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(300);
        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          // Charts are drawn as SVG with their own accessible labels and data tables.
          .exclude('.echarts-for-react, [data-chart] svg')
          .analyze();
        const serious = result.violations.filter((v) =>
          ['serious', 'critical'].includes(v.impact ?? ''),
        );
        const report = serious
          .map(
            (v) =>
              `${v.id} (${v.nodes.length}): ${v.help}\n  ${v.nodes
                .slice(0, 3)
                .map((n) => n.target.join(' '))
                .join('\n  ')}`,
          )
          .join('\n');
        expect(serious, report).toEqual([]);
      });
    }
  });
}
