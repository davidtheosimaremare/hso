<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { getDetailSo, getNextHsoNumber, convertHsbToHso } from '@/lib/accurateProxy'
import { 
  ArrowRightLeft, Search, RefreshCw, Calendar, FileText, CheckCircle2, 
  AlertTriangle, ArrowRight, ExternalLink, Layers, CheckSquare, Square,
  Clock, ShoppingCart, User, Hash, DollarSign, Split, Sparkles, X, ChevronRight,
  ShieldCheck, AlertCircle, Info, History
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const router = useRouter()

// ─── STATE MANAGEMENT ────────────────────────────────────────────────────────
const activeTab = ref('active') // 'active' | 'history'
const isLoading = ref(true)
const isRefreshing = ref(false)
const searchQuery = ref('')
const filterHpoStatus = ref('ALL') // 'ALL' | 'HAS_HPO' | 'NO_HPO'

const hsbList = ref([])
const conversionHistory = ref([])
const hpoMapping = ref({}) // so_id/so_number -> Array of HPO numbers

// Modal Conversion State
const isModalOpen = ref(false)
const selectedHsb = ref(null)
const isLoadingDetail = ref(false)
const hsbDetail = ref(null)
const hsbItems = ref([])
const selectedItemIds = ref(new Set())
const itemQuantities = ref({}) // item_no -> quantity to order

// Form Inputs
const customerPoNumber = ref('')
const customerPoDate = ref(new Date().toISOString().split('T')[0])
const proposedHsoNumber = ref('')
const conversionNotes = ref('')
const isSubmitting = ref(false)
const submitError = ref(null)
const submitSuccess = ref(null)

// ─── FORMATTERS ──────────────────────────────────────────────────────────────
const formatCurrency = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0)

const formatDate = (val) => {
  if (!val) return '-'
  try {
    const parts = String(val).split(/[\/\-]/)
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return new Date(val).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
      }
      return `${parts[0]} ${getMonthName(parts[1])} ${parts[2]}`
    }
    return val
  } catch {
    return val
  }
}

const getMonthName = (m) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  const idx = parseInt(m, 10) - 1
  return months[idx] || m
}

