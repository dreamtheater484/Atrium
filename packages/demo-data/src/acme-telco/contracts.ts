import type { SeedElement, SeedRelation } from '../types';
import { fanOut, rel } from './helpers';

/*
 * Lump-sum contracts. Their cost is shared out over what they cover, so the Netrix
 * applications have no cost of their own: the suite licence pays for all four. The Oracle
 * licence covers database and middleware technologies, so it is shared by every application
 * running on them. The Microsoft renewal is still being negotiated, so its cost is an estimate.
 */
export const contracts: SeedElement[] = [
  {
    ref: 'ctr-netrix',
    type: 'contract',
    name: 'Netrix Network Suite licence',
    key: 'netrix-network-suite',
    domain: 'dom-resource',
    owner: 'Henrik Lund',
    description:
      'Enterprise licence and support for the Netrix network management suite: network and service inventory, fault and performance management.',
    attributes: {
      vendor: 'Netrix',
      annual_cost: 2_100_000,
      cost_basis: 'actual',
      end_date: '2027-12-31',
      notice: '6 months',
      reference: 'NTX-2021-0042',
    },
  },
  {
    ref: 'ctr-oracle',
    type: 'contract',
    name: 'Oracle Unlimited License Agreement',
    key: 'oracle-ula',
    domain: 'dom-enterprise',
    owner: 'Monika Nowak',
    description:
      'Unlimited use of Oracle Database and WebLogic for three years, with support. Up for certification or renewal in 2027.',
    attributes: {
      vendor: 'Oracle',
      annual_cost: 1_850_000,
      cost_basis: 'actual',
      end_date: '2027-05-31',
      notice: '90 days',
      reference: 'ORA-ULA-2024-117',
    },
  },
  {
    ref: 'ctr-microsoft',
    type: 'contract',
    name: 'Microsoft Enterprise Agreement',
    key: 'microsoft-ea',
    domain: 'dom-enterprise',
    owner: 'Marc Dubois',
    description:
      'Microsoft 365, Entra ID, Power BI and Windows Server licences. The renewal is being negotiated; the yearly cost is an estimate until it is signed.',
    attributes: {
      vendor: 'Microsoft',
      annual_cost: 2_400_000,
      cost_basis: 'estimate',
      end_date: '2028-06-30',
      notice: '30 days before anniversary',
      reference: 'EA-7731942',
    },
  },
];

export const contractRelations: SeedRelation[] = [
  ...fanOut('covers', 'ctr-netrix', [
    'app-network-inventory',
    'app-service-inventory',
    'app-fault-manager',
    'app-perf-manager',
  ]),
  ...fanOut('covers', 'ctr-oracle', ['tech-oracle12c', 'tech-oracle19c', 'tech-weblogic']),
  ...fanOut('covers', 'ctr-microsoft', ['app-entra-id', 'app-power-bi']),
  rel('covers', 'ctr-microsoft', 'tech-win2016'),
  rel('owned_by', 'ctr-oracle', 'team-erp'),
];
