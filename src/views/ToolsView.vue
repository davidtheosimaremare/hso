<script setup>
import { ref, reactive, computed, onMounted, watch, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAccurateItems, CATEGORY_PRIORITY } from '@/composables/useAccurateItems'
import { ComponentConverter, formatRupiah, cleanPartNumber } from '@/utils/componentConverter'
import DatabaseMappingTable from '@/components/DatabaseMappingTable.vue'
import { 
  ArrowRightLeft, 
  Zap, 
  CheckCircle2, 
  Search, 
  Copy, 
  Check, 
  Download, 
  Upload, 
  RefreshCw, 
  Trash2, 
  Plus, 
  Edit,
  FileSpreadsheet, 
  ShoppingCart, 
  AlertCircle, 
  Database, 
  X,
  Layers,
  Sparkles,
  Info,
  ChevronRight,
  Filter,
  TrendingDown,
  DollarSign,
  Bot,
  Settings,
  Wand2
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

// Role & Permissions Injection
const userRole = inject('userRole', ref('STAFF'))
const allowedModules = inject('allowedModules', ref([]))
const canManageMapping = computed(() => {
  return userRole.value === 'ADMIN' || 
         allowedModules.value?.includes('database-mapping:read') || 
         allowedModules.value?.includes('database-mapping:write') || 
         allowedModules.value?.includes('settings:read') || 
         allowedModules.value?.includes('settings:write')
})

// -------------------------------------------------------------
// 2 MAIN TABS: 'convert' | 'database'
// -------------------------------------------------------------
const activeTab = ref('convert') // 'convert' | 'database'

// Inside Convert Tab: 'single' (Google Translate Style) | 'batch' (Bulky)
const convertMode = ref('single') // 'single' | 'batch'

// Accurate Items & Rules Composable
const { 
  items: accurateItems, 
  customRules, 
  mappedCount,
  isLoading: isItemsLoading, 
  isSyncing: isCatalogSyncing,
  syncProgress: catalogSyncProgress,
  lastSyncFormatted: catalogLastSync,
  fetchItems, 
  fetchCustomRules, 
  upsertRuleBySiemensMlfb,
  saveCustomRule, 
  updateCustomRule,
  deleteCustomRule, 
  syncFromShopApi,
  syncItems 
} = useAccurateItems()

// Initialize Converter Engine
const converterEngine = new ComponentConverter(accurateItems.value)

// Keep converter engine in sync with accurateItems & customRules
watch(accurateItems, (newItems) => {
  converterEngine.setAccurateItems(newItems)
  if (singleInput.value) {
    handleSingleConvert()
  }
}, { deep: true })

watch(customRules, () => {
  if (singleInput.value) {
    handleSingleConvert()
  }
}, { deep: true })

onMounted(() => {
  converterEngine.setAccurateItems(accurateItems.value)

  // Non-blocking background silent sync with Supabase
  fetchCustomRules()
  fetchItems().then(() => {
    converterEngine.setAccurateItems(accurateItems.value)
  })
})

// Toast notification state
const toastMsg = ref('')
const toastType = ref('success') // 'success' | 'info' | 'error'
const showToast = (msg, type = 'success') => {
  toastMsg.value = msg
  toastType.value = type
  setTimeout(() => {
    toastMsg.value = ''
  }, 3500)
}

// -------------------------------------------------------------
// TAB 1: CONVERT (GOOGLE TRANSLATE STYLE & BATCH)
// -------------------------------------------------------------
const sourceBrand = ref('AUTO') // 'AUTO' | 'SCHNEIDER' | 'ABB' | 'SIEMENS' | 'OTHER'
const targetBrand = ref('SIEMENS') // 'SIEMENS' | 'SCHNEIDER' | 'ABB'
const singleInput = ref('')
const singleResult = ref(null)
const isCopied = ref(false)

const detectedSourceBrand = computed(() => {
  if (sourceBrand.value !== 'AUTO') return sourceBrand.value
  if (!singleInput.value.trim()) return 'AUTO'
  const det = singleResult.value?.sourceBrand || converterEngine.detectBrand(singleInput.value)
  return det || 'SCHNEIDER'
})

const sourceItemDesc = computed(() => {
  if (!singleResult.value || !singleResult.value.success) return ''
  const brand = detectedSourceBrand.value
  if (brand === 'SIEMENS') {
    return singleResult.value.siemensName || ''
  } else if (brand === 'SCHNEIDER') {
    return singleResult.value.schneiderDesc || singleResult.value.specsSummary || ''
  } else if (brand === 'ABB') {
    return singleResult.value.abbDesc || singleResult.value.specsSummary || ''
  }
  return singleResult.value.specsSummary || ''
})

const sourceItemPrice = computed(() => {
  if (!singleResult.value || !singleResult.value.success) return null
  const brand = detectedSourceBrand.value
  if (brand === 'SIEMENS') {
    return singleResult.value.accurateItem?.unit_price || null
  } else if (brand === 'SCHNEIDER') {
    return singleResult.value.schneiderPrice || null
  } else if (brand === 'ABB') {
    return singleResult.value.abbPrice || null
  }
  return null
})

const getBrandLogo = (brand) => {
  if (brand === 'SIEMENS') return '/logosiemens.webp'
  if (brand === 'SCHNEIDER') return '/logoschneider.png'
  if (brand === 'ABB') return '/logoabb.png'
  return null
}

const siemensProductDesc = computed(() => {
  if (!singleResult.value || !singleResult.value.success) return ''
  const item = singleResult.value.accurateItem
  
  // 1. Primary: description / long_description from Accurate Item
  const accurateDesc = (item?.long_description || item?.description || '').trim()
  const siemensName = (singleResult.value.siemensName || item?.item_name || '').trim()
  
  if (accurateDesc && accurateDesc.toLowerCase() !== siemensName.toLowerCase()) {
    return accurateDesc
  }
  
  // 2. Secondary: Valid Siemens specs summary (ensure it is not competitor description text)
  const specs = (singleResult.value.specsSummary || '').trim()
  const schDesc = (singleResult.value.schneiderDesc || '').trim()
  const abbDesc = (singleResult.value.abbDesc || '').trim()
  
  if (specs && 
      specs.toLowerCase() !== siemensName.toLowerCase() && 
      (!schDesc || specs.toLowerCase() !== schDesc.toLowerCase()) && 
      (!abbDesc || specs.toLowerCase() !== abbDesc.toLowerCase())) {
    return specs
  }
  
  return ''
})

const formatStockStatus = (item) => {
  if (!item) return { label: 'Indent', isReady: false }
  const qty = Number(item.available_to_sell ?? item.stock_quantity ?? 0)
  if (qty > 0) {
    const unit = item.unit_name || 'Pcs'
    return {
      label: `Stock: ${qty} ${unit}`,
      isReady: true
    }
  }
  if (item.stock_status && item.stock_status.toUpperCase() === 'READY' && qty <= 0) {
    return { label: 'Stock: Ready', isReady: true }
  }
  return { label: 'Indent', isReady: false }
}

const handleSingleConvert = () => {
  if (!singleInput.value.trim()) {
    singleResult.value = null
    return
  }
  const brand = sourceBrand.value === 'AUTO' ? null : sourceBrand.value
  const res = converterEngine.convert(singleInput.value.trim(), brand, customRules.value)
  singleResult.value = res
}

// Brand Swap (Google Translate Swap)
const swapBrands = () => {
  if (sourceBrand.value === 'SIEMENS') {
    sourceBrand.value = targetBrand.value === 'SCHNEIDER' ? 'SCHNEIDER' : 'ABB'
    targetBrand.value = 'SIEMENS'
  } else {
    sourceBrand.value = 'SIEMENS'
    targetBrand.value = 'SCHNEIDER'
    if (singleResult.value?.siemensMLFB) {
      singleInput.value = singleResult.value.siemensMLFB
    }
  }
  handleSingleConvert()
}

const copyToClipboard = (text, label = 'MLFB') => {
  if (!text) return
  navigator.clipboard.writeText(text)
  isCopied.value = true
  showToast(`${label} "${text}" berhasil disalin!`, 'success')
  setTimeout(() => {
    isCopied.value = false
  }, 2000)
}

// Add to Cart
const isAddingToCart = ref(false)
const addToPurchaseCart = async (itemMLFB, itemName) => {
  if (!itemMLFB) return
  isAddingToCart.value = true
  try {
    const payload = {
      so_id: 'CONVERTER_TOOL',
      so_number: 'TOOLS-CONVERTER',
      company_name: 'Stok Converter (Internal)',
      item_code: itemMLFB,
      item_name: itemName || `Siemens ${itemMLFB}`,
      qty_to_order: 1,
      notes: `Ditambahkan otomatis dari Tools Component Converter`
    }
    const { error } = await supabase.from('purchase_cart').upsert([payload], { onConflict: 'so_id,item_code' })
    if (error) throw error
    showToast(`Berhasil menambahkan ${itemMLFB} ke Rencana Pembelian!`, 'success')
  } catch (e) {
    showToast(`Gagal menambahkan ke keranjang: ${e.message}`, 'error')
  } finally {
    isAddingToCart.value = false
  }
}

// -------------------------------------------------------------
// BATCH CONVERTER (BULKY)
// -------------------------------------------------------------
const batchInputText = ref('')
const batchBrand = ref('AUTO')
const batchResults = ref([])
const batchSearchFilter = ref('')
const isProcessingBatch = ref(false)

const sampleBatchText = `A9F74106
A9F74210
A9F74316
A9F74325
LC1D09M7
LC1D18M7
LC1D25M7
NSX100N TM100D
GV2ME10
GV2ME14
LRD21
S201-C6
S203-C16
AF26-30-00-13
5SL6106-7RC`

const loadSampleBatch = () => {
  batchInputText.value = sampleBatchText
  processBatchConversion()
}

const processBatchConversion = () => {
  if (!batchInputText.value.trim()) {
    showToast('Silakan masukkan daftar part number terlebih dahulu.', 'error')
    return
  }
  isProcessingBatch.value = true
  try {
    const lines = batchInputText.value
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)

    const brand = batchBrand.value === 'AUTO' ? null : batchBrand.value
    batchResults.value = converterEngine.convertBatch(lines, brand, customRules.value)
    showToast(`Berhasil mengonversi ${batchResults.value.length} komponen!`, 'success')
  } catch (e) {
    showToast(`Gagal memproses batch: ${e.message}`, 'error')
  } finally {
    isProcessingBatch.value = false
  }
}

