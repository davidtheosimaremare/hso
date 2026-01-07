// FILE: supabase/functions/accurate-list-po/index.ts
// Fetches Purchase Orders from Accurate and finds items matching HSO number
// Format yang dicari: HSO/YY/MM/NNN (tanpa VAHANA)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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

// Check if description contains the HSO number
// Format: HSO/25/11/140 (case insensitive)
function containsHsoRef(description: string, hsoNumber: string): boolean {
    if (!description || !hsoNumber) return false

    const descUpper = description.toUpperCase()
    const hsoUpper = hsoNumber.toUpperCase()

    // Direct match (HSO/25/11/140)
    if (descUpper.includes(hsoUpper)) return true

    // Match without HSO/ prefix (just 25/11/140)
    const numberPart = hsoUpper.replace('HSO/', '')
    if (descUpper.includes(numberPart) && descUpper.includes('HSO')) return true

    return false
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

        // Parse request body
        let filterHsoNumber: string | null = null
        let itemCodes: string[] = []
        try {
            const body = await req.json()
            filterHsoNumber = body.hsoNumber || null
            itemCodes = body.items || []
        } catch (e) {
            // No body
        }

        console.log(`Searching PO for HSO: ${filterHsoNumber}`)

        // Generate Signature Header
        const timestamp = new Date().toISOString()
        let signatureHeader = {}
        if (signatureSecret) {
            const signature = await createHmacSha256(signatureSecret, timestamp)
            signatureHeader = { 'X-Api-Timestamp': timestamp, 'X-Api-Signature': signature }
        }

        // Fetch PO list
        const listUrl = new URL(`${BASE_API}/purchase-order/list.do`)
        listUrl.searchParams.append('fields', 'id,number,transDate,statusName')
        listUrl.searchParams.append('filter.statusName.op', 'NOT_IN')
        listUrl.searchParams.append('filter.statusName.val', 'Closed,Dibatalkan')
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
            throw new Error(`Accurate PO List Error: ${errText}`)
        }

        const listJson = await listResponse.json()
        const poList = listJson.d || []

        console.log(`Got ${poList.length} POs`)

        // Find matching items
        const hsoMappings: Array<{
            poId: number
            poNumber: string
            poDate: string
            itemCode: string
            itemName: string
            quantity: number
            description: string
        }> = []

        // Process POs in parallel
        const BATCH_SIZE = 10
        for (let i = 0; i < poList.length; i += BATCH_SIZE) {
            const batch = poList.slice(i, i + BATCH_SIZE)

            const batchPromises = batch.map(async (po: any) => {
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
                        const items = detailJson.d?.detailItem || []

                        items.forEach((item: any) => {
                            const description = item.detailNotes || ''
                            const itemCode = item.item?.no || ''

                            // Debug: Log descriptions containing HSO
                            if (description.toUpperCase().includes('HSO')) {
                                console.log(`PO ${po.number} - ${itemCode}: "${description}"`)
                            }

                            // Check if this item references the target HSO
                            if (filterHsoNumber && containsHsoRef(description, filterHsoNumber)) {
                                console.log(`MATCH: PO ${po.number}, Item ${itemCode}`)
                                hsoMappings.push({
                                    poId: po.id,
                                    poNumber: po.number,
                                    poDate: po.transDate,
                                    itemCode: itemCode,
                                    itemName: item.item?.name || item.detailName || '',
                                    quantity: item.quantity || 0,
                                    description: description
                                })
                            }
                        })
                    }
                } catch (err) {
                    console.error(`Failed PO ${po.id}:`, err)
                }
            })

            await Promise.all(batchPromises)
            if (i + BATCH_SIZE < poList.length) {
                await new Promise(r => setTimeout(r, 50))
            }
        }

        console.log(`Found ${hsoMappings.length} matches`)

        return new Response(JSON.stringify({
            s: true,
            d: hsoMappings,
            totalPOs: poList.length,
            totalMappings: hsoMappings.length,
            filter: filterHsoNumber
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
