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
    
    const body = await req.json()
    const { id, type, attachmentId, url, filename } = body

    let endpointUrl = ''
    if (url) {
      if (url.startsWith('http')) {
        endpointUrl = url
      } else if (url.startsWith('/accurate/')) {
        endpointUrl = `https://zeus.accurate.id${url}`
      } else {
        endpointUrl = `https://zeus.accurate.id/accurate/api${url.startsWith('/') ? '' : '/'}${url}`
      }
    } else if (attachmentId) {
      endpointUrl = `https://zeus.accurate.id/accurate/api/attachment/download.do?id=${attachmentId}`
    } else if (id && type) {
      endpointUrl = `https://zeus.accurate.id/accurate/api/${type}/print.do?id=${id}`
    } else {
      throw new Error('Parameter id/type atau attachmentId/url wajib diisi!')
    }

    const timestamp = new Date().toISOString()
    let signatureHeader = {}
    if (signatureSecret) {
      const signature = await createHmacSha256(signatureSecret, timestamp)
      signatureHeader = { 'X-Api-Timestamp': timestamp, 'X-Api-Signature': signature }
    }

    console.log(`Fetching document from Accurate: ${endpointUrl}...`)

    const response = await fetch(endpointUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        ...signatureHeader
      }
    })

    if (!response.ok) throw new Error(`Gagal download dokumen dari Accurate: ${response.status}`)

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const fileBuffer = await response.arrayBuffer()
    const outFilename = filename || `dokumen-${id || attachmentId || 'accurate'}`

    if (body.returnBase64) {
      const bytes = new Uint8Array(fileBuffer)
      let binary = ''
      const chunkSize = 8192
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunkSize, bytes.length))))
      }
      const base64 = btoa(binary)
      const dataUrl = `data:${contentType};base64,${base64}`

      return new Response(JSON.stringify({
        s: true,
        contentType,
        base64,
        dataUrl,
        filename: outFilename,
        size: bytes.length
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(fileBuffer, {
      headers: { 
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${outFilename}"`
      },
    })

  } catch (error) {
    console.error("Download Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})