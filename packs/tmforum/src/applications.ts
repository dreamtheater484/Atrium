import {
  cellText,
  compact,
  emptyResult,
  hasHeaders,
  headerOf,
  isDotted,
  nearestAncestor,
  plural,
  type SourceReader,
  type SourceSheet,
} from '@atrium/packs-core';
import { normalizeName } from '@atrium/schema';
import {
  APPLICATIONS,
  FUNCTIONS,
  isDeletedName,
  mostCommon,
  releaseOf,
  reportOthers,
  skipReason,
} from './common';

/**
 * The Application Framework, TAM (GB929F). One row per application and function it contains,
 * so an application spans several rows. Identifiers are dotted ("5.10.1"), but Excel has
 * stored some level 1 identifiers as numbers, which turns "5.10" into 5.1. Those are put back
 * by looking at the children: "5.10.1" belongs under the "5.1" whose name it shares words with.
 * The applications link to the Functional Framework functions they contain.
 */

const COLUMNS = ['tmf application', 'application identifier'];

const isApplicationSheet = (s: SourceSheet) => hasHeaders(s, COLUMNS) && !skipReason(s);
const isFunctionList = (s: SourceSheet) =>
  hasHeaders(s, ['function name', 'function id']) && !hasHeaders(s, ['af lev 1']);

interface App {
  id: string;
  name: string;
  level: number;
  description: string;
  domain: string;
  functions: string[];
  /** Excel stored the id as a number, so "x.10" may have become "x.1". */
  numeric: boolean;
}

const words = (s: string) =>
  new Set(
    normalizeName(s)
      .split(' ')
      .filter((w) => w.length > 2),
  );

function shared(a: string, names: string[]): number {
  const mine = words(a);
  let n = 0;
  for (const other of names) for (const w of words(other)) if (mine.has(w)) n++;
  return n;
}

/** Puts back "x.10"-style ids Excel turned into "x.1". Returns how many were repaired. */
function repairNumericIds(apps: App[]): number {
  let repaired = 0;
  const ids = () => new Set(apps.map((a) => a.id));
  const byId = new Map<string, App[]>();
  for (const a of apps) byId.set(a.id, [...(byId.get(a.id) ?? []), a]);
  for (const [id, group] of byId) {
    if (!group.some((a) => a.numeric) || id.split('.').length !== 2 || id.endsWith('0')) continue;
    const alt = `${id}0`;
    const present = ids();
    if (present.has(alt)) continue;
    const childrenOf = (parent: string) =>
      apps.filter((a) => a.id.startsWith(`${parent}.`)).map((a) => a.name);
    const altChildren = childrenOf(alt);
    const ownChildren = childrenOf(id);
    const best = (names: string[], order: 1 | -1) => {
      const scored = group
        .map((a) => ({ a, score: order * shared(a.name, names) }))
        .sort((x, y) => y.score - x.score);
      return scored[0]!.score > scored[1]!.score ? scored[0]!.a : undefined;
    };
    let pick: App | undefined;
    if (group.length === 1) pick = altChildren.length && !ownChildren.length ? group[0] : undefined;
    // Two applications on one id: one of them is really "x.10". Its sub-applications tell
    // which; failing that, the one least like the "x.1" sub-applications.
    else if (group.length === 2 && group.every((a) => a.numeric))
      pick = altChildren.length
        ? best(altChildren, 1)
        : ownChildren.length
          ? best(ownChildren, -1)
          : undefined;
    if (pick) {
      pick.id = alt;
      repaired++;
    }
  }
  return repaired;
}

