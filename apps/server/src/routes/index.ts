import type { AnyRoute } from '../http/route';
import type { Deps } from '../services/deps';
import { changeRoutes } from './changes';
import { scenarioRoutes } from './scenarios';
import { viewRoutes } from './views';

/** Route groups beyond the core model and system routes. */
export function allRoutes(deps: Deps): AnyRoute[] {
  return [...viewRoutes(deps), ...changeRoutes(deps), ...scenarioRoutes(deps)];
}
