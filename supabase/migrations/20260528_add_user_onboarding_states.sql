create table if not exists public.user_onboarding_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid null references public.organizations(id) on delete cascade,
  guide_key text not null,
  completed_steps jsonb not null default '[]'::jsonb,
  dismissed_at timestamptz null,
  last_opened_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, organization_id, guide_key)
);

create unique index if not exists user_onboarding_states_unique_scope_idx
  on public.user_onboarding_states (
    user_id,
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    guide_key
  );

create index if not exists user_onboarding_states_user_id_idx
  on public.user_onboarding_states (user_id);

create index if not exists user_onboarding_states_organization_id_idx
  on public.user_onboarding_states (organization_id);

create index if not exists user_onboarding_states_guide_key_idx
  on public.user_onboarding_states (guide_key);

create or replace function public.cfsp_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_onboarding_states_touch_updated_at
  on public.user_onboarding_states;

create trigger user_onboarding_states_touch_updated_at
  before update on public.user_onboarding_states
  for each row execute function public.cfsp_touch_updated_at();

alter table public.user_onboarding_states enable row level security;

drop policy if exists cfsp_user_onboarding_states_select_self
  on public.user_onboarding_states;
create policy cfsp_user_onboarding_states_select_self
  on public.user_onboarding_states
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists cfsp_user_onboarding_states_insert_self
  on public.user_onboarding_states;
create policy cfsp_user_onboarding_states_insert_self
  on public.user_onboarding_states
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists cfsp_user_onboarding_states_update_self
  on public.user_onboarding_states;
create policy cfsp_user_onboarding_states_update_self
  on public.user_onboarding_states
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists cfsp_user_onboarding_states_delete_self
  on public.user_onboarding_states;
create policy cfsp_user_onboarding_states_delete_self
  on public.user_onboarding_states
  for delete to authenticated
  using (user_id = auth.uid());
