import { type ElementType, type RelationType, typeDef } from '@atrium/schema';
import { XMLParser } from 'fast-xml-parser';
import { matchColumn } from './mapping';
import { ModelBuilder } from './model';
import { normalizeValue } from './normalize';
import { humanList, norm } from './text';
import type { NormalizedElement, NormalizedModel } from './types';

/** ArchiMate element types Atrium imports, and what they become. */
const ELEMENT_TYPE_MAP: Record<string, ElementType> = {
  Capability: 'capability',
  BusinessProcess: 'business_process',
  BusinessFunction: 'business_process',
  ApplicationComponent: 'application',
  ApplicationInterface: 'interface',
  DataObject: 'data_object',
  BusinessObject: 'data_object',
  Node: 'technology',
  Device: 'technology',
  SystemSoftware: 'technology',
  TechnologyService: 'technology',
  InfrastructureService: 'technology', // ArchiMate 2.x name
  WorkPackage: 'initiative',
  Principle: 'principle',
  Constraint: 'standard',
  Requirement: 'standard',
  Assessment: 'decision',
  BusinessActor: 'team',
  BusinessRole: 'team',
  Grouping: 'domain',
};

const ARRAY_TAGS = new Set([
  'element',
  'relationship',
  'property',
  'propertyDefinition',
  'propertydefinition',
  'propertyDef',
  'propertydef',
  'name',
  'label',
  'documentation',
  'value',
]);

type XmlNode = Record<string, unknown>;

function asNode(v: unknown): XmlNode | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as XmlNode) : undefined;
}

function asList(v: unknown): XmlNode[] {
  if (Array.isArray(v)) return v.map(asNode).filter((x): x is XmlNode => x !== undefined);
  const n = asNode(v);
  return n ? [n] : [];
}

/** Text of a (possibly multi-language) element such as <name xml:lang="en">, preferring English. */
function langText(v: unknown): string | undefined {
  const items = Array.isArray(v) ? v : v === undefined ? [] : [v];
  const texts = items
    .map((item) => {
      if (typeof item === 'string' || typeof item === 'number')
        return { text: String(item), lang: '' };
      const n = asNode(item);
      if (!n) return undefined;
      const text = n['#text'];
      return {
        text: typeof text === 'string' || typeof text === 'number' ? String(text) : '',
        lang: String(n['@_lang'] ?? ''),
      };
    })
    .filter((x): x is { text: string; lang: string } => x !== undefined && x.text.trim() !== '');
  if (!texts.length) return undefined;
  const preferred = texts.find((t) => t.lang.toLowerCase().startsWith('en')) ?? texts[0]!;
  return preferred.text.trim();
}

function attr(n: XmlNode, name: string): string | undefined {
  const v = n[`@_${name}`];
  return v === undefined || v === null ? undefined : String(v);
}

function relationshipKind(xsiType: string): string {
  const k = xsiType.replace(/Relationship$/, '');
  if (k === 'UsedBy') return 'Serving';
  if (k === 'Realisation') return 'Realization';
  if (k === 'Specialisation') return 'Specialization';
  return k;
}

type Action =
  | { kind: 'relation'; type: RelationType; from: string; to: string }
  | { kind: 'parent'; child: string; parent: string }
  | { kind: 'domain'; element: string; domain: string };

const SUPPORTERS: ElementType[] = ['application', 'technology', 'interface'];
const SUPPORTED: ElementType[] = ['capability', 'business_process'];
const GOVERNING: ElementType[] = ['principle', 'standard', 'decision'];

