-- Enable realtime updates for teacher alerts so they can “pop” instantly on the teacher dashboard

-- Ensure updates include full row data
ALTER TABLE public.teacher_alerts REPLICA IDENTITY FULL;

-- Add table to realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'teacher_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_alerts;
  END IF;
END $$;