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

function categorizeItem(itemNo: string, itemName: string): string {
    const text = `${itemNo} ${itemName}`.toUpperCase()
    if (/^(5SL|5SY|5SJ|5SP|5TJ)/i.test(itemNo) || /MCB\b/i.test(text)) return 'MCB'
    if (/^(3VA|3VJ|3VM|3VL|3VT)/i.test(itemNo) || /MCCB\b/i.test(text)) return 'MCCB'
    if (/^(3WL|3WA|3WT|3WN)/i.test(itemNo) || /ACB\b|AIR CIRCUIT/i.test(text)) return 'ACB'
    if (/^(3RT|3TF|3TG|3TS)/i.test(itemNo) || /CONTACTOR|KONTAKTOR/i.test(text)) return 'CONTACTOR'
    if (/^(3RU|3RB)/i.test(itemNo) || /OVERLOAD|TOR\b/i.test(text)) return 'TOR'
    if (/^(3RV)/i.test(itemNo) || /MPCB|MOTOR PROTECT/i.test(text)) return 'MPCB'
    if (/^(3RW)/i.test(itemNo) || /SOFT STARTER/i.test(text)) return 'SOFT_STARTER'
    if (/^(6SL|6SE|6AU|V20|G120)/i.test(itemNo) || /INVERTER|DRIVE|VFD/i.test(text)) return 'VFD'
    if (/^(3SU|3SB|3SE)/i.test(itemNo) || /PUSH\s*BUTTON|PILOT\s*LAMP|SELECTOR/i.test(text)) return 'PILOT_DEVICE'
    if (/^(6EP|6ES7148)/i.test(itemNo) || /POWER SUPPLY|SITOP/i.test(text)) return 'POWER_SUPPLY'
    if (/^(6ED1|6ES7)/i.test(itemNo) || /LOGO!|PLC|SIMATIC|CPU|EXPANSION/i.test(text)) return 'PLC_AUTOMATION'
    if (/^(5SD|5TT)/i.test(itemNo) || /SPD|SURGE|RELAY/i.test(text)) return 'SPD_MODULAR'
    if (/ACC|SWITCH|TERMINAL|RELAY|SOCKET|CABLE/i.test(text)) return 'ACCESSORIES'
    return 'OTHER'
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

        console.log(`Starting Accurate Items Sync Page ${requestPage}...`)

        // Generate Signature Header
        const timestamp = new Date().toISOString()
        let signatureHeader = {}
        if (signatureSecret) {
            const signature = await createHmacSha256(signatureSecret, timestamp)
            signatureHeader = { 'X-Api-Timestamp': timestamp, 'X-Api-Signature': signature }
        }

        const listUrl = new URL(`${BASE_API}/item/list.do`)
        listUrl.searchParams.append('fields', 'id,no,name,unit,quantity,availableToSell,unitPrice,itemCategory,subItemCategory')
        listUrl.searchParams.append('sp.pageSize', pageSize.toString())
        listUrl.searchParams.append('sp.page', requestPage.toString())
        listUrl.searchParams.append('sp.sort', 'no|asc')

        const listRes = await fetch(listUrl.toString(), {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...signatureHeader
            }
        })

        if (!listRes.ok) throw new Error(`Failed to fetch items list page ${requestPage}: ${await listRes.text()}`)
        const listJson = await listRes.json()
        const itemList = listJson.d || []

        console.log(`Fetched ${itemList.length} items from page ${requestPage}. Upserting to Supabase...`)

        const safeFloat = (val: any) => {
            if (typeof val === 'number') return val
            if (typeof val === 'string') return parseFloat(val.replace(/,/g, '')) || 0
            return 0
        }

        const sanitizedItems = itemList
            .filter((item: any) => item && item.no && item.no.trim() !== '')
            .map((item: any) => {
                const itemNo = item.no.trim()
                const itemName = item.name || ''
                const category = categorizeItem(itemNo, itemName)

                return {
                    item_no: itemNo,
                    item_name: itemName,
                    unit_name: item.unit?.name || 'Pcs',
                    unit_price: safeFloat(item.unitPrice),
                    stock_quantity: safeFloat(item.quantity),
                    available_to_sell: safeFloat(item.availableToSell),
                    category,
                    brand: 'SIEMENS',
                    source: 'ACCURATE_API',
                    updated_at: new Date().toISOString()
                }
            })

        let successCount = 0
        if (sanitizedItems.length > 0) {
            const { error: upsertError } = await supabase
                .from('accurate_items')
                .upsert(sanitizedItems, { onConflict: 'item_no' })

            if (upsertError) {
                console.error('Database upsert error:', upsertError)
                throw upsertError
            }
            successCount = sanitizedItems.length
        }

        return new Response(JSON.stringify({
            success: true,
            message: `Synced ${successCount} items from Accurate (Page ${requestPage})`,
            processed: itemList.length,
            hasMore: itemList.length === pageSize,
            nextPage: requestPage + 1
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error("Sync Items Error:", error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
