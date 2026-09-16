<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Search, RefreshCw, FileSpreadsheet, Package, Calendar,
  ChevronLeft, ChevronRight, Copy, Check, ExternalLink,
  Layers, Filter, ArrowUpDown, TrendingUp, Hash, Building2,
  Boxes, Download, Clock, Info, CheckCircle2, ShoppingBag, Truck
} from 'lucide-vue-next'
import defaultHsoItemsData from '@/assets/hso_3vj_items.json'

const router = useRouter()

// --- STATE ---
const isLoading = ref(true)
const isSyncing = ref(false)
const syncProgressText = ref('')
const copiedText = ref('')
const lastUpdated = ref('')

// Data items: [{ id, soId, sku, name, qty, unit, unitPrice, totalPrice, hsoNumber, hsoDate, year, customer, customerPo, percentShipped, hsqNumber, status, notes }]
const allItems = ref([])

// View Mode: 'ITEMS' (List Semua Produk - Data Utama) vs 'SKU_GROUP' (Ringkasan per Part Number)
const viewMode = ref('ITEMS')

// Filter State
const searchQuery = ref('')
const selectedYear = ref('ALL') // 'ALL' | '2026' | '2025' | '2024'
const selectedStatus = ref('ALL')

const selectYear = (yr) => {
  selectedYear.value = yr
  currentPage.value = 1
}

// Sorting & Pagination
const sortField = ref('hsoDate') // 'hsoDate' | 'sku' | 'qty' | 'hsoNumber' | 'totalPrice'
const sortOrder = ref('desc') // 'desc' | 'asc'
const currentPage = ref(1)
const itemsPerPage = ref(25)

// --- FORMATTERS & HELPERS ---
const formatRupiah = (val) => {
  if (!val && val !== 0) return 'Rp 0'
  return 'Rp ' + Number(val).toLocaleString('id-ID')
}

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    copiedText.value = text
    setTimeout(() => {
      copiedText.value = ''
    }, 2000)
  } catch (err) {
    console.error('Copy failed:', err)
  }
}

