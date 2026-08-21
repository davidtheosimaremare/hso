-- ==============================================================================
-- Migration: 20260820100500_enhance_converter_custom_rules.sql
-- Description: Add multi-brand fields & index for admin component mapping
-- ==============================================================================

alter table converter_custom_rules
  add column if not exists siemens_mlfb text,
  add column if not exists siemens_name text,
  add column if not exists schneider_model text,
  add column if not exists abb_model text,
  add column if not exists other_brand text,
  add column if not exists other_model text,
  add column if not exists specs_summary text,
  add column if not exists is_active boolean default true;

-- Backfill siemens_mlfb and source model columns if existing
update converter_custom_rules 
set siemens_mlfb = coalesce(siemens_mlfb, target_siemens_mlfb),
    siemens_name = coalesce(siemens_name, target_siemens_name),
    schneider_model = case when source_brand = 'SCHNEIDER' then coalesce(schneider_model, source_model) else schneider_model end,
    abb_model = case when source_brand = 'ABB' then coalesce(abb_model, source_model) else abb_model end
where siemens_mlfb is null or schneider_model is null or abb_model is null;

-- Indexes for lightning-fast cross-brand searching
create index if not exists idx_converter_rules_siemens_mlfb on converter_custom_rules (siemens_mlfb);
create index if not exists idx_converter_rules_schneider_model on converter_custom_rules (schneider_model);
create index if not exists idx_converter_rules_abb_model on converter_custom_rules (abb_model);
create index if not exists idx_converter_rules_category on converter_custom_rules (category);
