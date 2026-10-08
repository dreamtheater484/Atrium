// Captures the screens and real tool output the videos show.
//
//   pnpm build                      (once: the capture runs the production build)
//   pnpm videos:capture             starts Atrium on a fresh database, records everything
//   pnpm videos:capture -- --only graph,review
//
// Screens are high-resolution stills (2× pixels), not a screen recording: Remotion animates the
// pointer, clicks and camera over them, so text stays sharp at any zoom.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Browser, chromium, type Page } from '@playwright/test';
import { ROOT } from '../lib/scripts';
import type { Captures, ShotData, ShotStep } from '../src/types';
import { SHOTS, type Step } from './shots';

const PORT = 7410;
const BASE = `http://localhost:${PORT}`;
const SCALE = 2;
const VIEW = { width: 1600, height: 900 };
const OUT = join(ROOT, 'public', 'captures');
const only = (() => {
  const i = process.argv.indexOf('--only');
  return i > 0 ? new Set(process.argv[i + 1]!.split(',')) : null;
})();

async function startServer(): Promise<ChildProcess> {
  const server = spawn(
    process.execPath,
    [join(ROOT, '..', '..', 'e2e', 'start-server.mjs'), 'video', String(PORT), 'solo'],
    {
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  );
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return server;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  server.kill();
  throw new Error('Atrium did not start. Did you run pnpm build?');
}

const api = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-atrium-csrf': '1', ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('json') ? res.json() : res.text()) as Promise<T>;
};

async function idOf(name: string, type?: string): Promise<string> {
  const q = new URLSearchParams({ q: name, ...(type ? { type } : {}) });
  const r = await api<{ items: Array<{ id: string; name: string }> }>(`/api/v1/elements?${q}`);
  const hit = r.items.find((e) => e.name === name) ?? r.items[0];
  if (!hit) throw new Error(`No element called ${name}`);
  return hit.id;
}

async function box(page: Page, sel: string, pad = 0) {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) return null;
  return {
    x: Math.max(0, (b.x - pad) * SCALE),
    y: Math.max(0, (b.y - pad) * SCALE),
    w: (b.width + pad * 2) * SCALE,
    h: (b.height + pad * 2) * SCALE,
  };
}

async function settle(page: Page, ms = 700) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

