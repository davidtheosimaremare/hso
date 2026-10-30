<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { cleanPartNumber, formatRupiah } from '@/utils/componentConverter'
import { useAccurateItems, getItemActivePrice, getItemPriceDetails } from '@/composables/useAccurateItems'
import * as XLSX from 'xlsx'
import {
  BadgePercent,
  UploadCloud,
  Download,
  Plus,
  Search,
  Trash2,
  RefreshCw,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  Edit3,
  X,
  Filter,
  Sparkles,
  Layers,
  ExternalLink,
  ChevronRight,
  Clock,
  Check,
  Send,
  SlidersHorizontal,
  Info,
  Package,
  Boxes,
  CheckCheck,
  Columns3,
  RotateCcw,
  Eye,
  EyeOff
} from 'lucide-vue-next'

// --- ACCURATE ITEMS COMPOSABLE ---
const { items: accurateItems, fetchItems, isLoading: isCatalogLoading } = useAccurateItems()

// --- USER & AUTH STATE ---
const currentUserEmail = ref('')

// --- DATA LIST STATE ---
// Holds preloaded items from Accurate + any adjustments/Excel rows
const catalogProducts = ref([])
const pendingExcelUnmatched = ref([]) // Items from Excel that don't exist in Accurate
const searchQuery = ref('')

// --- FILTER CONTROLS ---
const brandFilter = ref('SIEMENS') // 'SIEMENS' | 'ALL'
const stockFilter = ref('ALL') // 'ALL' | 'READY' | 'INDENT'
const priceStatusFilter = ref('ALL') // 'ALL' | 'NEED_SUBMIT' | 'ADJUSTED' | 'DEFAULT' | 'UP' | 'DOWN' | 'UNMATCHED'
const sortBy = ref('DEFAULT') // 'DEFAULT' | 'DIFF_DESC' | 'DIFF_ASC' | 'PERCENT_DESC' | 'SKU_ASC' | 'STOCK_DESC'

// --- COLUMN VISIBILITY CONTROLS ---
const COLUMN_DEFS = [
  { key: 'index', label: '# (No)', default: true },
  { key: 'sku', label: 'SKU / Kode Barang', default: true, required: true },
  { key: 'name', label: 'Nama Barang Accurate', default: true },
  { key: 'stock', label: 'Stok Gudang', default: true },
  { key: 'defaultPrice', label: 'Harga Satuan Accurate (Def)', default: true },
  { key: 'adjustedPrice', label: 'Harga Penyesuaian', default: true },
  { key: 'activePrice', label: 'Harga Aktif (Ready)', default: true },
  { key: 'diff', label: 'Selisih (+/- Rp & %)', default: true },
  { key: 'status', label: 'Status Harga', default: true },
  { key: 'action', label: 'Aksi', default: true }
]

const STORAGE_KEY_COLUMNS = 'price_adjustment_visible_columns'

const loadColumnPreferences = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_COLUMNS)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          ...parsed,
          sku: true // SKU is always mandatory
        }
      }
    }
  } catch (e) {}
  return {
    index: true,
    sku: true,
    name: true,
    stock: true,
    defaultPrice: true,
    adjustedPrice: true,
    activePrice: true,
    diff: true,
    status: true,
    action: true
  }
}

const visibleColumns = ref(loadColumnPreferences())
const isColumnPickerOpen = ref(false)
const columnPickerRef = ref(null)

const visibleColumnCount = computed(() => {
  return COLUMN_DEFS.filter(col => visibleColumns.value[col.key]).length
})

const saveColumnPreferences = () => {
  try {
    localStorage.setItem(STORAGE_KEY_COLUMNS, JSON.stringify(visibleColumns.value))
  } catch (e) {}
}

const toggleColumn = (key) => {
  if (key === 'sku') return
  visibleColumns.value[key] = !visibleColumns.value[key]
  saveColumnPreferences()
}

const setPresetColumns = (preset) => {
  if (preset === 'ALL') {
    COLUMN_DEFS.forEach(col => { visibleColumns.value[col.key] = true })
  } else if (preset === 'PRICING_ONLY') {
    // Fokus perbandingan harga lengkap
    visibleColumns.value = {
      index: false,
      sku: true,
      name: true,
      stock: false,
      defaultPrice: true,
      adjustedPrice: true,
      activePrice: true,
      diff: true,
      status: true,
      action: true
    }
  } else if (preset === 'COMPACT') {
    // Ringkas: SKU, Nama, Harga Satuan, Harga Penyesuaian, Selisih
    visibleColumns.value = {
      index: false,
      sku: true,
      name: true,
      stock: false,
      defaultPrice: true,
      adjustedPrice: true,
      activePrice: false,
      diff: true,
      status: false,
      action: true
    }
  } else if (preset === 'RESET') {
    COLUMN_DEFS.forEach(col => { visibleColumns.value[col.key] = col.default })
  }
  saveColumnPreferences()
}

const handleOutsideClick = (e) => {
  if (isColumnPickerOpen.value && columnPickerRef.value && !columnPickerRef.value.contains(e.target)) {
    isColumnPickerOpen.value = false
  }
}

// --- UI / MODAL STATES ---
const isUploading = ref(false)
const isManualModalOpen = ref(false)
const isEditModalOpen = ref(false)
const isBulkModalOpen = ref(false)
const isHistoryModalOpen = ref(false)
const isSubmittingSingle = ref({}) // map of row id -> boolean
const isBulkSubmitting = ref(false)
const bulkProgress = ref({ current: 0, total: 0, percent: 0 })

// --- EDIT ITEM STATE ---
const editingItem = ref(null)
const editNewPrice = ref('')

// --- MANUAL ENTRY STATE ---
const manualSkuInput = ref('')
const manualPriceInput = ref('')
const selectedCatalogItem = ref(null)
const manualSearchResults = ref([])

// --- AUDIT LOGS STATE ---
const adjustmentLogs = ref([])
const isLoadingLogs = ref(false)

// --- TOAST NOTIFICATION ---
const toast = ref({ show: false, message: '', type: 'success' })
const showToast = (message, type = 'success') => {
  toast.value = { show: true, message, type }
  setTimeout(() => {
    toast.value.show = false
  }, 4000)
}

// --- HELPER: DETECT SIEMENS PRODUCTS ---
const isSiemensProduct = (it) => {
  if (!it) return false
  const brand = (it.brand || '').toUpperCase()
  const name = (it.item_name || it.description || '').toUpperCase()
  const code = (it.item_no || '').toUpperCase()
  
  if (brand.includes('SIEMENS')) return true
  if (name.includes('SIEMENS')) return true
  // Standard Siemens MLFB prefixes
  if (/^(3V|5S|3R|6E|6S|3W|3T|7K|5T|3U|3N|3K|3L|3M|8W|6A|6F|6G|6D)/.test(code)) return true
  return false
}

// Helper: Clean price parser (Preserves exact decimal price without rounding)
const parsePrice = (val) => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  if (!val) return 0
  const str = val.toString().trim()
  let clean = str.replace(/[^0-9,.-]/g, '')
  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.')
  } else if (clean.includes('.')) {
    const parts = clean.split('.')
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      clean = clean.replace(/\./g, '')
    }
  } else if (clean.includes(',')) {
    const parts = clean.split(',')
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      clean = clean.replace(/,/g, '')
    } else {
      clean = clean.replace(',', '.')
    }
  }
  const num = parseFloat(clean)
  return isNaN(num) ? 0 : num
}

// Helper: Calculate diff
const calculateDiff = (defaultPrice, adjustedPrice) => {
  const diffAmount = adjustedPrice - defaultPrice
  const diffPercent = defaultPrice > 0 ? (diffAmount / defaultPrice) * 100 : 0
  return {
    diffAmount,
    diffPercent: Math.round(diffPercent * 10) / 10
  }
}

// --- INITIALIZE & PRELOAD ACCURATE CATALOG ---
const isRefreshingAccurate = ref(false)

