import { Button, Card, Input, Label } from '@atrium/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { LogoMark } from '../components/shell/logo';
import { ApiError } from '../lib/api';

interface AuthInfo {
  mode: 'solo' | 'team';
  workspaceName: string;
  sso: { label: string } | null;
  needsSetup: boolean;
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-atrium-csrf': '1' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new ApiError(res.status, data.message ?? 'Something went wrong', data.error ?? 'error');
  return data;
}

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>
      <Card className="relative w-full max-w-sm p-7">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <LogoMark className="size-11" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {children}
      </Card>
    </div>
  );
}

/** Team mode sign-in, first-run admin setup, and invite acceptance. */
export function LoginPage() {
  const info = useQuery({
    queryKey: ['auth-info'],
    queryFn: () => fetch('/api/auth/info').then((r) => r.json() as Promise<AuthInfo>),
  });
  const inviteToken = location.pathname.startsWith('/invite/') ? location.pathname.slice(8) : null;
  const invite = useQuery({
    queryKey: ['invite', inviteToken],
    queryFn: async () => {
      const r = await fetch(`/api/auth/invite/${inviteToken}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      return d as { name: string; email: string };
    },
    enabled: !!inviteToken,
    retry: false,
  });
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const done = () => window.location.assign('/');
  const login = useMutation({
    mutationFn: () => post('/api/auth/login', { email: form.email, password: form.password }),
    onSuccess: done,
  });
  const setup = useMutation({ mutationFn: () => post('/api/auth/setup', form), onSuccess: done });
  const accept = useMutation({
    mutationFn: () => post(`/api/auth/invite/${inviteToken}`, { password: form.password }),
    onSuccess: done,
  });
  const error = (login.error ?? setup.error ?? accept.error) as Error | null;

  if (!info.data) return <Shell title="Atrium">{null}</Shell>;

  if (inviteToken) {
    return (
      <Shell
        title={invite.data ? `Welcome, ${invite.data.name.split(' ')[0]}` : 'Invite'}
        subtitle={
          invite.data
            ? `Choose a password for ${invite.data.email}`
            : (invite.error as Error | null)?.message
        }
      >
        {invite.data && (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              accept.mutate();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="pw">New password</Label>
              <Input
                id="pw"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoFocus
              />
              <span className="text-xs text-muted-foreground">At least 10 characters.</span>
            </div>
            {error && <p className="text-[13px] text-act-foreground">{error.message}</p>}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={form.password.length < 10 || accept.isPending}
            >
              Start using Atrium
            </Button>
          </form>
        )}
      </Shell>
    );
  }

  if (info.data.needsSetup) {
    return (
      <Shell
        title="Set up Atrium"
        subtitle="Create the first admin account. You can invite your colleagues next."
      >
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setup.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pw">Password</Label>
            <Input
              id="pw"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <span className="text-xs text-muted-foreground">At least 10 characters.</span>
          </div>
          {error && <p className="text-[13px] text-act-foreground">{error.message}</p>}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={!form.name || !form.email || form.password.length < 10 || setup.isPending}
          >
            Create admin account
          </Button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell title={`Sign in to ${info.data.workspaceName}`}>
      <div className="grid gap-3">
        {info.data.sso && (
          <>
            <Button asChild variant="primary" size="lg">
              <a href="/api/auth/oidc/start">
                <KeyRound /> Continue with {info.data.sso.label}
              </a>
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or{' '}
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoFocus={!info.data.sso}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pw">Password</Label>
            <Input
              id="pw"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          {error && <p className="text-[13px] text-act-foreground">{error.message}</p>}
          <Button
            type="submit"
            variant={info.data.sso ? 'secondary' : 'primary'}
            size="lg"
            disabled={!form.email || !form.password || login.isPending}
          >
            Sign in
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          Forgot your password? Ask an admin for a new invite link.
        </p>
      </div>
    </Shell>
  );
}
