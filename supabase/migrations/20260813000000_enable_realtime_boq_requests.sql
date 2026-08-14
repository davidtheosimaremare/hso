-- Enable Supabase Realtime for boq_requests (kanban board sync) and boq_comments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'boq_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.boq_requests;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'boq_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.boq_comments;
  END IF;
END $$;
