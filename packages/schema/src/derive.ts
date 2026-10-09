import type { Element, LifecycleDates } from './element';
import { type Health, LIFECYCLE_PHASES, type LifecyclePhase } from './enums';
import { type ExpectedRelation, type RelationType, typeDef } from './metamodel';

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

/** How many relations of the expected kind(s) an element has. */
export function relationCount(exp: ExpectedRelation, rels: RelationCounts): number {
  const types = Array.isArray(exp.relation) ? exp.relation : [exp.relation];
  let n = 0;
  for (const t of types) {
    if (exp.direction !== 'in') n += rels.out[t] ?? 0;
    if (exp.direction !== 'out') n += rels.in[t] ?? 0;
  }
  return n;
}

interface Expectation extends MissingField {
  filled: boolean;
}

/** Everything a complete element of this type has, and whether this one has it. */
function expectations(el: QualityInput, rels?: RelationCounts): Expectation[] {
  const def = typeDef(el.type);
  const attrs = el.attributes ?? {};
  const list: Expectation[] = [];
  for (const core of def.qualityCore) {
    if (core === 'description')
      list.push({
        field: 'description',
        label: 'Description',
        kind: 'core',
        filled: (el.description ?? '').trim().length >= MIN_DESCRIPTION,
      });
    if (core === 'owner')
      list.push({ field: 'owner', label: 'Owner', kind: 'core', filled: isFilled(el.owner) });
    if (core === 'domain')
      list.push({
        field: 'domainId',
        label: 'Domain',
        kind: 'core',
        filled: isFilled(el.domainId),
      });
    if (core === 'lifecycle')
      list.push({
        field: 'lifecycle',
        label: 'Lifecycle',
        kind: 'core',
        filled: isFilled(el.lifecycle),
      });
  }
  for (const attr of def.attributes) {
    if (!attr.quality || attr.derived) continue;
    if (attr.expectedWhen && !attr.expectedWhen(attrs)) continue;
    if (attr.waivedByIncoming && (rels?.in[attr.waivedByIncoming] ?? 0) > 0) continue;
    list.push({
      field: `attributes.${attr.key}`,
      label: attr.label,
      kind: 'attribute',
      filled: isFilled(attrs[attr.key]),
    });
  }
  if (rels) {
    for (const exp of def.expectedRelations ?? []) {
      if (exp.waivedBy && attrs[exp.waivedBy] === true) continue;
      const key = exp.key ?? (Array.isArray(exp.relation) ? exp.relation[0] : exp.relation);
      list.push({
        field: `relation.${key}`,
        label: exp.label,
        kind: 'relation',
        filled: relationCount(exp, rels) > 0,
      });
    }
  }
  return list;
}

/** Lists the fields that are still empty, in the order a person would want to fill them. */
export function missingFields(el: QualityInput, rels?: RelationCounts): MissingField[] {
  return expectations(el, rels)
    .filter((e) => !e.filled)
    .map(({ field, label, kind }) => ({ field, label, kind }));
}

/** Data quality from 0 to 100: share of expected information that is present. */
export function computeQuality(el: QualityInput, rels?: RelationCounts): number {
  if (el.layer === 'reference') return 100;
  const list = expectations(el, rels);
  const filled = list.filter((e) => e.filled).length;
  // The name always counts.
  return Math.round(((filled + 1) / (list.length + 1)) * 100);
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
  /** End of paid extended support, when the vendor offers it. */
  extendedDate?: string | null;
  /** The organisation pays for that extended support. */
  onExtended?: boolean;
  radar?: string | null;
  lifecycle?: LifecyclePhase | null;
}

export type SupportStatus = 'supported' | 'ending' | 'extended' | 'extendable' | 'ended';

/**
 * Where something stands with its vendor: supported, ending within a year, covered by paid
 * extended support we buy, out of support but extended support could still be bought, or out
 * of support altogether.
 */
export function supportStatus(
  eolDate: string | null | undefined,
  extendedDate: string | null | undefined,
  today: string = todayIso(),
  onExtended = false,
): SupportStatus | null {
  if (!eolDate) return null;
  if (eolDate >= today) return eolDate <= addDays(today, 365) ? 'ending' : 'supported';
  if (extendedDate && extendedDate >= today) return onExtended ? 'extended' : 'extendable';
  return 'ended';
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

  if (el.type === 'technology') {
    const eol = el.attributes?.eol_date as string | undefined;
    const ext = el.attributes?.extended_support_date as string | undefined;
    const radar = el.attributes?.radar as string | undefined;
    const status = supportStatus(eol, ext, today, el.attributes?.extended_support === true);
    if (status === 'ended')
      return { health: 'act', reasons: [`Past end of support (${ext ?? eol})`] };
    if (status === 'extendable')
      return {
        health: 'act',
        reasons: [`Past end of support (${eol}); paid extended support is available until ${ext}`],
      };
    if (status === 'extended')
      return {
        health: 'watch',
        reasons: [`Past end of standard support (${eol}); on extended support until ${ext}`],
      };
    if (status === 'ending') return { health: 'watch', reasons: [`End of support on ${eol}`] };
    if (radar === 'hold') return { health: 'watch', reasons: ['On hold in the technology radar'] };
    if (eol || radar) return { health: 'good', reasons: [] };
    return { health: null, reasons: [] };
  }

  if (el.type !== 'application') return { health: null, reasons: [] };

  const act: string[] = [];
  const watch: string[] = [];
  const ownEol = el.attributes?.eol_date as string | undefined;
  const ownExt = el.attributes?.extended_support_date as string | undefined;
  const own = supportStatus(ownEol, ownExt, today, el.attributes?.extended_support === true);
  if (own === 'ended') act.push(`Vendor support ended (${ownExt ?? ownEol})`);
  else if (own === 'extendable')
    act.push(
      `Vendor support ended (${ownEol}); paid extended support is available until ${ownExt}`,
    );
  else if (own === 'extended') watch.push(`On paid extended vendor support until ${ownExt}`);
  else if (own === 'ending') watch.push(`Vendor support ends on ${ownEol}`);
  const tf = Number(el.attributes?.technical_fit ?? Number.NaN);
  const bf = Number(el.attributes?.business_fit ?? Number.NaN);
  if (tf <= 2) act.push(`Low technical fit (${tf}/5)`);
  else if (tf === 3) watch.push('Average technical fit (3/5)');
  if (bf <= 2) act.push(`Low business fit (${bf}/5)`);
  else if (bf === 3) watch.push('Average business fit (3/5)');
  for (const t of techs) {
    const status = supportStatus(t.eolDate, t.extendedDate, today, t.onExtended);
    if (status === 'ended' || status === 'extendable')
      act.push(`Runs on ${t.name}, past end of support (${t.eolDate})`);
    else if (status === 'extended')
      watch.push(`Runs on ${t.name}, on extended support until ${t.extendedDate}`);
    else if (status === 'ending') watch.push(`Runs on ${t.name}, end of support ${t.eolDate}`);
    if (t.radar === 'hold') watch.push(`Uses ${t.name}, which is on hold`);
  }
  if (act.length) return { health: 'act', reasons: [...act, ...watch] };
  if (watch.length) return { health: 'watch', reasons: watch };
  if (Number.isNaN(tf) && Number.isNaN(bf) && techs.length === 0 && !own)
    return { health: null, reasons: [] };
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
