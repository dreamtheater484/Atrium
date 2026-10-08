import type { SeedElement } from '../types';

/**
 * Business domains, following the TM Forum (SID / ODA) split of a telco:
 * Customer, Product, Service, Resource, Partner, Enterprise and Intelligence.
 */
export const domains: SeedElement[] = [
  {
    ref: 'dom-customer',
    type: 'domain',
    name: 'Customer',
    key: 'customer',
    owner: 'Sofia Marquez',
    description:
      'Everything that touches the customer directly: sales, ordering, self-service, customer care, billing and payments.',
  },
  {
    ref: 'dom-product',
    type: 'domain',
    name: 'Product',
    key: 'product',
    owner: 'Daniel Okonkwo',
    description:
      'Designing, pricing and launching what Acme Telco sells, and keeping track of the products each customer has.',
  },
  {
    ref: 'dom-service',
    type: 'domain',
    name: 'Service',
    key: 'service',
    owner: 'Priya Raman',
    description:
      'Turning sold products into working services: service design, fulfilment, activation, assurance and field operations.',
  },
  {
    ref: 'dom-resource',
    type: 'domain',
    name: 'Resource',
    key: 'resource',
    owner: 'Henrik Lund',
    description:
      'The physical and virtual network: planning, rollout, inventory, provisioning, fault and performance management.',
  },
  {
    ref: 'dom-partner',
    type: 'domain',
    name: 'Partner',
    key: 'partner',
    owner: 'Isabel Duarte',
    description:
      'Working with dealers, wholesale customers, MVNOs, roaming partners and other operators, including settlement.',
  },
  {
    ref: 'dom-enterprise',
    type: 'domain',
    name: 'Enterprise',
    key: 'enterprise',
    owner: 'Marc Dubois',
    description:
      'Running the company itself: finance, procurement, HR, risk, security, IT service management and integration.',
  },
  {
    ref: 'dom-intelligence',
    type: 'domain',
    name: 'Intelligence',
    key: 'intelligence',
    owner: 'Yuki Tanaka',
    description:
      'Data and analytics: the data platform, reporting, customer and network insights, machine learning and data governance.',
  },
];

interface TeamSpec {
  ref: string;
  name: string;
  key: string;
  owner: string;
  domain: string;
  contact: string;
  description: string;
}

const teamSpecs: TeamSpec[] = [
  {
    ref: 'team-digital',
    name: 'Digital Channels',
    key: 'digital-channels',
    owner: 'Tom Becker',
    domain: 'dom-customer',
    contact: '#team-digital-channels',
    description:
      'Builds and runs the customer-facing digital channels: the MyAcme app, MyAcme Web, the Self-care Portal and the virtual assistant.',
  },
  {
    ref: 'team-billing',
    name: 'Billing Platform',
    key: 'billing-platform',
    owner: 'Rachel Adeyemi',
    domain: 'dom-customer',
    contact: '#team-billing',
    description:
      'Owns charging, billing, payments and collections, and leads the move to Corvina Cloud BSS.',
  },
  {
    ref: 'team-crm',
    name: 'CRM Squad',
    key: 'crm-squad',
    owner: 'Carlos Mendes',
    domain: 'dom-customer',
    contact: '#team-crm',
    description:
      'Runs Salesforce, Customer 360 and the legacy CRM systems, and delivers the CRM consolidation programme.',
  },
  {
    ref: 'team-commerce',
    name: 'Commerce Squad',
    key: 'commerce-squad',
    owner: 'Elena Rossi',
    domain: 'dom-product',
    contact: '#team-commerce',
    description:
      'Owns the product catalog, order capture and product inventory: the core of the Lead to Order and Order to Cash flows.',
  },
  {
    ref: 'team-oss',
    name: 'OSS Team',
    key: 'oss-team',
    owner: 'Rahul Mehta',
    domain: 'dom-service',
    contact: '#team-oss',
    description:
      'Runs the operations support systems: service orchestration, inventories, fault and performance management and ticketing.',
  },
  {
    ref: 'team-netauto',
    name: 'Network Automation',
    key: 'network-automation',
    owner: 'Erik Johansson',
    domain: 'dom-resource',
    contact: '#team-netauto',
    description:
      'Automates network configuration and lifecycle with the SDN controller, Ansible workflows and the 5G core orchestrator.',
  },
  {
    ref: 'team-data',
    name: 'Data Platform',
    key: 'data-platform',
    owner: 'Aisha Bello',
    domain: 'dom-intelligence',
    contact: '#team-data-platform',
    description:
      'Builds the Data Lake, reporting and machine-learning platforms, and is retiring the old data warehouse.',
  },
  {
    ref: 'team-integration',
    name: 'Integration Team',
    key: 'integration-team',
    owner: 'Pieter de Vries',
    domain: 'dom-enterprise',
    contact: '#team-integration',
    description:
      'Runs the API gateway, the event streaming platform and the old ESB, and helps teams publish TM Forum Open APIs.',
  },
  {
    ref: 'team-erp',
    name: 'ERP Team',
    key: 'erp-team',
    owner: 'Monika Nowak',
    domain: 'dom-enterprise',
    contact: '#team-erp',
    description: 'Runs SAP S/4HANA and Workday, and the finance and HR integrations around them.',
  },
  {
    ref: 'team-security',
    name: 'Identity & Security',
    key: 'identity-security',
    owner: "Grace O'Neill",
    domain: 'dom-enterprise',
    contact: '#team-identity-security',
    description:
      'Owns customer and employee identity, access management and fraud detection, and sets security standards.',
  },
  {
    ref: 'team-cloud',
    name: 'Cloud Platform',
    key: 'cloud-platform',
    owner: 'Lucas Moreau',
    domain: 'dom-enterprise',
    contact: '#team-cloud-platform',
    description:
      'Provides the shared Kubernetes and AWS platforms, databases and operating systems, and runs the cloud migration waves.',
  },
];

export const teams: SeedElement[] = teamSpecs.map((t) => ({
  ref: t.ref,
  type: 'team',
  name: t.name,
  key: t.key,
  owner: t.owner,
  domain: t.domain,
  description: t.description,
  attributes: { contact: t.contact },
}));
