-- CFSP trial security RLS lockdown
-- Safe/idempotent public-schema hardening for the current CFSP app tables.
-- This migration enables RLS, removes anonymous table privileges, and replaces broad
-- authenticated policies with role-aware policies where the table contains sensitive data.

create or replace function public.cfsp_normalize_role(raw_role text)
returns text
language sql
immutable
as $function$
  select case lower(replace(coalesce(raw_role, ''), '-', '_'))
    when 'sp' then 'sp'
    when 'faculty' then 'faculty'
    when 'sim_op' then 'sim_op'
    when 'sim_ops' then 'sim_op'
    when 'admin' then 'admin'
    when 'super_admin' then 'super_admin'
    else 'sp'
  end;
$function$;

create or replace function public.cfsp_current_token_role()
returns text
language sql
stable
as $function$
  select public.cfsp_normalize_role(
    coalesce(
      auth.jwt() ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'role',
      'sp'
    )
  );
$function$;

create or replace function public.cfsp_current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(
    (
      select public.cfsp_normalize_role(p.role)
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    public.cfsp_current_token_role()
  );
$function$;

create or replace function public.cfsp_is_staff_reader()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select public.cfsp_current_profile_role() in ('faculty', 'sim_op', 'admin', 'super_admin');
$function$;

create or replace function public.cfsp_is_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select public.cfsp_current_profile_role() in ('sim_op', 'admin', 'super_admin');
$function$;

create or replace function public.cfsp_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select public.cfsp_current_profile_role() in ('admin', 'super_admin');
$function$;

create or replace function public.cfsp_current_user_email()
returns text
language sql
stable
as $function$
  select lower(trim(coalesce(auth.jwt() ->> 'email', '')));
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
  select
    public.cfsp_is_staff_reader()
    or exists (
      select 1
      from public.event_sps es
      join public.sps s on s.id = es.sp_id
      where es.event_id = target_event_id
        and public.cfsp_current_user_email() <> ''
        and (
          lower(trim(coalesce(s.working_email, ''))) = public.cfsp_current_user_email()
          or lower(trim(coalesce(s.email, ''))) = public.cfsp_current_user_email()
        )
    );
$function$;

create or replace function public.cfsp_public_table_has_column(table_name text, column_name text)
returns boolean
language sql
stable
as $function$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = $1
      and column_name = $2
  );
$function$;

grant execute on function public.cfsp_normalize_role(text) to authenticated;
grant execute on function public.cfsp_current_token_role() to authenticated;
grant execute on function public.cfsp_current_profile_role() to authenticated;
grant execute on function public.cfsp_is_staff_reader() to authenticated;
grant execute on function public.cfsp_is_operator() to authenticated;
grant execute on function public.cfsp_is_admin() to authenticated;
grant execute on function public.cfsp_current_user_email() to authenticated;
grant execute on function public.cfsp_matches_sp(uuid) to authenticated;
grant execute on function public.cfsp_can_access_event(uuid) to authenticated;
grant execute on function public.cfsp_public_table_has_column(text, text) to authenticated;

-- Profiles: users can read their own profile; staff can read profiles; only admins manage roles broadly.
do $do$
begin
  if to_regclass('public.profiles') is not null then
    execute $sql$alter table public.profiles enable row level security$sql$;
    execute $sql$alter table public.profiles force row level security$sql$;
    execute $sql$revoke all on public.profiles from anon$sql$;
    execute $sql$revoke all on public.profiles from public$sql$;
    execute $sql$grant select, insert, update, delete on public.profiles to authenticated$sql$;

    execute $sql$drop policy if exists cfsp_profiles_select_self on public.profiles$sql$;
    execute $sql$create policy cfsp_profiles_select_self on public.profiles
      for select to authenticated
      using (id = auth.uid())$sql$;

    execute $sql$drop policy if exists cfsp_profiles_select_staff on public.profiles$sql$;
    execute $sql$create policy cfsp_profiles_select_staff on public.profiles
      for select to authenticated
      using (public.cfsp_is_staff_reader())$sql$;

    execute $sql$drop policy if exists cfsp_profiles_insert_self on public.profiles$sql$;
    execute $sql$create policy cfsp_profiles_insert_self on public.profiles
      for insert to authenticated
      with check (
        id = auth.uid()
        and public.cfsp_normalize_role(role) in ('sp', 'faculty')
      )$sql$;

    execute $sql$drop policy if exists cfsp_profiles_update_self on public.profiles$sql$;
    execute $sql$create policy cfsp_profiles_update_self on public.profiles
      for update to authenticated
      using (id = auth.uid())
      with check (
        id = auth.uid()
        and public.cfsp_normalize_role(role) = public.cfsp_current_profile_role()
      )$sql$;

    execute $sql$drop policy if exists cfsp_profiles_manage_admin on public.profiles$sql$;
    execute $sql$create policy cfsp_profiles_manage_admin on public.profiles
      for all to authenticated
      using (public.cfsp_is_admin())
      with check (public.cfsp_is_admin())$sql$;
  end if;
