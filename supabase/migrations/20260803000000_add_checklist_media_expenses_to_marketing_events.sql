-- Migration: Add checklist, media_files, expenses, cost_amount to marketing_events
-- These columns were used in the Vue UI but missing from the actual table,
-- causing silent fallback to marketing_ideas and lost data on reload.

ALTER TABLE public.marketing_events
  ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS media_files JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS expenses JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cost_amount NUMERIC DEFAULT 0;

-- Add missing target_date column used by status updates (planning/published) in Marketing Hub
ALTER TABLE public.marketing_ideas
  ADD COLUMN IF NOT EXISTS target_date DATE;

-- Enable Realtime for marketing tables (comments, likes, ideas, events)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'marketing_idea_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE marketing_idea_comments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'marketing_idea_likes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE marketing_idea_likes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'marketing_ideas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE marketing_ideas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'marketing_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE marketing_events;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'purchase_cart'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE purchase_cart;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'hsq_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE hsq_tasks;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'boq_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE boq_requests;
  END IF;
END $$;
