import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BASE_URL = 'https://zeus.accurate.id/accurate/api'
const LIST_DO_ENDPOINT = `${BASE_URL}/delivery-order/list.do`

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

    const body = await req.json().catch(() => ({}))
    const { fields, limit, sort, filterNumber, filterHsoNumber, hsoNumber } = body

    const targetHso = filterHsoNumber || hsoNumber

    // 1. LEGACY FILTER BY HSO (from Supabase DB if explicitly requested)
    if (targetHso) {
      console.log(`Searching DO for HSO: ${targetHso}`)
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
          .ilike('detail_notes', `%${targetHso}%`)
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

      return new Response(JSON.stringify({
        s: true,
        d: hsoMappings,
        totalMappings: hsoMappings.length,
        filter: targetHso,
        source: 'database'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. LIVE ACCURATE API DO LIST FETCH
    const fieldsParam = fields || 'id,number,transDate,customer,statusName,description,detailItem,poNumber,driverName,shipTo'
    const limitParam = limit || 2000
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

    console.log(`Fetching DOs. Fields: ${fieldsParam.substring(0, 50)}... FilterNumber: ${filterNumber || 'none'}`)

    while (hasMoreData) {
      let url = `${LIST_DO_ENDPOINT}?fields=${fieldsParam}&sp.page=${page}&sp.pageSize=${pageSize}&sp.sort=${sortParam}`
      
      if (filterNumber) {
        url += `&filter.number.op=EQUAL&filter.number.val=${encodeURIComponent(filterNumber)}`
      }

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
        console.warn(`Fetch notice on DO page ${page}:`, fetchErr.message)
        hasMoreData = false
      }
    }

    console.log(`DO Fetch complete. Total fetched: ${allData.length}`)

    return new Response(JSON.stringify({ s: true, d: allData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error("Function Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
