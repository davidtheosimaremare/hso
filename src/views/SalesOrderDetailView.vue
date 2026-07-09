<script setup>
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

// UI Components
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle
} from '@/components/ui/sheet'
import {
  Loader2, Calendar, MapPin, Truck, Building2,
  Edit, CheckCircle2, Clock, Anchor, Factory, FileText, 
  PackageCheck, Share2, Info, ExternalLink, Package, Hourglass, 
  Layers, AlertCircle, ShoppingCart, Download, AlertTriangle,
  ChevronDown, ChevronUp, Plane, Box, Copy, Search, UploadCloud, FileSpreadsheet
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const routeId = route.params.id
const resolvedSoId = ref(null)

// --- 1. STATE MANAGEMENT ---
const soDetail = ref(null)
const shipmentList = ref([])
const activityLogs = ref([])  // Activity log untuk tracking siapa melakukan apa
const currentUser = ref(null) // User yang sedang login
const isLoading = ref(true)
const loadingProgress = ref(0) // Progress bar 0-100
const loadingMessage = ref('Memuat data HSO...') // Pesan loading
const isSubmitting = ref(false)
const isModalOpen = ref(false)
const isSyncing = ref(false) // State untuk sync HPO dari PO
const isHpoSyncing = ref(false) // State khusus untuk HPO sync
const isHdoSyncing = ref(false) // State khusus untuk HDO sync
const syncProgress = ref(0) // Progress sync HPO 0-100
const hpoMapping = ref({}) // Mapping item_code -> HPO number dari Accurate PO
const hpoDetails = ref([]) // Full PO details with quantities
const hdoMapping = ref({}) // Mapping item_code -> HDO number dari Accurate DO
const uniqueTrackingCode = ref(null)
const isLinkCopied = ref(false)
const isSoNumberCopied = ref(false)
const errorMessage = ref(null)

const copySoNumber = () => {
  if (soDetail.value?.number) {
    navigator.clipboard.writeText(soDetail.value.number)
    isSoNumberCopied.value = true
    setTimeout(() => {
      isSoNumberCopied.value = false
    }, 2000)
  }
}

const copiedSku = ref(null)
const copySku = (sku) => {
  if (sku) {
    navigator.clipboard.writeText(sku)
    copiedSku.value = sku
    setTimeout(() => {
      if (copiedSku.value === sku) {
        copiedSku.value = null
      }
    }, 2000)
  }
}

const copiedPartNumber = ref(null)
const copyPartNumber = (code) => {
  if (!code) return
  navigator.clipboard.writeText(code).then(() => {
    copiedPartNumber.value = code
    setTimeout(() => { copiedPartNumber.value = null }, 2000)
  })
}

const copiedRowCode = ref(null)
const copyPurchaseRow = (item) => {
  const text = `${item.code}\t${item.name}\t${item.order_suggestion}`
  navigator.clipboard.writeText(text).then(() => {
    copiedRowCode.value = item.code
    setTimeout(() => { if (copiedRowCode.value === item.code) copiedRowCode.value = null }, 2000)
  })
}

const isAllPurchaseCopied = ref(false)
const copyAllPurchaseRows = () => {
  const rows = itemsToPurchase.value.map(i => `${i.code}\t${i.name}\t${i.order_suggestion}`).join('\n')
  navigator.clipboard.writeText(rows).then(() => {
    isAllPurchaseCopied.value = true
    setTimeout(() => { isAllPurchaseCopied.value = false }, 2000)
  })
}
// Helper: Generate unique code for tracking link
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
const syncMessage = ref('Sinkronisasi data...') // Pesan sync dynamic

const selectedItemCodes = ref([]) 
const isBulkMode = ref(false)    
const selectedItem = ref(null)    
const selectedTargetStatus = ref('') 

// State Toggle
const isPurchaseExpanded = ref(false) 
const expandedDocNo = ref(null)

// --- KONFIGURASI STATUS ---
// Simplified: Pending dan Order ke Principle otomatis dari Accurate
const statusOptions = [
  { value: 'Follow up with our forwarder', label: 'Barang Ready (Ex-Works)', type: 'date', placeholder: 'Ex Work Date', dateLabel: 'Ex Work Date' },
  { value: 'ETA Port JKT', label: 'Sedang Transit (ETA JKT)', type: 'date', placeholder: 'Eta Port Date', dateLabel: 'ETA Port' },
  { value: 'Already in siemens Warehouse', label: 'Tiba di Gudang Dunex', type: 'date', placeholder: 'Date', dateLabel: 'Tiba Dunex' },
  { value: 'Already in Hokiindo Raya', label: 'Tiba di Gudang Hokiindo', type: 'date', placeholder: 'Date', dateLabel: 'Tiba Hokiindo' }
]

const getLocalDate = () => {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - (offset * 60 * 1000))
  return localDate.toISOString().split('T')[0]
}

const formStatus = ref({
  step: '', hpo: '', hdo: '', date: getLocalDate(), notes: '', admin_notes: ''
})

// Auto Reset Logic
watch(selectedTargetStatus, (newVal) => {
  if (newVal === 'Pending Process') {
    formStatus.value.hpo = ''
    formStatus.value.hdo = ''
    formStatus.value.date = getLocalDate()
    formStatus.value.notes = ''
  }
})


const itemSearchQuery = ref('')
const itemStatusFilter = ref('ALL')

const filteredItems = computed(() => {
  if (!soDetail.value || !soDetail.value.items) return []
  return soDetail.value.items.filter(item => {
    // 1. Search filter
    const query = itemSearchQuery.value.trim().toLowerCase()
    if (query) {
      const codeMatch = item.code && item.code.toLowerCase().includes(query)
      const nameMatch = item.name && item.name.toLowerCase().includes(query)
      const noteMatch = item.admin_note && item.admin_note.toLowerCase().includes(query)
      const logisticsNoteMatch = item.logistics_note && item.logistics_note.toLowerCase().includes(query)
      if (!codeMatch && !nameMatch && !noteMatch && !logisticsNoteMatch) return false
    }
    
    // 2. Status filter
    if (itemStatusFilter.value === 'ALL') return true
    
    const statusText = getRowStatus(item).text || ''
    
    if (itemStatusFilter.value === 'HOLD') {
      return item.logistics_status === 'Hold by Customer'
    }
    if (itemStatusFilter.value === 'NEED_ORDER') {
      return statusText.includes('PERLU DIPESAN') || statusText.includes('KURANG DIPESAN')
    }
    if (itemStatusFilter.value === 'ORDERED') {
      return statusText === 'SUDAH DIPESAN' || statusText === 'KELEBIHAN DIPESAN'
    }
    if (itemStatusFilter.value === 'READY') {
      return statusText === 'MENUNGGU PENGIRIMAN'
    }
    if (itemStatusFilter.value === 'PARTIAL') {
      return statusText.includes('DIKIRIM SEBAGIAN')
    }
    if (itemStatusFilter.value === 'SHIPPED') {
      return statusText === 'PRODUK SUDAH DIKIRIM'
    }
    
    return true
  })
})

const isAllSelected = computed(() => {
    if (filteredItems.value.length === 0) return false
    const activeItems = filteredItems.value.filter(i => !i.is_fully_shipped)
    return activeItems.length > 0 && activeItems.every(i => selectedItemCodes.value.includes(i.code))
})

// --- COMPUTED: PURCHASING (Saran Order) ---
const itemsToPurchase = computed(() => {
    if (!soDetail.value || !soDetail.value.items) return []
    return soDetail.value.items.map(item => {
        const statusText = getRowStatus(item).text || '';
        if (statusText.startsWith('PERLU DIPESAN') || statusText.startsWith('KURANG DIPESAN')) {
            const hpoEntries = getHpoEntries(item);
            let finalSuggestion = item.qty_to_order;
            if (hpoEntries.length > 0) {
                const totalPo = hpoEntries.reduce((sum, hpo) => sum + (hpo.quantity || 0), 0);
                finalSuggestion = Math.max(0, item.qty_to_order - totalPo);
            }
            return { ...item, order_suggestion: finalSuggestion };
        }
        return null;
    }).filter(item => item !== null)
})

// --- COMPUTED: RIWAYAT DOKUMEN ---
// groupedShipments logic has been moved down below getHpoEntries
// --- HELPER UNTUK PARSING NOTE ---
const parseStockFromNote = (note) => {
    if (!note) return { qty: 0, isReady: false, hasInfo: false };
    const lower = note.toLowerCase();
    
    // No stock / kosong / indent
    if (lower.includes('no stock') || lower.includes('non stock') || lower.includes('kosong') || lower.includes('indent')) {
        return { qty: 0, isReady: false, hasInfo: true };
    }
    
    // Cek apakah ada angka setelah stock/stok
    const match = lower.match(/(?:stock|stok|sisa)\s*[:.]?\s*(\d+)/);
    if (match) {
        // Ada angka = stock sebagian
        return { qty: parseInt(match[1]), isReady: false, hasInfo: true };
    }
    
    // Jika ada kata stock/stok/ready tapi TIDAK ada angka = ready stock
    if (lower.includes('stock') || lower.includes('stok') || lower.includes('ready')) {
        return { qty: 999999, isReady: true, hasInfo: true }; 
    }
    
    
    return { qty: 0, isReady: false, hasInfo: false};
}

const getNoteType = (note) => {
    if (!note) return 'unknown'
    const n = note.toLowerCase()
    if (n.includes('no stock')) return 'no_stock'
    if (n.includes('stock')) return 'stock' // must check after no stock
    return 'unknown'
}

