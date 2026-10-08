import {
  type AskAnswer,
  addDaysIso,
  ELEMENT_TYPE_LIST,
  type Element,
  type ElementType,
  enumLabel,
  normalizeName,
  todayIso,
  typeDef,
} from '@atrium/schema';
import type { RequestContext } from '../auth/context';
import type { Deps } from './deps';
import { ModelIndex } from './model-index';
import { bestMatch, search } from './search';
import { capabilityCost } from './stats';
import { resolveState } from './store';
import { computeImpact } from './views';

const money = (n: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
    notation: n >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(n);

/** Finds the element a question is about: the longest element name contained in it. */
function findEntity(
  index: ModelIndex,
  question: string,
  types?: ElementType[],
): Element | undefined {
  const q = ` ${normalizeName(question)} `;
  let best: Element | undefined;
  for (const e of index.model.elements.values()) {
    if (types && !types.includes(e.type)) continue;
    const n = normalizeName(e.name);
    if (n.length < 3) continue;
    if (q.includes(` ${n} `) || (e.key && q.includes(` ${e.key.replace(/-/g, ' ')} `))) {
      if (
        !best ||
        n.length > normalizeName(best.name).length ||
        (best.layer === 'reference' && e.layer === 'org')
      )
        best = e;
    }
  }
  if (best) return best;
  // Fall back to the phrase after the keyword ("depends on billing")
  const tail =
    question
      .replace(/\?$/, '')
      .split(/\b(?:on|of|for|about|by|retire|remove|replace|uses?|supports?)\b/i)
      .pop() ?? '';
  return bestMatch(index, tail.trim(), types);
}

function typeFromQuestion(q: string): ElementType | undefined {
  const n = normalizeName(q);
  for (const def of ELEMENT_TYPE_LIST) {
    for (const w of [def.plural, def.label, ...def.aliases]) {
      if (new RegExp(`\\b${normalizeName(w)}\\b`).test(n)) return def.type;
    }
  }
  return undefined;
}

const has = (q: string, ...words: string[]) =>
  words.some((w) => new RegExp(`\\b${w}`, 'i').test(q));

/**
 * Answers common architecture questions with rules over the model. The answer says how it
 * was understood, so people can trust (and correct) it. A live AI provider can extend this.
 */
export async function ask(
  deps: Deps,
  ctx: RequestContext,
  question: string,
  scenarioId?: string,
): Promise<AskAnswer> {
  const state = await resolveState(deps.store, deps.sql, ctx, { scenarioId });
  const index = new ModelIndex(state);
  const q = question.trim();
  const today = todayIso();
  const org = [...state.elements.values()].filter((e) => e.layer === 'org');
  const reply = (
    interpretation: string,
    answer: string,
    elements: Element[],
    link?: AskAnswer['link'],
  ): AskAnswer => ({
    interpretation,
    answer,
    elements: elements.slice(0, 50).map((e) => index.summary(e)),
    link,
    engine: 'rules',
  });

  // End of life
  if (
    has(
      q,
      'end of life',
      'eol',
      'end-of-life',
      'unsupported',
      'out of support',
      'outdated',
      'expir',
    )
  ) {
    const horizon = addDaysIso(today, 365);
    const techs = org
      .filter(
        (t) =>
          t.type === 'technology' &&
          typeof t.attributes.eol_date === 'string' &&
          (t.attributes.eol_date as string) <= horizon,
      )
      .sort((a, b) => String(a.attributes.eol_date).localeCompare(String(b.attributes.eol_date)));
    const past = techs.filter((t) => (t.attributes.eol_date as string) < today);
    const apps = [...new Set(techs.flatMap((t) => index.sources(t.id, 'uses')))].filter(
      (a) => a.type === 'application',
    );
    return reply(
      'Technologies past or near end of life (within 12 months)',
      techs.length
        ? `${past.length} technolog${past.length === 1 ? 'y is' : 'ies are'} already past end of life and ${techs.length - past.length} reach it within a year. Together they're used by ${apps.length} application${apps.length === 1 ? '' : 's'}.`
        : 'No technologies reach end of life in the next 12 months.',
      [...techs, ...apps],
      { label: 'Open the technology radar', to: '/explore?type=technology&view=radar' },
    );
  }

  // Who owns
  if (has(q, 'who owns', 'owner', 'responsible', 'accountable')) {
    const e = findEntity(index, q);
    if (e) {
      const teams = index.targets(e.id, 'owned_by');
      return reply(
        `Owner of ${e.name}`,
        e.owner || teams.length
          ? `${e.name} is owned by ${e.owner ?? 'nobody named'}${teams.length ? ` and run by ${teams.map((t) => t.name).join(', ')}` : ''}.`
          : `${e.name} has no owner yet. You can add one in its details.`,
        [e, ...teams],
      );
    }
    const orphans = org.filter(
      (x) => ['application', 'capability', 'interface', 'technology'].includes(x.type) && !x.owner,
    );
    return reply(
      'Elements without an owner',
      `${orphans.length} elements have no owner.`,
      orphans,
      { label: 'Fill the gaps', to: '/explore?gaps=true' },
    );
  }

  // Impact / dependencies
  if (
    has(
      q,
      'depend',
      'break',
      'affect',
      'impact',
      'retire',
      'remove',
      'decommission',
      'shut',
      'need',
      'rely',
      'relies',
      'used by',
      'happens if',
    )
  ) {
    const e = findEntity(index, q);
    if (e) {
      const result = computeImpact(index, e.id);
      return reply(
        `Impact of changing or retiring ${e.name}`,
        result.summary,
        result.nodes.map((n) => index.get(n.element.id)!),
        {
          label: 'Show the impact graph',
          to: `/explore?view=graph&focus=${e.id}&type=${e.type}&mode=impact`,
        },
      );
    }
  }

  // Technology usage
  if (has(q, 'runs? on', 'built on', 'using', 'use ', 'uses ')) {
    const tech = findEntity(index, q, ['technology']);
    if (tech) {
      const apps = index.sources(tech.id, 'uses');
      return reply(
        `Applications running on ${tech.name}`,
        `${apps.length} application${apps.length === 1 ? ' runs' : 's run'} on ${tech.name}.`,
        apps,
      );
    }
  }

  // Capability support
  if (has(q, 'support', 'enable', 'deliver', 'capabilit')) {
    const e = findEntity(index, q, ['capability', 'application', 'business_process']);
    if (e?.type === 'capability' || e?.type === 'business_process') {
      const ids = [e.id, ...index.descendants(e.id)];
      const apps = [...new Set(ids.flatMap((id) => index.sources(id, 'supports')))];
      return reply(
        `Applications supporting ${e.name}`,
        apps.length
          ? `${apps.length} application${apps.length === 1 ? ' supports' : 's support'} ${e.name}${apps.length >= 3 ? ', which may be overlap worth reviewing' : ''}.`
          : `No application supports ${e.name} yet: a possible gap.`,
        apps,
        { label: 'Open the capability map', to: '/explore?type=capability&view=map' },
      );
    }
    if (e?.type === 'application') {
      const caps = index.targets(e.id, 'supports');
      return reply(
        `Capabilities supported by ${e.name}`,
        `${e.name} supports ${caps.length} capabilit${caps.length === 1 ? 'y' : 'ies'}.`,
        caps,
      );
    }
  }

  // Cost
  if (has(q, 'cost', 'spend', 'expensive', 'budget', 'money')) {
    const e = findEntity(index, q, ['capability', 'domain', 'application']);
    if (e?.type === 'capability') {
      return reply(
        `Cost of ${e.name}`,
        `Applications supporting ${e.name} cost about ${money(capabilityCost(index, e.id))} a year (shared applications are split evenly).`,
        index.sources(e.id, 'supports'),
      );
    }
    if (e?.type === 'domain') {
      const apps = org.filter((a) => a.type === 'application' && a.domainId === e.id);
      const total = apps.reduce((s, a) => s + Number(a.attributes.annual_cost ?? 0), 0);
      return reply(
        `Cost of the ${e.name} domain`,
        `${apps.length} applications in ${e.name} cost ${money(total)} a year.`,
        apps.sort(
          (a, b) => Number(b.attributes.annual_cost ?? 0) - Number(a.attributes.annual_cost ?? 0),
        ),
      );
    }
    const apps = org
      .filter((a) => a.type === 'application' && a.lifecycle !== 'retired')
      .sort(
        (a, b) => Number(b.attributes.annual_cost ?? 0) - Number(a.attributes.annual_cost ?? 0),
      );
    const total = apps.reduce((s, a) => s + Number(a.attributes.annual_cost ?? 0), 0);
    return reply(
      'The most expensive applications',
      `The application portfolio costs ${money(total)} a year. These are the most expensive.`,
      apps.slice(0, 10),
      { label: 'Open the cost dashboard', to: '/dashboards' },
    );
  }

  // Risk / health
  if (has(q, 'risk', 'health', 'unhealthy', 'problem', 'attention', 'worry', 'weak')) {
    const risky = org
      .filter((a) => a.type === 'application' && (a.health === 'act' || a.health === 'watch'))
      .sort((a, b) => (a.health === 'act' ? -1 : 1) - (b.health === 'act' ? -1 : 1));
    const act = risky.filter((a) => a.health === 'act').length;
    return reply(
      'Applications that need attention',
      `${act} application${act === 1 ? ' needs' : 's need'} action and ${risky.length - act} should be watched.`,
      risky,
      { label: 'Open portfolio health', to: '/dashboards' },
    );
  }

  // Gaps
  if (has(q, 'missing', 'incomplete', 'gap', 'without', 'empty', 'quality')) {
    const gaps = org
      .filter(
        (e) =>
          e.quality < 100 &&
          ['application', 'capability', 'interface', 'technology', 'data_object'].includes(e.type),
      )
      .sort((a, b) => a.quality - b.quality);
    return reply(
      'Elements with missing information',
      `${gaps.length} elements are missing information. Start with the ones at the top.`,
      gaps,
      { label: 'Fill the gaps', to: '/explore?gaps=true' },
    );
  }

  // Standards for something
  if (has(q, 'standard', 'rule', 'guideline', 'principle', 'allowed', 'comply', 'complian')) {
    const e = findEntity(index, q, ['application', 'technology', 'interface']);
    const standards = org.filter((s) => s.type === 'standard');
    if (e) {
      const direct = index.targets(e.id, 'governed_by');
      return reply(
        `Standards that apply to ${e.name}`,
        `${direct.length} standard${direct.length === 1 ? ' is' : 's are'} linked to ${e.name} directly. All ${standards.length} standards are listed below for reference.`,
        [...direct, ...standards.filter((s) => !direct.includes(s))],
      );
    }
    return reply('Architecture standards', `There are ${standards.length} standards.`, standards, {
      label: 'Open standards',
      to: '/explore?type=standard',
    });
  }

  // Counts and lists
  const t = typeFromQuestion(q);
  if (t && has(q, 'how many', 'count', 'number of')) {
    const items = org.filter((e) => e.type === t);
    return reply(
      `Number of ${typeDef(t).plural.toLowerCase()}`,
      `There are ${items.length} ${items.length === 1 ? typeDef(t).label.toLowerCase() : typeDef(t).plural.toLowerCase()}.`,
      items,
      { label: `Open ${typeDef(t).plural.toLowerCase()}`, to: `/explore?type=${t}` },
    );
  }
  if (t && has(q, 'list', 'show', 'all', 'which', 'what')) {
    const lifecycle = ['plan', 'build', 'active', 'phase_out', 'retired'].find((p) =>
      has(q, enumLabel(p).toLowerCase()),
    );
    const items = org.filter((e) => e.type === t && (!lifecycle || e.lifecycle === lifecycle));
    return reply(
      `${typeDef(t).plural}${lifecycle ? ` in ${enumLabel(lifecycle).toLowerCase()}` : ''}`,
      `${items.length} found.`,
      items,
      { label: `Open ${typeDef(t).plural.toLowerCase()}`, to: `/explore?type=${t}` },
    );
  }

  // Default: search
  const hits = await search(deps, ctx, q, { limit: 15, scenarioId });
  return {
    interpretation: 'Searched the model',
    answer: hits.length
      ? `Here's what matches “${q}”. Try asking about impact, owners, cost, risks or end of life.`
      : `Nothing matches “${q}”. Try asking about impact, owners, cost, risks or end of life.`,
    elements: hits.map((h) => ({
      id: h.id,
      type: h.type,
      name: h.name,
      key: h.key,
      layer: h.layer,
      health: null,
      lifecycle: null,
    })),
    engine: 'rules',
  };
}
