// FILE: supabase/functions/accurate-sync-hpo/index.ts
// Syncs HPO numbers from Purchase Orders to shipments table
// OPTIMIZED: Search PO by description containing HSO number

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const BASE_API = 'https://zeus.accurate.id/accurate/api'

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
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!accessToken) throw new Error('Token Accurate belum disetting!')
        if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase config missing!')

        // Parse request body - expecting soId (HSO ID), soNumber (HSO number), and items (list of item codes)
        const { soId, soNumber, items } = await req.json()

        if (!soId || !soNumber) {
            throw new Error('soId dan soNumber wajib dikirim!')
        }

        console.log(`Syncing HPO for HSO: ${soNumber} (ID: ${soId}), Items: ${items?.length || 0}`)

        // Initialize Supabase client
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Generate Signature Header
        const timestamp = new Date().toISOString()
        let signatureHeader = {}
        if (signatureSecret) {
            const signature = await createHmacSha256(signatureSecret, timestamp)
            signatureHeader = { 'X-Api-Timestamp': timestamp, 'X-Api-Signature': signature }
        }

        // OPTIMIZED: Search PO by description containing HSO number
        // Format search: "VAHANA HSO/25/12/370" -> search for "HSO/25/12/370"
        const searchKeyword = soNumber // e.g., "HSO/25/12/370"

        console.log(`Searching POs with keyword: ${searchKeyword}`)

        // Fetch PO list with filter by description
        const listUrl = new URL(`${BASE_API}/purchase-order/list.do`)
        listUrl.searchParams.append('fields', 'id,number,transDate,statusName')
        listUrl.searchParams.append('filter.statusName.op', 'NOT_IN')
        listUrl.searchParams.append('filter.statusName.val', 'Closed,Dibatalkan')
        listUrl.searchParams.append('filter.keywords.op', 'CONTAIN')
        listUrl.searchParams.append('filter.keywords.val', searchKeyword)
        listUrl.searchParams.append('sp.pageSize', '50')
        listUrl.searchParams.append('sp.sort', 'transDate|desc')

        const listResponse = await fetch(listUrl.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...signatureHeader
            }
        })

        if (!listResponse.ok) {
            const errText = await listResponse.text()
            console.error(`PO Search failed: ${errText}`)
            // If filter.keywords doesn't work, fallback to description filter
            // Try alternative approach
        }

        const listJson = await listResponse.json()
        const poList = listJson.d || []

        console.log(`Found ${poList.length} POs matching "${searchKeyword}"`)

        if (poList.length === 0) {
            return new Response(JSON.stringify({
                s: true,
                message: `Tidak ada PO ditemukan untuk ${soNumber}`,
                stats: { totalPOsFound: 0, matchingItems: 0, updated: 0, created: 0 },
                items: []
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // Map of item codes we're looking for (from SO items)
        const itemCodesSet = new Set(items || [])

        // Find matching items in the POs
        const matchingItems: Array<{
            poNumber: string
            itemCode: string
            quantity: number
        }> = []

        // Fetch detail for matching POs
        for (const po of poList) {
            try {
                const detailUrl = `${BASE_API}/purchase-order/detail.do?id=${po.id}`
                const detailRes = await fetch(detailUrl, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        ...signatureHeader
                    }
                })

                if (detailRes.ok) {
                    const detailJson = await detailRes.json()
                    const poItems = detailJson.d?.detailItem || []

                    poItems.forEach((item: any) => {
                        const itemCode = item.item?.no || ''
                        const description = item.detailNotes || ''

                        // Check if this item's description contains our HSO number
                        // AND the item code is in our SO items list (if provided)
                        const hasHsoRef = description.toUpperCase().includes(soNumber.toUpperCase())
                        const isMatchingItem = itemCodesSet.size === 0 || itemCodesSet.has(itemCode)

                        if (hasHsoRef && isMatchingItem && itemCode) {
                            matchingItems.push({
                                poNumber: po.number,
                                itemCode: itemCode,
                                quantity: item.quantity || 0
                            })
                        }
                    })
                }
            } catch (err) {
                console.error(`Failed to fetch PO ${po.id}:`, err)
            }
        }

        console.log(`Found ${matchingItems.length} matching items in POs for ${soNumber}`)

        // Update shipments table for matching items
        let updatedCount = 0
        let createdCount = 0

        for (const item of matchingItems) {
            if (!item.itemCode) continue

            // Check if shipment record exists
            const { data: existingShipment } = await supabase
                .from('shipments')
                .select('id, current_status, hpo_number')
                .eq('so_id', String(soId))
                .eq('item_code', item.itemCode)
                .maybeSingle()

            if (existingShipment) {
                // Update existing record only if hpo_number is not already set
                if (!existingShipment.hpo_number) {
                    const updatePayload: any = {
                        hpo_number: item.poNumber,
                        updated_at: new Date().toISOString()
                    }

                    // Also update status to "Follow up to factory" if still pending
                    if (existingShipment.current_status === 'Pending Process') {
                        updatePayload.current_status = 'Follow up to factory'
                        updatePayload.status_date = new Date().toISOString().split('T')[0]
                    }

                    const { error: updateErr } = await supabase
                        .from('shipments')
                        .update(updatePayload)
                        .eq('id', existingShipment.id)

                    if (!updateErr) {
                        updatedCount++
                        console.log(`Updated shipment for item ${item.itemCode} with HPO ${item.poNumber}`)
                    }
                }
            } else {
                // Create new shipment record
                const { error: insertErr } = await supabase
                    .from('shipments')
                    .insert({
                        so_id: String(soId),
                        item_code: item.itemCode,
                        hpo_number: item.poNumber,
                        current_status: 'Follow up to factory',
                        status_date: new Date().toISOString().split('T')[0],
                        shipment_type: 'IMPORT_PO',
                        admin_notes: 'Auto-synced dari PO Accurate'
                    })

                if (!insertErr) {
                    createdCount++
                    console.log(`Created shipment for item ${item.itemCode} with HPO ${item.poNumber}`)
                }
            }
        }

        return new Response(JSON.stringify({
            s: true,
            message: `Sync selesai untuk ${soNumber}`,
            stats: {
                totalPOsFound: poList.length,
                matchingItems: matchingItems.length,
                updated: updatedCount,
                created: createdCount
            },
            items: matchingItems
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error("Function Error:", error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
