import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

/**
 * End-to-end journeys (J1–J10 from docs/implementation-plan.md) against the built app.
 *   pnpm build && pnpm e2e
 * Two servers start on fresh databases: one in solo mode, one in team mode.
 * Needs the development database (pnpm db:up) or E2E_DATABASE_URL.
 */
export const SOLO = 'http://localhost:7401';
export const TEAM = 'http://localhost:7402';

export default defineConfig({
  testDir: './tests',
  // The journeys build on each other (sample → import → review), so they run in order.
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide' },
  },
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]],
  outputDir: '../test-results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  use: {
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'solo', testMatch: /solo[\\/].*\.spec\.ts/, use: { baseURL: SOLO } },
    {
      name: 'team',
      testMatch: /team[\\/].*\.spec\.ts/,
      use: { baseURL: TEAM },
      dependencies: ['solo'],
    },
  ],
  webServer: [
    {
      command: 'node start-server.mjs solo 7401 solo',
      url: `${SOLO}/api/health`,
      // Canned end-of-support research instead of a live AI provider.
      env: {
        ATRIUM_RESEARCH_FIXTURES: fileURLToPath(
          new URL('./fixtures/research.json', import.meta.url),
        ),
      },
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
      timeout: 60_000,
    },
    {
      command: 'node start-server.mjs team 7402 team',
      url: `${TEAM}/api/health`,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
      timeout: 60_000,
    },
  ],
});
