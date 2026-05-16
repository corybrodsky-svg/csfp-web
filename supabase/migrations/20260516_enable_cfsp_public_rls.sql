-- CFSP public-schema RLS hardening
-- Safe to run in Supabase SQL Editor.
-- Goals:
-- 1. Enable RLS on core CFSP public tables if they exist.
-- 2. Keep anon access off sensitive operational tables.
-- 3. Preserve the current CFSP model where authenticated users go through same-origin API routes.
-- 4. Allow staff/faculty broad read access, operator write access, and limited self/assignment access for SP users.

create or replace function public.cfsp_normalize_role(raw_role text)
returns text
language sql
immutable
as $$
  select case lower(replace(coalesce(raw_role, ''), '-', '_'))
    when 'sp' then 'sp'
    when 'faculty' then 'faculty'
    when 'sim_op' then 'sim_op'
    when 'admin' then 'admin'
    when 'super_admin' then 'super_admin'
    else 'sp'
  end;
$$;

create or replace function public.cfsp_current_token_role()
returns text
language sql
stable
as $$
  select public.cfsp_normalize_role(
    coalesce(
      auth.jwt() ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'role',
      'sp'
    )
  );
$$;

create or replace function public.cfsp_current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select public.cfsp_normalize_role(p.role)
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    public.cfsp_current_token_role()
  );
$$;

create or replace function public.cfsp_is_staff_reader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cfsp_current_profile_role() in ('faculty', 'sim_op', 'admin', 'super_admin');
$$;

create or replace function public.cfsp_is_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cfsp_current_profile_role() in ('sim_op', 'admin', 'super_admin');
$$;

create or replace function public.cfsp_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cfsp_current_profile_role() in ('admin', 'super_admin');
$$;

