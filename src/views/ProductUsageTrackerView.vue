<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { 
  Search, ArrowRight, CheckCircle2, Clock, Truck, 
  FileText, RefreshCw, Share2, 
  Tag, Loader2, Package, ShoppingCart, X, PackageSearch
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

// --- SEARCH & INPUT STATE ---
const searchInput = ref(String(route.query.sku || route.query.q || '').trim())
const activeSku = ref(String(route.query.sku || route.query.q || '').trim())
const isSearching = ref(false)
const hasSearched = ref(false)

// Recent searches from localStorage (Max 5)
const recentSearches = ref([])

// --- RESULTS STATE ---
const shipmentsResults = ref([])
const poItemsResults = ref([])
const riItemsResults = ref([])
const doItemsResults = ref([])
const catalogItem = ref(null)
const stockAvailability = ref(null)
const soDetailsMap = ref({}) // map of so_id/so_number -> Accurate SO details
const isFetchingDetails = ref(false)

// Copied feedback
const isCopied = ref({})

// --- HELPER: Invoke Edge Function with Retry ---
const invokeEdgeFunctionWithRetry = async (functionName, options, maxRetries = 2) => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await supabase.functions.invoke(functionName, options)
      if (res.error) throw res.error
      return res
    } catch (err) {
      if (attempt === maxRetries) return { data: null, error: err }
      const delay = 800 * Math.pow(2, attempt)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  return { data: null, error: new Error('Max retries exceeded') }
}

// --- LOCAL STORAGE RECENT SEARCHES ---
const loadRecentSearches = () => {
  try {
    const saved = localStorage.getItem('hso_product_tracker_recent')
    if (saved) {
      const parsed = JSON.parse(saved)
      recentSearches.value = Array.isArray(parsed) ? parsed.slice(0, 5) : []
    }
  } catch (e) {
    recentSearches.value = []
  }
}

const saveRecentSearch = (sku) => {
  if (!sku) return
  try {
    let list = recentSearches.value.filter(s => s.toLowerCase() !== sku.toLowerCase())
    list.unshift(sku)
    if (list.length > 5) list = list.slice(0, 5)
    recentSearches.value = list
    localStorage.setItem('hso_product_tracker_recent', JSON.stringify(list))
  } catch (e) {
    console.warn('Failed saving recent search:', e)
  }
}

const removeRecentSearch = (sku, event) => {
  if (event) event.stopPropagation()
  recentSearches.value = recentSearches.value.filter(s => s.toLowerCase() !== sku.toLowerCase())
  try {
    localStorage.setItem('hso_product_tracker_recent', JSON.stringify(recentSearches.value))
  } catch (e) {}
}

// Helper: Check if string matches HSO format (HSO/yy/mm/numbering)
const isValidHsoNumber = (number) => {
  if (!number || typeof number !== 'string') return false
  return /^HSO\/\d{2}\/\d{2}\/\d+/i.test(number.trim())
}

// Helper: Extract project from description or SQ
const extractProjectName = (soObj) => {
  if (!soObj) return '-'
  const desc = soObj.description || soObj.notes || ''
  
  // Format: Proyek: {nama} or [PROYEK] {nama}
  const match = desc.match(/(?:proyek|project)\s*[:=]\s*([^\n\r;]+)/i)
  if (match && match[1]) return match[1].trim()

  const bracketMatch = desc.match(/\[([^\]]+)\]/)
  if (bracketMatch && bracketMatch[1] && !bracketMatch[1].toUpperCase().startsWith('HSO')) {
    return bracketMatch[1].trim()
  }

  return '-'
}

// --- MAIN SEARCH FUNCTION (DEEP SCAN) ---
const executeSearch = async (skuToSearch) => {
  const query = (skuToSearch || searchInput.value || '').trim()
  if (!query) return

  activeSku.value = query
  searchInput.value = query
  isSearching.value = true
  hasSearched.value = true
  saveRecentSearch(query)

  // Update URL query without full reload
  router.replace({ query: { sku: query } })

  // Reset results
  shipmentsResults.value = []
  poItemsResults.value = []
  riItemsResults.value = []
  doItemsResults.value = []
  catalogItem.value = null
  stockAvailability.value = null
  soDetailsMap.value = {}

  try {
    // 1. Fetch in parallel: Supabase tables + Live Accurate Stock & SO Scan
    const [shipRes, poRes, riRes, doRes, catRes, stockAvailRes] = await Promise.all([
      supabase
        .from('shipments')
        .select('*')
        .ilike('item_code', `%${query}%`)
        .order('created_at', { ascending: false }),

      supabase
        .from('accurate_purchase_order_items')
        .select(`
          id, po_id, item_code, item_name, quantity, unit_name, detail_notes, hso_number,
          po:accurate_purchase_orders(id, number, vendor_name, trans_date, status_name)
        `)
        .ilike('item_code', `%${query}%`),

      supabase
        .from('accurate_receive_item_items')
        .select(`
          id, receive_item_id, item_code, item_name, quantity, unit_name, detail_notes, hso_number,
          ri:accurate_receive_items(id, number, vendor_name, trans_date, status_name, po_number)
        `)
        .ilike('item_code', `%${query}%`),

      supabase
        .from('accurate_delivery_order_items')
        .select(`
          id, delivery_order_id, item_code, item_name, quantity, unit_name,
          do:accurate_delivery_orders(id, number, customer_name, trans_date, status_name)
        `)
        .ilike('item_code', `%${query}%`),

      supabase
        .from('accurate_items')
        .select('*')
        .ilike('item_no', `%${query}%`)
        .maybeSingle(),

      invokeEdgeFunctionWithRetry('get-stock-availability', {
        body: { item_code: query }
      }).catch(err => {
        console.warn('get-stock-availability error:', err)
        return { data: null }
      })
    ])

    shipmentsResults.value = shipRes.data || []
    poItemsResults.value = poRes.data || []
    riItemsResults.value = riRes.data || []
    doItemsResults.value = doRes.data || []
    catalogItem.value = catRes.data || null

    // Process live Accurate stock & references
    if (stockAvailRes?.data?.s && stockAvailRes.data.data) {
      stockAvailability.value = stockAvailRes.data.data
      if (stockAvailRes.data.data.item_name && !catalogItem.value) {
        catalogItem.value = {
          item_name: stockAvailRes.data.data.item_name,
          item_no: query
        }
      }
    }

    // Identify all unique SO IDs from shipments
    const uniqueSoIds = Array.from(new Set(
      shipmentsResults.value.map(s => String(s.so_id || '')).filter(Boolean)
    ))

    // Resolve SO details in background
    if (uniqueSoIds.length > 0) {
      resolveSoDetails(uniqueSoIds)
    }

  } catch (err) {
    console.error('[ProductTracker] Deep search error:', err)
  } finally {
    isSearching.value = false
  }
}

