/**
 * @atrium/importers: reads Excel, CSV, JSON, ArchiMate, Backstage and atrium.yaml files and
 * works out, with as little user input as possible, what they contain.
 *
 * Tabular files:  parseFile → detectElementType → guessMapping → sheetToCandidates
 * Model files:    parseFile → model (elements and relations with import-local refs)
 */

export { parseArchimate } from './archimate';
export { parseAtriumYaml } from './atrium-yaml';
export { parseBackstage } from './backstage';
export { type CandidateOptions, sheetToCandidates } from './candidates';
export { readCsv } from './csv';
export { detectFormat } from './detect-format';
export { detectElementType } from './detect-type';
export {
  type EnumFamily,
  type EnumMatch,
  matchEnum,
  parseClassification,
  parseLifecycle,
} from './enum-synonyms';
export { readJson } from './json';
export { type ColumnProfile, guessMapping, matchColumn, profileColumn } from './mapping';
export { matchName, type NameMatch } from './match';
export { normalizeValue } from './normalize';
export { parseFile } from './parse-file';
export { decodeText } from './text';
export type {
  Candidate,
  CandidateRelation,
  ColumnTarget,
  CoreField,
  ImportFormat,
  NormalizedElement,
  NormalizedModel,
  NormalizedRelation,
  NormalizedValue,
  NormalizeOptions,
  ParsedFile,
  ParsedSheet,
  SheetMapping,
  TypeDetection,
} from './types';
export {
  isBlank,
  parseBoolean,
  parseDate,
  parseMoney,
  parseNumber,
  parsePercent,
  parseRating,
  parseUrl,
  splitList,
} from './values';
export { readXlsx } from './xlsx';
