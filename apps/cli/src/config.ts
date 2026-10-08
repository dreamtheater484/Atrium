import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface CliConfig {
  url: string;
  token: string | null;
}

export const CONFIG_FILE = join(homedir(), '.atrium', 'config.json');

/** URL and token from flags, then environment (CI), then ~/.atrium/config.json. */
export function loadConfig(flags: { url?: string; token?: string } = {}): CliConfig {
  let file: Partial<CliConfig> = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      file = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    } catch {
      // ignore a broken file
    }
  }
  return {
    url: (flags.url ?? process.env.ATRIUM_URL ?? file.url ?? 'http://localhost:7300').replace(
      /\/$/,
      '',
    ),
    token: flags.token ?? process.env.ATRIUM_TOKEN ?? file.token ?? null,
  };
}

export function saveConfig(cfg: CliConfig) {
  mkdirSync(dirname(CONFIG_FILE), { recursive: true });
  writeFileSync(CONFIG_FILE, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(CONFIG_FILE, 0o600);
  } catch {
    // Windows: ACLs apply instead
  }
}
