-- If 000010 ran before phase 2 (project_versions did not exist yet), apply the same
-- anon/authenticated deny policy once the table is present.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'project_versions'
  ) then
    execute 'alter table public.project_versions enable row level security';
    drop policy if exists deny_anon_and_authenticated_all on public.project_versions;
    create policy deny_anon_and_authenticated_all
    on public.project_versions
    for all
    to anon, authenticated
    using (false)
    with check (false);
  end if;
end $$;
