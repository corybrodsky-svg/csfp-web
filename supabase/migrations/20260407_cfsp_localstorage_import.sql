-- CFSP localStorage-to-Supabase migration.
-- Purpose:
-- 1. Stage old browser localStorage JSON exports without losing raw data.
-- 2. Migrate safely matched events, event sessions, optional SP directory rows, and assignments.
-- 3. Keep unresolved rows in staging for manual review instead of dropping them.
--
-- Expected localStorage exports:
-- - old_events.json from key: cfsp_events_v1
-- - old_event_assignments.json from key: cfsp-event-assignments-v1
-- - optional old_sp_directory.json from key: cfsp-sp-directory-v1

create schema if not exists cfsp_migration;

create table if not exists cfsp_migration.old_events (
  id uuid primary key default gen_random_uuid(),
  legacy_event_id text,
  name text,
  status text,
  date_text text,
  sp_needed integer,
  sp_assigned integer,
  location text,
  notes text,
  updated_at timestamptz,
  sessions jsonb not null default '[]'::jsonb,
  raw jsonb not null,
  target_event_id uuid references public.events(id),
  unresolved_reason text,
  staged_at timestamptz not null default now()
);

create table if not exists cfsp_migration.old_event_assignments (
  id uuid primary key default gen_random_uuid(),
  legacy_assignment_id text,
  legacy_event_id text,
  legacy_sp_id text,
  event_name text,
  sp_name text,
  email text,
  phone text,
  confirmed boolean,
  status text,
  notes text,
  created_at timestamptz,
  raw jsonb not null,
  target_event_id uuid references public.events(id),
  target_sp_id uuid references public.sps(id),
  target_event_sp_id uuid references public.event_sps(id),
  unresolved_reason text,
  staged_at timestamptz not null default now()
);

create table if not exists cfsp_migration.old_sp_directory (
  id uuid primary key default gen_random_uuid(),
  legacy_sp_id text,
  full_name text,
  email text,
  phone text,
  campus text,
  status text,
  notes text,
  created_at timestamptz,
  raw jsonb not null,
  target_sp_id uuid references public.sps(id),
  unresolved_reason text,
  staged_at timestamptz not null default now()
);

create or replace function cfsp_migration.blank_to_null(value text)
returns text
language sql
immutable
as $$
  select nullif(trim(value), '')
$$;

create or replace function cfsp_migration.safe_int(value text)
returns integer
language sql
immutable
as $$
  select case
    when trim(coalesce(value, '')) ~ '^\d+$' then trim(value)::integer
    else null
  end
$$;

create or replace function cfsp_migration.safe_timestamptz(value text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if nullif(trim(coalesce(value, '')), '') is null then
    return null;
  end if;

  return value::timestamptz;
exception
  when others then
    return null;
end;
$$;

create or replace function cfsp_migration.safe_date(value text)
returns date
language plpgsql
immutable
as $$
begin
  if nullif(trim(coalesce(value, '')), '') is null then
    return null;
  end if;

  return value::date;
exception
  when others then
    return null;
end;
$$;

create or replace function cfsp_migration.safe_time(value text)
returns time
language plpgsql
immutable
as $$
begin
  if nullif(trim(coalesce(value, '')), '') is null then
    return null;
  end if;

  return value::time;
exception
  when others then
    return null;
end;
$$;

create or replace function cfsp_migration.normalize_email(value text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(value, '')))
$$;

create or replace function cfsp_migration.normalize_phone(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(value, ''), '\D', '', 'g')
$$;

create or replace function cfsp_migration.normalize_assignment_status(
  legacy_status text,
  legacy_confirmed boolean
)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(legacy_status, ''))) in
      ('invited', 'contacted', 'confirmed', 'declined', 'backup', 'no_show')
      then lower(trim(legacy_status))
    when legacy_confirmed is true then 'confirmed'
    else 'invited'
  end
$$;

create or replace function cfsp_migration.stage_old_events(payload jsonb)
returns integer
language plpgsql
as $$
declare
  inserted_count integer;
