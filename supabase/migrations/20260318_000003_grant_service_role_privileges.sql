-- Ensure backend service role can read/write MVP tables.
-- This keeps table access server-only while fixing PostgREST permission errors.

grant usage on schema public to service_role;

grant all privileges on table public.users to service_role;
grant all privileges on table public.projects to service_role;
grant all privileges on table public.project_updates to service_role;
grant all privileges on table public.project_states to service_role;
grant all privileges on table public.documents to service_role;

alter default privileges in schema public
grant all on tables to service_role;
