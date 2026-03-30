insert into public.email_templates (key, subject, text_body, html_body)
values (
  'project_kickoff',
  'Project initialized - next steps',
  'Your project is initialized.\n\n{{summary}}\n\nAttached is your project document.\n\nReply to this thread with updates using sections like Goals, Tasks, Risks, and Notes.',
  '<!doctype html><html><body><h2>Project initialized</h2><p>{{summary}}</p><p>Attached is your project document.</p><p>Reply to this thread with updates using sections like Goals, Tasks, Risks, and Notes.</p></body></html>'
)
on conflict (key) do update set
  subject = excluded.subject,
  text_body = excluded.text_body,
  html_body = excluded.html_body,
  updated_at = timezone('utc', now());
