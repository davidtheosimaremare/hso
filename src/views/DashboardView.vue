<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

// UI Components
import { 
  Card, CardContent, CardHeader, CardTitle 
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { 
  BarChart3, Loader2, TrendingUp, Users, 
  AlertCircle, Package, Trophy, Medal, Award, ShoppingCart, Calendar,
  ChevronLeft, ChevronRight
} from 'lucide-vue-next'

const router = useRouter()
const isLoading = ref(true)
const soList = ref([])
const poList = ref([])

// PO Filter
const poTimeFilter = ref('year') // 'year' or 'month'
const selectedYear = ref(new Date().getFullYear())
const selectedMonth = ref(new Date().getMonth() + 1)

// --- FETCH DATA FROM ACCURATE ---
const fetchData = async () => {
  isLoading.value = true
  
  try {
    // Fetch SOs
    const { data: soData, error: soError } = await supabase.functions.invoke('accurate-list-so')
    
    if (soError) {
      console.error('Error fetching SOs:', soError)
    } else {
      const rawSOs = soData?.d || []
      soList.value = rawSOs.map(so => ({
        id: so.id,
        number: so.number,
        customer: so.customer?.name || 'Unknown',
        transDate: so.transDate,
        totalAmount: so.totalAmount || 0,
        statusName: so.statusName || '',
        percentShipped: so.percentShipped || 0
      }))
    }
    
    // Fetch POs - use dedicated PO list function
    const { data: poData, error: poError } = await supabase.functions.invoke('accurate-list-all-po', {
      body: {
        fields: 'id,number,transDate,statusName,totalAmount,vendor',
        limit: 10000
      }
    })
    
    if (poError) {
      console.error('Error fetching POs:', poError)
    } else {
      console.log('PO data response:', poData)
      
      // Map PO data
      const rawPOs = poData?.d || []
      poList.value = rawPOs.map(po => ({
        id: po.id,
        number: po.number,
        transDate: po.transDate,
        statusName: po.statusName || 'Open',
        totalAmount: po.totalAmount || 0,
        vendorName: po.vendor?.name || 'Unknown'
      }))
      
      console.log(`Loaded ${poList.value.length} POs`)
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    isLoading.value = false
  }
}

// --- PO ANALYTICS ---
// Parse Accurate date format (DD/MM/YYYY)
const parseAccurateDate = (dateStr) => {
  if (!dateStr) return null
  const parts = dateStr.split('/')
  if (parts.length !== 3) return null
  return new Date(parts[2], parts[1] - 1, parts[0])
}

// PO Filter - Simple date range
const poDateFilter = ref('all') // 'all', 'today', 'week', 'month', 'year', 'lastYear', 'custom'
const poCustomStartDate = ref('')
const poCustomEndDate = ref('')
const chartZoom = ref(100) // Zoom percentage (50-200)
const statusFilter = ref('all') // 'all', 'terproses', 'menunggu', 'lainnya'
const hsoStatusFilter = ref('month') // 'week', 'month', 'year'

// Helper function to get candle color based on status
const getCandleColor = (status) => {
  const statusLower = (status || '').toLowerCase()
  if (statusLower.includes('terproses') || statusLower.includes('sebagian') || statusLower.includes('dikirim')) {
    return 'blue' // Terproses
  } else if (statusLower.includes('menunggu') || statusLower.includes('open') || statusLower.includes('baru')) {
    return 'green' // Menunggu
  } else {
    return 'red' // Lainnya (tutup, batal, dll)
  }
}

// HSO Status Summary Data
const hsoStatusData = computed(() => {
  const now = new Date()
  let startDate, endDate
  
  if (hsoStatusFilter.value === 'week') {
    const day = now.getDay() || 7
    startDate = new Date(now)
    startDate.setDate(now.getDate() - (day - 1))
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(startDate)
    endDate.setDate(startDate.getDate() + 6)
    endDate.setHours(23, 59, 59)
  } else if (hsoStatusFilter.value === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  } else {
    startDate = new Date(now.getFullYear(), 0, 1)
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
  }
  
  // Filter SOs by date
  const filteredSOs = soList.value.filter(so => {
    const date = parseAccurateDate(so.transDate)
    return date && date >= startDate && date <= endDate
  })
  
  // Count by status
  let terproses = 0
  let menunggu = 0
  let lainnya = 0
  
  filteredSOs.forEach(so => {
    const color = getCandleColor(so.statusName)
    if (color === 'blue') terproses++
    else if (color === 'green') menunggu++
    else lainnya++
  })
  
  const total = filteredSOs.length
  
  return {
    total,
    terproses,
    menunggu,
    lainnya,
    terprosesPercent: total > 0 ? Math.round((terproses / total) * 100) : 0,
    menungguPercent: total > 0 ? Math.round((menunggu / total) * 100) : 0,
    lainnyaPercent: total > 0 ? Math.round((lainnya / total) * 100) : 0
  }
})

// Get date range based on filter
const getPODateRange = () => {
  const now = new Date()
  let startDate, endDate
  
  if (poDateFilter.value === 'all') {
    // Show all data - use very wide range
    startDate = new Date(1990, 0, 1)
    endDate = new Date(2100, 11, 31, 23, 59, 59)
  } else if (poDateFilter.value === 'today') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  } else if (poDateFilter.value === 'week') {
    const day = now.getDay() || 7
    startDate = new Date(now)
    startDate.setDate(now.getDate() - (day - 1))
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(startDate)
    endDate.setDate(startDate.getDate() + 6)
    endDate.setHours(23, 59, 59)
  } else if (poDateFilter.value === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  } else if (poDateFilter.value === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1)
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
  } else if (poDateFilter.value === 'lastYear') {
    startDate = new Date(now.getFullYear() - 1, 0, 1)
    endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59)
  } else if (poDateFilter.value === 'custom' && poCustomStartDate.value && poCustomEndDate.value) {
    startDate = new Date(poCustomStartDate.value)
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(poCustomEndDate.value)
    endDate.setHours(23, 59, 59)
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  }
  
  return { startDate, endDate }
}

