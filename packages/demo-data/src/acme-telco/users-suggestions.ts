import type { SeedChange, SeedSuggestion, SeedUser } from '../types';
import { rel } from './helpers';

const relate = (...args: Parameters<typeof rel>): SeedChange => ({
  op: 'relate',
  relation: rel(...args),
});
const unrelate = (...args: Parameters<typeof rel>): SeedChange => ({
  op: 'unrelate',
  relation: rel(...args),
});

/** Demo users, one per main role. Emails use the reserved .example domain. */
export const users: SeedUser[] = [
  { name: 'Anna Kumar', email: 'anna.kumar@acme-telco.example', role: 'architect', teams: [] },
  {
    name: 'Jeroen Visser',
    email: 'jeroen.visser@acme-telco.example',
    role: 'architect',
    teams: [],
  },
  { name: 'Mia Laurent', email: 'mia.laurent@acme-telco.example', role: 'manager', teams: [] },
  {
    name: 'Sam Okafor',
    email: 'sam.okafor@acme-telco.example',
    role: 'engineer',
    teams: ['team-billing'],
  },
  {
    name: 'Lena Fischer',
    email: 'lena.fischer@acme-telco.example',
    role: 'engineer',
    teams: ['team-digital'],
  },
];

/** Suggestions waiting for review: from a person, a coding agent and CI. */
export const suggestions: SeedSuggestion[] = [
  {
    title: 'Add Payment Gateway v2 dependency',
    description:
      'Collections Manager now takes card payments and refunds through Payments API v2. The old TMF676 calls were switched off in the September release, so the link to Payment Gateway (v1) can go.',
    authorName: 'Sam Okafor',
    authorKind: 'user',
    changes: [
      relate('depends_on', 'app-collections', 'app-payment-gateway-v2'),
      relate('consumes', 'app-collections', 'if-payments-v2'),
      unrelate('consumes', 'app-collections', 'if-tmf676'),
      unrelate('depends_on', 'app-collections', 'app-payment-gateway'),
    ],
  },
  {
    title: 'Partner Portal now runs on Node.js 22 and Angular 21',
    description:
      'While upgrading partner-portal (pull request #482) I replaced Node.js 16 with Node.js 22 and Angular 12 with Angular 21. Both old versions were past end of life. The build and all 312 tests pass.',
    authorName: 'Claude Code (agent)',
    authorKind: 'agent',
    changes: [
      unrelate('uses', 'app-partner-portal', 'tech-node16'),
      relate('uses', 'app-partner-portal', 'tech-node22'),
      unrelate('uses', 'app-partner-portal', 'tech-angular12'),
      relate('uses', 'app-partner-portal', 'tech-angular21'),
    ],
  },
  {
    title: 'Sync notification-hub from atrium.yaml',
    description:
      'atrium.yaml in the notification-hub repository changed on main (commit 4f2c9e1): a new event interface for delivery status, and version 3.8.0.',
    authorName: 'atrium sync (CI)',
    authorKind: 'ci',
    changes: [
      {
        op: 'create',
        element: {
          ref: 'if-notification-status',
          type: 'interface',
          name: 'Notification Status Events',
          key: 'notification-status-events',
          description:
            'Kafka topic with delivery, bounce and opt-out events for every message sent.',
          owner: 'Pieter de Vries',
          lifecycle: 'active',
          classification: 'internal',
          attributes: { protocol: 'event', frequency: 'realtime' },
        },
      },
      relate('exposes', 'app-notification-hub', 'if-notification-status'),
      { op: 'update', ref: 'app-notification-hub', set: { attributes: { version: '3.8.0' } } },
    ],
  },
  {
    title: 'MyAcme Web go-live moves to April 2027',
    description:
      'The accessibility audit found issues we will fix before launch, so go-live moves from 1 March to 12 April 2027. MyAcme Web will also show bills through the Customer Bill API.',
    authorName: 'Lena Fischer',
    authorKind: 'user',
    changes: [
      {
        op: 'update',
        ref: 'app-myacme-web',
        set: { lifecycleDates: { plan: '2025-09-01', build: '2026-02-02', active: '2027-04-12' } },
      },
      relate('consumes', 'app-myacme-web', 'if-tmf678'),
    ],
  },
];
