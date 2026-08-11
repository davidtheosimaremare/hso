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
  Calendar as CalendarIcon, XCircle, ChevronLeft, ChevronRight, ChevronDown,
  Download, FileSpreadsheet, File as FileIcon, Filter,
  ChevronsUpDown, ArrowUp, ArrowDown, Check, X,
  ShoppingCart, CheckCircle2, AlertCircle, Bell, Sparkles
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
const bulkModeType = ref('saran') // 'saran' | 'reminder'
const showSaranTooltip = ref(false)
const showReminderTooltip = ref(false)

const toggleBulkMode = (type = 'saran') => {
  if (isBulkMode.value && bulkModeType.value === type) {
    // Already in same mode — toggle off
    isBulkMode.value = false
    selectedOrders.value = []
  } else {
    isBulkMode.value = true
    bulkModeType.value = type
    selectedOrders.value = []
  }
}

const executeBulkAction = () => {
  if (selectedOrders.value.length === 0) return
  if (bulkModeType.value === 'saran') bulkDownloadSaranOrder()
  else if (bulkModeType.value === 'reminder') bulkDownloadReminderPO()
}

const cancelBulkMode = () => {
  isBulkMode.value = false
  selectedOrders.value = []
}

// --- FILTER STATE ---
const searchQuery = ref('')
const startDate = ref('')
const endDate = ref('')
const statusFilter = ref(['Menunggu diproses', 'Sebagian diproses']) 
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
  if (q.status !== undefined) {
    statusFilter.value = q.status ? q.status.split(',') : []
  } else {
    statusFilter.value = ['Menunggu diproses', 'Sebagian diproses']
  }
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
const extractProjectFromText = (text) => {
  if (!text) return null
  const str = String(text)
  const regex = /pro(?:ject|yek)\s*[:\-]?\s*(.*?)(?=\s*(?:>|status|\n|$))/i
  const match = str.match(regex)
  if (match && match[1] && match[1].trim()) {
    return match[1].replace(/[\s\-]+$/, '').trim()
  }
  return null
}

const extractProjectFromItem = (item) => {
  if (!item) return null
  let proj = extractProjectFromText(item.description)
  if (proj) return proj

  if (item.detailItem && Array.isArray(item.detailItem)) {
    for (const detail of item.detailItem) {
      proj = extractProjectFromText(detail.detailNotes || detail.notes || detail.itemDescription)
      if (proj) return proj
    }
  }
  return null
}

