import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { cleanPartNumber } from '@/utils/componentConverter'

const items = ref([])
const customRules = ref([])
const isLoading = ref(false)
const isSyncing = ref(false)
const syncProgress = ref(0)
const lastSyncTime = ref(
  localStorage.getItem('accurate_items_last_sync')
    ? parseInt(localStorage.getItem('accurate_items_last_sync'))
    : null
)

// Category rank priority order requested by user:
// 1. ACB, 2. MCB, 3. MCCB, 4. RCCB, 5. RCBO, 6. CONTACTOR, 7. CONTACTOR_RELAY (Industrial Control), and the rest
export const CATEGORY_ORDER = [
  'ACB',
  'MCB',
  'MCCB',
  'RCCB',
  'RCBO',
  'CONTACTOR',
  'CONTACTOR_RELAY',
  'TOR',
  'MPCB',
  'SOFT_STARTER',
  'VFD',
  'PILOT_DEVICE',
  'POWER_SUPPLY',
  'PLC_AUTOMATION',
  'SPD_MODULAR',
  'ACCESSORIES',
  'OTHER'
]

export const CATEGORY_PRIORITY = {
  'ACB': 1,
  'MCB': 2,
  'MCCB': 3,
  'RCCB': 4,
  'RCBO': 5,
  'CONTACTOR': 6,
  'CONTACTOR_RELAY': 7,
  'CONTACTOR RELAY': 7,
  'TOR': 8,
  'MPCB': 9,
  'SOFT_STARTER': 10,
  'VFD': 11,
  'PILOT_DEVICE': 12,
  'POWER_SUPPLY': 13,
  'PLC_AUTOMATION': 14,
  'SPD_MODULAR': 15,
  'ACCESSORIES': 16,
  'OTHER': 99
}

// Check for invalid dummy or sponsorship items
export function isDummyItem(sku, name) {
  const code = (sku || '').trim().toUpperCase()
  const text = `${sku} ${name}`.toUpperCase()
  if (['100097', '100098', '11111111'].includes(code)) return true
  if (code.includes('6AA0X') || code.startsWith('(')) return true
  if (text.includes('SPONSHORSHIP') || text.includes('SPONSORSHIP') || text.includes('CONTOH 112')) return true
  return false
}

