-- SaaS² MVP schema for orchestration flow.
-- Scope: users, projects, project_updates, project_states, documents.

create extension if not exists pgcrypto;

-- Keep timestamp updates consistent for mutable rows.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  constraint users_email_not_blank check (length(trim(email)) > 0)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint projects_name_not_blank check (length(trim(name)) > 0),
  -- MVP rule: one project per user.
  constraint projects_user_id_unique unique (user_id)
);

create table if not exists public.project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  content text not null,
  raw_email jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint project_updates_content_not_blank check (length(trim(content)) > 0)
);

create table if not exists public.project_states (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  summary text not null default '',
  goals jsonb not null default '[]'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  -- Current-state model: one active state row per project.
  constraint project_states_project_id_unique unique (project_id)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_url text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint documents_file_url_not_blank check (length(trim(file_url)) > 0)
);

create index if not exists idx_users_email on public.users(email);
create index if not exists idx_projects_user_id on public.projects(user_id);
create index if not exists idx_project_updates_project_id_created_at
  on public.project_updates(project_id, created_at desc);
create index if not exists idx_project_states_project_id on public.project_states(project_id);
create index if not exists idx_documents_project_id on public.documents(project_id);

drop trigger if exists trg_project_states_set_updated_at on public.project_states;
create trigger trg_project_states_set_updated_at
before update on public.project_states
for each row
execute function public.set_updated_at();
