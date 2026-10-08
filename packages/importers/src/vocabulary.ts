/**
 * The words the importer recognises for each element type: core fields, attributes,
 * relation columns and lifecycle dates. Built from the metamodel plus importer-only
 * synonyms, so new attributes in the schema are picked up automatically.
 */
import {
  CLASSIFICATIONS,
  CORE_FIELDS,
  ELEMENT_TYPES,
  type ElementType,
  LIFECYCLE_PHASES,
  type LifecyclePhase,
  RELATION_COLUMNS,
  RELATION_TYPE_DEFS,
  type RelationType,
  typeDef,
} from '@atrium/schema';
import { norm } from './text';
import type { ColumnTarget, CoreField } from './types';

export type ValueKind =
  | 'name'
  | 'key'
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
  | 'list'
  | 'relation';

export interface Alias {
  /** Normalised alias text. */
  text: string;
  /** Multiplier for the match score (self-type words count a little less). */
  weight: number;
}

export interface TargetSpec {
  /** Unique per target; each non-multi target is used by at most one column. */
  id: string;
  target: ColumnTarget;
  aliases: Alias[];
  valueKind: ValueKind;
  options?: readonly string[];
  /** Relation targets can be used by several columns. */
  multi: boolean;
}

type AliasInput = string | [string, number];

/** Importer-only synonyms for the core fields, on top of CORE_FIELDS in the schema. */
const EXTRA_CORE_ALIASES: Record<CoreField, AliasInput[]> = {
  name: [
    'naam', 'bezeichnung', 'nom', 'nombre', 'full name', 'display name', 'object name',
    'element name', 'item', 'name of application',
  ],
  key: [
    'abbreviation', 'acronym', 'short code', 'shortname', 'mnemonic', 'app code',
    'application code', 'system code', 'afkorting',
  ],
  description: [
    'business description', 'functional description', 'remarks', 'details', 'explanation', 'about',
    'definition', 'omschrijving', 'beschrijving', 'beschreibung', 'toelichting', 'opmerkingen',
  ],
  owner: [
    'owner name', 'app owner', 'system owner', 'service owner', 'process owner', 'capability owner',
    'data owner', 'business contact', 'eigenaar', 'verantwoordelijke', 'accountable person',
    'owner email', 'business owner name', 'domain owner',
  ],
  domain: ['business unit', 'business area', 'segment', 'value stream', 'bu', 'domein', 'domain name'],
  parent: ['parent name', 'parent element', 'child of', 'part of', 'parent process', 'parent domain'],
  lifecycle: [
    'lifecycle status', 'lifecycle phase', 'lifecycle stage', 'lifecycle state', 'operational status',
    'install status', 'app status', 'application status', 'deployment status', 'production status',
    'levenscyclus', 'lc status', 'lc phase',
  ],
  classification: [
    'information classification', 'data classification', 'security level', 'confidentiality level',
    'cia classification', 'tlp',
  ],
  tags: ['tag', 'keyword'],
  team: [
    'responsible team', 'dev team', 'development team', 'support group', 'assignment group',
    'delivery team', 'it team', 'ops team', 'operations team', 'it department', 'managing team',
    'team name', 'owner team', 'owner group',
  ],
  external_id: [
    'sys id', 'ci number', 'asset tag', 'reference', 'ref', 'apm id', 'leanix id', 'application id',
    'system id', 'uid', 'uuid', 'guid', 'service id', 'object id', 'record id', 'nr', 'no',
  ],
};

