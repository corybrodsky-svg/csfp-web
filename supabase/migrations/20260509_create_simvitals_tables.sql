create extension if not exists pgcrypto;

create table if not exists public.simvitals_posts (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null,
  author_name text not null,
  author_role text not null check (author_role in ('sim_ops', 'admin', 'faculty', 'sp', 'system')),
  post_type text not null check (post_type in ('general_update', 'staffing_alert', 'faculty_note', 'live_issue', 'training_update', 'system_notice')),
  body text not null,
  linked_event_id uuid null references public.events(id) on delete set null,
  linked_event_name text null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.simvitals_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.simvitals_posts(id) on delete cascade,
  author_user_id uuid not null,
  author_name text not null,
  author_role text not null check (author_role in ('sim_ops', 'admin', 'faculty', 'sp', 'system')),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.simvitals_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.simvitals_posts(id) on delete cascade,
  user_id uuid not null,
  reaction_type text not null default 'ack' check (reaction_type in ('ack')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id, reaction_type)
);

create index if not exists simvitals_posts_created_at_idx on public.simvitals_posts (created_at desc);
create index if not exists simvitals_posts_post_type_idx on public.simvitals_posts (post_type);
create index if not exists simvitals_comments_post_id_created_at_idx on public.simvitals_comments (post_id, created_at asc);
create index if not exists simvitals_reactions_post_id_idx on public.simvitals_reactions (post_id);
create index if not exists simvitals_reactions_user_idx on public.simvitals_reactions (user_id);

create or replace function public.set_simvitals_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_simvitals_posts_updated_at on public.simvitals_posts;
create trigger set_simvitals_posts_updated_at
  before update on public.simvitals_posts
  for each row execute function public.set_simvitals_updated_at();

drop trigger if exists set_simvitals_comments_updated_at on public.simvitals_comments;
create trigger set_simvitals_comments_updated_at
  before update on public.simvitals_comments
  for each row execute function public.set_simvitals_updated_at();

alter table public.simvitals_posts enable row level security;
alter table public.simvitals_comments enable row level security;
alter table public.simvitals_reactions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'simvitals_posts' and policyname = 'Authenticated users can read SimVitals posts'
  ) then
    create policy "Authenticated users can read SimVitals posts"
      on public.simvitals_posts for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'simvitals_posts' and policyname = 'Authenticated users can create SimVitals posts'
  ) then
    create policy "Authenticated users can create SimVitals posts"
      on public.simvitals_posts for insert
      to authenticated
      with check (auth.uid() = author_user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'simvitals_comments' and policyname = 'Authenticated users can read SimVitals comments'
  ) then
    create policy "Authenticated users can read SimVitals comments"
      on public.simvitals_comments for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'simvitals_comments' and policyname = 'Authenticated users can create SimVitals comments'
  ) then
    create policy "Authenticated users can create SimVitals comments"
      on public.simvitals_comments for insert
      to authenticated
      with check (auth.uid() = author_user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'simvitals_reactions' and policyname = 'Authenticated users can read SimVitals reactions'
  ) then
    create policy "Authenticated users can read SimVitals reactions"
      on public.simvitals_reactions for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'simvitals_reactions' and policyname = 'Authenticated users can create their SimVitals reactions'
  ) then
    create policy "Authenticated users can create their SimVitals reactions"
      on public.simvitals_reactions for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'simvitals_reactions' and policyname = 'Authenticated users can remove their SimVitals reactions'
  ) then
    create policy "Authenticated users can remove their SimVitals reactions"
      on public.simvitals_reactions for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end;
$$;

comment on table public.simvitals_posts is 'CFSP SimVitals operational communication feed posts.';
comment on table public.simvitals_comments is 'Comments attached to CFSP SimVitals posts.';
comment on table public.simvitals_reactions is 'Per-user SimVitals reactions, currently acknowledgement toggles.';
