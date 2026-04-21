-- Admin visibility & management (SOW 7.1 + 7.2):
-- 1) Add archival lifecycle to projects (admin archive/restore)
-- 2) Audit every admin mutation with a before/after snapshot linked to admin_email_actions.

alter table public.projects
  add column if not exists archived_at timestamptz;

create index if not exists idx_projects_archived_at
  on public.projects(archived_at)
  where archived_at is not null;

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_action_id uuid references public.admin_email_actions(id) on delete set null,
  actor_email text not null,
  action_kind text not null,
  entity_type text not null,
  entity_ref text not null,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint admin_audit_log_actor_email_not_blank check (length(trim(actor_email)) > 0),
  constraint admin_audit_log_action_kind_not_blank check (length(trim(action_kind)) > 0),
  constraint admin_audit_log_entity_type_not_blank check (length(trim(entity_type)) > 0)
);

create index if not exists idx_admin_audit_log_created_at
  on public.admin_audit_log(created_at desc);

create index if not exists idx_admin_audit_log_entity
  on public.admin_audit_log(entity_type, entity_ref, created_at desc);

grant select, insert, update, delete on table public.admin_audit_log to service_role;