// Background SO resolver
const resolveSoDetails = async (soIds) => {
  isFetchingDetails.value = true

  // Check localStorage cache first
  try {
    const cachedSos = localStorage.getItem('accurate_sales_orders')
    if (cachedSos) {
      const parsed = JSON.parse(cachedSos)
      if (Array.isArray(parsed)) {
        parsed.forEach(so => {
          if (so.id && soIds.includes(String(so.id))) {
            soDetailsMap.value[String(so.id)] = {
              id: so.id,
              number: so.number || `HSO ${so.id}`,
              customer_name: so.customer?.name || so.customer_name || '-',
              trans_date: so.transDate || so.trans_date || '-',
              status_name: so.statusName || so.status_name || '-',
              project_name: extractProjectName(so),
              percent_shipped: so.percentShipped || 0
            }
          }
        })
      }
    }
  } catch (e) {
    console.warn('Error reading SO cache:', e)
  }

  // Find remaining SOs that need detail fetching
  const missingSoIds = soIds.filter(id => !soDetailsMap.value[id])
  
  if (missingSoIds.length > 0) {
    const promises = missingSoIds.slice(0, 10).map(async (soId) => {
      try {
        const { data } = await invokeEdgeFunctionWithRetry('accurate-detail-so', {
          body: { id: soId }
        })
        if (data && data.s && data.d) {
          const d = data.d
          soDetailsMap.value[soId] = {
            id: d.id,
            number: d.number || `HSO ${soId}`,
            customer_name: d.customer?.name || '-',
            trans_date: d.transDate || '-',
            status_name: d.statusName || '-',
            project_name: extractProjectName(d),
            percent_shipped: d.percentShipped || 0,
            detailItem: d.detailItem || []
          }
        }
      } catch (err) {
        console.warn(`Failed fetching detail for SO ${soId}:`, err)
      }
    })

    await Promise.all(promises)
  }

  isFetchingDetails.value = false
}

// --- COMPUTED DATA AGGREGATION ---

// 1. Grouped HSO Usage (Deep Scan Merging Accurate Live + Logistics)
const groupedHsoList = computed(() => {
  const map = {}

  // A. From Accurate Live References (All active SOs detected directly from Accurate Online)
  if (stockAvailability.value?.references) {
    stockAvailability.value.references
      .filter(r => r.type === 'SO' && isValidHsoNumber(r.no_referensi))
      .forEach(r => {
        const soNum = r.no_referensi.trim()
        map[soNum] = {
          so_id: '',
          so_number: soNum,
          customer_name: r.nama_referensi || '-',
          trans_date: r.tgl_estimasi || '-',
          status_name: 'Sedang Berjalan',
          project_name: '-',
          qty_order: r.dijual || 0,
          hpos: new Set(),
          shipments: []
        }
      })
  }

  // B. From shipments table (Logistics DB)
  shipmentsResults.value.forEach(ship => {
    const soKey = String(ship.so_id || '')
    const resolvedNumber = soDetailsMap.value[soKey]?.number || ship.so_number || ''

    let targetKey = resolvedNumber && isValidHsoNumber(resolvedNumber) ? resolvedNumber : null
    
    if (!targetKey && soKey) {
      const existing = Object.values(map).find(m => m.so_id === soKey)
      if (existing) targetKey = existing.so_number
    }

    if (targetKey) {
      if (!map[targetKey]) {
        map[targetKey] = {
          so_id: soKey,
          so_number: targetKey,
          customer_name: soDetailsMap.value[soKey]?.customer_name || '-',
          trans_date: soDetailsMap.value[soKey]?.trans_date || '-',
          status_name: soDetailsMap.value[soKey]?.status_name || 'Sedang Diproses',
          project_name: soDetailsMap.value[soKey]?.project_name || '-',
          qty_order: 0,
          hpos: new Set(),
          shipments: []
        }
      } else {
        if (soKey && !map[targetKey].so_id) map[targetKey].so_id = soKey
        if (soDetailsMap.value[soKey]?.customer_name && map[targetKey].customer_name === '-') {
          map[targetKey].customer_name = soDetailsMap.value[soKey].customer_name
        }
        if (soDetailsMap.value[soKey]?.status_name) {
          map[targetKey].status_name = soDetailsMap.value[soKey].status_name
        }
        if (soDetailsMap.value[soKey]?.project_name && map[targetKey].project_name === '-') {
          map[targetKey].project_name = soDetailsMap.value[soKey].project_name
        }
      }

      if (ship.hpo_number) {
        ship.hpo_number.split(',').forEach(h => {
          if (h.trim()) map[targetKey].hpos.add(h.trim())
        })
      }
      map[targetKey].shipments.push(ship)
    }
  })

  // C. From PO Items with HSO reference
  poItemsResults.value.forEach(poItem => {
    if (poItem.hso_number && isValidHsoNumber(poItem.hso_number)) {
      const hsoNum = poItem.hso_number.trim()
      const existing = map[hsoNum] || Object.values(map).find(m => m.so_number.toLowerCase().includes(hsoNum.toLowerCase()))
      if (existing && poItem.po?.number) {
        existing.hpos.add(poItem.po.number)
      }
    }
  })

  // Strict Filter: Only include valid HSO numbering (HSO/yy/mm/...)
  return Object.values(map)
    .filter(entry => isValidHsoNumber(entry.so_number))
    .map(entry => ({
      ...entry,
      hpo_list: Array.from(entry.hpos).filter(Boolean),
      latest_shipment_status: entry.shipments[0]?.current_status || (entry.hpos.size > 0 ? 'Pengadaan Berjalan' : 'Menunggu Alokasi HPO'),
      exwork_date: entry.shipments[0]?.exwork_date,
      eta_date: entry.shipments[0]?.eta_date,
      dunex_date: entry.shipments[0]?.dunex_date,
      hokiindo_date: entry.shipments[0]?.hokiindo_date
    }))
})

