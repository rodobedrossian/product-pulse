-- 016_participant_tracking_stopped.sql
-- Adds a nullable timestamp to participants that records when a moderator
-- stopped tracking for a specific participant.
-- NULL = tracking active (default for all existing rows).
-- A non-null value = tracking stopped at that exact moment.
-- Setting back to NULL resumes tracking (non-destructive, reversible).

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS tracking_stopped_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.participants.tracking_stopped_at IS
  'NULL = tracking active. Timestamp = moderator stopped tracking at this moment. Set to NULL to resume.';
