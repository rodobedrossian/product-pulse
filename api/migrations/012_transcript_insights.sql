-- Adds LLM insight annotations to the transcripts table.
-- insights_status tracks the GPT-4o-mini analysis pipeline independently
-- of the Whisper transcription status, so both lifecycles stay clean.

ALTER TABLE public.transcripts
  ADD COLUMN IF NOT EXISTS insights        JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS insights_status TEXT  DEFAULT 'none'
    CHECK (insights_status IN ('none', 'processing', 'done', 'error')),
  ADD COLUMN IF NOT EXISTS insights_error  TEXT  DEFAULT NULL;

-- Partial index for efficient polling of in-flight analyses
CREATE INDEX IF NOT EXISTS idx_transcripts_insights_status
  ON public.transcripts (insights_status)
  WHERE insights_status IN ('processing', 'none');
