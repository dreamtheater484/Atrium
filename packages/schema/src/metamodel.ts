import {
  COST_BASIS,
  CRITICALITY,
  DATA_SENSITIVITY,
  DECISION_STATUS,
  ELEMENT_TYPES,
  type ElementType,
  HOSTING,
  IMPORTANCE,
  INITIATIVE_STATUS,
  INTERFACE_FREQUENCY,
  INTERFACE_PROTOCOLS,
  RADAR_RINGS,
  STANDARD_CATEGORY,
  STANDARD_EFFECT,
  STANDARD_LEVEL,
  SUPPORT_MODELS,
  TECH_CATEGORIES,
  TIME_RATINGS,
} from './enums';

export type AttributeKind =
  | 'text'
  | 'longtext'
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'enum'
  | 'rating'
  | 'boolean'
  | 'url'
  | 'list';

export interface AttributeDef {
  key: string;
  label: string;
  kind: AttributeKind;
  options?: readonly string[];
  help?: string;
  /** Filled automatically by Atrium; shown read-only. */
  derived?: boolean;
  /** Counts towards the data-quality score when empty. */
  quality?: boolean;
  /** Only expected (for quality) when this returns true, e.g. end of support for vendor products. */
  expectedWhen?: (attributes: Record<string, unknown>) => boolean;
  /** Not expected when the element has this incoming relation, e.g. cost paid by a contract. */
  waivedByIncoming?: RelationType;
  /** Alternative column headers recognised by the import wizard. */
  aliases?: string[];
  /** Shown in the default table columns for this type. */
  column?: boolean;
}

export type ArchitectureLayer =
  | 'strategy'
  | 'business'
  | 'application'
  | 'data'
  | 'technology'
  | 'governance'
  | 'organization';

export interface ElementTypeDef {
  type: ElementType;
  label: string;
  plural: string;
  description: string;
  /** lucide icon name */
  icon: string;
  layer: ArchitectureLayer;
  hierarchical: boolean;
  /** Core fields that count towards data quality. */
  qualityCore: Array<'description' | 'owner' | 'domain' | 'lifecycle'>;
  /** Relations this type is expected to have (counts towards quality). */
  expectedRelations?: ExpectedRelation[];
  attributes: AttributeDef[];
  /** Sheet names / words that identify this type during import. */
  aliases: string[];
  /** Uses lifecycle phases and dates. */
  hasLifecycle: boolean;
}

export interface ExpectedRelation {
  /** One relation type, or several where any of them will do. */
  relation: RelationType | RelationType[];
  direction: 'out' | 'in' | 'any';
  label: string;
  /** Name used in the missing-field id (relation.<key>); defaults to the relation type. */
  key?: string;
  /** A boolean attribute that, when true, says this relation is not needed. */
  waivedBy?: string;
}

const NOT_VENDOR = /in-?house|internal|own development|self-built|bespoke|custom-built/i;

/**
 * Software bought from a vendor and run by the organisation has an end-of-support date.
 * In-house software and SaaS do not (the provider keeps SaaS current).
 */
export function isVendorProduct(attributes: Record<string, unknown>): boolean {
  const vendor = typeof attributes.vendor === 'string' ? attributes.vendor.trim() : '';
  return !!vendor && !NOT_VENDOR.test(vendor) && attributes.hosting !== 'saas';
}

/** Versioned technologies have end-of-support dates; rolling releases and managed services don't. */
export function hasSupportDates(attributes: Record<string, unknown>): boolean {
  return attributes.support_model !== 'rolling' && attributes.support_model !== 'managed';
}

const rating = (
  key: string,
  label: string,
  help: string,
  aliases: string[] = [],
): AttributeDef => ({
  key,
  label,
  kind: 'rating',
  help,
  quality: true,
  aliases,
  column: true,
});

