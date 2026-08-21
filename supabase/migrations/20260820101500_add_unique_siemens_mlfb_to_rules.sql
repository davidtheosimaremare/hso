-- ==============================================================================
-- Migration: 20260820101500_add_unique_siemens_mlfb_to_rules.sql
-- Description: Add unique index on siemens_mlfb for seamless autosave upserts
-- ==============================================================================

-- Delete duplicates if any
delete from converter_custom_rules a using (
  select min(id::text)::uuid as min_id, siemens_mlfb 
  from converter_custom_rules 
  where siemens_mlfb is not null 
  group by siemens_mlfb having count(*) > 1
) b
where a.siemens_mlfb = b.siemens_mlfb and a.id <> b.min_id;

-- Create unique index
drop index if exists idx_converter_rules_siemens_mlfb;
create unique index if not exists idx_converter_rules_siemens_mlfb_uniq on converter_custom_rules (siemens_mlfb);
