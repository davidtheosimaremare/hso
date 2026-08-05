import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import * as postgres from "https://deno.land/x/postgres@v0.17.0/mod.ts"

// Get the connection string from the environment variable "SUPABASE_DB_URL"
const databaseUrl = Deno.env.get('SUPABASE_DB_URL')!

const pool = new postgres.Pool(databaseUrl, 3, true)

serve(async (req) => {
  try {
    const connection = await pool.connect()

    try {
      // Run the migration SQL
      await connection.queryObject`
        ALTER TABLE public.marketing_events
          ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS media_files JSONB DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS expenses JSONB DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS cost_amount NUMERIC DEFAULT 0;

        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = 'marketing_idea_comments'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE marketing_idea_comments;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = 'marketing_idea_likes'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE marketing_idea_likes;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = 'marketing_ideas'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE marketing_ideas;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = 'marketing_events'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE marketing_events;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = 'purchase_cart'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE purchase_cart;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = 'hsq_tasks'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE hsq_tasks;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = 'boq_requests'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE boq_requests;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = 'marketing_idea_revisions'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE marketing_idea_revisions;
          END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS public.marketing_idea_revisions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          idea_id UUID NOT NULL REFERENCES public.marketing_ideas(id) ON DELETE CASCADE,
          edited_by TEXT NOT NULL,
          edited_at TIMESTAMPTZ DEFAULT NOW(),
          title TEXT,
          description TEXT,
          tags TEXT[],
          platforms TEXT[],
          change_summary TEXT,
          previous_title TEXT,
          previous_description TEXT
        );

        ALTER TABLE public.marketing_ideas ADD COLUMN IF NOT EXISTS revisions JSONB DEFAULT '[]'::jsonb;
      `

      // Inspect marketing_ideas columns
      const cols = await connection.queryObject`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'marketing_ideas'
        ORDER BY ordinal_position
      `

      // Add missing target_date column if needed
      await connection.queryObject`
        ALTER TABLE public.marketing_ideas ADD COLUMN IF NOT EXISTS target_date DATE;
      `

      // Inspect RLS policies
      const pols = await connection.queryObject`
        SELECT policyname, cmd, roles::text FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'marketing_ideas'
      `

      // Inspect realtime publication tables
      const pubs = await connection.queryObject`
        SELECT tablename FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        ORDER BY tablename
      `

      return new Response(
        JSON.stringify({ message: "Migration successful: Added columns + Realtime publication for marketing_ideas/comments/likes", columns: cols.rows.map(r => `${r.column_name}:${r.data_type}`), policies: pols.rows, realtimeTables: pubs.rows.map(r => r.tablename) }),
        { headers: { "Content-Type": "application/json" } },
      )
    } finally {
      connection.release()
    }
  } catch (err) {
    console.error(err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
})
