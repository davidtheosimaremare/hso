-- Add project_name, customer_name, and pic_name columns to public.boq_requests
ALTER TABLE public.boq_requests 
ADD COLUMN IF NOT EXISTS project_name TEXT,
ADD COLUMN IF NOT EXISTS customer_name TEXT,
ADD COLUMN IF NOT EXISTS pic_name TEXT;
