alter table public.projects
  add column if not exists last_contact_at timestamptz;

