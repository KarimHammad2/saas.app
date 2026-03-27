-- Move reminder scheduling from Vercel Cron to Supabase pg_cron + pg_net.
-- This keeps orchestration in the app route while moving the scheduler into backend infrastructure.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

insert into public.system_settings (key, value_json)
values
  ('cron.reminders.webhook_url', '{"url": ""}'::jsonb),
  ('cron.reminders.secret', '{"value": ""}'::jsonb)
on conflict (key) do nothing;

create or replace function public.configure_reminders_webhook(
  p_webhook_url text,
  p_bearer_secret text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(coalesce(p_webhook_url, '')) = '' then
    raise exception 'p_webhook_url is required';
  end if;

  if trim(coalesce(p_bearer_secret, '')) = '' then
    raise exception 'p_bearer_secret is required';
  end if;

  insert into public.system_settings (key, value_json)
  values ('cron.reminders.webhook_url', jsonb_build_object('url', trim(p_webhook_url)))
  on conflict (key) do update
  set value_json = excluded.value_json;

  insert into public.system_settings (key, value_json)
  values ('cron.reminders.secret', jsonb_build_object('value', trim(p_bearer_secret)))
  on conflict (key) do update
  set value_json = excluded.value_json;
end;
$$;

grant execute on function public.configure_reminders_webhook(text, text) to service_role;

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

  select extensions.net.http_post(
    url := target_url,
    headers := headers,
    body := '{}'::jsonb
  )
  into request_id;

  return request_id;
end;
$$;

grant execute on function public.invoke_reminders_webhook() to service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'reminders_daily_utc';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'reminders_daily_utc',
    '0 9 * * *',
    'select public.invoke_reminders_webhook();'
  );
end;
$$;
