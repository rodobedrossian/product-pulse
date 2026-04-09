-- Remove session story columns (AI summary UI and routes removed; transcript insights unchanged).

ALTER TABLE public.participants
  DROP COLUMN IF EXISTS story_summary,
  DROP COLUMN IF EXISTS story_key_findings,
  DROP COLUMN IF EXISTS story_generated_at;
