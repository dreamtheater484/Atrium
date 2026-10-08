import {
  type Element,
  type ElementType,
  enumLabel,
  type FieldSuggestion,
  normalizeName,
  similarity,
} from '@atrium/schema';
import type { ModelIndex } from './model-index';

export interface Match {
  id: string;
  name: string;
  confidence: number;
  reason: string;
}

/**
 * The assistant behind auto-fill suggestions. v1 ships a rule-based provider ("mock") that
 * needs no external service; a live LLM provider can implement the same interface later.
 * Suggestions are never written silently: the UI shows them greyed out until accepted.
 */
export interface AiProvider {
  readonly name: 'mock' | 'off';
  suggestFields(el: Element, index: ModelIndex): Record<string, FieldSuggestion>;
  suggestRelated(el: Element, index: ModelIndex, targetType: ElementType, limit?: number): Match[];
  suggestMappings(el: Element, index: ModelIndex, limit?: number): Match[];
}

const STOP = new Set(
  'a an and the of for to in on with by from or is are be as at it its this that system platform application app service services management manager tool solution suite portal module data'.split(
    ' ',
  ),
);

function stem(w: string): string {
  return w.replace(/(ing|ment|ments|ions|ion|ers|er|es|s)$/, '');
}

export function words(text: string): Set<string> {
  return new Set(
    normalizeName(text)
      .split(' ')
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map(stem),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / Math.min(a.size, b.size);
}

const SAAS_VENDORS = [
  'salesforce',
  'workday',
  'servicenow',
  'microsoft 365',
  'zendesk',
  'hubspot',
  'atlassian',
  'slack',
  'google workspace',
  'successfactors',
  'coupa',
  'docusign',
];

function suggestion(value: unknown, reason: string, confidence: number): FieldSuggestion {
  return { value, reason, source: 'rules', confidence };
}

function majority<T>(items: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export class RuleBasedAssistant implements AiProvider {
  readonly name = 'mock' as const;

  suggestFields(el: Element, index: ModelIndex): Record<string, FieldSuggestion> {
    if (el.layer === 'reference') return {};
    const out: Record<string, FieldSuggestion> = {};
    const caps = index.targets(el.id, 'supports');
    const teams = index.targets(el.id, 'owned_by');
    const parent = index.get(el.parentId);

    if (!el.domainId && el.type !== 'domain' && el.type !== 'team') {
      const fromParent = parent?.domainId;
      const fromCaps = majority(caps.map((c) => c.domainId).filter(Boolean) as string[]);
      const domainId = fromParent ?? fromCaps;
      const domain = index.get(domainId);
      if (domain) {
        out.domainId = suggestion(
          domain.id,
          fromParent
            ? `Same domain as ${parent!.name}`
            : `Most of the capabilities it supports are in ${domain.name}`,
          fromParent ? 0.9 : 0.7,
        );
      }
    }

    if (!el.owner) {
      const team = teams[0];
      const domain = index.get(el.domainId);
      if (team?.owner)
        out.owner = suggestion(team.owner, `Lead of ${team.name}, the owning team`, 0.6);
      else if (domain?.owner)
        out.owner = suggestion(domain.owner, `Owner of the ${domain.name} domain`, 0.4);
    }

    if ((el.description ?? '').trim().length < 15) {
      const desc = this.describe(el, index);
      if (desc) out.description = suggestion(desc, 'Written from what Atrium knows about it', 0.5);
    }

    if (el.type === 'application') {
      const vendor = String(el.attributes.vendor ?? '').toLowerCase();
      if (!el.attributes.hosting && vendor && SAAS_VENDORS.some((v) => vendor.includes(v))) {
        out['attributes.hosting'] = suggestion(
          'saas',
          `${el.attributes.vendor} is usually delivered as SaaS`,
          0.7,
        );
      }
      if (!el.attributes.criticality && caps.some((c) => c.attributes.importance === 'high')) {
        out['attributes.criticality'] = suggestion(
          'high',
          'Supports a capability of high strategic importance',
          0.5,
        );
      }
      if (!el.attributes.time) {
        const tf = Number(el.attributes.technical_fit);
        const bf = Number(el.attributes.business_fit);
        if (tf && bf) {
          const time =
            bf >= 3 ? (tf >= 3 ? 'invest' : 'migrate') : tf >= 3 ? 'tolerate' : 'eliminate';
          out['attributes.time'] = suggestion(
            time,
            `From business fit ${bf}/5 and technical fit ${tf}/5`,
            0.8,
          );
        }
      }
    }
    if (el.type === 'data_object' && el.classification === 'internal') {
      const s = el.attributes.sensitivity as string | undefined;
      if (s && s !== 'none') {
        out.classification = suggestion(
          'confidential',
          `${enumLabel(s)} is usually confidential`,
          0.7,
        );
      }
    }
    return out;
  }

  describe(el: Element, index: ModelIndex): string | null {
    const domain = index.get(el.domainId)?.name;
    const caps = index.targets(el.id, 'supports').map((c) => c.name.toLowerCase());
    const inDomain = domain ? ` in the ${domain} domain` : '';
    switch (el.type) {
      case 'application': {
        const vendor = el.attributes.vendor ? ` from ${el.attributes.vendor}` : '';
        const hosting = el.attributes.hosting
          ? `${enumLabel(el.attributes.hosting as string)} `
          : '';
        const what = caps.length ? ` It supports ${list(caps.slice(0, 3))}.` : '';
        return `${el.name} is a ${hosting.toLowerCase()}application${vendor}${inDomain}.${what}`.replace(
          /\s+/g,
          ' ',
        );
      }
      case 'capability': {
        const parent = index.get(el.parentId)?.name;
        return `The ability to manage ${el.name.toLowerCase()}${parent ? `, part of ${parent}` : ''}${inDomain}.`;
      }
      case 'technology':
        return `${el.name}${el.attributes.category ? `, a ${enumLabel(el.attributes.category as string).toLowerCase()}` : ''} used by ${index.sources(el.id, 'uses').length} application(s).`;
      case 'interface': {
        const provider = index.sources(el.id, 'exposes')[0]?.name;
        return `${el.name}${provider ? `, provided by ${provider}` : ''}.`;
      }
      default:
        return null;
    }
  }

  suggestRelated(el: Element, index: ModelIndex, targetType: ElementType, limit = 3): Match[] {
    const existing = new Set(index.outgoing(el.id).map((r) => r.targetId));
    const mine = words(`${el.name} ${el.description} ${el.tags.join(' ')}`);
    const matches: Match[] = [];
    for (const t of index.ofType(targetType)) {
      if (t.id === el.id || existing.has(t.id)) continue;
      const theirs = words(`${t.name} ${t.description}`);
      const score = Math.max(
        overlap(mine, words(t.name)) * 0.9,
        overlap(mine, theirs) * 0.6,
        similarity(el.name, t.name),
      );
      if (score >= 0.45) {
        matches.push({
          id: t.id,
          name: t.name,
          confidence: Math.min(0.95, score),
          reason: `Name and description match "${t.name}"`,
        });
      }
    }
    return matches.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
  }

  suggestMappings(el: Element, index: ModelIndex, limit = 3): Match[] {
    const mapped = new Set(index.outgoing(el.id, 'maps_to').map((r) => r.targetId));
    const mine = words(`${el.name} ${el.description}`);
    const matches: Match[] = [];
    for (const t of index.ofType(el.type, 'reference')) {
      if (mapped.has(t.id)) continue;
      const score = Math.max(overlap(mine, words(t.name)), similarity(el.name, t.name) * 1.1);
      if (score >= 0.5) {
        matches.push({
          id: t.id,
          name: t.name,
          confidence: Math.min(0.95, score),
          reason: `Closest match in ${t.pack ?? 'the reference model'}`,
        });
      }
    }
    return matches.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
  }
}

export class NoAssistant implements AiProvider {
  readonly name = 'off' as const;
  suggestFields() {
    return {};
  }
  suggestRelated() {
    return [];
  }
  suggestMappings() {
    return [];
  }
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}
