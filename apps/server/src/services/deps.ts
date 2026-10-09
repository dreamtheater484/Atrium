import type { Sql } from '@atrium/db';
import type { Config } from '../config';
import type { AiProvider } from './ai';
import type { EolService } from './eol';
import type { RealtimeHub } from './realtime';
import type { LifecycleResearcher } from './researchers';
import type { ModelStore } from './store';

/** Shared services handed to routes and background work. */
export interface Deps {
  config: Config;
  sql: Sql;
  store: ModelStore;
  hub: RealtimeHub;
  eol: EolService;
  ai: AiProvider;
  /** Finds end-of-support dates on the web (or only endoflife.date without an AI provider). */
  research: LifecycleResearcher;
  /** Called when a person's profile changes (solo mode caches the user). */
  onUserChanged?: () => void;
}
