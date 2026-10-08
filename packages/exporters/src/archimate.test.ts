import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { el, sampleModel } from './__fixtures__/model';
import { ARCHIMATE_NS, archimateId, exportArchimate } from './archimate';

const ARRAYS = new Set(['element', 'relationship', 'property', 'propertyDefinition', 'item']);

function parse(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: (name) => ARRAYS.has(name),
  });
  return parser.parse(xml).model;
}

const nameOf = (node: { name: { '#text': string } | string }) =>
  typeof node.name === 'string' ? node.name : node.name['#text'];

describe('exportArchimate', () => {
  const model = sampleModel();
  const xml = exportArchimate(model);
  const doc = parse(xml);
  const elements: Array<Record<string, any>> = doc.elements.element;
  const relationships: Array<Record<string, any>> = doc.relationships.relationship;
  const idOf = (name: string) => archimateId(model.elements.find((e) => e.name === name)!.id);
  const find = (type: string, from: string, to: string) =>
    relationships.find(
      (r) => r['@_xsi:type'] === type && r['@_source'] === idOf(from) && r['@_target'] === idOf(to),
    );

  it('is well-formed XML in the ArchiMate 3.x exchange namespace', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(doc['@_xmlns']).toBe(ARCHIMATE_NS);
    expect(doc['@_xmlns:xsi']).toBe('http://www.w3.org/2001/XMLSchema-instance');
    expect(nameOf(doc)).toBe('Acme Telco');
  });

  it('exports every element with the mapped ArchiMate type', () => {
    expect(elements).toHaveLength(model.elements.length);
    const counts: Record<string, number> = {};
    for (const e of elements) counts[e['@_xsi:type']] = (counts[e['@_xsi:type']] ?? 0) + 1;
    expect(counts).toEqual({
      Grouping: 2,
      BusinessActor: 1,
      Capability: 4,
      ApplicationComponent: 3,
      ApplicationInterface: 1,
      DataObject: 1,
      SystemSoftware: 2,
      WorkPackage: 1,
    });
    for (const e of elements) expect(e['@_identifier']).toMatch(/^id-/);
    const crm = elements.find((e) => nameOf(e as never) === 'CRM Suite')!;
    expect(crm['@_identifier']).toBe(idOf('CRM Suite'));
    expect(crm.documentation['#text']).toContain('Customer relationship management');
  });

  it('maps relations, reversing the ones ArchiMate reads the other way', () => {
    // 14 relations minus 1 dangling, + 2 parent compositions, + 13 domain aggregations... computed:
    const withDomain = model.elements.filter((e) => e.domainId).length;
    const withParent = model.elements.filter((e) => e.parentId).length;
    expect(relationships).toHaveLength(model.relations.length - 1 + withDomain + withParent);

    expect(find('Serving', 'CRM Suite', 'Customer Onboarding')).toBeTruthy(); // supports
    expect(find('Serving', 'Java 8', 'Billing Engine')).toBeTruthy(); // uses, reversed
    expect(find('Serving', 'PostgreSQL 16', 'Billing Engine')).toBeTruthy(); // depends_on, reversed
    expect(find('Serving', 'Customer API', 'Billing Engine')).toBeTruthy(); // consumes, reversed
    expect(find('Flow', 'CRM Suite', 'Billing Engine')).toBeTruthy();
    expect(find('Composition', 'CRM Suite', 'Customer API')).toBeTruthy(); // exposes
    expect(find('Access', 'Billing Engine', 'Invoice')?.['@_accessType']).toBe('ReadWrite');
    expect(find('Assignment', 'Billing Squad', 'Billing Engine')).toBeTruthy(); // owned_by, reversed
    expect(find('Influence', 'Billing Modernisation', 'Billing Engine')).toBeTruthy(); // impacts
    const replaces = find('Association', 'Billing Engine', 'Legacy Portal');
    expect(nameOf(replaces as never)).toBe('replaces');
    expect(find('Composition', 'Billing', 'Invoicing')).toBeTruthy(); // parent hierarchy
    expect(find('Aggregation', 'Finance', 'Billing Engine')).toBeTruthy(); // domain membership

    const ids = new Set(elements.map((e) => e['@_identifier']));
    for (const r of relationships) {
      expect(ids.has(r['@_source'])).toBe(true);
      expect(ids.has(r['@_target'])).toBe(true);
    }
  });

  it('writes attributes as string properties with matching definitions', () => {
    const defs: Array<Record<string, any>> = doc.propertyDefinitions.propertyDefinition;
    const defIds = new Map(defs.map((d) => [d['@_identifier'], nameOf(d as never)]));
    for (const d of defs) expect(d['@_type']).toBe('string');
    const crm = elements.find((e) => nameOf(e as never) === 'CRM Suite')!;
    const props = Object.fromEntries(
      crm.properties.property.map((p: Record<string, any>) => [
        defIds.get(p['@_propertyDefinitionRef']),
        String(p.value['#text']),
      ]),
    );
    expect(props).toMatchObject({
      Key: 'APP-001',
      Owner: 'Jane Doe',
      Lifecycle: 'Active',
      'Active date': '2021-03-01',
      Vendor: 'Salesforce',
      Hosting: 'SaaS',
      'Annual cost': '120000',
      TIME: 'Invest',
      Tags: 'crm, core',
      'Sla hours': '4',
    });
    for (const e of elements) {
      for (const p of e.properties?.property ?? [])
        expect(defIds.has(p['@_propertyDefinitionRef'])).toBe(true);
    }
  });

  it('files elements and relations into Archi-style folders', () => {
    const folders: Array<Record<string, any>> = doc.organizations.item;
    const labels = folders.map((f) => f.label['#text']);
    expect(labels).toEqual([
      'Strategy',
      'Business',
      'Application',
      'Technology & Physical',
      'Implementation & Migration',
      'Other',
      'Relations',
    ]);
    const filed = folders
      .slice(0, -1)
      .flatMap((f) => f.item.map((i: Record<string, string>) => i['@_identifierRef']));
    expect(new Set(filed).size).toBe(model.elements.length);
  });

  it('escapes markup and strips characters XML cannot carry', () => {
    const odd = el({ type: 'application', name: 'A <b> & "c"\u0001', description: "it's > 3 ]]>" });
    const out = exportArchimate({ ...model, elements: [odd], relations: [] });
    expect(XMLValidator.validate(out)).toBe(true);
    const parsed = parse(out);
    const node = parsed.elements.element[0];
    expect(nameOf(node)).toBe('A <b> & "c"');
    expect(node.documentation['#text']).toBe("it's > 3 ]]>");
  });
});
