import type { Element, Relation, RelationType } from '@atrium/schema';
import type { ExportModel } from '../types';

let seq = 0;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function el(partial: Partial<Element> & Pick<Element, 'type' | 'name'>): Element {
  seq += 1;
  return {
    id: uuid(seq),
    key: null,
    description: '',
    domainId: null,
    parentId: null,
    owner: null,
    lifecycle: null,
    lifecycleDates: {},
    classification: 'internal',
    attributes: {},
    tags: [],
    externalIds: {},
    source: null,
    layer: 'org',
    pack: null,
    quality: 50,
    health: null,
    healthReasons: [],
    suggestions: {},
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: null,
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: null,
    version: 1,
    ...partial,
  };
}

let relSeq = 0;
export function rel(type: RelationType, source: Element, target: Element | string): Relation {
  relSeq += 1;
  return {
    id: `10000000-0000-4000-8000-${String(relSeq).padStart(12, '0')}`,
    type,
    sourceId: source.id,
    targetId: typeof target === 'string' ? target : target.id,
    attributes: {},
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: null,
  };
}

/** A small but representative workspace. */
export function sampleModel(): ExportModel {
  const customer = el({ type: 'domain', name: 'Customer', description: 'Everything about customers.' });
  const finance = el({ type: 'domain', name: 'Finance', description: 'Money in, money out.' });
  const squad = el({ type: 'team', name: 'Billing Squad', attributes: { contact: '#billing' } });

  const custMgmt = el({ type: 'capability', name: 'Customer Management', domainId: customer.id, attributes: { importance: 'high', maturity: 3 } });
  const onboarding = el({ type: 'capability', name: 'Customer Onboarding', domainId: customer.id, parentId: custMgmt.id });
  const billing = el({ type: 'capability', name: 'Billing', domainId: finance.id, attributes: { importance: 'medium' } });
  const invoicing = el({ type: 'capability', name: 'Invoicing', domainId: finance.id, parentId: billing.id });

  const crm = el({
    type: 'application',
    name: 'CRM Suite',
    key: 'APP-001',
    description: 'Customer relationship management for sales and service.\nUsed by 400 agents.',
    domainId: customer.id,
    owner: 'Jane Doe',
    lifecycle: 'active',
    lifecycleDates: { active: '2021-03-01' },
    tags: ['crm', 'core'],
    attributes: {
      vendor: 'Salesforce',
      hosting: 'saas',
      annual_cost: 120000,
      users: 400,
      criticality: 'high',
      time: 'invest',
      business_fit: 4,
      technical_fit: 4,
      url: 'https://crm.example.com',
      sla_hours: 4,
    },
    quality: 92,
    health: 'good',
  });
  const billingEngine = el({
    type: 'application',
    name: 'Billing Engine',
    key: 'APP-002',
    description: 'Rates usage & produces <invoices> for "all" customers.',
    domainId: finance.id,
    owner: 'John Roe',
    lifecycle: 'phase_out',
    lifecycleDates: { active: '2015-01-01', phase_out: '2026-06-30' },
    classification: 'confidential',
    attributes: { vendor: 'In-house', hosting: 'on_premise', annual_cost: 85000.5, time: 'migrate', technical_fit: 2 },
    quality: 64,
    health: 'act',
  });
  const portal = el({ type: 'application', name: 'Legacy Portal', lifecycle: 'retired', quality: 30 });

  const api = el({ type: 'interface', name: 'Customer API', lifecycle: 'active', attributes: { protocol: 'rest', frequency: 'realtime' } });
  const invoice = el({ type: 'data_object', name: 'Invoice', attributes: { sensitivity: 'financial' } });
  const pg = el({
    type: 'technology',
    name: 'PostgreSQL 16',
    lifecycle: 'active',
    attributes: { category: 'database', version: '16', radar: 'adopt', eol_date: '2028-11-09' },
    health: 'good',
  });
  const java = el({
    type: 'technology',
    name: 'Java 8',
    lifecycle: 'phase_out',
    attributes: { category: 'runtime', version: '8', radar: 'hold', eol_date: '2030-12-31' },
    health: 'watch',
  });
  const program = el({
    type: 'initiative',
    name: 'Billing Modernisation',
    attributes: { status: 'running', start_date: '2026-01-01', end_date: '2027-06-30', budget: 1500000, progress: 40 },
  });

  const elements = [
    customer, finance, squad, custMgmt, onboarding, billing, invoicing,
    crm, billingEngine, portal, api, invoice, pg, java, program,
  ];
  const relations = [
    rel('supports', crm, onboarding),
    rel('supports', crm, custMgmt),
    rel('supports', billingEngine, invoicing),
    rel('uses', crm, pg),
    rel('uses', billingEngine, java),
    rel('flows_to', crm, billingEngine),
    rel('exposes', crm, api),
    rel('consumes', billingEngine, api),
    rel('stores', billingEngine, invoice),
    rel('owned_by', billingEngine, squad),
    rel('impacts', program, billingEngine),
    rel('replaces', billingEngine, portal),
    rel('depends_on', billingEngine, pg),
    rel('supports', crm, 'missing-element'), // dangling: skipped by every exporter
  ];
  return {
    elements,
    relations,
    workspaceName: 'Acme Telco',
    generatedAt: '2026-10-08T09:30:00.000Z',
  };
}