/** Importer-only synonyms for attributes, per type. */
const EXTRA_ATTRIBUTE_ALIASES: Partial<Record<ElementType, Record<string, string[]>>> = {
  application: {
    vendor: ['vendor name', 'software vendor', 'leverancier', 'hersteller'],
    annual_cost: [
      'yearly costs', 'total cost', 'license cost', 'licence cost', 'license costs', 'licence costs',
      'cost per year', 'opex', 'run costs', 'kosten', 'jaarlijkse kosten', 'annual costs', 'tco per year',
    ],
    users: ['user base', 'active users', 'aantal gebruikers', 'nr of users', 'no of users'],
    criticality: ['criticality level', 'service tier', 'bia', 'business impact'],
    time: ['time classification', 'time category', 'gartner time', 'investment strategy', 'time quadrant'],
    hosting: ['hosting model', 'hosting type', 'deployment model', 'hosted at', 'cloud provider', 'where hosted'],
    business_fit: ['functional quality', 'business quality', 'functional value'],
    technical_fit: ['technical health', 'technical condition', 'technical value'],
    url: ['homepage', 'web address'],
  },
  technology: {
    eol_date: ['end of life date', 'eol date', 'support end', 'end of support date', 'end of extended support', 'eos date'],
    radar: ['adoption', 'tech radar', 'radar ring', 'recommendation status'],
    category: ['technology type', 'tech type'],
  },
  interface: {
    protocol: ['interface type', 'integration type', 'mechanism', 'transport', 'integration pattern'],
    frequency: ['timing', 'interval'],
  },
  initiative: {
    budget: ['total budget', 'capex', 'project budget'],
    start_date: ['begin', 'kick off', 'start month', 'planned start'],
    end_date: ['finish', 'deadline', 'due date', 'target date', 'completion date', 'planned end'],
    progress: ['completion', 'percent complete', 'percentage complete'],
  },
  data_object: {
    sensitivity: ['data sensitivity', 'personal data', 'gdpr', 'privacy classification'],
  },
  capability: {
    importance: ['business importance', 'strategic value', 'strategic relevance'],
    maturity: ['maturity level', 'current maturity'],
  },
};

/** Words for the date each lifecycle phase starts. */
const LIFECYCLE_DATE_ALIASES: Record<LifecyclePhase, AliasInput[]> = {
  plan: ['plan date', 'planned date', 'planning date', 'planned from', 'plan start', 'idea date'],
  build: [
    'build date', 'build start', 'development start', 'implementation start', 'implementation date',
    'start of development', 'project start',
  ],
  active: [
    'go live', 'go live date', 'golive', 'golive date', 'live date', 'live since', 'in production since',
    'production date', 'production since', 'active date', 'active from', 'active since', 'launch date',
    'launched', 'introduction date', 'introduced', 'start of production', 'first live', 'in use since',
    'commissioned', 'commissioning date', 'go live datum', 'ingebruikname',
  ],
  phase_out: [
    'sunset', 'sunset date', 'phase out', 'phase out date', 'phase out from', 'phasing out',
    'deprecation date', 'deprecated', 'deprecated since', 'deprecated from', 'uitfaseerdatum',
  ],
  retired: [
    'retirement', 'retirement date', 'retire date', 'retired', 'retired date', 'retired on',
    'decommission', 'decommission date', 'decommissioning date', 'decommissioned', 'decommissioned on',
    'shutdown date', 'switch off date', 'end of use', ['end of life', 0.95], ['end date', 0.9],
    'uitfaseringsdatum',
  ],
};

interface RelationColumnDef {
  relation: RelationType;
  direction: 'out' | 'in';
  targetType: ElementType;
  aliases: string[];
  /** Only for these sheet types; otherwise for every type where the relation is valid. */
  for?: ElementType[];
}

