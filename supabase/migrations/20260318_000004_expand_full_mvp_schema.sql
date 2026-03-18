-- SaaS² full MVP schema expansion.
-- Adds tiering, user profile context, RPM workflow, transactions, history, and idempotency.

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'account_tier'
  ) then
    create type public.account_tier as enum ('freemium', 'solopreneur', 'agency');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'suggestion_status'
  ) then
    create type public.suggestion_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'transaction_type'
  ) then
    create type public.transaction_type as enum ('hourPurchase', 'allocation', 'remainderAdjustment');
  end if;
end $$;

alter table public.users
  add column if not exists tier public.account_tier not null default 'freemium',
  add column if not exists master_email text,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create table if not exists public.user_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  email text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_emails_email_not_blank check (length(trim(email)) > 0),
  constraint user_emails_unique_per_user unique (user_id, email)
);

insert into public.user_emails (user_id, email, is_primary)
select u.id, u.email, true
from public.users u
on conflict (user_id, email) do nothing;

create unique index if not exists idx_user_emails_unique_primary
on public.user_emails(user_id)
where is_primary = true;

create index if not exists idx_user_emails_email on public.user_emails(email);

create table if not exists public.user_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  communication_style text not null default '',
  preferences jsonb not null default '{}'::jsonb,
  constraints jsonb not null default '{}'::jsonb,
  onboarding_data text not null default '',
  sales_call_transcripts jsonb not null default '[]'::jsonb,
  long_term_instructions text not null default '',
  behavior_modifiers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default timezone('utc', now()),
  constraint project_members_unique unique (project_id, user_id)
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'projects_user_id_unique'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects drop constraint projects_user_id_unique;
  end if;
end $$;

alter table public.projects
  add column if not exists remainder_balance numeric not null default 0,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create table if not exists public.rpm_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  rpm_email text not null,
  is_active boolean not null default true,
  assigned_by_email text not null default 'system@saas2.local',
  created_at timestamptz not null default timezone('utc', now()),
  constraint rpm_assignments_email_not_blank check (length(trim(rpm_email)) > 0)
);

create index if not exists idx_rpm_assignments_project_id_active
on public.rpm_assignments(project_id, is_active);

create table if not exists public.rpm_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  from_email text not null,
  content text not null,
  status public.suggestion_status not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  resolved_by_email text,
  constraint rpm_suggestions_content_not_blank check (length(trim(content)) > 0)
);

create index if not exists idx_rpm_suggestions_user_status
on public.rpm_suggestions(user_id, status, created_at desc);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by_email text not null,
  type public.transaction_type not null default 'hourPurchase',
  hours_purchased numeric not null default 0,
  hourly_rate numeric not null default 0,
  allocated_hours numeric not null default 0,
  buffer_hours numeric not null default 0,
  saas2_fee numeric not null default 0,
  project_remainder numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_transactions_project_id_created_at
on public.transactions(project_id, created_at desc);

create table if not exists public.project_context_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  summary text not null default '',
  goals jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  decisions jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_project_context_history_project_id_created_at
on public.project_context_history(project_id, created_at desc);

create table if not exists public.inbound_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default timezone('utc', now()),
  constraint inbound_events_provider_event_unique unique (provider, provider_event_id)
);

alter table public.project_states
  add column if not exists action_items jsonb,
  add column if not exists decisions jsonb not null default '[]'::jsonb,
  add column if not exists recommendations jsonb not null default '[]'::jsonb;

update public.project_states
set action_items = coalesce(action_items, tasks, '[]'::jsonb)
where action_items is null;

alter table public.project_states
  alter column action_items set default '[]'::jsonb,
  alter column action_items set not null;

drop trigger if exists trg_users_set_updated_at on public.users;
create trigger trg_users_set_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

drop trigger if exists trg_projects_set_updated_at on public.projects;
create trigger trg_projects_set_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

drop trigger if exists trg_user_profiles_set_updated_at on public.user_profiles;
create trigger trg_user_profiles_set_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

grant usage on schema public to service_role;
grant usage on type public.account_tier to service_role;
grant usage on type public.suggestion_status to service_role;
grant usage on type public.transaction_type to service_role;

grant select, insert, update, delete on table public.user_emails to service_role;
grant select, insert, update, delete on table public.user_profiles to service_role;
grant select, insert, update, delete on table public.project_members to service_role;
grant select, insert, update, delete on table public.rpm_assignments to service_role;
grant select, insert, update, delete on table public.rpm_suggestions to service_role;
grant select, insert, update, delete on table public.transactions to service_role;
grant select, insert, update, delete on table public.project_context_history to service_role;
grant select, insert, update, delete on table public.inbound_events to service_role;

grant usage, select on all sequences in schema public to service_role;
