-- Migration: Create hso_discussions and notifications tables
-- Enables HSO item & order-level team discussions, progress updates, @mentions, and in-app notifications

-- 1. Create hso_discussions table
CREATE TABLE IF NOT EXISTS public.hso_discussions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    so_id TEXT NOT NULL,
    so_number TEXT NOT NULL,
    item_code TEXT,
    item_name TEXT,
    user_email TEXT NOT NULL,
    user_name TEXT,
    message TEXT NOT NULL,
    progress_status TEXT DEFAULT 'PROGRESS',
    tagged_emails TEXT[] DEFAULT '{}',
    parent_id UUID REFERENCES public.hso_discussions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for speedy queries
CREATE INDEX IF NOT EXISTS idx_hso_discussions_so_id ON public.hso_discussions (so_id);
CREATE INDEX IF NOT EXISTS idx_hso_discussions_so_number ON public.hso_discussions (so_number);
CREATE INDEX IF NOT EXISTS idx_hso_discussions_parent_id ON public.hso_discussions (parent_id);
CREATE INDEX IF NOT EXISTS idx_hso_discussions_created_at ON public.hso_discussions (created_at DESC);

-- Enable RLS
ALTER TABLE public.hso_discussions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access for all hso_discussions" ON public.hso_discussions;
CREATE POLICY "Allow read access for all hso_discussions" 
    ON public.hso_discussions FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Allow write access for all hso_discussions" ON public.hso_discussions;
CREATE POLICY "Allow write access for all hso_discussions" 
    ON public.hso_discussions FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- 2. Create notifications table if not exists
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_email TEXT,
    user_email TEXT,
    title TEXT NOT NULL,
    message TEXT,
    type TEXT DEFAULT 'GENERAL',
    link TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications (recipient_email);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_email);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at DESC);

-- Enable RLS for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access for all notifications" ON public.notifications;
CREATE POLICY "Allow read access for all notifications" 
    ON public.notifications FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Allow write access for all notifications" ON public.notifications;
CREATE POLICY "Allow write access for all notifications" 
    ON public.notifications FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Add to Realtime Publication safely
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.hso_discussions;
    EXCEPTION WHEN duplicate_object THEN
        -- already in publication
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION WHEN duplicate_object THEN
        -- already in publication
    END;
END $$;

