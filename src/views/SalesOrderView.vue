<script setup>
import { onMounted, ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  Search, RefreshCw, FileText, ArrowRight, Loader2, 
  Calendar as CalendarIcon, XCircle, ChevronLeft, ChevronRight, 
  Download, FileSpreadsheet, File as FileIcon, Filter,
  ChevronsUpDown, ArrowUp, ArrowDown, Check, X
} from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()

// --- STATE ---
const salesOrders = ref([])
const isLoading = ref(false)
const currentPage = ref(1)
const itemsPerPage = ref(10)

// --- FILTER STATE ---
const searchQuery = ref('')
const startDate = ref('')
const endDate = ref('')
const statusFilter = ref([]) 
const isInitialLoad = ref(true) // Flag to prevent page reset on initial load

// Opsi Status Accurate
const availableStatuses = [
  'Diajukan', 'Disetujui', 'Ditutup', 'Draf', 
  'Menunggu diproses', 'Sebagian diproses', 'Terproses', 'Ditolak'
]

// --- SORTING STATE ---
const sortKey = ref('date') 
const sortOrder = ref('desc')

// --- URL PERSISTENCE ---
const loadFiltersFromUrl = () => {
  const q = route.query
  if (q.search) searchQuery.value = q.search
  if (q.start) startDate.value = q.start
  if (q.end) endDate.value = q.end
  if (q.status) statusFilter.value = q.status.split(',')
  if (q.page) currentPage.value = parseInt(q.page)
  if (q.sort) sortKey.value = q.sort
  if (q.order) sortOrder.value = q.order
  if (q.limit) itemsPerPage.value = parseInt(q.limit)
}

const updateUrlParams = () => {
  const query = {}
  if (searchQuery.value) query.search = searchQuery.value
  if (startDate.value) query.start = startDate.value
  if (endDate.value) query.end = endDate.value
  if (statusFilter.value.length > 0) query.status = statusFilter.value.join(',')
  if (currentPage.value > 1) query.page = currentPage.value
  if (sortKey.value !== 'date') query.sort = sortKey.value
  if (sortOrder.value !== 'desc') query.order = sortOrder.value
  if (itemsPerPage.value !== 10) query.limit = itemsPerPage.value

  router.replace({ query })
}

// --- DATA FETCHING ---
const fetchOrders = async () => {
  isLoading.value = true
  const { data, error } = await supabase.functions.invoke('accurate-list-so')

  if (error) {
    console.error("Error:", error)
  } else if (data && data.d) {
    salesOrders.value = data.d.map(item => ({
      id_database: item.id,
      no_so: item.number,
      client: item.customer?.name || 'Tanpa Nama',
      date: item.transDate,
      amount: Math.round(item.totalAmount), 
      status: item.statusName || '', 
      progress: item.percentShipped || 0 
    }))
  }
  isLoading.value = false
}

onMounted(() => {
  loadFiltersFromUrl()
  fetchOrders()
  // Set flag to false after initial load completes
  setTimeout(() => {
    isInitialLoad.value = false
  }, 100)
})

// --- HELPERS ---
const parseAccurateDate = (dateStr) => {
  if (!dateStr) return new Date(0)
  const parts = dateStr.split('/')
  return new Date(parts[2], parts[1] - 1, parts[0])
}

const formatShortDate = (dateStr) => {
    if (!dateStr) return '-'
    const date = parseAccurateDate(dateStr)
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

const formatCurrency = (val) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val)
}

// --- LOGIC MULTI SELECT ---
const toggleStatus = (status) => {
  if (statusFilter.value.includes(status)) {
    statusFilter.value = statusFilter.value.filter(s => s !== status)
  } else {
    statusFilter.value.push(status)
  }
}

const removeStatus = (status) => {
    statusFilter.value = statusFilter.value.filter(s => s !== status)
}

const isStatusSelected = (status) => statusFilter.value.includes(status)

const hasActiveFilters = computed(() => {
    return searchQuery.value || startDate.value || endDate.value || statusFilter.value.length > 0
})

