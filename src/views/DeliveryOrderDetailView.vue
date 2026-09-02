<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  AlertTriangle, Calendar, Building2, User, FileText, ArrowLeft,
  Loader2, Package, Truck, MapPin, ExternalLink, ShoppingCart,
  Layers, FolderGit2, Search, RefreshCw, CheckCircle2, Info,
  Copy, Check
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const rawParam = String(route.params.id || '').trim()

// --- STATE ---
const doDetail = ref(null)
const isLoading = ref(true)
const isRefreshing = ref(false)
const errorMessage = ref(null)
const itemSearchQuery = ref('')
const copiedSku = ref(null)

// --- PROJECT PARSING HELPER ---
const extractProjectFromText = (text) => {
  if (!text) return null
  const str = String(text)
  const regex = /pro(?:ject|yek)\s*[:\-]?\s*(.*?)(?=\s*(?:>|status|\n|$))/i
  const match = str.match(regex)
  if (match && match[1] && match[1].trim()) {
    return match[1].replace(/[\s\-]+$/, '').trim()
  }
  return null
}

// --- DATA FETCHING ---
const fetchDetail = async (forceRefresh = false) => {
  if (forceRefresh) {
    isRefreshing.value = true
  } else {
    isLoading.value = true
  }
  errorMessage.value = null

  try {
    let resolvedId = null
    const isNum = /^\d+$/.test(rawParam)

    if (isNum) {
      resolvedId = parseInt(rawParam, 10)
    } else {
      const formatted = rawParam.replace(/-/g, '/')
      const { data: dbHeader } = await supabase
        .from('accurate_delivery_orders')
        .select('id, number')
        .ilike('number', formatted)
        .maybeSingle()

      if (dbHeader) {
        resolvedId = dbHeader.id
      }
    }

    if (!resolvedId) {
      // Fallback: search by param directly
      const { data: fallbackHeader } = await supabase
        .from('accurate_delivery_orders')
        .select('id, number')
        .or(`id.eq.${isNum ? rawParam : 0},number.ilike.%${rawParam}%`)
        .maybeSingle()
      
      if (fallbackHeader) {
        resolvedId = fallbackHeader.id
      }
    }

    if (!resolvedId) {
      throw new Error(`Delivery Order "${rawParam}" tidak ditemukan di database.`)
    }

    // 1. Fetch live detail from Accurate API Edge Function
    let accurateData = null
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke('accurate-detail-so', {
        body: { id: resolvedId, type: 'delivery-order' }
      })
      if (!fnErr && res?.s && res?.d) {
        accurateData = res.d
      }
    } catch (e) {
      console.warn('Accurate Edge Function fetch fallback to DB:', e)
    }

    // 2. Fetch from Supabase DB (Header + Items) as reliable baseline
    const { data: dbHeader, error: headErr } = await supabase
      .from('accurate_delivery_orders')
      .select('*')
      .eq('id', resolvedId)
      .maybeSingle()

    const { data: dbItems, error: itemsErr } = await supabase
      .from('accurate_delivery_order_items')
      .select('*')
      .eq('do_id', resolvedId)
      .order('item_seq', { ascending: true })

    if (headErr && !accurateData) throw headErr

    // Merge accurate live data with DB records
    if (accurateData) {
      const headerDesc = accurateData.description || dbHeader?.description || ''
      let projectExtracted = extractProjectFromText(headerDesc)

      const items = (accurateData.detailItem || []).map((it, idx) => {
        const itemDesc = it.detailNotes || it.notes || ''
        if (!projectExtracted) {
          projectExtracted = extractProjectFromText(itemDesc)
        }
        return {
          id: it.id || idx,
          item_code: it.item?.no || it.itemNo || '-',
          item_name: it.item?.name || it.detailName || '-',
          quantity: it.quantity || 0,
          unit_name: it.itemUnit?.name || it.availableItemUnit?.name || 'Pcs',
          unit_price: it.unitPrice || 0,
          total_price: it.totalPrice || 0,
          detail_notes: it.detailNotes || '',
          hso_number: it.salesOrder?.number || null,
          hso_id: it.salesOrder?.id || null,
          hsq_number: it.salesQuotation?.number || null,
          hsq_id: it.salesQuotation?.id || null,
          customer_po: it.deliveryOrderPoNumber || accurateData.poNumber || null,
          item_seq: it.itemSeq != null ? it.itemSeq : idx
        }
      })

      // Collect all distinct HSOs and HSQs
      const distinctHsos = []
      const distinctHsqs = []
      items.forEach(it => {
        if (it.hso_number && !distinctHsos.some(h => h.number === it.hso_number)) {
          distinctHsos.push({ number: it.hso_number, id: it.hso_id })
        }
        if (it.hsq_number && !distinctHsqs.some(h => h.number === it.hsq_number)) {
          distinctHsqs.push({ number: it.hsq_number, id: it.hsq_id })
        }
      })

      doDetail.value = {
        id: accurateData.id || resolvedId,
        number: accurateData.number || dbHeader?.number,
        trans_date: accurateData.transDate || dbHeader?.trans_date,
        trans_date_view: accurateData.transDateView || null,
        status_name: accurateData.statusName || dbHeader?.status_name || 'Dikirim',
        customer_id: accurateData.customerId || dbHeader?.customer_id,
        customer_name: accurateData.customer?.name || dbHeader?.customer_name || 'No Customer',
        customer_code: accurateData.customer?.customerNo || null,
        po_number: accurateData.poNumber || dbHeader?.po_number || null,
        project: projectExtracted || '-',
        description: headerDesc,
        ship_to: accurateData.toAddress || dbHeader?.ship_to || accurateData.customer?.address || null,
        driver_name: dbHeader?.driver_name || null,
        delivery_printed_time: accurateData.deliveryPrintedTime || null,
        distinct_hsos: distinctHsos,
        distinct_hsqs: distinctHsqs,
        items: items
      }
    } else if (dbHeader) {
      // DB Only Fallback
      let projectExtracted = extractProjectFromText(dbHeader.description || '')
      const items = (dbItems || []).map(it => {
        if (!projectExtracted) {
          projectExtracted = extractProjectFromText(it.detail_notes)
        }
        return {
          id: it.id,
          item_code: it.item_code,
          item_name: it.item_name,
          quantity: it.quantity,
          unit_name: it.unit_name || 'Pcs',
          detail_notes: it.detail_notes,
          hso_number: it.hso_number,
          hsq_number: null,
          item_seq: it.item_seq
        }
      })

      const distinctHsos = []
      items.forEach(it => {
        if (it.hso_number && !distinctHsos.some(h => h.number === it.hso_number)) {
          distinctHsos.push({ number: it.hso_number })
        }
      })

      doDetail.value = {
        id: dbHeader.id,
        number: dbHeader.number,
        trans_date: dbHeader.trans_date,
        status_name: dbHeader.status_name || 'Dikirim',
        customer_id: dbHeader.customer_id,
        customer_name: dbHeader.customer_name || 'No Customer',
        customer_code: null,
        po_number: dbHeader.po_number || null,
        project: projectExtracted || '-',
        description: dbHeader.description || '',
        ship_to: dbHeader.ship_to || null,
        driver_name: dbHeader.driver_name || null,
        distinct_hsos: distinctHsos,
        distinct_hsqs: [],
        items: items
      }
    } else {
      throw new Error('Data Delivery Order tidak dapat ditemukan.')
    }

  } catch (err) {
    console.error('Fetch DO detail error:', err)
    errorMessage.value = err.message || 'Terjadi kesalahan saat memuat data.'
  } finally {
    isLoading.value = false
    isRefreshing.value = false
  }
}

