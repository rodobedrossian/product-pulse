-- Migration 009: Freeform test context field for LLM-enhanced report generation.
ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS context TEXT;

COMMENT ON COLUMN public.tests.context IS
  'Freeform markdown context about this test — used by LLM to generate richer reports from sessions, replays, and recordings.';
