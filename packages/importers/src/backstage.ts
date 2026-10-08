import {
  type ElementType,
  INTERFACE_PROTOCOLS,
  type LifecyclePhase,
  type RelationType,
  TECH_CATEGORIES,
} from '@atrium/schema';
import { parseAllDocuments } from 'yaml';
import { matchEnum, parseLifecycle } from './enum-synonyms';
import { ModelBuilder } from './model';
import type { NormalizedElement, NormalizedModel } from './types';

interface EntityMetadata {
  name?: string;
  namespace?: string;
  title?: string;
  description?: string;
  tags?: unknown;
  annotations?: Record<string, unknown>;
  links?: unknown;
}

interface Entity {
  apiVersion?: string;
  kind?: string;
  metadata?: EntityMetadata;
  spec?: Record<string, unknown>;
}

interface EntityRef {
  kind: string;
  namespace: string;
  name: string;
}

const KIND_TYPES: Record<string, ElementType> = {
  component: 'application',
  api: 'interface',
  resource: 'technology',
  group: 'team',
  domain: 'domain',
  system: 'domain',
};

/** Kinds that carry no architecture elements of their own. */
const QUIET_KINDS = new Set(['location', 'template', 'user']);

const LIFECYCLES: Record<string, LifecyclePhase> = {
  production: 'active',
  experimental: 'build',
  deprecated: 'phase_out',
};

const API_PROTOCOLS: Record<string, string> = {
  openapi: 'rest',
  asyncapi: 'event',
  graphql: 'graphql',
  grpc: 'grpc',
  wsdl: 'soap',
  trpc: 'rest',
};

/** Parses "[kind:][namespace/]name" with Backstage defaults. */
function parseRef(ref: string, defaultKind: string, defaultNamespace = 'default'): EntityRef {
  let rest = ref.trim();
  let kind = defaultKind;
  const colon = rest.indexOf(':');
  if (colon > 0) {
    kind = rest.slice(0, colon);
    rest = rest.slice(colon + 1);
  }
  let namespace = defaultNamespace;
  const slash = rest.indexOf('/');
  if (slash > 0) {
    namespace = rest.slice(0, slash);
    rest = rest.slice(slash + 1);
  }
  return { kind: kind.toLowerCase(), namespace: namespace.toLowerCase(), name: rest };
}

function refString(r: EntityRef): string {
  return `${r.kind}:${r.namespace}/${r.name}`.toLowerCase();
}

