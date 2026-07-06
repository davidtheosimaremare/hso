<script setup>
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Play,
  ChevronRight,
  Info,
  Search,
  Check
} from 'lucide-vue-next'

// --- STATE ---
const fileInput = ref(null)
const selectedFile = ref(null)
const isParsing = ref(false)
const excelHeaders = ref([])
const parsedRows = ref([])
const columnMappings = ref({
  hpoNumber: '',
  itemCode: '',
  exworkDate: '',
  etaDate: '',
  deliveryDate: '',
  status: ''
})

// Database matching state
const isCheckingDb = ref(false)
const dbMatches = ref([]) // Matched shipment records from database
const showPreview = ref(false)

// Executing update state
const isUpdating = ref(false)
const updateProgress = ref(0)
const updateResult = ref(null)

// UI Filter
const searchQuery = ref('')
const matchFilter = ref('ALL') // ALL, MATCHED, NOT_FOUND

// --- DATE HELPER ---
const parseExcelDate = (val) => {
  if (val === undefined || val === null || val === '') return null
  
  if (typeof val === 'number') {
    // Excel Date Serial
    const date = new Date(Math.round((val - 25569) * 86400 * 1000))
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
  
  const str = String(val).trim()
  if (!str) return null

  // DD/MM/YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  
  // YYYY-MM-DD
  const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
  }
  
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear()
    const mm = String(parsed.getMonth() + 1).padStart(2, '0')
    const dd = String(parsed.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
  
  return str // Return original string if couldn't parse
}

// --- STATUS MAPPING HELPER ---
const mapStatus = (excelStatus) => {
  if (!excelStatus) return ''
  const s = String(excelStatus).trim().toLowerCase()
  if (s.includes('done delivery') || s.includes('delivered') || s.includes('customer') || s.includes('hokiindo')) {
    return 'Already in Hokiindo Raya'
  }
  if (s.includes('siemens') || s.includes('dunex') || s.includes('warehouse') || s.includes('tiba gudang dunex')) {
    return 'Already in siemens Warehouse'
  }
  if (s.includes('transit') || s.includes('eta') || s.includes('port') || s.includes('jkt') || s.includes('jkt port')) {
    return 'ETA Port JKT'
  }
  if (s.includes('forwarder') || s.includes('ex-works') || s.includes('exwork') || s.includes('ready')) {
    return 'Follow up with our forwarder'
  }
  
  // Fallback exact match case-insensitive
  const exact = ['follow up with our forwarder', 'eta port jkt', 'already in siemens warehouse', 'already in hokiindo raya']
  const matched = exact.find(e => e.toLowerCase() === s)
  if (matched) return matched

  return excelStatus // keep original
}

// --- EVENT HANDLERS ---
const triggerFileInput = () => {
  fileInput.value.click()
}

const handleFileChange = (e) => {
  const file = e.target.files[0]
  if (file) {
    processFile(file)
  }
}

const handleDrop = (e) => {
  const file = e.dataTransfer.files[0]
  if (file) {
    processFile(file)
  }
}

const processFile = (file) => {
  // Reset states
  selectedFile.value = file
  parsedRows.value = []
  excelHeaders.value = []
  showPreview.value = false
  updateResult.value = null
  updateProgress.value = 0
  
  isParsing.value = true
  
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
      
      if (rows.length > 0) {
        excelHeaders.value = Object.keys(rows[0])
        parsedRows.value = rows
        autoDetectColumns()
      } else {
        alert("Excel file does not contain any data row.")
      }
    } catch (err) {
      console.error(err)
      alert("Failed to parse Excel file. Please ensure it is a valid format.")
    } finally {
      isParsing.value = false
    }
  }
  reader.readAsArrayBuffer(file)
}

