<script setup>
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { 
  Loader2, TrendingUp, Users, RefreshCw,
  AlertCircle, Package, Trophy, Medal, Award, ShoppingCart,
  ChevronLeft, ChevronRight, ArrowUpRight, Clock, Zap,
  UploadCloud, FileSpreadsheet, Trash2, CheckCircle2, AlertTriangle,
  RefreshCcw, Database, PackageCheck, Truck, ShoppingBag, CheckCircle, XCircle, Info,
  Calendar, FileText, Filter, Receipt
} from 'lucide-vue-next'
import StandingSection from '@/components/dashboard/StandingSection.vue'
import TargetTrajectoryChart from '@/components/dashboard/TargetTrajectoryChart.vue'


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
    // 1. Fetch SO, SQ, SI in parallel (Fast main KPI data)
    const [soRes, sqRes, siRes] = await Promise.allSettled([
      supabase.functions.invoke('accurate-list-so', {
        body: { fields: 'id,number,transDate,customer,totalAmount,statusName,percentShipped,salesman' }
      }),
      supabase.functions.invoke('accurate-list-sq', {
        body: { fields: 'id,number,transDate,customer,totalAmount,statusName,description,salesman' }
      }),
      supabase.functions.invoke('accurate-list-si', {
        body: { fields: 'id,number,transDate,customer,totalAmount,statusName,dueDate,description,salesman', limit: 10000 }
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
      siList.value = (data?.d || []).map(si => {
        const s = (si.statusName || '').toLowerCase().trim()
        const isUnpaid = s.includes('belum') || (s !== 'lunas' && s !== 'paid')
        
        let outstandingVal = 0
        if (si.outstandingAmount !== undefined && si.outstandingAmount !== null) {
          outstandingVal = Number(si.outstandingAmount) || 0
        } else {
          outstandingVal = isUnpaid ? (Number(si.totalAmount) || 0) : 0
        }

        return {
          id: si.id,
          number: si.number,
          customer: si.customer?.name || 'Unknown',
          transDate: si.transDate,
          totalAmount: Number(si.totalAmount) || 0,
          statusName: si.statusName || '',
          dueDate: si.dueDate,
          description: si.description || '',
          outstandingAmount: outstandingVal,
          salesmanName: si.salesman?.name || '-'
        }
      })
    }

    // Clear main UI loader immediately so KPI cards render instantly (~1s)
    isLoading.value = false
    nextTick(() => {
      scrollToMonthCard(selectedMonthIdx.value)
    })

    // 2. Fetch PO list & Supabase Shipments asynchronously in background
    Promise.allSettled([
      supabase.functions.invoke('accurate-list-all-po', {
        body: { fields: 'id,number,transDate,statusName,totalAmount,vendor', limit: 10000 }
      }),
      supabase.from('shipments').select('so_id, item_code, current_status, hpo_number, exwork_date, eta_date, dunex_date, hokiindo_date, exwork_waiting')
    ]).then(([poRes, shipRes]) => {
      if (poRes.status === 'fulfilled' && !poRes.value.error) {
        const data = poRes.value.data
        poList.value = (data?.d || []).map(po => ({
          id: po.id, number: po.number, transDate: po.transDate,
          statusName: po.statusName || 'Open', totalAmount: Number(po.totalAmount) || 0,
          vendorName: po.vendor?.name || 'Unknown'
        }))
      }
      if (shipRes.status === 'fulfilled' && shipRes.value.data) {
        shipmentsList.value = shipRes.value.data
      }
    })

  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    isLoading.value = false
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
  } else if (summaryDateFilter.value === 'lastMonth') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0)
    endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
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

  const sqNominal = filteredSQ.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0)
  const soNominal = filteredSO.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0)
  const siNominal = filteredSI.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0)
  const siOutstanding = filteredSI.reduce((sum, item) => sum + (Number(item.outstandingAmount) || 0), 0)
  const siPaid = Math.max(0, siNominal - siOutstanding)

  // Status-based Cohort Win Rate: Count SQs created in period that turned into SO (status Terproses/Disetujui/Ditutup/Sebagian)
  const sqProcessed = filteredSQ.filter(sq => {
    const s = (sq.statusName || '').toLowerCase()
    return s.includes('terproses') || 
           s.includes('disetujui') || 
           s.includes('selesai') || 
           s.includes('closed') || 
           s.includes('ditutup') || 
           s.includes('sebagian')
  })
  const winRatePercent = filteredSQ.length > 0 
    ? Math.min(100, Math.round((sqProcessed.length / filteredSQ.length) * 100))
    : (filteredSO.length > 0 ? 100 : 0)

  // Average SO Value
  const avgSoValue = filteredSO.length > 0 ? Math.round(soNominal / filteredSO.length) : 0

  // Strict SO Invoicing & Fulfillment Alignment (Eliminates Carry-Over Invoicing & Closed SO inflation)
  const soShippedNominal = filteredSO.reduce((sum, item) => {
    const s = (item.statusName || '').toLowerCase().trim()
    const isClosed = s.includes('ditutup') || s.includes('closed') || s.includes('selesai')
    const pct = isClosed ? 100 : Math.min(100, Math.max(0, Number(item.percentShipped) || 0))
    return sum + (Number(item.totalAmount) || 0) * (pct / 100)
  }, 0)
  const soUnshippedNominal = Math.max(0, soNominal - soShippedNominal)
  const shippedPercent = soNominal > 0 ? Math.round((soShippedNominal / soNominal) * 100) : 0
  const unshippedPercent = Math.max(0, 100 - shippedPercent)

  return {
    sales: {
      qty: filteredSO.length,
      nominal: soNominal,
      avgValue: avgSoValue
    },
    pipeline: {
      sqQty: filteredSQ.length,
      sqNominal: sqNominal,
      sqProcessedQty: sqProcessed.length,
      winRate: winRatePercent,
      soQty: filteredSO.length
    },
    invoicing: {
      shippedNominal: soShippedNominal,
      unshippedNominal: soUnshippedNominal,
      shippedPercent: shippedPercent,
      unshippedPercent: unshippedPercent
    }
  }
})