// ─── 1. FETCH HSB LIST & DATA ────────────────────────────────────────────────
const fetchHsbData = async (forceRefresh = false) => {
  if (forceRefresh) isRefreshing.value = true
  else isLoading.value = true

  try {
    // 1. Coba baca dari cache sales orders terlebih dahulu
    let rawOrders = []
    try {
      const cached = localStorage.getItem('hir_sales_orders_cache_v1')
      if (cached) rawOrders = JSON.parse(cached)
    } catch {}

    // Jika kosong atau force refresh, ambil dari Accurate via Supabase Edge/Proxy
    if (!rawOrders || rawOrders.length === 0 || forceRefresh) {
      const { data, error } = await supabase.functions.invoke('accurate-list-so', {
        body: {
          fields: 'id,number,transDate,customer,totalAmount,statusName,percentShipped,poNumber,description',
          limit: 1000
        }
      })
      if (!error && data?.d) {
        rawOrders = data.d
      }
    }

    // 2. Ambil mapping HPO & shipments dari Supabase
    try {
      const { data: shipData } = await supabase
        .from('shipments')
        .select('so_id, item_code, hpo_number')
        .not('hpo_number', 'is', null)

      const map = {}
      if (shipData) {
        shipData.forEach(s => {
          const key = String(s.so_id).trim().toUpperCase()
          if (!map[key]) map[key] = new Set()
          if (s.hpo_number) {
            s.hpo_number.split(',').forEach(num => {
              if (num.trim()) map[key].add(num.trim())
            })
          }
        })
      }
      hpoMapping.value = map
    } catch (dbErr) {
      console.warn('Error fetching HPO mapping:', dbErr)
    }

    // 3. Filter hanya transaksi yang berawalan 'HSB'
    const filtered = (rawOrders || []).filter(o => {
      const num = String(o.number || o.no_so || '').trim().toUpperCase()
      return num.startsWith('HSB/') || num.startsWith('HSB-')
    }).map(o => {
      const num = String(o.number || o.no_so || '').trim()
      const id = o.id || o.id_database
      const key = String(id).toUpperCase()
      const numKey = num.toUpperCase()
      const hpos = Array.from(new Set([
        ...(hpoMapping.value[key] || []),
        ...(hpoMapping.value[numKey] || [])
      ]))

      return {
        id: id,
        number: num,
        client: o.customer?.name || o.client || 'Pelanggan Umum',
        date: o.transDate || o.date,
        total_amount: Number(o.totalAmount || o.amount || 0),
        status: o.statusName || o.status || 'Aktif',
        description: o.description || '',
        po_number: o.poNumber || o.po_number || '-',
        linked_hpos: hpos,
        has_hpo: hpos.length > 0
      }
    })

    hsbList.value = filtered

    // 4. Ambil Riwayat Konversi dari Supabase table hsb_conversions
    try {
      const { data: convData } = await supabase
        .from('hsb_conversions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      conversionHistory.value = convData || []
    } catch (e) {
      console.warn('Table hsb_conversions belum ada atau kosong:', e)
    }

  } catch (err) {
    console.error('Error loading HSB data:', err)
  } finally {
    isLoading.value = false
    isRefreshing.value = false
  }
}

// ─── COMPUTED LIST & STATS ───────────────────────────────────────────────────
const filteredHsbList = computed(() => {
  return hsbList.value.filter(hsb => {
    const q = searchQuery.value.trim().toLowerCase()
    const matchesSearch = !q || 
      hsb.number.toLowerCase().includes(q) ||
      hsb.client.toLowerCase().includes(q) ||
      (hsb.description && hsb.description.toLowerCase().includes(q)) ||
      (hsb.po_number && hsb.po_number.toLowerCase().includes(q))

    const matchesHpo = 
      filterHpoStatus.value === 'ALL' ||
      (filterHpoStatus.value === 'HAS_HPO' && hsb.has_hpo) ||
      (filterHpoStatus.value === 'NO_HPO' && !hsb.has_hpo)

    return matchesSearch && matchesHpo
  })
})

const stats = computed(() => {
  const totalActive = hsbList.value.length
  const totalAmount = hsbList.value.reduce((acc, h) => acc + h.total_amount, 0)
  const withHpoCount = hsbList.value.filter(h => h.has_hpo).length
  const totalConverted = conversionHistory.value.length

  return {
    totalActive,
    totalAmount,
    withHpoCount,
    totalConverted
  }
})

// ─── MODAL: BUKA KONVERSI HSB ────────────────────────────────────────────────
const openConversionModal = async (hsb) => {
  selectedHsb.value = hsb
  isModalOpen.value = true
  isLoadingDetail.value = true
  hsbDetail.value = null
  hsbItems.value = []
  selectedItemIds.value = new Set()
  itemQuantities.value = {}
  submitError.value = null
  submitSuccess.value = null
  customerPoNumber.value = ''
  customerPoDate.value = new Date().toISOString().split('T')[0]
  conversionNotes.value = ''

  try {
    // 1. Ambil detail SO dari Accurate via VPS Proxy
    const detailRes = await getDetailSo(hsb.id, 'sales-order')
    if (detailRes.error) throw new Error(detailRes.error)

    const d = detailRes.data?.d
    hsbDetail.value = d

    // 2. Ambil usulan nomor HSO urut berikutnya
    try {
      const nextRes = await getNextHsoNumber()
      if (nextRes.data?.s && nextRes.data?.proposedNumber) {
        proposedHsoNumber.value = nextRes.data.proposedNumber
      } else {
        // Fallback local generator
        const now = new Date()
        const yy = String(now.getFullYear()).slice(-2)
        const mm = String(now.getMonth() + 1).padStart(2, '0')
        proposedHsoNumber.value = `HSO/${yy}/${mm}/0001`
      }
    } catch {
      const now = new Date()
      const yy = String(now.getFullYear()).slice(-2)
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      proposedHsoNumber.value = `HSO/${yy}/${mm}/0001`
    }

    // 3. Mapping item-item HSB
    const items = (d?.detailItem || []).map((item, idx) => {
      const code = item.item?.no || item.itemNo || `ITEM-${idx}`
      const name = item.item?.name || item.detailName || '-'
      const qty = item.quantity || 1
      const price = item.unitPrice || 0
      const unit = item.item?.unit?.name || 'PCS'

      // Check if this item code has active HPO
      const hasItemHpo = (selectedHsb.value.linked_hpos || []).length > 0

      return {
        id: item.id || idx,
        itemNo: code,
        name: name,
        bookingQty: qty,
        unitPrice: price,
        unit: unit,
        detailNotes: item.detailNotes || '',
        hasHpo: hasItemHpo
      }
    })

    hsbItems.value = items

    // Default: centang semua item dan pasang quantity penuh
    items.forEach(item => {
      selectedItemIds.value.add(item.id)
      itemQuantities.value[item.id] = item.bookingQty
    })

  } catch (err) {
    console.error('Gagal mengambil detail HSB:', err)
    submitError.value = 'Gagal memuat rincian barang: ' + err.message
  } finally {
    isLoadingDetail.value = false
  }
}

// ─── SELEKSI ITEM & CHECKLIST ────────────────────────────────────────────────
const toggleItemSelection = (itemId) => {
  if (selectedItemIds.value.has(itemId)) {
    selectedItemIds.value.delete(itemId)
  } else {
    selectedItemIds.value.add(itemId)
  }
}

const isAllSelected = computed(() => {
  return hsbItems.value.length > 0 && selectedItemIds.value.size === hsbItems.value.length
})

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    selectedItemIds.value.clear()
  } else {
    selectedItemIds.value = new Set(hsbItems.value.map(i => i.id))
  }
}

