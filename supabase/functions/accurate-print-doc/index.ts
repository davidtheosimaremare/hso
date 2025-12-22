import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Helper: Native HMAC Signature (Wajib untuk Zeus)
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
    
    // Ambil parameter dari Body: ID dan Tipe Dokumen
    const { id, type } = await req.json() // type: 'sales-order', 'delivery-order', 'sales-invoice'

    if (!id || !type) throw new Error('ID dan Tipe Dokumen wajib diisi!')

    // Tentukan Endpoint berdasarkan tipe
    // Contoh: https://zeus.accurate.id/accurate/api/delivery-order/print.do?id=18300
    const endpointUrl = `https://zeus.accurate.id/accurate/api/${type}/print.do?id=${id}`

    // Generate Signature
    const timestamp = new Date().toISOString()
    let signatureHeader = {}
    if (signatureSecret) {
      const signature = await createHmacSha256(signatureSecret, timestamp)
      signatureHeader = { 'X-Api-Timestamp': timestamp, 'X-Api-Signature': signature }
    }

    console.log(`Downloading PDF for ${type} ID ${id}...`)

    // Fetch PDF (Bukan JSON)
    const response = await fetch(endpointUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        ...signatureHeader
      }
    })

    if (!response.ok) throw new Error(`Gagal download PDF: ${response.status}`)

    // Ambil Data Binary (Blob)
    const pdfBuffer = await response.arrayBuffer()

    // Kembalikan sebagai File PDF ke browser
    return new Response(pdfBuffer, {
      headers: { 
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${type}-${id}.pdf"`
      },
    })

  } catch (error) {
    console.error("Print Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})