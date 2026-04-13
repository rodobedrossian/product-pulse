-- Store the viewport scroll offset at event time so heatmap backgrounds can be
-- tiled from viewport-sized screenshots captured at different scroll positions.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS scroll_y INTEGER;

COMMENT ON COLUMN public.events.scroll_y IS 'window.scrollY in px at event time — used to position viewport screenshots as tiles in the document-space heatmap';