begin
  if jsonb_typeof(payload) <> 'array' then
    raise exception 'stage_old_events expects a JSON array';
  end if;

  insert into cfsp_migration.old_events (
    legacy_event_id,
    name,
    status,
    date_text,
    sp_needed,
    sp_assigned,
    location,
    notes,
    updated_at,
    sessions,
    raw
  )
  select
    cfsp_migration.blank_to_null(coalesce(item ->> 'id', item ->> 'event_id', item ->> 'eventId')),
    cfsp_migration.blank_to_null(coalesce(item ->> 'name', item ->> 'title', item ->> 'event_name', item ->> 'eventName')),
    coalesce(cfsp_migration.blank_to_null(coalesce(item ->> 'status', item ->> 'event_status', item ->> 'eventStatus')), 'Draft'),
    cfsp_migration.blank_to_null(coalesce(item ->> 'date_text', item ->> 'dateText', item ->> 'event_date', item ->> 'eventDate', item ->> 'date')),
    cfsp_migration.safe_int(coalesce(item ->> 'sp_needed', item ->> 'spNeeded', item ->> 'needed')),
    cfsp_migration.safe_int(coalesce(item ->> 'sp_assigned', item ->> 'spAssigned', item ->> 'assigned')),
    cfsp_migration.blank_to_null(coalesce(item ->> 'location', item ->> 'room', item ->> 'site')),
    cfsp_migration.blank_to_null(coalesce(item ->> 'notes', item ->> 'description')),
    cfsp_migration.safe_timestamptz(coalesce(item ->> 'updated_at', item ->> 'updatedAt', item ->> 'created_at', item ->> 'createdAt')),
    case when jsonb_typeof(item -> 'sessions') = 'array' then item -> 'sessions' else '[]'::jsonb end,
    item
  from jsonb_array_elements(payload) as item;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function cfsp_migration.stage_old_event_assignments(payload jsonb)
returns integer
language plpgsql
as $$
declare
  inserted_count integer;
begin
  if jsonb_typeof(payload) <> 'array' then
    raise exception 'stage_old_event_assignments expects a JSON array';
  end if;

  insert into cfsp_migration.old_event_assignments (
    legacy_assignment_id,
    legacy_event_id,
    legacy_sp_id,
    event_name,
    sp_name,
    email,
    phone,
    confirmed,
    status,
    notes,
    created_at,
    raw
  )
  select
    cfsp_migration.blank_to_null(coalesce(item ->> 'id', item ->> 'assignment_id', item ->> 'assignmentId')),
    cfsp_migration.blank_to_null(coalesce(item ->> 'eventId', item ->> 'event_id')),
    cfsp_migration.blank_to_null(coalesce(item ->> 'spId', item ->> 'sp_id')),
    cfsp_migration.blank_to_null(coalesce(item ->> 'eventName', item ->> 'event_name')),
    cfsp_migration.blank_to_null(coalesce(item ->> 'spName', item ->> 'sp_name', item ->> 'fullName', item ->> 'full_name')),
    cfsp_migration.blank_to_null(coalesce(item ->> 'email', item ->> 'working_email')),
    cfsp_migration.blank_to_null(item ->> 'phone'),
    case
      when lower(trim(coalesce(item ->> 'confirmed', ''))) in ('true', 't', 'yes', 'y', '1') then true
      when lower(trim(coalesce(item ->> 'confirmed', ''))) in ('false', 'f', 'no', 'n', '0') then false
      else null
    end,
    cfsp_migration.blank_to_null(item ->> 'status'),
    cfsp_migration.blank_to_null(item ->> 'notes'),
    cfsp_migration.safe_timestamptz(coalesce(item ->> 'createdAt', item ->> 'created_at')),
    item
  from jsonb_array_elements(payload) as item;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function cfsp_migration.stage_old_sp_directory(payload jsonb)
returns integer
language plpgsql
as $$
declare
  inserted_count integer;
begin
  if jsonb_typeof(payload) <> 'array' then
    raise exception 'stage_old_sp_directory expects a JSON array';
  end if;

  insert into cfsp_migration.old_sp_directory (
    legacy_sp_id,
    full_name,
    email,
    phone,
    campus,
    status,
    notes,
    created_at,
    raw
  )
  select
    cfsp_migration.blank_to_null(coalesce(item ->> 'id', item ->> 'sp_id', item ->> 'spId')),
    cfsp_migration.blank_to_null(coalesce(item ->> 'fullName', item ->> 'full_name', item ->> 'name')),
    cfsp_migration.blank_to_null(coalesce(item ->> 'email', item ->> 'working_email')),
    cfsp_migration.blank_to_null(item ->> 'phone'),
    cfsp_migration.blank_to_null(item ->> 'campus'),
    coalesce(cfsp_migration.blank_to_null(item ->> 'status'), 'Active'),
    cfsp_migration.blank_to_null(item ->> 'notes'),
    cfsp_migration.safe_timestamptz(coalesce(item ->> 'createdAt', item ->> 'created_at')),
    item
  from jsonb_array_elements(payload) as item;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function cfsp_migration.migrate_old_events()
