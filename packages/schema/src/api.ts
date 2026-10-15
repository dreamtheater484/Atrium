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
  /** Applications: own cost plus shares of the contracts that cover them. */
  cost?: CostBreakdown;
  /** Contracts: how the cost is shared out. */
  split?: { applications: number; share: number };
}

export interface CostBreakdown {
  own: number | null;
  shares: Array<{ contractId: string; name: string; amount: number; estimate: boolean }>;
  total: number;
  known: boolean;
  estimated: number;
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
  /** Why the impact may be larger than shown, e.g. applications without mapped integrations. */
  caveat?: string;
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
  features: {
    ai: 'mock' | 'live' | 'off';
    eolLookup: boolean;
    sso: boolean;
    /** Who researches support dates, e.g. "Claude (claude-opus-5-5) with web search". */
    research: { label: string; live: boolean };
  };
}

/** Where a researched value comes from, shown next to the change for the reviewer. */
export interface Evidence {
  by: string;
  url: string | null;
  quote: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  note: string | null;
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
    evidence?: Evidence;
  }>;
  canReview: boolean;
  /** The reviewer may drop single changes before approving (research results). */
  canDrop: boolean;
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
  /** Applications: share of contract costs on top of their own cost. */
  contractCost?: number;
  /** Reference elements: how many of your own elements map to it. */
  mappedFrom?: number;
}

/* ------------------------------------------------------------------ */
/* Reference frameworks (installed packs) as trees                     */
/* ------------------------------------------------------------------ */

/** One element of a reference framework, with how much of your model maps to it. */
export interface FrameworkNode {
  id: string;
  /** Parent inside the same framework; null at the top. */
  parentId: string | null;
  /** The framework's own id ("1.1.3" for etom:1.1.3); null when it only repeats the name. */
  key: string | null;
  name: string;
  /** "Level 3", "ABE", "Aggregate function level 1"… */
  level: string;
  domain: string | null;
  description: string;
  depth: number;
  /** Your elements that map to this one. */
  mapped: number;
  /** Your elements that map to this one or anything below it (each counted once). */
  mappedBelow: number;
  /** Elements in this branch, itself included. */
  size: number;
  /** Elements in this branch with at least one mapping. */
  covered: number;
  /**
   * Your elements that reach this one through another framework: they map to an element there
   * that realizes or supports it (an application mapped to a TAM application that realizes this
   * function).
   */
  mappedThrough: number;
  /** The same for this one or anything below it (each counted once). */
  mappedThroughBelow: number;
  /** Elements in this branch reached only through other frameworks (not counted in covered). */
  coveredThrough: number;
  /** Links to elements of other frameworks (a TAM application realizes functions). */
  links: number;
}

export interface FrameworkRef {
  packId: string;
  packName: string;
  id: string;
  name: string;
}

export interface FrameworkLinkSummary {
  type: RelationType;
  /** As read from this framework: "realizes", "realized by". */
  label: string;
  direction: 'out' | 'in';
  framework: FrameworkRef;
  /** Links, and elements of this framework that have one. */
  count: number;
  elements: number;
}

export interface FrameworkTree {
  pack: { id: string; name: string; version: string };
  framework: {
    id: string;
    name: string;
    elementType: ElementType;
    description: string | null;
    version: string | null;
  };
  /** In tree order: each parent before its children, siblings by key. */
  nodes: FrameworkNode[];
  totals: {
    nodes: number;
    /** Elements with at least one mapping. */
    covered: number;
    /** Your elements that map into this framework. */
    mappedElements: number;
    /** Your elements of this framework's type: what could map to it. */
    candidates: number;
    /** Elements reached only through other frameworks (not counted in covered). */
    coveredThrough: number;
    /** Your elements that reach this framework through others. */
    mappedThroughElements: number;
  };
  links: FrameworkLinkSummary[];
  /** Coverage through each other framework, most first. */
  through: Array<{
    framework: FrameworkRef;
    /** Elements of this framework reached through it and not mapped directly. */
    covered: number;
    /** Your elements that map to it and reach this framework. */
    mappedElements: number;
  }>;
}

export interface FrameworkNodeLink {
  relationId: string;
  type: RelationType;
  label: string;
  direction: 'out' | 'in';
  other: {
    id: string;
    key: string | null;
    name: string;
    level: string | null;
    framework: FrameworkRef;
  };
}

export interface FrameworkNodeDetail {
  id: string;
  /** As stored, e.g. "etom:1.1.3". */
  sourceKey: string | null;
  key: string | null;
  name: string;
  description: string;
  level: string;
  domain: string | null;
  /** Other details the framework gives, e.g. a SID entity's attribute names. */
  details: Array<{ label: string; value: string | string[] }>;
  /** From the top down to the parent. */
  path: Array<{ id: string; key: string | null; name: string }>;
  children: number;
  mappedFrom: Array<{
    relationId: string;
    element: ElementSummary & { domainName: string | null };
  }>;
  /** Your elements mapped further down this branch, with what they map to. */
  mappedBelow: {
    elements: number;
    items: Array<{
      element: ElementSummary;
      to: Array<{ id: string; key: string | null; name: string }>;
    }>;
  };
  /** Your elements that reach this one through other frameworks, framework by framework. */
  mappedThrough: Array<{
    framework: FrameworkRef;
    items: Array<{
      element: ElementSummary & { domainName: string | null };
      /** What it maps to there, and how that links here ("realizes"). */
      via: Array<{ id: string; key: string | null; name: string; label: string }>;
    }>;
  }>;
  links: FrameworkNodeLink[];
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