// Auto detect headers
const autoDetectColumns = () => {
  excelHeaders.value.forEach(header => {
    const h = header.toLowerCase().replace(/[\s\_\-]/g, '')
    
    if (h.includes('po') || h.includes('hpo') || h.includes('customerpo') || h.includes('nopembelian')) {
      columnMappings.value.hpoNumber = header
    } else if (h.includes('mlfb') || h.includes('item') || h.includes('code') || h.includes('sku') || h.includes('nomorproduct')) {
      columnMappings.value.itemCode = header
    } else if (h.includes('exwork') || h.includes('exworkdate') || h.includes('tanggalexwork')) {
      columnMappings.value.exworkDate = header
    } else if (h.includes('eta') || h.includes('etajakarta') || h.includes('transit')) {
      columnMappings.value.etaDate = header
    } else if (h.includes('deliverydate') || h.includes('tanggaldo') || h.includes('tanggalpengiriman')) {
      columnMappings.value.deliveryDate = header
    } else if (h.includes('status')) {
      columnMappings.value.status = header
    }
  })
}

// Fetch matches from Supabase
const checkDatabaseMatches = async () => {
  if (!columnMappings.value.hpoNumber || !columnMappings.value.itemCode) {
    alert("HPO Number and Item SKU columns must be mapped to match database records.")
    return
  }
  
  isCheckingDb.value = true
  
  try {
    // 1. Gather all unique HPO numbers from Excel
    const uniqueHpos = [...new Set(parsedRows.value.map(row => {
      const val = row[columnMappings.value.hpoNumber]
      return val ? String(val).trim() : null
    }).filter(Boolean))]
    
    if (uniqueHpos.length === 0) {
      alert("No valid HPO numbers found in the mapped Excel column.")
      isCheckingDb.value = false
      return
    }
    
    // 2. Fetch all shipments matching these HPO numbers (using chunks of 50 to avoid URL length issues)
    const allShipments = []
    const chunkSize = 50
    for (let i = 0; i < uniqueHpos.length; i += chunkSize) {
      const chunk = uniqueHpos.slice(i, i + chunkSize)
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .in('hpo_number', chunk)
      
      if (error) throw error
      if (data) allShipments.push(...data)
    }
    
    dbMatches.value = allShipments
    showPreview.value = true
  } catch (err) {
    console.error(err)
    alert("Error matching database records: " + err.message)
  } finally {
    isCheckingDb.value = false
  }
}

// Compute mapped data for preview table
const previewData = computed(() => {
  if (parsedRows.value.length === 0) return []
  
  return parsedRows.value.map((row, idx) => {
    const hpoVal = row[columnMappings.value.hpoNumber]
    const hpoNumber = hpoVal ? String(hpoVal).trim() : ''
    
    const itemVal = row[columnMappings.value.itemCode]
    const itemCode = itemVal ? String(itemVal).trim() : ''
    
    const rawExwork = columnMappings.value.exworkDate ? row[columnMappings.value.exworkDate] : ''
    const rawEta = columnMappings.value.etaDate ? row[columnMappings.value.etaDate] : ''
    const rawDelivery = columnMappings.value.deliveryDate ? row[columnMappings.value.deliveryDate] : ''
    const rawStatus = columnMappings.value.status ? row[columnMappings.value.status] : ''
    
    const excelExwork = parseExcelDate(rawExwork)
    const excelEta = parseExcelDate(rawEta)
    const excelDelivery = parseExcelDate(rawDelivery)
    const excelStatus = mapStatus(rawStatus)
    
    // Find match in DB shipments
    // We match by hpo_number (case insensitive) and item_code (case insensitive)
    const matchedShipments = dbMatches.value.filter(s => 
      s.hpo_number && s.item_code &&
      s.hpo_number.toLowerCase() === hpoNumber.toLowerCase() &&
      s.item_code.toLowerCase() === itemCode.toLowerCase()
    )
    
    const hasMatch = matchedShipments.length > 0
    const dbShipment = hasMatch ? matchedShipments[0] : null
    
    return {
      index: idx + 1,
      hpoNumber,
      itemCode,
      // Excel values
      excelExwork,
      excelEta,
      excelDelivery,
      excelStatus,
      // DB values (if match)
      hasMatch,
      dbId: dbShipment?.id || null,
      dbStatus: dbShipment?.current_status || '',
      dbExwork: dbShipment?.exwork_date || '',
      dbEta: dbShipment?.eta_date || '',
      dbDelivery: dbShipment?.dunex_date || '',
      // All matched records to update
      matchedShipments
    }
  })
})

