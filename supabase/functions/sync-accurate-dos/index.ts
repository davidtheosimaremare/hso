import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BASE_API = 'https://zeus.accurate.id/accurate/api'

// Initialize Supabase Client
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, supabaseKey)

// Helper: Native HMAC-SHA256 Signature
async function createHmacSha256(secret: string, message: string) {
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const msgData = encoder.encode(message)
    const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    const signature = await crypto.subtle.sign("HMAC", key, msgData)
    return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }

    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const accessToken = Deno.env.get('ACCURATE_ACCESS_TOKEN')
        const signatureSecret = Deno.env.get('ACCURATE_SIGNATURE_SECRET')

        if (!accessToken) throw new Error('Token Accurate belum disetting!')

        const reqBody = await req.json().catch(() => ({}))
        const requestPage = reqBody.page || 1
        const pageSize = 100 // Increased back to 100

        console.log(`Starting DO Sync Page ${requestPage}...`)

        // Generate Signature Header
        const timestamp = new Date().toISOString()
        let signatureHeader = {}
        if (signatureSecret) {
            const signature = await createHmacSha256(signatureSecret, timestamp)
            signatureHeader = { 'X-Api-Timestamp': timestamp, 'X-Api-Signature': signature }
        }

        const listUrl = new URL(`${BASE_API}/delivery-order/list.do`)
        listUrl.searchParams.append('fields', 'id,number,transDate,statusName,customer,shipTo,driverName')
        // No status filter = Sync ALL
        listUrl.searchParams.append('sp.pageSize', pageSize.toString())
        listUrl.searchParams.append('sp.page', requestPage.toString())
        listUrl.searchParams.append('sp.sort', 'transDate|desc')

        const listRes = await fetch(listUrl.toString(), {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...signatureHeader
            }
        })

        if (!listRes.ok) throw new Error(`Failed to fetch DO list page ${requestPage}: ${await listRes.text()}`)
        const listJson = await listRes.json()
        const doList = listJson.d || []

        console.log(`Fetched ${doList.length} DOs from page ${requestPage}. Processing details...`)

        const errors: any[] = []
        const BATCH_SIZE = 10
        let successCount = 0
        let failCount = 0

        for (let i = 0; i < doList.length; i += BATCH_SIZE) {
            const batch = doList.slice(i, i + BATCH_SIZE)
            const promises = batch.map(async (doc: any) => {
                try {
                    const detailUrl = `${BASE_API}/delivery-order/detail.do?id=${doc.id}`
                    const detailRes = await fetch(detailUrl, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                            ...signatureHeader
                        }
                    })

                    if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status} ${detailRes.statusText}`)
                    const detailJson = await detailRes.json()
                    const items = detailJson.d?.detailItem || []

                    // Helpers
                    const formatDate = (dateStr: string) => {
                        if (!dateStr) return null
                        const parts = dateStr.split('/')
                        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
                        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr
                        return null
                    }
                    const safeFloat = (val: any) => {
                        if (typeof val === 'number') return val
                        if (typeof val === 'string') return parseFloat(val.replace(/,/g, '')) || 0
                        return 0
                    }
                    const safeInt = (val: any) => {
                        if (typeof val === 'number') return Math.floor(val)
                        if (typeof val === 'string') return parseInt(val) || null
                        return null
                    }

                    const sanitizedHeader = {
                        id: safeInt(doc.id),
                        number: doc.number || 'UNKNOWN',
                        customer_id: safeInt(doc.customer?.id),
                        customer_name: doc.customer?.name,
                        trans_date: formatDate(doc.transDate),
                        status_name: doc.statusName,
                        ship_to: doc.shipTo,
                        driver_name: doc.driverName
                    }

                    // Helper to extract HSO Number
                    const extractHso = (note: string) => {
                        if (!note) return null
                        const match = note.match(/(HSO\/[\w\d\/]+)/i)
                        return match ? match[1] : null
                    }

                    const sanitizedItems = items.map((item: any, index: number) => ({
                        id: safeInt(item.id),
                        do_id: safeInt(doc.id),
                        item_code: item.item?.no,
                        item_name: item.item?.name,
                        quantity: safeFloat(item.quantity),
                        unit_name: item.itemUnit?.name,
                        detail_notes: item.detailNotes,
                        item_seq: index,
                        hso_number: extractHso(item.detailNotes)
                    }))

                    return {
                        header: sanitizedHeader,
                        items: sanitizedItems
                    }
                } catch (e) {
                    console.error(`Error processing DO ${doc.number}:`, e)
                    errors.push(`Processing Error DO ${doc.number}: ${e.message}`)
                    return null
                }
            })

            const results = await Promise.all(promises)
            const validResults = results.filter(r => r !== null)

            // Upsert to Supabase
            for (const data of validResults) {
                const { error: headerError } = await supabase
                    .from('accurate_delivery_orders')
                    .upsert(data.header)

                if (headerError) {
                    const msg = `DB Header Error ${data.header.number}: ${headerError.message}. Payload: ${JSON.stringify(data.header)}`
                    console.error(msg)
                    errors.push(msg)
                    failCount++
                    continue
                }

                const { error: deleteError } = await supabase
                    .from('accurate_delivery_order_items')
                    .delete()
                    .eq('do_id', data.header.id)

                if (deleteError) console.error(`Error clearing items for DO ${data.header.number}`, deleteError)

                if (data.items.length > 0) {
                    const { error: itemsError } = await supabase
                        .from('accurate_delivery_order_items')
                        .insert(data.items)

                    if (itemsError) {
                        const msg = `DB Items Error ${data.header.number}: ${itemsError.message}`
                        console.error(msg)
                        errors.push(msg)
                        failCount++
                    } else {
                        successCount++
                    }
                } else {
                    successCount++
                }
            }
        }

        return new Response(JSON.stringify({
            success: true,
            message: `Synced Page ${requestPage} (${successCount} OK, ${failCount} Fail)`,
            processed: doList.length,
            hasMore: doList.length === pageSize,
            nextPage: requestPage + 1,
            errors: errors.slice(0, 5),
            debug: {
                requestedPage: requestPage,
                receivedListCount: doList.length,
                urlParams: listUrl.searchParams.toString()
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error("Sync Error:", error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
