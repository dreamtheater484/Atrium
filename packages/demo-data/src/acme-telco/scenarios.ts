import type { SeedChange, SeedScenario } from '../types';
import { rel } from './helpers';

const relate = (...args: Parameters<typeof rel>): SeedChange => ({
  op: 'relate',
  relation: rel(...args),
});
const unrelate = (...args: Parameters<typeof rel>): SeedChange => ({
  op: 'unrelate',
  relation: rel(...args),
});

/**
 * Target 2028: the agreed target architecture. Legacy CRMs and on-premise billing are gone,
 * a Unified Commerce Platform arrives, the commerce core runs on public cloud and
 * Network Inventory leaves its end-of-life stack.
 */
const target2028: SeedScenario = {
  name: 'Target 2028',
  description:
    'Agreed target architecture for the end of 2028: one CRM, one cloud billing platform, a unified commerce platform, the commerce core on public cloud and no end-of-life technology in critical systems.',
  isTarget: true,
  targetDate: '2028-12-31',
  changes: [
    // CRM consolidation
    { op: 'update', ref: 'app-legacy-crm', set: { lifecycle: 'retired' } },
    { op: 'update', ref: 'app-siebel', set: { lifecycle: 'retired' } },
    unrelate('depends_on', 'app-contact-centre', 'app-legacy-crm'),
    // Self-care relaunch
    { op: 'update', ref: 'app-selfcare-portal', set: { lifecycle: 'retired' } },
    // Unified commerce
    {
      op: 'create',
      element: {
        ref: 'app-unified-commerce',
        type: 'application',
        name: 'Unified Commerce Platform',
        key: 'unified-commerce',
        description:
          'One commerce platform for devices, plans, accessories and business quotes across web, app and shops. Replaces the Device Webshop.',
        domain: 'dom-customer',
        owner: 'Elena Rossi',
        lifecycle: 'active',
        lifecycleDates: { plan: '2027-01-11', build: '2027-06-01', active: '2028-04-03' },
        classification: 'confidential',
        tags: ['customer-facing', 'commerce', 'strategic'],
        attributes: {
          vendor: 'Pelago Software',
          product: 'Pelago Commerce',
          hosting: 'saas',
          annual_cost: 1_200_000,
          criticality: 'mission_critical',
          time: 'invest',
          business_fit: 4,
          technical_fit: 4,
        },
      },
    },
    relate('supports', 'app-unified-commerce', 'cap-order-capture'),
    relate('supports', 'app-unified-commerce', 'cap-sales'),
    relate('supports', 'app-unified-commerce', 'cap-quote'),
    relate('owned_by', 'app-unified-commerce', 'team-commerce'),
    relate('consumes', 'app-unified-commerce', 'if-tmf620'),
    relate('consumes', 'app-unified-commerce', 'if-tmf622'),
    relate('flows_to', 'app-unified-commerce', 'app-order-hub'),
    relate('replaces', 'app-unified-commerce', 'app-device-webshop'),
    { op: 'update', ref: 'app-device-webshop', set: { lifecycle: 'retired' } },
    // Billing consolidation
    { op: 'update', ref: 'app-billing', set: { lifecycle: 'retired' } },
    { op: 'update', ref: 'app-b2b-billing', set: { lifecycle: 'retired' } },
    { op: 'update', ref: 'app-cloud-bss', set: { lifecycle: 'active' } },
    relate('stores', 'app-cloud-bss', 'data-invoice'),
    relate('stores', 'app-cloud-bss', 'data-account'),
    // Commerce core moves to public cloud
    { op: 'update', ref: 'app-order-hub', set: { attributes: { hosting: 'public_cloud' } } },
    { op: 'update', ref: 'app-product-catalog', set: { attributes: { hosting: 'public_cloud' } } },
    // Network Inventory leaves its end-of-life stack
    unrelate('uses', 'app-network-inventory', 'tech-oracle12c'),
    relate('uses', 'app-network-inventory', 'tech-pg16'),
    unrelate('uses', 'app-network-inventory', 'tech-centos7'),
    relate('uses', 'app-network-inventory', 'tech-rhel8'),
    { op: 'update', ref: 'tech-java8', set: { lifecycle: 'retired' } },
    // Shadow IT removed once all tariffs live in the Product Catalog
    { op: 'delete', ref: 'app-tariff-manager' },
  ],
};

/**
 * Cloud-first variant: an alternative the architecture board is comparing. Moves OSS and
 * ERP to public cloud as well, and replaces the trouble-ticket system with ServiceNow.
 */
const cloudFirst: SeedScenario = {
  name: 'Cloud-first variant',
  description:
    'Alternative to Target 2028 that also moves OSS and ERP to public cloud, switches the warehouse and ESB off earlier and moves trouble tickets to ServiceNow.',
  isTarget: false,
  targetDate: '2028-12-31',
  changes: [
    {
      op: 'update',
      ref: 'app-network-inventory',
      set: { attributes: { hosting: 'public_cloud' } },
    },
    {
      op: 'update',
      ref: 'app-service-inventory',
      set: { attributes: { hosting: 'public_cloud' } },
    },
    { op: 'update', ref: 'app-fault-manager', set: { attributes: { hosting: 'public_cloud' } } },
    { op: 'update', ref: 'app-sap-s4', set: { attributes: { hosting: 'public_cloud' } } },
    {
      op: 'create',
      element: {
        ref: 'tech-aurora',
        type: 'technology',
        name: 'Amazon Aurora PostgreSQL',
        key: 'amazon-aurora-postgresql',
        description: 'Managed PostgreSQL-compatible database on AWS.',
        owner: 'Lucas Moreau',
        lifecycle: 'active',
        classification: 'internal',
        attributes: {
          category: 'cloud_service',
          vendor: 'Amazon Web Services',
          version: '16',
          radar: 'trial',
        },
      },
    },
    unrelate('uses', 'app-network-inventory', 'tech-oracle12c'),
    relate('uses', 'app-network-inventory', 'tech-aurora'),
    unrelate('uses', 'app-order-hub', 'tech-k8s'),
    relate('uses', 'app-order-hub', 'tech-eks'),
    { op: 'update', ref: 'app-edw', set: { lifecycle: 'retired' } },
    { op: 'update', ref: 'app-esb', set: { lifecycle: 'retired' } },
    { op: 'update', ref: 'app-trouble-ticket', set: { lifecycle: 'retired' } },
    relate('supports', 'app-servicenow', 'cap-trouble-ticket'),
  ],
};

export const scenarios: SeedScenario[] = [target2028, cloudFirst];
