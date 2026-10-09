import type { AnyRoute } from '../http/route';
import type { Deps } from '../services/deps';
import { agentRoutes } from './agents';
import { authRoutes } from './auth';
import { changeRoutes } from './changes';
import { dashboardRoutes } from './dashboards';
import { exportRoutes } from './export';
import { importRoutes } from './import';
import { packRoutes } from './packs';
import { peopleRoutes } from './people';
import { researchRoutes } from './research';
import { scenarioRoutes } from './scenarios';
import { viewRoutes } from './views';
import { webhookRoutes } from './webhooks';

/** Route groups beyond the core model and system routes. */
export function allRoutes(deps: Deps): AnyRoute[] {
  return [
    ...viewRoutes(deps),
    ...changeRoutes(deps),
    ...scenarioRoutes(deps),
    ...dashboardRoutes(deps),
    ...authRoutes(deps),
    ...peopleRoutes(deps),
    ...agentRoutes(deps),
    ...importRoutes(deps),
    ...packRoutes(deps),
    ...exportRoutes(deps),
    ...webhookRoutes(deps),
    ...researchRoutes(deps),
  ];
}
