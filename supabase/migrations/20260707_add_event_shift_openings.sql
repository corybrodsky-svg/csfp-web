-- CFSP SP portal open-shift offers and recipient responses.
-- One event_shift_openings row represents the event-level open shift.
-- event_shift_responses stores one recipient/response row per selected SP.

create extension if not exists pgcrypto;

create table if not exists public.event_shift_openings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  organization_id uuid null references public.organizations(id) on delete cascade,
  title text null,
  shift_date date null,
  start_time time null,
  end_time time null,
  location text null,
  room text null,
  needed_count integer not null default 1,
  selected_count integer not null default 0,
  status text not null default 'open',
  visibility text not null default 'portal_and_email',
  requirements text null,
  notes text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_shift_openings_needed_count_check check (needed_count >= 1),
  constraint event_shift_openings_selected_count_check check (selected_count >= 0),
  constraint event_shift_openings_status_check check (status in ('open', 'closed', 'draft', 'filled', 'cancelled')),
  constraint event_shift_openings_visibility_check check (visibility in ('portal_only', 'email_only', 'portal_and_email', 'private'))
);

alter table public.event_shift_openings
  add column if not exists organization_id uuid null references public.organizations(id) on delete cascade,
  add column if not exists selected_count integer not null default 0,
  add column if not exists created_by uuid null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.event_shift_responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  opening_id uuid not null references public.event_shift_openings(id) on delete cascade,
  sp_id uuid not null references public.sps(id) on delete cascade,
  organization_id uuid null references public.organizations(id) on delete cascade,
  response text not null default 'no_response',
  source text not null default 'email',
  message text null,
  responded_at timestamptz null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_shift_responses_unique_opening_sp unique (opening_id, sp_id),
  constraint event_shift_responses_response_check check (response in ('no_response', 'available', 'maybe', 'declined', 'accepted', 'withdrawn')),
  constraint event_shift_responses_source_check check (source in ('portal', 'email', 'microsoft_forms', 'manual', 'import'))
);

alter table public.event_shift_responses
  add column if not exists organization_id uuid null references public.organizations(id) on delete cascade,
  add column if not exists created_by uuid null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists event_shift_openings_event_idx on public.event_shift_openings(event_id);
create index if not exists event_shift_openings_org_idx on public.event_shift_openings(organization_id);
create index if not exists event_shift_openings_status_visibility_idx on public.event_shift_openings(status, visibility);
create index if not exists event_shift_responses_event_idx on public.event_shift_responses(event_id);
create index if not exists event_shift_responses_opening_idx on public.event_shift_responses(opening_id);
create index if not exists event_shift_responses_sp_idx on public.event_shift_responses(sp_id);
create index if not exists event_shift_responses_org_idx on public.event_shift_responses(organization_id);

alter table public.event_shift_openings enable row level security;
alter table public.event_shift_openings force row level security;
alter table public.event_shift_responses enable row level security;
alter table public.event_shift_responses force row level security;

revoke all on public.event_shift_openings from anon;
revoke all on public.event_shift_responses from anon;
grant select, insert, update, delete on public.event_shift_openings to authenticated;
grant select, insert, update, delete on public.event_shift_responses to authenticated;

drop policy if exists cfsp_shift_openings_select on public.event_shift_openings;
create policy cfsp_shift_openings_select on public.event_shift_openings
  for select to authenticated
  using (
    public.cfsp_can_access_event(event_id)
    or exists (
      select 1
      from public.event_shift_responses r
      where r.opening_id = event_shift_openings.id
        and public.cfsp_matches_sp(r.sp_id)
    )
  );

drop policy if exists cfsp_shift_openings_insert on public.event_shift_openings;
create policy cfsp_shift_openings_insert on public.event_shift_openings
  for insert to authenticated
  with check (
    public.cfsp_can_operate_org(organization_id)
    or public.cfsp_is_operator()
  );

drop policy if exists cfsp_shift_openings_update on public.event_shift_openings;
create policy cfsp_shift_openings_update on public.event_shift_openings
  for update to authenticated
  using (
    public.cfsp_can_operate_org(organization_id)
    or public.cfsp_is_operator()
  )
  with check (
    public.cfsp_can_operate_org(organization_id)
    or public.cfsp_is_operator()
  );

drop policy if exists cfsp_shift_openings_delete on public.event_shift_openings;
create policy cfsp_shift_openings_delete on public.event_shift_openings
  for delete to authenticated
  using (
    public.cfsp_can_operate_org(organization_id)
    or public.cfsp_is_operator()
  );

drop policy if exists cfsp_shift_responses_select on public.event_shift_responses;
create policy cfsp_shift_responses_select on public.event_shift_responses
  for select to authenticated
  using (
    public.cfsp_can_access_event(event_id)
    or public.cfsp_matches_sp(sp_id)
  );

drop policy if exists cfsp_shift_responses_insert on public.event_shift_responses;
create policy cfsp_shift_responses_insert on public.event_shift_responses
  for insert to authenticated
  with check (
    public.cfsp_can_operate_org(organization_id)
    or public.cfsp_is_operator()
    or public.cfsp_matches_sp(sp_id)
  );

drop policy if exists cfsp_shift_responses_update on public.event_shift_responses;
create policy cfsp_shift_responses_update on public.event_shift_responses
  for update to authenticated
  using (
    public.cfsp_can_operate_org(organization_id)
    or public.cfsp_is_operator()
    or public.cfsp_matches_sp(sp_id)
  )
  with check (
    public.cfsp_can_operate_org(organization_id)
    or public.cfsp_is_operator()
    or public.cfsp_matches_sp(sp_id)
  );

drop policy if exists cfsp_shift_responses_delete on public.event_shift_responses;
create policy cfsp_shift_responses_delete on public.event_shift_responses
  for delete to authenticated
  using (
    public.cfsp_can_operate_org(organization_id)
    or public.cfsp_is_operator()
  );
