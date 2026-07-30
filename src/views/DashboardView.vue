<script setup>
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue'
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
  ChevronLeft, ChevronRight, ArrowUpRight, Clock, Zap,
  UploadCloud, FileSpreadsheet, Trash2, CheckCircle2, AlertTriangle,
  RefreshCcw, Database, PackageCheck, Truck, ShoppingBag, CheckCircle, XCircle, Info
} from 'lucide-vue-next'
import StandingSection from '@/components/dashboard/StandingSection.vue'


const router = useRouter()
const isLoading = ref(true)
const sqList = ref([])
const soList = ref([])
const siList = ref([])
const poList = ref([])

// Summary Date Filter (HSQ, HSO, HSI Cards)
const summaryDateFilter = ref('month') // 'month', 'year', 'lastYear', 'custom'
const summaryCustomStartDate = ref('')
const summaryCustomEndDate = ref('')

// PO & Chart Filter
const poDateFilter = ref('year')
const poCustomStartDate = ref('')
const poCustomEndDate = ref('')
const chartZoom = ref(100)
const statusFilter = ref('all')
const hsoStatusFilter = ref('month')

// Target Penjualan & Month Carousel Controller
const targetYear = ref(new Date().getFullYear())
const targetViewMode = ref('table') // 'table' or 'grid'
const selectedMonthIdx = ref(new Date().getMonth())
const monthCarouselRef = ref(null)
const shipmentsList = ref([])

const monthShortNames = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
]

const selectMonth = (idx) => {
  selectedMonthIdx.value = idx
  scrollToMonthCard(idx)
}

const prevMonth = () => {
  if (selectedMonthIdx.value > 0) {
    selectMonth(selectedMonthIdx.value - 1)
  }
}

const nextMonth = () => {
  if (selectedMonthIdx.value < 11) {
    selectMonth(selectedMonthIdx.value + 1)
  }
}

const scrollToMonthCard = (idx) => {
  nextTick(() => {
    if (!monthCarouselRef.value) return
    const cardEl = monthCarouselRef.value.querySelector(`[data-month-idx="${idx}"]`)
    if (cardEl) {
      const container = monthCarouselRef.value
      const targetLeft = cardEl.offsetLeft - (container.clientWidth / 2) + (cardEl.clientWidth / 2)
      container.scrollTo({ left: targetLeft, behavior: 'smooth' })
    }
  })
}

watch(targetYear, () => {
  scrollToMonthCard(selectedMonthIdx.value)
})

const fetchData = async () => {
  isLoading.value = true
  try {
    const [soRes, sqRes, siRes, poRes] = await Promise.allSettled([
      supabase.functions.invoke('accurate-list-so', {
        body: { fields: 'id,number,transDate,customer,totalAmount,statusName,percentShipped,salesman' }
      }),
      supabase.functions.invoke('accurate-list-sq', {
        body: { fields: 'id,number,transDate,customer,totalAmount,statusName,description,salesman' }
      }),
      supabase.functions.invoke('accurate-list-si', {
        body: { fields: 'id,number,transDate,customer,totalAmount,statusName,dueDate,outstandingAmount,salesman' }
      }),
      supabase.functions.invoke('accurate-list-all-po', {
        body: { fields: 'id,number,transDate,statusName,totalAmount,vendor', limit: 10000 }
      })
    ])

    if (soRes.status === 'fulfilled' && !soRes.value.error) {
      const data = soRes.value.data
      soList.value = (data?.d || []).map(so => ({
        id: so.id,
        number: so.number,
        customer: so.customer?.name || 'Unknown',
        transDate: so.transDate,
        totalAmount: Number(so.totalAmount) || 0,
        statusName: so.statusName || '',
        percentShipped: so.percentShipped || 0,
        salesmanName: so.salesman?.name || '-'
      }))
    }

    if (sqRes.status === 'fulfilled' && !sqRes.value.error) {
      const data = sqRes.value.data
      sqList.value = (data?.d || []).map(sq => ({
        id: sq.id,
        number: sq.number,
        customer: sq.customer?.name || 'Unknown',
        transDate: sq.transDate,
        totalAmount: Number(sq.totalAmount) || 0,
        statusName: sq.statusName || '',
        salesmanName: sq.salesman?.name || '-'
      }))
    }

    if (siRes.status === 'fulfilled' && !siRes.value.error) {
      const data = siRes.value.data
      siList.value = (data?.d || []).map(si => ({
        id: si.id,
        number: si.number,
        customer: si.customer?.name || 'Unknown',
        transDate: si.transDate,
        totalAmount: Number(si.totalAmount) || 0,
        statusName: si.statusName || '',
        dueDate: si.dueDate,
        outstandingAmount: Number(si.outstandingAmount) || Number(si.totalAmount) || 0,
        salesmanName: si.salesman?.name || '-'
      }))
    }

    if (poRes.status === 'fulfilled' && !poRes.value.error) {
      const data = poRes.value.data
      poList.value = (data?.d || []).map(po => ({
        id: po.id, number: po.number, transDate: po.transDate,
        statusName: po.statusName || 'Open', totalAmount: Number(po.totalAmount) || 0,
        vendorName: po.vendor?.name || 'Unknown'
      }))
    }

    // Fetch logistics shipments from Supabase
    const { data: shipData } = await supabase
      .from('shipments')
      .select('so_id, item_code, current_status, hpo_number, exwork_date, eta_date, dunex_date, hokiindo_date, exwork_waiting')
    
    if (shipData) {
      shipmentsList.value = shipData
    }
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
  } finally {
    isLoading.value = false
    nextTick(() => {
      scrollToMonthCard(selectedMonthIdx.value)
    })
  }
}