// Helper to sanitize & categorize items
export function categorizeMLFB(itemNo, itemName) {
  const code = (itemNo || '').toUpperCase()
  const text = `${itemNo} ${itemName}`.toUpperCase()

  // 1. ACB (Air Circuit Breaker)
  if (/^(3WL|3WA|3WT|3WN)/i.test(code) || /\bACB\b|AIR CIRCUIT/i.test(text)) return 'ACB'

  // 2. MCB (Miniature Circuit Breaker)
  if (/^(5SL|5SY|5SJ|5SP|5TJ|5ST)/i.test(code) || /\bMCB\b|MINIATURE CIRCUIT/i.test(text)) return 'MCB'

  // 3. MCCB (Molded Case Circuit Breaker)
  if (/^(3VA|3VJ|3VM|3VL|3VT)/i.test(code) || /\bMCCB\b|MOLDED CASE/i.test(text)) return 'MCCB'

  // 4. RCCB (Residual Current Circuit Breaker / ELCB)
  if (/^(5SV|5SM)/i.test(code) || /\bRCCB\b|\bELCB\b|EARTH LEAKAGE/i.test(text)) return 'RCCB'

  // 5. RCBO (Residual Current Breaker with Overcurrent Protection)
  if (/^(5SU)/i.test(code) || /\bRCBO\b/i.test(text)) return 'RCBO'

  // 6. Contactor Relay / Auxiliary Contactor (Industrial Control)
  if (/^(3RH|3TH)/i.test(code) || /CONTACTOR RELAY|AUXILIARY CONTACTOR|RELAY CONTACTOR|CONTROL RELAY/i.test(text)) return 'CONTACTOR_RELAY'

  // 7. Power Contactor (Industrial Control)
  if (/^(3RT|3TF|3TG|3TS|3TD)/i.test(code) || /CONTACTOR|KONTAKTOR/i.test(text)) return 'CONTACTOR'

  // 8. TOR (Thermal Overload Relay - Industrial Control)
  if (/^(3RU|3RB)/i.test(code) || /OVERLOAD|TOR\b/i.test(text)) return 'TOR'

  // 9. MPCB (Motor Protection Circuit Breaker - Industrial Control)
  if (/^(3RV)/i.test(code) || /MPCB|MOTOR PROTECT/i.test(text)) return 'MPCB'

  // 10. Soft Starter (Industrial Control)
  if (/^(3RW)/i.test(code) || /SOFT STARTER/i.test(text)) return 'SOFT_STARTER'

  // 11. VFD / Inverter (Industrial Control)
  if (/^(6SL|6SE|6AU|V20|G120)/i.test(code) || /INVERTER|DRIVE|VFD/i.test(text)) return 'VFD'

  // 12. Pilot Device (Industrial Control)
  if (/^(3SU|3SB|3SE)/i.test(code) || /PUSH\s*BUTTON|PILOT\s*LAMP|SELECTOR/i.test(text)) return 'PILOT_DEVICE'

  // 13. Power Supply (Industrial Control)
  if (/^(6EP|6ES7148)/i.test(code) || /POWER SUPPLY|SITOP/i.test(text)) return 'POWER_SUPPLY'

  // 14. PLC / Automation (Industrial Control)
  if (/^(6ED1|6ES7|6FC|6GK)/i.test(code) || /LOGO!|PLC|SIMATIC/i.test(text)) return 'PLC_AUTOMATION'

  // 15. SPD Modular
  if (/^(5SD|5TT)/i.test(code) || /SPD|SURGE/i.test(text)) return 'SPD_MODULAR'

  // 16. Accessories
  if (/ACC|SWITCH|TERMINAL|RELAY|SOCKET|CABLE/i.test(text)) return 'ACCESSORIES'

  return 'OTHER'
}

// Synchronous initial cache load on module evaluation for 0ms instant render
try {
  const cached = localStorage.getItem('accurate_items_cache')
  if (cached) {
    const parsed = JSON.parse(cached)
    if (Array.isArray(parsed) && parsed.length > 0) {
      items.value = parsed
    }
  }
  const cachedRules = localStorage.getItem('converter_custom_rules_cache')
  if (cachedRules) {
    const parsedRules = JSON.parse(cachedRules)
    if (Array.isArray(parsedRules)) {
      customRules.value = parsedRules
    }
  }
} catch (e) {
  console.warn('Initial cache load error:', e)
}

