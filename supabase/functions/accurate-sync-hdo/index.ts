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

        const { doNumbers } = await req.json()

        if (!doNumbers || !Array.isArray(doNumbers) || doNumbers.length === 0) {
            return new Response(JSON.stringify({ s: true, d: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        console.log(`Sync HDO for: ${doNumbers.join(', ')}`)

        const timestamp = new Date().toISOString()
        let signatureHeader = {}
        if (signatureSecret) {
            const signature = await createHmacSha256(signatureSecret, timestamp)
            signatureHeader = { 'X-Api-Timestamp': timestamp, 'X-Api-Signature': signature }
        }

        // Parallel Fetch DO Details
        const promises = doNumbers.map(async (doNum) => {
            try {
                const url = `${BASE_API}/delivery-order/detail.do?number=${encodeURIComponent(doNum)}`
                const res = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        ...signatureHeader
                    }
                })

                if (!res.ok) return null
                const json = await res.json()
                return json.d // Detail DO
            } catch (e) {
                console.error(`Error fetching DO ${doNum}:`, e)
                return null
            }
        })

        const results = await Promise.all(promises)
        const validResults = results.filter(r => r)

        // Return both: item mapping AND full DO details
        const itemMapping = []
        const doDetails = []

        validResults.forEach(doDetail => {
            if (doDetail && doDetail.detailItem) {
                // Add to DO details list
                doDetails.push({
                    number: doDetail.number,
                    date: doDetail.transDate || doDetail.transDateView,
                    status: doDetail.statusName || 'Approved',
                    items: doDetail.detailItem.map((item: any) => ({
                        code: item.item?.no || '',
                        name: item.item?.name || item.detailName || '',
                        qty_shipped: item.quantity || 0,
                        unit: item.itemUnit?.name || 'Pcs'
                    }))
                })

                // Add to item mapping
                doDetail.detailItem.forEach((item: any) => {
                    if (item.item && item.item.no) {
                        itemMapping.push({
                            itemCode: item.item.no,
                            doNumber: doDetail.number,
                            doDate: doDetail.transDate
                        })
                    }
                })
            }
        })

        return new Response(JSON.stringify({
            s: true,
            d: itemMapping,  // For hdoMapping (item -> DO number)
            doDetails: doDetails  // For document history dropdown
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error("Function Error:", error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
