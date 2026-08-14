-- Migration: Remove assigned_to column from sales_leads table
DROP INDEX IF EXISTS public.idx_sales_leads_assigned_to;
ALTER TABLE public.sales_leads DROP COLUMN IF EXISTS assigned_to;
