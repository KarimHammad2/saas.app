-- Hour-purchase payment totals and resolved Stripe checkout links (USD floor tier).

alter table public.transactions
  add column if not exists payment_total numeric not null default 0;

alter table public.transactions
  add column if not exists payment_currency text not null default 'usd';

alter table public.transactions
  add column if not exists payment_link_url text;

alter table public.transactions
  add column if not exists payment_link_tier_amount numeric;

comment on column public.transactions.payment_total is 'hours_purchased * hourly_rate at insert time.';
comment on column public.transactions.payment_currency is 'Checkout currency (usd for now).';
comment on column public.transactions.payment_link_url is 'Resolved pay.saassquared.com checkout URL.';
comment on column public.transactions.payment_link_tier_amount is 'Catalog bracket amount used for the link.';

-- Replace RPC with payment fields (drop by signature; names may differ on existing DB).
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
  text,
  numeric,
  text,
  text,
  numeric
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
  p_status text,
  p_payment_total numeric,
  p_payment_currency text,
  p_payment_link_url text,
  p_payment_link_tier_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_remainder numeric;
begin
  -- Append one transaction row per call; never merge or overwrite existing rows.
  -- Project remainder_balance is incremented by this row's project_remainder only.
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
    status,
    payment_total,
    payment_currency,
    payment_link_url,
    payment_link_tier_amount
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
    p_status,
    p_payment_total,
    lower(trim(p_payment_currency)),
    nullif(trim(p_payment_link_url), ''),
    p_payment_link_tier_amount
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
  text,
  numeric,
  text,
  text,
  numeric
) to service_role;
