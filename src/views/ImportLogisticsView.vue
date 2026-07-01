<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import {
  UploadCloud, AlertTriangle, CheckCircle2, RefreshCw, FileSpreadsheet,
  ChevronDown, ChevronUp, Trash2, Save, Search, Building2, ExternalLink,
  Loader2, AlertCircle, FileText, ArrowRight, Check
} from 'lucide-vue-next'

const router = useRouter()

// --- 1. STATE MANAGEMENT ---
const isLoading = ref(false)
const isSubmitting = ref(false)
const loadingProgress = ref(0)
const loadingMessage = ref('')

// File Upload State
const isDragging = ref(false)
const fileInput = ref(null)
const uploadedFile = ref(null)
const excelHeaders = ref([])
const parsedRows = ref([])
const activeStep = ref('upload') // 'upload', 'mapping', 'preview', 'success'

// Column Mapping State
const columnMapping = ref({
  hpo_number: '',
  item_code: '',
  current_status: '',
  quantity: '',
  exwork_date_col: '',
  eta_date_col: '',
  delivery_date_col: ''
})

// Database Reference Data
const allSOs = ref([])
const dbShipments = ref([])
const dbPoItems = ref([]) // Pre-fetched mappings of PO -> HSO
const filterMonths = ref(3) // Default: 3 months limit for HSO date

// Analyzed / Matched Data Preview
const previewItems = ref([])
const successStats = ref({
  totalProcessed: 0,
  updatedShipments: 0,
  createdShipments: 0
})

// Helper: Parse DD/MM/YYYY to Date object
const parseDateStr = (dateStr) => {
  if (!dateStr) return new Date(0)
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    return new Date(parts[2], parts[1] - 1, parts[0])
  }
  return new Date(dateStr)
}

// Fetch active SOs and shipments from DB
const fetchDatabaseReferenceData = async () => {
  isLoading.value = true
  loadingProgress.value = 0
  loadingMessage.value = 'Menghubungkan ke Accurate...'
  allSOs.value = []
  dbShipments.value = []
  dbPoItems.value = []

  try {
    let currentPage = 1
    let totalPages = 1
    const pageSize = 100

    // 1. Fetch HSO aktif via accurate-list-tracking-so (berisi item detail)
    while (currentPage <= totalPages) {
      loadingMessage.value = `Mengambil daftar SO Accurate (Halaman ${currentPage})...`
      const { data, error } = await supabase.functions.invoke('accurate-list-tracking-so', {
        body: { page: currentPage, pageSize: pageSize }
      })

      if (error) throw error

      if (data?.pagination) {
        totalPages = data.pagination.totalPages
      }

      if (data?.d) {
        allSOs.value = allSOs.value.concat(data.d)
      }
      
      loadingProgress.value = Math.min(60, Math.round((currentPage / Math.max(totalPages, 1)) * 60))
      currentPage++
    }

    loadingProgress.value = 70
    loadingMessage.value = 'Mengambil data status pengiriman dari Supabase...'

    // Filter SOs based on date cutoff
    const cutoffDate = new Date()
    cutoffDate.setMonth(cutoffDate.getMonth() - filterMonths.value)
    
    // Filter HSO aktif yang sesuai rentang waktu saja
    allSOs.value = allSOs.value.filter(so => {
      const soDate = parseDateStr(so.transDate)
      return soDate >= cutoffDate
    })

    const soIds = allSOs.value.map(so => String(so.id))
    
    // 2. Fetch existing shipments
    if (soIds.length > 0) {
      const chunkSize = 50
      for (let i = 0; i < soIds.length; i += chunkSize) {
        const chunk = soIds.slice(i, i + chunkSize)
        const { data: shipments, error: shipErr } = await supabase
          .from('shipments')
          .select('id, so_id, item_code, current_status, hpo_number, exwork_date, eta_date, dunex_date, hokiindo_date')
          .in('so_id', chunk)
        
        if (!shipErr && shipments) {
          dbShipments.value = dbShipments.value.concat(shipments)
        }
      }
    }

    loadingProgress.value = 90
    loadingMessage.value = 'Menganalisis relasi Purchase Order...'

    // 3. Fetch PO Items to HSO mapping dari DB (untuk direct PO HSO check)
    // Ambil item PO beserta nomor PO induknya
    const { data: poItems, error: poErr } = await supabase
      .from('accurate_purchase_order_items')
      .select(`
        item_code,
        hso_number,
        accurate_purchase_orders!inner (
          number
        )
      `)
      .not('hso_number', 'is', null)

    if (!poErr && poItems) {
      dbPoItems.value = poItems.map(pi => ({
        itemCode: pi.item_code,
        hsoNumber: pi.hso_number,
        poNumber: pi.accurate_purchase_orders?.number
      }))
    }

    loadingProgress.value = 100
  } catch (err) {
    console.error('Database fetch error:', err)
    alert(`Gagal mengambil data referensi: ${err.message}`)
  } finally {
    isLoading.value = false
    loadingProgress.value = 0
  }
}

