<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { FileText, Eye, AlertCircle } from 'lucide-vue-next'

const props = defineProps({
  sqList: { type: Array, required: true },
  isLoading: { type: Boolean, default: false },
  targetYear: { type: Number, required: true }
})

const router = useRouter()

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

// Age in days
const getAgeDays = (dateStr) => {
  const d = parseAccurateDate(dateStr)
  const today = new Date()
  today.setHours(0,0,0,0)
  d.setHours(0,0,0,0)
  const diffTime = today - d
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)))
}

// Indicator colors based on age
const getAgeBadgeClass = (days) => {
  if (days <= 7) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40'
  if (days <= 30) return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-900/40'
  if (days <= 60) return 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 border-orange-200 dark:border-orange-900/40'
  return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border-rose-200 dark:border-rose-900/40'
}

// Filtered and sorted priority list
const priorityList = computed(() => {
  const now = new Date()
  
  const filtered = props.sqList.filter(sq => {
    const d = parseAccurateDate(sq.transDate)
    if (d.getFullYear() !== props.targetYear) return false
    
    const status = (sq.statusName || '').toLowerCase()
    // Belum diproses, tidak termasuk closed, lost, cancel, selesai, terproses, disetujui
    const isExcluded = status.includes('closed') || 
                       status.includes('lost') || 
                       status.includes('cancel') || 
                       status.includes('batal') || 
                       status.includes('selesai') || 
                       status.includes('terproses') || 
                       status.includes('disetujui') ||
                       status.includes('so') ||
                       status.includes('sales order')
    return !isExcluded
  })
  
  // Sort by date ASC (oldest first)
  return filtered.sort((a, b) => parseAccurateDate(a.transDate) - parseAccurateDate(b.transDate))
})

const displayedList = computed(() => priorityList.value.slice(0, 5))

const goToDetail = (item) => {
  const targetId = item.id || item.number
  if (targetId) {
    router.push(`/hsq/${encodeURIComponent(targetId.replace(/\//g, '-'))}`)
  }
}
</script>

<template>
  <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col h-full shadow-xs">
    <!-- Header -->
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center gap-2">
        <FileText class="w-4 h-4 text-amber-500" />
        <h3 class="font-extrabold text-slate-800 dark:text-slate-200 text-sm">HSQ Priority</h3>
      </div>
      <span class="px-2 py-0.5 rounded-full text-xs font-black bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/50">
        HSQ ({{ priorityList.length }})
      </span>
    </div>

    <!-- Body -->
    <div class="flex-1 flex flex-col mt-4 min-h-[280px]">
      <!-- Loading state -->
      <div v-if="isLoading" class="flex-1 flex flex-col justify-center items-center py-10 space-y-2">
        <div class="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        <span class="text-xs text-slate-400 font-bold">Memuat antrean...</span>
      </div>

      <!-- Empty state -->
      <div v-else-if="priorityList.length === 0" class="flex-1 flex flex-col justify-center items-center py-10 text-slate-400 text-center">
        <FileText class="w-10 h-10 mb-2 opacity-30" />
        <p class="text-xs font-bold text-slate-400">Semua HSQ Bersih</p>
        <p class="text-[10px] text-slate-500 mt-0.5">Tidak ada quotation pending di {{ targetYear }}</p>
      </div>

      <!-- Priority List -->
      <div v-else class="flex-1 space-y-3">
        <div v-for="item in displayedList" :key="item.id" 
          @click="goToDetail(item)"
          class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-100 dark:border-slate-800 hover:border-amber-200 dark:hover:border-amber-900 rounded-xl transition-all cursor-pointer group shadow-2xs">
          
          <div class="min-w-0 flex-1 pr-3">
            <div class="flex items-center gap-1.5 mb-1 flex-wrap">
              <span class="text-xs font-black text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors truncate">
                {{ item.number }}
              </span>
              <span :class="['text-[9px] font-black px-1.5 py-0.5 rounded border', getAgeBadgeClass(getAgeDays(item.transDate))]">
                {{ getAgeDays(item.transDate) }} hari
              </span>
            </div>
            <p class="text-[11px] font-bold text-slate-600 dark:text-slate-400 truncate">{{ item.customer }}</p>
            <div class="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
              <span>{{ formatDateId(item.transDate) }}</span>
              <span>•</span>
              <span class="font-semibold text-slate-500 dark:text-slate-400">Sales: {{ item.salesmanName }}</span>
            </div>
          </div>

          <div class="flex flex-col items-end shrink-0">
            <span class="text-xs font-black text-slate-900 dark:text-white">{{ formatCurrencyShort(item.totalAmount) }}</span>
            <button class="mt-1.5 inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/20 px-2 py-0.5 rounded border border-amber-200/50 dark:border-amber-900/50 hover:bg-amber-100 transition-colors">
              <Eye class="w-3 h-3" /> Buka
            </button>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>
