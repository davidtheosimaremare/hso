-- Create user_access table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- Add role column to user_access
ALTER TABLE user_access ADD COLUMN IF NOT EXISTS role text DEFAULT 'STAFF';

-- Add allowed_modules column to user_access
ALTER TABLE user_access ADD COLUMN IF NOT EXISTS allowed_modules text[] DEFAULT ARRAY['dashboard']::text[];

-- Make sure existing users (if any) are set to ADMIN to avoid lockout
UPDATE user_access 
SET role = 'ADMIN', 
    allowed_modules = ARRAY[
      'dashboard', 
      'sales-orders', 
      'hsq', 
      'cart', 
      'purchase-orders', 
      'receive-items', 
      'delivery-orders', 
      'logistics-db', 
      'sop-guide', 
      'settings'
    ]::text[]
WHERE role IS NULL OR role = 'STAFF';
