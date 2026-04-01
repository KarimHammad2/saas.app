insert into public.email_templates (key, subject, text_body, html_body)
values (
  'project_kickoff',
  'Great start - your project is initialized',
  'Great - your project is now initialized.\n\nHere is what I understood so far:\n{{summary}}\n\nYour kickoff document now includes guidance to help you move forward:\n- Define your first 2-3 goals.\n- List the first tasks to get started.\n- Clarify your target users and first milestone.\n\nSections in the attached document:\n- Next Steps\n- Goals\n- Tasks\n- Risks\n- Decisions\n- Notes\n\nAttached is your project document.',
  '<!doctype html><html><body><h2>Great - your project is now initialized.</h2><p><strong>Here is what I understood so far:</strong></p><p>{{summary}}</p><p><strong>Your kickoff document now includes guidance to help you move forward:</strong></p><ul><li>Define your first 2-3 goals.</li><li>List the first tasks to get started.</li><li>Clarify your target users and first milestone.</li></ul><p><strong>Sections in the attached document:</strong></p><ul><li>Next Steps</li><li>Goals</li><li>Tasks</li><li>Risks</li><li>Decisions</li><li>Notes</li></ul><p>Attached is your project document.</p></body></html>'
)
on conflict (key) do update set
  subject = excluded.subject,
  text_body = excluded.text_body,
  html_body = excluded.html_body,
  updated_at = timezone('utc', now());
