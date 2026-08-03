-- Add metadata JSONB column and text columns to public.boq_requests for 100% reliable field storage
ALTER TABLE public.boq_requests 
ADD COLUMN IF NOT EXISTS project_name TEXT,
ADD COLUMN IF NOT EXISTS customer_name TEXT,
ADD COLUMN IF NOT EXISTS pic_name TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
