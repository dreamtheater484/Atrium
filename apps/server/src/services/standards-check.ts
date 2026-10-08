import { addDaysIso, type Element, enumLabel, normalizeName, todayIso } from '@atrium/schema';
import type { RequestContext } from '../auth/context';
import { audit } from './audit';
import { findService } from './context';
import type { Deps } from './deps';
import { inferProduct, inferVersion, lookupEol } from './eol';
import { ModelIndex } from './model-index';
import { bestMatch } from './search';
import { resolveState } from './store';

export interface CheckInput {
  service?: string;
  technologies?: Array<{ name: string; version?: string }>;
  dependencies?: string[];
  data?: string[];
  hosting?: string;
  description?: string;
}

export interface Finding {
  level: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  standard?: { id: string; name: string };
  element?: { id: string; name: string };
}

export interface CheckResult {
  passed: boolean;
  summary: string;
  service: { id: string; name: string } | null;
  findings: Finding[];
}

const CATEGORY_HINTS: Record<string, string> = {
  postgresql: 'database',
  mysql: 'database',
  mariadb: 'database',
  mongodb: 'database',
  redis: 'database',
  'oracle-database': 'database',
  mssqlserver: 'database',
  'ibm-db2': 'database',
  'apache-cassandra': 'database',
  elasticsearch: 'database',
  nodejs: 'runtime',
  python: 'language',
  'oracle-jdk': 'runtime',
  'eclipse-temurin': 'runtime',
  dotnet: 'runtime',
  php: 'language',
  ruby: 'language',
  go: 'language',
  kotlin: 'language',
  angular: 'framework',
  react: 'framework',
  vue: 'framework',
  nextjs: 'framework',
  'spring-boot': 'framework',
  'spring-framework': 'framework',
  django: 'framework',
  rails: 'framework',
  kubernetes: 'platform',
  'red-hat-openshift': 'platform',
  'docker-engine': 'platform',
  'apache-kafka': 'middleware',
  rabbitmq: 'middleware',
  'ibm-mq': 'middleware',
  'mulesoft-runtime': 'middleware',
};

function techMatches(pattern: string, name: string, version?: string): boolean {
  const p = normalizeName(pattern);
  const full = normalizeName(`${name} ${version ?? ''}`);
  if (full === p || full.startsWith(`${p} `) || full.startsWith(p)) return true;
  const [pName, ...pVer] = p.split(' ');
  const n = normalizeName(name);
  if (!n.startsWith(pName!)) return false;
  if (!pVer.length) return true;
  const v = version ? normalizeName(version) : (inferVersion(name) ?? '').toLowerCase();
  return !!v && (v === pVer.join(' ') || v.startsWith(`${pVer.join(' ')}.`));
}

/**
 * Checks a service, or a design an agent is about to build, against the organisation's
 * standards, technology radar, end-of-life dates and dependency lifecycles.
 */
