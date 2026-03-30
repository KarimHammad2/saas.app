-- Inbound webhook dedupe + async queue processing.
-- Adds a durable processed_emails ledger and inbound_email_jobs queue.

create table if not exists public.processed_emails (
  id uuid primary key default gen_random_uuid(),
  email_id text not null unique,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  last_error text,
  fallback_sent_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint processed_emails_status_check check (status in ('queued', 'processing', 'processed', 'failed')),
  constraint processed_emails_attempt_count_non_negative check (attempt_count >= 0)
);

create table if not exists public.inbound_email_jobs (
  id uuid primary key default gen_random_uuid(),
  email_id text not null unique references public.processed_emails(email_id) on delete cascade,
  provider text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  attempts integer not null default 0,
  available_at timestamptz not null default timezone('utc', now()),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inbound_email_jobs_status_check check (status in ('queued', 'processing', 'processed', 'failed')),
  constraint inbound_email_jobs_attempts_non_negative check (attempts >= 0)
);

create index if not exists idx_inbound_email_jobs_status_available_at
on public.inbound_email_jobs(status, available_at, created_at);

drop trigger if exists trg_processed_emails_set_updated_at on public.processed_emails;
create trigger trg_processed_emails_set_updated_at
before update on public.processed_emails
for each row
execute function public.set_updated_at();

drop trigger if exists trg_inbound_email_jobs_set_updated_at on public.inbound_email_jobs;
create trigger trg_inbound_email_jobs_set_updated_at
before update on public.inbound_email_jobs
for each row
execute function public.set_updated_at();

create or replace function public.enqueue_inbound_email_job(
  p_email_id text,
  p_provider text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_processed integer := 0;
begin
  if trim(coalesce(p_email_id, '')) = '' then
    raise exception 'p_email_id is required';
  end if;
  if trim(coalesce(p_provider, '')) = '' then
    raise exception 'p_provider is required';
  end if;

  insert into public.processed_emails (email_id, status)
  values (trim(p_email_id), 'queued')
  on conflict (email_id) do nothing;

  get diagnostics inserted_processed = row_count;

  if inserted_processed = 0 then
    return false;
  end if;

  insert into public.inbound_email_jobs (email_id, provider, payload, status, available_at)
  values (trim(p_email_id), trim(p_provider), coalesce(p_payload, '{}'::jsonb), 'queued', timezone('utc', now()))
  on conflict (email_id) do nothing;

  return true;
end;
$$;

create or replace function public.claim_next_inbound_email_job()
returns table (
  id uuid,
  email_id text,
  provider text,
  payload jsonb,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select j.id
    from public.inbound_email_jobs j
    where j.status = 'queued'
      and j.available_at <= timezone('utc', now())
    order by j.available_at asc, j.created_at asc
    for update skip locked
    limit 1
  ),
  claimed as (
    update public.inbound_email_jobs j
    set
      status = 'processing',
      attempts = j.attempts + 1,
      last_error = null,
      updated_at = timezone('utc', now())
    from candidate c
    where j.id = c.id
    returning j.id, j.email_id, j.provider, j.payload, j.attempts
  ),
  ledger as (
    update public.processed_emails pe
    set
      status = 'processing',
      attempt_count = c.attempts,
      last_error = null,
      updated_at = timezone('utc', now())
    from claimed c
    where pe.email_id = c.email_id
    returning pe.email_id
  )
  select c.id, c.email_id, c.provider, c.payload, c.attempts
  from claimed c;
end;
$$;

insert into public.system_settings (key, value_json)
values
  ('cron.inbound.webhook_url', '{"url": ""}'::jsonb),
  ('cron.inbound.secret', '{"value": ""}'::jsonb)
on conflict (key) do nothing;

create or replace function public.configure_inbound_webhook(
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
  values ('cron.inbound.webhook_url', jsonb_build_object('url', trim(p_webhook_url)))
  on conflict (key) do update
  set value_json = excluded.value_json;

  insert into public.system_settings (key, value_json)
  values ('cron.inbound.secret', jsonb_build_object('value', trim(p_bearer_secret)))
  on conflict (key) do update
  set value_json = excluded.value_json;
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

  select extensions.net.http_post(
    url := target_url,
    headers := headers,
    body := '{}'::jsonb
  )
  into request_id;

  return request_id;
end;
$$;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'inbound_worker_every_minute';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'inbound_worker_every_minute',
    '* * * * *',
    'select public.invoke_inbound_webhook();'
  );
end;
$$;

grant execute on function public.enqueue_inbound_email_job(text, text, jsonb) to service_role;
grant execute on function public.claim_next_inbound_email_job() to service_role;
grant execute on function public.configure_inbound_webhook(text, text) to service_role;
grant execute on function public.invoke_inbound_webhook() to service_role;

grant select, insert, update, delete on table public.processed_emails to service_role;
grant select, insert, update, delete on table public.inbound_email_jobs to service_role;