onMounted(() => {
  fetchDatabaseReferenceData()
})

watch(filterMonths, () => {
  fetchDatabaseReferenceData()
})

// --- 2. DRAG AND DROP FILE LOGIC ---
const onDragOver = (e) => {
  e.preventDefault()
  isDragging.value = true
}

const onDragLeave = () => {
  isDragging.value = false
}

const onDrop = (e) => {
  e.preventDefault()
  isDragging.value = false
  const files = e.dataTransfer.files
  if (files.length > 0) {
    handleFile(files[0])
  }
}

const triggerFileInput = () => {
  fileInput.value.click()
}

const onFileChange = (e) => {
  const files = e.target.files
  if (files.length > 0) {
    handleFile(files[0])
  }
}

const handleFile = (file) => {
  if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
    alert('Harap unggah file Excel (.xlsx / .xls) atau CSV!')
    return
  }
  
  uploadedFile.value = file
  const reader = new FileReader()
  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result)
    const workbook = XLSX.read(data, { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[firstSheetName]
    
    // Parse to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
    if (jsonData.length === 0) {
      alert('File Excel kosong atau tidak terbaca!')
      return
    }
    
    parsedRows.value = jsonData
    excelHeaders.value = Object.keys(jsonData[0])
    
    // Auto-detect columns
    autoDetectColumns(excelHeaders.value)
    activeStep.value = 'mapping'
  }
  reader.readAsArrayBuffer(file)
}

const autoDetectColumns = (headers) => {
  const detect = (keys, targetField) => {
    const matched = headers.find(h => 
      keys.some(k => h.toLowerCase().replace(/[^a-z0-9]/g, '').includes(k))
    )
    if (matched) columnMapping.value[targetField] = matched
  }
  
  detect(['customer po', 'cust po', 'po number', 'hpo'], 'hpo_number')
  detect(['mlfb', 'item code', 'part number', 'sku', 'material', 'kode'], 'item_code')
  detect(['status'], 'current_status')
  detect(['ex work', 'exwork', 'supp ready'], 'exwork_date_col')
  detect(['eta jakarta', 'eta jkt', 'eta port', 'eta'], 'eta_date_col')
  detect(['delivery date', 'deliv date', 'received date', 'tanggal kirim'], 'delivery_date_col')
  detect(['qty', 'quantity', 'jumlah', 'pcs'], 'quantity')
}

// Reset Uploader
const resetUpload = () => {
  uploadedFile.value = null
  parsedRows.value = []
  excelHeaders.value = []
  activeStep.value = 'upload'
}

