import type { SeedDataset } from '../types';
import { applicationRelations, applications } from './applications';
import { capabilities } from './capabilities';
import { domains, teams } from './domains-teams';
import { decisions, governanceRelations, principles, standards } from './governance';
import { initiativeRelations, initiatives } from './initiatives';
import { dataObjects, dataRelations, interfaceRelations, interfaces } from './interfaces-data';
import { processes, processRelations } from './processes';
import { landscapeRelations } from './relations';
import { scenarios } from './scenarios';
import { technologies, technologyRelations } from './technologies';
import { suggestions, users } from './users-suggestions';

/**
 * Acme Telco: a fictional, mid-sized European converged operator (mobile, broadband,
 * TV and business services, about 4 million customers and 9,200 employees).
 *
 * The dataset powers the onboarding sample, the demo videos and the end-to-end tests.
 * Elements are ordered so that domains come first and parents come before children.
 */
export const acmeTelco: SeedDataset = {
  id: 'acme-telco',
  name: 'Acme Telco',
  description:
    'A fictional European telecom operator with about 4 million customers. Includes a TM Forum-style capability map, 65 applications, their technologies, interfaces and data, governance, initiatives and a target architecture for 2028.',
  elements: [
    ...domains,
    ...teams,
    ...capabilities,
    ...processes,
    ...technologies,
    ...applications,
    ...interfaces,
    ...dataObjects,
    ...principles,
    ...standards,
    ...decisions,
    ...initiatives,
  ],
  relations: [
    ...processRelations,
    ...applicationRelations,
    ...technologyRelations,
    ...interfaceRelations,
    ...dataRelations,
    ...landscapeRelations,
    ...governanceRelations,
    ...initiativeRelations,
  ],
  scenarios,
  users,
  suggestions,
};