onMounted(() => {
  fetchDetail()
})

// --- FILTERED ITEMS ---
const filteredItems = computed(() => {
  if (!doDetail.value?.items) return []
  const query = itemSearchQuery.value.trim().toLowerCase()
  if (!query) return doDetail.value.items

  return doDetail.value.items.filter(it => {
    const code = String(it.item_code || '').toLowerCase()
    const name = String(it.item_name || '').toLowerCase()
    const notes = String(it.detail_notes || '').toLowerCase()
    const hso = String(it.hso_number || '').toLowerCase()
    const hsq = String(it.hsq_number || '').toLowerCase()
    return code.includes(query) || name.includes(query) || notes.includes(query) || hso.includes(query) || hsq.includes(query)
  })
})

// Total Quantity
const totalQuantity = computed(() => {
  if (!doDetail.value?.items) return 0
  return doDetail.value.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)
})

// --- HELPERS ---
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return isNaN(date.getTime()) ? dateStr : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

const getStatusColor = (status) => {
  switch (status) {
    case 'Dikirim': return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
    case 'Terproses': return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
    case 'Ditutup': return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
    case 'Draf': return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
    default: return 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
  }
}

const formatHsoUrl = (hsoStr) => {
  if (!hsoStr) return '/sales-orders'
  return `/sales-orders/${hsoStr.replace(/\//g, '-')}`
}

