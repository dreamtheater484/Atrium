# atrium.yaml

A small file in a service's repository that says how the service fits into the architecture.
`atrium init` writes a first version from what is already in the repository; CI keeps Atrium in
step with `atrium sync`.

```yaml
apiVersion: atrium/v1
kind: Service
metadata:
  key: loyalty-points            # stable id: lower case, digits, dashes
  name: Loyalty Points
  description: Points, tiers and rewards for MyAcme customers.
  team: Commerce Squad           # the owning team (an element in Atrium)
  owner: Elena Rossi             # the accountable person
  domain: Customer
  lifecycle: active              # plan | build | active | phase_out | retired
  classification: confidential   # public | internal | confidential | restricted
  tags: [loyalty, b2c]
  links:
    repository: https://github.com/acme/loyalty-points
    runbook: https://wiki.acme.example/loyalty/runbook
spec:
  dependsOn: [order-hub, customer-360]     # other services, by key or name
  provides:
    - key: loyalty-api
      name: Loyalty API
      protocol: rest                       # rest | graphql | grpc | soap | event | file | database | other
      docs: https://developer.acme.example/loyalty
  consumes: [customer-management-api]     # interfaces of other services
  data: [Customer, Loyalty Account]        # data objects it stores or manages
  technologies:
    - name: Node.js
      version: "22"
    - name: PostgreSQL
      version: "16"
  capabilities: [Loyalty & Retention]      # business capabilities it supports
```

## How it is used

- **`atrium check`** compares it with standards, the technology radar and end-of-life dates. Give
  versions: without one, Atrium can't check end of life or the radar ring and says so.
- **`atrium sync`** adds and updates the service, its links, interfaces and technologies in the
  model. It never deletes anything. If the token's team owns the service, changes apply directly;
  otherwise they become a suggestion for an architect.
- References are matched by id, key, exact name and then the closest name; a technology with a
  different version is treated as a different technology. Names that don't exist yet (a
  technology, a data object) are created.
- The Atrium import wizard also reads `atrium.yaml` files, for example to load many repositories
  at once.
