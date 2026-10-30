import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BASE_API = 'https://zeus.accurate.id/accurate/api'
const MAX_ITEMS_PER_DOC = 1000

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

// Format Date as DD/MM/YYYY
function formatIndoDate(d = new Date()): string {
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
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
    const body = await req.json().catch(() => ({}))

    // Input items: Array<{ sku: string, price: number, defaultPrice?: number, itemName?: string }>
    const rawItems = Array.isArray(body.items) ? body.items : (body.item ? [body.item] : [])
    if (rawItems.length === 0) {
      throw new Error('Daftar barang (items) tidak boleh kosong!')
    }

    const userEmail = body.userEmail || 'Sales Team'
    const priceCategoryName = body.priceCategoryName || 'Umum'
    const todayStr = formatIndoDate(new Date())

    // Sanitize items
    const validItems = rawItems
      .filter((it: any) => it && (it.sku || it.item_no) && Number(it.price) > 0)
      .map((it: any) => ({
        sku: (it.sku || it.item_no || '').trim().toUpperCase(),
        price: Number(it.price),
        defaultPrice: Number(it.defaultPrice || it.base_price || it.old_price || 0),
        itemName: it.itemName || it.item_name || ''
      }))

    if (validItems.length === 0) {
      throw new Error('Tidak ada barang valid dengan harga > 0 yang dapat disubmit!')
    }

    console.log(`Processing ${validItems.length} items for Selling Price Adjustment in Accurate...`)

    // 1. Check recent SPA documents from Accurate to find an open HSO document with room (< 1000 items)
    let targetDoc: any = null
    let existingItemsMap = new Map<string, any>() // itemNo -> line item obj

    try {
      const listUrl = `${BASE_API}/sellingprice-adjustment/list.do?fields=id,number,transDate,description&sp.pageSize=20&sp.sort=id|desc`
      const listRes = await fetch(listUrl, { headers: authHeaders })
      if (listRes.ok) {
        const listJson = await listRes.json()
        const recentDocs = listJson.d || []

        // Find the latest HSO document that might have available slots
        for (const doc of recentDocs) {
          const desc = (doc.description || '').toUpperCase()
          // Check if this doc was created by HSO
          if (desc.includes('HSO') || desc.includes('PENYESUAIAN HARGA SIEMENS')) {
            // Fetch detail to count items
            const detailRes = await fetch(`${BASE_API}/sellingprice-adjustment/detail.do?id=${doc.id}`, { headers: authHeaders })
            if (detailRes.ok) {
              const detailJson = await detailRes.json()
              const detailItems = detailJson.d?.detailItem || []
              if (detailItems.length < MAX_ITEMS_PER_DOC) {
                targetDoc = {
                  id: doc.id,
                  number: doc.number,
                  itemCount: detailItems.length,
                  detailItems: detailItems,
                  description: doc.description,
                  transDate: doc.transDate || todayStr
                }
                detailItems.forEach((dIt: any) => {
                  const no = (dIt.item?.no || '').trim().toUpperCase()
                  if (no) existingItemsMap.set(no, dIt)
                })
                break
              }
            }
          }
        }
      }
    } catch (checkErr) {
      console.warn('Notice checking recent SPA:', checkErr)
    }

    const processedDocuments: any[] = []
    let itemQueue = [...validItems]

    // 2. If targetDoc has available slots, append as many as can fit (< 1000)
    if (targetDoc && targetDoc.itemCount < MAX_ITEMS_PER_DOC && itemQueue.length > 0) {
      const slotsAvailable = MAX_ITEMS_PER_DOC - targetDoc.itemCount
      const toAppend = itemQueue.slice(0, slotsAvailable)
      itemQueue = itemQueue.slice(slotsAvailable)

      console.log(`Appending ${toAppend.length} items to existing Accurate doc ${targetDoc.number} (Current count: ${targetDoc.itemCount})...`)

      // Build combined detailItem array
      // Re-map existing items to retain their lines
      const mergedDetailItems = (targetDoc.detailItems || []).map((ex: any) => ({
        id: ex.id,
        itemNo: (ex.item?.no || '').trim().toUpperCase(),
        price: Number(ex.price),
        priceCategoryName: priceCategoryName
      }))

      // Add new items
      for (const item of toAppend) {
        const existingIdx = mergedDetailItems.findIndex((it: any) => it.itemNo === item.sku)
        if (existingIdx >= 0) {
          // Update price in existing line
          mergedDetailItems[existingIdx].price = item.price
        } else {
          // Add new line
          mergedDetailItems.push({
            itemNo: item.sku,
            price: item.price,
            priceCategoryName: priceCategoryName
          })
        }
      }

      const savePayload: any = {
        id: targetDoc.id,
        transDate: targetDoc.transDate || todayStr,
        priceCategoryName: priceCategoryName,
        salesAdjustmentType: 'ITEM_PRICE_TYPE',
        description: `Penyesuaian Harga Siemens HSO (${mergedDetailItems.length} item) — ${todayStr}`,
        detailItem: mergedDetailItems
      }

      const saveRes = await fetch(`${BASE_API}/sellingprice-adjustment/save.do`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(savePayload)
      })

      const saveJson = await saveRes.json()
      if (!saveRes.ok || saveJson.s === false) {
        let errMsg = saveJson.d || saveJson.message
        if (Array.isArray(errMsg)) errMsg = errMsg.join(', ')
        console.warn(`Append to ${targetDoc.number} returned error: ${errMsg}. Will create a new document instead.`)
        // Put back items to queue to be created in a new document
        itemQueue = [...toAppend, ...itemQueue]
      } else {
        processedDocuments.push({
          action: 'APPENDED',
          id: targetDoc.id,
          number: targetDoc.number,
          itemCount: mergedDetailItems.length,
          itemsAdded: toAppend.length,
          items: toAppend
        })
      }
    }

    // 3. For any remaining items, chunk by 1,000 items and create NEW SPA documents
    while (itemQueue.length > 0) {
      const chunk = itemQueue.slice(0, MAX_ITEMS_PER_DOC)
      itemQueue = itemQueue.slice(MAX_ITEMS_PER_DOC)

      const docIndex = processedDocuments.length + 1
      const totalEstimated = Math.ceil(validItems.length / MAX_ITEMS_PER_DOC)
      const docLabel = totalEstimated > 1 ? `Dokumen ${docIndex}/${totalEstimated}` : `Dokumen ${docIndex}`
      const description = `Penyesuaian Harga Siemens HSO — ${docLabel} (${chunk.length} item) — ${todayStr}`

      console.log(`Creating NEW Accurate SPA document with ${chunk.length} items (${docLabel})...`)

      const newDocPayload = {
        transDate: todayStr,
        priceCategoryName: priceCategoryName,
        salesAdjustmentType: 'ITEM_PRICE_TYPE',
        description,
        detailItem: chunk.map((c: any) => ({
          itemNo: c.sku,
          price: c.price,
          priceCategoryName: priceCategoryName
        }))
      }

      const createRes = await fetch(`${BASE_API}/sellingprice-adjustment/save.do`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(newDocPayload)
      })

      const createJson = await createRes.json()
      if (!createRes.ok || createJson.s === false) {
        let errMsg = createJson.d || createJson.message
        if (Array.isArray(errMsg)) errMsg = errMsg.join(', ')
        throw new Error(`Gagal membuat Dokumen SPA di Accurate: ${errMsg}`)
      }

      const createdId = createJson.r?.id
      const createdNumber = createJson.r?.number || `SPA.${todayStr.replace(/\//g, '')}.${createdId || 'NEW'}`

      processedDocuments.push({
        action: 'CREATED_NEW',
        id: createdId,
        number: createdNumber,
        itemCount: chunk.length,
        itemsAdded: chunk.length,
        items: chunk
      })
    }

    // 4. Update Supabase database (accurate_items table & audit logs)
    const primaryDocNumber = processedDocuments[0]?.number || 'SPA.HSO'
    const nowIso = new Date().toISOString()

    for (const it of validItems) {
      try {
        const { data: existingRow } = await supabase
          .from('accurate_items')
          .select('specs, base_price')
          .eq('item_no', it.sku)
          .maybeSingle()

        const currentSpecs = (existingRow?.specs && typeof existingRow.specs === 'object') ? existingRow.specs : {}
        const existingBasePrice = Number(existingRow?.base_price) || Number(it.defaultPrice) || 0

        const updateData: any = {
          unit_price: it.price,
          updated_at: nowIso,
          specs: {
            ...currentSpecs,
            adjusted_price: it.price,
            base_price: existingBasePrice > 0 ? existingBasePrice : undefined,
            spa_number: primaryDocNumber,
            trans_date: todayStr,
            has_hso_markup: true,
            source: 'ACCURATE_SELLINGPRICE_ADJUSTMENT'
          }
        }
        if (existingBasePrice > 0) {
          updateData.base_price = existingBasePrice
        }

        await supabase
          .from('accurate_items')
          .update(updateData)
          .eq('item_no', it.sku)
      } catch (dbItemErr: any) {
        console.warn(`Notice updating DB for ${it.sku}:`, dbItemErr.message)
      }
    }

    // Insert into price_adjustment_logs
    const auditLogs = validItems.map(it => {
      const diffAmount = it.defaultPrice > 0 ? it.price - it.defaultPrice : 0
      const diffPercent = it.defaultPrice > 0 ? Math.round((diffAmount / it.defaultPrice) * 1000) / 10 : 0
      return {
        batch_id: primaryDocNumber,
        sku: it.sku,
        item_name: it.itemName,
        old_price: it.defaultPrice,
        new_price: it.price,
        diff_amount: diffAmount,
        diff_percent: diffPercent,
        status: 'SUBMITTED',
        adjusted_by: userEmail,
        notes: `SPA Accurate: ${primaryDocNumber}`
      }
    })

    try {
      await supabase.from('price_adjustment_logs').insert(auditLogs)
    } catch (logErr: any) {
      console.warn('Notice price_adjustment_logs insert:', logErr.message)
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Berhasil menyesuaikan harga ${validItems.length} produk di Accurate Online!`,
      documents: processedDocuments,
      totalItemsProcessed: validItems.length,
      primaryDocNumber
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('Error in accurate-create-spa:', err.message)
    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