end
$do$;

-- Events: staff/faculty can read; assigned SPs can read only their own event; operators manage.
do $do$
begin
  if to_regclass('public.events') is not null then
    execute $sql$alter table public.events enable row level security$sql$;
    execute $sql$alter table public.events force row level security$sql$;
    execute $sql$revoke all on public.events from anon$sql$;
    execute $sql$revoke all on public.events from public$sql$;
    execute $sql$grant select, insert, update, delete on public.events to authenticated$sql$;

    execute $sql$drop policy if exists cfsp_events_select on public.events$sql$;
    execute $sql$create policy cfsp_events_select on public.events
      for select to authenticated
      using (public.cfsp_can_access_event(id))$sql$;

    execute $sql$drop policy if exists cfsp_events_insert on public.events$sql$;
    execute $sql$create policy cfsp_events_insert on public.events
      for insert to authenticated
      with check (public.cfsp_is_operator())$sql$;

    execute $sql$drop policy if exists cfsp_events_update on public.events$sql$;
    execute $sql$create policy cfsp_events_update on public.events
      for update to authenticated
      using (public.cfsp_is_operator())
      with check (public.cfsp_is_operator())$sql$;

    execute $sql$drop policy if exists cfsp_events_delete on public.events$sql$;
    execute $sql$create policy cfsp_events_delete on public.events
      for delete to authenticated
      using (public.cfsp_is_operator())$sql$;
  end if;
end
$do$;

-- Event sessions: same event access model as events.
do $do$
begin
  if to_regclass('public.event_sessions') is not null then
    execute $sql$alter table public.event_sessions enable row level security$sql$;
    execute $sql$alter table public.event_sessions force row level security$sql$;
    execute $sql$revoke all on public.event_sessions from anon$sql$;
    execute $sql$revoke all on public.event_sessions from public$sql$;
    execute $sql$grant select, insert, update, delete on public.event_sessions to authenticated$sql$;

    execute $sql$drop policy if exists cfsp_event_sessions_select on public.event_sessions$sql$;
    execute $sql$create policy cfsp_event_sessions_select on public.event_sessions
      for select to authenticated
      using (public.cfsp_can_access_event(event_id))$sql$;

    execute $sql$drop policy if exists cfsp_event_sessions_insert on public.event_sessions$sql$;
    execute $sql$create policy cfsp_event_sessions_insert on public.event_sessions
      for insert to authenticated
      with check (public.cfsp_is_operator())$sql$;

    execute $sql$drop policy if exists cfsp_event_sessions_update on public.event_sessions$sql$;
    execute $sql$create policy cfsp_event_sessions_update on public.event_sessions
      for update to authenticated
      using (public.cfsp_is_operator())
      with check (public.cfsp_is_operator())$sql$;

    execute $sql$drop policy if exists cfsp_event_sessions_delete on public.event_sessions$sql$;
    execute $sql$create policy cfsp_event_sessions_delete on public.event_sessions
      for delete to authenticated
      using (public.cfsp_is_operator())$sql$;
  end if;
end
$do$;

