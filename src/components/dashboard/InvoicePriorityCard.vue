<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ExternalLink, ChevronLeft, ChevronRight, Search, X } from 'lucide-vue-next'

const router = useRouter()

const props = defineProps({
  soList: { type: Array, default: () => [] },
  siList: { type: Array, required: true },
  isLoading: { type: Boolean, default: false },
  targetYear: { type: Number, required: true }
})

const selectedYear = ref(props.targetYear)
const searchQuery = ref('')
const agingFilter = ref('all') // 'all', 'safe', '1_30', '31_60', 'gt_60'
const currentPage = ref(1)
const pageSize = ref(5)
const currentPageUnshipped = ref(1)
const pageSizeUnshipped = ref(5)

watch(
  () => props.targetYear,
  (newYear) => {
    if (newYear) {
      selectedYear.value = newYear
      currentPage.value = 1
    }
  },
  { immediate: true }
)

watch(selectedYear, () => {
  currentPage.value = 1
  currentPageUnshipped.value = 1
})

const availableYears = [2026, 2025, 2024]
const CLOSED_STATUSES = ['ditutup', 'closed', 'selesai']

const formatCurrency = (val) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0)
}

const formatCurrencyShort = (val) => {
  if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(2) + 'M'
  if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(0) + 'jt'
  return formatCurrency(val)
}

const parseAccurateDate = (dateStr) => {
  if (!dateStr) return new Date()
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    return new Date(parts[2], parts[1] - 1, parts[0])
  }
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? new Date() : d
}

const formatDateId = (dateStr) => {
  if (!dateStr) return '-'
  const d = parseAccurateDate(dateStr)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Calculate overdue days
const getOverdueDays = (dueDateStr) => {
  if (!dueDateStr) return 0
  const d = parseAccurateDate(dueDateStr)
  const today = new Date()
  today.setHours(0,0,0,0)
  d.setHours(0,0,0,0)
  const diffTime = today - d
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

const getOverdueBadgeClass = (days) => {
  if (days <= 0) return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
  if (days <= 30) return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-900/60'
  if (days <= 60) return 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 border-orange-300 dark:border-orange-900/60'
  return 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border-rose-300 dark:border-rose-900 font-black'
}

const getOverdueLabel = (days) => {
  if (days <= 0) return 'Belum Jatuh Tempo'
  return `Overdue ${days} hari`
}

// HSO for selectedYear (Patokan Utama Omzet HOKIINDO)
const yearSOs = computed(() => {
  return props.soList.filter(so => {
    const d = parseAccurateDate(so.transDate)
    return d && d.getFullYear() === selectedYear.value
  })
})

// Total Omzet HSO Tahun Ini
const totalHsoNominal = computed(() => {
  return yearSOs.value.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0)
})

// 1. Nominal yang SUDAH KIRIM & TAGIH
const totalShippedHsoNominal = computed(() => {
  return yearSOs.value.reduce((sum, so) => {
    let pct = Number(so.percentShipped) || 0
    const statusLower = (so.statusName || '').toLowerCase().trim()
    if (CLOSED_STATUSES.some(cs => statusLower.includes(cs))) {
      pct = 100
    }
    return sum + ((Number(so.totalAmount) || 0) * (pct / 100))
  }, 0)
})

// 2. Nominal yang BELUM KIRIM & TAGIH
const totalUnshippedHsoNominal = computed(() => {
  return Math.max(0, totalHsoNominal.value - totalShippedHsoNominal.value)
})

// Priority list (HSI Belum Lunas yang terbit pada selectedYear)
const priorityList = computed(() => {
  const filtered = props.siList.filter(si => {
    const d = parseAccurateDate(si.transDate)
    if (!d || d.getFullYear() !== selectedYear.value) return false
    
    const s = (si.statusName || '').toLowerCase().trim()
    const isUnpaid = s.includes('belum') || (s !== 'lunas' && s !== 'paid')
    const hasOutstanding = (Number(si.outstandingAmount) || 0) > 0
    return isUnpaid && hasOutstanding
  })
  
  return filtered.sort((a, b) => {
    const overdueA = getOverdueDays(a.dueDate)
    const overdueB = getOverdueDays(b.dueDate)
    if (overdueA !== overdueB) {
      return overdueB - overdueA
    }
    return (Number(b.outstandingAmount) || 0) - (Number(a.outstandingAmount) || 0)
  })
})

// List SO yang BELUM KIRIM untuk selectedYear
const unshippedList = computed(() => {
  return yearSOs.value
    .filter(so => {
      const statusLower = (so.statusName || '').toLowerCase().trim()
      const isClosed = CLOSED_STATUSES.some(cs => statusLower.includes(cs))
      const pct = Number(so.percentShipped) || 0
      return !isClosed && pct < 100
    })
    .sort((a, b) => (Number(b.totalAmount) || 0) - (Number(a.totalAmount) || 0))
})

const countSafe = computed(() => priorityList.value.filter(i => getOverdueDays(i.dueDate) <= 0).length)
const count1_30 = computed(() => priorityList.value.filter(i => { const d = getOverdueDays(i.dueDate); return d > 0 && d <= 30 }).length)
const count31_60 = computed(() => priorityList.value.filter(i => { const d = getOverdueDays(i.dueDate); return d > 30 && d <= 60 }).length)
const countGt60 = computed(() => priorityList.value.filter(i => getOverdueDays(i.dueDate) > 60).length)

// Filtered Unshipped & Priority computations
const filteredUnshippedList = computed(() => {
  let list = unshippedList.value
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(so => {
      const numMatch = (so.number || '').toLowerCase().includes(q)
      const custMatch = (so.customer || '').toLowerCase().includes(q)
      return numMatch || custMatch
    })
  }
  return list
})

