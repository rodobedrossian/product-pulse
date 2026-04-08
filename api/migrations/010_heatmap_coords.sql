-- Heatmap: add normalised pointer coordinates to events
-- x, y are fractions of viewport (0–1); vw/vh are viewport px at time of event.
-- Existing rows receive NULL — the heatmap endpoint filters with WHERE x IS NOT NULL.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS x   FLOAT,
  ADD COLUMN IF NOT EXISTS y   FLOAT,
  ADD COLUMN IF NOT EXISTS vw  INTEGER,
  ADD COLUMN IF NOT EXISTS vh  INTEGER;

COMMENT ON COLUMN public.events.x  IS 'Pointer X as fraction of viewport width (0–1)';
COMMENT ON COLUMN public.events.y  IS 'Pointer Y as fraction of viewport height (0–1)';
COMMENT ON COLUMN public.events.vw IS 'Viewport width in px at time of event';
COMMENT ON COLUMN public.events.vh IS 'Viewport height in px at time of event';
