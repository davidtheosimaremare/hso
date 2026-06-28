import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BASE_API = 'https://zeus.accurate.id/accurate/api'

const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

// ─── Helpers ────────────────────────────────────────────────────────────────

async function createHmacSha256(secret: string, message: string): Promise<string> {
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
    return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

const formatDate = (s: string | null): string | null => {
    if (!s) return null
    const p = s.split('/')
    if (p.length === 3) return `${p[2]}-${p[1]}-${p[0]}`
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    return null
}
const safeFloat = (v: unknown): number => {
    if (typeof v === 'number') return v
    if (typeof v === 'string') return parseFloat((v as string).replace(/,/g, '')) || 0
    return 0
}
const safeInt = (v: unknown): number | null => {
    if (typeof v === 'number') return Math.floor(v as number)
    if (typeof v === 'string') return parseInt(v as string) || null
    return null
}
const extractHso = (note: string | null): string | null => {
    if (!note) return null
    const m = note.match(/(HSO\/[\w\d\/]+)/i)
    return m ? m[1] : null
}

// Build auth headers for Accurate API calls
async function buildAccurateHeaders(): Promise<Record<string, string>> {
    const accessToken = Deno.env.get('ACCURATE_ACCESS_TOKEN')
    const signatureSecret = Deno.env.get('ACCURATE_SIGNATURE_SECRET')
    if (!accessToken) throw new Error('ACCURATE_ACCESS_TOKEN tidak disetting')

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

// ─── Transaction Handlers ────────────────────────────────────────────────────

/** Sync a single Purchase Order (Pesanan Pembelian) */
async function handlePurchaseOrder(id: number, authHeaders: Record<string, string>): Promise<string> {
    const res = await fetch(`${BASE_API}/purchase-order/detail.do?id=${id}`, { headers: authHeaders })
    if (!res.ok) throw new Error(`PO detail fetch failed: ${res.status}`)
    const json = await res.json()
    const po = json.d
    if (!po) throw new Error(`PO ${id} not found in Accurate`)

    const header = {
        id: safeInt(po.id),
        number: po.number ?? 'UNKNOWN',
        vendor_id: safeInt(po.vendor?.id),
        vendor_name: po.vendor?.name ?? null,
        trans_date: formatDate(po.transDate),
        status_name: po.statusName ?? null,
        total_amount: safeFloat(po.totalAmount),
        currency_code: po.currency?.code ?? null,
        branch_id: safeInt(po.branch?.id),
    }
    const items = (po.detailItem ?? []).map((item: any, idx: number) => ({
        id: safeInt(item.id),
        po_id: safeInt(po.id),
        item_code: item.item?.no ?? null,
        item_name: item.item?.name ?? null,
        quantity: safeFloat(item.quantity),
        unit_name: item.itemUnit?.name ?? null,
        unit_price: safeFloat(item.unitPrice),
        item_disc_percent: safeFloat(item.itemDiscPercent),
        detail_notes: item.detailNotes ?? null,
        item_seq: idx,
        hso_number: extractHso(item.detailNotes ?? null),
    }))

    const { error: hErr } = await supabase.from('accurate_purchase_orders').upsert(header, { onConflict: 'id' })
    if (hErr) throw new Error(`PO header upsert: ${hErr.message}`)

    await supabase.from('accurate_purchase_order_items').delete().eq('po_id', header.id)
    if (items.length > 0) {
        const { error: iErr } = await supabase.from('accurate_purchase_order_items').insert(items)
        if (iErr) throw new Error(`PO items insert: ${iErr.message}`)
    }

    return `PO ${po.number} synced (${items.length} items)`
}

/** Sync a single Delivery Order (Pengiriman Pesanan) */
async function handleDeliveryOrder(id: number, authHeaders: Record<string, string>): Promise<string> {
    const res = await fetch(`${BASE_API}/delivery-order/detail.do?id=${id}`, { headers: authHeaders })
    if (!res.ok) throw new Error(`DO detail fetch failed: ${res.status}`)
    const json = await res.json()
    const doc = json.d
    if (!doc) throw new Error(`DO ${id} not found in Accurate`)

    const header = {
        id: safeInt(doc.id),
        number: doc.number ?? 'UNKNOWN',
        customer_id: safeInt(doc.customer?.id),
        customer_name: doc.customer?.name ?? null,
        trans_date: formatDate(doc.transDate),
        status_name: doc.statusName ?? null,
        ship_to: doc.shipTo ?? null,
        driver_name: doc.driverName ?? null,
    }
    const items = (doc.detailItem ?? []).map((item: any, idx: number) => ({
        id: safeInt(item.id),
        do_id: safeInt(doc.id),
        item_code: item.item?.no ?? null,
        item_name: item.item?.name ?? null,
        quantity: safeFloat(item.quantity),
        unit_name: item.itemUnit?.name ?? null,
        detail_notes: item.detailNotes ?? null,
        item_seq: idx,
        hso_number: extractHso(item.detailNotes ?? null),
    }))

    const { error: hErr } = await supabase.from('accurate_delivery_orders').upsert(header, { onConflict: 'id' })
    if (hErr) throw new Error(`DO header upsert: ${hErr.message}`)

    await supabase.from('accurate_delivery_order_items').delete().eq('do_id', header.id)
    if (items.length > 0) {
        const { error: iErr } = await supabase.from('accurate_delivery_order_items').insert(items)
        if (iErr) throw new Error(`DO items insert: ${iErr.message}`)
    }

    return `DO ${doc.number} synced (${items.length} items)`
}

/** Sync a single Sales Order (Pesanan Penjualan) — update fields in existing SO table */
async function handleSalesOrder(id: number, authHeaders: Record<string, string>): Promise<string> {
    const res = await fetch(`${BASE_API}/sales-order/detail.do?id=${id}`, { headers: authHeaders })
    if (!res.ok) throw new Error(`SO detail fetch failed: ${res.status}`)
    const json = await res.json()
    const so = json.d
    if (!so) throw new Error(`SO ${id} not found in Accurate`)

    // Log full payload for future schema mapping — SO table may have different column names
    console.log(`[webhook] SO payload keys: ${Object.keys(so).join(', ')}`)

    // Minimal upsert — add more fields once SO table schema is confirmed
    const header = {
        id: safeInt(so.id),
        number: so.number ?? 'UNKNOWN',
        customer_id: safeInt(so.customer?.id),
        customer_name: so.customer?.name ?? null,
        trans_date: formatDate(so.transDate),
        status_name: so.statusName ?? null,
        total_amount: safeFloat(so.totalAmount),
    }

    // Try to upsert — will silently fail if table/columns don't match (non-fatal)
    const { error: hErr } = await supabase.from('accurate_sales_orders').upsert(header, { onConflict: 'id' })
    if (hErr) {
        console.warn(`[webhook] SO upsert warning (table may not exist): ${hErr.message}`)
        // Non-fatal — we still log the payload for debugging
        return `SO ${so.number} received (DB sync skipped: ${hErr.message})`
    }

    return `SO ${so.number} synced`
}

// ─── Webhook Router ───────────────────────────────────────────────────────────

/**
 * Detect transaction type from Accurate webhook payload.
 * Accurate sends webhooks as POST with a JSON body.
 * The exact format is discovered from the first real webhook — we log everything.
 *
 * Possible payload shapes (to be confirmed):
 *   { id: 123, type: "purchase_order" }
 *   { purchaseOrderId: 123 }
 *   { data: { id: 123 }, event: "purchase_order.saved" }
 */
function detectType(body: any): { type: string; id: number } | null {
    // Pattern 1: Array payload (Standard Accurate Webhook)
    // Example: [{"type":"PURCHASE_ORDER","data":[{"purchaseOrderId":12850}]}]
    if (Array.isArray(body) && body.length > 0) {
        const eventItem = body[0]
        if (eventItem.type && Array.isArray(eventItem.data) && eventItem.data.length > 0) {
            const dataItem = eventItem.data[0]
            const typeStr = String(eventItem.type).toLowerCase() // "purchase_order"
            
            let id = dataItem.id
            if (!id && typeStr === 'purchase_order') id = dataItem.purchaseOrderId
            if (!id && typeStr === 'delivery_order') id = dataItem.deliveryOrderId
            if (!id && typeStr === 'sales_order') id = dataItem.salesOrderId
            
            if (id) return { type: typeStr, id: Number(id) }
        }
    }

    // Fallback Pattern 2: explicit "type" field object
    if (body.type && body.id) {
        return { type: String(body.type).toLowerCase(), id: Number(body.id) }
    }

    // Fallback Pattern 3: event field (e.g. "purchase_order.saved")
    if (body.event && body.id) {
        const type = String(body.event).split('.')[0].toLowerCase()
        return { type, id: Number(body.id) }
    }

    // Fallback Pattern 4: specific ID keys
    if (body.purchaseOrderId) return { type: 'purchase_order', id: Number(body.purchaseOrderId) }
    if (body.deliveryOrderId) return { type: 'delivery_order', id: Number(body.deliveryOrderId) }
    if (body.salesOrderId)    return { type: 'sales_order',    id: Number(body.salesOrderId) }

    return null
}

// Map type strings to handler functions
const TYPE_ALIASES: Record<string, string> = {
    'purchase_order': 'po',
    'purchaseOrder': 'po',
    'pesanan_pembelian': 'po',
    'delivery_order': 'do',
    'deliveryOrder': 'do',
    'pengiriman_pesanan': 'do',
    'sales_order': 'so',
    'salesOrder': 'so',
    'pesanan_penjualan': 'so',
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-accurate-signature',
    }
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const startMs = Date.now()

    try {
        // ── Log raw request for debugging (first time setup) ──
        const rawBody = await req.text()
        const allHeaders: Record<string, string> = {}
        req.headers.forEach((v, k) => { allHeaders[k] = v })

        console.log(`[webhook] Incoming ${req.method} from Accurate`)
        console.log(`[webhook] Headers: ${JSON.stringify(allHeaders)}`)
        console.log(`[webhook] Body: ${rawBody}`)

        // Parse body
        let body: Record<string, unknown> = {}
        try { body = JSON.parse(rawBody) } catch (_) {
            // Accurate might send form data or plain text — log and return ok
            console.warn('[webhook] Non-JSON body received, cannot parse')
            return new Response(JSON.stringify({ success: true, note: 'non-json body logged' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Detect type & ID
        const detected = detectType(body)

        if (!detected) {
            // Unknown format — log everything and return 200 so Accurate doesn't retry
            console.warn(`[webhook] Cannot detect type from body: ${JSON.stringify(body)}`)
            return new Response(JSON.stringify({
                success: true,
                note: 'payload logged, type unknown — update detectType() after reviewing logs',
                body,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const { type, id } = detected
        const normalizedType = TYPE_ALIASES[type] ?? type
        console.log(`[webhook] Detected: type=${type} → ${normalizedType}, id=${id}`)

        if (!id || isNaN(id)) {
            throw new Error(`Invalid ID in payload: ${id}`)
        }

        const authHeaders = await buildAccurateHeaders()
        let message = ''

        switch (normalizedType) {
            case 'po':
                message = await handlePurchaseOrder(id, authHeaders)
                break
            case 'do':
                message = await handleDeliveryOrder(id, authHeaders)
                break
            case 'so':
                message = await handleSalesOrder(id, authHeaders)
                break
            default:
                message = `Type "${normalizedType}" belum ada handler-nya — payload dicatat di logs`
                console.warn(`[webhook] No handler for type: ${normalizedType}`)
        }

        console.log(`[webhook] Done: ${message} (${Date.now() - startMs}ms)`)

        // PENTING: selalu return 200 agar Accurate tidak retry
        return new Response(JSON.stringify({
            success: true,
            type: normalizedType,
            id,
            message,
            elapsed_ms: Date.now() - startMs,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (err) {
        console.error(`[webhook] Error: ${err.message}`)
        // Tetap return 200 untuk webhook — jangan return 500 karena Accurate akan retry terus
        return new Response(JSON.stringify({
            success: false,
            error: err.message,
            elapsed_ms: Date.now() - startMs,
        }), {
            // 200 bukan 500 — agar Accurate tidak spam retry
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