/** Maps an ArchiMate relationship between two imported elements to what it means in Atrium. */
function mapRelationship(
  kind: string,
  s: NormalizedElement,
  t: NormalizedElement,
  name?: string,
): Action | undefined {
  const rel = (type: RelationType, from: NormalizedElement, to: NormalizedElement): Action => ({
    kind: 'relation',
    type,
    from: from.ref,
    to: to.ref,
  });
  switch (kind) {
    case 'Serving':
      if (SUPPORTERS.includes(s.type) && SUPPORTED.includes(t.type)) return rel('supports', s, t);
      if (s.type === 'technology' && (t.type === 'application' || t.type === 'technology'))
        return rel('uses', t, s);
      if (s.type === 'application' && t.type === 'application') return rel('depends_on', t, s);
      if (s.type === 'interface' && t.type === 'application') return rel('consumes', t, s);
      return undefined;
    case 'Realization':
      if ((s.type === 'business_process' || s.type === 'initiative') && t.type === 'capability')
        return rel('realizes', s, t);
      if (SUPPORTERS.includes(s.type) && SUPPORTED.includes(t.type)) return rel('supports', s, t);
      if (s.type === 'application' && t.type === 'interface') return rel('exposes', s, t);
      if (s.type === 'application' && t.type === 'data_object') return rel('stores', s, t);
      if (s.type === 'technology' && t.type === 'application') return rel('uses', t, s);
      return undefined;
    case 'Flow':
    case 'Triggering':
      if (s.type === 'application' && t.type === 'application') return rel('flows_to', s, t);
      return undefined;
    case 'Access':
      if (s.type === 'application' && t.type === 'data_object') return rel('stores', s, t);
      return undefined;
    case 'Assignment':
      if (s.type === 'team' && t.type !== 'team') return rel('owned_by', t, s);
      return undefined;
    case 'Composition':
    case 'Aggregation':
      if (s.type === t.type && typeDef(s.type).hierarchical)
        return { kind: 'parent', child: t.ref, parent: s.ref };
      if (s.type === 'domain' && t.type !== 'domain')
        return { kind: 'domain', element: t.ref, domain: s.ref };
      if (s.type === 'application' && t.type === 'interface') return rel('exposes', s, t);
      return undefined;
    case 'Influence':
      if (s.type === 'initiative') return rel('impacts', s, t);
      // A principle, standard or decision influences what it governs.
      if (GOVERNING.includes(s.type)) return rel('governed_by', t, s);
      return undefined;
    case 'Association':
      if (name && /^replaces$/i.test(name.trim()) && s.type === t.type)
        return rel('replaces', s, t);
      if (s.type === 'initiative') return rel('impacts', s, t);
      if (t.type === 'initiative') return rel('impacts', t, s);
      if (GOVERNING.includes(t.type) && !GOVERNING.includes(s.type))
        return rel('governed_by', s, t);
      if (GOVERNING.includes(s.type) && !GOVERNING.includes(t.type))
        return rel('governed_by', t, s);
      if (SUPPORTERS.includes(s.type) && SUPPORTED.includes(t.type)) return rel('supports', s, t);
      if (SUPPORTERS.includes(t.type) && SUPPORTED.includes(s.type)) return rel('supports', t, s);
      if (s.type === 'team' && t.type !== 'team') return rel('owned_by', t, s);
      if (t.type === 'team' && s.type !== 'team') return rel('owned_by', s, t);
      if (s.type === 'domain' && t.type !== 'domain')
        return { kind: 'domain', element: t.ref, domain: s.ref };
      if (t.type === 'domain' && s.type !== 'domain')
        return { kind: 'domain', element: s.ref, domain: t.ref };
      return undefined;
    default:
      return undefined;
  }
}

