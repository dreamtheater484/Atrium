import {
  CLASSIFICATIONS,
  CRITICALITY,
  DATA_SENSITIVITY,
  DECISION_STATUS,
  ENUM_LABELS,
  HOSTING,
  IMPORTANCE,
  INITIATIVE_STATUS,
  INTERFACE_FREQUENCY,
  INTERFACE_PROTOCOLS,
  LIFECYCLE_PHASES,
  RADAR_RINGS,
  STANDARD_CATEGORY,
  STANDARD_EFFECT,
  STANDARD_LEVEL,
  TECH_CATEGORIES,
  TIME_RATINGS,
  similarity,
} from '@atrium/schema';
import { containsPhrase, norm } from './text';

export type EnumFamily =
  | 'lifecycle'
  | 'classification'
  | 'criticality'
  | 'importance'
  | 'hosting'
  | 'time'
  | 'radar'
  | 'sensitivity'
  | 'initiative_status'
  | 'decision_status'
  | 'protocol'
  | 'frequency'
  | 'tech_category'
  | 'standard_level'
  | 'standard_effect'
  | 'standard_category';

const FAMILY_BY_OPTIONS = new Map<readonly string[], EnumFamily>([
  [LIFECYCLE_PHASES, 'lifecycle'],
  [CLASSIFICATIONS, 'classification'],
  [CRITICALITY, 'criticality'],
  [IMPORTANCE, 'importance'],
  [HOSTING, 'hosting'],
  [TIME_RATINGS, 'time'],
  [RADAR_RINGS, 'radar'],
  [DATA_SENSITIVITY, 'sensitivity'],
  [INITIATIVE_STATUS, 'initiative_status'],
  [DECISION_STATUS, 'decision_status'],
  [INTERFACE_PROTOCOLS, 'protocol'],
  [INTERFACE_FREQUENCY, 'frequency'],
  [TECH_CATEGORIES, 'tech_category'],
  [STANDARD_LEVEL, 'standard_level'],
  [STANDARD_EFFECT, 'standard_effect'],
  [STANDARD_CATEGORY, 'standard_category'],
]);

/** The synonym family for an attribute's option list (matched by identity with the schema enums). */
export function enumFamilyFor(options: readonly string[] | undefined): EnumFamily | undefined {
  return options ? FAMILY_BY_OPTIONS.get(options) : undefined;
}