const parseInputDate = (dateStr, isEnd = false) => {
  if (!dateStr) return null
  const parts = dateStr.split('-')
  if (parts.length !== 3) return null
  if (isEnd) {
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59)
  }
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0)
}

const getSummaryDateRange = () => {
  const now = new Date()
  let startDate, endDate
  if (summaryDateFilter.value === 'all') {
    startDate = new Date(1990, 0, 1, 0, 0, 0)
    endDate = new Date(2100, 11, 31, 23, 59, 59)
  } else if (summaryDateFilter.value === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  } else if (summaryDateFilter.value === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0)
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
  } else if (summaryDateFilter.value === 'lastYear') {
    startDate = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0)
    endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59)
  } else if (summaryDateFilter.value === 'custom') {
    if (summaryCustomStartDate.value && summaryCustomEndDate.value) {
      startDate = parseInputDate(summaryCustomStartDate.value, false)
      endDate = parseInputDate(summaryCustomEndDate.value, true)
    } else if (summaryCustomStartDate.value) {
      startDate = parseInputDate(summaryCustomStartDate.value, false)
      endDate = new Date(2100, 11, 31, 23, 59, 59)
    } else if (summaryCustomEndDate.value) {
      startDate = new Date(1990, 0, 1, 0, 0, 0)
      endDate = parseInputDate(summaryCustomEndDate.value, true)
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    }
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  }
  return { startDate, endDate }
}

const summaryData = computed(() => {
  const { startDate, endDate } = getSummaryDateRange()

  const filterByDate = (list) => {
    return list.filter(item => {
      const d = parseAccurateDate(item.transDate)
      return d && d >= startDate && d <= endDate
    })
  }

  const filteredSQ = filterByDate(sqList.value)
  const filteredSO = filterByDate(soList.value)
  const filteredSI = filterByDate(siList.value)

  return {
    hsq: {
      qty: filteredSQ.length,
      nominal: filteredSQ.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0)
    },
    hso: {
      qty: filteredSO.length,
      nominal: filteredSO.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0)
    },
    hsi: {
      qty: filteredSI.length,
      nominal: filteredSI.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0)
    }
  }
})

// Target Tahunan: 2024 = 6 Miliar (500 Juta / bulan), 2025 = 12 Miliar (1 Miliar / bulan), 2026+ = 24 Miliar (2 Miliar / bulan)
const yearlyTarget = computed(() => {
  if (targetYear.value === 2024) {
    return 6_000_000_000 // 6 Miliar
  }
  if (targetYear.value === 2025) {
    return 12_000_000_000 // 12 Miliar
  }
  return 24_000_000_000 // 24 Miliar
})

const monthlyTargetBase = computed(() => yearlyTarget.value / 12)

