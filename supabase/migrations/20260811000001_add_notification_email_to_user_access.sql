-- =============================================================
-- ADD NOTIFICATION_EMAIL TO USER_ACCESS TABLE
-- Enables mapping active notification emails for user accounts
-- =============================================================

ALTER TABLE public.user_access 
ADD COLUMN IF NOT EXISTS notification_email TEXT;
