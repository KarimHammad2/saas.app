alter table public.transactions
  add column if not exists paid_at timestamptz;

comment on column public.transactions.paid_at is 'Set when status becomes paid.';

create index if not exists idx_transactions_project_status_created
  on public.transactions (project_id, status, created_at desc);
