import {
  type AttributeDef,
  CLASSIFICATIONS,
  computeHealth,
  ELEMENT_TYPE_DEFS,
  ELEMENT_TYPES,
  type ElementType,
  type Health,
  LIFECYCLE_PHASES,
  lifecycleAt,
  missingFields,
  normalizeName,
  RELATION_TYPE_DEFS,
  RELATION_TYPES,
  ROLES,
  type TechSignal,
} from '@atrium/schema';
import { describe, expect, it } from 'vitest';
import { acmeTelco } from './acme-telco';
import type { SeedChange, SeedElement, SeedRelation } from './types';

/** The demo story is told as of this date. */
const TODAY = '2026-10-08';
const IN_A_YEAR = '2027-10-08';

const ds = acmeTelco;
const byRef = new Map(ds.elements.map((e) => [e.ref, e]));
const ofType = (type: ElementType) => ds.elements.filter((e) => e.type === type);
const relKey = (r: SeedRelation) => `${r.type}|${r.from}|${r.to}`;
const relsOf = (type: SeedRelation['type']) => ds.relations.filter((r) => r.type === type);

/** Values that occur more than once. */
function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) dupes.add(v);
    seen.add(v);
  }
  return [...dupes];
}

/* ------------------------------------------------------------------ */
/* Validation helpers (return readable error lists)                     */
/* ------------------------------------------------------------------ */

function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function valueProblem(def: AttributeDef, v: unknown): string | null {
  const isNum = typeof v === 'number' && Number.isFinite(v);
  switch (def.kind) {
    case 'text':
    case 'longtext':
      return typeof v === 'string' && v.trim().length > 0 ? null : 'must be a non-empty string';
    case 'url':
      try {
        return typeof v === 'string' && /^https?:\/\//.test(v) && new URL(v)
          ? null
          : 'must be an http(s) URL';
      } catch {
        return 'must be a valid URL';
      }
    case 'number':
    case 'currency':
      return isNum && (v as number) >= 0 ? null : 'must be a non-negative number';
    case 'percent':
      return isNum && (v as number) >= 0 && (v as number) <= 100
        ? null
        : 'must be a number from 0 to 100';
    case 'date':
      return isIsoDate(v) ? null : 'must be a YYYY-MM-DD date';
    case 'enum':
      return typeof v === 'string' && (def.options ?? []).includes(v)
        ? null
        : `must be one of ${(def.options ?? []).join(', ')}`;
    case 'rating':
      return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5
        ? null
        : 'must be an integer 1-5';
    case 'boolean':
      return typeof v === 'boolean' ? null : 'must be a boolean';
    case 'list':
      return Array.isArray(v) && v.every((s) => typeof s === 'string' && s.trim().length > 0)
        ? null
        : 'must be a list of strings';
    default:
      return `has unknown kind ${def.kind}`;
  }
}

function attributeErrors(
  type: ElementType,
  attrs: Record<string, unknown> | undefined,
  where: string,
) {
  const errors: string[] = [];
  const defs = ELEMENT_TYPE_DEFS[type].attributes;
  for (const [key, value] of Object.entries(attrs ?? {})) {
    const def = defs.find((a) => a.key === key);
    if (!def) {
      errors.push(`${where}: "${key}" is not an attribute of ${type}`);
      continue;
    }
    const problem = valueProblem(def, value);
    if (problem) errors.push(`${where}: attribute ${key}=${JSON.stringify(value)} ${problem}`);
  }
  return errors;
}

type Lookup = (ref: string) => ElementType | undefined;

