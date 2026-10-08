import { describe, expect, it } from 'vitest';
import { parseArchimate } from './archimate';
import { parseFile } from './parse-file';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/"
       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       xsi:schemaLocation="http://www.opengroup.org/xsd/archimate/3.0/ http://www.opengroup.org/xsd/archimate/3.1/archimate3_Diagram.xsd"
       identifier="id-model">
  <name xml:lang="en">ACME</name>
  <elements>
    <element identifier="id-cap-sales" xsi:type="Capability">
      <name xml:lang="nl">Verkoop</name>
      <name xml:lang="en">Sales</name>
      <documentation xml:lang="en">Selling &amp; retaining customers</documentation>
    </element>
    <element identifier="id-cap-leads" xsi:type="Capability">
      <name xml:lang="en">Lead Management</name>
    </element>
    <element identifier="id-crm" xsi:type="ApplicationComponent">
      <name xml:lang="en">CRM</name>
      <properties>
        <property propertyDefinitionRef="pd-vendor"><value xml:lang="en">Salesforce</value></property>
        <property propertyDefinitionRef="pd-status"><value xml:lang="en">In production</value></property>
        <property propertyDefinitionRef="pd-cost"><value xml:lang="en">€ 250k</value></property>
        <property propertyDefinitionRef="pd-domain"><value xml:lang="en">Commercial</value></property>
        <property propertyDefinitionRef="pd-colour"><value xml:lang="en">Blue</value></property>
      </properties>
    </element>
    <element identifier="id-erp" xsi:type="ApplicationComponent"><name xml:lang="en">ERP</name></element>
    <element identifier="id-api" xsi:type="ApplicationInterface"><name xml:lang="en">Orders API</name></element>
    <element identifier="id-db" xsi:type="SystemSoftware"><name xml:lang="en">PostgreSQL</name></element>
    <element identifier="id-cust" xsi:type="BusinessObject"><name xml:lang="en">Customer</name></element>
    <element identifier="id-team" xsi:type="BusinessActor"><name xml:lang="en">Sales IT</name></element>
    <element identifier="id-proc" xsi:type="BusinessProcess"><name xml:lang="en">Qualify lead</name></element>
    <element identifier="id-wp" xsi:type="WorkPackage"><name xml:lang="en">CRM upgrade</name></element>
    <element identifier="id-grp" xsi:type="Grouping"><name xml:lang="en">Commercial</name></element>
    <element identifier="id-svc" xsi:type="ApplicationService"><name xml:lang="en">Customer service</name></element>
    <element identifier="id-j" xsi:type="AndJunction"/>
  </elements>
  <relationships>
    <relationship identifier="r1" source="id-crm" target="id-cap-sales" xsi:type="Serving"/>
    <relationship identifier="r2" source="id-db" target="id-crm" xsi:type="Serving"/>
    <relationship identifier="r3" source="id-proc" target="id-cap-leads" xsi:type="Realization"/>
    <relationship identifier="r4" source="id-crm" target="id-erp" xsi:type="Flow"/>
    <relationship identifier="r5" source="id-crm" target="id-cust" xsi:type="Access" accessType="Write"/>
    <relationship identifier="r6" source="id-team" target="id-crm" xsi:type="Assignment"/>
    <relationship identifier="r7" source="id-cap-sales" target="id-cap-leads" xsi:type="Composition"/>
    <relationship identifier="r8" source="id-grp" target="id-erp" xsi:type="Aggregation"/>
    <relationship identifier="r9" source="id-wp" target="id-crm" xsi:type="Influence"/>
    <relationship identifier="r10" source="id-crm" target="id-api" xsi:type="Composition"/>
    <relationship identifier="r11" source="id-erp" target="id-crm" xsi:type="Association"/>
    <relationship identifier="r12" source="id-svc" target="id-crm" xsi:type="Realization"/>
    <relationship identifier="r13" source="id-team" target="id-cap-sales" xsi:type="Serving"/>
    <relationship identifier="r14" source="id-crm" target="id-cap-sales" xsi:type="Realization"/>
  </relationships>
  <propertyDefinitions>
    <propertyDefinition identifier="pd-vendor" type="string"><name xml:lang="en">Vendor</name></propertyDefinition>
    <propertyDefinition identifier="pd-status" type="string"><name xml:lang="en">Lifecycle status</name></propertyDefinition>
    <propertyDefinition identifier="pd-cost" type="string"><name xml:lang="en">Annual cost</name></propertyDefinition>
    <propertyDefinition identifier="pd-domain" type="string"><name xml:lang="en">Domain</name></propertyDefinition>
    <propertyDefinition identifier="pd-colour" type="string"><name xml:lang="en">Colour</name></propertyDefinition>
  </propertyDefinitions>