function strings(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  return typeof v === 'string' && v.trim() ? [v] : [];
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function firstLink(links: unknown): string | undefined {
  if (!Array.isArray(links)) return undefined;
  for (const l of links) {
    if (l && typeof l === 'object' && typeof (l as { url?: unknown }).url === 'string') {
      return (l as { url: string }).url;
    }
  }
  return undefined;
}

function lifecycleOf(v: unknown): LifecyclePhase | undefined {
  const s = str(v)?.toLowerCase();
  if (!s) return undefined;
  return LIFECYCLES[s] ?? (parseLifecycle(s)?.value as LifecyclePhase | undefined);
}

/**
 * Reads Backstage catalog files (catalog-info.yaml, one or more YAML documents).
 * Components become applications, APIs interfaces, Resources technologies, Groups teams,
 * and Domains domains (Systems become domains only when the file has no Domains).
 */
export function parseBackstage(yamlText: string): NormalizedModel {
  const builder = new ModelBuilder();
  const entities: Array<{ entity: Entity; ref: EntityRef }> = [];

  parseAllDocuments(yamlText).forEach((doc, i) => {
    for (const err of doc.errors.slice(0, 2)) builder.warn(`Document ${i + 1}: ${err.message.split('\n')[0]}`);
    const value = doc.toJS() as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const entity = value as Entity;
    const kind = str(entity.kind)?.toLowerCase();
    const name = str(entity.metadata?.name);
    if (!kind || !name) {
      builder.warn(`Document ${i + 1} has no kind or metadata.name and was skipped`);
      return;
    }
    entities.push({ entity, ref: { kind, namespace: (str(entity.metadata?.namespace) ?? 'default').toLowerCase(), name } });
  });

  const hasDomains = entities.some((e) => e.ref.kind === 'domain');
  const users = new Map<string, string>();
  const systemDomain = new Map<string, string>();
  const ignoredKinds = new Map<string, number>();

  for (const { entity, ref } of entities) {
    if (ref.kind === 'user') {
      const profile = entity.spec?.profile as { displayName?: unknown } | undefined;
      users.set(refString(ref), str(profile?.displayName) ?? ref.name);
    }
    if (ref.kind === 'system') {
      const domain = str(entity.spec?.domain);
      if (domain) systemDomain.set(refString(ref), refString(parseRef(domain, 'domain', ref.namespace)));
    }
  }

  /** Resolves "system:x" or "domain:x" to the element ref of the domain it belongs to. */
  const domainRefFor = (system: string | undefined, domain: string | undefined, ns: string) => {
    if (domain) return refString(parseRef(domain, 'domain', ns));
    if (!system) return undefined;
    const sys = refString(parseRef(system, 'system', ns));
    return hasDomains ? systemDomain.get(sys) : sys;
  };

  const placeholder = (ref: EntityRef): string => {
    const id = refString(ref);
    const type = KIND_TYPES[ref.kind];
    if (type && !builder.has(id)) {
      builder.add({ ref: id, type, name: ref.name, key: ref.name, externalIds: { backstage: id }, placeholder: true });
    }
    return id;
  };

  // Elements.
  for (const { entity, ref } of entities) {
    let type = KIND_TYPES[ref.kind];
    if (ref.kind === 'system' && hasDomains) type = undefined;
    if (!type) {
      if (!QUIET_KINDS.has(ref.kind) && ref.kind !== 'system') ignoredKinds.set(ref.kind, (ignoredKinds.get(ref.kind) ?? 0) + 1);
      continue;
    }
    const meta = entity.metadata ?? {};
    const spec = entity.spec ?? {};
    const id = refString(ref);
    const profile = spec.profile as { displayName?: unknown; email?: unknown } | undefined;
    const el: NormalizedElement = {
      ref: id,
      type,
      name: str(meta.title) ?? (ref.kind === 'group' ? str(profile?.displayName) : undefined) ?? ref.name,
      key: ref.name,
      externalIds: { backstage: id },
    };
    const description = str(meta.description);
    if (description) el.description = description;
    const tags = strings(meta.tags);
    if (tags.length) el.tags = tags;
    const github = str(meta.annotations?.['github.com/project-slug']);
    if (github) el.externalIds.github = github;

    const attributes: Record<string, unknown> = {};
    const link = firstLink(meta.links);
    if (type === 'application' || type === 'interface') {
      const lifecycle = lifecycleOf(spec.lifecycle);
      if (lifecycle) el.lifecycle = lifecycle;
    }
    if (type === 'application' && link) attributes.url = link;
    if (type === 'interface') {
      const apiType = str(spec.type)?.toLowerCase();
      if (apiType) {
        attributes.protocol =
          API_PROTOCOLS[apiType] ?? matchEnum(apiType, INTERFACE_PROTOCOLS, 'protocol')?.value ?? 'other';
      }
      if (link) attributes.docs = link;
    }
    if (type === 'technology') {
      const resourceType = str(spec.type);
      const category = resourceType ? matchEnum(resourceType, TECH_CATEGORIES, 'tech_category') : undefined;
      if (category) attributes.category = category.value;
    }
    if (type === 'team') {
      const email = str(profile?.email);
      if (email) attributes.contact = email;
    }
    if (Object.keys(attributes).length) el.attributes = attributes;
    if (type !== 'domain') {
      const domainRef = domainRefFor(str(spec.system), str(spec.domain), ref.namespace);
      if (domainRef) el.domainRef = domainRef;
    }
    builder.add(el);
  }

  // Relations.
  for (const { entity, ref } of entities) {
    const id = refString(ref);
    const el = builder.get(id);
    if (!el || el.placeholder) continue;
    const spec = entity.spec ?? {};

    const owner = str(spec.owner);
    if (owner && el.type !== 'team') {
      const ownerRef = parseRef(owner, 'group', ref.namespace);
      if (ownerRef.kind === 'user') el.owner = users.get(refString(ownerRef)) ?? ownerRef.name;
      else builder.relate('owned_by', id, placeholder(ownerRef));
    }

    for (const dep of strings(spec.dependsOn)) {
      const target = parseRef(dep, 'component', ref.namespace);
      const relation: RelationType =
        target.kind === 'resource' && el.type === 'application' ? 'uses' : 'depends_on';
      builder.relate(relation, id, placeholder(target));
    }
    for (const api of strings(spec.providesApis)) builder.relate('exposes', id, placeholder(parseRef(api, 'api', ref.namespace)));
    for (const api of strings(spec.consumesApis)) builder.relate('consumes', id, placeholder(parseRef(api, 'api', ref.namespace)));
  }

  // Domains referenced by components but not defined in the file.
  for (const el of builder.list()) {
    if (el.domainRef && !builder.has(el.domainRef)) placeholder(parseRef(el.domainRef, 'domain'));
  }

  if (ignoredKinds.size) {
    const kinds = [...ignoredKinds].map(([k, n]) => `${k} (${n})`).join(', ');
    builder.warn(`Skipped Backstage kinds Atrium does not import: ${kinds}`);
  }
  return builder.build();
}
