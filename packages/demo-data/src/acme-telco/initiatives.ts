import type { INITIATIVE_STATUS } from '@atrium/schema';
import type { SeedElement, SeedRelation } from '../types';
import { fanOut } from './helpers';

type InitiativeStatus = (typeof INITIATIVE_STATUS)[number];

interface InitiativeSpec {
  ref: string;
  name: string;
  key: string;
  owner: string;
  sponsor: string;
  status: InitiativeStatus;
  start: string;
  end: string;
  /** EUR, total over the initiative */
  budget: number;
  /** 0-100 */
  progress: number;
  description: string;
  /** Elements the initiative changes. */
  impacts: string[];
  /** Capabilities the initiative builds or improves. */
  realizes?: string[];
}

const specs: InitiativeSpec[] = [
  {
    ref: 'init-crm-consolidation',
    name: 'CRM consolidation',
    key: 'crm-consolidation',
    owner: 'Carlos Mendes',
    sponsor: 'Sofia Marquez',
    status: 'running',
    start: '2025-01-06',
    end: '2028-03-31',
    budget: 6_500_000,
    progress: 45,
    description:
      'Move all customers, cases and contracts from Legacy CRM and Siebel to Salesforce, then switch both legacy systems off.',
    impacts: [
      'app-legacy-crm',
      'app-siebel',
      'app-sf-service',
      'app-sf-sales',
      'app-customer-360',
      'app-contact-centre',
      'if-legacy-crm-db',
    ],
    realizes: ['cap-cust-info'],
  },
  {
    ref: 'init-billing-modernisation',
    name: 'Billing modernisation',
    key: 'billing-modernisation',
    owner: 'Rachel Adeyemi',
    sponsor: 'Marc Dubois',
    status: 'running',
    start: '2025-03-03',
    end: '2028-06-30',
    budget: 12_800_000,
    progress: 35,
    description:
      'Replace Convergent Billing and Enterprise Billing with Corvina Cloud BSS, and move payments to Payment Gateway v2.',
    impacts: [
      'app-billing',
      'app-cloud-bss',
      'app-b2b-billing',
      'app-mediation',
      'app-ocs',
      'app-collections',
      'app-payment-gateway',
      'app-payment-gateway-v2',
    ],
    realizes: ['cap-billing'],
  },
  {
    ref: 'init-cloud-wave1',
    name: 'Cloud migration wave 1',
    key: 'cloud-wave-1',
    owner: 'Lucas Moreau',
    sponsor: 'Martin Keller',
    status: 'done',
    start: '2023-09-04',
    end: '2025-06-30',
    budget: 3_600_000,
    progress: 100,
    description:
      'First wave of moves to AWS: the digital channels and the analytics platform, plus the shared Amazon EKS landing zone.',
    impacts: ['app-myacme-app', 'app-device-webshop', 'app-ava', 'app-data-lake', 'tech-eks'],
  },
  {
    ref: 'init-cloud-wave2',
    name: 'Cloud migration wave 2',
    key: 'cloud-wave-2',
    owner: 'Mia Laurent',
    sponsor: 'Martin Keller',
    status: 'running',
    start: '2026-01-12',
    end: '2027-06-30',
    budget: 4_200_000,
    progress: 30,
    description:
      'Move the commerce core (Order Hub, Product Catalog, Product Inventory) and the Partner Portal from the private cloud to AWS.',
    impacts: [
      'app-order-hub',
      'app-product-catalog',
      'app-product-inventory',
      'app-partner-portal',
      'app-notification-hub',
      'app-api-gateway',
      'tech-k8s',
      'tech-eks',
    ],
  },
  {
    ref: 'init-5g-sa',
    name: '5G SA launch',
    key: '5g-sa-launch',
    owner: 'Erik Johansson',
    sponsor: 'Henrik Lund',
    status: 'running',
    start: '2025-05-05',
    end: '2027-03-31',
    budget: 18_000_000,
    progress: 55,
    description:
      'Launch 5G standalone with network slicing for consumers and business customers in January 2027.',
    impacts: [
      'app-5g-orchestrator',
      'app-service-orchestrator',
      'app-activation-gateway',
      'app-network-inventory',
      'app-sdn-controller',
      'app-ocs',
      'app-product-catalog',
    ],
    realizes: ['cap-net-automation', 'cap-svc-activation'],
  },
  {
    ref: 'init-selfcare-relaunch',
    name: 'Self-care app relaunch',
    key: 'selfcare-relaunch',
    owner: 'Tom Becker',
    sponsor: 'Sofia Marquez',
    status: 'running',
    start: '2025-09-01',
    end: '2027-06-30',
    budget: 3_100_000,
    progress: 40,
    description:
      'Relaunch MyAcme as one experience across app and web, retire the Self-care Portal and lift self-service from 48% to 65% of contacts.',
    impacts: [
      'app-myacme-app',
      'app-myacme-web',
      'app-selfcare-portal',
      'app-acme-identity',
      'app-payment-gateway-v2',
    ],
    realizes: ['cap-self-service'],
  },
  {
    ref: 'init-data-platform-2',
    name: 'Data platform 2.0',
    key: 'data-platform-2',
    owner: 'Aisha Bello',
    sponsor: 'Yuki Tanaka',
    status: 'running',
    start: '2026-02-02',
    end: '2027-12-31',
    budget: 5_500_000,
    progress: 20,
    description:
      'Make the Data Lake the single analytics platform, retire the data warehouse and Cognos, and introduce data ownership and quality rules.',
    impacts: [
      'app-data-lake',
      'app-edw',
      'app-cognos',
      'app-power-bi',
      'app-finance-cube',
      'app-ml-platform',
      'app-mdm',
    ],
    realizes: ['cap-data-platform', 'cap-bi', 'cap-data-governance'],
  },
  {
    ref: 'init-legacy-retirement',
    name: 'Legacy retirement programme',
    key: 'legacy-retirement',
    owner: 'Mia Laurent',
    sponsor: 'Martin Keller',
    status: 'running',
    start: '2024-09-02',
    end: '2028-06-30',
    budget: 2_400_000,
    progress: 25,
    description:
      'Switch off systems and technologies that are past end of life or duplicated, and remove their run costs.',
    impacts: [
      'app-legacy-crm',
      'app-tariff-manager',
      'app-legacy-order-entry',
      'app-sap-ecc',
      'app-esb',
      'app-cognos',
      'tech-java8',
      'tech-centos7',
      'tech-win2012r2',
      'tech-oracle12c',
    ],
  },
  {
    ref: 'init-s4-migration',
    name: 'S/4HANA migration',
    key: 's4hana-migration',
    owner: 'Monika Nowak',
    sponsor: 'Marc Dubois',
    status: 'done',
    start: '2023-04-03',
    end: '2026-03-31',
    budget: 9_600_000,
    progress: 100,
    description: 'Move finance and procurement from SAP ECC to SAP S/4HANA and switch ECC off.',
    impacts: ['app-sap-s4', 'app-sap-ecc'],
    realizes: ['cap-finance', 'cap-procurement'],
  },
  {
    ref: 'init-esb-exit',
    name: 'Integration modernisation (ESB exit)',
    key: 'esb-exit',
    owner: 'Pieter de Vries',
    sponsor: 'Martin Keller',
    status: 'running',
    start: '2025-06-02',
    end: '2027-12-31',
    budget: 2_900_000,
    progress: 35,
    description:
      'Move the remaining 180 ESB integrations to the API Gateway and the Event Streaming Platform, and retire the Integration Bus.',
    impacts: [
      'app-esb',
      'app-api-gateway',
      'app-event-platform',
      'if-siebel-ws',
      'if-legacy-crm-db',
    ],
    realizes: ['cap-integration'],
  },
  {
    ref: 'init-unified-commerce',
    name: 'Unified commerce',
    key: 'unified-commerce',
    owner: 'Elena Rossi',
    sponsor: 'Daniel Okonkwo',
    status: 'planned',
    start: '2027-01-11',
    end: '2028-12-31',
    budget: 7_500_000,
    progress: 0,
    description:
      'One commerce platform for devices, plans and business quotes across web, app and shops, replacing the Device Webshop and Quote Builder.',
    impacts: ['app-device-webshop', 'app-quote-builder', 'app-product-catalog', 'app-order-hub'],
    realizes: ['cap-order-capture'],
  },
  {
    ref: 'init-network-inventory-renewal',
    name: 'Network inventory renewal',
    key: 'network-inventory-renewal',
    owner: 'Rahul Mehta',
    sponsor: 'Henrik Lund',
    status: 'planned',
    start: '2027-03-01',
    end: '2028-12-31',
    budget: 4_800_000,
    progress: 0,
    description:
      'Move Network Inventory and Service Inventory off Oracle 12c and CentOS 7 and consolidate them on one data model.',
    impacts: ['app-network-inventory', 'app-service-inventory', 'tech-oracle12c', 'tech-centos7'],
    realizes: ['cap-res-inventory'],
  },
  {
    ref: 'init-zero-trust',
    name: 'Zero trust identity',
    key: 'zero-trust',
    owner: "Grace O'Neill",
    sponsor: 'Martin Keller',
    status: 'on_hold',
    start: '2026-03-02',
    end: '2027-12-31',
    budget: 1_800_000,
    progress: 10,
    description:
      'Phishing-resistant MFA and per-request authorisation for employees, partners and service-to-service calls. On hold until the 5G launch is done.',
    impacts: ['app-acme-identity', 'app-entra-id', 'app-api-gateway'],
    realizes: ['cap-iam'],
  },
  {
    ref: 'init-loyalty',
    name: 'Loyalty programme',
    key: 'loyalty-programme',
    owner: 'Chloe Martin',
    sponsor: 'Sofia Marquez',
    status: 'cancelled',
    start: '2025-04-01',
    end: '2026-06-30',
    budget: 1_200_000,
    progress: 15,
    description:
      'Points-based loyalty programme for consumers. Cancelled in March 2026 to fund the self-care relaunch; the capability gap remains.',
    impacts: ['cap-loyalty'],
    realizes: ['cap-loyalty'],
  },
];

export const initiatives: SeedElement[] = specs.map((i) => ({
  ref: i.ref,
  type: 'initiative',
  name: i.name,
  key: i.key,
  description: i.description,
  owner: i.owner,
  attributes: {
    status: i.status,
    start_date: i.start,
    end_date: i.end,
    budget: i.budget,
    progress: i.progress,
    sponsor: i.sponsor,
  },
}));

/** impacts (initiative → element) and realizes (initiative → capability). */
export const initiativeRelations: SeedRelation[] = specs.flatMap((i) => [
  ...fanOut('impacts', i.ref, i.impacts),
  ...fanOut('realizes', i.ref, i.realizes ?? []),
]);
