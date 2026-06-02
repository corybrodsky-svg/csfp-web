-- Durable SP directory link for organization memberships.

do $do$
begin
  if to_regclass('public.organization_memberships') is not null then
    alter table public.organization_memberships
      add column if not exists sp_id uuid references public.sps(id) on delete set null;

    create index if not exists organization_memberships_sp_id_idx
      on public.organization_memberships (sp_id);

    create index if not exists organization_memberships_org_sp_id_idx
      on public.organization_memberships (organization_id, sp_id);
  end if;
end
$do$;

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
      and public.cfsp_has_active_org_membership(s.organization_id)
      and (
        (
          public.cfsp_current_user_email() <> ''
          and (
            lower(trim(coalesce(s.working_email, ''))) = public.cfsp_current_user_email()
            or lower(trim(coalesce(s.email, ''))) = public.cfsp_current_user_email()
          )
        )
        or exists (
          select 1
          from public.organization_memberships m
          where m.user_id = auth.uid()
            and m.status = 'active'
            and m.sp_id = target_sp_id
            and (
              m.organization_id = s.organization_id
              or public.cfsp_normalize_membership_role(m.role) = 'platform_owner'
            )
        )
      )
  );
$function$;
