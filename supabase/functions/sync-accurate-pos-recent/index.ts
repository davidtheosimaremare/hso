import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BASE_API = 'https://zeus.accurate.id/accurate/api'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, supabaseKey)

// Helper: HMAC-SHA256 Signature
async function createHmacSha256(secret: string, message: string) {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message))
    return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

// Helpers
const formatDate = (s: string | null) => {
    if (!s) return null
    const p = s.split('/')
    if (p.length === 3) return `${p[2]}-${p[1]}-${p[0]}`
    if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return s
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

// Core: sync a single PO by its full data object (already fetched from list or detail)
async function syncSinglePO(po: any, authHeaders: Record<string, string>): Promise<{ success: boolean; number: string; itemsCount: number; error?: string }> {
    try {
        // Fetch detail for this PO (to get detailItem)
        const detailRes = await fetch(`${BASE_API}/purchase-order/detail.do?id=${po.id}`, { headers: authHeaders })
        if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`)
        const detailJson = await detailRes.json()
        const detail = detailJson.d
        if (!detail) throw new Error(`Detail kosong untuk PO ${po.id}`)

        const header = {
            id: safeInt(po.id ?? detail.id),
            number: po.number ?? detail.number ?? 'UNKNOWN',
            vendor_id: safeInt((po.vendor ?? detail.vendor)?.id),
            vendor_name: (po.vendor ?? detail.vendor)?.name,
            trans_date: formatDate(po.transDate ?? detail.transDate),
            status_name: po.statusName ?? detail.statusName,
            total_amount: safeFloat(po.totalAmount ?? detail.totalAmount),
            currency_code: (po.currency ?? detail.currency)?.code,
            branch_id: safeInt((po.branch ?? detail.branch)?.id),
        }

        const items = (detail.detailItem || []).map((item: any, idx: number) => ({
            id: safeInt(item.id),
            po_id: safeInt(po.id ?? detail.id),
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

        // Upsert header
        const { error: hErr } = await supabase.from('accurate_purchase_orders').upsert(header, { onConflict: 'id' })
        if (hErr) throw new Error(`Header upsert error: ${hErr.message}`)

        // Replace items
        await supabase.from('accurate_purchase_order_items').delete().eq('po_id', header.id)
        if (items.length > 0) {
            const { error: iErr } = await supabase.from('accurate_purchase_order_items').insert(items)
            if (iErr) throw new Error(`Items insert error: ${iErr.message}`)
        }

        return { success: true, number: header.number, itemsCount: items.length }
    } catch (e) {
        return { success: false, number: po.number ?? String(po.id), itemsCount: 0, error: e.message }
    }
}

serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const startTime = Date.now()

    try {
        const accessToken = Deno.env.get('ACCURATE_ACCESS_TOKEN')
        const signatureSecret = Deno.env.get('ACCURATE_SIGNATURE_SECRET')
        if (!accessToken) throw new Error('ACCURATE_ACCESS_TOKEN tidak disetting')

        // Auth headers
        const timestamp = new Date().toISOString()
        const signatureHeader: Record<string, string> = {}
        if (signatureSecret) {
            signatureHeader['X-Api-Timestamp'] = timestamp
            signatureHeader['X-Api-Signature'] = await createHmacSha256(signatureSecret, timestamp)
        }
        const authHeaders = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...signatureHeader
        }

        // -----------------------------------------------------------------------
        // Strategy: Fetch last 25 POs sorted by lastModified DESC.
        // Then compare their Accurate lastModified against our DB updated_at.
        // Only sync POs that are newer in Accurate than in our DB.
        // Fallback: if Accurate doesn't return lastModified, compare by a 
        // configurable lookback window (default: 10 minutes from request body).
        // -----------------------------------------------------------------------

        const body = await req.json().catch(() => ({}))
        const lookbackMinutes: number = body.lookback_minutes ?? 10
        const maxPOs: number = body.max_pos ?? 25

        console.log(`[sync-recent] Fetching last ${maxPOs} POs (lookback: ${lookbackMinutes} min)...`)

        // Fetch recent PO list — try lastModified sort first
        const listUrl = new URL(`${BASE_API}/purchase-order/list.do`)
        listUrl.searchParams.append('fields', 'id,number,transDate,statusName,vendor,totalAmount,currency,lastModified')
        listUrl.searchParams.append('sp.pageSize', maxPOs.toString())
        listUrl.searchParams.append('sp.page', '1')
        // Sort by lastModified if supported, fallback to transDate
        listUrl.searchParams.append('sp.sort', 'lastModified|desc')

        const listRes = await fetch(listUrl.toString(), { headers: authHeaders })
        if (!listRes.ok) throw new Error(`Accurate list error: ${listRes.status} ${await listRes.text()}`)
        const listJson = await listRes.json()
        const allPOs: any[] = listJson.d || []

        console.log(`[sync-recent] Got ${allPOs.length} recent POs from Accurate`)

        if (allPOs.length === 0) {
            return new Response(JSON.stringify({ success: true, synced: 0, skipped: 0, message: 'Tidak ada PO terbaru' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Determine cutoff time (lookback window)
        const cutoffMs = Date.now() - lookbackMinutes * 60 * 1000
        const cutoffISO = new Date(cutoffMs).toISOString()

        // Check if Accurate returns lastModified field
        const hasLastModified = allPOs[0]?.lastModified != null

        console.log(`[sync-recent] lastModified field available: ${hasLastModified}`)

        // Filter POs that need syncing
        let posToSync: any[] = []

        if (hasLastModified) {
            // --- Best case: filter by lastModified from Accurate ---
            posToSync = allPOs.filter((po: any) => {
                if (!po.lastModified) return false
                // lastModified may be epoch millis or ISO string
                const modMs = typeof po.lastModified === 'number'
                    ? po.lastModified
                    : new Date(po.lastModified).getTime()
                return modMs >= cutoffMs
            })
            console.log(`[sync-recent] ${posToSync.length}/${allPOs.length} POs modified in last ${lookbackMinutes} min`)
        } else {
            // --- Fallback: compare Accurate data against our DB updated_at ---
            // Get our current updated_at for these PO IDs
            const poIds = allPOs.map((p: any) => safeInt(p.id)).filter(Boolean)
            const { data: dbRows } = await supabase
                .from('accurate_purchase_orders')
                .select('id, updated_at')
                .in('id', poIds)

            const dbMap: Record<number, string> = {}
            for (const row of (dbRows ?? [])) dbMap[row.id] = row.updated_at

            // Sync POs that don't exist in DB yet, OR were last synced before cutoff
            posToSync = allPOs.filter((po: any) => {
                const id = safeInt(po.id)
                if (!id) return false
                const lastSynced = dbMap[id]
                if (!lastSynced) return true // New PO, sync it
                return new Date(lastSynced).getTime() < cutoffMs
            })

            console.log(`[sync-recent] Fallback mode: ${posToSync.length}/${allPOs.length} POs to sync (not synced in last ${lookbackMinutes} min)`)
        }

        if (posToSync.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                synced: 0,
                skipped: allPOs.length,
                strategy: hasLastModified ? 'lastModified' : 'fallback_updated_at',
                message: `Tidak ada PO yang berubah dalam ${lookbackMinutes} menit terakhir`,
                elapsed_ms: Date.now() - startTime,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Sync each changed PO
        console.log(`[sync-recent] Syncing ${posToSync.length} POs...`)
        const results = await Promise.all(
            posToSync.map((po: any) => syncSinglePO(po, authHeaders))
        )

        const succeeded = results.filter(r => r.success)
        const failed = results.filter(r => !r.success)

        console.log(`[sync-recent] Done: ${succeeded.length} OK, ${failed.length} fail. Elapsed: ${Date.now() - startTime}ms`)

        return new Response(JSON.stringify({
            success: true,
            synced: succeeded.length,
            skipped: allPOs.length - posToSync.length,
            failed: failed.length,
            strategy: hasLastModified ? 'lastModified' : 'fallback_updated_at',
            details: results.map(r => ({ po: r.number, ok: r.success, items: r.itemsCount, error: r.error })),
            elapsed_ms: Date.now() - startTime,
            message: `${succeeded.length} PO diperbarui, ${allPOs.length - posToSync.length} tidak berubah`,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error('[sync-recent] Fatal error:', error.message)
        return new Response(JSON.stringify({ success: false, error: error.message, elapsed_ms: Date.now() - startTime }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
