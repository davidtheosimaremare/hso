-- =============================================================
-- SETUP SMART POLLING + REALTIME UNTUK PO AUTO-SYNC
-- Jalankan di Supabase Dashboard > SQL Editor
-- =============================================================

-- -----------------------------------------------
-- STEP 1: Enable pg_cron (jika belum aktif)
-- -----------------------------------------------
-- Note: pg_cron mungkin perlu diaktifkan via Dashboard > 
-- Database > Extensions > cron. Cari 'pg_cron' dan enable.
-- Setelah enable, baru jalankan SQL di bawah.

-- -----------------------------------------------
-- STEP 2: Enable pg_net extension (untuk HTTP call dari cron)
-- -----------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_net;

-- -----------------------------------------------
-- STEP 3: Cron Job — Sync PO terbaru setiap 5 menit
-- -----------------------------------------------
-- Hapus job lama jika ada
SELECT cron.unschedule('sync-recent-pos') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'sync-recent-pos'
);

-- Buat cron job baru
-- Ganti <SUPABASE_ANON_KEY> dengan VITE_SUPABASE_ANON_KEY dari .env
SELECT cron.schedule(
    'sync-recent-pos',
    '*/5 * * * *',   -- setiap 5 menit
    $$
    SELECT net.http_post(
        url     := 'https://frmcfdelyznzpyctiugm.supabase.co/functions/v1/sync-accurate-pos-recent',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZybWNmZGVseXpuenB5Y3RpdWdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMDA1NzIsImV4cCI6MjA4MDY3NjU3Mn0.CkEX4v_Sqz_BKLCja44a8QcGpcVdDltPYabDZH03dfg'
        ),
        body    := '{"lookback_minutes": 10, "max_pos": 25}'::jsonb
    ) AS request_id;
    $$
);

-- Verifikasi cron job terdaftar
SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname = 'sync-recent-pos';

-- -----------------------------------------------
-- STEP 4: Enable Realtime untuk tabel PO
-- -----------------------------------------------
-- Tambah tabel ke Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE accurate_purchase_order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE accurate_purchase_orders;

-- -----------------------------------------------
-- STEP 5: Tambah kolom yang mungkin belum ada
-- -----------------------------------------------
ALTER TABLE accurate_purchase_order_items
    ADD COLUMN IF NOT EXISTS item_seq    integer,
    ADD COLUMN IF NOT EXISTS hso_number  text;

-- Index untuk performa realtime filter
CREATE INDEX IF NOT EXISTS idx_po_items_hso_number
    ON accurate_purchase_order_items (hso_number)
    WHERE hso_number IS NOT NULL;

-- -----------------------------------------------
-- VERIFIKASI: Cek cron jobs yang berjalan
-- -----------------------------------------------
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