// --- FILTERING & SORTING CORE ---
const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = 'asc'
  }
}

const filteredAndSortedOrders = computed(() => {
  let result = [...salesOrders.value]

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(so => 
      so.client.toLowerCase().includes(query) || 
      so.no_so.toLowerCase().includes(query)
    )
  }

  if (startDate.value || endDate.value) {
    result = result.filter(so => {
      const itemDate = parseAccurateDate(so.date)
      let validStart = true
      let validEnd = true
      if (startDate.value) {
        const start = new Date(startDate.value); start.setHours(0,0,0,0)
        if (itemDate < start) validStart = false
      }
      if (endDate.value) {
        const end = new Date(endDate.value); end.setHours(23,59,59,999)
        if (itemDate > end) validEnd = false
      }
      return validStart && validEnd
    })
  }

  if (statusFilter.value.length > 0) {
    result = result.filter(so => statusFilter.value.includes(so.status))
  }

  result.sort((a, b) => {
    let valA = a[sortKey.value]
    let valB = b[sortKey.value]

    if (sortKey.value === 'date') {
        valA = parseAccurateDate(a.date).getTime()
        valB = parseAccurateDate(b.date).getTime()
    } else if (sortKey.value === 'amount' || sortKey.value === 'progress') {
        valA = Number(valA)
        valB = Number(valB)
    } else {
        valA = String(valA).toLowerCase()
        valB = String(valB).toLowerCase()
    }

    if (valA < valB) return sortOrder.value === 'asc' ? -1 : 1
    if (valA > valB) return sortOrder.value === 'asc' ? 1 : -1
    return 0
  })

  return result
})

watch([searchQuery, startDate, endDate, statusFilter, currentPage, sortKey, sortOrder, itemsPerPage], () => {
  updateUrlParams()
}, { deep: true })

watch([searchQuery, startDate, endDate, statusFilter], () => { 
  // Only reset to page 1 if not initial load (i.e., user is actively filtering)
  if (!isInitialLoad.value && currentPage.value !== 1) {
    currentPage.value = 1
  }
})

// Pagination
const totalPages = computed(() => Math.ceil(filteredAndSortedOrders.value.length / itemsPerPage.value))
const paginatedOrders = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return filteredAndSortedOrders.value.slice(start, start + itemsPerPage.value)
})

const pageTotalAmount = computed(() => {
    return paginatedOrders.value.reduce((sum, item) => sum + item.amount, 0)
})

const nextPage = () => { if (currentPage.value < totalPages.value) currentPage.value++ }
const prevPage = () => { if (currentPage.value > 1) currentPage.value-- }

// --- FILTER TANGGAL ---
const setDateFilter = (type) => {
  const now = new Date()
  const formatDate = (d) => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
  }

  if (type === 'today') { 
      startDate.value = formatDate(now)
      endDate.value = formatDate(now) 
  } else if (type === 'week') {
    const day = now.getDay() || 7
    const startOfWeek = new Date(now)
    if (day !== 1) startOfWeek.setHours(-24 * (day - 1))
    startDate.value = formatDate(startOfWeek)
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)
    endDate.value = formatDate(endOfWeek)
  } else if (type === 'month') {
    startDate.value = formatDate(new Date(now.getFullYear(), now.getMonth(), 1))
    endDate.value = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  }
}