// --- 3. AUTO-MATCHING & ALLOCATION LOGIC ---
const analyzeExcelData = async () => {
  if (!columnMapping.value.hpo_number || !columnMapping.value.item_code || !columnMapping.value.current_status) {
    alert('Kolom HPO, Kode Item, dan Status wajib di-mapping!')
    return
  }

  isLoading.value = true
  loadingMessage.value = 'Menganalisis data alokasi...'
  previewItems.value = []

  // Ensure DB references are loaded
  if (allSOs.value.length === 0) {
    await fetchDatabaseReferenceData()
  }

  try {
    const items = []
    
    parsedRows.value.forEach((row, rowIndex) => {
      const hpoRaw = String(row[columnMapping.value.hpo_number] || '').trim()
      const itemCodeRaw = String(row[columnMapping.value.item_code] || '').trim()
      const statusRaw = String(row[columnMapping.value.current_status] || '').trim()
      const qtyRaw = row[columnMapping.value.quantity] ? parseInt(row[columnMapping.value.quantity]) : null

      const exworkRaw = columnMapping.value.exwork_date_col ? String(row[columnMapping.value.exwork_date_col] || '').trim() : ''
      const etaRaw = columnMapping.value.eta_date_col ? String(row[columnMapping.value.eta_date_col] || '').trim() : ''
      const deliveryRaw = columnMapping.value.delivery_date_col ? String(row[columnMapping.value.delivery_date_col] || '').trim() : ''

      const exworkDateVal = exworkRaw ? formatDateForDB(exworkRaw) : null
      const etaDateVal = etaRaw ? formatDateForDB(etaRaw) : null
      const deliveryDateVal = deliveryRaw ? formatDateForDB(deliveryRaw) : null

      // Set statusDate: use deliveryDateVal if populated, else etaDateVal, else exworkDateVal, else today
      const statusDateVal = deliveryDateVal || etaDateVal || exworkDateVal || new Date().toISOString().split('T')[0]

      if (!hpoRaw || !itemCodeRaw || !statusRaw) return // Skip incomplete rows

      // 1. CARI HSO KANDIDAT YANG MEMBUTUHKAN ITEM INI
      // Cari di Accurate HSOs yang berisi itemCode ini dan belum terkirim penuh
      const candidateHSOs = allSOs.value.filter(so => {
        if (!so.detailItem) return false
        return so.detailItem.some(i => 
          i.item?.no === itemCodeRaw && 
          (i.quantity - (i.quantityShipped || 0) > 0)
        )
      })

      // 2. AUTO-RESOLVE: Cek apakah di database shipments sudah pernah di-mapping HPO + Item ini ke suatu SO
      let matchedHso = null
      let matchingReason = ''

      const existingShipByPo = dbShipments.value.find(s => 
        s.hpo_number?.toLowerCase() === hpoRaw.toLowerCase() && 
        s.item_code === itemCodeRaw
      )

      if (existingShipByPo) {
        const foundSo = allSOs.value.find(so => String(so.id) === existingShipByPo.so_id)
        if (foundSo) {
          matchedHso = foundSo
          matchingReason = 'Database Logistik (Sudah Pernah Di-mapping)'
        }
      }

      // 3. ACCURATE PO REF: Cek apakah ada mapping HSO langsung di keterangan PO Accurate
      if (!matchedHso) {
        const directPoMatch = dbPoItems.value.find(pi => 
          pi.itemCode === itemCodeRaw && 
          pi.poNumber?.toLowerCase() === hpoRaw.toLowerCase()
        )

        if (directPoMatch) {
          const foundSo = candidateHSOs.find(so => so.number === directPoMatch.hsoNumber)
          if (foundSo) {
            matchedHso = foundSo
            matchingReason = `Keterangan PO (Direct Match ${directPoMatch.hsoNumber})`
          }
        }
      }

      // Jika tidak ada direct match, biarkan matchedHso = null (Admin memetakan manual)
      if (!matchedHso) {
        matchingReason = 'PILIH HSO MANUAL'
      }

      // 4. DETEKSI SELISIH QUANTITY (Kurang/Lebih Kirim)
      let quantityAlert = null
      let statusWarning = false
      let qtyNeeded = 0
      let qtyHsoOrder = 0
      let qtyHsoShipped = 0

      if (matchedHso) {
        const matchedItem = matchedHso.detailItem.find(i => i.item?.no === itemCodeRaw)
        if (matchedItem) {
          qtyHsoOrder = matchedItem.quantity || 0
          qtyHsoShipped = matchedItem.quantityShipped || 0
          qtyNeeded = qtyHsoOrder - qtyHsoShipped
          
          if (qtyRaw !== null && qtyRaw > 0) {
            if (qtyRaw < qtyNeeded) {
              quantityAlert = `Kurang Kirim (-${qtyNeeded - qtyRaw} Pcs). Klien butuh ${qtyNeeded} Pcs.`
              statusWarning = true
            } else if (qtyRaw > qtyNeeded) {
              quantityAlert = `Kelebihan Kirim (+${qtyRaw - qtyNeeded} Pcs). Kelebihan untuk Stok.`
            }
          }
        }
      }

      // Ambil existing logistik ID jika barang sudah ada di shipments Supabase
      const existingShip = dbShipments.value.find(s => 
        s.so_id === String(matchedHso?.id) && 
        s.item_code === itemCodeRaw
      )

      // Cek apakah status dari principal valid (dikonversi ke format valid logistik)
      const mappedStatus = mapPrincipalStatusToLogistic(statusRaw)

      items.push({
        key: `${rowIndex}-${itemCodeRaw}`,
        hpo: hpoRaw,
        itemCode: itemCodeRaw,
        principalStatus: statusRaw,
        mappedStatus: mappedStatus,
        exworkDate: exworkDateVal,
        etaDate: etaDateVal,
        deliveryDate: deliveryDateVal,
        statusDate: statusDateVal,
        excelQty: qtyRaw,
        
        // Mapped HSO
        selectedHsoId: matchedHso ? String(matchedHso.id) : '',
        matchingReason: matchedHso ? matchingReason : 'Tidak Ada HSO Aktif yang Butuh',
        candidates: candidateHSOs, // Semua alternatif SO untuk dropdown
        
        // Quantities & Alerts
        qtyNeeded,
        qtyHsoOrder,
        qtyHsoShipped,
        quantityAlert,
        statusWarning,
        
        // Database logistics link
        existingShipmentId: existingShip?.id || null
      })
    })

    previewItems.value = items
    activeStep.value = 'preview'
  } catch (err) {
    console.error(err)
    alert(`Analisis gagal: ${err.message}`)
  } finally {
    isLoading.value = false
  }
}

