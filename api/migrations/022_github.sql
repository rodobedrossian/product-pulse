-- GitHub App connections (one per team)
-- Uses GitHub App installation_id instead of OAuth user tokens,
-- so users can grant access to specific repositories only.
CREATE TABLE IF NOT EXISTS public.github_connections (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          UUID        NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE CASCADE,
  installation_id  BIGINT      NOT NULL,
  github_login     TEXT,                          -- account that installed the app (for display)
  repo_full_name   TEXT,                          -- repo currently indexed
  webhook_id       BIGINT,                        -- GitHub webhook ID (for cleanup on disconnect)
  webhook_secret   TEXT,                          -- per-connection HMAC secret
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_github_connections_team_id ON public.github_connections(team_id);
CREATE INDEX IF NOT EXISTS idx_github_connections_repo    ON public.github_connections(repo_full_name);

ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;

-- Product maps (one per team, upserted on each scan)
CREATE TABLE IF NOT EXISTS public.product_maps (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          UUID        NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE CASCADE,
  repo_full_name   TEXT        NOT NULL,
  features         JSONB       NOT NULL DEFAULT '[]',
  endpoints        JSONB       NOT NULL DEFAULT '[]',
  db_tables        JSONB       NOT NULL DEFAULT '[]',
  tech_stack       JSONB       NOT NULL DEFAULT '{}',
  raw_file_count   INT         NOT NULL DEFAULT 0,
  last_indexed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_maps_team_id ON public.product_maps(team_id);

ALTER TABLE public.product_maps ENABLE ROW LEVEL SECURITY;
