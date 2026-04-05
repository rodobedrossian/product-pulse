-- Migration 002: Scenario / multi-goal tests
-- Run this in the Supabase SQL editor.

-- 1. Tag each test with its type ('single' or 'scenario')
ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS test_type TEXT NOT NULL DEFAULT 'single';

-- 2. Ordered steps for scenario tests
CREATE TABLE IF NOT EXISTS steps (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id      UUID        NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  order_index  INTEGER     NOT NULL,
  title        TEXT        NOT NULL DEFAULT '',
  task         TEXT        NOT NULL DEFAULT '',
  follow_up    TEXT        NOT NULL DEFAULT '',
  goal_event   JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (test_id, order_index)
);

-- 3. Per-step completion per participant
CREATE TABLE IF NOT EXISTS step_results (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id             UUID        NOT NULL,
  step_id             UUID        NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
  tid                 TEXT        NOT NULL,
  participant_id      UUID        REFERENCES participants(id) ON DELETE SET NULL,
  completed           BOOLEAN     NOT NULL DEFAULT false,
  completed_at        TIMESTAMPTZ,
  time_to_complete_ms BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (step_id, tid)
);

-- 4. Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_steps_test_id        ON steps(test_id);
CREATE INDEX IF NOT EXISTS idx_step_results_test_id ON step_results(test_id);
CREATE INDEX IF NOT EXISTS idx_step_results_step_id ON step_results(step_id);
CREATE INDEX IF NOT EXISTS idx_step_results_tid     ON step_results(tid);
