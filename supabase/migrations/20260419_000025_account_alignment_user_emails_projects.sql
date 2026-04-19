-- Account-level alignment: globally unique normalized emails on user_emails,
-- and optional project creator audit columns.

-- 1) Normalize addresses (matches app normalizeEmail: trim + lower)
update public.users set email = lower(trim(email)) where email is not null;
update public.user_emails set email = lower(trim(email));

-- 2) Drop duplicate user_emails rows for the same email, keeping the canonical row:
--    prefer the account where users.email matches this address (primary owner),
--    then is_primary, then oldest row.
delete from public.user_emails ue
where ue.id in (
  select id from (
    select
      ue2.id,
      row_number() over (
        partition by ue2.email
        order by
          case when lower(trim(u.email)) = ue2.email then 0 else 1 end,
          case when ue2.is_primary then 0 else 1 end,
          ue2.created_at asc nulls first,
          ue2.id asc
      ) as rn
    from public.user_emails ue2
    inner join public.users u on u.id = ue2.user_id
  ) ranked
  where ranked.rn > 1
);

-- 3) One email may only belong to one account
create unique index if not exists idx_user_emails_email_unique
  on public.user_emails (email);

-- 4) Project kickoff audit (who sent the email that created the project)
alter table public.projects
  add column if not exists created_by_email text,
  add column if not exists created_by_user_id uuid references public.users (id) on delete set null;

comment on column public.projects.created_by_email is 'Normalized From address on inbound that triggered project creation.';
comment on column public.projects.created_by_user_id is 'Resolved users.id for the sender at creation time (same account as user_id when CC members resolve to owner).';