// SO Individual Timeline Data - Individual SOs as candles
const soIndividualData = computed(() => {
  const { startDate, endDate } = getPODateRange()
  
  // Filter SOs within date range
  let filteredSOs = soList.value.filter(so => {
    const date = parseAccurateDate(so.transDate)
    return date && date >= startDate && date <= endDate
  })
  
  // Apply status filter
  if (statusFilter.value !== 'all') {
    filteredSOs = filteredSOs.filter(so => {
      const color = getCandleColor(so.statusName)
      if (statusFilter.value === 'terproses') return color === 'blue'
      if (statusFilter.value === 'menunggu') return color === 'green'
      if (statusFilter.value === 'lainnya') return color === 'red'
      return true
    })
  }
  
  console.log('Filtered SOs:', filteredSOs.length)
  
  // Sort by date
  const sortedSOs = filteredSOs.sort((a, b) => {
    const dateA = parseAccurateDate(a.transDate)
    const dateB = parseAccurateDate(b.transDate)
    return dateA - dateB
  })
  
  // Find max amount for scaling
  const maxAmount = Math.max(...sortedSOs.map(so => so.totalAmount || 0), 1)
  const totalRevenue = sortedSOs.reduce((sum, so) => sum + (so.totalAmount || 0), 0)
  
  return {
    data: sortedSOs.map(so => ({
      id: so.id,
      number: so.number,
      customerName: so.customer || 'Unknown',
      amount: so.totalAmount || 0,
      date: so.transDate,
      status: so.statusName,
      color: getCandleColor(so.statusName) // Add color based on status
    })),
    maxCount: maxAmount,
    total: totalRevenue,
    label: poDateFilter.value === 'all' ? 'Semua Data' :
           poDateFilter.value === 'today' ? 'Hari Ini' :
           poDateFilter.value === 'week' ? 'Minggu Ini' :
           poDateFilter.value === 'month' ? 'Bulan Ini' :
           poDateFilter.value === 'year' ? 'Tahun Ini' :
           poDateFilter.value === 'lastYear' ? 'Tahun Lalu' :
           `${startDate.toLocaleDateString('id-ID')} - ${endDate.toLocaleDateString('id-ID')}`
  }
})


