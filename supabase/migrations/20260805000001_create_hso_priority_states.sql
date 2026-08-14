-- Migration: Create hso_priority_states table for team-wide HSO priority & pinning

CREATE TABLE IF NOT EXISTS public.hso_priority_states (
    so_number TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('pinned', 'low_priority', 'dismissed')),
    updated_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.hso_priority_states ENABLE ROW LEVEL SECURITY;

-- Allow read access for all users
DROP POLICY IF EXISTS "Allow read access for all" ON public.hso_priority_states;
CREATE POLICY "Allow read access for all" 
    ON public.hso_priority_states FOR SELECT 
    USING (true);

-- Allow write access for all users
DROP POLICY IF EXISTS "Allow write access for all" ON public.hso_priority_states;
CREATE POLICY "Allow write access for all" 
    ON public.hso_priority_states FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Enable Supabase Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.hso_priority_states;