returns table(inserted_events integer, matched_events integer, inserted_sessions integer)
language plpgsql
as $$
declare
  staged record;
  session_item jsonb;
  found_event_id uuid;
  inserted_event_count integer := 0;
  matched_event_count integer := 0;
  inserted_session_count integer := 0;
  session_date date;
begin
  for staged in
    select *
    from cfsp_migration.old_events
    where target_event_id is null
    order by staged_at, name
  loop
    if staged.name is null then
      update cfsp_migration.old_events
      set unresolved_reason = 'Missing event name'
      where id = staged.id;
      continue;
    end if;

    select events.id
    into found_event_id
    from public.events
    where lower(trim(coalesce(events.name, ''))) = lower(trim(staged.name))
      and coalesce(trim(events.date_text), '') = coalesce(trim(staged.date_text), '')
    order by events.created_at nulls last, events.id
    limit 1;

    if found_event_id is null then
      insert into public.events (
        name,
        status,
        date_text,
        sp_needed,
        sp_assigned,
        location,
        notes,
        created_at
      )
      values (
        staged.name,
        coalesce(staged.status, 'Draft'),
        staged.date_text,
        coalesce(staged.sp_needed, 0),
        coalesce(staged.sp_assigned, 0),
        staged.location,
        staged.notes,
        coalesce(staged.updated_at, now())
      )
      returning id into found_event_id;

      inserted_event_count := inserted_event_count + 1;
    else
      matched_event_count := matched_event_count + 1;
    end if;

    update cfsp_migration.old_events
    set target_event_id = found_event_id,
        unresolved_reason = null
    where id = staged.id;

    for session_item in
      select value
      from jsonb_array_elements(staged.sessions)
    loop
      session_date := cfsp_migration.safe_date(coalesce(session_item ->> 'date', session_item ->> 'session_date', session_item ->> 'sessionDate'));

      if session_date is null then
        continue;
      end if;

      insert into public.event_sessions (
        event_id,
        session_date,
        start_time,
        end_time,
        location,
        room,
        created_at
      )
      select
        found_event_id,
        session_date,
        cfsp_migration.safe_time(coalesce(session_item ->> 'startTime', session_item ->> 'start_time')),
        cfsp_migration.safe_time(coalesce(session_item ->> 'endTime', session_item ->> 'end_time')),
        staged.location,
        cfsp_migration.blank_to_null(coalesce(session_item ->> 'room', session_item ->> 'roomRaw', session_item ->> 'room_raw')),
        now()
      where not exists (
        select 1
        from public.event_sessions existing
        where existing.event_id = found_event_id
          and existing.session_date = session_date
          and coalesce(existing.start_time::text, '') = coalesce(cfsp_migration.safe_time(coalesce(session_item ->> 'startTime', session_item ->> 'start_time'))::text, '')
          and coalesce(existing.end_time::text, '') = coalesce(cfsp_migration.safe_time(coalesce(session_item ->> 'endTime', session_item ->> 'end_time'))::text, '')
          and coalesce(trim(existing.room), '') = coalesce(trim(cfsp_migration.blank_to_null(coalesce(session_item ->> 'room', session_item ->> 'roomRaw', session_item ->> 'room_raw'))), '')
      );

      if found then
        inserted_session_count := inserted_session_count + 1;
      end if;
    end loop;
  end loop;

  return query select inserted_event_count, matched_event_count, inserted_session_count;
end;
$$;

create or replace function cfsp_migration.migrate_old_sp_directory()
returns table(inserted_sps integer, matched_sps integer, unresolved_sps integer)
language plpgsql
as $$
declare
  staged record;
  found_sp_id uuid;
  inserted_count integer := 0;
  matched_count integer := 0;
  unresolved_count integer := 0;
