import { Outlet } from '@tanstack/react-router';
import { ApiError } from '../../lib/api';
import { useLive } from '../../lib/live';
import { useMe, useWorkspace } from '../../lib/queries';
import { LoginPage } from '../../pages/login';
import { LogoMark } from './logo';
import { AppShell } from './app-shell';

export function RootLayout() {
  const me = useMe();
  const ws = useWorkspace();
  const signedIn = !!me.data;
  useLive(signedIn, me.data?.name);

  const needsLogin = me.error instanceof ApiError && me.error.status === 401;
  if (needsLogin) return <LoginPage />;

  if (me.isLoading || ws.isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <LogoMark className="size-10 animate-pulse" />
      </div>
    );
  }

  if (me.isError || ws.isError) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 text-center">
        <LogoMark className="size-10" />
        <h1 className="text-base font-semibold">Atrium can't reach its server</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Check that the server is running, then reload this page.</p>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
