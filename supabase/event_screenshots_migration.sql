-- Event screenshots: store the Supabase Storage object path per event.
-- Run in Supabase SQL Editor. Also create a private Storage bucket named `event-screenshots`.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS screenshot_object_path TEXT;
