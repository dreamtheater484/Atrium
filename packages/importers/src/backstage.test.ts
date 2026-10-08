import { describe, expect, it } from 'vitest';
import { parseAtriumYaml } from './atrium-yaml';
import { parseBackstage } from './backstage';
import { parseFile } from './parse-file';

const CATALOG = `apiVersion: backstage.io/v1alpha1
kind: Domain
metadata:
  name: commerce
  title: Commerce
spec:
  owner: group:commerce-leads
---
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: webshop
spec:
  owner: team-shop
  domain: commerce
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: shop-frontend
  title: Shop Frontend
  description: The public web shop
  tags: [web, react]
  annotations:
    github.com/project-slug: acme/shop-frontend
  links:
    - url: https://shop.acme.com
      title: Website
spec:
  type: website
  lifecycle: production
  owner: team-shop
  system: webshop
  dependsOn:
    - component:orders-service
    - resource:shop-db
  consumesApis:
    - orders-api
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: orders-service
spec:
  type: service
  lifecycle: experimental
  owner: user:jdoe
  system: webshop
  providesApis: [orders-api]
  dependsOn: [component:payments]
---
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: orders-api
  description: Order placement
spec:
  type: openapi
  lifecycle: deprecated
  owner: team-shop
  system: webshop
  definition: |
    openapi: 3.0.0
---
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: shop-db
spec:
  type: database
  owner: group:default/platform
  system: webshop
---
apiVersion: backstage.io/v1alpha1
kind: Group
metadata:
  name: team-shop
spec:
  type: team
  profile:
    displayName: Shop Team
    email: shop@acme.com
  children: []
---
apiVersion: backstage.io/v1alpha1
kind: User
metadata:
  name: jdoe
spec:
  profile:
    displayName: Jane Doe
  memberOf: [team-shop]
---
apiVersion: backstage.io/v1alpha1
kind: Location
metadata:
  name: root
spec:
  targets: [./other.yaml]
`;

describe('parseBackstage', () => {
  const model = parseBackstage(CATALOG);
  const byRef = Object.fromEntries(model.elements.map((e) => [e.ref, e]));

  it('maps kinds to element types, with placeholders for referenced entities', () => {
    expect(model.elements.map((e) => [e.ref, e.type, e.name, e.placeholder ?? false])).toEqual([
      ['domain:default/commerce', 'domain', 'Commerce', false],
      ['component:default/shop-frontend', 'application', 'Shop Frontend', false],
      ['component:default/orders-service', 'application', 'orders-service', false],
      ['api:default/orders-api', 'interface', 'orders-api', false],
      ['resource:default/shop-db', 'technology', 'shop-db', false],
      ['group:default/team-shop', 'team', 'Shop Team', false],
      ['group:default/commerce-leads', 'team', 'commerce-leads', true],
      ['component:default/payments', 'application', 'payments', true],
      ['group:default/platform', 'team', 'platform', true],
    ]);
    expect(model.warnings).toEqual([]);
  });

  it('reads metadata, lifecycle, API type and system domains', () => {
    expect(byRef['component:default/shop-frontend']).toEqual({
      ref: 'component:default/shop-frontend',
      type: 'application',
      name: 'Shop Frontend',
      key: 'shop-frontend',
      description: 'The public web shop',
      tags: ['web', 'react'],
      lifecycle: 'active',
      attributes: { url: 'https://shop.acme.com' },
      domainRef: 'domain:default/commerce',
      externalIds: { backstage: 'component:default/shop-frontend', github: 'acme/shop-frontend' },
    });
    expect(byRef['component:default/orders-service']).toMatchObject({
      lifecycle: 'build',
      owner: 'Jane Doe',
    });
    expect(byRef['api:default/orders-api']).toMatchObject({
      lifecycle: 'phase_out',
      attributes: { protocol: 'rest' },
      domainRef: 'domain:default/commerce',
    });
    expect(byRef['resource:default/shop-db']!.attributes).toEqual({ category: 'database' });
    expect(byRef['group:default/team-shop']!.attributes).toEqual({ contact: 'shop@acme.com' });
  });

  it('turns owners, dependencies and APIs into relations', () => {
    expect(model.relations).toEqual([
      { type: 'owned_by', from: 'domain:default/commerce', to: 'group:default/commerce-leads' },
      { type: 'owned_by', from: 'component:default/shop-frontend', to: 'group:default/team-shop' },
      {
        type: 'depends_on',
        from: 'component:default/shop-frontend',
        to: 'component:default/orders-service',
      },
      { type: 'uses', from: 'component:default/shop-frontend', to: 'resource:default/shop-db' },
      { type: 'consumes', from: 'component:default/shop-frontend', to: 'api:default/orders-api' },
      {
        type: 'depends_on',
        from: 'component:default/orders-service',
        to: 'component:default/payments',
      },
      { type: 'exposes', from: 'component:default/orders-service', to: 'api:default/orders-api' },
      { type: 'owned_by', from: 'api:default/orders-api', to: 'group:default/team-shop' },
      { type: 'owned_by', from: 'resource:default/shop-db', to: 'group:default/platform' },
    ]);
  });

  it('uses Systems as domains when the file has no Domains, and drops invalid relations', () => {
    const m = parseBackstage(`apiVersion: backstage.io/v1alpha1
kind: System
metadata: { name: payments, description: Payment handling }
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata: { name: psp-gateway }
spec: { type: service, lifecycle: production, owner: payments-team, system: payments }
---
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata: { name: queue }
spec: { type: kafka-topic, providesApis: [events] }
---
apiVersion: backstage.io/v1alpha1
kind: API
metadata: { name: events }
spec: { type: asyncapi, lifecycle: production }
`);
    const refs = Object.fromEntries(m.elements.map((e) => [e.ref, e]));
    expect(refs['system:default/payments']).toMatchObject({ type: 'domain', name: 'payments' });
    expect(refs['component:default/psp-gateway']!.domainRef).toBe('system:default/payments');
    expect(refs['resource:default/queue']!.attributes).toEqual({ category: 'middleware' });
    expect(refs['api:default/events']!.attributes).toEqual({ protocol: 'event' });
    expect(m.relations).toEqual([
      {
        type: 'owned_by',
        from: 'component:default/psp-gateway',
        to: 'group:default/payments-team',
      },
    ]);
    expect(m.warnings).toEqual([
      'Skipped 1 relation "provides" from technology to interface: Atrium does not allow that combination',
    ]);
  });

  it('is picked up by parseFile', async () => {
    const parsed = await parseFile('catalog-info.yaml', new TextEncoder().encode(CATALOG));
    expect(parsed.format).toBe('backstage');
    expect(parsed.model?.relations).toHaveLength(9);
  });
});

