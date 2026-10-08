import { type ElementType, similarity, typeDef } from '@atrium/schema';
import { enumFamilyFor, matchEnum } from './enum-synonyms';
import { containsPhrase, norm, stripBrackets } from './text';
import type { ColumnTarget, ParsedSheet, SheetMapping } from './types';
import {
  isBlank,
  looksLikeDate,
  parseBoolean,
  parseMoney,
  parsePercent,
  parseRating,
  toText,
} from './values';
import { type Alias, type TargetSpec, targetsFor } from './vocabulary';

/* ------------------------------------------------------------------ */
/* Column profiles (what the values in a column look like)              */
/* ------------------------------------------------------------------ */

export interface ColumnProfile {
  /** Non-empty values. */
  count: number;
  /** Rows in the sheet. */
  rows: number;
  /** Share of distinct values among the non-empty ones. */
  distinctRatio: number;
  numericRatio: number;
  dateRatio: number;
  avgLength: number;
  /** Up to 100 non-empty values. */
  values: unknown[];
}

const SAMPLE = 100;

function isNumericLike(v: unknown): boolean {
  if (typeof v === 'number') return true;
  return typeof v === 'string' && /^[-+]?[\d\s.,']+$/.test(v.trim()) && /\d/.test(v);
}

export function profileColumn(sheet: ParsedSheet, header: string): ColumnProfile {
  const values: unknown[] = [];
  let count = 0;
  const distinct = new Set<string>();
  for (const row of sheet.rows) {
    const v = row[header];
    if (isBlank(v)) continue;
    count++;
    distinct.add(norm(toText(v)));
    if (values.length < SAMPLE) values.push(v);
  }
  const n = values.length || 1;
  return {
    count,
    rows: sheet.rows.length,
    distinctRatio: count ? distinct.size / count : 0,
    numericRatio: values.filter(isNumericLike).length / n,
    dateRatio: values.filter(looksLikeDate).length / n,
    avgLength: values.reduce<number>((sum, v) => sum + toText(v).length, 0) / n,
    values,
  };
}

function ratio(values: unknown[], test: (v: unknown) => boolean): number {
  if (!values.length) return 0;
  return values.filter(test).length / values.length;
}

function graded(r: number, good: number, bad: number): number {
  if (r >= 0.6) return good;
  if (r < 0.2) return bad;
  return 0;
}

/** Bonus or penalty for how well a column's values fit a target. */
function valueFit(spec: TargetSpec, p: ColumnProfile): number {
  if (p.count === 0) return 0;
  const v = p.values;
  switch (spec.valueKind) {
    case 'date':
      return graded(p.dateRatio, 0.1, -0.35);
    case 'number':
    case 'currency':
      return graded(
        ratio(v, (x) => parseMoney(x) !== undefined && !looksLikeDate(x)),
        0.1,
        -0.35,
      );
    case 'percent':
      return graded(
        ratio(v, (x) => parsePercent(x) !== undefined),
        0.1,
        -0.35,
      );
    case 'rating':
      return graded(
        ratio(v, (x) => parseRating(x) !== undefined),
        0.1,
        -0.3,
      );
    case 'boolean':
      return graded(
        ratio(v, (x) => parseBoolean(x) !== undefined),
        0.1,
        -0.3,
      );
    case 'enum': {
      const family = enumFamilyFor(spec.options);
      const r = ratio(v, (x) => {
        return matchEnum(x, spec.options ?? [], family, false) !== undefined;
      });
      return graded(r, 0.15, -0.3);
    }
    case 'url':
      return graded(
        ratio(v, (x) => /^(?:https?:\/\/|www\.)\S+$/i.test(toText(x).trim())),
        0.1,
        -0.2,
      );
    case 'name':
      if (p.numericRatio > 0.6 || p.dateRatio > 0.6) return -0.3;
      return p.distinctRatio >= 0.9 ? 0.05 : 0;
    case 'key':
      return ratio(v, (x) => /\s/.test(toText(x).trim())) > 0.6 ? -0.25 : 0;
    case 'text':
      return p.dateRatio > 0.6 ? -0.3 : 0;
    case 'relation':
      return p.dateRatio > 0.6 || p.numericRatio > 0.8 ? -0.3 : 0;
    case 'longtext':
      if (p.dateRatio > 0.6 || p.numericRatio > 0.8) return -0.3;
      return p.avgLength > 40 ? 0.05 : 0;
    default:
      return 0;
  }
}

/* ------------------------------------------------------------------ */
/* Header matching                                                      */
/* ------------------------------------------------------------------ */

/** Lowest score at which a header is matched to a target. */
const MIN_SCORE = 0.5;

interface HeaderForms {
  full: string;
  stripped: string;
}

function headerForms(header: string): HeaderForms {
  return { full: norm(header), stripped: norm(stripBrackets(header)) };
}

function scoreForm(h: string, alias: Alias): number {
  if (!h || !alias.text) return 0;
  if (h === alias.text) return alias.weight;
  if (h.replace(/ /g, '') === alias.text.replace(/ /g, '')) return 0.97 * alias.weight;
  if (containsPhrase(h, alias.text)) {
    return (0.7 + 0.25 * (alias.text.length / h.length)) * alias.weight;
  }
  if (alias.text.length >= 4 && h.length >= 4) {
    const sim = similarity(h, alias.text);
    if (sim >= 0.75) return 0.7 * sim * alias.weight;
  }
  return 0;
}

/** How well a header's words match a target's aliases: 1 exact, ~0.7–0.95 contains, ≤0.7 similar. */
function aliasScore(forms: HeaderForms, spec: TargetSpec): number {
  let best = 0;
  for (const alias of spec.aliases) {
    const s = Math.max(scoreForm(forms.full, alias), scoreForm(forms.stripped, alias));
    if (s > best) best = s;
  }
  return best;
}

/**
 * Best target for a single header (no sample values). Used for ArchiMate properties and
 * other key/value sources.
 */
export function matchColumn(
  header: string,
  type: ElementType,
): { target: ColumnTarget; score: number } | undefined {
  const forms = headerForms(header);
  let best: { target: ColumnTarget; score: number } | undefined;
  for (const spec of targetsFor(type)) {
    const s = aliasScore(forms, spec);
    // On a tie, a field of this type ("Contact" on a team) beats a general alias (owner).
    const better =
      !best ||
      s > best.score ||
      (s === best.score && spec.target.kind === 'attribute' && best.target.kind === 'core');
    if (s >= MIN_SCORE && better) best = { target: spec.target, score: s };
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Hierarchy level columns ("Level 1", "L2 Capability", ...)            */
/* ------------------------------------------------------------------ */

const LEVEL_RE = /(?:^|\s)(?:level|lvl|lv|l|niveau|ebene)\s?(\d)(?=\s|$)/;
const LEVEL_FILLER = new Set([
  'name',
  'title',
  'capability',
  'capabilities',
  'business capability',
  'process',
  'processes',
  'business process',
  'data',
  'data object',
  'domain',
  'area',
  'naam',
]);

interface LevelHeader {
  level: number;
  /** The rest of the header after removing the level token ("" for a pure level column). */
  rest: string;
  pure: boolean;
}

function levelOf(header: string): LevelHeader | undefined {
  const h = norm(stripBrackets(header)) || norm(header);
  const m = LEVEL_RE.exec(h);
  if (!m) return undefined;
  const rest = h.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
  return { level: Number(m[1]), rest, pure: rest === '' || LEVEL_FILLER.has(rest) };
}

/* ------------------------------------------------------------------ */
/* guessMapping                                                         */
/* ------------------------------------------------------------------ */

interface Pair {
  header: string;
  headerIndex: number;
  spec: TargetSpec;
  specIndex: number;
  score: number;
}

/**
 * Works out which column holds which field, from header words and the values in each column.
 * Every non-relation target is used by at most one column; unknown columns are ignored.
 */
export function guessMapping(sheet: ParsedSheet, type: ElementType): SheetMapping {
  const specs = targetsFor(type);
  const headers = sheet.headers;
  const profiles = new Map(headers.map((h) => [h, profileColumn(sheet, h)] as const));
  const columns: Record<string, ColumnTarget> = {};
  const columnConfidence: Record<string, number> = {};
  const usedSpecs = new Set<string>();
  const assign = (header: string, target: ColumnTarget, score: number, specId?: string) => {
    columns[header] = target;
    columnConfidence[header] = Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
    if (specId) usedSpecs.add(specId);
  };

  // 1. Hierarchy levels, for hierarchical types with two or more level columns.
  const rematch = new Map<string, string>();
  if (typeDef(type).hierarchical) {
    const levels = headers
      .map((h) => ({ h, info: levelOf(h) }))
      .filter((x): x is { h: string; info: LevelHeader } => x.info !== undefined);
    const pure = levels.filter((x) => x.info.pure);
    const pureLevels = new Set(pure.map((x) => x.info.level));
    if (pureLevels.size >= 2) {
      const maxLevel = Math.max(...pureLevels);
      const seenLevels = new Set<number>();
      for (const { h, info } of levels) {
        if (info.pure && !seenLevels.has(info.level)) {
          seenLevels.add(info.level);
          assign(h, { kind: 'level', level: info.level }, 0.95);
        } else if (!info.pure && info.level === maxLevel) {
          rematch.set(h, info.rest); // "Level 3 description" describes the leaf
        } else {
          assign(h, { kind: 'ignore' }, 0);
        }
      }
    }
  }

  // 2. Header words, adjusted by value fit; best pairs win.
  const pairs: Pair[] = [];
  headers.forEach((header, headerIndex) => {
    if (columns[header]) return;
    const forms = headerForms(rematch.get(header) ?? header);
    const profile = profiles.get(header)!;
    specs.forEach((spec, specIndex) => {
      const base = aliasScore(forms, spec);
      if (base < MIN_SCORE) return;
      const score = base + valueFit(spec, profile);
      if (score >= MIN_SCORE) pairs.push({ header, headerIndex, spec, specIndex, score });
    });
  });
  const take = (list: Pair[]) => {
    list.sort(
      (a, b) => b.score - a.score || a.headerIndex - b.headerIndex || a.specIndex - b.specIndex,
    );
    for (const p of list) {
      if (columns[p.header]) continue;
      if (!p.spec.multi && usedSpecs.has(p.spec.id)) continue;
      assign(p.header, p.spec.target, Math.min(p.score, 1), p.spec.id);
    }
  };
  take(pairs);

  // 3. Values alone: an unnamed column full of "Live"/"Retired" is a lifecycle column.
  const valuePairs: Pair[] = [];
  headers.forEach((header, headerIndex) => {
    if (columns[header]) return;
    const p = profiles.get(header)!;
    if (p.count < 2 || p.numericRatio > 0.2) return;
    specs.forEach((spec, specIndex) => {
      if (usedSpecs.has(spec.id)) return;
      let r = 0;
      if (spec.valueKind === 'enum' && spec.options) {
        const family = enumFamilyFor(spec.options);
        r = ratio(p.values, (x) => {
          return matchEnum(x, spec.options!, family, false) !== undefined;
        });
      } else if (spec.valueKind === 'url') {
        r = ratio(p.values, (x) => /^(?:https?:\/\/|www\.)\S+$/i.test(toText(x).trim()));
      } else {
        return;
      }
      if (r >= 0.8)
        valuePairs.push({ header, headerIndex, spec, specIndex, score: 0.5 + 0.25 * r });
    });
  });
  take(valuePairs);

  // 4. No name column found: use the first column of mostly unique text.
  const hasName = Object.values(columns).some(
    (t) => (t.kind === 'core' && t.field === 'name') || t.kind === 'level',
  );
  if (!hasName) {
    const fallback = headers.find((h) => {
      if (columns[h]) return false;
      const p = profiles.get(h)!;
      return (
        p.count > 0 &&
        p.count >= p.rows * 0.5 &&
        p.numericRatio < 0.3 &&
        p.dateRatio < 0.3 &&
        p.distinctRatio >= 0.8 &&
        p.avgLength >= 2 &&
        p.avgLength <= 80
      );
    });
    if (fallback) assign(fallback, { kind: 'core', field: 'name' }, 0.45, 'core:name');
  }

  // Report columns in sheet order; unmatched columns are ignored.
  const ordered: Record<string, ColumnTarget> = {};
  for (const h of headers) ordered[h] = columns[h] ?? { kind: 'ignore' };
  return {
    elementType: type,
    columns: ordered,
    confidence: mappingConfidence(headers, ordered, columnConfidence, profiles),
    columnConfidence,
  };
}

function mappingConfidence(
  headers: string[],
  columns: Record<string, ColumnTarget>,
  scores: Record<string, number>,
  profiles: Map<string, ColumnProfile>,
): number {
  const nameHeaders = headers.filter((h) => {
    const t = columns[h]!;
    return (t.kind === 'core' && t.field === 'name') || t.kind === 'level';
  });
  if (nameHeaders.length === 0) return 0.1;
  const nameScore = Math.max(...nameHeaders.map((h) => scores[h] ?? 0));
  const others = headers.filter((h) => columns[h]!.kind !== 'ignore' && !nameHeaders.includes(h));
  const otherScore = others.length
    ? others.reduce((s, h) => s + (scores[h] ?? 0), 0) / others.length
    : 0.5;
  const withData = headers.filter((h) => (profiles.get(h)?.count ?? 0) > 0);
  const mapped = withData.filter((h) => columns[h]!.kind !== 'ignore').length;
  const coverage = withData.length ? mapped / withData.length : 0;
  const c = 0.5 * nameScore + 0.3 * otherScore + 0.2 * coverage;
  return Math.round(Math.min(1, c) * 100) / 100;
}
