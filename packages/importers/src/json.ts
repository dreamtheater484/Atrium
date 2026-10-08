import { cleanText } from './text';
import type { ParsedSheet } from './types';
import { toText } from './values';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function cell(v: JsonValue): unknown {
  if (v === null) return null;
  if (typeof v === 'string') return cleanText(v) || null;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) {
    // Lists of names or of objects ({ name: 'X' }) become a list of strings.
    const items = v.map((x) => cleanText(toText(x))).filter(Boolean);
    return items.length ? items : null;
  }
  return toText(v);
}

/** Flattens one level of nesting: { owner: { name: 'X' } } → { 'owner.name': 'X' }. */
function flatten(obj: JsonObject): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isObject(v)) {
      for (const [k2, v2] of Object.entries(v)) out[`${k}.${k2}`] = cell(v2);
    } else {
      out[k] = cell(v);
    }
  }
  return out;
}

function sheetFromObjects(name: string, items: JsonObject[]): ParsedSheet {
  const headers: string[] = [];
  const seen = new Set<string>();
  const rows = items.map((item) => {
    const flat = flatten(item);
    for (const k of Object.keys(flat)) {
      if (!seen.has(k)) {
        seen.add(k);
        headers.push(k);
      }
    }
    return flat;
  });
  for (const row of rows) for (const h of headers) if (!(h in row)) row[h] = null;
  return { name, headers, rows, rowNumbers: rows.map((_, i) => i + 1) };
}

function isArrayOfObjects(v: unknown): v is JsonObject[] {
  return Array.isArray(v) && v.length > 0 && v.every(isObject);
}

/**
 * Reads JSON as sheets: an array of objects is one sheet; `{ "Applications": [...], ... }`
 * gives one sheet per key; `{ "id1": {...}, "id2": {...} }` is one sheet with a "key" column.
 */
export function readJson(text: string, name: string): { sheets: ParsedSheet[]; warnings: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch (err) {
    return { sheets: [], warnings: [`The file is not valid JSON: ${(err as Error).message}`] };
  }
  if (isArrayOfObjects(data)) return { sheets: [sheetFromObjects(name, data)], warnings: [] };
  if (isObject(data)) {
    const sheets = Object.entries(data)
      .filter((entry): entry is [string, JsonObject[]] => isArrayOfObjects(entry[1]))
      .map(([key, items]) => sheetFromObjects(key, items));
    if (sheets.length) return { sheets, warnings: [] };
    const values = Object.entries(data);
    if (values.length && values.every(([, v]) => isObject(v))) {
      const items = values.map(([key, v]) => ({ key, ...(v as JsonObject) }));
      return { sheets: [sheetFromObjects(name, items)], warnings: [] };
    }
    return { sheets: [sheetFromObjects(name, [data])], warnings: [] };
  }
  return {
    sheets: [],
    warnings: ['The JSON file holds no list of records (expected an array of objects)'],
  };
}