function countSummary(counts: Map<string, number>): string {
  return humanList([...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`));
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/**
 * Reads an ArchiMate 3.x Open Exchange Format file (also most 2.x files) exported from
 * Archi, Sparx EA, BiZZdesign and others.
 */
export function parseArchimate(xml: string): NormalizedModel {
  const builder = new ModelBuilder();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    textNodeName: '#text',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    isArray: (name) => ARRAY_TAGS.has(name),
  });
  let doc: XmlNode;
  try {
    doc = parser.parse(xml) as XmlNode;
  } catch (err) {
    builder.warn(`The ArchiMate file could not be read: ${(err as Error).message}`);
    return builder.build();
  }
  const model = asNode(doc.model);
  if (!model) {
    builder.warn('The file has no ArchiMate <model> element');
    return builder.build();
  }

  // Property definitions: identifier → name.
  const propertyNames = new Map<string, string>();
  const defsContainer =
    asNode(model.propertyDefinitions) ??
    asNode(model.propertydefinitions) ??
    asNode(model.propertydefs) ??
    asNode(model.propertyDefs);
  if (defsContainer) {
    const defs = [
      ...asList(defsContainer.propertyDefinition),
      ...asList(defsContainer.propertydefinition),
      ...asList(defsContainer.propertydef),
      ...asList(defsContainer.propertyDef),
    ];
    for (const def of defs) {
      const id = attr(def, 'identifier');
      const name = langText(def.name) ?? attr(def, 'name');
      if (id && name) propertyNames.set(id, name);
    }
  }

  const skippedTypes = new Map<string, number>();
  const unknownProperties = new Set<string>();
  const pendingByName: Array<{ el: NormalizedElement; type: 'domain' | 'team'; name: string }> = [];

  for (const node of asList(asNode(model.elements)?.element)) {
    const xsiType = attr(node, 'type') ?? '';
    const type = ELEMENT_TYPE_MAP[xsiType];
    const ref = attr(node, 'identifier');
    if (!type) {
      if (xsiType && !/Junction$/.test(xsiType)) bump(skippedTypes, xsiType);
      continue;
    }
    if (!ref) continue;
    const name = langText(node.name) ?? langText(node.label);
    if (!name) {
      builder.warn(`Skipped an unnamed ${xsiType} (${ref})`);
      continue;
    }
    const el: NormalizedElement = { ref, type, name, externalIds: { archimate: ref } };
    const description = langText(node.documentation);
    if (description) el.description = description;

    const properties = asList(asNode(node.properties)?.property);
    for (const prop of properties) {
      const defRef =
        attr(prop, 'propertyDefinitionRef') ??
        attr(prop, 'identifierref') ??
        attr(prop, 'propertyDefinitionref');
      const propName = defRef ? propertyNames.get(defRef) : undefined;
      const raw = langText(prop.value);
      if (!propName || raw === undefined) continue;
      applyProperty(el, propName, raw, unknownProperties, (t, n) =>
        pendingByName.push({ el, type: t, name: n }),
      );
    }
    builder.add(el);
  }

  // Domains and teams named in properties: link to an element with that name, or a placeholder.
  for (const { el, type, name } of pendingByName) {
    const ref = builder.findByName(type, name)?.ref ?? `${type}:${norm(name)}`;
    if (!builder.has(ref)) builder.add({ ref, type, name, externalIds: {}, placeholder: true });
    if (type === 'domain') el.domainRef ??= ref;
    else builder.relate('owned_by', el.ref, ref);
  }

  const skippedRelations = new Map<string, number>();
  let danglingRelations = 0;
  for (const node of asList(asNode(model.relationships)?.relationship)) {
    const kind = relationshipKind(attr(node, 'type') ?? '');
    const s = builder.get(attr(node, 'source') ?? '');
    const t = builder.get(attr(node, 'target') ?? '');
    if (!s || !t) {
      danglingRelations++;
      continue;
    }
    const action = mapRelationship(kind, s, t, langText(node.name));
    if (!action) {
      bump(
        skippedRelations,
        `${kind} ${typeDef(s.type).label.toLowerCase()} → ${typeDef(t.type).label.toLowerCase()}`,
      );
      continue;
    }
    if (action.kind === 'relation') builder.relate(action.type, action.from, action.to);
    else if (action.kind === 'parent') setParent(builder, action.child, action.parent);
    else {
      const el = builder.get(action.element)!;
      if (el.domainRef && el.domainRef !== action.domain) {
        builder.warn(
          `"${el.name}" is in more than one grouping; kept "${builder.get(el.domainRef)?.name}" as its domain`,
        );
      } else el.domainRef = action.domain;
    }
  }

  if (skippedTypes.size) {
    const total = [...skippedTypes.values()].reduce((a, b) => a + b, 0);
    builder.warn(
      `Skipped ${total} ArchiMate ${total === 1 ? 'element' : 'elements'} of types Atrium does not use: ${countSummary(skippedTypes)}`,
    );
  }
  if (skippedRelations.size) {
    const total = [...skippedRelations.values()].reduce((a, b) => a + b, 0);
    builder.warn(
      `Skipped ${total} ${total === 1 ? 'relationship' : 'relationships'} with no Atrium meaning: ${countSummary(skippedRelations)}`,
    );
  }
  if (danglingRelations) {
    builder.warn(
      `Skipped ${danglingRelations} ${danglingRelations === 1 ? 'relationship' : 'relationships'} connected to skipped elements`,
    );
  }
  if (unknownProperties.size) {
    builder.warn(
      `Ignored properties Atrium does not know: ${humanList([...unknownProperties].slice(0, 8).map((p) => `"${p}"`))}${unknownProperties.size > 8 ? ' and more' : ''}`,
    );
  }
  return builder.build();
}

function setParent(builder: ModelBuilder, childRef: string, parentRef: string): void {
  const child = builder.get(childRef)!;
  if (child.parentRef && child.parentRef !== parentRef) {
    builder.warn(
      `"${child.name}" has more than one parent; kept "${builder.get(child.parentRef)?.name}"`,
    );
    return;
  }
  // Refuse cycles.
  for (
    let cur = builder.get(parentRef);
    cur;
    cur = cur.parentRef ? builder.get(cur.parentRef) : undefined
  ) {
    if (cur.ref === childRef) {
      builder.warn(`Ignored a parent link that would make "${child.name}" its own ancestor`);
      return;
    }
  }
  child.parentRef = parentRef;
}

/** Applies one ArchiMate property to an element, using the same column vocabulary as Excel imports. */
function applyProperty(
  el: NormalizedElement,
  propName: string,
  raw: string,
  unknown: Set<string>,
  link: (type: 'domain' | 'team', name: string) => void,
): void {
  const match = matchColumn(propName, el.type);
  if (!match) {
    unknown.add(propName);
    return;
  }
  const target = match.target;
  const { value } = normalizeValue(target, raw, el.type);
  if (value === undefined) return;
  if (target.kind === 'attribute') {
    el.attributes = { ...el.attributes, [target.key]: value };
    return;
  }
  if (target.kind === 'lifecycle_date') {
    el.lifecycleDates = { ...el.lifecycleDates, [target.phase]: String(value) };
    return;
  }
  if (target.kind !== 'core') {
    unknown.add(propName);
    return;
  }
  switch (target.field) {
    case 'key':
      el.key = String(value);
      break;
    case 'description':
      el.description ??= String(value);
      break;
    case 'owner':
      el.owner = String(value);
      break;
    case 'lifecycle':
      el.lifecycle = value as NormalizedElement['lifecycle'];
      break;
    case 'classification':
      el.classification = value as NormalizedElement['classification'];
      break;
    case 'tags':
      el.tags = value as string[];
      break;
    case 'external_id':
      el.externalIds[propName] = String(value);
      break;
    case 'domain':
      link('domain', String(value));
      break;
    case 'team':
      link('team', String(value));
      break;
    default:
      unknown.add(propName);
  }
}
