-- Migration: Add marketing_idea_revisions table and revisions column to marketing_ideas
-- Enables revision history tracking for Marketing Hub ideas/posts

CREATE TABLE IF NOT EXISTS public.marketing_idea_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES public.marketing_ideas(id) ON DELETE CASCADE,
  edited_by TEXT NOT NULL,
  edited_at TIMESTAMPTZ DEFAULT NOW(),
  title TEXT,
  description TEXT,
  tags TEXT[],
  platforms TEXT[],
  change_summary TEXT,
  previous_title TEXT,
  previous_description TEXT
);

-- Index for fast retrieval of revisions by idea_id
CREATE INDEX IF NOT EXISTS idx_marketing_idea_revisions_idea_id ON public.marketing_idea_revisions(idea_id);

-- Add fallback JSONB revisions column to marketing_ideas
ALTER TABLE public.marketing_ideas
  ADD COLUMN IF NOT EXISTS revisions JSONB DEFAULT '[]'::jsonb;

-- Enable Realtime for marketing_idea_revisions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'marketing_idea_revisions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE marketing_idea_revisions;
  END IF;
END $$;
