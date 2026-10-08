/**
 * Primitive value readers. Each returns `undefined` when the value cannot be read;
 * `normalizeValue` turns that into a friendly warning.
 */
import { norm } from './text';

const NULL_TOKENS = new Set([
  '',
  '-',
  '--',
  '---',
  '—',
  '–',
  '?',
  'n/a',
  'n.a.',
  'n.a',
  'na',
  'nvt',
  'n.v.t.',
  'tbd',
  'tbc',
  'unknown',
  'onbekend',
  'null',
  'nil',
  'undefined',
  '#n/a',
  '#ref!',
  '#value!',
  '#div/0!',
  '#name?',
]);

/** True for empty cells and placeholders such as "-", "n/a" or "TBD". */
export function isBlank(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === 'number') return Number.isNaN(raw);
  if (typeof raw === 'string') return NULL_TOKENS.has(raw.trim().toLowerCase());
  if (Array.isArray(raw)) return raw.every(isBlank);
  return false;
}

/** Converts any cell value to text (numbers without float noise, dates as ISO). */
export function toText(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number') {
    if (Number.isInteger(raw)) return String(raw);
    return String(Number(raw.toPrecision(12)));
  }
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (raw instanceof Date) return isoFromDate(raw) ?? '';
  if (Array.isArray(raw)) return raw.map(toText).filter(Boolean).join(', ');
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const k of ['name', 'title', 'label', 'value', 'text']) {
      if (typeof o[k] === 'string') return o[k] as string;
    }
    return JSON.stringify(raw);
  }
  return String(raw);
}

/* ------------------------------------------------------------------ */
/* Numbers and money                                                    */
/* ------------------------------------------------------------------ */

const CURRENCY_RE =
  /[€$£¥₹₩₽¢]|\b(?:eur|euro|euros|usd|us|gbp|chf|jpy|cny|rmb|inr|aud|cad|nzd|sek|nok|dkk|pln|czk|huf|zar|brl|kr|fr|sfr)\b\.?/gi;
const PERIOD_RE =
  /(?:\/|\bper\s+|\bp\.?\s?)(?:year|yr|y|annum|a|jaar|jr|jahr)\b\.?|\b(?:yearly|annually|annual|pa|p\.a\.)$/gi;
const MULTIPLIERS: Array<[RegExp, number]> = [
  [/^(.*?)\s*(?:bn|b|billion|billions|mrd|miljard|milliard|milliarden)\.?$/i, 1e9],
  [/^(.*?)\s*(?:m|mm|mn|mln|mio|million|millions|miljoen|millionen)\.?$/i, 1e6],
  [/^(.*?)\s*(?:k|thousand|thousands|duizend|tsd|tausend)\.?$/i, 1e3],
];

function count(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
}

/**
 * Reads digits with any mix of thousand and decimal separators.
 * `preferThousands` decides "1.200" (1200 for money, 1.2 otherwise).
 */
