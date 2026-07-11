<script setup>
import { onMounted, ref, computed, watch } from 'vue'
import { supabase } from '@/lib/supabase'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { 
  Database, Loader2, UploadCloud, FileSpreadsheet, Trash2, 
  CheckCircle2, AlertTriangle, Search, ChevronLeft, ChevronRight,
  ArrowUpDown, X, RefreshCw
} from 'lucide-vue-next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose
} from '@/components/ui/dialog'
import * as XLSX from 'xlsx'

const isLoading = ref(true)
const isUploading = ref(false)
const uploadProgress = ref(0)
const uploadResult = ref(null)
const excelFileInput = ref(null)

// Tracking Stats
const trackingStats = ref({ count: 0, lastUpdated: null })

// Pagination & Search
const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = 15
const totalRows = ref(0)
const trackingData = ref([])

const fetchTrackingStats = async () => {
  try {
    const { count, error } = await supabase
      .from('raw_forwarder_tracking')
      .select('*', { count: 'exact', head: true })
    
    const { data: latestRow, error: latestError } = await supabase
      .from('raw_forwarder_tracking')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
    
    if (!error) {
      trackingStats.value.count = count || 0
    }
    if (!latestError && latestRow && latestRow.length > 0) {
      trackingStats.value.lastUpdated = latestRow[0].updated_at
    }
  } catch (err) {
    console.error('Error fetching tracking stats:', err)
  }
}

const fetchTrackingData = async () => {
  isLoading.value = true
  try {
    let query = supabase
      .from('raw_forwarder_tracking')
      .select('*', { count: 'exact' })
    
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim()
      query = query.or(`hpo_number.ilike.%${q}%,item_code.ilike.%${q}%`)
    }
    
    const from = (currentPage.value - 1) * pageSize
    const to = from + pageSize - 1
    
    const { data, count, error } = await query
      .order('updated_at', { ascending: false })
      .range(from, to)
      
    if (error) throw error
    
    trackingData.value = data || []
    totalRows.value = count || 0
  } catch (err) {
    console.error('Error fetching tracking rows:', err)
  } finally {
    isLoading.value = false
  }
}

// Watch for search and page changes
watch(searchQuery, () => {
  currentPage.value = 1
  fetchTrackingData()
})

const handlePageChange = (page) => {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  fetchTrackingData()
}

const totalPages = computed(() => Math.ceil(totalRows.value / pageSize))

const triggerExcelFileInput = () => {
  if (excelFileInput.value) excelFileInput.value.click()
}