export function useAccurateItems() {
  // Load cache helper
  const loadCache = () => {
    try {
      const cached = localStorage.getItem('accurate_items_cache')
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) {
          items.value = parsed
        }
      }
      const cachedRules = localStorage.getItem('converter_custom_rules_cache')
      if (cachedRules) {
        const parsedRules = JSON.parse(cachedRules)
        if (Array.isArray(parsedRules)) {
          customRules.value = parsedRules
        }
      }
    } catch (e) {
      console.warn('Error loading accurate items cache:', e)
    }
  }

  // Fast parallel lean fetch from DB
  const fetchItems = async ({ force = false, background = false } = {}) => {
    // If we have cached items and force is not requested, return immediately
    if (items.value.length > 0 && !force) {
      // Trigger background silent revalidation
      if (!background) {
        fetchItems({ force: true, background: true }).catch(() => {})
      }
      return items.value
    }

    if (!background) {
      isLoading.value = true
    }

    try {
      // 1. Get exact total count
      const { count, error: countErr } = await supabase
        .from('accurate_items')
        .select('*', { count: 'exact', head: true })

      if (countErr) throw countErr

      const total = count || 5000
      const step = 1000
      const promises = []

      // 2. Fetch all pages IN PARALLEL with lean payload
      for (let from = 0; from < total; from += step) {
        promises.push(
          supabase
            .from('accurate_items')
            .select('id, item_no, item_name, description, long_description, unit_price, category, brand, stock_status, stock_quantity, available_to_sell, unit_name')
            .order('item_no', { ascending: true })
            .range(from, from + step - 1)
        )
      }

      const results = await Promise.all(promises)
      const allFetched = results.flatMap(r => r.data || [])

      if (allFetched.length > 0) {
        items.value = allFetched
        localStorage.setItem('accurate_items_cache', JSON.stringify(allFetched))
      }

      return items.value
    } catch (err) {
      console.warn('Failed to fetch accurate items:', err.message)
    } finally {
      isLoading.value = false
    }

    return items.value
  }

  // Fetch Custom Rules & Auto-sync Team-Wide AI Configuration
  const fetchCustomRules = async () => {
    try {
      const { data, error } = await supabase
        .from('converter_custom_rules')
        .select('*')
        .order('created_at', { ascending: false })

      if (!error && data) {
        // Automatically check if team-wide AI config is stored in rules
        const sysAiRule = data.find(r => r.siemens_mlfb === '__SYSTEM_AI_CONFIG__')
        if (sysAiRule?.spec_match_notes && typeof localStorage !== 'undefined') {
          try {
            const val = JSON.parse(sysAiRule.spec_match_notes)
            if (val.apiKey) {
              localStorage.setItem('hso_ai_api_key', val.apiKey)
              if (val.baseUrl) localStorage.setItem('hso_ai_base_url', val.baseUrl)
              if (val.model) localStorage.setItem('hso_ai_model', val.model)
              if (val.webSearch !== undefined) localStorage.setItem('hso_ai_web_search', String(val.webSearch))
            }
          } catch {}
        }

        const filteredRules = data.filter(r => r.siemens_mlfb !== '__SYSTEM_AI_CONFIG__')
        customRules.value = filteredRules
        localStorage.setItem('converter_custom_rules_cache', JSON.stringify(filteredRules))
      }
    } catch (e) {
      console.warn('Failed to fetch custom converter rules:', e)
    }
    return customRules.value
  }

  // Save Custom Rule
  const saveCustomRule = async (ruleData) => {
    try {
      const siemensMlfb = (ruleData.siemens_mlfb || ruleData.target_siemens_mlfb || '').trim().toUpperCase()
      const schneiderModel = (ruleData.schneider_model || (ruleData.source_brand === 'SCHNEIDER' ? ruleData.source_model : '') || '').trim().toUpperCase()
      const abbModel = (ruleData.abb_model || (ruleData.source_brand === 'ABB' ? ruleData.source_model : '') || '').trim().toUpperCase()
      const otherModel = (ruleData.other_model || (ruleData.source_brand === 'OTHER' ? ruleData.source_model : '') || '').trim().toUpperCase()

      const payload = {
        category: ruleData.category || 'OTHER',
        siemens_mlfb: siemensMlfb,
        siemens_name: ruleData.siemens_name || ruleData.target_siemens_name || '',
        target_siemens_mlfb: siemensMlfb,
        target_siemens_name: ruleData.siemens_name || ruleData.target_siemens_name || '',
        schneider_model: schneiderModel,
        abb_model: abbModel,
        other_brand: ruleData.other_brand || null,
        other_model: otherModel,
        source_brand: ruleData.source_brand?.toUpperCase() || (schneiderModel ? 'SCHNEIDER' : abbModel ? 'ABB' : 'CUSTOM'),
        source_model: schneiderModel || abbModel || otherModel || siemensMlfb,
        specs_summary: ruleData.specs_summary || ruleData.spec_match_notes || '',
        spec_match_notes: ruleData.spec_match_notes || ruleData.specs_summary || '',
        match_confidence: ruleData.match_confidence || 100,
        is_active: ruleData.is_active !== false,
        created_by: ruleData.created_by || 'ADMIN'
      }

      const { data, error } = await supabase
        .from('converter_custom_rules')
        .insert([payload])
        .select()

      if (error) {
        // Fallback local save
        const localRule = { id: Date.now().toString(), ...payload, created_at: new Date().toISOString() }
        customRules.value.unshift(localRule)
        localStorage.setItem('converter_custom_rules_cache', JSON.stringify(customRules.value))
        return localRule
      }

      if (data && data[0]) {
        customRules.value.unshift(data[0])
        localStorage.setItem('converter_custom_rules_cache', JSON.stringify(customRules.value))
        return data[0]
      }
    } catch (err) {
      console.error('Error saving custom rule:', err)
      throw err
    }
  }

  // Update Custom Rule
  const updateCustomRule = async (ruleId, ruleData) => {
    try {
      const siemensMlfb = (ruleData.siemens_mlfb || ruleData.target_siemens_mlfb || '').trim().toUpperCase()
      const schneiderModel = (ruleData.schneider_model || (ruleData.source_brand === 'SCHNEIDER' ? ruleData.source_model : '') || '').trim().toUpperCase()
      const abbModel = (ruleData.abb_model || (ruleData.source_brand === 'ABB' ? ruleData.source_model : '') || '').trim().toUpperCase()
      const otherModel = (ruleData.other_model || (ruleData.source_brand === 'OTHER' ? ruleData.source_model : '') || '').trim().toUpperCase()

      const payload = {
        category: ruleData.category || 'OTHER',
        siemens_mlfb: siemensMlfb,
        siemens_name: ruleData.siemens_name || ruleData.target_siemens_name || '',
        target_siemens_mlfb: siemensMlfb,
        target_siemens_name: ruleData.siemens_name || ruleData.target_siemens_name || '',
        schneider_model: schneiderModel,
        abb_model: abbModel,
        other_brand: ruleData.other_brand || null,
        other_model: otherModel,
        source_brand: ruleData.source_brand?.toUpperCase() || (schneiderModel ? 'SCHNEIDER' : abbModel ? 'ABB' : 'CUSTOM'),
        source_model: schneiderModel || abbModel || otherModel || siemensMlfb,
        specs_summary: ruleData.specs_summary || ruleData.spec_match_notes || '',
        spec_match_notes: ruleData.spec_match_notes || ruleData.specs_summary || '',
        match_confidence: ruleData.match_confidence || 100,
        is_active: ruleData.is_active !== false,
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('converter_custom_rules')
        .update(payload)
        .eq('id', ruleId)
        .select()

      const idx = customRules.value.findIndex(r => r.id === ruleId)
      if (idx !== -1) {
        customRules.value[idx] = { ...customRules.value[idx], ...payload, ...(data && data[0] ? data[0] : {}) }
        localStorage.setItem('converter_custom_rules_cache', JSON.stringify(customRules.value))
      }

      if (error) console.warn('Update remote warning:', error.message)
      return data && data[0] ? data[0] : customRules.value[idx]
    } catch (err) {
      console.error('Error updating custom rule:', err)
      throw err
    }
  }

  // Upsert Rule by Siemens MLFB (For Inline Google Sheet Style Autosave)
  const upsertRuleBySiemensMlfb = async (siemensMlfb, ruleData) => {
    if (!siemensMlfb) return null
    const mlfb = siemensMlfb.trim().toUpperCase()
    const schneider = (ruleData.schneider_model || '').trim().toUpperCase()
    const schneiderDesc = (ruleData.schneider_desc || '').trim()
    const schneiderPrice = ruleData.schneider_price !== undefined && ruleData.schneider_price !== null && ruleData.schneider_price !== '' ? Number(ruleData.schneider_price) : null
    const abb = (ruleData.abb_model || '').trim().toUpperCase()
    const abbDesc = (ruleData.abb_desc || '').trim()
    const abbPrice = ruleData.abb_price !== undefined && ruleData.abb_price !== null && ruleData.abb_price !== '' ? Number(ruleData.abb_price) : null
    const specs = (ruleData.specs_summary || '').trim()

    // If completely empty, remove rule from DB and local cache
    if (!schneider && !schneiderDesc && schneiderPrice === null && !abb && !abbDesc && abbPrice === null) {
      const idx = customRules.value.findIndex(r => 
        (r.siemens_mlfb && r.siemens_mlfb.toUpperCase() === mlfb) ||
        (r.target_siemens_mlfb && r.target_siemens_mlfb.toUpperCase() === mlfb)
      )
      if (idx !== -1) {
        customRules.value.splice(idx, 1)
        localStorage.setItem('converter_custom_rules_cache', JSON.stringify(customRules.value))
      }
      try {
        await supabase.from('converter_custom_rules').delete().eq('siemens_mlfb', mlfb)
      } catch (e) {
        console.warn('Error deleting empty rule:', e)
      }
      return null
    }

    const payload = {
      siemens_mlfb: mlfb,
      siemens_name: ruleData.siemens_name || '',
      target_siemens_mlfb: mlfb,
      target_siemens_name: ruleData.siemens_name || '',
      category: ruleData.category || 'OTHER',
      schneider_model: schneider,
      schneider_desc: schneiderDesc,
      schneider_price: schneiderPrice,
      abb_model: abb,
      abb_desc: abbDesc,
      abb_price: abbPrice,
      specs_summary: specs,
      spec_match_notes: specs,
      source_brand: schneider ? 'SCHNEIDER' : abb ? 'ABB' : 'CUSTOM',
      source_model: schneider || abb || mlfb,
      match_confidence: 100,
      is_active: true,
      updated_at: new Date().toISOString()
    }

    // Optimistic local update
    const idx = customRules.value.findIndex(r => 
      (r.siemens_mlfb && r.siemens_mlfb.toUpperCase() === mlfb) ||
      (r.target_siemens_mlfb && r.target_siemens_mlfb.toUpperCase() === mlfb)
    )

    if (idx !== -1) {
      customRules.value[idx] = { ...customRules.value[idx], ...payload }
    } else {
      customRules.value.unshift({ id: `tmp_${Date.now()}`, ...payload })
    }
    localStorage.setItem('converter_custom_rules_cache', JSON.stringify(customRules.value))

    // Asynchronous Supabase Upsert
    const { data, error } = await supabase
      .from('converter_custom_rules')
      .upsert([payload], { onConflict: 'siemens_mlfb' })
      .select()

    if (error) {
      console.warn('Upsert inline rule error:', error.message)
    } else if (data && data[0]) {
      const realIdx = customRules.value.findIndex(r => r.siemens_mlfb === mlfb)
      if (realIdx !== -1) {
        customRules.value[realIdx] = { ...customRules.value[realIdx], ...data[0] }
        localStorage.setItem('converter_custom_rules_cache', JSON.stringify(customRules.value))
      }
    }

    return payload
  }

  // Delete Custom Rule
  const deleteCustomRule = async (ruleId) => {
    try {
      await supabase
        .from('converter_custom_rules')
        .delete()
        .eq('id', ruleId)

      customRules.value = customRules.value.filter(r => r.id !== ruleId)
      localStorage.setItem('converter_custom_rules_cache', JSON.stringify(customRules.value))
    } catch (e) {
      console.warn('Error deleting custom rule:', e)
      customRules.value = customRules.value.filter(r => r.id !== ruleId)
      localStorage.setItem('converter_custom_rules_cache', JSON.stringify(customRules.value))
    }
  }

  // Import / Batch Upsert products from Shop API JSON format (Strictly Siemens Brand)
  const importShopProducts = async (productsArray) => {
    if (!Array.isArray(productsArray) || productsArray.length === 0) return 0
    
    // Filter strictly for Siemens products and exclude dummy/test items
    const siemensProducts = productsArray.filter(elem => {
      const isSiemens = !elem.brand || elem.brand.toUpperCase() === 'SIEMENS'
      const isDummy = isDummyItem(elem.sku || elem.item_no || elem.id, elem.name || elem.item_name)
      return isSiemens && !isDummy
    })
    if (siemensProducts.length === 0) return 0

    isLoading.value = true

    try {
      const records = siemensProducts.map(elem => {
        const itemNo = (elem.sku || elem.item_no || elem.id || '').trim()
        const itemName = elem.name || elem.item_name || ''
        const cat = categorizeMLFB(itemNo, itemName)

        return {
          shop_id: elem.id,
          item_no: itemNo,
          sku: elem.sku || itemNo,
          item_name: itemName,
          description: elem.description || '',
          long_description: elem.longDescription || '',
          unit_price: Number(elem.price || elem.unit_price || 0),
          base_price: Number(elem.basePrice || elem.price || 0),
          available_to_sell: Number(elem.availableToSell || elem.stock_quantity || 0),
          stock_quantity: Number(elem.availableToSell || elem.stock_quantity || 0),
          brand: 'SIEMENS',
          category: cat,
          image: elem.image || null,
          slider_images: elem.sliderImages || [],
          accurate_id: elem.accurateId ? Number(elem.accurateId) : null,
          item_type: elem.itemType || 'INVENTORY',
          is_visible: elem.isVisible !== false,
          status: elem.status || 'APPROVED',
          datasheet: elem.datasheet || null,
          specifications: elem.specifications || {},
          meta_title: elem.metaTitle || null,
          meta_description: elem.metaDescription || null,
          indent_time: elem.indentTime || null,
          stock_status: elem.stockStatus || 'INDENT',
          source: 'SHOP_API',
          shop_created_at: elem.createdAt || null,
          shop_updated_at: elem.updatedAt || null,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      }).filter(r => Boolean(r.item_no && r.item_no.trim()))

      const { data, error } = await supabase
        .from('accurate_items')
        .upsert(records, { onConflict: 'item_no' })
        .select('item_no')

      if (error) throw error

      await fetchItems({ force: true })
      lastSyncTime.value = Date.now()
      localStorage.setItem('accurate_items_last_sync', lastSyncTime.value.toString())
      return data?.length || records.length
    } catch (err) {
      console.error('Error importing shop products:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // Sync entire catalog from Shop VPS API with pagination (1-Click Direct Sync)
  const syncFromShopApi = async (customUrl = null, { headers = {}, limit = 500, brand = 'SIEMENS', onProgress = null } = {}) => {
    if (isSyncing.value) return
    isSyncing.value = true
    syncProgress.value = 5

    const endpoint = customUrl || import.meta.env.VITE_SHOP_API_URL || 'https://shop.hokiindo.co.id/api/v1/sync/siemens'
    const apiKey = import.meta.env.VITE_SHOP_SYNC_API_KEY || 'hso_sync_siemens_9a7d3b5c1e2f4088'

    const reqHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      ...headers
    }

    try {
      let currentPage = 1
      let totalPages = 1
      let totalImported = 0
      let totalRecords = 0

      while (currentPage <= totalPages) {
        const url = new URL(endpoint)
        url.searchParams.set('page', currentPage.toString())
        url.searchParams.set('limit', limit.toString())
        if (brand && brand !== 'ALL') {
          url.searchParams.set('brand', brand)
        }

        const response = await fetch(url.toString(), {
          headers: reqHeaders
        })

        if (!response.ok) {
          throw new Error(`Shop API HTTP ${response.status}: ${response.statusText}`)
        }

        const json = await response.json()
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          // Filter by brand if provided
          let itemsToImport = json.data
          if (brand && brand !== 'ALL') {
            itemsToImport = json.data.filter(item => !item.brand || item.brand.toUpperCase() === brand.toUpperCase())
          }

          if (itemsToImport.length > 0) {
            await importShopProducts(itemsToImport)
            totalImported += itemsToImport.length
          }

          if (json.pagination) {
            totalPages = json.pagination.totalPages || 1
            totalRecords = json.pagination.total || totalImported
            syncProgress.value = Math.min(95, Math.round((currentPage / totalPages) * 100))
            if (onProgress) {
              onProgress({
                page: currentPage,
                totalPages,
                totalRecords,
                imported: totalImported
              })
            }
          }
        } else {
          break
        }

        if (!json.pagination?.hasNext) break
        currentPage++
      }

      await fetchItems({ force: true })
      syncProgress.value = 100
      return { totalImported, totalRecords }
    } catch (err) {
      console.error('Failed to sync from Shop API:', err)
      throw err
    } finally {
      isSyncing.value = false
      setTimeout(() => { syncProgress.value = 0 }, 2000)
    }
  }

  // Sync latest items from Accurate API / DB
  const syncItems = async () => {
    if (isSyncing.value) return
    isSyncing.value = true
    syncProgress.value = 10

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const { data: { session } } = await supabase.auth.getSession()
      const headers = {
        Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }

      syncProgress.value = 30
      // Call edge function if available
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/sync-accurate-items`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ page: 1 })
        })
        if (res.ok) {
          syncProgress.value = 80
        }
      } catch (fnErr) {
        console.warn('Edge function sync notice:', fnErr.message)
      }

      // Re-fetch items from DB
      await fetchItems({ force: true })
      syncProgress.value = 100
      lastSyncTime.value = Date.now()
      localStorage.setItem('accurate_items_last_sync', lastSyncTime.value.toString())
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      isSyncing.value = false
      setTimeout(() => { syncProgress.value = 0 }, 2000)
    }
  }

  const lastSyncFormatted = computed(() => {
    if (!lastSyncTime.value) return null
    const d = new Date(lastSyncTime.value)
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  })

  // Category counts
  const categoryCounts = computed(() => {
    const counts = { ALL: items.value.length }
    items.value.forEach(item => {
      const cat = item.category || 'OTHER'
      counts[cat] = (counts[cat] || 0) + 1
    })
    return counts
  })

  // Count how many unique Siemens items in catalog actually have valid equivalent brand mappings
  const mappedCount = computed(() => {
    const mappedMlfbSet = new Set()
    ;(customRules.value || []).forEach(r => {
      const clean = cleanPartNumber(r.siemens_mlfb || r.target_siemens_mlfb)
      const hasSchneider = r.schneider_model && r.schneider_model.trim() && r.schneider_model.trim() !== '-'
      const hasAbb = r.abb_model && r.abb_model.trim() && r.abb_model.trim() !== '-'
      const hasOther = r.other_model && r.other_model.trim() && r.other_model.trim() !== '-'
      if (clean && (hasSchneider || hasAbb || hasOther)) {
        mappedMlfbSet.add(clean)
      }
    })

    if (items.value.length > 0) {
      let count = 0
      items.value.forEach(item => {
        if (mappedMlfbSet.has(cleanPartNumber(item.item_no))) count++
      })
      return count
    }
    return mappedMlfbSet.size
  })

  return {
    items,
    customRules,
    mappedCount,
    isLoading,
    isSyncing,
    syncProgress,
    lastSyncTime,
    lastSyncFormatted,
    categoryCounts,
    loadCache,
    fetchItems,
    fetchCustomRules,
    saveCustomRule,
    updateCustomRule,
    upsertRuleBySiemensMlfb,
    deleteCustomRule,
    importShopProducts,
    syncFromShopApi,
    syncItems
  }
}
