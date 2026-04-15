-- Canonical lifecycle status for projects.

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'project_status'
  ) then
    create type public.project_status as enum ('active', 'paused', 'completed');
  end if;
end $$;

alter table public.projects
  add column if not exists status public.project_status;

update public.projects
set status = 'active'
where status is null;

alter table public.projects
  alter column status set default 'active',
  alter column status set not null;

grant usage on type public.project_status to service_role;
