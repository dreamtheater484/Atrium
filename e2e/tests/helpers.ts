import { test as base, expect, type Page } from '@playwright/test';

const KEY = 'e2e.clicks';

/**
 * Every journey has a friction budget. The page counts real clicks (keyboard use is free)
 * in sessionStorage, so the count survives in-app navigation.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((key) => {
      addEventListener(
        'click',
        (e) => {
          if (!e.isTrusted) return;
          sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) ?? 0) + 1));
        },
        true,
      );
    }, KEY);
    await use(page);
  },
});

export { expect };

export async function clicks(page: Page): Promise<number> {
  return page.evaluate((key) => Number(sessionStorage.getItem(key) ?? 0), KEY);
}

export async function resetClicks(page: Page) {
  await page.evaluate((key) => sessionStorage.setItem(key, '0'), KEY);
}

export async function withinBudget(page: Page, max: number, journey: string) {
  const n = await clicks(page);
  test.info().annotations.push({ type: 'clicks', description: `${journey}: ${n} of ${max}` });
  expect(n, `${journey} took ${n} clicks; the budget is ${max}`).toBeLessThanOrEqual(max);
}

/** Atrium's own pages send this header on changes; tests calling the API do the same. */
export const CSRF = { 'x-atrium-csrf': '1' };

export async function toast(page: Page, text: string | RegExp) {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible();
}

/** Calls one MCP tool over Streamable HTTP and returns its text content. */
export async function mcp(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  method: string,
  params: Record<string, unknown> = {},
) {
  const res = await request.post('/mcp', {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    data: { jsonrpc: '2.0', id: 1, method, params },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as {
    result?: { content?: Array<{ type: string; text: string }>; tools?: Array<{ name: string }> };
    error?: { message: string };
  };
}

export const text = (r: Awaited<ReturnType<typeof mcp>>) =>
  (r.result?.content ?? []).map((c) => c.text).join('\n');
