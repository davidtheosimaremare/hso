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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  Search, RefreshCw, Loader2, 
  ChevronLeft, ChevronRight, ChevronDown, 
  Download, FileSpreadsheet, File as FileIcon, Filter,
  ChevronsUpDown, ArrowUp, ArrowDown, Check, PackageCheck, ArrowRight
} from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()

// --- STATE ---
const receiveItems = ref([])
const isLoading = ref(false)
const currentPage = ref(1)
const itemsPerPage = ref(10)

// --- FILTER STATE ---
const searchQuery = ref('')
const startDate = ref('')
const endDate = ref('')
const statusFilter = ref([]) 
const dateFilterOption = ref('')
const isInitialLoad = ref(true)

// Opsi Status Accurate RI
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
  let query = supabase
    .from('accurate_receive_items')
    .select('id, number, trans_date, vendor_name, status_name, po_number')
    
  const { data, error } = await query.order('trans_date', { ascending: false }).limit(2000)

  if (error) {
    console.error("Error fetching receive items:", error)
  } else if (data) {
    receiveItems.value = data.map(item => ({
      id_database: item.id,
      no_ri: item.number,
      vendor: item.vendor_name || 'Tanpa Nama',
      date: item.trans_date,
      po_number: item.po_number || '-',
      status: item.status_name || ''
    }))
  }
  isLoading.value = false
}

// --- SYNC ACTION ---
const triggerSyncRI = async () => {
  if (!confirm('Sync Penerimaan Barang (RI) dari Accurate sekarang?')) return
  isLoading.value = true
  
  let page = 1
  let totalProcessed = 0
  let hasMore = true
  let errorCount = 0

  try {
    const { data: { session } } = await supabase.auth.getSession()
    const endpoint = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/sync-accurate-receive-items'
    
    while (hasMore) {
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ page })
            })
            
            if (!res.ok) throw new Error(await res.text())
            const result = await res.json()
            
            totalProcessed += result.processed || 0
            hasMore = result.hasMore
            
            if (result.errors?.length > 0) errorCount += result.errors.length

            if (hasMore) {
                page++
                await new Promise(r => setTimeout(r, 500))
            }
        } catch (pageErr) {
            console.error(`Error page ${page}:`, pageErr)
            hasMore = false 
            alert(`Error di halaman ${page}: ${pageErr.message}`)
        }
    }

    if (errorCount > 0) {
        alert(`Sync RI Selesai dengan catatan: ${totalProcessed} data diproses, tapi ada ${errorCount} error.`)
    } else {
        alert(`Sukses! Sync RI selesai. Total ${totalProcessed} data diproses.`)
    }
    
    await fetchOrders()
  } catch (e) {
    console.error(e)
    alert(`Gagal Sync RI: ${e.message}`)
  } finally {
    isLoading.value = false
  }
}

const isSyncing = ref(false)
const lastSyncTime = ref(localStorage.getItem('ri_last_sync'))

const checkAndTriggerAutoSync = async () => {
    const now = Date.now()
    const last = lastSyncTime.value ? parseInt(lastSyncTime.value) : 0
    const diffMinutes = (now - last) / (1000 * 60)
    
    if (diffMinutes > 60 || !last) {
        await runBackgroundSync()
    }
}

const runBackgroundSync = async () => {
    if (isSyncing.value) return
    isSyncing.value = true
    
    let page = 1
    let hasMore = true
    let totalProcessed = 0
    
    try {
        const { data: { session } } = await supabase.auth.getSession()
        const endpoint = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/sync-accurate-receive-items'

        while (hasMore) {
             try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ page })
                })
                
                if (!res.ok) throw new Error(await res.text())
                const result = await res.json()
                
                totalProcessed += result.processed || 0
                hasMore = result.hasMore
                
                if (hasMore) {
                    page++
                    await new Promise(r => setTimeout(r, 1000))
                }
            } catch (pageErr) {
                console.error(`Background Sync Error page ${page}:`, pageErr)
                hasMore = false 
            }
        }
        
        lastSyncTime.value = Date.now().toString()
        localStorage.setItem('ri_last_sync', lastSyncTime.value)
        await fetchOrders()
        
    } catch (e) {
        console.error("Background Sync Failed:", e)
    } finally {
        isSyncing.value = false
    }
}

