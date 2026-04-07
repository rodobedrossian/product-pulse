-- Moderated session audio captured from the dashboard (verbal consent before Record).
CREATE TABLE public.participant_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  tid TEXT NOT NULL,
  audio_object_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_participant_recordings_test_id ON public.participant_recordings(test_id);
CREATE INDEX idx_participant_recordings_participant_id ON public.participant_recordings(participant_id);
CREATE INDEX idx_participant_recordings_tid_test ON public.participant_recordings(tid, test_id);

ALTER TABLE public.participant_recordings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.participant_recordings IS 'Audio from moderated tests; linked to participant and tid for correlation with prototype events.';
