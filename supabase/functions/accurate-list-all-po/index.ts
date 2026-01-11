import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const BASE_URL = 'https://zeus.accurate.id/accurate/api'
const LIST_PO_ENDPOINT = `${BASE_URL}/purchase-order/list.do`

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

        // Read body from frontend (for dynamic fields)
        const { fields, limit, sort } = await req.json().catch(() => ({}))

        // Default fields if frontend doesn't send (Backward compatibility)
        const fieldsParam = fields || 'id,number,transDate,statusName'
        const limitParam = limit || 10000 // Default 10000 - fetch all POs
        const sortParam = sort || 'transDate|desc'

        // SETUP LOOPING VARIABLES
        let allData = []
        let page = 1
        const pageSize = 100
        let hasMoreData = true

        // Generate Signature
        const timestamp = new Date().toISOString()
        let signatureHeader = {}
        if (signatureSecret) {
            const signature = await createHmacSha256(signatureSecret, timestamp)
            signatureHeader = { 'X-Api-Timestamp': timestamp, 'X-Api-Signature': signature }
        }

        console.log(`Fetching PO Data. Fields: ${fieldsParam}`)

        // LOOPING FETCH
        while (hasMoreData) {
            const url = `${LIST_PO_ENDPOINT}?fields=${fieldsParam}&sp.page=${page}&sp.pageSize=${pageSize}&sp.sort=${sortParam}`

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    ...signatureHeader
                }
            })

            if (!response.ok) {
                const errText = await response.text()
                throw new Error(`Failed on Page ${page}: ${errText}`)
            }

            const json = await response.json()

            if (json.d && Array.isArray(json.d)) {
                allData = allData.concat(json.d)

                // Stop if data reaches requested limit
                if (allData.length >= limitParam) {
                    hasMoreData = false
                    // Trim array to limit
                    allData = allData.slice(0, limitParam)
                }
                // Stop if data exhausted from Accurate
                else if (json.d.length < pageSize) {
                    hasMoreData = false
                } else {
                    page++
                }
            } else {
                hasMoreData = false
            }
        }

        console.log(`Completed. Total POs: ${allData.length}`)

        return new Response(JSON.stringify({ s: true, d: allData }), {
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