export async function checkAgainstStandards(
  deps: Deps,
  ctx: RequestContext,
  input: CheckInput,
): Promise<CheckResult> {
  const state = await resolveState(deps.store, deps.sql, ctx, { includeDrafts: false });
  const index = new ModelIndex(state);
  const findings: Finding[] = [];
  const service = input.service ? findService(index, input.service) : undefined;
  if (input.service && !service) {
    findings.push({
      level: 'info',
      rule: 'unknown-service',
      message: `"${input.service}" is not in the architecture model yet. Propose it with propose_change so others can find it.`,
    });
  }
  const today = todayIso();
  const soon = addDaysIso(today, 365);

  // Technologies: from the request, or the service's current ones.
  const techs: Array<{ name: string; version?: string; element?: Element }> = input.technologies
    ?.length
    ? input.technologies.map((t) => ({
        ...t,
        element: bestMatch(index, `${t.name} ${t.version ?? ''}`.trim(), ['technology']),
      }))
    : service
      ? index.targets(service.id, 'uses').map((t) => ({
          name: t.name,
          version: t.attributes.version as string | undefined,
          element: t,
        }))
      : [];

  const standards = index.ofType('standard');
  for (const t of techs) {
    const label = `${t.name}${t.version && !t.name.includes(t.version) ? ` ${t.version}` : ''}`;
    // End of life: model first, then endoflife.date
    let eol = t.element?.attributes.eol_date as string | undefined;
    if (!eol) {
      const product = inferProduct(t.name);
      eol = product
        ? (lookupEol(product, t.version ?? inferVersion(t.name))?.eolDate ?? undefined)
        : undefined;
    }
    if (eol && eol < today)
      findings.push({
        level: 'error',
        rule: 'end-of-life',
        message: `${label} reached end of life on ${eol}. Use a supported version.`,
        element: t.element && { id: t.element.id, name: t.element.name },
      });
    else if (eol && eol <= soon)
      findings.push({
        level: 'warning',
        rule: 'end-of-life-soon',
        message: `${label} reaches end of life on ${eol}. Plan the upgrade now.`,
        element: t.element && { id: t.element.id, name: t.element.name },
      });

    const ring = t.element?.attributes.radar as string | undefined;
    if (ring === 'hold')
      findings.push({
        level: 'warning',
        rule: 'radar-hold',
        message: `${label} is on hold in the technology radar: don't use it for new work.`,
        element: t.element && { id: t.element.id, name: t.element.name },
      });
    else if (ring === 'assess')
      findings.push({
        level: 'info',
        rule: 'radar-assess',
        message: `${label} is still being assessed. Check with the architects before relying on it.`,
      });
    else if (!t.element)
      findings.push({
        level: 'info',
        rule: 'radar-unknown',
        message: `${label} is not on the technology radar yet.`,
      });

    for (const s of standards) {
      const match = (s.attributes.match as string[] | undefined) ?? [];
      const effect = s.attributes.effect as string | undefined;
      const level = s.attributes.level === 'must' ? 'error' : 'warning';
      if (effect === 'forbid' && match.some((m) => techMatches(m, t.name, t.version))) {
        findings.push({
          level,
          rule: 'standard-forbid',
          message:
            `${label} is not allowed: ${s.name}. ${(s.attributes.rule as string) ?? ''}`.trim(),
          standard: { id: s.id, name: s.name },
        });
      }
    }
  }

  // Preferred technologies: a database that isn't the preferred one, and so on.
  for (const s of standards) {
    const effect = s.attributes.effect as string | undefined;
    if (effect !== 'prefer' && effect !== 'require') continue;
    const match = (s.attributes.match as string[] | undefined) ?? [];
    if (!match.length) continue;
    const products = new Set(match.map((m) => inferProduct(m)).filter(Boolean));
    const preferredCategories = new Set(
      match.map((m) => CATEGORY_HINTS[inferProduct(m) ?? ''] ?? null).filter(Boolean),
    );
    for (const t of techs) {
      if (match.some((m) => techMatches(m, t.name, t.version))) continue;
      const product = inferProduct(t.name, t.element?.attributes.product as string | undefined);
      const label = `${t.name}${t.version && !t.name.includes(t.version) ? ` ${t.version}` : ''}`;
      if (product && products.has(product)) {
        // Same product, version not allowed: "Java services run on Java 17 or 21".
        findings.push({
          level: s.attributes.level === 'must' ? 'error' : 'warning',
          rule: 'standard-version',
          message: `${label} doesn't meet "${s.name}": use ${match.join(' or ')}.`,
          standard: { id: s.id, name: s.name },
        });
        continue;
      }
      // A different product in the same category: "Use PostgreSQL for relational data".
      if (effect !== 'prefer' || products.size === 0) continue;
      const cat = (t.element?.attributes.category as string) ?? CATEGORY_HINTS[product ?? ''];
      if (!cat || !preferredCategories.has(cat)) continue;
      findings.push({
        level: 'warning',
        rule: 'standard-prefer',
        message: `${label} is used where "${s.name}" prefers ${match.join(' or ')}.`,
        standard: { id: s.id, name: s.name },
      });
    }
  }

  // Dependencies on things being phased out.
  const depRefs = input.dependencies?.length
    ? input.dependencies
    : service
      ? index.targets(service.id, 'depends_on').map((d) => d.id)
      : [];
  for (const ref of depRefs) {
    const d = findService(index, ref);
    if (!d) {
      findings.push({
        level: 'info',
        rule: 'unknown-dependency',
        message: `Dependency "${ref}" is not in the model.`,
      });
      continue;
    }
    const successor = index.sources(d.id, 'replaces')[0];
    if (d.lifecycle === 'retired')
      findings.push({
        level: 'error',
        rule: 'dependency-retired',
        message: `${d.name} is retired${successor ? `; use ${successor.name} instead` : ''}.`,
        element: { id: d.id, name: d.name },
      });
    else if (d.lifecycle === 'phase_out' || d.attributes.time === 'eliminate') {
      findings.push({
        level: 'warning',
        rule: 'dependency-phase-out',
        message: `${d.name} is being phased out${successor ? `; build on ${successor.name} instead` : ''}.`,
        element: { id: d.id, name: d.name },
      });
    }
  }

  // Sensitive data
  const dataRefs =
    input.data ?? (service ? index.targets(service.id, 'stores').map((d) => d.id) : []);
  const hosting = input.hosting ?? (service?.attributes.hosting as string | undefined);
  for (const ref of dataRefs) {
    const d = bestMatch(index, ref, ['data_object']) ?? index.get(ref);
    if (!d) continue;
    const sensitive = ['personal', 'sensitive_personal', 'financial', 'secret'].includes(
      d.attributes.sensitivity as string,
    );
    if (
      sensitive &&
      service &&
      ['public', 'internal'].includes(service.classification) &&
      ['confidential', 'restricted'].includes(d.classification)
    ) {
      findings.push({
        level: 'warning',
        rule: 'data-classification',
        message: `${service.name} handles ${d.name} (${enumLabel(d.classification).toLowerCase()}) but is classified ${enumLabel(service.classification).toLowerCase()}.`,
      });
    }
    if (sensitive && hosting && ['public_cloud', 'saas'].includes(hosting)) {
      const residency = standards.find((s) =>
        /personal|privacy|gdpr|eu/i.test(`${s.name} ${s.attributes.rule ?? ''}`),
      );
      if (residency)
        findings.push({
          level: 'info',
          rule: 'data-residency',
          message: `${d.name} is ${enumLabel(d.attributes.sensitivity as string).toLowerCase()} and the service runs on ${enumLabel(hosting).toLowerCase()}: check "${residency.name}".`,
          standard: { id: residency.id, name: residency.name },
        });
    }
  }

  const errors = findings.filter((f) => f.level === 'error').length;
  const warnings = findings.filter((f) => f.level === 'warning').length;
  const result: CheckResult = {
    passed: errors === 0,
    summary:
      errors || warnings
        ? `${errors} problem${errors === 1 ? '' : 's'} and ${warnings} warning${warnings === 1 ? '' : 's'}.`
        : 'No problems found against the standards, radar and end-of-life dates.',
    service: service ? { id: service.id, name: service.name } : null,
    findings: findings.sort(
      (a, b) =>
        ['error', 'warning', 'info'].indexOf(a.level) -
        ['error', 'warning', 'info'].indexOf(b.level),
    ),
  };
  if (ctx.kind === 'token')
    await audit(
      deps.sql,
      ctx,
      'standards.check',
      { type: 'element', id: service?.id },
      { passed: result.passed, errors, warnings },
    );
  return result;
}
