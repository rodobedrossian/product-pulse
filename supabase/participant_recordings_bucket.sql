-- Private bucket for dashboard-captured participant session audio (API uploads via service role).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('participant-recordings', 'participant-recordings', false, 104857600)
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;

-- Product Pulse uploads through the API with the service role; Storage RLS is optional.
-- If you add policies later, do not grant anon read on this bucket.
