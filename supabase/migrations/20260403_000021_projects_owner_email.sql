-- Persist per-project owner email for deterministic participant authorization.

alter table public.projects
  add column if not exists owner_email text;

update public.projects p
set owner_email = lower(trim(u.email))
from public.users u
where p.user_id = u.id
  and (p.owner_email is null or length(trim(p.owner_email)) = 0);

alter table public.projects
  alter column owner_email set not null;

alter table public.projects
  add constraint projects_owner_email_not_blank
  check (length(trim(owner_email)) > 0);