const initCatalogFromAccurate = () => {
  if (!Array.isArray(accurateItems.value) || accurateItems.value.length === 0) return

  const list = []
  for (const it of accurateItems.value) {
    if (!it.item_no) continue

    const stockQty = Number(it.stock_quantity) || 0
    const isReadyStock = stockQty > 0 || it.stock_status === 'READY'

    // Concept: Ambil harga sesuai logika API Accurate
    // Jika ada penyesuaian harga di Accurate -> ambil dari harga penyesuaian
    // Jika tidak ada penyesuaian -> ambil dari harga default master Accurate
    const priceDetails = getItemPriceDetails(it)
    const defaultPrice = priceDetails.defaultPrice
    const hasExistingAdjustment = priceDetails.hasAdjustment
    const adjustedPrice = priceDetails.adjustedPrice
    const activePrice = priceDetails.activePrice
    const diffAmount = priceDetails.diffAmount
    const diffPercent = priceDetails.diffPercent

    list.push({
      id: `acc-${it.id || it.item_no}`,
      sku: it.item_no.trim().toUpperCase(),
      cleanSku: cleanPartNumber(it.item_no),
      itemName: it.item_name || it.description || it.item_no,
      category: it.category || 'OTHER',
      brand: (it.brand || 'SIEMENS').toUpperCase(),
      isSiemens: isSiemensProduct(it),
      stockQty,
      isReadyStock,
      unitName: it.unit_name || 'Pcs',
      defaultPrice,
      adjustedPrice,
      activePrice,
      pendingNewPrice: null, // Holds uncommitted price from Excel or manual input in current session
      diffAmount,
      diffPercent,
      hasAdjustment: hasExistingAdjustment,
      hasPendingChange: false,
      excelStatus: null, // 'SAME' | 'DIFFERENT' | null
      priceSource: priceDetails.priceSource,
      priceStatus: hasExistingAdjustment 
        ? (adjustedPrice > defaultPrice ? 'UP' : adjustedPrice < defaultPrice ? 'DOWN' : 'SAME') 
        : 'DEFAULT',
      syncStatus: 'SYNCED', // 'SYNCED' | 'READY_TO_SUBMIT' | 'SUBMITTING' | 'ERROR'
      errorMessage: '',
      accurateRaw: it
    })
  }

  catalogProducts.value = list
}

// Refresh items & price adjustments directly from Accurate
const refreshFromAccurate = async () => {
  isRefreshingAccurate.value = true
  try {
    try {
      localStorage.removeItem('accurate_items_cache')
    } catch (e) {}
    await fetchItems({ force: true })
    initCatalogFromAccurate()
    showToast('Data produk & penyesuaian harga dari Accurate berhasil disegarkan!', 'success')
  } catch (err) {
    showToast('Gagal memuat ulang data dari Accurate: ' + err.message, 'error')
  } finally {
    isRefreshingAccurate.value = false
  }
}

// Watch accurate items update
watch(accurateItems, () => {
  if (catalogProducts.value.length === 0) {
    initCatalogFromAccurate()
  }
}, { immediate: true })

// --- STATS COMPUTATION ---
const stats = computed(() => {
  // Base list depending on brand selection
  let baseList = catalogProducts.value
  if (brandFilter.value === 'SIEMENS') {
    baseList = baseList.filter(it => it.isSiemens)
  }

  const total = baseList.length
  let readyStockCount = 0
  let adjustedCount = 0
  let defaultCount = 0
  let needSubmitCount = 0
  let excelSameCount = 0
  let upCount = 0
  let downCount = 0

  for (const it of baseList) {
    if (it.isReadyStock) readyStockCount++
    if (it.hasPendingChange) needSubmitCount++
    if (it.excelStatus === 'SAME') excelSameCount++

    if (it.hasAdjustment || it.hasPendingChange) {
      adjustedCount++
      const currentActive = it.hasPendingChange ? it.pendingNewPrice : it.activePrice
      if (currentActive > it.defaultPrice) upCount++
      else if (currentActive < it.defaultPrice) downCount++
    } else {
      defaultCount++
    }
  }

  return {
    total,
    readyStockCount,
    adjustedCount,
    defaultCount,
    needSubmitCount,
    excelSameCount,
    upCount,
    downCount,
    unmatchedCount: pendingExcelUnmatched.value.length
  }
})

// --- FILTERED & SORTED LIST ---
const displayedProducts = computed(() => {
  let list = [...catalogProducts.value]

  // 1. Brand Filter
  if (brandFilter.value === 'SIEMENS') {
    list = list.filter(it => it.isSiemens)
  }

  // 2. Stock Filter (Ready Stock vs Indent)
  if (stockFilter.value === 'READY') {
    list = list.filter(it => it.isReadyStock)
  } else if (stockFilter.value === 'INDENT') {
    list = list.filter(it => !it.isReadyStock)
  }

  // 3. Price Status Filter
  if (priceStatusFilter.value === 'NEED_SUBMIT') {
    list = list.filter(it => it.hasPendingChange)
  } else if (priceStatusFilter.value === 'EXCEL_SAME') {
    list = list.filter(it => it.excelStatus === 'SAME')
  } else if (priceStatusFilter.value === 'ADJUSTED') {
    list = list.filter(it => it.hasAdjustment || it.hasPendingChange)
  } else if (priceStatusFilter.value === 'DEFAULT') {
    list = list.filter(it => !it.hasAdjustment && !it.hasPendingChange)
  } else if (priceStatusFilter.value === 'UP') {
    list = list.filter(it => {
      const active = it.hasPendingChange ? it.pendingNewPrice : it.activePrice
      return active > it.defaultPrice
    })
  } else if (priceStatusFilter.value === 'DOWN') {
    list = list.filter(it => {
      const active = it.hasPendingChange ? it.pendingNewPrice : it.activePrice
      return active < it.defaultPrice
    })
  }

  // 4. Search Filter
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(it => 
      it.sku.toLowerCase().includes(q) ||
      it.itemName.toLowerCase().includes(q) ||
      it.category.toLowerCase().includes(q)
    )
  }

  // 5. Sorting
  if (sortBy.value === 'DIFF_DESC') {
    list.sort((a, b) => Math.abs(b.diffAmount) - Math.abs(a.diffAmount))
  } else if (sortBy.value === 'DIFF_ASC') {
    list.sort((a, b) => Math.abs(a.diffAmount) - Math.abs(b.diffAmount))
  } else if (sortBy.value === 'PERCENT_DESC') {
    list.sort((a, b) => Math.abs(b.diffPercent) - Math.abs(a.diffPercent))
  } else if (sortBy.value === 'STOCK_DESC') {
    list.sort((a, b) => b.stockQty - a.stockQty)
  } else if (sortBy.value === 'SKU_ASC') {
    list.sort((a, b) => a.sku.localeCompare(b.sku))
  }

  return list
})

// --- EXCEL PARSER: MATCH WITH PRELOADED PRODUCTS ---
const handleFileUpload = (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  processExcelFile(file)
  e.target.value = ''
}

const handleDrop = (e) => {
  e.preventDefault()
  isUploading.value = false
  const file = e.dataTransfer.files?.[0]
  if (!file) return
  processExcelFile(file)
}

