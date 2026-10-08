-- Track undo on change sets, so the same change can't be undone twice.
alter table changesets add column undone_at timestamptz;
alter table changesets add column undone_by text;
