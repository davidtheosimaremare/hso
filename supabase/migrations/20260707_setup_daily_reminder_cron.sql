-- =============================================================
-- SETUP DAILY LOGISTICS REMINDER EMAIL CRON JOB
-- Jalankan di Supabase Dashboard > SQL Editor atau migrasikan
-- =============================================================

-- Enable pg_net extension (jika belum aktif)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Hapus job lama jika ada
SELECT cron.unschedule('send-daily-reminder') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'send-daily-reminder'
);

-- Buat cron job baru untuk mengirim rekap harian logistik
-- Jadwal: Setiap hari jam 08:00 WIB (01:00 UTC) -> '0 1 * * *'
SELECT cron.schedule(
    'send-daily-reminder',
    '0 1 * * *',
    $$
    SELECT net.http_post(
        url     := 'https://frmcfdelyznzpyctiugm.supabase.co/functions/v1/send-daily-reminder',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZybWNmZGVseXpuenB5Y3RpdWdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMDA1NzIsImV4cCI6MjA4MDY3NjU3Mn0.CkEX4v_Sqz_BKLCja44a8QcGpcVdDltPYabDZH03dfg'
        ),
        body    := '{}'::jsonb
    ) AS request_id;
    $$
);

-- Verifikasi cron job terdaftar
SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname = 'send-daily-reminder';