const handleExcelUpload = async (e) => {
  const file = e.target.files[0]
  if (!file) return
  
  isUploading.value = true
  uploadProgress.value = 0
  uploadResult.value = null
  
  const reader = new FileReader()
  reader.onload = async (evt) => {
    try {
      const data = new Uint8Array(evt.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
      
      if (rows.length === 0) {
        alert("File Excel tidak berisi data.")
        isUploading.value = false
        return
      }
      
      // Auto detect columns
      const headers = Object.keys(rows[0])
      let hpoCol = '', itemCol = '', exworkCol = '', etaCol = '', deliveryCol = '', statusCol = ''
      
      headers.forEach(header => {
        const h = header.toLowerCase().replace(/[\s\_\-]/g, '')
        if (h.includes('status') || h.includes('logistic') || h.includes('kondisi') || h.includes('keterangan')) statusCol = header
        else if (h.includes('exwork') || h.includes('exworkdate')) exworkCol = header
        else if (h.includes('eta') || h.includes('etajakarta')) etaCol = header
        else if (h.includes('deliverydate') || h.includes('tanggaldo') || h.includes('delivery')) deliveryCol = header
        else if (h.includes('hpo') || h.includes('customerpo') || h.includes('nopembelian') || (h.includes('po') && !h.includes('product'))) hpoCol = header
        else if (h.includes('mlfb') || h.includes('sku') || h.includes('nomorproduct') || h.includes('itemcode') || h.includes('productcode')) itemCol = header
        else if (h.includes('item') || h.includes('code')) itemCol = header
      })
      
      if (!hpoCol || !itemCol) {
        alert("Kolom HPO Number ('Customer PO') dan Product SKU ('MLFB') tidak terdeteksi otomatis. Pastikan nama header kolom sesuai.")
        isUploading.value = false
        return
      }
      
      // Date parser helper
      const parseExcelDateLocal = (val) => {
        if (val === undefined || val === null || val === '') return null
        
        if (typeof val === 'string' && val.trim().toLowerCase().includes('waiting')) {
          return '__waiting__'
        }
        
        let numVal = val
        if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
          numVal = Number(val.trim())
        }
        
        if (typeof numVal === 'number') {
          const date = new Date(Math.round((numVal - 25569) * 86400 * 1000))
          const yyyy = date.getFullYear()
          const mm = String(date.getMonth() + 1).padStart(2, '0')
          const dd = String(date.getDate()).padStart(2, '0')
          return `${yyyy}-${mm}-${dd}`
        }
        
        const str = String(val).trim()
        if (!str) return null
        
        const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
        if (dmy) {
          let y = dmy[3]
          if (y.length === 2) y = '20' + y
          const m = dmy[2].padStart(2, '0')
          const d = dmy[1].padStart(2, '0')
          return `${y}-${m}-${d}`
        }
        
        const monthsMap = {
          jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
          jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
          mei: '05', ags: '08', agu: '08', sep: '09', okt: '10', des: '12'
        }
        const textMatch = str.match(/(\d{1,2})[\s\-\/]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mei|ags|agu|okt|des)[a-z]*[\s\-\/]*(\d{2,4})/i)
        if (textMatch) {
          const d = textMatch[1].padStart(2, '0')
          const mKey = textMatch[2].toLowerCase()
          const m = monthsMap[mKey]
          let y = textMatch[3]
          if (y.length === 2) y = '20' + y
          return `${y}-${m}-${d}`
        }
        
        const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
        if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
        
        const parsed = new Date(str)
        if (!isNaN(parsed.getTime())) {
          const yyyy = parsed.getFullYear()
          const mm = String(parsed.getMonth() + 1).padStart(2, '0')
          const dd = String(parsed.getDate()).padStart(2, '0')
          return `${yyyy}-${mm}-${dd}`
        }
        return null
      }
      
      // Deduplicate rows to prevent "ON CONFLICT DO UPDATE command cannot affect row a second time"
      const deduplicatedMap = {}
      rows.forEach(row => {
        const rawHpo = String(row[hpoCol]).trim()
        const rawItem = String(row[itemCol]).trim()
        if (!rawHpo || !rawItem) return
        
        const rawExwork = exworkCol ? parseExcelDateLocal(row[exworkCol]) : null
        const isWaiting = rawExwork === '__waiting__'
        const exworkDate = isWaiting ? null : rawExwork
        
        let etaDate = etaCol ? parseExcelDateLocal(row[etaCol]) : null
        if (etaDate === '__waiting__') etaDate = null
        
        let deliveryDate = deliveryCol ? parseExcelDateLocal(row[deliveryCol]) : null
        if (deliveryDate === '__waiting__') deliveryDate = null
        
        const status = statusCol ? String(row[statusCol]).trim() : null
        
        const key = `${rawHpo.toLowerCase()}||${rawItem.toLowerCase()}`
        const score = (exworkDate ? 1 : 0) + (etaDate ? 1 : 0) + (deliveryDate ? 1 : 0) + (status ? 1 : 0)
        
        const newRecord = {
          hpo_number: rawHpo,
          item_code: rawItem,
          status,
          exwork_date: exworkDate,
          exwork_waiting: isWaiting,
          eta_date: etaDate,
          delivery_date: deliveryDate,
          updated_at: new Date().toISOString()
        }
        
        const existing = deduplicatedMap[key]
        if (!existing) {
          deduplicatedMap[key] = newRecord
        } else {
          const existingScore = (existing.exwork_date ? 1 : 0) + (existing.eta_date ? 1 : 0) + (existing.delivery_date ? 1 : 0) + (existing.status ? 1 : 0)
          if (score >= existingScore) {
            deduplicatedMap[key] = newRecord
          }
        }
      })
      
      const upsertRows = Object.values(deduplicatedMap)
      
      if (upsertRows.length === 0) {
        alert("Tidak ada baris data valid (HPO & Item SKU lengkap) untuk disimpan.")
        isUploading.value = false
        return
      }
      
      const chunkSize = 100
      let successCount = 0
      for (let i = 0; i < upsertRows.length; i += chunkSize) {
        const chunk = upsertRows.slice(i, i + chunkSize)
        const { error } = await supabase
          .from('raw_forwarder_tracking')
          .upsert(chunk, { onConflict: 'hpo_number,item_code' })
        
        if (error) {
          console.error("Error upserting chunk:", error)
          throw new Error(error.message)
        }
        successCount += chunk.length
        uploadProgress.value = Math.round((successCount / upsertRows.length) * 100)
      }
      
      uploadResult.value = {
        success: true,
        message: `Berhasil mengunggah ${successCount} baris data logistik.`
      }
      await fetchTrackingStats()
      await fetchTrackingData()
    } catch (err) {
      console.error(err)
      uploadResult.value = {
        success: false,
        message: `Gagal mengunggah data: ${err.message}`
      }
    } finally {
      isUploading.value = false
      if (e.target) e.target.value = ''
    }
  }
  reader.readAsArrayBuffer(file)
}

const clearTrackingDb = async () => {
  if (!confirm("Apakah Anda yakin ingin menghapus seluruh data pelacakan di database? Tindakan ini tidak dapat dibatalkan.")) return
  
  isLoading.value = true
  try {
    const { error } = await supabase
      .from('raw_forwarder_tracking')
      .delete()
      .neq('hpo_number', '')
    
    if (error) throw error
    alert("Database pelacakan berhasil dibersihkan.")
    currentPage.value = 1
    await fetchTrackingStats()
    await fetchTrackingData()
  } catch (err) {
    console.error("Error clearing DB:", err)
    alert("Gagal membersihkan database: " + err.message)
  } finally {
    isLoading.value = false
  }
}

const deleteRow = async (hpo, item) => {
  if (!confirm(`Hapus data pelacakan untuk HPO ${hpo} - Item ${item}?`)) return
  try {
    const { error } = await supabase
      .from('raw_forwarder_tracking')
      .delete()
      .eq('hpo_number', hpo)
      .eq('item_code', item)
    
    if (error) throw error
    await fetchTrackingStats()
    await fetchTrackingData()
  } catch (err) {
    console.error(err)
    alert("Gagal menghapus baris: " + err.message)
  }
}