const filteredPriorityList = computed(() => {
  let list = priorityList.value

  // Aging Bucket
  if (agingFilter.value === 'safe') {
    list = list.filter(i => getOverdueDays(i.dueDate) <= 0)
  } else if (agingFilter.value === '1_30') {
    list = list.filter(i => {
      const d = getOverdueDays(i.dueDate)
      return d > 0 && d <= 30
    })
  } else if (agingFilter.value === '31_60') {
    list = list.filter(i => {
      const d = getOverdueDays(i.dueDate)
      return d > 30 && d <= 60
    })
  } else if (agingFilter.value === 'gt_60') {
    list = list.filter(i => getOverdueDays(i.dueDate) > 60)
  }

  // Search
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(i => {
      const numMatch = (i.number || '').toLowerCase().includes(q)
      const custMatch = (i.customer || '').toLowerCase().includes(q)
      const hsoRef = (getHsoRef(i) || '').toLowerCase()
      const descMatch = (i.description || '').toLowerCase().includes(q)
      return numMatch || custMatch || hsoRef.includes(q) || descMatch
    })
  }

  return list
})

watch([searchQuery, agingFilter], () => {
  currentPage.value = 1
  currentPageUnshipped.value = 1
})

// Pagination unshipped
const totalPagesUnshipped = computed(() => Math.ceil(filteredUnshippedList.value.length / pageSizeUnshipped.value) || 1)
const paginatedUnshipped = computed(() => {
  const start = (currentPageUnshipped.value - 1) * pageSizeUnshipped.value
  return filteredUnshippedList.value.slice(start, start + pageSizeUnshipped.value)
})
const prevPageUnshipped = () => { if (currentPageUnshipped.value > 1) currentPageUnshipped.value-- }
const nextPageUnshipped = () => { if (currentPageUnshipped.value < totalPagesUnshipped.value) currentPageUnshipped.value++ }

// Pagination priority
const totalPages = computed(() => {
  return Math.ceil(filteredPriorityList.value.length / pageSize.value) || 1
})

const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredPriorityList.value.slice(start, start + pageSize.value)
})

const prevPage = () => {
  if (currentPage.value > 1) currentPage.value--
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++
}

// Total Nominal HSI Belum Lunas (Piutang dari Tagihan Terbit)
const rawUnpaidHsiNominal = computed(() => {
  return priorityList.value.reduce((sum, item) => sum + (Number(item.outstandingAmount) || 0), 0)
})

const totalUnpaidHsiNominal = computed(() => {
  return Math.min(rawUnpaidHsiNominal.value, totalShippedHsoNominal.value)
})

const totalPaidHsiNominal = computed(() => {
  return Math.max(0, totalShippedHsoNominal.value - totalUnpaidHsiNominal.value)
})

const paidPercent = computed(() => {
  if (totalHsoNominal.value <= 0) return 0
  return Math.round((totalPaidHsiNominal.value / totalHsoNominal.value) * 100)
})

const unpaidPercent = computed(() => {
  if (totalHsoNominal.value <= 0) return 0
  return Math.round((totalUnpaidHsiNominal.value / totalHsoNominal.value) * 100)
})

