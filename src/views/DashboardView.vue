<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { 
  BarChart3, Loader2, TrendingUp, Users, RefreshCw,
  AlertCircle, Package, Trophy, Medal, Award, ShoppingCart, Calendar,
  ChevronLeft, ChevronRight, ArrowUpRight, Clock, Zap
} from 'lucide-vue-next'

const router = useRouter()
const isLoading = ref(true)
const soList = ref([])
const poList = ref([])

// PO Filter
const poDateFilter = ref('year')
const poCustomStartDate = ref('')
const poCustomEndDate = ref('')
const chartZoom = ref(100)
const statusFilter = ref('all')
const hsoStatusFilter = ref('month')

const fetchData = async () => {
  isLoading.value = true
  try {
    const { data: soData, error: soError } = await supabase.functions.invoke('accurate-list-so')
    if (!soError) {
      soList.value = (soData?.d || []).map(so => ({
        id: so.id,
        number: so.number,
        customer: so.customer?.name || 'Unknown',
        transDate: so.transDate,
        totalAmount: so.totalAmount || 0,
        statusName: so.statusName || '',
        percentShipped: so.percentShipped || 0
      }))
    }
    const { data: poData, error: poError } = await supabase.functions.invoke('accurate-list-all-po', {
      body: { fields: 'id,number,transDate,statusName,totalAmount,vendor', limit: 10000 }
    })
    if (!poError) {
      poList.value = (poData?.d || []).map(po => ({
        id: po.id, number: po.number, transDate: po.transDate,
        statusName: po.statusName || 'Open', totalAmount: po.totalAmount || 0,
        vendorName: po.vendor?.name || 'Unknown'
      }))
    }
  } catch (error) {
    console.error('Error:', error)
  } finally {
    isLoading.value = false
  }
}

const parseAccurateDate = (dateStr) => {
  if (!dateStr) return null
  const parts = dateStr.split('/')
  if (parts.length !== 3) return null
  return new Date(parts[2], parts[1] - 1, parts[0])
}

const getCandleColor = (status) => {
  const s = (status || '').toLowerCase()
  if (s.includes('terproses') || s.includes('sebagian') || s.includes('dikirim')) return 'blue'
  if (s.includes('menunggu') || s.includes('open') || s.includes('baru')) return 'green'
  return 'red'
}

const hsoStatusData = computed(() => {
  const now = new Date()
  let startDate, endDate
  if (hsoStatusFilter.value === 'week') {
    const day = now.getDay() || 7
    startDate = new Date(now); startDate.setDate(now.getDate() - (day - 1)); startDate.setHours(0,0,0,0)
    endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 6); endDate.setHours(23,59,59)
  } else if (hsoStatusFilter.value === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  } else {
    startDate = new Date(now.getFullYear(), 0, 1)
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
  }
  const filtered = soList.value.filter(so => {
    const d = parseAccurateDate(so.transDate)
    return d && d >= startDate && d <= endDate
  })
  let terproses = 0, menunggu = 0, lainnya = 0
  filtered.forEach(so => {
    const c = getCandleColor(so.statusName)
    if (c === 'blue') terproses++
    else if (c === 'green') menunggu++
    else lainnya++
  })
  const total = filtered.length
  return {
    total, terproses, menunggu, lainnya,
    terprosesPercent: total > 0 ? Math.round((terproses/total)*100) : 0,
    menungguPercent: total > 0 ? Math.round((menunggu/total)*100) : 0,
    lainnyaPercent: total > 0 ? Math.round((lainnya/total)*100) : 0,
    totalRevenue: filtered.reduce((s, so) => s + (so.totalAmount || 0), 0)
  }
})

