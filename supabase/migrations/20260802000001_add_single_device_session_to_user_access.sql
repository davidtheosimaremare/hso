-- Add single device active session tracking columns to user_access
ALTER TABLE user_access 
ADD COLUMN IF NOT EXISTS active_session_id TEXT,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP WITH TIME ZONE;
