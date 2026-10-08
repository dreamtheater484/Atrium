import type { SeedRelation } from '../types';
import { fanOut, rel } from './helpers';

/*
 * Application-to-application relations. Relations that belong to one element type
 * (supports, uses, owned_by, exposes, consumes, stores, governed_by, impacts, realizes)
 * are kept next to that type's definitions; this file holds the landscape wiring.
 */

/** depends_on: the source needs the target to work. */
const dependsOn: Record<string, string[]> = {
  'app-order-hub': [
    'app-product-catalog',
    'app-service-orchestrator',
    'app-sf-service',
    'app-billing',
    'app-product-inventory',
    'app-notification-hub',
  ],
  'app-selfcare-portal': ['app-order-hub', 'app-legacy-crm', 'app-billing', 'app-acme-identity'],
  'app-myacme-app': [
    'app-api-gateway',
    'app-acme-identity',
    'app-order-hub',
    'app-ocs',
    'app-payment-gateway-v2',
  ],
  'app-myacme-web': ['app-api-gateway', 'app-acme-identity', 'app-order-hub'],
  'app-ava': ['app-sf-service', 'app-ml-platform'],
  'app-contact-centre': ['app-sf-service', 'app-legacy-crm'],
  'app-sf-service': ['app-esb'],
  'app-siebel': ['app-esb', 'app-b2b-billing'],
  'app-legacy-crm': ['app-billing', 'app-esb'],
  'app-quote-builder': ['app-product-catalog', 'app-sf-sales'],
  'app-device-webshop': ['app-product-catalog', 'app-payment-gateway', 'app-order-hub'],
  'app-billing': ['app-mediation', 'app-payment-gateway', 'app-esb'],
  'app-cloud-bss': ['app-event-platform', 'app-payment-gateway-v2', 'app-product-catalog'],
  'app-collections': ['app-billing', 'app-payment-gateway'],
  'app-notification-hub': ['app-event-platform'],
  'app-service-orchestrator': [
    'app-service-inventory',
    'app-activation-gateway',
    'app-network-inventory',
  ],
  'app-activation-gateway': ['app-sdn-controller'],
  'app-trouble-ticket': ['app-service-inventory', 'app-fault-manager'],
  'app-field-service': ['app-trouble-ticket', 'app-workday'],
  'app-sqm': ['app-perf-manager'],
  'app-fault-manager': ['app-network-inventory'],
  'app-5g-orchestrator': ['app-sdn-controller', 'app-network-inventory'],
  'app-net-automation': ['app-sdn-controller', 'app-network-inventory'],
  'app-partner-portal': ['app-acme-identity', 'app-order-hub', 'app-dealer-commission'],
  'app-interconnect-billing': ['app-mediation'],
  'app-revenue-assurance': ['app-mediation'],
  'app-fraud-shield': ['app-mediation'],
  'app-customer-360': ['app-data-lake', 'app-sf-service'],
  'app-data-lake': ['app-event-platform'],
  'app-power-bi': ['app-data-lake'],
  'app-cognos': ['app-edw'],
  'app-finance-cube': ['app-edw', 'app-sap-s4'],
  'app-ml-platform': ['app-data-lake'],
  'app-netinsight': ['app-data-lake'],
  'app-sap-s4': ['app-entra-id'],
  'app-servicenow': ['app-entra-id'],
  'app-api-gateway': ['app-acme-identity'],
};

/** flows_to: data moves from the source to the target. */
const flowsTo: Record<string, string[]> = {
  'app-order-hub': ['app-billing', 'app-data-lake', 'app-product-inventory'],
  'app-sf-service': ['app-customer-360'],
  'app-legacy-crm': ['app-customer-360', 'app-edw'],
  'app-siebel': ['app-edw'],
  'app-mediation': [
    'app-billing',
    'app-interconnect-billing',
    'app-revenue-assurance',
    'app-fraud-shield',
    'app-data-lake',
  ],
  'app-billing': ['app-sap-s4', 'app-collections', 'app-edw'],
  'app-b2b-billing': ['app-sap-s4'],
  'app-interconnect-billing': ['app-sap-s4'],
  'app-payment-gateway': ['app-billing', 'app-sap-s4'],
  'app-payment-gateway-v2': ['app-billing'],
  'app-workday': ['app-sap-s4', 'app-entra-id'],
  'app-perf-manager': ['app-netinsight'],
  'app-fault-manager': ['app-trouble-ticket', 'app-sqm'],
  'app-trouble-ticket': ['app-field-service'],
  'app-roaming-clearing': ['app-interconnect-billing'],
  'app-ocs': ['app-data-lake'],
  'app-data-lake': ['app-power-bi', 'app-ml-platform'],
  'app-edw': ['app-cognos', 'app-finance-cube'],
  'app-ml-platform': ['app-sf-service'],
  'app-dealer-commission': ['app-sap-s4'],
};

/** replaces: the source succeeds the target. */
const replaces: Array<[string, string]> = [
  ['app-sf-service', 'app-legacy-crm'],
  ['app-sf-sales', 'app-siebel'],
  ['app-order-hub', 'app-legacy-order-entry'],
  ['app-cloud-bss', 'app-billing'],
  ['app-cloud-bss', 'app-b2b-billing'],
  ['app-myacme-web', 'app-selfcare-portal'],
  ['app-payment-gateway-v2', 'app-payment-gateway'],
  ['app-sap-s4', 'app-sap-ecc'],
  ['app-data-lake', 'app-edw'],
  ['app-power-bi', 'app-cognos'],
  ['app-api-gateway', 'app-esb'],
  ['app-product-catalog', 'app-tariff-manager'],
  ['if-payments-v2', 'if-tmf676'],
  ['tech-java21', 'tech-java8'],
];

export const landscapeRelations: SeedRelation[] = [
  ...Object.entries(dependsOn).flatMap(([from, to]) => fanOut('depends_on', from, to)),
  ...Object.entries(flowsTo).flatMap(([from, to]) => fanOut('flows_to', from, to)),
  ...replaces.map(([from, to]) => rel('replaces', from, to)),
];
