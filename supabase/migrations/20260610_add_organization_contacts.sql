create table if not exists public.organization_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null default '',
  email text not null,
  normalized_email text not null,
  contact_type text not null default 'faculty',
  role_metadata jsonb not null default '{}'::jsonb,
  source_event_id uuid null references public.events(id) on delete set null,
  linked_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, normalized_email)
);

create index if not exists organization_contacts_org_type_idx
  on public.organization_contacts (organization_id, contact_type);

alter table public.organization_contacts enable row level security;
alter table public.organization_contacts force row level security;

revoke all on public.organization_contacts from anon;
grant select, insert, update, delete on public.organization_contacts to authenticated;

drop policy if exists cfsp_org_contacts_select on public.organization_contacts;
create policy cfsp_org_contacts_select on public.organization_contacts
  for select to authenticated
  using (
    exists (
      select 1
      from public.organization_memberships m
      where m.organization_id = organization_contacts.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

drop policy if exists cfsp_org_contacts_manage on public.organization_contacts;
create policy cfsp_org_contacts_manage on public.organization_contacts
  for all to authenticated
  using (
    exists (
      select 1
      from public.organization_memberships m
      where m.organization_id = organization_contacts.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('platform_owner', 'org_admin', 'sim_ops')
    )
  )
  with check (
    exists (
      select 1
      from public.organization_memberships m
      where m.organization_id = organization_contacts.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('platform_owner', 'org_admin', 'sim_ops')
    )
  );
