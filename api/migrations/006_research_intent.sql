-- Optional research question / hypothesis for interpreting single-goal tests (and optional study-level context for any test).
ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS research_intent TEXT;

COMMENT ON COLUMN public.tests.research_intent IS 'What the researcher is trying to learn (question or hypothesis); optional.';
