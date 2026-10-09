import { ELEMENT_TYPES, type ElementType, similarity, typeDef } from '@atrium/schema';
import { containsPhrase, humanList, norm, stripBrackets } from './text';
import type { ParsedSheet, TypeDetection } from './types';

type Signal = [phrase: string, weight: number];

/** Extra sheet names that identify a type, on top of each type's schema aliases. */
const SHEET_ALIASES: Partial<Record<ElementType, string[]>> = {
  application: [
    'application inventory',
    'app inventory',
    'application landscape',
    'application portfolio',
    'app portfolio',
    'cmdb',
    'apm',
    'it landscape',
    'applicaties',
    'systeme',
    'software',
  ],
  technology: [
    'tech radar',
    'radar',
    'tech stack',
    'infrastructure',
    'middleware',
    'databases',
    'tooling',
  ],
  capability: [
    'capability map',
    'bcm',
    'business capability map',
    'capability model',
    'capabilities map',
  ],
  data_object: [
    'data dictionary',
    'data catalog',
    'data catalogue',
    'data model',
    'information objects',
    'business objects',
  ],
  interface: [
    'interface catalog',
    'interface catalogue',
    'integration catalog',
    'data flows',
    'flows',
    'interfaces list',
  ],
  initiative: ['project portfolio', 'programs', 'programmes', 'change portfolio', 'investments'],
  team: ['organisation', 'organization', 'org', 'owners', 'org chart'],
  domain: ['business units', 'business areas'],
  decision: ['architecture decisions', 'decision log', 'adr log'],
};

/** Words that only hint at "a list of applications" when nothing else matches. */
const GENERIC_SHEET_WORDS = [
  'portfolio',
  'inventory',
  'landscape',
  'catalog',
  'catalogue',
  'register',
  'overview',
  'list',
];

/** Header words that point at a type (beyond attribute aliases, which are added automatically). */
const HEADER_SIGNALS: Record<ElementType, Signal[]> = {
  application: [
    ['application name', 4],
    ['app name', 4],
    ['system name', 3],
    ['application owner', 2],
    ['app owner', 2],
    ['it owner', 1],
    ['number of users', 1],
    ['sla', 1],
    ['license', 0.5],
    ['licence', 0.5],
    ['contract', 0.5],
    ['go live', 1.5],
    ['go live date', 1.5],
    ['depends on', 1],
    ['capability', 0.5],
    ['capabilities', 0.5],
    ['interfaces', 0.5],
    ['retirement date', 1],
    ['decommission date', 1],
  ],
  technology: [
    ['technology name', 4],
    ['tech name', 4],
    ['component name', 3],
    ['end of life', 2],
    ['eol', 2],
    ['support end', 2],
    ['release date', 1],
    ['ring', 2],
    ['quadrant', 2],
  ],
  capability: [
    ['capability name', 4],
    ['capability', 0.5],
    ['parent', 1.5],
    ['parent capability', 3],
    ['capability owner', 2],
    ['maturity', 1],
  ],
  business_process: [
    ['process name', 4],
    ['process owner', 2.5],
    ['kpi', 2],
    ['steps', 1.5],
    ['inputs', 1],
    ['outputs', 1],
    ['trigger', 1],
    ['volume', 1],
    ['parent process', 3],
  ],
  interface: [
    ['interface name', 4],
    ['api name', 4],
    ['integration name', 4],
    ['protocol', 3],
    ['source system', 2],
    ['target system', 2],
    ['source', 1.5],
    ['target', 1.5],
    ['provider', 2],
    ['consumer', 2],
    ['endpoint', 2],
    ['payload', 2],
    ['message format', 2],
    ['format', 1],
    ['direction', 1],
    ['from system', 2],
    ['to system', 2],
  ],
  data_object: [
    ['data object', 4],
    ['entity name', 4],
    ['data object name', 4],
    ['entity', 2],
    ['pii', 2],
    ['gdpr', 2],
    ['data owner', 2],
    ['data steward', 2],
    ['attributes', 1],
    ['fields', 1],
    ['system of record', 2],
  ],
  initiative: [
    ['project name', 4],
    ['initiative name', 4],
    ['programme name', 4],
    ['start', 2],
    ['end', 2],
    ['start date', 2],
    ['end date', 1.5],
    ['due', 1.5],
    ['milestone', 1.5],
    ['deadline', 1.5],
    ['sponsor', 2],
    ['progress', 2],
    ['project manager', 2],
  ],
  principle: [
    ['principle', 3],
    ['principle name', 4],
    ['rationale', 3],
    ['implications', 3],
    ['statement', 1],
  ],
  standard: [
    ['standard', 3],
    ['standard name', 4],
    ['rule', 2],
    ['obligation', 2],
    ['effect', 1.5],
    ['compliance', 1],
  ],
  decision: [
    ['decision', 3],
    ['adr', 3],
    ['context', 2],
    ['consequences', 3],
    ['decided', 2],
    ['options considered', 2],
    ['outcome', 1.5],
    ['decision date', 2],
  ],
  team: [
    ['team name', 4],
    ['email', 1.5],
    ['slack', 2],
    ['channel', 1.5],
    ['members', 2],
    ['team lead', 2],
    ['manager', 1],
    ['headcount', 2],
    ['cost center', 1],
  ],
  domain: [
    ['domain name', 4],
    ['domain owner', 2],
    ['domain lead', 2],
  ],
  contract: [
    ['contract name', 4],
    ['agreement name', 4],
    ['licence name', 4],
    ['license name', 4],
    ['contract value', 3],
    ['contract number', 3],
    ['contract end', 3],
    ['renewal date', 3],
    ['notice period', 3],
    ['licensor', 2],
    ['term', 1],
    ['covers', 2],
    ['covered applications', 3],
  ],
};

