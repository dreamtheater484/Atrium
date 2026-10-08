import {
  type AtriumYaml,
  atriumYamlSchema,
  ELEMENT_TYPES,
  type ElementType,
  RELATION_TYPES,
  type RelationType,
} from '@atrium/schema';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { RequestContext } from '../auth/context';
import { badRequest, forbidden } from '../http/errors';
import { audit } from './audit';
import { ChangeBuilder } from './builder';
import type { Deps } from './deps';
import { inferVersion } from './eol';
import { canEditDirectly, canSuggest } from './policy';
import { resolveState } from './store';

export interface SyncResult {
  service: { id: string; name: string; created: boolean };
  changes: number;
  applied: boolean;
  changesetId: string | null;
  url: string | null;
  warnings: string[];
  summary: string;
}

/**
 * Brings a service described in atrium.yaml into the model. Applied directly when the token
 * belongs to someone on the owning team; otherwise sent for review. Never deletes anything:
 * links in Atrium that are missing from the file are reported, not removed.
 */
export async function syncAtriumYaml(
  deps: Deps,
  ctx: RequestContext,
  raw: string | object,
  opts: { dryRun?: boolean; source?: string } = {},
): Promise<SyncResult> {
  let doc: AtriumYaml;
  try {
    doc = atriumYamlSchema.parse(typeof raw === 'string' ? parseYaml(raw) : raw);
  } catch (e) {
    const msg =
      e instanceof z.ZodError
        ? e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : (e as Error).message;
    throw badRequest(`atrium.yaml is not valid: ${msg}`);
  }
  if (!canSuggest(ctx) && ctx.kind === 'token')
    throw forbidden('This token is read-only. Create a CI token that can propose changes.');
  const state = await resolveState(deps.store, deps.sql, ctx, { includeDrafts: false });
  const b = new ChangeBuilder(deps, ctx, state);
  const m = doc.metadata;
  const spec = doc.spec ?? {};
  const warnings: string[] = [];

  const domain = m.domain ? b.find(['domain'], m.domain) : undefined;
  if (m.domain && !domain) warnings.push(`Domain "${m.domain}" was not found; left unchanged.`);
  const team = m.team ? b.find(['team'], m.team) : undefined;
  if (m.team && !team)
    warnings.push(
      `Team "${m.team}" was not found. Ask an architect to add it, or check the spelling.`,
    );

  let service = b.index.byKey('application', m.key) ?? b.find(['application'], m.name);
  const created = !service;
  const fields = {
    name: m.name,
    description: m.description,
    owner: m.owner,
    domainId: domain?.id,
    lifecycle: m.lifecycle,
    classification: m.classification,
    tags: m.tags,
    attributes:
      m.links?.repository || m.links?.docs
        ? { url: m.links.docs ?? m.links.repository }
        : undefined,
  };
  if (!service) {
    service = await b.create(
      {
        type: 'application',
        key: m.key,
        ...fields,
        description: m.description ?? '',
        source: opts.source ?? 'atrium.yaml',
      },
      { externalIds: { repository: opts.source ?? m.key } },
    );
  } else {
    const patch = Object.fromEntries(
      Object.entries({ ...fields, key: service.key ? undefined : m.key }).filter(
        ([, v]) => v !== undefined,
      ),
    );
    service = b.update(service.id, patch) ?? service;
  }
  if (team) b.link('owned_by', service.id, team.id);

  for (const dep of spec.dependsOn ?? []) {
    const target = b.find(['application', 'technology', 'interface'], dep);
    if (target) b.link('depends_on', service.id, target.id);
    else warnings.push(`Dependency "${dep}" is not in the model yet.`);
  }
  for (const p of spec.provides ?? []) {
    let api = b.index.byKey('interface', p.key) ?? b.find(['interface'], p.name ?? p.key);
    const attrs = Object.fromEntries(
      Object.entries({ protocol: p.protocol, docs: p.docs }).filter(([, v]) => v),
    );
    if (!api) {
      api = await b.create({
        type: 'interface',
        key: p.key,
        name: p.name ?? p.key,
        description: p.description ?? '',
        domainId: domain?.id,
        lifecycle: m.lifecycle ?? 'active',
        attributes: attrs,
      });
    } else {
      b.update(api.id, { name: p.name, description: p.description, attributes: attrs });
    }
    b.link('exposes', service.id, api.id);
    if (team) b.link('owned_by', api.id, team.id);
  }
  for (const c of spec.consumes ?? []) {
    const api = b.find(['interface'], c);
    if (api) b.link('consumes', service.id, api.id);
    else warnings.push(`Interface "${c}" is not in the model yet.`);
  }
  for (const d of spec.data ?? []) {
    const obj = b.find(['data_object'], d);
    if (obj) b.link('stores', service.id, obj.id);
    else warnings.push(`Data object "${d}" is not in the model yet.`);
  }
  for (const t of spec.technologies ?? []) {
    const name = t.version && !t.name.includes(t.version) ? `${t.name} ${t.version}` : t.name;
    let tech = b.find(['technology'], name);
    if (
      tech &&
      t.version &&
      tech.attributes.version &&
      String(tech.attributes.version) !== t.version &&
      !String(tech.attributes.version).startsWith(`${t.version}.`)
    )
      tech = undefined;
    if (!tech)
      tech = await b.create({
        type: 'technology',
        name,
        attributes: { version: t.version ?? inferVersion(name) ?? undefined },
      });
    b.link('uses', service.id, tech.id);
  }
  for (const c of spec.capabilities ?? []) {
    const cap = b.find(['capability'], c);
    if (cap) b.link('supports', service.id, cap.id);
    else warnings.push(`Capability "${c}" was not found.`);
  }
  warnings.push(...b.warnings);

  // Report links that exist in Atrium but are missing from the file.
  if (!created) {
    const listed = new Set([...(spec.dependsOn ?? [])].map((s) => s.toLowerCase()));
    for (const d of b.index.targets(service.id, 'depends_on')) {
      if (
        spec.dependsOn &&
        !listed.has((d.key ?? '').toLowerCase()) &&
        !listed.has(d.name.toLowerCase())
      ) {
        warnings.push(
          `Atrium says ${m.name} depends on ${d.name}, but atrium.yaml doesn't list it. Remove it in Atrium if it's gone.`,
        );
      }
    }
  }

  const direct =
    ctx.kind === 'user'
      ? canEditDirectly(ctx, service, b.index)
      : !!ctx.token?.userId &&
        b.index.targets(service.id, 'owned_by').some((t) => ctx.teamIds.includes(t.id));
  const count = b.changes.length;
  if (opts.dryRun || count === 0) {
    return {
      service: { id: service.id, name: service.name, created },
      changes: count,
      applied: false,
      changesetId: null,
      url: null,
      warnings,
      summary:
        count === 0
          ? `${m.name} is already up to date.`
          : `${count} change${count === 1 ? '' : 's'} would be made (dry run).`,
    };
  }
  const res = await b.commit({
    kind: 'sync',
    mode: direct ? 'direct' : 'suggestion',
    title: `${created ? 'Add' : 'Update'} ${m.name} from atrium.yaml`,
    description: `Synced from ${opts.source ?? 'atrium.yaml'}${warnings.length ? `\n\nNotes:\n- ${warnings.join('\n- ')}` : ''}`,
  });
  await audit(
    deps.sql,
    ctx,
    'sync.atrium_yaml',
    { type: 'element', id: service.id },
    { changes: count, applied: res.applied, source: opts.source },
  );
  return {
    service: { id: service.id, name: service.name, created },
    changes: count,
    applied: res.applied,
    changesetId: res.changesetId,
    url: res.changesetId ? `${deps.config.publicUrl}/changes?id=${res.changesetId}` : null,
    warnings,
    summary: res.applied
      ? `Applied ${count} change${count === 1 ? '' : 's'} to ${m.name}.`
      : `Sent ${count} change${count === 1 ? '' : 's'} to ${m.name} for review.`,
  };
}

