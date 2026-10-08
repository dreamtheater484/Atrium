import { type ElementType, atriumYamlSchema, normalizeName } from '@atrium/schema';
import { parseAllDocuments } from 'yaml';
import { ModelBuilder } from './model';
import type { NormalizedElement, NormalizedModel } from './types';

/**
 * Reads atrium.yaml service descriptions (one or more YAML documents). The service becomes
 * an application; everything it names (team, domain, dependencies, APIs, data, technologies,
 * capabilities) becomes a relation, with placeholders for elements described elsewhere.
 */
export function parseAtriumYaml(yamlText: string): NormalizedModel {
  const builder = new ModelBuilder();

  const named = (type: ElementType, name: string, extra: Partial<NormalizedElement> = {}): string => {
    const ref = `${type}:${normalizeName(name)}`;
    if (!builder.has(ref)) builder.add({ ref, type, name, externalIds: {}, placeholder: true, ...extra });
    return ref;
  };
  const byKey = (type: ElementType, key: string): string => {
    const ref = `${type}:key:${key}`;
    if (!builder.has(ref)) {
      builder.add({ ref, type, name: key, key, externalIds: { 'atrium-yaml': key }, placeholder: true });
    }
    return ref;
  };

  parseAllDocuments(yamlText).forEach((doc, i) => {
    const raw = doc.toJS() as unknown;
    if (!raw) return;
    const parsed = atriumYamlSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || 'file'}: ${issue.message}`)
        .join('; ');
      builder.warn(`Document ${i + 1} is not a valid atrium.yaml (${issues})`);
      return;
    }
    const { metadata: m, spec } = parsed.data;
    const service = builder.add({
      ref: `application:key:${m.key}`,
      type: 'application',
      name: m.name,
      key: m.key,
      description: m.description,
      owner: m.owner,
      lifecycle: m.lifecycle,
      classification: m.classification,
      tags: m.tags,
      attributes: m.links ? { url: m.links.repo ?? m.links.docs ?? Object.values(m.links)[0] } : undefined,
      externalIds: { 'atrium-yaml': m.key },
    });
    if (m.domain) service.domainRef = named('domain', m.domain);
    if (m.team) builder.relate('owned_by', service.ref, named('team', m.team));
    for (const dep of spec.dependsOn ?? []) builder.relate('depends_on', service.ref, byKey('application', dep));
    for (const api of spec.provides ?? []) {
      const ref = `interface:key:${api.key}`;
      builder.add({
        ref,
        type: 'interface',
        name: api.name ?? api.key,
        key: api.key,
        description: api.description,
        attributes: {
          ...(api.protocol ? { protocol: api.protocol } : {}),
          ...(api.docs ? { docs: api.docs } : {}),
        },
        externalIds: { 'atrium-yaml': api.key },
      });
      builder.relate('exposes', service.ref, ref);
    }
    for (const api of spec.consumes ?? []) builder.relate('consumes', service.ref, byKey('interface', api));
    for (const data of spec.data ?? []) builder.relate('stores', service.ref, named('data_object', data));
    for (const tech of spec.technologies ?? []) {
      const ref = named('technology', tech.name, tech.version ? { attributes: { version: tech.version } } : {});
      builder.relate('uses', service.ref, ref);
    }
    for (const cap of spec.capabilities ?? []) builder.relate('supports', service.ref, named('capability', cap));
  });

  return builder.build();
}
