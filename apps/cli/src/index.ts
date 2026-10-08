import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stdin, stdout } from 'node:process';
import { styleText } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { Command } from 'commander';
import { parse as parseYaml, stringify } from 'yaml';
import { CliError, request } from './client';
import { CONFIG_FILE, loadConfig, saveConfig } from './config';
import { scanRepository } from './scan';

const program = new Command();
const c = {
  ok: (s: string) => styleText('green', s),
  warn: (s: string) => styleText('yellow', s),
  err: (s: string) => styleText('red', s),
  dim: (s: string) => styleText('dim', s),
  bold: (s: string) => styleText('bold', s),
};

program
  .name('atrium')
  .description(
    'Atrium from the command line: describe services in atrium.yaml, sync them from CI, check them against your standards, and connect coding agents.',
  )
  .version('0.1.0')
  .option('--url <url>', 'Atrium address (or ATRIUM_URL)')
  .option('--token <token>', 'API token (or ATRIUM_TOKEN)');

const cfg = () => loadConfig(program.opts());

function readAtriumYaml(file: string) {
  const path = resolve(file);
  if (!existsSync(path))
    throw new CliError(`${file} not found. Run \`atrium init\` to create one.`);
  return { path, text: readFileSync(path, 'utf8') };
}

program
  .command('login')
  .description('Save the Atrium address and your token in ~/.atrium/config.json')
  .requiredOption('--token <token>', 'token from Atrium (profile menu → Connect coding agent)')
  .option('--url <url>', 'Atrium address', 'http://localhost:7300')
  .action(async (opts: { token: string; url: string }) => {
    const next = { url: opts.url.replace(/\/$/, ''), token: opts.token };
    const me = await request<{ elementCount: number; name: string }>(next, '/api/v1/workspace');
    saveConfig(next);
    console.log(
      `${c.ok('✓')} Connected to ${c.bold(me.name)} (${me.elementCount} elements). Saved to ${CONFIG_FILE}`,
    );
  });

program
  .command('init')
  .description(
    'Create atrium.yaml for this repository, pre-filled from package.json, pom.xml, Dockerfile, catalog-info.yaml and more',
  )
  .option('-d, --dir <dir>', 'repository folder', '.')
  .option('-f, --force', 'overwrite an existing atrium.yaml')
  .action((opts: { dir: string; force?: boolean }) => {
    const dir = resolve(opts.dir);
    const out = resolve(dir, 'atrium.yaml');
    if (existsSync(out) && !opts.force)
      throw new CliError('atrium.yaml already exists. Use --force to overwrite it.');
    const { doc, found } = scanRepository(dir);
    const yaml = [
      '# atrium.yaml: how this service fits into the architecture.',
      '# Keep it next to the code; CI runs `atrium sync` to update the shared model in Atrium.',
      '# Docs: https://github.com/ (see docs/agents.md in the Atrium repository)',
      stringify(JSON.parse(JSON.stringify(doc)), { lineWidth: 0 }),
    ].join('\n');
    writeFileSync(out, yaml);
    console.log(
      `${c.ok('✓')} Wrote ${c.bold('atrium.yaml')}${found.length ? ` using ${found.join(', ')}` : ''}.`,
    );
    console.log(
      c.dim(
        '  Check the team, domain and dependencies, then run `atrium check` and `atrium sync`.',
      ),
    );
  });

program
  .command('check')
  .description(
    'Check this service against standards, the technology radar and end-of-life dates (exit code 1 on errors, for CI)',
  )
  .option('-f, --file <file>', 'atrium.yaml to check', 'atrium.yaml')
  .option('--json', 'print JSON')
  .action(async (opts: { file: string; json?: boolean }) => {
    const { text } = readAtriumYaml(opts.file);
    const doc = parseYaml(text);
    const result = await request<{
      passed: boolean;
      summary: string;
      findings: Array<{ level: string; message: string }>;
    }>(cfg(), '/api/v1/check', {
      body: {
        service: doc?.metadata?.key,
        technologies: doc?.spec?.technologies,
        dependencies: doc?.spec?.dependsOn,
        data: doc?.spec?.data,
      },
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const f of result.findings) {
        const tag =
          f.level === 'error'
            ? c.err('✗ error  ')
            : f.level === 'warning'
              ? c.warn('! warning')
              : c.dim('i info   ');
        console.log(`${tag} ${f.message}`);
      }
      console.log(
        result.passed ? `${c.ok('✓')} ${result.summary}` : `${c.err('✗')} ${result.summary}`,
      );
    }
    if (!result.passed) process.exitCode = 1;
  });

