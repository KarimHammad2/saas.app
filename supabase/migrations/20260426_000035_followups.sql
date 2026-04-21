do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'followup_status'
  ) then
    create type public.followup_status as enum ('pending', 'done');
  end if;
end $$;

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  action text not null,
  target text not null default '',
  when_text text not null,
  due_date date,
  status public.followup_status not null default 'pending',
  source_inbound_event_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint followups_action_not_blank check (length(trim(action)) > 0),
  constraint followups_when_text_not_blank check (length(trim(when_text)) > 0)
);

create index if not exists idx_followups_project_status_due_created
  on public.followups(project_id, status, due_date, created_at desc);

drop trigger if exists trg_followups_set_updated_at on public.followups;
create trigger trg_followups_set_updated_at
before update on public.followups
for each row
execute function public.set_updated_at();

alter table public.followups enable row level security;

drop policy if exists deny_anon_and_authenticated_all on public.followups;
create policy deny_anon_and_authenticated_all
on public.followups
for all
to anon, authenticated
using (false)
with check (false);

grant select, insert, update, delete on table public.followups to service_role;