const getPODateRange = () => {
  const now = new Date()
  let startDate, endDate
  if (poDateFilter.value === 'all') { startDate = new Date(1990,0,1); endDate = new Date(2100,11,31,23,59,59) }
  else if (poDateFilter.value === 'today') { startDate = new Date(now.getFullYear(),now.getMonth(),now.getDate()); endDate = new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59) }
  else if (poDateFilter.value === 'week') { const day = now.getDay()||7; startDate = new Date(now); startDate.setDate(now.getDate()-(day-1)); startDate.setHours(0,0,0,0); endDate = new Date(startDate); endDate.setDate(startDate.getDate()+6); endDate.setHours(23,59,59) }
  else if (poDateFilter.value === 'month') { startDate = new Date(now.getFullYear(),now.getMonth(),1); endDate = new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59) }
  else if (poDateFilter.value === 'year') { startDate = new Date(now.getFullYear(),0,1); endDate = new Date(now.getFullYear(),11,31,23,59,59) }
  else if (poDateFilter.value === 'lastYear') { startDate = new Date(now.getFullYear()-1,0,1); endDate = new Date(now.getFullYear()-1,11,31,23,59,59) }
  else if (poDateFilter.value === 'custom' && poCustomStartDate.value && poCustomEndDate.value) { startDate = new Date(poCustomStartDate.value); startDate.setHours(0,0,0,0); endDate = new Date(poCustomEndDate.value); endDate.setHours(23,59,59) }
  else { startDate = new Date(now.getFullYear(),now.getMonth(),1); endDate = new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59) }
  return { startDate, endDate }
}

const soIndividualData = computed(() => {
  const { startDate, endDate } = getPODateRange()
  let filtered = soList.value.filter(so => {
    const d = parseAccurateDate(so.transDate)
    return d && d >= startDate && d <= endDate
  })
  if (statusFilter.value !== 'all') {
    filtered = filtered.filter(so => {
      const c = getCandleColor(so.statusName)
      if (statusFilter.value === 'terproses') return c === 'blue'
      if (statusFilter.value === 'menunggu') return c === 'green'
      if (statusFilter.value === 'lainnya') return c === 'red'
      return true
    })
  }
  const sorted = filtered.sort((a, b) => parseAccurateDate(a.transDate) - parseAccurateDate(b.transDate))
  const maxAmount = Math.max(...sorted.map(so => so.totalAmount || 0), 1)
  const totalRevenue = sorted.reduce((s, so) => s + (so.totalAmount || 0), 0)
  return {
    data: sorted.map(so => ({ id: so.id, number: so.number, customerName: so.customer, amount: so.totalAmount || 0, date: so.transDate, status: so.statusName, color: getCandleColor(so.statusName) })),
    maxCount: maxAmount, total: totalRevenue
  }
})

const latestHSOs = computed(() =>
  [...soList.value].sort((a, b) => parseAccurateDate(b.transDate) - parseAccurateDate(a.transDate)).slice(0, 5)
)

const customerAnalytics = computed(() => {
  const map = {}
  soList.value.forEach(so => {
    if (!map[so.customer]) map[so.customer] = { name: so.customer, totalValue: 0, orderCount: 0 }
    map[so.customer].totalValue += so.totalAmount
    map[so.customer].orderCount++
  })
  return Object.values(map).map(c => ({ ...c, averageValue: c.orderCount > 0 ? c.totalValue / c.orderCount : 0 }))
    .sort((a, b) => b.totalValue - a.totalValue).slice(0, 20)
})

const formatCurrency = (val) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val)

const formatCurrencyShort = (val) => {
  if (val >= 1e9) return `${(val/1e9).toFixed(1)}M`
  if (val >= 1e6) return `${(val/1e6).toFixed(0)}jt`
  return `${(val/1e3).toFixed(0)}rb`
}

const getStatusColor = (status) => {
  switch (status) {
    case 'Terproses': case 'Ditutup': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400'
    case 'Menunggu diproses': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400'
    case 'Sebagian diproses': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400'
    case 'Diajukan': return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400'
    case 'Ditolak': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400'
    default: return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300'
  }
}

const getRankIcon = (i) => { if (i===0) return Trophy; if (i===1) return Medal; if (i===2) return Award; return null }
const getRankColor = (i) => { if (i===0) return 'text-yellow-500'; if (i===1) return 'text-slate-400'; if (i===2) return 'text-amber-600'; return 'text-slate-400' }

onMounted(() => { fetchData() })
</script>