/** Words people use in spreadsheets for each enum value. Matched after normalisation. */
const SYNONYMS: Record<EnumFamily, Record<string, string[]>> = {
  lifecycle: {
    plan: [
      'planned', 'planning', 'idea', 'proposed', 'proposal', 'future', 'candidate', 'evaluation',
      'evaluating', 'concept', 'backlog', 'to be', 'requested', 'roadmap', 'new', 'draft', 'gepland',
    ],
    build: [
      'building', 'in development', 'development', 'dev', 'pilot', 'piloting', 'implementation',
      'implementing', 'being implemented', 'in implementation', 'in progress', 'poc',
      'proof of concept', 'beta', 'alpha', 'experimental', 'testing', 'in test', 'under construction',
      'onboarding', 'trial', 'preview', 'introduction', 'in build', 'pre production', 'preprod',
      'staging', 'ontwikkeling', 'in ontwikkeling',
    ],
    active: [
      'live', 'production', 'in production', 'prod', 'operational', 'in use', 'running', 'current',
      'go live', 'deployed', 'available', 'ga', 'generally available', 'maintained', 'supported',
      'stable', 'mature', 'in service', 'operate', 'operating', 'enabled', 'actief', 'in gebruik',
      'productie', 'in betrieb', 'produktiv',
    ],
    phase_out: [
      'phase out', 'phasing out', 'phased out', 'sunset', 'sunsetting', 'deprecated', 'deprecating',
      'being retired', 'retiring', 'to be retired', 'to retire', 'planned retirement',
      'retirement planned', 'decommissioning', 'to be decommissioned', 'end of support', 'declining',
      'wind down', 'winding down', 'outphasing', 'uitfaseren', 'uitfasering', 'contain', 'contained',
    ],
    retired: [
      'retired', 'decommissioned', 'end of life', 'eol', 'shut down', 'shutdown', 'switched off',
      'archived', 'removed', 'terminated', 'dead', 'obsolete', 'discontinued', 'inactive',
      'sunsetted', 'closed', 'disabled', 'gone', 'uitgefaseerd', 'buiten gebruik',
    ],
  },
  classification: {
    public: ['open', 'unclassified', 'external', 'c0', 'tlp white', 'tlp clear', 'openbaar', 'none'],
    internal: ['internal use', 'internal only', 'company internal', 'c1', 'tlp green', 'intern', 'bedrijfsvertrouwelijk'],
    confidential: ['sensitive', 'private', 'c2', 'tlp amber', 'vertrouwelijk', 'company confidential'],
    restricted: [
      'secret', 'top secret', 'strictly confidential', 'highly confidential', 'very sensitive',
      'c3', 'c4', 'tlp red', 'geheim', 'strikt vertrouwelijk', 'highly restricted',
    ],
  },
  criticality: {
    mission_critical: [
      'critical', 'business critical', 'tier 0', 'tier 1', 'very high', 'vital', 'essential',
      'crown jewel', 'crown jewels', 'platinum', 'mission-critical', 'bedrijfskritisch', 'kritiek',
      'zeer hoog', 'p1', 'c1', 'tier1', 'tier0',
    ],
    high: ['important', 'tier 2', 'tier2', 'major', 'significant', 'h', 'hoog', 'gold', 'p2', 'c2'],
    medium: ['moderate', 'normal', 'tier 3', 'tier3', 'standard', 'average', 'm', 'med', 'mid', 'gemiddeld', 'silver', 'p3', 'c3'],
    low: [
      'minor', 'tier 4', 'tier4', 'tier 5', 'non critical', 'not critical', 'noncritical', 'l',
      'minimal', 'negligible', 'laag', 'bronze', 'p4', 'c4', 'very low',
    ],
  },
  importance: {
    high: ['critical', 'core', 'strategic', 'differentiating', 'key', 'very high', 'essential', 'hoog', 'h'],
    medium: ['moderate', 'normal', 'supporting', 'important', 'gemiddeld', 'm', 'med'],
    low: ['commodity', 'minor', 'non core', 'very low', 'laag', 'l'],
  },
  hosting: {
    public_cloud: [
      'cloud', 'aws', 'amazon', 'amazon web services', 'azure', 'microsoft azure', 'gcp',
      'google cloud', 'iaas', 'paas', 'ec2', 'eks', 'aks', 'gke', 'oracle cloud', 'oci', 'ibm cloud',
      'alibaba cloud', 'public',
    ],
    private_cloud: ['vmware', 'openstack', 'internal cloud', 'private', 'openshift', 'hybrid cloud', 'hybrid'],
    on_premise: [
      'on premise', 'on premises', 'on prem', 'onprem', 'on site', 'onsite', 'datacenter',
      'data center', 'data centre', 'dc', 'in house', 'local', 'self hosted', 'own datacenter',
      'mainframe', 'physical', 'server room', 'internal', 'eigen datacenter', 'lokaal',
    ],
    saas: [
      'software as a service', 'vendor hosted', 'hosted by vendor', 'externally hosted', 'hosted',
      'external', 'managed service', 'asp', 'm365', 'office 365', 'microsoft 365', 'cloud saas',
      'saas cloud', 'public cloud saas', 'subscription',
    ],
  },
  time: {
    tolerate: ['t', 'keep', 'maintain', 'sustain', 'contain', 'tolerated', 'tolereren'],
    invest: ['i', 'grow', 'evolve', 'enhance', 'strategic', 'expand', 'invested', 'investeren'],
    migrate: ['m', 'replace', 'modernize', 'modernise', 're platform', 'replatform', 'move', 'consolidate', 'transform', 'migreren'],
    eliminate: ['e', 'retire', 'decommission', 'remove', 'kill', 'sunset', 'divest', 'eliminated', 'elimineren', 'phase out'],
  },
  radar: {
    adopt: ['standard', 'approved', 'recommended', 'preferred', 'strategic', 'use', 'adopted', 'mainstream'],
    trial: ['pilot', 'experiment', 'experimental', 'piloting', 'trialling', 'trialing'],
    assess: ['evaluate', 'evaluating', 'explore', 'investigate', 'research', 'assessing', 'emerging'],
    hold: [
      'avoid', 'deprecated', 'do not use', 'dont use', 'stop', 'retire', 'legacy', 'forbidden',
      'not allowed', 'contain', 'sunset', 'phase out', 'banned', 'prohibited', 'on hold',
    ],
  },
  sensitivity: {
    none: ['public', 'no', 'non sensitive', 'not sensitive', 'nonsensitive', 'open', 'geen'],
    personal: ['personal data', 'pii', 'gdpr', 'personal information', 'persoonsgegevens', 'yes'],
    sensitive_personal: [
      'sensitive personal', 'special category', 'special categories', 'health', 'medical',
      'biometric', 'spi', 'phi', 'bijzondere persoonsgegevens', 'sensitive pii',
    ],
    financial: ['finance', 'pci', 'payment', 'payments', 'cardholder', 'card data', 'banking', 'financieel'],
    secret: ['top secret', 'classified', 'trade secret', 'restricted', 'geheim', 'confidential'],
  },
  initiative_status: {
    planned: ['plan', 'not started', 'proposed', 'idea', 'backlog', 'new', 'draft', 'to do', 'todo', 'scheduled', 'upcoming', 'gepland'],
    running: [
      'in progress', 'active', 'ongoing', 'started', 'executing', 'in flight', 'wip', 'open', 'green',
      'amber', 'red', 'at risk', 'on track', 'in uitvoering', 'lopend', 'delayed',
    ],
    done: ['completed', 'complete', 'finished', 'closed', 'delivered', 'live', 'implemented', 'afgerond', 'klaar'],
    on_hold: ['paused', 'hold', 'suspended', 'blocked', 'parked', 'deferred', 'postponed', 'gepauzeerd'],
    cancelled: ['canceled', 'stopped', 'abandoned', 'rejected', 'terminated', 'killed', 'geannuleerd', 'dropped'],
  },
  decision_status: {
    proposed: ['draft', 'open', 'pending', 'under review', 'in review', 'proposal', 'new'],
    accepted: ['approved', 'agreed', 'decided', 'adopted', 'final', 'active', 'goedgekeurd'],
    superseded: ['replaced', 'obsolete', 'deprecated', 'outdated'],
    rejected: ['declined', 'denied', 'refused', 'afgewezen'],
  },
  protocol: {
    rest: ['http', 'https', 'json', 'restful', 'rest api', 'openapi', 'swagger', 'web api', 'api', 'rest json', 'http json'],
    graphql: ['gql', 'graph ql'],
    grpc: ['protobuf', 'protocol buffers', 'g rpc'],
    soap: ['wsdl', 'xml web service', 'web service', 'webservice', 'soap xml'],
    event: [
      'events', 'kafka', 'mq', 'queue', 'message', 'messages', 'messaging', 'amqp', 'jms', 'pub sub',
      'pubsub', 'asyncapi', 'stream', 'streaming', 'webhook', 'webhooks', 'rabbitmq', 'event bus',
      'eventbridge', 'sns', 'sqs', 'service bus', 'mqtt', 'ibm mq', 'event driven', 'async',
    ],
    file: ['sftp', 'ftp', 'ftps', 'csv', 'flat file', 'batch file', 'edi', 'xml file', 's3', 'file transfer', 'files', 'excel'],
    database: ['db', 'jdbc', 'odbc', 'sql', 'db link', 'dblink', 'direct db', 'database link', 'shared database'],
  },
  frequency: {
    realtime: [
      'real time', 'realtime', 'online', 'synchronous', 'sync', 'instant', 'live', 'streaming',
      'continuous', 'event driven', 'on event', 'immediate', 'near real time', 'nrt',
    ],
    hourly: ['every hour', 'per hour', '1h', 'hour', 'uurlijks'],
    daily: ['nightly', 'every day', 'once a day', 'per day', 'eod', 'end of day', 'dagelijks', 'night'],
    batch: ['weekly', 'monthly', 'quarterly', 'periodic', 'scheduled', 'yearly', 'annually', 'wekelijks', 'maandelijks'],
    on_demand: ['ad hoc', 'adhoc', 'manual', 'on request', 'as needed', 'when needed', 'on demand', 'request response'],
  },
  tech_category: {
    language: ['programming language', 'lang', 'languages'],
    runtime: ['jvm', 'jre', 'interpreter', 'runtimes', 'execution environment'],
    framework: ['library', 'lib', 'sdk', 'frameworks', 'libraries'],
    database: ['db', 'rdbms', 'nosql', 'datastore', 'data store', 'dbms', 'databases', 'cache'],
    os: ['operating system', 'linux', 'windows', 'unix', 'operating systems'],
    platform: ['container platform', 'kubernetes', 'k8s', 'platforms', 'paas'],
    middleware: [
      'esb', 'message broker', 'broker', 'integration', 'app server', 'application server',
      'web server', 'queue', 'kafka topic', 'topic', 'messaging',
    ],
    cloud_service: ['cloud', 'managed service', 'aws service', 'azure service', 'saas', 's3', 's3 bucket', 'bucket', 'lambda', 'storage', 'cloud storage', 'blob storage'],
    tool: ['tooling', 'devtool', 'ide', 'utility', 'tools'],
    other: ['misc', 'miscellaneous'],
  },
  standard_level: {
    must: ['mandatory', 'required', 'shall', 'obligatory', 'compulsory', 'verplicht'],
    should: ['recommended', 'optional', 'advisory', 'preferred', 'may', 'guideline', 'aanbevolen'],
  },
  standard_effect: {
    require: ['required', 'mandatory', 'must use'],
    prefer: ['preferred', 'recommended'],
    forbid: ['forbidden', 'prohibited', 'banned', 'not allowed', 'do not use', 'deny', 'denied'],
    guideline: ['guidance', 'advice', 'informational', 'info'],
  },
  standard_category: {
    technology: ['tech', 'technical'],
    security: ['sec', 'infosec', 'cyber', 'cyber security'],
    integration: ['api', 'interfaces', 'apis'],
    data: ['information', 'data management'],
    process: ['ways of working', 'governance'],
    cloud: ['cloud native'],
  },
};

