import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      throw new Error("No file uploaded")
    }

    const appsScriptUrl = Deno.env.get("APPS_SCRIPT_URL")
    if (!appsScriptUrl) {
      throw new Error("APPS_SCRIPT_URL is missing. Please set it in Supabase Secrets.")
    }

    const filename = file.name
    const mimeType = file.type
    const arrayBuffer = await file.arrayBuffer()
    
    // Convert to Base64 for safe transport to Apps Script
    const base64Data = encode(new Uint8Array(arrayBuffer))

    // Send payload to Apps Script
    const payload = new URLSearchParams()
    payload.append('filename', filename)
    payload.append('mimeType', mimeType)
    payload.append('fileData', base64Data)

    const res = await fetch(appsScriptUrl, {
      method: "POST",
      body: payload
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Apps Script responded with ${res.status}: ${err}`)
    }

    const result = await res.json()
    if (!result.success) {
      throw new Error(result.error || "Unknown error from Apps Script")
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        webViewLink: result.url 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error) {
    console.error("Upload error:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    )
  }
})
