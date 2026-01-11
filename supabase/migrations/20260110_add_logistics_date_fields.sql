-- Migration: Add separate date fields for logistics stages
-- Created: 2026-01-10

-- Add new date columns to shipments table
ALTER TABLE shipments 
ADD COLUMN IF NOT EXISTS exwork_date DATE,
ADD COLUMN IF NOT EXISTS eta_date DATE,
ADD COLUMN IF NOT EXISTS dunex_date DATE,
ADD COLUMN IF NOT EXISTS hokiindo_date DATE;

-- Add comment to columns
COMMENT ON COLUMN shipments.exwork_date IS 'Date when goods are ready at supplier (Ex-Works)';
COMMENT ON COLUMN shipments.eta_date IS 'Estimated arrival date at Port Jakarta';
COMMENT ON COLUMN shipments.dunex_date IS 'Date arrived at Dunex (Siemens) warehouse';
COMMENT ON COLUMN shipments.hokiindo_date IS 'Date arrived at Hokiindo Raya warehouse';