const formatDateTime = (isoString) => {
  if (!isoString) return '-'
  const d = new Date(isoString)
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

// --- GLOBAL SYNC ALL ACTIVE HSOS LOGIC ---
const isGlobalSyncing = ref(false)
const globalSyncProgress = ref(0)
const globalSyncMessage = ref('')
const isSyncModalOpen = ref(false)
const proposedGlobalChanges = ref([]) // proposed updates grouped by HSO
const totalProposedChangesCount = ref(0)
const isApplyingGlobalChanges = ref(false)

const startGlobalSync = async () => {
  isGlobalSyncing.value = true
  globalSyncProgress.value = 0
  globalSyncMessage.value = 'Mendapatkan daftar SO aktif dari Accurate...'
  proposedGlobalChanges.value = []
  totalProposedChangesCount.value = 0
  
  try {
    // 1. Fetch active Sales Orders from Accurate via Edge Function
    const { data: listData, error: listError } = await supabase.functions.invoke('accurate-list-so')
    if (listError) throw listError
    if (!listData || !listData.d) throw new Error("Gagal mengambil data HSO dari Accurate.")
    
    // Filter HSO waiting or partial process
    const activeOrders = listData.d.filter(item => 
      item.statusName === 'Menunggu diproses' || item.statusName === 'Sebagian diproses'
    )
    
    if (activeOrders.length === 0) {
      alert("Tidak ada Sales Order aktif (Menunggu / Sebagian diproses) untuk disinkronisasi.")
      isGlobalSyncing.value = false
      return
    }
    
    globalSyncProgress.value = 20
    globalSyncMessage.value = `Mengambil detail item untuk ${activeOrders.length} HSO...`
    
    // 2. Load SO details in parallel using Edge Function (batch size is limited to avoid memory issues)
    const details = []
    const detailErrors = []
    
    // Parallel execute in chunks of 5 to avoid overloading
    const chunkSize = 5
    for (let i = 0; i < activeOrders.length; i += chunkSize) {
      const chunk = activeOrders.slice(i, i + chunkSize)
      const promises = chunk.map(async (so) => {
        try {
          const { data, error } = await supabase.functions.invoke('accurate-detail-so', {
            body: { id: so.id, type: 'sales-order' }
          })
          if (error) throw error
          if (data && data.d) {
            details.push(data.d)
          }
        } catch (e) {
          console.error(`Failed to load details for ${so.number}:`, e)
          detailErrors.push(so.number)
        }
      })
      await Promise.all(promises)
      globalSyncProgress.value = 20 + Math.min(50, Math.round(((i + chunk.length) / activeOrders.length) * 50))
    }
    
    if (details.length === 0) {
      throw new Error("Gagal mengambil detail item untuk HSO aktif.")
    }
    
    globalSyncMessage.value = 'Menganalisis status logistik...'
    globalSyncProgress.value = 75
    
    // 3. Fetch all HPO mappings from database where detail_notes matches active HSO numbers
    const soNumbers = details.map(d => d.number)
    const orFilter = soNumbers.map(num => `detail_notes.ilike.%${num.replace(/\//g, '%')}%`).join(',')
    
    const { data: poItems, error: poError } = await supabase
      .from('accurate_purchase_order_items')
      .select(`
        *,
        header:accurate_purchase_orders(
          id, number, trans_date, status_name, vendor_name
        )
      `)
      .or(orFilter)
      
    const hpoMapping = {}
    if (!poError && poItems) {
      poItems.forEach(item => {
        const matchedSoNumber = soNumbers.find(num => 
          item.detail_notes && item.detail_notes.toLowerCase().includes(num.toLowerCase())
        )
        if (matchedSoNumber) {
          const key = `${matchedSoNumber.toLowerCase()}||${String(item.item_code).trim().toLowerCase()}`
          if (hpoMapping[key] && !hpoMapping[key].includes(item.header?.number)) {
            hpoMapping[key] += `, ${item.header?.number}`
          } else if (!hpoMapping[key]) {
            hpoMapping[key] = item.header?.number || ''
          }
        }
      })
    }
    
    // 4. Fetch all shipments from Supabase for these SO IDs
    const activeSoIds = details.map(d => String(d.id))
    const { data: shipmentsData, error: shipError } = await supabase
      .from('shipments')
      .select('*')
      .in('so_id', activeSoIds)
      
    const shipmentList = shipmentsData || []
    
    // 5. Fetch tracking rows from database
    const { data: trackingRows, error: trackDbError } = await supabase
      .from('raw_forwarder_tracking')
      .select('*')
      
    if (trackDbError) throw trackDbError
    const trackingList = trackingRows || []
    
    // 6. In-Memory Matching
    const matches = []
    const statusLevels = {
      'Already in Hokiindo Raya': 4,
      'Already in siemens Warehouse': 3,
      'ETA Port JKT': 2,
      'Follow up with our forwarder': 1,
      '': 0
    }
    
    const mapStatusLocal = (excelStatus) => {
      if (!excelStatus) return 'Follow up with our forwarder'
      const s = String(excelStatus).trim().toLowerCase()
      if (s.includes('done delivery') || s.includes('delivered') || s.includes('customer') || s.includes('hokiindo')) return 'Already in Hokiindo Raya'
      if (s.includes('siemens') || s.includes('dunex') || s.includes('warehouse') || s.includes('tiba gudang dunex') || s.includes('our warehouse') || s.includes('our wh')) return 'Already in siemens Warehouse'
      if (s.includes('transit') || s.includes('eta') || s.includes('port') || s.includes('jkt') || s.includes('jkt port')) return 'ETA Port JKT'
      if (s.includes('forwarder') || s.includes('ex-works') || s.includes('exwork') || s.includes('ready') || s.includes('factory') || s.includes('production')) return 'Follow up with our forwarder'
      const exact = ['follow up with our forwarder', 'eta port jkt', 'already in siemens warehouse', 'already in hokiindo raya']
      const matched = exact.find(e => e.toLowerCase() === s)
      if (matched) return matched
      return 'Follow up with our forwarder'
    }
    
    const isHpoMatch = (dbHpo, excelHpo) => {
      const normalize = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]/g, '').replace(/0/g, 'o')
      const d = normalize(dbHpo)
      const e = normalize(excelHpo)
      if (!d || !e) return false
      if (d === e) return true
      if (d.includes(e) || e.includes(d)) return true
      return false
    }

    const isItemMatch = (dbItem, excelItem) => {
      if (!dbItem || !excelItem) return false
      const d = String(dbItem).trim().toLowerCase().replace(/[\s\-\.]/g, '')
      const e = String(excelItem).trim().toLowerCase().replace(/[\s\-\.]/g, '')
      if (!d || !e) return false
      return d === e || d.includes(e) || e.includes(d)
    }

    // Helper to extract date from status text
    const extractDateFromText = (text) => {
      if (!text) return null
      const str = String(text).trim()
      
      const monthsMap = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
        mei: '05', ags: '08', agu: '08', sep: '09', okt: '10', des: '12'
      }
      const textMatch = str.match(/(\d{1,2})[\s\-\/]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mei|ags|agu|okt|des)[a-z]*[\s\-\/]*(\d{2,4})/i)
      if (textMatch) {
        const d = textMatch[1].padStart(2, '0')
        const mKey = textMatch[2].toLowerCase()
        const m = monthsMap[mKey]
        let y = textMatch[3]
        if (y.length === 2) y = '20' + y
        return `${y}-${m}-${d}`
      }

      const dmy = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
      if (dmy) {
        let y = dmy[3]
        if (y.length === 2) y = '20' + y
        const m = dmy[2].padStart(2, '0')
        const d = dmy[1].padStart(2, '0')
        return `${y}-${m}-${d}`
      }
      
      const ymd = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
      if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
      
      return null
    }

    const getLocalDate = () => new Date().toISOString().split('T')[0]
    
    // Group proposed updates by HSO
    const changesGroupedByHso = {}
    let changeCounter = 0
    
    details.forEach(so => {
      const soItems = so.detailItem || []
      const soId = String(so.id)
      const soNumber = so.number
      const client = so.customer?.name || '-'
      
      const soProposed = []
      const seenKeys = new Set()
      
      // Get shipments already created for this SO
      const soShipments = shipmentList.filter(s => String(s.so_id) === soId)
      
      // PASS 1: DB shipments with HPO
      soShipments.forEach(shipment => {
        if (!shipment.hpo_number || !shipment.item_code) return
        
        const key = `${String(shipment.item_code).trim().toLowerCase()}||${String(shipment.hpo_number).trim().toLowerCase()}`
        if (seenKeys.has(key)) return
        
        const matchedRows = trackingList.filter(r => 
          isItemMatch(shipment.item_code, r.item_code) && isHpoMatch(shipment.hpo_number, r.hpo_number)
        )
        if (matchedRows.length === 0) return
        
        const bestRow = matchedRows.reduce((best, curr) => {
          const bestLvl = statusLevels[mapStatusLocal(best.status)] || 0
          const currLvl = statusLevels[mapStatusLocal(curr.status)] || 0
          return currLvl > bestLvl ? curr : best
        })
        
        seenKeys.add(key)
        
        let excelStatus = mapStatusLocal(bestRow.status)
        let excelExwork = bestRow.exwork_date
        let excelEta = bestRow.eta_date
        let excelDelivery = bestRow.delivery_date
        
        if (bestRow.status) {
          if (!excelExwork && excelStatus === 'Follow up with our forwarder') excelExwork = extractDateFromText(bestRow.status)
          if (!excelEta && excelStatus === 'ETA Port JKT') excelEta = extractDateFromText(bestRow.status)
          if (!excelDelivery && (excelStatus === 'Already in siemens Warehouse' || excelStatus === 'Already in Hokiindo Raya')) excelDelivery = extractDateFromText(bestRow.status)
        }
        
        if (excelDelivery) {
          if (excelStatus !== 'Already in Hokiindo Raya' && excelStatus !== 'Already in siemens Warehouse') {
            excelStatus = 'Already in siemens Warehouse'
          }
        } else if (excelEta) {
          if (excelStatus === 'Follow up with our forwarder' || !excelStatus) {
            excelStatus = 'ETA Port JKT'
          }
        }
        
        const dbShipments = soShipments.filter(s => 
          isItemMatch(s.item_code, shipment.item_code) && isHpoMatch(s.hpo_number, shipment.hpo_number)
        )
        const primaryShipment = dbShipments[0]
        
        if (!excelDelivery && (excelStatus === 'Already in siemens Warehouse' || excelStatus === 'Already in Hokiindo Raya')) {
          const dbAlreadyHasDelivery = primaryShipment && (primaryShipment.dunex_date || primaryShipment.hokiindo_date)
          if (!dbAlreadyHasDelivery) excelDelivery = getLocalDate()
        }
        
        const currentStatus = primaryShipment.current_status || ''
        const currentLevel = statusLevels[currentStatus] || 0
        const newLevel = statusLevels[excelStatus] || 0
        
        const isStatusUpgraded = newLevel > currentLevel
        const dbExworkText = primaryShipment.exwork_waiting ? 'Waiting' : (primaryShipment.exwork_date || '')
        const excelExworkText = bestRow.exwork_waiting ? 'Waiting' : (excelExwork || '')
        
        const isDatesChanged = 
          excelExworkText !== dbExworkText ||
          (excelEta || '') !== (primaryShipment.eta_date || '') ||
          (excelDelivery || '') !== (primaryShipment.hokiindo_date || primaryShipment.dunex_date || '')
          
        if (isStatusUpgraded || isDatesChanged) {
          soProposed.push({
            itemCode: shipment.item_code,
            itemName: soItems.find(i => i.code === shipment.item_code)?.name || 'Produk',
            hpoNumber: shipment.hpo_number,
            oldStatus: currentStatus || 'Belum Ada',
            newStatus: excelStatus,
            oldExwork: dbExworkText || '-',
            newExwork: excelExworkText || '-',
            oldEta: primaryShipment.eta_date || '-',
            newEta: excelEta || '-',
            oldDelivery: primaryShipment.hokiindo_date || primaryShipment.dunex_date || '-',
            newDelivery: excelDelivery || '-',
            shipmentIds: dbShipments.map(s => s.id),
            isVirtual: false,
            exworkWaiting: bestRow.exwork_waiting
          })
        }
      })
      
      // PASS 2: Items with HPO Mapping but not in shipments table yet
      soItems.forEach(item => {
        const mappingKey = `${soNumber.toLowerCase()}||${String(item.code).trim().toLowerCase()}`
        const hpoVal = hpoMapping[mappingKey]
        if (!hpoVal) return
        
        const hpos = hpoVal.split(',').map(x => x.trim()).filter(Boolean)
        hpos.forEach(hpo => {
          const key = `${String(item.code).trim().toLowerCase()}||${hpo.toLowerCase()}`
          
          const alreadySeen = Array.from(seenKeys).some(seenKey => {
            const [seenItem, seenHpo] = seenKey.split('||')
            return isItemMatch(item.code, seenItem) && isHpoMatch(hpo, seenHpo)
          })
          if (alreadySeen) return
          
          const matchedRows = trackingList.filter(r => 
            isItemMatch(item.code, r.item_code) && isHpoMatch(hpo, r.hpo_number)
          )
          if (matchedRows.length === 0) return
          
          const bestRow = matchedRows.reduce((best, curr) => {
            const bestLvl = statusLevels[mapStatusLocal(best.status)] || 0
            const currLvl = statusLevels[mapStatusLocal(curr.status)] || 0
            return currLvl > bestLvl ? curr : best
          })
          
          seenKeys.add(key)
          
          let excelStatus = mapStatusLocal(bestRow.status)
          let excelExwork = bestRow.exwork_date
          let excelEta = bestRow.eta_date
          let excelDelivery = bestRow.delivery_date
          
          if (bestRow.status) {
            if (!excelExwork && excelStatus === 'Follow up with our forwarder') excelExwork = extractDateFromText(bestRow.status)
            if (!excelEta && excelStatus === 'ETA Port JKT') excelEta = extractDateFromText(bestRow.status)
            if (!excelDelivery && (excelStatus === 'Already in siemens Warehouse' || excelStatus === 'Already in Hokiindo Raya')) excelDelivery = extractDateFromText(bestRow.status)
          }
          
          if (excelDelivery) {
            if (excelStatus !== 'Already in Hokiindo Raya' && excelStatus !== 'Already in siemens Warehouse') {
              excelStatus = 'Already in siemens Warehouse'
            }
          } else if (excelEta) {
            if (excelStatus === 'Follow up with our forwarder' || !excelStatus) {
              excelStatus = 'ETA Port JKT'
            }
          }
          
          if (!excelDelivery && (excelStatus === 'Already in siemens Warehouse' || excelStatus === 'Already in Hokiindo Raya')) {
            excelDelivery = getLocalDate()
          }
          
          const excelExworkText = bestRow.exwork_waiting ? 'Waiting' : (excelExwork || '')
          
          soProposed.push({
            itemCode: item.code,
            itemName: item.name || 'Produk',
            hpoNumber: hpo,
            oldStatus: '(Akan Dibuat)',
            newStatus: excelStatus,
            oldExwork: '-',
            newExwork: excelExworkText || '-',
            oldEta: '-',
            newEta: excelEta || '-',
            oldDelivery: '-',
            newDelivery: excelDelivery || '-',
            shipmentIds: [],
            isVirtual: true,
            exworkWaiting: bestRow.exwork_waiting
          })
        })
      })
      
      if (soProposed.length > 0) {
        changesGroupedByHso[soNumber] = {
          soId,
          soNumber,
          client,
          items: soProposed
        }
        changeCounter += soProposed.length
      }
    })
    
    globalSyncProgress.value = 100
    if (changeCounter === 0) {
      alert("Semua SO sudah sinkron sepenuhnya dengan database pelacakan. Tidak ada pembaruan logistik baru.")
      isGlobalSyncing.value = false
      return
    }
    
    proposedGlobalChanges.value = Object.values(changesGroupedByHso)
    totalProposedChangesCount.value = changeCounter
    isSyncModalOpen.value = true
  } catch (err) {
    console.error(err)
    alert("Gagal melakukan pencocokan status logistik: " + err.message)
  } finally {
    isGlobalSyncing.value = false
  }
}