const LEVEL_RE = /(?:^|\s)(?:level|lvl|lv|l)\s?\d(?=\s|$)/;

interface Evidence {
  score: number;
  sheet?: string;
  columns: string[];
}

function addColumn(e: Evidence, header: string, weight: number) {
  e.score += weight;
  if (!e.columns.includes(header)) e.columns.push(header);
}

/**
 * Guesses which element type a sheet holds, from the sheet name, the column headers and
 * hierarchy columns. Falls back to applications, the most common import.
 */
export function detectElementType(sheet: ParsedSheet): TypeDetection {
  const evidence = Object.fromEntries(
    ELEMENT_TYPES.map((t) => [t, { score: 0, columns: [] } as Evidence]),
  ) as Record<ElementType, Evidence>;

  // Sheet (or file) name.
  const sheetName = norm(sheet.name.replace(/\d{4}/g, ' '));
  let sheetMatched = false;
  for (const type of ELEMENT_TYPES) {
    const names = [...typeDef(type).aliases, ...(SHEET_ALIASES[type] ?? [])].map(norm);
    let best = 0;
    for (const alias of names) {
      if (!alias) continue;
      if (sheetName === alias) best = Math.max(best, 5);
      else if (containsPhrase(sheetName, alias))
        best = Math.max(best, 3 + Math.min(1, alias.length / 12));
      else if (alias.length >= 5 && similarity(sheetName, alias) >= 0.8) best = Math.max(best, 3);
    }
    if (best > 0) {
      evidence[type].score += best;
      evidence[type].sheet = sheet.name;
      sheetMatched = true;
    }
  }
  if (!sheetMatched && GENERIC_SHEET_WORDS.some((w) => containsPhrase(sheetName, w))) {
    evidence.application.score += 2;
    evidence.application.sheet = sheet.name;
  }

  // Column headers.
  const headers = sheet.headers.map((h) => ({ raw: h, n: norm(stripBrackets(h)) || norm(h) }));
  const attributeTypes = attributeAliasIndex();
  for (const type of ELEMENT_TYPES) {
    const e = evidence[type];
    const usedSignals = new Set<string>();
    for (const { raw, n } of headers) {
      for (const [phrase, weight] of HEADER_SIGNALS[type]) {
        if (usedSignals.has(phrase)) continue;
        if (
          n === phrase ||
          (phrase.length >= 4 && containsPhrase(n, phrase) && n.split(' ').length <= 4)
        ) {
          usedSignals.add(phrase);
          addColumn(e, raw, weight);
        }
      }
    }
  }
  // Attribute aliases: shared aliases (such as "vendor") count for every type that has them, split.
  for (const { raw, n } of headers) {
    const hits = new Map<ElementType, number>();
    for (const [alias, types] of attributeTypes) {
      if (n === alias || (alias.length >= 4 && containsPhrase(n, alias))) {
        for (const t of types) hits.set(t, Math.max(hits.get(t) ?? 0, 2.5 / types.size));
      }
    }
    for (const [t, w] of hits) addColumn(evidence[t], raw, w);
  }
  // The first column being called after a type ("Capability", "Interface") names that type.
  const first = headers[0];
  if (first) {
    for (const type of ELEMENT_TYPES) {
      if (typeDef(type).aliases.some((a) => norm(a) === first.n))
        addColumn(evidence[type], first.raw, 2.5);
    }
  }
  // Two or more "Level n" columns: a capability (or process) map.
  const levelColumns = headers.filter((h) => LEVEL_RE.test(h.n));
  if (levelColumns.length >= 2) {
    const target = headers.some((h) => containsPhrase(h.n, 'process'))
      ? 'business_process'
      : 'capability';
    for (const h of levelColumns) addColumn(evidence[target], h.raw, 0);
    evidence[target].score += 4;
  }

  const ranked = ELEMENT_TYPES.map((t) => [t, evidence[t].score] as const).sort(
    (a, b) => b[1] - a[1],
  );
  const [bestType, best] = ranked[0]!;
  const second = ranked[1]![1];
  if (best < 1.5) {
    return {
      type: 'application',
      confidence: 0.3,
      reason: 'No clear signals in the sheet name or columns, so assuming a list of applications',
    };
  }
  const confidence = (1 - Math.exp(-best / 4)) * (0.5 + (0.5 * (best - second)) / best);
  return {
    type: bestType,
    confidence: Math.round(Math.min(0.99, Math.max(0.05, confidence)) * 100) / 100,
    reason: explain(bestType, evidence[bestType]),
  };
}