begin
  for staged in
    select *
    from cfsp_migration.old_sp_directory
    where target_sp_id is null
    order by staged_at, full_name
  loop
    found_sp_id := null;

    if staged.email is not null then
      select sps.id
      into found_sp_id
      from public.sps
      where cfsp_migration.normalize_email(sps.working_email) = cfsp_migration.normalize_email(staged.email)
         or cfsp_migration.normalize_email(sps.email) = cfsp_migration.normalize_email(staged.email)
      order by sps.created_at nulls last, sps.id
      limit 1;
    end if;

    if found_sp_id is null and staged.full_name is not null then
      select sps.id
      into found_sp_id
      from public.sps
      where lower(trim(coalesce(sps.full_name, concat_ws(' ', sps.first_name, sps.last_name)))) = lower(trim(staged.full_name))
        and (
          cfsp_migration.normalize_phone(staged.phone) = ''
          or cfsp_migration.normalize_phone(sps.phone) = cfsp_migration.normalize_phone(staged.phone)
        )
      order by sps.created_at nulls last, sps.id
      limit 1;
    end if;

    if found_sp_id is null then
      if staged.full_name is null and staged.email is null then
        unresolved_count := unresolved_count + 1;

        update cfsp_migration.old_sp_directory
        set unresolved_reason = 'Missing SP name and email'
        where id = staged.id;

        continue;
      end if;

      insert into public.sps (
        full_name,
        working_email,
        phone,
        status,
        notes,
        created_at
      )
      values (
        staged.full_name,
        staged.email,
        staged.phone,
        coalesce(staged.status, 'Active'),
        nullif(concat_ws(E'\n', staged.notes, case when staged.campus is not null then 'Legacy campus: ' || staged.campus end), ''),
        coalesce(staged.created_at, now())
      )
      returning id into found_sp_id;

      inserted_count := inserted_count + 1;
    else
      matched_count := matched_count + 1;
    end if;

    update cfsp_migration.old_sp_directory
    set target_sp_id = found_sp_id,
        unresolved_reason = null
    where id = staged.id;
  end loop;

  return query select inserted_count, matched_count, unresolved_count;
end;
$$;

create or replace function cfsp_migration.migrate_old_event_assignments()
returns table(inserted_assignments integer, matched_assignments integer, unresolved_assignments integer)
language plpgsql
as $$
declare
  staged record;
  found_event_id uuid;
  found_sp_id uuid;
  found_event_sp_id uuid;
  next_status text;
  inserted_count integer := 0;
  matched_count integer := 0;
  unresolved_count integer := 0;
  reason text;
begin
  for staged in
    select *
    from cfsp_migration.old_event_assignments
    where target_event_sp_id is null
    order by staged_at, event_name, sp_name
  loop
    found_event_id := null;
    found_sp_id := null;
    found_event_sp_id := null;
    reason := null;

    select old_events.target_event_id
    into found_event_id
    from cfsp_migration.old_events
    where old_events.legacy_event_id = staged.legacy_event_id
      and old_events.target_event_id is not null
    order by old_events.staged_at
    limit 1;

    if found_event_id is null and staged.event_name is not null then
      select events.id
      into found_event_id
      from public.events
      where lower(trim(coalesce(events.name, ''))) = lower(trim(staged.event_name))
      order by events.created_at nulls last, events.id
      limit 1;
    end if;

    if staged.email is not null then
      select sps.id
      into found_sp_id
      from public.sps
      where cfsp_migration.normalize_email(sps.working_email) = cfsp_migration.normalize_email(staged.email)
         or cfsp_migration.normalize_email(sps.email) = cfsp_migration.normalize_email(staged.email)
      order by sps.created_at nulls last, sps.id
      limit 1;
    end if;

    if found_sp_id is null then
      select old_sp_directory.target_sp_id
      into found_sp_id
      from cfsp_migration.old_sp_directory
      where old_sp_directory.legacy_sp_id = staged.legacy_sp_id
        and old_sp_directory.target_sp_id is not null
      order by old_sp_directory.staged_at
      limit 1;
    end if;

    if found_sp_id is null and staged.sp_name is not null then
      select sps.id
      into found_sp_id
      from public.sps
      where lower(trim(coalesce(sps.full_name, concat_ws(' ', sps.first_name, sps.last_name)))) = lower(trim(staged.sp_name))
        and (
          cfsp_migration.normalize_phone(staged.phone) = ''
          or cfsp_migration.normalize_phone(sps.phone) = cfsp_migration.normalize_phone(staged.phone)
        )
      order by sps.created_at nulls last, sps.id
      limit 1;
    end if;

    if found_event_id is null then
      reason := concat_ws('; ', reason, 'Could not resolve event');
    end if;

    if found_sp_id is null then
      reason := concat_ws('; ', reason, 'Could not resolve SP');
    end if;

    if reason is not null then
      unresolved_count := unresolved_count + 1;

      update cfsp_migration.old_event_assignments
      set target_event_id = found_event_id,
          target_sp_id = found_sp_id,
          unresolved_reason = reason
      where id = staged.id;

      continue;
    end if;

    select event_sps.id
    into found_event_sp_id
    from public.event_sps
    where event_sps.event_id = found_event_id
      and event_sps.sp_id = found_sp_id
    order by event_sps.created_at nulls last, event_sps.id
    limit 1;

    next_status := cfsp_migration.normalize_assignment_status(staged.status, staged.confirmed);

    if found_event_sp_id is null then
      insert into public.event_sps (
        event_id,
        sp_id,
        status,
        confirmed,
        notes,
        created_at
      )
      values (
        found_event_id,
        found_sp_id,
        next_status,
        next_status = 'confirmed',
        staged.notes,
        coalesce(staged.created_at, now())
      )
      returning id into found_event_sp_id;

      inserted_count := inserted_count + 1;
    else
      update public.event_sps as target
      set status = next_status,
          confirmed = next_status = 'confirmed',
          notes = coalesce(target.notes, staged.notes)
      where target.id = found_event_sp_id;

      matched_count := matched_count + 1;
    end if;

    update cfsp_migration.old_event_assignments
    set target_event_id = found_event_id,
        target_sp_id = found_sp_id,
        target_event_sp_id = found_event_sp_id,
        unresolved_reason = null
    where id = staged.id;
  end loop;

  return query select inserted_count, matched_count, unresolved_count;
