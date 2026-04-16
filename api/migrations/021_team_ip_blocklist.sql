-- Add blocked_ips column to teams table
-- IPs in this list are excluded from observational test results
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS blocked_ips TEXT[] NOT NULL DEFAULT '{}';
