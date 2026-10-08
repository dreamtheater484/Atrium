import { enumLabel, ROLES, type Role } from '@atrium/schema';
import {
  Avatar,
  Badge,
  Button,
  Card,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Select,
  timeAgo,
  toast,
} from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  Bot,
  Building2,
  Database,
  Download,
  FileUp,
  History,
  KeyRound,
  Link2,
  Package,
  Plus,
  Shield,
  Trash2,
  Upload,
  User,
  Users,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { ElementPicker, type PickedElement } from '../components/element-picker';
import { PacksPanel } from '../components/packs/packs-panel';
import { api, download } from '../lib/api';
import { useElements, useInvalidateModel, useMe, useWorkspace } from '../lib/queries';
import { openImport, ui } from '../lib/store';
import { useTheme } from '../lib/theme';

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  teamIds: string[];
  disabled: boolean;
  sso: boolean;
  hasPassword: boolean;
  lastLoginAt: string | null;
}

interface TokenRow {
  id: string;
  name: string;
  kind: string;
  prefix: string;
  client: string | null;
  canPropose: boolean;
  maxClassification: string;
  userName: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface AuditRow {
  id: number;
  at: string;
  actorKind: string;
  actorName: string;
  action: string;
  targetType: string | null;
  details: Record<string, unknown>;
}

const TABS = [
  { id: 'profile', label: 'Your profile', icon: User },
  { id: 'workspace', label: 'Workspace', icon: Building2 },
  { id: 'people', label: 'People', icon: Users },
  { id: 'agents', label: 'Agents and tokens', icon: Bot },
  { id: 'packs', label: 'Industry packs', icon: Package },
  { id: 'data', label: 'Data and backup', icon: Database },
] as const;

function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function ProfileTab() {
  const me = useMe().data;
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const teams = useElements({ type: 'team', limit: 200 }).data?.items ?? [];
  const [name, setName] = useState(me?.name === 'You' ? '' : (me?.name ?? ''));
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      body.teamIds
        ? api(`/users/${me!.id}`, { method: 'PATCH', body })
        : api('/me', { method: 'PATCH', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Saved');
    },
  });
  if (!me) return null;
  return (
    <div className="flex flex-col gap-4">
      <Section
        title="About you"
        description="Your name appears on changes and comments. Owners are filled in with it automatically."
      >
        <div className="flex max-w-md items-end gap-2">
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="me-name">Name</Label>
            <Input
              id="me-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
            />
          </div>
          <Button variant="primary" onClick={() => save.mutate({ name })} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </Section>
      <Section
        title="Your teams"
        description="Engineers see their team's services on Home and can edit them directly."
      >
        <div className="flex flex-wrap gap-2">
          {teams.map((t) => {
            const on = me.teamIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  save.mutate({
                    teamIds: on ? me.teamIds.filter((x) => x !== t.id) : [...me.teamIds, t.id],
                  })
                }
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-[13px] transition',
                  on
                    ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                    : 'border-border hover:border-border-strong',
                )}
              >
                {t.name}
              </button>
            );
          })}
          {teams.length === 0 && (
            <p className="text-[13px] text-muted-foreground">No teams in the model yet.</p>
          )}
        </div>
      </Section>
      <Section title="Appearance">
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              className={cn(
                'rounded-xl border px-4 py-3 text-[13px] font-medium',
                theme === t
                  ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                  : 'border-border',
              )}
            >
              {t === 'system'
                ? 'Same as system'
                : enumLabel(t) || (t === 'light' ? 'Light' : 'Dark')}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function WorkspaceTab() {
  const ws = useWorkspace().data;
  const qc = useQueryClient();
  const [name, setName] = useState(ws?.name ?? '');
  const save = useMutation({
    mutationFn: () => api('/workspace', { method: 'PATCH', body: { name } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workspace'] });
      toast.success('Saved');
    },
  });
  if (!ws) return null;
  return (
    <div className="flex flex-col gap-4">
      <Section title="Workspace name">
        <div className="flex max-w-md items-end gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <Button variant="primary" onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      </Section>
      <Section title="How Atrium runs here">
        <dl className="grid max-w-xl grid-cols-[180px_1fr] gap-y-2 text-[13px]">
          <dt className="text-muted-foreground">Mode</dt>
          <dd>
            {ws.mode === 'solo'
              ? 'Solo: one person, no sign-in, no reviews'
              : 'Team: accounts, sign-in and reviews'}
          </dd>
          <dt className="text-muted-foreground">Address for agents and CI</dt>
          <dd className="font-mono text-xs">{ws.publicUrl}</dd>
          <dt className="text-muted-foreground">Suggestions</dt>
          <dd>
            {ws.features.ai === 'mock'
              ? 'Built-in rules (works offline)'
              : ws.features.ai === 'live'
                ? 'AI assistant'
                : 'Off'}
          </dd>
          <dt className="text-muted-foreground">End-of-life lookups</dt>
          <dd>
            {ws.features.eolLookup ? 'Live from endoflife.date' : 'Bundled snapshot (offline)'}
          </dd>
          <dt className="text-muted-foreground">Single sign-on</dt>
          <dd>{ws.features.sso ? 'Configured' : 'Not configured'}</dd>
          <dt className="text-muted-foreground">API</dt>
          <dd>
            <a
              className="text-primary hover:underline"
              href="/api/openapi.json"
              target="_blank"
              rel="noreferrer"
            >
              OpenAPI description
            </a>
          </dd>
          <dt className="text-muted-foreground">Version</dt>
          <dd>{ws.version}</dd>
        </dl>
      </Section>
    </div>
  );
}

function PeopleTab() {
  const me = useMe().data;
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<UserRow[]>('/users') });
  const teams = useElements({ type: 'team', limit: 200 }).data?.items ?? [];
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'architect' as Role });
  const [invite, setInvite] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => api<{ inviteUrl: string }>('/users', { body: form }),
    onSuccess: (r) => {
      setInvite(r.inviteUrl);
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }),
  });
  const reinvite = useMutation({
    mutationFn: (id: string) => api<{ inviteUrl: string }>(`/users/${id}/invite`, { body: {} }),
    onSuccess: (r) => setInvite(r.inviteUrl),
  });
  if (me?.mode === 'solo') {
    return (
      <Section title="People" description="Atrium is running in solo mode on this computer.">
        <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          To work with others, run Atrium as a team server: set{' '}
          <code className="rounded bg-surface-2 px-1">ATRIUM_MODE=team</code> and start it on a
          server everyone can reach. Move your model there with Data and backup → Download
          everything, then import the file on the server. See docs/deployment.md.
        </p>
      </Section>
    );
  }
  return (
    <>
      <Section
        title="People"
        description="Roles decide what someone can change. Architects review suggestions; managers and viewers mostly read."
        action={
          <Button
            variant="primary"
            onClick={() => {
              setInvite(null);
              setForm({ name: '', email: '', role: 'architect' });
              setAdding(true);
            }}
          >
            <Plus /> Add person
          </Button>
        }
      >
        <div className="flex flex-col divide-y divide-border">
          {(users.data ?? []).map((u) => (
            <div
              key={u.id}
              className={cn('flex items-center gap-3 py-2.5', u.disabled && 'opacity-50')}
            >
              <Avatar name={u.name} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">
                  {u.name} {u.id === me?.id && <Badge>You</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {u.email} ·{' '}
                  {u.sso
                    ? 'single sign-on'
                    : u.hasPassword
                      ? 'password'
                      : 'invite not accepted yet'}
                  {u.lastLoginAt ? ` · last seen ${timeAgo(u.lastLoginAt)}` : ''}
                </div>
              </div>
              <div className="w-48">
                <ElementPicker
                  types={['team']}
                  value={
                    u.teamIds[0]
                      ? {
                          id: u.teamIds[0],
                          name: teams.find((t) => t.id === u.teamIds[0])?.name ?? 'Team',
                          type: 'team',
                        }
                      : null
                  }
                  onChange={(v: PickedElement | null) =>
                    update.mutate({ id: u.id, body: { teamIds: v ? [v.id] : [] } })
                  }
                  placeholder="No team"
                />
              </div>
              <div className="w-36">
                <Select
                  size="sm"
                  value={u.role}
                  onValueChange={(v) => v && update.mutate({ id: u.id, body: { role: v } })}
                  options={ROLES.map((r) => ({ value: r, label: enumLabel(r) }))}
                  aria-label="Role"
                />
              </div>
              {!u.hasPassword && !u.sso && (
                <Button size="sm" variant="ghost" onClick={() => reinvite.mutate(u.id)}>
                  <Link2 /> Invite link
                </Button>
              )}
              {u.id !== me?.id && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => update.mutate({ id: u.id, body: { disabled: !u.disabled } })}
                >
                  {u.disabled ? 'Enable' : 'Disable'}
                </Button>
              )}
            </div>
          ))}
        </div>
      </Section>
      <Dialog
        open={adding || !!invite}
        onOpenChange={(o) => {
          if (!o) {
            setAdding(false);
            setInvite(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{invite ? 'Share this invite link' : 'Add a person'}</DialogTitle>
            <DialogDescription>
              {invite
                ? 'Send it to them. They choose a password and are signed in. The link works once, for 14 days.'
                : 'They get an invite link. With single sign-on, they can also just sign in.'}
            </DialogDescription>
          </DialogHeader>
          {invite ? (
            <div className="flex gap-2">
              <Input readOnly value={invite} onFocus={(e) => e.target.select()} />
              <Button
                onClick={() => {
                  void navigator.clipboard.writeText(invite);
                  toast.success('Copied');
                }}
              >
                Copy
              </Button>
            </div>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                add.mutate();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="person-name">Name</Label>
                <Input
                  id="person-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="person-email">Email</Label>
                <Input
                  id="person-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Role</Label>
                <Select
                  aria-label="Role"
                  value={form.role}
                  onValueChange={(v) => v && setForm({ ...form, role: v as Role })}
                  options={ROLES.map((r) => ({ value: r, label: enumLabel(r) }))}
                />
              </div>
              <DialogFooter>
                <Button type="submit" variant="primary" disabled={!form.name || !form.email}>
                  Create invite
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

interface WebhookRow {
  id: string;
  url: string;
  secret: string;
  createdAt: string;
  createdBy: string;
  lastDelivery: { at: string; status: number | null; error?: string } | null;
}

/** Tell other tools when the model changes: a signed POST per batch of changes. */
function WebhooksCard() {
  const qc = useQueryClient();
  const hooks = useQuery({ queryKey: ['webhooks'], queryFn: () => api<WebhookRow[]>('/webhooks') });
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['webhooks'] });
  const add = useMutation({
    mutationFn: () => api<WebhookRow>('/webhooks', { body: { url } }),
    onSuccess: (h) => {
      setSecret(h.secret);
      setUrl('');
      void refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const test = useMutation({
    mutationFn: (id: string) =>
      api<{ status: number | null; error?: string }>(`/webhooks/${id}/test`, { body: {} }),
    onSuccess: (r) => {
      void refresh();
      if (r.status && r.status < 300) toast.success(`Delivered (HTTP ${r.status})`);
      else toast.error(r.error ?? `The address answered HTTP ${r.status}`);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => void refresh(),
  });
  return (
    <Section
      title="Webhooks"
      description="Atrium posts a small JSON message to these addresses when the model changes, signed with a secret so you can trust it. Use it to update a CMDB, a wiki or a chat channel."
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Input
          aria-label="Webhook address"
          placeholder="https://example.com/hooks/atrium"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button type="submit" disabled={!url || add.isPending}>
          <Plus /> Add
        </Button>
      </form>
      {secret && (
        <div className="mt-3 rounded-lg border border-watch/40 bg-watch-soft p-3 text-[13px] text-watch-foreground">
          Signing secret (shown once): <code className="font-mono">{secret}</code>. Check the{' '}
          <code className="font-mono">x-atrium-signature</code> header: sha256 HMAC of the body.
        </div>
      )}
      <div className="mt-3 flex flex-col divide-y divide-border">
        {(hooks.data ?? []).map((h) => (
          <div key={h.id} className="flex items-center gap-3 py-2.5 text-[13px]">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{h.url}</div>
              <div className="text-xs text-muted-foreground">
                {h.lastDelivery
                  ? `Last delivery ${timeAgo(h.lastDelivery.at)}: ${h.lastDelivery.status ? `HTTP ${h.lastDelivery.status}` : (h.lastDelivery.error ?? 'failed')}`
                  : `Added by ${h.createdBy} ${timeAgo(h.createdAt)}, nothing sent yet`}
              </div>
            </div>
            <Button size="sm" onClick={() => test.mutate(h.id)} disabled={test.isPending}>
              Send a test
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove ${h.url}`}
              onClick={() => remove.mutate(h.id)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        {hooks.data?.length === 0 && (
          <p className="py-2 text-[13px] text-muted-foreground">No webhooks yet.</p>
        )}
      </div>
    </Section>
  );
}

function AgentsTab() {
  const me = useMe().data;
  const qc = useQueryClient();
  const admin = me?.role === 'admin' || me?.mode === 'solo';
  const tokens = useQuery({
    queryKey: ['tokens', admin],
    queryFn: () => api<TokenRow[]>('/tokens', { query: { all: admin } }),
  });
  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: () => api<AuditRow[]>('/audit', { query: { agentsOnly: true, limit: 100 } }),
    enabled: admin || me?.role === 'architect',
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tokens'] });
      toast.success('Token revoked. It stopped working immediately.');
    },
  });
  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Connections"
        description="Tokens let coding agents, CI pipelines and scripts use Atrium. Each can only see what you allowed, and every use is logged."
        action={
          <Button variant="primary" onClick={() => ui.set({ connectAgentOpen: true })}>
            <Bot /> Connect coding agent
          </Button>
        }
      >
        {(tokens.data ?? []).length === 0 ? (
          <EmptyState icon={<KeyRound />} title="No connections yet">
            Connect Claude Code, Cursor, VS Code or a CI pipeline in under a minute.
          </EmptyState>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {tokens.data!.map((t) => (
              <div
                key={t.id}
                className={cn(
                  'flex items-center gap-3 py-2.5 text-[13px]',
                  t.revokedAt && 'opacity-50',
                )}
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  {t.kind === 'ci' ? <Upload className="size-4" /> : <Bot className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {t.name}{' '}
                    <span className="font-mono text-xs text-muted-foreground">{t.prefix}…</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.canPropose ? 'Can suggest changes' : 'Read only'} · sees up to{' '}
                    {enumLabel(t.maxClassification).toLowerCase()}
                    {t.userName ? ` · created by ${t.userName}` : ''} ·{' '}
                    {t.lastUsedAt ? `used ${timeAgo(t.lastUsedAt)}` : 'never used'}
                    {t.expiresAt && !t.revokedAt
                      ? new Date(t.expiresAt) < new Date()
                        ? ' · expired'
                        : ` · expires ${timeAgo(t.expiresAt)}`
                      : ''}
                  </div>
                </div>
                {t.revokedAt ? (
                  <Badge>Revoked</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-act-foreground"
                    onClick={() => revoke.mutate(t.id)}
                  >
                    <Trash2 /> Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
      {admin && <WebhooksCard />}
      {audit.data && (
        <Section
          title="Agent activity"
          description="What agents and pipelines asked and suggested, newest first."
        >
          <div className="flex max-h-96 flex-col overflow-y-auto font-mono text-[12px]">
            {audit.data.map((a) => (
              <div key={a.id} className="flex gap-3 border-b border-border py-1.5">
                <span className="w-28 shrink-0 text-muted-foreground">{timeAgo(a.at)}</span>
                <span className="w-40 shrink-0 truncate">{a.actorName}</span>
                <span className="text-primary">{a.action}</span>
                <span className="truncate text-muted-foreground">
                  {JSON.stringify(a.details).slice(0, 120)}
                </span>
              </div>
            ))}
            {audit.data.length === 0 && (
              <p className="py-4 text-center font-sans text-[13px] text-muted-foreground">
                No agent activity yet.
              </p>
            )}
          </div>
        </Section>
      )}
      <Section title="Security model">
        <ul className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
          <li className="flex gap-2">
            <Shield className="mt-0.5 size-4 shrink-0 text-good" /> Tokens are stored only as a
            fingerprint, expire, and can be revoked at once.
          </li>
          <li className="flex gap-2">
            <Shield className="mt-0.5 size-4 shrink-0 text-good" /> Each token sees only information
            up to its classification level, enforced twice: in Atrium and by the database (row-level
            security).
          </li>
          <li className="flex gap-2">
            <Shield className="mt-0.5 size-4 shrink-0 text-good" /> Agents never change the model
            directly: suggestions always go to a person for review.
          </li>
          <li className="flex gap-2">
            <Shield className="mt-0.5 size-4 shrink-0 text-good" /> Everything returned to agents is
            marked as data, so text in descriptions can't pass as instructions.
          </li>
          <li className="flex gap-2">
            <Shield className="mt-0.5 size-4 shrink-0 text-good" /> Every request is logged with the
            token that made it, and each token has a rate limit.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function DataTab() {
  const me = useMe().data;
  const ws = useWorkspace().data;
  const invalidate = useInvalidateModel();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const reset = useMutation({
    mutationFn: () => api('/onboarding/reset', { body: { confirm: 'DELETE' } }),
    onSuccess: () => {
      invalidate();
      setConfirm(false);
      navigate({ to: '/' });
      toast.success('The workspace is empty');
    },
  });
  const sample = useMutation({
    mutationFn: () => api('/onboarding/sample', { method: 'POST' }),
    onSuccess: () => {
      invalidate();
      toast.success('Sample loaded');
    },
  });
  const restore = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file, file.name);
      return api<{ elements: number }>('/bundle/restore', { body: form });
    },
    onSuccess: (r) => {
      invalidate();
      toast.success(`Restored ${r.elements} elements`);
    },
  });
  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Download everything"
        description="One file with the whole model, scenarios, suggestions and history. Use it as a backup, or to move from your laptop to a team server."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() => void download('/bundle', {}, 'atrium-backup.json')}
          >
            <Download /> Download backup
          </Button>
          <Button onClick={() => void download('/export', { format: 'xlsx' }, 'atrium.xlsx')}>
            Excel
          </Button>
          <Button onClick={() => void download('/export', { format: 'archimate' }, 'atrium.xml')}>
            ArchiMate
          </Button>
        </div>
      </Section>
      <Section
        title="Bring data in"
        description="Restore a backup into this workspace, or import spreadsheets and models."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={restore.isPending || ws?.hasData}
          >
            <Upload /> Restore a backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) restore.mutate(f);
              e.target.value = '';
            }}
          />
          <Button onClick={() => openImport()}>
            <FileUp /> Import a file
          </Button>
          {!ws?.hasData && (
            <Button onClick={() => sample.mutate()}>
              <History /> Load the Acme Telco sample
            </Button>
          )}
        </div>
        {ws?.hasData && (
          <p className="mt-2 text-xs text-muted-foreground">
            Restoring a backup needs an empty workspace.
          </p>
        )}
      </Section>
      {(me?.role === 'admin' || me?.mode === 'solo') && (
        <Section
          title="Start over"
          description="Removes every element, link, scenario and change. People and tokens stay. This can't be undone, so download a backup first."
        >
          <Button variant="danger" onClick={() => setConfirm(true)}>
            <Trash2 /> Clear the workspace
          </Button>
        </Section>
      )}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear the whole workspace?</DialogTitle>
            <DialogDescription>
              Type DELETE to confirm. This permanently removes all model data.
            </DialogDescription>
          </DialogHeader>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={typed !== 'DELETE' || reset.isPending}
              onClick={() => reset.mutate()}
            >
              Clear everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SettingsPage() {
  const { tab } = useSearch({ from: '/settings' }) as { tab?: string };
  const navigate = useNavigate({ from: '/settings' });
  const current = TABS.find((t) => t.id === tab)?.id ?? 'profile';
  return (
    <div className="mx-auto flex max-w-[1100px] gap-8 px-6 py-7">
      <nav className="flex w-52 shrink-0 flex-col gap-0.5" aria-label="Settings">
        <h1 className="mb-3 px-2 text-xl font-semibold tracking-tight">Settings</h1>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => navigate({ search: { tab: t.id } })}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors',
              current === t.id
                ? 'bg-primary-soft text-primary-soft-foreground'
                : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
            )}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {current === 'profile' && <ProfileTab />}
        {current === 'workspace' && <WorkspaceTab />}
        {current === 'people' && <PeopleTab />}
        {current === 'agents' && <AgentsTab />}
        {current === 'packs' && <PacksPanel />}
        {current === 'data' && <DataTab />}
      </div>
    </div>
  );
}
