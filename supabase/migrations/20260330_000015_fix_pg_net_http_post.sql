-- Fix pg_net invocation for cron webhook functions.
-- Previous definitions called `extensions.net.http_post`, which fails at runtime.

create or replace function public.call_pg_net_http_post(
  p_url text,
  p_headers jsonb,
  p_body jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id bigint;
  fn_schema text;
begin
  select n.nspname
  into fn_schema
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'http_post'
    and n.nspname in ('net', 'extensions')
  order by case when n.nspname = 'net' then 0 else 1 end
  limit 1;

  if fn_schema is null then
    raise exception 'pg_net http_post function not found in expected schema';
  end if;

  execute format(
    'select %I.http_post(url := $1, headers := $2, body := $3)',
    fn_schema
  )
  into request_id
  using p_url, p_headers, coalesce(p_body, '{}'::jsonb);

  return request_id;
end;
$$;

create or replace function public.invoke_reminders_webhook()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  target_url text;
  bearer_secret text;
  request_id bigint;
  headers jsonb;
begin
  select coalesce(value_json->>'url', '')
  into target_url
  from public.system_settings
  where key = 'cron.reminders.webhook_url';

  select coalesce(value_json->>'value', '')
  into bearer_secret
  from public.system_settings
  where key = 'cron.reminders.secret';

  if target_url = '' then
    raise exception 'system_settings cron.reminders.webhook_url is empty';
  end if;

  if bearer_secret = '' then
    raise exception 'system_settings cron.reminders.secret is empty';
  end if;

  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || bearer_secret,
    'User-Agent', 'supabase-pg-cron/reminders'
  );

  request_id := public.call_pg_net_http_post(target_url, headers, '{}'::jsonb);
  return request_id;
end;
$$;

create or replace function public.invoke_inbound_webhook()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  target_url text;
  bearer_secret text;
  request_id bigint;
  headers jsonb;
begin
  select coalesce(value_json->>'url', '')
  into target_url
  from public.system_settings
  where key = 'cron.inbound.webhook_url';

  select coalesce(value_json->>'value', '')
  into bearer_secret
  from public.system_settings
  where key = 'cron.inbound.secret';

  if target_url = '' then
    raise exception 'system_settings cron.inbound.webhook_url is empty';
  end if;

  if bearer_secret = '' then
    raise exception 'system_settings cron.inbound.secret is empty';
  end if;

  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || bearer_secret,
    'User-Agent', 'supabase-pg-cron/inbound'
  );

  request_id := public.call_pg_net_http_post(target_url, headers, '{}'::jsonb);
  return request_id;
end;
$$;

grant execute on function public.call_pg_net_http_post(text, jsonb, jsonb) to service_role;
grant execute on function public.invoke_reminders_webhook() to service_role;
grant execute on function public.invoke_inbound_webhook() to service_role;
