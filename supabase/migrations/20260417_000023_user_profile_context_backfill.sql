-- Backfill user_profiles.context JSONB: nest legacy flat SOW fields under sowSignals,
-- merge communication_style into communicationStyle.tone, and mirror long_term_instructions into longTermInstructions array.

-- 1) Legacy flat `context` rows (SOW-only shape) → wrap under sowSignals.
UPDATE public.user_profiles
SET context = jsonb_build_object('sowSignals', context)
WHERE context IS NOT NULL
  AND context <> '{}'::jsonb
  AND NOT (context ? 'sowSignals')
  AND NOT (context ? 'communicationStyle')
  AND NOT (context ? 'longTermInstructions')
  AND (
    context ? 'role'
    OR context ? 'industry'
    OR context ? 'business'
    OR context ? 'project_type'
    OR context ? 'project_stage'
    OR context ? 'preferencesList'
    OR context ? 'tone'
  );

-- 2) Merge communication_style text column into communicationStyle.tone when JSON does not already set tone.
UPDATE public.user_profiles
SET context =
  COALESCE(context, '{}'::jsonb)
  || jsonb_build_object(
    'communicationStyle',
    COALESCE(context -> 'communicationStyle', '{}'::jsonb)
    || CASE
      WHEN length(trim(communication_style)) > 0
      AND NOT (COALESCE(context -> 'communicationStyle', '{}'::jsonb) ? 'tone')
      THEN jsonb_build_object('tone', trim(communication_style))
      ELSE '{}'::jsonb
    END
  )
WHERE length(trim(communication_style)) > 0;

-- 3) Mirror long_term_instructions text into longTermInstructions array (paragraph split) when array not yet set.
UPDATE public.user_profiles
SET context = COALESCE(context, '{}'::jsonb) || jsonb_build_object(
  'longTermInstructions',
  to_jsonb(
    ARRAY(
      SELECT trim(p)
      FROM regexp_split_to_table(trim(long_term_instructions), E'\n\n+') AS p
      WHERE length(trim(p)) > 0
    )
  )
)
WHERE length(trim(long_term_instructions)) > 0
  AND (
    NOT (COALESCE(context, '{}'::jsonb) ? 'longTermInstructions')
    OR (context -> 'longTermInstructions')::text = '[]'
    OR context -> 'longTermInstructions' IS NULL
  );
