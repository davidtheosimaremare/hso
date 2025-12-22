import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const BASE_API = 'https://zeus.accurate.id/accurate/api'

// Helper Signature
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

    const { id, type } = await req.json()
    const moduleType = type || 'sales-order'
    
    if (!id) throw new Error('ID Database wajib dikirim!')

    // 1. DETAIL UTAMA (SO)
    const timestamp = new Date().toISOString()
    let signatureHeader = {}
    if (signatureSecret) {
      const sig = await createHmacSha256(signatureSecret, timestamp)
      signatureHeader = { 'X-Api-Timestamp': timestamp, 'X-Api-Signature': sig }
    }

    // Ambil Data SO
    const resDoc = await fetch(`${BASE_API}/${moduleType}/detail.do?id=${id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...signatureHeader }
    })
    
    if (!resDoc.ok) throw new Error(`Gagal ambil SO: ${await resDoc.text()}`)
    const jsonDoc = await resDoc.json()
    const docData = jsonDoc.d

    // 2. CEK STOK REAL (PARALLEL FETCH KE ITEM DETAIL)
    if (moduleType === 'sales-order' && docData.detailItem) {
      console.log("Mulai Cek AvailableToSell Barang...")

      // Ambil unique ID barang
      const uniqueItems = [...new Set(docData.detailItem
        .filter((d: any) => d.item && d.item.id)
        .map((d: any) => d.item.id)
      )]

      // Request Paralel ke item/detail.do
      const stockPromises = uniqueItems.map(async (itemId) => {
        // Kita panggil detail barang satu per satu (Parallel)
        const urlItem = `${BASE_API}/item/detail.do?id=${itemId}`
        
        const resItem = await fetch(urlItem, {
          headers: { 'Authorization': `Bearer ${accessToken}`, ...signatureHeader }
        })

        if (resItem.ok) {
          const itemData = await resItem.json()
          // AMBIL FIELD 'availableToSell'
          // Jika tidak ada, fallback ke 'quantity' (fisik)
          const avail = itemData.d.availableToSell !== undefined ? itemData.d.availableToSell : (itemData.d.quantity || 0)
          return { id: itemId, stock: avail }
        }
        return { id: itemId, stock: 0 }
      })

      // Tunggu semua request selesai
      const stockResults = await Promise.all(stockPromises)
      
      // Map: { 1001: 50, 1002: 12 }
      const stockMap = {}
      stockResults.forEach((s: any) => stockMap[s.id] = s.stock)

      // Gabungkan Stok ke dalam Data Utama
      docData.detailItem = docData.detailItem.map((d: any) => ({
        ...d,
        // Field baru: 'realStock' berisi availableToSell
        realStock: d.item?.id ? (stockMap[d.item.id] || 0) : 0
      }))
    }

    return new Response(JSON.stringify({ s: true, d: docData }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })

  } catch (error) {
    console.error("Function Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})