program
  .command('sync')
  .description(
    'Send atrium.yaml to Atrium. Applied directly for your own team, otherwise sent for review.',
  )
  .option('-f, --file <file>', 'atrium.yaml to sync', 'atrium.yaml')
  .option('--dry-run', 'show what would change without changing anything')
  .option('--source <source>', 'where this came from, e.g. the repository URL and commit')
  .action(async (opts: { file: string; dryRun?: boolean; source?: string }) => {
    const { text } = readAtriumYaml(opts.file);
    const source =
      opts.source ??
      [process.env.GITHUB_REPOSITORY, process.env.GITHUB_SHA?.slice(0, 7)]
        .filter(Boolean)
        .join('@') ??
      undefined;
    const r = await request<{
      summary: string;
      warnings: string[];
      url: string | null;
      applied: boolean;
    }>(cfg(), '/api/v1/sync', {
      body: { yaml: text, dryRun: !!opts.dryRun, source: source || undefined },
    });
    for (const w of r.warnings) console.log(`${c.warn('!')} ${w}`);
    console.log(`${c.ok('✓')} ${r.summary}`);
    if (r.url && !r.applied) console.log(c.dim(`  Review: ${r.url}`));
  });

program
  .command('context')
  .description(
    'Write ARCHITECTURE.md with this service’s architecture context (for agents that read files)',
  )
  .argument('[service]', 'service key or name (default: from atrium.yaml)')
  .option('-o, --out <file>', 'output file', 'ARCHITECTURE.md')
  .option('--stdout', 'print instead of writing a file')
  .action(async (service: string | undefined, opts: { out: string; stdout?: boolean }) => {
    let key = service;
    if (!key && existsSync('atrium.yaml'))
      key = parseYaml(readFileSync('atrium.yaml', 'utf8'))?.metadata?.key;
    if (!key) throw new CliError('Which service? Pass its key, or run this next to atrium.yaml.');
    const md = await request<string>(cfg(), `/api/v1/context/${encodeURIComponent(key)}`, {
      accept: 'text/markdown',
    });
    if (opts.stdout) stdout.write(md);
    else {
      writeFileSync(resolve(opts.out), md);
      console.log(`${c.ok('✓')} Wrote ${opts.out}`);
    }
  });

program
  .command('mcp')
  .description(
    'Run a local MCP server over stdio that forwards to Atrium (for agents that only speak stdio)',
  )
  .action(async () => {
    const config = cfg();
    if (!config.token)
      throw new CliError(
        'No token. Run `atrium login --token <token>` first, or set ATRIUM_TOKEN.',
      );
    const transport = new StdioServerTransport(stdin, stdout);
    transport.onmessage = async (message: JSONRPCMessage) => {
      try {
        const res = await fetch(`${config.url}/mcp`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.token}`,
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify(message),
        });
        if (res.status === 202 || res.status === 204) return;
        const text = await res.text();
        if (!text) return;
        const body = JSON.parse(text);
        for (const m of Array.isArray(body) ? body : [body]) await transport.send(m);
      } catch (e) {
        if ('id' in message && message.id !== undefined) {
          await transport.send({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32603,
              message: `Atrium is not reachable at ${config.url}: ${(e as Error).message}`,
            },
          });
        }
      }
    };
    await transport.start();
  });

program
  .command('export')
  .description('Download the model (xlsx, csv, json, archimate)')
  .option('--format <format>', 'xlsx, csv, json or archimate', 'xlsx')
  .option('--type <type>', 'only one element type, e.g. application')
  .option('-o, --out <file>', 'output file')
  .action(async (opts: { format: string; type?: string; out?: string }) => {
    const config = cfg();
    const qs = new URLSearchParams({
      format: opts.format,
      ...(opts.type ? { type: opts.type } : {}),
    });
    const res = await fetch(`${config.url}/api/v1/export?${qs}`, {
      headers: { authorization: `Bearer ${config.token}` },
    });
    if (!res.ok) throw new CliError(`Export failed (HTTP ${res.status}): ${await res.text()}`);
    const name =
      opts.out ??
      /filename="?([^"]+)"?/.exec(res.headers.get('content-disposition') ?? '')?.[1] ??
      `atrium.${opts.format}`;
    writeFileSync(name, Buffer.from(await res.arrayBuffer()));
    console.log(`${c.ok('✓')} Saved ${name}`);
  });

program
  .command('whoami')
  .description('Show which workspace and token you are using')
  .action(async () => {
    const config = cfg();
    const ws = await request<{ name: string; elementCount: number; mode: string }>(
      config,
      '/api/v1/workspace',
    );
    console.log(
      `${c.bold(ws.name)} at ${config.url} · ${ws.elementCount} elements · ${ws.mode} mode`,
    );
  });

program.parseAsync().catch((e) => {
  console.error(
    c.err(e instanceof CliError ? e.message : `Unexpected error: ${(e as Error).message}`),
  );
  process.exitCode = 2;
});
