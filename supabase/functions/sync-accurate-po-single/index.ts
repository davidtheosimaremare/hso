import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BASE_API = 'https://zeus.accurate.id/accurate/api'

// Initialize Supabase Client with service role (needed for upsert/delete)
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, supabaseKey)

// Helper: Native HMAC-SHA256 Signature (same as sync-accurate-pos)
async function createHmacSha256(secret: string, message: string) {
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const msgData = encoder.encode(message)
    const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    const signature = await crypto.subtle.sign("HMAC", key, msgData)
    return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

// Helper to convert DD/MM/YYYY → YYYY-MM-DD
const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null
    const parts = dateStr.split('/')
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr
    return null
}

// Helper: safe parse float
const safeFloat = (val: unknown): number => {
    if (typeof val === 'number') return val
    if (typeof val === 'string') return parseFloat((val as string).replace(/,/g, '')) || 0
    return 0
}

// Helper: safe parse int
const safeInt = (val: unknown): number | null => {
    if (typeof val === 'number') return Math.floor(val as number)
    if (typeof val === 'string') return parseInt(val as string) || null
    return null
}

// Helper: extract HSO number from detail_notes
const extractHso = (note: string | null): string | null => {
    if (!note) return null
    const match = note.match(/(HSO\/[\w\d\/]+)/i)
    return match ? match[1] : null
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

        // Accept po_id from body (POST) or query param (GET webhook)
        let poId: number | null = null

        if (req.method === 'POST') {
            const body = await req.json().catch(() => ({}))
            poId = body.po_id ? parseInt(body.po_id) : null
        } else if (req.method === 'GET') {
            const url = new URL(req.url)
            const param = url.searchParams.get('po_id')
            poId = param ? parseInt(param) : null
        }

        if (!poId || isNaN(poId)) {
            return new Response(JSON.stringify({ 
                error: 'po_id wajib diisi dan harus berupa angka (Accurate ID)' 
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        console.log(`[sync-po-single] Start syncing PO ID: ${poId}`)

        // Generate Signature Header (same pattern as existing functions)
        const timestamp = new Date().toISOString()
        let signatureHeader: Record<string, string> = {}
        if (signatureSecret) {
            const signature = await createHmacSha256(signatureSecret, timestamp)
            signatureHeader = { 'X-Api-Timestamp': timestamp, 'X-Api-Signature': signature }
        }

        const authHeaders = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...signatureHeader
        }

        // --- Step 1: Fetch PO detail from Accurate ---
        const detailUrl = `${BASE_API}/purchase-order/detail.do?id=${poId}`
        console.log(`[sync-po-single] Fetching: ${detailUrl}`)

        const detailRes = await fetch(detailUrl, { headers: authHeaders })
        if (!detailRes.ok) {
            const errText = await detailRes.text()
            throw new Error(`Accurate API error (${detailRes.status}): ${errText}`)
        }

        const detailJson = await detailRes.json()
        const po = detailJson.d

        if (!po) {
            throw new Error(`PO dengan ID ${poId} tidak ditemukan di Accurate`)
        }

        console.log(`[sync-po-single] Got PO: ${po.number}, items: ${po.detailItem?.length || 0}`)

        // --- Step 2: Sanitize header ---
        const sanitizedHeader = {
            id: safeInt(po.id),
            number: po.number || 'UNKNOWN',
            vendor_id: safeInt(po.vendor?.id),
            vendor_name: po.vendor?.name,
            trans_date: formatDate(po.transDate),
            status_name: po.statusName,
            total_amount: safeFloat(po.totalAmount),
            currency_code: po.currency?.code,
            branch_id: safeInt(po.branch?.id)
        }

        // --- Step 3: Sanitize items ---
        const rawItems: any[] = po.detailItem || []
        const sanitizedItems = rawItems.map((item: any, index: number) => ({
            id: safeInt(item.id),
            po_id: poId,
            item_code: item.item?.no ?? null,
            item_name: item.item?.name ?? null,
            quantity: safeFloat(item.quantity),
            unit_name: item.itemUnit?.name ?? null,
            unit_price: safeFloat(item.unitPrice),
            item_disc_percent: safeFloat(item.itemDiscPercent),
            detail_notes: item.detailNotes ?? null,
            item_seq: index,
            hso_number: extractHso(item.detailNotes ?? null)
        }))

        // Count items that have detail_notes filled
        const filledNotesCount = sanitizedItems.filter(i => i.detail_notes && i.detail_notes.trim() !== '').length

        // --- Step 4: Upsert PO header ---
        const { error: headerError } = await supabase
            .from('accurate_purchase_orders')
            .upsert(sanitizedHeader, { onConflict: 'id' })

        if (headerError) {
            throw new Error(`Gagal upsert header PO: ${headerError.message}`)
        }

        // --- Step 5: Delete old items & insert new ones ---
        const { error: deleteError } = await supabase
            .from('accurate_purchase_order_items')
            .delete()
            .eq('po_id', poId)

        if (deleteError) {
            // Non-fatal — log and continue
            console.warn(`[sync-po-single] Warning: gagal delete items lama: ${deleteError.message}`)
        }

        let itemsUpdated = 0
        if (sanitizedItems.length > 0) {
            const { error: insertError } = await supabase
                .from('accurate_purchase_order_items')
                .insert(sanitizedItems)

            if (insertError) {
                throw new Error(`Gagal insert items PO: ${insertError.message}`)
            }
            itemsUpdated = sanitizedItems.length
        }

        console.log(`[sync-po-single] Done. PO: ${po.number}, Items: ${itemsUpdated}, Notes filled: ${filledNotesCount}`)

        return new Response(JSON.stringify({
            success: true,
            po_number: po.number,
            po_status: po.statusName,
            items_updated: itemsUpdated,
            detail_notes_count: filledNotesCount,
            message: `Berhasil update PO ${po.number}: ${itemsUpdated} item diperbarui, ${filledNotesCount} item memiliki keterangan.`
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error('[sync-po-single] Error:', error.message)
        return new Response(JSON.stringify({ 
            success: false,
            error: error.message 
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
