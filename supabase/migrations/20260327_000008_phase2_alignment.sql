-- Phase 2 alignment: immutable first overview anchor, version snapshots, backfill.

alter table public.project_states
  add column if not exists initial_summary text not null default '';

update public.project_states
set initial_summary = summary
where trim(coalesce(initial_summary, '')) = ''
  and trim(coalesce(summary, '')) <> '';

create table if not exists public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_project_versions_project_created
  on public.project_versions (project_id, created_at desc);

grant select, insert, update, delete on table public.project_versions to service_role;
