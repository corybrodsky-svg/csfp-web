-- CFSP multi-tenant organization access, approval, and organization-scoped data.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  type text null,
  status text not null default 'active',
  created_at timestamptz default now(),
  created_by uuid null
);

create table if not exists public.organization_access_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code text unique not null,
  label text null,
  allowed_email_domains text[] null,
  default_requested_role text default 'viewer',
  active boolean default true,
  requires_manual_approval boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null,
  status text not null default 'active',
  approved_by uuid null,
  approved_at timestamptz null,
  created_at timestamptz default now(),
  unique (organization_id, user_id)
);

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  access_code_id uuid references public.organization_access_codes(id),
  full_name text not null,
  email text not null,
  requested_role text not null default 'viewer',
  note text null,
  status text not null default 'pending',
  reviewed_by uuid null,
  reviewed_at timestamptz null,
  created_user_id uuid null,
  created_at timestamptz default now()
);

create table if not exists public.organization_instruction_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_key text not null,
  label text null,
  template jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, template_key)
);

create or replace function public.cfsp_normalize_membership_role(raw_role text)
returns text
language sql
immutable
as $function$
  select case lower(replace(coalesce(raw_role, ''), '-', '_'))
    when 'platform_owner' then 'platform_owner'
    when 'owner' then 'platform_owner'
    when 'super_admin' then 'platform_owner'
    when 'org_admin' then 'org_admin'
    when 'organization_admin' then 'org_admin'
    when 'admin' then 'org_admin'
    when 'sim_ops' then 'sim_ops'
    when 'sim_op' then 'sim_ops'
    when 'faculty' then 'faculty'
    when 'sp' then 'sp'
    when 'viewer' then 'viewer'
    when 'read_only' then 'viewer'
    when 'readonly' then 'viewer'
    else 'viewer'
  end;
$function$;

create or replace function public.cfsp_membership_role_rank(raw_role text)
returns integer
language sql
immutable
as $function$
  select case public.cfsp_normalize_membership_role(raw_role)
    when 'platform_owner' then 60
    when 'org_admin' then 50
    when 'sim_ops' then 40
    when 'faculty' then 30
    when 'viewer' then 20
    when 'sp' then 10
    else 0
  end;
$function$;

