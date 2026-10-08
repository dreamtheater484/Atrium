import type {
  DECISION_STATUS,
  STANDARD_CATEGORY,
  STANDARD_EFFECT,
  STANDARD_LEVEL,
} from '@atrium/schema';
import type { SeedElement, SeedRelation } from '../types';
import { fanIn, rel } from './helpers';

type DecisionStatus = (typeof DECISION_STATUS)[number];
type StandardCategory = (typeof STANDARD_CATEGORY)[number];
type StandardEffect = (typeof STANDARD_EFFECT)[number];
type StandardLevel = (typeof STANDARD_LEVEL)[number];

/* ------------------------------------------------------------------ */
/* Principles                                                           */
/* ------------------------------------------------------------------ */

interface PrincipleSpec {
  ref: string;
  name: string;
  key: string;
  owner: string;
  description: string;
  rationale: string;
  implications: string;
  /** Elements this principle explicitly applies to (governed_by). */
  governs: string[];
}

const principleSpecs: PrincipleSpec[] = [
  {
    ref: 'pr-reuse',
    name: 'Reuse before buy before build',
    key: 'reuse-buy-build',
    owner: 'Anna Kumar',
    description:
      'Use what we already have first, then buy a standard product, and only build when neither fits.',
    rationale:
      'Every new system adds run cost, integration work and knowledge risk. Acme Telco already runs three CRMs and three reporting tools because this was not followed.',
    implications:
      'New requests are checked against the capability map for existing systems first. Building in-house needs a short written case that the architecture board accepts.',
    governs: ['app-power-bi', 'app-cloud-bss'],
  },
  {
    ref: 'pr-cloud-first',
    name: 'Cloud first',
    key: 'cloud-first',
    owner: 'Anna Kumar',
    description:
      'New systems run as SaaS or on public cloud unless there is a clear reason not to.',
    rationale:
      'Public cloud gives faster delivery and elastic capacity and lets us close the second data centre by 2029.',
    implications:
      'On-premise hosting needs an exception, for example for network functions with strict latency or for data that must not leave our own sites.',
    governs: ['app-cloud-bss', 'app-data-lake', 'app-myacme-web'],
  },
  {
    ref: 'pr-api-first',
    name: 'API first, events for change',
    key: 'api-first',
    owner: 'Jeroen Visser',
    description:
      'Systems share data through documented APIs and publish business events; no direct database access.',
    rationale:
      'Direct database links, such as the one into Legacy CRM, make systems impossible to replace without breaking others.',
    implications:
      'Every new integration goes through the API Gateway or the Event Streaming Platform. Existing database links are listed and removed over time.',
    governs: ['app-api-gateway', 'app-event-platform'],
  },
  {
    ref: 'pr-single-source',
    name: 'One system of record per data object',
    key: 'single-source-of-truth',
    owner: 'Yuki Tanaka',
    description:
      'Each data object has exactly one system of record; other systems read from it or keep copies in sync.',
    rationale:
      'Customer data is held in four places today, which causes wrong bills, duplicate letters and GDPR risk.',
    implications:
      'Each data object in Atrium names its system of record. New copies of master data need approval from the data owner.',
    governs: ['app-mdm', 'app-customer-360'],
  },
  {
    ref: 'pr-secure-private',
    name: 'Secure and private by design',
    key: 'secure-private-by-design',
    owner: "Grace O'Neill",
    description: 'Security and privacy are designed in from the start, not added before go-live.',
    rationale:
      'As an operator of essential services we fall under NIS2, and we hold sensitive data for millions of customers.',
    implications:
      'Every new system gets a threat model and a privacy check. Personal data is minimised, encrypted and kept in the EU.',
    governs: ['app-acme-identity', 'app-payment-gateway-v2'],
  },
  {
    ref: 'pr-open-standards',
    name: 'Follow open industry standards',
    key: 'open-standards',
    owner: 'Jeroen Visser',
    description:
      'Use TM Forum Open APIs, the ODA component model and other open standards where they exist.',
    rationale:
      'Standard interfaces make it cheaper to swap vendors and to plug in partners and new products.',
    implications:
      'Vendor selections score support for TM Forum Open APIs. In-house APIs use TM Forum resource models when one exists.',
    governs: ['app-service-orchestrator', 'app-order-hub'],
  },
];