// ─── MODE DETEKSI: FULL VS PARTIAL ───────────────────────────────────────────
const conversionMode = computed(() => {
  if (hsbItems.value.length === 0) return 'UNKNOWN'
  
  const allItemsChecked = selectedItemIds.value.size === hsbItems.value.length
  if (!allItemsChecked) return 'PARTIAL'

  // Periksa apakah semua quantity sama dengan booking asli
  const allQtysMatch = hsbItems.value.every(item => {
    const chosenQty = Number(itemQuantities.value[item.id] || 0)
    return chosenQty >= item.bookingQty
  })

  return allQtysMatch ? 'FULL' : 'PARTIAL'
})

const selectedItemsData = computed(() => {
  return hsbItems.value.filter(i => selectedItemIds.value.has(i.id)).map(i => {
    const qty = Number(itemQuantities.value[i.id] || i.bookingQty)
    return {
      ...i,
      quantity: qty,
      subtotal: qty * i.unitPrice
    }
  })
})

const remainingItemsData = computed(() => {
  const remaining = []
  hsbItems.value.forEach(i => {
    const isChecked = selectedItemIds.value.has(i.id)
    if (!isChecked) {
      remaining.push({ ...i, quantity: i.bookingQty })
    } else {
      const chosenQty = Number(itemQuantities.value[i.id] || 0)
      const diff = i.bookingQty - chosenQty
      if (diff > 0) {
        remaining.push({ ...i, quantity: diff })
      }
    }
  })
  return remaining
})

const totalHsoValue = computed(() => {
  return selectedItemsData.value.reduce((acc, i) => acc + (i.subtotal || 0), 0)
})

// ─── EKSEKUSI KONVERSI HSB KE HSO ───────────────────────────────────────────
const executeConversion = async () => {
  if (!customerPoNumber.value.trim()) {
    submitError.value = 'Nomor PO Customer wajib diisi!'
    return
  }
  if (!proposedHsoNumber.value.trim()) {
    submitError.value = 'Nomor HSO baru wajib diisi!'
    return
  }
  if (selectedItemsData.value.length === 0) {
    submitError.value = 'Minimal 1 barang harus dipilih untuk dimasukkan ke HSO!'
    return
  }

  isSubmitting.value = true
  submitError.value = null

  try {
    const payload = {
      hsbId: selectedHsb.value.id,
      hsbNumber: selectedHsb.value.number,
      hsoNumber: proposedHsoNumber.value.trim().toUpperCase(),
      poNumber: customerPoNumber.value.trim(),
      poDate: customerPoDate.value,
      customerNo: hsbDetail.value?.customer?.customerNo || hsbDetail.value?.customerNo,
      selectedItems: selectedItemsData.value,
      remainingItems: remainingItemsData.value,
      isFullConversion: conversionMode.value === 'FULL',
      convertedBy: 'Admin Sales'
    }

    const res = await convertHsbToHso(payload)
    if (res.error) throw new Error(res.error)
    if (!res.data?.s) throw new Error(res.data?.error || 'Gagal mengeksekusi konversi di Accurate')

    submitSuccess.value = {
      message: res.data.message || 'Konversi berhasil diproses!',
      hsoNumber: payload.hsoNumber,
      conversionType: payload.isFullConversion ? 'FULL' : 'PARTIAL'
    }

    // Refresh data HSB list
    await fetchHsbData(true)

  } catch (err) {
    console.error('Konversi gagal:', err)
    submitError.value = err.message || 'Terjadi kesalahan saat memproses konversi.'
  } finally {
    isSubmitting.value = false
  }
}

