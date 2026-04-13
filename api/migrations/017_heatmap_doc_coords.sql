-- Document-space heatmap coordinates (scroll-aware). Nullable for legacy events.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS doc_x     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS doc_y     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS doc_w_px  INTEGER,
  ADD COLUMN IF NOT EXISTS doc_h_px  INTEGER;

COMMENT ON COLUMN public.events.doc_x    IS 'Pointer X as fraction of document width (0–1): (scrollX + clientX) / doc_w_px at event time';
COMMENT ON COLUMN public.events.doc_y    IS 'Pointer Y as fraction of document height (0–1): (scrollY + clientY) / doc_h_px at event time';
COMMENT ON COLUMN public.events.doc_w_px IS 'Document width in px at event time: max(scrollWidth, innerWidth)';
COMMENT ON COLUMN public.events.doc_h_px IS 'Document height in px at event time: max(scrollHeight, innerHeight)';