const goToHso = (hsoNumber, soId) => {
  if (hsoNumber) {
    const cleanNumber = hsoNumber.replace(/\//g, '-')
    router.push(`/sales-orders/${cleanNumber}`)
  } else if (soId) {
    router.push(`/sales-orders/${soId}`)
  }
}

const goToHsq = (hsqNumber) => {
  if (hsqNumber) {
    router.push(`/hsq/${encodeURIComponent(hsqNumber)}`)
  }
}

// --- INIT DATA ---
const initData = () => {
  isLoading.value = true
  try {
    const cached = localStorage.getItem('hso_3vj_items_cache')
    if (cached) {
      const parsed = JSON.parse(cached)
      if (parsed?.items && parsed.items.length > 0) {
        allItems.value = parsed.items
        lastUpdated.value = parsed.generatedAt || ''
        isLoading.value = false
        return
      }
    }

    if (defaultHsoItemsData?.items && defaultHsoItemsData.items.length > 0) {
      allItems.value = defaultHsoItemsData.items
      lastUpdated.value = defaultHsoItemsData.generatedAt || ''
    } else {
      allItems.value = []
    }
  } catch (err) {
    console.warn('Error reading HSO 3VJ data:', err)
    if (defaultHsoItemsData?.items) {
      allItems.value = defaultHsoItemsData.items
      lastUpdated.value = defaultHsoItemsData.generatedAt || ''
    }
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  initData()
})

// --- SYNC LIVE FROM ACCURATE ---
const syncRecentSos = async () => {
  if (isSyncing.value) return
  isSyncing.value = true
  syncProgressText.value = 'Mengambil daftar HSO terbaru dari Accurate...'

  try {
    const { data: listRes, error: listErr } = await supabase.functions.invoke('accurate-list-so', {
      body: { limit: 120, fields: 'id,number,transDate,customer,totalAmount,statusName,percentShipped,poNumber' }
    })

    if (listErr || !listRes?.d) throw new Error(listErr?.message || 'Gagal mengambil data list SO')

    const soList = listRes.d || []
    syncProgressText.value = `Memindai ${soList.length} HSO terbaru...`

    const newItems = []
    const CHUNK_SIZE = 10

    for (let i = 0; i < soList.length; i += CHUNK_SIZE) {
      const chunk = soList.slice(i, i + CHUNK_SIZE)
      await Promise.all(chunk.map(async (so) => {
        try {
          const { data } = await supabase.functions.invoke('accurate-detail-so', {
            body: { id: so.id, type: 'sales-order' }
          })
          const doc = data?.d
          if (doc?.detailItem && Array.isArray(doc.detailItem)) {
            const hsoNumber = doc.number || so.number || '-'
            const hsoDate = doc.transDate || so.transDate || '-'
            const customerName = doc.customer?.name || so.customer?.name || '-'
            const statusName = doc.statusName || so.statusName || '-'
            const customerPo = doc.poNumber || so.poNumber || doc.salesOrderPoNumber || '-'
            const percentShipped = doc.percentShipped ?? so.percentShipped ?? 0

            let year = 2026
            if (hsoDate.includes('/')) {
              const parts = hsoDate.split('/')
              if (parts[2]) year = parseInt(parts[2], 10)
            } else if (hsoNumber.includes('/')) {
              const m = hsoNumber.match(/\/(\d{2})\//)
              if (m) year = 2000 + parseInt(m[1], 10)
            }

            if (year >= 2024 && year <= 2026) {
              doc.detailItem.forEach(item => {
                const sku = (item.item?.no || item.itemNo || item.no || '').trim()
                const itemName = (item.item?.name || item.detailName || item.name || '').trim()
                if (sku.toUpperCase().startsWith('3VJ')) {
                  newItems.push({
                    id: `${so.id}_${item.id || item.seq || Math.random().toString(36).substr(2, 6)}`,
                    soId: so.id,
                    sku: sku,
                    name: itemName,
                    qty: Number(item.quantity || 0),
                    unit: item.itemUnit?.name || item.availableItemUnitName || 'Pcs',
                    unitPrice: Number(item.unitPrice || 0),
                    totalPrice: Number(item.totalPrice || item.salesAmount || (item.quantity * item.unitPrice) || 0),
                    hsoNumber: hsoNumber,
                    hsoDate: hsoDate,
                    year,
                    customer: customerName,
                    customerPo: customerPo,
                    percentShipped: percentShipped,
                    hsqNumber: item.salesQuotation?.number || doc.salesQuotation?.number || null,
                    status: statusName,
                    notes: item.detailNotes || ''
                  })
                }
              })
            }
          }
        } catch (e) {
          console.warn('Skip SO:', so.number, e.message)
        }
      }))
      syncProgressText.value = `Memindai HSO... (${Math.min(i + CHUNK_SIZE, soList.length)}/${soList.length})`
    }

    if (newItems.length > 0) {
      // Merge with existing items, avoid duplicates by (soId + sku)
      const existingMap = new Map()
      allItems.value.forEach(it => existingMap.set(`${it.soId}_${it.sku}`, it))
      newItems.forEach(it => existingMap.set(`${it.soId}_${it.sku}`, it))

      allItems.value = Array.from(existingMap.values())
      allItems.value.sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year
        return b.hsoNumber.localeCompare(a.hsoNumber)
      })

      lastUpdated.value = new Date().toISOString()
      localStorage.setItem('hso_3vj_items_cache', JSON.stringify({
        generatedAt: lastUpdated.value,
        totalCount: allItems.value.length,
        items: allItems.value
      }))
    }
  } catch (err) {
    console.error('Sync error:', err)
    alert('Gagal sinkronisasi data: ' + err.message)
  } finally {
    isSyncing.value = false
    syncProgressText.value = ''
  }
}