onMounted(() => {
  loadFiltersFromUrl()
  fetchOrders()
  setTimeout(() => {
    isInitialLoad.value = false
    checkAndTriggerAutoSync()
  }, 100)
})

// --- HELPERS ---
const parseAccurateDate = (dateStr) => {
  if (!dateStr) return new Date(0)
  if (dateStr.includes('/')) {
      const parts = dateStr.split('/')
      return new Date(parts[2], parts[1] - 1, parts[0])
  }
  return new Date(dateStr)
}

const formatShortDate = (dateStr) => {
    if (!dateStr) return '-'
    const date = parseAccurateDate(dateStr)
    if (isNaN(date.getTime())) return dateStr 
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

// --- FILTERING & SORTING CORE ---
const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = 'asc'
  }
}

const applyDateFilter = () => {
  const now = new Date()
  const formatDate = (d) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  if (dateFilterOption.value === 'month') {
    startDate.value = formatDate(new Date(now.getFullYear(), now.getMonth(), 1))
    endDate.value = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  } else if (dateFilterOption.value === 'last_month') {
    startDate.value = formatDate(new Date(now.getFullYear(), now.getMonth() - 1, 1))
    endDate.value = formatDate(new Date(now.getFullYear(), now.getMonth(), 0))
  } else if (dateFilterOption.value === 'year') {
    startDate.value = formatDate(new Date(now.getFullYear(), 0, 1))
    endDate.value = formatDate(new Date(now.getFullYear(), 11, 31))
  } else if (dateFilterOption.value !== 'range') {
    startDate.value = ''
    endDate.value = ''
  }
}