/** Relation columns beyond the schema's RELATION_COLUMNS, mostly for non-application sheets. */
const EXTRA_RELATION_COLUMNS: RelationColumnDef[] = [
  {
    relation: 'supports',
    direction: 'in',
    targetType: 'application',
    aliases: [
      'applications', 'application', 'apps', 'systems', 'it systems', 'supported by',
      'supporting applications', 'enabled by', 'supporting systems',
    ],
    for: ['capability', 'business_process'],
  },
  {
    relation: 'realizes',
    direction: 'in',
    targetType: 'business_process',
    aliases: ['processes', 'business processes', 'realized by', 'realised by'],
    for: ['capability'],
  },
  {
    relation: 'realizes',
    direction: 'out',
    targetType: 'capability',
    aliases: ['capability', 'capabilities', 'business capability', 'realizes', 'realises'],
    for: ['business_process'],
  },
  {
    relation: 'supports',
    direction: 'out',
    targetType: 'business_process',
    aliases: ['business processes', 'processes', 'supported processes'],
    for: ['application'],
  },
  {
    relation: 'exposes',
    direction: 'out',
    targetType: 'interface',
    aliases: ['interfaces', 'apis', 'provides', 'provided interfaces', 'exposes', 'provided apis'],
    for: ['application'],
  },
  {
    relation: 'consumes',
    direction: 'out',
    targetType: 'interface',
    aliases: ['consumes', 'consumed interfaces', 'consumed apis', 'uses interfaces', 'uses apis'],
    for: ['application'],
  },
  {
    relation: 'replaces',
    direction: 'out',
    targetType: 'application',
    aliases: ['replaces', 'successor of', 'replacing'],
    for: ['application'],
  },
  {
    relation: 'replaces',
    direction: 'in',
    targetType: 'application',
    aliases: ['replaced by', 'successor', 'replacement'],
    for: ['application'],
  },
  {
    relation: 'replaces',
    direction: 'in',
    targetType: 'technology',
    aliases: ['replaced by', 'successor', 'replacement'],
    for: ['technology'],
  },
  {
    relation: 'governed_by',
    direction: 'out',
    targetType: 'standard',
    aliases: ['standards', 'policies', 'governed by', 'applicable standards'],
  },
  {
    relation: 'governed_by',
    direction: 'out',
    targetType: 'principle',
    aliases: ['principles', 'applicable principles'],
  },
  {
    relation: 'exposes',
    direction: 'in',
    targetType: 'application',
    aliases: [
      'provider', 'provided by', 'source', 'source system', 'source application', 'source app',
      'from system', 'from application', 'from app', 'producer', 'publisher', 'sender', 'exposed by',
      'provider system', 'providing application',
    ],
    for: ['interface'],
  },
  {
    relation: 'consumes',
    direction: 'in',
    targetType: 'application',
    aliases: [
      'consumer', 'consumers', 'consumed by', 'target', 'target system', 'target application',
      'target app', 'to system', 'to application', 'to app', 'subscriber', 'subscribers', 'receiver',
      'used by', 'consuming applications',
    ],
    for: ['interface'],
  },
  {
    relation: 'stores',
    direction: 'in',
    targetType: 'application',
    aliases: [
      'system of record', 'master system', 'source system', 'managed by', 'stored in', 'applications',
      'systems', 'golden source', 'mastered in',
    ],
    for: ['data_object'],
  },
  {
    relation: 'uses',
    direction: 'in',
    targetType: 'application',
    aliases: ['used by', 'applications', 'apps', 'systems', 'used in'],
    for: ['technology'],
  },
  {
    relation: 'impacts',
    direction: 'out',
    targetType: 'application',
    aliases: [
      'impacts', 'impacted applications', 'affected applications', 'applications', 'affected systems',
      'systems', 'changes', 'impacted systems',
    ],
    for: ['initiative'],
  },
  {
    relation: 'impacts',
    direction: 'out',
    targetType: 'capability',
    aliases: ['capabilities', 'impacted capabilities', 'affected capabilities'],
    for: ['initiative'],
  },
];

function relationValid(def: RelationColumnDef, type: ElementType): boolean {
  const rel = RELATION_TYPE_DEFS[def.relation];
  if (def.for && !def.for.includes(type)) return false;
  return def.direction === 'out'
    ? rel.from.includes(type) && rel.to.includes(def.targetType)
    : rel.to.includes(type) && rel.from.includes(def.targetType);
}

function toAliases(inputs: readonly AliasInput[], weight = 1): Alias[] {
  return inputs.map((a) =>
    typeof a === 'string' ? { text: norm(a), weight } : { text: norm(a[0]), weight: a[1] * weight },
  );
}

function mergeAliases(...lists: Alias[][]): Alias[] {
  const byText = new Map<string, Alias>();
  for (const list of lists) {
    for (const a of list) {
      if (!a.text) continue;
      const existing = byText.get(a.text);
      if (!existing || existing.weight < a.weight) byText.set(a.text, a);
    }
  }
  return [...byText.values()];
}

const CORE_VALUE_KIND: Record<CoreField, ValueKind> = {
  name: 'name',
  key: 'key',
  description: 'longtext',
  owner: 'text',
  domain: 'text',
  parent: 'text',
  lifecycle: 'enum',
  classification: 'enum',
  tags: 'list',
  team: 'text',
  external_id: 'key',
};

