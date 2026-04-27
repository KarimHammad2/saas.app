-- Delegated agency admins: normalized lowercase emails that may use agency admin (in addition to primary).
alter table public.users
  add column if not exists agency_super_admin_emails text[] not null default '{}';

comment on column public.users.agency_super_admin_emails is
  'Account emails (must exist in user_emails, non-primary) allowed to use agency Frank admin. Lowercase.';