interface Phrase {
  text: string;
  compact: string;
  value: string;
}

const phraseCache = new Map<string, Phrase[]>();

function phrasesFor(options: readonly string[], family: EnumFamily | undefined): Phrase[] {
  const cacheKey = `${family ?? ''}|${options.join(',')}`;
  const cached = phraseCache.get(cacheKey);
  if (cached) return cached;
  const phrases: Phrase[] = [];
  const add = (text: string, value: string) => {
    const t = norm(text);
    if (t) phrases.push({ text: t, compact: t.replace(/ /g, ''), value });
  };
  for (const option of options) {
    add(option.replace(/_/g, ' '), option);
    const label = ENUM_LABELS[option];
    if (label) add(label, option);
  }
  if (family) {
    for (const [value, words] of Object.entries(SYNONYMS[family])) {
      if (!options.includes(value)) continue;
      for (const w of words) add(w, value);
    }
  }
  phraseCache.set(cacheKey, phrases);
  return phrases;
}

export interface EnumMatch {
  value: string;
  /** True when the value was guessed by similarity rather than recognised. */
  fuzzy: boolean;
}

/**
 * Finds the enum option a messy value means. Tries, in order: exact option/label/synonym,
 * a synonym contained in the value ("Live since 2019" → active), then trigram similarity.
 */
