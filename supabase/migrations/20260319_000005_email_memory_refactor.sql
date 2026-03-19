-- SaaS² email-memory refactor schema alignment.
-- Adds JSONB-first tables required by strict orchestration/memory split.

create table if not exists public.project_state (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  state_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_state_project_id_unique unique (project_id)
);

create table if not exists public.updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  raw_input text not null default '',
  structured_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_profile_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  context_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.transaction_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  event_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.system_settings (
  key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.email_templates (
  key text primary key,
  subject text not null default '',
  text_body text not null default '',
  html_body text not null default '',
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.instructions (
  key text primary key,
  content text not null default '',
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_project_state_project_id on public.project_state(project_id);
create index if not exists idx_updates_project_id_created_at on public.updates(project_id, created_at desc);
create index if not exists idx_user_profile_context_user_id_created_at on public.user_profile_context(user_id, created_at desc);
create index if not exists idx_transaction_events_project_id_created_at on public.transaction_events(project_id, created_at desc);

insert into public.system_settings (key, value_json)
values
  ('email.admin_bcc.enabled', '{"enabled": false}'::jsonb),
  ('email.admin_bcc.address', '{"address": ""}'::jsonb)
on conflict (key) do nothing;

insert into public.email_templates (key, subject, text_body, html_body)
values (
  'project_update',
  'Project Update',
  'Project Update\n\n{{summary}}\n\nAttached latest project memory document.',
  '<!doctype html><html><body><h2>Project Update</h2><p>{{summary}}</p><p>Attached latest project memory document.</p></body></html>'
)
on conflict (key) do nothing;

insert into public.instructions (key, content)
values ('llm_document_usage', 'Use the attached project document as authoritative context for your external LLM.')
on conflict (key) do nothing;

insert into public.project_state (project_id, state_json)
select
  ps.project_id,
  jsonb_build_object(
    'overview', coalesce(ps.summary, ''),
    'goals', coalesce(ps.goals, '[]'::jsonb),
    'tasks', coalesce(ps.action_items, ps.tasks, '[]'::jsonb),
    'risks', coalesce(ps.risks, '[]'::jsonb),
    'notes', '[]'::jsonb,
    'decisions', coalesce(ps.decisions, '[]'::jsonb),
    'timeline', '[]'::jsonb,
    'history', '[]'::jsonb
  )
from public.project_states ps
on conflict (project_id) do nothing;

drop trigger if exists trg_project_state_set_updated_at on public.project_state;
create trigger trg_project_state_set_updated_at
before update on public.project_state
for each row
execute function public.set_updated_at();

grant select, insert, update, delete on table public.project_state to service_role;
grant select, insert, update, delete on table public.updates to service_role;
grant select, insert, update, delete on table public.user_profile_context to service_role;
grant select, insert, update, delete on table public.transaction_events to service_role;
grant select, insert, update, delete on table public.system_settings to service_role;
grant select, insert, update, delete on table public.email_templates to service_role;
grant select, insert, update, delete on table public.instructions to service_role;