<template>
  <div class="space-y-6 pb-20">
    
    <!-- Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <div class="flex items-center gap-3 mb-1">
          <div class="p-2 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg shadow-red-500/30">
            <BarChart3 class="w-5 h-5 text-white"/>
          </div>
          <h1 class="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Sales Analytics</h1>
        </div>
        <p class="text-slate-500 dark:text-slate-400 text-sm ml-12">Insights dan analisis pesanan dari Accurate</p>
      </div>
      <button
        @click="fetchData"
        :disabled="isLoading"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white transition-all shadow-md hover:shadow-lg disabled:opacity-60"
      >
        <RefreshCw :class="['w-4 h-4', isLoading && 'animate-spin']"/>
        {{ isLoading ? 'Memuat...' : 'Refresh' }}
      </button>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <!-- Total HSO -->
      <div class="relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-900 rounded-2xl p-5 shadow-lg shadow-blue-500/20">
        <div class="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full"></div>
        <div class="absolute -right-2 top-8 w-16 h-16 bg-white/5 rounded-full"></div>
        <p class="text-blue-200 text-xs font-semibold uppercase tracking-wide mb-2">Total HSO</p>
        <div v-if="isLoading" class="h-8 w-20 bg-white/20 rounded animate-pulse"></div>
        <p v-else class="text-4xl font-black text-white">{{ soList.length }}</p>
        <p class="text-blue-200 text-xs mt-1">Semua periode</p>
      </div>

      <!-- Revenue -->
      <div class="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-emerald-700 dark:to-teal-900 rounded-2xl p-5 shadow-lg shadow-emerald-500/20">
        <div class="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full"></div>
        <div class="absolute -right-2 top-8 w-16 h-16 bg-white/5 rounded-full"></div>
        <p class="text-emerald-100 text-xs font-semibold uppercase tracking-wide mb-2">Total Revenue</p>
        <div v-if="isLoading" class="h-8 w-28 bg-white/20 rounded animate-pulse"></div>
        <p v-else class="text-3xl font-black text-white leading-tight">{{ formatCurrencyShort(soList.reduce((s,so)=>s+(so.totalAmount||0),0)) }}</p>
        <p class="text-emerald-100 text-xs mt-1">Akumulasi semua SO</p>
      </div>

      <!-- Status Bulan Ini -->
      <div class="relative overflow-hidden bg-gradient-to-br from-violet-600 to-purple-700 dark:from-violet-800 dark:to-purple-900 rounded-2xl p-5 shadow-lg shadow-violet-500/20">
        <div class="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full"></div>
        <p class="text-violet-200 text-xs font-semibold uppercase tracking-wide mb-2">Bulan Ini</p>
        <div v-if="isLoading" class="h-8 w-16 bg-white/20 rounded animate-pulse"></div>
        <p v-else class="text-4xl font-black text-white">{{ hsoStatusData.total }}</p>
        <p class="text-violet-200 text-xs mt-1">{{ hsoStatusData.terproses }} terproses</p>
      </div>

      <!-- Menunggu -->
      <div class="relative overflow-hidden bg-gradient-to-br from-amber-500 to-orange-600 dark:from-amber-700 dark:to-orange-900 rounded-2xl p-5 shadow-lg shadow-amber-500/20">
        <div class="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full"></div>
        <p class="text-amber-100 text-xs font-semibold uppercase tracking-wide mb-2">Menunggu</p>
        <div v-if="isLoading" class="h-8 w-16 bg-white/20 rounded animate-pulse"></div>
        <p v-else class="text-4xl font-black text-white">{{ hsoStatusData.menunggu }}</p>
        <p class="text-amber-100 text-xs mt-1">Perlu diproses</p>
      </div>
    </div>

    <!-- Main Chart Card -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
      <!-- Card Header -->
      <div class="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 class="text-xl font-bold text-slate-900 dark:text-white">Sales Order Chart</h2>
            <div class="flex items-baseline gap-3 mt-1">
              <span class="text-3xl font-black text-slate-900 dark:text-white">{{ soIndividualData.data.length }} HSO</span>
              <span class="text-lg font-bold text-emerald-600 dark:text-emerald-400">{{ formatCurrencyShort(soIndividualData.total) }}</span>
            </div>
          </div>

          <div class="flex flex-col gap-3">
            <!-- Date Filter -->
            <div class="flex flex-wrap gap-1.5">
              <button v-for="f in [{v:'all',l:'Semua'},{v:'today',l:'Hari Ini'},{v:'week',l:'Minggu'},{v:'month',l:'Bulan Ini'},{v:'year',l:'Tahun Ini'},{v:'lastYear',l:'Tahun Lalu'}]" :key="f.v"
                @click="poDateFilter = f.v"
                :class="['px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', poDateFilter === f.v ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700']"
              >{{ f.l }}</button>
            </div>
            <!-- Status Filter -->
            <div class="flex flex-wrap gap-1.5">
              <button v-for="f in [{v:'all',l:'Semua',dot:''},{v:'terproses',l:'Terproses',dot:'bg-blue-500'},{v:'menunggu',l:'Menunggu',dot:'bg-emerald-500'},{v:'lainnya',l:'Lainnya',dot:'bg-red-500'}]" :key="f.v"
                @click="statusFilter = f.v"
                :class="['inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', statusFilter === f.v ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700']"
              >
                <span v-if="f.dot" :class="['w-1.5 h-1.5 rounded-full', f.dot]"></span>
                {{ f.l }}
              </button>
            </div>
            <!-- Custom Date -->
            <div class="flex items-center gap-2 text-xs text-slate-500">
              <input type="date" v-model="poCustomStartDate" @change="poDateFilter='custom'"
                class="px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300"/>
              <span>→</span>
              <input type="date" v-model="poCustomEndDate" @change="poDateFilter='custom'"
                class="px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300"/>
            </div>
          </div>
        </div>
      </div>

      <div class="p-6">
        <div v-if="isLoading" class="h-72 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse flex items-center justify-center">
          <Loader2 class="w-8 h-8 text-slate-400 animate-spin"/>
        </div>

        <div v-else-if="soIndividualData.data.length === 0" class="flex flex-col items-center justify-center py-16 text-slate-400">
          <Package class="w-14 h-14 mb-3 opacity-30"/>
          <p class="text-sm font-medium">Tidak ada SO untuk periode ini</p>
        </div>

        <div v-else>
          <!-- Zoom Controls -->
          <div class="flex items-center justify-between gap-4 mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
            <div class="flex items-center gap-3">
              <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Zoom</span>
              <button @click="chartZoom = Math.max(30, chartZoom-10)" :disabled="chartZoom<=30"
                class="w-7 h-7 flex items-center justify-center rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 disabled:opacity-40 transition-all shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              </button>
              <input type="range" v-model="chartZoom" min="30" max="200" step="10"
                class="w-28 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full appearance-none cursor-pointer accent-slate-900 dark:accent-white"/>
              <button @click="chartZoom = Math.min(200, chartZoom+10)" :disabled="chartZoom>=200"
                class="w-7 h-7 flex items-center justify-center rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 disabled:opacity-40 transition-all shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              </button>
              <span class="text-xs font-bold text-slate-700 dark:text-slate-300 w-10 text-center">{{ chartZoom }}px</span>
            </div>
            <div class="flex gap-1">
              <button v-for="z in [50,100,150,200]" :key="z" @click="chartZoom=z"
                :class="['px-2.5 py-1 rounded-lg text-xs font-semibold transition-all', chartZoom===z ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-100']">
                {{ z }}%
              </button>
            </div>
          </div>

          <!-- Chart -->
          <div class="relative bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700/50 overflow-x-auto">
            <div class="flex pb-20 items-end" :style="`gap: ${Math.max(chartZoom/25,2)}px; min-width: max-content;`">
              <div v-for="(item) in soIndividualData.data" :key="item.id"
                class="group relative flex flex-col items-center"
                :style="`min-width: ${chartZoom}px; max-width: ${chartZoom}px;`">

                <!-- Amount label above bar -->
                <div v-if="chartZoom >= 60"
                  class="font-bold mb-1 text-center whitespace-nowrap overflow-hidden"
                  :class="[
                    chartZoom < 80 ? 'text-[8px]' : 'text-[10px]',
                    item.color === 'blue' ? 'text-blue-600 dark:text-blue-400' : item.color === 'green' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                  ]">
                  {{ chartZoom < 80 ? (item.amount/1e6).toFixed(0)+'jt' : formatCurrencyShort(item.amount) }}
                </div>

                <!-- Bar -->
                <div class="relative w-full" :style="`height: ${Math.max(chartZoom*2.5,150)}px;`">
                  <div class="absolute bottom-0 left-0 right-0 w-full transition-all cursor-pointer rounded-t-md"
                    :class="{
                      'bg-gradient-to-t from-blue-600 to-blue-400 hover:from-blue-700 hover:to-blue-500': item.color === 'blue',
                      'bg-gradient-to-t from-emerald-600 to-emerald-400 hover:from-emerald-700 hover:to-emerald-500': item.color === 'green',
                      'bg-gradient-to-t from-red-600 to-red-400 hover:from-red-700 hover:to-red-500': item.color === 'red'
                    }"
                    :style="`height: ${Math.max((item.amount/soIndividualData.maxCount)*100,2)}%;`">
                    <!-- Tooltip -->
                    <div class="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap pointer-events-none z-30 shadow-xl border border-slate-700">
                      <div class="font-bold mb-1">{{ item.number }}</div>
                      <div class="text-slate-300">{{ item.customerName }}</div>
                      <div class="font-bold mt-1" :class="item.color === 'blue' ? 'text-blue-300' : item.color === 'green' ? 'text-emerald-300' : 'text-red-300'">
                        {{ formatCurrency(item.amount) }}
                      </div>
                      <div class="text-slate-400 text-[10px] mt-0.5">{{ item.date }} • {{ item.status }}</div>
                    </div>
                  </div>
                </div>

                <!-- Labels below -->
                <div class="flex flex-col items-center gap-0.5 text-center mt-1.5 w-full overflow-hidden">
                  <div class="font-bold text-slate-700 dark:text-slate-300 w-full truncate px-0.5"
                    :class="{ 'text-[8px]': chartZoom < 60, 'text-[9px]': chartZoom >= 60 && chartZoom < 100, 'text-[11px]': chartZoom >= 100 }"
                    :title="item.number">
                    {{ chartZoom < 60 ? item.number.split('/').pop() : item.number }}
                  </div>
                  <div v-if="chartZoom >= 50"
                    class="font-medium text-slate-500 dark:text-slate-400 w-full truncate px-0.5"
                    :class="{ 'text-[7px]': chartZoom < 80, 'text-[10px]': chartZoom >= 80 }"
                    :title="item.customerName">
                    {{ chartZoom < 80 ? item.customerName.split(' ')[0] : item.customerName }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Legend -->
          <div class="flex items-center justify-center gap-5 mt-3">
            <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-gradient-to-t from-blue-600 to-blue-400"></span><span class="text-xs text-slate-500 dark:text-slate-400">Terproses</span></div>
            <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-gradient-to-t from-emerald-600 to-emerald-400"></span><span class="text-xs text-slate-500 dark:text-slate-400">Menunggu</span></div>
            <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-gradient-to-t from-red-600 to-red-400"></span><span class="text-xs text-slate-500 dark:text-slate-400">Lainnya</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Stats + Recent HSO Row -->
    <div class="grid gap-6 md:grid-cols-2">
      
      <!-- HSO Status Card -->
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div class="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <TrendingUp class="w-5 h-5 text-blue-500"/>
            <h3 class="font-bold text-slate-900 dark:text-white">HSO Status</h3>
          </div>
          <div class="flex gap-1">
            <button v-for="f in [{v:'week',l:'Minggu'},{v:'month',l:'Bulan'},{v:'year',l:'Tahun'}]" :key="f.v"
              @click="hsoStatusFilter = f.v"
              :class="['px-2.5 py-1 rounded-lg text-xs font-semibold transition-all', hsoStatusFilter===f.v ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800']">
              {{ f.l }}
            </button>
          </div>
        </div>

        <div class="p-6">
          <div v-if="isLoading" class="h-48 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse"></div>
          <div v-else>
            <!-- Total -->
            <div class="text-center mb-6">
              <p class="text-6xl font-black text-slate-900 dark:text-white">{{ hsoStatusData.total }}</p>
              <p class="text-sm text-slate-400 mt-1">Total HSO</p>
            </div>

            <!-- Progress bars -->
            <div class="space-y-4">
              <!-- Terproses -->
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                    <span class="text-sm font-semibold text-slate-700 dark:text-slate-300">Terproses</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-lg font-bold text-blue-600 dark:text-blue-400">{{ hsoStatusData.terproses }}</span>
                    <span class="text-xs text-slate-400">({{ hsoStatusData.terprosesPercent }}%)</span>
                  </div>
                </div>
                <div class="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div class="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-700" :style="`width: ${hsoStatusData.terprosesPercent}%`"></div>
                </div>
              </div>
              <!-- Menunggu -->
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span class="text-sm font-semibold text-slate-700 dark:text-slate-300">Menunggu</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-lg font-bold text-emerald-600 dark:text-emerald-400">{{ hsoStatusData.menunggu }}</span>
                    <span class="text-xs text-slate-400">({{ hsoStatusData.menungguPercent }}%)</span>
                  </div>
                </div>
                <div class="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div class="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700" :style="`width: ${hsoStatusData.menungguPercent}%`"></div>
                </div>
              </div>
              <!-- Lainnya -->
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                    <span class="text-sm font-semibold text-slate-700 dark:text-slate-300">Lainnya</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-lg font-bold text-red-600 dark:text-red-400">{{ hsoStatusData.lainnya }}</span>
                    <span class="text-xs text-slate-400">({{ hsoStatusData.lainnyaPercent }}%)</span>
                  </div>
                </div>
                <div class="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div class="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all duration-700" :style="`width: ${hsoStatusData.lainnyaPercent}%`"></div>
                </div>
              </div>
            </div>

            <!-- Revenue for period -->
            <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span class="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Revenue</span>
              <span class="text-sm font-bold text-emerald-600 dark:text-emerald-400">{{ formatCurrency(hsoStatusData.totalRevenue) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent HSOs -->
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div class="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <Clock class="w-5 h-5 text-violet-500"/>
          <h3 class="font-bold text-slate-900 dark:text-white">HSO Terbaru</h3>
        </div>

        <div class="p-4">
          <div v-if="isLoading" class="space-y-3">
            <div v-for="i in 4" :key="i" class="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse"></div>
          </div>
          <div v-else-if="latestHSOs.length === 0" class="flex flex-col items-center py-12 text-slate-400">
            <Package class="w-12 h-12 mb-2 opacity-30"/>
            <p class="text-sm">Belum ada SO</p>
          </div>
          <div v-else class="space-y-2">
            <div v-for="so in latestHSOs" :key="so.id"
              class="group flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all cursor-pointer"
              @click="router.push(`/sales-orders/${so.number.replace(/\//g, '-')}`)">
              <div class="min-w-0">
                <p class="font-bold text-slate-900 dark:text-white text-sm truncate">{{ so.number }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{{ so.customer }}</p>
              </div>
              <div class="flex items-center gap-3 ml-3 shrink-0">
                <div class="text-right">
                  <p class="text-sm font-bold text-slate-700 dark:text-slate-300">{{ formatCurrencyShort(so.totalAmount) }}</p>
                  <Badge variant="outline" :class="getStatusColor(so.statusName)" class="text-[10px] mt-0.5 px-1.5 py-0">
                    {{ so.statusName }}
                  </Badge>
                </div>
                <ArrowUpRight class="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors"/>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Customer Analytics -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
      <div class="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
        <div class="p-1.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
          <Users class="w-4 h-4 text-emerald-600 dark:text-emerald-400"/>
        </div>
        <h3 class="font-bold text-slate-900 dark:text-white">Top 20 Customer</h3>
        <span class="text-xs text-slate-400 ml-1">berdasarkan total nilai pesanan</span>
      </div>

      <div class="p-6">
        <div v-if="isLoading" class="space-y-2">
          <div v-for="i in 5" :key="i" class="h-14 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse"></div>
        </div>
        <div v-else-if="customerAnalytics.length === 0" class="text-center py-12 text-slate-400">
          Tidak ada data customer
        </div>
        <div v-else class="overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
          <Table>
            <TableHeader class="bg-slate-900 dark:bg-slate-950">
              <TableRow class="hover:bg-slate-900 dark:hover:bg-slate-950 border-none">
                <TableHead class="text-slate-400 font-semibold text-xs w-14 text-center">#</TableHead>
                <TableHead class="text-slate-400 font-semibold text-xs">Customer</TableHead>
                <TableHead class="text-slate-400 font-semibold text-xs text-right">Total Nilai</TableHead>
                <TableHead class="text-slate-400 font-semibold text-xs text-center">Jumlah SO</TableHead>
                <TableHead class="text-slate-400 font-semibold text-xs text-right">Rata-rata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="(customer, index) in customerAnalytics" :key="customer.name"
                class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0">
                <TableCell class="text-center">
                  <component v-if="getRankIcon(index)" :is="getRankIcon(index)" :class="getRankColor(index)" class="w-5 h-5 mx-auto"/>
                  <span v-else class="text-xs text-slate-400 font-medium">{{ index+1 }}</span>
                </TableCell>
                <TableCell class="font-semibold text-slate-900 dark:text-white text-sm">{{ customer.name }}</TableCell>
                <TableCell class="text-right">
                  <span class="font-bold text-emerald-600 dark:text-emerald-400">{{ formatCurrencyShort(customer.totalValue) }}</span>
                </TableCell>
                <TableCell class="text-center">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                    {{ customer.orderCount }} SO
                  </span>
                </TableCell>
                <TableCell class="text-right text-sm text-slate-500 dark:text-slate-400">{{ formatCurrencyShort(customer.averageValue) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>

  </div>
</template>