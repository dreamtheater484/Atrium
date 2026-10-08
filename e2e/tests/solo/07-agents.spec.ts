import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CSRF, expect, mcp, resetClicks, test, text, withinBudget } from '../helpers';

let token = '';

test('J7 · connect a coding agent: one command to paste', async ({ page }) => {
  await page.goto('/settings?tab=agents');
  await resetClicks(page);
  await page.getByRole('button', { name: 'Connect coding agent' }).click();
  await page.getByRole('button', { name: 'Create connection' }).click();

  const snippet = page.locator('pre, code').filter({ hasText: 'claude mcp add' }).first();
  await expect(snippet).toBeVisible();
  const command = (await snippet.textContent()) ?? '';
  expect(
    command
      .trim()
      .split('\n')
      .filter((l) => l.trim()).length,
  ).toBe(1);
  token = /atr_[A-Za-z0-9_-]+/.exec(command)?.[0] ?? '';
  expect(token).not.toBe('');
  await withinBudget(page, 3, 'J7');
});

test('J8 · the agent reads context and checks standards while coding', async ({ request }) => {
  const tools = await mcp(request, token, 'tools/list');
  const names = tools.result?.tools?.map((t) => t.name) ?? [];
  expect(names).toEqual(
    expect.arrayContaining([
      'get_service_context',
      'find_dependencies',
      'check_against_standards',
      'propose_change',
    ]),
  );

  const context = text(
    await mcp(request, token, 'tools/call', {
      name: 'get_service_context',
      arguments: { service: 'Order Hub' },
    }),
  );
  expect(context).toContain('Order Hub');
  expect(context).toContain('<atrium-data');

  const check = text(
    await mcp(request, token, 'tools/call', {
      name: 'check_against_standards',
      arguments: { technologies: [{ name: 'Java', version: '8' }] },
    }),
  );
  expect(check).toMatch(/Java 8|end of life|end-of-life/i);

  const proposal = text(
    await mcp(request, token, 'tools/call', {
      name: 'propose_change',
      arguments: {
        title: 'Order Hub sends order events to Kafka',
        description: 'Found while adding the refund flow.',
        changes: [
          {
            action: 'update',
            element: 'Order Hub',
            description: 'Order orchestration, now publishing order events for downstream systems.',
          },
        ],
      },
    }),
  );
  expect(proposal).toMatch(/review|suggest/i);
});

test('J8 · the suggestion waits for a person, and every call is logged', async ({ page }) => {
  await page.goto('/changes?tab=review');
  await expect(page.getByText('Order Hub sends order events to Kafka')).toBeVisible();
  await page.goto('/settings?tab=agents');
  await expect(page.getByText('mcp.get_service_context').first()).toBeVisible();
  await expect(page.getByText('mcp.propose_change').first()).toBeVisible();
});

test('J7 · a repository is described with one CLI command', async ({ request, baseURL }) => {
  const cli = await request.get('/cli/atrium.mjs');
  expect(cli.ok()).toBeTruthy();
  const dir = mkdtempSync(join(tmpdir(), 'atrium-cli-'));
  const bin = join(dir, 'atrium.mjs');
  writeFileSync(bin, await cli.body());
  const repo = join(dir, 'loyalty-points');
  execFileSync('node', ['-e', `require('fs').mkdirSync(${JSON.stringify(repo)})`]);
  writeFileSync(
    join(repo, 'package.json'),
    JSON.stringify({
      name: 'loyalty-points',
      dependencies: { fastify: '^5.0.0', pg: '^8.11.0', kafkajs: '^2.2.0' },
      engines: { node: '22' },
    }),
  );
  const env = { ...process.env, ATRIUM_URL: baseURL, ATRIUM_TOKEN: token };
  execFileSync('node', [bin, 'init'], { cwd: repo, env, stdio: 'pipe' });
  expect(existsSync(join(repo, 'atrium.yaml'))).toBeTruthy();
  expect(readFileSync(join(repo, 'atrium.yaml'), 'utf8')).toMatch(/loyalty-points/);

  // `check` exits 1 only when a standard is broken; either way it prints a report.
  let out = '';
  try {
    out = execFileSync('node', [bin, 'check'], { cwd: repo, env, stdio: 'pipe' }).toString();
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
  expect(out).toMatch(/standard|passed|warning|error/i);
  void CSRF;
});
