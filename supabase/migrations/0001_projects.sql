-- Octopus Wind Simulation: projects and view-only share links (ТЗ, розділ 10).
-- Run once in the Supabase SQL editor (or `supabase db push`).

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 120),
  assumptions jsonb not null,
  engine_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_owner_idx on public.projects (owner, updated_at desc);

create table if not exists public.share_links (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists share_links_project_idx on public.share_links (project_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();

alter table public.projects enable row level security;
alter table public.share_links enable row level security;

-- Owners see and change only their own projects.
drop policy if exists projects_owner_all on public.projects;
create policy projects_owner_all on public.projects
  for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- Owners manage links of their own projects.
drop policy if exists share_links_owner_all on public.share_links;
create policy share_links_owner_all on public.share_links
  for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner = auth.uid()));

-- Anyone holding a live token can read that one project, nothing else.
create or replace function public.get_shared_project(p_token text)
returns table (name text, assumptions jsonb, engine_version text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.name, p.assumptions, p.engine_version, p.updated_at
  from public.share_links s join public.projects p on p.id = s.project_id
  where s.token = p_token and s.revoked_at is null
$$;
revoke all on function public.get_shared_project(text) from public;
grant execute on function public.get_shared_project(text) to anon, authenticated;