-- SP directory: staff can read; an SP can read their own row; operators manage the directory.
do $do$
begin
  if to_regclass('public.sps') is not null then
    execute $sql$alter table public.sps enable row level security$sql$;
    execute $sql$alter table public.sps force row level security$sql$;
    execute $sql$revoke all on public.sps from anon$sql$;
    execute $sql$revoke all on public.sps from public$sql$;
    execute $sql$grant select, insert, update, delete on public.sps to authenticated$sql$;

    execute $sql$drop policy if exists cfsp_sps_select_staff on public.sps$sql$;
    execute $sql$create policy cfsp_sps_select_staff on public.sps
      for select to authenticated
      using (public.cfsp_is_staff_reader())$sql$;

    execute $sql$drop policy if exists cfsp_sps_select_self on public.sps$sql$;
    execute $sql$create policy cfsp_sps_select_self on public.sps
      for select to authenticated
      using (public.cfsp_matches_sp(id))$sql$;

    execute $sql$drop policy if exists cfsp_sps_insert on public.sps$sql$;
    execute $sql$create policy cfsp_sps_insert on public.sps
      for insert to authenticated
      with check (public.cfsp_is_operator())$sql$;

    execute $sql$drop policy if exists cfsp_sps_update on public.sps$sql$;
    execute $sql$create policy cfsp_sps_update on public.sps
      for update to authenticated
      using (public.cfsp_is_operator())
      with check (public.cfsp_is_operator())$sql$;

    execute $sql$drop policy if exists cfsp_sps_delete on public.sps$sql$;
    execute $sql$create policy cfsp_sps_delete on public.sps
      for delete to authenticated
      using (public.cfsp_is_operator())$sql$;
  end if;
end
$do$;

-- Event/SP assignments: staff can read; assigned SPs can read/update their own assignment; operators manage.
do $do$
begin
  if to_regclass('public.event_sps') is not null then
    execute $sql$alter table public.event_sps enable row level security$sql$;
    execute $sql$alter table public.event_sps force row level security$sql$;
    execute $sql$revoke all on public.event_sps from anon$sql$;
    execute $sql$revoke all on public.event_sps from public$sql$;
    execute $sql$grant select, insert, update, delete on public.event_sps to authenticated$sql$;

    execute $sql$drop policy if exists cfsp_event_sps_select_staff on public.event_sps$sql$;
    execute $sql$create policy cfsp_event_sps_select_staff on public.event_sps
      for select to authenticated
      using (public.cfsp_is_staff_reader())$sql$;

    execute $sql$drop policy if exists cfsp_event_sps_select_self on public.event_sps$sql$;
    execute $sql$create policy cfsp_event_sps_select_self on public.event_sps
      for select to authenticated
      using (public.cfsp_matches_sp(sp_id))$sql$;

    execute $sql$drop policy if exists cfsp_event_sps_insert on public.event_sps$sql$;
    execute $sql$create policy cfsp_event_sps_insert on public.event_sps
      for insert to authenticated
      with check (public.cfsp_is_operator() or public.cfsp_matches_sp(sp_id))$sql$;

    execute $sql$drop policy if exists cfsp_event_sps_update on public.event_sps$sql$;
    execute $sql$create policy cfsp_event_sps_update on public.event_sps
      for update to authenticated
      using (public.cfsp_is_operator() or public.cfsp_matches_sp(sp_id))
      with check (public.cfsp_is_operator() or public.cfsp_matches_sp(sp_id))$sql$;

    execute $sql$drop policy if exists cfsp_event_sps_delete on public.event_sps$sql$;
    execute $sql$create policy cfsp_event_sps_delete on public.event_sps
      for delete to authenticated
      using (public.cfsp_is_operator())$sql$;
  end if;
end
$do$;

