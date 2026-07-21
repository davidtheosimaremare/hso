-- Migration: Create tables for HSQ Sales Progress, Activity Logs, and Client Tasks
-- Date: 2026-07-20

-- 1. HSQ Progress & Probability Table
CREATE TABLE IF NOT EXISTS public.hsq_progress (
    id BIGSERIAL PRIMARY KEY,
    hsq_number TEXT NOT NULL UNIQUE,
    stage TEXT DEFAULT 'Prospecting',
    probability INT DEFAULT 10,
    expected_closing_date DATE,
    notes TEXT,
    updated_by TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by hsq_number
CREATE INDEX IF NOT EXISTS idx_hsq_progress_number ON public.hsq_progress(hsq_number);

-- 2. HSQ Sales Activity Logs Table
CREATE TABLE IF NOT EXISTS public.hsq_activity_logs (
    id BIGSERIAL PRIMARY KEY,
    hsq_number TEXT NOT NULL,
    activity_type TEXT DEFAULT 'Follow Up',
    notes TEXT NOT NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hsq_activity_number ON public.hsq_activity_logs(hsq_number);

-- 3. HSQ Client Tasks Table
CREATE TABLE IF NOT EXISTS public.hsq_tasks (
    id BIGSERIAL PRIMARY KEY,
    hsq_number TEXT NOT NULL,
    client_name TEXT,
    task_title TEXT NOT NULL,
    due_date DATE,
    status TEXT DEFAULT 'Pending',
    assigned_to TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hsq_tasks_number ON public.hsq_tasks(hsq_number);
CREATE INDEX IF NOT EXISTS idx_hsq_tasks_status ON public.hsq_tasks(status);

-- Enable RLS and add public access policies
ALTER TABLE public.hsq_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hsq_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hsq_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read hsq_progress" ON public.hsq_progress FOR SELECT USING (true);
CREATE POLICY "Allow public insert hsq_progress" ON public.hsq_progress FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update hsq_progress" ON public.hsq_progress FOR UPDATE USING (true);

CREATE POLICY "Allow public read hsq_activity_logs" ON public.hsq_activity_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert hsq_activity_logs" ON public.hsq_activity_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update hsq_activity_logs" ON public.hsq_activity_logs FOR UPDATE USING (true);
CREATE POLICY "Allow public delete hsq_activity_logs" ON public.hsq_activity_logs FOR DELETE USING (true);

CREATE POLICY "Allow public read hsq_tasks" ON public.hsq_tasks FOR SELECT USING (true);
CREATE POLICY "Allow public insert hsq_tasks" ON public.hsq_tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update hsq_tasks" ON public.hsq_tasks FOR UPDATE USING (true);
CREATE POLICY "Allow public delete hsq_tasks" ON public.hsq_tasks FOR DELETE USING (true);

GRANT ALL ON public.hsq_progress TO anon, authenticated, service_role;
GRANT ALL ON public.hsq_activity_logs TO anon, authenticated, service_role;
GRANT ALL ON public.hsq_tasks TO anon, authenticated, service_role;
