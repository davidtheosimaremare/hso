-- ==============================================================================
-- Migration: 20260820111000_add_prices_to_converter_rules.sql
-- Description: Add schneider_price and abb_price to converter_custom_rules
-- ==============================================================================

alter table converter_custom_rules 
  add column if not exists schneider_price numeric(15, 2),
  add column if not exists abb_price numeric(15, 2);