onMounted(() => {
  fetchHsbData()
})
</script>

<template>
  <div class="min-h-screen bg-slate-50/60 dark:bg-[#0f172a] p-4 sm:p-6 lg:p-8 space-y-6 font-sans">
    
    <!-- ─── HEADER TITLE & ACTIONS ─────────────────────────────────────────── -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
      <div>
        <div class="flex items-center gap-2.5">
          <div class="p-2.5 bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-200 dark:border-amber-800/60">
            <ArrowRightLeft class="w-6 h-6" />
          </div>
          <div>
            <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>HSB to HSO Converter</span>
              <Badge variant="outline" class="text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800 font-semibold text-xs">
                Booking Manager
              </Badge>
            </h1>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Kelola pesanan booking sementara (HSB) dan realisasikan menjadi Sales Order (HSO) resmi saat PO Customer terbit.
            </p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2.5">
        <Button 
          variant="outline" 
          size="sm" 
          @click="fetchHsbData(true)" 
          :disabled="isRefreshing || isLoading" 
          class="h-9 px-3.5 text-xs font-semibold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xs cursor-pointer hover:bg-slate-50"
        >
          <RefreshCw class="w-3.5 h-3.5 mr-2 text-slate-600 dark:text-slate-400" :class="isRefreshing ? 'animate-spin' : ''" />
          <span>{{ isRefreshing ? 'Menyinkronkan...' : 'Refresh Accurate' }}</span>
        </Button>
      </div>
    </div>

    <!-- ─── STATS SUMMARY CARDS ─────────────────────────────────────────────── -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card class="bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 shadow-2xs rounded-xl overflow-hidden">
        <CardContent class="p-5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">HSB Booking Aktif</span>
            <div class="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400">
              <Clock class="w-4 h-4" />
            </div>
          </div>
          <div class="mt-3">
            <p class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">{{ stats.totalActive }}</p>
            <p class="text-xs text-slate-500 mt-1">Dokumen booking menunggu PO</p>
          </div>
        </CardContent>
      </Card>

      <Card class="bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 shadow-2xs rounded-xl overflow-hidden">
        <CardContent class="p-5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Nilai Booking</span>
            <div class="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400">
              <DollarSign class="w-4 h-4" />
            </div>
          </div>
          <div class="mt-3">
            <p class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">{{ formatCurrency(stats.totalAmount) }}</p>
            <p class="text-xs text-slate-500 mt-1">Akumulasi komitmen booking</p>
          </div>
        </CardContent>
      </Card>

      <Card class="bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 shadow-2xs rounded-xl overflow-hidden">
        <CardContent class="p-5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Sudah Ada HPO Siemens</span>
            <div class="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400">
              <ShoppingCart class="w-4 h-4" />
            </div>
          </div>
          <div class="mt-3">
            <p class="text-2xl sm:text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">{{ stats.withHpoCount }}</p>
            <p class="text-xs text-slate-500 mt-1">Prioritas tinggi: stok sudah dipesan</p>
          </div>
        </CardContent>
      </Card>

      <Card class="bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 shadow-2xs rounded-xl overflow-hidden">
        <CardContent class="p-5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Riwayat Konversi</span>
            <div class="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400">
              <History class="w-4 h-4" />
            </div>
          </div>
          <div class="mt-3">
            <p class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">{{ stats.totalConverted }}</p>
            <p class="text-xs text-slate-500 mt-1">HSO berhasil direalisasikan</p>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- ─── TABS & CONTROLS ────────────────────────────────────────────────── -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
      <div class="flex items-center gap-1.5">
        <button 
          @click="activeTab = 'active'"
          class="px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
          :class="activeTab === 'active' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
        >
          <Clock class="w-3.5 h-3.5" />
          <span>Booking Aktif ({{ hsbList.length }})</span>
        </button>

        <button 
          @click="activeTab = 'history'"
          class="px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
          :class="activeTab === 'history' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
        >
          <History class="w-3.5 h-3.5" />
          <span>Riwayat Konversi ({{ conversionHistory.length }})</span>
        </button>
      </div>

      <!-- Search & Quick Filter -->
      <div v-if="activeTab === 'active'" class="flex items-center gap-2">
        <div class="relative w-full sm:w-64">
          <Search class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            v-model="searchQuery" 
            type="text" 
            placeholder="Cari HSB / customer..." 
            class="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>

        <select 
          v-model="filterHpoStatus"
          class="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
        >
          <option value="ALL">Semua HSB</option>
          <option value="HAS_HPO">Ada HPO Siemens</option>
          <option value="NO_HPO">Belum Ada HPO</option>
        </select>
      </div>
    </div>

    <!-- ─── TAB 1: DAFTAR HSB BOOKING AKTIF ─────────────────────────────────── -->
    <div v-if="activeTab === 'active'" class="space-y-4">
      <div v-if="isLoading" class="py-16 text-center space-y-3">
        <RefreshCw class="w-8 h-8 animate-spin text-amber-500 mx-auto" />
        <p class="text-xs text-slate-500 font-medium">Mengambil daftar pesanan booking HSB dari Accurate...</p>
      </div>

      <div v-else-if="filteredHsbList.length === 0" class="py-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-8">
        <Clock class="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
        <h3 class="text-base font-bold text-slate-800 dark:text-slate-200">Tidak ada HSB yang cocok</h3>
        <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          Tidak ditemukan dokumen Sales Order dengan penomoran HSB aktif berdasarkan kriteria filter pencarian.
        </p>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card 
          v-for="hsb in filteredHsbList" 
          :key="hsb.id"
          class="bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 shadow-2xs hover:shadow-md transition-all rounded-2xl overflow-hidden flex flex-col justify-between"
        >
          <CardHeader class="p-5 pb-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60 mb-2">
                  <Clock class="w-3 h-3" /> Booking Sementara
                </span>
                <CardTitle class="text-lg font-bold text-slate-900 dark:text-white font-mono">
                  {{ hsb.number }}
                </CardTitle>
              </div>
              <span class="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {{ hsb.status }}
              </span>
            </div>

            <CardDescription class="text-xs font-medium text-slate-600 dark:text-slate-300 mt-1">
              {{ hsb.client }}
            </CardDescription>
          </CardHeader>

          <CardContent class="p-5 pt-0 space-y-4">
            <!-- Metadata & Dates -->
            <div class="grid grid-cols-2 gap-2 py-2.5 border-y border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <span class="text-[11px] text-slate-400 font-medium block">Tgl Booking</span>
                <span class="font-semibold text-slate-700 dark:text-slate-300">{{ formatDate(hsb.date) }}</span>
              </div>
              <div>
                <span class="text-[11px] text-slate-400 font-medium block">Nilai Booking</span>
                <span class="font-extrabold text-slate-900 dark:text-slate-100">{{ formatCurrency(hsb.total_amount) }}</span>
              </div>
            </div>

            <!-- Linked HPO Siemens info -->
            <div v-if="hsb.has_hpo" class="p-2.5 bg-indigo-50/70 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/40 space-y-1">
              <div class="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                <ShoppingCart class="w-3.5 h-3.5" />
                <span>Terikat {{ hsb.linked_hpos.length }} PO Siemens:</span>
              </div>
              <div class="flex flex-wrap gap-1">
                <span 
                  v-for="hpoNum in hsb.linked_hpos" 
                  :key="hpoNum"
                  class="text-[10px] font-mono font-bold bg-white dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800"
                >
                  {{ hpoNum }}
                </span>
              </div>
            </div>
            <div v-else class="text-[11px] text-slate-400 italic">
              Belum ada PO Siemens yang terikat pada HSB ini.
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 pt-1">
              <Button 
                variant="outline" 
                size="sm" 
                class="w-1/2 text-xs font-semibold h-9 rounded-xl border-slate-200 dark:border-slate-800 cursor-pointer"
                @click="router.push(`/sales-orders/${hsb.number.replace(/\//g, '-')}`)"
              >
                <FileText class="w-3.5 h-3.5 mr-1 text-slate-500" /> Detail
              </Button>

              <Button 
                size="sm" 
                class="w-1/2 text-xs font-bold h-9 rounded-xl bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-xs transition-colors"
                @click="openConversionModal(hsb)"
              >
                <Sparkles class="w-3.5 h-3.5 mr-1" /> Konversi ke HSO
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- ─── TAB 2: RIWAYAT KONVERSI ─────────────────────────────────────────── -->
    <div v-else-if="activeTab === 'history'" class="space-y-4">
      <div v-if="conversionHistory.length === 0" class="py-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-8">
        <History class="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
        <h3 class="text-base font-bold text-slate-800 dark:text-slate-200">Belum Ada Riwayat Konversi</h3>
        <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          Setiap kali Anda memproses HSB menjadi HSO (baik konversi penuh maupun pecah booking), riwayatnya akan otomatis tercatat di sini.
        </p>
      </div>

      <div v-else class="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs divide-y divide-slate-100 dark:divide-slate-800">
        <div 
          v-for="item in conversionHistory" 
          :key="item.id"
          class="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
        >
          <div class="space-y-1.5">
            <div class="flex items-center gap-2.5 flex-wrap">
              <span class="font-mono font-bold text-slate-700 dark:text-slate-300 text-sm">
                {{ item.hsb_number }}
              </span>
              <ArrowRight class="w-4 h-4 text-slate-400" />
              <span class="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                {{ item.hso_number }}
              </span>
              <Badge 
                :variant="item.conversion_type === 'FULL' ? 'default' : 'outline'" 
                class="text-[10px] font-bold"
                :class="item.conversion_type === 'FULL' ? 'bg-emerald-600' : 'text-blue-600 border-blue-200 dark:border-blue-800'"
              >
                {{ item.conversion_type === 'FULL' ? 'Konversi Penuh' : 'Pecah Booking' }}
              </Badge>
            </div>

            <p class="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <span>PO Customer: <strong>{{ item.po_number }}</strong></span>
              <span>•</span>
              <span>Diproses oleh: {{ item.converted_by || 'Admin' }}</span>
              <span>•</span>
              <span class="text-slate-400">{{ formatDate(item.created_at) }}</span>
            </p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <Button 
              size="sm" 
              variant="outline" 
              class="h-8 text-xs font-semibold rounded-lg border-slate-200 dark:border-slate-800 cursor-pointer"
              @click="router.push(`/sales-orders/${item.hso_number.replace(/\//g, '-')}`)"
            >
              <ExternalLink class="w-3.5 h-3.5 mr-1 text-slate-500" /> Buka HSO
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── MODAL DIALOG: KONVERSI HSB KE HSO ──────────────────────────────── -->
    <Dialog :open="isModalOpen" @update:open="isModalOpen = $event">
      <DialogContent class="max-w-4xl max-h-[90vh] overflow-y-auto p-6 font-sans">
        <DialogHeader class="border-b border-slate-100 dark:border-slate-800 pb-4">
          <div class="flex items-center gap-2.5">
            <div class="p-2 bg-amber-500/10 text-amber-600 rounded-lg">
              <Sparkles class="w-5 h-5" />
            </div>
            <div>
              <DialogTitle class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Konversi HSB ke HSO</span>
                <span class="font-mono text-base font-semibold text-amber-600 dark:text-amber-400">
                  ({{ selectedHsb?.number }})
                </span>
              </DialogTitle>
              <DialogDescription class="text-xs text-slate-500 mt-0.5">
                Pilih barang-barang yang sudah resmi di-PO oleh customer. Barang yang tidak dipilih akan tetap aman tersimpan di HSB.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <!-- Loading Detail State -->
        <div v-if="isLoadingDetail" class="py-16 text-center space-y-3">
          <RefreshCw class="w-8 h-8 animate-spin text-amber-500 mx-auto" />
          <p class="text-xs text-slate-500 font-medium">Mengambil daftar produk dan nomor urut HSO terbaru dari Accurate...</p>
        </div>

        <div v-else class="space-y-6 pt-2">

          <!-- SECTION 1: FORM PO CUSTOMER & HSO NUMBER -->
          <div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-4">
            <div class="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
              <FileText class="w-4 h-4 text-amber-600" />
              <span>1. Data Resmi PO Customer &amp; Nomor HSO</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Nomor PO Customer <span class="text-red-500">*</span>
                </label>
                <input 
                  v-model="customerPoNumber" 
                  type="text" 
                  placeholder="Contoh: PO-PLN-2026-089"
                  class="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Tanggal PO Customer <span class="text-red-500">*</span>
                </label>
                <input 
                  v-model="customerPoDate" 
                  type="date" 
                  class="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Nomor HSO Baru <span class="text-red-500">*</span>
                </label>
                <input 
                  v-model="proposedHsoNumber" 
                  type="text" 
                  class="w-full px-3 py-2 text-xs font-bold font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-emerald-600 dark:text-emerald-400 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <!-- SECTION 2: CHECKLIST ITEM SELECTION -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                <Layers class="w-4 h-4 text-amber-600" />
                <span>2. Pilih Produk yang Resmi Di-PO Customer ({{ selectedItemIds.size }} / {{ hsbItems.length }})</span>
              </div>

              <button 
                @click="toggleSelectAll" 
                class="text-xs font-bold text-amber-600 hover:text-amber-700 cursor-pointer flex items-center gap-1.5"
              >
                <component :is="isAllSelected ? CheckSquare : Square" class="w-3.5 h-3.5" />
                <span>{{ isAllSelected ? 'Batal Pilih Semua' : 'Pilih Semua Item' }}</span>
              </button>
            </div>

            <!-- Table of Items -->
            <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead class="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                    <tr>
                      <th class="py-2.5 px-3 text-center w-10">Pilih</th>
                      <th class="py-2.5 px-3 text-left">Kode SKU &amp; Nama Barang</th>
                      <th class="py-2.5 px-3 text-center w-28">Qty Booking</th>
                      <th class="py-2.5 px-3 text-center w-36">Qty di-PO Customer</th>
                      <th class="py-2.5 px-3 text-right w-36">Harga Satuan</th>
                      <th class="py-2.5 px-3 text-right w-36">Subtotal HSO</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr 
                      v-for="item in hsbItems" 
                      :key="item.id"
                      class="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
                      :class="selectedItemIds.has(item.id) ? 'bg-amber-50/30 dark:bg-amber-950/10' : 'opacity-60'"
                    >
                      <td class="py-3 px-3 text-center">
                        <input 
                          type="checkbox" 
                          :checked="selectedItemIds.has(item.id)" 
                          @change="toggleItemSelection(item.id)"
                          class="w-4 h-4 rounded text-amber-600 accent-amber-600 cursor-pointer"
                        />
                      </td>

                      <td class="py-3 px-3">
                        <div class="flex items-center gap-1.5">
                          <span class="font-mono font-bold text-slate-900 dark:text-white text-xs">{{ item.itemNo }}</span>
                          <Badge v-if="item.hasHpo" variant="outline" class="text-[9px] px-1 py-0 bg-indigo-50 text-indigo-700 border-indigo-200">
                            Ada PO Siemens
                          </Badge>
                        </div>
                        <p class="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{{ item.name }}</p>
                      </td>

                      <td class="py-3 px-3 text-center font-bold text-slate-600 dark:text-slate-400">
                        {{ item.bookingQty }} {{ item.unit }}
                      </td>

                      <td class="py-3 px-3 text-center">
                        <input 
                          v-if="selectedItemIds.has(item.id)"
                          v-model.number="itemQuantities[item.id]" 
                          type="number" 
                          min="1" 
                          :max="item.bookingQty"
                          class="w-20 px-2 py-1 text-center font-bold text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:ring-1 focus:ring-amber-500"
                        />
                        <span v-else class="text-slate-400">-</span>
                      </td>

                      <td class="py-3 px-3 text-right font-medium text-slate-600 dark:text-slate-400 tabular-nums">
                        {{ formatCurrency(item.unitPrice) }}
                      </td>

                      <td class="py-3 px-3 text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {{ selectedItemIds.has(item.id) ? formatCurrency((itemQuantities[item.id] || 0) * item.unitPrice) : '-' }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- SECTION 3: MODE DETECTION & LIVE SUMMARY -->
          <div 
            v-if="conversionMode === 'FULL'" 
            class="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 rounded-xl flex items-start gap-3"
          >
            <ShieldCheck class="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div class="text-xs space-y-1">
              <span class="font-bold text-emerald-900 dark:text-emerald-200 text-sm block">
                Mode Konversi Penuh (Full Conversion)
              </span>
              <p class="text-emerald-800/90 dark:text-emerald-300/90">
                Semua barang dari <strong>{{ selectedHsb?.number }}</strong> telah di-PO oleh customer. Dokumen HSB akan langsung bertransformasi menjadi <strong>{{ proposedHsoNumber }}</strong> di Accurate Online dengan total nilai <strong>{{ formatCurrency(totalHsoValue) }}</strong>.
              </p>
            </div>
          </div>

          <div 
            v-else-if="conversionMode === 'PARTIAL'" 
            class="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/80 rounded-xl flex items-start gap-3"
          >
            <Split class="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div class="text-xs space-y-1">
              <span class="font-bold text-blue-900 dark:text-blue-200 text-sm block">
                Mode Pecah Booking (Partial Split)
              </span>
              <p class="text-blue-800/90 dark:text-blue-300/90">
                Sebanyak <strong>{{ selectedItemsData.length }} item</strong> (senilai {{ formatCurrency(totalHsoValue) }}) akan dibuatkan dokumen <strong>{{ proposedHsoNumber }}</strong> baru. Sisa <strong>{{ remainingItemsData.length }} item</strong> akan tetap aman tersimpan di <strong>{{ selectedHsb?.number }}</strong> untuk menunggu PO tahap berikutnya.
              </p>
            </div>
          </div>

          <!-- Error Alert -->
          <div v-if="submitError" class="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3 text-red-700 dark:text-red-300 text-xs font-medium">
            <AlertCircle class="w-5 h-5 shrink-0" />
            <span>{{ submitError }}</span>
          </div>

          <!-- Success Alert -->
          <div v-if="submitSuccess" class="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between gap-3 text-emerald-800 dark:text-emerald-200 text-xs">
            <div class="flex items-center gap-2.5">
              <CheckCircle2 class="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{{ submitSuccess.message }}</span>
            </div>
            <Button 
              size="sm" 
              class="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              @click="router.push(`/sales-orders/${submitSuccess.hsoNumber.replace(/\//g, '-')}`)"
            >
              Buka HSO Sekarang →
            </Button>
          </div>

        </div>

        <DialogFooter class="border-t border-slate-100 dark:border-slate-800 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div class="text-xs text-slate-500">
            Total Nilai HSO: <strong class="text-slate-900 dark:text-white text-sm tabular-nums">{{ formatCurrency(totalHsoValue) }}</strong>
          </div>

          <div class="flex items-center gap-2">
            <Button 
              variant="outline" 
              @click="isModalOpen = false" 
              :disabled="isSubmitting"
              class="text-xs font-semibold rounded-xl cursor-pointer"
            >
              Tutup
            </Button>

            <Button 
              v-if="!submitSuccess"
              @click="executeConversion" 
              :disabled="isSubmitting || selectedItemsData.length === 0"
              class="text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-xs"
            >
              <RefreshCw v-if="isSubmitting" class="w-3.5 h-3.5 mr-1.5 animate-spin" />
              <span>{{ isSubmitting ? 'Memproses ke Accurate...' : 'Konfirmasi & Terbitkan HSO' }}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

  </div>
</template>

