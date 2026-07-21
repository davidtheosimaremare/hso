-- Seed existing ADMIN users with new granular permission keys
UPDATE user_access 
SET allowed_modules = ARRAY[
  'dashboard:read', 'dashboard:write',
  'sales-orders:read', 'sales-orders:write',
  'hsq:read', 'hsq:write',
  'cart:read', 'cart:write',
  'purchase-orders:read', 'purchase-orders:write',
  'receive-items:read', 'receive-items:write',
  'delivery-orders:read', 'delivery-orders:write',
  'logistics-db:read', 'logistics-db:write',
  'sop-guide:read', 'sop-guide:write',
  'settings:read', 'settings:write'
]::text[]
WHERE role = 'ADMIN';

-- Set default allowed modules in user_access if anyone is created as staff without modules
ALTER TABLE user_access ALTER COLUMN allowed_modules SET DEFAULT ARRAY['dashboard:read']::text[];