// --- FILTERED DATA ---
const filteredItems = computed(() => {
  let list = allItems.value

  // Filter Year
  if (selectedYear.value !== 'ALL') {
    list = list.filter(i => String(i.year) === String(selectedYear.value))
  }

  // Filter Status
  if (selectedStatus.value !== 'ALL') {
    list = list.filter(i => i.status === selectedStatus.value)
  }

  // Filter Search
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(i => {
      const sku = (i.sku || '').toLowerCase()
      const name = (i.name || '').toLowerCase()
      const hso = (i.hsoNumber || '').toLowerCase()
      const cust = (i.customer || '').toLowerCase()
      const po = (i.customerPo || '').toLowerCase()
      const hsq = (i.hsqNumber || '').toLowerCase()
      return sku.includes(q) || name.includes(q) || hso.includes(q) || cust.includes(q) || po.includes(q) || hsq.includes(q)
    })
  }

  // Sort
  return [...list].sort((a, b) => {
    let factor = sortOrder.value === 'asc' ? 1 : -1
    if (sortField.value === 'qty') {
      return (a.qty - b.qty) * factor
    }
    if (sortField.value === 'totalPrice') {
      return (a.totalPrice - b.totalPrice) * factor
    }
    if (sortField.value === 'sku') {
      return a.sku.localeCompare(b.sku) * factor
    }
    if (sortField.value === 'hsoNumber') {
      return a.hsoNumber.localeCompare(b.hsoNumber) * factor
    }
    // Default: date / year
    if (a.year !== b.year) return (a.year - b.year) * factor
    return a.hsoNumber.localeCompare(b.hsoNumber) * factor
  })
})

// --- GROUPED BY SKU ---
const groupedBySku = computed(() => {
  const map = new Map()
  filteredItems.value.forEach(item => {
    const key = item.sku.toUpperCase()
    if (!map.has(key)) {
      map.set(key, {
        sku: item.sku,
        name: item.name,
        totalQty: 0,
        orderCount: 0,
        hsoNumbers: new Set(),
        customers: new Set(),
        latestDate: item.hsoDate,
        latestYear: item.year,
        items: []
      })
    }
    const g = map.get(key)
    g.totalQty += item.qty
    g.orderCount += 1
    g.hsoNumbers.add(item.hsoNumber)
    if (item.customer && item.customer !== '-') g.customers.add(item.customer)
    g.items.push(item)
  })

  return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty)
})

// --- STATS / METRICS ---
const stats = computed(() => {
  const items = filteredItems.value
  const totalQty = items.reduce((acc, i) => acc + (i.qty || 0), 0)
  const uniqueSkus = new Set(items.map(i => i.sku.toUpperCase())).size
  const uniqueHsos = new Set(items.map(i => i.hsoNumber)).size
  const totalValue = items.reduce((acc, i) => acc + (i.totalPrice || 0), 0)

  return {
    totalItems: items.length,
    totalQty,
    uniqueSkus,
    uniqueHsos,
    totalValue
  }
})

// Status list for filter dropdown
const availableStatuses = computed(() => {
  const s = new Set()
  allItems.value.forEach(i => {
    if (i.status) s.add(i.status)
  })
  return Array.from(s).sort()
})

// --- PAGINATION ---
const totalPages = computed(() => {
  const count = viewMode.value === 'ITEMS' ? filteredItems.value.length : groupedBySku.value.length
  return Math.ceil(count / itemsPerPage.value) || 1
})

const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return filteredItems.value.slice(start, start + itemsPerPage.value)
})

const paginatedGroups = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return groupedBySku.value.slice(start, start + itemsPerPage.value)
})

const toggleSort = (field) => {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortOrder.value = 'desc'
  }
  currentPage.value = 1
}