// 2. Grouped HPO Procurement (Deep Scan Merging Accurate Live + Logistics)
const groupedHpoList = computed(() => {
  const map = {}

  // A. From Accurate Live References
  if (stockAvailability.value?.references) {
    stockAvailability.value.references
      .filter(r => r.type === 'PO')
      .forEach(r => {
        const hpoNum = r.no_referensi.trim()
        map[hpoNum] = {
          hpo_number: hpoNum,
          vendor_name: r.nama_referensi || 'PT. SIEMENS INDONESIA',
          trans_date: r.tgl_estimasi || '-',
          status_name: 'Dipesan',
          linked_hsos: new Set(),
          quantity: r.dipesan || 0,
          unit_name: stockAvailability.value?.unit_name || 'PCS',
          shipments: []
        }
      })
  }

  // B. From shipments table
  shipmentsResults.value.forEach(ship => {
    if (!ship.hpo_number) return
    const hpos = ship.hpo_number.split(',').map(h => h.trim()).filter(Boolean)
    
    hpos.forEach(hpoNum => {
      if (!map[hpoNum]) {
        map[hpoNum] = {
          hpo_number: hpoNum,
          vendor_name: ship.vendor_name || 'SIEMENS / Vendor',
          trans_date: ship.status_date || '-',
          status_name: ship.current_status || '-',
          linked_hsos: new Set(),
          quantity: 0,
          unit_name: 'PCS',
          exwork_date: ship.exwork_date,
          eta_date: ship.eta_date,
          dunex_date: ship.dunex_date,
          hokiindo_date: ship.hokiindo_date,
          exwork_waiting: ship.exwork_waiting,
          current_status: ship.current_status
        }
      } else {
        if (!map[hpoNum].current_status && ship.current_status) {
          map[hpoNum].current_status = ship.current_status
        }
        if (ship.exwork_date) map[hpoNum].exwork_date = ship.exwork_date
        if (ship.eta_date) map[hpoNum].eta_date = ship.eta_date
        if (ship.dunex_date) map[hpoNum].dunex_date = ship.dunex_date
        if (ship.hokiindo_date) map[hpoNum].hokiindo_date = ship.hokiindo_date
      }

      if (ship.so_id) {
        const soNum = soDetailsMap.value[String(ship.so_id)]?.number || ship.so_number || ''
        if (isValidHsoNumber(soNum)) {
          map[hpoNum].linked_hsos.add(soNum)
        }
      }
    })
  })

  // C. From PO Items table
  poItemsResults.value.forEach(item => {
    const hpoNum = item.po?.number
    if (!hpoNum) return

    if (!map[hpoNum]) {
      map[hpoNum] = {
        hpo_number: hpoNum,
        vendor_name: item.po.vendor_name || '-',
        trans_date: item.po.trans_date || '-',
        status_name: item.po.status_name || '-',
        linked_hsos: new Set(),
        quantity: item.quantity,
        unit_name: item.unit_name || 'PCS'
      }
    } else {
      if (item.quantity && !map[hpoNum].quantity) map[hpoNum].quantity = item.quantity
      if (item.unit_name) map[hpoNum].unit_name = item.unit_name
    }

    if (item.hso_number && isValidHsoNumber(item.hso_number)) {
      map[hpoNum].linked_hsos.add(item.hso_number.trim())
    }
  })

  return Object.values(map).map(entry => ({
    ...entry,
    hso_list: Array.from(entry.linked_hsos).filter(Boolean)
  }))
})

