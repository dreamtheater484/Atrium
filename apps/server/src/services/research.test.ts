import { describe, expect, it } from 'vitest';
import { inferProduct } from './eol';
import { cleanFinding } from './researchers';

describe('research findings', () => {
  const base = {
    end_of_support: '2027-06-30',
    extended_support: '2029-06-30',
    support_model: 'versioned',
    source_url: 'https://vendor.example/lifecycle',
    quote: 'Version 9 is supported until 30 June 2027.',
    confidence: 'high',
    note: null,
  };

  it('keeps a well-formed finding', () => {
    expect(cleanFinding(base)).toMatchObject({
      endOfSupport: '2027-06-30',
      extendedSupport: '2029-06-30',
      confidence: 'high',
    });
  });

  it('drops dates nobody can check', () => {
    expect(cleanFinding({ ...base, source_url: null })).toBeNull();
    expect(cleanFinding({ ...base, source_url: 'http://vendor.example' })).toBeNull();
    expect(cleanFinding({ ...base, source_url: 'javascript:alert(1)' })).toBeNull();
  });

  it('rejects impossible dates and inconsistent extended support', () => {
    expect(cleanFinding({ ...base, end_of_support: '2027-02-30' })).toBeNull();
    expect(cleanFinding({ ...base, end_of_support: 'next year' })).toBeNull();
    expect(cleanFinding({ ...base, extended_support: '2026-01-01' })?.extendedSupport).toBeNull();
  });

  it('accepts products without dates when they are rolling releases or managed services', () => {
    expect(
      cleanFinding({
        ...base,
        end_of_support: null,
        extended_support: null,
        support_model: 'rolling',
      })?.supportModel,
    ).toBe('rolling');
    expect(cleanFinding({ ...base, end_of_support: null, support_model: 'unknown' })).toBeNull();
  });

  it('shortens long quotes and treats unknown confidence as low', () => {
    const f = cleanFinding({ ...base, quote: 'x'.repeat(1000), confidence: 'certain' });
    expect(f?.quote).toHaveLength(300);
    expect(f?.confidence).toBe('low');
  });
});

describe('endoflife.date product matching', () => {
  it('matches products by name', () => {
    expect(inferProduct('PostgreSQL 12')).toBe('postgresql');
    expect(inferProduct('Oracle Database 19c')).toBe('oracle-database');
    expect(inferProduct('Spring Boot 2.7')).toBe('spring-boot');
  });

  it('does not mistake other Oracle products for the database', () => {
    expect(inferProduct('Oracle WebLogic Server 12c', 'oracle-weblogic-server')).toBeNull();
    expect(inferProduct('Integration Bus', 'Oracle SOA Suite 12.2')).toBeNull();
  });
});
