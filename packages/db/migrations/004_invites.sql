-- One-time invite links: an admin adds a person, shares the link, the person sets a password.
create table invites (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_by text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