describe('parseAtriumYaml', () => {
  it('reads a service with its dependencies, APIs, data and technologies', async () => {
    const yaml = `apiVersion: atrium/v1
kind: Service
metadata:
  key: billing
  name: Billing Service
  team: Payments
  domain: Finance
  lifecycle: active
  links:
    repo: https://github.com/acme/billing
spec:
  dependsOn: [ledger]
  provides:
    - key: billing-api
      name: Billing API
      protocol: rest
  consumes: [customer-api]
  data: [Invoice]
  technologies:
    - name: PostgreSQL
      version: "16"
  capabilities: [Invoicing]
`;
    const parsed = await parseFile('atrium.yaml', new TextEncoder().encode(yaml));
    expect(parsed.format).toBe('atrium-yaml');
    const m = parsed.model!;
    expect(m.warnings).toEqual([]);
    const service = m.elements.find((e) => e.key === 'billing' && e.type === 'application');
    expect(service).toMatchObject({
      name: 'Billing Service',
      lifecycle: 'active',
      domainRef: 'domain:finance',
      attributes: { url: 'https://github.com/acme/billing' },
    });
    expect(m.relations.map((r) => [r.type, r.to])).toEqual([
      ['owned_by', 'team:payments'],
      ['depends_on', 'application:key:ledger'],
      ['exposes', 'interface:key:billing-api'],
      ['consumes', 'interface:key:customer-api'],
      ['stores', 'data_object:invoice'],
      ['uses', 'technology:postgresql'],
      ['supports', 'capability:invoicing'],
    ]);
    expect(m.elements.find((e) => e.ref === 'technology:postgresql')?.attributes).toEqual({
      version: '16',
    });
  });

  it('explains invalid files', () => {
    const m = parseAtriumYaml('apiVersion: atrium/v1\nmetadata:\n  name: X\n');
    expect(m.elements).toEqual([]);
    expect(m.warnings[0]).toMatch(/not a valid atrium.yaml \(metadata.key/);
  });
});
