-- Migration 005: Enable Row Level Security on public app tables (baseline, no permissive policies).
-- API and MCP use the Supabase service role, which bypasses RLS — behavior unchanged.
-- anon / authenticated PostgREST access is denied by default when no policies allow rows.

ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.step_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_replays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;

-- session_results is used by the API but may not exist in older DBs; enable RLS only if present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'session_results'
  ) THEN
    ALTER TABLE public.session_results ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
