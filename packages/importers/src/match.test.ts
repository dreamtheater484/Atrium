import { describe, expect, it } from 'vitest';
import { matchName } from './match';

describe('matchName', () => {
  const names = ['SAP ECC', 'Salesforce', 'Microsoft Dynamics 365', 'ServiceNow ITSM'];

  it('prefers exact matches after normalisation', () => {
    expect(matchName('sap-ecc', names)).toEqual({
      name: 'SAP ECC',
      index: 0,
      score: 1,
      exact: true,
    });
    expect(matchName('  SALESFORCE ', names)).toMatchObject({ name: 'Salesforce', exact: true });
  });

  it('ignores spacing differences', () => {
    expect(matchName('Sales Force', names)).toEqual({
      name: 'Salesforce',
      index: 1,
      score: 0.95,
      exact: false,
    });
  });

  it('falls back to the most similar name above the threshold', () => {
    const m = matchName('Microsoft Dynamics365', names, 0.5);
    expect(m?.name).toBe('Microsoft Dynamics 365');
    expect(m?.exact).toBe(false);
    expect(matchName('ServiceNow', names, 0.5)?.name).toBe('ServiceNow ITSM');
  });

  it('returns undefined when nothing is close enough', () => {
    expect(matchName('Workday', names)).toBeUndefined();
    expect(matchName('', names)).toBeUndefined();
    expect(matchName('Salesforc', names, 0.95)).toBeUndefined();
  });
});
