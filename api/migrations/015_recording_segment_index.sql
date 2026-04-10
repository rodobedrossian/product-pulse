-- Add segment_index to participant_recordings.
-- NULL = single-file recording (legacy / short sessions).
-- 0, 1, 2, … = auto-split segments from a long session (desktop app rolls every 20 min).
ALTER TABLE public.participant_recordings
  ADD COLUMN IF NOT EXISTS segment_index INTEGER DEFAULT NULL;
