import {
  cellText,
  compact,
  emptyResult,
  hasHeaders,
  headerOf,
  isDotted,
  type PackElement,
  plural,
  type SourceReader,
  type SourceSheet,
} from '@atrium/packs-core';
import {
  FUNCTIONS,
  isDeletedName,
  mostCommon,
  releaseOf,
  reportOthers,
  skipReason,
} from './common';

/**
 * The Functional Framework (GB1033F "Functional Framework in Excel"), the system view of ODA:
 * domain → aggregate function level 1 → aggregate function level 2 → function.
 * - "Functions": one row per function with its domain and the names of its two aggregate functions;
 * - "AF All": the aggregate functions with dotted ids ("1.1.1" level 1, "1.1.1.1" level 2).
 * The aggregate functions carry no domain; it follows from the functions placed under them.
 */

const FUNCTION_COLUMNS = ['function name', 'function id', 'af lev 1'];
const AF_COLUMNS = ['af', 'id', 'hierarchy'];

const isFunctionSheet = (s: SourceSheet) => hasHeaders(s, FUNCTION_COLUMNS) && !skipReason(s);
const isAggregateSheet = (s: SourceSheet) => hasHeaders(s, AF_COLUMNS) && !skipReason(s);

/** Placeholder groupings in the source ("Aggregated Function TBD", test rows). */
const placeholder = (name: string) => !name || /\bTBD\b|^test\b/i.test(name);
const key = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim();

interface Aggregate {
  id: string;
  name: string;
  description: string;
  uid: string;
}

interface Fn {
  id: string;
  name: string;
  description: string;
  domain: string;
  l1?: string;
  l2?: string;
  verticals: string[];
  uid: string;
}

