import type { IMPORTANCE } from '@atrium/schema';
import type { SeedElement } from '../types';

type Importance = (typeof IMPORTANCE)[number];

interface CapNode {
  ref: string;
  name: string;
  description: string;
  owner?: string;
  importance?: Importance;
  maturity?: 1 | 2 | 3 | 4 | 5;
  children?: CapNode[];
}

interface CapTree {
  domain: string;
  /** Short code used to build capability keys, such as CUS, CUS.2 and CUS.2.1. */
  code: string;
  root: CapNode;
}

/*
 * Capability map, three levels deep. Level 1 is one capability per domain, level 2 is
 * the working map most people look at, and level 3 adds detail where it matters.
 * A few capabilities deliberately have no supporting application (coverage gaps):
 * Loyalty & Retention, Product Strategy & Portfolio Planning, Product Performance
 * Management, Service Impact Analysis, Next Best Action and Data Governance & Quality.
 */
const trees: CapTree[] = [
  {
    domain: 'dom-customer',
    code: 'CUS',
    root: {
      ref: 'cap-customer',
      name: 'Customer Management',
      owner: 'Sofia Marquez',
      importance: 'high',
      maturity: 3,
      description:
        'Winning, serving, billing and keeping customers across shops, contact centres and digital channels.',
      children: [
        {
          ref: 'cap-cust-info',
          name: 'Customer Information Management',
          owner: 'Hannah Schmidt',
          importance: 'high',
          maturity: 2,
          description:
            'Keeping one accurate record of each customer, their contacts, consents and relationships.',
        },
        {
          ref: 'cap-cust-interaction',
          name: 'Customer Interaction Management',
          owner: 'Hannah Schmidt',
          importance: 'high',
          maturity: 3,
          description:
            'Handling calls, chats, e-mails and shop visits consistently, with the full customer context at hand.',
        },
        {
          ref: 'cap-sales',
          name: 'Sales & Lead Management',
          owner: 'Omar Haddad',
          importance: 'high',
          maturity: 3,
          description:
            'Finding, qualifying and converting leads and opportunities for consumer and business customers.',
        },
        {
          ref: 'cap-cust-order',
          name: 'Customer Order Management',
          owner: 'Elena Rossi',
          importance: 'high',
          maturity: 4,
          description:
            'Capturing, validating and tracking customer orders from first request to completed delivery.',
          children: [
            {
              ref: 'cap-order-capture',
              name: 'Order Capture & Validation',
              owner: 'Elena Rossi',
              importance: 'high',
              maturity: 4,
              description:
                'Taking orders in any channel and checking eligibility, credit and address before they are accepted.',
            },
          ],
        },
        {
          ref: 'cap-billing',
          name: 'Customer Bill Management',
          owner: 'Julia Novak',
          importance: 'high',
          maturity: 3,
          description:
            'Turning usage, subscriptions and one-off charges into correct and timely customer bills.',
          children: [
            {
              ref: 'cap-rating',
              name: 'Rating & Charging',
              owner: 'Julia Novak',
              importance: 'high',
              maturity: 4,
              description:
                'Pricing usage events in real time or in batch and updating balances and allowances.',
            },
            {
              ref: 'cap-invoicing',
              name: 'Invoicing',
              owner: 'Julia Novak',
              importance: 'high',
              maturity: 3,
              description:
                'Producing, checking and sending invoices for consumer and business accounts.',
            },
            {
              ref: 'cap-bill-presentment',
              name: 'Bill Presentment & Inquiry',
              owner: 'Ben Carter',
              importance: 'medium',
              maturity: 3,
              description: 'Showing bills online and answering questions about charges.',
            },
          ],
        },
        {
          ref: 'cap-payment',
          name: 'Payment & Collections Management',
          owner: 'Rachel Adeyemi',
          importance: 'high',
          maturity: 3,
          description: 'Taking payments in every channel and recovering overdue amounts fairly.',
        },
        {
          ref: 'cap-self-service',
          name: 'Customer Self-Service',
          owner: 'Ben Carter',
          importance: 'high',
          maturity: 3,
          description:
            'Letting customers buy, change plans, pay and get help themselves in the app and on the web.',
        },
        {
          ref: 'cap-cust-problem',
          name: 'Customer Problem Handling',
          owner: 'Hannah Schmidt',
          importance: 'medium',
          maturity: 3,
          description:
            'Recording, tracking and resolving complaints and problems that customers report.',
        },
        {
          ref: 'cap-loyalty',
          name: 'Loyalty & Retention',
          owner: 'Sofia Marquez',
          importance: 'high',
          maturity: 1,
          description:
            'Rewarding loyal customers and making targeted retention offers before customers leave.',
        },
      ],
    },
  },
  {
    domain: 'dom-product',
    code: 'PRD',
    root: {
      ref: 'cap-product',
      name: 'Product Management',
      owner: 'Daniel Okonkwo',
      importance: 'high',
      maturity: 3,
      description:
        'Deciding what to sell, at what price, and managing products through their whole life.',
      children: [
        {
          ref: 'cap-prod-strategy',
          name: 'Product Strategy & Portfolio Planning',
          owner: 'Daniel Okonkwo',
          importance: 'medium',
          maturity: 2,
          description:
            'Setting the product roadmap and deciding which offers to launch, change or withdraw.',
        },
        {
          ref: 'cap-prod-catalog',
          name: 'Product Catalog Management',
          owner: 'Chloe Martin',
          importance: 'high',
          maturity: 4,
          description:
            'Keeping one catalog of sellable offers, with rules about who can buy what and where.',
        },
        {
          ref: 'cap-offer-pricing',
          name: 'Product Offering & Pricing',
          owner: 'Chloe Martin',
          importance: 'high',
          maturity: 3,
          description: 'Defining offers, price plans, discounts and bundles.',
          children: [
            {
              ref: 'cap-price-plans',
              name: 'Price Plan Management',
              owner: 'Chloe Martin',
              importance: 'medium',
              maturity: 3,
              description:
                'Maintaining recurring and usage price plans, including grandfathered tariffs.',
            },
            {
              ref: 'cap-bundles',
              name: 'Bundle & Promotion Management',
              owner: 'Chloe Martin',
              importance: 'medium',
              maturity: 2,
              description: 'Combining products into bundles and running time-limited promotions.',
            },
          ],
        },
        {
          ref: 'cap-prod-lifecycle',
          name: 'Product Lifecycle Management',
          owner: 'Daniel Okonkwo',
          importance: 'medium',
          maturity: 2,
          description:
            'Taking offers from idea through launch to retirement, with clear stage gates.',
        },
        {
          ref: 'cap-prod-inventory',
          name: 'Product Inventory Management',
          owner: 'Elena Rossi',
          importance: 'high',
          maturity: 3,
          description: 'Knowing exactly which products, options and devices each customer has.',
        },
        {
          ref: 'cap-quote',
          name: 'Quote Management',
          owner: 'Omar Haddad',
          importance: 'medium',
          maturity: 3,
          description: 'Configuring, pricing and approving quotes for business customers.',
        },
        {
          ref: 'cap-prod-performance',
          name: 'Product Performance Management',
          owner: 'Daniel Okonkwo',
          importance: 'medium',
          description: 'Tracking sales, margin and churn per offer to decide where to invest.',
        },
      ],
    },
  },
  {
    domain: 'dom-service',
    code: 'SRV',
    root: {
      ref: 'cap-service',
      name: 'Service Management',
      owner: 'Priya Raman',
      importance: 'high',
      maturity: 3,
      description: 'Designing, delivering and assuring the services that sit behind every product.',
      children: [
        {
          ref: 'cap-svc-design',
          name: 'Service Design & Catalog',
          owner: 'Rahul Mehta',
          importance: 'medium',
          maturity: 3,
          description:
            'Defining technical service specifications and how they map to products and resources.',
        },
        {
          ref: 'cap-svc-order',
          name: 'Service Order Management',
          owner: 'Rahul Mehta',
          importance: 'high',
          maturity: 4,
          description:
            'Breaking product orders into service orders and orchestrating their fulfilment.',
        },
        {
          ref: 'cap-svc-activation',
          name: 'Service Activation & Configuration',
          owner: 'Kenji Watanabe',
          importance: 'high',
          maturity: 3,
          description:
            'Switching services on, off and changing them in the network, automatically where possible.',
        },
        {
          ref: 'cap-svc-inventory',
          name: 'Service Inventory Management',
          owner: 'Rahul Mehta',
          importance: 'high',
          maturity: 3,
          description: 'Recording every live service and which resources it uses.',
        },
        {
          ref: 'cap-svc-problem',
          name: 'Service Problem Management',
          owner: 'Ingrid Solberg',
          importance: 'high',
          maturity: 3,
          description: 'Detecting, diagnosing and fixing problems that affect services.',
          children: [
            {
              ref: 'cap-trouble-ticket',
              name: 'Trouble Ticket Management',
              owner: 'Ingrid Solberg',
              importance: 'high',
              maturity: 3,
              description: 'Opening, routing and closing trouble tickets with clear SLA tracking.',
            },
            {
              ref: 'cap-svc-impact',
              name: 'Service Impact Analysis',
              importance: 'medium',
              maturity: 1,
              description: 'Working out which customers and services a network fault affects.',
            },
          ],
        },
        {
          ref: 'cap-svc-quality',
          name: 'Service Quality Management',
          owner: 'Ingrid Solberg',
          importance: 'medium',
          maturity: 3,
          description:
            'Measuring service quality as customers experience it and acting on SLA breaches.',
        },
        {
          ref: 'cap-field-service',
          name: 'Field Service Management',
          owner: 'Victor Almeida',
          importance: 'medium',
          maturity: 4,
          description: 'Planning and dispatching field engineers for installations and repairs.',
        },
      ],
    },
  },
  {
    domain: 'dom-resource',
    code: 'RES',
    root: {
      ref: 'cap-resource',
      name: 'Resource Management',
      owner: 'Henrik Lund',
      importance: 'high',
      maturity: 3,
      description: 'Planning, building and operating the mobile, fixed and transport networks.',
      children: [
        {
          ref: 'cap-net-planning',
          name: 'Network Planning & Design',
          owner: 'Mateo Ruiz',
          importance: 'high',
          maturity: 3,
          description:
            'Planning coverage and capacity and designing new sites and network changes.',
        },
        {
          ref: 'cap-net-rollout',
          name: 'Network Build & Rollout',
          owner: 'Mateo Ruiz',
          importance: 'medium',
          maturity: 2,
          description: 'Building new sites and network upgrades on time and on budget.',
        },
        {
          ref: 'cap-res-inventory',
          name: 'Resource Inventory Management',
          owner: 'Kenji Watanabe',
          importance: 'high',
          maturity: 2,
          description: 'Recording all physical and logical network resources and how they connect.',
        },
        {
          ref: 'cap-res-provisioning',
          name: 'Resource Provisioning & Activation',
          owner: 'Kenji Watanabe',
          importance: 'high',
          maturity: 3,
          description: 'Allocating and configuring network resources for services.',
        },
        {
          ref: 'cap-net-fault',
          name: 'Network Fault Management',
          owner: 'Kenji Watanabe',
          importance: 'high',
          maturity: 4,
          description: 'Collecting and correlating alarms and fixing network faults quickly.',
        },
        {
          ref: 'cap-net-performance',
          name: 'Network Performance Management',
          owner: 'Kenji Watanabe',
          importance: 'medium',
          maturity: 3,
          description: 'Measuring network performance and capacity to spot problems early.',
        },
        {
          ref: 'cap-net-automation',
          name: 'Network Automation & Orchestration',
          owner: 'Erik Johansson',
          importance: 'high',
          maturity: 2,
          description: 'Automating network changes and lifecycle, including 5G slicing.',
        },
        {
          ref: 'cap-site-spectrum',
          name: 'Site & Spectrum Management',
          owner: 'Mateo Ruiz',
          importance: 'medium',
          maturity: 2,
          description: 'Managing radio sites, leases, power and spectrum licences.',
        },
      ],
    },
  },
  {
    domain: 'dom-partner',
    code: 'PTN',
    root: {
      ref: 'cap-partner',
      name: 'Partner Management',
      owner: 'Isabel Duarte',
      importance: 'medium',
      maturity: 2,
      description:
        'Working with dealers, wholesale customers, MVNOs, other operators and roaming partners.',
      children: [
        {
          ref: 'cap-partner-onboarding',
          name: 'Partner Onboarding & Agreements',
          owner: 'Laura Bianchi',
          importance: 'medium',
          maturity: 2,
          description: 'Signing up partners and managing their contracts and commercial terms.',
        },
        {
          ref: 'cap-wholesale',
          name: 'Wholesale & Interconnect Management',
          owner: 'Laura Bianchi',
          importance: 'high',
          maturity: 3,
          description:
            'Selling network access to other operators and exchanging traffic with them.',
        },
        {
          ref: 'cap-roaming',
          name: 'Roaming Management',
          owner: 'Laura Bianchi',
          importance: 'medium',
          maturity: 3,
          description:
            'Managing roaming agreements and the exchange of roaming usage with partners.',
        },
        {
          ref: 'cap-partner-settlement',
          name: 'Partner Settlement & Revenue Sharing',
          owner: 'Laura Bianchi',
          importance: 'high',
          maturity: 2,
          description:
            'Calculating and settling what Acme Telco owes partners and what partners owe Acme Telco.',
        },
        {
          ref: 'cap-dealer',
          name: 'Dealer & Reseller Management',
          owner: 'Isabel Duarte',
          importance: 'medium',
          maturity: 2,
          description: 'Supporting dealers and franchise shops, including targets and commissions.',
        },
        {
          ref: 'cap-partner-self-service',
          name: 'Partner Self-Service',
          owner: 'Isabel Duarte',
          importance: 'low',
          maturity: 2,
          description:
            'Letting partners order, track and download what they need without calling us.',
        },
      ],
    },
  },
  {
    domain: 'dom-enterprise',
    code: 'ENT',
    root: {
      ref: 'cap-enterprise',
      name: 'Enterprise Management',
      owner: 'Marc Dubois',
      importance: 'medium',
      maturity: 3,
      description:
        'The corporate capabilities that keep the company running, compliant and secure.',
      children: [
        {
          ref: 'cap-finance',
          name: 'Financial Accounting & Reporting',
          owner: 'Felix Wagner',
          importance: 'high',
          maturity: 4,
          description: 'Keeping the books, closing the month and reporting financial results.',
        },
        {
          ref: 'cap-procurement',
          name: 'Procurement & Supplier Management',
          owner: 'Felix Wagner',
          importance: 'medium',
          maturity: 3,
          description: 'Buying goods and services and managing supplier contracts and performance.',
        },
        {
          ref: 'cap-hr',
          name: 'Human Resources Management',
          owner: 'Nadia Petrova',
          importance: 'medium',
          maturity: 4,
          description: 'Hiring, paying, developing and supporting employees.',
        },
        {
          ref: 'cap-revenue-assurance',
          name: 'Revenue Assurance & Fraud Management',
          owner: 'Sara Lindqvist',
          importance: 'high',
          maturity: 3,
          description: 'Making sure everything delivered is billed, and stopping fraud early.',
          children: [
            {
              ref: 'cap-fraud',
              name: 'Fraud Management',
              owner: 'Sara Lindqvist',
              importance: 'high',
              maturity: 3,
              description: 'Detecting and stopping subscription, SIM-swap and revenue-share fraud.',
            },
          ],
        },
        {
          ref: 'cap-risk-compliance',
          name: 'Risk & Compliance Management',
          owner: 'Marc Dubois',
          importance: 'medium',
          maturity: 2,
          description:
            'Managing enterprise risks, controls and regulatory duties such as NIS2 and GDPR.',
        },
        {
          ref: 'cap-iam',
          name: 'Identity & Access Management',
          owner: "Grace O'Neill",
          importance: 'high',
          maturity: 3,
          description:
            'Giving customers, partners and employees secure access to the right things.',
        },
        {
          ref: 'cap-itsm',
          name: 'IT Service Management',
          owner: 'Lucas Moreau',
          importance: 'medium',
          maturity: 4,
          description:
            'Handling IT incidents, changes and requests, and keeping the CMDB up to date.',
        },
        {
          ref: 'cap-integration',
          name: 'Application Integration',
          owner: 'Pieter de Vries',
          importance: 'high',
          maturity: 3,
          description: 'Connecting applications through APIs, events and file transfers.',
        },
      ],
    },
  },
  {
    domain: 'dom-intelligence',
    code: 'INT',
    root: {
      ref: 'cap-intelligence',
      name: 'Data & Analytics Management',
      owner: 'Yuki Tanaka',
      importance: 'high',
      maturity: 2,
      description:
        'Turning data from every domain into reliable insight, reports and automated decisions.',
      children: [
        {
          ref: 'cap-data-platform',
          name: 'Data Ingestion & Storage',
          owner: 'Aisha Bello',
          importance: 'high',
          maturity: 3,
          description: 'Collecting data from source systems and storing it safely for analysis.',
        },
        {
          ref: 'cap-bi',
          name: 'Business Intelligence & Reporting',
          owner: 'Aisha Bello',
          importance: 'medium',
          maturity: 3,
          description: 'Giving people the dashboards and reports they need to run the business.',
        },
        {
          ref: 'cap-cust-analytics',
          name: 'Customer Analytics & Insights',
          owner: 'Yuki Tanaka',
          importance: 'high',
          maturity: 2,
          description: 'Understanding customer behaviour, value and risk.',
          children: [
            {
              ref: 'cap-churn',
              name: 'Churn Prediction',
              owner: 'Arjun Nair',
              importance: 'high',
              maturity: 3,
              description:
                'Scoring each customer on how likely they are to leave in the next 90 days.',
            },
            {
              ref: 'cap-nba',
              name: 'Next Best Action',
              owner: 'Arjun Nair',
              importance: 'high',
              description:
                'Recommending the most useful offer or action for each customer in every channel.',
            },
          ],
        },
        {
          ref: 'cap-net-analytics',
          name: 'Network Analytics',
          owner: 'Arjun Nair',
          importance: 'medium',
          maturity: 2,
          description: 'Finding patterns and anomalies in network performance and usage data.',
        },
        {
          ref: 'cap-ai-ml',
          name: 'AI & Machine Learning',
          owner: 'Arjun Nair',
          importance: 'high',
          maturity: 2,
          description: 'Building, deploying and monitoring machine-learning models safely.',
        },
        {
          ref: 'cap-data-governance',
          name: 'Data Governance & Quality',
          owner: 'Yuki Tanaka',
          importance: 'medium',
          maturity: 1,
          description:
            'Defining data ownership, definitions and quality rules, and measuring them.',
        },
        {
          ref: 'cap-mdm',
          name: 'Master Data Management',
          owner: 'Yuki Tanaka',
          importance: 'high',
          maturity: 1,
          description:
            'Keeping one golden record for customers, products and partners across systems.',
        },
      ],
    },
  },
];

function flatten(node: CapNode, domain: string, key: string, parent?: string): SeedElement[] {
  const attributes: Record<string, unknown> = {};
  if (node.importance) attributes.importance = node.importance;
  if (node.maturity) attributes.maturity = node.maturity;
  const el: SeedElement = {
    ref: node.ref,
    type: 'capability',
    name: node.name,
    key,
    description: node.description,
    domain,
    attributes,
  };
  if (parent) el.parent = parent;
  if (node.owner) el.owner = node.owner;
  const children = (node.children ?? []).flatMap((child, i) =>
    flatten(child, domain, `${key}.${i + 1}`, node.ref),
  );
  return [el, ...children];
}

/** All capabilities, parents always listed before their children. */
export const capabilities: SeedElement[] = trees.flatMap((t) => flatten(t.root, t.domain, t.code));
