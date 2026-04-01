-- Multi-project routing: human-readable project codes and outbound Message-Id → project mapping.

-- 1) project_code on projects (pjt- + 8 hex chars, stored lowercase).
alter table public.projects
  add column if not exists project_code text;

update public.projects
set project_code = lower('pjt-' || substr(md5(id::text), 1, 8))
where project_code is null;

alter table public.projects
  alter column project_code set not null;

create unique index if not exists idx_projects_project_code_unique
  on public.projects (project_code);

create or replace function public.projects_set_project_code()
returns trigger
language plpgsql
as $$
begin
  if new.project_code is null or trim(new.project_code) = '' then
    new.project_code := 'pjt-' || encode(gen_random_bytes(4), 'hex');
  end if;
  new.project_code := lower(trim(new.project_code));
  return new;
end;
$$;

drop trigger if exists trg_projects_set_project_code on public.projects;
create trigger trg_projects_set_project_code
before insert or update of project_code on public.projects
for each row
execute function public.projects_set_project_code();

-- 2) Map normalized RFC Message-Ids to projects (for In-Reply-To / References routing).
create table if not exists public.email_thread_map (
  message_id text primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_email_thread_map_project_id
  on public.email_thread_map (project_id);

grant all privileges on table public.email_thread_map to service_role;
