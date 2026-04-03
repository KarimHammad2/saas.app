create or replace function public.store_transaction_event_atomic(
  p_project_id uuid,
  p_created_by_email text,
  p_type public.transaction_type,
  p_hours_purchased numeric,
  p_hourly_rate numeric,
  p_allocated_hours numeric,
  p_buffer_hours numeric,
  p_saas2_fee numeric,
  p_project_remainder numeric
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
    project_remainder
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
    p_project_remainder
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
  numeric
) to service_role;
