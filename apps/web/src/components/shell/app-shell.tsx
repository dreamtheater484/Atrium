import {
  Avatar,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  Tooltip,
} from '@atrium/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  Bot,
  CalendarRange,
  ChartColumn,
  ChevronsLeft,
  ChevronsRight,
  Compass,
  GitPullRequestArrow,
  House,
  LogOut,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { api } from '../../lib/api';
import { useChangesSummary } from '../../lib/changes';
import { presence } from '../../lib/live';
import { useMe, useWorkspace } from '../../lib/queries';
import { ui, useUi } from '../../lib/store';
import { useTheme } from '../../lib/theme';
import { ConnectAgentDialog } from '../agents/connect-agent-dialog';
import { ImportWizard } from '../import/import-wizard';
import { Inspector } from '../inspector';
import { AddDialog } from './add-dialog';
import { AddMenu } from './add-menu';
import { CommandPalette } from './command-palette';
import { GlobalDropZone } from './drop-zone';
import { Logo } from './logo';
import { ScenarioBanner, StateSwitch } from './state-switch';

const NAV = [
  { to: '/', label: 'Home', icon: House, exact: true },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/dashboards', label: 'Dashboards', icon: ChartColumn },
  { to: '/roadmap', label: 'Roadmap', icon: CalendarRange },
  { to: '/changes', label: 'Changes', icon: GitPullRequestArrow },
] as const;

function Sidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const me = useMe().data;
  const ws = useWorkspace().data;
  const { theme, setTheme } = useTheme();
  const summary = useChangesSummary();
  const navigate = useNavigate();
  const reviews = summary.data?.waitingForReview ?? 0;

  return (
    <aside
      className={cn(
        'no-print flex shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200',
        collapsed ? 'w-[60px]' : 'w-[216px]',
      )}
    >
      <div className={cn('flex h-14 items-center', collapsed ? 'justify-center' : 'px-4')}>
        <Link to="/" aria-label="Atrium home">
          <Logo collapsed={collapsed} />
        </Link>
      </div>
      <nav className="flex flex-col gap-0.5 px-2 pt-2" aria-label="Main">
        {NAV.map((item) => (
          <Tooltip key={item.to} content={collapsed ? item.label : null} side="right">
            <Link
              to={item.to}
              activeOptions={{ exact: 'exact' in item }}
              className={cn(
                'group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground',
                collapsed && 'justify-center px-0',
              )}
              activeProps={{ className: '!bg-primary-soft !text-primary-soft-foreground' }}
            >
              <item.icon className="size-[18px] shrink-0" strokeWidth={2} />
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {!collapsed && item.to === '/changes' && reviews > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground tabular">
                  {reviews}
                </span>
              )}
            </Link>
          </Tooltip>
        ))}
      </nav>
      <div className="flex-1" />
      <div className="flex flex-col gap-1 border-t border-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-surface-2',
                collapsed && 'justify-center',
              )}
            >
              <Avatar name={me?.name ?? 'You'} />
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">
                    {me?.name ?? 'You'}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {ws?.name ?? 'Atrium'}
                  </span>
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-60">
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as never)}>
              <DropdownMenuRadioItem value="light">
                <Sun className="size-4 text-muted-foreground" /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="size-4 text-muted-foreground" /> Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor className="size-4 text-muted-foreground" /> Same as system
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => ui.set({ connectAgentOpen: true })}>
              <Bot /> Connect coding agent
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate({ to: '/settings' })}>
              <Settings /> Settings
            </DropdownMenuItem>
            {me?.mode === 'team' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={async () => {
                    await fetch('/api/auth/logout', {
                      method: 'POST',
                      headers: { 'x-atrium-csrf': '1' },
                    });
                    window.location.assign('/');
                  }}
                >
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'w-full justify-start text-muted-foreground',
            collapsed && 'justify-center',
          )}
          onClick={() => ui.set({ sidebarCollapsed: !collapsed })}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
          {!collapsed && 'Collapse'}
        </Button>
      </div>
    </aside>
  );
}

function PresenceAvatars() {
  const people = presence.useStore((s) => s.people);
  const me = useMe().data;
  const others = people.filter((p) => p.userId !== me?.id);
  if (!others.length) return null;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a row of avatars, not a form group
    <div className="flex items-center -space-x-1.5" role="group" aria-label="People online">
      {others.slice(0, 4).map((p) => (
        <Tooltip key={p.userId} content={`${p.name} is online`}>
          <span>
            <Avatar name={p.name} size="md" />
          </span>
        </Tooltip>
      ))}
      {others.length > 4 && (
        <span className="pl-2 text-xs text-muted-foreground">+{others.length - 4}</span>
      )}
    </div>
  );
}

function TopBar() {
  return (
    <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur">
      <StateSwitch />
      <div className="flex flex-1 justify-center">
        <button
          type="button"
          onClick={() => ui.set({ commandOpen: true })}
          className="flex h-9 w-full max-w-[440px] items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-3 text-[13px] text-subtle-foreground transition hover:border-border-strong hover:bg-surface-2"
        >
          <Search className="size-4" />
          <span className="flex-1 truncate text-left">Search or ask a question…</span>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </button>
      </div>
      <PresenceAvatars />
      <AddMenu />
    </header>
  );
}

function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.set({ commandOpen: !ui.get().commandOpen });
      } else if (!typing && e.key === '/') {
        e.preventDefault();
        ui.set({ commandOpen: true });
      } else if (!typing && e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        ui.set({ addOpen: true, addType: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function AppShell({ children }: { children: ReactNode }) {
  useGlobalShortcuts();
  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <ScenarioBanner />
        <main id="main" className="min-h-0 flex-1 overflow-auto">
          {children}
        </main>
      </div>
      <Inspector />
      <CommandPalette />
      <AddDialog />
      <ImportWizard />
      <ConnectAgentDialog />
      <GlobalDropZone />
    </div>
  );
}

export async function signOut() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
}
