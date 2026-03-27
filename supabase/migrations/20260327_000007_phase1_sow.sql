-- Phase 1 SOW: user profile context jsonb, display name, reminder/usage fields, RPM source, kickoff + reminder timestamps,
-- reminder eligibility RPC, email template seed.

alter table public.users
  add column if not exists display_name text;

alter table public.user_profiles
  add column if not exists context jsonb not null default '{}'::jsonb;

alter table public.projects
  add column if not exists reminder_balance integer not null default 3,
  add column if not exists usage_count integer not null default 0,
  add column if not exists kickoff_completed_at timestamptz,
  add column if not exists last_reminder_sent_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_reminder_balance_non_negative'
  ) then
    alter table public.projects
      add constraint projects_reminder_balance_non_negative check (reminder_balance >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_usage_count_non_negative'
  ) then
    alter table public.projects
      add constraint projects_usage_count_non_negative check (usage_count >= 0);
  end if;
end $$;

alter table public.rpm_suggestions
  add column if not exists source text not null default 'inbound';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rpm_suggestions_source_check'
  ) then
    alter table public.rpm_suggestions
      add constraint rpm_suggestions_source_check check (source in ('inbound', 'system'));
  end if;
end $$;

create or replace function public.list_projects_for_reminder(
  p_idle_days integer,
  p_now timestamptz default timezone('utc', now())
)
returns table (
  project_id uuid,
  user_id uuid,
  user_email text,
  project_name text,
  reminder_balance integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id,
    p.user_id,
    u.email,
    p.name,
    p.reminder_balance
  from public.projects p
  join public.users u on u.id = p.user_id
  where p.reminder_balance > 0
    and p.kickoff_completed_at is not null
    and (
      p.last_reminder_sent_at is null
      or p.last_reminder_sent_at < coalesce(
        (select max(pu.created_at) from public.project_updates pu where pu.project_id = p.id),
        p.created_at
      )
    )
    and coalesce(
      (select max(pu.created_at) from public.project_updates pu where pu.project_id = p.id),
      p.created_at
    ) < p_now - interval '1 day' * greatest(p_idle_days, 1);
$$;

grant execute on function public.list_projects_for_reminder(integer, timestamptz) to service_role;

insert into public.email_templates (key, subject, text_body, html_body)
values (
  'project_reminder',
  'Checking in on your project',
  'Checking in\n\n{{summary}}\n\nJust checking in — any updates on your project? Reply to this thread when you have a moment.\n\nAttached is your latest project memory document for context.',
  '<!doctype html><html><body><h2>Checking in</h2><p>{{summary}}</p><p>Just checking in — any updates on your project? Reply to this thread when you have a moment.</p><p>Attached is your latest project memory document for context.</p></body></html>'
)
on conflict (key) do update set
  subject = excluded.subject,
  text_body = excluded.text_body,
  html_body = excluded.html_body,
  updated_at = timezone('utc', now());
