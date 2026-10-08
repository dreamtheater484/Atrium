import type {
  Classification,
  ElementType,
  LifecycleDates,
  LifecyclePhase,
  RelationType,
  Role,
} from '@atrium/schema';

/**
 * Seed datasets refer to elements by a short `ref` (unique within the dataset).
 * The server turns refs into ids when loading.
 */
export interface SeedElement {
  ref: string;
  type: ElementType;
  name: string;
  key?: string;
  description?: string;
  /** ref of a domain element */
  domain?: string;
  /** ref of the parent element (same type, hierarchical types only) */
  parent?: string;
  owner?: string;
  lifecycle?: LifecyclePhase;
  lifecycleDates?: LifecycleDates;
  classification?: Classification;
  attributes?: Record<string, unknown>;
  tags?: string[];
  externalIds?: Record<string, string>;
}

export interface SeedRelation {
  type: RelationType;
  /** ref of the source element */
  from: string;
  /** ref of the target element */
  to: string;
  attributes?: Record<string, unknown>;
}

export type SeedChange =
  | { op: 'create'; element: SeedElement }
  | { op: 'update'; ref: string; set: Partial<Omit<SeedElement, 'ref' | 'type'>> }
  | { op: 'delete'; ref: string }
  | { op: 'relate'; relation: SeedRelation }
  | { op: 'unrelate'; relation: SeedRelation };

export interface SeedScenario {
  name: string;
  description: string;
  isTarget: boolean;
  targetDate: string;
  changes: SeedChange[];
}

export interface SeedUser {
  name: string;
  email: string;
  role: Role;
  /** refs of team elements */
  teams: string[];
}

export interface SeedSuggestion {
  title: string;
  description: string;
  authorName: string;
  authorKind: 'user' | 'agent' | 'ci';
  changes: SeedChange[];
}

export interface SeedDataset {
  id: string;
  name: string;
  description: string;
  elements: SeedElement[];
  relations: SeedRelation[];
  scenarios: SeedScenario[];
  users: SeedUser[];
  suggestions: SeedSuggestion[];
}
