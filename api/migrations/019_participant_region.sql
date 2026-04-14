-- Coarse subdivision (e.g. US state) from GeoLite2 City; populated server-side from IP.
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS region TEXT;

COMMENT ON COLUMN public.participants.region IS
  'First subdivision name from IP geolocation (e.g. state), English display name.';
