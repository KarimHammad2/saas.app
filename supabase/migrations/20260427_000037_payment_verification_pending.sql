-- Queues hour-purchase rows after owner replies "Paid" until master replies "Confirm".

create table if not exists public.payment_verification_pending (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  payer_ack_email text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint payment_verification_pending_transaction_unique unique (transaction_id)
);

create index if not exists idx_payment_verification_pending_project_created
  on public.payment_verification_pending(project_id, created_at asc);

grant select, insert, update, delete on table public.payment_verification_pending to service_role;