export const principles: SeedElement[] = principleSpecs.map((p) => ({
  ref: p.ref,
  type: 'principle',
  name: p.name,
  key: p.key,
  description: p.description,
  owner: p.owner,
  attributes: { rationale: p.rationale, implications: p.implications },
}));

/* ------------------------------------------------------------------ */
/* Standards                                                            */
/* ------------------------------------------------------------------ */

interface StandardSpec {
  ref: string;
  name: string;
  key: string;
  owner: string;
  category: StandardCategory;
  level: StandardLevel;
  effect: StandardEffect;
  /** Technology names the standards check matches against. */
  match?: string[];
  rule: string;
  description: string;
  governs: string[];
}

const standardSpecs: StandardSpec[] = [
  {
    ref: 'std-postgresql',
    name: 'Use PostgreSQL for relational data',
    key: 'use-postgresql',
    owner: 'Jeroen Visser',
    category: 'technology',
    level: 'should',
    effect: 'prefer',
    match: ['PostgreSQL'],
    rule: 'New systems that need a relational database use PostgreSQL (version 16 or later) from the Cloud Platform database service or Amazon RDS.',
    description: 'PostgreSQL is the default relational database for new systems.',
    governs: ['app-customer-360', 'app-payment-gateway-v2', 'app-mdm'],
  },
  {
    ref: 'std-no-java8',
    name: 'No new Java 8',
    key: 'no-java-8',
    owner: 'Jeroen Visser',
    category: 'technology',
    level: 'must',
    effect: 'forbid',
    match: ['Java 8'],
    rule: 'Java 8 must not be used for new systems or new releases of existing in-house systems.',
    description: 'Java 8 is past end of support; existing use must have an upgrade plan.',
    governs: ['app-activation-gateway', 'app-legacy-crm'],
  },
  {
    ref: 'std-java-lts',
    name: 'Java services run on Java 17 or 21',
    key: 'java-lts',
    owner: 'Jeroen Visser',
    category: 'technology',
    level: 'must',
    effect: 'require',
    match: ['Java 17', 'Java 21'],
    rule: 'Java services run on a supported long-term-support release: Java 21 for new services, Java 17 at minimum.',
    description: 'Keeps Java services on supported, patched runtimes.',
    governs: ['app-order-hub', 'app-product-catalog', 'app-product-inventory'],
  },
  {
    ref: 'std-node-lts',
    name: 'Node.js services use an active LTS release',
    key: 'node-lts',
    owner: 'Tom Becker',
    category: 'technology',
    level: 'must',
    effect: 'require',
    match: ['Node.js 22', 'Node.js 24'],
    rule: 'Node.js services run on an active or maintenance LTS release and move to the next LTS within six months of its release.',
    description: 'Keeps Node.js services on supported releases.',
    governs: ['app-myacme-app', 'app-myacme-web', 'app-notification-hub'],
  },
  {
    ref: 'std-no-eol-os',
    name: 'No end-of-life operating systems',
    key: 'no-eol-os',
    owner: 'Lucas Moreau',
    category: 'technology',
    level: 'must',
    effect: 'forbid',
    match: ['CentOS 7', 'Windows Server 2012 R2'],
    rule: 'Servers must run an operating system that still receives security updates. Remaining exceptions need a dated migration plan.',
    description: 'Unsupported operating systems are a security and audit risk.',
    governs: ['app-network-inventory', 'app-sqm', 'app-siebel'],
  },
  {
    ref: 'std-no-new-oracle',
    name: 'No new Oracle Database instances',
    key: 'no-new-oracle',
    owner: 'Jeroen Visser',
    category: 'technology',
    level: 'should',
    effect: 'forbid',
    match: ['Oracle Database'],
    rule: 'Do not create new Oracle databases. Vendor products that need Oracle may keep it until their next major upgrade.',
    description: 'Reduces Oracle licence cost and lock-in.',
    governs: ['app-edw', 'app-mediation'],
  },
  {
    ref: 'std-react',
    name: 'New web front ends use React',
    key: 'react-frontends',
    owner: 'Tom Becker',
    category: 'technology',
    level: 'should',
    effect: 'prefer',
    match: ['React'],
    rule: 'New web front ends are built with React and the Acme design system. Existing Angular front ends may stay but must be kept on a supported version.',
    description: 'One front-end framework makes it easier to share components and people.',
    governs: ['app-myacme-web', 'app-partner-portal'],
  },
  {
    ref: 'std-containers',
    name: 'Containers run on the shared Kubernetes platforms',
    key: 'shared-kubernetes',
    owner: 'Lucas Moreau',
    category: 'cloud',
    level: 'should',
    effect: 'prefer',
    match: ['Kubernetes', 'Amazon EKS'],
    rule: 'Containerised workloads run on the shared private Kubernetes platform or on Amazon EKS, not on team-managed clusters.',
    description: 'Shared platforms keep patching, security and monitoring consistent.',
    governs: ['app-order-hub', 'app-cloud-bss'],
  },
  {
    ref: 'std-cloud-tags',
    name: 'Tag cloud resources with owner and cost centre',
    key: 'cloud-tagging',
    owner: 'Lucas Moreau',
    category: 'cloud',
    level: 'must',
    effect: 'guideline',
    rule: 'Every cloud resource carries the tags atrium-key, owner-team and cost-centre, so costs can be traced to applications.',
    description: 'Makes cloud costs traceable to applications and teams.',
    governs: ['app-data-lake', 'app-ml-platform'],
  },
  {
    ref: 'std-tmf-apis',
    name: 'APIs follow TM Forum Open APIs',
    key: 'tmf-open-apis',
    owner: 'Jeroen Visser',
    category: 'integration',
    level: 'should',
    effect: 'guideline',
    rule: 'When a TM Forum Open API exists for a business entity, new APIs implement it (or a compatible subset) instead of a custom design.',
    description: 'Standard APIs make systems easier to replace and partners easier to connect.',
    governs: ['if-tmf620', 'if-tmf622', 'if-tmf629', 'if-tmf621', 'if-tmf641', 'if-tmf637'],
  },
  {
    ref: 'std-kafka-events',
    name: 'Business events are published on Kafka',
    key: 'kafka-events',
    owner: 'Pieter de Vries',
    category: 'integration',
    level: 'should',
    effect: 'prefer',
    match: ['Apache Kafka'],
    rule: 'Business events are published on the Event Streaming Platform with a registered schema. No new point-to-point file transfers for event data.',
    description: 'One event backbone instead of many file transfers and queues.',
    governs: ['if-order-events', 'if-customer-events', 'if-telemetry'],
  },
  {
    ref: 'std-eu-data',
    name: 'Personal data stays in the EU',
    key: 'eu-data-residency',
    owner: "Grace O'Neill",
    category: 'data',
    level: 'must',
    effect: 'guideline',
    rule: 'Personal data of customers and employees is stored and processed only in EU regions. Support access from outside the EU needs a data protection impact assessment.',
    description: 'GDPR and customer trust require EU data residency.',
    governs: [
      'app-sf-service',
      'app-customer-360',
      'app-data-lake',
      'app-myacme-app',
      'app-workday',
    ],
  },
  {
    ref: 'std-central-identity',
    name: 'Customer and partner login uses Acme Identity',
    key: 'central-identity',
    owner: "Grace O'Neill",
    category: 'security',
    level: 'must',
    effect: 'require',
    match: ['Keycloak'],
    rule: 'Customer- and partner-facing applications authenticate users through Acme Identity (OpenID Connect). No local password stores.',
    description: 'One login, one place for multi-factor authentication and consent.',
    governs: ['app-myacme-app', 'app-myacme-web', 'app-selfcare-portal', 'app-partner-portal'],
  },
  {
    ref: 'std-encryption',
    name: 'Encrypt data in transit and at rest',
    key: 'encryption',
    owner: "Grace O'Neill",
    category: 'security',
    level: 'must',
    effect: 'guideline',
    rule: 'All traffic uses TLS 1.2 or later, and all stored data classified confidential or higher is encrypted with managed keys.',
    description: 'Baseline protection for all confidential and restricted data.',
    governs: ['app-payment-gateway-v2', 'app-workday', 'app-fraud-shield'],
  },
];

