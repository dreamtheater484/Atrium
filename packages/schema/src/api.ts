import type { Changeset, Scenario } from './changes';
import type { Element, Relation } from './element';
import type { ElementType, Health, Role } from './enums';
import type { RelationType } from './metamodel';

export interface Page<T> {
  items: T[];
  total: number;
}

export interface ElementSummary {
  id: string;
  type: ElementType;
  name: string;
  key: string | null;
  layer: 'org' | 'reference';
  health: Health | null;
  lifecycle: Element['lifecycle'];
}

export interface RelationView extends Relation {
  /** The element at the other end, from the perspective of the requested element. */
  other: ElementSummary;
  direction: 'out' | 'in';
}

export interface ElementDetail extends Element {
  domainName: string | null;
  parentName: string | null;
  relations: RelationView[];
  children: ElementSummary[];
  missing: Array<{ field: string; label: string; kind: string }>;
  canEditDirectly: boolean;
  /** Present when the element only exists, or differs, in the selected scenario. */
  scenarioMark?: 'added' | 'changed' | 'removed';
  pendingSuggestions: number;
}

export interface SearchHit {
  id: string;
  type: ElementType;
  name: string;
  key: string | null;
  domainName: string | null;
  snippet: string;
  layer: 'org' | 'reference';
  score: number;
}

export interface AskAnswer {
  /** What Atrium understood the question to be. */
  interpretation: string;
  answer: string;
  elements: ElementSummary[];
  /** Suggested follow-up navigation in the app. */
  link?: { label: string; to: string };
  engine: 'rules' | 'ai';
}

export interface ImpactNode {
  element: ElementSummary;
  depth: number;
  via: RelationType;
  /** Element that leads here. */
  fromId: string;
}

export interface ImpactResult {
  root: ElementSummary;
  nodes: ImpactNode[];
  summary: string;
}

export interface GraphNode {
  id: string;
  type: ElementType;
  name: string;
  health: Health | null;
  lifecycle: Element['lifecycle'];
  domainName: string | null;
  layer: 'org' | 'reference';
  mark?: 'added' | 'changed' | 'removed';
  attributes: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  type: RelationType;
  source: string;
  target: string;
  label: string;
  mark?: 'added' | 'changed' | 'removed';
  /** How many links an aggregated edge stands for. */
  weight?: number;
  /** Links run in both directions. */
  twoWay?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Draw nodes inside one box per domain. */
  grouped?: boolean;
  /** A short explanation of what is left out. */
  note?: string;
}

export type MapOverlay =
  | 'health'
  | 'cost'
  | 'lifecycle'
  | 'coverage'
  | 'time'
  | 'importance'
  | 'quality'
  | 'none';

export interface CapabilityCell {
  id: string;
  name: string;
  level: number;
  parentId: string | null;
  domainName: string | null;
  importance: string | null;
  apps: Array<{
    id: string;
    name: string;
    health: Health | null;
    time: string | null;
    lifecycle: Element['lifecycle'];
    cost: number;
  }>;
  cost: number;
  health: Health | null;
  quality: number;
  mark?: 'added' | 'changed' | 'removed';
  children: CapabilityCell[];
}

export interface CapabilityMapData {
  roots: CapabilityCell[];
  totals: { capabilities: number; applications: number; cost: number };
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  teamIds: string[];
  mode: 'solo' | 'team';
  theme: 'light' | 'dark' | 'system';
  onboarded: boolean;
}

export interface WorkspaceInfo {
  name: string;
  /** Where agents and the CLI reach this Atrium (the server, not the dev UI). */
  publicUrl: string;
  mode: 'solo' | 'team';
  version: string;
  elementCount: number;
  hasData: boolean;
  scenarios: Scenario[];
  features: { ai: 'mock' | 'live' | 'off'; eolLookup: boolean; sso: boolean };
}

export interface ChangesetDetail extends Changeset {
  changes: Array<{
    id: string;
    op: 'create' | 'update' | 'delete';
    entity: 'element' | 'relation';
    entityId: string;
    name: string;
    type: string;
    fields: Array<{ field: string; label: string; before: unknown; after: unknown }>;
  }>;
  canReview: boolean;
}

/** A row in the Explore table. */
export interface ElementRow extends Element {
  domainName: string | null;
  parentName: string | null;
  level: number;
  teamNames: string[];
  capabilityNames: string[];
  relationCount: number;
  mark?: 'added' | 'changed' | 'removed';
}

export interface SuggestedRelation {
  relation: RelationType;
  targetType: ElementType;
  matches: Array<{ id: string; name: string; confidence: number; reason: string }>;
}

export interface EditResponse {
  element: Element | null;
  mode: 'direct' | 'suggestion' | 'scenario';
  changesetId: string;
}