-- Availability: staff can read/manage; SPs can manage only their own availability rows.
do $do$
begin
  if to_regclass('public.sp_availability') is not null then
    execute $sql$alter table public.sp_availability enable row level security$sql$;
    execute $sql$alter table public.sp_availability force row level security$sql$;
    execute $sql$revoke all on public.sp_availability from anon$sql$;
    execute $sql$revoke all on public.sp_availability from public$sql$;
    execute $sql$grant select, insert, update, delete on public.sp_availability to authenticated$sql$;

    execute $sql$drop policy if exists cfsp_sp_availability_select on public.sp_availability$sql$;
    execute $sql$create policy cfsp_sp_availability_select on public.sp_availability
      for select to authenticated
      using (public.cfsp_is_staff_reader() or public.cfsp_matches_sp(sp_id))$sql$;

    execute $sql$drop policy if exists cfsp_sp_availability_insert on public.sp_availability$sql$;
    execute $sql$create policy cfsp_sp_availability_insert on public.sp_availability
      for insert to authenticated
      with check (public.cfsp_is_operator() or public.cfsp_matches_sp(sp_id))$sql$;

    execute $sql$drop policy if exists cfsp_sp_availability_update on public.sp_availability$sql$;
    execute $sql$create policy cfsp_sp_availability_update on public.sp_availability
      for update to authenticated
      using (public.cfsp_is_operator() or public.cfsp_matches_sp(sp_id))
      with check (public.cfsp_is_operator() or public.cfsp_matches_sp(sp_id))$sql$;

    execute $sql$drop policy if exists cfsp_sp_availability_delete on public.sp_availability$sql$;
    execute $sql$create policy cfsp_sp_availability_delete on public.sp_availability
      for delete to authenticated
      using (public.cfsp_is_operator() or public.cfsp_matches_sp(sp_id))$sql$;
  end if;
end
$do$;

-- Email templates: active templates are readable by signed-in users; only operators manage templates.
do $do$
begin
  if to_regclass('public.email_templates') is not null then
    execute $sql$alter table public.email_templates enable row level security$sql$;
    execute $sql$alter table public.email_templates force row level security$sql$;
    execute $sql$revoke all on public.email_templates from anon$sql$;
    execute $sql$revoke all on public.email_templates from public$sql$;
    execute $sql$grant select, insert, update, delete on public.email_templates to authenticated$sql$;

    execute $sql$drop policy if exists "email templates authenticated read" on public.email_templates$sql$;
    execute $sql$drop policy if exists "email templates operator manage" on public.email_templates$sql$;
    execute $sql$drop policy if exists cfsp_email_templates_select on public.email_templates$sql$;
    execute $sql$create policy cfsp_email_templates_select on public.email_templates
      for select to authenticated
      using (is_active = true or public.cfsp_is_operator())$sql$;

    execute $sql$drop policy if exists cfsp_email_templates_insert on public.email_templates$sql$;
    execute $sql$create policy cfsp_email_templates_insert on public.email_templates
      for insert to authenticated
      with check (public.cfsp_is_operator())$sql$;

    execute $sql$drop policy if exists cfsp_email_templates_update on public.email_templates$sql$;
    execute $sql$create policy cfsp_email_templates_update on public.email_templates
      for update to authenticated
      using (public.cfsp_is_operator())
      with check (public.cfsp_is_operator())$sql$;

    execute $sql$drop policy if exists cfsp_email_templates_delete on public.email_templates$sql$;
    execute $sql$create policy cfsp_email_templates_delete on public.email_templates
      for delete to authenticated
      using (public.cfsp_is_operator())$sql$;
  end if;
end
$do$;

-- Learner attendance: learner roster/attendance is operational data, not broad SP/private/public data.
do $do$
begin
  if to_regclass('public.event_learner_attendance') is not null then
    execute $sql$alter table public.event_learner_attendance enable row level security$sql$;
    execute $sql$alter table public.event_learner_attendance force row level security$sql$;
    execute $sql$revoke all on public.event_learner_attendance from anon$sql$;
    execute $sql$revoke all on public.event_learner_attendance from public$sql$;
    execute $sql$grant select, insert, update, delete on public.event_learner_attendance to authenticated$sql$;

    execute $sql$drop policy if exists "learner attendance authenticated read" on public.event_learner_attendance$sql$;
    execute $sql$drop policy if exists "learner attendance operator manage" on public.event_learner_attendance$sql$;
    execute $sql$drop policy if exists cfsp_event_learner_attendance_select on public.event_learner_attendance$sql$;
    execute $sql$create policy cfsp_event_learner_attendance_select on public.event_learner_attendance
      for select to authenticated
      using (public.cfsp_is_staff_reader())$sql$;

    execute $sql$drop policy if exists cfsp_event_learner_attendance_insert on public.event_learner_attendance$sql$;
    execute $sql$create policy cfsp_event_learner_attendance_insert on public.event_learner_attendance
      for insert to authenticated
      with check (public.cfsp_is_operator())$sql$;

    execute $sql$drop policy if exists cfsp_event_learner_attendance_update on public.event_learner_attendance$sql$;
    execute $sql$create policy cfsp_event_learner_attendance_update on public.event_learner_attendance
      for update to authenticated
      using (public.cfsp_is_operator())
      with check (public.cfsp_is_operator())$sql$;

    execute $sql$drop policy if exists cfsp_event_learner_attendance_delete on public.event_learner_attendance$sql$;
    execute $sql$create policy cfsp_event_learner_attendance_delete on public.event_learner_attendance
      for delete to authenticated
      using (public.cfsp_is_operator())$sql$;
  end if;