export const standards: SeedElement[] = standardSpecs.map((s) => ({
  ref: s.ref,
  type: 'standard',
  name: s.name,
  key: s.key,
  description: s.description,
  owner: s.owner,
  attributes: {
    category: s.category,
    level: s.level,
    effect: s.effect,
    ...(s.match ? { match: s.match } : {}),
    rule: s.rule,
  },
}));

/* ------------------------------------------------------------------ */
/* Architecture decisions (ADRs)                                         */
/* ------------------------------------------------------------------ */

interface DecisionSpec {
  ref: string;
  name: string;
  key: string;
  owner: string;
  status: DecisionStatus;
  date: string;
  description: string;
  context: string;
  decision: string;
  consequences?: string;
  governs: string[];
}

const decisionSpecs: DecisionSpec[] = [
  {
    ref: 'adr-001',
    name: 'ADR-001: Oracle Database as the default relational database',
    key: 'adr-001',
    owner: 'Anna Kumar',
    status: 'superseded',
    date: '2015-06-10',
    description: 'Original choice of Oracle as the company-wide database. Replaced by ADR-004.',
    context:
      'Most purchased BSS and OSS products were certified on Oracle only, and the DBA team knew Oracle well.',
    decision: 'Use Oracle Database Enterprise Edition for all new relational databases.',
    consequences: 'Rising licence costs and lock-in; superseded by ADR-004 in 2023.',
    governs: ['app-edw'],
  },
  {
    ref: 'adr-002',
    name: 'ADR-002: Kafka as the event backbone',
    key: 'adr-002',
    owner: 'Pieter de Vries',
    status: 'accepted',
    date: '2022-01-20',
    description: 'Business and network events are published on a shared Apache Kafka platform.',
    context:
      'Teams were building their own queues and nightly file transfers, so data arrived late and in different shapes.',
    decision:
      'Run a shared Event Streaming Platform on Apache Kafka with a schema registry, operated by the Integration Team.',
    consequences:
      'Teams publish events with registered schemas. Older file transfers are replaced as systems are changed.',
    governs: ['app-event-platform', 'app-order-hub', 'app-data-lake', 'app-notification-hub'],
  },
  {
    ref: 'adr-003',
    name: 'ADR-003: Expose BSS capabilities through TM Forum Open APIs',
    key: 'adr-003',
    owner: 'Jeroen Visser',
    status: 'accepted',
    date: '2023-03-14',
    description:
      'Ordering, catalog, inventory and ticketing are reached through TM Forum Open APIs only.',
    context:
      'Every channel had its own integration to every back-end system, through the ESB or directly into databases.',
    decision:
      'Order Hub, Product Catalog, Product Inventory, Service Orchestrator and Trouble Ticket Manager expose TMF620, 622, 637, 641 and 621 through the API Gateway.',
    consequences:
      'Channels can be rebuilt without touching back ends; vendors are selected on Open API support.',
    governs: [
      'app-order-hub',
      'app-product-catalog',
      'app-product-inventory',
      'app-service-orchestrator',
      'app-trouble-ticket',
    ],
  },
  {
    ref: 'adr-004',
    name: 'ADR-004: PostgreSQL as the default relational database',
    key: 'adr-004',
    owner: 'Jeroen Visser',
    status: 'accepted',
    date: '2023-09-12',
    description: 'PostgreSQL replaces Oracle as the default database for new systems.',
    context:
      'Oracle licences cost 3.1 million euro a year and block moving workloads to public cloud. Most new products support PostgreSQL.',
    decision:
      'Use PostgreSQL for all new relational databases; keep Oracle only where a vendor product requires it.',
    consequences:
      'The Cloud Platform team offers PostgreSQL as a managed service. Oracle estates shrink as systems are replaced.',
    governs: [
      'app-customer-360',
      'app-payment-gateway-v2',
      'app-product-inventory',
      'app-acme-identity',
    ],
  },
  {
    ref: 'adr-005',
    name: 'ADR-005: Salesforce Service Cloud as the single CRM',
    key: 'adr-005',
    owner: 'Anna Kumar',
    status: 'accepted',
    date: '2024-11-14',
    description: 'Consolidate Legacy CRM and Siebel onto Salesforce Service Cloud and Sales Cloud.',
    context:
      'Three CRM systems hold overlapping customer data. Agents switch between screens and customers get conflicting answers.',
    decision:
      'Salesforce Service Cloud becomes the single CRM for consumer and business service; Sales Cloud for business sales. Legacy CRM retires in 2027 and Siebel in 2028.',
    consequences:
      'About 1.8 million euro yearly saving once both legacy CRMs are gone. All direct links to the Legacy CRM database must be removed first.',
    governs: [
      'app-legacy-crm',
      'app-siebel',
      'app-sf-service',
      'app-sf-sales',
      'app-customer-360',
      'app-contact-centre',
    ],
  },
  {
    ref: 'adr-006',
    name: 'ADR-006: Move billing to Corvina Cloud BSS',
    key: 'adr-006',
    owner: 'Anna Kumar',
    status: 'accepted',
    date: '2025-02-20',
    description:
      'Replace both on-premise billing systems with the vendor-managed Corvina Cloud BSS.',
    context:
      'Convergent Billing runs on Java 8 and its hardware is out of support in 2027. Enterprise Billing duplicates most of its functions.',
    decision:
      'Migrate consumer billing to Corvina Cloud BSS from April 2027, then business billing, and retire both on-premise systems by mid-2028.',
    consequences:
      'One billing platform for all customers. Billing data moves to an EU public-cloud region under the EU data standard.',
    governs: ['app-billing', 'app-cloud-bss', 'app-b2b-billing', 'app-mediation'],
  },
  {
    ref: 'adr-007',
    name: 'ADR-007: Retire the ESB in favour of the API Gateway and events',
    key: 'adr-007',
    owner: 'Pieter de Vries',
    status: 'accepted',
    date: '2025-05-27',
    description:
      'No new integrations on the Integration Bus; existing ones move to APIs or events.',
    context:
      'The Oracle Service Bus runs on WebLogic and Java 8, and only two people still understand its 180 integrations.',
    decision:
      'Freeze the Integration Bus. Move synchronous integrations to the API Gateway and asynchronous ones to Kafka by the end of 2027.',
    consequences:
      'Each owning team migrates its own integrations; the Integration Team provides templates.',
    governs: ['app-esb', 'app-api-gateway', 'app-event-platform'],
  },
  {
    ref: 'adr-008',
    name: 'ADR-008: Build MyAcme Web on React with a shared backend-for-frontend',
    key: 'adr-008',
    owner: 'Tom Becker',
    status: 'accepted',
    date: '2025-08-28',
    description: 'The new web self-care shares its backend-for-frontend with the MyAcme App.',
    context:
      'The Self-care Portal runs on Angular 12 and Node.js 16, both unsupported, and duplicates logic from the app.',
    decision:
      'Rebuild web self-care in React on the same backend-for-frontend as the MyAcme App, and retire the Self-care Portal after go-live.',
    consequences: 'One set of APIs for app and web; features ship in both channels at once.',
    governs: ['app-myacme-web', 'app-selfcare-portal', 'app-myacme-app'],
  },
  {
    ref: 'adr-009',
    name: 'ADR-009: Lakehouse on public cloud for analytics',
    key: 'adr-009',
    owner: 'Yuki Tanaka',
    status: 'accepted',
    date: '2026-01-15',
    description:
      'The Data Lake becomes the single analytics platform; the data warehouse and Cognos retire.',
    context:
      'Analytics data lives in the Data Lake, the Oracle data warehouse and the finance cube, with three versions of key numbers.',
    decision:
      'Move all reporting data to the Data Lake on AWS, with Power BI as the reporting tool. Retire the data warehouse and Cognos by the end of 2027.',
    consequences: 'Finance reports move first; the Finance Reporting Cube is rebuilt in Power BI.',
    governs: ['app-data-lake', 'app-edw', 'app-power-bi', 'app-cognos'],
  },
  {
    ref: 'adr-010',
    name: 'ADR-010: Keep network inventory on-premise until 2028',
    key: 'adr-010',
    owner: 'Jeroen Visser',
    status: 'proposed',
    date: '2026-09-22',
    description:
      'Proposal to upgrade Network Inventory in place instead of moving it to public cloud.',
    context:
      'Network Inventory runs on Oracle 12c and CentOS 7, both out of support. A cloud move would delay the 5G SA launch.',
    decision:
      'Upgrade Network Inventory on-premise to PostgreSQL 16 and RHEL 8 in 2027, and decide on a cloud move in 2028.',
    governs: ['app-network-inventory'],
  },
  {
    ref: 'adr-011',
    name: 'ADR-011: Build an in-house billing platform',
    key: 'adr-011',
    owner: 'Anna Kumar',
    status: 'rejected',
    date: '2024-12-03',
    description:
      'Option to replace Convergent Billing with an in-house platform. Rejected in favour of ADR-006.',
    context: 'The billing team proposed building a new billing platform on the event backbone.',
    decision:
      'Rejected: billing is not a differentiator, and building it would take at least three years.',
    consequences: 'Billing is bought as a managed product (see ADR-006).',
    governs: [],
  },
];

