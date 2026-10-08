import type { Element, LifecycleDates } from './element';
import { LIFECYCLE_PHASES, type Health, type LifecyclePhase } from './enums';
import { type RelationType, typeDef } from './metamodel';

export interface RelationCounts {
  out: Partial<Record<RelationType, number>>;
  in: Partial<Record<RelationType, number>>;
}

export interface MissingField {
  field: string;
  label: string;
  /** "core", "attribute" or "relation" */
  kind: 'core' | 'attribute' | 'relation';
}

const MIN_DESCRIPTION = 15;

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

type QualityInput = Pick<
  Element,
  'type' | 'description' | 'owner' | 'domainId' | 'lifecycle' | 'attributes' | 'layer'
>;

/** Lists the fields that are still empty, in the order a person would want to fill them. */
export function missingFields(el: QualityInput, rels?: RelationCounts): MissingField[] {
  const def = typeDef(el.type);
  const missing: MissingField[] = [];
  for (const core of def.qualityCore) {
    if (core === 'description' && (el.description ?? '').trim().length < MIN_DESCRIPTION) {
      missing.push({ field: 'description', label: 'Description', kind: 'core' });
    }
    if (core === 'owner' && !isFilled(el.owner)) {
      missing.push({ field: 'owner', label: 'Owner', kind: 'core' });
    }
    if (core === 'domain' && !isFilled(el.domainId)) {
      missing.push({ field: 'domainId', label: 'Domain', kind: 'core' });
    }
    if (core === 'lifecycle' && !isFilled(el.lifecycle)) {
      missing.push({ field: 'lifecycle', label: 'Lifecycle', kind: 'core' });
    }
  }
  for (const attr of def.attributes) {
    if (attr.quality && !attr.derived && !isFilled(el.attributes?.[attr.key])) {
      missing.push({ field: `attributes.${attr.key}`, label: attr.label, kind: 'attribute' });
    }
  }
  if (rels) {
    for (const exp of def.expectedRelations ?? []) {
      const n = (exp.direction === 'out' ? rels.out : rels.in)[exp.relation] ?? 0;
      if (n === 0) missing.push({ field: `relation.${exp.relation}`, label: exp.label, kind: 'relation' });
    }
  }
  return missing;
}

/** Data quality from 0 to 100: share of expected information that is present. */
export function computeQuality(el: QualityInput, rels?: RelationCounts): number {
  if (el.layer === 'reference') return 100;
  const def = typeDef(el.type);
  const expected =
    def.qualityCore.length +
    def.attributes.filter((a) => a.quality && !a.derived).length +
    (rels ? (def.expectedRelations?.length ?? 0) : 0) +
    1; // the name always counts
  const missing = missingFields(el, rels).length;
  return Math.round(((expected - missing) / expected) * 100);
}

/** The lifecycle phase at a given date, worked out from the phase dates when they exist. */
export function lifecycleAt(
  lifecycle: LifecyclePhase | null,
  dates: LifecycleDates | undefined,
  at: string,
): LifecyclePhase | null | 'not_yet' {
  const entries = LIFECYCLE_PHASES.filter((p) => dates?.[p]).map((p) => [p, dates![p]!] as const);
  if (entries.length === 0) return lifecycle;
  let current: LifecyclePhase | null = null;
  for (const [phase, date] of entries) {
    if (date <= at) current = phase;
  }
  if (current === null) {
    // Before the first known date: the element does not exist yet (unless only later phases are dated).
    return entries[0]![0] === 'plan' || entries[0]![0] === 'build' || entries[0]![0] === 'active'
      ? 'not_yet'
      : lifecycle;
  }
  return current;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  return addDays(iso, days);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface TechSignal {
  name: string;
  eolDate?: string | null;
  radar?: string | null;
  lifecycle?: LifecyclePhase | null;
}

export interface HealthResult {
  health: Health | null;
  reasons: string[];
}

/**
 * Health is derived, never typed in: it combines fit ratings, the technologies an
 * application runs on (end of life, radar) and its lifecycle.
 */
export function computeHealth(
  el: Pick<Element, 'type' | 'attributes' | 'lifecycle'>,
  techs: TechSignal[] = [],
  today: string = todayIso(),
): HealthResult {
  if (el.lifecycle === 'retired') return { health: null, reasons: [] };
  const soon = addDays(today, 365);

  if (el.type === 'technology') {
    const eol = el.attributes?.eol_date as string | undefined;
    const radar = el.attributes?.radar as string | undefined;
    if (eol && eol < today) return { health: 'act', reasons: [`Past end of life (${eol})`] };
    if (eol && eol <= soon) return { health: 'watch', reasons: [`End of life on ${eol}`] };
    if (radar === 'hold') return { health: 'watch', reasons: ['On hold in the technology radar'] };
    if (eol || radar) return { health: 'good', reasons: [] };
    return { health: null, reasons: [] };
  }

  if (el.type !== 'application') return { health: null, reasons: [] };

  const act: string[] = [];
  const watch: string[] = [];
  const tf = Number(el.attributes?.technical_fit ?? Number.NaN);
  const bf = Number(el.attributes?.business_fit ?? Number.NaN);
  if (tf <= 2) act.push(`Low technical fit (${tf}/5)`);
  else if (tf === 3) watch.push('Average technical fit (3/5)');
  if (bf <= 2) act.push(`Low business fit (${bf}/5)`);
  else if (bf === 3) watch.push('Average business fit (3/5)');
  for (const t of techs) {
    if (t.eolDate && t.eolDate < today) act.push(`Runs on ${t.name}, past end of life (${t.eolDate})`);
    else if (t.eolDate && t.eolDate <= soon) watch.push(`Runs on ${t.name}, end of life ${t.eolDate}`);
    if (t.radar === 'hold') watch.push(`Uses ${t.name}, which is on hold`);
  }
  if (act.length) return { health: 'act', reasons: [...act, ...watch] };
  if (watch.length) return { health: 'watch', reasons: watch };
  if (Number.isNaN(tf) && Number.isNaN(bf) && techs.length === 0) return { health: null, reasons: [] };
  return { health: 'good', reasons: [] };
}

/** Normalises a name for matching: lower case, no punctuation, single spaces. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Turns a name into a stable key, e.g. "Billing Service" → "billing-service". */
export function slugify(name: string): string {
  return normalizeName(name).replace(/ /g, '-').slice(0, 80);
}

/** Trigram similarity (0..1), the same idea as Postgres pg_trgm, for client-side matching. */
export function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const set = new Set<string>();
    for (const word of normalizeName(s).split(' ')) {
      const padded = `  ${word} `;
      for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
    }
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared++;
  return shared / (ga.size + gb.size - shared);
}