const monthNames = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

const targetSalesData = computed(() => {
  const selectedYear = targetYear.value
  const baseTargetPerMonth = monthlyTargetBase.value

  const monthlyActuals = Array(12).fill(0)
  const monthlyQtys = Array(12).fill(0)

  soList.value.forEach(so => {
    const d = parseAccurateDate(so.transDate)
    if (d && d.getFullYear() === selectedYear) {
      const monthIdx = d.getMonth()
      monthlyActuals[monthIdx] += (Number(so.totalAmount) || 0)
      monthlyQtys[monthIdx] += 1
    }
  })

  let runCumulativeActual = 0
  let runCumulativeTarget = 0

  const monthlyBreakdown = monthNames.map((name, idx) => {
    const actualMonthly = monthlyActuals[idx]
    const qtyMonthly = monthlyQtys[idx]
    const targetMonthly = baseTargetPerMonth
    const varianceMonthly = actualMonthly - targetMonthly
    const monthlyAchievementPercent = targetMonthly > 0 ? (actualMonthly / targetMonthly) * 100 : 0

    runCumulativeActual += actualMonthly
    runCumulativeTarget += targetMonthly
    const varianceYTD = runCumulativeActual - runCumulativeTarget
    const ytdAchievementPercent = runCumulativeTarget > 0 ? (runCumulativeActual / runCumulativeTarget) * 100 : 0

    const now = new Date()
    const isCurrentYear = selectedYear === now.getFullYear()
    const isFutureMonth = isCurrentYear && idx > now.getMonth()

    let ytdStatus = 'Sesuai Target'
    let ytdStatusKey = 'ontrack'
    if (isFutureMonth) {
      ytdStatus = 'Belum Mulai'
      ytdStatusKey = 'upcoming'
    } else {
      if (varianceYTD > 0) {
        ytdStatus = 'Diatas Target'
        ytdStatusKey = 'ahead'
      } else if (varianceYTD < 0) {
        ytdStatus = 'Di Bawah Target'
        ytdStatusKey = 'behind'
      }
    }

    return {
      monthIdx: idx,
      monthName: name,
      qtyMonthly,
      
      // SECTION A: Monthly Performance (Primary KPI)
      actualMonthly,
      targetMonthly,
      varianceMonthly,
      monthlyAchievementPercent: Math.min(Math.round(monthlyAchievementPercent * 10) / 10, 999),
      
      // SECTION B: Year-to-Date (YTD) Position (Secondary KPI)
      runCumulativeActual: isFutureMonth ? null : runCumulativeActual, // Actual YTD
      runCumulativeTarget, // Expected YTD
      varianceYTD: isFutureMonth ? null : varianceYTD, // YTD Difference (+/-)
      ytdAchievementPercent: isFutureMonth ? 0 : Math.min(Math.round(ytdAchievementPercent * 10) / 10, 999),
      ytdStatus,
      ytdStatusKey
    }
  })

  const totalActualYear = runCumulativeActual
  const totalTargetYear = yearlyTarget.value
  const totalVarianceYear = totalActualYear - totalTargetYear
  const totalAchievementYearPercent = totalTargetYear > 0 ? Math.round((totalActualYear / totalTargetYear) * 1000) / 10 : 0

  return {
    year: selectedYear,
    yearlyTarget: totalTargetYear,
    monthlyTargetBase: baseTargetPerMonth,
    totalActualYear,
    totalVarianceYear,
    totalAchievementYearPercent,
    monthlyBreakdown
  }
})

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
  if (val === null || val === undefined || isNaN(val)) return '-'
  const isNegative = val < 0
  const absVal = Math.abs(val)
  let formatted = ''
  if (absVal >= 1e9) formatted = `${(absVal/1e9).toFixed(1)}M`
  else if (absVal >= 1e6) formatted = `${(absVal/1e6).toFixed(0)}jt`
  else formatted = `${(absVal/1e3).toFixed(0)}rb`
  return isNegative ? `-${formatted}` : formatted
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



let refreshInterval = null

