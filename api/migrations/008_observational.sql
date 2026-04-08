-- 008_observational.sql
-- New "Observe & discover" test type: passive analytics with persistent tester identity

-- Persistent visitor identity (one row per unique browser+test combination)
CREATE TABLE IF NOT EXISTS testers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id       UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  tester_key    TEXT UNIQUE NOT NULL,
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_count INT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS testers_test_id_idx    ON testers(test_id);
CREATE INDEX IF NOT EXISTS testers_tester_key_idx ON testers(tester_key);

-- Add visitor metadata columns to each participant session
ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS tester_id   UUID REFERENCES testers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referrer    TEXT,
  ADD COLUMN IF NOT EXISTS browser     TEXT,
  ADD COLUMN IF NOT EXISTS device_type TEXT,
  ADD COLUMN IF NOT EXISTS ip          TEXT,
  ADD COLUMN IF NOT EXISTS country     TEXT;

-- Allow observational auto-sessions to have no name
ALTER TABLE participants ALTER COLUMN name DROP NOT NULL;

CREATE INDEX IF NOT EXISTS participants_tester_id_idx ON participants(tester_id);

-- Make prototype_url, start_event, goal_event optional for observational tests
ALTER TABLE tests ALTER COLUMN prototype_url DROP NOT NULL;
ALTER TABLE tests ALTER COLUMN start_event   DROP NOT NULL;
ALTER TABLE tests ALTER COLUMN goal_event    DROP NOT NULL;

-- Add the new test type value
ALTER TABLE tests DROP CONSTRAINT IF EXISTS tests_test_type_check;
ALTER TABLE tests ADD CONSTRAINT tests_test_type_check
  CHECK (test_type IN ('single', 'scenario', 'observational'));
