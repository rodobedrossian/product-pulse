-- Migration 020: AI-generated named event taxonomy
-- Additive layer on top of raw events — raw events are never modified.
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.event_definitions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id          UUID        NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  description      TEXT,
  type             TEXT        NOT NULL CHECK (type IN ('click', 'input_change')),
  selector_pattern TEXT,   -- substring match on event.selector (nullable)
  text_pattern     TEXT,   -- substring match on event.metadata->>'text' (nullable)
  url_pattern      TEXT,   -- substring match on event.url (nullable)
  order_index      INT     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.event_definitions IS
  'AI-generated named event definitions. Each row describes one semantic user action matched against raw events via substring patterns.';

COMMENT ON COLUMN public.event_definitions.text_pattern IS
  'Case-insensitive substring matched against events.metadata->>''text''. NULL = not used as a filter.';

COMMENT ON COLUMN public.event_definitions.selector_pattern IS
  'Case-insensitive substring matched against events.selector. NULL = not used as a filter.';

COMMENT ON COLUMN public.event_definitions.url_pattern IS
  'Case-insensitive substring matched against events.url. NULL = not used as a filter.';

CREATE INDEX IF NOT EXISTS idx_event_definitions_test_id
  ON public.event_definitions(test_id);

ALTER TABLE public.event_definitions ENABLE ROW LEVEL SECURITY;

-- Simple flag: has a taxonomy ever been generated for this test?
ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS taxonomy_status TEXT NOT NULL DEFAULT 'none'
    CHECK (taxonomy_status IN ('none', 'done'));
