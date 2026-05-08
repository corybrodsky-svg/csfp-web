alter table public.event_sps
  add column if not exists training_attended boolean not null default false,
  add column if not exists training_checked_in_at timestamptz null;

update public.event_sps
set training_attended = coalesce(training_attended, false)
where training_attended is null;
