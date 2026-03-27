-- Explicit RLS policies for PostgREST client roles (anon, authenticated).
-- Skips tables that are not present yet (e.g. project_versions before phase 2 migration).
-- See 20260327_000011_rls_project_versions_if_present.sql for that table when added later.
-- The Next.js backend uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS in Supabase.
-- Without at least one policy, Security Advisor reports "RLS Enabled No Policy" and
-- intent is unclear. These policies deny anon/authenticated table access via the API;
-- server-side service_role and security definer functions are unaffected.

do $$
declare
  t text;
begin
  foreach t in array array[
    'users',
    'projects',
    'project_updates',
    'project_states',
    'documents',
    'user_emails',
    'user_profiles',
    'project_members',
    'rpm_assignments',
    'rpm_suggestions',
    'transactions',
    'project_context_history',
    'inbound_events',
    'project_state',
    'updates',
    'user_profile_context',
    'transaction_events',
    'system_settings',
    'email_templates',
    'instructions',
    'project_versions'
  ]
  loop
    if not exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = t
    ) then
      continue;
    end if;

    execute format(
      'alter table public.%I enable row level security;',
      t
    );
    execute format(
      'drop policy if exists deny_anon_and_authenticated_all on public.%I;',
      t
    );
    execute format(
      $f$
      create policy deny_anon_and_authenticated_all
      on public.%I
      for all
      to anon, authenticated
      using (false)
      with check (false);
      $f$,
      t
    );
  end loop;
end $$;