/** Checks the editable fields of an element (or of an update's `set`) for a given type. */
function fieldErrors(
  type: ElementType,
  f: Partial<Omit<SeedElement, 'ref' | 'type'>>,
  self: string,
  lookup: Lookup,
  where: string,
): string[] {
  const errors: string[] = [];
  const def = ELEMENT_TYPE_DEFS[type];
  if (f.name !== undefined && f.name.trim().length === 0) errors.push(`${where}: empty name`);
  if (f.domain !== undefined && lookup(f.domain) !== 'domain') {
    errors.push(`${where}: domain "${f.domain}" is not a domain element`);
  }
  if (f.parent !== undefined) {
    if (!def.hierarchical) errors.push(`${where}: ${type} is not hierarchical but has a parent`);
    if (f.parent === self) errors.push(`${where}: element is its own parent`);
    const parentType = lookup(f.parent);
    if (parentType === undefined) errors.push(`${where}: parent "${f.parent}" does not exist`);
    else if (parentType !== type)
      errors.push(`${where}: parent "${f.parent}" is a ${parentType}, not a ${type}`);
  }
  if (f.lifecycle !== undefined) {
    if (!def.hasLifecycle) errors.push(`${where}: ${type} has no lifecycle`);
    if (!LIFECYCLE_PHASES.includes(f.lifecycle))
      errors.push(`${where}: bad lifecycle ${f.lifecycle}`);
  }
  if (f.lifecycleDates !== undefined) {
    if (!def.hasLifecycle) errors.push(`${where}: ${type} has no lifecycle dates`);
    let previous = '';
    for (const [phase, date] of Object.entries(f.lifecycleDates)) {
      if (!LIFECYCLE_PHASES.includes(phase as never))
        errors.push(`${where}: bad lifecycle phase ${phase}`);
      if (!isIsoDate(date)) errors.push(`${where}: bad date ${phase}=${date}`);
    }
    for (const phase of LIFECYCLE_PHASES) {
      const date = f.lifecycleDates[phase];
      if (!date) continue;
      if (date < previous)
        errors.push(`${where}: lifecycle dates are not in phase order (${phase})`);
      previous = date;
    }
  }
  if (f.classification !== undefined && !CLASSIFICATIONS.includes(f.classification)) {
    errors.push(`${where}: bad classification ${f.classification}`);
  }
  if (f.owner !== undefined && f.owner.trim().length === 0) errors.push(`${where}: empty owner`);
  if (f.tags !== undefined && !f.tags.every((t) => typeof t === 'string' && t.length > 0)) {
    errors.push(`${where}: tags must be non-empty strings`);
  }
  if (
    f.externalIds !== undefined &&
    !Object.values(f.externalIds).every((v) => typeof v === 'string')
  ) {
    errors.push(`${where}: external ids must be strings`);
  }
  errors.push(...attributeErrors(type, f.attributes, where));
  return errors;
}

function elementErrors(el: SeedElement, lookup: Lookup, where = el.ref): string[] {
  if (!ELEMENT_TYPES.includes(el.type)) return [`${where}: unknown type ${el.type}`];
  if (!el.ref || el.ref.trim() !== el.ref) return [`${where}: bad ref`];
  const { ref: _ref, type: _type, ...fields } = el;
  return fieldErrors(el.type, fields, el.ref, lookup, where);
}

function relationErrors(r: SeedRelation, lookup: Lookup, where: string): string[] {
  const def = RELATION_TYPE_DEFS[r.type];
  if (!def) return [`${where}: unknown relation type ${r.type}`];
  const from = lookup(r.from);
  const to = lookup(r.to);
  const errors: string[] = [];
  if (!from) errors.push(`${where}: unknown source ${r.from}`);
  if (!to) errors.push(`${where}: unknown target ${r.to}`);
  if (r.from === r.to) errors.push(`${where}: relation to itself`);
  if (from && !def.from.includes(from))
    errors.push(`${where}: ${r.type} cannot start at a ${from} (${r.from})`);
  if (to && !def.to.includes(to))
    errors.push(`${where}: ${r.type} cannot point to a ${to} (${r.to})`);
  return errors;
}

/** Replays scenario or suggestion changes on top of the base model and reports problems. */
function replay(changes: SeedChange[], label: string) {
  const types = new Map<string, ElementType>(ds.elements.map((e) => [e.ref, e.type]));
  const lookup: Lookup = (ref) => types.get(ref);
  const rels = new Set(ds.relations.map(relKey));
  const created = new Map<string, SeedElement>();
  const errors: string[] = [];
  changes.forEach((c, i) => {
    const where = `${label} #${i + 1} ${c.op}`;
    switch (c.op) {
      case 'create':
        if (types.has(c.element.ref)) errors.push(`${where}: ref ${c.element.ref} already exists`);
        errors.push(...elementErrors(c.element, lookup, `${where} ${c.element.ref}`));
        types.set(c.element.ref, c.element.type);
        created.set(c.element.ref, c.element);
        break;
      case 'update': {
        const type = types.get(c.ref);
        if (!type) errors.push(`${where}: unknown ref ${c.ref}`);
        else errors.push(...fieldErrors(type, c.set, c.ref, lookup, `${where} ${c.ref}`));
        if (Object.keys(c.set).length === 0) errors.push(`${where}: empty update`);
        break;
      }
      case 'delete':
        if (!types.has(c.ref)) errors.push(`${where}: unknown ref ${c.ref}`);
        types.delete(c.ref);
        for (const k of [...rels]) {
          const [, from, to] = k.split('|');
          if (from === c.ref || to === c.ref) rels.delete(k);
        }
        break;
      case 'relate':
        errors.push(...relationErrors(c.relation, lookup, where));
        if (rels.has(relKey(c.relation)))
          errors.push(`${where}: ${relKey(c.relation)} already exists`);
        rels.add(relKey(c.relation));
        break;
      case 'unrelate':
        errors.push(...relationErrors(c.relation, lookup, where));
        if (!rels.has(relKey(c.relation)))
          errors.push(`${where}: ${relKey(c.relation)} does not exist`);
        rels.delete(relKey(c.relation));
        break;
    }
  });
  return { errors, created };
}

