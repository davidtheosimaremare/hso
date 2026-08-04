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
      <!-- 4 Stat Box Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-center sm:text-left">
        <!-- 1. Total Omzet HSO -->
        <div class="bg-white dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
          <span class="text-xs text-slate-500 font-medium block">Total Omzet HSO</span>
          <span class="text-base font-extrabold text-slate-900 dark:text-white">{{ formatCurrency(totalHsoNominal) }}</span>
          <span class="text-[10px] text-slate-400 block mt-0.5">{{ yearSOs.length }} Pesanan HSO</span>
        </div>

        <!-- 2. Sudah Kirim & Tagih - Lunas -->
        <div class="bg-white dark:bg-slate-900/60 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-950">
          <span class="text-xs text-emerald-600 dark:text-emerald-400 font-medium block">Kirim & Tagih (Lunas)</span>
          <span class="text-base font-extrabold text-emerald-600 dark:text-emerald-400">{{ formatCurrency(totalPaidHsiNominal) }}</span>
          <span class="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 font-bold block mt-0.5">{{ paidPercent }}% Realisasi Pembayaran</span>
        </div>

        <!-- 3. Sudah Kirim & Tagih - Belum Dibayar (Piutang) -->
        <div class="bg-white dark:bg-slate-900/60 p-2.5 rounded-lg border border-rose-100 dark:border-rose-950">
          <span class="text-xs text-rose-600 dark:text-rose-400 font-medium block">Kirim & Tagih (Piutang)</span>
          <span class="text-base font-extrabold text-rose-600 dark:text-rose-400">{{ formatCurrency(totalUnpaidHsiNominal) }}</span>
          <span class="text-[10px] text-rose-600/80 dark:text-rose-400/80 font-bold block mt-0.5">{{ unpaidPercent }}% Tertunggak ({{ priorityList.length }} HSI)</span>
        </div>

        <!-- 4. Belum Kirim & Tagih -->
        <div class="bg-white dark:bg-slate-900/60 p-2.5 rounded-lg border border-amber-100 dark:border-amber-950">
          <span class="text-xs text-amber-600 dark:text-amber-400 font-medium block">Belum Kirim & Tagih</span>
          <span class="text-base font-extrabold text-amber-600 dark:text-amber-400">{{ formatCurrency(totalUnshippedHsoNominal) }}</span>
          <span class="text-[10px] text-amber-600/80 dark:text-amber-400/80 font-bold block mt-0.5">{{ unshippedPercent }}% Pending Pengiriman</span>
        </div>
      </div>

      <!-- Presentase Bar dengan Keterangan Presisi Tepat Di Atas Masing-Masing Warna Bar -->
      <div class="space-y-1.5 pt-1">
        <div class="w-full flex items-center text-[10px] font-extrabold overflow-hidden">
          <div 
            v-if="paidPercent > 0" 
            :style="{ width: `${paidPercent}%` }" 
            class="text-emerald-600 dark:text-emerald-400 truncate pr-1 transition-all duration-500 shrink-0"
            :title="`Kirim & Lunas: ${paidPercent}%`"
          >
            {{ paidPercent < 14 ? `Lunas: ${paidPercent}%` : `Kirim & Lunas: ${paidPercent}%` }}
          </div>
          <div 
            v-if="unpaidPercent > 0" 
            :style="{ width: `${unpaidPercent}%` }" 
            class="text-rose-600 dark:text-rose-400 truncate px-1 transition-all duration-500 shrink-0"
            :title="`Kirim & Belum Dibayar: ${unpaidPercent}%`"
          >
            {{ unpaidPercent < 18 ? `Piutang: ${unpaidPercent}%` : `Kirim & Belum Dibayar: ${unpaidPercent}%` }}
          </div>
          <div 
            v-if="unshippedPercent > 0" 
            :style="{ width: `${unshippedPercent}%` }" 
            class="text-amber-600 dark:text-amber-400 truncate pl-1 text-right transition-all duration-500 shrink-0 ml-auto"
            :title="`Belum Kirim & Tagih: ${unshippedPercent}%`"
          >
            {{ unshippedPercent < 18 ? `Belum Kirim: ${unshippedPercent}%` : `Belum Kirim & Tagih: ${unshippedPercent}%` }}
          </div>
        </div>

        <div class="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex shadow-inner">
          <div 
            class="bg-emerald-500 h-full transition-all duration-500" 
            :style="{ width: `${paidPercent}%` }"
            :title="`Kirim & Lunas: ${paidPercent}% (${formatCurrency(totalPaidHsiNominal)})`"
          ></div>
          <div 
            class="bg-rose-500 h-full transition-all duration-500" 
            :style="{ width: `${unpaidPercent}%` }"
            :title="`Kirim & Belum Dibayar: ${unpaidPercent}% (${formatCurrency(totalUnpaidHsiNominal)})`"
          ></div>
          <div 
            class="bg-amber-500 h-full transition-all duration-500" 
            :style="{ width: `${unshippedPercent}%` }"
            :title="`Belum Kirim & Tagih: ${unshippedPercent}% (${formatCurrency(totalUnshippedHsoNominal)})`"
          ></div>
        </div>
      </div>
    </div>

    <!-- Body / Daftar Tagihan Terbit yang Belum Dibayar -->
    <div class="flex-1 flex flex-col">
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300">Daftar Tagihan Terbit Belum Dibayar (Piutang)</h4>
        <span class="text-[11px] font-extrabold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded border border-rose-200/50">
          Total Piutang: {{ formatCurrency(totalUnpaidHsiNominal) }}
        </span>
      </div>

      <!-- Loading state -->
      <div v-if="isLoading" class="flex-1 flex flex-col justify-center items-center py-10 space-y-2">
        <div class="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <span class="text-xs text-slate-400 font-bold">Memuat data tagihan {{ selectedYear }}...</span>
      </div>

      <!-- Empty state -->
      <div v-else-if="priorityList.length === 0" class="flex-1 flex flex-col justify-center items-center py-10 text-slate-400 text-center">
        <p class="text-xs font-bold text-slate-400">Semua Tagihan Terbit Sudah Lunas</p>
        <p class="text-[10px] text-slate-500 mt-0.5">Tidak ada tagihan tertunggak di tahun {{ selectedYear }}</p>
      </div>

      <!-- Priority List dengan Pagination -->
      <div v-else class="flex-1 flex flex-col justify-between space-y-3">
        <div class="space-y-2.5">
          <div 
            v-for="item in paginatedList" 
            :key="item.id" 
            class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-100 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-emerald-900 rounded-xl transition-all shadow-2xs"
          >
            <div class="min-w-0 flex-1 pr-3">
              <div class="flex items-center gap-1.5 mb-1 flex-wrap">
                <span class="text-xs font-black text-slate-900 dark:text-white truncate">
                  {{ item.number }}
                </span>
                <span :class="['text-[9px] font-black px-1.5 py-0.5 rounded border uppercase', getOverdueBadgeClass(getOverdueDays(item.dueDate))]">
                  {{ getOverdueLabel(getOverdueDays(item.dueDate)) }}
                </span>
              </div>
              <p class="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">{{ item.customer }}</p>
              <div class="flex items-center gap-2 mt-1 text-[10px] text-slate-400 flex-wrap">
                <span>Faktur: {{ formatDateId(item.transDate) }}</span>
                <span>•</span>
                <span>Jatuh Tempo: {{ formatDateId(item.dueDate) }}</span>
                
                <!-- Referensi HSO -->
                <div v-if="getHsoRef(item)" class="flex items-center gap-1 ml-1">
                  <span>•</span>
                  <span class="font-bold text-slate-500 dark:text-slate-400">Ref HSO:</span>
                  <button 
                    @click.stop="navigateToHso(getHsoRef(item))" 
                    class="font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-2 py-0.5 rounded border border-blue-200/60 dark:border-blue-900/60 transition-colors inline-flex items-center gap-1"
                    :title="`Buka detail ${getHsoRef(item)}`"
                  >
                    <span>{{ getHsoRef(item) }}</span>
                    <ExternalLink class="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            </div>

            <div class="flex flex-col items-end shrink-0">
              <span class="text-xs font-black text-rose-600 dark:text-rose-400">{{ formatCurrency(item.outstandingAmount) }}</span>
              <span class="text-[9px] text-slate-400 mt-0.5">dari total {{ formatCurrencyShort(item.totalAmount) }}</span>
            </div>
          </div>
        </div>

        <!-- Controls Pagination -->
        <div v-if="priorityList.length > pageSize" class="flex flex-col sm:flex-row items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs gap-2">
          <span class="text-slate-500 font-medium">
            Menampilkan <strong class="text-slate-700 dark:text-slate-300">{{ (currentPage - 1) * pageSize + 1 }} - {{ Math.min(currentPage * pageSize, priorityList.length) }}</strong> dari <strong class="text-slate-700 dark:text-slate-300">{{ priorityList.length }}</strong> HSI
          </span>
          <div class="flex items-center gap-2">
            <button 
              @click="prevPage" 
              :disabled="currentPage === 1"
              class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1 shadow-2xs"
            >
              <ChevronLeft class="w-3.5 h-3.5" />
              <span>Sebelumnya</span>
            </button>

            <span class="px-2 font-extrabold text-slate-700 dark:text-slate-200">
              Halaman {{ currentPage }} dari {{ totalPages }}
            </span>

            <button 
              @click="nextPage" 
              :disabled="currentPage >= totalPages"
              class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1 shadow-2xs"
            >
              <span>Berikutnya</span>
              <ChevronRight class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
