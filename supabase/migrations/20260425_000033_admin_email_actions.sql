do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'admin_email_action_status'
  ) then
    create type public.admin_email_action_status as enum ('pending', 'executed', 'expired');
  end if;
end $$;

create table if not exists public.admin_email_actions (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references public.users(id) on delete cascade,
  sender_email text not null,
  action_kind text not null,
  action_payload jsonb not null default '{}'::jsonb,
  status public.admin_email_action_status not null default 'pending',
  source_subject text not null default '',
  source_raw_body text not null default '',
  resolved_by_email text,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint admin_email_actions_sender_email_not_blank check (length(trim(sender_email)) > 0),
  constraint admin_email_actions_action_kind_not_blank check (length(trim(action_kind)) > 0)
);

create index if not exists idx_admin_email_actions_sender_status_created
  on public.admin_email_actions(sender_user_id, status, created_at desc);

create unique index if not exists idx_admin_email_actions_sender_pending_unique
  on public.admin_email_actions(sender_user_id)
  where status = 'pending';

grant select, insert, update, delete on table public.admin_email_actions to service_role;