function techSignals(appRef: string): TechSignal[] {
  return ds.relations
    .filter((r) => r.type === 'uses' && r.from === appRef)
    .map((r) => byRef.get(r.to)!)
    .map((t) => ({
      name: t.name,
      eolDate: (t.attributes?.eol_date as string | undefined) ?? null,
      radar: (t.attributes?.radar as string | undefined) ?? null,
      lifecycle: t.lifecycle ?? null,
    }));
}

function asQualityInput(el: SeedElement) {
  return {
    type: el.type,
    description: el.description ?? '',
    owner: el.owner ?? null,
    domainId: el.domain ?? null,
    lifecycle: el.lifecycle ?? null,
    attributes: el.attributes ?? {},
    layer: 'org' as const,
  };
}

/* ------------------------------------------------------------------ */
/* Structure                                                             */
/* ------------------------------------------------------------------ */

describe('Acme Telco dataset: structure', () => {
  it('has a stable id and name', () => {
    expect(ds.id).toBe('acme-telco');
    expect(ds.name).toBe('Acme Telco');
    expect(ds.description.length).toBeGreaterThan(20);
  });

  it('uses unique refs', () => {
    expect(duplicates(ds.elements.map((e) => e.ref))).toEqual([]);
  });

  it('uses unique keys per element type, and names unique per type', () => {
    const problems: string[] = [];
    for (const type of ELEMENT_TYPES) {
      const keys = new Set<string>();
      const names = new Set<string>();
      for (const e of ofType(type)) {
        if (e.key !== undefined) {
          if (keys.has(e.key)) problems.push(`duplicate ${type} key ${e.key}`);
          keys.add(e.key);
        }
        const n = normalizeName(e.name);
        if (names.has(n)) problems.push(`duplicate ${type} name ${e.name}`);
        names.add(n);
      }
    }
    expect(problems).toEqual([]);
  });

  it('gives every application a valid service key', () => {
    const bad = ofType('application').filter(
      (a) => !a.key || !/^[a-z0-9][a-z0-9-_.]*$/.test(a.key),
    );
    expect(bad.map((a) => a.ref)).toEqual([]);
  });

  it('has only valid elements (types, refs, parents, lifecycle, attributes)', () => {
    const lookup: Lookup = (ref) => byRef.get(ref)?.type;
    const errors = ds.elements.flatMap((e) => elementErrors(e, lookup));
    expect(errors).toEqual([]);
  });

  it('lists domains first and parents before their children', () => {
    const index = new Map(ds.elements.map((e, i) => [e.ref, i]));
    const problems: string[] = [];
    for (const [i, e] of ds.elements.entries()) {
      if (e.domain && index.get(e.domain)! > i) problems.push(`${e.ref} comes before its domain`);
      if (e.parent && index.get(e.parent)! > i) problems.push(`${e.ref} comes before its parent`);
    }
    expect(problems).toEqual([]);
  });

  it('has no parent cycles', () => {
    for (const e of ds.elements) {
      const seen = new Set<string>([e.ref]);
      let p = e.parent;
      while (p) {
        expect(seen.has(p), `cycle at ${e.ref}`).toBe(false);
        seen.add(p);
        p = byRef.get(p)?.parent;
      }
    }
  });

  it('has only valid relations', () => {
    const lookup: Lookup = (ref) => byRef.get(ref)?.type;
    const errors = ds.relations.flatMap((r, i) =>
      relationErrors(r, lookup, `relation ${i} ${relKey(r)}`),
    );
    expect(errors).toEqual([]);
    expect(ds.relations.every((r) => RELATION_TYPES.includes(r.type))).toBe(true);
  });

  it('has no duplicate relations', () => {
    expect(duplicates(ds.relations.map(relKey))).toEqual([]);
  });

  it('keeps lifecycle phases consistent with lifecycle dates today', () => {
    const problems = ds.elements
      .filter((e) => e.lifecycle && e.lifecycleDates && Object.keys(e.lifecycleDates).length > 0)
      .filter((e) => lifecycleAt(e.lifecycle!, e.lifecycleDates, TODAY) !== e.lifecycle)
      .map(
        (e) => `${e.ref}: ${e.lifecycle} vs ${lifecycleAt(e.lifecycle!, e.lifecycleDates, TODAY)}`,
      );
    expect(problems).toEqual([]);
  });

  it('keeps initiative status consistent with its dates', () => {
    const problems: string[] = [];
    for (const i of ofType('initiative')) {
      const a = i.attributes ?? {};
      const start = a.start_date as string;
      const end = a.end_date as string;
      if (start > end) problems.push(`${i.ref}: starts after it ends`);
      if (start < '2023-01-01' || end > '2029-12-31')
        problems.push(`${i.ref}: dates outside 2023-2029`);
      if (a.status === 'running' && !(start <= TODAY && TODAY <= end))
        problems.push(`${i.ref}: running`);
      if (a.status === 'done' && (end > TODAY || a.progress !== 100))
        problems.push(`${i.ref}: done`);
      if (a.status === 'planned' && (start <= TODAY || a.progress !== 0))
        problems.push(`${i.ref}: planned`);
    }
    expect(problems).toEqual([]);
  });

  it('dates decisions in the past', () => {
    for (const d of ofType('decision'))
      expect((d.attributes?.date as string) <= TODAY, d.ref).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Content and story                                                     */
/* ------------------------------------------------------------------ */

describe('Acme Telco dataset: content', () => {
  it('has realistic counts per element type', () => {
    const count = (t: ElementType) => ofType(t).length;
    expect(count('domain')).toBe(7);
    expect(count('team')).toBeGreaterThanOrEqual(10);
    expect(count('capability')).toBeGreaterThanOrEqual(55);
    expect(count('capability')).toBeLessThanOrEqual(70);
    expect(count('business_process')).toBeGreaterThanOrEqual(15);
    expect(count('business_process')).toBeLessThanOrEqual(20);
    expect(count('application')).toBeGreaterThanOrEqual(50);
    expect(count('technology')).toBeGreaterThanOrEqual(25);
    expect(count('interface')).toBeGreaterThanOrEqual(25);
    expect(count('data_object')).toBeGreaterThanOrEqual(15);
    expect(count('initiative')).toBeGreaterThanOrEqual(8);
    expect(count('principle')).toBeGreaterThanOrEqual(5);
    expect(count('standard')).toBeGreaterThanOrEqual(10);
    expect(count('decision')).toBeGreaterThanOrEqual(8);
  });

  it('has a three-level capability map with a domain on every capability', () => {
    const depth = (e: SeedElement): number => (e.parent ? 1 + depth(byRef.get(e.parent)!) : 1);
    const caps = ofType('capability');
    expect(caps.every((c) => c.domain)).toBe(true);
    expect(caps.filter((c) => depth(c) === 1)).toHaveLength(7);
    expect(caps.filter((c) => depth(c) === 3).length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...caps.map(depth))).toBe(3);
    // most capabilities are rated
    const rated = caps.filter((c) => c.attributes?.importance && c.attributes?.maturity);
    expect(rated.length / caps.length).toBeGreaterThan(0.9);
  });

  it('has coverage gaps and overlaps in the capability map', () => {
    const supported = new Map<string, number>();
    for (const r of relsOf('supports')) supported.set(r.to, (supported.get(r.to) ?? 0) + 1);
    const leaves = ofType('capability').filter((c) => !ds.elements.some((e) => e.parent === c.ref));
    const gaps = leaves.filter((c) => !supported.has(c.ref));
    expect(gaps.length).toBeGreaterThanOrEqual(3);
    expect(gaps.length).toBeLessThanOrEqual(10);
    // duplicates: several capabilities supported by three or more applications
    const crowded = [...supported.entries()].filter(
      ([ref, n]) => byRef.get(ref)?.type === 'capability' && n >= 3,
    );
    expect(crowded.length).toBeGreaterThanOrEqual(3);
  });

  it('maps almost every live application to a capability and a team', () => {
    const live = ofType('application').filter((a) => a.lifecycle !== 'retired');
    const supports = new Set(relsOf('supports').map((r) => r.from));
    const owned = new Set(relsOf('owned_by').map((r) => r.from));
    const unmapped = live.filter((a) => !supports.has(a.ref));
    const unowned = live.filter((a) => !owned.has(a.ref));
    expect(unmapped.length).toBeGreaterThanOrEqual(1);
    expect(unmapped.length).toBeLessThanOrEqual(3);
    expect(unowned.length).toBeGreaterThanOrEqual(1);
    expect(unowned.length).toBeLessThanOrEqual(6);
  });

  it('records 1-4 technologies for every application that is not pure SaaS', () => {
    const uses = new Map<string, number>();
    for (const r of relsOf('uses')) uses.set(r.from, (uses.get(r.from) ?? 0) + 1);
    const problems = ofType('application')
      .filter((a) => a.attributes?.hosting !== 'saas' || uses.has(a.ref))
      .filter((a) => {
        const n = uses.get(a.ref) ?? 0;
        return n < 1 || n > 4;
      })
      .map((a) => `${a.ref}: ${uses.get(a.ref) ?? 0}`);
    expect(problems).toEqual([]);
  });

  it('has a realistic data-quality spread for "Fill the gaps"', () => {
    const apps = ofType('application').filter((a) => a.lifecycle !== 'retired');
    const incomplete = apps.filter((a) => missingFields(asQualityInput(a)).length > 0);
    expect(incomplete.length).toBeGreaterThanOrEqual(8);
    expect(incomplete.length).toBeLessThanOrEqual(15);
    for (const a of apps) {
      expect(a.description === undefined || a.description.length >= 15, a.ref).toBe(true);
    }
  });

  it('has technologies past and near end of life', () => {
    const techs = ofType('technology');
    const health = (t: SeedElement) =>
      computeHealth(
        { type: 'technology', attributes: t.attributes ?? {}, lifecycle: t.lifecycle ?? null },
        [],
        TODAY,
      );
    const pastEol = techs.filter((t) => {
      const eol = t.attributes?.eol_date as string | undefined;
      return eol !== undefined && eol < TODAY;
    });
    const soon = techs.filter((t) => {
      const eol = t.attributes?.eol_date as string | undefined;
      return eol !== undefined && eol >= TODAY && eol <= IN_A_YEAR;
    });
    expect(pastEol.length).toBeGreaterThanOrEqual(4);
    expect(soon.length).toBeGreaterThanOrEqual(3);
    expect(pastEol.every((t) => health(t).health === 'act')).toBe(true);
    const names = pastEol.map((t) => t.name);
    for (const n of [
      'Java 8',
      'PostgreSQL 12',
      'Windows Server 2012 R2',
      'CentOS 7',
      'Node.js 16',
    ]) {
      expect(names).toContain(n);
    }
  });

  it('gives application health a good, watch and act spread', () => {
    const counts: Record<Health, number> = { good: 0, watch: 0, act: 0 };
    for (const a of ofType('application')) {
      const h = computeHealth(
        { type: 'application', attributes: a.attributes ?? {}, lifecycle: a.lifecycle ?? null },
        techSignals(a.ref),
        TODAY,
      ).health;
      if (h) counts[h]++;
    }
    expect(counts.good).toBeGreaterThanOrEqual(8);
    expect(counts.watch).toBeGreaterThanOrEqual(8);
    expect(counts.act).toBeGreaterThanOrEqual(8);
  });

  it('wires interfaces and data objects to applications', () => {
    for (const i of ofType('interface')) {
      const providers = ds.relations.filter((r) => r.type === 'exposes' && r.to === i.ref);
      expect(providers, i.ref).toHaveLength(1);
    }
    const live = ofType('interface').filter((i) => i.lifecycle !== 'plan');
    for (const i of live) {
      expect(
        ds.relations.some((r) => r.type === 'consumes' && r.to === i.ref),
        i.ref,
      ).toBe(true);
    }
    for (const d of ofType('data_object')) {
      expect(
        ds.relations.some((r) => r.type === 'stores' && r.to === d.ref),
        d.ref,
      ).toBe(true);
    }
  });

  it('has a rich landscape of dependencies and data flows', () => {
    expect(relsOf('depends_on').length).toBeGreaterThanOrEqual(40);
    expect(relsOf('flows_to').length).toBeGreaterThanOrEqual(25);
    expect(relsOf('replaces').length).toBeGreaterThanOrEqual(5);
    expect(relsOf('realizes').length).toBeGreaterThanOrEqual(15);
    expect(relsOf('governed_by').length).toBeGreaterThanOrEqual(20);
    for (const i of ofType('initiative')) {
      expect(
        ds.relations.some((r) => r.type === 'impacts' && r.from === i.ref),
        i.ref,
      ).toBe(true);
    }
  });

  it('has standards whose technology names match the technology list', () => {
    const techNames = ofType('technology').map((t) => normalizeName(t.name));
    for (const s of ofType('standard')) {
      const match = (s.attributes?.match as string[] | undefined) ?? [];
      if (s.attributes?.effect !== 'guideline') expect(match.length, s.ref).toBeGreaterThan(0);
      for (const m of match) {
        expect(
          techNames.some((n) => n.includes(normalizeName(m))),
          `${s.ref}: ${m}`,
        ).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Scenarios, users and suggestions                                      */
/* ------------------------------------------------------------------ */

describe('Acme Telco dataset: scenarios', () => {
  it('has one target scenario and one variant', () => {
    expect(ds.scenarios.filter((s) => s.isTarget).map((s) => s.name)).toEqual(['Target 2028']);
    expect(ds.scenarios.find((s) => s.name === 'Cloud-first variant')?.isTarget).toBe(false);
    for (const s of ds.scenarios) expect(isIsoDate(s.targetDate), s.name).toBe(true);
  });

  it.each(ds.scenarios.map((s) => [s.name, s] as const))(
    'replays %s cleanly',
    (_name, scenario) => {
      const { errors, created } = replay(scenario.changes, scenario.name);
      expect(errors).toEqual([]);
      for (const el of created.values()) {
        if (el.lifecycle && el.lifecycleDates) {
          expect(lifecycleAt(el.lifecycle, el.lifecycleDates, scenario.targetDate)).toBe(
            el.lifecycle,
          );
        }
      }
    },
  );

  it('gives Target 2028 a meaningful set of changes', () => {
    const target = ds.scenarios.find((s) => s.isTarget)!;
    expect(target.changes.length).toBeGreaterThanOrEqual(15);
    expect(target.changes.length).toBeLessThanOrEqual(30);
    const ops = new Set(target.changes.map((c) => c.op));
    for (const op of ['create', 'update', 'delete', 'relate', 'unrelate'])
      expect(ops.has(op as never), op).toBe(true);
    const retired = target.changes.filter(
      (c) => c.op === 'update' && c.set.lifecycle === 'retired',
    );
    expect(retired.map((c) => (c as { ref: string }).ref)).toEqual(
      expect.arrayContaining(['app-legacy-crm', 'app-siebel']),
    );
  });
});

describe('Acme Telco dataset: users and suggestions', () => {
  it('has five users with valid roles, teams and example.com-style emails', () => {
    expect(ds.users).toHaveLength(5);
    const emails = new Set<string>();
    for (const u of ds.users) {
      expect(ROLES).toContain(u.role);
      expect(u.email).toMatch(/^[a-z.]+@acme-telco\.example$/);
      expect(emails.has(u.email)).toBe(false);
      emails.add(u.email);
      for (const t of u.teams) expect(byRef.get(t)?.type, `${u.name} team ${t}`).toBe('team');
    }
    const roles = new Set(ds.users.map((u) => u.role));
    for (const r of ['architect', 'manager', 'engineer']) expect(roles.has(r as never)).toBe(true);
  });

  it('has suggestions from a person, an agent and CI', () => {
    const kinds = new Set(ds.suggestions.map((s) => s.authorKind));
    expect([...kinds].sort()).toEqual(['agent', 'ci', 'user']);
    expect(ds.suggestions.some((s) => s.authorName === 'Sam Okafor')).toBe(true);
    expect(ds.suggestions.some((s) => s.authorName === 'Claude Code (agent)')).toBe(true);
  });

  it.each(ds.suggestions.map((s) => [s.title, s] as const))('replays "%s" cleanly', (_title, s) => {
    expect(s.changes.length).toBeGreaterThanOrEqual(1);
    expect(s.changes.length).toBeLessThanOrEqual(4);
    expect(replay(s.changes, s.title).errors).toEqual([]);
  });
});