/* ------------------------------------------------------------------ */
/* Proposals from agents (propose_change)                              */
/* ------------------------------------------------------------------ */

export const proposalSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).default(''),
  changes: z
    .array(
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('create'),
          type: z.enum(ELEMENT_TYPES),
          name: z.string().min(1).max(200),
          key: z.string().max(120).optional(),
          description: z.string().max(5000).optional(),
          domain: z.string().optional(),
          parent: z.string().optional(),
          owner: z.string().optional(),
          lifecycle: z.enum(['plan', 'build', 'active', 'phase_out', 'retired']).optional(),
          attributes: z.record(z.string(), z.unknown()).optional(),
        }),
        z.object({
          action: z.literal('update'),
          element: z.string().describe('Id, key or exact name of the element'),
          name: z.string().max(200).optional(),
          description: z.string().max(5000).optional(),
          owner: z.string().optional(),
          lifecycle: z.enum(['plan', 'build', 'active', 'phase_out', 'retired']).optional(),
          attributes: z.record(z.string(), z.unknown()).optional(),
        }),
        z.object({
          action: z.literal('link'),
          relation: z.enum(RELATION_TYPES),
          from: z.string(),
          to: z.string(),
        }),
        z.object({
          action: z.literal('unlink'),
          relation: z.enum(RELATION_TYPES),
          from: z.string(),
          to: z.string(),
        }),
      ]),
    )
    .min(1)
    .max(50),
});
export type Proposal = z.infer<typeof proposalSchema>;