const dateRangeLabel = computed(() => {
  if (startDate.value && endDate.value) {
    if (startDate.value === endDate.value) return new Date(startDate.value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
    const start = new Date(startDate.value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
    const end = new Date(endDate.value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
    return `${start} - ${end}`
  }
  return "Filter Tanggal"
})

const resetFilter = () => { 
    searchQuery.value = ''
    startDate.value = '' 
    endDate.value = ''
    statusFilter.value = [] 
    sortKey.value = 'date'
    sortOrder.value = 'desc' 
}

// --- EXPORT ---
const getFilename = (ext) => `Laporan_SalesOrder_${new Date().toISOString().split('T')[0]}.${ext}`

const exportToExcel = () => {
  const dataToExport = filteredAndSortedOrders.value.map(so => ({
    "No SO": so.no_so, "Customer": so.client, "Tanggal": so.date, "Status": so.status, "Progress": so.progress + '%', "Nilai": so.amount
  }))
  const ws = XLSX.utils.json_to_sheet(dataToExport)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Sales Orders")
  XLSX.writeFile(wb, getFilename('xlsx'))
}

const exportToPDF = () => {
  const doc = new jsPDF()
  doc.text("Laporan Sales Order", 14, 15)
  const rows = filteredAndSortedOrders.value.map(so => [so.no_so, so.client, so.date, so.status, so.progress + '%', formatCurrency(so.amount)])
  autoTable(doc, { head: [["No SO", "Customer", "Tanggal", "Status", "Progress", "Nilai"]], body: rows, startY: 25, headStyles: { fillColor: [185, 28, 28] } })
  doc.save(getFilename('pdf'))
}

const getStatusColor = (status) => {
  switch (status) {
    case 'Terproses': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
    case 'Ditutup': return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
    case 'Draf': return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'
    case 'Diajukan': return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800'
    case 'Menunggu diproses': return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800'
    case 'Sebagian diproses': return 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800'
    case 'Ditolak': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
    default: return 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
  }
}
</script>

<template>
  <div class="space-y-6 pb-20 font-source-code text-slate-900 dark:text-slate-100">
    
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors duration-300">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Sales Orders</h2>
        <p class="text-slate-500 dark:text-slate-400 text-sm mt-1">Total: {{ salesOrders.length }} Pesanan</p>
      </div>
      <div class="flex gap-2 w-full md:w-auto">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" class="gap-2 w-full md:w-auto border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
              <Download class="w-4 h-4" /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="dark:bg-slate-800 dark:border-slate-700">
            <DropdownMenuItem @click="exportToExcel" class="dark:hover:bg-slate-700 dark:text-slate-300"><FileSpreadsheet class="w-4 h-4 mr-2 text-green-600" /> Excel</DropdownMenuItem>
            <DropdownMenuItem @click="exportToPDF" class="dark:hover:bg-slate-700 dark:text-slate-300"><FileIcon class="w-4 h-4 mr-2 text-red-600" /> PDF</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" @click="fetchOrders" :disabled="isLoading" class="w-full md:w-auto bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 text-white">
          <RefreshCw class="w-4 h-4 mr-2" :class="{'animate-spin': isLoading}" /> 
          {{ isLoading ? 'Loading...' : 'Sync Accurate' }}
        </Button>
      </div>
    </div>

    <div class="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4 transition-colors duration-300">
      <div class="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
        <Filter class="w-4 h-4 text-red-600 dark:text-red-400"/> FILTER & PENCARIAN
      </div>
      
      <div class="flex flex-col md:flex-row gap-3">
        <div class="relative flex-1">
          <Search class="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Cari No. SO atau Nama Customer..." 
            class="pl-9 h-10 bg-slate-50 border-slate-200 focus:bg-white dark:bg-slate-900 dark:border-slate-700 dark:focus:bg-slate-950 dark:text-white transition-all w-full" 
            v-model="searchQuery"
          />
        </div>

        <div class="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <DropdownMenu>
                <DropdownMenuTrigger as-child>
                    <Button 
                        variant="outline" 
                        class="w-full sm:w-auto justify-start text-left font-normal h-10 min-w-[150px] transition-colors"
                        :class="startDate ? 'text-red-600 border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400' : 'text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'"
                    >
                        <CalendarIcon class="w-4 h-4 mr-2" />
                        {{ dateRangeLabel }}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent class="w-72 p-3 dark:bg-slate-800 dark:border-slate-700" align="end">
                    <DropdownMenuLabel class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Pintas Waktu</DropdownMenuLabel>
                    <div class="grid grid-cols-3 gap-2 mb-3">
                        <Button variant="outline" size="sm" class="text-xs h-8 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700" @click="setDateFilter('today')">Hari Ini</Button>
                        <Button variant="outline" size="sm" class="text-xs h-8 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700" @click="setDateFilter('week')">Minggu Ini</Button>
                        <Button variant="outline" size="sm" class="text-xs h-8 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700" @click="setDateFilter('month')">Bulan Ini</Button>
                    </div>
                    <DropdownMenuSeparator class="dark:bg-slate-700"/>
                    <div class="space-y-3 mt-3">
                        <div class="grid gap-1">
                            <Label class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Dari</Label>
                            <Input type="date" v-model="startDate" class="h-8 text-xs dark:bg-slate-900 dark:border-slate-600 dark:text-white"/>
                        </div>
                        <div class="grid gap-1">
                            <Label class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Sampai</Label>
                            <Input type="date" v-model="endDate" class="h-8 text-xs dark:bg-slate-900 dark:border-slate-600 dark:text-white"/>
                        </div>
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
                <DropdownMenuTrigger as-child>
                    <Button 
                        variant="outline" 
                        class="h-10 w-full sm:w-[180px] justify-between bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
                        :class="{'border-red-300 text-red-600 dark:border-red-800 dark:text-red-400': statusFilter.length > 0}"
                    >
                        <span class="truncate">
                            {{ statusFilter.length === 0 ? 'Semua Status' : `${statusFilter.length} Status Dipilih` }}
                        </span>
                        <ChevronDown class="w-4 h-4 opacity-50" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent class="w-[220px] dark:bg-slate-800 dark:border-slate-700 p-2" align="end">
                    <DropdownMenuLabel class="text-xs mb-1 text-slate-500">Pilih Status (Bisa Banyak)</DropdownMenuLabel>
                    
                    <div v-for="status in availableStatuses" :key="status" 
                         class="flex items-center gap-3 px-2 py-2 rounded-sm hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-sm dark:text-slate-200 transition-colors"
                         @click.prevent="toggleStatus(status)">
                        
                        <div class="w-4 h-4 border rounded flex items-center justify-center transition-colors" 
                             :class="isStatusSelected(status) ? 'bg-slate-900 border-slate-900 dark:bg-white dark:border-white' : 'border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-900'">
                            <Check v-if="isStatusSelected(status)" class="w-3 h-3 text-white dark:text-slate-900" stroke-width="3" />
                        </div>
                        
                        <span>{{ status }}</span>
                    </div>

                    <DropdownMenuSeparator class="my-2 dark:bg-slate-700"/>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        class="w-full text-xs h-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        @click="statusFilter = []"
                        :disabled="statusFilter.length === 0"
                    >
                        Reset Pilihan Status
                    </Button>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </div>

      <div v-if="hasActiveFilters" class="flex flex-wrap items-center gap-2 pt-2 border-t border-dashed border-slate-200 dark:border-slate-700">
          <span class="text-xs font-bold text-slate-400 uppercase mr-1">Active Filters:</span>
          
          <Badge v-if="searchQuery" variant="secondary" class="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 flex items-center gap-1">
              Search: {{ searchQuery }}
              <X class="w-3 h-3 cursor-pointer" @click="searchQuery = ''"/>
          </Badge>

          <Badge v-if="startDate || endDate" variant="secondary" class="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200 flex items-center gap-1">
              Date: {{ dateRangeLabel }}
              <X class="w-3 h-3 cursor-pointer" @click="{startDate=''; endDate=''}"/>
          </Badge>

          <Badge v-for="status in statusFilter" :key="status" variant="secondary" class="bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200 flex items-center gap-1">
              {{ status }}
              <X class="w-3 h-3 cursor-pointer" @click="removeStatus(status)"/>
          </Badge>

          <button @click="resetFilter" class="text-xs text-red-600 hover:underline font-medium ml-2">Reset All</button>
      </div>

    </div>

    <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden transition-colors duration-300">
      <Table>
        <TableHeader class="bg-slate-900 dark:bg-black">
          <TableRow class="hover:bg-slate-900 dark:hover:bg-black border-none">
            
            <TableHead class="text-white font-bold cursor-pointer hover:bg-slate-800 dark:hover:bg-slate-900 h-12 w-[180px]" @click="toggleSort('no_so')">
                <div class="flex items-center gap-2">No. SO <ChevronsUpDown v-if="sortKey !== 'no_so'" class="w-3 h-3 opacity-50"/> <component :is="sortOrder === 'asc' ? ArrowUp : ArrowDown" v-else class="w-3 h-3 text-red-400"/></div>
            </TableHead>

            <TableHead class="text-white font-bold cursor-pointer hover:bg-slate-800 dark:hover:bg-slate-900" @click="toggleSort('client')">
                <div class="flex items-center gap-2">Customer <ChevronsUpDown v-if="sortKey !== 'client'" class="w-3 h-3 opacity-50"/> <component :is="sortOrder === 'asc' ? ArrowUp : ArrowDown" v-else class="w-3 h-3 text-red-400"/></div>
            </TableHead>

            <TableHead class="hidden md:table-cell text-white font-bold cursor-pointer hover:bg-slate-800 dark:hover:bg-slate-900 w-[140px]" @click="toggleSort('date')">
                <div class="flex items-center gap-2">Tanggal <ChevronsUpDown v-if="sortKey !== 'date'" class="w-3 h-3 opacity-50"/> <component :is="sortOrder === 'asc' ? ArrowUp : ArrowDown" v-else class="w-3 h-3 text-red-400"/></div>
            </TableHead>

            <TableHead class="hidden lg:table-cell text-white font-bold cursor-pointer hover:bg-slate-800 dark:hover:bg-slate-900 w-[160px]" @click="toggleSort('progress')">
                <div class="flex items-center gap-2">Progress <ChevronsUpDown v-if="sortKey !== 'progress'" class="w-3 h-3 opacity-50"/> <component :is="sortOrder === 'asc' ? ArrowUp : ArrowDown" v-else class="w-3 h-3 text-red-400"/></div>
            </TableHead>

            <TableHead class="text-white font-bold cursor-pointer hover:bg-slate-800 dark:hover:bg-slate-900 w-[140px]" @click="toggleSort('status')">
                <div class="flex items-center gap-2">Status <ChevronsUpDown v-if="sortKey !== 'status'" class="w-3 h-3 opacity-50"/> <component :is="sortOrder === 'asc' ? ArrowUp : ArrowDown" v-else class="w-3 h-3 text-red-400"/></div>
            </TableHead>

            <TableHead class="hidden md:table-cell text-right text-white font-bold cursor-pointer hover:bg-slate-800 dark:hover:bg-slate-900 w-[180px]" @click="toggleSort('amount')">
                <div class="flex items-center justify-end gap-2">Nilai (IDR) <ChevronsUpDown v-if="sortKey !== 'amount'" class="w-3 h-3 opacity-50"/> <component :is="sortOrder === 'asc' ? ArrowUp : ArrowDown" v-else class="w-3 h-3 text-red-400"/></div>
            </TableHead>

            <TableHead class="w-[50px] text-white"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="isLoading">
            <TableCell colspan="7" class="h-40 text-center text-slate-500 dark:text-slate-400">
              <div class="flex flex-col items-center justify-center gap-3">
                <Loader2 class="animate-spin w-8 h-8 text-red-600"/> 
                <span class="text-sm font-medium">Sedang mengambil data...</span>
              </div>
            </TableCell>
          </TableRow>

          <TableRow v-else-if="filteredAndSortedOrders.length === 0">
            <TableCell colspan="7" class="h-40 text-center text-slate-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-900">
                Tidak ada data yang sesuai filter.
            </TableCell>
          </TableRow>

          <TableRow v-else v-for="so in paginatedOrders" :key="so.id_database" class="group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0" @click="router.push(`/sales-orders/${so.id_database}`)">
            
            <TableCell class="py-4 font-bold text-slate-900 dark:text-white align-middle">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-slate-100 dark:bg-slate-700 rounded-md text-slate-500 dark:text-slate-300 group-hover:bg-red-50 group-hover:text-red-600 dark:group-hover:bg-red-900/30 dark:group-hover:text-red-400 transition-colors">
                    <FileText class="w-4 h-4" />
                </div>
                {{ so.no_so }}
              </div>
            </TableCell>

            <TableCell class="py-4 align-middle">
              <div class="flex flex-col">
                <span class="font-bold text-slate-700 dark:text-slate-200 text-sm truncate max-w-[250px]" :title="so.client">{{ so.client }}</span>
                <span class="text-[11px] text-slate-400 md:hidden mt-1 font-medium">{{ formatShortDate(so.date) }}</span>
              </div>
            </TableCell>

            <TableCell class="hidden md:table-cell py-4 text-slate-600 dark:text-slate-400 text-sm font-medium align-middle">
                {{ formatShortDate(so.date) }}
            </TableCell>

            <TableCell class="hidden lg:table-cell w-[180px] py-4 align-middle">
              <div class="flex items-center gap-3">
                <div class="h-2 flex-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden border border-slate-200 dark:border-slate-600">
                  <div class="h-full rounded-full transition-all duration-700 ease-out" 
                       :class="so.progress === 100 ? 'bg-green-500' : 'bg-blue-600 dark:bg-blue-500'" 
                       :style="`width: ${so.progress}%`">
                  </div>
                </div>
                <span class="text-xs font-bold text-slate-600 dark:text-slate-300 w-8 text-right">{{ so.progress }}%</span>
              </div>
            </TableCell>

            <TableCell class="py-4 align-middle">
              <Badge variant="outline" class="transition-all duration-300 font-medium px-2.5 py-0.5 rounded text-xs uppercase tracking-wide border shadow-sm" :class="getStatusColor(so.status)">
                {{ so.status }}
              </Badge>
            </TableCell>

            <TableCell class="hidden md:table-cell text-right font-bold text-slate-800 dark:text-slate-200 text-sm py-4 align-middle">
                {{ formatCurrency(so.amount) }}
            </TableCell>

            <TableCell class="py-4 align-middle text-right">
                <ArrowRight class="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-red-600 dark:group-hover:text-red-400 group-hover:translate-x-1 transition-all" />
            </TableCell>

          </TableRow>
        </TableBody>
      </Table>
      
      <div class="flex flex-col sm:flex-row items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 gap-4">
        
        <div class="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <div class="flex items-center gap-2">
                <span class="text-xs text-slate-500 dark:text-slate-400 font-medium">Baris:</span>
                <Select v-model="itemsPerPage" @update:model-value="currentPage = 1">
                    <SelectTrigger class="h-8 w-16 text-xs bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 dark:text-slate-200">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent class="dark:bg-slate-800 dark:border-slate-700">
                        <SelectItem :value="10" class="dark:text-slate-300 dark:focus:bg-slate-700">10</SelectItem>
                        <SelectItem :value="20" class="dark:text-slate-300 dark:focus:bg-slate-700">20</SelectItem>
                        <SelectItem :value="50" class="dark:text-slate-300 dark:focus:bg-slate-700">50</SelectItem>
                        <SelectItem :value="100" class="dark:text-slate-300 dark:focus:bg-slate-700">100</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            
            <div class="hidden sm:block h-4 w-px bg-slate-300 dark:bg-slate-700"></div>

            <div class="text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 shadow-sm">
                Total Nilai Halaman: <span class="font-bold text-slate-900 dark:text-white ml-1">{{ formatCurrency(pageTotalAmount) }}</span>
            </div>
        </div>

        <div class="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <span class="text-xs text-slate-500 dark:text-slate-400 mr-2">
             Hal <strong>{{ currentPage }}</strong> dari <strong>{{ totalPages || 1 }}</strong>
          </span>
          <div class="flex gap-1">
              <Button variant="outline" size="sm" :disabled="currentPage === 1" @click="prevPage" class="h-8 w-8 p-0 border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-red-600 dark:hover:text-red-400"><ChevronLeft class="w-4 h-4"/></Button>
              <Button variant="outline" size="sm" :disabled="currentPage >= totalPages" @click="nextPage" class="h-8 w-8 p-0 border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-red-600 dark:hover:text-red-400"><ChevronRight class="w-4 h-4"/></Button>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>