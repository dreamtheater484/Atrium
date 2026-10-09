import {
  ELEMENT_TYPE_DEFS,
  type Element,
  type ElementType,
  enumLabel,
  LIFECYCLE_PHASES,
  type Relation,
  type RelationType,
} from '@atrium/schema';
import { attributeText, formatDisplayDate, humanizeKey, indexById, isEmpty } from './model';
import type { ExportModel } from './types';

export const ARCHIMATE_NS = 'http://www.opengroup.org/xsd/archimate/3.0/';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';
const SCHEMA_LOCATION = `${ARCHIMATE_NS} http://www.opengroup.org/xsd/archimate/3.1/archimate3_Model.xsd`;

/** Atrium element type → ArchiMate 3.1 element type. */
export const ARCHIMATE_ELEMENT_TYPES: Record<ElementType, string> = {
  capability: 'Capability',
  business_process: 'BusinessProcess',
  application: 'ApplicationComponent',
  interface: 'ApplicationInterface',
  data_object: 'DataObject',
  technology: 'SystemSoftware',
  contract: 'Contract',
  initiative: 'WorkPackage',
  principle: 'Principle',
  standard: 'Constraint',
  decision: 'Assessment',
  team: 'BusinessActor',
  domain: 'Grouping',
};

interface RelationMapping {
  type: string;
  /** ArchiMate reads the other way round, e.g. "technology serves application" for `uses`. */
  reverse?: boolean;
  name?: string;
  accessType?: 'Access' | 'Read' | 'Write' | 'ReadWrite';
}

/** Atrium relation type → ArchiMate 3.1 relationship. */
export const ARCHIMATE_RELATIONSHIPS: Record<RelationType, RelationMapping> = {
  supports: { type: 'Serving' },
  realizes: { type: 'Realization' },
  depends_on: { type: 'Serving', reverse: true },
  flows_to: { type: 'Flow' },
  exposes: { type: 'Composition' },
  consumes: { type: 'Serving', reverse: true },
  uses: { type: 'Serving', reverse: true },
  stores: { type: 'Access', accessType: 'ReadWrite' },
  owned_by: { type: 'Assignment', reverse: true },
  governed_by: { type: 'Influence', reverse: true },
  impacts: { type: 'Influence' },
  maps_to: { type: 'Association' },
  replaces: { type: 'Association', name: 'replaces' },
  covers: { type: 'Association', name: 'covers' },
};

/** Archi-style folders used in the <organizations> section. */
const FOLDERS: Array<{ label: string; types: string[] }> = [
  { label: 'Strategy', types: ['Capability'] },
  { label: 'Business', types: ['BusinessActor', 'BusinessProcess', 'Contract'] },
  { label: 'Application', types: ['ApplicationComponent', 'ApplicationInterface', 'DataObject'] },
  { label: 'Technology & Physical', types: ['SystemSoftware'] },
  { label: 'Motivation', types: ['Principle', 'Constraint', 'Assessment'] },
  { label: 'Implementation & Migration', types: ['WorkPackage'] },
  { label: 'Other', types: ['Grouping'] },
];

/* ------------------------------------------------------------------ */
/* Minimal XML writer                                                   */
/* ------------------------------------------------------------------ */

interface XmlNode {
  tag: string;
  attrs?: Record<string, string | undefined>;
  text?: string;
  children?: XmlNode[];
}

// Characters that are not allowed in XML 1.0 documents.
const INVALID_XML =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function clean(s: string): string {
  return s.replace(INVALID_XML, '');
}

