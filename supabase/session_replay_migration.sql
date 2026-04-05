-- Run this in the Supabase SQL Editor after the initial schema migration.

-- 1. session_replays metadata table
CREATE TABLE session_replays (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id        UUID        NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  tid            TEXT        NOT NULL,
  participant_id UUID        REFERENCES participants(id) ON DELETE SET NULL,
  status         TEXT        NOT NULL DEFAULT 'recording'
                             CHECK (status IN ('recording', 'complete', 'failed')),
  chunk_count    INT         NOT NULL DEFAULT 0,
  total_bytes    BIGINT      NOT NULL DEFAULT 0,
  format_version TEXT        NOT NULL DEFAULT 'rrweb@2',
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  UNIQUE (tid)
);

CREATE INDEX session_replays_test_id_idx ON session_replays(test_id);
CREATE INDEX session_replays_tid_idx     ON session_replays(tid);

-- 2. Storage bucket
-- Create a PRIVATE bucket named "session-replays" via the Supabase dashboard
-- (Storage → New bucket → name: "session-replays" → Public: OFF)
-- or via the Management API:
--
--   curl -X POST https://YOUR_PROJECT.supabase.co/storage/v1/bucket \
--     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"id":"session-replays","name":"session-replays","public":false}'
--
-- Object key format:  {test_id}/{tid}/part_{0000}.json
-- Writes and reads are done exclusively through the Node API using the
-- service-role key (bypasses RLS). Never expose service-role key to the browser.