// Target Tahunan: 2024 = 6 Miliar (500 Juta / bulan), 2025 = 12 Miliar (1 Miliar / bulan), 2026+ = 35 Miliar (~2.917 Juta / bulan)
const yearlyTarget = computed(() => {
  if (targetYear.value === 2024) {
    return 6_000_000_000 // 6 Miliar
  }
  if (targetYear.value === 2025) {
    return 12_000_000_000 // 12 Miliar
  }
  return 35_000_000_000 // 35 Miliar
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
      const amountBeforePPn = (Number(so.totalAmount) || 0) * 0.89
      monthlyActuals[monthIdx] += amountBeforePPn
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
    const isCurrentMonth = isCurrentYear && idx === now.getMonth()
    const isFutureMonth = isCurrentYear && idx > now.getMonth()

    // For current ongoing month, carry over position relative to last completed month
    const prevTarget = runCumulativeTarget - targetMonthly
    const effectiveVarianceYTD = isCurrentMonth 
      ? (runCumulativeActual >= runCumulativeTarget ? varianceYTD : runCumulativeActual - prevTarget)
      : varianceYTD

    let ytdStatus = 'Sesuai Target'
    let ytdStatusKey = 'ontrack'
    if (isFutureMonth) {
      ytdStatus = 'Belum Mulai'
      ytdStatusKey = 'upcoming'
    } else {
      if (effectiveVarianceYTD >= 0) {
        ytdStatus = 'Diatas Target'
        ytdStatusKey = 'ahead'
      } else {
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
      varianceYTD: isFutureMonth ? null : effectiveVarianceYTD, // YTD Difference (+/-)
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
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Dashboard</h1>
        <p class="text-slate-500 dark:text-slate-400 text-sm mt-0.5">Insights dan analisis pesanan</p>
      </div>
      <Button
        @click="fetchData"
        :disabled="isLoading"
        variant="outline"
        size="sm"
        class="gap-2"
      >
        <RefreshCw :class="['w-4 h-4', isLoading && 'animate-spin']"/>
        {{ isLoading ? 'Memuat...' : 'Refresh' }}
      </Button>
    </div>


    <!-- Summary Section: Filter Toolbar + 3 Main Cards (HSQ, HSO, HSI) -->
    <div class="space-y-4">
      <!-- Filter Toolbar (Shadcn Segmented Control / Tabs style) -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-foreground">Filter Periode Ringkasan</span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="inline-flex items-center rounded-lg border border-border bg-muted p-1 text-muted-foreground">
            <button v-for="f in [
              { v: 'all', l: 'Semua Periode' },
              { v: 'month', l: 'Bulan Ini' },
              { v: 'lastMonth', l: 'Bulan Lalu' },
              { v: 'year', l: 'Tahun Ini' },
              { v: 'lastYear', l: 'Tahun Lalu' },
              { v: 'custom', l: 'Range Tanggal' }
            ]" :key="f.v"
              @click="summaryDateFilter = f.v"
              :class="[
                'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                summaryDateFilter === f.v 
                  ? 'bg-background text-foreground shadow-xs' 
                  : 'hover:bg-background/50 hover:text-foreground'
              ]"
            >
              {{ f.l }}
            </button>
          </div>

          <!-- Custom Date Inputs -->
          <div v-if="summaryDateFilter === 'custom'" class="flex items-center gap-2">
            <input type="date" v-model="summaryCustomStartDate"
              class="h-8 px-2.5 rounded-md border border-input bg-background text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            <span class="text-xs text-muted-foreground">s/d</span>
            <input type="date" v-model="summaryCustomEndDate"
              class="h-8 px-2.5 rounded-md border border-input bg-background text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
        </div>
      </div>

      <!-- 3 Executive KPI Cards (Shadcn UI Standard) -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <!-- 1. EFEKTIVITAS PENAWARAN (WIN RATE) -->
        <Card class="shadow-xs transition-shadow hover:shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <CardTitle class="text-sm font-semibold">Efektivitas Penawaran</CardTitle>
                <Badge variant="outline" class="text-[11px] font-normal text-muted-foreground">Win Rate %</Badge>
              </div>
              <CardDescription class="text-xs">Rasio konversi dari penawaran ke SO</CardDescription>
            </div>
            <TrendingUp class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent class="pt-4">
            <div v-if="isLoading" class="space-y-2">
              <div class="h-8 w-24 bg-muted rounded animate-pulse"></div>
              <div class="h-4 w-32 bg-muted rounded animate-pulse"></div>
            </div>
            <div v-else class="grid grid-cols-2 gap-4">
              <div class="space-y-1">
                <p class="text-xs font-medium text-muted-foreground">Win Rate Konversi</p>
                <p class="text-2xl font-bold tracking-tight text-foreground">{{ summaryData.pipeline.winRate }}%</p>
                <p class="text-xs text-muted-foreground">{{ summaryData.pipeline.sqProcessedQty }} Deal / {{ summaryData.pipeline.sqQty }} SQ</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-medium text-muted-foreground">Total Penawaran</p>
                <p class="text-xl font-bold tracking-tight text-foreground truncate" :title="formatCurrency(summaryData.pipeline.sqNominal)">
                  {{ formatCurrencyShort(summaryData.pipeline.sqNominal) }}
                </p>
                <p class="text-xs text-muted-foreground truncate" :title="formatCurrency(summaryData.pipeline.sqNominal)">
                  {{ summaryData.pipeline.sqQty }} Penawaran Masuk
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 2. OMBET PENJUALAN (SALES ORDER) -->
        <Card class="shadow-xs transition-shadow hover:shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <CardTitle class="text-sm font-semibold">Omzet Penjualan</CardTitle>
                <Badge variant="outline" class="text-[11px] font-normal text-muted-foreground">Realisasi SO</Badge>
              </div>
              <CardDescription class="text-xs">Total pesanan penjualan terbit periode terpilih</CardDescription>
            </div>
            <ShoppingCart class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent class="pt-4">
            <div v-if="isLoading" class="space-y-2">
              <div class="h-8 w-24 bg-muted rounded animate-pulse"></div>
              <div class="h-4 w-32 bg-muted rounded animate-pulse"></div>
            </div>
            <div v-else class="grid grid-cols-2 gap-4">
              <div class="space-y-1">
                <p class="text-xs font-medium text-muted-foreground">Total Omzet</p>
                <p class="text-2xl font-bold tracking-tight text-foreground truncate" :title="formatCurrency(summaryData.sales.nominal)">
                  {{ formatCurrencyShort(summaryData.sales.nominal) }}
                </p>
                <p class="text-xs text-muted-foreground truncate" :title="formatCurrency(summaryData.sales.nominal)">
                  {{ formatCurrency(summaryData.sales.nominal) }}
                </p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-medium text-muted-foreground">Volume & Rata-rata</p>
                <p class="text-xl font-bold tracking-tight text-foreground">{{ summaryData.sales.qty }} <span class="text-xs font-normal text-muted-foreground">SO</span></p>
                <p class="text-xs text-muted-foreground truncate" :title="`Rata-rata: ${formatCurrency(summaryData.sales.avgValue)} / SO`">
                  Avg: {{ formatCurrencyShort(summaryData.sales.avgValue) }} / SO
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 3. REALISASI FAKTUR & PENAGIHAN SO (EXCLUDING CARRY-OVER) -->
        <Card class="shadow-xs transition-shadow hover:shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <CardTitle class="text-sm font-semibold">Realisasi Pengiriman</CardTitle>
                <Badge variant="outline" class="text-[11px] font-normal text-muted-foreground">Progres SO</Badge>
              </div>
              <CardDescription class="text-xs">Status pengiriman & penagihan SO</CardDescription>
            </div>
            <Receipt class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent class="pt-4">
            <div v-if="isLoading" class="space-y-2">
              <div class="h-8 w-24 bg-muted rounded animate-pulse"></div>
              <div class="h-4 w-32 bg-muted rounded animate-pulse"></div>
            </div>
            <div v-else class="grid grid-cols-2 gap-4">
              <div class="space-y-1">
                <p class="text-xs font-medium text-muted-foreground">Sudah Kirim & Tagih</p>
                <p class="text-2xl font-bold tracking-tight text-foreground truncate" :title="formatCurrency(summaryData.invoicing.shippedNominal)">
                  {{ formatCurrencyShort(summaryData.invoicing.shippedNominal) }}
                </p>
                <p class="text-xs text-muted-foreground truncate" :title="`Realisasi: ${summaryData.invoicing.shippedPercent}% dari Total Omzet SO (${formatCurrency(summaryData.sales.nominal)})`">
                  {{ summaryData.invoicing.shippedPercent }}% Selesai
                </p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-medium text-muted-foreground">Belum Kirim & Tagih</p>
                <p class="text-xl font-bold tracking-tight text-amber-600 dark:text-amber-400 truncate" :title="formatCurrency(summaryData.invoicing.unshippedNominal)">
                  {{ formatCurrencyShort(summaryData.invoicing.unshippedNominal) }}
                </p>
                <p class="text-xs text-muted-foreground truncate" :title="`Sisa Belum Difakturkan: ${formatCurrency(summaryData.invoicing.unshippedNominal)}`">
                  {{ summaryData.invoicing.unshippedPercent }}% Dalam Proses
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>

    <!-- Task Prioritas Sales & Logistik Section (Priority Work Center) -->
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
    <Card>
      <!-- Section Header -->
      <CardHeader>
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <CardTitle class="text-lg font-semibold text-slate-900 dark:text-white">Target Penjualan {{ targetSalesData.year }}</CardTitle>
              <Badge variant="outline" class="text-xs font-medium">{{ formatCurrencyShort(targetSalesData.yearlyTarget) }} / Tahun</Badge>
            </div>
            <CardDescription class="text-xs mt-1">Evaluasi bulanan (Target Sales: {{ formatCurrencyShort(targetSalesData.monthlyTargetBase) }}/bulan) & posisi YTD terhadap target tahunan</CardDescription>
          </div>

          <div class="flex items-center gap-3">
            <!-- Year Selector -->
            <div class="flex items-center gap-1.5">
              <span class="text-sm text-muted-foreground">Tahun:</span>
              <select v-model="targetYear" class="h-8 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer">
                <option :value="2024">2024</option>
                <option :value="2025">2025</option>
                <option :value="2026">2026</option>
              </select>
            </div>

            <!-- Carousel Prev / Next Controls -->
            <div class="flex items-center gap-1 p-1 rounded-md border border-border bg-muted">
              <button @click="prevMonth" :disabled="selectedMonthIdx === 0"
                class="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-background disabled:opacity-30 transition-colors cursor-pointer">
                <ChevronLeft class="w-4 h-4" />
              </button>
              <span class="text-sm font-medium text-foreground px-1 min-w-[80px] text-center">
                {{ monthShortNames[selectedMonthIdx] }} {{ targetSalesData.year }}
              </span>
              <button @click="nextMonth" :disabled="selectedMonthIdx === 11"
                class="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-background disabled:opacity-30 transition-colors cursor-pointer">
                <ChevronRight class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent class="space-y-6">
        <!-- Executive Overview -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Target Annual -->
          <div class="rounded-xl border border-border bg-card p-4 space-y-1 shadow-2xs">
            <p class="text-xs font-medium text-muted-foreground">Target {{ targetYear }}</p>
            <p class="text-2xl font-bold tracking-tight text-foreground">{{ formatCurrencyShort(targetSalesData.yearlyTarget) }}</p>
            <p class="text-xs text-muted-foreground truncate" :title="`${formatCurrency(targetSalesData.monthlyTargetBase)} / Bulan`">
              {{ formatCurrencyShort(targetSalesData.monthlyTargetBase) }} / Bulan
            </p>
          </div>

          <!-- Actual HSO -->
          <div class="rounded-xl border border-border bg-card p-4 space-y-1 shadow-2xs">
            <p class="text-xs font-medium text-muted-foreground">Realisasi Sales {{ targetYear }}</p>
            <p class="text-2xl font-bold tracking-tight text-foreground">{{ formatCurrencyShort(targetSalesData.totalActualYear) }}</p>
            <p class="text-xs text-muted-foreground truncate" :title="formatCurrency(targetSalesData.totalActualYear)">
              {{ formatCurrency(targetSalesData.totalActualYear) }}
            </p>
          </div>

          <!-- Annual Gap (No Negative Sign) -->
          <div class="rounded-xl border border-border bg-card p-4 space-y-1 shadow-2xs">
            <p class="text-xs font-medium text-muted-foreground">Annual Gap</p>
            <p class="text-2xl font-bold tracking-tight text-foreground">
              {{ formatCurrencyShort(Math.abs(targetSalesData.totalVarianceYear)) }}
            </p>
            <p class="text-xs font-medium truncate" :class="targetSalesData.totalVarianceYear >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'">
              {{ targetSalesData.totalVarianceYear >= 0 ? 'Diatas Target' : 'Sisa Target Tahunan' }}
            </p>
          </div>

          <!-- Total Achievement -->
          <div class="rounded-xl border border-border bg-card p-4 space-y-1 shadow-2xs">
            <p class="text-xs font-medium text-muted-foreground">Pencapaian Tahunan</p>
            <p class="text-2xl font-bold tracking-tight text-foreground">{{ targetSalesData.totalAchievementYearPercent }}%</p>
            <div class="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
              <div class="h-full bg-primary rounded-full transition-all duration-500"
                :style="`width: ${Math.min(targetSalesData.totalAchievementYearPercent, 100)}%`"></div>
            </div>
          </div>
        </div>

        <!-- Quick Month Navigation Pills Bar -->
        <div class="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          <div class="flex items-center gap-1.5">
            <button v-for="(mName, idx) in monthShortNames" :key="idx"
              @click="selectMonth(idx)"
              :class="[
                'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors cursor-pointer',
                selectedMonthIdx === idx 
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' 
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              ]">
              <span v-if="idx === new Date().getMonth() && targetYear === new Date().getFullYear()" class="w-1 h-1 rounded-full bg-current"></span>
              {{ mName }}
            </button>
          </div>

          <span class="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline-block">
            Geser / klik bulan untuk fokus
          </span>
        </div>

        <!-- Main Body: Horizontal Month Carousel Slider Container (With Padding to prevent border clipping) -->
        <div ref="monthCarouselRef" class="flex gap-4 overflow-x-auto snap-x snap-mandatory py-2.5 px-2 -mx-2 sidebar-thin no-scrollbar">
          
          <div v-for="m in targetSalesData.monthlyBreakdown" :key="m.monthIdx"
            :data-month-idx="m.monthIdx"
            @click="selectMonth(m.monthIdx)"
            :class="[
              'min-w-[320px] sm:min-w-[340px] max-w-[360px] shrink-0 snap-center rounded-xl border transition-all duration-300 flex flex-col justify-between p-5 cursor-pointer',
              selectedMonthIdx === m.monthIdx
                ? 'ring-2 ring-primary border-primary/50 bg-card shadow-sm'
                : 'bg-card/60 border-border hover:border-muted-foreground/30'
            ]">
            
            <!-- Top Section -->
            <div>
              <!-- Card Header -->
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2">
                  <h4 class="font-bold text-foreground text-base">{{ m.monthName }} {{ targetSalesData.year }}</h4>
                </div>
                <Badge variant="secondary" class="text-xs font-semibold">{{ m.qtyMonthly }} SO</Badge>
              </div>

              <!-- SECTION A: Monthly Performance (Primary KPI) -->
              <div class="rounded-lg border border-border bg-muted/20 p-4 space-y-3 mb-4">
                <div class="flex justify-between items-center">
                  <span class="text-xs font-semibold text-muted-foreground">Kinerja Bulan Ini</span>
                  <span class="text-xs font-bold" :class="[
                    m.monthlyAchievementPercent >= 100 ? 'text-emerald-600 dark:text-emerald-400'
                      : m.monthlyAchievementPercent >= 80 ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground'
                  ]">
                    {{ m.monthlyAchievementPercent }}%
                  </span>
                </div>

                <div class="space-y-2 text-xs">
                  <div class="flex justify-between items-center text-muted-foreground">
                    <span>Target Bulan</span>
                    <span class="font-semibold text-foreground">{{ formatCurrencyShort(m.targetMonthly) }}</span>
                  </div>
                  <div class="flex justify-between items-center text-muted-foreground">
                    <span>Penjualan Aktual</span>
                    <span class="font-semibold text-foreground" :title="formatCurrency(m.actualMonthly)">
                      {{ formatCurrencyShort(m.actualMonthly) }}
                    </span>
                  </div>
                  <div class="flex justify-between items-center pt-2 border-t border-border text-muted-foreground">
                    <span>Selisih Bulan</span>
                    <span :class="['font-semibold', m.varianceMonthly >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400']" :title="formatCurrency(m.varianceMonthly)">
                      {{ m.varianceMonthly >= 0 ? '+' : '' }}{{ formatCurrencyShort(Math.abs(m.varianceMonthly)) }}
                    </span>
                  </div>
                </div>

                <!-- Monthly Only Progress Bar -->
                <div>
                  <div class="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div :class="[
                      'h-full rounded-full transition-all duration-300',
                      m.monthlyAchievementPercent >= 100 ? 'bg-emerald-500' : m.monthlyAchievementPercent >= 80 ? 'bg-amber-500' : 'bg-primary/60'
                    ]" :style="`width: ${Math.min(m.monthlyAchievementPercent, 100)}%`"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- SECTION B: YTD Position (Secondary KPI - Compact ERP Info Panel) -->
            <div class="rounded-lg border border-border bg-muted/40 p-4">
              <div class="flex items-center justify-between text-xs mb-3">
                <span class="font-semibold text-foreground">Posisi YTD</span>
                <Badge variant="outline" class="text-[11px] font-normal">
                  <span :class="[
                    'w-1.5 h-1.5 rounded-full mr-1.5',
                    m.ytdStatusKey === 'ahead' ? 'bg-emerald-500' : m.ytdStatusKey === 'ontrack' ? 'bg-sky-500' : m.ytdStatusKey === 'upcoming' ? 'bg-muted-foreground/40' : 'bg-amber-500'
                  ]"></span>
                  {{ m.ytdStatus }}
                </Badge>
              </div>

              <div class="grid grid-cols-3 gap-2 text-xs text-muted-foreground pt-2.5 border-t border-border">
                <div>
                  <p class="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Target YTD</p>
                  <p class="font-semibold text-foreground truncate" :title="formatCurrency(m.runCumulativeTarget)">
                    {{ formatCurrencyShort(m.runCumulativeTarget) }}
                  </p>
                </div>
                <div>
                  <p class="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Aktual YTD</p>
                  <p class="font-semibold text-foreground truncate" :title="formatCurrency(m.runCumulativeActual)">
                    {{ formatCurrencyShort(m.runCumulativeActual) }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Deviasi</p>
                  <p :class="['font-semibold truncate', m.varianceYTD === null ? 'text-muted-foreground' : m.varianceYTD >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400']" :title="formatCurrency(m.varianceYTD)">
                    {{ m.varianceYTD === null ? '-' : (m.varianceYTD >= 0 ? '+' : '-') + formatCurrencyShort(Math.abs(m.varianceYTD)) }}
                  </p>
                </div>
              </div>
            </div>

          </div>

        </div>

        <!-- Target Journey Trajectory Chart Component -->
        <TargetTrajectoryChart :targetSalesData="targetSalesData" :isLoading="isLoading" class="mt-6" />
      </CardContent>
    </Card>

  </div>
</template>