// Map status teks bebas principal ke status logistik kita
const mapPrincipalStatusToLogistic = (status) => {
  const lower = status.toLowerCase()
  if (lower.includes('done delivery') || lower.includes('delivered') || lower.includes('complete') || lower.includes('selesai')) {
    return 'Completed'
  }
  if (lower.includes('exwork') || lower.includes('ready') || lower.includes('forwarder') || lower.includes('ex-work')) {
    return 'Follow up with our forwarder'
  }
  if (lower.includes('transit') || lower.includes('eta') || lower.includes('port') || lower.includes('jkt') || lower.includes('otw')) {
    return 'ETA Port JKT'
  }
  if (lower.includes('dunex') || lower.includes('siemens') || lower.includes('warehouse') || lower.includes('tiba gudang')) {
    return 'Already in siemens Warehouse'
  }
  if (lower.includes('hokiindo') || lower.includes('hoki') || lower.includes('gudang kita') || lower.includes('arrived')) {
    return 'Already in Hokiindo Raya'
  }
  if (lower.includes('hold') || lower.includes('tunda')) {
    return 'Hold by Customer'
  }
  if (lower.includes('cancel') || lower.includes('batal')) {
    return 'Cancel by Customer'
  }
  // Fallback default
  return 'Follow up with our forwarder'
}

// Format format Excel Date / Raw string to YYYY-MM-DD
const formatDateForDB = (dateStr) => {
  try {
    // If it's a numeric Excel date serial number
    if (/^\d+$/.test(dateStr)) {
      const excelEpoch = new Date(1899, 11, 30)
      const days = parseInt(dateStr)
      const parsedDate = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000)
      return parsedDate.toISOString().split('T')[0]
    }
    
    // Standard parse split by dash or slash
    const clean = dateStr.replace(/[^\d\/-]/g, '')
    const parts = clean.split(/[\/-]/)
    if (parts.length === 3) {
      // Check if YYYY-MM-DD or DD-MM-YYYY
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
      }
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
    }
  } catch (e) {}
  return new Date().toISOString().split('T')[0]
}

// Get HSO Number label by ID
const getHsoNumberLabel = (hsoId) => {
  const found = allSOs.value.find(so => String(so.id) === hsoId)
  return found ? `${found.number} (${found.customer?.name || 'UNKNOWN'})` : 'PILIH MANUAL'
}

// Handle change dropdown target HSO manual
const onHsoChange = (item, newHsoId) => {
  item.selectedHsoId = newHsoId
  
  if (!newHsoId) {
    item.qtyNeeded = 0
    item.quantityAlert = null
    item.existingShipmentId = null
    return
  }

  const foundSo = allSOs.value.find(so => String(so.id) === newHsoId)
  if (foundSo) {
    const matchedItem = foundSo.detailItem.find(i => i.item?.no === item.itemCode)
    if (matchedItem) {
      item.qtyHsoOrder = matchedItem.quantity || 0
      item.qtyHsoShipped = matchedItem.quantityShipped || 0
      item.qtyNeeded = item.qtyHsoOrder - item.qtyHsoShipped
      
      if (item.excelQty !== null && item.excelQty > 0) {
        if (item.excelQty < item.qtyNeeded) {
          item.quantityAlert = `Kurang Kirim (-${item.qtyNeeded - item.excelQty} Pcs). Klien butuh ${item.qtyNeeded} Pcs.`
          item.statusWarning = true
        } else if (item.excelQty > item.qtyNeeded) {
          item.quantityAlert = `Kelebihan Kirim (+${item.excelQty - item.qtyNeeded} Pcs). Kelebihan untuk Stok.`
          item.statusWarning = false
        } else {
          item.quantityAlert = null
          item.statusWarning = false
        }
      }
    }

    // Update existing logistik ID
    const existingShip = dbShipments.value.find(s => 
      s.so_id === newHsoId && 
      s.item_code === item.itemCode
    )
    item.existingShipmentId = existingShip?.id || null
    item.matchingReason = 'Manual Override'
  }
}

