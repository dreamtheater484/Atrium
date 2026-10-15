import type { SourceReader } from '@atrium/packs-core';
import { applicationReader } from './applications';
import { etomReader } from './etom';
import { functionalReader } from './functional';
import { sidReader } from './sid';

/** Readers for the Excel workbooks TM Forum publishes, one per framework. */
export const tmforumReaders: SourceReader[] = [
  etomReader,
  sidReader,
  functionalReader,
  applicationReader,
];