// Filtered Preview
const filteredPreview = computed(() => {
  let list = previewData.value
  
  if (matchFilter.value === 'MATCHED') {
    list = list.filter(item => item.hasMatch)
  } else if (matchFilter.value === 'NOT_FOUND') {
    list = list.filter(item => !item.hasMatch)
  }
  
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(item => 
      item.hpoNumber.toLowerCase().includes(q) || 
      item.itemCode.toLowerCase().includes(q) ||
      (item.excelStatus && item.excelStatus.toLowerCase().includes(q))
    )
  }
  
  return list
})

// Execute Updates
const runBulkUpdate = async () => {
  const toUpdate = previewData.value.filter(item => item.hasMatch)
  
  if (toUpdate.length === 0) {
    alert("No matching records to update.")
    return
  }
  
  if (!confirm(`Are you sure you want to update ${toUpdate.length} matching rows in database?`)) {
    return
  }
  
  isUpdating.value = true
  updateProgress.value = 0
  
  let successCount = 0
  let errorCount = 0
  
  // We process in batch chunks to avoid hitting Supabase connection pool limits and allow UI progress to render smoothly
  const total = toUpdate.length
  
  for (let i = 0; i < total; i++) {
    const item = toUpdate[i]
    
    try {
      // Find all IDs to update (in case multiple shipments match HPO + SKU)
      const ids = item.matchedShipments.map(s => s.id)
      
      if (ids.length > 0) {
        // Construct the update payload
        const updateData = {}
        if (item.excelStatus !== undefined && item.excelStatus !== null && item.excelStatus !== '') {
          updateData.current_status = item.excelStatus
          updateData.status_date = new Date().toISOString().split('T')[0]
        }
        if (item.excelExwork !== undefined && item.excelExwork !== null) {
          updateData.exwork_date = item.excelExwork
        }
        if (item.excelEta !== undefined && item.excelEta !== null) {
          updateData.eta_date = item.excelEta
        }
        if (item.excelDelivery !== undefined && item.excelDelivery !== null) {
          updateData.dunex_date = item.excelDelivery
        }
        
        updateData.updated_at = new Date().toISOString()
        
        // Execute Supabase update
        const { error } = await supabase
          .from('shipments')
          .update(updateData)
          .in('id', ids)
          
        if (error) throw error
        successCount += ids.length
      }
    } catch (err) {
      console.error(`Failed to update HPO: ${item.hpoNumber}, SKU: ${item.itemCode}`, err)
      errorCount++
    }
    
    updateProgress.value = Math.round(((i + 1) / total) * 100)
  }
  
  updateResult.value = {
    totalRows: total,
    successCount,
    errorCount
  }
  isUpdating.value = false
  
  // Refetch matching data to show updated DB values
  await checkDatabaseMatches()
}
</script>

