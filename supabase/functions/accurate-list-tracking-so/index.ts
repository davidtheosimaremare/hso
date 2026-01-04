// FILE: supabase/functions/accurate-list-tracking-so/index.ts
// Server-side pagination support

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

    // Parse request body for pagination
    let requestPage = 1
    let requestPageSize = 50
    try {
      const body = await req.json()
      requestPage = body.page || 1
      requestPageSize = body.pageSize || 50
    } catch (e) {
      // No body, use defaults
    }

    // Generate Signature Header
    const timestamp = new Date().toISOString()
    let signatureHeader = {}
    if (signatureSecret) {
      const signature = await createHmacSha256(signatureSecret, timestamp)
      signatureHeader = { 'X-Api-Timestamp': timestamp, 'X-Api-Signature': signature }
    }

    console.log(`Fetching page ${requestPage} with ${requestPageSize} items per page...`)

    // 1. FETCH SOs for the requested page
    const listUrl = new URL(`${BASE_API}/sales-order/list.do`)
    listUrl.searchParams.append('fields', 'id,number,transDate,customer,statusName')
    listUrl.searchParams.append('filter.statusName.op', 'NOT_IN')
    listUrl.searchParams.append('filter.statusName.val', 'Closed,Dibatalkan')
    listUrl.searchParams.append('sp.page', String(requestPage))
    listUrl.searchParams.append('sp.pageSize', String(requestPageSize))
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
      throw new Error(`Accurate List Error: ${errText}`)
    }

    const listJson = await listResponse.json()
    const soList = listJson.d || []
    const totalItems = listJson.sp?.rowCount || 0
    const totalPages = Math.ceil(totalItems / requestPageSize)

    console.log(`Got ${soList.length} SOs on page ${requestPage}. Total: ${totalItems}`)

    // 2. FETCH DETAIL FOR EACH SO (with batching)
    const BATCH_SIZE = 10
    const soWithDetails = []

    for (let i = 0; i < soList.length; i += BATCH_SIZE) {
      const batch = soList.slice(i, i + BATCH_SIZE)

      const batchPromises = batch.map(async (so: any) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const detailUrl = `${BASE_API}/sales-order/detail.do?id=${so.id}`
            const detailRes = await fetch(detailUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...signatureHeader
              }
            })

            if (detailRes.ok) {
              const detailJson = await detailRes.json()
              return {
                ...so,
                detailItem: detailJson.d?.detailItem || []
              }
            }
          } catch (err) {
            console.error(`Attempt ${attempt + 1} failed for SO ${so.id}:`, err)
            if (attempt < 1) {
              await new Promise(r => setTimeout(r, 300))
            }
          }
        }
        return { ...so, detailItem: [] }
      })

      const batchResults = await Promise.all(batchPromises)
      soWithDetails.push(...batchResults)

      if (i + BATCH_SIZE < soList.length) {
        await new Promise(r => setTimeout(r, 100))
      }
    }

    console.log(`Returning page ${requestPage} with ${soWithDetails.length} SOs`)

    return new Response(JSON.stringify({
      s: true,
      d: soWithDetails,
      pagination: {
        page: requestPage,
        pageSize: requestPageSize,
        totalItems: totalItems,
        totalPages: totalPages,
        hasMore: requestPage < totalPages
      }
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