// --- SO STATUS ANALYTICS ---
const statusAnalytics = computed(() => {
  const statusCounts = {}
  const total = soList.value.length
  
  soList.value.forEach(so => {
    const status = so.statusName || 'Unknown'
    statusCounts[status] = (statusCounts[status] || 0) + 1
  })
  
  // Convert to array and calculate percentages
  return Object.entries(statusCounts).map(([status, count]) => ({
    status,
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0
  })).sort((a, b) => b.count - a.count)
})

// --- SO TIMELINE ANALYTICS ---
const soDateFilter = ref('month') // 'today', 'week', 'month', 'custom'
const soCustomStartDate = ref('')
const soCustomEndDate = ref('')

// Get date range based on filter
const getSODateRange = () => {
  const now = new Date()
  let startDate, endDate
  
  if (soDateFilter.value === 'today') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  } else if (soDateFilter.value === 'week') {
    const day = now.getDay() || 7 // Sunday = 7
    startDate = new Date(now)
    startDate.setDate(now.getDate() - (day - 1))
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(startDate)
    endDate.setDate(startDate.getDate() + 6)
    endDate.setHours(23, 59, 59)
  } else if (soDateFilter.value === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  } else if (soDateFilter.value === 'custom' && soCustomStartDate.value && soCustomEndDate.value) {
    startDate = new Date(soCustomStartDate.value)
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(soCustomEndDate.value)
    endDate.setHours(23, 59, 59)
  } else {
    // Default to this month
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  }
  
  return { startDate, endDate }
}

// SO Timeline Data
const soTimelineData = computed(() => {
  const { startDate, endDate } = getSODateRange()
  
  // Filter SOs within date range
  const filteredSOs = soList.value.filter(so => {
    const date = parseAccurateDate(so.transDate)
    return date && date >= startDate && date <= endDate
  })
  
  // Determine grouping based on date range span
  const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
  
  if (daysDiff <= 1) {
    // Group by hour for today
    const hourlyCounts = Array(24).fill(0).map((_, i) => ({
      hour: i,
      count: 0,
      label: `${i}:00`
    }))
    
    filteredSOs.forEach(so => {
      const date = parseAccurateDate(so.transDate)
      if (date) {
        const hour = date.getHours()
        hourlyCounts[hour].count++
      }
    })
    
    const maxCount = Math.max(...hourlyCounts.map(h => h.count), 1)
    return {
      data: hourlyCounts,
      maxCount,
      total: filteredSOs.length,
      label: 'Hari Ini'
    }
  } else if (daysDiff <= 31) {
    // Group by day for week/month
    const days = Math.ceil(daysDiff) + 1
    const dailyCounts = Array(days).fill(0).map((_, i) => {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + i)
      return {
        date: date,
        count: 0,
        label: date.getDate().toString()
      }
    })
    
    filteredSOs.forEach(so => {
      const date = parseAccurateDate(so.transDate)
      if (date) {
        const dayIndex = Math.floor((date - startDate) / (1000 * 60 * 60 * 24))
        if (dayIndex >= 0 && dayIndex < days) {
          dailyCounts[dayIndex].count++
        }
      }
    })
    
    const maxCount = Math.max(...dailyCounts.map(d => d.count), 1)
    return {
      data: dailyCounts,
      maxCount,
      total: filteredSOs.length,
      label: soDateFilter.value === 'week' ? 'Minggu Ini' : 
             soDateFilter.value === 'month' ? 'Bulan Ini' : 
             `${startDate.toLocaleDateString('id-ID')} - ${endDate.toLocaleDateString('id-ID')}`
    }
  } else {
    // Group by month for longer periods
    const months = []
    const current = new Date(startDate)
    while (current <= endDate) {
      months.push({
        year: current.getFullYear(),
        month: current.getMonth(),
        count: 0,
        label: new Date(current.getFullYear(), current.getMonth()).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })
      })
      current.setMonth(current.getMonth() + 1)
    }
    
    filteredSOs.forEach(so => {
      const date = parseAccurateDate(so.transDate)
      if (date) {
        const monthIndex = months.findIndex(m => 
          m.year === date.getFullYear() && m.month === date.getMonth()
        )
        if (monthIndex >= 0) {
          months[monthIndex].count++
        }
      }
    })
    
    const maxCount = Math.max(...months.map(m => m.count), 1)
    return {
      data: months,
      maxCount,
      total: filteredSOs.length,
      label: `${startDate.toLocaleDateString('id-ID')} - ${endDate.toLocaleDateString('id-ID')}`
    }
  }
})

