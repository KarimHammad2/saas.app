-- Track which action items are completed (append-only; never delete tasks from action_items).

alter table public.project_states
  add column if not exists completed_tasks jsonb not null default '[]'::jsonb;
