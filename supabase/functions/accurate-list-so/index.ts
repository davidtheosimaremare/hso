import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const BASE_URL = 'https://zeus.accurate.id/accurate/api'
const LIST_SO_ENDPOINT = `${BASE_URL}/sales-order/list.do`

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

    const { fields, limit, sort, filterNumber } = await req.json().catch(() => ({}))

    const fieldsParam = fields || 'id,number,transDate,customer,totalAmount,statusName,percentShipped'
    const limitParam = limit || 2000 // Limit 2000 to prevent execution timeout / connection reset
    const sortParam = sort || 'transDate|desc'

    let allData: any[] = []
    let page = 1
    const pageSize = 100
    let hasMoreData = true

    const timestamp = new Date().toISOString()
    let signatureHeader = {}
    if (signatureSecret) {
      const signature = await createHmacSha256(signatureSecret, timestamp)
      signatureHeader = { 'X-Api-Timestamp': timestamp, 'X-Api-Signature': signature }
    }

    console.log(`Fetching Data. Fields: ${fieldsParam.substring(0, 50)}... FilterNumber: ${filterNumber || 'none'}`)

    while (hasMoreData) {
      let url = `${LIST_SO_ENDPOINT}?fields=${fieldsParam}&sp.page=${page}&sp.pageSize=${pageSize}&sp.sort=${sortParam}`
      
      if (filterNumber) {
        url += `&filter.number.op=EQUAL&filter.number.val=${encodeURIComponent(filterNumber)}`
      }

      // 12-second AbortController timeout per fetch
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 12000)

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...signatureHeader
          },
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`Gagal pada Page ${page}: ${errText}`)
        }

        const json = await response.json()

        if (json.d && Array.isArray(json.d)) {
          allData = allData.concat(json.d)

          if (filterNumber || allData.length >= limitParam || json.d.length < pageSize || page >= 20) {
            hasMoreData = false
            if (allData.length > limitParam) {
              allData = allData.slice(0, limitParam)
            }
          } else {
            page++
          }
        } else {
          hasMoreData = false
        }
      } catch (fetchErr: any) {
        clearTimeout(timeoutId)
        console.warn(`Fetch notice on page ${page}:`, fetchErr.message)
        hasMoreData = false
      }
    }

    console.log(`Selesai. Total fetched: ${allData.length}`)

    return new Response(JSON.stringify({ s: true, d: allData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error("Function Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200, // Return 200 with error payload to prevent FunctionsFetchError connection drops
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})