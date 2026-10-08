import {
  attributeDef,
  CLASSIFICATIONS,
  type ElementType,
  LIFECYCLE_PHASES,
  typeDef,
} from '@atrium/schema';
import { enumFamilyFor, matchEnum, optionLabels } from './enum-synonyms';
import { cleanText, singleLine } from './text';
import type { ColumnTarget, CoreField, NormalizedValue, NormalizeOptions } from './types';
import {
  isBlank,
  parseBoolean,
  parseDate,
  parseMoney,
  parseNumber,
  parsePercent,
  parseRating,
  parseUrl,
  splitList,
  toText,
} from './values';

const MAX_NAME = 200;

function show(raw: unknown): string {
  const t = singleLine(toText(raw));
  return t.length > 60 ? `${t.slice(0, 57)}...` : t;
}

function textValue(raw: unknown, multiline: boolean): NormalizedValue {
  const t = multiline ? cleanText(toText(raw)) : singleLine(toText(raw));
  return { value: t || undefined };
}

function enumValue(raw: unknown, options: readonly string[], what: string): NormalizedValue {
  const match = matchEnum(raw, options, enumFamilyFor(options));
  if (!match) {
    return {
      value: undefined,
      warning: `"${show(raw)}" is not a known ${what} (expected ${optionLabels(options)})`,
    };
  }
  if (match.fuzzy) {
    return {
      value: match.value,
      warning: `Read "${show(raw)}" as ${what} "${optionLabels([match.value])}"`,
    };
  }
  return { value: match.value };
}

function dateValue(raw: unknown, options: NormalizeOptions): NormalizedValue {
  const value = parseDate(raw, options.dateOrder);
  return value === undefined
    ? { value: undefined, warning: `Could not read "${show(raw)}" as a date` }
    : { value };
}

function normalizeCore(field: CoreField, raw: unknown): NormalizedValue {
  switch (field) {
    case 'name': {
      const t = singleLine(toText(raw));
      if (t.length > MAX_NAME) {
        return { value: t.slice(0, MAX_NAME), warning: `Name shortened to ${MAX_NAME} characters` };
      }
      return { value: t || undefined };
    }
    case 'description':
      return textValue(raw, true);
    case 'lifecycle':
      return enumValue(raw, LIFECYCLE_PHASES, 'lifecycle phase');
    case 'classification':
      return enumValue(raw, CLASSIFICATIONS, 'classification');
    case 'tags': {
      const tags = splitList(raw);
      return { value: tags.length ? tags : undefined };
    }
    default:
      return textValue(raw, false);
  }
}

function normalizeAttribute(
  type: ElementType,
  key: string,
  raw: unknown,
  options: NormalizeOptions,
): NormalizedValue {
  const def = attributeDef(type, key);
  if (!def) return textValue(raw, false);
  const label = def.label.toLowerCase();
  switch (def.kind) {
    case 'text':
      return textValue(raw, false);
    case 'longtext':
      return textValue(raw, true);
    case 'number': {
      const n = parseNumber(raw);
      return n === undefined
        ? { value: undefined, warning: `Could not read "${show(raw)}" as a number for ${label}` }
        : { value: n };
    }
    case 'currency': {
      const n = parseMoney(raw);
      return n === undefined
        ? { value: undefined, warning: `Could not read "${show(raw)}" as an amount for ${label}` }
        : { value: n };
    }
    case 'percent': {
      const n = parsePercent(raw);
      if (n === undefined) {
        return { value: undefined, warning: `Could not read "${show(raw)}" as a percentage` };
      }
      if (n < 0 || n > 100) {
        return {
          value: Math.min(100, Math.max(0, n)),
          warning: `${label} "${show(raw)}" capped to 0–100%`,
        };
      }
      return { value: n };
    }
    case 'date':
      return dateValue(raw, options);
    case 'enum':
      return enumValue(raw, def.options ?? [], label);
    case 'rating': {
      const n = parseRating(raw);
      return n === undefined
        ? {
            value: undefined,
            warning: `Could not read "${show(raw)}" as a 1–5 rating for ${label}`,
          }
        : { value: n };
    }
    case 'boolean': {
      const b = parseBoolean(raw);
      return b === undefined
        ? { value: undefined, warning: `Could not read "${show(raw)}" as yes or no for ${label}` }
        : { value: b };
    }
    case 'url': {
      const url = parseUrl(raw);
      return url === undefined
        ? { value: undefined, warning: `"${show(raw)}" is not a link` }
        : { value: url };
    }
    case 'list': {
      const items = splitList(raw);
      return { value: items.length ? items : undefined };
    }
    default:
      return textValue(raw, false);
  }
}

/**
 * Turns a raw cell into the value Atrium stores for a column target. Empty cells and
 * placeholders ("-", "n/a", "TBD") become `undefined` without a warning.
 */
export function normalizeValue(
  target: ColumnTarget,
  raw: unknown,
  elementType: ElementType,
  options: NormalizeOptions = {},
): NormalizedValue {
  if (target.kind === 'ignore' || isBlank(raw)) return { value: undefined };
  switch (target.kind) {
    case 'core':
      if (target.field === 'lifecycle' && !typeDef(elementType).hasLifecycle) {
        return { value: undefined };
      }
      return normalizeCore(target.field, raw);
    case 'attribute':
      return normalizeAttribute(elementType, target.key, raw, options);
    case 'relation': {
      const names = splitList(raw);
      return { value: names.length ? names : undefined };
    }
    case 'lifecycle_date':
      return dateValue(raw, options);
    case 'level':
      return textValue(raw, false);
  }
}
