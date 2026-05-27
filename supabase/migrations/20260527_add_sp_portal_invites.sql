-- CFSP Phase 4B: SP Portal invite and onboarding flow.
-- Stores only token hashes. Raw invite tokens are returned once by server routes.

create extension if not exists pgcrypto;

create table if not exists public.sp_portal_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sp_id uuid not null references public.sps(id) on delete cascade,
  invite_email text null,
  token_hash text not null unique,
  status text not null default 'active',
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  created_by uuid null,
  accepted_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_portal_invites_status_check
    check (status in ('active', 'accepted', 'expired', 'revoked'))
);

create index if not exists sp_portal_invites_org_idx
  on public.sp_portal_invites (organization_id);

create index if not exists sp_portal_invites_sp_idx
  on public.sp_portal_invites (sp_id);

create index if not exists sp_portal_invites_status_idx
  on public.sp_portal_invites (status);

create index if not exists sp_portal_invites_expires_idx
  on public.sp_portal_invites (expires_at);

create unique index if not exists sp_portal_invites_active_sp_idx
  on public.sp_portal_invites (organization_id, sp_id)
  where status = 'active';

create or replace function public.cfsp_touch_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists sp_portal_invites_touch_updated_at
  on public.sp_portal_invites;
create trigger sp_portal_invites_touch_updated_at
  before update on public.sp_portal_invites
  for each row execute function public.cfsp_touch_updated_at();

alter table public.sp_portal_invites enable row level security;
alter table public.sp_portal_invites force row level security;

revoke all on public.sp_portal_invites from anon;
grant select, insert, update, delete on public.sp_portal_invites to authenticated;

drop policy if exists cfsp_sp_portal_invites_select on public.sp_portal_invites;
create policy cfsp_sp_portal_invites_select
  on public.sp_portal_invites
  for select to authenticated
  using (public.cfsp_can_operate_org(organization_id));

drop policy if exists cfsp_sp_portal_invites_insert on public.sp_portal_invites;
create policy cfsp_sp_portal_invites_insert
  on public.sp_portal_invites
  for insert to authenticated
  with check (public.cfsp_can_operate_org(organization_id));

drop policy if exists cfsp_sp_portal_invites_update on public.sp_portal_invites;
create policy cfsp_sp_portal_invites_update
  on public.sp_portal_invites
  for update to authenticated
  using (public.cfsp_can_operate_org(organization_id))
  with check (public.cfsp_can_operate_org(organization_id));

drop policy if exists cfsp_sp_portal_invites_delete on public.sp_portal_invites;
create policy cfsp_sp_portal_invites_delete
  on public.sp_portal_invites
  for delete to authenticated
  using (public.cfsp_can_manage_org(organization_id));
