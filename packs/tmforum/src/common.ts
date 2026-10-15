import { cellText, type SheetReport, type SourceFile, type SourceSheet } from '@atrium/packs-core';

/** Framework ids, as in manifest.json. */
export const ETOM = 'etom';
export const SID = 'sid';
export const FUNCTIONS = 'oda-ff';
export const APPLICATIONS = 'tam';

/** Why a sheet TM Forum ships alongside the data is not loaded, or undefined for data sheets. */
export function skipReason(sheet: SourceSheet): string | undefined {
  const name = sheet.name.trim().toLowerCase();
  if (/^(document|notice|administrative|method|guideline|read ?me|introduction)/.test(name))
    return 'Cover page or notes';
  if (/delet|retired/.test(name)) return 'Items removed in this release';
  if (/change|history/.test(name)) return 'Change log';
  return undefined;
}

/** Reports every sheet the reader did not use, with the reason. */
export function reportOthers(
  file: SourceFile,
  used: Map<string, string>,
  otherwise = 'Not part of this framework',
): SheetReport[] {
  return file.sheets.map((s) => {
    const note = used.get(s.name);
    if (note !== undefined) return { name: s.name, loaded: true, note };
    return { name: s.name, loaded: false, note: skipReason(s) ?? otherwise };
  });
}

/**
 * The release a TM Forum workbook states on its title page ("Version 26.0.0" → "26.0"),
 * else the one in its file name ("…_v26.0.xlsx").
 */
export function releaseOf(file: SourceFile): string | undefined {
  for (const sheet of file.sheets) {
    if (!/title|cover/i.test(sheet.name)) continue;
    const cells = [...sheet.headers, ...sheet.rows.flatMap((r) => Object.values(r))];
    for (const c of cells) {
      const m = /\bversion\s*:?\s*(\d+)\.(\d+)/i.exec(cellText(c));
      if (m) return `${m[1]}.${m[2]}`;
    }
  }
  const m = /[_\s-]v(\d+)\.(\d+)/i.exec(file.name);
  return m ? `${m[1]}.${m[2]}` : undefined;
}

/** Marks TM Forum uses on deleted items in otherwise current lists. */
export function isDeletedName(name: string): boolean {
  // "(Deleted)", "[DELETED]", "(Deleted!)", "… Management deleted)"
  return /[([]\s*deleted|deleted\s*!?\s*[)\]]/i.test(name);
}

/** The most common non-empty value. */
export function mostCommon(values: Iterable<string>): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | undefined;
  let n = 0;
  for (const [v, c] of counts)
    if (c > n) {
      best = v;
      n = c;
    }
  return best;
}
