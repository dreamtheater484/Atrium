import type { Sql } from '@atrium/db';
import type { Config } from '../config';
import type { AiProvider } from './ai';
import type { EolService } from './eol';
import type { RealtimeHub } from './realtime';
import type { ModelStore } from './store';

/** Shared services handed to routes and background work. */
export interface Deps {
  config: Config;
  sql: Sql;
  store: ModelStore;
  hub: RealtimeHub;
  eol: EolService;
  ai: AiProvider;
  /** Called when a person's profile changes (solo mode caches the user). */
  onUserChanged?: () => void;
}
