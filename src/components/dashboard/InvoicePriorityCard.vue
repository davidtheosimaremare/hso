<script setup>
import { computed } from 'vue'
import { FileSpreadsheet, Eye, AlertTriangle } from 'lucide-vue-next'

const props = defineProps({
  siList: { type: Array, required: true },
  isLoading: { type: Boolean, default: false },
  targetYear: { type: Number, required: true }
})

const formatCurrency = (val) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0)
}

const formatCurrencyShort = (val) => {
  if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(1) + 'M'
  if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(0) + 'jt'
  return formatCurrency(val)
}

const parseAccurateDate = (dateStr) => {
  if (!dateStr) return new Date()
  const parts = dateStr.split('/')
  if (parts.length !== 3) return new Date()
  return new Date(parts[2], parts[1] - 1, parts[0])
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

// Filtered and sorted priority list
const priorityList = computed(() => {
  const filtered = props.siList.filter(si => {
    const d = parseAccurateDate(si.transDate)
    if (d.getFullYear() !== props.targetYear) return false
    
    const s = (si.statusName || '').toLowerCase()
    // Belum lunas
    const isPaid = s.includes('lunas') || s.includes('paid') || s.includes('closed') || s.includes('selesai')
    // Outstanding must be greater than 0
    const hasOutstanding = si.outstandingAmount > 0
    return !isPaid && hasOutstanding
  })
  
  // Sort: 1. Overdue days DESC, 2. Outstanding value DESC
  return filtered.sort((a, b) => {
    const overdueA = getOverdueDays(a.dueDate)
    const overdueB = getOverdueDays(b.dueDate)
    if (overdueA !== overdueB) {
      return overdueB - overdueA // Overdue days DESC
    }
    return b.outstandingAmount - a.outstandingAmount // Outstanding DESC
  })
})

const displayedList = computed(() => priorityList.value.slice(0, 5))

// Alert mock for "Tagih"
const triggerTagihan = (item) => {
  alert(`Menghubungi tim billing / customer ${item.customer} untuk penagihan nomor ${item.number} sebesar ${formatCurrency(item.outstandingAmount)}`)
}
</script>

<template>
  <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col h-full shadow-xs">
    <!-- Header -->
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center gap-2">
        <FileSpreadsheet class="w-4 h-4 text-emerald-500" />
        <h3 class="font-extrabold text-slate-800 dark:text-slate-200 text-sm">Invoice Priority</h3>
      </div>
      <span class="px-2 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/50">
        Tagihan ({{ priorityList.length }})
      </span>
    </div>

    <!-- Body -->
    <div class="flex-1 flex flex-col mt-4 min-h-[280px]">
      <!-- Loading state -->
      <div v-if="isLoading" class="flex-1 flex flex-col justify-center items-center py-10 space-y-2">
        <div class="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <span class="text-xs text-slate-400 font-bold">Memuat antrean...</span>
      </div>

      <!-- Empty state -->
      <div v-else-if="priorityList.length === 0" class="flex-1 flex flex-col justify-center items-center py-10 text-slate-400 text-center">
        <FileSpreadsheet class="w-10 h-10 mb-2 opacity-30" />
        <p class="text-xs font-bold text-slate-400">Semua Tagihan Lunas</p>
        <p class="text-[10px] text-slate-500 mt-0.5">Tidak ada tagihan tertunggak di {{ targetYear }}</p>
      </div>

      <!-- Priority List -->
      <div v-else class="flex-1 space-y-3">
        <div v-for="item in displayedList" :key="item.id" 
          @click="triggerTagihan(item)"
          class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-100 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-emerald-900 rounded-xl transition-all cursor-pointer group shadow-2xs">
          
          <div class="min-w-0 flex-1 pr-3">
            <div class="flex items-center gap-1.5 mb-1 flex-wrap">
              <span class="text-xs font-black text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                {{ item.number }}
              </span>
              <span :class="['text-[9px] font-black px-1.5 py-0.5 rounded border uppercase', getOverdueBadgeClass(getOverdueDays(item.dueDate))]">
                {{ getOverdueLabel(getOverdueDays(item.dueDate)) }}
              </span>
            </div>
            <p class="text-[11px] font-bold text-slate-600 dark:text-slate-400 truncate">{{ item.customer }}</p>
            <div class="flex items-center gap-2 mt-1 text-[10px] text-slate-400 flex-wrap">
              <span>Invoice: {{ formatDateId(item.transDate) }}</span>
              <span>•</span>
              <span>Tempo: {{ formatDateId(item.dueDate) }}</span>
              <span>•</span>
              <span class="font-semibold text-slate-500 dark:text-slate-400">Sales: {{ item.salesmanName }}</span>
            </div>
          </div>

          <div class="flex flex-col items-end shrink-0">
            <span class="text-xs font-black text-slate-900 dark:text-white">{{ formatCurrencyShort(item.outstandingAmount) }}</span>
            <span class="text-[9px] text-slate-400 mt-0.5">dari {{ formatCurrencyShort(item.totalAmount) }}</span>
            <button class="mt-1.5 inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/20 px-2.5 py-0.5 rounded border border-emerald-200/50 dark:border-emerald-900/50 hover:bg-emerald-100 transition-colors">
              Tagih
            </button>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>
