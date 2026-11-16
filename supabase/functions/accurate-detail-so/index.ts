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

    const { id, type } = await req.json().catch(() => ({}))
    const moduleType = type || 'sales-order'
    
    if (!id) throw new Error('ID Database atau Nomor Dokumen wajib dikirim!')

    const timestamp = new Date().toISOString()
    let signatureHeader = {}
    if (signatureSecret) {
      const sig = await createHmacSha256(signatureSecret, timestamp)
      signatureHeader = { 'X-Api-Timestamp': timestamp, 'X-Api-Signature': sig }
    }

    const reqId = String(id).trim()
    const isNumberParam = reqId.includes('.') || reqId.includes('/') || reqId.includes('-') || isNaN(Number(reqId))

    const candidateParams: string[] = []
    if (isNumberParam) {
      candidateParams.push(`number=${encodeURIComponent(reqId)}`)
      if (reqId.includes('-')) {
        candidateParams.push(`number=${encodeURIComponent(reqId.replace(/-/g, '/'))}`)
      }
      candidateParams.push(`id=${encodeURIComponent(reqId)}`)
    } else {
      // Jika sudah numeric ID murni (e.g. 24450), langsung query via id
      candidateParams.push(`id=${encodeURIComponent(reqId)}`)
    }

    let jsonDoc: any = null
    for (const paramStr of candidateParams) {
      try {
        // Berikan waktu timeout hingga 60 detik agar Accurate Online sempat mengompilasi relasi item & ledger
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 60000)

        const res = await fetch(`${BASE_API}/${moduleType}/detail.do?${paramStr}`, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...signatureHeader },
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (res.ok) {
          const json = await res.json()
          if (json.s && json.d) {
            jsonDoc = json
            break
          }
        }
      } catch (e: any) {
        console.warn(`Fetch candidate ${paramStr} notice:`, e.message)
      }
    }

    if (!jsonDoc || !jsonDoc.s || !jsonDoc.d) {
      throw new Error(jsonDoc?.d || jsonDoc?.error || `Gagal mengambil detail ${moduleType} dari Accurate`)
    }

    const docData = jsonDoc.d

    // 2. FETCH ATTACHMENTS (Ringan & Cepat)
    if (docData.id) {
      try {
        const controller = new AbortController()
        const tId = setTimeout(() => controller.abort(), 4000)

        const url = `${BASE_API}/attachment/list.do?transactionId=${docData.id}&transactionType=SO`
        const attRes = await fetch(url, {
          headers: { 'Authorization': `Bearer ${accessToken}`, ...signatureHeader },
          signal: controller.signal
        })
        clearTimeout(tId)

        if (attRes.ok) {
          const attJson = await attRes.json()
          if (attJson.s && Array.isArray(attJson.d)) {
            docData.attachments = attJson.d
          }
        }
      } catch (err: any) {
        console.warn("Fetch attachment list notice:", err.message)
      }
    }

    return new Response(JSON.stringify({ s: true, d: docData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error("Function Error:", error.message)
    return new Response(JSON.stringify({ s: false, error: error.message }), {
      status: 200, // Return status 200 so fetch error doesn't break frontend
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})