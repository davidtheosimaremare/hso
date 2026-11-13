-- =============================================================
-- SETUP WEEKLY HSO TASK RECAP CRON JOB (EVERY FRIDAY 08:00 WIB)
-- =============================================================

-- Ensure system_settings has initial default value for weekly_recap_settings
INSERT INTO system_settings (key, value, updated_at)
VALUES (
  'weekly_recap_settings',
  '{
    "mode": "test",
    "test_recipients": ["davidtheosimaremare@gmail.com"],
    "production_recipients": ["sales@hokiindo.co.id", "info@hokiindo.co.id", "purchasing@hokiindo.co.id"],
    "custom_recipients": [],
    "day_of_week": "Jumat",
    "send_time": "08:00",
    "stagnant_threshold_days": 5,
    "is_active": true
  }'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;

-- Enable extensions if not already present
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unscheduling old job if exists
SELECT cron.unschedule('weekly-hso-task-recap') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'weekly-hso-task-recap'
);

-- Buat cron job baru untuk mengirim rekap mingguan tugas HSO
-- Jadwal: Setiap hari Jumat jam 08:00 WIB (01:00 UTC) -> '0 1 * * 5'
SELECT cron.schedule(
    'weekly-hso-task-recap',
    '0 1 * * 5',
    $$
    SELECT net.http_post(
        url     := 'https://frmcfdelyznzpyctiugm.supabase.co/functions/v1/send-weekly-recap',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZybWNmZGVseXpuenB5Y3RpdWdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMDA1NzIsImV4cCI6MjA4MDY3NjU3Mn0.CkEX4v_Sqz_BKLCja44a8QcGpcVdDltPYabDZH03dfg'
        ),
        body    := '{}'::jsonb
    ) AS request_id;
    $$
);

-- Verifikasi cron job terdaftar
SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname = 'weekly-hso-task-recap';

