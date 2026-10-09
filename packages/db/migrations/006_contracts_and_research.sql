-- Contracts (licences, subscriptions, support agreements) are their own element type, so a
-- lump-sum contract can be shared out over the applications it covers.
alter table elements drop constraint elements_type_check;
alter table elements add constraint elements_type_check check (type in (
  'domain', 'team', 'capability', 'business_process', 'application', 'interface',
  'data_object', 'technology', 'contract', 'initiative', 'principle', 'standard', 'decision'));

-- End-of-support research arrives as its own kind of suggestion.
alter table changesets drop constraint changesets_kind_check;
alter table changesets add constraint changesets_kind_check check (kind in (
  'direct', 'suggestion', 'scenario', 'import', 'sync', 'pack', 'undo', 'research'));

-- When each element's support dates were last researched, so the same product isn't looked
-- up again (and paid for) too soon. Visible to whoever can see the element.
create table lifecycle_checks (
  element_id uuid primary key references elements(id) on delete cascade,
  checked_at timestamptz not null default now(),
  outcome text not null check (outcome in ('found', 'not_found', 'skipped', 'failed')),
  source text,
  detail jsonb not null default '{}'
);
alter table lifecycle_checks enable row level security;
create policy lifecycle_checks_scope on lifecycle_checks
  using (exists (select 1 from elements e where e.id = element_id));
