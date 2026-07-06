// FILE: supabase/functions/accurate-list-do/index.ts
// Fetches Delivery Orders from Supabase (synced from Accurate)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Initialize Supabase Client
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, supabaseKey)

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

        console.log(`Searching DO for HSO: ${filterHsoNumber}`)

        if (!filterHsoNumber) {
            return new Response(JSON.stringify({
                s: true,
                d: [],
                message: "No HSO Number provided"
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // Search logic in accurate_delivery_order_items
        let items: any[] = []
        let page = 0
        const pageSize = 1000
        let hasMore = true
        let queryError = null

        while (hasMore) {
            const { data, error } = await supabase
                .from('accurate_delivery_order_items')
                .select(`
                    *,
                    header:accurate_delivery_orders(
                        id, number, trans_date, status_name, customer_name, ship_to, driver_name
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
            doId: item.header?.id,
            doNumber: item.header?.number,
            doDate: item.header?.trans_date,
            doStatus: item.header?.status_name || 'Open',
            customerName: item.header?.customer_name,
            shipTo: item.header?.ship_to,
            driverName: item.header?.driver_name,
            itemCode: item.item_code,
            itemName: item.item_name,
            quantity: item.quantity,
            description: item.detail_notes,
            unitName: item.unit_name
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
