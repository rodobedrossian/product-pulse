-- Migrate github_connections from OAuth App schema to GitHub App schema.
-- The original 022 migration used github_token + github_user_id (OAuth App).
-- GitHub Apps use an installation_id instead — users pick specific repos.

ALTER TABLE public.github_connections
  ADD COLUMN IF NOT EXISTS installation_id BIGINT;

ALTER TABLE public.github_connections
  DROP COLUMN IF EXISTS github_token,
  DROP COLUMN IF EXISTS github_user_id;

-- github_login is now nullable (populated from installation info, not user OAuth)
ALTER TABLE public.github_connections
  ALTER COLUMN github_login DROP NOT NULL;

-- Backfill: if any rows exist with no installation_id, delete them (they're invalid now)
DELETE FROM public.github_connections WHERE installation_id IS NULL;

-- Now enforce NOT NULL
ALTER TABLE public.github_connections
  ALTER COLUMN installation_id SET NOT NULL;
