<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ExternalLink, ChevronLeft, ChevronRight } from 'lucide-vue-next'

const router = useRouter()

const props = defineProps({
  soList: { type: Array, default: () => [] },
  siList: { type: Array, required: true },
  isLoading: { type: Boolean, default: false },
  targetYear: { type: Number, required: true }
})

const selectedYear = ref(props.targetYear)
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

const availableYears = [2024, 2025, 2026]
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
  if (days <= 0) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40'
  if (days <= 14) return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-900/40'
  if (days <= 30) return 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 border-orange-200 dark:border-orange-900/40'
  return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border-rose-200 dark:border-rose-900/40'
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

// Pagination unshipped
const totalPagesUnshipped = computed(() => Math.ceil(unshippedList.value.length / pageSizeUnshipped.value) || 1)
const paginatedUnshipped = computed(() => {
  const start = (currentPageUnshipped.value - 1) * pageSizeUnshipped.value
  return unshippedList.value.slice(start, start + pageSizeUnshipped.value)
})
const prevPageUnshipped = () => { if (currentPageUnshipped.value > 1) currentPageUnshipped.value-- }
const nextPageUnshipped = () => { if (currentPageUnshipped.value < totalPagesUnshipped.value) currentPageUnshipped.value++ }

// Pagination computations
const totalPages = computed(() => {
  return Math.ceil(priorityList.value.length / pageSize.value) || 1
})