const filteredAndSortedOrders = computed(() => {
  let result = [...receiveItems.value]

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(ri => 
      ri.vendor.toLowerCase().includes(query) || 
      ri.no_ri.toLowerCase().includes(query) ||
      ri.po_number.toLowerCase().includes(query)
    )
  }

  if (startDate.value || endDate.value) {
    result = result.filter(ri => {
      const itemDate = parseAccurateDate(ri.date)
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
    result = result.filter(ri => statusFilter.value.includes(ri.status))
  }

  result.sort((a, b) => {
    let valA = a[sortKey.value]
    let valB = b[sortKey.value]

    if (sortKey.value === 'date') {
        valA = parseAccurateDate(a.date).getTime()
        valB = parseAccurateDate(b.date).getTime()
    } else {
        valA = String(valA || '').toLowerCase()
        valB = String(valB || '').toLowerCase()
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
  if (!isInitialLoad.value && currentPage.value !== 1) {
    currentPage.value = 1
  }
})

// Pagination
const totalPages = computed(() => Math.ceil(filteredAndSortedOrders.value.length / itemsPerPage.value) || 1)
const paginatedOrders = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return filteredAndSortedOrders.value.slice(start, start + itemsPerPage.value)
})

const nextPage = () => { if (currentPage.value < totalPages.value) currentPage.value++ }
const prevPage = () => { if (currentPage.value > 1) currentPage.value-- }

const resetFilter = () => { 
    searchQuery.value = ''
    startDate.value = '' 
    endDate.value = ''
    dateFilterOption.value = ''
    statusFilter.value = [] 
    sortKey.value = 'date'
    sortOrder.value = 'desc' 
}

// --- EXPORT ---
const getFilename = (ext) => `Laporan_PenerimaanBarang_${new Date().toISOString().split('T')[0]}.${ext}`

const exportToExcel = () => {
  const dataToExport = filteredAndSortedOrders.value.map(item => ({
    "No. RI": item.no_ri, "Vendor": item.vendor, "Tanggal": item.date, "No. PO": item.po_number, "Status": item.status
  }))
  const ws = XLSX.utils.json_to_sheet(dataToExport)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Penerimaan Barang")
  XLSX.writeFile(wb, getFilename('xlsx'))
}

const exportToPDF = () => {
  const doc = new jsPDF()
  doc.text("Laporan Penerimaan Barang", 14, 15)
  const rows = filteredAndSortedOrders.value.map(item => [item.no_ri, item.vendor, item.date, item.po_number, item.status])
  autoTable(doc, { head: [["No. RI", "Vendor", "Tanggal", "No. PO", "Status"]], body: rows, startY: 25, headStyles: { fillColor: [185, 28, 28] } })
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

// Logic Select Status
const isStatusSelected = (status) => statusFilter.value.includes(status)
const toggleStatus = (status) => {
  if (statusFilter.value.includes(status)) {
    statusFilter.value = statusFilter.value.filter(s => s !== status)
  } else {
    statusFilter.value.push(status)
  }
}
const selectAllStatuses = () => { statusFilter.value = [...availableStatuses] }
const clearAllStatuses = () => { statusFilter.value = [] }

const statusFilterLabel = computed(() => {
  if (statusFilter.value.length === 0) return 'Semua Status'
  if (statusFilter.value.length === 1) return statusFilter.value[0]
  return `${statusFilter.value.length} Status Dipilih`
})

const hasActiveFilters = computed(() => {
    return searchQuery.value || startDate.value || endDate.value || statusFilter.value.length > 0
})
</script>

<template>
  <div class="space-y-5 pb-20 font-sans">
    
    <!-- Page Header (Identik dengan Penjualan & Penawaran) -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 font-sans">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Penerimaan Barang</h1>
        <p class="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
          <span class="font-bold text-slate-700 dark:text-slate-300">{{ filteredAndSortedOrders.length }}</span> penerimaan ditemukan
          <span v-if="hasActiveFilters" class="text-red-600 dark:text-red-400 font-medium ml-1">(difilter dari {{ receiveItems.length }})</span>
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm" class="h-9 px-3.5 text-xs font-semibold gap-2 border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl transition-all shadow-2xs cursor-pointer">
              <Download class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Ekspor Data</span>
              <ChevronDown class="w-3.5 h-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-44 dark:bg-slate-900 dark:border-slate-800 rounded-xl shadow-xl p-1 font-sans">
            <DropdownMenuItem @click="exportToExcel" class="flex items-center gap-2 text-xs cursor-pointer dark:hover:bg-slate-800">
              <FileSpreadsheet class="w-4 h-4 text-emerald-600" />
              <span>Excel (.xlsx)</span>
            </DropdownMenuItem>
            <DropdownMenuItem @click="exportToPDF" class="flex items-center gap-2 text-xs cursor-pointer dark:hover:bg-slate-800">
              <FileIcon class="w-4 h-4 text-rose-600" />
              <span>PDF (.pdf)</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          @click="triggerSyncRI"
          :disabled="isLoading || isSyncing"
          variant="outline"
          size="sm"
          class="h-9 px-3.5 text-xs font-bold gap-2 border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-white rounded-xl shadow-2xs cursor-pointer"
        >
          <RefreshCw :class="['w-4 h-4 text-red-600', (isLoading || isSyncing) && 'animate-spin']"/>
          {{ isSyncing ? 'Syncing...' : isLoading ? 'Memuat...' : 'Sync Accurate' }}
        </Button>
      </div>
    </div>

    <!-- Filter Card (Desain Persis Penjualan & Penawaran) -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs font-sans">
      <div class="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
        <div class="relative flex-1">
          <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari No. RI, Vendor, atau No. PO..."
            class="w-full bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 pl-10 pr-4 py-2 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/60 focus:border-transparent transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 font-sans"
          />
        </div>

        <!-- Multi-Select Status Dropdown -->
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button class="w-full lg:w-56 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-red-500/60 transition-all font-sans cursor-pointer">
              <div class="flex items-center gap-2 truncate">
                <Filter class="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span class="truncate font-medium text-xs md:text-sm">{{ statusFilterLabel }}</span>
              </div>
              <ChevronDown class="w-4 h-4 text-slate-400 shrink-0 ml-1" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-64 p-2 dark:bg-slate-900 dark:border-slate-800 rounded-xl shadow-xl font-sans">
            <div class="flex items-center justify-between px-2.5 py-1.5 mb-1 border-b border-slate-100 dark:border-slate-800">
              <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status (Multi)</span>
              <div class="flex items-center gap-2">
                <button @click.prevent="selectAllStatuses" class="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer">Semua</button>
                <button @click.prevent="clearAllStatuses" class="text-[11px] font-semibold text-red-600 hover:underline cursor-pointer">Kosongkan</button>
              </div>
            </div>
            <div class="space-y-0.5 max-h-60 overflow-y-auto pr-1">
              <div v-for="st in availableStatuses" :key="st"
                @click.prevent="toggleStatus(st)"
                class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-xs font-medium dark:text-slate-200 transition-colors">
                <div class="w-4 h-4 border rounded flex items-center justify-center transition-all shrink-0"
                  :class="isStatusSelected(st) ? 'bg-red-600 border-red-600 dark:bg-red-500 dark:border-red-500' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'">
                  <Check v-if="isStatusSelected(st)" class="w-3 h-3 text-white" stroke-width="3"/>
                </div>
                <span>{{ st }}</span>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <!-- Date Filter Dropdown -->
        <div class="flex items-center gap-2 w-full lg:w-auto">
          <select v-model="dateFilterOption" @change="applyDateFilter" class="w-full lg:w-44 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/60 transition-all font-sans cursor-pointer">
            <option value="">Semua Tanggal</option>
            <option value="month">Bulan Ini</option>
            <option value="last_month">Bulan Lalu</option>
            <option value="year">Tahun Ini</option>
            <option value="range">Range Tanggal</option>
          </select>
          <template v-if="dateFilterOption === 'range'">
            <input v-model="startDate" type="date" class="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg text-xs outline-none focus:ring-2 focus:ring-red-500/60" />
            <span class="text-slate-300 dark:text-slate-600">—</span>
            <input v-model="endDate" type="date" class="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg text-xs outline-none focus:ring-2 focus:ring-red-500/60" />
          </template>
          <button v-if="hasActiveFilters" @click="resetFilter" class="px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors shrink-0 cursor-pointer">Reset</button>
        </div>
      </div>
    </div>

    <!-- Table Container (Desain Persis Penjualan & Penawaran) -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl shadow-2xs overflow-x-auto font-sans">
      <Table>
        <TableHeader class="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/80 dark:border-slate-800">
          <TableRow class="hover:bg-transparent border-none">
            
            <TableHead class="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white py-3.5 px-4 w-[200px]" @click="toggleSort('no_ri')">
                <div class="flex items-center gap-1.5">
                  No. RI 
                  <component :is="sortKey==='no_ri' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-4 h-4" :class="sortKey==='no_ri' ? 'text-red-600' : 'opacity-30'"/>
                </div>
            </TableHead>

            <TableHead class="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white py-3.5 px-4" @click="toggleSort('vendor')">
                <div class="flex items-center gap-1.5">
                  Vendor 
                  <component :is="sortKey==='vendor' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-4 h-4" :class="sortKey==='vendor' ? 'text-red-600' : 'opacity-30'"/>
                </div>
            </TableHead>

            <TableHead class="hidden md:table-cell text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white w-[140px] py-3.5 px-4" @click="toggleSort('date')">
                <div class="flex items-center gap-1.5">
                  Tanggal 
                  <component :is="sortKey==='date' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-4 h-4" :class="sortKey==='date' ? 'text-red-600' : 'opacity-30'"/>
                </div>
            </TableHead>

            <TableHead class="hidden md:table-cell text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white w-[180px] py-3.5 px-4" @click="toggleSort('po_number')">
                <div class="flex items-center gap-1.5">
                  No. PO 
                  <component :is="sortKey==='po_number' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-4 h-4" :class="sortKey==='po_number' ? 'text-red-600' : 'opacity-30'"/>
                </div>
            </TableHead>

            <TableHead class="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white w-[140px] py-3.5 px-4" @click="toggleSort('status')">
                <div class="flex items-center gap-1.5">
                  Status 
                  <component :is="sortKey==='status' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-4 h-4" :class="sortKey==='status' ? 'text-red-600' : 'opacity-30'"/>
                </div>
            </TableHead>

            <TableHead class="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="isLoading">
            <TableCell colspan="6" class="py-20 text-center">
              <div class="flex flex-col items-center gap-3 text-slate-400">
                <Loader2 class="w-8 h-8 animate-spin text-red-600"/>
                <span class="text-sm font-medium">Sedang mengambil data dari Accurate...</span>
              </div>
            </TableCell>
          </TableRow>

          <TableRow v-else-if="filteredAndSortedOrders.length === 0">
            <TableCell colspan="6" class="py-20 text-center">
              <div class="flex flex-col items-center gap-3 text-slate-400">
                <div class="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                  <PackageCheck class="w-6 h-6 opacity-40"/>
                </div>
                <p class="text-sm font-medium">Tidak ada data penerimaan barang yang sesuai filter</p>
                <button v-if="hasActiveFilters" @click="resetFilter" class="text-sm text-red-600 hover:underline font-semibold cursor-pointer">Reset Filter</button>
              </div>
            </TableCell>
          </TableRow>

          <TableRow 
            v-else 
            v-for="ri in paginatedOrders" 
            :key="ri.id_database" 
            class="group cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800/80 last:border-0"
          >
            <TableCell class="py-4 px-4 align-middle whitespace-nowrap">
              <div class="flex items-center gap-2.5">
                <div class="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 group-hover:bg-red-50 group-hover:text-red-600 dark:group-hover:bg-red-950/30 dark:group-hover:text-red-400 transition-colors">
                  <PackageCheck class="w-4 h-4" />
                </div>
                <span class="text-xs md:text-sm font-bold text-slate-900 dark:text-slate-100 font-sans">
                  {{ ri.no_ri }}
                </span>
              </div>
            </TableCell>

            <TableCell class="py-4 px-4 align-middle whitespace-nowrap">
              <div class="flex flex-col">
                <span class="text-xs md:text-sm font-bold text-slate-900 dark:text-slate-100 font-sans truncate max-w-[250px]" :title="ri.vendor">{{ ri.vendor }}</span>
                <span class="text-[11px] text-slate-400 md:hidden mt-0.5 font-medium">{{ formatShortDate(ri.date) }}</span>
              </div>
            </TableCell>

            <TableCell class="hidden md:table-cell py-4 px-4 align-middle whitespace-nowrap">
              <span class="text-xs md:text-sm font-medium text-slate-600 dark:text-slate-400 font-sans">{{ formatShortDate(ri.date) }}</span>
            </TableCell>

            <TableCell class="hidden md:table-cell py-4 px-4 align-middle whitespace-nowrap">
              <span class="text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-300 font-sans">{{ ri.po_number || '-' }}</span>
            </TableCell>

            <TableCell class="py-4 px-4 align-middle whitespace-nowrap">
              <Badge variant="outline" class="transition-all font-semibold px-2.5 py-0.5 rounded-lg text-xs border shadow-2xs" :class="getStatusColor(ri.status)">
                {{ ri.status }}
              </Badge>
            </TableCell>

            <TableCell class="py-4 px-4 align-middle text-right">
              <ArrowRight class="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-red-600 dark:group-hover:text-red-400 group-hover:translate-x-1 transition-all" />
            </TableCell>

          </TableRow>
        </TableBody>
      </Table>
      
      <!-- Footer Pagination (Persis Penjualan & Penawaran) -->
      <div class="flex flex-col sm:flex-row items-center justify-between p-4 bg-slate-50/60 dark:bg-slate-900/60 border-t border-slate-200/80 dark:border-slate-800 gap-4 font-sans">
        <div class="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-500 dark:text-slate-400 font-medium">Baris per halaman:</span>
            <Select v-model="itemsPerPage" @update:model-value="currentPage = 1">
              <SelectTrigger class="h-8 w-16 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent class="dark:bg-slate-900 dark:border-slate-800">
                <SelectItem :value="10">10</SelectItem>
                <SelectItem :value="20">20</SelectItem>
                <SelectItem :value="50">50</SelectItem>
                <SelectItem :value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400">
            Total <strong class="text-slate-800 dark:text-slate-200">{{ filteredAndSortedOrders.length }}</strong> penerimaan
          </div>
        </div>

        <div class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <span class="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Halaman <strong class="text-slate-800 dark:text-slate-200">{{ currentPage }}</strong> dari <strong class="text-slate-800 dark:text-slate-200">{{ totalPages }}</strong>
          </span>
          <div class="flex items-center gap-1">
            <Button variant="outline" size="sm" :disabled="currentPage === 1" @click="prevPage" class="h-8 w-8 p-0 border-slate-200 dark:border-slate-700">
              <ChevronLeft class="w-4 h-4"/>
            </Button>
            <Button variant="outline" size="sm" :disabled="currentPage >= totalPages" @click="nextPage" class="h-8 w-8 p-0 border-slate-200 dark:border-slate-700">
              <ChevronRight class="w-4 h-4"/>
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
