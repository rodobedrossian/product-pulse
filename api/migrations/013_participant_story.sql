-- Cache the AI-generated session story on the participant record.
-- Generated once on first access, refreshable on demand.

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS story_summary       TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS story_key_findings  JSONB        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS story_generated_at  TIMESTAMPTZ  DEFAULT NULL;