create or replace function public.cfsp_current_user_email()
returns text
language sql
stable
as $$
  select lower(trim(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function public.cfsp_matches_sp(target_sp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sps s
    where s.id = target_sp_id
      and (
        lower(trim(coalesce(s.working_email, ''))) = public.cfsp_current_user_email()
        or lower(trim(coalesce(s.email, ''))) = public.cfsp_current_user_email()
      )
  );
$$;

create or replace function public.cfsp_can_access_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.cfsp_is_staff_reader()
    or exists (
      select 1
      from public.event_sps es
      join public.sps s on s.id = es.sp_id
      where es.event_id = target_event_id
        and (
          lower(trim(coalesce(s.working_email, ''))) = public.cfsp_current_user_email()
          or lower(trim(coalesce(s.email, ''))) = public.cfsp_current_user_email()
        )
    );
$$;

do $$
begin
  if to_regclass('public.profiles') is not null then
    execute 'alter table public.profiles enable row level security';
    execute 'alter table public.profiles force row level security';
    execute 'revoke all on public.profiles from anon';
    execute 'grant select, insert, update, delete on public.profiles to authenticated';

    execute 'drop policy if exists cfsp_profiles_select_self on public.profiles';
    execute 'create policy cfsp_profiles_select_self on public.profiles for select to authenticated using (id = auth.uid())';

    execute 'drop policy if exists cfsp_profiles_select_staff on public.profiles';
    execute 'create policy cfsp_profiles_select_staff on public.profiles for select to authenticated using (public.cfsp_is_staff_reader())';

    execute 'drop policy if exists cfsp_profiles_insert_self on public.profiles';
    execute $$create policy cfsp_profiles_insert_self on public.profiles
      for insert to authenticated
      with check (
        id = auth.uid()
        and public.cfsp_normalize_role(role) = public.cfsp_current_token_role()
      )$$;

    execute 'drop policy if exists cfsp_profiles_update_self on public.profiles';
    execute $$create policy cfsp_profiles_update_self on public.profiles
      for update to authenticated
      using (id = auth.uid())
      with check (
        id = auth.uid()
        and public.cfsp_normalize_role(role) = public.cfsp_current_token_role()
      )$$;

    execute 'drop policy if exists cfsp_profiles_manage_admin on public.profiles';
    execute $$create policy cfsp_profiles_manage_admin on public.profiles
      for all to authenticated
      using (public.cfsp_is_admin())
      with check (public.cfsp_is_admin())$$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.events') is not null then
    execute 'alter table public.events enable row level security';
    execute 'alter table public.events force row level security';
    execute 'revoke all on public.events from anon';
    execute 'grant select, insert, update, delete on public.events to authenticated';

    execute 'drop policy if exists cfsp_events_select on public.events';
    execute 'create policy cfsp_events_select on public.events for select to authenticated using (public.cfsp_is_staff_reader() or public.cfsp_can_access_event(id))';

    execute 'drop policy if exists cfsp_events_insert on public.events';
    execute 'create policy cfsp_events_insert on public.events for insert to authenticated with check (public.cfsp_is_operator())';

    execute 'drop policy if exists cfsp_events_update on public.events';
    execute 'create policy cfsp_events_update on public.events for update to authenticated using (public.cfsp_is_operator()) with check (public.cfsp_is_operator())';

    execute 'drop policy if exists cfsp_events_delete on public.events';
    execute 'create policy cfsp_events_delete on public.events for delete to authenticated using (public.cfsp_is_operator())';
  end if;
end $$;

do $$
begin
  if to_regclass('public.event_sessions') is not null then
    execute 'alter table public.event_sessions enable row level security';
    execute 'alter table public.event_sessions force row level security';
    execute 'revoke all on public.event_sessions from anon';
    execute 'grant select, insert, update, delete on public.event_sessions to authenticated';

    execute 'drop policy if exists cfsp_event_sessions_select on public.event_sessions';
    execute 'create policy cfsp_event_sessions_select on public.event_sessions for select to authenticated using (public.cfsp_is_staff_reader() or public.cfsp_can_access_event(event_id))';

    execute 'drop policy if exists cfsp_event_sessions_insert on public.event_sessions';
    execute 'create policy cfsp_event_sessions_insert on public.event_sessions for insert to authenticated with check (public.cfsp_is_operator())';

    execute 'drop policy if exists cfsp_event_sessions_update on public.event_sessions';
    execute 'create policy cfsp_event_sessions_update on public.event_sessions for update to authenticated using (public.cfsp_is_operator()) with check (public.cfsp_is_operator())';

    execute 'drop policy if exists cfsp_event_sessions_delete on public.event_sessions';
    execute 'create policy cfsp_event_sessions_delete on public.event_sessions for delete to authenticated using (public.cfsp_is_operator())';
  end if;
end $$;

do $$
begin
  if to_regclass('public.sps') is not null then
    execute 'alter table public.sps enable row level security';
    execute 'alter table public.sps force row level security';
    execute 'revoke all on public.sps from anon';
    execute 'grant select, insert, update, delete on public.sps to authenticated';

    execute 'drop policy if exists cfsp_sps_select_staff on public.sps';
    execute 'create policy cfsp_sps_select_staff on public.sps for select to authenticated using (public.cfsp_is_staff_reader())';

    execute 'drop policy if exists cfsp_sps_select_self on public.sps';
    execute 'create policy cfsp_sps_select_self on public.sps for select to authenticated using (public.cfsp_matches_sp(id))';

    execute 'drop policy if exists cfsp_sps_insert on public.sps';
    execute 'create policy cfsp_sps_insert on public.sps for insert to authenticated with check (public.cfsp_is_operator())';

    execute 'drop policy if exists cfsp_sps_update on public.sps';
    execute 'create policy cfsp_sps_update on public.sps for update to authenticated using (public.cfsp_is_operator()) with check (public.cfsp_is_operator())';

    execute 'drop policy if exists cfsp_sps_delete on public.sps';
    execute 'create policy cfsp_sps_delete on public.sps for delete to authenticated using (public.cfsp_is_operator())';
  end if;
end $$;

do $$
begin
  if to_regclass('public.event_sps') is not null then
    execute 'alter table public.event_sps enable row level security';
    execute 'alter table public.event_sps force row level security';
    execute 'revoke all on public.event_sps from anon';
    execute 'grant select, insert, update, delete on public.event_sps to authenticated';

    execute 'drop policy if exists cfsp_event_sps_select_staff on public.event_sps';
    execute 'create policy cfsp_event_sps_select_staff on public.event_sps for select to authenticated using (public.cfsp_is_staff_reader())';

    execute 'drop policy if exists cfsp_event_sps_select_self on public.event_sps';
    execute 'create policy cfsp_event_sps_select_self on public.event_sps for select to authenticated using (public.cfsp_matches_sp(sp_id))';

    execute 'drop policy if exists cfsp_event_sps_insert on public.event_sps';
    execute 'create policy cfsp_event_sps_insert on public.event_sps for insert to authenticated with check (public.cfsp_is_operator())';

    execute 'drop policy if exists cfsp_event_sps_update on public.event_sps';
    execute 'create policy cfsp_event_sps_update on public.event_sps for update to authenticated using (public.cfsp_is_operator()) with check (public.cfsp_is_operator())';

    execute 'drop policy if exists cfsp_event_sps_delete on public.event_sps';
    execute 'create policy cfsp_event_sps_delete on public.event_sps for delete to authenticated using (public.cfsp_is_operator())';
  end if;
end $$;

do $$
begin
  if to_regclass('public.sp_availability') is not null then
    execute 'alter table public.sp_availability enable row level security';
    execute 'alter table public.sp_availability force row level security';
    execute 'revoke all on public.sp_availability from anon';
    execute 'grant select, insert, update, delete on public.sp_availability to authenticated';

    execute 'drop policy if exists cfsp_sp_availability_select on public.sp_availability';
    execute 'create policy cfsp_sp_availability_select on public.sp_availability for select to authenticated using (public.cfsp_is_staff_reader() or public.cfsp_matches_sp(sp_id))';

    execute 'drop policy if exists cfsp_sp_availability_insert on public.sp_availability';
    execute 'create policy cfsp_sp_availability_insert on public.sp_availability for insert to authenticated with check (public.cfsp_is_staff_reader() or public.cfsp_matches_sp(sp_id))';

    execute 'drop policy if exists cfsp_sp_availability_update on public.sp_availability';
    execute 'create policy cfsp_sp_availability_update on public.sp_availability for update to authenticated using (public.cfsp_is_staff_reader() or public.cfsp_matches_sp(sp_id)) with check (public.cfsp_is_staff_reader() or public.cfsp_matches_sp(sp_id))';

    execute 'drop policy if exists cfsp_sp_availability_delete on public.sp_availability';
    execute 'create policy cfsp_sp_availability_delete on public.sp_availability for delete to authenticated using (public.cfsp_is_staff_reader() or public.cfsp_matches_sp(sp_id))';
  end if;
end $$;

-- SimVitals tables already have their own migration-backed RLS policies.
-- This keeps them protected if they exist without weakening their current setup.
do $$
declare
  simvitals_table text;
begin
  foreach simvitals_table in array array[
    'simvitals_posts',
    'simvitals_comments',
    'simvitals_reactions'
  ]
  loop
    if to_regclass(format('public.%I', simvitals_table)) is not null then
      execute format('alter table public.%I enable row level security', simvitals_table);
      execute format('alter table public.%I force row level security', simvitals_table);
      execute format('revoke all on public.%I from anon', simvitals_table);
      execute format('grant select, insert, update, delete on public.%I to authenticated', simvitals_table);
    end if;
  end loop;
end $$;