const fetchOrders = async () => {
  isLoading.value = true
  try {
      const [soRes, sqRes] = await Promise.all([
      supabase.functions.invoke('accurate-list-so', {
        body: { fields: 'id,number,transDate,customer,totalAmount,statusName,percentShipped,description,detailItem,poNumber' }
      }),
      supabase.functions.invoke('accurate-list-sq', {
        body: { fields: 'id,number,transDate,customer,totalAmount,statusName,description,detailItem' }
      }).catch(() => null)
    ])

    // Build HSO / SQ project map strictly by exact SQ number
    const sqProjectMap = {}
    const sqData = sqRes?.data?.d || []
    sqData.forEach(sq => {
      const proj = extractProjectFromItem(sq)
      if (proj && sq.number) {
        sqProjectMap[sq.number.toLowerCase()] = proj
      }
    })

    const soData = soRes?.data?.d || []
      salesOrders.value = soData.map(item => {
        const desc = item.description || ''
        let proj = extractProjectFromItem(item)

        // Fallback to exact matching SQ number ONLY if not found in SO itself
        if (!proj && item.number && sqProjectMap[item.number.toLowerCase()]) {
          proj = sqProjectMap[item.number.toLowerCase()]
        }

        return {
          id_database: item.id,
          no_so: item.number,
          client: item.customer?.name || 'Tanpa Nama',
          po_number: item.poNumber || '-',
          date: item.transDate,
          amount: Math.round(item.totalAmount), 
          status: item.statusName || '', 
          progress: item.percentShipped || 0,
          description: desc,
          project: proj || '-'
        }
      })
  } catch (err) {
    console.error("Error fetching sales orders:", err)
  } finally {
    isLoading.value = false
  }
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

const defaultStatusesStr = ['Menunggu diproses', 'Sebagian diproses'].sort().join(',')
const currentStatusesStr = computed(() => [...statusFilter.value].sort().join(','))

const hasActiveFilters = computed(() => {
    return searchQuery.value !== '' || 
           startDate.value !== '' || 
           endDate.value !== '' || 
           dateFilterOption.value !== '' || 
           currentStatusesStr.value !== defaultStatusesStr
})

const statusFilterLabel = computed(() => {
  if (statusFilter.value.length === 0) return 'Semua Status'
  if (statusFilter.value.length === availableStatuses.length) return 'Semua Status'
  if (statusFilter.value.length === 1) return statusFilter.value[0]
  
  const hasMenunggu = statusFilter.value.includes('Menunggu diproses')
  const hasSebagian = statusFilter.value.includes('Sebagian diproses')
  if (statusFilter.value.length === 2 && hasMenunggu && hasSebagian) {
    return 'Menunggu & Sebagian'
  }
  
  return `${statusFilter.value.length} Status`
})

const selectAllStatuses = () => {
  statusFilter.value = [...availableStatuses]
}

const clearAllStatuses = () => {
  statusFilter.value = []
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

const filteredAndSortedOrders = computed(() => {
  let result = [...salesOrders.value]

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(so => 
      so.client.toLowerCase().includes(query) || 
      so.no_so.toLowerCase().includes(query) ||
      (so.project && so.project.toLowerCase().includes(query)) ||
      (so.description && so.description.toLowerCase().includes(query))
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
const dateFilterOption = ref('')

const applyDateFilter = () => {
  startDate.value = ''
  endDate.value = ''
  if (dateFilterOption.value === 'month') setDateFilter('month')
  else if (dateFilterOption.value === 'last_month') setDateFilter('last_month')
  else if (dateFilterOption.value === 'year') setDateFilter('year')
}

const statusFilterSingle = computed({
  get() {
    return statusFilter.value.length === 1 ? statusFilter.value[0] : 'all'
  },
  set(val) {
    if (val === 'all') {
      statusFilter.value = []
    } else {
      statusFilter.value = [val]
    }
  }
})

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
  } else if (type === 'last_month') {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    startDate.value = formatDate(lastMonth)
    endDate.value = formatDate(new Date(now.getFullYear(), now.getMonth(), 0))
  } else if (type === 'year') {
    startDate.value = formatDate(new Date(now.getFullYear(), 0, 1))
    endDate.value = formatDate(new Date(now.getFullYear(), 11, 31))
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
    statusFilter.value = ['Menunggu diproses', 'Sebagian diproses'] 
    dateFilterOption.value = ''
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

// --- BULK DOWNLOAD REMINDER PO ---
const bulkDownloadReminderPO = async () => {
    if (selectedOrders.value.length === 0) return
    
    isBulkDownloading.value = true
    bulkProgress.value = 0
    let reminderItems = []
    
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
                    hsoNumber: item.hso_number,
                    vendorName: item.header?.vendor_name
                }))
            }
            const hpoDetails = poData?.d || []

            // 3. Fetch shipments
            const { data: dbData } = await supabase
                .from('shipments')
                .select('*')
                .eq('so_id', String(soId))
            const dbShipments = dbData || []
            
            const isDisplayedFullyShipped = (item) => {
                const qty_order = item.quantity || 0
                const qty_shipped = item.shipQuantity || item.shippedQuantity || 0
                return (qty_order - qty_shipped) <= 0
            }
            
            const getVisualStatus = (shipment) => {
                if (!shipment || Object.keys(shipment).length === 0) return 'Pending Process'
                if (shipment.current_status === 'Hold by Customer') return 'Hold by Customer'
                if (shipment.hokiindo_date) return 'Already in Hokiindo Raya'
                if (shipment.dunex_date) return 'Already in siemens Warehouse'
                if (shipment.eta_date) return 'ETA Port JKT'
                if (shipment.exwork_date || shipment.exwork_waiting) return 'Follow up with our forwarder'
                if (shipment.current_status === 'Follow up with our forwarder') return 'Follow up with our forwarder'
                return shipment.current_status || 'Pending Process'
            }
            
            const getHpoEntries = (item) => {
                const code = item.item?.no || item.detailName
                const poItems = hpoDetails.filter(p => p.itemCode === code)
                return poItems.map(p => ({
                    poNumber: p.poNumber,
                    poDate: p.poDate,
                    quantity: p.quantity,
                    description: p.description,
                    hsoNumber: p.hsoNumber,
                    vendorName: p.vendorName
                }))
            }
            
            const getHpoReferenceType = (hpoEntry, soNumber) => {
              const hsoNum = (hpoEntry.hsoNumber || '').trim().toUpperCase()
              const desc = (hpoEntry.description || '').trim().toUpperCase()
              if (hsoNum) {
                if (hsoNum.includes('HSO/')) {
                  const currentSoClean = (soNumber || '').replace(/\//g, '').toUpperCase()
                  const hsoClean = hsoNum.replace(/\//g, '').toUpperCase()
                  if (hsoClean.includes(currentSoClean)) return 'THIS_HSO'
                  return 'OTHER_HSO'
                }
                if (hsoNum.includes('HSQ/')) return 'HSQ'
                return 'REF'
              }
              if (desc) {
                if (desc.includes('STOCK') || desc.includes('STOK') || desc.includes('PERSEDIAAN')) return 'STOCK'
                if (desc.includes('HSO/')) {
                  const currentSoClean = (soNumber || '').replace(/\//g, '').toUpperCase()
                  if (desc.includes(currentSoClean)) return 'THIS_HSO'
                  return 'OTHER_HSO'
                }
                if (desc.includes('HSQ/')) return 'HSQ'
              }
              return 'UNKNOWN'
            }
            
            const getHpoShipment = (item, hpoNumber) => {
                const code = item.item?.no || item.detailName
                const matches = dbShipments.filter(s => 
                    s.item_code === code && 
                    (!s.hpo_number || String(s.hpo_number).trim().toLowerCase() === String(hpoNumber).trim().toLowerCase())
                )
                const exactMatch = matches.find(s => s.hpo_number)
                if (exactMatch) return exactMatch
                return matches[0] || null
            }
            
            detailItems.forEach(item => {
                const qty_order = item.quantity || 0
                const note = item.detailNotes || ''
                const lower = note.toLowerCase()
                let qty_stock_admin = 0
                let qty_to_order = qty_order
                
                if (lower.includes('no stock') || lower.includes('non stock') || lower.includes('kosong') || lower.includes('indent')) {
                    qty_stock_admin = 0
                    qty_to_order = qty_order
                } else {
                    const match = note.match(/(?:stock|stok|ready)\s*:?\s*(\d+)/i)
                    if (match && match[1]) {
                        qty_stock_admin = parseInt(match[1], 10)
                        qty_to_order = Math.max(0, qty_order - qty_stock_admin)
                    } else if (lower.includes('stock') || lower.includes('stok') || lower.includes('ready')) {
                        qty_stock_admin = qty_order
                        qty_to_order = 0
                    }
                }
                
                if (qty_to_order <= 0) return
                if (isDisplayedFullyShipped(item)) return
                const hpos = getHpoEntries(item)
                    .sort((a, b) => {
                        const typeA = getHpoReferenceType(a, soNumber)
                        const typeB = getHpoReferenceType(b, soNumber)
                        if (typeA === 'THIS_HSO' && typeB !== 'THIS_HSO') return -1
                        if (typeA !== 'THIS_HSO' && typeB === 'THIS_HSO') return 1
                        return 0
                    })
                const siemensHpos = hpos.filter(hpo => hpo.vendorName && hpo.vendorName.toLowerCase().includes('siemens'))
                
                let remainingToPush = qty_to_order
                if (siemensHpos.length > 0) {
                    siemensHpos.forEach(hpo => {
                        const shipment = getHpoShipment(item, hpo.poNumber)
                        const status = getVisualStatus(shipment)
                        if (['Follow up with our forwarder', 'ETA Port JKT', 'Already in siemens Warehouse'].includes(status)) {
                            const pushQty = Math.min(hpo.quantity || 0, remainingToPush)
                            if (pushQty > 0) {
                                reminderItems.push({
                                    hsoNumber: soNumber,
                                    customerName: customerName,
                                    hpoNumber: hpo.poNumber,
                                    itemCode: item.item?.no || item.detailName,
                                    itemName: item.item?.name || item.detailName,
                                    qty: pushQty,
                                    status: status === 'Follow up with our forwarder' ? 'Ex-Works' : status === 'ETA Port JKT' ? 'ETA JKT' : 'Tiba Dunex',
                                    exworkDate: shipment ? (shipment.exwork_waiting ? 'Waiting for confirmation' : (shipment.exwork_date || '-')) : '-',
                                    etaDate: shipment ? (shipment.eta_date || '-') : '-',
                                    dunexDate: shipment ? (shipment.dunex_date || '-') : '-',
                                    note: shipment ? (shipment.admin_notes || '-') : '-'
                                })
                                remainingToPush -= pushQty
                            }
                        }
                    })
                }
            })
        }
        
        if (reminderItems.length === 0) {
            alert("Tidak ada item yang berstatus Ex-Works, ETA JKT, atau Tiba Dunex untuk HSO yang dipilih.")
            return
        }

        const dataToExport = reminderItems.map(item => ({
            "No HSO": item.hsoNumber,
            "Nama Customer": item.customerName,
            "No HPO (Purchase Order)": item.hpoNumber,
            "Kode Barang (MLFB)": item.itemCode,
            "Nama Barang": item.itemName,
            "Qty": item.qty,
            "Status Logistik": item.status,
            "Tanggal Ex-Works": item.exworkDate,
            "Tanggal ETA JKT": item.etaDate,
            "Tanggal Tiba Dunex": item.dunexDate,
            "Catatan": item.note
        }))

        const ws = XLSX.utils.json_to_sheet(dataToExport)
        const colWidths = [
            { wch: 15 }, { wch: 30 }, { wch: 22 }, { wch: 22 }, { wch: 45 }, { wch: 8 },
            { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 35 }
        ]
        ws['!cols'] = colWidths
        
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Reminder PO")
        XLSX.writeFile(wb, `REMINDER_PO_GLOBAL_${new Date().toISOString().split('T')[0]}.xlsx`)
        
    } catch (err) {
        console.error(err)
        alert("Gagal mengunduh Excel Reminder PO.")
    } finally {
        isBulkDownloading.value = false
        bulkProgress.value = 100
        bulkStatus.value = ''
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

    <!-- Page Header (Consistent with Dashboard) -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 font-sans">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Sales Orders</h1>
        <p class="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
          <span class="font-bold text-slate-700 dark:text-slate-300">{{ filteredAndSortedOrders.length }}</span> pesanan ditemukan
          <span v-if="hasActiveFilters" class="text-red-600 dark:text-red-400 font-medium ml-1">(difilter dari {{ salesOrders.length }})</span>
        </p>
      </div>

      <!-- Action Buttons (Shadcn UI Aesthetic) -->
      <div class="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
        <!-- Combined Fitur Order Select Dropdown (when not in bulk mode) -->
        <DropdownMenu v-if="!isBulkMode">
          <DropdownMenuTrigger as-child>
            <Button 
              variant="outline" 
              size="sm" 
              class="h-9 px-3.5 text-xs font-semibold gap-2 border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl transition-all shadow-2xs cursor-pointer"
            >
              <Sparkles class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Fitur Order</span>
              <ChevronDown class="w-3.5 h-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-64 dark:bg-slate-900 dark:border-slate-800 rounded-xl shadow-xl p-1.5 font-sans">
            <DropdownMenuItem @click="toggleBulkMode('saran')" class="flex flex-col items-start gap-1 p-2.5 rounded-lg cursor-pointer dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800">
              <div class="flex items-center gap-2 font-bold text-xs text-emerald-600 dark:text-emerald-400">
                <ShoppingCart class="w-4 h-4" />
                <span>Saran Order (Bulk)</span>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">Unduh daftar barang yang perlu dipesan ulang dalam satu file Excel.</p>
            </DropdownMenuItem>
            <DropdownMenuSeparator class="my-1 bg-slate-100 dark:bg-slate-800" />
            <DropdownMenuItem @click="toggleBulkMode('reminder')" class="flex flex-col items-start gap-1 p-2.5 rounded-lg cursor-pointer dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800">
              <div class="flex items-center gap-2 font-bold text-xs text-purple-600 dark:text-purple-400">
                <Bell class="w-4 h-4" />
                <span>Reminder PO Siemens</span>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">Generate list item PO Siemens yang sedang dalam proses pengiriman.</p>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <!-- Active Bulk Mode Trigger Button -->
        <div v-else class="flex items-center gap-2">
          <Button 
            @click="executeBulkAction"
            variant="outline"
            size="sm"
            :class="bulkModeType === 'saran' ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-600 text-white hover:bg-emerald-700' : 'border-purple-300 dark:border-purple-800 bg-purple-600 text-white hover:bg-purple-700'"
            class="h-9 px-3.5 text-xs font-bold gap-2 rounded-xl shadow-2xs cursor-pointer"
          >
            <component :is="bulkModeType === 'saran' ? ShoppingCart : Bell" class="w-4 h-4" />
            <span v-if="selectedOrders.length === 0">Pilih SO pada tabel...</span>
            <span v-else>{{ bulkModeType === 'saran' ? 'Download' : 'Reminder' }} ({{ selectedOrders.length }} SO)</span>
          </Button>

          <Button 
            @click="cancelBulkMode" 
            variant="ghost" 
            size="sm"
            class="h-9 px-2.5 text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl cursor-pointer"
            title="Batal Pilih SO"
          >
            <X class="w-4 h-4 mr-1" /> Batal
          </Button>
        </div>

        <!-- Sync Accurate Button -->
        <Button
          @click="fetchOrders"
          :disabled="isLoading"
          variant="outline"
          size="sm"
          class="h-9 px-3.5 text-xs font-bold gap-2 border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-white rounded-xl shadow-2xs cursor-pointer"
        >
          <RefreshCw :class="['w-4 h-4 text-red-600', isLoading && 'animate-spin']"/>
          {{ isLoading ? 'Memuat...' : 'Sync Accurate' }}
        </Button>
      </div>
    </div>

    <!-- Filter Card (Exact Penawaran / HsqListView Style) -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs font-sans">
      <div class="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
        <div class="relative flex-1">
          <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari No. SO, Customer, atau Proyek..."
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
        <div class="flex items-center gap-2 w-full lg:w-auto">
          <select v-model="dateFilterOption" @change="applyDateFilter" class="w-full lg:w-44 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/60 transition-all font-sans cursor-pointer">
            <option value="">Semua Tanggal</option>
            <option value="month">Bulan Ini</option>
            <option value="last_month">Bulan Lalu</option>
            <option value="year">Tahun Ini</option>
            <option value="range">Range Tanggal</option>
          </select>
          <template v-if="dateFilterOption === 'range'">
            <input v-model="startDate" type="date" data-range-start class="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg text-xs outline-none focus:ring-2 focus:ring-red-500/60" />
            <span class="text-slate-300 dark:text-slate-600">—</span>
            <input v-model="endDate" type="date" class="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg text-xs outline-none focus:ring-2 focus:ring-red-500/60" />
          </template>
          <button v-if="hasActiveFilters" @click="resetFilter" class="px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors shrink-0 cursor-pointer">Reset</button>
        </div>
      </div>
    </div>

    <!-- Table Container (Shadcn UI Style) -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl shadow-2xs overflow-x-auto font-sans">
      <Table>
        <TableHeader class="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/80 dark:border-slate-800">
          <TableRow class="hover:bg-transparent border-none">
            <TableHead v-if="isBulkMode" class="w-12 px-4 text-center py-3.5">
              <div class="flex items-center justify-center">
                <input 
                  type="checkbox"
                  :checked="isAllSelected"
                  @change="toggleSelectAll"
                  class="w-4 h-4 rounded accent-red-600 cursor-pointer"
                />
              </div>
            </TableHead>
            <TableHead class="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white w-[180px] py-3.5 px-4" @click="toggleSort('no_so')">
              <div class="flex items-center gap-1.5">
                No. SO
                <component :is="sortKey==='no_so' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-4 h-4" :class="sortKey==='no_so' ? 'text-red-600' : 'opacity-30'"/>
              </div>
            </TableHead>
            <TableHead class="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white w-[130px] py-3.5 px-4" @click="toggleSort('date')">
              <div class="flex items-center gap-1.5">
                Tanggal
                <component :is="sortKey==='date' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-4 h-4" :class="sortKey==='date' ? 'text-red-600' : 'opacity-30'"/>
              </div>
            </TableHead>
            <TableHead class="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white py-3.5 px-4" @click="toggleSort('client')">
              <div class="flex items-center gap-1.5">
                Customer
                <component :is="sortKey==='client' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-4 h-4" :class="sortKey==='client' ? 'text-red-600' : 'opacity-30'"/>
              </div>
            </TableHead>
            <TableHead class="hidden md:table-cell text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white py-3.5 px-4" @click="toggleSort('project')">
              <div class="flex items-center gap-1.5">
                Proyek
                <component :is="sortKey==='project' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-4 h-4" :class="sortKey==='project' ? 'text-red-600' : 'opacity-30'"/>
              </div>
            </TableHead>
            <TableHead class="hidden lg:table-cell text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white w-[230px] py-3.5 px-4" @click="toggleSort('progress')">
              <div class="flex items-center gap-1.5">
                Progress
                <component :is="sortKey==='progress' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-4 h-4" :class="sortKey==='progress' ? 'text-red-600' : 'opacity-30'"/>
              </div>
            </TableHead>
            <TableHead class="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white w-[140px] py-3.5 px-4" @click="toggleSort('status')">
              <div class="flex items-center gap-1.5">
                Status
                <component :is="sortKey==='status' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-4 h-4" :class="sortKey==='status' ? 'text-red-600' : 'opacity-30'"/>
              </div>
            </TableHead>
            <TableHead class="hidden md:table-cell text-right text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white w-[180px] py-3.5 px-4" @click="toggleSort('amount')">
              <div class="flex items-center justify-end gap-1.5">
                Nilai (IDR)
                <component :is="sortKey==='amount' ? (sortOrder==='asc' ? ArrowUp : ArrowDown) : ChevronsUpDown" class="w-4 h-4" :class="sortKey==='amount' ? 'text-red-600' : 'opacity-30'"/>
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="isLoading">
            <TableCell colspan="8" class="py-20 text-center">
              <div class="flex flex-col items-center gap-3 text-slate-400">
                <Loader2 class="w-8 h-8 animate-spin text-red-600"/>
                <span class="text-sm font-medium">Sedang mengambil data dari Accurate...</span>
              </div>
            </TableCell>
          </TableRow>
          <TableRow v-else-if="filteredAndSortedOrders.length === 0">
            <TableCell colspan="8" class="py-20 text-center">
              <div class="flex flex-col items-center gap-3 text-slate-400">
                <div class="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                  <FileText class="w-6 h-6 opacity-40"/>
                </div>
                <p class="text-sm font-medium">Tidak ada data pesanan yang sesuai filter</p>
                <button v-if="hasActiveFilters" @click="resetFilter" class="text-sm text-red-600 hover:underline font-semibold cursor-pointer">Reset Filter</button>
              </div>
            </TableCell>
          </TableRow>
          <TableRow v-else v-for="so in paginatedOrders" :key="so.id_database"
            class="group cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800/80 last:border-0"
            @click="router.push(`/sales-orders/${so.no_so.replace(/\//g, '-')}`)">
            <TableCell v-if="isBulkMode" class="px-4 text-center align-middle py-4" @click.stop>
              <div class="flex items-center justify-center">
                <input 
                  type="checkbox"
                  :checked="selectedOrders.includes(so.id_database)"
                  @change="toggleSelect(so.id_database)"
                  class="w-4 h-4 rounded accent-red-600 cursor-pointer"
                />
              </div>
            </TableCell>
            <TableCell class="py-4 px-4 align-middle whitespace-nowrap">
              <div class="flex flex-col gap-0.5">
                <span class="text-xs md:text-sm font-bold text-slate-900 dark:text-slate-100 font-sans">
                  {{ so.no_so }}
                </span>
                <span v-if="so.po_number && so.po_number !== '-'" class="text-xs font-medium text-slate-500 dark:text-slate-400">
                  PO: {{ so.po_number }}
                </span>
              </div>
            </TableCell>
            <TableCell class="py-4 px-4 align-middle whitespace-nowrap">
              <span class="text-xs md:text-sm font-medium text-slate-600 dark:text-slate-400 font-sans">{{ formatShortDate(so.date) }}</span>
            </TableCell>
            <TableCell class="py-4 px-4 align-middle">
              <p class="font-semibold text-slate-900 dark:text-slate-100 text-xs md:text-sm truncate max-w-[280px]" :title="so.client">{{ so.client }}</p>
            </TableCell>
            <TableCell class="hidden md:table-cell py-4 px-4 align-middle">
              <span class="text-xs md:text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[220px] block" :title="so.project">
                {{ so.project }}
              </span>
            </TableCell>
            <TableCell class="hidden lg:table-cell py-4 px-4 align-middle w-[230px]">
              <div class="flex items-center gap-3">
                <div class="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-700"
                    :class="so.progress === 100 ? 'bg-emerald-500' : 'bg-red-500'"
                    :style="`width: ${so.progress}%`">
                  </div>
                </div>
                <span class="text-xs font-semibold text-slate-600 dark:text-slate-300 w-10 text-right shrink-0 font-sans">{{ so.progress }}%</span>
              </div>
            </TableCell>
            <TableCell class="py-4 px-4 align-middle">
              <Badge variant="outline" class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border whitespace-nowrap" :class="getStatusColor(so.status)">
                {{ so.status }}
              </Badge>
            </TableCell>
            <TableCell class="hidden md:table-cell text-right py-4 px-4 align-middle">
              <span class="text-xs md:text-sm font-bold text-slate-900 dark:text-slate-100 font-sans">{{ formatCurrency(so.amount) }}</span>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <!-- Pagination & Summary Footer -->
      <div class="flex flex-col sm:flex-row items-center justify-between px-5 py-3.5 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 gap-3">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Baris/halaman:</span>
            <Select v-model="itemsPerPage" @update:model-value="currentPage = 1">
              <SelectTrigger class="h-8 w-16 text-xs bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 dark:text-slate-200 rounded-lg">
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
          <div class="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700 font-sans">
            Total Hal: <span class="font-bold text-slate-900 dark:text-white ml-1 font-sans">{{ formatCurrency(pageTotalAmount) }}</span>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Hal <strong class="text-slate-900 dark:text-white font-sans">{{ currentPage }}</strong> dari <strong class="text-slate-900 dark:text-white font-sans">{{ totalPages || 1 }}</strong>
          </span>
          <div class="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              :disabled="currentPage === 1"
              @click="prevPage"
              class="w-8 h-8 rounded-lg border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              <ChevronLeft class="w-4 h-4"/>
            </Button>
            <Button
              variant="outline"
              size="icon"
              :disabled="currentPage >= totalPages"
              @click="nextPage"
              class="w-8 h-8 rounded-lg border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              <ChevronRight class="w-4 h-4"/>
            </Button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