function parseDigits(input: string, preferThousands: boolean, hasMultiplier: boolean): number | undefined {
  let s = input;
  if (!/^(?:\d[\d.,]*|[.,]\d+)$/.test(s)) return undefined;
  const dots = count(s, '.');
  const commas = count(s, ',');
  if (dots > 0 && commas > 0) {
    const decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    if (count(s, decimal) > 1) return undefined;
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (dots > 1 || commas > 1) {
    const sep = dots > 1 ? '.' : ',';
    const groups = s.split(sep);
    if (groups.slice(1).some((g) => g.length !== 3)) return undefined;
    s = groups.join('');
  } else if (dots === 1 || commas === 1) {
    const sep = dots === 1 ? '.' : ',';
    const [intPart = '', frac = ''] = s.split(sep);
    const thousandsLike =
      !hasMultiplier && frac.length === 3 && intPart.length >= 1 && intPart.length <= 3 && intPart !== '0';
    if (sep === ',') s = thousandsLike ? intPart + frac : `${intPart || '0'}.${frac}`;
    else s = thousandsLike && preferThousands ? intPart + frac : `${intPart || '0'}.${frac}`;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseNumeric(raw: unknown, preferThousands: boolean): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== 'string') return undefined;
  let s = raw.trim();
  if (!s) return undefined;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^(?:approx\.?|ca\.?|circa|about|~|≈|±)\s*/i, '');
  s = s.replace(CURRENCY_RE, ' ').replace(PERIOD_RE, ' ').trim();
  if (/^[-−–]/.test(s)) {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim();
  }
  s = s.replace(/[-−–]$/, '').trim();
  let multiplier = 1;
  for (const [re, factor] of MULTIPLIERS) {
    const m = re.exec(s);
    if (m && /\d/.test(m[1] ?? '')) {
      multiplier = factor;
      s = (m[1] ?? '').trim();
      break;
    }
  }
  // Spaces, apostrophes and thin spaces are thousand separators ("1 200 000", "1'200").
  s = s.replace(/[\s'’  ]/g, '');
  const n = parseDigits(s, preferThousands, multiplier !== 1);
  if (n === undefined) return undefined;
  const value = n * multiplier * (negative ? -1 : 1);
  return Number(value.toPrecision(15));
}

/** Reads a plain number: 42, "1,200", "1.5", "250k", "3 400". */
export function parseNumber(raw: unknown): number | undefined {
  return parseNumeric(raw, false);
}

/** Reads an amount of money: "€ 1.2M", "1.200.000", "1,200,000", "250k", "$40,000", "(500)". */
export function parseMoney(raw: unknown): number | undefined {
  return parseNumeric(raw, true);
}

/** Reads a percentage as 0..100: "45%", 0.45, "45 %", 45. */
export function parsePercent(raw: unknown): number | undefined {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return undefined;
    const v = Math.abs(raw) < 1 && raw !== 0 ? raw * 100 : raw;
    return round(v, 2);
  }
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  const hasPercent = /%\s*$/.test(s);
  const n = parseNumber(s.replace(/%\s*$/, '').trim());
  if (n === undefined) return undefined;
  if (!hasPercent && Math.abs(n) < 1 && n !== 0) return round(n * 100, 2);
  return round(n, 2);
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/* ------------------------------------------------------------------ */
/* Ratings                                                              */
/* ------------------------------------------------------------------ */

const RATING_WORDS: Array<[string, number]> = [
  ['very low', 1],
  ['very poor', 1],
  ['very bad', 1],
  ['terrible', 1],
  ['awful', 1],
  ['unacceptable', 1],
  ['initial', 1],
  ['ad hoc', 1],
  ['adhoc', 1],
  ['zeer laag', 1],
  ['slecht', 2],
  ['low', 2],
  ['poor', 2],
  ['bad', 2],
  ['weak', 2],
  ['below average', 2],
  ['insufficient', 2],
  ['repeatable', 2],
  ['managed', 2],
  ['laag', 2],
  ['medium', 3],
  ['average', 3],
  ['fair', 3],
  ['ok', 3],
  ['okay', 3],
  ['moderate', 3],
  ['neutral', 3],
  ['adequate', 3],
  ['acceptable', 3],
  ['satisfactory', 3],
  ['sufficient', 3],
  ['defined', 3],
  ['mid', 3],
  ['gemiddeld', 3],
  ['redelijk', 3],
  ['high', 4],
  ['good', 4],
  ['strong', 4],
  ['above average', 4],
  ['quantitatively managed', 4],
  ['measured', 4],
  ['hoog', 4],
  ['goed', 4],
  ['very high', 5],
  ['very good', 5],
  ['excellent', 5],
  ['outstanding', 5],
  ['great', 5],
  ['best', 5],
  ['optimal', 5],
  ['optimised', 5],
  ['optimized', 5],
  ['optimizing', 5],
  ['optimising', 5],
  ['perfect', 5],
  ['world class', 5],
  ['zeer hoog', 5],
  ['uitstekend', 5],
  ['zeer goed', 5],
];

function clampRating(n: number): number {
  return Math.min(5, Math.max(1, Math.round(n)));
}

function ratingFromNumber(n: number): number | undefined {
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (n < 1) return clampRating(Math.ceil((n * 100) / 20)); // 0.8 from a percent-formatted cell
  if (n <= 5) return clampRating(n);
  if (n <= 10) return clampRating(n / 2);
  if (n <= 100) return clampRating(Math.ceil(n / 20));
  return undefined;
}

/** Reads a 1–5 rating: 4, "4 - good", "High", "excellent", "80%", "7/10", "★★★☆☆". */
export function parseRating(raw: unknown): number | undefined {
  if (typeof raw === 'number') return ratingFromNumber(raw);
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (/^[★☆⭐✩✭*]+$/.test(s)) {
    const filled = [...s].filter((c) => c === '★' || c === '⭐' || c === '✭' || c === '*').length;
    return filled > 0 ? clampRating(filled) : undefined;
  }
  const ratio = /^(\d+(?:[.,]\d+)?)\s*(?:\/|out of|of|van)\s*(\d+)$/i.exec(s);
  if (ratio) {
    const n = Number(ratio[1]!.replace(',', '.'));
    const scale = Number(ratio[2]);
    return scale > 0 ? clampRating((n / scale) * 5) : undefined;
  }
  if (/%\s*$/.test(s)) {
    const p = parsePercent(s);
    return p === undefined || p <= 0 ? undefined : clampRating(Math.ceil(p / 20));
  }
  const leading = /^(\d+(?:[.,]\d+)?)(?![\d.,])/.exec(s);
  if (leading) return ratingFromNumber(Number(leading[1]!.replace(',', '.')));
  const bracketed = /\((\d(?:[.,]\d+)?)\)/.exec(s);
  if (bracketed) return ratingFromNumber(Number(bracketed[1]!.replace(',', '.')));
  const n = norm(s);
  let best: [string, number] | undefined;
  for (const entry of RATING_WORDS) {
    if (n === entry[0] || ` ${n} `.includes(` ${entry[0]} `)) {
      if (!best || entry[0].length > best[0].length) best = entry;
    }
  }
  return best?.[1];
}

/* ------------------------------------------------------------------ */
/* Booleans, lists and URLs                                             */
/* ------------------------------------------------------------------ */

const TRUE_WORDS = new Set(['yes', 'y', 'true', '1', 'x', 'ja', 'j', 'oui', 'si', 'sí', 'wahr', 'on', 'checked', '✓', '✔', '☑', '✅']);
const FALSE_WORDS = new Set(['no', 'n', 'false', '0', 'nee', 'nein', 'non', 'off', 'unchecked', 'falsch', '✗', '✘', '☐', '❌']);

/** Reads yes/no values in several languages and notations. */
export function parseBoolean(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw === 1 ? true : raw === 0 ? false : undefined;
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim().toLowerCase();
  if (TRUE_WORDS.has(s)) return true;
  if (FALSE_WORDS.has(s)) return false;
  return undefined;
}

/** Splits a cell into items on commas, semicolons, pipes and new lines; drops bullets and duplicates. */
export function splitList(raw: unknown): string[] {
  const parts: string[] = [];
  const push = (v: unknown) => {
    if (Array.isArray(v)) {
      for (const item of v) push(item);
      return;
    }
    if (isBlank(v)) return;
    const text = toText(v);
    for (const piece of text.split(/[,;|\n\r]+/)) {
      const item = piece
        .replace(/^\s*(?:[•·▪◦\-*–]|\d+[.)])\s+/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (item && !isBlank(item)) parts.push(item);
    }
  };
  push(raw);
  const seen = new Set<string>();
  return parts.filter((p) => {
    const k = norm(p) || p;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Reads a link, adding https:// to bare host names. */
export function parseUrl(raw: unknown): string | undefined {
  const s = toText(raw).trim();
  if (!s) return undefined;
  if (/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(s) || /^mailto:\S+$/i.test(s)) return s;
  if (/^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/.test(s)) return `mailto:${s}`;
  if (/^(?:www\.)?[\w-]+(?:\.[\w-]+)+(?::\d+)?(?:[/?#]\S*)?$/i.test(s)) return `https://${s}`;
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Dates                                                                */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, januari: 1, januar: 1, janvier: 1, janner: 1,
  feb: 2, february: 2, februari: 2, februar: 2, fevrier: 2,
  mar: 3, march: 3, maart: 3, mrt: 3, marz: 3, mars: 3, maerz: 3,
  apr: 4, april: 4, avril: 4,
  may: 5, mei: 5, mai: 5,
  jun: 6, june: 6, juni: 6, juin: 6,
  jul: 7, july: 7, juli: 7, juillet: 7,
  aug: 8, august: 8, augustus: 8, aout: 8,
  sep: 9, sept: 9, september: 9, septembre: 9,
  oct: 10, october: 10, okt: 10, oktober: 10, octobre: 10,
  nov: 11, november: 11, novembre: 11,
  dec: 12, december: 12, dez: 12, dezember: 12, decembre: 12,
};

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoFromParts(y: number, m: number, d: number): string | undefined {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return undefined;
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1) return undefined;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > daysInMonth) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** ISO date (YYYY-MM-DD) of a Date, rounded to the nearest minute to absorb Excel float noise. */
export function isoFromDate(d: Date): string | undefined {
  const t = d.getTime();
  if (Number.isNaN(t)) return undefined;
  return new Date(Math.round(t / 60_000) * 60_000).toISOString().slice(0, 10);
}

function fullYear(y: string): number {
  const n = Number(y);
  if (y.length === 2) return n < 70 ? 2000 + n : 1900 + n;
  return n;
}

function fromNumber(n: number): string | undefined {
  if (!Number.isFinite(n)) return undefined;
  if (Number.isInteger(n) && n >= 1900 && n <= 2200) return `${n}-01-01`;
  if (n > 2200 && n < 2_958_466) return isoFromDate(new Date(EXCEL_EPOCH + Math.floor(n) * DAY_MS));
  if (n > 1e11 && n < 1e14) return isoFromDate(new Date(n)); // JavaScript timestamp in ms
  return undefined;
}

/**
 * Reads a date and returns YYYY-MM-DD. Understands Excel serial numbers, ISO dates,
 * DD-MM-YYYY and MM/DD/YYYY (by heuristics, or `order`), "15 March 2026", "Q3 2026",
 * "H2 2026", "2026-07" and plain years ("2027" → 2027-01-01).
 */
export function parseDate(raw: unknown, order?: 'dmy' | 'mdy'): string | undefined {
  if (raw instanceof Date) return isoFromDate(raw);
  if (typeof raw === 'number') return fromNumber(raw);
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[t\s].*)?$/.exec(s);
  if (m) return isoFromParts(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4}|\d{2})(?:\s.*)?$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    const y = fullYear(m[4]!);
    let dayFirst: boolean;
    if (a > 12) dayFirst = true;
    else if (b > 12) dayFirst = false;
    else if (order) dayFirst = order === 'dmy';
    else dayFirst = m[2] !== '/';
    return dayFirst ? isoFromParts(y, b, a) : isoFromParts(y, a, b);
  }

  m = /^(?:q([1-4])[\s\-/]*(?:fy\s*)?'?(\d{4}|\d{2})|(?:fy\s*)?(\d{4})[\s\-/]*q([1-4]))$/.exec(s);
  if (m) {
    const q = Number(m[1] ?? m[4]);
    const y = fullYear(m[2] ?? m[3]!);
    return isoFromParts(y, (q - 1) * 3 + 1, 1);
  }

  m = /^(?:h([12])[\s\-/]*'?(\d{4}|\d{2})|(\d{4})[\s\-/]*h([12]))$/.exec(s);
  if (m) {
    const h = Number(m[1] ?? m[4]);
    const y = fullYear(m[2] ?? m[3]!);
    return isoFromParts(y, h === 1 ? 1 : 7, 1);
  }

  m = /^(?:fy\s*|cy\s*)?(\d{4})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    return y >= 1900 && y <= 2200 ? `${y}-01-01` : undefined;
  }

  m = /^(\d{4})[-/.](\d{1,2})$/.exec(s);
  if (m) return isoFromParts(Number(m[1]), Number(m[2]), 1);
  m = /^(\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return isoFromParts(Number(m[2]), Number(m[1]), 1);

  if (/^\d+(?:\.\d+)?$/.test(s)) return fromNumber(Number(s));

  return parseMonthNameDate(s);
}

function parseMonthNameDate(s: string): string | undefined {
  const tokens = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[\s,.\-/']+/)
    .filter(Boolean);
  let month: number | undefined;
  const numbers: string[] = [];
  for (const t of tokens) {
    const word = t.replace(/^(\d+)(?:st|nd|rd|th|e|er|de)$/, '$1');
    if (/^\d+$/.test(word)) numbers.push(word);
    else if (MONTHS[word] !== undefined && month === undefined) month = MONTHS[word];
    else if (word === 'of' || word === 'the') continue;
    else return undefined;
  }
  if (month === undefined || numbers.length === 0 || numbers.length > 2) return undefined;
  const yearIdx = numbers.findIndex((n) => n.length === 4);
  if (numbers.length === 1) {
    const only = numbers[0]!;
    if (only.length === 4) return isoFromParts(Number(only), month, 1);
    if (only.length === 2 && Number(only) > 31) return isoFromParts(fullYear(only), month, 1);
    // "Jan-26" (Excel mmm-yy) is a month and a year.
    if (only.length === 2 && /^[a-z]/.test(s)) return isoFromParts(fullYear(only), month, 1);
    return undefined;
  }
  if (yearIdx >= 0) {
    const day = Number(numbers[1 - yearIdx]);
    return isoFromParts(Number(numbers[yearIdx]), month, day);
  }
  // "15 Mar 26": day then two-digit year.
  return isoFromParts(fullYear(numbers[1]!), month, Number(numbers[0]));
}

/** True when a value is very likely a date (used for column profiling; plain numbers do not count). */
export function looksLikeDate(raw: unknown): boolean {
  if (raw instanceof Date) return true;
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  if (/^\d+(?:[.,]\d+)?$/.test(s) && !/^(?:19|20|21)\d{2}$/.test(s)) return false;
  return parseDate(s) !== undefined;
}