function escText(s: string): string {
  return clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s: string): string {
  return escText(s).replace(/"/g, '&quot;').replace(/\r?\n/g, '&#10;').replace(/\t/g, '&#9;');
}

function render(node: XmlNode, depth = 0): string {
  const pad = '  '.repeat(depth);
  const attrs = Object.entries(node.attrs ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${escAttr(v!)}"`)
    .join('');
  if (node.children?.length) {
    const inner = node.children.map((c) => render(c, depth + 1)).join('\n');
    return `${pad}<${node.tag}${attrs}>\n${inner}\n${pad}</${node.tag}>`;
  }
  if (node.text !== undefined && node.text !== '') {
    return `${pad}<${node.tag}${attrs}>${escText(node.text)}</${node.tag}>`;
  }
  return `${pad}<${node.tag}${attrs}/>`;
}

const lang = (tag: string, text: string): XmlNode => ({ tag, attrs: { 'xml:lang': 'en' }, text });

/** "id-" + the Atrium id, made safe for xs:ID. */
export function archimateId(id: string): string {
  return `id-${id.replace(/[^A-Za-z0-9_.-]/g, '_')}`;
}

/* ------------------------------------------------------------------ */
/* Export                                                               */
/* ------------------------------------------------------------------ */

interface PropertyBag {
  defs: Map<string, string>; // label → propid
  ref(label: string): string;
}

function propertyBag(): PropertyBag {
  const defs = new Map<string, string>();
  const ids = new Set<string>();
  return {
    defs,
    ref(label: string) {
      const known = defs.get(label);
      if (known) return known;
      const base = `propid-${
        label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'property'
      }`;
      let id = base;
      for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
      ids.add(id);
      defs.set(label, id);
      return id;
    },
  };
}

function elementProperties(el: Element, props: PropertyBag): XmlNode[] {
  const def = ELEMENT_TYPE_DEFS[el.type];
  const pairs: Array<[string, string]> = [];
  if (el.key) pairs.push(['Key', el.key]);
  if (el.owner) pairs.push(['Owner', el.owner]);
  if (el.lifecycle) pairs.push(['Lifecycle', enumLabel(el.lifecycle)]);
  for (const phase of LIFECYCLE_PHASES) {
    const date = el.lifecycleDates?.[phase];
    if (date) pairs.push([`${enumLabel(phase)} date`, date]);
  }
  if (el.classification) pairs.push(['Classification', enumLabel(el.classification)]);
  if (el.tags?.length) pairs.push(['Tags', el.tags.join(', ')]);

  const known = new Set<string>();
  for (const attr of def.attributes) {
    known.add(attr.key);
    const value = el.attributes?.[attr.key];
    if (!isEmpty(value)) pairs.push([attr.label, attributeText(attr, value)]);
  }
  for (const [key, value] of Object.entries(el.attributes ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (known.has(key) || key.startsWith('_') || isEmpty(value)) continue;
    pairs.push([humanizeKey(key), attributeText(undefined, value)]);
  }

  return pairs.map(([label, value]) => ({
    tag: 'property',
    attrs: { propertyDefinitionRef: props.ref(label) },
    children: [lang('value', value)],
  }));
}

interface OutRelationship {
  id: string;
  type: string;
  source: string;
  target: string;
  name?: string;
  accessType?: string;
}

/**
 * Exports the model as an ArchiMate 3.1 Open Exchange Format document, ready for Archi,
 * BiZZdesign, Sparx EA and other ArchiMate tools.
 */
export function exportArchimate(model: ExportModel): string {
  const byId = indexById(model.elements);
  const props = propertyBag();
  const byName = (a: Element, b: Element) =>
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  const elements = [...model.elements].sort((a, b) => a.type.localeCompare(b.type) || byName(a, b));

  const elementNodes: XmlNode[] = elements.map((el) => {
    const children: XmlNode[] = [lang('name', el.name)];
    if (el.description?.trim()) children.push(lang('documentation', el.description));
    const properties = elementProperties(el, props);
    if (properties.length) children.push({ tag: 'properties', children: properties });
    return {
      tag: 'element',
      attrs: { identifier: archimateId(el.id), 'xsi:type': ARCHIMATE_ELEMENT_TYPES[el.type] },
      children,
    };
  });

  const relationships: OutRelationship[] = [];
  const addRelation = (rel: Relation) => {
    const map = ARCHIMATE_RELATIONSHIPS[rel.type];
    if (!map || !byId.has(rel.sourceId) || !byId.has(rel.targetId)) return;
    const [from, to] = map.reverse ? [rel.targetId, rel.sourceId] : [rel.sourceId, rel.targetId];
    relationships.push({
      id: archimateId(rel.id),
      type: map.type,
      source: archimateId(from),
      target: archimateId(to),
      name: map.name,
      accessType: map.accessType,
    });
  };
  for (const rel of model.relations) addRelation(rel);

  // Structure that Atrium keeps as fields: parent → child composition, domain grouping.
  for (const el of elements) {
    if (el.parentId && el.parentId !== el.id && byId.has(el.parentId)) {
      relationships.push({
        id: archimateId(`${el.id}-parent`),
        type: 'Composition',
        source: archimateId(el.parentId),
        target: archimateId(el.id),
      });
    }
    const domain = el.domainId ? byId.get(el.domainId) : undefined;
    if (domain && domain.id !== el.id && domain.type === 'domain') {
      relationships.push({
        id: archimateId(`${el.id}-domain`),
        type: 'Aggregation',
        source: archimateId(domain.id),
        target: archimateId(el.id),
      });
    }
  }

  const relationshipNodes: XmlNode[] = relationships.map((r) => ({
    tag: 'relationship',
    attrs: {
      identifier: r.id,
      source: r.source,
      target: r.target,
      'xsi:type': r.type,
      accessType: r.accessType,
    },
    children: r.name ? [lang('name', r.name)] : undefined,
  }));

  // Archi-style folders.
  const folderItems: XmlNode[] = [];
  for (const folder of FOLDERS) {
    const members = elements.filter((el) =>
      folder.types.includes(ARCHIMATE_ELEMENT_TYPES[el.type]),
    );
    if (!members.length) continue;
    folderItems.push({
      tag: 'item',
      children: [
        lang('label', folder.label),
        ...members.map((el) => ({ tag: 'item', attrs: { identifierRef: archimateId(el.id) } })),
      ],
    });
  }
  if (relationships.length) {
    folderItems.push({
      tag: 'item',
      children: [
        lang('label', 'Relations'),
        ...relationships.map((r) => ({ tag: 'item', attrs: { identifierRef: r.id } })),
      ],
    });
  }

  const modelChildren: XmlNode[] = [
    lang('name', model.workspaceName || 'Atrium'),
    lang(
      'documentation',
      `Exported from Atrium (workspace "${model.workspaceName}") on ${formatDisplayDate(model.generatedAt)}.`,
    ),
  ];
  if (elementNodes.length) modelChildren.push({ tag: 'elements', children: elementNodes });
  if (relationshipNodes.length)
    modelChildren.push({ tag: 'relationships', children: relationshipNodes });
  if (folderItems.length) modelChildren.push({ tag: 'organizations', children: folderItems });
  if (props.defs.size) {
    modelChildren.push({
      tag: 'propertyDefinitions',
      children: [...props.defs].map(([label, id]) => ({
        tag: 'propertyDefinition',
        attrs: { identifier: id, type: 'string' },
        children: [lang('name', label)],
      })),
    });
  }

  const root: XmlNode = {
    tag: 'model',
    attrs: {
      xmlns: ARCHIMATE_NS,
      'xmlns:xsi': XSI_NS,
      'xsi:schemaLocation': SCHEMA_LOCATION,
      identifier: archimateId(`atrium-${model.workspaceName || 'model'}`),
    },
    children: modelChildren,
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n${render(root)}\n`;
}
