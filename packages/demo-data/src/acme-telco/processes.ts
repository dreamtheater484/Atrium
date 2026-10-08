import type { SeedElement, SeedRelation } from '../types';
import { fanOut } from './helpers';

interface ProcessSpec {
  ref: string;
  name: string;
  domain: string;
  owner: string;
  description: string;
  kpi?: string;
  frequency?: string;
  parent?: string;
  /** Capabilities this process delivers (realizes). */
  realizes: string[];
}

/**
 * End-to-end value streams in the style of the TM Forum eTOM / ODA "to" processes.
 * Level 1 is the end-to-end flow, level 2 the main steps where they matter most.
 */
const specs: ProcessSpec[] = [
  {
    ref: 'proc-l2o',
    name: 'Lead to Order',
    domain: 'dom-customer',
    owner: 'Omar Haddad',
    kpi: 'Lead-to-order conversion rate',
    frequency: 'About 4,000 qualified leads per month',
    description:
      'From a first sign of interest to a signed order, for consumer and business customers.',
    realizes: ['cap-sales', 'cap-quote'],
  },
  {
    ref: 'proc-l2o-qualify',
    name: 'Qualify Lead',
    parent: 'proc-l2o',
    domain: 'dom-customer',
    owner: 'Omar Haddad',
    kpi: 'Time to first contact',
    frequency: 'Daily',
    description: 'Checking new leads, scoring them and passing good ones to the right sales team.',
    realizes: ['cap-sales'],
  },
  {
    ref: 'proc-l2o-quote',
    name: 'Quote and Contract',
    parent: 'proc-l2o',
    domain: 'dom-customer',
    owner: 'Omar Haddad',
    kpi: 'Quote turnaround time',
    frequency: 'About 1,200 quotes per month',
    description:
      'Configuring and pricing a business deal, getting approvals and signing the contract.',
    realizes: ['cap-quote'],
  },
  {
    ref: 'proc-o2c',
    name: 'Order to Cash',
    domain: 'dom-customer',
    owner: 'Elena Rossi',
    kpi: 'Order-to-activation lead time',
    frequency: 'About 180,000 orders per month',
    description:
      'From an accepted order to an active service, a correct bill and a received payment.',
    realizes: ['cap-cust-order', 'cap-billing', 'cap-payment'],
  },
  {
    ref: 'proc-o2c-capture',
    name: 'Capture and Validate Order',
    parent: 'proc-o2c',
    domain: 'dom-customer',
    owner: 'Elena Rossi',
    kpi: 'First-time-right order rate',
    frequency: 'Continuous',
    description: 'Taking the order in any channel and checking eligibility, address and credit.',
    realizes: ['cap-order-capture'],
  },
  {
    ref: 'proc-o2c-fulfil',
    name: 'Fulfil and Activate Order',
    parent: 'proc-o2c',
    domain: 'dom-service',
    owner: 'Rahul Mehta',
    kpi: 'Orders activated within SLA',
    frequency: 'Continuous',
    description:
      'Decomposing the order, configuring the network and shipping or installing equipment.',
    realizes: ['cap-svc-order', 'cap-svc-activation', 'cap-res-provisioning'],
  },
  {
    ref: 'proc-o2c-bill',
    name: 'Run Billing Cycle',
    parent: 'proc-o2c',
    domain: 'dom-customer',
    owner: 'Julia Novak',
    kpi: 'Bill accuracy',
    frequency: 'Four bill cycles per month',
    description:
      'Rating usage, applying charges and discounts, and producing and sending invoices.',
    realizes: ['cap-rating', 'cap-invoicing'],
  },
  {
    ref: 'proc-o2c-collect',
    name: 'Collect Payment',
    parent: 'proc-o2c',
    domain: 'dom-customer',
    owner: 'Rachel Adeyemi',
    kpi: 'Days sales outstanding (DSO)',
    frequency: 'Daily',
    description: 'Receiving and matching payments, and following up overdue bills.',
    realizes: ['cap-payment'],
  },
  {
    ref: 'proc-t2r',
    name: 'Trouble to Resolve',
    domain: 'dom-service',
    owner: 'Ingrid Solberg',
    kpi: 'Mean time to repair (MTTR)',
    frequency: 'About 45,000 tickets per month',
    description: 'From a reported or detected problem to a fixed service and a closed ticket.',
    realizes: ['cap-svc-problem', 'cap-cust-problem'],
  },
  {
    ref: 'proc-t2r-diagnose',
    name: 'Report and Diagnose Problem',
    parent: 'proc-t2r',
    domain: 'dom-service',
    owner: 'Ingrid Solberg',
    kpi: 'Problems diagnosed remotely',
    frequency: 'Continuous',
    description: 'Logging the problem, linking it to network alarms and finding the cause.',
    realizes: ['cap-trouble-ticket', 'cap-net-fault'],
  },
  {
    ref: 'proc-t2r-dispatch',
    name: 'Dispatch Field Engineer',
    parent: 'proc-t2r',
    domain: 'dom-service',
    owner: 'Victor Almeida',
    kpi: 'First-visit fix rate',
    frequency: 'About 9,000 visits per month',
    description: 'Booking an appointment and sending an engineer with the right skills and parts.',
    realizes: ['cap-field-service'],
  },
  {
    ref: 'proc-t2r-resolve',
    name: 'Resolve and Close',
    parent: 'proc-t2r',
    domain: 'dom-service',
    owner: 'Ingrid Solberg',
    kpi: 'Repeat tickets within 30 days',
    frequency: 'Continuous',
    description:
      'Confirming the fix with the customer, closing the ticket and recording the cause.',
    realizes: ['cap-trouble-ticket'],
  },
  {
    ref: 'proc-r2a',
    name: 'Request to Answer',
    domain: 'dom-customer',
    owner: 'Hannah Schmidt',
    kpi: 'First contact resolution',
    frequency: 'About 650,000 contacts per month',
    description:
      'Answering customer questions and requests in any channel, ideally at the first contact.',
    realizes: ['cap-cust-interaction', 'cap-self-service'],
  },
  {
    ref: 'proc-c2m',
    name: 'Concept to Market',
    domain: 'dom-product',
    owner: 'Chloe Martin',
    kpi: 'Time to market for new offers',
    frequency: 'About 40 offer launches per year',
    description: 'From a product idea to an offer that can be sold in every channel.',
    realizes: ['cap-prod-lifecycle', 'cap-prod-catalog', 'cap-offer-pricing'],
  },
  {
    ref: 'proc-p2b',
    name: 'Plan to Build',
    domain: 'dom-resource',
    owner: 'Mateo Ruiz',
    kpi: 'Sites on air versus plan',
    frequency: 'Quarterly planning cycle',
    description: 'Planning network coverage and capacity and building the sites and links needed.',
    realizes: ['cap-net-planning', 'cap-net-rollout', 'cap-site-spectrum'],
  },
  {
    ref: 'proc-o2s',
    name: 'Onboard to Settle',
    domain: 'dom-partner',
    owner: 'Laura Bianchi',
    kpi: 'Partner settlement disputes',
    frequency: 'Monthly settlement run',
    description: 'From signing a partner to settling what each side owes every month.',
    realizes: ['cap-partner-onboarding', 'cap-partner-settlement'],
  },
  {
    ref: 'proc-r2r',
    name: 'Record to Report',
    domain: 'dom-enterprise',
    owner: 'Felix Wagner',
    kpi: 'Days to close the books',
    frequency: 'Monthly close',
    description: 'Recording financial transactions, closing the month and reporting the results.',
    realizes: ['cap-finance'],
  },
  {
    ref: 'proc-h2r',
    name: 'Hire to Retire',
    domain: 'dom-enterprise',
    owner: 'Nadia Petrova',
    kpi: 'Time to hire',
    frequency: 'About 900 hires per year',
    description: 'The employee journey from recruitment and onboarding to leaving the company.',
    realizes: ['cap-hr'],
  },
  {
    ref: 'proc-p2p',
    name: 'Procure to Pay',
    domain: 'dom-enterprise',
    owner: 'Felix Wagner',
    kpi: 'Supplier invoices paid on time',
    frequency: 'About 6,500 purchase orders per month',
    description:
      'From a purchase request to an approved order, received goods and a paid supplier invoice.',
    realizes: ['cap-procurement'],
  },
];

export const processes: SeedElement[] = specs.map((p) => {
  const el: SeedElement = {
    ref: p.ref,
    type: 'business_process',
    name: p.name,
    description: p.description,
    domain: p.domain,
    owner: p.owner,
    attributes: {
      ...(p.kpi ? { kpi: p.kpi } : {}),
      ...(p.frequency ? { frequency: p.frequency } : {}),
    },
  };
  if (p.parent) el.parent = p.parent;
  return el;
});

/** process → capability (realizes) */
export const processRelations: SeedRelation[] = specs.flatMap((p) =>
  fanOut('realizes', p.ref, p.realizes),
);