export const ELEMENT_TYPE_DEFS: Record<ElementType, ElementTypeDef> = {
  domain: {
    type: 'domain',
    label: 'Domain',
    plural: 'Domains',
    description: 'A business area that groups capabilities, applications and data.',
    icon: 'layers',
    layer: 'organization',
    hierarchical: false,
    qualityCore: ['description', 'owner'],
    attributes: [],
    aliases: ['domain', 'domains', 'business domain', 'area'],
    hasLifecycle: false,
  },
  team: {
    type: 'team',
    label: 'Team',
    plural: 'Teams',
    description: 'A group of people that owns and runs applications.',
    icon: 'users',
    layer: 'organization',
    hierarchical: false,
    qualityCore: ['description', 'owner'],
    attributes: [
      { key: 'contact', label: 'Contact', kind: 'text', aliases: ['email', 'channel', 'slack'] },
    ],
    aliases: ['team', 'teams', 'squad', 'group', 'department'],
    hasLifecycle: false,
  },
  capability: {
    type: 'capability',
    label: 'Capability',
    plural: 'Capabilities',
    description: 'Something the business is able to do, independent of how it is done.',
    icon: 'blocks',
    layer: 'strategy',
    hierarchical: true,
    qualityCore: ['description', 'owner', 'domain'],
    expectedRelations: [
      { relation: 'supports', direction: 'in', label: 'Supported by at least one application' },
    ],
    attributes: [
      {
        key: 'importance',
        label: 'Strategic importance',
        kind: 'enum',
        options: IMPORTANCE,
        quality: true,
        aliases: ['importance', 'priority', 'strategic importance'],
        column: true,
      },
      rating('maturity', 'Maturity', '1 = ad hoc, 5 = optimised', ['maturity']),
    ],
    aliases: ['capability', 'capabilities', 'business capability', 'business capabilities'],
    hasLifecycle: false,
  },
  business_process: {
    type: 'business_process',
    label: 'Business process',
    plural: 'Business processes',
    description: 'A sequence of activities that delivers a business outcome.',
    icon: 'workflow',
    layer: 'business',
    hierarchical: true,
    qualityCore: ['description', 'owner', 'domain'],
    attributes: [
      { key: 'kpi', label: 'Key metric', kind: 'text', aliases: ['kpi', 'metric'] },
      {
        key: 'frequency',
        label: 'Frequency',
        kind: 'text',
        aliases: ['frequency', 'volume'],
      },
    ],
    aliases: ['process', 'processes', 'business process', 'business processes'],
    hasLifecycle: false,
  },
  application: {
    type: 'application',
    label: 'Application',
    plural: 'Applications',
    description: 'A software system or service used by the organization.',
    icon: 'app-window',
    layer: 'application',
    hierarchical: false,
    qualityCore: ['description', 'owner', 'domain', 'lifecycle'],
    expectedRelations: [
      { relation: 'supports', direction: 'out', label: 'Supports at least one capability' },
      { relation: 'owned_by', direction: 'out', label: 'Owned by a team' },
      {
        key: 'integration',
        relation: ['flows_to', 'depends_on', 'exposes', 'consumes'],
        direction: 'any',
        label: 'Integrations with other applications',
        waivedBy: 'standalone',
      },
    ],
    attributes: [
      {
        key: 'vendor',
        label: 'Vendor',
        kind: 'text',
        quality: true,
        aliases: ['vendor', 'supplier', 'manufacturer', 'provider'],
        column: true,
      },
      { key: 'product', label: 'Product', kind: 'text', aliases: ['product', 'package'] },
      { key: 'version', label: 'Version', kind: 'text', aliases: ['version', 'release'] },
      {
        key: 'hosting',
        label: 'Hosting',
        kind: 'enum',
        options: HOSTING,
        quality: true,
        aliases: ['hosting', 'deployment', 'hosted', 'cloud'],
        column: true,
      },
      {
        key: 'annual_cost',
        label: 'Annual cost',
        kind: 'currency',
        quality: true,
        help: 'Its own yearly cost. Costs paid through a contract are added automatically.',
        waivedByIncoming: 'covers',
        aliases: ['cost', 'annual cost', 'yearly cost', 'tco', 'run cost', 'costs', 'budget'],
        column: true,
      },
      {
        key: 'cost_basis',
        label: 'Cost basis',
        kind: 'enum',
        options: COST_BASIS,
        help: 'Is the annual cost an actual figure or an estimate?',
        aliases: ['cost basis', 'cost type', 'cost accuracy'],
      },
      {
        key: 'users',
        label: 'Users',
        kind: 'number',
        aliases: ['users', 'user count', 'number of users', '# users'],
      },
      {
        key: 'criticality',
        label: 'Business criticality',
        kind: 'enum',
        options: CRITICALITY,
        quality: true,
        aliases: ['criticality', 'business criticality', 'critical', 'tier'],
        column: true,
      },
      {
        key: 'time',
        label: 'TIME',
        kind: 'enum',
        options: TIME_RATINGS,
        help: 'Tolerate, invest, migrate or eliminate',
        quality: true,
        aliases: ['time', 'time rating', 'disposition', 'strategy', 'rationalization'],
        column: true,
      },
      rating('business_fit', 'Business fit', '1 = poor, 5 = excellent', [
        'business fit',
        'functional fit',
        'business value',
      ]),
      rating('technical_fit', 'Technical fit', '1 = poor, 5 = excellent', [
        'technical fit',
        'technical quality',
        'tech fit',
      ]),
      {
        key: 'eol_date',
        label: 'End of support',
        kind: 'date',
        quality: true,
        expectedWhen: isVendorProduct,
        help: 'When the vendor stops standard support. Not needed for in-house software or SaaS.',
        aliases: [
          'end of support',
          'end of life',
          'eol',
          'eos',
          'vendor support end',
          'support end',
        ],
      },
      {
        key: 'extended_support_date',
        label: 'Extended support until',
        kind: 'date',
        help: 'Until when the vendor offers paid extended support',
        aliases: ['extended support until', 'extended support end', 'extended support date'],
      },
      {
        key: 'extended_support',
        label: 'On extended support',
        kind: 'boolean',
        help: "We pay for the vendor's extended support",
        aliases: ['on extended support', 'extended support purchased', 'esu'],
      },
      {
        key: 'standalone',
        label: 'Standalone',
        kind: 'boolean',
        help: 'Exchanges no data with other applications',
        aliases: ['standalone', 'no integrations'],
      },
      { key: 'url', label: 'Link', kind: 'url', aliases: ['url', 'link', 'website'] },
    ],
    aliases: [
      'application',
      'applications',
      'app',
      'apps',
      'system',
      'systems',
      'service',
      'services',
      'portfolio',
    ],
    hasLifecycle: true,
  },
  interface: {
    type: 'interface',
    label: 'Interface',
    plural: 'Interfaces',
    description: 'An API, event stream or file exchange between applications.',
    icon: 'plug',
    layer: 'application',
    hierarchical: false,
    qualityCore: ['description', 'owner', 'lifecycle'],
    expectedRelations: [
      { relation: 'exposes', direction: 'in', label: 'Provided by an application' },
    ],
    attributes: [
      {
        key: 'protocol',
        label: 'Protocol',
        kind: 'enum',
        options: INTERFACE_PROTOCOLS,
        quality: true,
        aliases: ['protocol', 'type', 'technology'],
        column: true,
      },
      {
        key: 'frequency',
        label: 'Frequency',
        kind: 'enum',
        options: INTERFACE_FREQUENCY,
        aliases: ['frequency', 'schedule'],
        column: true,
      },
      {
        key: 'docs',
        label: 'Documentation',
        kind: 'url',
        aliases: ['docs', 'documentation', 'spec'],
      },
    ],
    aliases: ['interface', 'interfaces', 'api', 'apis', 'integration', 'integrations'],
    hasLifecycle: true,
  },
  data_object: {
    type: 'data_object',
    label: 'Data object',
    plural: 'Data objects',
    description: 'A business information entity, such as customer or invoice.',
    icon: 'database',
    layer: 'data',
    hierarchical: true,
    qualityCore: ['description', 'owner', 'domain'],
    expectedRelations: [
      { relation: 'stores', direction: 'in', label: 'Managed by an application' },
    ],
    attributes: [
      {
        key: 'sensitivity',
        label: 'Sensitivity',
        kind: 'enum',
        options: DATA_SENSITIVITY,
        quality: true,
        aliases: ['sensitivity', 'pii', 'privacy'],
        column: true,
      },
      { key: 'retention', label: 'Retention', kind: 'text', aliases: ['retention'] },
    ],
    aliases: ['data', 'data object', 'data objects', 'entity', 'entities', 'information'],
    hasLifecycle: false,
  },
  technology: {
    type: 'technology',
    label: 'Technology',
    plural: 'Technologies',
    description: 'A runtime, database, platform or framework applications run on.',
    icon: 'cpu',
    layer: 'technology',
    hierarchical: false,
    qualityCore: ['description', 'owner', 'lifecycle'],
    attributes: [
      {
        key: 'category',
        label: 'Category',
        kind: 'enum',
        options: TECH_CATEGORIES,
        quality: true,
        aliases: ['category', 'kind', 'type'],
        column: true,
      },
      { key: 'vendor', label: 'Vendor', kind: 'text', aliases: ['vendor', 'supplier'] },
      {
        key: 'product',
        label: 'Product',
        kind: 'text',
        aliases: ['product'],
        help: 'Used to look up end-of-life dates automatically',
      },
      {
        key: 'version',
        label: 'Version',
        kind: 'text',
        quality: true,
        aliases: ['version', 'release'],
        column: true,
      },
      {
        key: 'radar',
        label: 'Radar',
        kind: 'enum',
        options: RADAR_RINGS,
        quality: true,
        aliases: ['radar', 'ring', 'status', 'recommendation'],
        column: true,
      },
      {
        key: 'support_model',
        label: 'Support model',
        kind: 'enum',
        options: SUPPORT_MODELS,
        help: "Versioned products have end-of-support dates; rolling releases and managed services don't",
        aliases: ['support model', 'release model'],
      },
      {
        key: 'eol_date',
        label: 'End of support',
        kind: 'date',
        quality: true,
        expectedWhen: hasSupportDates,
        aliases: ['eol', 'end of life', 'end of support', 'eos'],
        help: 'Filled in automatically from endoflife.date, or found by research',
        column: true,
      },
      {
        key: 'extended_support_date',
        label: 'Extended support until',
        kind: 'date',
        help: 'Until when the vendor offers paid extended support',
        aliases: ['extended support until', 'extended support end', 'extended support date'],
      },
      {
        key: 'extended_support',
        label: 'On extended support',
        kind: 'boolean',
        help: "We pay for the vendor's extended support",
        aliases: ['on extended support', 'extended support purchased', 'esu'],
      },
    ],
    aliases: ['technology', 'technologies', 'tech', 'stack', 'platform', 'platforms', 'component'],
    hasLifecycle: true,
  },
  contract: {
    type: 'contract',
    label: 'Contract',
    plural: 'Contracts',
    description:
      'A licence, subscription or support agreement. Its cost is shared by what it covers.',
    icon: 'file-signature',
    layer: 'business',
    hierarchical: false,
    qualityCore: ['description', 'owner'],
    expectedRelations: [
      { relation: 'covers', direction: 'out', label: 'Covers at least one application' },
    ],
    attributes: [
      {
        key: 'vendor',
        label: 'Vendor',
        kind: 'text',
        quality: true,
        aliases: ['vendor', 'supplier', 'provider', 'licensor'],
        column: true,
      },
      {
        key: 'annual_cost',
        label: 'Annual cost',
        kind: 'currency',
        quality: true,
        help: 'Split evenly over the applications it covers',
        aliases: ['cost', 'annual cost', 'yearly cost', 'contract value', 'annual value', 'fee'],
        column: true,
      },
      {
        key: 'cost_basis',
        label: 'Cost basis',
        kind: 'enum',
        options: COST_BASIS,
        aliases: ['cost basis', 'cost type'],
      },
      {
        key: 'end_date',
        label: 'Contract end',
        kind: 'date',
        quality: true,
        aliases: ['end', 'end date', 'expiry', 'expires', 'renewal date', 'term end'],
        column: true,
      },
      {
        key: 'notice',
        label: 'Notice period',
        kind: 'text',
        aliases: ['notice', 'notice period', 'cancellation period'],
      },
      {
        key: 'reference',
        label: 'Contract number',
        kind: 'text',
        aliases: ['contract number', 'contract id', 'agreement number', 'po number'],
      },
    ],
    aliases: [
      'contract',
      'contracts',
      'licence',
      'licences',
      'license',
      'licenses',
      'agreement',
      'agreements',
      'subscription',
      'subscriptions',
    ],
    hasLifecycle: false,
  },
  initiative: {
    type: 'initiative',
    label: 'Initiative',
    plural: 'Initiatives',
    description: 'A project or programme that changes the architecture.',
    icon: 'flag',
    layer: 'strategy',
    hierarchical: false,
    qualityCore: ['description', 'owner'],
    expectedRelations: [
      { relation: 'impacts', direction: 'out', label: 'Changes at least one element' },
    ],
    attributes: [
      {
        key: 'status',
        label: 'Status',
        kind: 'enum',
        options: INITIATIVE_STATUS,
        quality: true,
        aliases: ['status', 'state'],
        column: true,
      },
      {
        key: 'start_date',
        label: 'Start',
        kind: 'date',
        quality: true,
        aliases: ['start', 'start date', 'from'],
        column: true,
      },
      {
        key: 'end_date',
        label: 'End',
        kind: 'date',
        quality: true,
        aliases: ['end', 'end date', 'to', 'due'],
        column: true,
      },
      {
        key: 'budget',
        label: 'Budget',
        kind: 'currency',
        aliases: ['budget', 'cost', 'investment'],
        column: true,
      },
      { key: 'progress', label: 'Progress', kind: 'percent', aliases: ['progress', '% complete'] },
      { key: 'sponsor', label: 'Sponsor', kind: 'text', aliases: ['sponsor'] },
    ],
    aliases: [
      'initiative',
      'initiatives',
      'project',
      'projects',
      'programme',
      'program',
      'roadmap',
    ],
    hasLifecycle: false,
  },
  principle: {
    type: 'principle',
    label: 'Principle',
    plural: 'Principles',
    description: 'A guiding rule for architecture decisions.',
    icon: 'compass',
    layer: 'governance',
    hierarchical: false,
    qualityCore: ['description', 'owner'],
    attributes: [
      {
        key: 'rationale',
        label: 'Rationale',
        kind: 'longtext',
        quality: true,
        aliases: ['rationale', 'why'],
      },
      { key: 'implications', label: 'Implications', kind: 'longtext', aliases: ['implications'] },
    ],
    aliases: ['principle', 'principles'],
    hasLifecycle: false,
  },
  standard: {
    type: 'standard',
    label: 'Standard',
    plural: 'Standards',
    description: 'A rule that designs and code are checked against.',
    icon: 'shield-check',
    layer: 'governance',
    hierarchical: false,
    qualityCore: ['description', 'owner'],
    attributes: [
      {
        key: 'category',
        label: 'Category',
        kind: 'enum',
        options: STANDARD_CATEGORY,
        quality: true,
        aliases: ['category', 'area'],
        column: true,
      },
      {
        key: 'level',
        label: 'Level',
        kind: 'enum',
        options: STANDARD_LEVEL,
        quality: true,
        aliases: ['level', 'obligation'],
        column: true,
      },
      {
        key: 'effect',
        label: 'Effect',
        kind: 'enum',
        options: STANDARD_EFFECT,
        help: 'How matching technologies are treated by the standards check',
        aliases: ['effect'],
        column: true,
      },
      {
        key: 'match',
        label: 'Technologies',
        kind: 'list',
        help: 'Technology names this standard is about, such as "PostgreSQL" or "Java 8"',
        aliases: ['technologies', 'match', 'applies to technology'],
      },
      {
        key: 'rule',
        label: 'Rule',
        kind: 'longtext',
        quality: true,
        aliases: ['rule', 'statement'],
      },
    ],
    aliases: ['standard', 'standards', 'guideline', 'guidelines', 'policy', 'policies'],
    hasLifecycle: false,
  },
  decision: {
    type: 'decision',
    label: 'Decision',
    plural: 'Decisions',
    description: 'An architecture decision record (ADR).',
    icon: 'scale',
    layer: 'governance',
    hierarchical: false,
    qualityCore: ['description', 'owner'],
    attributes: [
      {
        key: 'status',
        label: 'Status',
        kind: 'enum',
        options: DECISION_STATUS,
        quality: true,
        aliases: ['status'],
        column: true,
      },
      {
        key: 'date',
        label: 'Date',
        kind: 'date',
        quality: true,
        aliases: ['date', 'decided'],
        column: true,
      },
      {
        key: 'context',
        label: 'Context',
        kind: 'longtext',
        quality: true,
        aliases: ['context', 'problem'],
      },
      {
        key: 'decision',
        label: 'Decision',
        kind: 'longtext',
        quality: true,
        aliases: ['decision', 'outcome'],
      },
      {
        key: 'consequences',
        label: 'Consequences',
        kind: 'longtext',
        aliases: ['consequences', 'impact'],
      },
    ],
    aliases: ['decision', 'decisions', 'adr', 'adrs', 'architecture decision'],
    hasLifecycle: false,
  },
};