const formatDateSimple = (dateStr) => {
    if (!dateStr) return '';
    if (String(dateStr).toLowerCase().includes('waiting')) return 'Waiting for confirmation';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return String(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

const getVisualStatus = (shipment) => {
    if (!shipment) return 'Pending Process'
    if (shipment.current_status === 'Hold by Customer') return 'Hold by Customer'
    if (shipment.hokiindo_date) return 'Already in Hokiindo Raya'
    if (shipment.dunex_date) return 'Already in siemens Warehouse'
    if (shipment.eta_date) return 'ETA Port JKT'
    return shipment.current_status || 'Follow up with our forwarder'
}

const getVisualStatusDate = (shipment) => {
    if (!shipment) return ''
    const status = getVisualStatus(shipment)
    if (status === 'Already in Hokiindo Raya') return formatDateSimple(shipment.hokiindo_date)
    if (status === 'Already in siemens Warehouse') return formatDateSimple(shipment.dunex_date)
    if (status === 'ETA Port JKT') return formatDateSimple(shipment.eta_date)
    if (status === 'Follow up with our forwarder') return formatDateSimple(shipment.exwork_date)
    return ''
}

import * as XLSX from 'xlsx'

const exportToExcel = () => {
    if (itemsToPurchase.value.length === 0) return alert("Tidak ada barang yang perlu dipesan.");
    
    const hsoNumber = soDetail.value?.number || '-';
    const customerName = soDetail.value?.client || '-';

    const dataToExport = itemsToPurchase.value.map(item => ({
        "No HSO": hsoNumber,
        "Nama PT": customerName,
        "Kode Produk": item.code,
        "Nama Produk": item.name,
        "Total Order (SO)": item.qty_order,
        "Stock Gudang": item.parsed_stock_qty || 0,
        "SARAN ORDER (QTY)": item.order_suggestion,
        "Catatan Admin": item.admin_note || '-',
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    
    // Auto-size columns
    const colWidths = [
      { wch: 15 }, // No HSO
      { wch: 30 }, // Nama PT
      { wch: 20 }, // Kode Produk
      { wch: 50 }, // Nama Produk
      { wch: 15 }, // Total Order
      { wch: 15 }, // Stock Gudang
      { wch: 20 }, // SARAN ORDER
      { wch: 40 }, // Catatan
    ];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Saran Order");
    
    const safeSoNumber = (soDetail.value.number || 'SO').replace(/[\/\\]/g, '_');
    XLSX.writeFile(wb, `ORDER_LIST_${safeSoNumber}.xlsx`);
}

const exportReminderExcel = () => {
    if (!soDetail.value || !soDetail.value.items) return;
    
    const reminderItems = [];
    
    soDetail.value.items.forEach(item => {
        // Skip items that do not need to be ordered (stock is ready / Menunggu Pengiriman)
        if (!item.qty_to_order || item.qty_to_order <= 0) return;
        
        const hpos = getHpoEntries(item);
        if (hpos.length === 0) {
            // If there are no HPOs from Accurate, look for a manual shipment record in DB
            const manualShipment = shipmentList.value.find(s => s.item_code === item.code && !s.hpo_number);
            if (manualShipment) {
                const status = getVisualStatus(manualShipment);
                if (['Follow up with our forwarder', 'ETA Port JKT', 'Already in siemens Warehouse'].includes(status)) {
                    reminderItems.push({
                        hpoNumber: '-',
                        itemCode: item.code,
                        itemName: item.name,
                        qty: item.qty_order,
                        status: status === 'Follow up with our forwarder' ? 'Ex-Works' : status === 'ETA Port JKT' ? 'ETA JKT' : 'Tiba Dunex',
                        exworkDate: manualShipment.exwork_date || '-',
                        etaDate: manualShipment.eta_date || '-',
                        dunexDate: manualShipment.dunex_date || '-',
                        note: manualShipment.admin_notes || '-'
                    });
                }
            }
        } else {
            hpos.forEach(hpo => {
                const shipment = getHpoShipment(item, hpo.poNumber);
                const status = getVisualStatus(shipment);
                if (['Follow up with our forwarder', 'ETA Port JKT', 'Already in siemens Warehouse'].includes(status)) {
                    reminderItems.push({
                        hpoNumber: hpo.poNumber,
                        itemCode: item.code,
                        itemName: item.name,
                        qty: hpo.quantity || item.qty_order,
                        status: status === 'Follow up with our forwarder' ? 'Ex-Works' : status === 'ETA Port JKT' ? 'ETA JKT' : 'Tiba Dunex',
                        exworkDate: shipment.exwork_date || '-',
                        etaDate: shipment.eta_date || '-',
                        dunexDate: shipment.dunex_date || '-',
                        note: shipment.admin_notes || '-'
                    });
                }
            });
        }
    });

    if (reminderItems.length === 0) {
        alert("Tidak ada item yang berstatus Ex-Works, ETA JKT, atau Tiba Dunex untuk HSO ini.");
        return;
    }

    const hsoNumber = soDetail.value?.number || '-';
    const customerName = soDetail.value?.client || '-';

    const dataToExport = reminderItems.map(item => ({
        "No HSO": hsoNumber,
        "Nama Customer": customerName,
        "No HPO (Purchase Order)": item.hpoNumber,
        "Kode Barang (MLFB)": item.itemCode,
        "Nama Barang": item.itemName,
        "Qty": item.qty,
        "Status Logistik": item.status,
        "Tanggal Ex-Works": item.exworkDate,
        "Tanggal ETA JKT": item.etaDate,
        "Tanggal Tiba Dunex": item.dunexDate,
        "Catatan": item.note
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);

    // Auto-size columns
    const colWidths = [
        { wch: 15 }, // No HSO
        { wch: 30 }, // Nama Customer
        { wch: 22 }, // No HPO
        { wch: 22 }, // Kode Barang
        { wch: 45 }, // Nama Barang
        { wch: 8 },  // Qty
        { wch: 18 }, // Status Logistik
        { wch: 18 }, // Tanggal Ex-Works
        { wch: 18 }, // Tanggal ETA JKT
        { wch: 18 }, // Tanggal Tiba Dunex
        { wch: 35 }  // Catatan
    ];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reminder PO");

    const safeSoNumber = (soDetail.value.number || 'SO').replace(/[\/\\]/g, '_');
    XLSX.writeFile(wb, `REMINDER_PO_${safeSoNumber}.xlsx`);
}

// --- BACKGROUND HPO FETCH ---
const fetchHpoInBackground = async (soNumber) => {
  try {
    isSyncing.value = true
    isHpoSyncing.value = true
    syncMessage.value = 'Sinkronisasi status PO dari Accurate...'
    syncProgress.value = 0
    console.log(`Background: Fetching HPO for ${soNumber}...`)
    
    // Phase 1: Invoke Edge Function to query Accurate API and update/upsert POs into Supabase DB in real-time
    syncProgress.value = 20
    try {
      await supabase.functions.invoke('accurate-sync-hpo', {
        body: { 
          soId: resolvedSoId.value, 
          soNumber: soNumber, 
          items: soDetail.value?.items?.map(i => i.code) || [] 
        }
      })
    } catch (err) {
      console.warn('Real-time HPO sync via Edge Function failed, using existing DB data:', err)
    }

    // Phase 2: Query the updated database using paginated search
    syncProgress.value = 40
    let dbItems = []
    let page = 0
    const pageSize = 1000
    let hasMore = true
    let poError = null

    while (hasMore) {
      const { data, error } = await supabase
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

      if (error) {
        poError = error
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
    
    syncProgress.value = 60
    
    if (!poError && poData?.d) {
      const mapping = {}
      const items = poData.d
      const totalItems = items.length
      
      items.forEach((item, idx) => {
        if (item.itemCode && item.poNumber) {
          if (mapping[item.itemCode] && !mapping[item.itemCode].includes(item.poNumber)) {
            mapping[item.itemCode] += `, ${item.poNumber}`
          } else if (!mapping[item.itemCode]) {
            mapping[item.itemCode] = item.poNumber
          }
        }
        syncProgress.value = 60 + Math.round((idx + 1) / Math.max(totalItems, 1) * 35)
      })
      
      hpoMapping.value = mapping
      hpoDetails.value = items
      console.log(`Background: Found ${Object.keys(mapping).length} HPO mappings`)

      // Database healing: Auto-create missing shipment records for items that have POs but no shipment rows in the DB
      if (soDetail.value && soDetail.value.items) {
        const missingShipments = []
        soDetail.value.items.forEach(item => {
          const hasHpo = mapping[item.code]
          if (hasHpo) {
            const hasShipment = shipmentList.value.some(s => s.item_code === item.code)
            if (!hasShipment) {
              const hpos = hasHpo.split(',').map(x => x.trim())
              hpos.forEach(hpo => {
                missingShipments.push({
                  so_id: String(soDetail.value.id),
                  item_code: item.code,
                  hpo_number: hpo,
                  current_status: 'Follow up with our forwarder',
                  status_date: new Date().toISOString().split('T')[0],
                  shipment_type: 'IMPORT_PO'
                })
              })
            }
          }
        })
        
        if (missingShipments.length > 0) {
          console.log(`Healing: Creating ${missingShipments.length} missing shipment records...`)
          const { data: newShips, error: insertErr } = await supabase
            .from('shipments')
            .insert(missingShipments)
            .select()
            
          if (!insertErr && newShips) {
            shipmentList.value = [...shipmentList.value, ...newShips]
            console.log('Successfully healed missing shipments')
          } else if (insertErr) {
            console.warn('Healing error:', insertErr)
          }
        }
      }
      }
      
      syncProgress.value = 100
  } catch (err) {
    console.warn('HPO fetch error:', err)
  } finally {
    isHpoSyncing.value = false
    isSyncing.value = false
    syncProgress.value = 0
  }
}

// --- BACKGROUND HDO FETCH ---
const fetchHdoInBackground = async (doNumbers) => {
  if (!doNumbers || doNumbers.length === 0) return

  try {
    isSyncing.value = true // Reuse sync indicator
    isHdoSyncing.value = true
    syncMessage.value = 'Sinkronisasi No. Resi dari Accurate...'
    syncProgress.value = 0 // Reset for HDO phase
    console.log(`Background: Fetching HDO Details for ${doNumbers.join(', ')}...`)
    
    // Phase 1: Request
    syncProgress.value = 30
    
    const { data: doData, error: doError } = await supabase.functions.invoke('accurate-sync-hdo', {
      body: { doNumbers }
    })
    
    if (!doError && doData?.d) {
      const mapping = {}
      const items = doData.d
      
      // Phase 2: Processing
      syncProgress.value = 70
      
      const newMapping = {}
      items.forEach(mapItem => {
        // mapItem structure: { itemCode, doNumber, doDate, note }
        const noteType = getNoteType(mapItem.note)
        const key = `${mapItem.itemCode}_${noteType}`
        newMapping[key] = mapItem.doNumber
      })
      
      hdoMapping.value = { ...hdoMapping.value, ...newMapping }
      console.log(`Background: Found ${Object.keys(newMapping).length} HDO mappings`)

      // Phase 3: Merge DO details into shipments
      if (doData.doDetails && Array.isArray(doData.doDetails)) {
        console.log('DO Details received:', doData.doDetails)
        // Update soDetail.shipments with item details from Accurate
        if (soDetail.value && soDetail.value.shipments) {
          const updatedShipments = soDetail.value.shipments.map(shipment => {
            const doDetail = doData.doDetails.find(d => d.number === shipment.no)
            if (doDetail) {
              console.log(`Merging items for ${shipment.no}:`, doDetail.items)
              return {
                ...shipment,
                items: doDetail.items,
                source: 'ACCURATE' // Mark as from Accurate
              }
            }
            return shipment
          })
          
          // Force reactivity update
          soDetail.value = {
            ...soDetail.value,
            shipments: updatedShipments
          }
          
          console.log('Updated shipments:', soDetail.value.shipments)
        }
      }
    }

    syncProgress.value = 100

  } catch (err) {
    console.warn('HDO fetch error:', err)
  } finally {
    isHdoSyncing.value = false
    isSyncing.value = false
    syncProgress.value = 0
  }
}

// --- EXCEL STATUS IMPORT LOGIC ---
const excelFileInput = ref(null)
const isExcelParsing = ref(false)
const isExcelModalOpen = ref(false)
const excelRowsToUpdate = ref([]) // Matched items to update
const excelProgressCount = ref(0)

const triggerExcelImport = () => {
  if (excelFileInput.value) {
    excelFileInput.value.click()
  }
}

const handleExcelImport = (e) => {
  const file = e.target.files[0]
  if (!file) return
  
  isExcelParsing.value = true
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
      console.log('[ExcelImport] Headers detected:', { hpoCol, itemCol, exworkCol, etaCol, deliveryCol, statusCol })
      console.log('[ExcelImport] All raw headers:', headers)
      
      if (!hpoCol || !itemCol) {
        alert("Kolom HPO Number ('Customer PO') dan Product SKU ('MLFB') tidak terdeteksi otomatis. Pastikan nama header kolom sesuai.")
        return
      }
      
      // Date parser helper
      // Date parser helper
      const parseExcelDateLocal = (val) => {
        if (val === undefined || val === null || val === '') return null
        
        // Detect "Waiting for confirmation" text in date column
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
        
        // 1. Try to match standard formats like DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY
        const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
        if (dmy) {
          let y = dmy[3]
          if (y.length === 2) y = '20' + y
          const m = dmy[2].padStart(2, '0')
          const d = dmy[1].padStart(2, '0')
          return `${y}-${m}-${d}`
        }
        
        // 2. Try to match English text date like "23 Jul 26" or "08 July 2026"
        const monthsMap = {
          jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
          jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
        }
        const textMatch = str.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{2,4})/i)
        if (textMatch) {
          const d = textMatch[1].padStart(2, '0')
          const mKey = textMatch[2].toLowerCase()
          const m = monthsMap[mKey]
          let y = textMatch[3]
          if (y.length === 2) y = '20' + y
          return `${y}-${m}-${d}`
        }
        
        // 3. Try to match YYYY-MM-DD
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
      
      // Status mapper helper
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
      
      // Match helpers for robust comparisons
      const cleanString = (val) => {
        if (!val) return ''
        return String(val).trim().toLowerCase().replace(/\s/g, '')
      }

      const isHpoMatch = (dbHpo, excelHpo) => {
        const d = cleanString(dbHpo)
        const e = cleanString(excelHpo)
        if (!d || !e) return false
        if (d === e) return true
        
        // Base match (strip revisions like R1, R2, REV1, etc.)
        const dBase = d.replace(/(r\d+|rev\d+|v\d+)$/, '')
        const eBase = e.replace(/(r\d+|rev\d+|v\d+)$/, '')
        if (dBase === eBase) return true
        
        // Substring match
        if (d.includes(e) || e.includes(d)) return true
        return false
      }

      const isItemMatch = (dbItem, excelItem) => {
        const d = cleanString(dbItem)
        const e = cleanString(excelItem)
        if (!d || !e) return false
        return d === e
      }

      // Match against the items of this Sales Order
      const matches = []
      const seenKeys = new Set()
      
      if (soDetail.value && soDetail.value.items) {
        soDetail.value.items.forEach(item => {
          // Get the mapped HPO number for this item in the SO (from Accurate)
          const hpoVal = hpoMapping.value[item.code]
          if (!hpoVal) return // Skip if no HPO linked to this item
          
          // Split HPO values in case there are multiple (e.g. "HPO/26/05/049, HPO/26/05/050")
          const hpos = hpoVal.split(',').map(x => x.trim())
          
          hpos.forEach(hpo => {
            const key = `${item.code.toLowerCase()}||${hpo.toLowerCase()}`
            if (seenKeys.has(key)) return
            
            // Find a matching row in the Excel sheet
            const matchingExcelRow = rows.find(row => {
              const excelHpo = row[hpoCol] ? String(row[hpoCol]).trim() : ''
              const excelItem = row[itemCol] ? String(row[itemCol]).trim() : ''
              
              return isItemMatch(item.code, excelItem) && isHpoMatch(hpo, excelHpo)
            })
            
            if (matchingExcelRow) {
              seenKeys.add(key)
              const excelExwork = exworkCol ? parseExcelDateLocal(matchingExcelRow[exworkCol]) : null
              const excelEta = etaCol ? parseExcelDateLocal(matchingExcelRow[etaCol]) : null
              let excelDelivery = deliveryCol ? parseExcelDateLocal(matchingExcelRow[deliveryCol]) : null
              const excelStatus = statusCol ? mapStatusLocal(matchingExcelRow[statusCol]) : ''

              // Check if we already have an existing shipment record in the database for this item and HPO
              const dbShipments = shipmentList.value.filter(s => 
                isItemMatch(s.item_code, item.code) && 
                (s.hpo_number ? isHpoMatch(s.hpo_number, hpo) : true)
              )
              
              const hasDbShipment = dbShipments.length > 0
              const primaryShipment = hasDbShipment ? dbShipments[0] : null

              // Only default to today's date if:
              // 1. Excel delivery date is empty, AND
              // 2. Status is "arrived" (dunex or hokiindo), AND
              // 3. The DB does NOT already have a delivery date stored
              if (!excelDelivery && (excelStatus === 'Already in siemens Warehouse' || excelStatus === 'Already in Hokiindo Raya')) {
                const dbAlreadyHasDelivery = primaryShipment && (primaryShipment.dunex_date || primaryShipment.hokiindo_date)
                if (!dbAlreadyHasDelivery) {
                  excelDelivery = getLocalDate()
                }
              }
              
              matches.push({
                hpoNumber: hpo,
                itemCode: item.code,
                excelExwork,
                excelEta,
                excelDelivery,
                excelStatus,
                dbStatus: primaryShipment ? (primaryShipment.current_status || '') : '(Akan Dibuat)',
                dbExwork: primaryShipment ? (primaryShipment.exwork_date || '') : '-',
                dbEta: primaryShipment ? (primaryShipment.eta_date || '') : '-',
                dbDelivery: primaryShipment ? (primaryShipment.hokiindo_date || primaryShipment.dunex_date || '') : '-',
                shipmentIds: dbShipments.map(s => s.id),
                isVirtual: !hasDbShipment
              })
            }
          })
        })
      }
      
      if (matches.length === 0) {
        alert("Tidak ada item atau nomor HPO yang cocok dengan data pelacakan di HSO ini.")
        return
      }
      
      excelRowsToUpdate.value = matches
      isExcelModalOpen.value = true
    } catch (err) {
      console.error(err)
      alert("Gagal membaca file Excel.")
    } finally {
      isExcelParsing.value = false
      if (excelFileInput.value) excelFileInput.value.value = ''
    }
  }
  reader.readAsArrayBuffer(file)
}

const applyExcelUpdates = async () => {
  isExcelParsing.value = true
  excelProgressCount.value = 0
  let successCount = 0
  let errorCount = 0
  
  for (const item of excelRowsToUpdate.value) {
    try {
      if (item.isVirtual) {
        // Create new shipment record in database
        const insertPayload = {
          so_id: String(soDetail.value.id),
          item_code: item.itemCode,
          hpo_number: item.hpoNumber,
          shipment_type: 'IMPORT_PO'
        }
        if (item.excelStatus) {
          insertPayload.current_status = item.excelStatus
          insertPayload.status_date = new Date().toISOString().split('T')[0]
        } else {
          insertPayload.current_status = 'Follow up with our forwarder'
          insertPayload.status_date = new Date().toISOString().split('T')[0]
        }
        if (item.excelExwork === '__waiting__') insertPayload.exwork_date = 'Waiting for confirmation'
        else if (item.excelExwork) insertPayload.exwork_date = item.excelExwork
        if (item.excelEta) insertPayload.eta_date = item.excelEta
        
        // Map excelDelivery based on status
        if (item.excelDelivery) {
          if (item.excelStatus === 'Already in Hokiindo Raya') {
            insertPayload.hokiindo_date = item.excelDelivery
          } else {
            insertPayload.dunex_date = item.excelDelivery
          }
        }
        
        const { error } = await supabase
          .from('shipments')
          .insert(insertPayload)
          
        if (error) throw error
        successCount++
      } else {
        // Update existing shipment record in database
        const updateData = {}
        if (item.hpoNumber) {
          updateData.hpo_number = item.hpoNumber
        }
        if (item.excelStatus) {
          updateData.current_status = item.excelStatus
          updateData.status_date = new Date().toISOString().split('T')[0]
        }
        if (item.excelExwork === '__waiting__') updateData.exwork_date = 'Waiting for confirmation'
        else if (item.excelExwork) updateData.exwork_date = item.excelExwork
        if (item.excelEta) updateData.eta_date = item.excelEta
        
        // Map excelDelivery based on status
        if (item.excelDelivery) {
          if (item.excelStatus === 'Already in Hokiindo Raya') {
            updateData.hokiindo_date = item.excelDelivery
          } else {
            updateData.dunex_date = item.excelDelivery
          }
        }
        
        updateData.updated_at = new Date().toISOString()
        
        const { error } = await supabase
          .from('shipments')
          .update(updateData)
          .in('id', item.shipmentIds)
          
        if (error) throw error
        successCount += item.shipmentIds.length
      }
    } catch (err) {
      console.error(err)
      errorCount++
    } finally {
      excelProgressCount.value++
    }
  }
  
  isExcelParsing.value = false
  isExcelModalOpen.value = false
  
  alert(`Berhasil memproses pembaruan ${successCount} data pelacakan di database!`)
  
  // Reload SO detail and shipments to reflect changes
  fetchDetail()
}

// --- 2. DATA FETCHING ---
const fetchDetail = async (skipHpoSync = false, showLoader = true) => {
  if (showLoader) {
    isLoading.value = true
    loadingProgress.value = 0
    loadingMessage.value = 'Menghubungkan ke Accurate...'
  }
  
  try {
    let targetId = resolvedSoId.value
    
    if (!targetId) {
      const isNumeric = /^\d+$/.test(routeId)
      if (isNumeric) {
        targetId = parseInt(routeId)
      } else {
        // Ini adalah nomor HSO (misal: HSO-25-01-001)
        // Ubah kembali "-" menjadi "/"
        const targetNumber = routeId.replace(/-/g, '/')
        loadingMessage.value = `Mencari ID untuk ${targetNumber}...`
        
        const { data: listData, error: listError } = await supabase.functions.invoke('accurate-list-so', {
          body: { 
            filterNumber: targetNumber,
            fields: 'id,number'
          }
        })
        
        if (listError) throw listError
        
        const matchedSo = listData?.d?.find(so => so.number === targetNumber)
        if (!matchedSo) {
          throw new Error(`Sales Order dengan nomor ${targetNumber} tidak ditemukan di Accurate.`)
        }
        targetId = matchedSo.id
      }
      resolvedSoId.value = targetId
    }

    loadingProgress.value = 20
    loadingMessage.value = 'Mengambil data HSO...'
    
    const { data: accData, error: accError } = await supabase.functions.invoke('accurate-detail-so', {
      body: { id: targetId, type: 'sales-order' }
    })
    
    loadingProgress.value = 50
    
    // Check specific error structure from Edge Function
    if (accError) throw accError
    
    if (!accData || !accData.s) {
        throw new Error(accData?.message || "Gagal mengambil data dari Accurate (Response Invalid).")
    }

    loadingProgress.value = 70
    loadingMessage.value = 'Memuat data pengiriman...'

    const { data: shipData } = await supabase.from('shipments').select('*').eq('so_id', String(resolvedSoId.value))
    shipmentList.value = shipData || []

    loadingProgress.value = 85
    loadingMessage.value = 'Memuat aktivitas...'

    // Fetch activity logs
    const shipmentIds = (shipData || []).map(s => s.id).filter(Boolean)
    if (shipmentIds.length > 0) {
      const { data: logsData } = await supabase
        .from('shipment_logs')
        .select('*')
        .in('shipment_id', shipmentIds)
        .order('created_at', { ascending: false })
        .limit(50)
      activityLogs.value = logsData || []
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    currentUser.value = user

    const d = accData.d
    const history = d.processHistory || []
    const rawItems = d.detailItem || []
    const sortedItems = rawItems.sort((a, b) => (a.seq || 0) - (b.seq || 0))

    const linkData = await supabase.from('so_tracking_links').select('unique_code').eq('so_id', String(resolvedSoId.value)).maybeSingle()
    uniqueTrackingCode.value = linkData.data?.unique_code || null

    soDetail.value = {
      id: d.id,
      number: d.number,
      client: d.customer?.name || '-',
      po_number: d.poNumber || '-',
      date: d.transDateView || d.transDate,
      total_amount: d.totalAmount,
      sub_total: d.subTotal,
      tax_amount: d.tax1Amount,
      status_global: d.statusName,
      to_address: d.toAddress,
      notes: d.description,
      items: sortedItems.map(item => {
        const code = item.item?.no || '-'
        const seq = item.seq || 0
        // Find by code AND sequence to avoid split row overlap
        const myShipments = shipmentList.value.filter(s => s.item_code === code && (s.item_seq === seq || s.item_seq == null))
        
        // Sort myShipments to prioritize shipments with a non-null HPO number, then by updated_at descending
        const sortedMyShipments = [...myShipments].sort((a, b) => {
          const aHasHpo = a.hpo_number ? 1 : 0
          const bHasHpo = b.hpo_number ? 1 : 0
          if (aHasHpo !== bHasHpo) return bHasHpo - aHasHpo // non-null HPO first
          
          const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0
          const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0
          return bTime - aTime // latest updated first
        })
        const myShipment = sortedMyShipments[0] || {}
        
        const qty_order = item.quantity || 0
        const qty_shipped = item.shipQuantity || 0
        const qty_remaining = qty_order - qty_shipped 
        
        // --- LOGIC PERHITUNGAN STOCK & TO ORDER (REVISI) ---
        const note = item.detailNotes || ''
        const stockInfo = parseStockFromNote(note)
        
        let qty_stock_admin = 0;
        let qty_to_order = 0;
        let isReadyAdmin = stockInfo.isReady;

        if (stockInfo.isReady) {
            // JIKA READY: Stock dianggap PENUH (sesuai Order), To Order = 0
            qty_stock_admin = qty_order;
            qty_to_order = 0;
        } else if (stockInfo.hasInfo) {
            // JIKA ADA ANGKA: Stock sesuai angka, To Order = Order - Stock
            qty_stock_admin = stockInfo.qty;
            qty_to_order = Math.max(0, qty_order - qty_stock_admin);
        } else {
            // JIKA TIDAK ADA INFO: Default Stock 0, To Order = Full Order
            qty_stock_admin = 0;
            qty_to_order = qty_order;
        }

        return {
          code: code,
          seq: seq,
          name: item.item?.name || item.detailName,
          unit: item.itemUnit?.name || 'Pcs',
          
          qty_order: qty_order,
          qty_shipped: qty_shipped,
          qty_remaining: qty_remaining,
          
          parsed_stock_qty: isReadyAdmin ? qty_stock_admin : qty_stock_admin, // Tampilkan Angka
          qty_to_order: qty_to_order, 
          
          admin_note: note,
          parsed_has_info: stockInfo.hasInfo,
          order_suggestion: qty_to_order,

          is_fully_shipped: qty_remaining <= 0,
          
          shipments_data: myShipments, // Array of all shipments for this item (multi-PO support)
          
          logistics_status: myShipment.current_status || 'Pending Process', 
          logistics_hpo: myShipment.hpo_number || null,
          logistics_date: myShipment.status_date || myShipment.updated_at || null, 
          logistics_id: myShipment.id || null,
          logistics_hdo: myShipment.hpo_number && ['On Delivery','Completed'].includes(myShipment.current_status) ? myShipment.hpo_number : null,
          logistics_note: myShipment.admin_notes || null,
          
          // Logistics date fields
          exwork_date: myShipment.exwork_date || null,
          eta_date: myShipment.eta_date || null,
          dunex_date: myShipment.dunex_date || null,
          hokiindo_date: myShipment.hokiindo_date || null,
          ready_date: myShipment.ready_date || null
        }
      }).map(item => {
        // Debug log for Hold by Customer items
        if (item.logistics_status === 'Hold by Customer') {
          console.log('🔍 Found Hold item:', item.code, 'Status:', item.logistics_status, 'Notes:', item.logistics_note)
        }
        return item
      }),
      shipments: history.filter(h => h.historyType === 'DO').map(h => ({ no: h.historyNumber, date: h.historyDate, status: h.approvalStatus })),
      invoices: history.filter(h => h.historyType === 'SI').map(h => ({ no: h.historyNumber, date: h.historyDate, status: h.approvalStatus }))
    }
  } catch (err) {
    console.error("Fetch Error:", err)
    errorMessage.value = err.message || "Terjadi kesalahan tidak diketahui."
    // router.push('/sales-orders')
  } finally {
    loadingProgress.value = 100
    isLoading.value = false
    
    // Trigger HPO sync first, then HDO sync if applicable
    // Skip if explicitly requested (e.g., after status update)
    if (!skipHpoSync && soDetail.value?.number) {
      // Start HPO Sync
      fetchHpoInBackground(soDetail.value.number).then(() => {
         // After HPO sync finishes, check for HDOs
         if (soDetail.value?.shipments) {
            // Check processHistory for DOs
            // soDetail.value.shipments is already filtered for DOs
            const doList = soDetail.value.shipments.map(s => s.no)
            if (doList.length > 0) {
               fetchHdoInBackground(doList)
            }
         }
      })
    } else if (skipHpoSync) {
      console.log('⏭️ Skipping HPO sync (status update only)')
    }
    
    // Auto scroll if highlight param exists
    if (route.query.highlight) {
        setTimeout(() => {
            const el = document.getElementById(`item-${route.query.highlight}`)
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
        }, 500)
    }
  }
}

// --- REALTIME STATE ---
const isRealtimeConnected = ref(false)
let realtimeChannel = null

onMounted(() => {
  fetchDetail()

  // --- Supabase Realtime for PO changes affecting this SO ---
  realtimeChannel = supabase
    .channel(`so-po-updates`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'accurate_purchase_order_items'
      },
      (payload) => {
        const item = payload.new || payload.old
        // Check if the updated PO item belongs to this Sales Order
        if (item && soDetail.value?.number && item.hso_number === soDetail.value.number) {
          console.log('[Realtime] Related PO updated, reloading HPO details...', payload)
          // Re-fetch HPO mapping to update the UI
          fetchHpoInBackground(soDetail.value.number)
        }
      }
    )
    .subscribe((status) => {
      console.log('[Realtime SO] Channel status:', status)
      isRealtimeConnected.value = status === 'SUBSCRIBED'
    })
})


onUnmounted(() => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
})

const formatCurrency = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0)
const fulfillmentPercentage = (items) => {
  if (!items || items.length === 0) return 0
  const total = items.reduce((acc, i) => acc + i.qty_order, 0)
  const shipped = items.reduce((acc, i) => acc + i.qty_shipped, 0)
  return total === 0 ? 0 : Math.round((shipped / total) * 100)
}

const getRowStatus = (item) => {
  // PRIORITAS TERTINGGI: Jika item di-hold oleh customer
  if (item.logistics_status === 'Hold by Customer') {
    return { text: 'HOLD BY CUSTOMER', class: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800', icon: Clock }
  }
  
  // Jika fully shipped (semua terkirim dan dikonfirmasi selesai)
  if (item.is_fully_shipped) return { text: 'PRODUK SUDAH DIKIRIM', class: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800', icon: CheckCircle2 }
  
  // Jika sudah dikirim semua (tidak ada sisa tapi belum dikonfirmasi fully_shipped)
  if (item.qty_shipped > 0 && item.qty_remaining === 0) {
    return { text: 'PRODUK SUDAH DIKIRIM', class: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800', icon: CheckCircle2 }
  }
  
  // Cek HPO dari Accurate atau dari DB
  const hpoEntries = getHpoEntries(item)
  const hasHpoInDb = item.logistics_hpo && item.logistics_hpo.trim().length > 0

  // Jika belum/kurang dipesan (Prioritas di atas pengiriman sebagian agar masuk logika order)
  if (item.qty_to_order > 0) {
    if (hpoEntries.length > 0) {
      const totalPo = hpoEntries.reduce((sum, hpo) => sum + (hpo.quantity || 0), 0)
      if (totalPo < item.qty_to_order) {
        const shortage = item.qty_to_order - totalPo
        return { text: `KURANG DIPESAN (${shortage} ${item.unit})`, class: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800', icon: AlertTriangle }
      }
    } else if (!hasHpoInDb) {
      return { text: `PERLU DIPESAN (${item.qty_to_order} ${item.unit})`, class: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800', icon: AlertCircle }
    }
  }

  // Jika sudah ada pengiriman sebagian (masih ada sisa), status = DIKIRIM SEBAGIAN
  if (item.qty_shipped > 0 && item.qty_remaining > 0) {
    return { text: `DIKIRIM SEBAGIAN (SISA ${item.qty_remaining} ${item.unit})`, class: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800', icon: Truck }
  }
  
  // Jika ada HPO dari Accurate (dan sudah terpenuhi penuh)
  if (hpoEntries.length > 0) {
    const totalPo = hpoEntries.reduce((sum, hpo) => sum + (hpo.quantity || 0), 0)
    if (totalPo > item.qty_to_order && item.qty_to_order > 0) {
      return { text: 'KELEBIHAN DIPESAN', class: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800', icon: AlertTriangle }
    }
    return { text: 'SUDAH DIPESAN', class: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800', icon: CheckCircle2 }
  }
  
  // Jika dari DB (manual input lama yang tidak terbaca array)
  if (hasHpoInDb) {
    return { text: 'SUDAH DIPESAN', class: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800', icon: CheckCircle2 }
  }
  
  // Jika stock ready tapi belum ada pengiriman
  if (item.qty_to_order === 0 && item.qty_shipped === 0) {
    return { text: 'MENUNGGU PENGIRIMAN', class: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-800', icon: Package }
  }
  
  // Default
  return { text: 'MENUNGGU', class: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700', icon: Hourglass }
}

// Helper: Hitung berapa hari sejak tanggal order
const getDaysSinceOrder = () => {
  if (!soDetail.value?.date) return 0
  const orderDate = new Date(soDetail.value.date.split('/').reverse().join('-'))
  const today = new Date()
  const diffTime = today.getTime() - orderDate.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

// Helper: Get HDO number safely considering note type
const getHdoNumber = (item) => {
  const noteType = getNoteType(item.admin_note)
  const exactKey = `${item.code}_${noteType}`
  if (hdoMapping.value[exactKey]) return hdoMapping.value[exactKey]
  
  if (hdoMapping.value[`${item.code}_unknown`]) return hdoMapping.value[`${item.code}_unknown`]
  
  return item.logistics_hdo
}

// Helper: Get quantity shipped in HDO for specific item
const getHdoQty = (item) => {
  const hdoNumber = getHdoNumber(item)
  if (!hdoNumber || !soDetail.value?.shipments) return null
  
  // Find the shipment/DO that matches this HDO number
  const shipment = soDetail.value.shipments.find(s => s.no === hdoNumber)
  if (!shipment || !shipment.items) return null
  
  // Find the item in this shipment
  const shipmentItem = shipment.items.find(i => i.code === item.code)
  return shipmentItem ? shipmentItem.qty_shipped : null
}

// Helper: Get all HPO entries for specific item (can have multiple POs with different notes)
const getHpoEntries = (item) => {
  if (!hpoDetails.value || hpoDetails.value.length === 0) return []
  
  // Jika baris ini murni stok penuh, tidak mungkin ada HPO
  if (getNoteType(item.admin_note) === 'stock' && item.qty_to_order === 0) return []
  
  // Find ALL PO items that match this item code
  const poItems = hpoDetails.value.filter(p => p.itemCode === item.code)
  return poItems.map(p => ({
    poNumber: p.poNumber,
    poDate: p.poDate,
    quantity: p.quantity,
    description: p.description
  }))
}

// Helper: Get specific shipment record for an HPO
const getHpoShipment = (item, hpoNumber) => {
  if (!item.shipments_data) return {}
  return item.shipments_data.find(s => s.hpo_number === hpoNumber) || {}
}

// Helper: Calculate HPO discrepancy
const getHpoShortage = (item) => {
  const entries = getHpoEntries(item)
  if (entries.length === 0) return 0
  
  const totalPo = entries.reduce((sum, hpo) => sum + (hpo.quantity || 0), 0)
  return item.qty_to_order - totalPo
}

const groupedShipments = computed(() => {
    if (!soDetail.value) return [];
    const shipmentsMap = new Map(); // For DO (HDO)
    const hpoMap = new Map(); // For PO (HPO)
    
    // Create a Set of item codes that belong to this Sales Order
    const validSoItemCodes = new Set(soDetail.value?.items?.map(i => i.code) || []);
    
    // 1. Initialize from Accurate DO history
    if (soDetail.value.shipments) {
        soDetail.value.shipments.forEach(s => {
            const key = s.no.trim().toLowerCase();
            
            // Filter DO items to ONLY include items that belong to this Sales Order
            const filteredAccurateItems = s.items ? s.items.filter(i => validSoItemCodes.has(i.code)) : [];
            
            shipmentsMap.set(key, { 
                no: s.no, 
                type: 'HDO',
                date: s.date, 
                status: s.status, 
                source: s.source || 'ACCURATE', 
                items: filteredAccurateItems
            });
        });
    }

    // 2. Loop through local items to map HDO and HPO
    if (soDetail.value.items) {
        soDetail.value.items.forEach(item => {
            // A. Handle HDO (Pengiriman)
            const hdoRaw = item.logistics_hdo ? item.logistics_hdo.trim() : null;
            if (hdoRaw) {
                const key = hdoRaw.toLowerCase();
                let doc = shipmentsMap.get(key);
                if (!doc) {
                    doc = { no: hdoRaw, type: 'HDO', date: item.logistics_date ? formatDateSimple(item.logistics_date) : '-', status: 'Manual Update', source: 'MANUAL', items: [] };
                    shipmentsMap.set(key, doc);
                }
                // Avoid duplicate if Accurate API already provided this item
                if (!doc.items.some(i => i.code === item.code)) {
                    // if manual, use qty_shipped
                    doc.items.push({ ...item, name: item.name, code: item.code, qty_shipped: item.qty_shipped || 0, unit: item.unit });
                }
            }
            
            // B. Handle HPO (Pesanan Pembelian)
            const hpos = getHpoEntries(item);
            hpos.forEach(hpo => {
                const poNum = hpo.poNumber.trim();
                const key = poNum.toLowerCase();
                let doc = hpoMap.get(key);
                if (!doc) {
                    const shipmentData = getHpoShipment(item, poNum);
                    doc = { 
                        no: poNum, 
                        type: 'HPO', 
                        date: hpo.poDate ? formatDateSimple(hpo.poDate) : ((shipmentData && shipmentData.status_date) ? formatDateSimple(shipmentData.status_date) : '-'), 
                        status: (shipmentData && shipmentData.current_status) ? shipmentData.current_status : 'Diproses', 
                        source: 'DB', 
                        items: [] 
                    };
                    hpoMap.set(key, doc);
                }
                if (!doc.items.some(i => i.code === item.code)) {
                    doc.items.push({ ...item, name: item.name, code: item.code, qty_shipped: hpo.quantity, unit: item.unit });
                }
            });
        });
    }
    
    // Combine HDO and HPO
    const allDocs = [...Array.from(shipmentsMap.values()), ...Array.from(hpoMap.values())];
    
    // Sort by NO descending
    return allDocs.sort((a, b) => b.no.localeCompare(a.no));
})

const openSiePortal = (item) => { const code = item.code ? item.code.trim() : ''; if(!code || code === '-') return; window.open(`https://sieportal.siemens.com/en-id/products-services/detail/${code}?tree=CatalogTree`, '_blank'); }
const toggleSelectAll = () => {
    const activeFilteredCodes = filteredItems.value.filter(i => !i.is_fully_shipped).map(i => i.code)
    const allActiveFilteredSelected = activeFilteredCodes.every(code => selectedItemCodes.value.includes(code))
    if (allActiveFilteredSelected) {
        selectedItemCodes.value = selectedItemCodes.value.filter(code => !activeFilteredCodes.includes(code))
    } else {
        const newSelected = new Set([...selectedItemCodes.value, ...activeFilteredCodes])
        selectedItemCodes.value = Array.from(newSelected)
    }
}
const toggleSelection = (code) => { if (selectedItemCodes.value.includes(code)) selectedItemCodes.value = selectedItemCodes.value.filter(id => id !== code); else selectedItemCodes.value.push(code) }
const openActionModal = (item) => { 
  isBulkMode.value = false
  selectedItem.value = item
  selectedItemCodes.value = []
  
  console.log('📝 Opening modal for item:', item.code)
  
  const validStatuses = statusOptions.map(o => o.value)
  const hpos = getHpoEntries(item)
  const hpoStatuses = {}
  
  if (hpos.length === 0) {
    // Default (No HPO)
    const existingStatus = item.logistics_status || 'Follow up with our forwarder'
    hpoStatuses['default'] = {
      status: validStatuses.includes(existingStatus) ? existingStatus : 'Follow up with our forwarder',
      exwork_date: item.exwork_date || '',
      eta_date: item.eta_date || '',
      dunex_date: item.dunex_date || '',
      hokiindo_date: item.hokiindo_date || '',
      ready_date: item.ready_date || '',
      admin_notes: item.logistics_note || ''
    }
  } else {
    hpos.forEach(hpo => {
      const ship = getHpoShipment(item, hpo.poNumber)
      const existingStatus = ship.current_status || 'Follow up with our forwarder'
      hpoStatuses[hpo.poNumber] = {
        status: validStatuses.includes(existingStatus) ? existingStatus : 'Follow up with our forwarder',
        exwork_date: ship.exwork_date || '',
        eta_date: ship.eta_date || '',
        dunex_date: ship.dunex_date || '',
        hokiindo_date: ship.hokiindo_date || '',
        ready_date: ship.ready_date || '',
        admin_notes: (ship && ship.id) ? (ship.admin_notes || '') : (item.logistics_note || '')
      }
    })
  }
  
  formStatus.value = { 
    hpoStatuses,
    notes: '' 
  }
  
  console.log('📋 Form populated:', formStatus.value)
  isModalOpen.value = true 
}
const openBulkEditModal = () => { if (selectedItemCodes.value.length === 0) return; isBulkMode.value = true; selectedItem.value = soDetail.value.items.find(i => i.code === selectedItemCodes.value[0]); formStatus.value = { hpoStatuses: { 'default': { status: 'Follow up with our forwarder', exwork_date: '', eta_date: '', dunex_date: '', hokiindo_date: '', admin_notes: '' } }, notes: '' }; isModalOpen.value = true }

const saveUpdate = async () => { 
    isSubmitting.value = true
    const targetItems = isBulkMode.value ? soDetail.value.items.filter(i => selectedItemCodes.value.includes(i.code)) : [selectedItem.value]
    
    try { 
        for (const item of targetItems) { 
            // Loop through all hpoStatuses in formStatus
            const hpoKeys = Object.keys(formStatus.value.hpoStatuses)
            
            for (const key of hpoKeys) {
                const statusData = formStatus.value.hpoStatuses[key]
                const isHoldByCustomer = statusData.admin_notes && statusData.admin_notes.includes('Hold by Customer')
                const finalStatus = isHoldByCustomer ? 'Hold by Customer' : statusData.status
                
                // If the key is 'default', the HPO is null, otherwise it is the key itself
                const refNumber = key === 'default' ? null : key
                
                const shipmentPayload = { 
                    hpo_number: refNumber, 
                    current_status: finalStatus, 
                    exwork_date: statusData.exwork_date || null,
                    eta_date: statusData.eta_date || null,
                    dunex_date: statusData.dunex_date || null,
                    hokiindo_date: statusData.hokiindo_date || null,
                    updated_at: new Date(), 
                    item_code: item.code, 
                    item_seq: item.seq,
                    admin_notes: statusData.admin_notes 
                }
                
                console.log('📦 Shipment payload:', shipmentPayload)
                
                // Get logistics_id for THIS hpo
                let shipmentId = null
                if (item.shipments_data) {
                    const existingShipment = item.shipments_data.find(s => s.hpo_number === refNumber || (refNumber === null && !s.hpo_number))
                    if (existingShipment) shipmentId = existingShipment.id
                } else if (!refNumber) {
                    shipmentId = item.logistics_id
                }
                
                if (!shipmentId) { 
                    const { data: newShip, error: errNew } = await supabase.from('shipments').insert({ so_id: String(soDetail.value.id), shipment_type: 'IMPORT_PO', ...shipmentPayload }).select().single()
                    if (errNew) throw errNew
                    shipmentId = newShip.id 
                } else { 
                    const { error: errUpd } = await supabase.from('shipments').update(shipmentPayload).eq('id', shipmentId)
                    if (errUpd) throw errUpd 
                } 
                
                let eventDate = null
                if (finalStatus === 'Follow up with our forwarder') eventDate = statusData.exwork_date
                else if (finalStatus === 'ETA Port JKT') eventDate = statusData.eta_date
                else if (finalStatus === 'Already in siemens Warehouse') eventDate = statusData.dunex_date
                else if (finalStatus === 'Already in Hokiindo Raya') eventDate = statusData.hokiindo_date
                else if (finalStatus === 'Hold by Customer') eventDate = new Date().toISOString().split('T')[0] 
                
                const userEmail = currentUser.value?.email || 'Unknown User'
                const itemName = item.name || item.code
                await supabase.from('shipment_logs').insert({ 
                  shipment_id: shipmentId, 
                  status_name: finalStatus, 
                  event_date: eventDate, 
                  notes: formStatus.value.notes || (isBulkMode.value ? 'Bulk Update' : ''),
                  user_email: userEmail,
                  action_detail: `Update item "${itemName}" (HPO: ${refNumber || 'N/A'}) ke status "${finalStatus}"`
                }) 
            }
        } 
        
        await fetchDetail(true, false) // skip HPO sync, no loading screen
        isModalOpen.value = false
        selectedItemCodes.value = [] 
    } catch (error) { alert("Gagal update status: " + error.message) } finally { isSubmitting.value = false } 
}

const shareToClient = async () => { let codeToUse = uniqueTrackingCode.value; if (!codeToUse) { const newUniqueCode = generateUUID(); const { data, error } = await supabase.from('so_tracking_links').insert({ so_id: String(resolvedSoId.value), unique_code: newUniqueCode }).select('unique_code').single(); if (error) { alert('Gagal generate link'); return } codeToUse = data.unique_code; uniqueTrackingCode.value = codeToUse; } const trackingUrl = `${window.location.origin}/public/tracking/${codeToUse}`; navigator.clipboard.writeText(trackingUrl).then(() => { isLinkCopied.value = true; setTimeout(() => isLinkCopied.value = false, 3000); }) }
</script>

<template>
  <div class="min-h-screen bg-gray-50/50 dark:bg-[#0f172a] pb-20 font-source-code transition-colors duration-300">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-8">

      <!-- ERROR STATE -->
      <div v-if="errorMessage" class="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-800 rounded-xl border border-red-100 dark:border-red-900 shadow-sm animate-in zoom-in-95 duration-300">
        <div class="bg-red-50 dark:bg-red-900/20 p-4 rounded-full mb-6">
            <AlertTriangle class="w-12 h-12 text-red-500" />
        </div>
        <h3 class="text-xl font-bold text-slate-900 dark:text-white mb-2">Gagal Memuat Data</h3>
        <p class="text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto">{{ errorMessage }}</p>
        <div class="flex gap-4">
            <Button @click="router.push('/sales-orders')" variant="outline">Kembali ke List</Button>
            <Button @click="fetchDetail" variant="default" class="bg-red-600 hover:bg-red-700 text-white">Coba Lagi</Button>
        </div>
      </div>

      <div v-else-if="isLoading" class="flex flex-col items-center justify-center h-[60vh]">
        <div class="w-80 max-w-full">
          <div class="flex justify-between items-center mb-2">
            <p class="text-gray-600 dark:text-gray-400 font-medium text-sm">{{ loadingMessage }}</p>
            <span class="text-red-600 font-bold text-sm">{{ loadingProgress }}%</span>
          </div>
          <div class="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
            <div class="bg-red-600 h-3 rounded-full transition-all duration-300 ease-out" :style="{ width: loadingProgress + '%' }"></div>
          </div>
        </div>
      </div>

      <div v-else-if="soDetail" class="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">

        <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-gray-200 dark:border-gray-800">
          <div class="space-y-2 flex-1 min-w-0">
            <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
              <span class="cursor-pointer hover:text-red-600 dark:hover:text-red-400 transition-colors" @click="router.push('/sales-orders')">Sales Orders</span>
              <span class="text-gray-300 dark:text-gray-600">/</span>
              <span class="font-medium text-gray-900 dark:text-white">Detail</span>
            </div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">{{ soDetail.client }}</h1>
            <div class="flex flex-wrap items-center gap-3 text-sm font-medium text-gray-500 dark:text-gray-400">
               <span class="flex items-center gap-1.5 whitespace-nowrap"><Calendar class="w-4 h-4 flex-shrink-0"/> {{ soDetail.date }}</span>
               <span class="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 hidden sm:inline-block"></span>
               <span class="flex items-center gap-1.5 group whitespace-nowrap">
                 <Building2 class="w-4 h-4 flex-shrink-0"/> 
                 {{ soDetail.number }}
                 <button @click="copySoNumber" class="ml-0.5 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors" title="Copy HSO Number">
                   <component :is="isSoNumberCopied ? CheckCircle2 : Copy" class="w-3.5 h-3.5" :class="isSoNumberCopied ? 'text-green-600 dark:text-green-400' : ''"/>
                 </button>
               </span>
               <span class="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 hidden sm:inline-block"></span>
               <span class="text-gray-900 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded text-xs whitespace-nowrap">PO: {{ soDetail.po_number }}</span>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-3 w-full lg:w-auto shrink-0 mt-2 lg:mt-0">
              <Button v-if="selectedItemCodes.length > 0" size="lg" class="shadow-sm bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 transition-all animate-in zoom-in-95 duration-200" @click="openBulkEditModal">
                <Layers class="w-4 h-4 mr-2"/> Update ({{ selectedItemCodes.length }}) Item
              </Button>
              <Button size="lg" :variant="'outline'" class="shadow-sm border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all hover:shadow-md active:scale-95" @click="triggerExcelImport" :disabled="isExcelParsing || isLoading">
                <div class="flex items-center gap-2">
                  <UploadCloud class="w-5 h-5" :class="isExcelParsing ? 'animate-spin' : ''"/>
                  <span class="font-semibold">{{ isExcelParsing ? 'Memuat...' : 'Import Excel Status' }}</span>
                </div>
              </Button>
              <input type="file" ref="excelFileInput" class="hidden" accept=".xlsx, .xls" @change="handleExcelImport" />
              <Button size="lg" :variant="'outline'" class="shadow-sm border-emerald-600 text-emerald-600 dark:border-emerald-500 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-all hover:shadow-md active:scale-95" @click="exportReminderExcel" :disabled="isLoading">
                <div class="flex items-center gap-2">
                  <FileSpreadsheet class="w-5 h-5"/>
                  <span class="font-semibold">Export Reminder PO</span>
                </div>
              </Button>
              <Button size="lg" class="shadow-sm transition-all hover:shadow-md active:scale-95" :class="isLinkCopied ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white dark:shadow-red-900/20'" @click="shareToClient" :disabled="isLinkCopied || isLoading">
                <div class="flex items-center gap-2">
                  <component :is="isLinkCopied ? CheckCircle2 : Share2" class="w-5 h-5"/>
                  <span class="font-semibold">{{ isLinkCopied ? 'Link Disalin!' : 'Share Tracking Link' }}</span>
                </div>
              </Button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card class="border shadow-sm rounded-lg overflow-hidden bg-white dark:bg-slate-800 dark:border-slate-700">
            <CardContent class="p-6 flex items-center justify-between">
              <div><p class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Nilai</p><p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">{{ formatCurrency(soDetail.total_amount) }}</p></div>
              <div class="bg-red-50 dark:bg-red-900/20 p-3 rounded-full text-red-600 dark:text-red-400"><FileText class="w-6 h-6" /></div>
            </CardContent>
          </Card>
          <Card class="border shadow-sm rounded-lg overflow-hidden bg-white dark:bg-slate-800 dark:border-slate-700">
            <CardContent class="p-6 flex items-center justify-between">
              <div><p class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Item</p><p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">{{ soDetail.items.length }} <span class="text-sm font-normal text-gray-500 dark:text-gray-400">Produk</span></p></div>
              <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-full text-blue-600 dark:text-blue-400"><Package class="w-6 h-6" /></div>
            </CardContent>
          </Card>
          <Card class="border shadow-sm rounded-lg overflow-hidden bg-white dark:bg-slate-800 dark:border-slate-700">
            <CardContent class="p-6">
              <div class="flex justify-between items-center mb-2"><p class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Progress Pengiriman</p><span class="text-lg font-bold text-red-600 dark:text-red-400">{{ fulfillmentPercentage(soDetail.items) }}%</span></div>
              <Progress :model-value="fulfillmentPercentage(soDetail.items)" class="h-2 bg-gray-100 dark:bg-slate-700" indicator-class="bg-red-600 dark:bg-red-500" />
            </CardContent>
          </Card>
        </div>

        <Card class="border shadow-sm rounded-lg overflow-hidden bg-white dark:bg-slate-800 dark:border-slate-700 flex flex-col max-h-[75vh]">
          <CardHeader class="border-b border-gray-100 dark:border-slate-700 px-6 py-4 bg-white dark:bg-slate-800 shrink-0">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle class="text-base font-bold text-gray-800 dark:text-white">Detail Produk & Logistik</CardTitle>
              <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                <!-- Search Input -->
                <div class="relative w-full sm:w-64">
                  <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input 
                    v-model="itemSearchQuery" 
                    type="text" 
                    placeholder="Cari SKU / nama / note..." 
                    class="pl-9 pr-3 py-1.5 w-full text-xs border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-red-500" 
                  />
                </div>
                <!-- Status Filter Select -->
                <div class="w-full sm:w-48">
                  <select 
                    v-model="itemStatusFilter"
                    class="px-3 py-1.5 w-full text-xs border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-red-500"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="NEED_ORDER">Perlu / Kurang PO</option>
                    <option value="ORDERED">Sudah / Kelebihan PO</option>
                    <option value="READY">Menunggu Pengiriman</option>
                    <option value="PARTIAL">Dikirim Sebagian</option>
                    <option value="SHIPPED">Sudah Dikirim</option>
                    <option value="HOLD">Hold by Customer</option>
                  </select>
                </div>
              </div>
            </div>
          </CardHeader>
          <div class="overflow-auto flex-1">
            <div class="[&>div]:overflow-visible min-w-[800px] w-full">
              <Table class="relative">
                <TableHeader class="bg-gray-50 dark:bg-slate-900 sticky top-0 z-20 shadow-sm border-b">
                  <TableRow>
                  <TableHead class="w-[50px] text-center">
                     <div class="flex items-center justify-center gap-1">
                        <input type="checkbox" class="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer" :checked="isAllSelected" @change="toggleSelectAll"/>
                     </div>
                  </TableHead>
                  <TableHead class="min-w-[250px] text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nama Produk</TableHead>
                  <TableHead class="text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[8%]">Qty Order</TableHead>
                  <TableHead class="text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[8%]">Stok</TableHead>
                  <TableHead class="text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[8%]">Terkirim</TableHead>
                  <TableHead class="text-center text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider w-[10%] bg-red-50/30 dark:bg-red-900/10">Sisa (Kirim)</TableHead>
                  
                  <TableHead class="pl-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[15%]">Status</TableHead>
                  <TableHead class="text-right pr-6 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[8%]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow 
                    v-for="(item, idx) in filteredItems" 
                    v-show="!isPurchaseExpanded || item.qty_to_order > 0"
                    :key="idx" 
                    class="group hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors border-b border-gray-100 dark:border-slate-700 last:border-0"
                    :class="{ 'bg-yellow-100 dark:bg-yellow-900/30 hover:bg-yellow-200 dark:hover:bg-yellow-900/50': route.query.highlight === item.code }"
                    :id="`item-${item.code}`"
                >
                  <TableCell class="text-center align-top pt-4">
                    <input v-if="!item.is_fully_shipped" type="checkbox" class="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer" :checked="selectedItemCodes.includes(item.code)" @change="toggleSelection(item.code)"/>
                  </TableCell>
                  <TableCell class="pl-2 py-4 align-top">
                    <!-- SKU is now prominent -->
                    <div class="flex items-center gap-2">
                        <div class="font-bold text-gray-900 dark:text-slate-200 text-sm font-mono">
                            {{ item.code }}
                        </div>
                        <button @click="copySku(item.code)" class="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" title="Copy SKU">
                            <component :is="copiedSku === item.code ? CheckCircle2 : Copy" class="w-3.5 h-3.5" :class="copiedSku === item.code ? 'text-green-600 dark:text-green-400' : ''"/>
                        </button>
                    </div>
                    <!-- Description below SKU -->
                    <div class="text-xs text-gray-600 dark:text-gray-400 mt-1 font-medium leading-relaxed">{{ item.name }}</div>
                    
                    <div v-if="item.admin_note" class="text-[10px] text-gray-400 italic mt-1.5 border-t border-dashed border-gray-200 dark:border-gray-700 pt-1.5 max-w-[250px]">Note: {{ item.admin_note }}</div>
                  </TableCell>
                  
                  <TableCell class="text-center align-top pt-4 text-gray-900 dark:text-slate-300 font-medium">{{ item.qty_order }}</TableCell>
                  
                  <TableCell class="text-center align-top pt-4 text-gray-600 dark:text-gray-400">
                      <span class="font-bold text-gray-900 dark:text-white">{{ item.parsed_stock_qty }}</span>
                  </TableCell>
                  
                  <TableCell class="text-center align-top pt-4 bg-blue-50/30 dark:bg-blue-900/10">
                      <div class="flex flex-col items-center gap-1">
                          <span class="font-bold text-blue-600 dark:text-blue-400">{{ item.qty_shipped }}</span>
                      </div>
                  </TableCell>
                  
                  <TableCell class="text-center align-top pt-4 bg-red-50/30 dark:bg-red-900/10">
                      <span class="font-bold" :class="item.qty_remaining > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'">{{ item.qty_remaining }}</span>
                  </TableCell>

                  <TableCell class="pl-4 align-top pt-3">
                    <!-- Loading untuk item yang perlu order (no stock / kurang stock) saat sync HPO -->
                    <div v-if="isSyncing && item.qty_to_order > 0" class="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700">
                        <Loader2 class="w-4 h-4 animate-spin" />
                        <span class="text-xs font-medium">Cek PO...</span>
                    </div>
                    <!-- Loading untuk item yang sudah dikirim (cek HDO) -->
                    <div v-else-if="isSyncing && item.qty_shipped > 0 && !getHdoNumber(item)" class="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700">
                        <Loader2 class="w-4 h-4 animate-spin" />
                        <span class="text-xs font-medium">Cek Resi...</span>
                    </div>

                    <!-- Status tampil langsung jika stock cukup, atau setelah sync selesai -->
                    <div v-else class="space-y-2">
                        <!-- General Status Badge -->
                        <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-bold shadow-sm" :class="getRowStatus(item).class">
                            <component :is="getRowStatus(item).icon" class="w-3.5 h-3.5" />
                            {{ getRowStatus(item).text }}
                        </div>
                        
                        <!-- HDO (Resi Pengiriman) Info -->
                        <div v-if="getHdoNumber(item) || (item.qty_shipped > 0 && item.logistics_hdo)" class="mt-2">
                            <div class="bg-blue-50 dark:bg-blue-900/20 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg p-3">
                                <div class="flex items-center gap-2 mb-2 pb-2 border-b border-dashed border-blue-200 dark:border-blue-800">
                                    <Truck class="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    <span class="text-xs font-bold text-blue-700 dark:text-blue-300">Pengiriman (HDO)</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">{{ getHdoNumber(item) || item.logistics_hdo }}</span>
                                    <span class="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-800 px-1.5 py-0.5 rounded">{{ getHdoQty(item) || item.qty_shipped }} {{ item.unit }}</span>
                                </div>
                                <div v-if="hpoMapping[item.code] && getNoteType(item.admin_note) !== 'stock'" class="mt-2 pt-2 border-t border-dashed border-blue-200 dark:border-blue-800 text-[10px] text-blue-600 dark:text-blue-400 font-medium text-center">
                                    Ex PO: {{ hpoMapping[item.code] }}
                                </div>
                            </div>
                        </div>
                        
                        <!-- HPO Number + Logistics Status Combined (Support Multiple POs) -->
                        <div v-if="!item.is_fully_shipped && getHpoEntries(item).length > 0" class="mt-1.5 space-y-2">
                            <template v-for="(hpo, idx) in getHpoEntries(item)" :key="idx">
                            <div v-show="!(item.qty_shipped > 0 && getVisualStatus(getHpoShipment(item, hpo.poNumber)) === 'Already in Hokiindo Raya')" class="bg-white dark:bg-slate-800 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3">
                                <!-- HPO Number -->
                                <div class="flex items-center gap-2 mb-2 pb-2 border-b border-dashed border-gray-200 dark:border-gray-700">
                                    <ShoppingCart class="w-4 h-4 text-green-600 dark:text-green-400" />
                                    <span class="text-xs font-bold text-gray-600 dark:text-gray-400">HPO:</span>
                                    <span class="text-sm font-mono font-bold text-green-700 dark:text-green-300">{{ hpo.poNumber }}</span>
                                    <span class="ml-auto text-xs font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                                        {{ hpo.quantity }} {{ item.unit }}
                                    </span>
                                </div>
                                
                                <!-- Logistics Status Tree (if exists for this item) -->
                                <template v-for="hpoShipment in [getHpoShipment(item, hpo.poNumber)]" :key="hpoShipment.id || hpo.poNumber">
                                <div v-if="hpoShipment.current_status && hpoShipment.current_status !== 'Pending Process'" class="mt-2">
                                    <div class="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded border border-blue-100 dark:border-blue-800">
                                        <div class="flex items-center gap-1.5">
                                            <Truck class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                            <span class="text-[11px] font-bold text-blue-700 dark:text-blue-300">
                                                {{ getVisualStatus(hpoShipment) === 'Follow up with our forwarder' ? 'Ex-Works' : getVisualStatus(hpoShipment) === 'Already in siemens Warehouse' ? 'Tiba Dunex' : getVisualStatus(hpoShipment) === 'Already in Hokiindo Raya' ? 'Tiba Hokiindo (Siap Kirim)' : getVisualStatus(hpoShipment) }}
                                            </span>
                                        </div>
                                        <span class="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400">
                                            {{ getVisualStatusDate(hpoShipment) || '-' }}
                                        </span>
                                    </div>
                                </div>
                                </template>
                            </div>
                            </template>
                            
                            <!-- Notifications for shortage/remaining have been moved to the status badge text -->
                        </div>
                        
                        <!-- Warning jika dikirim sebagian tapi belum ada HPO -->
                        <div v-else-if="item.qty_shipped > 0 && item.qty_remaining > 0 && !isSyncing" class="mt-1.5 text-[10px] italic">
                            <!-- Jika stock kurang (perlu order) -->
                            <span v-if="item.qty_to_order > 0" class="text-red-600 dark:text-red-400 flex items-center gap-1">
                                <AlertTriangle class="w-3 h-3" />
                                Ada kekurangan yang belum dipesan ({{ item.qty_remaining }} {{ item.unit }})
                            </span>
                            <!-- Jika stock ready tapi belum dikirim semua -->
                            <span v-else class="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                <Info class="w-3 h-3" />
                                Ada {{ item.qty_remaining }} {{ item.unit }} belum dikirim
                            </span>
                        </div>

                        <!-- Warning jika perlu PO tapi belum ada HPO -->
                        <div v-else-if="item.qty_to_order > 0 && !item.is_fully_shipped && !isSyncing && getHpoEntries(item).length === 0" class="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                            <Clock class="w-3 h-3" />
                            Pesanan sudah {{ getDaysSinceOrder() }} hari
                        </div>
                    </div>
                    
                    <!-- Hold by Customer Indicator - Prominent Display (Only show after sync) -->
                    <div v-if="!isSyncing && item.logistics_status === 'Hold by Customer'" class="text-[11px] font-bold mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded border-l-4 border-amber-500 flex items-center gap-2">
                        <Clock class="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <div>
                            <div class="text-amber-800 dark:text-amber-300 uppercase tracking-wide">⚠️ HOLD BY CUSTOMER</div>
                            <div class="text-amber-600 dark:text-amber-400 text-[10px] mt-0.5">Item ditunda oleh customer</div>
                        </div>
                    </div>
                    
                    <!-- Admin Notes (Only show after sync) -->
                    <div v-if="!isSyncing && item.logistics_note && !item.logistics_note.includes('Auto-synced') && !item.logistics_note.includes('Auto-created')" class="text-[11px] text-gray-600 dark:text-gray-400 mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded border-l-2 border-gray-300 dark:border-gray-600">
                        <div class="font-bold text-[9px] uppercase text-gray-500 mb-0.5">Note:</div>
                        {{ item.logistics_note }}
                    </div>
                  </TableCell>
                  
                  <TableCell class="text-right pr-6 align-top pt-3">
                    <!-- Edit button only shows after sync completes -->
                    <Button v-if="!isSyncing" size="sm" variant="outline" class="h-8 px-3 rounded border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-600 dark:hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all bg-white dark:bg-slate-800 flex items-center gap-1.5 ml-auto" @click="openActionModal(item)"><Edit class="w-3.5 h-3.5"/><span class="text-xs font-bold">Edit</span></Button>
                  </TableCell>
                </TableRow>
                <TableRow v-if="filteredItems.length === 0">
                  <TableCell colspan="8" class="text-center py-12 text-slate-500">
                    <div class="flex flex-col items-center justify-center">
                      <Search class="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                      <p class="text-sm font-semibold">Produk tidak ditemukan</p>
                      <p class="text-xs text-slate-400 mt-1">Coba gunakan kata kunci pencarian lain atau ubah filter status.</p>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            </div>
          </div>
        </Card>

        <!-- Loading State untuk Barang Perlu di Order -->
        <Card v-if="isHpoSyncing" class="border shadow-sm rounded-lg bg-white dark:bg-slate-800 border-l-4 border-l-amber-500 animate-pulse">
            <CardHeader class="pb-3 border-b border-gray-100 dark:border-slate-700">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <Loader2 class="w-5 h-5 text-amber-600 animate-spin" />
                        <div>
                            <CardTitle class="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                Mengecek Status PO...
                            </CardTitle>
                            <CardDescription class="mt-1">
                                Sedang memeriksa Purchase Order dari Accurate
                            </CardDescription>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent class="pt-4">
                <div class="space-y-3">
                    <div v-for="i in 3" :key="i" class="h-16 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse"></div>
                </div>
            </CardContent>
        </Card>

        <!-- Actual Content setelah loading -->
        <Card v-else-if="itemsToPurchase.length > 0" class="border shadow-sm rounded-lg bg-white dark:bg-slate-800 border-l-4 border-l-red-500 animate-in slide-in-from-bottom-2 duration-500">
            <CardHeader class="pb-3 border-b border-gray-100 dark:border-slate-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors select-none" @click="isPurchaseExpanded = !isPurchaseExpanded">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <component :is="isPurchaseExpanded ? ChevronUp : ChevronDown" class="w-5 h-5 text-gray-500 transition-transform duration-200" />
                        <div>
                            <CardTitle class="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                <AlertTriangle class="w-5 h-5 text-red-500"/>
                                Barang Perlu di Order
                                <Badge class="bg-red-100 text-red-700 hover:bg-red-200 border-0">{{ itemsToPurchase.length }} Item</Badge>
                            </CardTitle>
                            <CardDescription class="mt-1" v-if="isPurchaseExpanded">
                                Daftar berikut adalah barang yang <b>belum dipesan atau kurang jumlahnya</b> berdasarkan catatan admin dan data PO Accurate.
                            </CardDescription>
                            <CardDescription class="mt-0" v-else>
                                Klik untuk melihat detail barang yang perlu dipesan.
                            </CardDescription>
                        </div>
                    </div>
                    <div class="flex items-center gap-2" @click.stop>
                        <Button variant="outline" size="sm"
                            :class="isAllPurchaseCopied ? 'border-green-500 text-green-600 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:hover:bg-slate-700'"
                            class="gap-1.5 text-xs transition-all duration-300"
                            @click.stop="copyAllPurchaseRows">
                            <component :is="isAllPurchaseCopied ? CheckCircle2 : Copy" class="w-3.5 h-3.5 transition-all"/>
                            {{ isAllPurchaseCopied ? 'Disalin!' : 'Copy Semua ke Excel' }}
                        </Button>
                        <Button variant="outline" size="sm" class="border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 gap-1.5 text-xs" @click="exportToExcel">
                            <Download class="w-3.5 h-3.5"/> Download Excel
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <div v-show="isPurchaseExpanded" class="divide-y divide-gray-100 dark:divide-slate-700 transition-all duration-300">
                <div v-for="(item, idx) in itemsToPurchase" :key="idx"
                    class="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors group">
                    
                    <!-- Status type indicator bar -->
                    <div class="flex-shrink-0 flex flex-col items-center gap-1 w-24">
                        <div :class="getRowStatus(item).text.startsWith('KURANG') ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-red-100 text-red-700 border-red-200'"
                            class="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border whitespace-nowrap text-center">
                            {{ getRowStatus(item).text.startsWith('KURANG') ? 'Kurang PO' : 'Belum Dipesan' }}
                        </div>
                    </div>

                    <!-- Code + Name -->
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-mono font-bold text-sm text-gray-800 dark:text-gray-100 tracking-wide">{{ item.code }}</span>
                            <button @click.stop="copyPartNumber(item.code)"
                                class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded transition-colors"
                                :class="copiedPartNumber === item.code ? 'text-green-500' : 'text-gray-400 hover:text-blue-500'"
                                title="Copy Part Number">
                                <component :is="copiedPartNumber === item.code ? CheckCircle2 : Copy" class="w-3 h-3"/>
                            </button>
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5 line-clamp-2">{{ item.name }}</div>
                    </div>

                    <!-- Stock -->
                    <div class="flex-shrink-0 text-center w-20">
                        <div class="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">Stock</div>
                        <div class="text-sm font-bold" :class="item.parsed_stock_qty > 0 ? 'text-amber-600' : 'text-gray-400'">
                            {{ item.parsed_stock_qty || 0 }}
                        </div>
                    </div>

                    <!-- Order Suggestion -->
                    <div class="flex-shrink-0 text-center">
                        <div class="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">Perlu Dipesan</div>
                        <Badge :class="getRowStatus(item).text.startsWith('KURANG') ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-600 hover:bg-red-700'" class="text-white text-sm font-bold px-3 py-0.5 min-w-[64px] justify-center">
                            {{ item.order_suggestion }} {{ item.unit }}
                        </Badge>
                    </div>

                    <!-- Copy row -->
                    <div class="flex-shrink-0">
                        <button
                            @click.stop="copyPurchaseRow(item)"
                            :class="copiedRowCode === item.code
                                ? 'text-green-600 border-green-400 bg-green-50 dark:bg-green-900/20 opacity-100'
                                : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 border-gray-200 dark:border-slate-600 hover:border-blue-400'"
                            class="transition-all duration-300 flex items-center gap-1 text-xs border rounded px-2 py-1 bg-white dark:bg-slate-800"
                            title="Copy baris ke clipboard (SKU | Deskripsi | Qty)">
                            <component :is="copiedRowCode === item.code ? CheckCircle2 : Copy" class="w-3 h-3"/>
                            {{ copiedRowCode === item.code ? 'Disalin!' : 'Baris' }}
                        </button>
                    </div>
                </div>
            </div>
        </Card>


        <div class="grid md:grid-cols-2 gap-6">
          <Card class="border shadow-sm rounded-lg bg-white dark:bg-slate-800 dark:border-slate-700">
            <CardHeader class="pb-3 border-b border-gray-100 dark:border-slate-700 px-6 py-4">
              <CardTitle class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2">
                <FileText class="w-4 h-4"/> Riwayat Dokumen
                <Loader2 v-if="isHdoSyncing" class="w-4 h-4 animate-spin text-blue-600" />
              </CardTitle>
            </CardHeader>
            <CardContent class="pt-4 px-6 pb-6">
              <!-- Loading State -->
              <div v-if="isHdoSyncing" class="space-y-3">
                <div v-for="i in 2" :key="i" class="h-20 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse"></div>
                <p class="text-center text-sm text-gray-500 dark:text-gray-400 italic">Mengecek detail pengiriman dari Accurate...</p>
              </div>
              
              <!-- Actual Content -->
              <div v-else-if="groupedShipments.length || soDetail.invoices.length" class="space-y-3">
                
                <div v-for="doItem in groupedShipments" :key="doItem.no" class="flex flex-col bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-600 overflow-hidden transition-all duration-300">
                    <div class="flex justify-between items-center p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700" @click="expandedDocNo = expandedDocNo === doItem.no ? null : doItem.no">
                        <div class="flex items-center gap-3">
                            <div :class="doItem.type === 'HPO' ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'" class="bg-white dark:bg-slate-800 p-1.5 rounded border border-gray-200 dark:border-slate-600 shadow-sm">
                                <ShoppingCart v-if="doItem.type === 'HPO'" class="w-4 h-4"/>
                                <Truck v-else class="w-4 h-4"/>
                            </div>
                            <div>
                                <div class="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                    {{ doItem.no }}
                                    <span v-if="doItem.source === 'MANUAL'" class="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">MANUAL</span>
                                    <span v-if="doItem.type === 'HPO'" class="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded border border-green-200">PO</span>
                                </div>
                                <div class="text-xs text-gray-500 dark:text-gray-400">{{ doItem.date }}</div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <Badge variant="secondary" :class="doItem.type === 'HPO' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600'">
                                {{ doItem.items.length }} Item
                            </Badge>
                            <component :is="expandedDocNo === doItem.no ? ChevronUp : ChevronDown" class="w-4 h-4 text-gray-400"/>
                        </div>
                    </div>
                    <div v-if="expandedDocNo === doItem.no" class="bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-600 p-0 animate-in slide-in-from-top-1 duration-200">
                         <div v-if="doItem.items && doItem.items.length > 0">
                             <table class="w-full text-left text-xs">
                                 <thead class="bg-gray-50 dark:bg-slate-900/50 text-gray-500 uppercase">
                                     <tr>
                                         <th class="px-4 py-2 font-bold">Produk</th>
                                         <th class="px-4 py-2 text-center font-bold">Qty</th>
                                     </tr>
                                 </thead>
                                 <tbody class="divide-y divide-gray-100 dark:divide-slate-700">
                                     <tr v-for="(i, idx) in doItem.items" :key="idx">
                                         <td class="px-4 py-2 text-gray-700 dark:text-gray-300">
                                             <div class="font-medium truncate max-w-[200px]">{{ i.name }}</div>
                                             <div class="text-[10px] text-gray-400 font-mono">{{ i.code }}</div>
                                             <div v-if="hpoMapping[i.code]" class="text-[10px] text-gray-500 mt-0.5"><span class="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">Ex PO: {{ hpoMapping[i.code] }}</span></div>
                                         </td>
                                         <td class="px-4 py-2 text-center font-bold text-gray-800 dark:text-white">
                                             {{ i.qty_shipped }} {{ i.unit }}
                                         </td>
                                     </tr>
                                 </tbody>
                             </table>
                         </div>
                         <div v-else class="p-4 text-center text-gray-400 text-xs italic">
                             Item tidak terdeteksi secara otomatis.
                         </div>
                    </div>
                </div>

                <div v-for="inv in soDetail.invoices" :key="inv.no" class="flex justify-between items-center bg-gray-50 dark:bg-slate-700/50 p-3 rounded-lg border border-gray-200 dark:border-slate-600">
                  <div class="flex items-center gap-3"><div class="bg-white dark:bg-slate-800 p-1.5 rounded border border-gray-200 dark:border-slate-600 text-emerald-600 dark:text-emerald-400 shadow-sm"><FileText class="w-4 h-4"/></div><div><div class="text-sm font-bold text-gray-800 dark:text-white">{{ inv.no }}</div><div class="text-xs text-gray-500 dark:text-gray-400">{{ inv.date }}</div></div></div>
                  <Badge variant="secondary" class="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300">{{ inv.status }}</Badge>
                </div>
              </div>
              <div v-else class="text-center py-8 text-gray-400 dark:text-gray-500 text-sm border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-lg">Belum ada pengiriman atau faktur tercatat.</div>
            </CardContent>
          </Card>
          <Card class="border shadow-sm rounded-lg bg-white dark:bg-slate-800 dark:border-slate-700">
            <CardContent class="p-6 space-y-6">
              <div><h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2"><Info class="w-4 h-4"/> Catatan Sales Order</h4><div class="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-lg border border-amber-100 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-300 leading-relaxed whitespace-pre-line">{{ soDetail.notes || 'Tidak ada catatan tambahan.' }}</div></div>
              <Separator class="dark:bg-slate-700"/>
              <div><h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2"><MapPin class="w-4 h-4"/> Alamat Pengiriman</h4><div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed pl-1">{{ soDetail.to_address || 'Alamat tidak tersedia.' }}</div></div>
            </CardContent>
          </Card>
        </div>

        <!-- ACTIVITY LOG SECTION -->
        <Card class="border shadow-sm rounded-lg bg-white dark:bg-slate-800 dark:border-slate-700 mt-6">
          <CardHeader class="pb-3 border-b border-slate-100 dark:border-slate-700">
            <CardTitle class="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide flex items-center gap-2">
              <Clock class="w-4 h-4 text-slate-500"/> Activity Log
            </CardTitle>
            <CardDescription class="text-xs text-slate-500">Riwayat update item oleh user</CardDescription>
          </CardHeader>
          <CardContent class="p-4">
            <div v-if="activityLogs.length === 0" class="text-center py-6 text-slate-400 text-sm border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
              Belum ada aktivitas tercatat.
            </div>
            <div v-else class="space-y-3 max-h-[400px] overflow-y-auto">
              <div 
                v-for="log in activityLogs" 
                :key="log.id" 
                class="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700"
              >
                <div class="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <Edit class="w-4 h-4 text-blue-600 dark:text-blue-400"/>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs font-bold text-slate-800 dark:text-slate-200">{{ log.user_email || 'Unknown' }}</span>
                    <Badge class="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{{ log.status_name }}</Badge>
                  </div>
                  <p class="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{{ log.action_detail || log.notes || 'Update status' }}</p>
                  <p class="text-[10px] text-slate-400 mt-1">
                    {{ new Date(log.created_at || log.event_date).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>




      <Sheet :open="isModalOpen" @update:open="isModalOpen = $event">
        <SheetContent side="right" class="w-full sm:w-[800px] sm:max-w-[800px] p-0 overflow-y-auto">
          <SheetHeader class="p-6 pb-4 border-b border-gray-200 dark:border-gray-700">
            <SheetTitle class="text-2xl font-bold">
              {{ isBulkMode ? `Update (${selectedItemCodes.length}) Item` : 'Update Status Logistics' }}
            </SheetTitle>
          </SheetHeader>

          <div class="p-6 space-y-6">
              <!-- Item Info -->
              <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div v-if="!isBulkMode" class="w-full flex justify-between items-start mb-3">
                      <span class="font-bold text-sm text-gray-900 dark:text-white truncate max-w-[400px]">{{ selectedItem?.name }}</span>
                      <span class="text-xs font-mono text-gray-500">{{ selectedItem?.code }}</span>
                  </div>
                  <div v-else class="w-full mb-3"><p class="font-bold text-sm text-gray-900 dark:text-white">Mass Update</p></div>
                  
                  <!-- STATUS OTOMATIS - FULL WIDTH -->
                  <div v-if="selectedItem && !isBulkMode" class="p-5 rounded-lg" :class="hpoMapping[selectedItem.code] ? 'bg-green-50 dark:bg-green-900/20 border-2 border-green-300' : selectedItem.qty_to_order > 0 ? 'bg-red-50 dark:bg-red-900/20 border-2 border-red-300' : 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300'">
                      <!-- Jika ada HPO - BIGGER TEXT -->
                      <div v-if="hpoMapping[selectedItem.code]" class="flex items-center gap-3">
                          <CheckCircle2 class="w-7 h-7 text-green-600" />
                          <div class="flex-1">
                              <p class="text-sm font-bold text-green-700 mb-1">PURCHASE ORDER</p>
                              <p class="text-2xl font-mono font-bold text-green-800 dark:text-green-200">{{ hpoMapping[selectedItem.code] }}</p>
                          </div>
                      </div>
                      <!-- Jika perlu PO tapi belum ada -->
                      <div v-else-if="selectedItem.qty_to_order > 0" class="flex items-center gap-2">
                          <AlertCircle class="w-5 h-5 text-red-600" />
                          <div>
                              <p class="text-xs font-bold text-red-700">BUTUH PO</p>
                              <p class="text-sm text-red-600">Pesanan sudah {{ getDaysSinceOrder() }} hari belum ada PO</p>
                          </div>
                      </div>
                      <!-- Jika ada stock, menunggu pengiriman -->
                      <div v-else class="flex items-center gap-2">
                          <Hourglass class="w-5 h-5 text-blue-600" />
                          <div>
                              <p class="text-xs font-bold text-blue-700">MENUNGGU PENGIRIMAN</p>
                              <p class="text-sm text-blue-600">Stok tersedia, siap kirim</p>
                          </div>
                      </div>
                  </div>
                  
                  <div v-if="selectedItem" class="grid grid-cols-2 gap-2 mt-3">
                      <div class="bg-emerald-50 dark:bg-emerald-900/20 p-2 border border-emerald-100 dark:border-emerald-800 rounded">
                          <p class="text-[10px] uppercase font-bold text-emerald-600">Sudah Dikirim</p>
                          <p class="text-lg font-bold text-emerald-800 dark:text-emerald-300">{{ selectedItem.qty_shipped }} <span class="text-[10px] text-gray-400">Unit</span></p>
                      </div>
                      <div class="bg-red-50 dark:bg-red-900/20 p-2 border border-red-100 dark:border-red-800 rounded">
                          <p class="text-[10px] uppercase font-bold text-red-600">Sisa Kirim</p>
                          <p class="text-lg font-bold text-red-800 dark:text-red-300">{{ selectedItem.qty_remaining }} <span class="text-[10px] text-gray-400">Unit</span></p>
                      </div>
                  </div>
              </div>
              
              <!-- ========== CONDITIONAL CONTENT BASED ON HPO ========== -->
              <div v-if="selectedItem" class="space-y-6">
                 <div v-for="(statusData, hpoKey) in formStatus.hpoStatuses" :key="hpoKey" class="border-2 border-gray-100 dark:border-gray-800 rounded-xl p-4">
                     
                     <!-- JIKA JELAS-JELAS BELUM ADA HPO TAPI PERLU PO (hpoKey === 'default' && qty_to_order > 0) -->
                     <div v-if="hpoKey === 'default' && selectedItem.qty_to_order > 0">
                         <!-- Peringatan Belum Ada PO -->
                         <div class="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border-2 border-red-300 dark:border-red-700 flex items-start gap-3">
                             <div class="bg-red-100 dark:bg-red-800 p-2 rounded-full">
                                 <AlertTriangle class="w-6 h-6 text-red-600 dark:text-red-400" />
                             </div>
                             <div class="flex-1">
                                 <p class="text-base font-bold text-red-700 dark:text-red-300 mb-1">BELUM ADA PURCHASE ORDER</p>
                                 <p class="text-sm text-red-600 dark:text-red-400">Segera lakukan Pembelian Produk. Status logistics hanya bisa diupdate setelah PO dibuat.</p>
                                 <p class="text-xs text-red-500 dark:text-red-500 mt-2 font-mono">Pesanan sudah {{ getDaysSinceOrder() }} hari</p>
                             </div>
                         </div>
                         
                         <!-- Admin Notes Only -->
                         <div class="mt-4">
                             <label class="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 block">Keterangan Admin (Internal)</label>
                             <textarea v-model="statusData.admin_notes" rows="4" class="w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 p-3 text-sm focus:ring-2 ring-red-500 dark:ring-red-400 outline-none rounded placeholder-gray-400" placeholder="Tulis catatan internal tentang status pembelian..."></textarea>
                         </div>
                     </div>
                     
                     <!-- JIKA ITEM READY (Stock Ada, Tidak Perlu PO) -->
                     <div v-else-if="hpoKey === 'default' && selectedItem.qty_to_order === 0">
                         <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border-2 border-blue-200 dark:border-blue-800 flex items-start gap-3 mb-4">
                             <div class="bg-white dark:bg-slate-800 p-2 rounded-full shadow-sm">
                                 <CheckCircle2 class="w-6 h-6 text-blue-600"/>
                             </div>
                             <div>
                                 <p class="text-base font-bold text-blue-800 dark:text-blue-300">Barang Ready / Menunggu Pengiriman</p>
                                 <p class="text-sm text-blue-600 dark:text-blue-400 mt-1">Stok tersedia. Silakan update keterangan atau Hold jika ditunda.</p>
                             </div>
                         </div>
      
                         <!-- Admin Notes -->
                         <div class="mb-4">
                             <label class="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 block">Keterangan Admin (Internal)</label>
                             <textarea v-model="statusData.admin_notes" rows="3" class="w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 p-3 text-sm focus:ring-2 ring-blue-500 outline-none rounded placeholder-gray-400" placeholder="Tulis catatan internal di sini..."></textarea>
                             
                             <!-- Quick Text Button -->
                             <div class="mt-2 flex gap-2">
                                 <button 
                                     type="button"
                                     @click="() => { const holdText = 'Hold by Customer'; if (!statusData.admin_notes.includes(holdText)) { statusData.admin_notes = statusData.admin_notes ? `${holdText}\n${statusData.admin_notes}` : holdText } }"
                                     class="px-3 py-1.5 text-xs font-bold bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded border border-amber-300 dark:border-amber-700 transition-colors flex items-center gap-1.5"
                                 >
                                     <Clock class="w-3 h-3" />
                                     Hold by Customer
                                 </button>
                             </div>
                         </div>
                     </div>
                     
                     <!-- JIKA SUDAH ADA HPO -->
                     <div v-else>
                         <!-- HPO Info Box - BIGGER -->
                         <div class="bg-green-50 dark:bg-green-900/20 p-5 rounded-lg border-2 border-green-300 dark:border-green-700 mb-4">
                             <div class="flex items-center gap-3 mb-2">
                                 <ShoppingCart class="w-7 h-7 text-green-600 dark:text-green-400" />
                                 <span class="text-base font-bold text-green-700 dark:text-green-300">PURCHASE ORDER</span>
                             </div>
                             <p class="text-2xl font-mono font-bold text-green-800 dark:text-green-200">{{ hpoKey }}</p>
                         </div>
                         
                         <!-- Status Tree Selection - BIGGER TEXT -->
                         <div>
                             <label class="text-base font-bold text-gray-700 dark:text-gray-300 mb-3 block">STATUS LOGISTICS</label>
                             
                             <div class="bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
                                 <!-- Ex-Works -->
                                 <div class="border-l-4 pl-3 transition-all" :class="statusData.status === 'Follow up with our forwarder' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300'">
                                     <div class="cursor-pointer py-2" @click="statusData.status = 'Follow up with our forwarder'">
                                         <div class="flex items-center gap-3 mb-2">
                                             <div class="w-3 h-3 rounded-full" :class="statusData.status === 'Follow up with our forwarder' ? 'bg-blue-600' : 'bg-gray-300'"></div>
                                             <span class="text-base font-medium" :class="statusData.status === 'Follow up with our forwarder' ? 'text-blue-700 dark:text-blue-300 font-bold' : 'text-gray-600 dark:text-gray-400'">Barang Ready (Ex-Works)</span>
                                         </div>
                                         <div class="ml-6">
                                             <label class="text-xs text-gray-500 dark:text-gray-400 block mb-1">Tanggal Ex-Work:</label>
                                             <input v-model="statusData.exwork_date" type="date" class="w-full px-3 py-1.5 text-sm border-2 border-gray-300 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 ring-blue-500 outline-none" @click.stop />
                                         </div>
                                     </div>
                                 </div>
                                 
                                 <!-- ETA Port JKT -->
                                 <div class="border-l-4 pl-3 transition-all" :class="statusData.status === 'ETA Port JKT' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300'">
                                     <div class="cursor-pointer py-2" @click="statusData.status = 'ETA Port JKT'">
                                         <div class="flex items-center gap-3 mb-2">
                                             <div class="w-3 h-3 rounded-full" :class="statusData.status === 'ETA Port JKT' ? 'bg-blue-600' : 'bg-gray-300'"></div>
                                             <span class="text-base font-medium" :class="statusData.status === 'ETA Port JKT' ? 'text-blue-700 dark:text-blue-300 font-bold' : 'text-gray-600 dark:text-gray-400'">Sedang Transit (ETA JKT)</span>
                                         </div>
                                         <div class="ml-6">
                                             <label class="text-xs text-gray-500 dark:text-gray-400 block mb-1">Tanggal ETA Port:</label>
                                             <input v-model="statusData.eta_date" type="date" class="w-full px-3 py-1.5 text-sm border-2 border-gray-300 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 ring-blue-500 outline-none" @click.stop />
                                         </div>
                                     </div>
                                 </div>
                                 
                                 <!-- Tiba Dunex -->
                                 <div class="border-l-4 pl-3 transition-all" :class="statusData.status === 'Already in siemens Warehouse' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300'">
                                     <div class="cursor-pointer py-2" @click="statusData.status = 'Already in siemens Warehouse'">
                                         <div class="flex items-center gap-3 mb-2">
                                             <div class="w-3 h-3 rounded-full" :class="statusData.status === 'Already in siemens Warehouse' ? 'bg-blue-600' : 'bg-gray-300'"></div>
                                             <span class="text-base font-medium" :class="statusData.status === 'Already in siemens Warehouse' ? 'text-blue-700 dark:text-blue-300 font-bold' : 'text-gray-600 dark:text-gray-400'">Tiba di Dunex</span>
                                         </div>
                                         <div class="ml-6">
                                             <label class="text-xs text-gray-500 dark:text-gray-400 block mb-1">Tanggal Tiba Dunex:</label>
                                             <input v-model="statusData.dunex_date" type="date" class="w-full px-3 py-1.5 text-sm border-2 border-gray-300 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 ring-blue-500 outline-none" @click.stop />
                                         </div>
                                     </div>
                                 </div>
                                 
                                 <!-- Tiba Hokiindo -->
                                 <div class="border-l-4 pl-3 transition-all" :class="statusData.status === 'Already in Hokiindo Raya' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300'">
                                     <div class="cursor-pointer py-2" @click="statusData.status = 'Already in Hokiindo Raya'">
                                         <div class="flex items-center gap-3 mb-2">
                                             <div class="w-3 h-3 rounded-full" :class="statusData.status === 'Already in Hokiindo Raya' ? 'bg-blue-600' : 'bg-gray-300'"></div>
                                             <span class="text-base font-medium" :class="statusData.status === 'Already in Hokiindo Raya' ? 'text-blue-700 dark:text-blue-300 font-bold' : 'text-gray-600 dark:text-gray-400'">Tiba di Hokiindo (Siap Kirim)</span>
                                         </div>
                                         <div class="ml-6">
                                             <label class="text-xs text-gray-500 dark:text-gray-400 block mb-1">Tanggal Tiba Hokiindo:</label>
                                             <input v-model="statusData.hokiindo_date" type="date" class="w-full px-3 py-1.5 text-sm border-2 border-gray-300 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 ring-blue-500 outline-none" @click.stop />
                                         </div>
                                     </div>
                                 </div>
                             </div>
                         </div>
                         
                         <!-- Admin Notes -->
                         <div class="mt-4">
                             <label class="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 block">Keterangan Admin (Internal)</label>
                             <textarea v-model="statusData.admin_notes" rows="3" class="w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 p-3 text-sm focus:ring-2 ring-blue-500 dark:ring-blue-400 outline-none rounded placeholder-gray-400" placeholder="Tulis catatan internal di sini..."></textarea>
                         </div>
                     </div>
                 </div>
              </div>
          </div>

          <!-- Footer with buttons - Always visible at bottom -->
          <div class="sticky bottom-0 p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex justify-end items-center gap-4">
              <button @click="isModalOpen = false" class="px-6 py-2.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white text-sm font-bold border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">BATAL</button>
              <button @click="saveUpdate" :disabled="isSubmitting" class="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 font-bold text-sm rounded shadow-lg active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"><Loader2 v-if="isSubmitting" class="w-4 h-4 animate-spin" /> {{ isSubmitting ? 'SAVING...' : isBulkMode ? 'UPDATE ALL' : 'UPDATE ITEM' }}</button>
          </div>
        </SheetContent>
      <!-- Excel Import Confirmation Modal -->
      <div v-if="isExcelModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden font-source-code relative">
          
          <!-- Loading overlay during save -->
          <div v-if="isExcelParsing" class="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] z-50 flex flex-col items-center justify-center space-y-4">
            <div class="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col items-center space-y-3 max-w-sm text-center">
              <RefreshCw class="w-10 h-10 text-emerald-600 dark:text-emerald-400 animate-spin" />
              <h4 class="font-bold text-sm text-slate-900 dark:text-white">Menyimpan Perubahan...</h4>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">Sedang mengirim data pembaruan pelacakan ke database, mohon jangan tutup halaman ini.</p>
              
              <!-- Progress bar -->
              <div class="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                <div class="bg-emerald-600 h-full transition-all duration-300" :style="{ width: `${excelRowsToUpdate.length > 0 ? (excelProgressCount / excelRowsToUpdate.length) * 100 : 0}%` }"></div>
              </div>
              <span class="text-[10px] font-bold text-slate-600 dark:text-slate-400">
                Memproses {{ excelProgressCount }} dari {{ excelRowsToUpdate.length }} item
              </span>
            </div>
          </div>
          
          <!-- Header -->
          <div class="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex justify-between items-center shrink-0">
            <div>
              <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet class="w-5 h-5 text-emerald-600 dark:text-emerald-400"/>
                Konfirmasi Update Status (Excel)
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Ditemukan <strong>{{ excelRowsToUpdate.length }}</strong> item yang cocok dengan HSO ini. Silakan tinjau perbedaan di bawah sebelum menerapkan.
              </p>
            </div>
            <button @click="isExcelModalOpen = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl font-bold p-1">&times;</button>
          </div>
          
          <!-- Table Grid Content -->
          <div class="p-6 overflow-y-auto flex-1 space-y-4">
            <div class="border rounded-lg overflow-hidden border-slate-200 dark:border-slate-800">
              <Table>
                <TableHeader class="bg-slate-100 dark:bg-slate-950 sticky top-0 z-10 shadow-sm">
                  <TableRow>
                    <TableHead class="font-bold text-xs text-slate-500">HPO Number</TableHead>
                    <TableHead class="font-bold text-xs text-slate-500">Item SKU</TableHead>
                    <TableHead class="font-bold text-xs text-slate-500">Status (Lama → Baru)</TableHead>
                    <TableHead class="font-bold text-xs text-slate-500">Ex-Works Date (Lama → Baru)</TableHead>
                    <TableHead class="font-bold text-xs text-slate-500">ETA Jakarta (Lama → Baru)</TableHead>
                    <TableHead class="font-bold text-xs text-slate-500">Delivery Date (Lama → Baru)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow 
                    v-for="(row, idx) in excelRowsToUpdate" 
                    :key="idx"
                    class="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors text-xs"
                  >
                    <TableCell class="font-bold">{{ row.hpoNumber }}</TableCell>
                    <TableCell class="font-medium text-slate-600 dark:text-slate-400">{{ row.itemCode }}</TableCell>
                    
                    <!-- Status -->
                    <TableCell>
                      <div class="flex flex-col">
                        <span class="text-slate-400 line-through">{{ row.dbStatus || '-' }}</span>
                        <span class="font-bold text-slate-900 dark:text-white" :class="row.dbStatus !== row.excelStatus && 'text-blue-600 dark:text-blue-400'">
                          {{ row.excelStatus || '-' }}
                        </span>
                      </div>
                    </TableCell>
                    
                    <!-- Exwork -->
                    <TableCell>
                      <div class="flex flex-col">
                        <span class="text-slate-400 line-through">{{ row.dbExwork || '-' }}</span>
                        <span v-if="row.excelExwork === '__waiting__'" class="font-bold text-amber-600 dark:text-amber-400 text-xs italic">
                          ⏳ Waiting for confirmation
                        </span>
                        <span v-else class="font-bold text-slate-900 dark:text-white" :class="row.dbExwork !== row.excelExwork && 'text-emerald-600 dark:text-emerald-400'">
                          {{ row.excelExwork || '-' }}
                        </span>
                      </div>
                    </TableCell>
                    
                    <!-- ETA -->
                    <TableCell>
                      <div class="flex flex-col">
                        <span class="text-slate-400 line-through">{{ row.dbEta || '-' }}</span>
                        <span class="font-bold text-slate-900 dark:text-white" :class="row.dbEta !== row.excelEta && 'text-emerald-600 dark:text-emerald-400'">
                          {{ row.excelEta || '-' }}
                        </span>
                      </div>
                    </TableCell>
                    
                    <!-- Delivery -->
                    <TableCell>
                      <div class="flex flex-col">
                        <span class="text-slate-400 line-through">{{ row.dbDelivery || '-' }}</span>
                        <span class="font-bold text-slate-900 dark:text-white" :class="row.dbDelivery !== row.excelDelivery && 'text-emerald-600 dark:text-emerald-400'">
                          {{ row.excelDelivery || '-' }}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
          
          <!-- Footer Buttons -->
          <div class="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex justify-end items-center gap-3 shrink-0">
            <button 
              @click="isExcelModalOpen = false" 
              class="px-5 py-2 text-slate-600 dark:text-slate-400 text-xs font-bold border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              BATAL
            </button>
            <Button 
              @click="applyExcelUpdates" 
              :disabled="isExcelParsing"
              class="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-6 py-2 transition-all flex items-center gap-1.5 shadow-md"
            >
              <RefreshCw v-if="isExcelParsing" class="w-3.5 h-3.5 animate-spin"/>
              {{ isExcelParsing ? 'Menyimpan...' : 'TERAPKAN UPDATE MASSAL' }}
            </Button>
          </div>
        </div>
      </div>
      </Sheet>
</div>
    </div>
  </div>
</template>

<style>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
.dark .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #475569; }
</style>