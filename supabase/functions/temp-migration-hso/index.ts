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
        ALTER TABLE accurate_purchase_order_items ADD COLUMN IF NOT EXISTS hso_number TEXT;
        ALTER TABLE accurate_delivery_order_items ADD COLUMN IF NOT EXISTS hso_number TEXT;
      `

      return new Response(
        JSON.stringify({ message: "Migration successful: Added hso_number columns" }),
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
