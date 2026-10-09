export const ELEMENT_TYPES = [
  'domain',
  'team',
  'capability',
  'business_process',
  'application',
  'interface',
  'data_object',
  'technology',
  'contract',
  'initiative',
  'principle',
  'standard',
  'decision',
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const LIFECYCLE_PHASES = ['plan', 'build', 'active', 'phase_out', 'retired'] as const;
export type LifecyclePhase = (typeof LIFECYCLE_PHASES)[number];

export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export function classificationRank(c: Classification): number {
  return CLASSIFICATIONS.indexOf(c);
}

export const TIME_RATINGS = ['tolerate', 'invest', 'migrate', 'eliminate'] as const;
export type TimeRating = (typeof TIME_RATINGS)[number];

export const CRITICALITY = ['low', 'medium', 'high', 'mission_critical'] as const;
export const IMPORTANCE = ['low', 'medium', 'high'] as const;

export const HEALTH = ['good', 'watch', 'act'] as const;
export type Health = (typeof HEALTH)[number];

export const RADAR_RINGS = ['adopt', 'trial', 'assess', 'hold'] as const;
export type RadarRing = (typeof RADAR_RINGS)[number];

export const HOSTING = ['on_premise', 'private_cloud', 'public_cloud', 'saas'] as const;
/** Versioned products have end-of-support dates; rolling releases and managed services don't. */
export const SUPPORT_MODELS = ['versioned', 'rolling', 'managed'] as const;
/** Whether a cost is a real figure or an estimate. */
export const COST_BASIS = ['actual', 'estimate'] as const;
export const TECH_CATEGORIES = [
  'language',
  'runtime',
  'framework',
  'database',
  'os',
  'platform',
  'middleware',
  'cloud_service',
  'tool',
  'other',
] as const;
export const INTERFACE_PROTOCOLS = [
  'rest',
  'graphql',
  'grpc',
  'soap',
  'event',
  'file',
  'database',
  'other',
] as const;
export const INTERFACE_FREQUENCY = ['realtime', 'hourly', 'daily', 'batch', 'on_demand'] as const;
export const DATA_SENSITIVITY = [
  'none',
  'personal',
  'sensitive_personal',
  'financial',
  'secret',
] as const;
export const DECISION_STATUS = ['proposed', 'accepted', 'superseded', 'rejected'] as const;
export const INITIATIVE_STATUS = ['planned', 'running', 'done', 'on_hold', 'cancelled'] as const;
export const STANDARD_LEVEL = ['must', 'should'] as const;
export const STANDARD_EFFECT = ['require', 'prefer', 'forbid', 'guideline'] as const;
export const STANDARD_CATEGORY = [
  'technology',
  'security',
  'integration',
  'data',
  'process',
  'cloud',
] as const;

export const ROLES = ['admin', 'architect', 'manager', 'engineer', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const LAYERS = ['org', 'reference'] as const;
export type ModelLayer = (typeof LAYERS)[number];

/** Human labels for enum values, used everywhere in the UI and exports. */
export const ENUM_LABELS: Record<string, string> = {
  plan: 'Plan',
  build: 'Build',
  active: 'Active',
  phase_out: 'Phase out',
  retired: 'Retired',
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
  restricted: 'Restricted',
  tolerate: 'Tolerate',
  invest: 'Invest',
  migrate: 'Migrate',
  eliminate: 'Eliminate',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  mission_critical: 'Mission critical',
  good: 'Good',
  watch: 'Watch',
  act: 'Act',
  adopt: 'Adopt',
  trial: 'Trial',
  assess: 'Assess',
  hold: 'Hold',
  on_premise: 'On-premise',
  private_cloud: 'Private cloud',
  public_cloud: 'Public cloud',
  saas: 'SaaS',
  versioned: 'Versioned releases',
  rolling: 'Rolling releases',
  managed: 'Managed by the provider',
  actual: 'Actual',
  estimate: 'Estimate',
  language: 'Language',
  runtime: 'Runtime',
  framework: 'Framework',
  database: 'Database',
  os: 'Operating system',
  platform: 'Platform',
  middleware: 'Middleware',
  cloud_service: 'Cloud service',
  tool: 'Tool',
  other: 'Other',
  rest: 'REST',
  graphql: 'GraphQL',
  grpc: 'gRPC',
  soap: 'SOAP',
  event: 'Event',
  file: 'File',
  realtime: 'Real-time',
  hourly: 'Hourly',
  daily: 'Daily',
  batch: 'Batch',
  on_demand: 'On demand',
  none: 'None',
  personal: 'Personal data',
  sensitive_personal: 'Sensitive personal data',
  financial: 'Financial',
  secret: 'Secret',
  proposed: 'Proposed',
  accepted: 'Accepted',
  superseded: 'Superseded',
  rejected: 'Rejected',
  planned: 'Planned',
  running: 'Running',
  done: 'Done',
  on_hold: 'On hold',
  cancelled: 'Cancelled',
  must: 'Must',
  should: 'Should',
  require: 'Require',
  prefer: 'Prefer',
  forbid: 'Forbid',
  guideline: 'Guideline',
  technology: 'Technology',
  security: 'Security',
  integration: 'Integration',
  data: 'Data',
  process: 'Process',
  cloud: 'Cloud',
  admin: 'Admin',
  architect: 'Architect',
  manager: 'Manager',
  engineer: 'Engineer',
  viewer: 'Viewer',
};

export function enumLabel(value: string | null | undefined): string {
  if (!value) return '';
  return ENUM_LABELS[value] ?? value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