// --- EXCEL EXPORT ---
const exportToExcel = () => {
  const rows = filteredItems.value.map((item, idx) => ({
    "No": idx + 1,
    "Kode SKU 3VJ": item.sku,
    "Qty": item.qty,
    "Satuan": item.unit || 'pcs',
    "Nomor HSO": item.hsoNumber,
    "Tanggal HSO": item.hsoDate,
    "Tahun": item.year,
    "PO Customer": item.customerPo || '-',
    "Nomor HSQ Terkait": item.hsqNumber || '-',
    "Customer": item.customer,
    "Nama Produk": item.name,
    "Harga Satuan (IDR)": item.unitPrice || 0,
    "Total Nilai (IDR)": item.totalPrice || 0,
    "Status HSO": item.status,
    "Pengiriman (%)": item.percentShipped ?? 0,
    "Catatan Detail": item.notes || ''
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "HSO 3VJ 2024-2026")

  // Auto-fit column widths
  const colWidths = [
    { wch: 6 },  // No
    { wch: 24 }, // Kode SKU
    { wch: 8 },  // Qty
    { wch: 8 },  // Satuan
    { wch: 18 }, // Nomor HSO
    { wch: 14 }, // Tanggal
    { wch: 8 },  // Tahun
    { wch: 22 }, // PO Customer
    { wch: 18 }, // Nomor HSQ
    { wch: 32 }, // Customer
    { wch: 45 }, // Nama Produk
    { wch: 18 }, // Harga Satuan
    { wch: 18 }, // Total Nilai
    { wch: 20 }, // Status HSO
    { wch: 14 }, // Pengiriman
    { wch: 30 }  // Catatan
  ]
  ws['!cols'] = colWidths

  const yearStr = selectedYear.value === 'ALL' ? '2024-2026' : selectedYear.value
  const filename = `HSO_Produk_3VJ_${yearStr}_PT_Hokiindo_Raya.xlsx`
  XLSX.writeFile(wb, filename)
}
</script>

<template>
  <div class="space-y-6 max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
    
    <!-- PAGE HEADER -->
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
      <div>
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300">
            <ShoppingBag class="w-6 h-6" />
          </div>
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Detail Produk HSO Sinova 3VJ (2024 - 2026)
            </h1>
            <p class="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              Rekapitulasi pesanan penjualan (Sales Order) resmi dengan awalan SKU 3VJ (Sentron MCCB)
            </p>
          </div>
        </div>
      </div>

      <!-- ACTION BUTTONS -->
      <div class="flex flex-wrap items-center gap-2.5">
        <!-- Download Excel -->
        <Button 
          @click="exportToExcel" 
          :disabled="filteredItems.length === 0"
          class="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-all cursor-pointer"
        >
          <FileSpreadsheet class="w-4 h-4" />
          <span>Download Excel</span>
          <span class="ml-1 px-1.5 py-0.5 rounded bg-emerald-700 text-[11px] font-mono">
            {{ filteredItems.length }} Item
          </span>
        </Button>

        <!-- Sync / Refresh -->
        <Button 
          variant="outline" 
          size="sm" 
          @click="syncRecentSos" 
          :disabled="isSyncing"
          class="border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin text-indigo-600': isSyncing }" />
          <span>{{ isSyncing ? 'Memindai...' : 'Perbarui Data' }}</span>
        </Button>
      </div>
    </div>

    <!-- SYNC PROGRESS BANNER (IF ACTIVE) -->
    <div v-if="isSyncing" class="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 flex items-center gap-3 text-xs text-indigo-800 dark:text-indigo-300 animate-pulse">
      <RefreshCw class="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
      <span class="font-medium">{{ syncProgressText || 'Sedang sinkronisasi data HSO dari Accurate...' }}</span>
    </div>

    <!-- STATS CARDS -->
    <div class="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      <!-- Total Baris Item -->
      <Card class="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-xs">
        <CardContent class="p-4 sm:p-5 flex items-center justify-between">
          <div class="space-y-1">
            <p class="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Total Baris Item</p>
            <p class="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-zinc-50 font-mono">
              {{ stats.totalItems.toLocaleString('id-ID') }}
            </p>
            <p class="text-[11px] text-zinc-400">Item 3VJ terorder di HSO</p>
          </div>
          <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Hash class="w-5 h-5" />
          </div>
        </CardContent>
      </Card>

      <!-- Total Quantity -->
      <Card class="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-xs">
        <CardContent class="p-4 sm:p-5 flex items-center justify-between">
          <div class="space-y-1">
            <p class="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Total Volume Qty</p>
            <p class="text-xl sm:text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 font-mono">
              {{ stats.totalQty.toLocaleString('id-ID') }} <span class="text-xs font-semibold text-zinc-500">pcs</span>
            </p>
            <p class="text-[11px] text-zinc-400">Akumulasi kuantitas 3VJ</p>
          </div>
          <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/60 dark:border-emerald-900/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <Boxes class="w-5 h-5" />
          </div>
        </CardContent>
      </Card>

      <!-- Unique SKUs -->
      <Card class="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-xs">
        <CardContent class="p-4 sm:p-5 flex items-center justify-between">
          <div class="space-y-1">
            <p class="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Part Number Unik</p>
            <p class="text-xl sm:text-2xl font-extrabold text-amber-600 dark:text-amber-400 font-mono">
              {{ stats.uniqueSkus }} <span class="text-xs font-semibold text-zinc-500">Varian SKU</span>
            </p>
            <p class="text-[11px] text-zinc-400">Tipe MCCB 3VJ berbeda</p>
          </div>
          <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200/60 dark:border-amber-900/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Layers class="w-5 h-5" />
          </div>
        </CardContent>
      </Card>

      <!-- Dokumen HSO -->
      <Card class="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-xs">
        <CardContent class="p-4 sm:p-5 flex items-center justify-between">
          <div class="space-y-1">
            <p class="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Dokumen HSO</p>
            <p class="text-xl sm:text-2xl font-extrabold text-purple-600 dark:text-purple-400 font-mono">
              {{ stats.uniqueHsos }} <span class="text-xs font-semibold text-zinc-500">HSO</span>
            </p>
            <p class="text-[11px] text-zinc-400">Pesanan yang memuat 3VJ</p>
          </div>
          <div class="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200/60 dark:border-purple-900/60 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
            <Calendar class="w-5 h-5" />
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- FILTER TOOLBAR -->
    <Card class="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-xs">
      <CardContent class="p-4 space-y-3.5">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          <!-- Search Box -->
          <div class="relative flex-1 max-w-md">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input 
              v-model="searchQuery" 
              placeholder="Cari SKU (3VJ1102...), produk, HSO, customer, PO..." 
              class="pl-9 bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-xs sm:text-sm"
            />
            <button 
              v-if="searchQuery" 
              @click="searchQuery = ''" 
              class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-600"
            >
              ✕
            </button>
          </div>

          <!-- Year Filter Tabs -->
          <div class="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl text-xs font-medium shrink-0">
            <button
              type="button"
              v-for="yr in ['ALL', '2026', '2025', '2024']"
              :key="yr"
              :data-testid="'btn-year-' + yr"
              @click="selectYear(yr)"
              class="px-3 py-1.5 rounded-lg transition-all cursor-pointer"
              :class="selectedYear === yr 
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-xs font-bold' 
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'"
            >
              {{ yr === 'ALL' ? 'Semua Tahun' : yr }}
            </button>
          </div>

          <!-- View Mode Toggle -->
          <div class="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl text-xs font-medium shrink-0">
            <button
              @click="viewMode = 'ITEMS'; currentPage = 1"
              class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
              :class="viewMode === 'ITEMS' 
                ? 'bg-white dark:bg-zinc-900 text-indigo-700 dark:text-indigo-400 shadow-xs font-bold' 
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'"
            >
              <Package class="w-3.5 h-3.5" />
              <span>List Item</span>
            </button>
            <button
              @click="viewMode = 'SKU_GROUP'; currentPage = 1"
              class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
              :class="viewMode === 'SKU_GROUP' 
                ? 'bg-white dark:bg-zinc-900 text-indigo-700 dark:text-indigo-400 shadow-xs font-bold' 
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'"
            >
              <Layers class="w-3.5 h-3.5" />
              <span>Rekap per SKU</span>
            </button>
          </div>

        </div>

        <!-- Secondary Filter Row -->
        <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500">
          <div class="flex items-center gap-2">
            <span>Menampilkan <strong>{{ filteredItems.length }}</strong> hasil</span>
            <span v-if="selectedYear !== 'ALL'" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono text-[11px]">
              Tahun: {{ selectedYear }}
            </span>
          </div>

          <!-- Items per page -->
          <div class="flex items-center gap-2">
            <span>Tampilkan:</span>
            <select 
              v-model="itemsPerPage" 
              class="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs"
            >
              <option :value="20">20 / hal</option>
              <option :value="50">50 / hal</option>
              <option :value="100">100 / hal</option>
            </select>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- LOADING STATE -->
    <div v-if="isLoading" class="py-20 flex flex-col items-center justify-center text-center">
      <div class="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 flex items-center justify-center mb-3">
        <RefreshCw class="w-6 h-6 animate-spin text-indigo-600" />
      </div>
      <p class="font-semibold text-zinc-800 dark:text-zinc-200 text-sm">Memuat data produk 3VJ di HSO...</p>
      <p class="text-xs text-zinc-400 mt-1">Mengambil rekapitulasi pesanan penjualan dari tahun 2024 hingga 2026</p>
    </div>

    <!-- EMPTY STATE -->
    <div v-else-if="filteredItems.length === 0" class="py-16 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <div class="w-12 h-12 mx-auto rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
        <ShoppingBag class="w-6 h-6" />
      </div>
      <h3 class="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">Tidak Ada Item 3VJ Ditemukan</h3>
      <p class="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
        Tidak ditemukan produk pesanan dengan awalan 3VJ yang sesuai dengan kata kunci pencarian atau filter yang dipilih.
      </p>
      <Button 
        variant="outline" 
        size="sm" 
        class="mt-4 text-xs cursor-pointer"
        @click="searchQuery = ''; selectedYear = 'ALL'"
      >
        Reset Filter
      </Button>
    </div>

    <!-- DATA TABLE: MODE 1 - LIST ITEM (DATA UTAMA) -->
    <div v-else-if="viewMode === 'ITEMS'" class="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 overflow-hidden shadow-xs">
      <div class="overflow-x-auto">
        <Table>
          <TableHeader class="bg-zinc-50/80 dark:bg-zinc-950/50">
            <TableRow class="hover:bg-transparent">
              <TableHead class="w-12 text-center text-xs font-semibold">No</TableHead>
              <TableHead class="min-w-[180px] text-xs font-semibold cursor-pointer select-none" @click="toggleSort('sku')">
                <div class="flex items-center gap-1.5">
                  <span>Kode SKU 3VJ</span>
                  <ArrowUpDown class="w-3 h-3 text-zinc-400" />
                </div>
              </TableHead>
              <TableHead class="w-24 text-right text-xs font-semibold cursor-pointer select-none" @click="toggleSort('qty')">
                <div class="flex items-center justify-end gap-1.5">
                  <span>Qty</span>
                  <ArrowUpDown class="w-3 h-3 text-zinc-400" />
                </div>
              </TableHead>
              <TableHead class="min-w-[160px] text-xs font-semibold cursor-pointer select-none" @click="toggleSort('hsoNumber')">
                <div class="flex items-center gap-1.5">
                  <span>Nomor HSO</span>
                  <ArrowUpDown class="w-3 h-3 text-zinc-400" />
                </div>
              </TableHead>
              <TableHead class="min-w-[120px] text-xs font-semibold cursor-pointer select-none" @click="toggleSort('hsoDate')">
                <div class="flex items-center gap-1.5">
                  <span>Tanggal HSO</span>
                  <ArrowUpDown class="w-3 h-3 text-zinc-400" />
                </div>
              </TableHead>
              <TableHead class="min-w-[240px] text-xs font-semibold">Nama Produk / Deskripsi</TableHead>
              <TableHead class="min-w-[180px] text-xs font-semibold">Customer & PO</TableHead>
              <TableHead class="min-w-[130px] text-right text-xs font-semibold cursor-pointer select-none" @click="toggleSort('totalPrice')">
                <div class="flex items-center justify-end gap-1.5">
                  <span>Harga Satuan</span>
                  <ArrowUpDown class="w-3 h-3 text-zinc-400" />
                </div>
              </TableHead>
              <TableHead class="w-28 text-center text-xs font-semibold">Pengiriman</TableHead>
              <TableHead class="w-28 text-center text-xs font-semibold">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow 
              v-for="(item, idx) in paginatedItems" 
              :key="item.id || idx"
              class="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors"
            >
              <!-- No -->
              <TableCell class="text-center font-mono text-xs text-zinc-400">
                {{ ((currentPage - 1) * itemsPerPage) + idx + 1 }}
              </TableCell>

              <!-- Kode SKU 3VJ -->
              <TableCell>
                <div class="flex items-center gap-1.5">
                  <span class="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-900 px-2 py-0.5 rounded-md">
                    {{ item.sku }}
                  </span>
                  <button 
                    @click="copyToClipboard(item.sku)"
                    class="text-zinc-400 hover:text-zinc-600 transition-colors p-1 cursor-pointer"
                    title="Copy SKU"
                  >
                    <Check v-if="copiedText === item.sku" class="w-3 h-3 text-emerald-600" />
                    <Copy v-else class="w-3 h-3" />
                  </button>
                </div>
              </TableCell>

              <!-- Qty (pcs) -->
              <TableCell class="text-right">
                <span class="inline-block px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-900/60 font-mono text-xs font-bold text-amber-900 dark:text-amber-200">
                  {{ item.qty }} {{ item.unit || 'pcs' }}
                </span>
              </TableCell>

              <!-- Nomor HSO -->
              <TableCell>
                <div class="flex items-center gap-1.5">
                  <span 
                    @click="goToHso(item.hsoNumber, item.soId)"
                    class="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    {{ item.hsoNumber }}
                    <ExternalLink class="w-3 h-3 text-zinc-400" />
                  </span>
                </div>
                <div v-if="item.hsqNumber" class="text-[10px] text-zinc-400 mt-0.5 flex items-center gap-1 font-mono">
                  <span>Ref HSQ:</span>
                  <span 
                    @click="goToHsq(item.hsqNumber)"
                    class="text-zinc-600 dark:text-zinc-400 hover:text-blue-600 hover:underline cursor-pointer"
                  >
                    {{ item.hsqNumber }}
                  </span>
                </div>
              </TableCell>

              <!-- Tanggal & Tahun -->
              <TableCell>
                <div class="flex items-center gap-1.5">
                  <span class="text-xs font-mono text-zinc-700 dark:text-zinc-300">
                    {{ item.hsoDate }}
                  </span>
                  <span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium" :class="item.year === 2026 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : item.year === 2025 ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-zinc-100 text-zinc-600 border border-zinc-200'">
                    {{ item.year }}
                  </span>
                </div>
              </TableCell>

              <!-- Nama Produk -->
              <TableCell>
                <div class="text-xs font-medium text-zinc-900 dark:text-zinc-100 leading-snug max-w-sm">
                  {{ item.name }}
                </div>
                <div v-if="item.notes" class="text-[11px] text-zinc-400 mt-0.5 line-clamp-1 italic">
                  {{ item.notes }}
                </div>
              </TableCell>

              <!-- Customer & PO -->
              <TableCell>
                <div class="text-xs font-medium text-zinc-700 dark:text-zinc-300 max-w-[190px] truncate" :title="item.customer">
                  {{ item.customer }}
                </div>
                <div v-if="item.customerPo && item.customerPo !== '-'" class="text-[10px] text-zinc-400 mt-0.5 truncate font-mono" :title="item.customerPo">
                  PO: {{ item.customerPo }}
                </div>
              </TableCell>

              <!-- Harga Satuan -->
              <TableCell class="text-right">
                <div class="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {{ formatRupiah(item.unitPrice) }}
                </div>
                <div v-if="item.qty > 1" class="text-[10px] font-mono text-zinc-400">
                  Total: {{ formatRupiah(item.totalPrice) }}
                </div>
              </TableCell>

              <!-- Pengiriman / Percent Shipped -->
              <TableCell class="text-center">
                <div class="flex items-center justify-center gap-1 font-mono text-[11px]" :class="(item.percentShipped >= 100) ? 'text-emerald-600 font-bold' : (item.percentShipped > 0) ? 'text-blue-600 font-medium' : 'text-zinc-400'">
                  <Truck class="w-3 h-3" />
                  <span>{{ Number(item.percentShipped || 0).toFixed(0) }}%</span>
                </div>
              </TableCell>

              <!-- Status -->
              <TableCell class="text-center">
                <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border"
                  :class="item.status?.toLowerCase().includes('selesai') || item.status?.toLowerCase().includes('closed') || item.status?.toLowerCase().includes('ditutup')
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : item.status?.toLowerCase().includes('proses')
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-zinc-100 text-zinc-600 border-zinc-200'">
                  {{ item.status || 'Aktif' }}
                </span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>

    <!-- DATA TABLE: MODE 2 - REKAP PER SKU (AGREGASI) -->
    <div v-else class="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 overflow-hidden shadow-xs">
      <div class="overflow-x-auto">
        <Table>
          <TableHeader class="bg-zinc-50/80 dark:bg-zinc-950/50">
            <TableRow class="hover:bg-transparent">
              <TableHead class="w-12 text-center text-xs font-semibold">No</TableHead>
              <TableHead class="min-w-[200px] text-xs font-semibold">Part Number (SKU 3VJ)</TableHead>
              <TableHead class="w-32 text-right text-xs font-semibold">Total Qty (pcs)</TableHead>
              <TableHead class="w-28 text-center text-xs font-semibold">Frekuensi Order</TableHead>
              <TableHead class="min-w-[280px] text-xs font-semibold">Nama Produk / Deskripsi</TableHead>
              <TableHead class="min-w-[240px] text-xs font-semibold">Daftar Nomor HSO Terkait</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow 
              v-for="(grp, gIdx) in paginatedGroups" 
              :key="grp.sku"
              class="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors"
            >
              <TableCell class="text-center font-mono text-xs text-zinc-400">
                {{ ((currentPage - 1) * itemsPerPage) + gIdx + 1 }}
              </TableCell>
              
              <!-- SKU -->
              <TableCell>
                <div class="flex items-center gap-1.5">
                  <span class="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-900 px-2 py-0.5 rounded-md">
                    {{ grp.sku }}
                  </span>
                  <button 
                    @click="copyToClipboard(grp.sku)"
                    class="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer"
                    title="Copy SKU"
                  >
                    <Check v-if="copiedText === grp.sku" class="w-3 h-3 text-emerald-600" />
                    <Copy v-else class="w-3 h-3" />
                  </button>
                </div>
              </TableCell>

              <!-- Total Qty -->
              <TableCell class="text-right">
                <span class="inline-block px-2.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 font-mono text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
                  {{ grp.totalQty }} pcs
                </span>
              </TableCell>

              <!-- Frekuensi Order -->
              <TableCell class="text-center">
                <span class="inline-block px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-mono font-medium">
                  {{ grp.orderCount }}x SO
                </span>
              </TableCell>

              <!-- Nama Produk -->
              <TableCell>
                <div class="text-xs font-medium text-zinc-900 dark:text-zinc-100 leading-snug">
                  {{ grp.name }}
                </div>
              </TableCell>

              <!-- Daftar HSO Terkait -->
              <TableCell>
                <div class="flex flex-wrap gap-1 max-w-md">
                  <span 
                    v-for="hso in Array.from(grp.hsoNumbers).slice(0, 4)" 
                    :key="hso"
                    @click="goToHso(hso)"
                    class="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300 cursor-pointer transition-colors"
                  >
                    {{ hso }}
                  </span>
                  <span 
                    v-if="grp.hsoNumbers.size > 4" 
                    class="text-[10px] font-mono text-zinc-400 px-1 py-0.5"
                  >
                    +{{ grp.hsoNumbers.size - 4 }} lainnya
                  </span>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>

    <!-- PAGINATION CONTROLS -->
    <div v-if="filteredItems.length > 0" class="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-zinc-500">
      <div>
        Menampilkan halaman <strong>{{ currentPage }}</strong> dari <strong>{{ totalPages }}</strong> 
        ({{ viewMode === 'ITEMS' ? filteredItems.length : groupedBySku.length }} total entri)
      </div>

      <div class="flex items-center gap-1.5">
        <Button 
          variant="outline" 
          size="sm" 
          :disabled="currentPage <= 1"
          @click="currentPage--"
          class="h-8 px-2.5 text-xs flex items-center gap-1 cursor-pointer"
        >
          <ChevronLeft class="w-3.5 h-3.5" />
          <span>Sebelumnya</span>
        </Button>

        <span class="px-2 font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {{ currentPage }} / {{ totalPages }}
        </span>

        <Button 
          variant="outline" 
          size="sm" 
          :disabled="currentPage >= totalPages"
          @click="currentPage++"
          class="h-8 px-2.5 text-xs flex items-center gap-1 cursor-pointer"
        >
          <span>Berikutnya</span>
          <ChevronRight class="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>

  </div>
</template>