export const ELEMENT_TYPE_LIST: ElementTypeDef[] = ELEMENT_TYPES.map((t) => ELEMENT_TYPE_DEFS[t]);

export function typeDef(type: ElementType): ElementTypeDef {
  return ELEMENT_TYPE_DEFS[type];
}

export function attributeDef(type: ElementType, key: string): AttributeDef | undefined {
  return ELEMENT_TYPE_DEFS[type].attributes.find((a) => a.key === key);
}

/* ------------------------------------------------------------------ */
/* Relations                                                            */
/* ------------------------------------------------------------------ */

export const RELATION_TYPES = [
  'supports',
  'realizes',
  'depends_on',
  'flows_to',
  'exposes',
  'consumes',
  'uses',
  'stores',
  'owned_by',
  'governed_by',
  'impacts',
  'maps_to',
  'replaces',
  'covers',
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

const ALL = ELEMENT_TYPES as readonly ElementType[];
const ORG_ELEMENTS = ALL.filter((t) => t !== 'team');

export interface RelationTypeDef {
  type: RelationType;
  label: string;
  inverseLabel: string;
  from: readonly ElementType[];
  to: readonly ElementType[];
  /** Followed when computing impact ("what breaks if this changes"). */
  impact: 'forward' | 'backward' | 'both' | 'none';
  description: string;
}

export const RELATION_TYPE_DEFS: Record<RelationType, RelationTypeDef> = {
  supports: {
    type: 'supports',
    label: 'supports',
    inverseLabel: 'supported by',
    from: ['application', 'technology', 'interface'],
    to: ['capability', 'business_process'],
    impact: 'forward',
    description: 'An application enables a capability or process.',
  },
  realizes: {
    type: 'realizes',
    label: 'realizes',
    inverseLabel: 'realized by',
    from: ['business_process', 'application', 'initiative'],
    to: ['capability'],
    impact: 'forward',
    description: 'A process or application delivers a capability.',
  },
  depends_on: {
    type: 'depends_on',
    label: 'depends on',
    inverseLabel: 'needed by',
    from: ['application', 'technology', 'interface'],
    to: ['application', 'technology', 'interface'],
    impact: 'backward',
    description: 'Needs the target to work.',
  },
  flows_to: {
    type: 'flows_to',
    label: 'sends data to',
    inverseLabel: 'receives data from',
    from: ['application'],
    to: ['application'],
    impact: 'forward',
    description: 'Data moves from one application to another.',
  },
  exposes: {
    type: 'exposes',
    label: 'provides',
    inverseLabel: 'provided by',
    from: ['application'],
    to: ['interface'],
    impact: 'forward',
    description: 'An application offers an interface.',
  },
  consumes: {
    type: 'consumes',
    label: 'uses interface',
    inverseLabel: 'used by',
    from: ['application'],
    to: ['interface'],
    impact: 'backward',
    description: 'An application calls or receives an interface.',
  },
  uses: {
    type: 'uses',
    label: 'runs on',
    inverseLabel: 'runs',
    from: ['application', 'technology'],
    to: ['technology'],
    impact: 'backward',
    description: 'An application is built on or runs on a technology.',
  },
  stores: {
    type: 'stores',
    label: 'manages',
    inverseLabel: 'managed by',
    from: ['application'],
    to: ['data_object'],
    impact: 'forward',
    description: 'An application creates or holds a data object.',
  },
  owned_by: {
    type: 'owned_by',
    label: 'owned by',
    inverseLabel: 'owns',
    from: ORG_ELEMENTS,
    to: ['team'],
    impact: 'none',
    description: 'A team is responsible for this element.',
  },
  governed_by: {
    type: 'governed_by',
    label: 'governed by',
    inverseLabel: 'governs',
    from: ALL,
    to: ['principle', 'standard', 'decision'],
    impact: 'none',
    description: 'A principle, standard or decision applies.',
  },
  impacts: {
    type: 'impacts',
    label: 'changes',
    inverseLabel: 'changed by',
    from: ['initiative'],
    to: ALL,
    impact: 'none',
    description: 'An initiative changes this element.',
  },
  maps_to: {
    type: 'maps_to',
    label: 'maps to',
    inverseLabel: 'mapped from',
    from: ALL,
    to: ALL,
    impact: 'none',
    description: 'Links your model to an industry reference model.',
  },
  replaces: {
    type: 'replaces',
    label: 'replaces',
    inverseLabel: 'replaced by',
    from: ['application', 'technology', 'decision', 'interface'],
    to: ['application', 'technology', 'decision', 'interface'],
    impact: 'none',
    description: 'The source succeeds the target.',
  },
  covers: {
    type: 'covers',
    label: 'covers',
    inverseLabel: 'covered by',
    from: ['contract'],
    to: ['application', 'technology'],
    impact: 'none',
    description: 'A contract pays for this application or technology.',
  },
};

export const RELATION_TYPE_LIST = RELATION_TYPES.map((t) => RELATION_TYPE_DEFS[t]);

export function allowedRelations(from: ElementType, to: ElementType): RelationType[] {
  return RELATION_TYPE_LIST.filter((r) => r.from.includes(from) && r.to.includes(to)).map(
    (r) => r.type,
  );
}

/* ------------------------------------------------------------------ */
/* Core fields (shared by every type), with import aliases              */
/* ------------------------------------------------------------------ */

export const CORE_FIELDS = [
  {
    key: 'name',
    label: 'Name',
    aliases: ['name', 'title', 'application name', 'app name', 'system name', 'element', 'label'],
  },
  {
    key: 'key',
    label: 'Key',
    aliases: ['key', 'code', 'short name', 'slug', 'identifier', 'service key'],
  },
  {
    key: 'description',
    label: 'Description',
    aliases: ['description', 'desc', 'summary', 'purpose', 'notes', 'comment', 'comments'],
  },
  {
    key: 'owner',
    label: 'Owner',
    aliases: [
      'owner',
      'business owner',
      'application owner',
      'responsible',
      'accountable',
      'product owner',
      'contact',
    ],
  },
  { key: 'domain', label: 'Domain', aliases: ['domain', 'business domain', 'area', 'division'] },
  {
    key: 'parent',
    label: 'Parent',
    aliases: ['parent', 'parent capability', 'belongs to', 'level 1'],
  },
  {
    key: 'lifecycle',
    label: 'Lifecycle',
    aliases: ['lifecycle', 'life cycle', 'status', 'phase', 'stage', 'state'],
  },
  {
    key: 'classification',
    label: 'Classification',
    aliases: ['classification', 'confidentiality', 'security classification'],
  },
  { key: 'tags', label: 'Tags', aliases: ['tags', 'labels', 'keywords'] },
  {
    key: 'team',
    label: 'Team',
    aliases: ['team', 'owning team', 'squad', 'it owner', 'support team'],
  },
  {
    key: 'external_id',
    label: 'External ID',
    aliases: ['id', 'external id', 'cmdb id', 'ci id', 'asset id', 'app id', 'number'],
  },
] as const;

/** Relation columns the import wizard understands, for example "Supports" or "Depends on". */
export const RELATION_COLUMNS: Array<{
  relation: RelationType;
  direction: 'out' | 'in';
  targetType: ElementType;
  aliases: string[];
}> = [
  {
    relation: 'supports',
    direction: 'out',
    targetType: 'capability',
    aliases: ['capability', 'capabilities', 'business capability', 'supports'],
  },
  {
    relation: 'depends_on',
    direction: 'out',
    targetType: 'application',
    aliases: ['depends on', 'dependencies', 'upstream'],
  },
  {
    relation: 'flows_to',
    direction: 'out',
    targetType: 'application',
    aliases: ['sends data to', 'downstream', 'feeds', 'flows to'],
  },
  {
    relation: 'uses',
    direction: 'out',
    targetType: 'technology',
    aliases: ['technology', 'technologies', 'tech stack', 'runs on', 'platform', 'database'],
  },
  {
    relation: 'stores',
    direction: 'out',
    targetType: 'data_object',
    aliases: ['data', 'data objects', 'manages', 'master data'],
  },
];