onMounted(() => { 
  fetchData() 
  // Refresh automatically every 5 minutes
  refreshInterval = setInterval(() => {
    fetchData()
  }, 5 * 60 * 1000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
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


    <!-- Summary Section: Filter Toolbar + 3 Main Cards (HSQ, HSO, HSI) -->
    <div class="space-y-4">
      <!-- Filter Toolbar -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div class="flex items-center gap-2">
          <div class="p-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
            <Calendar class="w-4 h-4" />
          </div>
          <span class="text-sm font-bold text-slate-800 dark:text-slate-200">Filter Periode Ringkasan</span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button v-for="f in [
            { v: 'all', l: 'Semua Periode' },
            { v: 'month', l: 'Bulan Ini' },
            { v: 'year', l: 'Tahun Ini' },
            { v: 'lastYear', l: 'Tahun Lalu' },
            { v: 'custom', l: 'Range Tanggal' }
          ]" :key="f.v"
            @click="summaryDateFilter = f.v"
            :class="[
              'px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer',
              summaryDateFilter === f.v 
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            ]"
          >
            {{ f.l }}
          </button>

          <!-- Custom Date Inputs -->
          <div v-if="summaryDateFilter === 'custom'" class="flex items-center gap-2 ml-1">
            <input type="date" v-model="summaryCustomStartDate"
              class="px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span class="text-xs text-slate-400 font-medium">s/d</span>
            <input type="date" v-model="summaryCustomEndDate"
              class="px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      <!-- 3 Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        <!-- 1. TOTAL HSQ -->
        <div class="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
          <div class="absolute -right-6 -top-6 w-28 h-28 bg-blue-50 dark:bg-blue-900/10 rounded-full blur-2xl pointer-events-none"></div>

          <div class="relative z-10">
            <div class="flex items-center justify-between mb-4">
              <span class="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-black tracking-wider uppercase border border-blue-200 dark:border-blue-800/50">
                TOTAL HSQ
              </span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-900/50 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">Sales Quotation</span>
            </div>

            <div v-if="isLoading" class="space-y-3 py-2">
              <div class="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
              <div class="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
            </div>

            <div v-else class="grid grid-cols-2 gap-3 my-1">
              <!-- QTY -->
              <div class="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-700/50">
                <p class="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider mb-1">QTY</p>
                <p class="text-3xl font-black tracking-tight text-slate-800 dark:text-white">{{ summaryData.hsq.qty }}</p>
                <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Penawaran</p>
              </div>

              <!-- Nominal -->
              <div class="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-700/50 overflow-hidden">
                <p class="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider mb-1">Nominal</p>
                <p class="text-xl font-black text-slate-800 dark:text-white truncate" :title="formatCurrency(summaryData.hsq.nominal)">
                  {{ formatCurrencyShort(summaryData.hsq.nominal) }}
                </p>
                <p class="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5" :title="formatCurrency(summaryData.hsq.nominal)">
                  {{ formatCurrency(summaryData.hsq.nominal) }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. TOTAL HSO -->
        <div class="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
          <div class="absolute -right-6 -top-6 w-28 h-28 bg-emerald-50 dark:bg-emerald-900/10 rounded-full blur-2xl pointer-events-none"></div>

          <div class="relative z-10">
            <div class="flex items-center justify-between mb-4">
              <span class="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-black tracking-wider uppercase border border-emerald-200 dark:border-emerald-800/50">
                TOTAL HSO
              </span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-900/50 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">Sales Order</span>
            </div>

            <div v-if="isLoading" class="space-y-3 py-2">
              <div class="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
              <div class="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
            </div>

            <div v-else class="grid grid-cols-2 gap-3 my-1">
              <!-- QTY -->
              <div class="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-700/50">
                <p class="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider mb-1">QTY</p>
                <p class="text-3xl font-black tracking-tight text-slate-800 dark:text-white">{{ summaryData.hso.qty }}</p>
                <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Pesanan (SO)</p>
              </div>

              <!-- Nominal -->
              <div class="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-700/50 overflow-hidden">
                <p class="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider mb-1">Nominal</p>
                <p class="text-xl font-black text-slate-800 dark:text-white truncate" :title="formatCurrency(summaryData.hso.nominal)">
                  {{ formatCurrencyShort(summaryData.hso.nominal) }}
                </p>
                <p class="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5" :title="formatCurrency(summaryData.hso.nominal)">
                  {{ formatCurrency(summaryData.hso.nominal) }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. TOTAL INVOICE (HSI) -->
        <div class="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
          <div class="absolute -right-6 -top-6 w-28 h-28 bg-violet-50 dark:bg-violet-900/10 rounded-full blur-2xl pointer-events-none"></div>

          <div class="relative z-10">
            <div class="flex items-center justify-between mb-4">
              <span class="px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 text-xs font-black tracking-wider uppercase border border-violet-200 dark:border-violet-800/50">
                TOTAL INVOICE
              </span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-900/50 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">Faktur Penjualan (HSI)</span>
            </div>

            <div v-if="isLoading" class="space-y-3 py-2">
              <div class="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
              <div class="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
            </div>

            <div v-else class="grid grid-cols-2 gap-3 my-1">
              <!-- QTY -->
              <div class="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-700/50">
                <p class="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider mb-1">QTY</p>
                <p class="text-3xl font-black tracking-tight text-slate-800 dark:text-white">{{ summaryData.hsi.qty }}</p>
                <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Faktur (HSI)</p>
              </div>

              <!-- Nominal -->
              <div class="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-700/50 overflow-hidden">
                <p class="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider mb-1">Nominal</p>
                <p class="text-xl font-black text-slate-800 dark:text-white truncate" :title="formatCurrency(summaryData.hsi.nominal)">
                  {{ formatCurrencyShort(summaryData.hsi.nominal) }}
                </p>
                <p class="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5" :title="formatCurrency(summaryData.hsi.nominal)">
                  {{ formatCurrency(summaryData.hsi.nominal) }}
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- Standing Hari Ini Section (Priority Work Center) -->
    <StandingSection 
      :sqList="sqList" 
      :soList="soList" 
      :siList="siList" 
      :poList="poList"
      :shipmentsList="shipmentsList"
      :yearlyTarget="yearlyTarget" 
      :targetYear="targetYear" 
      :isLoading="isLoading" 
      @refresh="fetchData"
    />

    <!-- Target Penjualan Section (Compact Horizontal Carousel Slider) -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden space-y-0">
      <!-- Section Header -->
      <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="p-2.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl text-white shadow-md shadow-amber-500/20">
            <Trophy class="w-5 h-5" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-xl font-extrabold text-slate-900 dark:text-white">Target Penjualan {{ targetSalesData.year }}</h2>
              <span class="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-bold border border-amber-200 dark:border-amber-800">
                {{ formatCurrencyShort(targetSalesData.yearlyTarget) }} / Tahun
              </span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Pemisahan Evaluasi Bulanan (KPI Sales: {{ formatCurrencyShort(targetSalesData.monthlyTargetBase) }}/bulan) & Posisi YTD (Progress Terhadap Target Tahunan)</p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <!-- Year Selector -->
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-semibold text-slate-500">Tahun:</span>
            <select v-model="targetYear" class="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 focus:outline-none cursor-pointer">
              <option :value="2024">2024</option>
              <option :value="2025">2025</option>
              <option :value="2026">2026</option>
            </select>
          </div>

          <!-- Carousel Prev / Next Controls -->
          <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button @click="prevMonth" :disabled="selectedMonthIdx === 0"
              class="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
              title="Bulan Sebelumnya">
              <ChevronLeft class="w-4 h-4" />
            </button>
            <span class="text-xs font-extrabold text-slate-700 dark:text-slate-300 px-1 min-w-[70px] text-center">
              {{ monthShortNames[selectedMonthIdx] }} {{ targetSalesData.year }}
            </span>
            <button @click="nextMonth" :disabled="selectedMonthIdx === 11"
              class="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
              title="Bulan Berikutnya">
              <ChevronRight class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <!-- Executive Overview Banner -->
      <div class="p-6 bg-slate-50/60 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Target Annual -->
          <div class="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
            <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Target Total {{ targetYear }}</p>
            <p class="text-2xl font-black text-slate-900 dark:text-white">{{ formatCurrencyShort(targetSalesData.yearlyTarget) }}</p>
            <p class="text-[11px] text-slate-500 mt-0.5">{{ formatCurrency(targetSalesData.monthlyTargetBase) }} / Bulan</p>
          </div>

          <!-- Actual HSO -->
          <div class="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
            <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Realisasi Sales {{ targetYear }}</p>
            <p class="text-2xl font-black text-emerald-600 dark:text-emerald-400">{{ formatCurrencyShort(targetSalesData.totalActualYear) }}</p>
            <p class="text-[11px] text-slate-500 mt-0.5 truncate" :title="formatCurrency(targetSalesData.totalActualYear)">
              {{ formatCurrency(targetSalesData.totalActualYear) }}
            </p>
          </div>

          <!-- YTD Position Summary -->
          <div class="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
            <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Deviasi YTD {{ targetYear }}</p>
            <p :class="['text-2xl font-black', targetSalesData.totalVarianceYear >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400']">
              {{ targetSalesData.totalVarianceYear >= 0 ? '+' : '' }}{{ formatCurrencyShort(targetSalesData.totalVarianceYear) }}
            </p>
            <p class="text-[11px] text-slate-500 mt-0.5 truncate" :title="formatCurrency(targetSalesData.totalVarianceYear)">
              {{ targetSalesData.totalVarianceYear >= 0 ? 'Diatas Target' : 'Di Bawah Target' }}
            </p>
          </div>

          <!-- Total Achievement -->
          <div class="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
            <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Pencapaian Tahunan</p>
            <div class="flex items-baseline gap-2">
              <p class="text-2xl font-black text-indigo-600 dark:text-indigo-400">{{ targetSalesData.totalAchievementYearPercent }}%</p>
            </div>
            <div class="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-1.5">
              <div class="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
                :style="`width: ${Math.min(targetSalesData.totalAchievementYearPercent, 100)}%`"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Month Navigation Pills Bar -->
      <div class="px-6 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div class="flex items-center gap-1.5">
          <button v-for="(mName, idx) in monthShortNames" :key="idx"
            @click="selectMonth(idx)"
            :class="[
              'px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5',
              selectedMonthIdx === idx 
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md' 
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-700'
            ]">
            <span v-if="idx === new Date().getMonth() && targetYear === new Date().getFullYear()" class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            {{ mName }}
          </button>
        </div>

        <span class="text-[11px] font-semibold text-slate-400 whitespace-nowrap hidden sm:inline-block">
          Geser / klik bulan untuk fokus
        </span>
      </div>

      <!-- Main Body: Horizontal Month Carousel Slider Container -->
      <div class="p-6">
        <div ref="monthCarouselRef" class="flex gap-5 overflow-x-auto snap-x snap-mandatory py-2 px-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
          
          <div v-for="m in targetSalesData.monthlyBreakdown" :key="m.monthIdx"
            :data-month-idx="m.monthIdx"
            @click="selectMonth(m.monthIdx)"
            :class="[
              'min-w-[320px] sm:min-w-[350px] max-w-[370px] shrink-0 snap-center rounded-2xl border transition-all duration-300 flex flex-col justify-between p-5 cursor-pointer',
              selectedMonthIdx === m.monthIdx
                ? 'ring-2 ring-blue-500/80 dark:ring-blue-400/80 border-blue-400 dark:border-blue-600 bg-white dark:bg-slate-900 shadow-xl transform scale-[1.01]'
                : 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700/80 opacity-85 hover:opacity-100 hover:border-slate-300 dark:hover:border-slate-600'
            ]">
            
            <!-- Top Section -->
            <div>
              <!-- Card Header -->
              <div class="flex items-center justify-between mb-3.5">
                <div class="flex items-center gap-2">
                  <h4 class="font-black text-slate-900 dark:text-white text-base">{{ m.monthName }} {{ targetSalesData.year }}</h4>
                </div>
                <span class="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300/50 dark:border-slate-600/50">
                  {{ m.qtyMonthly }} SO
                </span>
              </div>

              <!-- SECTION A: Monthly Performance (Primary KPI) -->
              <div class="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-700/70 space-y-2.5 mb-3.5 shadow-2xs">
                <div class="flex justify-between items-center text-xs">
                  <span class="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Kinerja Bulan Ini</span>
                  <span :class="[
                    'text-xs font-black px-2.5 py-0.5 rounded-md border',
                    m.monthlyAchievementPercent >= 100 
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' 
                      : m.monthlyAchievementPercent >= 80 
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-800' 
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                  ]">
                    {{ m.monthlyAchievementPercent }}%
                  </span>
                </div>

                <div class="space-y-1.5 text-xs pt-0.5">
                  <div class="flex justify-between items-center text-slate-500 dark:text-slate-400">
                    <span>Target Bulan:</span>
                    <span class="font-semibold text-slate-700 dark:text-slate-300">{{ formatCurrencyShort(m.targetMonthly) }}</span>
                  </div>
                  <div class="flex justify-between items-center text-slate-500 dark:text-slate-400">
                    <span>Penjualan Aktual:</span>
                    <span class="font-bold text-slate-900 dark:text-white" :title="formatCurrency(m.actualMonthly)">
                      {{ formatCurrencyShort(m.actualMonthly) }}
                    </span>
                  </div>
                  <div class="flex justify-between items-center pt-1.5 border-t border-slate-100 dark:border-slate-700/80">
                    <span class="text-slate-500 dark:text-slate-400">Selisih Bulan:</span>
                    <span :class="['font-extrabold', m.varianceMonthly >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400']" :title="formatCurrency(m.varianceMonthly)">
                      {{ m.varianceMonthly >= 0 ? '+' : '' }}{{ formatCurrencyShort(m.varianceMonthly) }}
                    </span>
                  </div>
                </div>

                <!-- Monthly Only Progress Bar -->
                <div class="pt-0.5">
                  <div class="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div :class="[
                      'h-full rounded-full transition-all duration-300',
                      m.monthlyAchievementPercent >= 100 ? 'bg-emerald-500' : m.monthlyAchievementPercent >= 80 ? 'bg-amber-500' : 'bg-rose-500'
                    ]" :style="`width: ${Math.min(m.monthlyAchievementPercent, 100)}%`"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- SECTION B: YTD Position (Secondary KPI - Compact ERP Info Panel) -->
            <div class="bg-slate-100/90 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
              <div class="flex items-center justify-between text-xs mb-2">
                <span class="font-bold text-slate-800 dark:text-slate-200">Posisi YTD</span>
                <span :class="[
                  'text-xs font-black px-2 py-0.5 rounded-md flex items-center gap-1.5 border',
                  m.ytdStatusKey === 'ahead' 
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' 
                    : m.ytdStatusKey === 'ontrack' 
                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' 
                      : m.ytdStatusKey === 'upcoming'
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                ]">
                  <span :class="[
                    'w-1.5 h-1.5 rounded-full',
                    m.ytdStatusKey === 'ahead' ? 'bg-emerald-500' : m.ytdStatusKey === 'ontrack' ? 'bg-blue-500' : m.ytdStatusKey === 'upcoming' ? 'bg-slate-400' : 'bg-rose-500'
                  ]"></span>
                  {{ m.ytdStatus }}
                </span>
              </div>

              <div class="grid grid-cols-3 gap-1.5 text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200/60 dark:border-slate-700/50">
                <div>
                  <p class="text-[10px] font-semibold uppercase text-slate-400">TARGET YTD</p>
                  <p class="font-bold text-slate-800 dark:text-slate-200 truncate" :title="formatCurrency(m.runCumulativeTarget)">
                    {{ formatCurrencyShort(m.runCumulativeTarget) }}
                  </p>
                </div>
                <div>
                  <p class="text-[10px] font-semibold uppercase text-slate-400">AKTUAL YTD</p>
                  <p class="font-black text-slate-900 dark:text-white truncate" :title="formatCurrency(m.runCumulativeActual)">
                    {{ formatCurrencyShort(m.runCumulativeActual) }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-[10px] font-semibold uppercase text-slate-400">DEVIASI</p>
                  <p :class="['font-black truncate text-xs', m.varianceYTD === null ? 'text-slate-400' : m.varianceYTD >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400']" :title="formatCurrency(m.varianceYTD)">
                    {{ m.varianceYTD === null ? '-' : (m.varianceYTD >= 0 ? '+' : '') + formatCurrencyShort(m.varianceYTD) }}
                  </p>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>

  </div>
</template>