const applyAllSyncUpdates = async () => {
  isApplyingGlobalChanges.value = true
  
  try {
    const updates = []
    proposedGlobalChanges.value.forEach(hso => {
      hso.items.forEach(item => {
        updates.push({
          soId: hso.soId,
          soNumber: hso.soNumber,
          ...item
        })
      })
    })
    
    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email || 'System'
    
    let successCount = 0
    for (const update of updates) {
      try {
        let shipmentId = null
        if (update.isVirtual) {
          const insertPayload = {
            so_id: update.soId,
            item_code: update.itemCode,
            hpo_number: update.hpoNumber,
            shipment_type: 'IMPORT_PO'
          }
          if (update.newStatus) {
            insertPayload.current_status = update.newStatus
            insertPayload.status_date = new Date().toISOString().split('T')[0]
          } else {
            insertPayload.current_status = 'Follow up with our forwarder'
            insertPayload.status_date = new Date().toISOString().split('T')[0]
          }
          if (update.exworkWaiting) {
            insertPayload.exwork_waiting = true
            insertPayload.exwork_date = null
          } else if (update.newExwork && update.newExwork !== '-') {
            insertPayload.exwork_date = update.newExwork
          }
          if (update.newEta && update.newEta !== '-') insertPayload.eta_date = update.newEta
          
          if (update.newDelivery && update.newDelivery !== '-') {
            if (update.newStatus === 'Already in Hokiindo Raya') {
              insertPayload.hokiindo_date = update.newDelivery
              insertPayload.dunex_date = update.newDelivery
            } else {
              insertPayload.dunex_date = update.newDelivery
            }
          }
          
          const { data: newShip, error: errNew } = await supabase
            .from('shipments')
            .insert(insertPayload)
            .select()
            .single()
            
          if (errNew) throw errNew
          shipmentId = newShip.id
        } else {
          const shipmentPayload = {}
          if (update.newStatus) {
            shipmentPayload.current_status = update.newStatus
            shipmentPayload.status_date = new Date().toISOString().split('T')[0]
          }
          if (update.exworkWaiting) {
            shipmentPayload.exwork_waiting = true
            shipmentPayload.exwork_date = null
          } else if (update.newExwork && update.newExwork !== '-') {
            shipmentPayload.exwork_date = update.newExwork
            shipmentPayload.exwork_waiting = false
          }
          if (update.newEta && update.newEta !== '-') shipmentPayload.eta_date = update.newEta
          
          if (update.newDelivery && update.newDelivery !== '-') {
            if (update.newStatus === 'Already in Hokiindo Raya') {
              shipmentPayload.hokiindo_date = update.newDelivery
              shipmentPayload.dunex_date = update.newDelivery
            } else {
              shipmentPayload.dunex_date = update.newDelivery
            }
          }
          
          for (const sId of update.shipmentIds) {
            const { error: errUpd } = await supabase
              .from('shipments')
              .update(shipmentPayload)
              .eq('id', sId)
              
            if (errUpd) throw errUpd
          }
          shipmentId = update.shipmentIds[0]
        }
        
        if (shipmentId) {
          let eventDate = null
          if (update.newStatus === 'Follow up with our forwarder') eventDate = update.newExwork !== '-' ? update.newExwork : null
          else if (update.newStatus === 'ETA Port JKT') eventDate = update.newEta !== '-' ? update.newEta : null
          else if (update.newStatus === 'Already in siemens Warehouse' || update.newStatus === 'Already in Hokiindo Raya') eventDate = update.newDelivery !== '-' ? update.newDelivery : null

          await supabase.from('shipment_logs').insert({
            shipment_id: shipmentId,
            status_name: update.newStatus,
            event_date: eventDate,
            notes: 'Auto-updated via Global Sync',
            user_email: userEmail,
            action_detail: `Pembaruan logistik masal untuk item "${update.itemCode}" (HPO: ${update.hpoNumber}) ke status "${update.newStatus}"`
          })
        }
        successCount++
      } catch (err) {
        console.error(`Failed to apply sync for HSO ${update.soNumber} - SKU ${update.itemCode}:`, err)
      }
    }
    
    alert(`Berhasil memperbarui ${successCount} item status logistik secara massal!`)
    isSyncModalOpen.value = false
    proposedGlobalChanges.value = []
    totalProposedChangesCount.value = 0
    
    await fetchTrackingStats()
    await fetchTrackingData()
  } catch (err) {
    console.error(err)
    alert("Gagal menerapkan pembaruan massal: " + err.message)
  } finally {
    isApplyingGlobalChanges.value = false
  }
}