const unshippedPercent = computed(() => {
  if (totalHsoNominal.value <= 0) return 0
  return Math.max(0, 100 - paidPercent.value - unpaidPercent.value)
})

// Get HSO Reference for an HSI item
const getHsoRef = (item) => {
  if (item.description) {
    const match = item.description.match(/HSO\/\d{2}\/\d{2}\/\d{3}/i)
    if (match) return match[0].toUpperCase()
  }
  
  if (props.soList && props.soList.length > 0 && item.customer) {
    const custLower = item.customer.toLowerCase().trim()
    const matchedSo = props.soList.find(so => {
      const d = parseAccurateDate(so.transDate)
      return d && d.getFullYear() === selectedYear.value && (so.customer || '').toLowerCase().trim() === custLower
    })
    if (matchedSo && matchedSo.number) {
      return matchedSo.number
    }
  }
  
  return null
}

const navigateToHso = (hsoNumber) => {
  if (!hsoNumber) return
  const cleanNumber = hsoNumber.toUpperCase().replace(/\//g, '-')
  router.push(`/sales-orders/${cleanNumber}`)
}
</script>

<template>
  <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col h-full shadow-xs space-y-4">
    <!-- Header (Judul + Quick Search + Filter Tahun 2024, 2025, 2026) -->
    <div class="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-3">
      <div>
        <h3 class="font-extrabold text-slate-800 dark:text-slate-200 text-sm">Status Realisasi, Pengiriman & Piutang HSO</h3>
        <p class="text-xs text-muted-foreground">Rincian pesanan perlu dikirim, piutang faktur belum dibayar, dan pembayaran lunas tahun {{ selectedYear }}</p>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <!-- Quick Search Input -->
        <div class="relative min-w-[200px]">
          <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            v-model="searchQuery"
            type="text"
            placeholder="Cari Order / Faktur..."
            class="w-full h-8 pl-8 pr-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 shadow-2xs"
          />
          <button 
            v-if="searchQuery" 
            @click="searchQuery = ''"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Filter Tahun (2024, 2025, 2026) -->
        <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg shrink-0">
          <button 
            v-for="yr in availableYears" 
            :key="yr"
            @click="selectedYear = yr"
            :class="[
              'px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer',
              selectedYear === yr 
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs' 
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            ]"
          >
            {{ yr }}
          </button>
        </div>
      </div>
    </div>

    <!-- Ringkasan Angka Status Realisasi & Piutang HSO -->
    <div v-if="!isLoading" class="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl p-4 space-y-3">
      <!-- 4 Stat Box Grid — urutan: Total Omzet | Perlu Dikirim | Perlu Ditagih (Piutang) | Sudah Dibayar (Lunas) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-center sm:text-left">
        <!-- 1. Total Omzet HSO -->
        <div class="bg-white dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
          <span class="text-xs text-slate-500 font-medium block">Total Omzet HSO</span>
          <span class="text-base font-extrabold text-slate-900 dark:text-white">{{ formatCurrency(totalHsoNominal) }}</span>
          <span class="text-[10px] text-slate-400 block mt-0.5">{{ yearSOs.length }} Pesanan HSO</span>
        </div>

        <!-- 2. Perlu Dikirim (rose/merah) -->
        <div class="bg-white dark:bg-slate-900/60 p-2.5 rounded-lg border border-rose-100 dark:border-rose-950">
          <span class="text-xs text-rose-600 dark:text-rose-400 font-medium block">Perlu Dikirim</span>
          <span class="text-base font-extrabold text-rose-600 dark:text-rose-400">{{ formatCurrency(totalUnshippedHsoNominal) }}</span>
          <span class="text-[10px] text-rose-600/80 dark:text-rose-400/80 font-bold block mt-0.5">{{ unshippedPercent }}% Pesanan Belum Dikirim</span>
        </div>

        <!-- 3. Perlu Ditagih / Piutang (amber/kuning) -->
        <div class="bg-white dark:bg-slate-900/60 p-2.5 rounded-lg border border-amber-100 dark:border-amber-950">
          <span class="text-xs text-amber-600 dark:text-amber-400 font-medium block">Perlu Ditagih (Piutang)</span>
          <span class="text-base font-extrabold text-amber-600 dark:text-amber-400">{{ formatCurrency(totalUnpaidHsiNominal) }}</span>
          <span class="text-[10px] text-amber-600/80 dark:text-amber-400/80 font-bold block mt-0.5">{{ unpaidPercent }}% Belum Dibayar ({{ priorityList.length }} HSI)</span>
        </div>

        <!-- 4. Sudah Dibayar / Lunas (emerald) -->
        <div class="bg-white dark:bg-slate-900/60 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-950">
          <span class="text-xs text-emerald-600 dark:text-emerald-400 font-medium block">Sudah Dibayar (Lunas)</span>
          <span class="text-base font-extrabold text-emerald-600 dark:text-emerald-400">{{ formatCurrency(totalPaidHsiNominal) }}</span>
          <span class="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 font-bold block mt-0.5">{{ paidPercent }}% Pembayaran Diterima</span>
        </div>
      </div>

      <!-- Presentase Bar dengan Keterangan Presisi Tepat Di Atas Masing-Masing Warna Bar -->
      <div class="space-y-1.5 pt-1">
        <div class="w-full flex items-center text-[10px] font-extrabold overflow-hidden">
          <!-- Perlu Dikirim (rose) - kiri -->
          <div 
            v-if="unshippedPercent > 0" 
            :style="{ width: `${unshippedPercent}%` }" 
            class="text-rose-600 dark:text-rose-400 truncate pr-1 transition-all duration-500 shrink-0"
            :title="`Perlu Dikirim: ${unshippedPercent}%`"
          >
            {{ unshippedPercent < 14 ? `Perlu Kirim: ${unshippedPercent}%` : `Perlu Dikirim: ${unshippedPercent}%` }}
          </div>
          <!-- Perlu Ditagih / Piutang (amber) - tengah -->
          <div 
            v-if="unpaidPercent > 0" 
            :style="{ width: `${unpaidPercent}%` }" 
            class="text-amber-600 dark:text-amber-400 truncate px-1 transition-all duration-500 shrink-0"
            :title="`Piutang: ${unpaidPercent}%`"
          >
            {{ unpaidPercent < 14 ? `Piutang: ${unpaidPercent}%` : `Piutang: ${unpaidPercent}%` }}
          </div>
          <!-- Sudah Dibayar (emerald) - kanan -->
          <div 
            v-if="paidPercent > 0" 
            :style="{ width: `${paidPercent}%` }" 
            class="text-emerald-600 dark:text-emerald-400 truncate pl-1 text-right transition-all duration-500 shrink-0 ml-auto"
            :title="`Sudah Dibayar: ${paidPercent}%`"
          >
            {{ `Sudah Dibayar: ${paidPercent}%` }}
          </div>
        </div>

        <div class="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex shadow-inner">
          <!-- Perlu Dikirim (rose) -->
          <div 
            class="bg-rose-500 h-full transition-all duration-500" 
            :style="{ width: `${unshippedPercent}%` }"
            :title="`Perlu Dikirim: ${unshippedPercent}% (${formatCurrency(totalUnshippedHsoNominal)})`"
          ></div>
          <!-- Perlu Ditagih / Piutang (amber) -->
          <div 
            class="bg-amber-500 h-full transition-all duration-500" 
            :style="{ width: `${unpaidPercent}%` }"
            :title="`Piutang: ${unpaidPercent}% (${formatCurrency(totalUnpaidHsiNominal)})`"
          ></div>
          <!-- Sudah Dibayar (emerald) -->
          <div 
            class="bg-emerald-500 h-full transition-all duration-500" 
            :style="{ width: `${paidPercent}%` }"
            :title="`Sudah Dibayar (Lunas): ${paidPercent}% (${formatCurrency(totalPaidHsiNominal)})`"
          ></div>
        </div>
      </div>
    </div>

    <!-- Body / Dua Tabel: Perlu Dikirim + Piutang (Faktur Belum Lunas) -->
    <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4">

      <!-- === TABEL 1: PERLU DIKIRIM === -->
      <div class="flex flex-col">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-xs font-bold text-rose-700 dark:text-rose-400">Perlu Dikirim (Pesanan)</h4>
          <span class="text-[11px] font-extrabold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded border border-rose-200/50">
            {{ formatCurrency(totalUnshippedHsoNominal) }}
          </span>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex-1 flex flex-col justify-center items-center py-8 space-y-2">
          <div class="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
          <span class="text-xs text-slate-400 font-bold">Memuat...</span>
        </div>

        <!-- Empty -->
        <div v-else-if="filteredUnshippedList.length === 0" class="flex-1 flex flex-col justify-center items-center py-8 text-slate-400 text-center">
          <p class="text-xs font-bold text-slate-400">
            {{ searchQuery ? 'Tidak Ada Pesanan yang Cocok' : 'Semua Pesanan Sudah Dikirim 🎉' }}
          </p>
          <p class="text-[10px] text-slate-500 mt-0.5">
            {{ searchQuery ? 'Coba ubah kata kunci pencarian Anda' : `Tidak ada pesanan yang perlu dikirim di tahun ${selectedYear}` }}
          </p>
        </div>

        <!-- List -->
        <div v-else class="flex-1 flex flex-col justify-between space-y-2.5">
          <div class="space-y-2">
            <div
              v-for="so in paginatedUnshipped"
              :key="so.id"
              class="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/40 hover:bg-rose-50/60 dark:hover:bg-rose-950/20 border border-slate-100 dark:border-slate-800 hover:border-rose-200 dark:hover:border-rose-900 rounded-xl transition-all shadow-2xs"
            >
              <div class="min-w-0 flex-1 pr-2">
                <div class="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <span class="text-xs font-black text-slate-900 dark:text-white truncate">{{ so.number }}</span>
                  <span v-if="(so.percentShipped || 0) > 0" class="text-[9px] font-black px-1.5 py-0.5 rounded border bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border-rose-200 dark:border-rose-900/40 uppercase">
                    {{ so.percentShipped }}% terkirim
                  </span>
                </div>
                <p class="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">{{ so.customer }}</p>
                <span class="text-[10px] text-slate-400">{{ formatDateId(so.transDate) }}</span>
              </div>
              <div class="flex flex-col items-end shrink-0">
                <span class="text-xs font-black text-rose-600 dark:text-rose-400">{{ formatCurrency(so.totalAmount) }}</span>
              </div>
            </div>
          </div>

          <!-- Pagination Perlu Dikirim -->
          <div v-if="filteredUnshippedList.length > pageSizeUnshipped" class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] gap-2">
            <span class="text-slate-500 font-medium">{{ (currentPageUnshipped - 1) * pageSizeUnshipped + 1 }}–{{ Math.min(currentPageUnshipped * pageSizeUnshipped, filteredUnshippedList.length) }} dari {{ filteredUnshippedList.length }}</span>
            <div class="flex items-center gap-1.5">
              <button @click="prevPageUnshipped" :disabled="currentPageUnshipped === 1" class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-0.5 shadow-2xs">
                <ChevronLeft class="w-3 h-3" />
              </button>
              <span class="font-extrabold text-slate-600 dark:text-slate-300">{{ currentPageUnshipped }}/{{ totalPagesUnshipped }}</span>
              <button @click="nextPageUnshipped" :disabled="currentPageUnshipped >= totalPagesUnshipped" class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-0.5 shadow-2xs">
                <ChevronRight class="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- === TABEL 2: PIUTANG (FAKTUR BELUM LUNAS) === -->
      <div class="flex flex-col">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <div class="flex items-center gap-2">
            <h4 class="text-xs font-bold text-amber-700 dark:text-amber-400">Piutang (Faktur Belum Lunas)</h4>
            <span class="text-[11px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200/50">
              {{ formatCurrency(totalUnpaidHsiNominal) }}
            </span>
          </div>

          <!-- Aging Filter Pills -->
          <div class="flex items-center gap-1 overflow-x-auto no-scrollbar text-[10px]">
            <button 
              @click="agingFilter = 'all'"
              :class="[
                'px-2 py-0.5 rounded font-bold transition-all cursor-pointer border shrink-0',
                agingFilter === 'all'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
              ]"
            >
              Semua ({{ priorityList.length }})
            </button>
            <button 
              @click="agingFilter = 'safe'"
              :class="[
                'px-2 py-0.5 rounded font-bold transition-all cursor-pointer border shrink-0',
                agingFilter === 'safe'
                  ? 'bg-slate-700 text-white border-slate-700 shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
              ]"
            >
              Belum JT ({{ countSafe }})
            </button>
            <button 
              @click="agingFilter = '1_30'"
              :class="[
                'px-2 py-0.5 rounded font-bold transition-all cursor-pointer border shrink-0',
                agingFilter === '1_30'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                  : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/40 hover:bg-amber-100'
              ]"
            >
              1–30 Hr ({{ count1_30 }})
            </button>
            <button 
              @click="agingFilter = '31_60'"
              :class="[
                'px-2 py-0.5 rounded font-bold transition-all cursor-pointer border shrink-0',
                agingFilter === '31_60'
                  ? 'bg-orange-600 text-white border-orange-600 shadow-2xs'
                  : 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-900/40 hover:bg-orange-100'
              ]"
            >
              31–60 Hr ({{ count31_60 }})
            </button>
            <button 
              @click="agingFilter = 'gt_60'"
              :class="[
                'px-2 py-0.5 rounded font-bold transition-all cursor-pointer border shrink-0',
                agingFilter === 'gt_60'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                  : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/40 hover:bg-rose-100'
              ]"
            >
              > 60 Hr ({{ countGt60 }})
            </button>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex-1 flex flex-col justify-center items-center py-8 space-y-2">
          <div class="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <span class="text-xs text-slate-400 font-bold">Memuat...</span>
        </div>

        <!-- Empty -->
        <div v-else-if="filteredPriorityList.length === 0" class="flex-1 flex flex-col justify-center items-center py-8 text-slate-400 text-center">
          <p class="text-xs font-bold text-slate-400">
            {{ searchQuery || agingFilter !== 'all' ? 'Tidak Ada Piutang yang Cocok' : 'Semua Tagihan Sudah Lunas 🎉' }}
          </p>
          <p class="text-[10px] text-slate-500 mt-0.5">
            {{ searchQuery || agingFilter !== 'all' ? 'Coba sesuaikan filter aging atau pencarian Anda' : `Tidak ada piutang belum dibayar di tahun ${selectedYear}` }}
          </p>
        </div>

        <!-- List -->
        <div v-else class="flex-1 flex flex-col justify-between space-y-2.5">
          <div class="space-y-2">
            <div 
              v-for="item in paginatedList" 
              :key="item.id" 
              class="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/40 hover:bg-amber-50/60 dark:hover:bg-amber-950/20 border border-slate-100 dark:border-slate-800 hover:border-amber-200 dark:hover:border-amber-900 rounded-xl transition-all shadow-2xs"
            >
              <div class="min-w-0 flex-1 pr-2">
                <div class="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <span class="text-xs font-black text-slate-900 dark:text-white truncate">{{ item.number }}</span>
                  <span :class="['text-[9px] font-black px-1.5 py-0.5 rounded border uppercase', getOverdueBadgeClass(getOverdueDays(item.dueDate))]">
                    {{ getOverdueLabel(getOverdueDays(item.dueDate)) }}
                  </span>
                  <span v-if="(item.paidAmount || 0) > 0" class="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40">
                    Terbayar {{ Math.round(((item.paidAmount || 0) / (item.totalAmount || 1)) * 100) }}%
                  </span>
                </div>
                <p class="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">{{ item.customer }}</p>
                <div class="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 flex-wrap">
                  <span>JT: {{ formatDateId(item.dueDate) }}</span>
                  <div v-if="getHsoRef(item)" class="flex items-center gap-1">
                    <span>•</span>
                    <button 
                      @click.stop="navigateToHso(getHsoRef(item))" 
                      class="font-extrabold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 px-1.5 py-0.5 rounded border border-red-200/60 dark:border-red-900/60 transition-colors inline-flex items-center gap-1 cursor-pointer"
                      :title="`Buka detail ${getHsoRef(item)}`"
                    >
                      <span>{{ getHsoRef(item) }}</span>
                      <ExternalLink class="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              </div>
              <div class="flex flex-col items-end shrink-0" :title="`Total Tagihan: ${formatCurrency(item.totalAmount)} | Terbayar via Penerimaan Penjualan: ${formatCurrency(item.paidAmount)} | Sisa Piutang: ${formatCurrency(item.outstandingAmount)}`">
                <span class="text-xs font-black text-amber-600 dark:text-amber-400">{{ formatCurrency(item.outstandingAmount) }}</span>
                <span class="text-[9px] text-slate-400 mt-0.5">dari {{ formatCurrencyShort(item.totalAmount) }}</span>
              </div>
            </div>
          </div>

          <!-- Pagination Perlu Ditagih -->
          <div v-if="filteredPriorityList.length > pageSize" class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] gap-2">
            <span class="text-slate-500 font-medium">{{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, filteredPriorityList.length) }} dari {{ filteredPriorityList.length }} HSI</span>
            <div class="flex items-center gap-1.5">
              <button @click="prevPage" :disabled="currentPage === 1" class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center shadow-2xs cursor-pointer">
                <ChevronLeft class="w-3 h-3" />
              </button>
              <span class="font-extrabold text-slate-600 dark:text-slate-300">{{ currentPage }}/{{ totalPages }}</span>
              <button @click="nextPage" :disabled="currentPage >= totalPages" class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center shadow-2xs cursor-pointer">
                <ChevronRight class="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
