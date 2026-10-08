-- Row-level security: the second line of defence behind the application's policy layer.
--
-- Every request runs inside a transaction as the non-superuser role atrium_app, with
--   atrium.max_rank  highest classification rank the caller may see (0..3)
--   atrium.domains   comma-separated domain ids the caller is limited to ('' = all)
-- set via set_config(..., true). The settings are required: if application code ever
-- forgets them, queries fail instead of leaking data.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'atrium_app') then
    create role atrium_app nologin;
  end if;
end $$;

grant usage on schema public to atrium_app;
grant select, insert, update, delete on all tables in schema public to atrium_app;
grant usage, select on all sequences in schema public to atrium_app;
alter default privileges in schema public grant select, insert, update, delete on tables to atrium_app;
alter default privileges in schema public grant usage, select on sequences to atrium_app;

-- Allow the login role that runs Atrium to switch to atrium_app.
do $$
begin
  execute format('grant atrium_app to %I', current_user);
exception when others then
  null; -- already a member, or a superuser
end $$;

create function atrium_domain_allowed(domain uuid, el_id uuid, el_type text) returns boolean
language sql stable as $$
  select
    current_setting('atrium.domains') = ''
    or domain is null
    or domain = any(string_to_array(current_setting('atrium.domains'), ',')::uuid[])
    or (el_type = 'domain' and el_id = any(string_to_array(current_setting('atrium.domains'), ',')::uuid[]))
$$;

alter table elements enable row level security;
create policy elements_scope on elements
  using (
    classification_rank <= current_setting('atrium.max_rank')::int
    and atrium_domain_allowed(domain_id, id, type)
  )
  with check (true);

alter table relations enable row level security;
create policy relations_scope on relations
  using (
    exists (select 1 from elements e where e.id = source_id)
    and exists (select 1 from elements e where e.id = target_id)
  )
  with check (true);
