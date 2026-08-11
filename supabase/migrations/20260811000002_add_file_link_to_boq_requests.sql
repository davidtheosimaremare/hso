-- Ensure project_name, customer_name, pic_name, file_link, and metadata columns exist in public.boq_requests
ALTER TABLE public.boq_requests 
ADD COLUMN IF NOT EXISTS project_name TEXT,
ADD COLUMN IF NOT EXISTS customer_name TEXT,
ADD COLUMN IF NOT EXISTS pic_name TEXT,
ADD COLUMN IF NOT EXISTS file_link TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
