-- Add AI-generated product summary to product_maps.
-- Nullable — maps without an OPENAI_API_KEY set will have NULL here.
ALTER TABLE public.product_maps
  ADD COLUMN IF NOT EXISTS ai_summary TEXT;
