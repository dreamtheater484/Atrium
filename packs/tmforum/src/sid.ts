import {
  cellText,
  compact,
  emptyResult,
  hasHeaders,
  headerOf,
  type PackElement,
  plural,
  type SourceReader,
  type SourceSheet,
} from '@atrium/packs-core';
import { releaseOf, reportOthers, SID, skipReason } from './common';

/**
 * SID, the Information Framework (GB922 "Model in Excel"). An outline rather than a table:
 * - column A holds "Parent.Child": a domain ("Business Entity.Market Domain") or an aggregate
 *   business entity (ABE) under a domain or another ABE ("Market Domain.Market Party Roles ABE");
 * - column B a business entity of the ABE above it;
 * - column C an attribute of the entity above it.
 * "All Domains" holds every domain; the other sheets hold one domain each.
 */

const COLUMNS = ['abe name', 'be name', 'attribute name'];
const ROOT = 'business entity';

const isModelSheet = (s: SourceSheet) => hasHeaders(s, COLUMNS) && !skipReason(s);

interface Node {
  name: string;
  kind: 'Domain' | 'ABE' | 'Business entity';
  parent?: string;
  description: string;
  attributes: string[];
  alsoIn: string[];
}

export const sidReader: SourceReader = {
  framework: SID,
  label: 'SID Information Framework (GB922)',
  recognises: (file) => file.sheets.some(isModelSheet),
  read(file) {
    const out = emptyResult();
    out.version = releaseOf(file);
    const modelSheets = file.sheets.filter(isModelSheet);
    // "All Domains" repeats the per-domain sheets: read it alone when it is there.
    const all = modelSheets.find((s) => /\ball\b/i.test(s.name));
    const sheets = all ? [all] : modelSheets;
    const nodes = new Map<string, Node>();
    const used = new Map<string, string>();
    let multiParent = 0;

    const add = (name: string, kind: Node['kind'], parent: string | undefined, doc: string) => {
      const existing = nodes.get(name);
      if (existing) {
        if (parent && existing.parent !== parent) {
          if (!existing.alsoIn.includes(parent)) existing.alsoIn.push(parent);
          multiParent++;
        }
        existing.description ||= doc;
        return existing;
      }
      const node: Node = { name, kind, parent, description: doc, attributes: [], alsoIn: [] };
      nodes.set(name, node);
      return node;
    };

    for (const sheet of sheets) {
      const [abeCol, beCol, attrCol] = COLUMNS.map((c) => headerOf(sheet, c)!);
      const docCol = headerOf(sheet, 'documentation') ?? headerOf(sheet, 'description') ?? '';
      const before = nodes.size;
      let abe: string | undefined;
      let entity: Node | undefined;
      for (const row of sheet.rows) {
        const a = cellText(row[abeCol]);
        const b = cellText(row[beCol]);
        const attr = cellText(row[attrCol]);
        const doc = cellText(row[docCol]);
        if (a) {
          const dot = a.indexOf('.');
          const parent = dot > 0 ? a.slice(0, dot).trim() : undefined;
          const name = (dot > 0 ? a.slice(dot + 1) : a).trim();
          if (!name) continue;
          const isDomain = !parent || parent.toLowerCase() === ROOT;
          add(name, isDomain ? 'Domain' : 'ABE', isDomain ? undefined : parent, doc);
          abe = name;
          entity = undefined;
        } else if (b) {
          entity = add(b, 'Business entity', abe, doc);
        } else if (attr && entity && !entity.attributes.includes(attr)) {
          entity.attributes.push(attr);
        }
      }
      used.set(
        sheet.name,
        plural(nodes.size - before, 'domain, ABE or entity', 'domains, ABEs and entities'),
      );
    }
    out.sheets = reportOthers(file, used).map((s) =>
      all && s.name !== all.name && modelSheets.some((m) => m.name === s.name)
        ? { ...s, note: `Same content as "${all.name}"` }
        : s,
    );

    // Groups referred to as a parent but never listed themselves become top-level groups.
    let groups = 0;
    for (const n of [...nodes.values()])
      if (n.parent && !nodes.has(n.parent)) {
        add(n.parent, 'ABE', undefined, '');
        groups++;
      }

    for (const n of nodes.values()) {
      const el: PackElement = {
        sourceId: `${SID}:${n.name}`,
        framework: SID,
        type: 'data_object',
        name: n.name,
        description: n.description || undefined,
        parentSourceId: n.parent ? `${SID}:${n.parent}` : undefined,
        attributes: compact({ level: n.kind, attributeNames: n.attributes, alsoIn: n.alsoIn }),
      };
      out.elements.push(el);
    }
    const counts = { Domain: 0, ABE: 0, 'Business entity': 0 };
    for (const n of nodes.values()) counts[n.kind]++;
    out.notes.push(
      `${plural(counts.Domain, 'domain')}, ${plural(counts.ABE, 'ABE')} and ${plural(counts['Business entity'], 'business entity', 'business entities')}; attributes are kept on their entity.`,
    );
    if (multiParent)
      out.notes.push(
        `${plural(multiParent, 'entry', 'entries')} listed under more than one ABE; each is placed under the first and lists the others.`,
      );
    if (groups)
      out.notes.push(`${plural(groups, 'group')} named only as a parent: added at the top level.`);
    return out;
  },
};
