import { CLASSIFICATIONS, enumLabel } from '@atrium/schema';
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  Switch,
} from '@atrium/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, Copy, GitBranch, KeyRound, ShieldCheck, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useWorkspace } from '../../lib/queries';
import { ui, useUi } from '../../lib/store';

type Client = 'claude-code' | 'cursor' | 'vscode' | 'other' | 'ci';

const CLIENTS: Array<{ id: Client; label: string; hint: string; icon: React.ReactNode }> = [
  { id: 'claude-code', label: 'Claude Code', hint: 'One command', icon: <Bot /> },
  { id: 'cursor', label: 'Cursor', hint: 'Config file', icon: <Bot /> },
  { id: 'vscode', label: 'VS Code / Copilot', hint: 'Config file', icon: <Bot /> },
  { id: 'other', label: 'Other agent', hint: 'HTTP or stdio', icon: <Terminal /> },
  { id: 'ci', label: 'CI pipeline', hint: 'atrium sync', icon: <GitBranch /> },
];

function snippets(
  client: Client,
  url: string,
  token: string,
): Array<{ title: string; code: string; note?: string }> {
  const mcp = `${url}/mcp`;
  switch (client) {
    case 'claude-code':
      return [
        {
          title: 'Run this in your terminal',
          code: `claude mcp add --transport http atrium ${mcp} --header "Authorization: Bearer ${token}"`,
          note: 'Claude Code keeps it in your personal settings, out of the repository.',
        },
        {
          title: 'Then ask, for example',
          code: 'Use Atrium to get the service context for this repo and check my changes against our standards.',
        },
      ];
    case 'cursor':
      return [
        {
          title: 'Add to ~/.cursor/mcp.json (your user settings, not the project)',
          code: JSON.stringify(
            { mcpServers: { atrium: { url: mcp, headers: { Authorization: `Bearer ${token}` } } } },
            null,
            2,
          ),
        },
      ];
    case 'vscode':
      return [
        {
          title: 'Add to .vscode/mcp.json (VS Code asks for the token once and stores it securely)',
          code: JSON.stringify(
            {
              inputs: [
                {
                  type: 'promptString',
                  id: 'atrium-token',
                  description: 'Atrium token',
                  password: true,
                },
              ],
              servers: {
                atrium: {
                  type: 'http',
                  url: mcp,
                  // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code prompts for this input
                  headers: { Authorization: 'Bearer ${input:atrium-token}' },
                },
              },
            },
            null,
            2,
          ),
          note: 'Paste this token when VS Code asks: ' + token,
        },
      ];
    case 'other':
      return [
        {
          title: 'HTTP (Streamable HTTP MCP)',
          code: `URL:    ${mcp}\nHeader: Authorization: Bearer ${token}`,
        },
        {
          title: 'Or stdio, through the Atrium command line (needs Node.js 22 or later)',
          code: `curl -fsSL ${url}/cli/atrium.mjs -o atrium.mjs\nnode atrium.mjs login --url ${url} --token ${token}`,
          note: 'Then configure your agent to start the command: node /path/to/atrium.mjs mcp',
        },
      ];
    case 'ci':
      return [
        { title: '1. Save the token as a CI secret named ATRIUM_TOKEN', code: token },
        {
          title: '2. Add a step to your pipeline (GitHub Actions example)',
          code: `- name: Get the Atrium CLI
  run: curl -fsSL ${url}/cli/atrium.mjs -o atrium.mjs
- name: Check architecture standards
  run: node atrium.mjs check
  env: { ATRIUM_URL: ${url}, ATRIUM_TOKEN: \${{ secrets.ATRIUM_TOKEN }} }
- name: Sync atrium.yaml
  if: github.ref == 'refs/heads/main'
  run: node atrium.mjs sync
  env: { ATRIUM_URL: ${url}, ATRIUM_TOKEN: \${{ secrets.ATRIUM_TOKEN }} }`,
          note: 'Create atrium.yaml first: run `node atrium.mjs init` in the repository.',
        },
      ];
  }
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative">
      <pre className="max-h-56 overflow-auto rounded-xl bg-[oklch(0.2_0.015_262)] p-3 pr-12 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all text-[oklch(0.92_0.01_262)]">
        {code}
      </pre>
      <Button
        size="icon-sm"
        variant="ghost"
        className="absolute top-2 right-2 bg-white/10 text-white hover:bg-white/20"
        aria-label="Copy"
        onClick={() => {
          void navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

/** Journey J7: connect a coding agent in under a minute, safely scoped. */
export function ConnectAgentDialog() {
  const open = useUi((s) => s.connectAgentOpen);
  const ws = useWorkspace().data;
  const qc = useQueryClient();
  const [client, setClient] = useState<Client>('claude-code');
  const [canPropose, setCanPropose] = useState(true);
  const [maxClassification, setMax] = useState('internal');
  const [token, setToken] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api<{ token: string }>('/tokens', {
        body: {
          name: CLIENTS.find((c) => c.id === client)!.label,
          kind: client === 'ci' ? 'ci' : 'agent',
          client,
          canPropose,
          maxClassification,
          expiresInDays: client === 'ci' ? 365 : 90,
        },
      }),
    onSuccess: (r) => {
      setToken(r.token);
      void qc.invalidateQueries({ queryKey: ['tokens'] });
    },
  });
  useEffect(() => {
    if (!open) {
      setToken(null);
      setClient('claude-code');
    }
  }, [open]);
  const url = ws?.publicUrl ?? location.origin;

  return (
    <Dialog open={open} onOpenChange={(o) => ui.set({ connectAgentOpen: o })}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect a coding agent</DialogTitle>
          <DialogDescription>
            Your agent reads service context, dependencies and standards while it codes, and can
            suggest updates for an architect to approve.
          </DialogDescription>
        </DialogHeader>
        {!token ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-5 gap-2">
              {CLIENTS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setClient(c.id);
                    setCanPropose(true);
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition [&_svg]:size-5',
                    client === c.id
                      ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                      : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
                  )}
                >
                  {c.icon}
                  <span className="text-xs font-semibold">{c.label}</span>
                  <span className="text-[10px] opacity-75">{c.hint}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-3 rounded-xl bg-surface-2 p-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <ShieldCheck className="size-4 text-good" /> What it may do
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label>Can read information up to</Label>
                  <Select
                    size="sm"
                    value={maxClassification}
                    onValueChange={(v) => v && setMax(v)}
                    options={CLASSIFICATIONS.filter((c) => c !== 'restricted').map((c) => ({
                      value: c,
                      label: enumLabel(c),
                    }))}
                    aria-label="Classification"
                  />
                </div>
                <label className="flex items-center gap-2 self-end pb-1 text-[13px]">
                  <Switch checked={canPropose} onCheckedChange={setCanPropose} />{' '}
                  {client === 'ci' ? 'Can sync atrium.yaml' : 'Can suggest changes'}
                </label>
              </div>
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                <li>
                  · Read access by default. Suggestions always go to a person for review: nothing
                  changes on its own.
                </li>
                <li>
                  · Every request is logged, and you can revoke the token at any time in Settings →
                  Agents and tokens.
                </li>
                <li>
                  · Expires after {client === 'ci' ? 'a year' : '90 days'}. Content from Atrium is
                  marked as data, not instructions.
                </li>
              </ul>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>
                <KeyRound /> Create connection
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 rounded-lg bg-good-soft px-3 py-2 text-[13px] text-good-foreground">
              <Check className="size-4" /> Connection created. The token is shown only now; Atrium
              keeps just a fingerprint of it.
            </div>
            {snippets(client, url, token).map((s) => (
              <div key={s.title} className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">{s.title}</span>
                <CodeBlock code={s.code} />
                {s.note && <span className="text-xs text-muted-foreground">{s.note}</span>}
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Badge tone="outline">
                Tools: get_service_context, check_against_standards, find_dependencies, impact_of,
                propose_change and more
              </Badge>
              <Button onClick={() => ui.set({ connectAgentOpen: false })}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
