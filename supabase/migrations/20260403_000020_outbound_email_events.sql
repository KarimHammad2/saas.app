create table if not exists public.outbound_email_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  inbound_event_id text,
  kind text not null default 'project-update',
  provider text,
  status text not null,
  recipient_count integer not null default 0,
  message_id text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_outbound_email_events_project_created
on public.outbound_email_events(project_id, created_at desc);

create index if not exists idx_outbound_email_events_status_created
on public.outbound_email_events(status, created_at desc);

grant select, insert on table public.outbound_email_events to service_role;
