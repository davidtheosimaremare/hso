-- =============================================================
-- SETUP AUTOMATED PERMINTAAN DEADLINE REMINDER (H-1) CRON JOB
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule existing job if re-running
SELECT cron.unschedule('send-permintaan-deadline-reminder') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'send-permintaan-deadline-reminder'
);

-- Schedule daily cron job at 08:00 AM WIB (01:00 UTC)
SELECT cron.schedule(
    'send-permintaan-deadline-reminder',
    '0 1 * * *',
    $$
    SELECT net.http_post(
        url     := 'https://frmcfdelyznzpyctiugm.supabase.co/functions/v1/send-permintaan-deadline-reminder',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZybWNmZGVseXpuenB5Y3RpdWdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMDA1NzIsImV4cCI6MjA4MDY3NjU3Mn0.CkEX4v_Sqz_BKLCja44a8QcGpcVdDltPYabDZH03dfg'
        ),
        body    := '{}'::jsonb
    ) AS request_id;
    $$
);

-- Verify cron job
SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname = 'send-permintaan-deadline-reminder';