const processExcelFile = (file) => {
  if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
    showToast('Harap unggah file dengan format .xlsx, .xls, atau .csv', 'error')
    return
  }

  const reader = new FileReader()
  reader.onload = (evt) => {
    try {
      const data = new Uint8Array(evt.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })

      if (!rawRows || rawRows.length === 0) {
        showToast('File Excel kosong atau tidak terbaca.', 'error')
        return
      }

      // Detect header row
      let headerRowIdx = -1
      let colSku = -1
      let colOldPrice = -1
      let colNewPrice = -1

      for (let r = 0; r < Math.min(rawRows.length, 5); r++) {
        const row = rawRows[r].map(c => (c || '').toString().toLowerCase().trim())
        for (let c = 0; c < row.length; c++) {
          const cell = row[c]
          if (cell.match(/^(sku|kode|item_no|mlfb|part_number|partnumber|kode barang)$/)) {
            colSku = c
          } else if (cell.match(/^(harga lama|harga_lama|old_price|oldprice|harga accurate|accurate|price_old)$/) || cell.includes('lama') || cell.includes('old')) {
            colOldPrice = c
          } else if (cell.match(/^(harga baru|harga_baru|new_price|newprice|harga imall|imall|price_new|harga)$/) || cell.includes('baru') || cell.includes('new')) {
            colNewPrice = c
          }
        }
        if (colSku !== -1) {
          headerRowIdx = r
          break
        }
      }

      if (headerRowIdx === -1) {
        const firstRow = rawRows[0] || []
        colSku = 0
        if (firstRow.length >= 3) {
          colOldPrice = 1
          colNewPrice = 2
        } else if (firstRow.length === 2) {
          colOldPrice = -1
          colNewPrice = 1
        }
        headerRowIdx = 0
      }

      // Build quick lookup map for preloaded catalog
      const skuMap = new Map()
      const cleanSkuMap = new Map()
      for (const p of catalogProducts.value) {
        skuMap.set(p.sku, p)
        if (p.cleanSku) cleanSkuMap.set(p.cleanSku, p)
      }

      let matchedCount = 0
      let differentCount = 0
      let sameCount = 0
      const unmatchedList = []

      for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
        const row = rawRows[r]
        if (!row || row.length === 0) continue

        const rawSku = (row[colSku] || '').toString().trim().toUpperCase()
        if (!rawSku) continue

        const cleanSku = cleanPartNumber(rawSku)
        const parsedNewPrice = colNewPrice !== -1 ? parsePrice(row[colNewPrice]) : 0
        const parsedOldPrice = colOldPrice !== -1 ? parsePrice(row[colOldPrice]) : 0

        // Find match in our preloaded catalog
        let targetProduct = skuMap.get(rawSku) || cleanSkuMap.get(cleanSku)

        if (targetProduct) {
          matchedCount++

          // Tentukan harga baru yang dimasukkan user
          let candidatePrice = 0
          if (parsedNewPrice > 0) {
            candidatePrice = parsedNewPrice
          } else if (colNewPrice === -1 && parsedOldPrice > 0) {
            candidatePrice = parsedOldPrice
          }

          if (candidatePrice > 0) {
            // Bandingkan dengan Harga Aktif saat ini (yang sudah mengandung +4,545%)
            if (candidatePrice === targetProduct.activePrice) {
              // HARGA SAMA: Tidak ada perubahan harga
              targetProduct.hasPendingChange = false
              targetProduct.pendingNewPrice = null
              targetProduct.excelStatus = 'SAME'
              targetProduct.syncStatus = 'SYNCED'
              sameCount++
            } else {
              // HARGA BERBEDA: Ada penyesuaian harga baru yang perlu disubmit
              targetProduct.pendingNewPrice = candidatePrice
              targetProduct.hasPendingChange = true
              targetProduct.syncStatus = 'READY_TO_SUBMIT'
              targetProduct.excelStatus = 'DIFFERENT'

              const diff = calculateDiff(targetProduct.defaultPrice, candidatePrice)
              targetProduct.diffAmount = diff.diffAmount
              targetProduct.diffPercent = diff.diffPercent
              targetProduct.priceStatus = candidatePrice > targetProduct.defaultPrice ? 'UP' : candidatePrice < targetProduct.defaultPrice ? 'DOWN' : 'SAME'
              differentCount++
            }
          }
        } else {
          // SKU not in our Accurate catalog
          unmatchedList.push({
            sku: rawSku,
            cleanSku,
            newPrice: parsedNewPrice > 0 ? parsedNewPrice : parsedOldPrice,
            oldPrice: colOldPrice !== -1 ? parsedOldPrice : 0
          })
        }
      }

      pendingExcelUnmatched.value = unmatchedList

      if (differentCount > 0) {
        priceStatusFilter.value = 'NEED_SUBMIT' // Switch to items that need submit
        showToast(`Deteksi Excel selesai: ${differentCount} produk memiliki harga BERBEDA (siap submit), ${sameCount} produk harganya SAMA.${unmatchedList.length > 0 ? ` (${unmatchedList.length} belum terdaftar di Accurate)` : ''}`, 'success')
      } else if (sameCount > 0) {
        showToast(`Semua produk yang diunggah (${sameCount} item) harganya SAMA dengan harga aktif saat ini. Tidak ada perubahan yang perlu disubmit.`, 'info')
      } else if (unmatchedList.length > 0) {
        priceStatusFilter.value = 'UNMATCHED'
        showToast(`${unmatchedList.length} barang dari Excel belum terdaftar di Accurate. Anda dapat mengekspornya ke template impor Accurate.`, 'info')
      } else {
        showToast('Tidak ada data yang cocok ditemukan pada file Excel.', 'error')
      }
    } catch (err) {
      console.error('Error reading Excel:', err)
      showToast('Gagal memproses file Excel: ' + err.message, 'error')
    }
  }
  reader.readAsArrayBuffer(file)
}

