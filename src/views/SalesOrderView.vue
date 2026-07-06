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
  ChevronsUpDown, ArrowUp, ArrowDown, Check, X,
  ShoppingCart
} from 'lucide-vue-next'
import { Checkbox } from '@/components/ui/checkbox'

const router = useRouter()
const route = useRoute()

// --- STATE ---
const salesOrders = ref([])
const isLoading = ref(false)
const currentPage = ref(1)
const itemsPerPage = ref(10)

// --- BULK ACTION STATE ---
const selectedOrders = ref([])
const isBulkDownloading = ref(false)
const bulkProgress = ref(0)
const bulkStatus = ref('')
const isBulkMode = ref(false) // Show checkbox column
const showSaranTooltip = ref(false)

const toggleBulkMode = () => {
  if (isBulkMode.value) {
    // If already in mode and items selected -> download
    if (selectedOrders.value.length > 0) {
      bulkDownloadSaranOrder()
    } else {
      // Toggle off
      isBulkMode.value = false
    }
  } else {
    isBulkMode.value = true
  }
}

const cancelBulkMode = () => {
  isBulkMode.value = false
  selectedOrders.value = []
}

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

// --- MULTI SELECT LOGIC ---
const isAllSelected = computed(() => {
    return paginatedOrders.value.length > 0 && selectedOrders.value.length === paginatedOrders.value.length
})

const toggleSelectAll = () => {
    if (isAllSelected.value) {
        selectedOrders.value = []
    } else {
        selectedOrders.value = paginatedOrders.value.map(so => so.id_database)
    }
}

const toggleSelect = (id, isChecked) => {
    if (selectedOrders.value.includes(id)) {
        selectedOrders.value = selectedOrders.value.filter(item => item !== id)
    } else {
        selectedOrders.value.push(id)
    }
}
// Clear selection when page changes
watch(currentPage, () => {
  selectedOrders.value = []
})

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

