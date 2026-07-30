<script setup>
import { computed } from 'vue'
import { Trophy, Calendar, Sparkles } from 'lucide-vue-next'

const props = defineProps({
  soList: { type: Array, required: true },
  yearlyTarget: { type: Number, required: true },
  targetYear: { type: Number, required: true }
})

const formatCurrency = (val) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0)
}

const formatCurrencyShort = (val) => {
  if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(2) + ' Miliar'
  if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(0) + ' Juta'
  return formatCurrency(val)
}

const parseAccurateDate = (dateStr) => {
  if (!dateStr) return new Date()
  const parts = dateStr.split('/')
  if (parts.length !== 3) return new Date()
  return new Date(parts[2], parts[1] - 1, parts[0])
}

const monthNames = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

// Current active month indices
const currentMonthIdx = computed(() => new Date().getMonth())
const currentMonthName = computed(() => monthNames[currentMonthIdx.value])

// Calculate target, actual, progress for current month of selected year
const metrics = computed(() => {
  const target = props.yearlyTarget / 12
  
  // Realisasi bulan berjalan
  const actual = props.soList.reduce((sum, so) => {
    const d = parseAccurateDate(so.transDate)
    if (d.getFullYear() === props.targetYear && d.getMonth() === currentMonthIdx.value) {
      const s = (so.statusName || '').toLowerCase()
      if (!s.includes('cancel') && !s.includes('batal')) {
        return sum + so.totalAmount
      }
    }
    return sum
  }, 0)
  
  const kurang = Math.max(0, target - actual)
  const progress = target > 0 ? Math.round((actual / target) * 100) : 0
  
  // Sisa Hari bulan ini
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const sisaHari = Math.max(1, lastDay - now.getDate())
  
  // Harus jual per hari
  const harusJualPerHari = kurang / sisaHari
  
  return {
    target,
    actual,
    kurang,
    progress,
    sisaHari,
    harusJualPerHari
  }
})
</script>

<template>
  <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col h-full shadow-xs">
    <!-- Header -->
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center gap-2">
        <Trophy class="w-4 h-4 text-rose-500" />
        <h3 class="font-extrabold text-slate-800 dark:text-slate-200 text-sm">Target Bulanan ({{ currentMonthName }} {{ targetYear }})</h3>
      </div>
      <span class="px-2 py-0.5 rounded-full text-xs font-black bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200/50 dark:border-rose-900/50 flex items-center gap-1">
        <Calendar class="w-3 h-3" />
        Sisa {{ metrics.sisaHari }} Hari
      </span>
    </div>

    <!-- Body -->
    <div class="flex-1 flex flex-col justify-between mt-4 min-h-[280px]">
      <!-- Progress Bar & Metrics -->
      <div class="space-y-4">
        <!-- Target & Actual -->
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target Bulan</p>
            <p class="text-sm font-black text-slate-800 dark:text-slate-200 mt-0.5">{{ formatCurrencyShort(metrics.target) }}</p>
          </div>
          <div class="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Realisasi Bulan</p>
            <p class="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{{ formatCurrencyShort(metrics.actual) }}</p>
          </div>
        </div>

        <!-- Progress Indicator -->
        <div class="space-y-1.5 pt-1">
          <div class="flex justify-between items-center text-xs">
            <span class="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Progress Bulan Ini</span>
            <span :class="[
              'text-xs font-black px-2.5 py-0.5 rounded-md border',
              metrics.progress >= 100 
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' 
                : metrics.progress >= 80 
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-800' 
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300 border-rose-200 dark:border-rose-800'
            ]">
              {{ metrics.progress }}%
            </span>
          </div>

          <div class="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div :class="[
              'h-full rounded-full transition-all duration-500 bg-gradient-to-r',
              metrics.progress >= 100 ? 'from-emerald-500 to-teal-400' : metrics.progress >= 80 ? 'from-amber-500 to-orange-400' : 'from-rose-500 to-red-400'
            ]" :style="`width: ${Math.min(metrics.progress, 100)}%`"></div>
          </div>
        </div>

        <!-- Defisit / Kurang -->
        <div class="flex justify-between items-center text-xs pt-1">
          <span class="text-slate-500 dark:text-slate-400">Selisih Target (Kurang):</span>
          <span class="font-extrabold text-rose-600 dark:text-rose-400">{{ formatCurrencyShort(metrics.kurang) }}</span>
        </div>
      </div>

    </div>
  </div>
</template>
