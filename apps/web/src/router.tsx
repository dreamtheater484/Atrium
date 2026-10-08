import { ELEMENT_TYPES, type ElementType, type MapOverlay } from '@atrium/schema';
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router';
import { RootLayout } from './components/shell/root-layout';

import { NotFoundPage } from './pages/not-found';

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

export type ExploreView = 'table' | 'map' | 'graph' | 'landscape' | 'radar';

export interface ExploreSearch {
  type?: ElementType;
  view?: ExploreView;
  q?: string;
  overlay?: MapOverlay;
  domain?: string;
  focus?: string;
  /** Graph mode to open with, e.g. impact when coming from "Impact". */
  mode?: 'impact';
  gaps?: boolean;
  health?: string;
  layer?: 'org' | 'reference';
}

const rootRoute = createRootRoute({ component: RootLayout, notFoundComponent: NotFoundPage });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./pages/home'), 'HomePage'),
});

const exploreRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explore',
  validateSearch: (s: Record<string, unknown>): ExploreSearch => ({
    type: ELEMENT_TYPES.includes(s.type as ElementType) ? (s.type as ElementType) : undefined,
    view: ['table', 'map', 'graph', 'landscape', 'radar'].includes(s.view as string)
      ? (s.view as ExploreView)
      : undefined,
    q: str(s.q),
    overlay: str(s.overlay) as MapOverlay | undefined,
    domain: str(s.domain),
    focus: str(s.focus),
    mode: s.mode === 'impact' ? 'impact' : undefined,
    gaps: s.gaps === true || s.gaps === 'true' ? true : undefined,
    health: str(s.health),
    layer: s.layer === 'reference' ? 'reference' : undefined,
  }),
  component: lazyRouteComponent(() => import('./pages/explore'), 'ExplorePage'),
});

const elementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/e/$id',
  component: lazyRouteComponent(() => import('./pages/element'), 'ElementPage'),
});

const dashboardsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboards',
  validateSearch: (s: Record<string, unknown>): { id?: string } => ({ id: str(s.id) }),
  component: lazyRouteComponent(() => import('./pages/dashboards'), 'DashboardsPage'),
});

const roadmapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/roadmap',
  component: lazyRouteComponent(() => import('./pages/roadmap'), 'RoadmapPage'),
});

const changesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/changes',
  validateSearch: (s: Record<string, unknown>): { id?: string; tab?: string } => ({
    id: str(s.id),
    tab: str(s.tab),
  }),
  component: lazyRouteComponent(() => import('./pages/changes'), 'ChangesPage'),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  validateSearch: (s: Record<string, unknown>): { tab?: string } => ({ tab: str(s.tab) }),
  component: lazyRouteComponent(() => import('./pages/settings'), 'SettingsPage'),
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  exploreRoute,
  elementRoute,
  dashboardsRoute,
  roadmapRoute,
  changesRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