end;
$$;

create or replace view cfsp_migration.unresolved_old_events as
select *
from cfsp_migration.old_events
where target_event_id is null or unresolved_reason is not null;

create or replace view cfsp_migration.unresolved_old_event_assignments as
select *
from cfsp_migration.old_event_assignments
where target_event_sp_id is null or unresolved_reason is not null;

create or replace view cfsp_migration.unresolved_old_sp_directory as
select *
from cfsp_migration.old_sp_directory
where target_sp_id is null or unresolved_reason is not null;

create or replace view cfsp_migration.migration_summary as
select 'old_events' as source, count(*) as staged, count(target_event_id) as resolved, count(*) filter (where unresolved_reason is not null) as unresolved
from cfsp_migration.old_events
union all
select 'old_event_assignments', count(*), count(target_event_sp_id), count(*) filter (where unresolved_reason is not null)
from cfsp_migration.old_event_assignments
union all
select 'old_sp_directory', count(*), count(target_sp_id), count(*) filter (where unresolved_reason is not null)
from cfsp_migration.old_sp_directory;

-- Usage in Supabase SQL Editor:
--
-- 1. Run this whole file once.
--
-- 2. Stage each exported JSON file by pasting its array between the dollar quotes:
-- select cfsp_migration.stage_old_events($json$
--   PASTE old_events.json HERE
-- $json$::jsonb);
--
-- select cfsp_migration.stage_old_event_assignments($json$
--   PASTE old_event_assignments.json HERE
-- $json$::jsonb);
--
-- select cfsp_migration.stage_old_sp_directory($json$
--   PASTE optional old_sp_directory.json HERE
-- $json$::jsonb);
--
-- 3. Review before migrating:
-- select * from cfsp_migration.migration_summary;
-- select * from cfsp_migration.old_events order by staged_at, name;
-- select * from cfsp_migration.old_event_assignments order by staged_at, event_name, sp_name;
-- select * from cfsp_migration.old_sp_directory order by staged_at, full_name;
--
-- 4. Migrate in dependency order:
-- select * from cfsp_migration.migrate_old_events();
-- select * from cfsp_migration.migrate_old_sp_directory();
-- select * from cfsp_migration.migrate_old_event_assignments();
--
-- 5. Review unresolved rows:
-- select * from cfsp_migration.migration_summary;
-- select * from cfsp_migration.unresolved_old_events;
-- select * from cfsp_migration.unresolved_old_sp_directory;
-- select * from cfsp_migration.unresolved_old_event_assignments;
