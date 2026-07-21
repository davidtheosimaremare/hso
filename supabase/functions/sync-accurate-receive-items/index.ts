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
        const pageSize = 100 

        console.log(`Starting Receive Item Sync Page ${requestPage}...`)

        // Generate Signature Header
        const timestamp = new Date().toISOString()
        let signatureHeader = {}
        if (signatureSecret) {
            const signature = await createHmacSha256(signatureSecret, timestamp)
            signatureHeader = { 'X-Api-Timestamp': timestamp, 'X-Api-Signature': signature }
        }

        const listUrl = new URL(`${BASE_API}/receive-item/list.do`)
        listUrl.searchParams.append('fields', 'id,number,transDate,statusName')
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

        if (!listRes.ok) throw new Error(`Failed to fetch RI list page ${requestPage}: ${await listRes.text()}`)
        const listJson = await listRes.json()
        const riList = listJson.d || []

        console.log(`Fetched ${riList.length} RIs from page ${requestPage}. Processing details...`)

        const errors: any[] = []
        const BATCH_SIZE = 10
        let successCount = 0

        // Process details in batches
        for (let i = 0; i < riList.length; i += BATCH_SIZE) {
            const batch = riList.slice(i, i + BATCH_SIZE)
            const promises = batch.map(async (ri: any) => {
                try {
                    const detailUrl = `${BASE_API}/receive-item/detail.do?id=${ri.id}`
                    const detailRes = await fetch(detailUrl, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                            ...signatureHeader
                        }
                    })

                    if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status} ${detailRes.statusText}`)
                    const doc = (await detailRes.json()).d
                    if (!doc) throw new Error("RI not found")

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
                    const extractHso = (note: string) => {
                        if (!note) return null
                        const match = note.match(/(HSO\/[\w\d\/]+)/i)
                        return match ? match[1] : null
                    }
                    
                    const poNumber = doc.purchaseOrder?.number ?? doc.poNumber ?? null
                    const transDate = formatDate(doc.transDate)

                    const header = {
                        id: safeInt(doc.id),
                        number: doc.number ?? 'UNKNOWN',
                        vendor_id: safeInt(doc.vendor?.id),
                        vendor_name: doc.vendor?.name ?? null,
                        trans_date: transDate,
                        status_name: doc.statusName ?? null,
                        branch_id: safeInt(doc.branch?.id),
                        po_number: poNumber
                    }

                    const itemsForDb = (doc.detailItem ?? []).map((item: any, idx: number) => ({
                        id: safeInt(item.id),
                        receive_item_id: safeInt(doc.id),
                        item_code: item.item?.no ?? null,
                        item_name: item.item?.name ?? null,
                        quantity: safeFloat(item.quantity),
                        unit_name: item.itemUnit?.name ?? null,
                        detail_notes: item.detailNotes ?? null,
                        item_seq: idx,
                        hso_number: extractHso(item.detailNotes ?? null),
                    }))

                    return {
                        header,
                        items: itemsForDb,
                        poNumber,
                        transDate,
                        originalDocItems: doc.detailItem ?? []
                    }
                } catch (e) {
                    console.error(`Error processing RI ${ri.number}:`, e)
                    errors.push(`Processing Error RI ${ri.number}: ${e.message}`)
                    return null
                }
            })

            const results = await Promise.all(promises)
            const validResults = results.filter(r => r !== null)

            // Upsert to Database and Update Shipments
            for (const data of validResults) {
                // Save header
                const { error: headerError } = await supabase
                    .from('accurate_receive_items')
                    .upsert(data.header)

                if (headerError) {
                    console.error(`DB Header Error ${data.header.number}:`, headerError.message)
                    continue
                }

                // Delete and Reinsert Items
                await supabase.from('accurate_receive_item_items').delete().eq('receive_item_id', data.header.id)
                if (data.items.length > 0) {
                    await supabase.from('accurate_receive_item_items').insert(data.items)
                }

                // Update shipments for each received item (check item-level PO or header PO)
                for (const item of data.originalDocItems) {
                    const itemCode = item.item?.no
                    if (!itemCode) continue
                    const poNum = item.purchaseOrder?.number || item.poNumber || data.poNumber
                    if (!poNum) continue

                    const { error: shipErr } = await supabase
                        .from('shipments')
                        .update({
                            current_status: 'Already in Hokiindo Raya',
                            hokiindo_date: data.transDate,
                            updated_at: new Date().toISOString()
                        })
                        .eq('item_code', itemCode)
                        .eq('hpo_number', poNum)

                    if (!shipErr) successCount++
                }
            }
        }

        return new Response(JSON.stringify({
            success: true,
            message: `Synced Page ${requestPage} (${successCount} shipments updated)`,
            processed: riList.length,
            hasMore: riList.length === pageSize,
            nextPage: requestPage + 1,
            errors: errors.slice(0, 5),
            debug: {
                requestedPage: requestPage,
                receivedListCount: riList.length,
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
