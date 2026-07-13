import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BASE_API = 'https://zeus.accurate.id/accurate/api'

// Helper: Native HMAC-SHA256 Signature
async function createHmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

// Build auth headers for Accurate API calls
async function buildAccurateHeaders(): Promise<Record<string, string>> {
  const accessToken = Deno.env.get('ACCURATE_ACCESS_TOKEN')
  const signatureSecret = Deno.env.get('ACCURATE_SIGNATURE_SECRET')
  if (!accessToken) throw new Error('ACCURATE_ACCESS_TOKEN tidak disetting di environment Supabase!')

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
  if (signatureSecret) {
    const ts = new Date().toISOString()
    headers['X-Api-Timestamp'] = ts
    headers['X-Api-Signature'] = await createHmacSha256(signatureSecret, ts)
  }
  return headers
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { item_code } = await req.json().catch(() => ({}))

    if (!item_code) {
      throw new Error('Kode barang (item_code) wajib ditentukan!')
    }

    const authHeaders = await buildAccurateHeaders()

    // 1. Fetch item detail from Accurate Online
    console.log(`Fetching item info for: ${item_code}`)
    const itemUrl = new URL(`${BASE_API}/item/list.do`)
    itemUrl.searchParams.append('fields', 'id,no,name,unit,quantity,availableToSell')
    itemUrl.searchParams.append('filter.no.op', 'EQUAL')
    itemUrl.searchParams.append('filter.no.val', item_code)

    const itemRes = await fetch(itemUrl.toString(), { headers: authHeaders })
    if (!itemRes.ok) {
      throw new Error(`Accurate API error fetching item detail: ${await itemRes.text()}`)
    }
    const itemJson = await itemRes.json()
    const itemData = itemJson.d?.[0]

    if (!itemData) {
      return new Response(JSON.stringify({ s: false, message: `Barang dengan kode ${item_code} tidak ditemukan di Accurate!` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const item_name = itemData.name
    const unit_name = itemData.unit?.name || 'Pcs'
    const stock_warehouse = Number(itemData.quantity || 0)

    // Calculate dates for 6-month filter
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    // Format for Accurate API (DD/MM/YYYY)
    const d = String(sixMonthsAgo.getDate()).padStart(2, '0')
    const m = String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')
    const y = sixMonthsAgo.getFullYear()
    const formattedSixMonthsAgo = `${d}/${m}/${y}`

    // Format for Supabase DB (YYYY-MM-DD)
    const dbCutoffDate = `${y}-${m}-${d}`

    // 2. Fetch active Sales Orders (Dijual) containing this item from Accurate Online
    console.log(`Scanning active HSOs from last 6 months (${formattedSixMonthsAgo}) for: ${item_code}`)
    let page = 1
    const pageSize = 50
    let hasMore = true
    const activeSos = []

    function parseDate(dateStr: string): Date {
      if (!dateStr || dateStr === '-') return new Date(0)
      const parts = dateStr.split('/')
      if (parts.length !== 3) return new Date(0)
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
    }

    // Sliding window concurrency helper to process requests in parallel up to a limit
    async function limitConcurrency<T, R>(
      items: T[],
      limit: number,
      fn: (item: T) => Promise<R>
    ): Promise<R[]> {
      const results: Promise<R>[] = []
      const executing: Promise<unknown>[] = []
      for (const item of items) {
        const p = fn(item)
        results.push(p)
        if (limit <= items.length) {
          const e = p.then(() => executing.splice(executing.indexOf(e), 1))
          executing.push(e)
          if (executing.length >= limit) {
            await Promise.race(executing)
          }
        }
      }
      return Promise.all(results)
    }

    while (hasMore) {
      const listUrl = new URL(`${BASE_API}/sales-order/list.do`)
      listUrl.searchParams.append('fields', 'id,number,transDate,customer,statusName')
      listUrl.searchParams.append('filter.statusName.op', 'NOT_IN')
      listUrl.searchParams.append('filter.statusName.val', 'Closed,Dibatalkan')
      listUrl.searchParams.append('sp.page', String(page))
      listUrl.searchParams.append('sp.pageSize', String(pageSize))
      listUrl.searchParams.append('sp.sort', 'transDate|desc')

      const listRes = await fetch(listUrl.toString(), { headers: authHeaders })
      if (!listRes.ok) {
        throw new Error(`Accurate API error listing active SOs: ${await listRes.text()}`)
      }

      const listJson = await listRes.json()
      const soList = listJson.d || []
      const rowCount = listJson.sp?.rowCount || 0
      const totalPages = Math.ceil(rowCount / pageSize)

      // Filter SOs in Deno to only keep those from the last 6 months before calling detail.do
      const filteredSoList = soList.filter((so: any) => {
        const refDate = parseDate(so.transDate)
        return refDate >= sixMonthsAgo
      })

      console.log(`Page ${page}: got ${soList.length} active SOs from Accurate list.do, filtered to ${filteredSoList.length} in last 6 months`)

      // Run parallel detail requests with sliding window concurrency of 6 (safely handles rate limit)
      const detailResults = await limitConcurrency(filteredSoList, 6, async (so: any) => {
        try {
          const detailUrl = `${BASE_API}/sales-order/detail.do?id=${so.id}`
          const detailRes = await fetch(detailUrl, { headers: authHeaders })
          if (detailRes.ok) {
            const detailJson = await detailRes.json()
            const itemsList = detailJson.d?.detailItem || []
            
            const matchingItems = itemsList.filter((item: any) => item.item?.no === item_code)
            if (matchingItems.length > 0) {
              const totalQty = matchingItems.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)
              const shipDate = matchingItems[0]?.shipDate || so.transDate

              return {
                type: 'SO',
                no_referensi: so.number,
                tgl_estimasi: shipDate,
                nama_referensi: so.customer?.name || '-',
                dipesan: 0,
                dijual: totalQty
              }
            }
          }
        } catch (err) {
          console.error(`Error loading detail for SO ${so.id}:`, err)
        }
        return null
      })

      activeSos.push(...detailResults.filter(Boolean))

      if (page >= totalPages || soList.length < pageSize) {
        hasMore = false
      } else {
        page++
      }
    }

    // 3. Fetch active Purchase Orders (Dipesan) containing this item from Supabase DB (last 6 months)
    console.log(`Fetching active HPOs from database for: ${item_code} (since ${dbCutoffDate})`)
    const { data: poItems, error: poErr } = await supabase
      .from('accurate_purchase_order_items')
      .select(`
        quantity,
        po:accurate_purchase_orders!inner(number, trans_date, vendor_name, status_name)
      `)
      .eq('item_code', item_code)
      .in('po.status_name', ['Menunggu diproses', 'Sebagian diproses'])
      .gte('po.trans_date', dbCutoffDate)

    if (poErr) {
      throw new Error(`Database error fetching PO items: ${poErr.message}`)
    }

    const activePos = (poItems || []).map((poi: any) => {
      let formattedDate = '-'
      if (poi.po?.trans_date) {
        const parts = poi.po.trans_date.split('-')
        if (parts.length === 3) {
          formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`
        }
      }

      return {
        type: 'PO',
        no_referensi: poi.po?.number || '-',
        tgl_estimasi: formattedDate,
        nama_referensi: poi.po?.vendor_name || '-',
        dipesan: Number(poi.quantity || 0),
        dijual: 0
      }
    })

    const references = [...activeSos, ...activePos]

    // Calculate totals
    const stock_ordered = references.filter(r => r.type === 'PO').reduce((sum, po) => sum + po.dipesan, 0)
    const stock_sold = references.filter(r => r.type === 'SO').reduce((sum, so) => sum + so.dijual, 0)
    const stock_available = Math.max(0, stock_warehouse + stock_ordered - stock_sold)

    // Sort references by date descending
    references.sort((a, b) => parseDate(b.tgl_estimasi).getTime() - parseDate(a.tgl_estimasi).getTime())

    console.log(`Success fetching availability for SKU: ${item_code}. Stock Warehouse: ${stock_warehouse}, Ordered: ${stock_ordered}, Sold: ${stock_sold}, Available: ${stock_available}`)

    return new Response(JSON.stringify({
      s: true,
      data: {
        item_code,
        item_name,
        unit_name,
        stock_warehouse,
        stock_ordered,
        stock_sold,
        stock_available,
        references
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error("Function Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
