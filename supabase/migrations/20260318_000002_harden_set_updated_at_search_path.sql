-- Harden trigger function to satisfy Security Advisor:
-- ensure the function runs with an explicit, immutable search_path.
alter function public.set_updated_at()
set search_path = pg_catalog, public;
