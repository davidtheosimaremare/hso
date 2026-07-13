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

    const authHeaders = await buildAccurateHeaders()
    const { action, number, items } = await req.json().catch(() => ({}))

    if (action === 'get-next-number') {
      // 1. Fetch latest PRs from Accurate
      const listUrl = `${BASE_API}/purchase-requisition/list.do?fields=number,transDate&sp.pageSize=100&sp.sort=number|desc`
      const res = await fetch(listUrl, { headers: authHeaders })
      
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Gagal mengambil list PR dari Accurate: ${errText}`)
      }

      const json = await res.json()
      const prList = json.d || []

      // 2. Calculate next number for current month
      const now = new Date()
      const year4 = now.getFullYear() // e.g., 2026
      const year2 = String(year4).substring(2) // e.g., "26"
      const monthVal = String(now.getMonth() + 1).padStart(2, '0') // e.g., "07"

      let lastNum = 0
      let paddingLength = 4
      let yearFormat = '2' // default to 2-digit year to match HSO (e.g. '26')

      for (const pr of prList) {
        const prNum = pr.number
        if (!prNum) continue

        // Match patterns like HPB/26/07/0001 or HPB/2026/07/0001
        const match2 = prNum.match(new RegExp(`^HPB/(\\d{2})/${monthVal}/(\\d+)$`, 'i'))
        const match4 = prNum.match(new RegExp(`^HPB/(\\d{4})/${monthVal}/(\\d+)$`, 'i'))

        if (match2) {
          const seq = parseInt(match2[2])
          if (seq > lastNum) {
            lastNum = seq
            paddingLength = match2[2].length
            yearFormat = '2'
          }
        } else if (match4) {
          const seq = parseInt(match4[2])
          if (seq > lastNum) {
            lastNum = seq
            paddingLength = match4[2].length
            yearFormat = '4'
          }
        }
      }

      const nextSeq = lastNum + 1
      const seqStr = String(nextSeq).padStart(paddingLength, '0')
      const yearStr = yearFormat === '4' ? String(year4) : year2
      const proposedNumber = `HPB/${yearStr}/${monthVal}/${seqStr}`

      return new Response(JSON.stringify({ s: true, proposedNumber }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'create-hpb') {
      if (!number) throw new Error('Nomor HPB wajib ditentukan!')
      if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error('Daftar item untuk dibuatkan HPB tidak boleh kosong!')
      }

      // Format payload for Accurate save.do
      const nowStr = new Date().toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '/') // e.g., 12/07/2026

      const detailItem = items.map((item: any) => ({
        itemNo: item.item_code,
        quantity: item.qty_to_order,
        detailNotes: item.so_number // Store HSO number so HPO syncs correctly later!
      }))

      const savePayload = {
        transDate: nowStr,
        number: number,
        description: `Created automatically from HSO Tracker for items: ${items.map((i: any) => i.item_code).join(', ')}`,
        detailItem: detailItem
      }

      console.log(`Sending save.do to Accurate for HPB: ${number}`, JSON.stringify(savePayload))

      const saveUrl = `${BASE_API}/purchase-requisition/save.do`
      const res = await fetch(saveUrl, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(savePayload)
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Gagal menyimpan HPB ke Accurate: ${errText}`)
      }

      const json = await res.json()
      if (!json.s) {
        throw new Error(`Accurate API Error: ${json.d || 'Gagal menyimpan transaksi'}`)
      }

      // 3. Delete successfully sent items from purchase_cart
      const itemIds = items.map((i: any) => i.id)
      const { error: dbErr } = await supabase
        .from('purchase_cart')
        .delete()
        .in('id', itemIds)

      if (dbErr) {
        console.error('Failed to clear cart items from database after successful sync:', dbErr)
        // Non-fatal, return success since Accurate transaction is already created
      }

      return new Response(JSON.stringify({ 
        s: true, 
        message: `HPB ${number} berhasil dibuat di Accurate!`,
        accurateResponse: json.r
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    throw new Error('Action tidak valid!')

  } catch (error) {
    console.error("Function Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