// Total summary counts
const totalHsoCount = computed(() => groupedHsoList.value.length)
const totalHpoCount = computed(() => groupedHpoList.value.length)
const totalRiCount = computed(() => riItemsResults.value.length)
const totalDoCount = computed(() => doItemsResults.value.length)

// --- COPY & SHARE RESUME ---
const copyToClipboard = (text, key) => {
  if (!text) return
  navigator.clipboard.writeText(text)
  isCopied.value[key] = true
  setTimeout(() => { isCopied.value[key] = false }, 2000)
}

const copyResumeText = () => {
  if (!activeSku.value) return
  
  let text = `📦 *RESUME ALOKASI PRODUK: ${activeSku.value}*\n`
  if (catalogItem.value?.item_name) {
    text += `Nama: ${catalogItem.value.item_name}\n`
  }
  if (stockAvailability.value) {
    text += `Stok Gudang: ${stockAvailability.value.stock_warehouse} | Dipesan: ${stockAvailability.value.stock_ordered} | Dijual: ${stockAvailability.value.stock_sold} | ATS: ${stockAvailability.value.stock_available}\n`
  }
  text += `----------------------------------------\n`
  text += `🏢 *Digunakan di ${totalHsoCount.value} HSO:*\n`

  if (groupedHsoList.value.length === 0) {
    text += `(Belum ada data HSO terhubung)\n`
  } else {
    groupedHsoList.value.forEach((hso, idx) => {
      text += `${idx + 1}. *${hso.so_number}* - ${hso.customer_name}\n`
      if (hso.qty_order) text += `   Qty Dipesan: ${hso.qty_order} Pcs\n`
      if (hso.project_name && hso.project_name !== '-') text += `   Proyek: ${hso.project_name}\n`
      text += `   Status: ${hso.status_name} | Logistik: ${hso.latest_shipment_status}\n`
      if (hso.hpo_list.length > 0) {
        text += `   HPO: ${hso.hpo_list.join(', ')}\n`
      }
    })
  }

  text += `\n📦 *Pengadaan di ${totalHpoCount.value} HPO:*\n`
  if (groupedHpoList.value.length === 0) {
    text += `(Belum ada data HPO terhubung)\n`
  } else {
    groupedHpoList.value.forEach((hpo, idx) => {
      text += `${idx + 1}. *${hpo.hpo_number}* (${hpo.vendor_name})\n`
      if (hpo.quantity) text += `   Qty Pengadaan: ${hpo.quantity} ${hpo.unit_name || 'PCS'}\n`
      text += `   Status: ${hpo.current_status || hpo.status_name}\n`
      if (hpo.hso_list.length > 0) text += `   Untuk HSO: ${hpo.hso_list.join(', ')}\n`
      if (hpo.hokiindo_date) text += `   Tiba Hokiindo: ${hpo.hokiindo_date}\n`
      else if (hpo.exwork_date) text += `   Ex-Works: ${hpo.exwork_date}\n`
    })
  }

  copyToClipboard(text, 'resume_wa')
}

// Status Color Helper (Clean Minimalist Monochrome)
const getStatusBadge = (status) => {
  const s = String(status || '').toLowerCase()
  if (s.includes('already in hokiindo') || s.includes('tiba') || s.includes('ditutup') || s.includes('terproses')) {
    return 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 font-medium'
  }
  if (s.includes('dunex') || s.includes('sebagian')) {
    return 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 font-medium'
  }
  if (s.includes('ex-work') || s.includes('exwork')) {
    return 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 font-medium'
  }
  return 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/80 dark:text-slate-400 dark:border-slate-700 font-medium'
}

onMounted(() => {
  loadRecentSearches()
  if (searchInput.value) {
    executeSearch(searchInput.value)
  }
})