export const functionalReader: SourceReader = {
  framework: FUNCTIONS,
  label: 'Functional Framework (GB1033F)',
  recognises: (file) => file.sheets.some((s) => isFunctionSheet(s) || isAggregateSheet(s)),
  read(file) {
    const out = emptyResult();
    out.version = releaseOf(file);
    const used = new Map<string, string>();

    // Aggregate functions.
    const aggregates = new Map<string, Aggregate>();
    for (const sheet of file.sheets.filter(isAggregateSheet)) {
      const [nameCol, idCol] = AF_COLUMNS.map((c) => headerOf(sheet, c)!);
      const descCol = headerOf(sheet, 'description');
      // Long descriptions sometimes spill over into the unnamed columns after Description.
      const spill = descCol ? sheet.headers.slice(sheet.headers.indexOf(descCol) + 1) : [];
      const before = aggregates.size;
      for (const row of sheet.rows) {
        const id = cellText(row[idCol!]);
        const name = cellText(row[nameCol!]);
        if (!name || !isDotted(id, 3) || isDeletedName(name) || aggregates.has(id)) continue;
        const description = [descCol, ...spill]
          .map((c) => (c ? cellText(row[c]) : ''))
          .filter(Boolean)
          .join('. ')
          .replace(/\.\s*\./g, '.');
        aggregates.set(id, {
          id,
          name,
          description,
          uid: cellText(row[headerOf(sheet, 'uid') ?? '']),
        });
      }
      used.set(sheet.name, plural(aggregates.size - before, 'aggregate function'));
    }
    const aggregateByName = new Map<string, string>();
    for (const a of aggregates.values())
      if (!aggregateByName.has(key(a.name))) aggregateByName.set(key(a.name), a.id);
    const aggregateId = (name: string | undefined) =>
      name && !placeholder(name) ? aggregateByName.get(key(name)) : undefined;

    // Functions.
    const functions = new Map<string, Fn>();
    let deleted = 0;
    let noId = 0;
    let repeated = 0;
    for (const sheet of file.sheets.filter(isFunctionSheet)) {
      const col = (name: string) => headerOf(sheet, name) ?? '';
      const before = functions.size;
      for (const row of sheet.rows) {
        const name = cellText(row[col('function name')]);
        const id = cellText(row[col('function id')]);
        if (!name) continue;
        if (isDeletedName(name)) {
          deleted++;
          continue;
        }
        if (!id) {
          noId++;
          continue;
        }
        const l1Name = cellText(row[col('af lev 1')]);
        const l2Name = cellText(row[col('af lev 2')]);
        const fn: Fn = {
          id,
          name,
          description: cellText(row[col('description')]),
          domain: cellText(row[col('domain')]),
          l1: placeholder(l1Name) ? undefined : l1Name,
          l2: placeholder(l2Name) ? undefined : l2Name,
          verticals: cellText(row[col('vertical')])
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
          uid: cellText(row[col('uid')]),
        };
        const existing = functions.get(id);
        if (existing) {
          repeated++;
          // A repeat placed in a real aggregate function wins over a placeholder one.
          if (!existing.l1 && !existing.l2 && (fn.l1 || fn.l2)) functions.set(id, fn);
          continue;
        }
        functions.set(id, fn);
      }
      used.set(sheet.name, plural(functions.size - before, 'function'));
    }
    out.sheets = reportOthers(file, used);

    // Domains: from the functions, and for each aggregate the domain of the functions under it.
    const domainVotes = new Map<string, string[]>();
    const l2Parents = new Map<string, string[]>();
    for (const f of functions.values()) {
      const l1 = aggregateId(f.l1);
      const l2 = aggregateId(f.l2);
      for (const a of [l1, l2]) {
        if (!a || !f.domain) continue;
        const segment = a.split('.')[0]!;
        domainVotes.set(segment, [...(domainVotes.get(segment) ?? []), f.domain]);
      }
      if (l1 && l2) l2Parents.set(l2, [...(l2Parents.get(l2) ?? []), l1]);
    }
    const domainOfSegment = new Map<string, string>();
    for (const [segment, votes] of domainVotes) domainOfSegment.set(segment, mostCommon(votes)!);
    const domainNames = new Set([
      ...[...functions.values()].map((f) => f.domain).filter(Boolean),
      ...domainOfSegment.values(),
    ]);
    const domainId = (name: string | undefined) => (name ? `${FUNCTIONS}:${name}` : undefined);
    for (const name of domainNames)
      out.elements.push({
        sourceId: domainId(name)!,
        framework: FUNCTIONS,
        type: 'capability',
        name,
        attributes: { level: 'Domain' },
      });

    let regrouped = 0;
    for (const a of aggregates.values()) {
      const parts = a.id.split('.');
      const level = parts.length === 3 ? 1 : 2;
      const domain = domainOfSegment.get(parts[0]!);
      let parent: string | undefined;
      if (level === 2) {
        const dotted = parts.slice(0, -1).join('.');
        if (aggregates.has(dotted)) parent = dotted;
        else {
          parent = mostCommon(l2Parents.get(a.id) ?? []);
          if (parent) regrouped++;
        }
      }
      const el: PackElement = {
        sourceId: `${FUNCTIONS}:${a.id}`,
        framework: FUNCTIONS,
        type: 'capability',
        name: a.name,
        description: a.description || undefined,
        parentSourceId: parent ? `${FUNCTIONS}:${parent}` : domainId(domain),
        attributes: compact({ level: `Aggregate function level ${level}`, domain, uid: a.uid }),
      };
      out.elements.push(el);
    }

    let unplaced = 0;
    let ungrouped = 0;
    const UNGROUPED = `${FUNCTIONS}:ungrouped`;
    for (const f of functions.values()) {
      const parent = aggregateId(f.l2) ?? aggregateId(f.l1);
      if (!parent && (f.l1 || f.l2)) unplaced++;
      if (!parent && !f.domain) ungrouped++;
      const el: PackElement = {
        sourceId: `${FUNCTIONS}:${f.id}`,
        framework: FUNCTIONS,
        type: 'capability',
        name: f.name,
        description: f.description || undefined,
        parentSourceId: parent ? `${FUNCTIONS}:${parent}` : (domainId(f.domain) ?? UNGROUPED),
        attributes: compact({
          level: 'Function',
          domain: f.domain,
          verticals: f.verticals,
          uid: f.uid,
        }),
      };
      out.elements.push(el);
    }
    // Functions TM Forum has not placed in a domain yet are kept together, not at the top level.
    if (ungrouped)
      out.elements.push({
        sourceId: UNGROUPED,
        framework: FUNCTIONS,
        type: 'capability',
        name: 'Functions without a domain',
        description:
          'Functions the Functional Framework does not place in a domain or aggregate function yet.',
        attributes: { level: 'Group' },
      });

    if (deleted) out.notes.push(`${plural(deleted, 'function')} marked deleted were left out.`);
    if (noId) out.notes.push(`${plural(noId, 'row')} without a function id were left out.`);
    if (repeated)
      out.notes.push(`${plural(repeated, 'function')} listed twice; each is loaded once.`);
    if (regrouped)
      out.notes.push(
        `${plural(regrouped, 'aggregate function')} had no parent with a matching id; placed under the level 1 function the function list names.`,
      );
    if (unplaced)
      out.notes.push(
        `${plural(unplaced, 'function')} named an aggregate function that isn't listed; placed under their domain.`,
      );
    if (ungrouped)
      out.notes.push(
        `${plural(ungrouped, 'function')} without a domain or aggregate function: grouped under "Functions without a domain".`,
      );
    if (!aggregates.size && functions.size)
      out.notes.push(
        'No aggregate functions found ("AF All"); functions are grouped by domain only.',
      );
    return out;
  },
};