export const decisions: SeedElement[] = decisionSpecs.map((d) => ({
  ref: d.ref,
  type: 'decision',
  name: d.name,
  key: d.key,
  description: d.description,
  owner: d.owner,
  attributes: {
    status: d.status,
    date: d.date,
    context: d.context,
    decision: d.decision,
    ...(d.consequences ? { consequences: d.consequences } : {}),
  },
}));

/** governed_by (element → principle / standard / decision), plus links between governance items. */
export const governanceRelations: SeedRelation[] = [
  ...principleSpecs.flatMap((p) => fanIn('governed_by', p.governs, p.ref)),
  ...standardSpecs.flatMap((s) => fanIn('governed_by', s.governs, s.ref)),
  ...decisionSpecs.flatMap((d) => fanIn('governed_by', d.governs, d.ref)),
  // Standards derive from principles and decisions.
  rel('governed_by', 'std-tmf-apis', 'pr-open-standards'),
  rel('governed_by', 'std-eu-data', 'pr-secure-private'),
  rel('governed_by', 'std-encryption', 'pr-secure-private'),
  rel('governed_by', 'std-central-identity', 'pr-secure-private'),
  rel('governed_by', 'std-kafka-events', 'pr-api-first'),
  rel('governed_by', 'std-postgresql', 'adr-004'),
  rel('governed_by', 'std-kafka-events', 'adr-002'),
  rel('governed_by', 'std-tmf-apis', 'adr-003'),
  rel('governed_by', 'adr-005', 'pr-reuse'),
  rel('governed_by', 'adr-006', 'pr-cloud-first'),
  rel('governed_by', 'adr-009', 'pr-cloud-first'),
  // ADR-004 supersedes ADR-001.
  rel('replaces', 'adr-004', 'adr-001'),
];