async function runShot(
  browser: Browser,
  name: string,
  steps: Step[],
  vars: Record<string, string>,
) {
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: SCALE,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  });
  await ctx.addInitScript(() => {
    // Hide the text caret and scrollbars in captures.
    const style = document.createElement('style');
    style.textContent = '*{caret-color:transparent!important} ::-webkit-scrollbar{display:none}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  });
  const page = await ctx.newPage();
  const out: ShotStep[] = [];
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
  for (const [i, step] of steps.entries()) {
    let cursor: ShotStep['cursor'] = null;
    let click = false;
    const target = 'sel' in step && step.sel ? fill(step.sel) : null;
    if (target) {
      const b = await box(page, target);
      if (b) cursor = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }
    switch (step.do) {
      case 'goto':
        await page.goto(BASE + fill(step.path));
        break;
      case 'click':
        await page.locator(target!).first().click();
        click = true;
        break;
      case 'hover':
        await page.locator(target!).first().hover();
        break;
      case 'type':
        if (target) await page.locator(target).first().click();
        await page.keyboard.type(fill(step.text), { delay: 15 });
        break;
      case 'press':
        await page.keyboard.press(step.key);
        break;
      case 'files':
        await page.locator(target!).first().setInputFiles(fill(step.file));
        cursor = null;
        break;
      case 'eval':
        await page.evaluate(step.js);
        break;
    }
    await settle(page, step.wait ?? 700);
    const focus = step.focus ? await box(page, fill(step.focus), step.pad ?? 16) : null;
    const file = `${String(i).padStart(2, '0')}.png`;
    await page.screenshot({ path: join(dir, file) });
    const path = new URL(page.url()).pathname + new URL(page.url()).search;
    out.push({
      file,
      cursor,
      click,
      focus,
      weight: step.weight ?? 1,
      label: path.length > 60 ? `${path.slice(0, 58)}…` : path,
    });
  }
  await ctx.close();
  const shot: ShotData = { width: VIEW.width * SCALE, height: VIEW.height * SCALE, steps: out };
  console.log(`  ✓ ${name} (${out.length} screens)`);
  return shot;
}

/** Real output from the CLI and the MCP server, for the terminal, code and agent scenes. */
async function toolOutput(token: string): Promise<Record<string, string>> {
  const assets: Record<string, string> = {};
  const work = join(tmpdir(), `atrium-video-${Date.now()}`);
  const repo = join(work, 'loyalty-points');
  mkdirSync(repo, { recursive: true });
  writeFileSync(join(work, 'atrium.mjs'), await (await fetch(`${BASE}/cli/atrium.mjs`)).text());
  writeFileSync(
    join(repo, 'package.json'),
    JSON.stringify(
      {
        name: 'loyalty-points',
        description: 'Points, tiers and rewards for MyAcme customers.',
        dependencies: { fastify: '^5.2.0', pg: '^8.13.0', kafkajs: '^2.2.4', zod: '^3.24.0' },
        engines: { node: '22' },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(repo, 'Dockerfile'),
    'FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nCMD ["node", "server.js"]\n',
  );
  writeFileSync(
    join(repo, 'docker-compose.yml'),
    'services:\n  db:\n    image: postgres:16\n  kafka:\n    image: apache/kafka:3.9.0\n',
  );
  const env = {
    ...process.env,
    ATRIUM_URL: BASE,
    ATRIUM_TOKEN: token,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
  };
  const cli = (args: string[]) => {
    try {
      return execFileSync(process.execPath, [join(work, 'atrium.mjs'), ...args], {
        cwd: repo,
        env,
        stdio: 'pipe',
      }).toString();
    } catch (e) {
      const err = e as { stdout?: Buffer; stderr?: Buffer };
      return `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }
  };
  cli(['init']);
  assets['cli.init'] = readFileSync(join(repo, 'atrium.yaml'), 'utf8');
  assets['cli.check'] = cli(['check']).trim();
  assets['cli.sync'] = cli(['sync', '--dry-run']).trim();
  assets['cli.context'] = cli(['context', 'Order Hub', '--stdout']).trim();
  const apps = await api<{ items: Array<Record<string, unknown>> }>(
    '/api/v1/elements?type=application&limit=2',
  );
  assets['api.elements'] = JSON.stringify(
    {
      items: apps.items.map((e) => ({
        id: e.id,
        type: e.type,
        name: e.name,
        owner: e.owner,
        lifecycle: e.lifecycle,
        health: e.health,
        attributes: {
          vendor: (e.attributes as Record<string, unknown>).vendor,
          hosting: (e.attributes as Record<string, unknown>).hosting,
        },
      })),
      total: '…',
    },
    null,
    2,
  );

  const mcp = async (name: string, args: Record<string, unknown>) => {
    const res = await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });
    const j = (await res.json()) as { result?: { content?: Array<{ text: string }> } };
    return (j.result?.content ?? []).map((x) => x.text).join('\n');
  };
  const strip = (s: string) => s.replace(/<\/?atrium-data[^>]*>/g, '').trim();
  // Structured answers read better as the lines a person would see in a terminal.
  const readable = (raw: string) => {
    try {
      const j = JSON.parse(strip(raw)) as {
        summary?: string;
        findings?: Array<{ level: string; message: string }>;
        problems?: string[];
      };
      const icon: Record<string, string> = { error: '✗', warning: '!', info: 'i' };
      return [
        ...(j.findings ?? []).map((f) => `${icon[f.level] ?? '·'} ${f.message}`),
        ...(j.problems ?? []).map((p) => `! ${p}`),
        j.summary ? `✓ ${j.summary}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    } catch {
      return strip(raw);
    }
  };
  assets['agent.context'] = JSON.stringify({
    prompt: 'Add a cancellation flow to the order hub that refunds the payment.',
    tool: 'get_service_context',
    args: 'service: "Order Hub"',
    result: strip(await mcp('get_service_context', { service: 'Order Hub' })),
    reply:
      'The Order Hub belongs to the Commerce Squad and is mission critical: five channels use its ordering API. I will keep that API unchanged and publish cancellations on the existing Order Events stream.',
  });
  assets['agent.check'] = JSON.stringify({
    prompt: 'Use the old Java 8 reporting library for the cancellation report.',
    tool: 'check_against_standards',
    args: 'technologies: [Java 8, PostgreSQL 16]',
    result: readable(
      await mcp('check_against_standards', {
        technologies: [
          { name: 'Java', version: '8' },
          { name: 'PostgreSQL', version: '16' },
        ],
      }),
    ),
    reply:
      'Java 8 is past end of life and not allowed by your standards, so I will use Java 21 instead. PostgreSQL 16 is fine.',
  });
  assets['agent.propose'] = JSON.stringify({
    prompt: 'Done. Please make sure the architecture is up to date.',
    tool: 'propose_change',
    args: 'title: "Order Hub publishes order-cancelled events"',
    result: readable(
      await mcp('propose_change', {
        title: 'Order Hub publishes order-cancelled events',
        description: 'Added in the cancellation flow; refunds go through the new billing platform.',
        changes: [
          {
            action: 'update',
            element: 'Order Hub',
            description:
              'Central order capture and orchestration for all consumer and business orders, including cancellations and refunds.',
          },
          { action: 'link', relation: 'depends_on', from: 'Order Hub', to: 'Corvina Cloud BSS' },
        ],
      }),
    ),
    reply:
      'I proposed the update. An architect will review it; nothing in the model changes until then.',
  });
  rmSync(work, { recursive: true, force: true });
  return assets;
}

const server = await startServer();
try {
  console.log(`Atrium is up at ${BASE}`);
  const browser = await chromium.launch();
  const capturesFile = join(ROOT, 'src', 'generated', 'captures.json');
  let previous: Captures = { scale: SCALE, shots: {}, assets: {} };
  try {
    previous = JSON.parse(readFileSync(capturesFile, 'utf8')) as Captures;
  } catch {
    // first run
  }
  const shots: Record<string, ShotData> = { ...previous.shots };
  const vars: Record<string, string> = {};

  // 1. First run happens on the empty workspace.
  if (!only || only.has('first-run'))
    shots['first-run'] = await runShot(browser, 'first-run', SHOTS['first-run']!.steps, vars);
  else await api('/api/v1/onboarding/sample', { method: 'POST', body: '{}' });

  // 2. Prepare: the solo user is on two teams; a token for the agent and the CLI.
  const me = await api<{ id: string }>('/api/v1/me');
  const teams = await api<{ items: Array<{ id: string; name: string }> }>(
    '/api/v1/elements?type=team&limit=50',
  );
  const mine = teams.items
    .filter((t) => ['Commerce Squad', 'Digital Channels'].includes(t.name))
    .map((t) => t.id);
  await api(`/api/v1/users/${me.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ teamIds: mine }),
  }).catch(() => {});
  const { token } = await api<{ token: string }>('/api/v1/tokens', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Claude Code',
      kind: 'agent',
      client: 'claude-code',
      canPropose: true,
      maxClassification: 'confidential',
    }),
  });
  const assets = !only || only.has('assets') ? await toolOutput(token) : previous.assets;

  vars.legacyCrm = await idOf('Legacy CRM', 'application');
  vars.customerDomain = await idOf('Customer', 'domain');
  const csv = join(tmpdir(), 'application-portfolio.csv');
  writeFileSync(csv, readFileSync(join(ROOT, 'capture', 'application-portfolio.csv')));
  vars.csv = csv;

  for (const [name, def] of Object.entries(SHOTS)) {
    if (name === 'first-run' || (only && !only.has(name))) continue;
    shots[name] = await runShot(browser, name, def.steps, vars);
  }
  await browser.close();
  const data: Captures = { scale: SCALE, shots, assets };
  mkdirSync(join(ROOT, 'src', 'generated'), { recursive: true });
  writeFileSync(capturesFile, `${JSON.stringify(data, null, 2)}\n`);
  console.log('Wrote src/generated/captures.json');
} finally {
  server.kill();
}