<template>
  <div class="space-y-6 pb-20 font-source-code text-slate-900 dark:text-slate-100">
    
    <!-- Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
          <UploadCloud class="w-6 h-6 text-red-600 dark:text-red-400"/> Bulk Importer Tracking Status
        </h2>
        <p class="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Upload file Excel (HPO status list) untuk mencocokkan & memperbarui status pengiriman secara massal.
        </p>
      </div>
    </div>

    <!-- Upload Zone -->
    <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm">
      <CardContent class="p-6">
        <div 
          @dragover.prevent 
          @drop.prevent="handleDrop"
          class="border-2 border-dashed border-gray-300 dark:border-slate-700 hover:border-red-500 dark:hover:border-red-400 rounded-xl p-8 text-center transition-all cursor-pointer bg-slate-50/50 dark:bg-slate-900/10"
          @click="triggerFileInput"
        >
          <input 
            type="file" 
            ref="fileInput" 
            class="hidden" 
            accept=".xlsx, .xls" 
            @change="handleFileChange"
          />
          
          <div class="flex flex-col items-center justify-center gap-3">
            <div class="p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-full">
              <FileSpreadsheet class="w-10 h-10"/>
            </div>
            
            <div class="space-y-1">
              <p class="text-base font-bold text-slate-900 dark:text-white">
                {{ selectedFile ? selectedFile.name : 'Pilih atau Seret File Excel ke Sini' }}
              </p>
              <p class="text-xs text-slate-400">
                Mendukung format .xlsx atau .xls (Ukuran maks: 10MB)
              </p>
            </div>
            
            <Button variant="outline" size="sm" class="mt-2 text-xs">
              Pilih File
            </Button>
          </div>
        </div>

        <!-- Mappings Form (If file loaded) -->
        <div v-if="parsedRows.length > 0" class="mt-6 border-t border-slate-100 dark:border-slate-700/50 pt-6 space-y-4">
          <h3 class="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Info class="w-4 h-4 text-blue-500"/> Pemetaan Kolom Excel
          </h3>
          
          <p class="text-xs text-slate-400">
            Peta kan kolom dari Excel Anda dengan field database di bawah ini. Sistem secara otomatis mendeteksi kolom jika nama header mirip.
          </p>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <!-- HPO Match -->
            <div class="space-y-1.5">
              <label class="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                HPO Number (Wajib) <Badge variant="outline" class="text-[9px] bg-red-50 text-red-700 border-red-200">Kunci</Badge>
              </label>
              <select v-model="columnMappings.hpoNumber" class="w-full text-xs px-3 py-2 border rounded bg-white dark:bg-slate-900 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none">
                <option value="">-- Pilih Kolom --</option>
                <option v-for="h in excelHeaders" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>

            <!-- SKU Match -->
            <div class="space-y-1.5">
              <label class="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                Product SKU (Wajib) <Badge variant="outline" class="text-[9px] bg-red-50 text-red-700 border-red-200">Kunci</Badge>
              </label>
              <select v-model="columnMappings.itemCode" class="w-full text-xs px-3 py-2 border rounded bg-white dark:bg-slate-900 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none">
                <option value="">-- Pilih Kolom --</option>
                <option v-for="h in excelHeaders" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>

            <!-- Status -->
            <div class="space-y-1.5">
              <label class="text-xs font-bold text-slate-600 dark:text-slate-400">Status</label>
              <select v-model="columnMappings.status" class="w-full text-xs px-3 py-2 border rounded bg-white dark:bg-slate-900 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none">
                <option value="">-- Pilih Kolom (Opsional) --</option>
                <option v-for="h in excelHeaders" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>

            <!-- Exwork Date -->
            <div class="space-y-1.5">
              <label class="text-xs font-bold text-slate-600 dark:text-slate-400">Ex-Works Date</label>
              <select v-model="columnMappings.exworkDate" class="w-full text-xs px-3 py-2 border rounded bg-white dark:bg-slate-900 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none">
                <option value="">-- Pilih Kolom (Opsional) --</option>
                <option v-for="h in excelHeaders" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>

            <!-- ETA Date -->
            <div class="space-y-1.5">
              <label class="text-xs font-bold text-slate-600 dark:text-slate-400">ETA JKT Date</label>
              <select v-model="columnMappings.etaDate" class="w-full text-xs px-3 py-2 border rounded bg-white dark:bg-slate-900 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none">
                <option value="">-- Pilih Kolom (Opsional) --</option>
                <option v-for="h in excelHeaders" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>

            <!-- Delivery Date -->
            <div class="space-y-1.5">
              <label class="text-xs font-bold text-slate-600 dark:text-slate-400">Delivery Date (Siemens/Dunex)</label>
              <select v-model="columnMappings.deliveryDate" class="w-full text-xs px-3 py-2 border rounded bg-white dark:bg-slate-900 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none">
                <option value="">-- Pilih Kolom (Opsional) --</option>
                <option v-for="h in excelHeaders" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>

          <div class="flex justify-end pt-2">
            <Button 
              @click="checkDatabaseMatches" 
              :disabled="isCheckingDb || !columnMappings.hpoNumber || !columnMappings.itemCode"
              class="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              <RefreshCw v-if="isCheckingDb" class="w-4 h-4 animate-spin"/>
              {{ isCheckingDb ? 'Mencocokkan...' : 'Cocokkan dengan Database' }}
              <ChevronRight v-if="!isCheckingDb" class="w-4 h-4"/>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Execution Stats / Success Toast -->
    <Card v-if="updateResult" class="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 shadow-sm animate-in fade-in zoom-in-95">
      <CardContent class="p-5 flex items-start gap-3 text-emerald-800 dark:text-emerald-400">
        <CheckCircle2 class="w-5 h-5 shrink-0 mt-0.5"/>
        <div class="space-y-1 flex-1">
          <p class="font-bold text-sm">Pembaruan Massal Selesai!</p>
          <p class="text-xs">
            Berhasil memperbarui <strong>{{ updateResult.successCount }}</strong> baris pengiriman di database Supabase. 
            (Dari total {{ updateResult.totalRows }} data HPO/SKU yang cocok).
          </p>
          <p v-if="updateResult.errorCount > 0" class="text-xs text-red-600 dark:text-red-400 font-bold mt-1">
            Ada {{ updateResult.errorCount }} error saat pemrosesan (lihat konsol log jika ada).
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- Progress Indicator -->
    <Card v-if="isUpdating" class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm">
      <CardContent class="p-6 space-y-3">
        <div class="flex justify-between items-center text-sm">
          <span class="font-bold text-slate-700 dark:text-slate-300">Sedang Memproses Update Database...</span>
          <span class="font-extrabold text-red-600">{{ updateProgress }}%</span>
        </div>
        <div class="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
          <div class="bg-red-600 h-3 rounded-full transition-all duration-200" :style="{ width: updateProgress + '%' }"></div>
        </div>
      </CardContent>
    </Card>

    <!-- Preview Results Section -->
    <Card v-if="showPreview" class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm flex flex-col max-h-[80vh]">
      <CardHeader class="border-b border-slate-100 dark:border-slate-700/50 p-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle class="text-lg font-bold text-slate-900 dark:text-white">Pratinjau Data Cocok (Match Preview)</CardTitle>
            <p class="text-xs text-slate-400 mt-1">
              Ditemukan <strong>{{ previewData.filter(i => i.hasMatch).length }}</strong> baris cocok dari total <strong>{{ previewData.length }}</strong> baris Excel.
            </p>
          </div>
          
          <div class="flex flex-wrap items-center gap-2">
            <!-- Filter Match status -->
            <div class="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1 text-xs shrink-0 border border-slate-200 dark:border-slate-800">
              <button 
                v-for="f in [{v:'ALL', l:'Semua'}, {v:'MATCHED', l:'Cocok'}, {v:'NOT_FOUND', l:'Tidak Ditemukan'}]" 
                :key="f.v"
                @click="matchFilter = f.v"
                class="px-3 py-1.5 rounded-md font-bold transition-all"
                :class="matchFilter === f.v ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'"
              >
                {{ f.l }}
              </button>
            </div>

            <!-- Search inside preview -->
            <div class="relative w-full md:w-48">
              <Search class="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input 
                v-model="searchQuery" 
                type="text" 
                placeholder="Cari HPO / SKU..." 
                class="pl-8 pr-3 py-1.5 w-full text-xs border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 focus:outline-none" 
              />
            </div>
            
            <!-- Action Execution -->
            <Button 
              @click="runBulkUpdate" 
              :disabled="isUpdating || previewData.filter(i => i.hasMatch).length === 0"
              class="bg-red-600 hover:bg-red-700 text-white font-bold transition-all flex items-center gap-1.5"
            >
              <Play class="w-4 h-4"/>
              Terapkan Update Massal
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent class="p-0 overflow-y-auto flex-1">
        <Table>
          <TableHeader class="bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 shadow-sm">
            <TableRow>
              <TableHead class="w-14 text-center font-bold text-slate-500">Baris</TableHead>
              <TableHead class="font-bold text-slate-500">HPO Number</TableHead>
              <TableHead class="font-bold text-slate-500">Item SKU</TableHead>
              <TableHead class="font-bold text-slate-500">Pencocokan DB</TableHead>
              <TableHead class="font-bold text-slate-500">Status Update (Old → New)</TableHead>
              <TableHead class="font-bold text-slate-500">Ex-Works Date (Old → New)</TableHead>
              <TableHead class="font-bold text-slate-500">ETA Jakarta (Old → New)</TableHead>
              <TableHead class="font-bold text-slate-500">Delivery Date (Old → New)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow 
              v-for="row in filteredPreview" 
              :key="row.index"
              class="border-b border-slate-100 dark:border-slate-700/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
            >
              <!-- Row Index -->
              <TableCell class="text-center font-medium text-slate-500 text-xs">{{ row.index }}</TableCell>
              
              <!-- HPO Number -->
              <TableCell class="font-bold text-sm">{{ row.hpoNumber }}</TableCell>
              
              <!-- Item Code -->
              <TableCell class="font-medium text-xs">{{ row.itemCode }}</TableCell>
              
              <!-- DB Match Status -->
              <TableCell>
                <Badge 
                  v-if="row.hasMatch" 
                  variant="outline" 
                  class="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50 flex items-center gap-1 w-fit"
                >
                  <Check class="w-3 h-3"/> Ditemukan ({{ row.matchedShipments.length }})
                </Badge>
                <Badge 
                  v-else 
                  variant="outline" 
                  class="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/50 flex items-center gap-1 w-fit"
                >
                  <AlertCircle class="w-3 h-3"/> Lewati
                </Badge>
              </TableCell>
              
              <!-- Status Diff -->
              <TableCell class="text-xs">
                <div v-if="row.hasMatch" class="flex flex-col">
                  <span class="text-slate-400 line-through">{{ row.dbStatus || '-' }}</span>
                  <span class="font-bold text-slate-900 dark:text-white" :class="row.dbStatus !== row.excelStatus && 'text-blue-600 dark:text-blue-400'">
                    {{ row.excelStatus || '-' }}
                  </span>
                </div>
                <div v-else class="text-slate-400">-</div>
              </TableCell>
              
              <!-- Exwork Diff -->
              <TableCell class="text-xs">
                <div v-if="row.hasMatch" class="flex flex-col">
                  <span class="text-slate-400 line-through">{{ row.dbExwork || '-' }}</span>
                  <span class="font-bold text-slate-900 dark:text-white" :class="row.dbExwork !== row.excelExwork && 'text-emerald-600 dark:text-emerald-400'">
                    {{ row.excelExwork || '-' }}
                  </span>
                </div>
                <div v-else class="text-slate-400">-</div>
              </TableCell>
              
              <!-- ETA Diff -->
              <TableCell class="text-xs">
                <div v-if="row.hasMatch" class="flex flex-col">
                  <span class="text-slate-400 line-through">{{ row.dbEta || '-' }}</span>
                  <span class="font-bold text-slate-900 dark:text-white" :class="row.dbEta !== row.excelEta && 'text-emerald-600 dark:text-emerald-400'">
                    {{ row.excelEta || '-' }}
                  </span>
                </div>
                <div v-else class="text-slate-400">-</div>
              </TableCell>
              
              <!-- Delivery Diff -->
              <TableCell class="text-xs">
                <div v-if="row.hasMatch" class="flex flex-col">
                  <span class="text-slate-400 line-through">{{ row.dbDelivery || '-' }}</span>
                  <span class="font-bold text-slate-900 dark:text-white" :class="row.dbDelivery !== row.excelDelivery && 'text-emerald-600 dark:text-emerald-400'">
                    {{ row.excelDelivery || '-' }}
                  </span>
                </div>
                <div v-else class="text-slate-400">-</div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

  </div>
</template>