const formatHsqUrl = (hsqStr) => {
  if (!hsqStr) return '/hsq'
  return `/hsq/${hsqStr.replace(/\//g, '-')}`
}

const copySku = (sku) => {
  if (!sku) return
  navigator.clipboard.writeText(sku)
  copiedSku.value = sku
  setTimeout(() => {
    if (copiedSku.value === sku) copiedSku.value = null
  }, 2000)
}
</script>

<template>
  <div class="min-h-screen bg-slate-50/60 dark:bg-[#0f172a] pb-24 font-sans transition-colors duration-300">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">

      <!-- ERROR STATE -->
      <div v-if="errorMessage" class="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-800 rounded-2xl border border-red-200 dark:border-red-900/60 shadow-sm animate-in zoom-in-95 duration-300">
        <div class="bg-red-50 dark:bg-red-900/20 p-4 rounded-full mb-4">
          <AlertTriangle class="w-10 h-10 text-red-500" />
        </div>
        <h3 class="text-xl font-bold text-slate-900 dark:text-white mb-2">Gagal Memuat Delivery Order</h3>
        <p class="text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto text-sm">{{ errorMessage }}</p>
        <div class="flex items-center gap-3">
          <Button @click="router.push('/delivery-orders')" variant="outline" class="gap-2">
            <ArrowLeft class="w-4 h-4" /> Kembali ke List
          </Button>
          <Button @click="fetchDetail(true)" class="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
            <RefreshCw class="w-4 h-4" /> Coba Lagi
          </Button>
        </div>
      </div>

      <!-- LOADING STATE -->
      <div v-else-if="isLoading" class="flex flex-col items-center justify-center h-[60vh]">
        <div class="relative flex items-center justify-center">
          <Loader2 class="animate-spin w-12 h-12 text-emerald-600 dark:text-emerald-400"/>
          <Truck class="w-5 h-5 text-emerald-600 dark:text-emerald-400 absolute" />
        </div>
        <p class="text-slate-600 dark:text-slate-300 mt-4 text-sm font-semibold tracking-wide">Memuat rincian Delivery Order...</p>
        <p class="text-slate-400 text-xs mt-1">Mengambil data relasi HSO, HSQ & Proyek dari Accurate...</p>
      </div>

      <!-- MAIN CONTENT -->
      <div v-else-if="doDetail" class="animate-in fade-in slide-in-from-bottom-3 duration-500 space-y-6">
        
        <!-- TOP NAVIGATION & ACTION BAR -->
        <div class="flex flex-wrap items-center justify-between gap-3">
          <Button @click="router.push('/delivery-orders')" variant="ghost" class="pl-0 hover:bg-transparent hover:text-emerald-600 dark:text-slate-300 dark:hover:text-emerald-400 font-medium">
            <ArrowLeft class="w-4 h-4 mr-2"/> Kembali ke List Pengiriman
          </Button>

          <div class="flex items-center gap-2">
            <Button
              @click="fetchDetail(true)"
              variant="outline"
              size="sm"
              class="gap-1.5 text-xs font-medium border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              :disabled="isRefreshing"
            >
              <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isRefreshing }" />
              {{ isRefreshing ? 'Menyinkronkan...' : 'Sinkron Accurate' }}
            </Button>
          </div>
        </div>

        <!-- HEADER CARD -->
        <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/80 p-6 shadow-sm">
          <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div class="space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <Truck class="w-3.5 h-3.5" /> Delivery Order (HDO)
                </span>
                <Badge class="px-2.5 py-0.5 text-xs font-bold uppercase border shadow-none" :class="getStatusColor(doDetail.status_name)">
                  {{ doDetail.status_name }}
                </Badge>
              </div>

              <h1 class="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                {{ doDetail.number }}
              </h1>

              <div class="flex flex-wrap items-center gap-y-2 gap-x-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                <span class="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700/50 px-2.5 py-1 rounded-md">
                  <Calendar class="w-3.5 h-3.5 text-slate-500" />
                  Tanggal: <strong class="text-slate-900 dark:text-white font-bold ml-0.5">{{ doDetail.trans_date_view || formatDate(doDetail.trans_date) }}</strong>
                </span>

                <span class="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700/50 px-2.5 py-1 rounded-md">
                  <Building2 class="w-3.5 h-3.5 text-slate-500" />
                  Customer: <strong class="text-slate-900 dark:text-white font-bold ml-0.5">{{ doDetail.customer_name }}</strong>
                  <span v-if="doDetail.customer_code" class="text-[10px] text-slate-400 ml-0.5">({{ doDetail.customer_code }})</span>
                </span>

                <!-- PROMINENT HSO CHIP -->
                <span v-if="doDetail.distinct_hsos.length > 0" class="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-950 dark:text-indigo-200 px-2.5 py-1 rounded-md">
                  <FileText class="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  Untuk HSO:
                  <span v-for="hso in doDetail.distinct_hsos" :key="hso.number" class="flex items-center gap-1">
                    <strong class="font-black font-mono text-indigo-900 dark:text-indigo-100">{{ hso.number }}</strong>
                    <RouterLink
                      :to="formatHsoUrl(hso.number)"
                      class="inline-flex items-center gap-0.5 text-[10.5px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 hover:underline"
                      :title="`Buka HSO ${hso.number}`"
                    >
                      <span>(Buka HSO)</span>
                      <ExternalLink class="w-2.5 h-2.5" />
                    </RouterLink>
                  </span>
                </span>

                <span v-if="doDetail.po_number && doDetail.po_number !== '-'" class="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-md">
                  <ShoppingCart class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  PO Customer: <strong class="font-bold ml-0.5 font-mono">{{ doDetail.po_number }}</strong>
                </span>
              </div>
            </div>

            <!-- PROYEK HIGHLIGHT BOX -->
            <div class="w-full lg:w-auto bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-slate-700/60 dark:to-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 rounded-xl p-4 min-w-[240px]">
              <div class="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 text-xs font-bold uppercase tracking-wider mb-1">
                <FolderGit2 class="w-4 h-4" /> Proyek / Project
              </div>
              <p class="text-base font-black text-indigo-950 dark:text-indigo-100">
                {{ doDetail.project && doDetail.project !== '-' ? doDetail.project : 'Non-Project / Regular Stock' }}
              </p>
            </div>
          </div>
        </div>

        <!-- SHIPPING INFO & NOTES GRID -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Alamat Kirim -->
          <Card class="border shadow-sm rounded-xl bg-white dark:bg-slate-800 dark:border-slate-700">
            <CardHeader class="pb-2">
              <CardTitle class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <MapPin class="w-4 h-4 text-rose-500" /> Alamat Tujuan Pengiriman
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-slate-800 dark:text-slate-200 text-sm font-medium whitespace-pre-wrap leading-relaxed">
                {{ doDetail.ship_to || 'Alamat sesuai data master customer (Kantor / Pabrik Customer).' }}
              </p>
            </CardContent>
          </Card>

          <!-- Catatan / Deskripsi DO -->
          <Card class="border shadow-sm rounded-xl bg-white dark:bg-slate-800 dark:border-slate-700">
            <CardHeader class="pb-2">
              <CardTitle class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Info class="w-4 h-4 text-amber-500" /> Memo & Keterangan Pengiriman
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div v-if="doDetail.description" class="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 rounded-lg p-3 text-xs text-amber-900 dark:text-amber-300 font-mono whitespace-pre-wrap">
                {{ doDetail.description }}
              </div>
              <p v-else class="text-xs text-slate-400 italic">Tidak ada catatan memo khusus.</p>
            </CardContent>
          </Card>
        </div>

        <!-- ITEMS TABLE -->
        <Card class="border shadow-sm rounded-2xl overflow-hidden bg-white dark:bg-slate-800 dark:border-slate-700">
          <CardHeader class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/80 p-4 sm:p-5">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300">
                <Package class="w-5 h-5"/>
              </div>
              <div>
                <CardTitle class="text-base font-bold text-slate-900 dark:text-white">Rincian Barang yang Dikirim</CardTitle>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Daftar item produk, kuantiti realisasi, dan nomor HSO pemesan</p>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <!-- Search Box -->
              <div class="relative w-full sm:w-64">
                <Search class="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  v-model="itemSearchQuery"
                  type="text"
                  placeholder="Cari SKU / Item / HSO..."
                  class="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <Badge variant="secondary" class="font-bold text-xs shrink-0">{{ filteredItems.length }} Item</Badge>
            </div>
          </CardHeader>

          <CardContent class="p-0">
            <!-- DESKTOP TABLE -->
            <div class="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader class="bg-slate-50/90 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700">
                  <TableRow class="hover:bg-transparent">
                    <TableHead class="w-[50px] font-bold text-slate-700 dark:text-slate-300 text-center">#</TableHead>
                    <TableHead class="font-bold text-slate-800 dark:text-slate-200 min-w-[360px]">
                      Part Number (SKU) & Deskripsi Item
                    </TableHead>
                    <TableHead class="font-bold text-slate-800 dark:text-slate-200 w-[200px]">Catatan Item</TableHead>
                    <TableHead class="text-right font-bold text-slate-800 dark:text-slate-200 w-[140px]">Qty Kirim</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    v-for="(item, index) in filteredItems"
                    :key="item.id || index"
                    class="hover:bg-slate-50/90 dark:hover:bg-slate-700/40 transition-colors border-b border-slate-100 dark:border-slate-700/70 last:border-0"
                  >
                    <!-- Row Index -->
                    <TableCell class="text-center font-semibold text-slate-400 dark:text-slate-500 py-4 text-xs">
                      {{ index + 1 }}
                    </TableCell>

                    <!-- SKU & Product Description (SKU Prominently Highlighted) -->
                    <TableCell class="py-4">
                      <div class="flex flex-col gap-1">
                        <!-- Prominent SKU -->
                        <div class="flex items-center gap-2 group">
                          <span class="font-mono font-black text-sm sm:text-[15px] text-slate-900 dark:text-white tracking-tight bg-slate-100 dark:bg-slate-700/80 text-emerald-950 dark:text-emerald-300 px-2.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-600/80 shadow-xs select-all">
                            {{ item.item_code }}
                          </span>
                          <button
                            @click="copySku(item.item_code)"
                            class="p-1 rounded-md opacity-60 hover:opacity-100 hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-all"
                            :title="copiedSku === item.item_code ? 'Tersalin!' : 'Salin Part Number'"
                          >
                            <Check v-if="copiedSku === item.item_code" class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <Copy v-else class="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <!-- Secondary Description Subtitle -->
                        <p class="text-xs text-slate-600 dark:text-slate-400 font-normal leading-relaxed pl-0.5">
                          {{ item.item_name }}
                        </p>
                      </div>
                    </TableCell>

                    <!-- Detail Notes -->
                    <TableCell class="py-4">
                      <span v-if="item.detail_notes" class="inline-flex items-center px-2.5 py-1 rounded text-[11px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        {{ item.detail_notes }}
                      </span>
                      <span v-else class="text-xs text-slate-400">-</span>
                    </TableCell>

                    <!-- Quantity -->
                    <TableCell class="text-right py-4">
                      <span class="inline-flex items-center justify-center px-3.5 py-1.5 rounded-lg text-xs font-black font-mono bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 shadow-xs whitespace-nowrap">
                        {{ item.quantity }} {{ item.unit_name }}
                      </span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <!-- MOBILE CARDS -->
            <div class="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
              <div
                v-for="(item, index) in filteredItems"
                :key="item.id || index"
                class="p-4 space-y-2.5"
              >
                <!-- Top Line: Prominent SKU + Qty Badge -->
                <div class="flex items-start justify-between gap-2">
                  <div class="space-y-1">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Item #{{ index + 1 }}</span>
                    <div class="flex items-center gap-1.5">
                      <span class="font-mono font-black text-sm text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-700/80 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600">
                        {{ item.item_code }}
                      </span>
                      <button
                        @click="copySku(item.item_code)"
                        class="p-1 text-slate-400 hover:text-slate-600"
                        :title="'Salin SKU'"
                      >
                        <Check v-if="copiedSku === item.item_code" class="w-3.5 h-3.5 text-emerald-600" />
                        <Copy v-else class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <span class="font-black font-mono text-xs px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 shrink-0">
                    {{ item.quantity }} {{ item.unit_name }}
                  </span>
                </div>

                <!-- Product Name -->
                <p class="text-xs text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                  {{ item.item_name }}
                </p>

                <!-- Note on Mobile if exists -->
                <div v-if="item.detail_notes" class="pt-1.5">
                  <span class="inline-flex items-center bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded text-[11px] font-bold border border-amber-200 dark:border-amber-800/60">
                    Note: {{ item.detail_notes }}
                  </span>
                </div>
              </div>
            </div>

            <!-- TABLE FOOTER -->
            <div class="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50/90 dark:bg-slate-900/70 border-t border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300">
              <div class="flex items-center gap-4">
                <span>Total Item: <strong class="text-slate-900 dark:text-white">{{ filteredItems.length }} SKU</strong></span>
              </div>
              <div class="flex items-center gap-2">
                <span>Total Kuantiti Dikirim:</span>
                <Badge class="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-3 py-1 font-mono">
                  {{ totalQuantity }} Unit
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  </div>
</template>
