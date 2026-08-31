-- Per-user read state for deterministic, source-derived notifications.
-- Notification content remains derived from RLS-visible source records.
CREATE TABLE IF NOT EXISTS public.notification_reads (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_key TEXT NOT NULL CHECK (length(notification_key) BETWEEN 3 AND 180),
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (profile_id, notification_key)
);

CREATE INDEX IF NOT EXISTS notification_reads_profile_time_idx
  ON public.notification_reads (profile_id, read_at DESC);

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notification_reads FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.notification_reads TO authenticated;

DROP POLICY IF EXISTS "Users read their notification state" ON public.notification_reads;
CREATE POLICY "Users read their notification state" ON public.notification_reads
  FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Users create their notification state" ON public.notification_reads;
CREATE POLICY "Users create their notification state" ON public.notification_reads
  FOR INSERT WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Users update their notification state" ON public.notification_reads;
CREATE POLICY "Users update their notification state" ON public.notification_reads
  FOR UPDATE USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

REVOKE DELETE ON public.notification_reads FROM anon, authenticated;