end
$do$;

-- SimVitals is an internal signed-in operational feed. No anonymous access; authors/operators manage edits.
do $do$
begin
  if to_regclass('public.simvitals_posts') is not null then
    execute $sql$alter table public.simvitals_posts enable row level security$sql$;
    execute $sql$alter table public.simvitals_posts force row level security$sql$;
    execute $sql$revoke all on public.simvitals_posts from anon$sql$;
    execute $sql$revoke all on public.simvitals_posts from public$sql$;
    execute $sql$grant select, insert, update, delete on public.simvitals_posts to authenticated$sql$;

    execute $sql$drop policy if exists "Authenticated users can read SimVitals posts" on public.simvitals_posts$sql$;
    execute $sql$drop policy if exists "Authenticated users can create SimVitals posts" on public.simvitals_posts$sql$;
    execute $sql$drop policy if exists cfsp_simvitals_posts_select on public.simvitals_posts$sql$;
    execute $sql$create policy cfsp_simvitals_posts_select on public.simvitals_posts
      for select to authenticated
      using (true)$sql$;

    execute $sql$drop policy if exists cfsp_simvitals_posts_insert on public.simvitals_posts$sql$;
    execute $sql$create policy cfsp_simvitals_posts_insert on public.simvitals_posts
      for insert to authenticated
      with check (auth.uid() = author_user_id)$sql$;

    execute $sql$drop policy if exists cfsp_simvitals_posts_update on public.simvitals_posts$sql$;
    execute $sql$create policy cfsp_simvitals_posts_update on public.simvitals_posts
      for update to authenticated
      using (auth.uid() = author_user_id or public.cfsp_is_operator())
      with check (auth.uid() = author_user_id or public.cfsp_is_operator())$sql$;

    execute $sql$drop policy if exists cfsp_simvitals_posts_delete on public.simvitals_posts$sql$;
    execute $sql$create policy cfsp_simvitals_posts_delete on public.simvitals_posts
      for delete to authenticated
      using (auth.uid() = author_user_id or public.cfsp_is_operator())$sql$;
  end if;
end
$do$;

do $do$
begin
  if to_regclass('public.simvitals_comments') is not null then
    execute $sql$alter table public.simvitals_comments enable row level security$sql$;
    execute $sql$alter table public.simvitals_comments force row level security$sql$;
    execute $sql$revoke all on public.simvitals_comments from anon$sql$;
    execute $sql$revoke all on public.simvitals_comments from public$sql$;
    execute $sql$grant select, insert, update, delete on public.simvitals_comments to authenticated$sql$;

    execute $sql$drop policy if exists "Authenticated users can read SimVitals comments" on public.simvitals_comments$sql$;
    execute $sql$drop policy if exists "Authenticated users can create SimVitals comments" on public.simvitals_comments$sql$;
    execute $sql$drop policy if exists cfsp_simvitals_comments_select on public.simvitals_comments$sql$;
    execute $sql$create policy cfsp_simvitals_comments_select on public.simvitals_comments
      for select to authenticated
      using (true)$sql$;

    execute $sql$drop policy if exists cfsp_simvitals_comments_insert on public.simvitals_comments$sql$;
    execute $sql$create policy cfsp_simvitals_comments_insert on public.simvitals_comments
      for insert to authenticated
      with check (auth.uid() = author_user_id)$sql$;

    execute $sql$drop policy if exists cfsp_simvitals_comments_update on public.simvitals_comments$sql$;
    execute $sql$create policy cfsp_simvitals_comments_update on public.simvitals_comments
      for update to authenticated
      using (auth.uid() = author_user_id or public.cfsp_is_operator())
      with check (auth.uid() = author_user_id or public.cfsp_is_operator())$sql$;

    execute $sql$drop policy if exists cfsp_simvitals_comments_delete on public.simvitals_comments$sql$;
    execute $sql$create policy cfsp_simvitals_comments_delete on public.simvitals_comments
      for delete to authenticated
      using (auth.uid() = author_user_id or public.cfsp_is_operator())$sql$;
  end if;
