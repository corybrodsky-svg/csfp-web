-- CFSP Phase 4: Hybrid SP communication preferences.
-- Tracks organization defaults and per-SP communication/onboarding status.

create extension if not exists pgcrypto;

create table if not exists public.organization_communication_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  default_sp_communication_mode text not null default 'hybrid',
  allow_sp_portal boolean not null default true,
  allow_email_workflow boolean not null default true,
  allow_microsoft_forms_workflow boolean not null default true,
  allow_manual_workflow boolean not null default true,
  default_ms_forms_url text null,
  default_reply_to_email text null,
  sp_onboarding_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_communication_settings_mode_check
    check (default_sp_communication_mode in ('hybrid', 'portal_only', 'email_only', 'microsoft_forms', 'manual'))
);

create table if not exists public.sp_communication_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sp_id uuid not null references public.sps(id) on delete cascade,
  preferred_mode text not null default 'email',
  portal_status text not null default 'not_invited',
  onboarding_status text not null default 'not_started',
  last_invited_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sp_id),
  constraint sp_communication_preferences_preferred_mode_check
    check (preferred_mode in ('portal', 'email', 'microsoft_forms', 'phone', 'manual', 'do_not_contact')),
  constraint sp_communication_preferences_portal_status_check
    check (portal_status in ('not_invited', 'invited', 'linked', 'needs_help', 'disabled')),
  constraint sp_communication_preferences_onboarding_status_check
    check (onboarding_status in ('not_started', 'invited', 'in_progress', 'complete', 'needs_help', 'declined'))
);

create index if not exists organization_communication_settings_org_idx
  on public.organization_communication_settings (organization_id);

create index if not exists sp_communication_preferences_org_idx
  on public.sp_communication_preferences (organization_id);

create index if not exists sp_communication_preferences_sp_idx
  on public.sp_communication_preferences (sp_id);

create or replace function public.cfsp_touch_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists organization_communication_settings_touch_updated_at
  on public.organization_communication_settings;
create trigger organization_communication_settings_touch_updated_at
  before update on public.organization_communication_settings
  for each row execute function public.cfsp_touch_updated_at();

drop trigger if exists sp_communication_preferences_touch_updated_at
  on public.sp_communication_preferences;
create trigger sp_communication_preferences_touch_updated_at
  before update on public.sp_communication_preferences
  for each row execute function public.cfsp_touch_updated_at();

alter table public.organization_communication_settings enable row level security;
alter table public.organization_communication_settings force row level security;
alter table public.sp_communication_preferences enable row level security;
alter table public.sp_communication_preferences force row level security;

revoke all on public.organization_communication_settings from anon;
revoke all on public.sp_communication_preferences from anon;
grant select, insert, update, delete on public.organization_communication_settings to authenticated;
grant select, insert, update, delete on public.sp_communication_preferences to authenticated;

drop policy if exists cfsp_org_comm_settings_select on public.organization_communication_settings;
create policy cfsp_org_comm_settings_select
  on public.organization_communication_settings
  for select to authenticated
  using (public.cfsp_has_active_org_membership(organization_id));

drop policy if exists cfsp_org_comm_settings_insert on public.organization_communication_settings;
create policy cfsp_org_comm_settings_insert
  on public.organization_communication_settings
  for insert to authenticated
  with check (public.cfsp_can_operate_org(organization_id));

drop policy if exists cfsp_org_comm_settings_update on public.organization_communication_settings;
create policy cfsp_org_comm_settings_update
  on public.organization_communication_settings
  for update to authenticated
  using (public.cfsp_can_operate_org(organization_id))
  with check (public.cfsp_can_operate_org(organization_id));

drop policy if exists cfsp_org_comm_settings_delete on public.organization_communication_settings;
create policy cfsp_org_comm_settings_delete
  on public.organization_communication_settings
  for delete to authenticated
  using (public.cfsp_can_manage_org(organization_id));

drop policy if exists cfsp_sp_comm_preferences_select on public.sp_communication_preferences;
create policy cfsp_sp_comm_preferences_select
  on public.sp_communication_preferences
  for select to authenticated
  using (public.cfsp_can_operate_org(organization_id));

drop policy if exists cfsp_sp_comm_preferences_insert on public.sp_communication_preferences;
create policy cfsp_sp_comm_preferences_insert
  on public.sp_communication_preferences
  for insert to authenticated
  with check (public.cfsp_can_operate_org(organization_id));

drop policy if exists cfsp_sp_comm_preferences_update on public.sp_communication_preferences;
create policy cfsp_sp_comm_preferences_update
  on public.sp_communication_preferences
  for update to authenticated
  using (public.cfsp_can_operate_org(organization_id))
  with check (public.cfsp_can_operate_org(organization_id));

drop policy if exists cfsp_sp_comm_preferences_delete on public.sp_communication_preferences;
create policy cfsp_sp_comm_preferences_delete
  on public.sp_communication_preferences
  for delete to authenticated
  using (public.cfsp_can_manage_org(organization_id));
