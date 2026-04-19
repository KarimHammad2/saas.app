-- Optional agency-wide default RPM (replaces master user on tier transition / kickoff).

alter table public.users
  add column if not exists agency_default_rpm_email text;

comment on column public.users.agency_default_rpm_email is
  'When set, used as default RPM for agency accounts (replaces master user on Solopreneur→Agency transition and at kickoff).';