watch(() => route.query.sku, (newSku) => {
  if (newSku && newSku !== activeSku.value) {
    searchInput.value = newSku
    executeSearch(newSku)
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-50/50 dark:bg-[#0f172a] pb-24 font-sans transition-colors duration-300">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">

      <!-- TOP BAR / HEADER -->
      <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-sm space-y-5">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div class="space-y-1">
            <h1 class="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Detail Penggunaan dan Alokasi Produk
            </h1>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
              Cek alokasi produk (Part Number/SKU) ke dalam <strong>seluruh HSO Penjualan</strong> dan <strong>status pengadaan HPO ke vendor</strong> secara mendalam dan akurat.
            </p>
          </div>

          <div v-if="hasSearched && (groupedHsoList.length > 0 || groupedHpoList.length > 0)" class="flex items-center gap-2">
            <Button
              @click="copyResumeText"
              variant="outline"
              size="sm"
              class="h-9 px-3.5 text-xs font-semibold rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <component :is="isCopied['resume_wa'] ? CheckCircle2 : Share2" class="w-4 h-4 text-slate-700 dark:text-slate-300" />
              <span>{{ isCopied['resume_wa'] ? 'Resume Disalin!' : 'Salin Ringkasan (WA)' }}</span>
            </Button>

            <Button
              @click="executeSearch(activeSku)"
              variant="outline"
              size="sm"
              class="h-9 px-3 text-xs font-semibold rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
              title="Refresh & Scan Ulang"
            >
              <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isSearching }" />
            </Button>
          </div>
        </div>

        <!-- SEARCH INPUT BOX -->
        <div class="space-y-2.5">
          <form @submit.prevent="executeSearch(searchInput)" class="w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div class="relative flex-1">
              <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                <Search class="w-5 h-5" />
              </div>
              <input
                v-model="searchInput"
                type="text"
                placeholder="Masukkan Part Number / SKU produk (contoh: 3VJ1192-7DB32-0AA0, 3WT9816-1CD00)..."
                class="w-full pl-11 pr-10 py-3 text-sm sm:text-base font-mono font-medium rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-400 focus:border-slate-500 shadow-xs transition-all"
              />
              <button
                v-if="searchInput"
                type="button"
                @click="searchInput = ''; activeSku = ''; hasSearched = false; stockAvailability = null"
                class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                title="Hapus input"
              >
                <X class="w-4 h-4" />
              </button>
            </div>

            <Button 
              type="submit" 
              :disabled="isSearching || !searchInput.trim()"
              class="bg-slate-900 hover:bg-black text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 font-bold text-xs sm:text-sm h-11 px-5 rounded-xl shadow-xs cursor-pointer shrink-0 flex items-center justify-center gap-2 transition-all"
            >
              <Loader2 v-if="isSearching" class="w-4 h-4 animate-spin" />
              <Search v-else class="w-4 h-4" />
              <span>Cek Produk</span>
            </Button>
          </form>

          <!-- RECENT SEARCHES -->
          <div v-if="recentSearches.length > 0" class="flex flex-wrap items-center gap-2 pt-0.5">
            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Clock class="w-3 h-3 text-slate-400" /> Riwayat:
            </span>
            <div
              v-for="sku in recentSearches.slice(0, 5)"
              :key="sku"
              @click="executeSearch(sku)"
              class="group inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-mono rounded-md bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200 border border-slate-200/60 dark:border-slate-800 transition-all cursor-pointer"
            >
              <span>{{ sku }}</span>
              <button 
                @click="removeRecentSearch(sku, $event)" 
                class="opacity-0 group-hover:opacity-100 hover:text-red-500 p-0.5 rounded transition-opacity"
                title="Hapus dari riwayat"
              >
                <X class="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- DEEP SCANNING LOADER -->
      <div v-if="isSearching" class="flex flex-col items-center justify-center p-14 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm space-y-3.5">
        <Loader2 class="w-9 h-9 animate-spin text-slate-800 dark:text-slate-200" />
        <div class="text-center space-y-1">
          <p class="text-sm font-bold text-slate-900 dark:text-white">Memindai Alokasi Produk "{{ activeSku }}" Secara Mendalam...</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 max-w-md">
            Memeriksa saldo fisik gudang, memindai seluruh HSO Penjualan aktif, dan status pengadaan HPO langsung dari Accurate Online & Logistik.
          </p>
        </div>
      </div>

      <!-- SEARCH RESULTS -->
      <div v-else-if="hasSearched" class="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
        
        <!-- PRODUCT MASTER & ACCURATE STOCK AVAILABILITY BANNER -->
        <div v-if="stockAvailability" class="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs space-y-4">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-3">
            <div>
              <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Informasi Inventori & Saldo Produk (Accurate Online Real-Time)</div>
              <div class="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                {{ stockAvailability.item_name || catalogItem?.item_name || activeSku }}
              </div>
            </div>
            <div class="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-700/60 px-2.5 py-1 rounded-lg self-start md:self-auto">
              SKU: {{ activeSku }}
            </div>
          </div>

          <!-- Stock Balance Metric Grid -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <!-- Stok Fisik Gudang -->
            <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/70 space-y-1">
              <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">🏢 Stok Fisik Gudang</div>
              <div class="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {{ stockAvailability.stock_warehouse ?? 0 }} <span class="text-xs font-normal text-slate-400">{{ stockAvailability.unit_name || 'Pcs' }}</span>
              </div>
            </div>

            <!-- Sedang Dipesan Vendor (HPO) -->
            <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/70 space-y-1">
              <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">📦 Sedang Dipesan (HPO)</div>
              <div class="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {{ stockAvailability.stock_ordered ?? 0 }} <span class="text-xs font-normal text-slate-400">{{ stockAvailability.unit_name || 'Pcs' }}</span>
              </div>
            </div>

            <!-- Terikat Penjualan (HSO) -->
            <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/70 space-y-1">
              <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">📋 Terikat Penjualan (HSO)</div>
              <div class="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {{ stockAvailability.stock_sold ?? 0 }} <span class="text-xs font-normal text-slate-400">{{ stockAvailability.unit_name || 'Pcs' }}</span>
              </div>
            </div>

            <!-- Available to Sell (ATS) -->
            <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/70 space-y-1">
              <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">✨ Available to Sell (ATS)</div>
              <div class="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {{ stockAvailability.stock_available ?? 0 }} <span class="text-xs font-normal text-slate-400">{{ stockAvailability.unit_name || 'Pcs' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- FALLBACK 4 METRIC CARDS (IF NO LIVE STOCK AVAILABILITY) -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Total HSO -->
          <div class="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center gap-4">
            <div class="p-3 bg-slate-100 dark:bg-slate-700/60 rounded-xl text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
              <FileText class="w-5 h-5" />
            </div>
            <div>
              <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">HSO Menggunakan</div>
              <div class="text-2xl font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {{ totalHsoCount }} <span class="text-xs font-normal text-slate-400">Order</span>
              </div>
            </div>
          </div>

          <!-- Total HPO -->
          <div class="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center gap-4">
            <div class="p-3 bg-slate-100 dark:bg-slate-700/60 rounded-xl text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
              <ShoppingCart class="w-5 h-5" />
            </div>
            <div>
              <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">HPO Pengadaan</div>
              <div class="text-2xl font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {{ totalHpoCount }} <span class="text-xs font-normal text-slate-400">PO Vendor</span>
              </div>
            </div>
          </div>

          <!-- Penerimaan Barang (RI) -->
          <div class="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center gap-4">
            <div class="p-3 bg-slate-100 dark:bg-slate-700/60 rounded-xl text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
              <Package class="w-5 h-5" />
            </div>
            <div>
              <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Penerimaan Gudang (RI)</div>
              <div class="text-2xl font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {{ totalRiCount }} <span class="text-xs font-normal text-slate-400">Transaksi</span>
              </div>
            </div>
          </div>

          <!-- Pengiriman (DO) -->
          <div class="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center gap-4">
            <div class="p-3 bg-slate-100 dark:bg-slate-700/60 rounded-xl text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
              <Truck class="w-5 h-5" />
            </div>
            <div>
              <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pengiriman Customer (DO)</div>
              <div class="text-2xl font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {{ totalDoCount }} <span class="text-xs font-normal text-slate-400">Surat Jalan</span>
              </div>
            </div>
          </div>
        </div>

        <!-- NO RESULTS FOUND -->
        <div v-if="totalHsoCount === 0 && totalHpoCount === 0 && totalRiCount === 0 && totalDoCount === 0 && !stockAvailability" class="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
          <div class="p-4 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-400">
            <PackageSearch class="w-10 h-10" />
          </div>
          <h3 class="text-base font-bold text-slate-900 dark:text-white">Tidak Ditemukan Penggunaan Produk "{{ activeSku }}"</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 max-w-md">
            Produk ini belum tercatat pada transaksi HSO Penjualan, HPO Pembelian, maupun database pengiriman logistik aktif. Pastikan kode part number sudah sesuai.
          </p>
        </div>

        <!-- RESULTS TABLES -->
        <div v-else class="space-y-6">

          <!-- 1. HSO SALES ORDERS TABLE -->
          <Card class="border border-slate-200/80 dark:border-slate-700/80 shadow-sm rounded-2xl overflow-hidden bg-white dark:bg-slate-800">
            <CardHeader class="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-900/60 px-6 py-4">
              <div class="flex items-center gap-2.5">
                <div class="p-2 bg-slate-100 dark:bg-slate-700/60 rounded-lg text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
                  <FileText class="w-4 h-4"/>
                </div>
                <div>
                  <CardTitle class="text-base font-bold text-slate-900 dark:text-white">Daftar HSO Penjualan (Customer)</CardTitle>
                  <p class="text-xs text-slate-500 dark:text-slate-400">Seluruh pesanan HSO yang membutuhkan produk {{ activeSku }}</p>
                </div>
              </div>
              <Badge variant="outline" class="font-bold text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                {{ groupedHsoList.length }} HSO
              </Badge>
            </CardHeader>
            <CardContent class="p-0">
              <div class="overflow-x-auto">
                <Table>
                  <TableHeader class="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-100 dark:border-slate-700">
                    <TableRow class="hover:bg-transparent">
                      <TableHead class="font-bold text-xs text-slate-500 uppercase tracking-wider py-3.5 px-4 w-[200px]">No. HSO</TableHead>
                      <TableHead class="font-bold text-xs text-slate-500 uppercase tracking-wider py-3.5 px-4 min-w-[220px]">Customer & Proyek</TableHead>
                      <TableHead class="font-bold text-xs text-slate-500 uppercase tracking-wider py-3.5 px-4 hidden md:table-cell w-[140px]">Tanggal & Qty</TableHead>
                      <TableHead class="font-bold text-xs text-slate-500 uppercase tracking-wider py-3.5 px-4 min-w-[200px]">HPO Terkait & Status Logistik</TableHead>
                      <TableHead class="text-right font-bold text-xs text-slate-500 uppercase tracking-wider py-3.5 px-4 w-[120px]">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow 
                      v-for="(hso, idx) in groupedHsoList" 
                      :key="hso.so_number || idx" 
                      class="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors border-b border-slate-100 dark:border-slate-700/60 last:border-0"
                    >
                      <!-- No HSO -->
                      <TableCell class="py-4 px-4 align-top">
                        <div class="font-bold font-sans text-sm text-slate-900 dark:text-white">
                          {{ hso.so_number }}
                        </div>
                      </TableCell>

                      <!-- Customer & Project -->
                      <TableCell class="py-4 px-4 align-top">
                        <div class="space-y-1">
                          <div class="font-bold text-xs text-slate-900 dark:text-slate-100 leading-snug">
                            {{ hso.customer_name }}
                          </div>
                          <div v-if="hso.project_name && hso.project_name !== '-'" class="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Tag class="w-3 h-3 text-slate-400 shrink-0" />
                            <span class="truncate max-w-[250px]" :title="hso.project_name">Proyek: {{ hso.project_name }}</span>
                          </div>
                        </div>
                      </TableCell>

                      <!-- Date & Qty -->
                      <TableCell class="py-4 px-4 align-top hidden md:table-cell">
                        <div class="space-y-1">
                          <div class="text-xs text-slate-600 dark:text-slate-400 font-medium">{{ hso.trans_date }}</div>
                          <div v-if="hso.qty_order" class="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                            Dipesan: {{ hso.qty_order }} Pcs
                          </div>
                        </div>
                      </TableCell>

                      <!-- Linked HPOs & Logistics Status -->
                      <TableCell class="py-4 px-4 align-top">
                        <div class="space-y-1.5">
                          <!-- HPOs list -->
                          <div v-if="hso.hpo_list.length > 0" class="flex flex-wrap items-center gap-1">
                            <Badge 
                              v-for="hpo in hso.hpo_list" 
                              :key="hpo"
                              @click="router.push(`/purchase-orders/${encodeURIComponent(hpo)}`)"
                              variant="outline"
                              class="text-[11px] font-mono font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-600 cursor-pointer transition-colors"
                              title="Buka Purchase Order Ini"
                            >
                              {{ hpo }}
                            </Badge>
                          </div>
                          <span v-else class="text-xs text-slate-400 italic">Belum ada link HPO</span>

                          <!-- Logistics Tracking Badge -->
                          <div class="pt-0.5">
                            <Badge variant="outline" class="text-[10px] font-medium px-2 py-0.5 border" :class="getStatusBadge(hso.latest_shipment_status)">
                              🚚 {{ hso.latest_shipment_status }}
                            </Badge>
                            <div v-if="hso.hokiindo_date" class="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                              Tiba di Hokiindo: {{ hso.hokiindo_date }}
                            </div>
                            <div v-else-if="hso.exwork_date" class="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                              Ex-Works: {{ hso.exwork_date }}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <!-- Action Button -->
                      <TableCell class="py-4 px-4 align-top text-right whitespace-nowrap">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          class="h-8 px-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white gap-1 cursor-pointer"
                          @click="router.push(`/sales-orders/${hso.so_number.replace(/\//g, '-')}?search=${encodeURIComponent(activeSku)}&highlight=${encodeURIComponent(activeSku)}`)"
                          title="Buka Detail HSO"
                        >
                          <span>Buka HSO</span>
                          <ArrowRight class="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <!-- 2. HPO PURCHASE ORDERS TABLE -->
          <Card class="border border-slate-200/80 dark:border-slate-700/80 shadow-sm rounded-2xl overflow-hidden bg-white dark:bg-slate-800">
            <CardHeader class="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-900/60 px-6 py-4">
              <div class="flex items-center gap-2.5">
                <div class="p-2 bg-slate-100 dark:bg-slate-700/60 rounded-lg text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
                  <ShoppingCart class="w-4 h-4"/>
                </div>
                <div>
                  <CardTitle class="text-base font-bold text-slate-900 dark:text-white">Daftar HPO Pengadaan (Vendor)</CardTitle>
                  <p class="text-xs text-slate-500 dark:text-slate-400">Seluruh HPO pemesanan ke vendor untuk produk {{ activeSku }}</p>
                </div>
              </div>
              <Badge variant="outline" class="font-bold text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                {{ groupedHpoList.length }} HPO
              </Badge>
            </CardHeader>
            <CardContent class="p-0">
              <div class="overflow-x-auto">
                <Table>
                  <TableHeader class="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-100 dark:border-slate-700">
                    <TableRow class="hover:bg-transparent">
                      <TableHead class="font-bold text-xs text-slate-500 uppercase tracking-wider py-3.5 px-4 w-[220px]">No. HPO</TableHead>
                      <TableHead class="font-bold text-xs text-slate-500 uppercase tracking-wider py-3.5 px-4 min-w-[200px]">Vendor / Supplier</TableHead>
                      <TableHead class="font-bold text-xs text-slate-500 uppercase tracking-wider py-3.5 px-4 min-w-[220px]">Alokasi Untuk HSO</TableHead>
                      <TableHead class="font-bold text-xs text-slate-500 uppercase tracking-wider py-3.5 px-4 min-w-[180px]">Status Logistik</TableHead>
                      <TableHead class="text-right font-bold text-xs text-slate-500 uppercase tracking-wider py-3.5 px-4 w-[120px]">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow 
                      v-for="(hpo, idx) in groupedHpoList" 
                      :key="hpo.hpo_number || idx" 
                      class="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors border-b border-slate-100 dark:border-slate-700/60 last:border-0"
                    >
                      <!-- No HPO -->
                      <TableCell class="py-4 px-4 align-top">
                        <div class="space-y-1">
                          <div class="font-bold font-mono text-sm text-slate-900 dark:text-white">
                            {{ hpo.hpo_number }}
                          </div>
                          <div v-if="hpo.quantity" class="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            Qty: {{ hpo.quantity }} {{ hpo.unit_name || 'PCS' }}
                          </div>
                        </div>
                      </TableCell>

                      <!-- Vendor -->
                      <TableCell class="py-4 px-4 align-top">
                        <div class="space-y-1">
                          <div class="font-bold text-xs text-slate-900 dark:text-slate-100">
                            {{ hpo.vendor_name }}
                          </div>
                          <div class="text-[11px] text-slate-400">{{ hpo.trans_date }}</div>
                        </div>
                      </TableCell>

                      <!-- Linked HSO -->
                      <TableCell class="py-4 px-4 align-top">
                        <div v-if="hpo.hso_list.length > 0" class="flex flex-wrap items-center gap-1">
                          <Badge 
                            v-for="hso in hpo.hso_list" 
                            :key="hso"
                            @click="router.push(`/sales-orders/${hso.replace(/\//g, '-')}?search=${encodeURIComponent(activeSku)}&highlight=${encodeURIComponent(activeSku)}`)"
                            variant="outline"
                            class="text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-600 cursor-pointer transition-colors"
                            title="Buka HSO Ini"
                          >
                            {{ hso }}
                          </Badge>
                        </div>
                        <span v-else class="text-xs text-slate-400 italic">Umum / Tanpa HSO spesifik</span>
                      </TableCell>

                      <!-- Logistics Status & Schedule -->
                      <TableCell class="py-4 px-4 align-top">
                        <div class="space-y-1">
                          <Badge variant="outline" class="text-[10px] font-medium px-2 py-0.5 border" :class="getStatusBadge(hpo.current_status || hpo.status_name)">
                            {{ hpo.current_status || hpo.status_name }}
                          </Badge>
                          <div v-if="hpo.hokiindo_date" class="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                            Tiba di Hokiindo: {{ hpo.hokiindo_date }}
                          </div>
                          <div v-else-if="hpo.dunex_date" class="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                            Tiba di Dunex: {{ hpo.dunex_date }}
                          </div>
                          <div v-else-if="hpo.exwork_date" class="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                            Ex-Works: {{ hpo.exwork_date }}
                          </div>
                        </div>
                      </TableCell>

                      <!-- Action Button -->
                      <TableCell class="py-4 px-4 align-top text-right whitespace-nowrap">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          class="h-8 px-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white gap-1 cursor-pointer"
                          @click="router.push(`/purchase-orders/${encodeURIComponent(hpo.hpo_number)}`)"
                          title="Buka Detail HPO"
                        >
                          <span>Buka HPO</span>
                          <ArrowRight class="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <!-- 3. RI (RECEIVE ITEMS) & DO (DELIVERY ORDERS) SECTION -->
          <div v-if="riItemsResults.length > 0 || doItemsResults.length > 0" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <!-- Penerimaan Barang (RI) -->
            <Card v-if="riItemsResults.length > 0" class="border border-slate-200/80 dark:border-slate-700/80 shadow-sm rounded-2xl overflow-hidden bg-white dark:bg-slate-800">
              <CardHeader class="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-900/60 px-5 py-3.5">
                <div class="flex items-center gap-2">
                  <Package class="w-4 h-4 text-slate-700 dark:text-slate-300"/>
                  <CardTitle class="text-sm font-bold text-slate-900 dark:text-white">Penerimaan Barang (RI)</CardTitle>
                </div>
                <Badge variant="outline" class="font-bold text-[11px] text-slate-700 dark:text-slate-300">{{ riItemsResults.length }} Bukti</Badge>
              </CardHeader>
              <CardContent class="p-0">
                <div class="divide-y divide-slate-100 dark:divide-slate-700">
                  <div 
                    v-for="riItem in riItemsResults" 
                    :key="riItem.id"
                    @click="router.push(`/receive-items/${riItem.receive_item_id || riItem.ri?.id}`)"
                    class="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div class="space-y-0.5 min-w-0">
                      <div class="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{{ riItem.ri?.number || 'RI' }}</span>
                        <span class="text-slate-400 font-normal">&bull; {{ riItem.ri?.trans_date }}</span>
                      </div>
                      <p class="text-[11px] text-slate-500 truncate">Vendor: {{ riItem.ri?.vendor_name }}</p>
                      <div v-if="riItem.detail_notes" class="text-[11px] text-slate-600 dark:text-slate-400 italic">
                        Catatan: {{ riItem.detail_notes }}
                      </div>
                    </div>
                    <div class="text-right shrink-0">
                      <div class="font-bold text-sm text-slate-900 dark:text-white">{{ riItem.quantity }} {{ riItem.unit_name || 'PCS' }}</div>
                      <div class="text-[10px] text-slate-400 font-medium">Diterima</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <!-- Pengiriman Customer (DO) -->
            <Card v-if="doItemsResults.length > 0" class="border border-slate-200/80 dark:border-slate-700/80 shadow-sm rounded-2xl overflow-hidden bg-white dark:bg-slate-800">
              <CardHeader class="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-900/60 px-5 py-3.5">
                <div class="flex items-center gap-2">
                  <Truck class="w-4 h-4 text-slate-700 dark:text-slate-300"/>
                  <CardTitle class="text-sm font-bold text-slate-900 dark:text-white">Pengiriman Customer (DO)</CardTitle>
                </div>
                <Badge variant="outline" class="font-bold text-[11px] text-slate-700 dark:text-slate-300">{{ doItemsResults.length }} Surat Jalan</Badge>
              </CardHeader>
              <CardContent class="p-0">
                <div class="divide-y divide-slate-100 dark:divide-slate-700">
                  <div 
                    v-for="doItem in doItemsResults" 
                    :key="doItem.id"
                    @click="router.push(`/delivery-orders/${doItem.delivery_order_id || doItem.do?.id}`)"
                    class="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div class="space-y-0.5 min-w-0">
                      <div class="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{{ doItem.do?.number || 'DO' }}</span>
                        <span class="text-slate-400 font-normal">&bull; {{ doItem.do?.trans_date }}</span>
                      </div>
                      <p class="text-[11px] text-slate-500 truncate">Customer: {{ doItem.do?.customer_name }}</p>
                    </div>
                    <div class="text-right shrink-0">
                      <div class="font-bold text-sm text-slate-900 dark:text-white">{{ doItem.quantity }} {{ doItem.unit_name || 'PCS' }}</div>
                      <div class="text-[10px] text-slate-400 font-medium">Terkirim</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

        </div>

      </div>

    </div>
  </div>
</template>