create or replace function public.cfsp_highest_membership_role(target_org_id uuid, target_user_id uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(
    (
      select public.cfsp_normalize_membership_role(m.role)
      from public.organization_memberships m
      where m.status = 'active'
        and m.user_id = target_user_id
        and (
          m.organization_id = target_org_id
          or public.cfsp_normalize_membership_role(m.role) = 'platform_owner'
        )
      order by public.cfsp_membership_role_rank(m.role) desc, m.created_at
      limit 1
    ),
    ''
  );
$function$;

create or replace function public.cfsp_user_is_platform_owner(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.organization_memberships m
    where m.status = 'active'
      and m.user_id = target_user_id
      and public.cfsp_normalize_membership_role(m.role) = 'platform_owner'
  );
$function$;

create or replace function public.cfsp_has_active_org_membership(target_org_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select target_org_id is not null
    and (
      exists (
        select 1
        from public.organization_memberships m
        where m.status = 'active'
          and m.user_id = target_user_id
          and m.organization_id = target_org_id
      )
      or public.cfsp_user_is_platform_owner(target_user_id)
    );
$function$;

create or replace function public.cfsp_can_manage_org(target_org_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select public.cfsp_highest_membership_role(target_org_id, target_user_id) in ('platform_owner', 'org_admin');
$function$;

create or replace function public.cfsp_can_operate_org(target_org_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select public.cfsp_highest_membership_role(target_org_id, target_user_id) in ('platform_owner', 'org_admin', 'sim_ops');
$function$;

create or replace function public.cfsp_default_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $function$
  select id
  from public.organizations
  where slug = 'cfsp-internal-cory-trial'
  order by created_at
  limit 1;
$function$;

insert into public.organizations (name, slug, type, status)
values ('CFSP Internal / Cory Trial Workspace', 'cfsp-internal-cory-trial', 'demo', 'active')
on conflict (slug) do update
set name = excluded.name,
    type = excluded.type,
    status = 'active';

insert into public.organization_access_codes (
  organization_id,
  code,
  label,
  default_requested_role,
  active,
  requires_manual_approval
)
select
  public.cfsp_default_organization_id(),
  'CFSP-TRIAL',
  'Default CFSP trial workspace access code',
  'viewer',
  true,
  true
where public.cfsp_default_organization_id() is not null
on conflict (code) do update
set organization_id = excluded.organization_id,
    active = true,
    requires_manual_approval = true;

insert into public.organization_memberships (
  organization_id,
  user_id,
  role,
  status,
  approved_at
)
select
  public.cfsp_default_organization_id(),
  users.id,
  'platform_owner',
  'active',
  now()
from auth.users
where lower(users.email) in (
  'cory.brodsky@gmail.com',
  'cory.brodsky@drexel.edu',
  'cwb55@drexel.edu'
)
  and public.cfsp_default_organization_id() is not null
on conflict (organization_id, user_id) do update
set role = case
      when public.cfsp_normalize_membership_role(public.organization_memberships.role) = 'platform_owner'
        then public.organization_memberships.role
      else 'platform_owner'
    end,
    status = 'active',
    approved_at = coalesce(public.organization_memberships.approved_at, now());

do $do$
begin
  if to_regclass('public.events') is not null then
    alter table public.events
      add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
    alter table public.events
      alter column organization_id set default public.cfsp_default_organization_id();
    update public.events
    set organization_id = public.cfsp_default_organization_id()
    where organization_id is null
      and public.cfsp_default_organization_id() is not null;
  end if;

  if to_regclass('public.sps') is not null then
    alter table public.sps
      add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
    alter table public.sps
      alter column organization_id set default public.cfsp_default_organization_id();
    if to_regclass('public.event_sps') is not null and to_regclass('public.events') is not null then
      update public.sps s
      set organization_id = picked.organization_id
      from (
        select distinct on (es.sp_id) es.sp_id, e.organization_id
        from public.event_sps es
        join public.events e on e.id = es.event_id
        where es.sp_id is not null
          and e.organization_id is not null
        order by es.sp_id, es.created_at nulls last, es.id
      ) picked
      where s.id = picked.sp_id
        and s.organization_id is null;
    end if;
    update public.sps
    set organization_id = public.cfsp_default_organization_id()
    where organization_id is null
      and public.cfsp_default_organization_id() is not null;
  end if;

  if to_regclass('public.event_sessions') is not null then
    alter table public.event_sessions
      add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
    alter table public.event_sessions
      alter column organization_id set default public.cfsp_default_organization_id();
    if to_regclass('public.events') is not null then
      update public.event_sessions s
      set organization_id = e.organization_id
      from public.events e
      where s.event_id = e.id
        and s.organization_id is null;
    end if;
    update public.event_sessions
    set organization_id = public.cfsp_default_organization_id()
    where organization_id is null
      and public.cfsp_default_organization_id() is not null;
  end if;

  if to_regclass('public.event_sps') is not null then
    alter table public.event_sps
      add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
    alter table public.event_sps
      alter column organization_id set default public.cfsp_default_organization_id();
    if to_regclass('public.events') is not null then
      update public.event_sps es
      set organization_id = e.organization_id
      from public.events e
      where es.event_id = e.id
        and es.organization_id is null;
    end if;
    update public.event_sps
    set organization_id = public.cfsp_default_organization_id()
    where organization_id is null
      and public.cfsp_default_organization_id() is not null;
  end if;

  if to_regclass('public.sp_availability') is not null then
    alter table public.sp_availability
      add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
    alter table public.sp_availability
      alter column organization_id set default public.cfsp_default_organization_id();
    if to_regclass('public.sps') is not null then
      update public.sp_availability a
      set organization_id = s.organization_id
      from public.sps s
      where a.sp_id = s.id
        and a.organization_id is null;
    end if;
    update public.sp_availability
    set organization_id = public.cfsp_default_organization_id()
    where organization_id is null
      and public.cfsp_default_organization_id() is not null;
  end if;

  if to_regclass('public.event_learner_attendance') is not null then
    alter table public.event_learner_attendance
      add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
    alter table public.event_learner_attendance
      alter column organization_id set default public.cfsp_default_organization_id();
    if to_regclass('public.events') is not null then
      update public.event_learner_attendance a
      set organization_id = e.organization_id
      from public.events e
      where a.event_id = e.id
        and a.organization_id is null;
    end if;
    update public.event_learner_attendance
    set organization_id = public.cfsp_default_organization_id()
    where organization_id is null
      and public.cfsp_default_organization_id() is not null;
  end if;

  if to_regclass('public.email_templates') is not null then
    alter table public.email_templates
      add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
    alter table public.email_templates
      alter column organization_id set default public.cfsp_default_organization_id();
    update public.email_templates
    set organization_id = public.cfsp_default_organization_id()
    where organization_id is null
      and public.cfsp_default_organization_id() is not null;
  end if;

  if to_regclass('public.simvitals_posts') is not null then
    alter table public.simvitals_posts
      add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
    alter table public.simvitals_posts
      alter column organization_id set default public.cfsp_default_organization_id();
    if to_regclass('public.events') is not null then
      update public.simvitals_posts p
      set organization_id = e.organization_id
      from public.events e
      where p.linked_event_id = e.id
        and p.organization_id is null;
    end if;
    update public.simvitals_posts
    set organization_id = public.cfsp_default_organization_id()
    where organization_id is null
      and public.cfsp_default_organization_id() is not null;
  end if;
end
$do$;

do $do$
declare
  table_name text;
begin
  foreach table_name in array array[
    'event_materials',
    'materials',
    'attachments',
    'training_materials',
    'announcements',
    'alarms',
    'event_announcements'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I add column if not exists organization_id uuid references public.organizations(id) on delete restrict', table_name);
      execute format('alter table public.%I alter column organization_id set default public.cfsp_default_organization_id()', table_name);
      if public.cfsp_public_table_has_column(table_name, 'event_id') and to_regclass('public.events') is not null then
        execute format(
          'update public.%I t set organization_id = e.organization_id from public.events e where t.event_id = e.id and t.organization_id is null',
          table_name
        );
      end if;
      execute format(
        'update public.%I set organization_id = public.cfsp_default_organization_id() where organization_id is null and public.cfsp_default_organization_id() is not null',
        table_name
      );
    end if;
  end loop;
end
$do$;

create index if not exists organizations_status_idx on public.organizations (status);
create index if not exists organization_access_codes_org_idx on public.organization_access_codes (organization_id);
create index if not exists organization_access_codes_active_idx on public.organization_access_codes (active);
create index if not exists organization_memberships_user_idx on public.organization_memberships (user_id, status);
create index if not exists organization_memberships_org_idx on public.organization_memberships (organization_id, status);
create index if not exists access_requests_org_status_idx on public.access_requests (organization_id, status, created_at);
create index if not exists access_requests_email_idx on public.access_requests (lower(email));
create index if not exists organization_instruction_templates_org_idx on public.organization_instruction_templates (organization_id);

do $do$
begin
  if to_regclass('public.events') is not null then
    create index if not exists events_organization_id_idx on public.events (organization_id);
  end if;
  if to_regclass('public.sps') is not null then
    create index if not exists sps_organization_id_idx on public.sps (organization_id);
  end if;
  if to_regclass('public.event_sessions') is not null then
    create index if not exists event_sessions_organization_id_idx on public.event_sessions (organization_id);
  end if;
  if to_regclass('public.event_sps') is not null then
    create index if not exists event_sps_organization_id_idx on public.event_sps (organization_id);
  end if;
  if to_regclass('public.email_templates') is not null then
    drop index if exists public.email_templates_seed_identity_idx;
    create unique index if not exists email_templates_org_seed_identity_idx
      on public.email_templates (organization_id, lower(name), coalesce(university_name, ''), coalesce(program_name, ''));
  end if;
  if to_regclass('public.simvitals_posts') is not null then
    create index if not exists simvitals_posts_organization_id_idx on public.simvitals_posts (organization_id);
  end if;
end
$do$;

create or replace function public.cfsp_current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(
    (
      select case public.cfsp_highest_membership_role(m.organization_id, auth.uid())
        when 'platform_owner' then 'super_admin'
        when 'org_admin' then 'admin'
        when 'sim_ops' then 'sim_op'
        when 'faculty' then 'faculty'
        when 'sp' then 'sp'
        else 'faculty'
      end
      from public.organization_memberships m
      where m.user_id = auth.uid()
        and m.status = 'active'
      order by public.cfsp_membership_role_rank(m.role) desc, m.created_at
      limit 1
    ),
    (
      select public.cfsp_normalize_role(p.role)
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    public.cfsp_current_token_role()
  );
$function$;

create or replace function public.cfsp_matches_sp(target_sp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.sps s
    where s.id = target_sp_id
      and public.cfsp_current_user_email() <> ''
      and public.cfsp_has_active_org_membership(s.organization_id)
      and (
        lower(trim(coalesce(s.working_email, ''))) = public.cfsp_current_user_email()
        or lower(trim(coalesce(s.email, ''))) = public.cfsp_current_user_email()
      )
  );
$function$;

create or replace function public.cfsp_can_access_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.events e
    where e.id = target_event_id
      and public.cfsp_has_active_org_membership(e.organization_id)
      and (
        public.cfsp_highest_membership_role(e.organization_id) in ('platform_owner', 'org_admin', 'sim_ops', 'faculty', 'viewer')
        or exists (
          select 1
          from public.event_sps es
          where es.event_id = e.id
            and public.cfsp_matches_sp(es.sp_id)
        )
      )
  );
$function$;

grant execute on function public.cfsp_normalize_membership_role(text) to authenticated;
grant execute on function public.cfsp_membership_role_rank(text) to authenticated;
grant execute on function public.cfsp_highest_membership_role(uuid, uuid) to authenticated;
grant execute on function public.cfsp_user_is_platform_owner(uuid) to authenticated;
grant execute on function public.cfsp_has_active_org_membership(uuid, uuid) to authenticated;
grant execute on function public.cfsp_can_manage_org(uuid, uuid) to authenticated;
grant execute on function public.cfsp_can_operate_org(uuid, uuid) to authenticated;
grant execute on function public.cfsp_default_organization_id() to authenticated;

do $do$
begin
  alter table public.organizations enable row level security;
  alter table public.organizations force row level security;
  revoke all on public.organizations from anon;
  grant select, insert, update, delete on public.organizations to authenticated;

  drop policy if exists cfsp_organizations_select on public.organizations;
  create policy cfsp_organizations_select on public.organizations
    for select to authenticated
    using (public.cfsp_has_active_org_membership(id));

  drop policy if exists cfsp_organizations_insert on public.organizations;
  create policy cfsp_organizations_insert on public.organizations
    for insert to authenticated
    with check (public.cfsp_user_is_platform_owner());

  drop policy if exists cfsp_organizations_update on public.organizations;
  create policy cfsp_organizations_update on public.organizations
    for update to authenticated
    using (public.cfsp_can_manage_org(id))
    with check (public.cfsp_can_manage_org(id));

  drop policy if exists cfsp_organizations_delete on public.organizations;
  create policy cfsp_organizations_delete on public.organizations
    for delete to authenticated
    using (public.cfsp_user_is_platform_owner());
end
$do$;

do $do$
begin
  alter table public.organization_access_codes enable row level security;
  alter table public.organization_access_codes force row level security;
  revoke all on public.organization_access_codes from anon;
  grant select, insert, update, delete on public.organization_access_codes to authenticated;

  drop policy if exists cfsp_access_codes_select on public.organization_access_codes;
  create policy cfsp_access_codes_select on public.organization_access_codes
    for select to authenticated
    using (public.cfsp_can_manage_org(organization_id));

  drop policy if exists cfsp_access_codes_manage on public.organization_access_codes;
  create policy cfsp_access_codes_manage on public.organization_access_codes
    for all to authenticated
    using (public.cfsp_can_manage_org(organization_id))
    with check (public.cfsp_can_manage_org(organization_id));
end
$do$;

do $do$
begin
  alter table public.organization_memberships enable row level security;
  alter table public.organization_memberships force row level security;
  revoke all on public.organization_memberships from anon;
  grant select, insert, update, delete on public.organization_memberships to authenticated;

  drop policy if exists cfsp_memberships_select on public.organization_memberships;
  create policy cfsp_memberships_select on public.organization_memberships
    for select to authenticated
    using (user_id = auth.uid() or public.cfsp_can_manage_org(organization_id));

  drop policy if exists cfsp_memberships_manage on public.organization_memberships;
  create policy cfsp_memberships_manage on public.organization_memberships
    for all to authenticated
    using (public.cfsp_can_manage_org(organization_id))
    with check (public.cfsp_can_manage_org(organization_id));
end
$do$;

do $do$
begin
  alter table public.access_requests enable row level security;
  alter table public.access_requests force row level security;
  revoke all on public.access_requests from anon;
  grant select, insert, update, delete on public.access_requests to authenticated;

  drop policy if exists cfsp_access_requests_select on public.access_requests;
  create policy cfsp_access_requests_select on public.access_requests
    for select to authenticated
    using (public.cfsp_can_manage_org(organization_id));

  drop policy if exists cfsp_access_requests_manage on public.access_requests;
  create policy cfsp_access_requests_manage on public.access_requests
    for all to authenticated
    using (public.cfsp_can_manage_org(organization_id))
    with check (public.cfsp_can_manage_org(organization_id));
end
$do$;

do $do$
begin
  alter table public.organization_instruction_templates enable row level security;
  alter table public.organization_instruction_templates force row level security;
  revoke all on public.organization_instruction_templates from anon;
  grant select, insert, update, delete on public.organization_instruction_templates to authenticated;

  drop policy if exists cfsp_instruction_templates_select on public.organization_instruction_templates;
  create policy cfsp_instruction_templates_select on public.organization_instruction_templates
    for select to authenticated
    using (public.cfsp_has_active_org_membership(organization_id));

  drop policy if exists cfsp_instruction_templates_manage on public.organization_instruction_templates;
  create policy cfsp_instruction_templates_manage on public.organization_instruction_templates
    for all to authenticated
    using (public.cfsp_can_operate_org(organization_id))
    with check (public.cfsp_can_operate_org(organization_id));
end
$do$;

do $do$
begin
  if to_regclass('public.events') is not null then
    alter table public.events enable row level security;
    alter table public.events force row level security;
    revoke all on public.events from anon;
    grant select, insert, update, delete on public.events to authenticated;

    drop policy if exists cfsp_events_select on public.events;
    create policy cfsp_events_select on public.events
      for select to authenticated
      using (public.cfsp_can_access_event(id));

    drop policy if exists cfsp_events_insert on public.events;
    create policy cfsp_events_insert on public.events
      for insert to authenticated
      with check (public.cfsp_can_operate_org(organization_id));

    drop policy if exists cfsp_events_update on public.events;
    create policy cfsp_events_update on public.events
      for update to authenticated
      using (public.cfsp_can_operate_org(organization_id))
      with check (public.cfsp_can_operate_org(organization_id));

    drop policy if exists cfsp_events_delete on public.events;
    create policy cfsp_events_delete on public.events
      for delete to authenticated
      using (public.cfsp_can_manage_org(organization_id));
  end if;
end
$do$;

do $do$
begin
  if to_regclass('public.event_sessions') is not null then
    alter table public.event_sessions enable row level security;
    alter table public.event_sessions force row level security;
    revoke all on public.event_sessions from anon;
    grant select, insert, update, delete on public.event_sessions to authenticated;

    drop policy if exists cfsp_event_sessions_select on public.event_sessions;
    create policy cfsp_event_sessions_select on public.event_sessions
      for select to authenticated
      using (public.cfsp_can_access_event(event_id));

    drop policy if exists cfsp_event_sessions_insert on public.event_sessions;
    create policy cfsp_event_sessions_insert on public.event_sessions
      for insert to authenticated
      with check (public.cfsp_can_operate_org(organization_id));

    drop policy if exists cfsp_event_sessions_update on public.event_sessions;
    create policy cfsp_event_sessions_update on public.event_sessions
      for update to authenticated
      using (public.cfsp_can_operate_org(organization_id))
      with check (public.cfsp_can_operate_org(organization_id));

    drop policy if exists cfsp_event_sessions_delete on public.event_sessions;
    create policy cfsp_event_sessions_delete on public.event_sessions
      for delete to authenticated
      using (public.cfsp_can_operate_org(organization_id));
  end if;
end
$do$;

do $do$
begin
  if to_regclass('public.sps') is not null then
    alter table public.sps enable row level security;
    alter table public.sps force row level security;
    revoke all on public.sps from anon;
    grant select, insert, update, delete on public.sps to authenticated;

    drop policy if exists cfsp_sps_select_staff on public.sps;
    drop policy if exists cfsp_sps_select_self on public.sps;
    drop policy if exists cfsp_sps_select on public.sps;
    create policy cfsp_sps_select on public.sps
      for select to authenticated
      using (
        public.cfsp_highest_membership_role(organization_id) in ('platform_owner', 'org_admin', 'sim_ops', 'faculty', 'viewer')
        or public.cfsp_matches_sp(id)
      );

    drop policy if exists cfsp_sps_insert on public.sps;
    create policy cfsp_sps_insert on public.sps
      for insert to authenticated
      with check (public.cfsp_can_operate_org(organization_id));

    drop policy if exists cfsp_sps_update on public.sps;
    create policy cfsp_sps_update on public.sps
      for update to authenticated
      using (public.cfsp_can_operate_org(organization_id))
      with check (public.cfsp_can_operate_org(organization_id));

    drop policy if exists cfsp_sps_delete on public.sps;
    create policy cfsp_sps_delete on public.sps
      for delete to authenticated
      using (public.cfsp_can_manage_org(organization_id));
  end if;
end
$do$;

do $do$
begin
  if to_regclass('public.event_sps') is not null then
    alter table public.event_sps enable row level security;
    alter table public.event_sps force row level security;
    revoke all on public.event_sps from anon;
    grant select, insert, update, delete on public.event_sps to authenticated;

    drop policy if exists cfsp_event_sps_select_staff on public.event_sps;
    drop policy if exists cfsp_event_sps_select_self on public.event_sps;
    drop policy if exists cfsp_event_sps_select on public.event_sps;
    create policy cfsp_event_sps_select on public.event_sps
      for select to authenticated
      using (
        public.cfsp_highest_membership_role(organization_id) in ('platform_owner', 'org_admin', 'sim_ops', 'faculty', 'viewer')
        or public.cfsp_matches_sp(sp_id)
      );

    drop policy if exists cfsp_event_sps_insert on public.event_sps;
    create policy cfsp_event_sps_insert on public.event_sps
      for insert to authenticated
      with check (public.cfsp_can_operate_org(organization_id));

    drop policy if exists cfsp_event_sps_update on public.event_sps;
    create policy cfsp_event_sps_update on public.event_sps
      for update to authenticated
      using (public.cfsp_can_operate_org(organization_id) or public.cfsp_matches_sp(sp_id))
      with check (public.cfsp_can_operate_org(organization_id) or public.cfsp_matches_sp(sp_id));

    drop policy if exists cfsp_event_sps_delete on public.event_sps;
    create policy cfsp_event_sps_delete on public.event_sps
      for delete to authenticated
      using (public.cfsp_can_operate_org(organization_id));
  end if;
end
$do$;

do $do$
begin
  if to_regclass('public.email_templates') is not null then
    alter table public.email_templates enable row level security;
    alter table public.email_templates force row level security;
    revoke all on public.email_templates from anon;
    grant select, insert, update, delete on public.email_templates to authenticated;

    drop policy if exists "email templates authenticated read" on public.email_templates;
    drop policy if exists "email templates operator manage" on public.email_templates;
    drop policy if exists cfsp_email_templates_select on public.email_templates;
    create policy cfsp_email_templates_select on public.email_templates
      for select to authenticated
      using (
        public.cfsp_has_active_org_membership(organization_id)
        and (is_active = true or public.cfsp_can_operate_org(organization_id))
      );

    drop policy if exists cfsp_email_templates_insert on public.email_templates;
    create policy cfsp_email_templates_insert on public.email_templates
      for insert to authenticated
      with check (public.cfsp_can_operate_org(organization_id));

    drop policy if exists cfsp_email_templates_update on public.email_templates;
    create policy cfsp_email_templates_update on public.email_templates
      for update to authenticated
      using (public.cfsp_can_operate_org(organization_id))
      with check (public.cfsp_can_operate_org(organization_id));

    drop policy if exists cfsp_email_templates_delete on public.email_templates;
    create policy cfsp_email_templates_delete on public.email_templates
      for delete to authenticated
      using (public.cfsp_can_operate_org(organization_id));
  end if;
end
$do$;

do $do$
begin
  if to_regclass('public.simvitals_posts') is not null then
    alter table public.simvitals_posts enable row level security;
    alter table public.simvitals_posts force row level security;
    revoke all on public.simvitals_posts from anon;
    grant select, insert, update, delete on public.simvitals_posts to authenticated;

    drop policy if exists cfsp_simvitals_posts_select on public.simvitals_posts;
    create policy cfsp_simvitals_posts_select on public.simvitals_posts
      for select to authenticated
      using (public.cfsp_has_active_org_membership(organization_id));

    drop policy if exists cfsp_simvitals_posts_insert on public.simvitals_posts;
    create policy cfsp_simvitals_posts_insert on public.simvitals_posts
      for insert to authenticated
      with check (auth.uid() = author_user_id and public.cfsp_has_active_org_membership(organization_id));

    drop policy if exists cfsp_simvitals_posts_update on public.simvitals_posts;
    create policy cfsp_simvitals_posts_update on public.simvitals_posts
      for update to authenticated
      using ((auth.uid() = author_user_id or public.cfsp_can_operate_org(organization_id)) and public.cfsp_has_active_org_membership(organization_id))
      with check ((auth.uid() = author_user_id or public.cfsp_can_operate_org(organization_id)) and public.cfsp_has_active_org_membership(organization_id));

    drop policy if exists cfsp_simvitals_posts_delete on public.simvitals_posts;
    create policy cfsp_simvitals_posts_delete on public.simvitals_posts
      for delete to authenticated
      using ((auth.uid() = author_user_id or public.cfsp_can_operate_org(organization_id)) and public.cfsp_has_active_org_membership(organization_id));
  end if;
end
$do$;

do $do$
begin
  if to_regclass('public.sp_availability') is not null then
    alter table public.sp_availability enable row level security;
    alter table public.sp_availability force row level security;
    revoke all on public.sp_availability from anon;
    grant select, insert, update, delete on public.sp_availability to authenticated;

    drop policy if exists cfsp_sp_availability_select on public.sp_availability;
    create policy cfsp_sp_availability_select on public.sp_availability
      for select to authenticated
      using (
        public.cfsp_highest_membership_role(organization_id) in ('platform_owner', 'org_admin', 'sim_ops', 'faculty', 'viewer')
        or public.cfsp_matches_sp(sp_id)
      );

    drop policy if exists cfsp_sp_availability_insert on public.sp_availability;
    create policy cfsp_sp_availability_insert on public.sp_availability
      for insert to authenticated
      with check (public.cfsp_can_operate_org(organization_id) or public.cfsp_matches_sp(sp_id));

    drop policy if exists cfsp_sp_availability_update on public.sp_availability;
    create policy cfsp_sp_availability_update on public.sp_availability
      for update to authenticated
      using (public.cfsp_can_operate_org(organization_id) or public.cfsp_matches_sp(sp_id))
      with check (public.cfsp_can_operate_org(organization_id) or public.cfsp_matches_sp(sp_id));

    drop policy if exists cfsp_sp_availability_delete on public.sp_availability;
    create policy cfsp_sp_availability_delete on public.sp_availability
      for delete to authenticated
      using (public.cfsp_can_operate_org(organization_id) or public.cfsp_matches_sp(sp_id));
  end if;
end
$do$;

do $do$
begin
  if to_regclass('public.event_learner_attendance') is not null then
    alter table public.event_learner_attendance enable row level security;
    alter table public.event_learner_attendance force row level security;
    revoke all on public.event_learner_attendance from anon;
    grant select, insert, update, delete on public.event_learner_attendance to authenticated;

    drop policy if exists "learner attendance authenticated read" on public.event_learner_attendance;
    drop policy if exists "learner attendance operator manage" on public.event_learner_attendance;
    drop policy if exists cfsp_event_learner_attendance_select on public.event_learner_attendance;
    create policy cfsp_event_learner_attendance_select on public.event_learner_attendance
      for select to authenticated
      using (public.cfsp_can_access_event(event_id));

    drop policy if exists cfsp_event_learner_attendance_insert on public.event_learner_attendance;
    create policy cfsp_event_learner_attendance_insert on public.event_learner_attendance
      for insert to authenticated
      with check (public.cfsp_can_operate_org(organization_id));

    drop policy if exists cfsp_event_learner_attendance_update on public.event_learner_attendance;
    create policy cfsp_event_learner_attendance_update on public.event_learner_attendance
      for update to authenticated
      using (public.cfsp_can_operate_org(organization_id))
      with check (public.cfsp_can_operate_org(organization_id));

    drop policy if exists cfsp_event_learner_attendance_delete on public.event_learner_attendance;
    create policy cfsp_event_learner_attendance_delete on public.event_learner_attendance
      for delete to authenticated
      using (public.cfsp_can_operate_org(organization_id));
  end if;
end
$do$;

do $do$
begin
  if to_regclass('public.simvitals_comments') is not null then
    alter table public.simvitals_comments enable row level security;
    alter table public.simvitals_comments force row level security;
    revoke all on public.simvitals_comments from anon;
    grant select, insert, update, delete on public.simvitals_comments to authenticated;

    drop policy if exists "Authenticated users can read SimVitals comments" on public.simvitals_comments;
    drop policy if exists "Authenticated users can create SimVitals comments" on public.simvitals_comments;
    drop policy if exists cfsp_simvitals_comments_select on public.simvitals_comments;
    create policy cfsp_simvitals_comments_select on public.simvitals_comments
      for select to authenticated
      using (
        exists (
          select 1
          from public.simvitals_posts p
          where p.id = post_id
            and public.cfsp_has_active_org_membership(p.organization_id)
        )
      );

    drop policy if exists cfsp_simvitals_comments_insert on public.simvitals_comments;
    create policy cfsp_simvitals_comments_insert on public.simvitals_comments
      for insert to authenticated
      with check (
        auth.uid() = author_user_id
        and exists (
          select 1
          from public.simvitals_posts p
          where p.id = post_id
            and public.cfsp_has_active_org_membership(p.organization_id)
        )
      );

    drop policy if exists cfsp_simvitals_comments_update on public.simvitals_comments;
    create policy cfsp_simvitals_comments_update on public.simvitals_comments
      for update to authenticated
      using (
        (auth.uid() = author_user_id or exists (
          select 1
          from public.simvitals_posts p
          where p.id = post_id
            and public.cfsp_can_operate_org(p.organization_id)
        ))
        and exists (
          select 1
          from public.simvitals_posts p
          where p.id = post_id
            and public.cfsp_has_active_org_membership(p.organization_id)
        )
      )
      with check (
        (auth.uid() = author_user_id or exists (
          select 1
          from public.simvitals_posts p
          where p.id = post_id
            and public.cfsp_can_operate_org(p.organization_id)
        ))
        and exists (
          select 1
          from public.simvitals_posts p
          where p.id = post_id
            and public.cfsp_has_active_org_membership(p.organization_id)
        )
      );

    drop policy if exists cfsp_simvitals_comments_delete on public.simvitals_comments;
    create policy cfsp_simvitals_comments_delete on public.simvitals_comments
      for delete to authenticated
      using (
        auth.uid() = author_user_id
        or exists (
          select 1
          from public.simvitals_posts p
          where p.id = post_id
            and public.cfsp_can_operate_org(p.organization_id)
        )
      );
  end if;
end
$do$;

do $do$
begin
  if to_regclass('public.simvitals_reactions') is not null then
    alter table public.simvitals_reactions enable row level security;
    alter table public.simvitals_reactions force row level security;
    revoke all on public.simvitals_reactions from anon;
    grant select, insert, update, delete on public.simvitals_reactions to authenticated;

    drop policy if exists "Authenticated users can read SimVitals reactions" on public.simvitals_reactions;
    drop policy if exists "Authenticated users can create their SimVitals reactions" on public.simvitals_reactions;
    drop policy if exists "Authenticated users can remove their SimVitals reactions" on public.simvitals_reactions;
    drop policy if exists cfsp_simvitals_reactions_select on public.simvitals_reactions;
    create policy cfsp_simvitals_reactions_select on public.simvitals_reactions
      for select to authenticated
      using (
        exists (
          select 1
          from public.simvitals_posts p
          where p.id = post_id
            and public.cfsp_has_active_org_membership(p.organization_id)
        )
      );

    drop policy if exists cfsp_simvitals_reactions_insert on public.simvitals_reactions;
    create policy cfsp_simvitals_reactions_insert on public.simvitals_reactions
      for insert to authenticated
      with check (
        auth.uid() = user_id
        and exists (
          select 1
          from public.simvitals_posts p
          where p.id = post_id
            and public.cfsp_has_active_org_membership(p.organization_id)
        )
      );

    drop policy if exists cfsp_simvitals_reactions_update on public.simvitals_reactions;
    create policy cfsp_simvitals_reactions_update on public.simvitals_reactions
      for update to authenticated
      using (
        auth.uid() = user_id
        or exists (
          select 1
          from public.simvitals_posts p
          where p.id = post_id
            and public.cfsp_can_operate_org(p.organization_id)
        )
      )
      with check (
        auth.uid() = user_id
        or exists (
          select 1
          from public.simvitals_posts p
          where p.id = post_id
            and public.cfsp_can_operate_org(p.organization_id)
        )
      );

    drop policy if exists cfsp_simvitals_reactions_delete on public.simvitals_reactions;
    create policy cfsp_simvitals_reactions_delete on public.simvitals_reactions
      for delete to authenticated
      using (
        auth.uid() = user_id
        or exists (
          select 1
          from public.simvitals_posts p
          where p.id = post_id
            and public.cfsp_can_operate_org(p.organization_id)
        )
      );
  end if;
end
$do$;

do $do$
declare
  table_name text;
begin
  foreach table_name in array array[
    'event_materials',
    'materials',
    'attachments',
    'training_materials',
    'announcements',
    'alarms',
    'event_announcements'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('alter table public.%I force row level security', table_name);
      execute format('revoke all on public.%I from anon', table_name);
      execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);

      execute format('drop policy if exists cfsp_%I_select on public.%I', table_name, table_name);
      execute format(
        'create policy cfsp_%I_select on public.%I for select to authenticated using (public.cfsp_has_active_org_membership(organization_id))',
        table_name,
        table_name
      );

      execute format('drop policy if exists cfsp_%I_insert on public.%I', table_name, table_name);
      execute format(
        'create policy cfsp_%I_insert on public.%I for insert to authenticated with check (public.cfsp_can_operate_org(organization_id))',
        table_name,
        table_name
      );

      execute format('drop policy if exists cfsp_%I_update on public.%I', table_name, table_name);
      execute format(
        'create policy cfsp_%I_update on public.%I for update to authenticated using (public.cfsp_can_operate_org(organization_id)) with check (public.cfsp_can_operate_org(organization_id))',
        table_name,
        table_name
      );

      execute format('drop policy if exists cfsp_%I_delete on public.%I', table_name, table_name);
      execute format(
        'create policy cfsp_%I_delete on public.%I for delete to authenticated using (public.cfsp_can_operate_org(organization_id))',
        table_name,
        table_name
      );
    end if;
  end loop;
end
$do$;
