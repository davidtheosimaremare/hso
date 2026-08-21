-- ==============================================================================
-- Migration: 20260820104500_add_descriptions_to_converter_rules.sql
-- Description: Add schneider_desc and abb_desc for description-based matching
-- ==============================================================================

alter table converter_custom_rules 
  add column if not exists schneider_desc text,
  add column if not exists abb_desc text;

-- Create search indexes on descriptions for fast lookup
create index if not exists idx_converter_rules_schneider_desc on converter_custom_rules using gin(to_tsvector('english', coalesce(schneider_desc, '')));
create index if not exists idx_converter_rules_abb_desc on converter_custom_rules using gin(to_tsvector('english', coalesce(abb_desc, '')));