export const applicationReader: SourceReader = {
  framework: APPLICATIONS,
  label: 'Application Framework, TAM (GB929F)',
  recognises: (file) => file.sheets.some(isApplicationSheet),
  read(file) {
    const out = emptyResult();
    out.version = releaseOf(file);
    const used = new Map<string, string>();
    const apps: App[] = [];
    let deleted = 0;
    for (const sheet of file.sheets.filter(isApplicationSheet)) {
      const col = (name: string) => headerOf(sheet, name) ?? '';
      const byKey = new Map<string, App>();
      for (const row of sheet.rows) {
        const rawId = row[col('application identifier')];
        const id = cellText(rawId);
        const name = cellText(row[col('tmf application')]);
        const description = cellText(row[col('documentation')]);
        if (!name) continue;
        // Withdrawn entries: "(Deleted)" names, "deliberately unused" or "Not used" ids.
        if (isDeletedName(name) || !isDotted(id) || /^deleted$/i.test(description)) {
          deleted++;
          continue;
        }
        const k = `${id}|${normalizeName(name)}`;
        let app = byKey.get(k);
        if (!app) {
          app = {
            id,
            name,
            level: Number(cellText(row[col('level')])) || id.split('.').length - 1,
            description: /^(tba|tbd)$/i.test(description) ? '' : description,
            domain: cellText(row[col('domain')]),
            functions: [],
            numeric: typeof rawId === 'number',
          };
          byKey.set(k, app);
          apps.push(app);
        }
        const fn = cellText(row[col('tmf function')]);
        if (fn && !isDeletedName(fn) && !app.functions.includes(fn)) app.functions.push(fn);
      }
      used.set(sheet.name, plural(byKey.size, 'application'));
    }
    out.sheets = reportOthers(file, used).map((s) => {
      const sheet = file.sheets.find((x) => x.name === s.name);
      return sheet && !s.loaded && isFunctionList(sheet)
        ? {
            ...s,
            note: 'Function list: functions come from the Functional Framework file (GB1033F)',
          }
        : s;
    });

    const repaired = repairNumericIds(apps);
    // Two different applications left on one id: keep both, the later one with a suffix.
    const taken = new Map<string, number>();
    let clashes = 0;
    for (const a of apps) {
      const n = (taken.get(a.id) ?? 0) + 1;
      taken.set(a.id, n);
      if (n > 1) {
        a.id = `${a.id} (${n})`;
        clashes++;
      }
    }

    // Domains, one per first id segment ("5" Customer Domain).
    const domainVotes = new Map<string, string[]>();
    for (const a of apps) {
      const segment = a.id.split('.')[0]!;
      domainVotes.set(segment, [...(domainVotes.get(segment) ?? []), a.domain]);
    }
    const domains = new Map<string, string>();
    for (const [segment, votes] of domainVotes) {
      const name = mostCommon(votes) ?? `Group ${segment}`;
      domains.set(segment, name);
      out.elements.push({
        sourceId: `${APPLICATIONS}:${segment}`,
        framework: APPLICATIONS,
        type: 'application',
        name,
        attributes: { level: 'Domain' },
      });
    }

    const ids = new Set(apps.map((a) => a.id));
    let links = 0;
    for (const a of apps) {
      const segment = a.id.split('.')[0]!;
      const parent = isDotted(a.id) ? nearestAncestor(a.id, (id) => ids.has(id), 2) : undefined;
      const sourceId = `${APPLICATIONS}:${a.id}`;
      out.elements.push({
        sourceId,
        framework: APPLICATIONS,
        type: 'application',
        name: a.name,
        description: a.description || undefined,
        parentSourceId: `${APPLICATIONS}:${parent ?? segment}`,
        attributes: compact({
          level: `Level ${a.level}`,
          domain: a.domain || domains.get(segment),
          functions: a.functions,
        }),
      });
      for (const fn of a.functions) {
        out.links.push({ type: 'realizes', from: sourceId, framework: FUNCTIONS, name: fn });
        links++;
      }
    }

    if (deleted)
      out.notes.push(`${plural(deleted, 'row')} for withdrawn applications were left out.`);
    if (repaired)
      out.notes.push(
        `${plural(repaired, 'application id')} such as "5.10" had been stored by Excel as a number ("5.1"); read back from their sub-applications.`,
      );
    if (clashes)
      out.notes.push(
        `${plural(clashes, 'application')} shared an id with a differently named one; loaded with "(2)" after the id.`,
      );
    if (links)
      out.notes.push(`${plural(links, 'link')} from applications to the functions they contain.`);
    return out;
  },
};