export function matchEnum(
  raw: unknown,
  options: readonly string[],
  family?: EnumFamily,
): EnumMatch | undefined {
  if (raw === null || raw === undefined) return undefined;
  let text = typeof raw === 'string' ? raw : String(raw);
  // Criticality written as a tier number ("1" = most critical).
  if (family === 'criticality' && /^\s*[0-4]\s*$/.test(text)) text = `tier ${text.trim()}`;
  const s = norm(text);
  if (!s) return undefined;
  const sCompact = s.replace(/ /g, '');
  const phrases = phrasesFor(options, family);

  for (const p of phrases) if (p.text === s) return { value: p.value, fuzzy: false };
  for (const p of phrases) if (p.compact === sCompact) return { value: p.value, fuzzy: false };

  let best: Phrase | undefined;
  for (const p of phrases) {
    if (p.text.length < 3) continue;
    if (containsPhrase(s, p.text) && (!best || p.text.length > best.text.length)) best = p;
  }
  if (best) return { value: best.value, fuzzy: false };

  if (s.length >= 3) {
    let bestScore = 0;
    let bestValue: string | undefined;
    for (const p of phrases) {
      if (p.text.length < 3) continue;
      const score = similarity(s, p.text);
      if (score > bestScore) {
        bestScore = score;
        bestValue = p.value;
      }
    }
    if (bestValue && bestScore >= 0.6) return { value: bestValue, fuzzy: true };
  }
  return undefined;
}

/** Reads a lifecycle phase from words such as "in production", "decommissioned" or "pilot". */
export function parseLifecycle(raw: unknown): EnumMatch | undefined {
  return matchEnum(raw, LIFECYCLE_PHASES, 'lifecycle');
}

/** Reads a classification from words such as "C2", "Company confidential" or "TLP:RED". */
export function parseClassification(raw: unknown): EnumMatch | undefined {
  return matchEnum(raw, CLASSIFICATIONS, 'classification');
}

/** Options joined as human labels, for warnings. */
export function optionLabels(options: readonly string[]): string {
  return options.map((o) => ENUM_LABELS[o] ?? o).join(', ');
}

