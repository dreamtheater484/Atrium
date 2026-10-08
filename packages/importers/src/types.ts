import type {
  Classification,
  ElementType,
  LifecyclePhase,
  RelationType,
} from '@atrium/schema';

/** File formats the importer understands. */
export type ImportFormat =
  | 'xlsx'
  | 'csv'
  | 'json'
  | 'archimate'
  | 'backstage'
  | 'atrium-yaml'
  | 'unknown';

/** One table of data: an Excel worksheet, a CSV file or a JSON array. */
export interface ParsedSheet {
  name: string;
  headers: string[];
  /** Rows keyed by header. Values are strings, numbers, booleans, string arrays or null. */
  rows: Array<Record<string, unknown>>;
  /** 1-based row number in the source file for each entry in `rows` (for messages). */
  rowNumbers?: number[];
  /** 1-based row number of the (last) header row in the source file. */
  headerRow?: number;
}

/** A model-shaped import (ArchiMate, Backstage, atrium.yaml), independent of any database IDs. */
export interface NormalizedElement {
  /** Identifier inside the import, used by `parentRef`, `domainRef` and relations. */
  ref: string;
  type: ElementType;
  name: string;
  description?: string;
  key?: string;
  parentRef?: string;
  domainRef?: string;
  owner?: string;
  lifecycle?: LifecyclePhase;
  lifecycleDates?: Partial<Record<LifecyclePhase, string>>;
  classification?: Classification;
  tags?: string[];
  attributes?: Record<string, unknown>;
  externalIds: Record<string, string>;
  /** True when the element is only referenced by the file, not described in it. */
  placeholder?: boolean;
}

export interface NormalizedRelation {
  type: RelationType;
  from: string;
  to: string;
}

export interface NormalizedModel {
  elements: NormalizedElement[];
  relations: NormalizedRelation[];
  warnings: string[];
}

export interface ParsedFile {
  format: ImportFormat;
  /** Tabular formats (xlsx, csv, json). */
  sheets?: ParsedSheet[];
  /** Model formats (archimate, backstage, atrium-yaml). */
  model?: NormalizedModel;
  /** Everything worth telling the user, including the model's warnings. */
  warnings: string[];
}

export interface TypeDetection {
  type: ElementType;
  /** 0..1 */
  confidence: number;
  reason: string;
}

export type CoreField =
  | 'name'
  | 'key'
  | 'description'
  | 'owner'
  | 'domain'
  | 'parent'
  | 'lifecycle'
  | 'classification'
  | 'tags'
  | 'team'
  | 'external_id';

export type ColumnTarget =
  | { kind: 'core'; field: CoreField }
  | { kind: 'attribute'; key: string }
  | {
      kind: 'relation';
      relation: RelationType;
      direction: 'out' | 'in';
      targetType: ElementType;
    }
  | { kind: 'lifecycle_date'; phase: LifecyclePhase }
  /** A level of a hierarchy exported as one row per leaf ("Level 1", "Level 2", ...). */
  | { kind: 'level'; level: number }
  | { kind: 'ignore' };

export interface SheetMapping {
  elementType: ElementType;
  columns: Record<string, ColumnTarget>;
  /** 0..1, how sure the importer is about the mapping as a whole. */
  confidence: number;
  /** 0..1 per mapped header. */
  columnConfidence: Record<string, number>;
}

export interface CandidateRelation {
  relation: RelationType;
  direction: 'out' | 'in';
  targetType: ElementType;
  names: string[];
}

/** One element read from a sheet, with names instead of database IDs. */
export interface Candidate {
  /** 1-based row in the source file. */
  row: number;
  type: ElementType;
  name: string;
  key?: string;
  externalId?: string;
  description?: string;
  owner?: string;
  domainName?: string;
  parentName?: string;
  teamName?: string;
  lifecycle?: LifecyclePhase;
  lifecycleDates?: Partial<Record<LifecyclePhase, string>>;
  classification?: Classification;
  tags?: string[];
  attributes: Record<string, unknown>;
  relations: CandidateRelation[];
}

export interface NormalizedValue {
  /** `undefined` when the cell is empty or could not be read. */
  value: unknown;
  warning?: string;
}

export interface NormalizeOptions {
  /** How to read ambiguous dates such as 03/04/2026. Defaults depend on the separator. */
  dateOrder?: 'dmy' | 'mdy';
}
