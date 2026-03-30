insert into public.email_templates (key, subject, text_body, html_body)
values (
  'project_kickoff',
  'Great start - your project is initialized',
  'Great - your project is now initialized.\n\nHere is what I understood so far:\n{{summary}}\n\nTo move forward, I recommend:\n- Define your goals\n- Identify your target users\n- Outline your first milestone\n\nAttached is your project document.\n\nReply to this thread with updates using sections like Goals, Tasks, Risks, and Notes.',
  '<!doctype html><html><body><h2>Great - your project is now initialized.</h2><p><strong>Here is what I understood so far:</strong></p><p>{{summary}}</p><p><strong>To move forward, I recommend:</strong></p><ul><li>Define your goals</li><li>Identify your target users</li><li>Outline your first milestone</li></ul><p>Attached is your project document.</p><p>Reply to this thread with updates using sections like Goals, Tasks, Risks, and Notes.</p></body></html>'
)
on conflict (key) do update set
  subject = excluded.subject,
  text_body = excluded.text_body,
  html_body = excluded.html_body,
  updated_at = timezone('utc', now());