// --- PENDING & PARTIAL SOs ---
// --- RECENT HSOs ---
const latestHSOs = computed(() => {
  return [...soList.value]
    .sort((a, b) => {
      const dateA = parseAccurateDate(a.transDate)
      const dateB = parseAccurateDate(b.transDate)
      return dateB - dateA
    })
    .slice(0, 5)
})

// --- CUSTOMER ANALYTICS ---
const customerAnalytics = computed(() => {
  const customerMap = {}
  
  soList.value.forEach(so => {
    const customer = so.customer
    if (!customerMap[customer]) {
      customerMap[customer] = {
        name: customer,
        totalValue: 0,
        orderCount: 0,
        orders: []
      }
    }
    customerMap[customer].totalValue += so.totalAmount
    customerMap[customer].orderCount += 1
    customerMap[customer].orders.push(so)
  })
  
  // Convert to array and calculate averages
  return Object.values(customerMap)
    .map(customer => ({
      ...customer,
      averageValue: customer.orderCount > 0 
        ? customer.totalValue / customer.orderCount 
        : 0
    }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 20) // Top 20 customers
})

// --- HELPERS ---
const formatCurrency = (val) => {
  return new Intl.NumberFormat('id-ID', { 
    style: 'currency', 
    currency: 'IDR', 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  }).format(val)
}

const getStatusColor = (status) => {
  switch (status) {
    case 'Terproses': 
    case 'Ditutup': 
      return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400'
    case 'Menunggu diproses': 
      return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400'
    case 'Sebagian diproses': 
      return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400'
    case 'Diajukan': 
      return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400'
    case 'Ditolak': 
      return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400'
    default: 
      return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300'
  }
}

const getBarColor = (status) => {
  switch (status) {
    case 'Terproses': 
    case 'Ditutup': 
      return 'bg-green-500'
    case 'Menunggu diproses': 
      return 'bg-amber-500'
    case 'Sebagian diproses': 
      return 'bg-blue-500'
    case 'Diajukan': 
      return 'bg-yellow-500'
    case 'Ditolak': 
      return 'bg-red-500'
    default: 
      return 'bg-slate-400'
  }
}

const getRankIcon = (index) => {
  if (index === 0) return Trophy
  if (index === 1) return Medal
  if (index === 2) return Award
  return null
}

const getRankColor = (index) => {
  if (index === 0) return 'text-yellow-500'
  if (index === 1) return 'text-slate-400'
  if (index === 2) return 'text-amber-600'
  return 'text-slate-400'
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="space-y-6 pb-20 font-source-code text-slate-900 dark:text-slate-100">
    
    <!-- Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <BarChart3 class="w-6 h-6 text-red-600 dark:text-red-400"/>
          <h2 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Sales Order Analytics</h2>
        </div>
        <p class="text-slate-500 dark:text-slate-400 text-sm">Insights dan analisis pesanan dari Accurate</p>
      </div>
      <Button @click="fetchData" :disabled="isLoading" class="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 text-white">
         <Loader2 v-if="isLoading" class="w-4 h-4 mr-2 animate-spin"/>
         {{ isLoading ? 'Memuat...' : 'Refresh Data' }}
      </Button>
    </div>

    <!-- SO Analytics Section - Timeline Chart (Reference Design) -->
    <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
      <CardHeader class="space-y-4">
        <!-- Header with Count and Total -->
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 class="text-2xl font-bold text-slate-900 dark:text-white">
              JUMLAH: {{ soIndividualData.data.length }} HSO
            </h2>
            <p class="text-3xl font-bold text-slate-900 dark:text-white mt-1">
              {{ formatCurrency(soIndividualData.total) }}
            </p>
          </div>
          
          <!-- Filter Buttons -->
          <div class="flex flex-col gap-3">
            <div class="flex gap-2 flex-wrap">
              <Button 
                :variant="poDateFilter === 'all' ? 'default' : 'outline'"
                size="sm"
                @click="poDateFilter = 'all'"
                class="text-xs"
              >
                Semua
              </Button>
              <Button 
                :variant="poDateFilter === 'today' ? 'default' : 'outline'"
                size="sm"
                @click="poDateFilter = 'today'"
                class="text-xs"
              >
                Hari Ini
              </Button>
              <Button 
                :variant="poDateFilter === 'week' ? 'default' : 'outline'"
                size="sm"
                @click="poDateFilter = 'week'"
                class="text-xs"
              >
                Minggu Ini
              </Button>
              <Button 
                :variant="poDateFilter === 'month' ? 'default' : 'outline'"
                size="sm"
                @click="poDateFilter = 'month'"
                class="text-xs"
              >
                Bulan Ini
              </Button>
              <Button 
                :variant="poDateFilter === 'year' ? 'default' : 'outline'"
                size="sm"
                @click="poDateFilter = 'year'"
                class="text-xs"
              >
                Tahun Ini
              </Button>
              <Button 
                :variant="poDateFilter === 'lastYear' ? 'default' : 'outline'"
                size="sm"
                @click="poDateFilter = 'lastYear'"
                class="text-xs"
              >
                Tahun Lalu
              </Button>
            </div>
            
            <!-- Status Filter Buttons -->
            <div class="flex gap-2 flex-wrap">
              <Button 
                :variant="statusFilter === 'all' ? 'default' : 'outline'"
                size="sm"
                @click="statusFilter = 'all'"
                class="text-xs"
              >
                Semua Status
              </Button>
              <Button 
                :variant="statusFilter === 'terproses' ? 'default' : 'outline'"
                size="sm"
                @click="statusFilter = 'terproses'"
                class="text-xs"
              >
                <span class="w-2 h-2 rounded-full bg-blue-500 mr-1"></span>
                Terproses
              </Button>
              <Button 
                :variant="statusFilter === 'menunggu' ? 'default' : 'outline'"
                size="sm"
                @click="statusFilter = 'menunggu'"
                class="text-xs"
              >
                <span class="w-2 h-2 rounded-full bg-green-500 mr-1"></span>
                Menunggu
              </Button>
              <Button 
                :variant="statusFilter === 'lainnya' ? 'default' : 'outline'"
                size="sm"
                @click="statusFilter = 'lainnya'"
                class="text-xs"
              >
                <span class="w-2 h-2 rounded-full bg-red-500 mr-1"></span>
                Lainnya
              </Button>
            </div>
            
            <!-- Date Range Pickers -->
            <div class="flex items-center gap-2 text-sm">
              <span class="text-slate-600 dark:text-slate-400">Dari</span>
              <input 
                type="date" 
                v-model="poCustomStartDate"
                @change="poDateFilter = 'custom'"
                class="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-700"
              />
              <span class="text-slate-600 dark:text-slate-400">→</span>
              <input 
                type="date" 
                v-model="poCustomEndDate"
                @change="poDateFilter = 'custom'"
                class="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-700"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div v-if="isLoading" class="h-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
        
        <div v-else-if="soIndividualData.total === 0" class="text-center py-12 text-slate-500">
          <Package class="w-12 h-12 mx-auto mb-2 opacity-50"/>
          <p>Tidak ada SO untuk periode ini</p>
        </div>
        
        <div v-else>
          <!-- Zoom Controls - Improved -->
          <div class="flex items-center justify-between gap-4 mb-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-slate-600 dark:text-slate-300">Zoom:</span>
              
              <!-- Zoom Out Button -->
              <Button 
                variant="outline" 
                size="sm" 
                @click="chartZoom = Math.max(30, chartZoom - 10)"
                :disabled="chartZoom <= 30"
                class="w-8 h-8 p-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              </Button>
              
              <!-- Slider -->
              <input 
                type="range" 
                v-model="chartZoom" 
                min="30" 
                max="200" 
                step="10"
                class="w-32 h-2 bg-slate-300 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
              />
              
              <!-- Zoom In Button -->
              <Button 
                variant="outline" 
                size="sm" 
                @click="chartZoom = Math.min(200, chartZoom + 10)"
                :disabled="chartZoom >= 200"
                class="w-8 h-8 p-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              </Button>
              
              <!-- Zoom Value -->
              <span class="text-sm font-bold text-slate-700 dark:text-slate-200 w-12 text-center">{{ chartZoom }}px</span>
            </div>
            
            <!-- Preset Buttons -->
            <div class="flex items-center gap-1">
              <Button 
                :variant="chartZoom === 50 ? 'default' : 'outline'"
                size="sm"
                @click="chartZoom = 50"
                class="text-xs px-2"
              >
                50%
              </Button>
              <Button 
                :variant="chartZoom === 100 ? 'default' : 'outline'"
                size="sm"
                @click="chartZoom = 100"
                class="text-xs px-2"
              >
                100%
              </Button>
              <Button 
                :variant="chartZoom === 150 ? 'default' : 'outline'"
                size="sm"
                @click="chartZoom = 150"
                class="text-xs px-2"
              >
                150%
              </Button>
              <Button 
                :variant="chartZoom === 200 ? 'default' : 'outline'"
                size="sm"
                @click="chartZoom = 200"
                class="text-xs px-2"
              >
                Max
              </Button>
            </div>
          </div>
          
          <!-- Timeline Chart - Individual SOs (Reference Design) -->
          <div class="relative bg-slate-50 dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-700 overflow-x-auto">
            
            <!-- Chart Bars - Individual SOs - Dynamic Gap and Size -->
            <div 
              class="flex pb-20" 
              :style="`gap: ${Math.max(chartZoom / 25, 2)}px; min-width: max-content;`"
            >
              <div 
                v-for="(item, index) in soIndividualData.data" 
                :key="item.id"
                class="group relative flex flex-col items-center transition-all"
                :style="`min-width: ${chartZoom}px; max-width: ${chartZoom}px;`"
              >
                <!-- Value Label ABOVE candle - Hidden when zoomed out -->
                <div 
                  v-if="chartZoom >= 60"
                  class="font-semibold mb-1 text-center whitespace-nowrap overflow-hidden"
                  :class="{
                    'text-[8px]': chartZoom < 80,
                    'text-[10px]': chartZoom >= 80,
                    'text-blue-600 dark:text-blue-400': item.color === 'blue',
                    'text-green-600 dark:text-green-400': item.color === 'green',
                    'text-red-600 dark:text-red-400': item.color === 'red'
                  }"
                >
                  {{ chartZoom < 80 ? (item.amount / 1000000).toFixed(0) + 'jt' : formatCurrency(item.amount) }}
                </div>
                
                <!-- Bar Container - Height scales with zoom -->
                <div class="relative w-full" :style="`height: ${Math.max(chartZoom * 2.5, 150)}px;`">
                  <!-- Bar (Candle) - Dynamic Color based on Status -->
                  <div 
                    class="absolute bottom-0 left-0 right-0 w-full transition-all cursor-pointer"
                    :class="{
                      'bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500': item.color === 'blue',
                      'bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-500': item.color === 'green',
                      'bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500': item.color === 'red'
                    }"
                    :style="`height: ${Math.max((item.amount / soIndividualData.maxCount) * 100, 2)}%;`"
                  >
                    <!-- Tooltip - Positioned to overlap halfway with the candle bar -->
                    <div class="absolute left-1/2 top-0 px-3 py-2 bg-slate-900/95 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-30 shadow-lg">
                      <div class="font-bold mb-1">{{ item.number }}</div>
                      <div>{{ item.customerName }}</div>
                      <div 
                        class="font-semibold mt-1"
                        :class="{
                          'text-blue-300': item.color === 'blue',
                          'text-green-300': item.color === 'green',
                          'text-red-300': item.color === 'red'
                        }"
                      >
                        {{ formatCurrency(item.amount) }}
                      </div>
                      <div class="text-slate-300 text-[10px] mt-1">{{ item.date }}</div>
                      <div class="text-slate-400 text-[10px]">Status: {{ item.status }}</div>
                    </div>
                  </div>
                </div>
                
                <!-- Labels BELOW candle - Simplified when zoomed out -->
                <div class="flex flex-col items-center gap-0.5 text-center mt-1 w-full overflow-hidden">
                  <!-- HSO Number - Shorter when zoomed out -->
                  <div 
                    class="font-bold text-slate-800 dark:text-slate-200 w-full truncate px-0.5" 
                    :class="{ 'text-[8px]': chartZoom < 60, 'text-[9px]': chartZoom >= 60 && chartZoom < 100, 'text-[11px]': chartZoom >= 100 }"
                    :title="item.number"
                  >
                    {{ chartZoom < 60 ? item.number.split('/').pop() : item.number }}
                  </div>
                  
                  <!-- Customer Name - Hidden when very zoomed out -->
                  <div 
                    v-if="chartZoom >= 50"
                    class="font-medium text-slate-700 dark:text-slate-300 w-full truncate px-0.5" 
                    :class="{ 'text-[7px]': chartZoom < 80, 'text-[10px]': chartZoom >= 80 }"
                    :title="item.customerName"
                  >
                    {{ chartZoom < 80 ? item.customerName.split(' ')[0] : item.customerName }}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Footer Note -->
          <p class="text-xs text-slate-400 dark:text-slate-500 mt-3 text-center">
            Data diambil dari Accurate
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- Charts Section -->
    <div class="grid gap-6 md:grid-cols-2">

      
      <!-- HSO Status Summary -->
      <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
        <CardHeader>
          <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle class="flex items-center gap-2 text-lg">
              <TrendingUp class="w-5 h-5 text-blue-600"/>
              HSO Status
            </CardTitle>
            
            <!-- Filter Buttons -->
            <div class="flex items-center gap-2">
              <Button 
                :variant="hsoStatusFilter === 'week' ? 'default' : 'outline'"
                size="sm"
                @click="hsoStatusFilter = 'week'"
                class="text-xs"
              >
                Minggu Ini
              </Button>
              <Button 
                :variant="hsoStatusFilter === 'month' ? 'default' : 'outline'"
                size="sm"
                @click="hsoStatusFilter = 'month'"
                class="text-xs"
              >
                Bulan Ini
              </Button>
              <Button 
                :variant="hsoStatusFilter === 'year' ? 'default' : 'outline'"
                size="sm"
                @click="hsoStatusFilter = 'year'"
                class="text-xs"
              >
                Tahun Ini
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div v-if="isLoading" class="h-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
          
          <div v-else>
            <!-- Total HSO -->
            <div class="mb-6 text-center pb-4 border-b border-slate-200 dark:border-slate-700">
              <p class="text-sm text-slate-500 dark:text-slate-400">Total HSO</p>
              <p class="text-5xl font-bold text-slate-900 dark:text-white">{{ hsoStatusData.total }}</p>
            </div>
            
            <!-- Status Grid -->
            <div class="grid grid-cols-3 gap-4">
              <!-- Terproses -->
              <div class="text-center p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                <div class="w-4 h-4 rounded-full bg-blue-500 mx-auto mb-2"></div>
                <p class="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">Terproses</p>
                <p class="text-3xl font-bold text-blue-600 dark:text-blue-400">{{ hsoStatusData.terproses }}</p>
                <p class="text-sm text-blue-500 dark:text-blue-400">({{ hsoStatusData.terprosesPercent }}%)</p>
              </div>
              
              <!-- Menunggu -->
              <div class="text-center p-4 bg-green-50 dark:bg-green-900/30 rounded-lg">
                <div class="w-4 h-4 rounded-full bg-green-500 mx-auto mb-2"></div>
                <p class="text-sm font-medium text-green-700 dark:text-green-300 mb-1">Menunggu</p>
                <p class="text-3xl font-bold text-green-600 dark:text-green-400">{{ hsoStatusData.menunggu }}</p>
                <p class="text-sm text-green-500 dark:text-green-400">({{ hsoStatusData.menungguPercent }}%)</p>
              </div>
              
              <!-- Lainnya -->
              <div class="text-center p-4 bg-red-50 dark:bg-red-900/30 rounded-lg">
                <div class="w-4 h-4 rounded-full bg-red-500 mx-auto mb-2"></div>
                <p class="text-sm font-medium text-red-700 dark:text-red-300 mb-1">Lainnya</p>
                <p class="text-3xl font-bold text-red-600 dark:text-red-400">{{ hsoStatusData.lainnya }}</p>
                <p class="text-sm text-red-500 dark:text-red-400">({{ hsoStatusData.lainnyaPercent }}%)</p>
              </div>
            </div>
            
            <!-- Footer -->
            <p class="text-xs text-slate-400 dark:text-slate-500 mt-4 text-center">
              Data diambil dari Accurate
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- Recent HSOs -->
      <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
        <CardHeader>
          <CardTitle class="flex items-center gap-2 text-lg">
            <Package class="w-5 h-5 text-blue-600"/>
            HSO Terbaru
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="isLoading" class="space-y-3">
            <div v-for="i in 3" :key="i" class="h-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
          </div>
          
          <div v-else-if="latestHSOs.length === 0" class="text-center py-8 text-slate-500">
            <Package class="w-12 h-12 mx-auto mb-2 opacity-50"/>
            <p>Belum ada SO</p>
          </div>
          
          <div v-else class="space-y-3">
            <div 
              v-for="so in latestHSOs" 
              :key="so.id"
              class="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors cursor-pointer group"
              @click="router.push(`/sales-orders/${so.id}`)"
            >
              <div class="flex items-start justify-between mb-2">
                <div>
                  <p class="font-bold text-slate-900 dark:text-white">{{ so.number }}</p>
                  <p class="text-sm text-slate-600 dark:text-slate-400">{{ so.customer }}</p>
                </div>
                <Badge variant="outline" :class="getStatusColor(so.statusName)" class="text-xs">
                  {{ so.statusName }}
                </Badge>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="font-bold text-slate-700 dark:text-slate-300">{{ formatCurrency(so.totalAmount) }}</span>
                <span class="text-slate-500 group-hover:text-blue-600 transition-colors">Lihat Detail →</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Customer Analytics Table -->
    <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-lg">
          <Users class="w-5 h-5 text-green-600"/>
          Top 20 Customer by Total Nilai Pesanan
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="isLoading" class="space-y-2">
          <div v-for="i in 5" :key="i" class="h-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
        </div>
        
        <div v-else-if="customerAnalytics.length === 0" class="text-center py-12 text-slate-500">
          Tidak ada data customer
        </div>
        
        <div v-else class="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <Table>
            <TableHeader class="bg-slate-900 dark:bg-black">
              <TableRow class="hover:bg-slate-900 dark:hover:bg-black border-none">
                <TableHead class="text-white font-bold w-16 text-center">#</TableHead>
                <TableHead class="text-white font-bold">Customer</TableHead>
                <TableHead class="text-white font-bold text-right">Total Nilai</TableHead>
                <TableHead class="text-white font-bold text-center">Jumlah SO</TableHead>
                <TableHead class="text-white font-bold text-right">Rata-rata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow 
                v-for="(customer, index) in customerAnalytics" 
                :key="customer.name"
                class="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0"
              >
                <TableCell class="text-center font-bold">
                  <component 
                    v-if="getRankIcon(index)" 
                    :is="getRankIcon(index)" 
                    :class="getRankColor(index)"
                    class="w-6 h-6 mx-auto"
                  />
                  <span v-else class="text-slate-400">{{ index + 1 }}</span>
                </TableCell>
                <TableCell class="font-bold text-slate-900 dark:text-white">
                  {{ customer.name }}
                </TableCell>
                <TableCell class="text-right font-bold text-green-700 dark:text-green-400">
                  {{ formatCurrency(customer.totalValue) }}
                </TableCell>
                <TableCell class="text-center">
                  <Badge variant="outline" class="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400">
                    {{ customer.orderCount }} SO
                  </Badge>
                </TableCell>
                <TableCell class="text-right text-slate-600 dark:text-slate-400">
                  {{ formatCurrency(customer.averageValue) }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

  </div>
</template>