end
$do$;

do $do$
begin
  if to_regclass('public.simvitals_reactions') is not null then
    execute $sql$alter table public.simvitals_reactions enable row level security$sql$;
    execute $sql$alter table public.simvitals_reactions force row level security$sql$;
    execute $sql$revoke all on public.simvitals_reactions from anon$sql$;
    execute $sql$revoke all on public.simvitals_reactions from public$sql$;
    execute $sql$grant select, insert, update, delete on public.simvitals_reactions to authenticated$sql$;

    execute $sql$drop policy if exists "Authenticated users can read SimVitals reactions" on public.simvitals_reactions$sql$;
    execute $sql$drop policy if exists "Authenticated users can create their SimVitals reactions" on public.simvitals_reactions$sql$;
    execute $sql$drop policy if exists "Authenticated users can remove their SimVitals reactions" on public.simvitals_reactions$sql$;
    execute $sql$drop policy if exists cfsp_simvitals_reactions_select on public.simvitals_reactions$sql$;
    execute $sql$create policy cfsp_simvitals_reactions_select on public.simvitals_reactions
      for select to authenticated
      using (true)$sql$;

    execute $sql$drop policy if exists cfsp_simvitals_reactions_insert on public.simvitals_reactions$sql$;
    execute $sql$create policy cfsp_simvitals_reactions_insert on public.simvitals_reactions
      for insert to authenticated
      with check (auth.uid() = user_id)$sql$;

    execute $sql$drop policy if exists cfsp_simvitals_reactions_update on public.simvitals_reactions$sql$;
    execute $sql$create policy cfsp_simvitals_reactions_update on public.simvitals_reactions
      for update to authenticated
      using (auth.uid() = user_id or public.cfsp_is_operator())
      with check (auth.uid() = user_id or public.cfsp_is_operator())$sql$;

    execute $sql$drop policy if exists cfsp_simvitals_reactions_delete on public.simvitals_reactions$sql$;
    execute $sql$create policy cfsp_simvitals_reactions_delete on public.simvitals_reactions
      for delete to authenticated
      using (auth.uid() = user_id or public.cfsp_is_operator())$sql$;
  end if;
end
$do$;

-- Legacy/optional assignment and material tables observed in older CFSP naming.
-- These are locked to staff read + operator management when they exist. Public poll pages
-- should continue to use API routes instead of direct anonymous table policies.
do $do$
declare
  table_name text;
begin
  foreach table_name in array array[
    'assignments',
    'event_assignments',
    'event_sp_assignments',
    'event_materials',
    'materials',
    'attachments',
    'training_materials'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('alter table public.%I force row level security', table_name);
      execute format('revoke all on public.%I from anon', table_name);
      execute format('revoke all on public.%I from public', table_name);
      execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);

      execute format('drop policy if exists cfsp_%I_select on public.%I', table_name, table_name);
      execute format('create policy cfsp_%I_select on public.%I for select to authenticated using (public.cfsp_is_staff_reader())', table_name, table_name);

      execute format('drop policy if exists cfsp_%I_insert on public.%I', table_name, table_name);
      execute format('create policy cfsp_%I_insert on public.%I for insert to authenticated with check (public.cfsp_is_operator())', table_name, table_name);

      execute format('drop policy if exists cfsp_%I_update on public.%I', table_name, table_name);
      execute format('create policy cfsp_%I_update on public.%I for update to authenticated using (public.cfsp_is_operator()) with check (public.cfsp_is_operator())', table_name, table_name);

      execute format('drop policy if exists cfsp_%I_delete on public.%I', table_name, table_name);
      execute format('create policy cfsp_%I_delete on public.%I for delete to authenticated using (public.cfsp_is_operator())', table_name, table_name);
    end if;
  end loop;
end
$do$;
