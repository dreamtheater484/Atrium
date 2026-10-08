-- A scenario (or the target state) can be put up for review and agreed, separately from
-- applying it to today.
alter table scenarios
  add column review_status text not null default 'draft'
    check (review_status in ('draft', 'in_review', 'agreed')),
  add column submitted_by text,
  add column submitted_at timestamptz,
  add column reviewed_by text,
  add column reviewed_at timestamptz,
  add column review_note text;