</model>`;

describe('parseArchimate', () => {
  const model = parseArchimate(SAMPLE);
  const byRef = Object.fromEntries(model.elements.map((e) => [e.ref, e]));

  it('maps element types and skips the ones Atrium does not use', () => {
    expect(model.elements.map((e) => [e.ref, e.type, e.name])).toEqual([
      ['id-cap-sales', 'capability', 'Sales'],
      ['id-cap-leads', 'capability', 'Lead Management'],
      ['id-crm', 'application', 'CRM'],
      ['id-erp', 'application', 'ERP'],
      ['id-api', 'interface', 'Orders API'],
      ['id-db', 'technology', 'PostgreSQL'],
      ['id-cust', 'data_object', 'Customer'],
      ['id-team', 'team', 'Sales IT'],
      ['id-proc', 'business_process', 'Qualify lead'],
      ['id-wp', 'initiative', 'CRM upgrade'],
      ['id-grp', 'domain', 'Commercial'],
    ]);
    expect(byRef['id-cap-sales']).toMatchObject({
      description: 'Selling & retaining customers',
      externalIds: { archimate: 'id-cap-sales' },
    });
  });

  it('reads properties through the same vocabulary as spreadsheets', () => {
    expect(byRef['id-crm']).toEqual({
      ref: 'id-crm',
      type: 'application',
      name: 'CRM',
      lifecycle: 'active',
      attributes: { vendor: 'Salesforce', annual_cost: 250_000 },
      domainRef: 'id-grp',
      externalIds: { archimate: 'id-crm' },
    });
  });

  it('maps relationships to Atrium relations, parents and domains', () => {
    expect(model.relations).toEqual([
      { type: 'supports', from: 'id-crm', to: 'id-cap-sales' },
      { type: 'uses', from: 'id-crm', to: 'id-db' },
      { type: 'realizes', from: 'id-proc', to: 'id-cap-leads' },
      { type: 'flows_to', from: 'id-crm', to: 'id-erp' },
      { type: 'stores', from: 'id-crm', to: 'id-cust' },
      { type: 'owned_by', from: 'id-crm', to: 'id-team' },
      { type: 'impacts', from: 'id-wp', to: 'id-crm' },
      { type: 'exposes', from: 'id-crm', to: 'id-api' },
    ]);
    expect(byRef['id-cap-leads']!.parentRef).toBe('id-cap-sales');
    expect(byRef['id-erp']!.domainRef).toBe('id-grp');
  });

  it('summarises what it skipped', () => {
    expect(model.warnings).toEqual([
      'Skipped 1 ArchiMate element of types Atrium does not use: ApplicationService (1)',
      'Skipped 2 relationships with no Atrium meaning: Association application → application (1) and Serving team → capability (1)',
      'Skipped 1 relationship connected to skipped elements',
      'Ignored properties Atrium does not know: "Colour"',
    ]);
  });

  it('is picked up by parseFile', async () => {
    const parsed = await parseFile('model.xml', new TextEncoder().encode(SAMPLE));
    expect(parsed.format).toBe('archimate');
    expect(parsed.model?.elements).toHaveLength(11);
    expect(parsed.warnings).toHaveLength(4);
  });

  it('reads ArchiMate 2.x exchange files (label, *Relationship types)', () => {
    const v2 = `<?xml version="1.0"?>
<model xmlns="http://www.opengroup.org/xsd/archimate" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" identifier="m">
  <elements>
    <element identifier="a" xsi:type="ApplicationComponent"><label xml:lang="en">CRM</label></element>
    <element identifier="b" xsi:type="InfrastructureService"><label xml:lang="en">Hosting</label></element>
  </elements>
  <relationships>
    <relationship identifier="r" source="b" target="a" xsi:type="UsedByRelationship"/>
  </relationships>
</model>`;
    const m = parseArchimate(v2);
    expect(m.elements.map((e) => [e.name, e.type])).toEqual([
      ['CRM', 'application'],
      ['Hosting', 'technology'],
    ]);
    expect(m.relations).toEqual([{ type: 'uses', from: 'a', to: 'b' }]);
  });

  it('reports files that are not ArchiMate models', () => {
    expect(parseArchimate('<foo/>').warnings).toEqual([
      'The file has no ArchiMate <model> element',
    ]);
  });
});
