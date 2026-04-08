-- Transcript storage for Whisper-generated audio transcriptions.
-- Stored in PostgreSQL (not object storage) to enable full-text search and direct JOINs.

CREATE TABLE IF NOT EXISTS public.transcripts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id    UUID        NOT NULL REFERENCES public.participant_recordings(id) ON DELETE CASCADE,
  test_id         UUID        NOT NULL REFERENCES public.tests(id)                 ON DELETE CASCADE,
  tid             TEXT        NOT NULL,
  -- 'pending' → 'processing' → 'done' | 'error'
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'processing', 'done', 'error')),
  transcript_text TEXT,
  segments        JSONB       NOT NULL DEFAULT '[]',
  -- segments: [{ "start": 0.0, "end": 4.2, "text": "..." }, ...]
  error_message   TEXT,
  model_used      TEXT        NOT NULL DEFAULT 'whisper-1',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recording_id)
);

CREATE INDEX IF NOT EXISTS idx_transcripts_test_id   ON public.transcripts(test_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_recording ON public.transcripts(recording_id);

ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