const targetCache = new Map<ElementType, TargetSpec[]>();

/** All column targets that make sense for a sheet of the given type, with their aliases. */
export function targetsFor(type: ElementType): TargetSpec[] {
  const cached = targetCache.get(type);
  if (cached) return cached;
  const def = typeDef(type);
  const selfAliases = new Set(def.aliases.map(norm));
  const specs: TargetSpec[] = [];

  for (const core of CORE_FIELDS) {
    const field = core.key as CoreField;
    if (field === 'parent' && !def.hierarchical) continue;
    if (field === 'lifecycle' && !def.hasLifecycle) continue;
    if (field === 'domain' && type === 'domain') continue;
    if (field === 'team' && type === 'team') continue;
    let aliases = mergeAliases(toAliases(core.aliases), toAliases(EXTRA_CORE_ALIASES[field]));
    if (field === 'name') {
      // In an "Applications" sheet a column called "Application" (or "App name") holds the name.
      const own = def.aliases.flatMap((a) => [
        { text: norm(a), weight: 0.95 },
        { text: norm(`${a} name`), weight: 1 },
      ]);
      aliases = mergeAliases(aliases, own);
    }
    specs.push({
      id: `core:${field}`,
      target: { kind: 'core', field },
      aliases,
      valueKind: CORE_VALUE_KIND[field],
      options:
        field === 'lifecycle'
          ? LIFECYCLE_PHASES
          : field === 'classification'
            ? CLASSIFICATIONS
            : undefined,
      multi: false,
    });
  }

  const extraAttr = EXTRA_ATTRIBUTE_ALIASES[type] ?? {};
  for (const attr of def.attributes) {
    if (attr.derived) continue;
    specs.push({
      id: `attr:${attr.key}`,
      target: { kind: 'attribute', key: attr.key },
      aliases: mergeAliases(
        toAliases(attr.aliases ?? []),
        toAliases([attr.key.replace(/_/g, ' '), attr.label]),
        toAliases(extraAttr[attr.key] ?? []),
      ),
      valueKind: attr.kind,
      options: attr.options,
      multi: false,
    });
  }

  const relationDefs: RelationColumnDef[] = [...RELATION_COLUMNS, ...EXTRA_RELATION_COLUMNS];
  const relSpecs = new Map<string, TargetSpec>();
  for (const rc of relationDefs) {
    let targetType = rc.targetType;
    // "Depends on" in a technology sheet points at other technologies.
    if (rc.relation === 'depends_on' && (type === 'technology' || type === 'interface')) targetType = type;
    const adjusted = { ...rc, targetType };
    if (!relationValid(adjusted, type)) continue;
    const id = `rel:${rc.relation}:${rc.direction}:${targetType}`;
    const aliases = toAliases(rc.aliases).map((a) =>
      selfAliases.has(a.text) ? { ...a, weight: a.weight * 0.5 } : a,
    );
    const existing = relSpecs.get(id);
    if (existing) {
      existing.aliases = mergeAliases(existing.aliases, aliases);
      continue;
    }
    relSpecs.set(id, {
      id,
      target: { kind: 'relation', relation: rc.relation, direction: rc.direction, targetType },
      aliases,
      valueKind: 'relation',
      multi: true,
    });
  }
  specs.push(...relSpecs.values());

  if (def.hasLifecycle) {
    for (const phase of LIFECYCLE_PHASES) {
      specs.push({
        id: `lcd:${phase}`,
        target: { kind: 'lifecycle_date', phase },
        aliases: toAliases(LIFECYCLE_DATE_ALIASES[phase]),
        valueKind: 'date',
        multi: false,
      });
    }
  }

  targetCache.set(type, specs);
  return specs;
}

let vocabulary: Set<string> | undefined;

/** Every header word the importer knows, across all types (used to recognise header rows). */
export function headerVocabulary(): Set<string> {
  if (vocabulary) return vocabulary;
  const words = new Set<string>();
  for (const type of ELEMENT_TYPES) {
    for (const spec of targetsFor(type)) for (const a of spec.aliases) words.add(a.text);
    for (const a of typeDef(type).aliases) words.add(norm(a));
  }
  vocabulary = words;
  return words;
}
