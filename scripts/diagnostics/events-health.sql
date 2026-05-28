-- CFSP events/SP health diagnostics
-- Read-only. Do not add UPDATE/DELETE/TRUNCATE/DROP statements to this file.
-- Intended for production review before any data repair.

select
  now() as checked_at,
  current_database() as database_name,
  current_user as checked_by;

-- Confirm whether a physical event_type column exists. Current app code stores
-- canonical type in CFSP_TRAINING_METADATA as canonical_event_type.
select
  table_schema,
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('events', 'event_sessions', 'event_sps', 'sps')
  and column_name in ('event_type', 'organization_id', 'date_text', 'notes', 'created_at', 'updated_at')
order by table_name, column_name;

-- RLS policy inventory for tables used by event/SP pages.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('events', 'event_sessions', 'event_sps', 'sps')
order by tablename, policyname;

-- Recent event rows, preserving enough context to inspect save/read drift.
select
  e.id,
  e.name,
  e.status,
  e.date_text,
  e.sp_needed,
  e.visibility,
  e.location,
  to_jsonb(e)->>'organization_id' as organization_id,
  e.created_at,
  left(coalesce(e.notes, ''), 500) as notes_preview
from public.events e
order by e.created_at desc nulls last
limit 50;

-- Missing core fields.
select 'missing_name' as issue, count(*) as row_count
from public.events
where nullif(trim(coalesce(name, '')), '') is null
union all
select 'missing_date_text', count(*)
from public.events
where nullif(trim(coalesce(date_text, '')), '') is null
union all
select 'missing_type_signal', count(*)
from public.events
where coalesce(notes, '') !~* '(canonical_event_type|Event Types?|Event Category|Event Type)\s*:'
union all
select 'missing_organization_id', count(*)
from public.events e
where to_jsonb(e)->>'organization_id' is null;

-- Canonical type distribution from notes metadata/type lines.
with typed_events as (
  select
    id,
    name,
    created_at,
    case
      when notes ~* 'canonical_event_type\s*:\s*didactic' then 'didactic'
      when notes ~* 'canonical_event_type\s*:\s*simulation' then 'simulation'
      when notes ~* '(Event Types?|Event Category|Event Type)\s*:\s*.*(didactic|lecture|classroom|seminar|training)' then 'didactic_or_training_legacy'
      when notes ~* '(Event Types?|Event Category|Event Type)\s*:\s*.*(simulation|sp|skills|hifi|virtual|osce)' then 'simulation_legacy'
      else 'unknown'
    end as inferred_event_type
  from public.events
)
select inferred_event_type, count(*) as row_count
from typed_events
group by inferred_event_type
order by row_count desc, inferred_event_type;

-- Didactic/training-like events for manual inspection.
select
  e.id,
  e.name,
  e.status,
  e.date_text,
  e.sp_needed,
  to_jsonb(e)->>'organization_id' as organization_id,
  e.created_at,
  left(coalesce(e.notes, ''), 800) as notes_preview
from public.events e
where coalesce(e.notes, '') ~* '(canonical_event_type\s*:\s*didactic|Event Types?.*(didactic|training)|Event Type\s*:\s*(didactic|training)|lecture|classroom|seminar)'
order by e.created_at desc nulls last
limit 100;

-- Parent events with session counts.
select
  e.id,
  e.name,
  e.date_text,
  e.sp_needed,
  e.created_at,
  count(es.id) as session_count,
  min(es.session_date) as first_session_date,
  max(es.session_date) as last_session_date
from public.events e
left join public.event_sessions es on es.event_id = e.id
group by e.id, e.name, e.date_text, e.sp_needed, e.created_at
order by e.created_at desc nulls last
limit 100;

-- Events that look schedule-bearing but have no child sessions.
select
  e.id,
  e.name,
  e.date_text,
  e.sp_needed,
  e.created_at,
  left(coalesce(e.notes, ''), 500) as notes_preview
from public.events e
left join public.event_sessions es on es.event_id = e.id
where es.id is null
  and (
    nullif(trim(coalesce(e.date_text, '')), '') is not null
    or coalesce(e.notes, '') ~* '(schedule_|Generated Rotation Rounds|Room Slots Generated|canonical_event_type)'
  )
order by e.created_at desc nulls last
limit 100;

-- Orphaned child records.
select
  'event_sessions' as child_table,
  count(*) as orphan_count
from public.event_sessions es
left join public.events e on e.id = es.event_id
where e.id is null
union all
select
  'event_sps' as child_table,
  count(*) as orphan_count
from public.event_sps esp
left join public.events e on e.id = esp.event_id
where e.id is null;

-- Recently created/updated event and child rows from the last 48 hours.
select
  'events' as table_name,
  count(*) as rows_last_48h
from public.events
where created_at >= now() - interval '48 hours'
union all
select
  'event_sessions',
  count(*)
from public.event_sessions es
where nullif(to_jsonb(es)->>'created_at', '')::timestamptz >= now() - interval '48 hours'
union all
select
  'event_sps',
  count(*)
from public.event_sps esp
where nullif(to_jsonb(esp)->>'created_at', '')::timestamptz >= now() - interval '48 hours';

select
  e.id,
  e.name,
  e.status,
  e.date_text,
  e.sp_needed,
  to_jsonb(e)->>'organization_id' as organization_id,
  e.created_at,
  count(es.id) as session_count,
  count(esp.id) as assignment_count
from public.events e
left join public.event_sessions es on es.event_id = e.id
left join public.event_sps esp on esp.event_id = e.id
where e.created_at >= now() - interval '48 hours'
group by e.id, e.name, e.status, e.date_text, e.sp_needed, e.organization_id, e.created_at
order by e.created_at desc nulls last;
