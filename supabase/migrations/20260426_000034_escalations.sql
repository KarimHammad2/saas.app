do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'review_flag_status'
  ) then
    create type public.review_flag_status as enum ('pending_review', 'resolved');
  end if;

  if not exists (
    select 1 from pg_type where typname = 'pending_human_approval_status'
  ) then
    create type public.pending_human_approval_status as enum ('pending', 'approved', 'rejected', 'expired');
  end if;
end $$;

create table if not exists public.escalation_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  type text not null,
  reason text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint escalation_logs_type_not_blank check (length(trim(type)) > 0),
  constraint escalation_logs_reason_not_blank check (length(trim(reason)) > 0)
);

create index if not exists idx_escalation_logs_project_created
  on public.escalation_logs(project_id, created_at desc);

create table if not exists public.review_flags (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  reason text not null,
  status public.review_flag_status not null default 'pending_review',
  resolved_by_email text,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint review_flags_reason_not_blank check (length(trim(reason)) > 0)
);

create index if not exists idx_review_flags_project_status_created
  on public.review_flags(project_id, status, created_at desc);

create table if not exists public.pending_human_approvals (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  reason text not null,
  status public.pending_human_approval_status not null default 'pending',
  rpm_email text not null,
  project_id uuid references public.projects(id) on delete cascade,
  requested_by_email text,
  source_subject text not null default '',
  source_raw_body text not null default '',
  resolved_by_email text,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint pending_human_approvals_action_not_blank check (length(trim(action)) > 0),
  constraint pending_human_approvals_reason_not_blank check (length(trim(reason)) > 0),
  constraint pending_human_approvals_rpm_email_not_blank check (length(trim(rpm_email)) > 0)
);

create index if not exists idx_pending_human_approvals_rpm_status_created
  on public.pending_human_approvals(rpm_email, status, created_at desc);

grant select, insert, update, delete on table public.escalation_logs to service_role;
grant select, insert, update, delete on table public.review_flags to service_role;
grant select, insert, update, delete on table public.pending_human_approvals to service_role;
