-- Transaction payment lifecycle (hour purchases default to pending_payment until settled).

alter table public.transactions
  add column if not exists status text not null default 'pending_payment';

alter table public.transactions
  drop constraint if exists transactions_status_check;

alter table public.transactions
  add constraint transactions_status_check
  check (status in ('pending_payment', 'paid', 'cancelled'));

comment on column public.transactions.status is 'Payment lifecycle for hour purchases; default pending_payment.';

-- Replace RPC: add p_status (existing callers must be updated).
drop function if exists public.store_transaction_event_atomic(
  uuid,
  text,
  public.transaction_type,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric
);

-- Same 10-arg signature may already exist with different parameter names (e.g. p_idempotency_key).
-- PostgreSQL does not allow CREATE OR REPLACE to rename parameters (42P13); drop by signature first.
drop function if exists public.store_transaction_event_atomic(
  uuid,
  text,
  public.transaction_type,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  text
);

create or replace function public.store_transaction_event_atomic(
  p_project_id uuid,
  p_created_by_email text,
  p_type public.transaction_type,
  p_hours_purchased numeric,
  p_hourly_rate numeric,
  p_allocated_hours numeric,
  p_buffer_hours numeric,
  p_saas2_fee numeric,
  p_project_remainder numeric,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_remainder numeric;
begin
  insert into public.transactions (
    project_id,
    created_by_email,
    type,
    hours_purchased,
    hourly_rate,
    allocated_hours,
    buffer_hours,
    saas2_fee,
    project_remainder,
    status
  )
  values (
    p_project_id,
    lower(trim(p_created_by_email)),
    p_type,
    p_hours_purchased,
    p_hourly_rate,
    p_allocated_hours,
    p_buffer_hours,
    p_saas2_fee,
    p_project_remainder,
    p_status
  );

  select remainder_balance
    into current_remainder
  from public.projects
  where id = p_project_id
  for update;

  if current_remainder is null then
    raise exception 'Project % not found for atomic transaction store', p_project_id;
  end if;

  update public.projects
  set remainder_balance = coalesce(current_remainder, 0) + coalesce(p_project_remainder, 0)
  where id = p_project_id;
end;
$$;

grant execute on function public.store_transaction_event_atomic(
  uuid,
  text,
  public.transaction_type,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  text
) to service_role;
