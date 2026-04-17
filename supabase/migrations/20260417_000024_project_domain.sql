-- Per-project playbook for kickoff defaults and system RPM suggestions (marketing, tech, sales, etc.).
alter table public.projects
  add column if not exists project_domain text;

comment on column public.projects.project_domain is
  'Playbook key: general | tech_product | marketing | sales | operations. Set at kickoff from inbound text; optional re-inference when null.';