// --- EXPORT UNMATCHED TO ACCURATE IMPORT TEMPLATE ---
const exportUnmatchedForAccurateImport = () => {
  if (pendingExcelUnmatched.value.length === 0) {
    showToast('Tidak ada barang baru yang belum terdaftar di Accurate.', 'info')
    return
  }

  try {
    const importRows = pendingExcelUnmatched.value.map(it => ({
      'No Barang': it.sku,
      'Nama Barang': `SIEMENS ${it.sku}`,
      'Jenis Barang': 'PERSEDIAAN',
      'Kategori Barang': 'SIEMENS OTHER',
      'Satuan': 'Pcs',
      'Harga Jual #1': it.newPrice
    }))

    const worksheet = XLSX.utils.json_to_sheet(importRows)
    worksheet['!cols'] = [
      { wch: 25 }, // No Barang
      { wch: 35 }, // Nama Barang
      { wch: 18 }, // Jenis Barang
      { wch: 20 }, // Kategori Barang
      { wch: 10 }, // Satuan
      { wch: 18 }  // Harga Jual
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Impor Barang Accurate')
    XLSX.writeFile(workbook, `Impor_Barang_Accurate_${new Date().toISOString().slice(0, 10)}.xlsx`)
    showToast(`Berhasil mengekspor ${importRows.length} barang siap diimpor ke Accurate Online!`, 'success')
  } catch (e) {
    showToast('Gagal mengekspor data impor: ' + e.message, 'error')
  }
}

// --- DOWNLOAD TEMPLATE EXCEL (SEMUA PRODUK + 4,545%) ---
const downloadAllProductsTemplate = () => {
  if (!catalogProducts.value || catalogProducts.value.length === 0) {
    showToast('Data produk belum siap diekspor. Silakan tunggu beberapa detik...', 'info')
    return
  }

  try {
    const baseList = brandFilter.value === 'SIEMENS'
      ? catalogProducts.value.filter(it => it.isSiemens)
      : catalogProducts.value

    const exportRows = baseList.map((it, idx) => ({
      'No': idx + 1,
      'SKU': it.sku,
      'Nama Barang': it.itemName,
      'Kategori': it.category,
      'Harga Lama': it.activePrice, // Nilai harga yang sudah +4,545%
      'Harga Baru': '' // Kolom untuk diisi user jika ada perubahan harga baru
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    worksheet['!cols'] = [
      { wch: 6 },  // No
      { wch: 25 }, // SKU
      { wch: 45 }, // Nama Barang
      { wch: 18 }, // Kategori
      { wch: 20 }, // Harga Lama
      { wch: 20 }  // Harga Baru
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Penyesuaian Harga')
    XLSX.writeFile(workbook, `Katalog_Penyesuaian_Harga_${new Date().toISOString().slice(0, 10)}.xlsx`)
    showToast(`Berhasil mengunduh template ${exportRows.length} produk dengan Harga Lama (+4,545%)!`, 'success')
  } catch (err) {
    console.error('Error downloading template:', err)
    showToast('Gagal mengunduh template Excel: ' + err.message, 'error')
  }
}

const downloadTemplate = downloadAllProductsTemplate

// --- EXPORT CURRENT VIEW TO EXCEL ---
const exportToExcel = () => {
  if (displayedProducts.value.length === 0) {
    showToast('Tidak ada data dalam tabel untuk diekspor.', 'error')
    return
  }

  try {
    const exportData = displayedProducts.value.map((item, idx) => ({
      'No': idx + 1,
      'SKU / MLFB': item.sku,
      'Nama Barang Accurate': item.itemName,
      'Kategori': item.category,
      'Brand': item.brand,
      'Stok Gudang': item.stockQty,
      'Status Stok': item.isReadyStock ? 'Ready Stock' : 'Indent',
      'Harga Default Accurate': item.defaultPrice,
      'Harga Penyesuaian': item.hasPendingChange ? item.pendingNewPrice : (item.adjustedPrice || '-'),
      'Harga Aktif (Ready)': item.hasPendingChange ? item.pendingNewPrice : item.activePrice,
      'Sumber Harga': (item.hasPendingChange || item.hasAdjustment) ? 'PENYESUAIAN HARGA' : 'HARGA DEFAULT',
      'Selisih (Rp)': item.diffAmount,
      'Selisih (%)': `${item.diffPercent}%`
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Penyesuaian Harga Siemens')
    XLSX.writeFile(workbook, `Katalog_Penyesuaian_Harga_${new Date().toISOString().slice(0, 10)}.xlsx`)
    showToast(`Berhasil mengekspor ${exportData.length} baris data ke Excel!`, 'success')
  } catch (err) {
    showToast('Gagal mengekspor Excel: ' + err.message, 'error')
  }
}

// --- EDIT NEW PRICE MODAL ---
const openEditModal = (item) => {
  editingItem.value = item
  editNewPrice.value = (item.pendingNewPrice || item.activePrice || item.adjustedPrice || item.defaultPrice).toString()
  isEditModalOpen.value = true
}

const saveEditPrice = () => {
  if (!editingItem.value) return
  const newP = parsePrice(editNewPrice.value)
  if (newP <= 0) {
    showToast('Harga baru harus lebih besar dari 0.', 'error')
    return
  }

  const diff = calculateDiff(editingItem.value.defaultPrice, newP)
  editingItem.value.pendingNewPrice = newP
  editingItem.value.hasPendingChange = true
  editingItem.value.diffAmount = diff.diffAmount
  editingItem.value.diffPercent = diff.diffPercent
  editingItem.value.priceStatus = newP > editingItem.value.defaultPrice ? 'UP' : newP < editingItem.value.defaultPrice ? 'DOWN' : 'SAME'
  editingItem.value.syncStatus = 'READY_TO_SUBMIT'

  showToast(`Harga baru untuk ${editingItem.value.sku} diubah menjadi ${formatRupiah(newP)} (Siap Submit)`, 'success')
  isEditModalOpen.value = false
  editingItem.value = null
}

// --- SUBMIT SINGLE ITEM TO ACCURATE & SUPABASE ---
const submitSingleItem = async (item) => {
  const targetPrice = item.pendingNewPrice || item.activePrice || item.adjustedPrice
  if (!targetPrice || targetPrice <= 0) {
    showToast(`Harga penyesuaian untuk ${item.sku} belum ditentukan.`, 'error')
    return
  }

  isSubmittingSingle.value[item.id] = true
  item.syncStatus = 'SUBMITTING'

  try {
    const updatedTimestamp = new Date().toISOString()

    // 1. Invoke Edge Function accurate-create-spa
    const { data, error: fnError } = await supabase.functions.invoke('accurate-create-spa', {
      body: {
        items: [{
          sku: item.sku,
          price: targetPrice,
          defaultPrice: item.defaultPrice,
          itemName: item.itemName
        }],
        userEmail: currentUserEmail.value || 'Sales Team',
        priceCategoryName: 'Umum'
      }
    })

    if (fnError) {
      throw new Error(fnError.message || 'Gagal menghubungi server sinkronisasi Accurate')
    }
    if (!data?.success) {
      throw new Error(data?.error || 'Gagal menyimpan penyesuaian harga ke Accurate')
    }

    const spaDocNumber = data?.primaryDocNumber || 'SPA.ACCURATE'

    // 2. Update local row state
    item.adjustedPrice = targetPrice
    item.activePrice = targetPrice
    item.hasAdjustment = true
    item.hasPendingChange = false
    item.pendingNewPrice = null
    item.syncStatus = 'SYNCED'

    const diff = calculateDiff(item.defaultPrice, targetPrice)
    item.diffAmount = diff.diffAmount
    item.diffPercent = diff.diffPercent
    item.priceStatus = targetPrice > item.defaultPrice ? 'UP' : targetPrice < item.defaultPrice ? 'DOWN' : 'SAME'

    // 3. Update in memory accurate items composable & cache
    if (Array.isArray(accurateItems.value)) {
      const target = accurateItems.value.find(it => it.item_no?.toUpperCase() === item.sku)
      if (target) {
        target.unit_price = targetPrice
        target.base_price = item.defaultPrice > 0 ? item.defaultPrice : target.base_price
        target.specs = {
          ...(target.specs || {}),
          adjusted_price: targetPrice,
          base_price: item.defaultPrice > 0 ? item.defaultPrice : target.base_price,
          spa_number: spaDocNumber,
          source: 'ACCURATE_SELLINGPRICE_ADJUSTMENT'
        }
        target.updated_at = updatedTimestamp
      }
      try {
        localStorage.setItem('accurate_items_cache', JSON.stringify(accurateItems.value))
      } catch (cacheErr) {}
    }

    showToast(`Harga "${item.sku}" berhasil disinkronkan ke Accurate (${spaDocNumber}): ${formatRupiah(targetPrice)}!`, 'success')
  } catch (err) {
    console.error('Submit single error:', err)
    item.syncStatus = 'ERROR'
    item.errorMessage = err.message
    showToast(`Gagal memperbarui harga ${item.sku}: ${err.message}`, 'error')
  } finally {
    isSubmittingSingle.value[item.id] = false
  }
}

// --- SUBMIT MASAL (BULK SUBMIT) ---
const openBulkModal = () => {
  const eligibleItems = catalogProducts.value.filter(it => it.hasPendingChange && it.pendingNewPrice > 0)
  if (eligibleItems.length === 0) {
    showToast('Tidak ada barang dengan perubahan harga baru yang perlu disinkronkan.', 'info')
    return
  }
  isBulkModalOpen.value = true
}

const executeBulkSubmit = async () => {
  const eligibleItems = catalogProducts.value.filter(it => it.hasPendingChange && it.pendingNewPrice > 0)
  if (eligibleItems.length === 0) return

  isBulkSubmitting.value = true
  bulkProgress.value = { current: 0, total: eligibleItems.length, percent: 0 }

  let successCount = 0
  let errorCount = 0
  const CHUNK_SIZE = 250 // Chunk to keep payload within comfortable edge function timeouts
  const updatedTimestamp = new Date().toISOString()
  const createdDocNumbers = new Set()

  for (let i = 0; i < eligibleItems.length; i += CHUNK_SIZE) {
    const chunk = eligibleItems.slice(i, i + CHUNK_SIZE)
    chunk.forEach(it => { it.syncStatus = 'SUBMITTING' })

    try {
      const payloadItems = chunk.map(it => ({
        sku: it.sku,
        price: it.pendingNewPrice,
        defaultPrice: it.defaultPrice,
        itemName: it.itemName
      }))

      const { data, error: fnError } = await supabase.functions.invoke('accurate-create-spa', {
        body: {
          items: payloadItems,
          userEmail: currentUserEmail.value || 'Sales Team',
          priceCategoryName: 'Umum'
        }
      })

      if (fnError) {
        throw new Error(fnError.message || 'Gagal menghubungi server Accurate')
      }
      if (!data?.success) {
        throw new Error(data?.error || 'Gagal menyimpan penyesuaian harga ke Accurate')
      }

      if (data?.primaryDocNumber) {
        createdDocNumbers.add(data.primaryDocNumber)
      }
      if (Array.isArray(data?.documents)) {
        data.documents.forEach(d => { if (d.number) createdDocNumbers.add(d.number) })
      }

      // Update chunk items locally
      for (const item of chunk) {
        const targetPrice = item.pendingNewPrice
        item.adjustedPrice = targetPrice
        item.activePrice = targetPrice
        item.hasAdjustment = true
        item.hasPendingChange = false
        item.pendingNewPrice = null
        item.syncStatus = 'SYNCED'

        const diff = calculateDiff(item.defaultPrice, targetPrice)
        item.diffAmount = diff.diffAmount
        item.diffPercent = diff.diffPercent
        item.priceStatus = targetPrice > item.defaultPrice ? 'UP' : targetPrice < item.defaultPrice ? 'DOWN' : 'SAME'
        successCount++

        // Update in memory
        if (Array.isArray(accurateItems.value)) {
          const target = accurateItems.value.find(it => it.item_no?.toUpperCase() === item.sku)
          if (target) {
            target.unit_price = targetPrice
            target.base_price = item.defaultPrice > 0 ? item.defaultPrice : target.base_price
            target.specs = {
              ...(target.specs || {}),
              adjusted_price: targetPrice,
              base_price: item.defaultPrice > 0 ? item.defaultPrice : target.base_price,
              spa_number: data?.primaryDocNumber,
              source: 'ACCURATE_SELLINGPRICE_ADJUSTMENT'
            }
            target.updated_at = updatedTimestamp
          }
        }
      }
    } catch (err) {
      console.error('Bulk chunk error:', err)
      chunk.forEach(item => {
        item.syncStatus = 'ERROR'
        item.errorMessage = err.message
        errorCount++
      })
    }

    bulkProgress.value.current = Math.min(i + CHUNK_SIZE, eligibleItems.length)
    bulkProgress.value.percent = Math.round((bulkProgress.value.current / eligibleItems.length) * 100)
  }

  // Persist cache
  try {
    localStorage.setItem('accurate_items_cache', JSON.stringify(accurateItems.value))
  } catch (e) {}

  isBulkSubmitting.value = false
  isBulkModalOpen.value = false

  const docListStr = Array.from(createdDocNumbers).join(', ')
  if (errorCount === 0) {
    showToast(`Berhasil memperbarui ${successCount} harga produk di Accurate Online${docListStr ? ` (Dokumen SPA: ${docListStr})` : ''}!`, 'success')
  } else {
    showToast(`Selesai: ${successCount} berhasil diperbarui${docListStr ? ` (${docListStr})` : ''}, ${errorCount} gagal.`, 'info')
  }
}

// --- FETCH AUDIT LOGS ---
const fetchLogs = async () => {
  isLoadingLogs.value = true
  try {
    const { data, error } = await supabase
      .from('price_adjustment_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error
    adjustmentLogs.value = data || []
  } catch (err) {
    adjustmentLogs.value = []
  } finally {
    isLoadingLogs.value = false
  }
}

const openHistoryModal = () => {
  isHistoryModalOpen.value = true
  fetchLogs()
}

// --- MOUNTED INITIALIZATION ---
onMounted(async () => {
  window.addEventListener('click', handleOutsideClick)

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user?.email) {
      currentUserEmail.value = session.user.email
    }
  } catch (e) {}

  // Check if current cached items have specs with price adjustments
  const hasAdjustedSpecs = (accurateItems.value || []).some(
    it => it.specs?.adjusted_price || (it.base_price && it.unit_price && it.base_price !== it.unit_price)
  )

  if (!accurateItems.value || accurateItems.value.length === 0 || !hasAdjustedSpecs) {
    try {
      localStorage.removeItem('accurate_items_cache')
    } catch (e) {}
    await fetchItems({ force: true })
  }
  initCatalogFromAccurate()
})

onUnmounted(() => {
  window.removeEventListener('click', handleOutsideClick)
})
</script>

<template>
  <div class="space-y-6 max-w-7xl mx-auto pb-16">
    <!-- TOAST NOTIFICATION -->
    <transition
      enter-active-class="transform transition ease-out duration-300"
      enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
      enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
      leave-active-class="transition ease-in duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div 
        v-if="toast.show" 
        class="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border"
        :class="toast.type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800' : toast.type === 'info' ? 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800' : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800'"
      >
        <CheckCircle2 v-if="toast.type === 'success'" class="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <AlertCircle v-else-if="toast.type === 'error'" class="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
        <Info v-else class="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
        <span>{{ toast.message }}</span>
        <button @click="toast.show = false" class="ml-2 hover:opacity-75">
          <X class="w-4 h-4" />
        </button>
      </div>
    </transition>

    <!-- HEADER SECTION -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2.5">
            <div class="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
              <BadgePercent class="w-6 h-6" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Penyesuaian Harga
                </h1>
                <span class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  SIEMENS Ready
                </span>
              </div>
              <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Katalog produk Accurate Online: Mengambil harga penyesuaian jika ada, atau menggunakan harga default Accurate jika belum disesuaikan.
              </p>
            </div>
          </div>
        </div>

        <!-- ACTION BUTTONS -->
        <div class="flex flex-wrap items-center gap-2.5">
          <!-- Refresh Accurate -->
          <button
            @click="refreshFromAccurate"
            :disabled="isRefreshingAccurate"
            class="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors shadow-sm disabled:opacity-50"
            title="Tarik data produk dan harga penyesuaian terbaru dari Accurate"
          >
            <RefreshCw class="w-4 h-4 text-emerald-600 dark:text-emerald-400" :class="isRefreshingAccurate ? 'animate-spin' : ''" />
            <span>{{ isRefreshingAccurate ? 'Memperbarui...' : 'Refresh Accurate' }}</span>
          </button>

          <!-- Download Template Semua Produk -->
          <button
            @click="downloadAllProductsTemplate"
            class="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors shadow-sm"
            title="Unduh seluruh produk ke Excel dengan Harga Lama yang sudah dinaikkan +4,545%"
          >
            <Download class="w-4 h-4 text-emerald-600" />
            <span>Download Semua Produk (Excel)</span>
          </button>

          <!-- Riwayat Log -->
          <button
            @click="openHistoryModal"
            class="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors shadow-sm"
          >
            <Clock class="w-4 h-4 text-slate-500" />
            <span>Riwayat</span>
          </button>

          <!-- Submit Masal -->
          <button
            @click="openBulkModal"
            :disabled="stats.needSubmitCount === 0 || isBulkSubmitting"
            class="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl text-white transition-all shadow-sm"
            :class="stats.needSubmitCount > 0 ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer shadow-emerald-500/20' : 'bg-slate-400 dark:bg-slate-700 opacity-60 cursor-not-allowed'"
          >
            <Send class="w-4 h-4" />
            <span>Submit Masal ({{ stats.needSubmitCount }})</span>
          </button>
        </div>
      </div>
    </div>

    <!-- STATS OVERVIEW CARDS (KPIs) -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <!-- Total Produk Siemens -->
      <div 
        @click="priceStatusFilter = 'ALL'"
        class="cursor-pointer bg-white dark:bg-slate-900 border rounded-xl p-3.5 transition-all hover:border-slate-400 dark:hover:border-slate-600"
        :class="priceStatusFilter === 'ALL' ? 'border-slate-900 dark:border-white ring-1 ring-slate-900 dark:ring-white' : 'border-slate-200 dark:border-slate-800'"
      >
        <div class="flex items-center justify-between text-xs text-slate-500 font-medium">
          <span>Katalog Accurate</span>
          <Package class="w-4 h-4 text-slate-400" />
        </div>
        <div class="mt-1.5 text-xl font-bold text-slate-900 dark:text-white">
          {{ stats.total }}
        </div>
        <div class="mt-0.5 text-[10px] text-slate-400 truncate">
          {{ brandFilter === 'SIEMENS' ? 'Produk Siemens' : 'Semua Produk' }}
        </div>
      </div>

      <!-- Ready Stock -->
      <div 
        @click="stockFilter = stockFilter === 'READY' ? 'ALL' : 'READY'"
        class="cursor-pointer bg-white dark:bg-slate-900 border rounded-xl p-3.5 transition-all hover:border-teal-400"
        :class="stockFilter === 'READY' ? 'border-teal-500 ring-1 ring-teal-500 bg-teal-50/20 dark:bg-teal-950/20' : 'border-slate-200 dark:border-slate-800'"
      >
        <div class="flex items-center justify-between text-xs text-teal-600 dark:text-teal-400 font-medium">
          <span>Ready Stock</span>
          <Boxes class="w-4 h-4 text-teal-500" />
        </div>
        <div class="mt-1.5 text-xl font-bold text-teal-600 dark:text-teal-400">
          {{ stats.readyStockCount }}
        </div>
        <div class="mt-0.5 text-[10px] text-teal-500/80">
          Stok siap di gudang
        </div>
      </div>

      <!-- Ada Penyesuaian Harga -->
      <div 
        @click="priceStatusFilter = 'ADJUSTED'"
        class="cursor-pointer bg-white dark:bg-slate-900 border rounded-xl p-3.5 transition-all hover:border-emerald-400"
        :class="priceStatusFilter === 'ADJUSTED' ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-200 dark:border-slate-800'"
      >
        <div class="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          <span>Disesuaikan</span>
          <CheckCheck class="w-4 h-4 text-emerald-500" />
        </div>
        <div class="mt-1.5 text-xl font-bold text-emerald-600 dark:text-emerald-400">
          {{ stats.adjustedCount }}
        </div>
        <div class="mt-0.5 text-[10px] text-emerald-500/80">
          Menggunakan harga penyesuaian
        </div>
      </div>

      <!-- Harga Default Satuan -->
      <div 
        @click="priceStatusFilter = 'DEFAULT'"
        class="cursor-pointer bg-white dark:bg-slate-900 border rounded-xl p-3.5 transition-all hover:border-slate-400"
        :class="priceStatusFilter === 'DEFAULT' ? 'border-slate-700 ring-1 ring-slate-700' : 'border-slate-200 dark:border-slate-800'"
      >
        <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-medium">
          <span>Murni Def Satuan</span>
          <Minus class="w-4 h-4 text-slate-400" />
        </div>
        <div class="mt-1.5 text-xl font-bold text-slate-800 dark:text-slate-200">
          {{ stats.defaultCount }}
        </div>
        <div class="mt-0.5 text-[10px] text-slate-400 truncate">
          Harga satuan Accurate
        </div>
      </div>

      <!-- Perlu Submit / Baru Diedit -->
      <div 
        @click="priceStatusFilter = 'NEED_SUBMIT'"
        class="cursor-pointer bg-white dark:bg-slate-900 border rounded-xl p-3.5 transition-all hover:border-amber-400"
        :class="priceStatusFilter === 'NEED_SUBMIT' ? 'border-amber-500 ring-1 ring-amber-500 bg-amber-50/20' : 'border-slate-200 dark:border-slate-800'"
      >
        <div class="flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 font-medium">
          <span>Perlu Submit</span>
          <SlidersHorizontal class="w-4 h-4 text-amber-500" />
        </div>
        <div class="mt-1.5 text-xl font-bold text-amber-600 dark:text-amber-400">
          {{ stats.needSubmitCount }}
        </div>
        <div class="mt-0.5 text-[10px] text-amber-500/80">
          Perubahan baru di sesi ini
        </div>
      </div>

      <!-- Belum di Accurate (Unmatched Excel) -->
      <div 
        v-if="stats.unmatchedCount > 0"
        @click="priceStatusFilter = 'UNMATCHED'"
        class="cursor-pointer bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 rounded-xl p-3.5 transition-all"
        :class="priceStatusFilter === 'UNMATCHED' ? 'ring-1 ring-rose-500' : ''"
      >
        <div class="flex items-center justify-between text-xs text-rose-700 dark:text-rose-400 font-bold">
          <span>Belum di Accurate</span>
          <AlertCircle class="w-4 h-4 text-rose-500" />
        </div>
        <div class="mt-1.5 text-xl font-bold text-rose-700 dark:text-rose-300">
          {{ stats.unmatchedCount }}
        </div>
        <div class="mt-0.5 text-[10px] text-rose-600 underline cursor-pointer" @click.stop="exportUnmatchedForAccurateImport">
          Ekspor Impor Accurate
        </div>
      </div>

      <!-- Fallback empty slot if no unmatched -->
      <div v-else class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex flex-col justify-center text-center">
        <div class="text-[11px] text-slate-400">Status Sinkronisasi</div>
        <div class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center justify-center gap-1">
          <CheckCircle2 class="w-3.5 h-3.5" />
          <span>Katalog Siap</span>
        </div>
      </div>
    </div>

    <!-- DROPZONE EXCEL UNTUK PENYESUAIAN HARGA BULK -->
    <div 
      @dragover.prevent="isUploading = true"
      @dragleave.prevent="isUploading = false"
      @drop="handleDrop"
      class="border-2 border-dashed rounded-2xl p-5 text-center transition-all bg-white dark:bg-slate-900"
      :class="isUploading ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-slate-300 dark:border-slate-700 hover:border-slate-400'"
    >
      <input
        type="file"
        id="excel-upload-input"
        accept=".xlsx,.xls,.csv"
        class="hidden"
        @change="handleFileUpload"
      />

      <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-3 text-left">
          <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/40">
            <FileSpreadsheet class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
              Sesuaikan Harga via Excel (iMall)
            </h3>
            <p class="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
              Unggah file Excel (<code class="font-mono text-emerald-600 font-bold">sku</code>, <code class="font-mono text-emerald-600 font-bold">harga lama</code>, <code class="font-mono text-emerald-600 font-bold">harga baru</code>). Sistem otomatis mendeteksi apakah harga baru <strong class="text-amber-600 font-bold">BERBEDA</strong> (siap submit) atau <strong class="text-slate-600 font-bold">SAMA</strong> (tanpa perubahan).
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            @click="downloadAllProductsTemplate"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors shadow-sm"
            title="Unduh seluruh produk ke Excel dengan Harga Lama yang sudah dinaikkan +4,545%"
          >
            <Download class="w-3.5 h-3.5 text-emerald-600" />
            <span>Unduh Template Semua Produk</span>
          </button>
          <label
            for="excel-upload-input"
            class="cursor-pointer inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm"
          >
            <UploadCloud class="w-4 h-4" />
            <span>Pilih File Excel</span>
          </label>
          <button
            v-if="pendingExcelUnmatched.length > 0"
            @click="exportUnmatchedForAccurateImport"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
          >
            <Download class="w-3.5 h-3.5" />
            <span>Ekspor {{ pendingExcelUnmatched.length }} Barang Baru</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MAIN PRODUCT & PRICE TABLE -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
      <!-- TABLE TOOLBAR -->
      <div class="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <!-- SEARCH BAR -->
          <div class="relative flex-1 max-w-md">
            <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Cari SKU / MLFB, nama barang, kategori..."
              class="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
            />
          </div>

          <!-- CONTROLS: BRAND & STOCK TOGGLE, SORT, EXPORT -->
          <div class="flex flex-wrap items-center gap-2">
            <!-- Brand Toggle -->
            <select
              v-model="brandFilter"
              class="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none font-medium"
            >
              <option value="SIEMENS">Brand: SIEMENS Saja</option>
              <option value="ALL">Brand: Semua Brand</option>
            </select>

            <!-- Stock Filter -->
            <select
              v-model="stockFilter"
              class="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none font-medium"
            >
              <option value="ALL">Stok: Semua</option>
              <option value="READY">Stok: Ready Sahaja</option>
              <option value="INDENT">Stok: Indent</option>
            </select>

            <!-- Sort -->
            <select
              v-model="sortBy"
              class="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="DEFAULT">Urutkan: Default</option>
              <option value="STOCK_DESC">Stok Terbanyak</option>
              <option value="DIFF_DESC">Selisih Terbesar (Rp)</option>
              <option value="DIFF_ASC">Selisih Terkecil (Rp)</option>
              <option value="PERCENT_DESC">Persentase (%)</option>
              <option value="SKU_ASC">SKU (A - Z)</option>
            </select>

            <!-- Export -->
            <button
              @click="exportToExcel"
              :disabled="displayedProducts.length === 0"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors"
            >
              <FileSpreadsheet class="w-3.5 h-3.5 text-emerald-600" />
              <span>Ekspor</span>
            </button>

            <!-- Column Visibility Toggle Dropdown -->
            <div class="relative" ref="columnPickerRef">
              <button
                @click.stop="isColumnPickerOpen = !isColumnPickerOpen"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors shadow-sm"
                :class="isColumnPickerOpen ? 'ring-2 ring-emerald-500/30 border-emerald-500 bg-slate-50 dark:bg-slate-750' : ''"
                title="Atur kolom yang ingin ditampilkan di tabel"
              >
                <Columns3 class="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Kolom</span>
                <span class="px-1.5 py-0.2 text-[10px] font-semibold rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {{ visibleColumnCount }}/{{ COLUMN_DEFS.length }}
                </span>
              </button>

              <!-- Dropdown Menu -->
              <transition
                enter-active-class="transition duration-150 ease-out"
                enter-from-class="transform scale-95 opacity-0 -translate-y-1"
                enter-to-class="transform scale-100 opacity-100 translate-y-0"
                leave-active-class="transition duration-100 ease-in"
                leave-from-class="transform scale-100 opacity-100 translate-y-0"
                leave-to-class="transform scale-95 opacity-0 -translate-y-1"
              >
                <div
                  v-if="isColumnPickerOpen"
                  @click.stop
                  class="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-3 z-40 text-xs"
                >
                  <!-- Header -->
                  <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-700">
                    <div>
                      <div class="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Columns3 class="w-4 h-4 text-emerald-600" />
                        <span>Tampilkan Kolom</span>
                      </div>
                      <p class="text-[10px] text-slate-400 mt-0.5">Sesuaikan kolom agar lebih nyaman dilihat</p>
                    </div>
                    <button
                      @click="isColumnPickerOpen = false"
                      class="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <X class="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <!-- Presets -->
                  <div class="flex items-center gap-1.5 pb-2 mb-2 border-b border-slate-100 dark:border-slate-700 text-[11px]">
                    <button
                      @click="setPresetColumns('ALL')"
                      class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors"
                    >
                      Semua
                    </button>
                    <button
                      @click="setPresetColumns('PRICING_ONLY')"
                      class="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 transition-colors"
                      title="Fokus kolom harga dan selisih"
                    >
                      Fokus Harga
                    </button>
                    <button
                      @click="setPresetColumns('COMPACT')"
                      class="px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 text-sky-700 dark:text-sky-300 transition-colors"
                      title="Tampilan ringkas"
                    >
                      Ringkas
                    </button>
                    <button
                      @click="setPresetColumns('RESET')"
                      class="px-2 py-0.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors ml-auto flex items-center gap-1"
                      title="Reset ke pengaturan awal"
                    >
                      <RotateCcw class="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  </div>

                  <!-- Column Checkboxes -->
                  <div class="max-h-60 overflow-y-auto space-y-1 pr-1">
                    <label
                      v-for="col in COLUMN_DEFS"
                      :key="col.key"
                      class="flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                      :class="visibleColumns[col.key] ? 'bg-slate-50 dark:bg-slate-750/70 text-slate-900 dark:text-white font-medium' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-750/30'"
                    >
                      <div class="flex items-center gap-2">
                        <input
                          type="checkbox"
                          :checked="visibleColumns[col.key]"
                          :disabled="col.required"
                          @change="toggleColumn(col.key)"
                          class="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-600 disabled:opacity-40"
                        />
                        <span class="text-xs">{{ col.label }}</span>
                      </div>
                      <span v-if="col.required" class="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-500">
                        Wajib
                      </span>
                      <span v-else class="text-[10px] text-slate-400">
                        {{ visibleColumns[col.key] ? 'Tampil' : 'Sembunyi' }}
                      </span>
                    </label>
                  </div>

                  <!-- Footer -->
                  <div class="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700 text-[10px] text-slate-400 flex items-center justify-between">
                    <span>{{ visibleColumnCount }} kolom tampil</span>
                    <button
                      @click="isColumnPickerOpen = false"
                      class="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                    >
                      Selesai
                    </button>
                  </div>
                </div>
              </transition>
            </div>
          </div>
        </div>

        <!-- FILTER PILLS -->
        <div class="flex flex-wrap items-center gap-2 pt-1">
          <button
            @click="priceStatusFilter = 'ALL'"
            class="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
            :class="priceStatusFilter === 'ALL' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'"
          >
            <span>Semua Produk</span>
            <span class="text-[10px] opacity-80">({{ stats.total }})</span>
          </button>

          <button
            @click="priceStatusFilter = 'NEED_SUBMIT'"
            class="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
            :class="priceStatusFilter === 'NEED_SUBMIT' ? 'bg-amber-500 text-white' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100'"
          >
            <SlidersHorizontal class="w-3.5 h-3.5" />
            <span>Perlu Submit (Berbeda)</span>
            <span class="text-[10px] font-bold">({{ stats.needSubmitCount }})</span>
          </button>

          <button
            v-if="stats.excelSameCount > 0"
            @click="priceStatusFilter = 'EXCEL_SAME'"
            class="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
            :class="priceStatusFilter === 'EXCEL_SAME' ? 'bg-slate-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'"
          >
            <Check class="w-3.5 h-3.5 text-emerald-500" />
            <span>Sama dari Excel ({{ stats.excelSameCount }})</span>
          </button>

          <button
            @click="priceStatusFilter = 'ADJUSTED'"
            class="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
            :class="priceStatusFilter === 'ADJUSTED' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100'"
          >
            <CheckCheck class="w-3.5 h-3.5" />
            <span>Ada Penyesuaian</span>
            <span class="text-[10px] opacity-80">({{ stats.adjustedCount }})</span>
          </button>

          <button
            @click="priceStatusFilter = 'DEFAULT'"
            class="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
            :class="priceStatusFilter === 'DEFAULT' ? 'bg-slate-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'"
          >
            <Minus class="w-3.5 h-3.5" />
            <span>Sebelum Penyesuaian ({{ stats.defaultCount }})</span>
          </button>

          <button
            @click="priceStatusFilter = 'UP'"
            class="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
            :class="priceStatusFilter === 'UP' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'"
          >
            <TrendingUp class="w-3.5 h-3.5" />
            <span>Naik ({{ stats.upCount }})</span>
          </button>

          <button
            @click="priceStatusFilter = 'DOWN'"
            class="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
            :class="priceStatusFilter === 'DOWN' ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-700'"
          >
            <TrendingDown class="w-3.5 h-3.5" />
            <span>Turun ({{ stats.downCount }})</span>
          </button>

          <button
            v-if="stats.unmatchedCount > 0"
            @click="priceStatusFilter = 'UNMATCHED'"
            class="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
            :class="priceStatusFilter === 'UNMATCHED' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 border border-rose-200'"
          >
            <AlertCircle class="w-3.5 h-3.5" />
            <span>Belum di Accurate ({{ stats.unmatchedCount }})</span>
          </button>
        </div>
      </div>

      <!-- TABLE BODY -->
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-slate-500 uppercase tracking-wider text-[10px]">
              <th v-if="visibleColumns.index" class="py-3 px-3.5 w-12 text-center">#</th>
              <th v-if="visibleColumns.sku" class="py-3 px-3.5 min-w-[200px]">SKU / Kode Barang</th>
              <th v-if="visibleColumns.name" class="py-3 px-3.5 min-w-[240px]">Nama Barang Accurate</th>
              <th v-if="visibleColumns.stock" class="py-3 px-3.5 text-center min-w-[110px]">Stok Gudang</th>
              <th v-if="visibleColumns.defaultPrice" class="py-3 px-3.5 text-right min-w-[150px]">
                <div class="flex flex-col items-end">
                  <span>Harga Satuan Accurate</span>
                  <span class="text-[9px] font-normal lowercase tracking-normal text-slate-400">harga def di accurate</span>
                </div>
              </th>
              <th v-if="visibleColumns.adjustedPrice" class="py-3 px-3.5 text-right min-w-[140px]">
                <div class="flex flex-col items-end">
                  <span>Harga Penyesuaian</span>
                  <span class="text-[9px] font-normal lowercase tracking-normal text-slate-400">imall / accurate spa</span>
                </div>
              </th>
              <th v-if="visibleColumns.activePrice" class="py-3 px-3.5 text-right min-w-[150px]">
                <div class="flex flex-col items-end">
                  <span>Harga Aktif (Ready)</span>
                  <span class="text-[9px] font-normal lowercase tracking-normal text-slate-400">harga final berlaku (+4,545%)</span>
                </div>
              </th>
              <th v-if="visibleColumns.diff" class="py-3 px-3.5 text-right min-w-[130px]">Selisih</th>
              <th v-if="visibleColumns.status" class="py-3 px-3.5 text-center min-w-[130px]">Status Harga</th>
              <th v-if="visibleColumns.action" class="py-3 px-3.5 text-center min-w-[110px]">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <!-- EMPTY STATE -->
            <tr v-if="displayedProducts.length === 0">
              <td :colspan="visibleColumnCount" class="py-12 text-center text-slate-400">
                <div class="flex flex-col items-center justify-center gap-2">
                  <Package class="w-8 h-8 text-slate-400" />
                  <p class="font-medium text-xs text-slate-600 dark:text-slate-300">
                    Tidak ada produk yang sesuai dengan filter pencarian.
                  </p>
                </div>
              </td>
            </tr>

            <!-- PRODUCT ROWS -->
            <tr 
              v-for="(item, idx) in displayedProducts" 
              :key="item.id"
              class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
              :class="item.hasPendingChange ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''"
            >
              <!-- Index -->
              <td v-if="visibleColumns.index" class="py-3 px-3.5 text-center text-slate-400 font-mono text-[11px]">
                {{ idx + 1 }}
              </td>

              <!-- SKU & Category -->
              <td v-if="visibleColumns.sku" class="py-3 px-3.5">
                <div class="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>{{ item.sku }}</span>
                  <span 
                    class="px-1.5 py-0.2 text-[9px] font-sans font-semibold rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    {{ item.brand }}
                  </span>
                </div>
                <div class="text-[11px] text-slate-400 mt-0.5">
                  {{ item.category }}
                </div>
              </td>

              <!-- Item Name -->
              <td v-if="visibleColumns.name" class="py-3 px-3.5">
                <div class="font-medium text-slate-800 dark:text-slate-200 line-clamp-2">
                  {{ item.itemName }}
                </div>
              </td>

              <!-- Stock Quantity & Status -->
              <td v-if="visibleColumns.stock" class="py-3 px-3.5 text-center">
                <span 
                  v-if="item.isReadyStock"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                  Ready {{ item.stockQty }} {{ item.unitName }}
                </span>
                <span 
                  v-else
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800"
                >
                  Indent
                </span>
              </td>

              <!-- Harga Default Accurate -->
              <td v-if="visibleColumns.defaultPrice" class="py-3 px-3.5 text-right font-mono text-slate-500">
                {{ formatRupiah(item.defaultPrice) }}
              </td>

              <!-- Harga Penyesuaian -->
              <td v-if="visibleColumns.adjustedPrice" class="py-3 px-3.5 text-right font-mono">
                <div 
                  v-if="item.hasPendingChange"
                  class="font-bold text-amber-600 dark:text-amber-400"
                >
                  {{ formatRupiah(item.pendingNewPrice) }}
                  <span class="text-[9px] font-normal block text-amber-500">(Belum Submit)</span>
                </div>
                <div 
                  v-else-if="item.adjustedPrice"
                  class="font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  {{ formatRupiah(item.adjustedPrice) }}
                </div>
                <div v-else class="text-slate-400 italic text-[11px]">
                  -
                </div>
              </td>

              <!-- Harga Aktif (Ready) -->
              <td v-if="visibleColumns.activePrice" class="py-3 px-3.5 text-right font-mono font-bold">
                <span 
                  :class="item.hasPendingChange ? 'text-amber-600' : item.hasAdjustment ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'"
                >
                  {{ formatRupiah(item.hasPendingChange ? item.pendingNewPrice : item.activePrice) }}
                </span>
                <span 
                  class="block text-[9px] font-sans font-medium"
                  :class="item.hasPendingChange ? 'text-amber-600' : item.hasAdjustment ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'"
                >
                  <span v-if="item.hasPendingChange">Penyesuaian Baru</span>
                  <span v-else-if="item.hasAdjustment">Harga Penyesuaian (+4,545%)</span>
                  <span v-else>Murni Harga Satuan (+4,545%)</span>
                </span>
              </td>

              <!-- Selisih -->
              <td v-if="visibleColumns.diff" class="py-3 px-3.5 text-right font-mono">
                <div 
                  v-if="(item.hasPendingChange || item.hasAdjustment) && item.diffAmount !== 0"
                  class="font-bold flex items-center justify-end gap-1"
                  :class="item.diffAmount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-sky-600 dark:text-sky-400'"
                >
                  <TrendingUp v-if="item.diffAmount > 0" class="w-3 h-3" />
                  <TrendingDown v-else class="w-3 h-3" />
                  <span>{{ item.diffAmount > 0 ? '+' : '' }}{{ formatRupiah(item.diffAmount) }}</span>
                </div>
                <div 
                  v-if="(item.hasPendingChange || item.hasAdjustment) && item.diffAmount !== 0"
                  class="text-[10px] font-semibold"
                  :class="item.diffAmount > 0 ? 'text-emerald-500' : 'text-sky-500'"
                >
                  {{ item.diffPercent > 0 ? '+' : '' }}{{ item.diffPercent }}%
                </div>
                <div v-else class="text-slate-400 text-[11px]">
                  -
                </div>
              </td>

              <!-- Status Harga Badge -->
              <td v-if="visibleColumns.status" class="py-3 px-3.5 text-center">
                <span 
                  v-if="item.hasPendingChange"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200"
                >
                  <Clock class="w-2.5 h-2.5" />
                  Berbeda (Perlu Submit)
                </span>
                <span 
                  v-else-if="item.excelStatus === 'SAME'"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200"
                >
                  <Check class="w-2.5 h-2.5 text-emerald-500" />
                  Sama (Sesuai)
                </span>
                <span 
                  v-else-if="item.hasAdjustment"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200"
                >
                  <CheckCheck class="w-2.5 h-2.5" />
                  Disesuaikan
                </span>
                <span 
                  v-else
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800"
                >
                  Harga Def Satuan
                </span>
              </td>

              <!-- Action -->
              <td v-if="visibleColumns.action" class="py-3 px-3.5 text-center">
                <div class="flex items-center justify-center gap-1.5">
                  <!-- Submit button if pending -->
                  <button
                    v-if="item.hasPendingChange"
                    @click="submitSingleItem(item)"
                    :disabled="isSubmittingSingle[item.id]"
                    class="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1"
                    title="Simpan penyesuaian harga ini ke Accurate"
                  >
                    <RefreshCw v-if="isSubmittingSingle[item.id]" class="w-3 h-3 animate-spin" />
                    <Send v-else class="w-3 h-3" />
                    <span>Submit</span>
                  </button>

                  <!-- Edit button -->
                  <button
                    @click="openEditModal(item)"
                    class="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Ubah harga penyesuaian"
                  >
                    <Edit3 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- MODAL: EDIT PRICE -->
    <div 
      v-if="isEditModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 class="text-sm font-bold text-slate-900 dark:text-white">
            Ubah Harga Penyesuaian
          </h3>
          <button @click="isEditModalOpen = false" class="text-slate-400 hover:text-slate-600">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="space-y-3">
          <div class="text-xs">
            <div class="font-mono font-bold text-slate-800 dark:text-slate-200">{{ editingItem?.sku }}</div>
            <div class="text-slate-500 truncate">{{ editingItem?.itemName }}</div>
            <div class="mt-1 text-slate-500">
              Harga Default Accurate: <span class="font-mono font-bold text-slate-700 dark:text-slate-300">{{ formatRupiah(editingItem?.defaultPrice) }}</span>
            </div>
          </div>

          <div class="space-y-1">
            <label class="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Harga Penyesuaian Baru (iMall)
            </label>
            <div class="relative">
              <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
              <input
                v-model="editNewPrice"
                type="text"
                class="w-full pl-10 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-semibold"
              />
            </div>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2">
          <button
            @click="isEditModalOpen = false"
            class="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            @click="saveEditPrice"
            class="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Simpan Perubahan
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: CONFIRM BULK SUBMIT -->
    <div 
      v-if="isBulkModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div class="flex items-center gap-3">
          <div class="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
            <Send class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900 dark:text-white">
              Submit Masal Penyesuaian Harga
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">
              Perbarui harga Accurate Online secara masal
            </p>
          </div>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
          <div class="flex items-center justify-between font-medium">
            <span class="text-slate-600 dark:text-slate-400">Total barang yang akan diupdate:</span>
            <span class="font-bold text-slate-900 dark:text-white font-mono">{{ stats.needSubmitCount }} item</span>
          </div>
          <div class="text-[11px] text-slate-500 flex items-start gap-1.5 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60">
            <Info class="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
            <span>Maksimal 1.000 item per Dokumen SPA Accurate. Sistem otomatis mengisi dokumen terbuka atau membuat dokumen baru jika kuota 1.000 item tercapai.</span>
          </div>
        </div>

        <div v-if="isBulkSubmitting" class="space-y-2 pt-2">
          <div class="flex items-center justify-between text-xs text-slate-600">
            <span>Memproses sinkronisasi...</span>
            <span class="font-mono font-bold">{{ bulkProgress.current }} / {{ bulkProgress.total }} ({{ bulkProgress.percent }}%)</span>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div 
              class="bg-emerald-500 h-2.5 transition-all duration-300 rounded-full"
              :style="{ width: `${bulkProgress.percent}%` }"
            ></div>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            @click="isBulkModalOpen = false"
            :disabled="isBulkSubmitting"
            class="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700"
          >
            Batal
          </button>
          <button
            @click="executeBulkSubmit"
            :disabled="isBulkSubmitting"
            class="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
          >
            <RefreshCw v-if="isBulkSubmitting" class="w-3.5 h-3.5 animate-spin" />
            <span>{{ isBulkSubmitting ? 'Menyimpan...' : 'Ya, Update Sekarang' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: AUDIT LOGS -->
    <div 
      v-if="isHistoryModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-2.5">
            <div class="p-2 bg-slate-100 text-slate-700 rounded-lg">
              <Clock class="w-5 h-5" />
            </div>
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-white">
                Riwayat Penyesuaian Harga
              </h3>
              <p class="text-xs text-slate-500">
                Catatan riwayat perubahan harga barang yang pernah disubmit ke Accurate
              </p>
            </div>
          </div>
          <button @click="isHistoryModalOpen = false" class="text-slate-400 hover:text-slate-600">
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl">
          <div v-if="isLoadingLogs" class="py-12 text-center text-slate-400">
            <RefreshCw class="w-6 h-6 animate-spin mx-auto mb-2 text-slate-500" />
            <p class="text-xs">Memuat riwayat perubahan...</p>
          </div>

          <div v-else-if="adjustmentLogs.length === 0" class="py-12 text-center text-slate-400">
            <p class="text-xs">Belum ada riwayat penyesuaian harga tercatat.</p>
          </div>

          <table v-else class="w-full text-left text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider text-[10px] sticky top-0">
              <tr class="border-b border-slate-200 dark:border-slate-800">
                <th class="py-2.5 px-3">Waktu</th>
                <th class="py-2.5 px-3">SKU</th>
                <th class="py-2.5 px-3">Nama Barang</th>
                <th class="py-2.5 px-3 text-right">Harga Lama</th>
                <th class="py-2.5 px-3 text-right">Harga Baru</th>
                <th class="py-2.5 px-3 text-right">Selisih</th>
                <th class="py-2.5 px-3">Oleh</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              <tr v-for="log in adjustmentLogs" :key="log.id" class="hover:bg-slate-50/50">
                <td class="py-2.5 px-3 text-[11px] text-slate-400">
                  {{ new Date(log.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }}
                </td>
                <td class="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                  {{ log.sku }}
                </td>
                <td class="py-2.5 px-3 font-sans truncate max-w-[180px] text-slate-600">
                  {{ log.item_name || '-' }}
                </td>
                <td class="py-2.5 px-3 text-right text-slate-500">
                  {{ formatRupiah(log.old_price) }}
                </td>
                <td class="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">
                  {{ formatRupiah(log.new_price) }}
                </td>
                <td class="py-2.5 px-3 text-right font-bold" :class="log.diff_amount > 0 ? 'text-emerald-600' : log.diff_amount < 0 ? 'text-sky-600' : 'text-slate-400'">
                  {{ log.diff_amount > 0 ? '+' : '' }}{{ formatRupiah(log.diff_amount) }}
                </td>
                <td class="py-2.5 px-3 font-sans text-slate-500 text-[11px] truncate max-w-[120px]">
                  {{ log.adjusted_by || '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-between pt-2 text-xs text-slate-500">
          <span>Menampilkan {{ adjustmentLogs.length }} catatan terakhir</span>
          <button
            @click="isHistoryModalOpen = false"
            class="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
