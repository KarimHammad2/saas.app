-- Current status line for project memory (distinct from overview summary).

alter table public.project_states
  add column if not exists current_status text not null default '';

-- Follow-up emails: shorter body; title lives in Subject only.
update public.email_templates
set
  text_body = '{{summary}}

Your project has been updated.

Attached is the latest project memory document.',
  html_body = '<!doctype html><html><body><p>{{summary}}</p><p>Your project has been updated.</p><p>Attached is the latest project memory document.</p></body></html>',
  updated_at = timezone('utc', now())
where key = 'project_update';