const ALL_TYPES = [...ELEMENT_TYPES] as ElementType[];

/** Agents (and people via the API) propose a set of changes. Always reviewed by a person. */
export async function propose(deps: Deps, ctx: RequestContext, p: Proposal) {
  if (!canSuggest(ctx))
    throw forbidden('This token can only read. Create a token that can propose changes.');
  const state = await resolveState(deps.store, deps.sql, ctx, { includeDrafts: false });
  const b = new ChangeBuilder(deps, ctx, state);
  const problems: string[] = [];
  const created = new Map<string, string>();
  const resolve = (ref: string) => {
    const id = created.get(ref.toLowerCase());
    if (id) return b.get(id);
    return b.find(ALL_TYPES, ref);
  };
  for (const [i, c] of p.changes.entries()) {
    if (c.action === 'create') {
      const domain = c.domain ? b.find(['domain'], c.domain) : undefined;
      const parent = c.parent ? b.find([c.type], c.parent) : undefined;
      const el = await b.create({
        type: c.type,
        name: c.name,
        key: c.key,
        description: c.description,
        domainId: domain?.id,
        parentId: parent?.id,
        owner: c.owner,
        lifecycle: c.lifecycle,
        attributes: c.attributes,
        source: 'agent',
      });
      created.set(c.name.toLowerCase(), el.id);
      if (c.key) created.set(c.key.toLowerCase(), el.id);
    } else if (c.action === 'update') {
      const el = resolve(c.element);
      if (!el) {
        problems.push(`Change ${i + 1}: "${c.element}" was not found.`);
        continue;
      }
      if (el.layer === 'reference') {
        problems.push(
          `Change ${i + 1}: ${el.name} is part of a reference model and can't be changed.`,
        );
        continue;
      }
      const { action: _a, element: _e, ...patch } = c;
      b.update(el.id, patch);
    } else {
      const from = resolve(c.from);
      const to = resolve(c.to);
      if (!from || !to) {
        problems.push(`Change ${i + 1}: ${!from ? `"${c.from}"` : `"${c.to}"`} was not found.`);
        continue;
      }
      if (c.action === 'link') b.link(c.relation, from.id, to.id);
      else {
        const rel = b.index.outgoing(from.id, c.relation).find((r) => r.targetId === to.id);
        if (rel) b.unlink(rel.id);
        else problems.push(`Change ${i + 1}: ${from.name} and ${to.name} were not linked.`);
      }
    }
  }
  problems.push(...b.warnings);
  if (!b.changes.length) {
    return {
      changesetId: null,
      url: null,
      changes: 0,
      problems,
      summary: problems.length
        ? 'Nothing was proposed because of the problems listed.'
        : 'Nothing to change: the model already matches.',
    };
  }
  const res = await b.commit({
    kind: 'suggestion',
    mode: 'suggestion',
    title: p.title,
    description: p.description,
  });
  await audit(
    deps.sql,
    ctx,
    'proposal.create',
    { type: 'changeset', id: res.changesetId },
    { title: p.title, changes: res.count, problems: problems.length },
  );
  return {
    changesetId: res.changesetId,
    url: `${deps.config.publicUrl}/changes?id=${res.changesetId}`,
    changes: res.count,
    problems,
    summary: `Proposed ${res.count} change${res.count === 1 ? '' : 's'} for review by an architect.`,
  };
}

export type { RelationType };
