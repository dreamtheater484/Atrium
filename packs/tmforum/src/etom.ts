import {
  cellText,
  compact,
  emptyResult,
  hasHeaders,
  headerOf,
  isDotted,
  nearestAncestor,
  type PackElement,
  plural,
  type SourceReader,
  type SourceSheet,
} from '@atrium/packs-core';
import { ETOM, mostCommon, releaseOf, reportOthers, skipReason } from './common';

/**
 * eTOM, the Business Process Framework (GB921 "Processes in Excel"). One row per process, with
 * a dotted identifier ("1.1.1.2") and its level. A process that belongs to several vertical
 * groups is listed once per group. The level 1 domains ("1.1" Market Domain) have no rows of
 * their own; they are named after the Domain column of the processes under them.
 */

const COLUMNS = ['process', 'process identifier', 'level'];

const isProcessSheet = (s: SourceSheet) => hasHeaders(s, COLUMNS) && !skipReason(s);

interface Process {
  id: string;
  name: string;
  level: number;
  brief: string;
  extended: string;
  domain: string;
  verticals: string[];
  uid: string;
  marked: boolean;
}

export const etomReader: SourceReader = {
  framework: ETOM,
  label: 'eTOM Business Process Framework (GB921)',
  recognises: (file) => file.sheets.some(isProcessSheet),
  read(file) {
    const out = emptyResult();
    out.version = releaseOf(file);
    const used = new Map<string, string>();
    const processes = new Map<string, Process>();
    let repeated = 0;
    let renamed = 0;
    let badIds = 0;
    for (const sheet of file.sheets.filter(isProcessSheet)) {
      const col = (name: string) => headerOf(sheet, name) ?? '';
      const [nameCol, idCol, levelCol] = COLUMNS.map(col);
      const before = processes.size;
      for (const row of sheet.rows) {
        const id = cellText(row[idCol!]);
        const raw = cellText(row[nameCol!]);
        if (!raw) continue;
        if (!isDotted(id)) {
          badIds++;
          continue;
        }
        // "[**]" flags a process TM Forum has marked in this release; keep the name clean.
        const marked = raw.includes('[**]');
        const name = raw.replace(/\s*\[\*\*\]\s*/g, ' ').trim();
        const vertical = cellText(row[col('vertical group')]);
        const existing = processes.get(id);
        if (existing) {
          // The same process again, usually under another vertical group.
          repeated++;
          if (vertical && !existing.verticals.includes(vertical)) existing.verticals.push(vertical);
          if (existing.name !== name) renamed++;
          continue;
        }
        processes.set(id, {
          id,
          name,
          level: Number(cellText(row[levelCol!])) || id.split('.').length - 1,
          brief: cellText(row[col('brief description')]),
          extended: cellText(row[col('extended description')]),
          domain: cellText(row[col('domain')]),
          verticals: vertical ? [vertical] : [],
          uid: cellText(row[col('uid')]),
          marked,
        });
      }
      used.set(sheet.name, `${plural(processes.size - before, 'process', 'processes')}`);
    }
    out.sheets = reportOthers(file, used);

    // Level 1: one per "1.x" prefix, named by the processes' Domain column.
    const domainNames = new Map<string, string[]>();
    for (const p of processes.values()) {
      const prefix = p.id.split('.').slice(0, 2).join('.');
      domainNames.set(prefix, [...(domainNames.get(prefix) ?? []), p.domain]);
    }
    const domains = new Map<string, string>();
    for (const [prefix, names] of domainNames) {
      const name = mostCommon(names) ?? `Level 1 group ${prefix}`;
      domains.set(prefix, name);
      if (processes.has(prefix)) continue;
      out.elements.push({
        sourceId: `${ETOM}:${prefix}`,
        framework: ETOM,
        type: 'business_process',
        name,
        attributes: { level: 'Level 1', domain: name },
      });
    }

    const exists = (id: string) => processes.has(id) || domains.has(id);
    let orphans = 0;
    for (const p of processes.values()) {
      const directParent = p.id.split('.').slice(0, -1).join('.');
      const parent = nearestAncestor(p.id, exists, 2);
      if (parent !== directParent && p.level > 1) orphans++;
      const domain = p.domain || domains.get(p.id.split('.').slice(0, 2).join('.'));
      const el: PackElement = {
        sourceId: `${ETOM}:${p.id}`,
        framework: ETOM,
        type: 'business_process',
        name: p.name,
        description: p.brief || p.extended || undefined,
        parentSourceId: parent ? `${ETOM}:${parent}` : undefined,
        attributes: compact({
          level: `Level ${p.level}`,
          domain,
          verticalGroups: p.verticals,
          extendedDescription: p.extended && p.extended !== p.brief ? p.extended : undefined,
          uid: p.uid,
          marker: p.marked ? '[**]' : undefined,
        }),
      };
      out.elements.push(el);
    }

    if (repeated)
      out.notes.push(
        `${plural(repeated, 'row')} repeat a process listed earlier (usually for another vertical group); each process is loaded once, with all its groups.`,
      );
    if (orphans)
      out.notes.push(
        `${plural(orphans, 'process', 'processes')} had no parent in the file; placed under the nearest higher process.`,
      );
    if (renamed)
      out.notes.push(
        `${plural(renamed, 'repeated row')} gave a different name; the first was kept.`,
      );
    if (badIds)
      out.notes.push(`${plural(badIds, 'row')} without a process identifier were left out.`);
    return out;
  },
};
