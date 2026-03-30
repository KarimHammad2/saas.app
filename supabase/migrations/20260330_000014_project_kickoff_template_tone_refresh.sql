insert into public.email_templates (key, subject, text_body, html_body)
values (
  'project_kickoff',
  'Great start - your project is initialized',
  'Great - your project is now initialized.\n\nHere is what I understood so far:\n{{summary}}\n\nNext, focus on:\n- Define your first 2-3 goals\n- List the first tasks to get started\n- Clarify your target users and first milestone\n\nAttached is your project document.',
  '<!doctype html><html><body><h2>Great - your project is now initialized.</h2><p><strong>Here is what I understood so far:</strong></p><p>{{summary}}</p><p><strong>Next, focus on:</strong></p><ul><li>Define your first 2-3 goals</li><li>List the first tasks to get started</li><li>Clarify your target users and first milestone</li></ul><p>Attached is your project document.</p></body></html>'
)
on conflict (key) do update set
  subject = excluded.subject,
  text_body = excluded.text_body,
  html_body = excluded.html_body,
  updated_at = timezone('utc', now());