// --- 4. DATABASE SAVE SUBMISSION ---
const submitStatusUpdates = async () => {
  // Filter only items that have an HSO assigned
  const itemsToSubmit = previewItems.value.filter(i => i.selectedHsoId)
  if (itemsToSubmit.length === 0) {
    alert('Tidak ada baris ter-mapping yang bisa disimpan!')
    return
  }

  isSubmitting.value = true
  loadingProgress.value = 0
  loadingMessage.value = 'Menyimpan update logistik ke database...'
  
  let created = 0
  let updated = 0
  
  try {
    const totalItems = itemsToSubmit.length
    
    // Process items sequentially or in small chunks
    for (let i = 0; i < totalItems; i++) {
      const item = itemsToSubmit[i]
      
      const payload = {
        hpo_number: item.hpo,
        current_status: item.mappedStatus,
        status_date: item.statusDate,
        exwork_date: item.exworkDate || null,
        eta_date: item.etaDate || null,
        hokiindo_date: item.deliveryDate || null,
        updated_at: new Date().toISOString()
      }

      // Fallback: If status is ETA Port JKT and eta_date is empty, use statusDate
      if (item.mappedStatus === 'ETA Port JKT' && !payload.eta_date) {
        payload.eta_date = item.statusDate
      }
      // Fallback: If status is Follow up with our forwarder and exwork_date is empty, use statusDate
      if (item.mappedStatus === 'Follow up with our forwarder' && !payload.exwork_date) {
        payload.exwork_date = item.statusDate
      }
      // Fallback: If status is Already in Hokiindo Raya/Completed and hokiindo_date is empty, use statusDate
      if ((item.mappedStatus === 'Already in Hokiindo Raya' || item.mappedStatus === 'Completed') && !payload.hokiindo_date) {
        payload.hokiindo_date = item.statusDate
      }
      // Fallback: If status is Already in siemens Warehouse, set dunex_date
      if (item.mappedStatus === 'Already in siemens Warehouse') {
        payload.dunex_date = item.statusDate
      }

      if (item.existingShipmentId) {
        // 1. UPDATE EXISTING RECORD
        const { error } = await supabase
          .from('shipments')
          .update(payload)
          .eq('id', item.existingShipmentId)
          
        if (error) throw error
        updated++
      } else {
        // 2. INSERT NEW RECORD
        const { error } = await supabase
          .from('shipments')
          .insert({
            so_id: item.selectedHsoId,
            item_code: item.itemCode,
            shipment_type: 'IMPORT_PO',
            admin_notes: 'Imported from principal Excel',
            ...payload
          })
          
        if (error) throw error
        created++
      }
      
      loadingProgress.value = Math.round(((i + 1) / totalItems) * 100)
    }

    successStats.value = {
      totalProcessed: totalItems,
      updatedShipments: updated,
      createdShipments: created
    }
    
    activeStep.value = 'success'
  } catch (err) {
    console.error(err)
    alert(`Gagal menyimpan perubahan: ${err.message}`)
  } finally {
    isSubmitting.value = false
    loadingProgress.value = 0
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50/50 dark:bg-[#0f172a] pb-20 font-source-code text-slate-900 dark:text-slate-100 transition-colors duration-300">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
      
      <!-- HEADER -->
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all">
        <div>
          <h2 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <UploadCloud class="w-6 h-6 text-red-600"/> Import Update
          </h2>
          <p class="text-slate-500 dark:text-slate-400 text-sm mt-1">
             Unggah file Excel status dari principal untuk memperbarui status pengiriman secara otomatis
          </p>
        </div>
        <div class="flex items-center gap-3">
          <div class="text-sm font-semibold flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700/50 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600">
            <span class="text-slate-500">Batas Tanggal SO:</span>
            <select v-model="filterMonths" class="bg-transparent border-0 font-bold focus:ring-0 cursor-pointer text-red-600 dark:text-red-400">
              <option :value="1">1 Bulan terakhir</option>
              <option :value="3">3 Bulan terakhir</option>
              <option :value="6">6 Bulan terakhir</option>
              <option :value="12">1 Tahun terakhir</option>
            </select>
          </div>
        </div>
      </div>

      <!-- PROGRESS INDICATOR MODAL -->
      <div v-if="isLoading || isSubmitting" class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-300">
        <div class="bg-white dark:bg-slate-800 rounded-xl p-8 max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-2xl text-center space-y-6">
          <div class="flex justify-center">
            <Loader2 class="animate-spin w-12 h-12 text-red-600" />
          </div>
          <div class="space-y-2">
            <h3 class="font-bold text-lg text-slate-900 dark:text-white">{{ isSubmitting ? 'Menyimpan Data...' : 'Memproses Data...' }}</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">{{ loadingMessage }}</p>
          </div>
          <div class="space-y-1">
            <div class="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden border border-slate-200 dark:border-slate-600">
              <div class="bg-red-600 h-full rounded-full transition-all duration-300 ease-out" :style="`width: ${loadingProgress}%`"></div>
            </div>
            <div class="text-right text-xs font-bold text-slate-500">{{ loadingProgress }}%</div>
          </div>
        </div>
      </div>

      <!-- STEP 1: UPLOAD -->
      <div v-if="activeStep === 'upload'" class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-8 text-center space-y-6 transition-all">
        <div 
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
          @click="triggerFileInput"
          class="border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 gap-4"
          :class="isDragging ? 'border-red-500 bg-red-50/20 dark:bg-red-950/10' : 'border-slate-300 dark:border-slate-600 hover:border-red-400 hover:bg-slate-50 dark:hover:bg-slate-700/20'"
        >
          <input 
            type="file" 
            ref="fileInput" 
            @change="onFileChange" 
            accept=".xlsx, .xls, .csv" 
            class="hidden" 
          />
          <div class="p-4 bg-red-50 dark:bg-red-900/20 rounded-full text-red-600 dark:text-red-400 transition-colors">
            <FileSpreadsheet class="w-12 h-12" />
          </div>
          <div class="space-y-1.5">
            <h3 class="font-bold text-lg text-slate-900 dark:text-white">Pilih atau seret file Excel di sini</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">Mendukung format file .xlsx, .xls, atau .csv</p>
          </div>
          <Button variant="outline" class="mt-2 border-slate-300 dark:border-slate-600">Pilih File</Button>
        </div>
      </div>

      <!-- STEP 2: COLUMN MAPPING -->
      <div v-else-if="activeStep === 'mapping'" class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-6 transition-all animate-in zoom-in-95 duration-200">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
          <div class="flex items-center gap-2">
            <FileSpreadsheet class="w-5 h-5 text-red-600"/>
            <h3 class="font-bold text-lg text-slate-900 dark:text-white">Mapping Kolom Excel</h3>
          </div>
          <span class="text-xs text-slate-500 font-bold bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded">File: {{ uploadedFile?.name }}</span>
        </div>

        <p class="text-sm text-slate-500 dark:text-slate-400">
          Sistem mendeteksi kolom Excel kamu secara otomatis. Jika ada kolom yang tidak sesuai, silakan ubah pemetaan kolom di bawah ini:
        </p>

        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <!-- HPO COLUMN -->
          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Kolom Nomor HPO (Wajib)</label>
            <select v-model="columnMapping.hpo_number" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold focus:ring-red-600">
              <option value="" disabled>-- Pilih Kolom HPO --</option>
              <option v-for="h in excelHeaders" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>

          <!-- ITEM CODE COLUMN -->
          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Kolom Kode Produk/Barang (Wajib)</label>
            <select v-model="columnMapping.item_code" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold focus:ring-red-600">
              <option value="" disabled>-- Pilih Kolom Kode Item --</option>
              <option v-for="h in excelHeaders" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>

          <!-- STATUS COLUMN -->
          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Kolom Status Pengiriman (Wajib)</label>
            <select v-model="columnMapping.current_status" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold focus:ring-red-600">
              <option value="" disabled>-- Pilih Kolom Status --</option>
              <option v-for="h in excelHeaders" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>

          <!-- EX WORK DATE COLUMN -->
          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Kolom Ex work date (Opsional)</label>
            <select v-model="columnMapping.exwork_date_col" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold focus:ring-red-600">
              <option value="">-- Abaikan --</option>
              <option v-for="h in excelHeaders" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>

          <!-- ETA JAKARTA COLUMN -->
          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Kolom ETA Jakarta (Opsional)</label>
            <select v-model="columnMapping.eta_date_col" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold focus:ring-red-600">
              <option value="">-- Abaikan --</option>
              <option v-for="h in excelHeaders" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>

          <!-- DELIVERY DATE COLUMN -->
          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Kolom Delivery date (Opsional)</label>
            <select v-model="columnMapping.delivery_date_col" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold focus:ring-red-600">
              <option value="">-- Abaikan --</option>
              <option v-for="h in excelHeaders" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>

          <!-- QUANTITY COLUMN -->
          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Kolom Kuantitas/Quantity (Opsional)</label>
            <select v-model="columnMapping.quantity" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold focus:ring-red-600">
              <option value="">-- Abaikan Pengecekan Selisih --</option>
              <option v-for="h in excelHeaders" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
        </div>

        <div class="flex justify-end gap-4 border-t border-slate-100 dark:border-slate-700 pt-6">
          <Button @click="resetUpload" variant="outline">Kembali</Button>
          <Button @click="analyzeExcelData" variant="default" class="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2">
             Mulai Analisis <ArrowRight class="w-4 h-4" />
          </Button>
        </div>
      </div>

      <!-- STEP 3: PREVIEW & RECONCILIATION -->
      <div v-else-if="activeStep === 'preview'" class="space-y-6 animate-in fade-in duration-300">
        
        <!-- Preview Actions Banner -->
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="text-sm font-semibold text-slate-600 dark:text-slate-400">
             Menemukan <span class="text-slate-900 dark:text-white font-bold">{{ previewItems.length }}</span> baris update status pengiriman
          </div>
          <div class="flex gap-3">
            <Button @click="resetUpload" variant="outline" class="border-slate-300 dark:border-slate-600">Ganti Excel</Button>
            <Button @click="submitStatusUpdates" variant="default" class="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2">
               <Save class="w-4 h-4" /> Simpan Update Logistik
            </Button>
          </div>
        </div>

        <!-- Preview Table -->
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full border-collapse text-left text-sm">
              <thead class="bg-slate-900 dark:bg-black text-white font-bold">
                <tr>
                  <th class="py-3.5 px-4">HPO / Item</th>
                  <th class="py-3.5 px-4 text-center">Status Asli</th>
                  <th class="py-3.5 px-4 text-center">Status Logistik</th>
                  <th class="py-3.5 px-4 text-center w-[60px]">Qty</th>
                  <th class="py-3.5 px-4">Terhubung HSO (Auto-Match / FIFO)</th>
                  <th class="py-3.5 px-4 text-right">Tanggal</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                <tr 
                  v-for="item in previewItems" 
                  :key="item.key"
                  class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                  :class="{'bg-red-50/30 dark:bg-red-950/5': !item.selectedHsoId}"
                >
                  
                  <!-- HPO & Item -->
                  <td class="py-4 px-4 font-semibold text-slate-800 dark:text-slate-200">
                    <div class="font-mono text-xs text-slate-400 uppercase">HPO: {{ item.hpo }}</div>
                    <div class="font-bold mt-1 text-slate-900 dark:text-white">{{ item.itemCode }}</div>
                  </td>
                  
                  <!-- Original status -->
                  <td class="py-4 px-4 text-center text-slate-500 text-xs">
                    {{ item.principalStatus }}
                  </td>
                  
                  <!-- Mapped status badge -->
                  <td class="py-4 px-4 text-center">
                    <Badge 
                      class="text-[10px] font-bold px-2 py-0.5"
                      :class="{
                        'bg-orange-100 text-orange-700 border-orange-300': item.mappedStatus === 'Follow up with our forwarder',
                        'bg-blue-100 text-blue-700 border-blue-300': item.mappedStatus === 'ETA Port JKT',
                        'bg-cyan-100 text-cyan-700 border-cyan-300': item.mappedStatus === 'Already in siemens Warehouse',
                        'bg-indigo-100 text-indigo-700 border-indigo-300': item.mappedStatus === 'Already in Hokiindo Raya',
                        'bg-purple-100 text-purple-700 border-purple-300': item.mappedStatus === 'Hold by Customer',
                        'bg-red-100 text-red-700 border-red-300': item.mappedStatus === 'Cancel by Customer'
                      }"
                    >
                      {{ item.mappedStatus === 'Follow up with our forwarder' ? 'EX-WORKS' :
                         item.mappedStatus === 'ETA Port JKT' ? 'TRANSIT' :
                         item.mappedStatus === 'Already in siemens Warehouse' ? 'WH DUNEX' :
                         item.mappedStatus === 'Already in Hokiindo Raya' ? 'WH HOKI' :
                         item.mappedStatus === 'Hold by Customer' ? 'HOLD' :
                         item.mappedStatus === 'Cancel by Customer' ? 'CANCEL' :
                         item.mappedStatus }}
                    </Badge>
                  </td>
                  
                  <!-- Quantity -->
                  <td class="py-4 px-4 text-center font-bold font-mono">
                    {{ item.excelQty !== null ? item.excelQty : '-' }}
                  </td>
                  
                  <!-- Mapped HSO Selection & Alerts -->
                  <td class="py-4 px-4 space-y-2">
                    <div class="flex items-center gap-2">
                      <!-- Dropdown Override HSO -->
                      <select 
                        :value="item.selectedHsoId"
                        @change="onHsoChange(item, $event.target.value)"
                        class="text-xs font-bold rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 focus:ring-red-600 w-full max-w-sm"
                      >
                        <option value="">-- TIDAK TERHUBUNG (ABAIKAN BARIS) --</option>
                        <option v-for="cand in item.candidates" :key="cand.id" :value="String(cand.id)">
                          {{ cand.number }} ({{ cand.customer?.name || 'UNKNOWN' }})
                        </option>
                        <!-- Add fallback option if currently selected is not in candidates (override case) -->
                        <option v-if="item.selectedHsoId && !item.candidates.some(c => String(c.id) === item.selectedHsoId)" :value="item.selectedHsoId">
                          {{ getHsoNumberLabel(item.selectedHsoId) }}
                        </option>
                      </select>
                      
                      <!-- Open Detail HSO -->
                      <Button 
                        v-if="item.selectedHsoId"
                        variant="ghost" 
                        size="icon" 
                        class="h-7 w-7 text-slate-400 hover:text-blue-600" 
                        @click="router.push(`/sales-orders/${getHsoNumberLabel(item.selectedHsoId).split(' ')[0].replace(/\//g, '-')}`)"
                      >
                        <ExternalLink class="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    
                    <!-- Mapping Reason -->
                    <div class="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                      <span class="inline-block w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                      Metode: {{ item.matchingReason }}
                    </div>
                    
                    <!-- Shortage / Surplus Quantity Alerts -->
                    <div 
                      v-if="item.quantityAlert" 
                      class="text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1.5 border"
                      :class="item.statusWarning ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800' : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800'"
                    >
                      <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                      {{ item.quantityAlert }}
                    </div>
                  </td>
                  
                  <!-- Date -->
                  <td class="py-4 px-4 text-right text-xs font-mono font-bold text-slate-600 dark:text-slate-400">
                    {{ item.statusDate }}
                  </td>
                  
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- STEP 4: SUCCESS STATS -->
      <div v-else-if="activeStep === 'success'" class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-8 text-center space-y-6 transition-all animate-in zoom-in-95 duration-200">
        <div class="inline-flex p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-full text-emerald-600 dark:text-emerald-400 mb-2">
          <CheckCircle2 class="w-12 h-12" />
        </div>
        <div class="space-y-2">
          <h3 class="font-bold text-2xl text-slate-900 dark:text-white">Sinkronisasi Status Selesai!</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400">Data status pengiriman Excel principal berhasil dimasukkan ke sistem.</p>
        </div>
        
        <!-- Summary Stats Card -->
        <div class="max-w-md mx-auto bg-slate-50 dark:bg-slate-900/30 rounded-lg p-5 border border-slate-200 dark:border-slate-700 divide-y divide-slate-200/50 dark:divide-slate-700">
          <div class="flex justify-between py-2 text-sm font-medium">
            <span class="text-slate-500">Total Baris Diproses:</span>
            <span class="font-bold text-slate-900 dark:text-white">{{ successStats.totalProcessed }} Baris</span>
          </div>
          <div class="flex justify-between py-2 text-sm font-medium">
            <span class="text-slate-500">Update Shipment Logistik:</span>
            <span class="font-bold text-blue-600 dark:text-blue-400">+{{ successStats.updatedShipments }} Item</span>
          </div>
          <div class="flex justify-between py-2 text-sm font-medium">
            <span class="text-slate-500">Buat Baru Shipment:</span>
            <span class="font-bold text-green-600 dark:text-green-400">+{{ successStats.createdShipments }} Item</span>
          </div>
        </div>

        <div class="flex justify-center gap-4 pt-4">
          <Button @click="router.push('/sales-orders')" variant="outline">Lihat Daftar SO</Button>
          <Button @click="resetUpload" class="bg-red-600 hover:bg-red-700 text-white">Import File Lain</Button>
        </div>
      </div>

    </div>
  </div>
</template>