const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return priorityList.value.slice(start, start + pageSize.value)
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
    <!-- Header (Tanpa Icon, Judul + Filter Tahun 2024, 2025, 2026) -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-3">
      <div>
        <h3 class="font-extrabold text-slate-800 dark:text-slate-200 text-sm">Invoice Priority (Realisasi & Status Tagihan)</h3>
        <p class="text-xs text-muted-foreground">Rincian status pengiriman, tagihan terbit, dan piutang tahun {{ selectedYear }}</p>
      </div>

      <!-- Filter Tahun (2024, 2025, 2026) -->
      <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg shrink-0 self-start sm:self-auto">
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

    <!-- Ringkasan Angka Status Realisasi & Piutang HSO -->
    <div v-if="!isLoading" class="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl p-4 space-y-3">
      <!-- 4 Stat Box Grid — urutan: Total Omzet | Belum Kirim | Perlu Ditagih | Lunas -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-center sm:text-left">
        <!-- 1. Total Omzet HSO -->
        <div class="bg-white dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
          <span class="text-xs text-slate-500 font-medium block">Total Omzet HSO</span>
          <span class="text-base font-extrabold text-slate-900 dark:text-white">{{ formatCurrency(totalHsoNominal) }}</span>
          <span class="text-[10px] text-slate-400 block mt-0.5">{{ yearSOs.length }} Pesanan HSO</span>
        </div>

        <!-- 2. Belum Kirim (rose/merah) -->
        <div class="bg-white dark:bg-slate-900/60 p-2.5 rounded-lg border border-rose-100 dark:border-rose-950">
          <span class="text-xs text-rose-600 dark:text-rose-400 font-medium block">Belum Kirim</span>
          <span class="text-base font-extrabold text-rose-600 dark:text-rose-400">{{ formatCurrency(totalUnshippedHsoNominal) }}</span>
          <span class="text-[10px] text-rose-600/80 dark:text-rose-400/80 font-bold block mt-0.5">{{ unshippedPercent }}% Pending Pengiriman</span>
        </div>

        <!-- 3. Perlu Ditagih / Piutang (amber/kuning) -->
        <div class="bg-white dark:bg-slate-900/60 p-2.5 rounded-lg border border-amber-100 dark:border-amber-950">
          <span class="text-xs text-amber-600 dark:text-amber-400 font-medium block">Perlu Ditagih</span>
          <span class="text-base font-extrabold text-amber-600 dark:text-amber-400">{{ formatCurrency(totalUnpaidHsiNominal) }}</span>
          <span class="text-[10px] text-amber-600/80 dark:text-amber-400/80 font-bold block mt-0.5">{{ unpaidPercent }}% Tertunggak ({{ priorityList.length }} HSI)</span>
        </div>

        <!-- 4. Lunas (emerald) -->
        <div class="bg-white dark:bg-slate-900/60 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-950">
          <span class="text-xs text-emerald-600 dark:text-emerald-400 font-medium block">Lunas</span>
          <span class="text-base font-extrabold text-emerald-600 dark:text-emerald-400">{{ formatCurrency(totalPaidHsiNominal) }}</span>
          <span class="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 font-bold block mt-0.5">{{ paidPercent }}% Realisasi Pembayaran</span>
        </div>
      </div>

      <!-- Presentase Bar dengan Keterangan Presisi Tepat Di Atas Masing-Masing Warna Bar -->
      <div class="space-y-1.5 pt-1">
        <div class="w-full flex items-center text-[10px] font-extrabold overflow-hidden">
          <!-- Belum Kirim (rose) - kiri -->
          <div 
            v-if="unshippedPercent > 0" 
            :style="{ width: `${unshippedPercent}%` }" 
            class="text-rose-600 dark:text-rose-400 truncate pr-1 transition-all duration-500 shrink-0"
            :title="`Belum Kirim: ${unshippedPercent}%`"
          >
            {{ unshippedPercent < 14 ? `Blm Kirim: ${unshippedPercent}%` : `Belum Kirim: ${unshippedPercent}%` }}
          </div>
          <!-- Perlu Ditagih (amber) - tengah -->
          <div 
            v-if="unpaidPercent > 0" 
            :style="{ width: `${unpaidPercent}%` }" 
            class="text-amber-600 dark:text-amber-400 truncate px-1 transition-all duration-500 shrink-0"
            :title="`Perlu Ditagih: ${unpaidPercent}%`"
          >
            {{ unpaidPercent < 14 ? `Ditagih: ${unpaidPercent}%` : `Perlu Ditagih: ${unpaidPercent}%` }}
          </div>
          <!-- Lunas (emerald) - kanan -->
          <div 
            v-if="paidPercent > 0" 
            :style="{ width: `${paidPercent}%` }" 
            class="text-emerald-600 dark:text-emerald-400 truncate pl-1 text-right transition-all duration-500 shrink-0 ml-auto"
            :title="`Lunas: ${paidPercent}%`"
          >
            {{ `Lunas: ${paidPercent}%` }}
          </div>
        </div>

        <div class="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex shadow-inner">
          <!-- Belum Kirim (rose) -->
          <div 
            class="bg-rose-500 h-full transition-all duration-500" 
            :style="{ width: `${unshippedPercent}%` }"
            :title="`Belum Kirim: ${unshippedPercent}% (${formatCurrency(totalUnshippedHsoNominal)})`"
          ></div>
          <!-- Perlu Ditagih (amber) -->
          <div 
            class="bg-amber-500 h-full transition-all duration-500" 
            :style="{ width: `${unpaidPercent}%` }"
            :title="`Perlu Ditagih: ${unpaidPercent}% (${formatCurrency(totalUnpaidHsiNominal)})`"
          ></div>
          <!-- Lunas (emerald) -->
          <div 
            class="bg-emerald-500 h-full transition-all duration-500" 
            :style="{ width: `${paidPercent}%` }"
            :title="`Lunas: ${paidPercent}% (${formatCurrency(totalPaidHsiNominal)})`"
          ></div>
        </div>
      </div>
    </div>

    <!-- Body / Dua Tabel: Belum Kirim + Perlu Ditagih -->
    <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4">

      <!-- === TABEL 1: BELUM KIRIM === -->
      <div class="flex flex-col">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-xs font-bold text-rose-700 dark:text-rose-400">Belum Kirim</h4>
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
        <div v-else-if="unshippedList.length === 0" class="flex-1 flex flex-col justify-center items-center py-8 text-slate-400 text-center">
          <p class="text-xs font-bold text-slate-400">Semua Pesanan Sudah Terkirim 🎉</p>
          <p class="text-[10px] text-slate-500 mt-0.5">Tidak ada pending pengiriman di tahun {{ selectedYear }}</p>
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

          <!-- Pagination Belum Kirim -->
          <div v-if="unshippedList.length > pageSizeUnshipped" class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] gap-2">
            <span class="text-slate-500 font-medium">{{ (currentPageUnshipped - 1) * pageSizeUnshipped + 1 }}–{{ Math.min(currentPageUnshipped * pageSizeUnshipped, unshippedList.length) }} dari {{ unshippedList.length }}</span>
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

      <!-- === TABEL 2: PERLU DITAGIH (Piutang) === -->
      <div class="flex flex-col">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-xs font-bold text-amber-700 dark:text-amber-400">Perlu Ditagih (Piutang)</h4>
          <span class="text-[11px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200/50">
            {{ formatCurrency(totalUnpaidHsiNominal) }}
          </span>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex-1 flex flex-col justify-center items-center py-8 space-y-2">
          <div class="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <span class="text-xs text-slate-400 font-bold">Memuat...</span>
        </div>

        <!-- Empty -->
        <div v-else-if="priorityList.length === 0" class="flex-1 flex flex-col justify-center items-center py-8 text-slate-400 text-center">
          <p class="text-xs font-bold text-slate-400">Semua Tagihan Terbit Sudah Lunas 🎉</p>
          <p class="text-[10px] text-slate-500 mt-0.5">Tidak ada piutang tertunggak di tahun {{ selectedYear }}</p>
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
                </div>
                <p class="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">{{ item.customer }}</p>
                <div class="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 flex-wrap">
                  <span>JT: {{ formatDateId(item.dueDate) }}</span>
                  <div v-if="getHsoRef(item)" class="flex items-center gap-1">
                    <span>•</span>
                    <button 
                      @click.stop="navigateToHso(getHsoRef(item))" 
                      class="font-extrabold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 px-1.5 py-0.5 rounded border border-red-200/60 dark:border-red-900/60 transition-colors inline-flex items-center gap-1"
                      :title="`Buka detail ${getHsoRef(item)}`"
                    >
                      <span>{{ getHsoRef(item) }}</span>
                      <ExternalLink class="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              </div>
              <div class="flex flex-col items-end shrink-0">
                <span class="text-xs font-black text-amber-600 dark:text-amber-400">{{ formatCurrency(item.outstandingAmount) }}</span>
                <span class="text-[9px] text-slate-400 mt-0.5">dari {{ formatCurrencyShort(item.totalAmount) }}</span>
              </div>
            </div>
          </div>

          <!-- Pagination Perlu Ditagih -->
          <div v-if="priorityList.length > pageSize" class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] gap-2">
            <span class="text-slate-500 font-medium">{{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, priorityList.length) }} dari {{ priorityList.length }} HSI</span>
            <div class="flex items-center gap-1.5">
              <button @click="prevPage" :disabled="currentPage === 1" class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center shadow-2xs">
                <ChevronLeft class="w-3 h-3" />
              </button>
              <span class="font-extrabold text-slate-600 dark:text-slate-300">{{ currentPage }}/{{ totalPages }}</span>
              <button @click="nextPage" :disabled="currentPage >= totalPages" class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center shadow-2xs">
                <ChevronRight class="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