// --- BULK DOWNLOAD SARAN ORDER ---
const bulkDownloadSaranOrder = async () => {
    if (selectedOrders.value.length === 0) return
    
    isBulkDownloading.value = true
    bulkProgress.value = 0
    let allItemsToPurchase = []
    
    try {
        const totalSelected = selectedOrders.value.length
        
        for (let i = 0; i < totalSelected; i++) {
            const soId = selectedOrders.value[i]
            const soSummary = salesOrders.value.find(s => s.id_database === soId)
            const soNumber = soSummary ? soSummary.no_so : 'UNKNOWN'
            const customerName = soSummary ? soSummary.client : 'UNKNOWN'
            
            bulkStatus.value = `Mengambil data SO ${soNumber} (${i+1}/${totalSelected})...`
            bulkProgress.value = Math.round(((i) / totalSelected) * 100)
            
            // 1. Fetch Detail SO
            const { data: detailData, error: detailError } = await supabase.functions.invoke('accurate-detail-so', {
                body: { id: soId }
            })
            
            if (detailError || !detailData?.d?.detailItem) continue
            
            const detailItems = detailData.d.detailItem
            
            // 2. Fetch HPO dari Accurate (Sama dengan detail view)
            let dbItems = []
            let page = 0
            const pageSize = 1000
            let hasMore = true
            let poError = null

            while (hasMore) {
                const { data, error: fetchErr } = await supabase
                    .from('accurate_purchase_order_items')
                    .select(`
                        *,
                        header:accurate_purchase_orders(
                            id, number, trans_date, status_name, vendor_name
                        )
                    `)
                    .ilike('detail_notes', `%${soNumber}%`)
                    .range(page * pageSize, (page + 1) * pageSize - 1)
                    .order('created_at', { ascending: false })
                    .order('id', { ascending: false })

                if (fetchErr) {
                    poError = fetchErr
                    break
                }

                if (data && data.length > 0) {
                    dbItems = dbItems.concat(data)
                    if (data.length < pageSize) {
                        hasMore = false
                    } else {
                        page++
                    }
                } else {
                    hasMore = false
                }
            }
            
            const poData = { d: null }
            if (!poError && dbItems.length > 0) {
                poData.d = dbItems.map(item => ({
                    poId: item.header?.id,
                    poNumber: item.header?.number,
                    poDate: item.header?.trans_date,
                    poStatus: item.header?.status_name || 'Open',
                    itemCode: item.item_code,
                    itemName: item.item_name,
                    quantity: item.quantity,
                    description: item.detail_notes,
                    vendorName: item.header?.vendor_name
                }))
            }
            const hpoDetails = poData?.d || []
            
            // 3. Fetch status logistik dari DB
            const { data: dbData } = await supabase
                .from('shipments')
                .select('item_code, current_status, hpo_number')
                .eq('so_id', String(soId))
                
            const dbShipments = dbData || []
            
            // 4. Process Items
            detailItems.forEach(item => {
                const code = item.item?.no
                const name = item.item?.name || item.detailName
                const qty_order = item.quantity || 0
                const qty_shipped = item.shipQuantity || item.shippedQuantity || 0
                const qty_remaining = qty_order - qty_shipped
                const is_fully_shipped = qty_remaining <= 0
                
                const myShipment = dbShipments.find(s => s.item_code === code)
                const logistics_status = myShipment?.current_status || 'Pending Process'
                
                // Parse qty dari notes dulu
                const note = item.detailNotes || ''
                const lower = note.toLowerCase()
                let qty_stock_admin = 0
                let qty_to_order = qty_order
                
                if (lower.includes('no stock') || lower.includes('non stock') || lower.includes('kosong') || lower.includes('indent')) {
                    qty_stock_admin = 0
                    qty_to_order = qty_order
                } else {
                    const matchNum = lower.match(/(?:stock|stok|sisa)\s*[:.]?\s*(\d+)/)
                    if (matchNum) {
                        qty_stock_admin = parseInt(matchNum[1])
                        qty_to_order = Math.max(0, qty_order - qty_stock_admin)
                    } else if (lower.includes('stock') || lower.includes('stok') || lower.includes('ready')) {
                        qty_stock_admin = qty_order
                        qty_to_order = 0
                    }
                }
                
                // Tentukan status teks persis getRowStatus di detail view:
                const hpoEntries = hpoDetails.filter(p => p.itemCode === code)
                const hasHpoInDb = !!(myShipment?.hpo_number && myShipment.hpo_number.trim().length > 0)
                
                let statusText = 'MENUNGGU'
                let totalPo = 0;
                
                if (logistics_status === 'Hold by Customer') {
                    statusText = 'HOLD BY CUSTOMER'
                } else if (is_fully_shipped) {
                    statusText = 'PRODUK SUDAH DIKIRIM'
                } else if (qty_shipped > 0 && qty_remaining === 0) {
                    statusText = 'PRODUK SUDAH DIKIRIM'
                } else if (qty_to_order > 0) {
                    // Cek kekurangan pemesanan (Prioritas di atas pengiriman sebagian agar masuk logika order)
                    if (hpoEntries.length > 0) {
                        totalPo = hpoEntries.reduce((sum, hpo) => sum + (hpo.quantity || 0), 0);
                        if (totalPo < qty_to_order) {
                            statusText = 'KURANG DIPESAN';
                        } else if (totalPo > qty_to_order) {
                            statusText = 'KELEBIHAN DIPESAN';
                        } else {
                            statusText = 'SUDAH DIPESAN';
                        }
                    } else if (hasHpoInDb) {
                        statusText = 'SUDAH DIPESAN';
                    } else {
                        statusText = 'PERLU DIPESAN';
                    }
                }
                
                // Jika statusText masih 'MENUNGGU' atau sudah penuh dipesan, cek status pengiriman sebagian
                if (statusText === 'MENUNGGU' || statusText === 'SUDAH DIPESAN' || statusText === 'KELEBIHAN DIPESAN') {
                    if (qty_shipped > 0 && qty_remaining > 0) {
                        statusText = 'DIKIRIM SEBAGIAN';
                    } else if (qty_to_order === 0 && qty_shipped === 0) {
                        statusText = 'MENUNGGU PENGIRIMAN';
                    }
                }
                
                // Hanya tampilkan jika statusnya 'PERLU DIPESAN' atau 'KURANG DIPESAN'
                if (statusText !== 'PERLU DIPESAN' && statusText !== 'KURANG DIPESAN') return
                
                const finalSuggestion = statusText === 'KURANG DIPESAN' ? Math.max(0, qty_to_order - totalPo) : qty_to_order;
                
                allItemsToPurchase.push({
                    "No HSO": soNumber,
                    "Nama PT": customerName,
                    "Kode Produk": code,
                    "Nama Produk": name,
                    "Total Order (SO)": qty_order,
                    "Stock Gudang": qty_stock_admin,
                    "SARAN ORDER (QTY)": finalSuggestion,
                    "Catatan": note || '-'
                })
            })
        }
        
        bulkProgress.value = 100
        bulkStatus.value = "Membuat file Excel..."
        
        if (allItemsToPurchase.length === 0) {
            alert("Tidak ada barang yang perlu dipesan dari SO yang dipilih.")
            isBulkDownloading.value = false
            return
        }
        
        // Buat Excel
        const ws = XLSX.utils.json_to_sheet(allItemsToPurchase)
        
        const colWidths = [
          { wch: 20 }, // No HSO
          { wch: 30 }, // Nama PT
          { wch: 20 }, // Kode Produk
          { wch: 50 }, // Nama Produk
          { wch: 15 }, // Total Order
          { wch: 15 }, // Stock Gudang
          { wch: 20 }, // SARAN ORDER
          { wch: 40 }, // Catatan
        ]
        ws['!cols'] = colWidths
        
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Saran Order Massal")
        
        XLSX.writeFile(wb, `Saran_Order_Massal_${new Date().toISOString().split('T')[0]}.xlsx`)
        
    } catch (e) {
        console.error("Bulk download error:", e)
        alert("Terjadi kesalahan saat mengunduh Saran Order.")
    } finally {
        isBulkDownloading.value = false
        bulkProgress.value = 0
        bulkStatus.value = ""
    }
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
  <div class="space-y-5 pb-20">

    <!-- Bulk Download Overlay -->
    <div v-if="isBulkDownloading" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div class="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-4 flex flex-col items-center border border-slate-200 dark:border-slate-800">
        <div class="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-4">
          <Loader2 class="w-7 h-7 text-emerald-600 dark:text-emerald-400 animate-spin"/>
        </div>
        <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-1">Memproses Unduhan</h3>
        <p class="text-sm text-center text-slate-500 dark:text-slate-400 mb-6">{{ bulkStatus }}</p>
        <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 mb-2 overflow-hidden">
          <div class="bg-gradient-to-r from-emerald-500 to-teal-500 h-2 rounded-full transition-all duration-300" :style="{ width: bulkProgress + '%' }"></div>
        </div>
        <p class="text-xs font-bold text-slate-500 dark:text-slate-400">{{ bulkProgress }}%</p>
      </div>
    </div>

    <!-- Page Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <div class="flex items-center gap-3 mb-1">
          <div class="p-2 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg shadow-red-500/30">
            <FileText class="w-5 h-5 text-white"/>
          </div>
          <h1 class="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Sales Orders</h1>
        </div>
        <p class="text-slate-500 dark:text-slate-400 text-sm ml-12">
          <span class="font-bold text-slate-700 dark:text-slate-300">{{ filteredAndSortedOrders.length }}</span> pesanan ditemukan
          <span v-if="hasActiveFilters" class="text-blue-500 ml-1">(difilter dari {{ salesOrders.length }})</span>
        </p>
      </div>
      <div class="flex flex-wrap gap-2 w-full md:w-auto">
        <!-- Saran Order Button - always visible -->
        <div class="relative">
          <button @click="toggleBulkMode"
            :class="['inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-md',
              isBulkMode && selectedOrders.length > 0
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-emerald-500/30'
                : isBulkMode
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-400 text-emerald-700 dark:text-emerald-300 shadow-none'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-emerald-500/30'
            ]"
            @mouseenter="showSaranTooltip = true"
            @mouseleave="showSaranTooltip = false">
            <ShoppingCart class="w-4 h-4"/>
            <span v-if="!isBulkMode">Saran Order</span>
            <span v-else-if="selectedOrders.length === 0">Pilih SO...</span>
            <span v-else>Download ({{ selectedOrders.length }} SO)</span>
          </button>

          <!-- Cancel button when in bulk mode -->
          <button v-if="isBulkMode" @click="cancelBulkMode"
            class="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-md transition-all"
            title="Batalkan Pilih SO">
            <X class="w-3 h-3"/>
          </button>

          <!-- Tooltip -->
          <div v-if="showSaranTooltip && !isBulkMode"
            class="absolute top-full left-0 mt-2 z-50 w-72 bg-slate-900 dark:bg-slate-950 text-white text-xs rounded-xl p-3.5 shadow-2xl border border-slate-700 pointer-events-none">
            <div class="flex items-center gap-2 mb-2 pb-2 border-b border-slate-700">
              <ShoppingCart class="w-4 h-4 text-emerald-400 shrink-0"/>
              <span class="font-bold text-sm text-white">Saran Order (Bulk)</span>
            </div>
            <p class="text-slate-300 leading-relaxed mb-2">Unduh daftar barang yang <strong class="text-emerald-400">perlu dipesan ulang</strong> dari beberapa SO sekaligus, dalam satu file Excel.</p>
            <div class="bg-slate-800 rounded-lg p-2 space-y-1 text-[11px] text-slate-400">
              <div class="flex items-start gap-1.5"><span class="text-emerald-400 mt-0.5">✓</span> Qty saran = (Qty SO) - (Stock Gudang)</div>
              <div class="flex items-start gap-1.5"><span class="text-emerald-400 mt-0.5">✓</span> Hanya barang berstatus "Perlu Dipesan"</div>
              <div class="flex items-start gap-1.5"><span class="text-amber-400 mt-0.5">!</span> Cek kembali qty sebelum membuat PO</div>
            </div>
            <div class="mt-2 pt-2 border-t border-slate-700 text-slate-400 text-[11px]">Klik tombol → centang SO → klik Download</div>
            <!-- Tooltip arrow -->
            <div class="absolute -top-1.5 left-6 w-3 h-3 bg-slate-900 dark:bg-slate-950 border-l border-t border-slate-700 rotate-45"></div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm">
              <Download class="w-4 h-4"/>Export
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="dark:bg-slate-800 dark:border-slate-700 rounded-xl">
            <DropdownMenuItem @click="exportToExcel" class="dark:hover:bg-slate-700 dark:text-slate-300 rounded-lg cursor-pointer">
              <FileSpreadsheet class="w-4 h-4 mr-2 text-emerald-600"/>Excel
            </DropdownMenuItem>
            <DropdownMenuItem @click="exportToPDF" class="dark:hover:bg-slate-700 dark:text-slate-300 rounded-lg cursor-pointer">
              <FileIcon class="w-4 h-4 mr-2 text-red-600"/>PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button @click="fetchOrders" :disabled="isLoading"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white transition-all shadow-md disabled:opacity-60">
          <RefreshCw :class="['w-4 h-4', isLoading && 'animate-spin']"/>
          {{ isLoading ? 'Loading...' : 'Sync Accurate' }}
        </button>
      </div>
    </div>

    <!-- Filter Card -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
      <div class="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
        <Filter class="w-3.5 h-3.5"/>
        Filter &amp; Pencarian
      </div>
      <div class="flex flex-col md:flex-row gap-3">
        <div class="relative flex-1">
          <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
          <input v-model="searchQuery" placeholder="Cari No. SO atau Nama Customer..."
            class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 focus:border-transparent transition-all"/>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button :class="['inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all', startDate ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700']">
              <CalendarIcon class="w-4 h-4"/>{{ dateRangeLabel }}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent class="w-72 p-4 dark:bg-slate-800 dark:border-slate-700 rounded-2xl" align="end">
            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Pintas Waktu</p>
            <div class="grid grid-cols-3 gap-2 mb-4">
              <button v-for="d in [{v:'today',l:'Hari Ini'},{v:'week',l:'Minggu Ini'},{v:'month',l:'Bulan Ini'}]" :key="d.v"
                @click="setDateFilter(d.v)"
                class="px-2 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-all">
                {{ d.l }}
              </button>
            </div>
            <DropdownMenuSeparator class="dark:bg-slate-700 mb-3"/>
            <div class="space-y-3">
              <div>
                <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Dari</label>
                <input type="date" v-model="startDate" class="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none"/>
              </div>
              <div>
                <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Sampai</label>
                <input type="date" v-model="endDate" class="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none"/>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button :class="['inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all min-w-[160px]', statusFilter.length > 0 ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700']">
              <Filter class="w-4 h-4"/>
              <span class="truncate flex-1 text-left">{{ statusFilter.length === 0 ? 'Semua Status' : statusFilter.length + ' Status' }}</span>
              <ChevronsUpDown class="w-3.5 h-3.5 opacity-50 shrink-0"/>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent class="w-56 p-3 dark:bg-slate-800 dark:border-slate-700 rounded-2xl" align="end">
            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Pilih Status</p>
            <div class="space-y-1">
              <div v-for="status in availableStatuses" :key="status"
                class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-sm dark:text-slate-200 transition-colors"
                @click.prevent="toggleStatus(status)">
                <div class="w-4 h-4 border-2 rounded-md flex items-center justify-center transition-all shrink-0"
                  :class="isStatusSelected(status) ? 'bg-slate-900 border-slate-900 dark:bg-white dark:border-white' : 'border-slate-300 dark:border-slate-500'">
                  <Check v-if="isStatusSelected(status)" class="w-2.5 h-2.5 text-white dark:text-slate-900" stroke-width="3"/>
                </div>
                <span>{{ status }}</span>
              </div>
            </div>
            <DropdownMenuSeparator class="my-2 dark:bg-slate-700"/>
            <button @click="statusFilter = []" :disabled="statusFilter.length === 0"
              class="w-full text-xs text-red-500 hover:text-red-600 font-semibold py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all disabled:opacity-40">
              Reset Status
            </button>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div v-if="hasActiveFilters" class="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-dashed border-slate-100 dark:border-slate-800">
        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Aktif:</span>
        <span v-if="searchQuery" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-100 dark:border-blue-800">
          {{ searchQuery }}<button @click="searchQuery=''" class="hover:opacity-70"><X class="w-3 h-3"/></button>
        </span>
        <span v-if="startDate || endDate" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold border border-indigo-100 dark:border-indigo-800">
          <CalendarIcon class="w-3 h-3"/>{{ dateRangeLabel }}
          <button @click="startDate=''; endDate=''" class="hover:opacity-70"><X class="w-3 h-3"/></button>
        </span>
        <span v-for="status in statusFilter" :key="status"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-semibold border border-orange-100 dark:border-orange-800">
          {{ status }}<button @click="removeStatus(status)" class="hover:opacity-70"><X class="w-3 h-3"/></button>
        </span>
        <button @click="resetFilter" class="text-xs text-red-500 hover:text-red-600 font-semibold px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all ml-1">Reset Semua</button>
      </div>
    </div>

    <!-- Table -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
      <Table>
        <TableHeader class="bg-slate-950 dark:bg-black">
          <TableRow class="hover:bg-slate-950 dark:hover:bg-black border-none">
            <TableHead v-if="isBulkMode" class="w-12 px-4 text-center">
              <div class="flex items-center justify-center">
                <div class="w-4 h-4 border-2 border-white/30 rounded-md flex items-center justify-center cursor-pointer transition-all hover:border-white/60"
                  :class="isAllSelected ? 'bg-red-500 border-red-500' : ''" @click="toggleSelectAll">
                  <Check v-if="isAllSelected" class="w-2.5 h-2.5 text-white" stroke-width="3"/>
                </div>
              </div>
            </TableHead>
            <TableHead class="text-slate-300 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-white w-[190px]" @click="toggleSort('no_so')">
              <div class="flex items-center gap-2">No. SO
                <component :is="sortKey==='no_so' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-3.5 h-3.5" :class="sortKey==='no_so' ? 'text-red-400' : 'opacity-30'"/>
              </div>
            </TableHead>
            <TableHead class="text-slate-300 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-white" @click="toggleSort('client')">
              <div class="flex items-center gap-2">Customer
                <component :is="sortKey==='client' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-3.5 h-3.5" :class="sortKey==='client' ? 'text-red-400' : 'opacity-30'"/>
              </div>
            </TableHead>
            <TableHead class="hidden md:table-cell text-slate-300 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-white w-[140px]" @click="toggleSort('date')">
              <div class="flex items-center gap-2">Tanggal
                <component :is="sortKey==='date' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-3.5 h-3.5" :class="sortKey==='date' ? 'text-red-400' : 'opacity-30'"/>
              </div>
            </TableHead>
            <TableHead class="hidden lg:table-cell text-slate-300 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-white w-[170px]" @click="toggleSort('progress')">
              <div class="flex items-center gap-2">Progress
                <component :is="sortKey==='progress' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-3.5 h-3.5" :class="sortKey==='progress' ? 'text-red-400' : 'opacity-30'"/>
              </div>
            </TableHead>
            <TableHead class="text-slate-300 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-white w-[160px]" @click="toggleSort('status')">
              <div class="flex items-center gap-2">Status
                <component :is="sortKey==='status' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-3.5 h-3.5" :class="sortKey==='status' ? 'text-red-400' : 'opacity-30'"/>
              </div>
            </TableHead>
            <TableHead class="hidden md:table-cell text-right text-slate-300 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-white w-[180px]" @click="toggleSort('amount')">
              <div class="flex items-center justify-end gap-2">Nilai (IDR)
                <component :is="sortKey==='amount' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-3.5 h-3.5" :class="sortKey==='amount' ? 'text-red-400' : 'opacity-30'"/>
              </div>
            </TableHead>
            <TableHead class="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="isLoading">
            <TableCell colspan="8" class="py-16 text-center">
              <div class="flex flex-col items-center gap-3 text-slate-400">
                <Loader2 class="w-8 h-8 animate-spin text-red-500"/>
                <span class="text-sm font-medium">Sedang mengambil data dari Accurate...</span>
              </div>
            </TableCell>
          </TableRow>
          <TableRow v-else-if="filteredAndSortedOrders.length === 0">
            <TableCell colspan="8" class="py-16 text-center">
              <div class="flex flex-col items-center gap-3 text-slate-400">
                <div class="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center">
                  <FileText class="w-7 h-7 opacity-40"/>
                </div>
                <p class="text-sm font-medium">Tidak ada data yang sesuai filter</p>
                <button v-if="hasActiveFilters" @click="resetFilter" class="text-xs text-red-500 hover:underline font-semibold">Reset Filter</button>
              </div>
            </TableCell>
          </TableRow>
          <TableRow v-else v-for="so in paginatedOrders" :key="so.id_database"
            class="group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0"
            @click="router.push(`/sales-orders/${so.no_so.replace(/\//g, '-')}`)">
            <TableCell v-if="isBulkMode" class="px-4 text-center align-middle" @click.stop>
              <div class="flex items-center justify-center">
                <div class="w-4 h-4 border-2 border-slate-300 dark:border-slate-600 rounded-md flex items-center justify-center cursor-pointer transition-all hover:border-red-400"
                  :class="selectedOrders.includes(so.id_database) ? 'bg-red-500 border-red-500' : ''"
                  @click.stop="toggleSelect(so.id_database)">
                  <Check v-if="selectedOrders.includes(so.id_database)" class="w-2.5 h-2.5 text-white" stroke-width="3"/>
                </div>
              </div>
            </TableCell>
            <TableCell class="py-4 align-middle">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-red-50 dark:group-hover:bg-red-900/20 flex items-center justify-center transition-colors shrink-0">
                  <FileText class="w-4 h-4 text-slate-400 group-hover:text-red-500 transition-colors"/>
                </div>
                <span class="font-bold text-slate-900 dark:text-white text-sm">{{ so.no_so }}</span>
              </div>
            </TableCell>
            <TableCell class="py-4 align-middle">
              <div>
                <p class="font-semibold text-slate-800 dark:text-slate-200 text-sm truncate max-w-[260px]" :title="so.client">{{ so.client }}</p>
                <p class="text-xs text-slate-400 mt-0.5 md:hidden">{{ formatShortDate(so.date) }}</p>
              </div>
            </TableCell>
            <TableCell class="hidden md:table-cell py-4 align-middle whitespace-nowrap">
              <div class="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <CalendarIcon class="w-3.5 h-3.5 shrink-0"/>
                <span class="text-sm font-medium">{{ formatShortDate(so.date) }}</span>
              </div>
            </TableCell>
            <TableCell class="hidden lg:table-cell py-4 align-middle w-[170px]">
              <div class="flex items-center gap-2">
                <div class="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-700"
                    :class="so.progress === 100 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'"
                    :style="`width: ${so.progress}%`">
                  </div>
                </div>
                <span class="text-xs font-bold text-slate-500 dark:text-slate-400 w-9 text-right shrink-0">{{ so.progress }}%</span>
              </div>
            </TableCell>
            <TableCell class="py-4 align-middle">
              <Badge variant="outline" class="text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border whitespace-nowrap" :class="getStatusColor(so.status)">
                {{ so.status }}
              </Badge>
            </TableCell>
            <TableCell class="hidden md:table-cell text-right py-4 align-middle">
              <span class="font-bold text-slate-700 dark:text-slate-300 text-sm">{{ formatCurrency(so.amount) }}</span>
            </TableCell>
            <TableCell class="py-4 align-middle">
              <ArrowRight class="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-red-500 dark:group-hover:text-red-400 group-hover:translate-x-0.5 transition-all"/>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <!-- Pagination -->
      <div class="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 gap-4">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-400 font-medium whitespace-nowrap">Baris/halaman:</span>
            <Select v-model="itemsPerPage" @update:model-value="currentPage = 1">
              <SelectTrigger class="h-8 w-16 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-200 rounded-lg">
                <SelectValue/>
              </SelectTrigger>
              <SelectContent class="dark:bg-slate-800 dark:border-slate-700 rounded-xl">
                <SelectItem :value="10" class="dark:text-slate-300 dark:focus:bg-slate-700">10</SelectItem>
                <SelectItem :value="20" class="dark:text-slate-300 dark:focus:bg-slate-700">20</SelectItem>
                <SelectItem :value="50" class="dark:text-slate-300 dark:focus:bg-slate-700">50</SelectItem>
                <SelectItem :value="100" class="dark:text-slate-300 dark:focus:bg-slate-700">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            Total: <span class="font-bold text-slate-800 dark:text-slate-200 ml-1">{{ formatCurrency(pageTotalAmount) }}</span>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-slate-500 dark:text-slate-400">
            Hal <strong class="text-slate-800 dark:text-slate-200">{{ currentPage }}</strong> dari <strong class="text-slate-800 dark:text-slate-200">{{ totalPages || 1 }}</strong>
          </span>
          <div class="flex gap-1">
            <button :disabled="currentPage === 1" @click="prevPage"
              class="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              <ChevronLeft class="w-4 h-4"/>
            </button>
            <button :disabled="currentPage >= totalPages" @click="nextPage"
              class="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              <ChevronRight class="w-4 h-4"/>
            </button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