function explain(type: ElementType, e: Evidence): string {
  const parts: string[] = [];
  if (e.sheet) parts.push(`the sheet name "${e.sheet}"`);
  if (e.columns.length) {
    const cols = e.columns.slice(0, 4).map((c) => `"${c}"`);
    const more = e.columns.length > 4 ? ' and more' : '';
    parts.push(
      `${e.columns.length === 1 ? 'the column' : 'the columns'} ${humanList(cols)}${more}`,
    );
  }
  return `Looks like ${typeDef(type).plural.toLowerCase()}, based on ${humanList(parts)}`;
}

let aliasIndex: Map<string, Set<ElementType>> | undefined;

/** attribute alias → the types that have an attribute with that alias. */
function attributeAliasIndex(): Map<string, Set<ElementType>> {
  if (aliasIndex) return aliasIndex;
  const index = new Map<string, Set<ElementType>>();
  for (const type of ELEMENT_TYPES) {
    for (const attr of typeDef(type).attributes) {
      for (const alias of [...(attr.aliases ?? []), attr.label]) {
        const a = norm(alias);
        // Generic words that also appear in other contexts are left to HEADER_SIGNALS.
        if (!a || GENERIC_ATTRIBUTE_WORDS.has(a)) continue;
        if (!index.has(a)) index.set(a, new Set());
        index.get(a)!.add(type);
      }
    }
  }
  aliasIndex = index;
  return index;
}

const GENERIC_ATTRIBUTE_WORDS = new Set([
  'type',
  'status',
  'state',
  'date',
  'from',
  'to',
  'kind',
  'level',
  'area',
  'release',
  'link',
  'url',
  'technology',
  'technologies',
  'match',
  'decision',
  'impact',
  'outcome',
  'problem',
  'why',
  'critical',
  'strategy',
  'cloud',
  'cost',
  'costs',
  'priority',
  'schedule',
  'spec',
  'data',
]);
