do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'cc_membership_confirmation_status'
  ) then
    create type public.cc_membership_confirmation_status as enum ('pending', 'approved', 'rejected', 'expired');
  end if;
end $$;

create table if not exists public.cc_membership_confirmations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  owner_email text not null,
  candidate_emails jsonb not null default '[]'::jsonb,
  status public.cc_membership_confirmation_status not null default 'pending',
  source_inbound_event_id text,
  source_subject text not null default '',
  source_raw_body text not null default '',
  resolved_by_email text,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint cc_membership_confirmations_owner_email_not_blank check (length(trim(owner_email)) > 0)
);

create index if not exists idx_cc_membership_confirmations_owner_status_created
  on public.cc_membership_confirmations(owner_user_id, status, created_at desc);

grant select, insert, update, delete on table public.cc_membership_confirmations to service_role;
