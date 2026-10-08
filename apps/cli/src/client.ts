import type { CliConfig } from './config';

export class CliError extends Error {}

export async function request<T>(
  cfg: CliConfig,
  path: string,
  init: { method?: string; body?: unknown; accept?: string } = {},
): Promise<T> {
  if (!cfg.token) {
    throw new CliError(
      'No token. Create one in Atrium (profile menu → Connect coding agent, or Settings → Agents and tokens), then run `atrium login --token <token>` or set ATRIUM_TOKEN.',
    );
  }
  let res: Response;
  try {
    res = await fetch(`${cfg.url}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: {
        authorization: `Bearer ${cfg.token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.accept ? { accept: init.accept } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new CliError(
      `Can't reach Atrium at ${cfg.url}. Check the URL (--url or ATRIUM_URL) and that the server is running.`,
    );
  }
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = JSON.parse(text).message ?? text;
    } catch {
      // plain text
    }
    throw new CliError(`${message} (HTTP ${res.status})`);
  }
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? JSON.parse(text) : text) as T;
}
