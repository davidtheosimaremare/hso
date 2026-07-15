-- Fix HP0 typo to HPO in all tables
-- HP0 (with zero) should be HPO (with letter O)

-- Fix raw_forwarder_tracking table
update raw_forwarder_tracking
set hpo_number = 'HPO' || substring(hpo_number from 4)
where hpo_number like 'HP0/%';

-- Fix shipments table
update shipments
set hpo_number = 'HPO' || substring(hpo_number from 4)
where hpo_number like 'HP0/%';

-- Fix accurate_receive_items table
update accurate_receive_items
set po_number = 'HPO' || substring(po_number from 4)
where po_number like 'HP0/%';

-- Log results
do $$
declare
  raw_count int;
  shipments_count int;
  receive_count int;
begin
  select count(*) into raw_count from raw_forwarder_tracking where hpo_number like 'HP0/%';
  select count(*) into shipments_count from shipments where hpo_number like 'HP0/%';
  select count(*) into receive_count from accurate_receive_items where po_number like 'HP0/%';
  
  raise notice 'Fixed HP0 typos:';
  raise notice '  raw_forwarder_tracking: % remaining', raw_count;
  raise notice '  shipments: % remaining', shipments_count;
  raise notice '  accurate_receive_items: % remaining', receive_count;
end $$;
