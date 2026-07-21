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
        DROP INDEX IF EXISTS public.idx_raw_forwarder_tracking_hpo_item;
        CREATE INDEX IF NOT EXISTS idx_raw_forwarder_tracking_hpo_item ON public.raw_forwarder_tracking(hpo_number, item_code);
      `

      return new Response(
        JSON.stringify({ message: "Migration successful: Dropped unique index idx_raw_forwarder_tracking_hpo_item" }),
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
