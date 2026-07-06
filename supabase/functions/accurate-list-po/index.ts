// FILE: supabase/functions/accurate-list-po/index.ts
// Fetches Purchase Orders from Supabase (synced from Accurate)
// Format yang dicari: HSO/YY/MM/NNN (tanpa VAHANA)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Initialize Supabase Client
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, supabaseKey)

// Check if description contains the HSO number (Optimized for DB query usage)
// NOTE: We will use ILIKE in DB, but exact matching logic in JS if needed.
// For DB, we can just search for the number part if it includes "HSO" in text.

serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }

    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        // Parse request body
        let filterHsoNumber: string | null = null
        try {
            const body = await req.json()
            filterHsoNumber = body.hsoNumber || null
        } catch (e) {
            // No body
        }

        console.log(`Searching PO for HSO: ${filterHsoNumber}`)

        if (!filterHsoNumber) {
            return new Response(JSON.stringify({
                s: true,
                d: [],
                message: "No HSO Number provided"
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // Search logic:
        // We want accurate_purchase_order_items where detail_notes ILIKE '%filterHsoNumber%'
        // Also join with accurate_purchase_orders to get header info.

        // The filterHsoNumber might be "HSO/25/01/001".
        // The notes might be "Reference HSO/25/01/001" or just "25/01/001" (if user typed partial).
        // Let's assume strict inclusive match for now.

        // Clean up HSO number for search?
        // If user sends "HSO/25/01/001", we search "%HSO/25/01/001%".

        let items: any[] = []
        let page = 0
        const pageSize = 1000
        let hasMore = true
        let queryError = null

        while (hasMore) {
            const { data, error } = await supabase
                .from('accurate_purchase_order_items')
                .select(`
                    *,
                    header:accurate_purchase_orders(
                        id, number, trans_date, status_name, vendor_name
                    )
                `)
                .ilike('detail_notes', `%${filterHsoNumber}%`)
                .range(page * pageSize, (page + 1) * pageSize - 1)
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })

            if (error) {
                queryError = error
                break
            }

            if (data && data.length > 0) {
                items = items.concat(data)
                if (data.length < pageSize) {
                    hasMore = false
                } else {
                    page++
                }
            } else {
                hasMore = false
            }
        }

        if (queryError) throw queryError

        // Transform to expected format
        const hsoMappings = items.map((item: any) => ({
            poId: item.header?.id,
            poNumber: item.header?.number,
            poDate: item.header?.trans_date,
            poStatus: item.header?.status_name || 'Open',
            itemCode: item.item_code,
            itemName: item.item_name,
            quantity: item.quantity,
            description: item.detail_notes,
            vendorName: item.header?.vendor_name
        }))

        console.log(`Found ${hsoMappings.length} matches from DB`)

        return new Response(JSON.stringify({
            s: true,
            d: hsoMappings,
            totalMappings: hsoMappings.length,
            filter: filterHsoNumber,
            source: 'database'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error("Error:", error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})