onMounted(() => {
  fetchTrackingStats()
  fetchTrackingData()
})
</script>

<template>
  <div class="space-y-6 pb-20">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <div class="flex items-center gap-3 mb-1">
          <div class="p-2 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg shadow-red-500/30">
            <Database class="w-5 h-5 text-white"/>
          </div>
          <h2 class="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Database Pelacakan Logistik</h2>
        </div>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          Kelola data mentah status forwarder global secara terpusat.
        </p>
      </div>
      <Button 
        size="sm" 
        class="w-full sm:w-auto shadow-md bg-gradient-to-r from-red-650 to-rose-650 hover:from-red-550 hover:to-rose-550 text-white font-bold transition-all duration-200 hover:shadow-lg active:scale-95 flex items-center justify-center gap-1.5 py-5 sm:py-4 px-4.5 rounded-xl text-xs uppercase tracking-wider bg-red-600 hover:bg-red-500 border border-transparent shadow-red-500/20"
        @click="startGlobalSync"
        :disabled="isGlobalSyncing || isUploading"
      >
        <RefreshCw class="w-4 h-4 shrink-0" :class="isGlobalSyncing ? 'animate-spin' : ''"/>
        <span>{{ isGlobalSyncing ? 'Sinkronisasi...' : 'Sync Semua HSO Aktif' }}</span>
      </Button>
    </div>

    <!-- Excel Upload Card -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm p-6 space-y-4 transition-colors duration-300">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-start gap-3">
          <div class="p-2.5 bg-rose-50 dark:bg-rose-950/20 text-red-600 dark:text-red-400 rounded-xl border border-rose-100/30 dark:border-rose-900/30 shadow-sm shrink-0">
            <FileSpreadsheet class="w-5.5 h-5.5"/>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-base">Unggah Spreadsheet Logistik</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Unggah status logistik terbaru di sini.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3 shrink-0">
          <div class="text-left sm:text-right">
            <span class="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Data Tersimpan</span>
            <span class="text-sm font-black text-slate-800 dark:text-slate-200 mt-0.5">
              {{ trackingStats.count }} baris
            </span>
          </div>
          <div class="h-8 w-[1px] bg-slate-200 dark:bg-slate-800"></div>
          <div class="text-left sm:text-right">
            <span class="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Pembaruan Terakhir</span>
            <span class="text-xs font-semibold text-slate-600 dark:text-slate-400 block mt-0.5">
              {{ formatDateTime(trackingStats.lastUpdated) }}
            </span>
          </div>
          <Button 
            v-if="trackingStats.count > 0"
            variant="ghost" 
            size="sm" 
            class="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg p-2 ml-2"
            @click="clearTrackingDb"
            title="Bersihkan Database Pelacakan"
          >
            <Trash2 class="w-4 h-4"/>
          </Button>
        </div>
      </div>

      <!-- Dropzone area -->
      <div 
        @click="triggerExcelFileInput"
        class="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center cursor-pointer hover:border-slate-400 dark:hover:border-slate-600 transition-all hover:bg-slate-50/50 dark:hover:bg-slate-800/20 flex flex-col items-center justify-center space-y-3 relative group"
        :class="{ 'opacity-60 pointer-events-none': isUploading }"
      >
        <input 
          type="file" 
          ref="excelFileInput" 
          class="hidden" 
          accept=".xlsx, .xls" 
          @change="handleExcelUpload" 
        />
        
        <div class="p-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full group-hover:scale-110 transition-transform">
          <UploadCloud class="w-6 h-6"/>
        </div>
        
        <div class="space-y-1">
          <p class="text-sm font-bold text-slate-700 dark:text-slate-300">
            {{ isUploading ? 'Sedang memproses database...' : 'Klik untuk memilih atau seret file Excel di sini' }}
          </p>
          <p class="text-xs text-slate-400 dark:text-slate-500">
            Mendukung .xlsx, .xls. Kolom wajib: "Customer PO / HPO Number" dan "MLFB / SKU / Product Code".
          </p>
        </div>

        <!-- Progress bar -->
        <div v-if="isUploading" class="w-64 max-w-xs bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-200/20">
          <div class="bg-red-600 dark:bg-red-500 h-full rounded-full transition-all duration-300" :style="`width: ${uploadProgress}%`"></div>
        </div>
      </div>

      <!-- Result banner -->
      <div 
        v-if="uploadResult" 
        class="flex items-start gap-3 p-3.5 rounded-xl border text-xs font-semibold"
        :class="uploadResult.success 
          ? 'bg-emerald-50 border-emerald-150 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400' 
          : 'bg-rose-50 border-rose-150 text-rose-800 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-400'"
      >
        <component :is="uploadResult.success ? CheckCircle2 : AlertTriangle" class="w-4 h-4 shrink-0 mt-0.5" />
        <div class="flex-1">
          <p>{{ uploadResult.message }}</p>
        </div>
        <button @click="uploadResult = null" class="opacity-60 hover:opacity-100 text-base font-bold select-none">&times;</button>
      </div>
    </div>

    <!-- Data Table Card -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm p-6 space-y-4 transition-colors duration-300">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 class="font-bold text-slate-900 dark:text-white text-base">Isi Database Pelacakan</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Cari HPO Siemens atau SKU produk untuk memeriksa status terdaftar.
          </p>
        </div>
        <!-- Search Input -->
        <div class="relative w-full sm:w-80">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            v-model="searchQuery"
            placeholder="Cari HPO atau SKU..."
            class="pl-9 pr-8 bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 focus-visible:ring-red-500 focus-visible:border-red-500 text-sm font-semibold rounded-xl h-10 w-full"
          />
          <button 
            v-if="searchQuery" 
            @click="searchQuery = ''"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Table -->
      <div class="relative overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl">
        <Table>
          <TableHeader class="bg-slate-50 dark:bg-slate-800/50">
            <TableRow>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs">HPO Siemens</TableHead>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs">Kode Produk (SKU)</TableHead>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs">Status</TableHead>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs text-center">Ex-Works</TableHead>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs text-center">ETA JKT</TableHead>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs text-center">Delivery Date</TableHead>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs text-right">Pembaruan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="isLoading" class="hover:bg-transparent">
              <TableCell colspan="7" class="text-center py-10">
                <div class="flex flex-col items-center justify-center gap-2">
                  <Loader2 class="w-8 h-8 text-red-600 dark:text-red-500 animate-spin" />
                  <span class="text-xs text-slate-500 dark:text-slate-400 font-medium">Memuat data pelacakan...</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow v-else-if="trackingData.length === 0" class="hover:bg-transparent">
              <TableCell colspan="7" class="text-center py-12 text-slate-500 dark:text-slate-400">
                <div class="flex flex-col items-center justify-center gap-2">
                  <Database class="w-10 h-10 text-slate-300 dark:text-slate-700" />
                  <span class="text-sm font-bold">Tidak ada data pelacakan.</span>
                  <span class="text-xs text-slate-400">Silakan unggah Excel logistik untuk memulai.</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow 
              v-else 
              v-for="row in trackingData" 
              :key="`${row.hpo_number}-${row.item_code}`"
              class="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              <TableCell class="font-black text-slate-900 dark:text-white uppercase tracking-tight py-3.5">{{ row.hpo_number }}</TableCell>
              <TableCell class="font-mono text-slate-600 dark:text-slate-400">{{ row.item_code }}</TableCell>
              <TableCell>
                <Badge variant="outline" class="font-bold text-[10px] px-2 py-0.5 bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700">
                  {{ row.status || '-' }}
                </Badge>
              </TableCell>
              <TableCell class="text-center">
                <span v-if="row.exwork_waiting" class="text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded border border-amber-100/50 dark:border-amber-900/30 text-[10px]">
                  Waiting Confirmation
                </span>
                <span v-else-if="row.exwork_date" class="font-mono text-slate-600 dark:text-slate-400">
                  {{ row.exwork_date }}
                </span>
                <span v-else class="text-slate-400">-</span>
              </TableCell>
              <TableCell class="text-center font-mono text-slate-600 dark:text-slate-400">
                {{ row.eta_date || '-' }}
              </TableCell>
              <TableCell class="text-center font-mono text-slate-600 dark:text-slate-400">
                {{ row.delivery_date || '-' }}
              </TableCell>
              <TableCell class="text-right text-slate-500 dark:text-slate-500 text-[10px]">
                {{ formatDateTime(row.updated_at) }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- Pagination controls -->
      <div v-if="totalPages > 1" class="flex items-center justify-between pt-4">
        <span class="text-xs text-slate-500 dark:text-slate-400 font-bold">
          Menampilkan {{ (currentPage - 1) * pageSize + 1 }} - {{ Math.min(currentPage * pageSize, totalRows) }} dari {{ totalRows }} data
        </span>
        <div class="flex items-center gap-1.5">
          <Button 
            variant="outline" 
            size="sm"
            class="h-8 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold px-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg active:scale-95 transition-all"
            :disabled="currentPage === 1"
            @click="handlePageChange(currentPage - 1)"
          >
            <ChevronLeft class="w-4 h-4 mr-1"/>
            <span>Sebelumnya</span>
          </Button>
          <div class="flex items-center gap-1">
            <span class="text-xs font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
              {{ currentPage }}
            </span>
            <span class="text-xs text-slate-400">/</span>
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400 px-2 py-1">
              {{ totalPages }}
            </span>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            class="h-8 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold px-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg active:scale-95 transition-all"
            :disabled="currentPage === totalPages"
            @click="handlePageChange(currentPage + 1)"
          >
            <span>Berikutnya</span>
            <ChevronRight class="w-4 h-4 ml-1"/>
          </Button>
        </div>
      </div>
    </div>

    <!-- FULL SCREEN GLOBAL SYNC LOADING OVERLAY -->
    <div v-if="isGlobalSyncing" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center justify-center text-center space-y-4 animate-in zoom-in-95 duration-200">
        <Loader2 class="w-12 h-12 text-red-650 animate-spin" />
        <div class="space-y-1 w-full">
          <h4 class="font-bold text-slate-900 dark:text-white text-base">Sinkronisasi Semua HSO</h4>
          <p class="text-xs text-slate-500 dark:text-slate-400 font-medium">{{ globalSyncMessage }}</p>
        </div>
        <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div class="bg-red-600 dark:bg-red-500 h-full rounded-full transition-all duration-300" :style="`width: ${globalSyncProgress}%`"></div>
        </div>
        <span class="text-[10px] font-black text-slate-400 dark:text-slate-500">{{ globalSyncProgress }}%</span>
      </div>
    </div>

    <!-- PREVIEW CONFIRMATION DIALOG -->
    <Dialog :open="isSyncModalOpen" @update:open="val => isSyncModalOpen = val">
      <DialogContent class="sm:max-w-[800px] max-h-[85vh] flex flex-col p-0 overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-2xl shadow-2xl">
        <DialogHeader class="p-6 pb-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/20">
          <DialogTitle class="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <RefreshCw class="w-5 h-5 text-red-600" />
            <span>Konfirmasi Sinkronisasi Semua HSO Aktif</span>
          </DialogTitle>
          <DialogDescription class="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
            Menemukan total <strong class="text-slate-900 dark:text-white font-black">{{ totalProposedChangesCount }} item</strong> pembaruan logistik baru di database. Silakan tinjau ringkasan perubahan di bawah ini sebelum disimpan ke pengiriman aktif.
          </DialogDescription>
        </DialogHeader>

        <!-- Scrollable preview list -->
        <div class="flex-1 overflow-y-auto p-6 space-y-6">
          <div v-for="hso in proposedGlobalChanges" :key="hso.soNumber" class="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm bg-slate-50/30 dark:bg-slate-900/10">
            <!-- HSO Header Info -->
            <div class="bg-slate-50 dark:bg-slate-900/50 px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div class="space-y-0.5">
                <span class="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight">{{ hso.soNumber }}</span>
                <span class="block text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Customer: {{ hso.client }}</span>
              </div>
              <Badge variant="secondary" class="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold px-2 py-0.5 border border-slate-200 dark:border-slate-700">
                {{ hso.items.length }} Item Berubah
              </Badge>
            </div>
            
            <!-- Items comparison table -->
            <div class="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900/30">
              <div v-for="item in hso.items" :key="`${item.itemCode}-${item.hpoNumber}`" class="p-4 space-y-3">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <h5 class="font-mono text-xs font-bold text-slate-900 dark:text-white tracking-tight">{{ item.itemCode }}</h5>
                    <p class="text-[10px] text-slate-500 dark:text-slate-400 font-medium line-clamp-1 mt-0.5">{{ item.itemName }}</p>
                  </div>
                  <Badge variant="outline" class="font-bold text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20 border-blue-150/30 dark:border-blue-900/30">
                    Ex PO: {{ item.hpoNumber }}
                  </Badge>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-dashed border-slate-100 dark:border-slate-800 text-xs">
                  <!-- Status Transition -->
                  <div class="space-y-1.5">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status Pengiriman</span>
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-slate-500 dark:text-slate-400 font-medium">{{ item.oldStatus }}</span>
                      <span class="text-slate-300 dark:text-slate-600">➔</span>
                      <span class="font-bold text-red-600 bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded border border-red-100 dark:border-red-900/30 text-[11px]">
                        {{ item.newStatus }}
                      </span>
                    </div>
                  </div>

                  <!-- Dates Transition -->
                  <div class="space-y-1">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pembaruan Tanggal</span>
                    <ul class="space-y-1 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      <li class="flex items-center gap-1.5">
                        <span class="text-slate-400 w-16">Ex-Works:</span>
                        <span class="font-mono">{{ item.oldExwork }} ➔ {{ item.newExwork }}</span>
                      </li>
                      <li class="flex items-center gap-1.5">
                        <span class="text-slate-400 w-16">ETA JKT:</span>
                        <span class="font-mono">{{ item.oldEta }} ➔ {{ item.newEta }}</span>
                      </li>
                      <li class="flex items-center gap-1.5">
                        <span class="text-slate-400 w-16">Delivery:</span>
                        <span class="font-mono">{{ item.oldDelivery }} ➔ {{ item.newDelivery }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter class="p-6 pt-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/20 flex flex-col-reverse sm:flex-row gap-2">
          <DialogClose as-child>
            <Button variant="outline" class="w-full sm:w-auto border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 font-bold text-xs uppercase tracking-wider h-10 rounded-xl active:scale-95 transition-all">
              Batal
            </Button>
          </DialogClose>
          <Button 
            class="w-full sm:w-auto shadow-md bg-gradient-to-r from-red-650 to-rose-650 hover:from-red-550 hover:to-rose-550 text-white font-bold text-xs uppercase tracking-wider h-10 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-500 shadow-red-500/20"
            @click="applyAllSyncUpdates"
            :disabled="isApplyingGlobalChanges"
          >
            <Loader2 v-if="isApplyingGlobalChanges" class="w-4 h-4 animate-spin" />
            <RefreshCw v-else class="w-4 h-4" />
            <span>{{ isApplyingGlobalChanges ? 'Menyimpan...' : 'Terapkan Pembaruan Massal' }}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
