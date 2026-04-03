-- Project thread participants (from/to/cc) and LLM-friendly recent update log.

alter table public.projects
  add column if not exists participant_emails text[] not null default '{}'::text[];

alter table public.project_states
  add column if not exists recent_updates jsonb not null default '[]'::jsonb;

create index if not exists idx_projects_participant_emails_gin
  on public.projects using gin (participant_emails);