// Handle Excel File Drop/Upload
const handleFileUpload = (e) => {
  const file = e.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (evt) => {
    try {
      const data = new Uint8Array(evt.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      const lines = []
      jsonData.forEach((row, idx) => {
        if (!row || row.length === 0) return
        const cell = row[0] || row[1] || row[2]
        if (cell && typeof cell === 'string' && cell.trim() && idx > 0) {
          lines.push(cell.trim())
        }
      })

      if (lines.length > 0) {
        batchInputText.value = lines.join('\n')
        processBatchConversion()
        showToast(`Berhasil membaca ${lines.length} baris dari file Excel.`, 'success')
      } else {
        showToast('Tidak ditemukan data part number pada file Excel.', 'error')
      }
    } catch (err) {
      showToast(`Gagal membaca file: ${err.message}`, 'error')
    }
  }
  reader.readAsArrayBuffer(file)
}

// Filtered Batch Table
const filteredBatchResults = computed(() => {
  if (!batchSearchFilter.value.trim()) return batchResults.value
  const q = batchSearchFilter.value.toLowerCase().trim()
  return batchResults.value.filter(r => 
    (r.sourceInput && r.sourceInput.toLowerCase().includes(q)) ||
    (r.siemensMLFB && r.siemensMLFB.toLowerCase().includes(q)) ||
    (r.siemensName && r.siemensName.toLowerCase().includes(q)) ||
    (r.category && r.category.toLowerCase().includes(q))
  )
})

// Batch Summary Stats
const batchStats = computed(() => {
  const total = batchResults.value.length
  if (total === 0) return { total: 0, matched: 0, accurateCount: 0, totalEstimatedPrice: 0 }
  
  let accurateCount = 0
  let matched = 0
  let totalEstimatedPrice = 0

  batchResults.value.forEach(r => {
    if (r.success) matched++
    if (r.accurateItem) {
      accurateCount++
      totalEstimatedPrice += (r.accurateItem.unit_price || 0) * (r.quantity || 1)
    }
  })

  return {
    total,
    matched,
    accurateCount,
    totalEstimatedPrice,
    matchRate: Math.round((matched / total) * 100)
  }
})

// Export Batch to Excel
const exportBatchToExcel = () => {
  if (!batchResults.value.length) {
    showToast('Tidak ada data untuk diekspor.', 'error')
    return
  }

  const exportData = batchResults.value.map((r, i) => ({
    'No': i + 1,
    'Komponen Asal (Input)': r.sourceInput,
    'Merk Asal': r.sourceBrand || '-',
    'Kategori': r.category || '-',
    'Ekuivalen Siemens (MLFB)': r.siemensMLFB || '-',
    'Deskripsi Resmi Accurate': r.accurateItem?.item_name || r.siemensName || '-',
    'Tingkat Kesesuaian': r.matchConfidence ? `${r.matchConfidence}%` : 'Direct',
    'Status di Accurate': r.accurateItem ? 'Tercatat di Accurate' : 'Ekuivalen Standar',
    'Harga Satuan Accurate (Rp)': r.accurateItem?.unit_price || 0,
    'Qty': r.quantity || 1,
    'Total Estimasi (Rp)': (r.accurateItem?.unit_price || 0) * (r.quantity || 1),
    'Catatan Teknis': r.notes || '-'
  }))

  const ws = XLSX.utils.json_to_sheet(exportData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Hasil Konversi Siemens')
  XLSX.writeFile(wb, `Konversi_Komponen_Siemens_${new Date().toISOString().slice(0, 10)}.xlsx`)
  showToast('File Excel perbandingan berhasil diunduh!', 'success')
}

// -------------------------------------------------------------
// 1-CLICK DIRECT SYNC SIEMENS FROM SHOP VPS API
// -------------------------------------------------------------
const handleDirectSyncSiemens = async () => {
  try {
    showToast('Memulai sinkronisasi katalog Siemens dari Toko...', 'info')
    const res = await syncFromShopApi(null, {
      brand: 'SIEMENS',
      limit: 500
    })
    showToast(`Berhasil! Seluruh ${res.totalImported || res.totalRecords} produk Siemens berhasil disinkronkan ke database!`, 'success')
  } catch (err) {
    showToast(`Gagal sinkronisasi API: ${err.message}`, 'error')
  }
}
</script>

<template>
  <div class="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-5 font-sans">

    <!-- Toast Notification -->
    <transition
      enter-active-class="transition ease-out duration-200 transform"
      enter-from-class="-translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition ease-in duration-150 transform"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="-translate-y-2 opacity-0"
    >
      <div 
        v-if="toastMsg"
        class="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-lg shadow-lg border text-xs font-semibold backdrop-blur-md bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-slate-100"
        :class="toastType === 'error' ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-slate-300 dark:border-zinc-700'"
      >
        <CheckCircle2 v-if="toastType === 'success'" class="w-4 h-4 text-emerald-600 shrink-0" />
        <AlertCircle v-else class="w-4 h-4 text-red-600 shrink-0" />
        <span>{{ toastMsg }}</span>
      </div>
    </transition>
    
    <!-- Clean Minimalist Header -->
    <div class="bg-white dark:bg-zinc-900 rounded-xl p-5 border border-slate-200 dark:border-zinc-800 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h1 class="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
          Component Converter
        </h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Konversi kesetaraan produk antar-merek dan master database mapping
        </p>
      </div>

      <div class="flex items-center gap-2.5 shrink-0 flex-wrap">
        <span class="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-zinc-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700">
          Katalog: <strong class="text-slate-800 dark:text-slate-200">{{ accurateItems.length }}</strong> item
        </span>
        <button
          @click="handleDirectSyncSiemens"
          :disabled="isCatalogSyncing"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isCatalogSyncing }" />
          <span>{{ isCatalogSyncing ? `Syncing ${catalogSyncProgress}%...` : 'Sync Database' }}</span>
        </button>
      </div>
    </div>

    <!-- 2 MAIN TABS (Minimalist with Red Border Active) -->
    <div class="flex items-center gap-2 border-b border-slate-200 dark:border-zinc-800 pb-2">
      <!-- TAB 1: CONVERT -->
      <button
        @click="activeTab = 'convert'"
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border"
        :class="activeTab === 'convert' 
          ? 'bg-white dark:bg-zinc-900 text-red-600 dark:text-red-400 border-red-600 shadow-sm' 
          : 'bg-transparent text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-zinc-800'"
      >
        <ArrowRightLeft class="w-4 h-4" />
        <span>1. Convert Produk</span>
      </button>

      <!-- TAB 2: DATABASE MAPPING -->
      <button
        @click="activeTab = 'database'"
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border"
        :class="activeTab === 'database' 
          ? 'bg-white dark:bg-zinc-900 text-red-600 dark:text-red-400 border-red-600 shadow-sm' 
          : 'bg-transparent text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-zinc-800'"
      >
        <Database class="w-4 h-4" />
        <span>2. Database Mapping</span>
        <span 
          class="px-1.5 py-0.5 text-[10px] font-mono rounded font-semibold transition-colors"
          :class="mappedCount > 0 
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
            : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400'"
        >
          {{ mappedCount }}
        </span>
      </button>
    </div>

    <!-- ========================================================= -->
    <!-- TAB 1: CONVERT VIEW                                       -->
    <!-- ========================================================= -->
    <div v-if="activeTab === 'convert'" class="space-y-4">

      <!-- View Mode Selector: Single vs Batch -->
      <div class="flex items-center gap-2">
        <button
          @click="convertMode = 'single'"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border"
          :class="convertMode === 'single'
            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm'
            : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-zinc-800 hover:bg-slate-50'"
        >
          Mode Satuan
        </button>

        <button
          @click="convertMode = 'batch'"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border"
          :class="convertMode === 'batch'
            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm'
            : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-zinc-800 hover:bg-slate-50'"
        >
          <FileSpreadsheet class="w-3.5 h-3.5" />
          <span>Mode Batch (Bulky)</span>
          <span v-if="batchResults.length > 0" class="px-1.5 py-0.2 text-[10px] font-mono font-bold bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400 rounded">
            {{ batchResults.length }}
          </span>
        </button>
      </div>

      <!-- ------------------------------------------------------- -->
      <!-- 1A. GOOGLE TRANSLATE STYLE VIEW                         -->
      <!-- ------------------------------------------------------- -->
      <div v-if="convertMode === 'single'" class="space-y-4">

        <!-- 2-Column Split Box -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          
          <!-- LEFT COLUMN: SOURCE INPUT -->
          <div class="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 shadow-sm flex flex-col justify-between space-y-4">
            
            <!-- Left Header: Auto-Detected Brand Badge & Clear Button -->
            <div class="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-zinc-800 min-h-[38px]">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Input Part Number:</span>

                <!-- Auto-Detected Brand Indicator -->
                <div
                  v-if="singleInput.trim() && detectedSourceBrand !== 'AUTO'"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 shadow-2xs"
                >
                  <span class="text-[10px] text-slate-400 font-medium">Terdeteksi:</span>
                  <img
                    v-if="getBrandLogo(detectedSourceBrand)"
                    :src="getBrandLogo(detectedSourceBrand)"
                    :alt="detectedSourceBrand"
                    class="h-5 max-w-[85px] object-contain"
                  />
                </div>
              </div>

              <button
                v-if="singleInput"
                @click="singleInput = ''; handleSingleConvert()"
                class="text-xs text-slate-400 hover:text-red-600 flex items-center gap-1 cursor-pointer transition-colors ml-auto"
                title="Hapus input"
              >
                <X class="w-3.5 h-3.5" />
                <span>Hapus</span>
              </button>
            </div>

            <!-- Input Textarea & Source Item Details -->
            <div class="flex-1 flex flex-col space-y-3">
              <textarea
                v-model="singleInput"
                @input="handleSingleConvert"
                rows="5"
                placeholder="Ketik kode part number, misal: A9F74106, LC1D25M7, S201-C6, 5SL6106-7RC, 5TJ3106-7..."
                class="w-full flex-1 p-3 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-base font-mono font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all resize-none"
              ></textarea>

              <!-- Source Product Description & Price -->
              <div
                v-if="singleResult && singleResult.success && (sourceItemDesc || sourceItemPrice)"
                class="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-950/60 space-y-2 text-xs transition-all shadow-2xs"
              >
                <!-- Description -->
                <div v-if="sourceItemDesc" class="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                  {{ sourceItemDesc }}
                </div>

                <!-- Price -->
                <div v-if="sourceItemPrice" class="pt-1.5 border-t border-slate-200/60 dark:border-zinc-800 flex items-center gap-1.5">
                  <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pricelist:</span>
                  <span class="font-mono font-bold text-slate-900 dark:text-white text-sm">
                    {{ formatRupiah(sourceItemPrice) }}
                  </span>
                </div>
              </div>
            </div>

          </div>

          <!-- RIGHT COLUMN: TARGET RESULT (ATAS - BAWAH STACK) -->
          <div class="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 hover:border-red-400 dark:hover:border-red-600/60 p-4 shadow-sm flex flex-col justify-between space-y-4 transition-all">
            
            <!-- Target Header -->
            <div class="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-zinc-800 min-h-[38px]">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Hasil Padanan:</span>
                <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/50 shadow-2xs">
                  <img src="/logosiemens.webp" alt="Siemens" class="h-4.5 max-w-[85px] object-contain" />
                </div>
              </div>
            </div>

            <!-- Result Body (Siemens Only) -->
            <div class="flex-1 flex flex-col justify-center">
              
              <!-- Result Available -->
              <div v-if="singleResult && singleResult.success" class="space-y-3.5">
                
                <!-- CARD: SIEMENS -->
                <div class="p-4 rounded-xl border border-cyan-200 dark:border-cyan-950/60 bg-cyan-50/20 dark:bg-cyan-950/10 space-y-3 shadow-2xs">
                  
                  <!-- Header: Category & Stock Status -->
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <div class="flex items-center gap-2">
                      <img src="/logosiemens.webp" alt="Siemens" class="h-5.5 max-w-[95px] object-contain" />
                      <span v-if="singleResult.category" class="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-900/60 text-cyan-800 dark:text-cyan-200 border border-cyan-200 dark:border-cyan-800">
                        {{ singleResult.category }}
                      </span>
                    </div>
                    <span 
                      class="text-[11px] font-bold px-2 py-0.5 rounded border transition-colors"
                      :class="formatStockStatus(singleResult.accurateItem).isReady 
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' 
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'"
                    >
                      {{ formatStockStatus(singleResult.accurateItem).label }}
                    </span>
                  </div>

                  <!-- Siemens SKU & Copy Button -->
                  <div class="flex items-center justify-between gap-2 pt-0.5">
                    <div class="text-xl font-mono font-black text-slate-900 dark:text-white tracking-tight">
                      {{ singleResult.siemensMLFB }}
                    </div>
                    <button
                      @click="copyToClipboard(singleResult.siemensMLFB, 'Part Number Siemens')"
                      class="px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 hover:border-red-500 hover:text-red-600 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shrink-0 shadow-2xs"
                      title="Salin Part Number"
                    >
                      <Check v-if="isCopied" class="w-3.5 h-3.5 text-emerald-600" />
                      <Copy v-else class="w-3.5 h-3.5" />
                      <span>{{ isCopied ? 'Tersalin' : 'Salin' }}</span>
                    </button>
                  </div>

                  <!-- Siemens Item Name -->
                  <div class="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                    {{ singleResult.siemensName || singleResult.accurateItem?.item_name || `Siemens ${singleResult.siemensMLFB}` }}
                  </div>

                  <!-- Specifications / Product Description (from Accurate item description if available) -->
                  <div 
                    v-if="siemensProductDesc" 
                    class="text-[11px] text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-zinc-900/70 p-2.5 rounded-lg border border-slate-200/60 dark:border-zinc-800/60 leading-relaxed"
                  >
                    <span class="font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px] block mb-0.5">Deskripsi / Spesifikasi Produk:</span>
                    {{ siemensProductDesc }}
                  </div>

                  <!-- Siemens Price (if available) -->
                  <div v-if="singleResult.accurateItem?.unit_price" class="pt-2 border-t border-cyan-200/50 dark:border-cyan-950/40 text-xs flex items-center justify-between">
                    <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pricelist:</span>
                    <span class="font-mono font-bold text-red-600 dark:text-red-400 text-base">
                      {{ formatRupiah(singleResult.accurateItem.unit_price) }}
                    </span>
                  </div>
                </div>

              </div>

              <!-- Empty State -->
              <div v-else class="text-center py-10 space-y-2">
                <div class="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {{ singleInput ? 'Produk tidak ditemukan di database' : 'Ketik part number Siemens, Schneider, atau ABB' }}
                </div>
                <p class="text-[11px] text-slate-400 max-w-xs mx-auto">
                  {{ singleInput ? 'Pastikan kode part number sesuai atau cek data di tab Database Mapping.' : 'Hasil pencarian SKU, deskripsi, harga, dan ketersediaan akan langsung muncul di sini.' }}
                </p>
              </div>

            </div>

          </div>

        </div>

      </div>

      <!-- ------------------------------------------------------- -->
      <!-- 1B. BATCH CONVERTER (BULKY)                             -->
      <!-- ------------------------------------------------------- -->
      <div v-if="convertMode === 'batch'" class="space-y-4">
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          <!-- Input Area (Left 1 col) -->
          <div class="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 shadow-sm space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-700 dark:text-slate-300">
                Input Part Number (1 per baris)
              </span>
              <button
                @click="loadSampleBatch"
                class="text-[11px] font-semibold text-red-600 hover:underline cursor-pointer"
              >
                Isi Contoh
              </button>
            </div>

            <textarea
              v-model="batchInputText"
              rows="10"
              placeholder="Paste part number dari Excel di sini...&#10;A9F74106&#10;LC1D25M7&#10;S201-C6"
              class="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs font-mono font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            ></textarea>

            <div class="flex items-center gap-2">
              <button
                @click="processBatchConversion"
                :disabled="isProcessingBatch"
                class="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Zap class="w-3.5 h-3.5" />
                <span>{{ isProcessingBatch ? 'Memproses...' : 'Proses Konversi' }}</span>
              </button>

              <label class="px-3 py-2 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all cursor-pointer shrink-0 border border-slate-200 dark:border-zinc-700" title="Upload Excel">
                <Upload class="w-3.5 h-3.5" />
                <input type="file" accept=".xlsx,.xls,.csv" @change="handleFileUpload" class="hidden" />
              </label>
            </div>
          </div>

          <!-- Results Summary & Table (Right 2 cols) -->
          <div class="lg:col-span-2 space-y-3">
            
            <!-- Stats Bar -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div class="bg-white dark:bg-zinc-900 rounded-lg p-3 border border-slate-200 dark:border-zinc-800 shadow-sm">
                <span class="text-[10px] font-medium text-slate-400 uppercase">Total Komponen</span>
                <div class="text-base font-mono font-bold text-slate-900 dark:text-white">{{ batchStats.total }}</div>
              </div>
              <div class="bg-white dark:bg-zinc-900 rounded-lg p-3 border border-slate-200 dark:border-zinc-800 shadow-sm">
                <span class="text-[10px] font-medium text-slate-400 uppercase">Sukses Match</span>
                <div class="text-base font-mono font-bold text-emerald-600 dark:text-emerald-400">{{ batchStats.matched }}</div>
              </div>
              <div class="bg-white dark:bg-zinc-900 rounded-lg p-3 border border-slate-200 dark:border-zinc-800 shadow-sm">
                <span class="text-[10px] font-medium text-slate-400 uppercase">Ada di Accurate</span>
                <div class="text-base font-mono font-bold text-slate-800 dark:text-slate-200">{{ batchStats.accurateCount }}</div>
              </div>
              <div class="bg-white dark:bg-zinc-900 rounded-lg p-3 border border-slate-200 dark:border-zinc-800 shadow-sm">
                <span class="text-[10px] font-medium text-slate-400 uppercase">Estimasi Nilai</span>
                <div class="text-xs font-mono font-bold text-red-600 dark:text-red-400 truncate mt-0.5">
                  {{ formatRupiah(batchStats.totalEstimatedPrice) }}
                </div>
              </div>
            </div>

            <!-- Search & Export -->
            <div class="flex items-center justify-between gap-2.5 flex-wrap">
              <div class="relative flex-1 min-w-[180px]">
                <Search class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  v-model="batchSearchFilter"
                  type="text"
                  placeholder="Filter hasil konversi..."
                  class="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <button
                @click="exportBatchToExcel"
                :disabled="!batchResults.length"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 hover:border-red-500 text-slate-700 dark:text-slate-200 hover:text-red-600 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
              >
                <Download class="w-3.5 h-3.5" />
                <span>Export Excel</span>
              </button>
            </div>

            <!-- Batch Table -->
            <div class="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm">
              <div class="overflow-x-auto max-h-[420px]">
                <table class="w-full text-xs text-left">
                  <thead class="bg-slate-50 dark:bg-zinc-800/80 text-slate-500 dark:text-slate-400 uppercase font-bold text-[10px] sticky top-0 z-10 border-b border-slate-200 dark:border-zinc-800">
                    <tr>
                      <th class="p-2.5 w-10 text-center">#</th>
                      <th class="p-2.5">Input Asal</th>
                      <th class="p-2.5">Ekuivalen Siemens</th>
                      <th class="p-2.5">Nama Resmi</th>
                      <th class="p-2.5 text-right">Pricelist</th>
                      <th class="p-2.5 text-center">Stock</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-zinc-800 font-mono">
                    <tr v-for="(r, idx) in filteredBatchResults" :key="idx" class="hover:bg-slate-50/60 dark:hover:bg-zinc-800/40">
                      <td class="p-2.5 text-center text-slate-400 font-sans">{{ idx + 1 }}</td>
                      <td class="p-2.5 font-bold text-slate-700 dark:text-slate-200">{{ r.sourceInput }}</td>
                      <td class="p-2.5 font-bold text-red-600 dark:text-red-400">{{ r.siemensMLFB || '-' }}</td>
                      <td class="p-2.5 font-sans text-slate-600 dark:text-slate-300 max-w-xs truncate">{{ r.accurateItem?.item_name || r.siemensName || '-' }}</td>
                      <td class="p-2.5 text-right font-bold text-slate-800 dark:text-slate-200">
                        {{ r.accurateItem?.unit_price ? formatRupiah(r.accurateItem.unit_price) : '-' }}
                      </td>
                      <td class="p-2.5 text-center font-sans">
                        <span 
                          class="px-2 py-0.5 rounded text-[10px] font-semibold border"
                          :class="formatStockStatus(r.accurateItem).isReady 
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' 
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'"
                        >
                          {{ formatStockStatus(r.accurateItem).label }}
                        </span>
                      </td>
                    </tr>
                    <tr v-if="!filteredBatchResults.length">
                      <td colspan="6" class="p-8 text-center text-slate-400 font-sans">
                        Belum ada data konversi batch.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>

    <!-- ========================================================= -->
    <!-- TAB 2: DATABASE MAPPING                                   -->
    <!-- ========================================================= -->
    <div v-if="activeTab === 'database'" class="space-y-4">
      <!-- Authorized User: Render Table Component -->
      <DatabaseMappingTable v-if="canManageMapping" />

      <!-- Non-Authorized User: Polite & Professional Access Notice -->
      <div v-else class="bg-white dark:bg-zinc-900 rounded-2xl p-8 border border-slate-200 dark:border-zinc-800 shadow-sm text-center max-w-lg mx-auto space-y-4 my-8">
        <div class="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-sm">
          <Shield class="w-7 h-7" />
        </div>
        
        <div class="space-y-1.5">
          <h3 class="text-base font-bold text-slate-900 dark:text-white">Akses Dikhususkan untuk Technical Engineer & Administrator</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Halaman Database Mapping memuat konfigurasi master kesetaraan komponen teknis lintas merek. Untuk menjaga akurasi dan standarisasi data teknik, akses pengubahan hanya diberikan kepada <strong>Tim Technical Engineer</strong> dan <strong>Administrator</strong>.
          </p>
        </div>

        <div class="p-3.5 bg-slate-50 dark:bg-zinc-800/60 rounded-xl border border-slate-200 dark:border-zinc-700 text-[11px] text-slate-600 dark:text-slate-300 text-left space-y-1">
          <p class="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            <Info class="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>Informasi Hak Akses:</span>
          </p>
          <p class="leading-relaxed">
            Anda tetap dapat menggunakan seluruh fitur pencarian dan konversi komponen secara penuh pada Tab <strong class="text-red-600 dark:text-red-400">1. Convert Produk</strong>. Apabila Anda membutuhkan izin akses pengelolaan database ini, silakan hubungi Administrator.
          </p>
        </div>

        <button 
          @click="activeTab = 'convert'"
          class="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
        >
          Kembali ke Fitur Converter
        </button>
      </div>
    </div>

  </div>
</template>
