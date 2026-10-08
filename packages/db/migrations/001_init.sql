-- Atrium core schema.
-- Everything lives in Postgres: model, history, users, tokens, audit, jobs.

create extension if not exists pg_trgm;

create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  name text not null,
  role text not null default 'architect'
    check (role in ('admin', 'architect', 'manager', 'engineer', 'viewer')),
  password_hash text,
  oidc_subject text unique,
  team_ids uuid[] not null default '{}',
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  onboarded boolean not null default false,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table sessions (
  id text primary key, -- sha256 of the session token
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text
);
create index sessions_user on sessions(user_id);

create table api_tokens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('agent', 'ci', 'api')),
  token_hash text not null unique,
  prefix text not null,
  user_id uuid references users(id) on delete cascade,
  can_propose boolean not null default false,
  domain_ids uuid[], -- null means every domain
  max_classification text not null default 'internal'
    check (max_classification in ('public', 'internal', 'confidential', 'restricted')),
  client text,
  rate_limit_per_minute int not null default 120,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table elements (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'domain', 'team', 'capability', 'business_process', 'application', 'interface',
    'data_object', 'technology', 'initiative', 'principle', 'standard', 'decision')),
  key text,
  name text not null check (length(name) between 1 and 200),
  description text not null default '',
  domain_id uuid references elements(id) on delete set null,
  parent_id uuid references elements(id) on delete set null,
  owner text,
  lifecycle text check (lifecycle in ('plan', 'build', 'active', 'phase_out', 'retired')),
  lifecycle_dates jsonb not null default '{}',
  classification text not null default 'internal'
    check (classification in ('public', 'internal', 'confidential', 'restricted')),
  classification_rank smallint generated always as (
    case classification
      when 'public' then 0
      when 'internal' then 1
      when 'confidential' then 2
      else 3
    end
  ) stored,
  attributes jsonb not null default '{}',
  tags text[] not null default '{}',
  external_ids jsonb not null default '{}',
  source text,
  layer text not null default 'org' check (layer in ('org', 'reference')),
  pack text,
  quality smallint not null default 0,
  health text check (health in ('good', 'watch', 'act')),
  health_reasons text[] not null default '{}',
  suggestions jsonb not null default '{}',
  search tsvector,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  version int not null default 1,
  deleted_at timestamptz
);

create index elements_type on elements(type) where deleted_at is null;
create index elements_domain on elements(domain_id) where deleted_at is null;
create index elements_parent on elements(parent_id) where deleted_at is null;
create unique index elements_key on elements(type, coalesce(pack, ''), key)
  where key is not null and deleted_at is null;
create index elements_search on elements using gin(search);
create index elements_name_trgm on elements using gin(name gin_trgm_ops);
create index elements_external_ids on elements using gin(external_ids jsonb_path_ops);
create index elements_layer on elements(layer, pack) where deleted_at is null;

create function elements_search_update() returns trigger language plpgsql as $$
begin
  new.search :=
    setweight(to_tsvector('simple', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.key, '')), 'A') ||
    setweight(to_tsvector('simple', array_to_string(new.tags, ' ')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'C');
  return new;
end $$;

create trigger elements_search_trg before insert or update of name, key, tags, description
  on elements for each row execute function elements_search_update();

create table relations (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  source_id uuid not null references elements(id) on delete cascade,
  target_id uuid not null references elements(id) on delete cascade,
  attributes jsonb not null default '{}',
  created_at timestamptz not null default now(),
  created_by text,
  deleted_at timestamptz,
  check (source_id <> target_id)
);
create unique index relations_unique on relations(type, source_id, target_id) where deleted_at is null;
create index relations_source on relations(source_id) where deleted_at is null;
create index relations_target on relations(target_id) where deleted_at is null;

create table scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  is_target boolean not null default false,
  target_date date,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index scenarios_one_target on scenarios(is_target) where is_target and archived_at is null;

create table changesets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'suggestion', 'scenario', 'import', 'sync', 'pack', 'undo')),
  status text not null check (status in ('draft', 'open', 'applied', 'rejected', 'withdrawn')),
  title text not null default '',
  description text not null default '',
  scenario_id uuid references scenarios(id) on delete cascade,
  author_id uuid references users(id) on delete set null,
  author_name text,
  author_token_id uuid references api_tokens(id) on delete set null,
  author_kind text not null default 'user' check (author_kind in ('user', 'agent', 'ci', 'system')),
  reviewer_id uuid references users(id) on delete set null,
  reviewer_name text,
  decision_note text,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_at timestamptz
);
create index changesets_status on changesets(status, created_at desc);
create index changesets_scenario on changesets(scenario_id);

create table changes (
  id uuid primary key default gen_random_uuid(),
  changeset_id uuid not null references changesets(id) on delete cascade,
  seq int not null,
  op text not null check (op in ('create', 'update', 'delete')),
  entity text not null check (entity in ('element', 'relation')),
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index changes_entity on changes(entity_id, created_at desc);
create index changes_changeset on changes(changeset_id, seq);

create table comments (
  id uuid primary key default gen_random_uuid(),
  element_id uuid references elements(id) on delete cascade,
  changeset_id uuid references changesets(id) on delete cascade,
  author_id uuid references users(id) on delete set null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index comments_element on comments(element_id, created_at);
create index comments_changeset on comments(changeset_id, created_at);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user on notifications(user_id, created_at desc);

create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_kind text not null,
  actor_id text,
  actor_name text,
  token_id uuid,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}',
  ip text
);
create index audit_log_at on audit_log(at desc);
create index audit_log_token on audit_log(token_id, at desc);

create table saved_views (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null,
  config jsonb not null default '{}',
  owner_id uuid references users(id) on delete cascade,
  shared boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table dashboards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  widgets jsonb not null default '[]',
  owner_id uuid references users(id) on delete cascade,
  is_template boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table import_mappings (
  signature text primary key,
  element_type text not null,
  mapping jsonb not null,
  updated_at timestamptz not null default now()
);

create table import_runs (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  format text not null,
  status text not null,
  summary jsonb not null default '{}',
  changeset_id uuid references changesets(id) on delete set null,
  created_by text,
  created_at timestamptz not null default now()
);

create table reference_packs (
  id text primary key,
  name text not null,
  version text not null,
  manifest jsonb not null default '{}',
  element_count int not null default 0,
  installed_at timestamptz not null default now(),
  installed_by text
);

create table eol_cache (
  product text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);
