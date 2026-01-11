<script setup>
import { onMounted, ref, computed, watch } from 'vue'
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
  ChevronDown, ChevronUp, Plane, Box
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const soId = route.params.id

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
const errorMessage = ref(null)
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


const isAllSelected = computed(() => {
    if (!soDetail.value?.items) return false
    const activeItems = soDetail.value.items.filter(i => !i.is_fully_shipped)
    return activeItems.length > 0 && selectedItemCodes.value.length === activeItems.length
})

// --- COMPUTED: PURCHASING (Saran Order) ---
const itemsToPurchase = computed(() => {
    if (!soDetail.value || !soDetail.value.items) return []
    return soDetail.value.items.filter(item => {
        // Hanya tampilkan jika qty_to_order > 0 (no stock atau stock sebagian)
        if (item.qty_to_order <= 0) return false;
        
        // Jangan tampilkan jika sudah selesai dikirim (sudah ada HDO dan fully shipped)
        if (item.is_fully_shipped) return false;
        
        // Cek apakah sudah ada HPO dari database atau dari Accurate sync
        const hasHpoInDb = item.logistics_hpo && item.logistics_hpo.trim().length > 0;
        const hasHpoFromAccurate = hpoMapping.value[item.code] || (hpoDetails.value && hpoDetails.value.some(p => p.itemCode === item.code));
        const isProcessRunning = item.logistics_status !== 'Pending Process';
        
        // Jangan tampilkan jika sudah ada HPO atau status bukan Pending
        if (hasHpoInDb || hasHpoFromAccurate || isProcessRunning) return false;
        
        return true;
    })
})

// --- COMPUTED: RIWAYAT DOKUMEN ---
const groupedShipments = computed(() => {
    if (!soDetail.value) return [];
    const shipmentsMap = new Map();
    
    if (soDetail.value.shipments) {
        soDetail.value.shipments.forEach(s => {
            const key = s.no.trim().toLowerCase();
            shipmentsMap.set(key, { 
                no: s.no, 
                date: s.date, 
                status: s.status, 
                source: s.source || 'ACCURATE', 
                items: s.items || [] // Use items from shipment if available
            });
        });
    }

    if (soDetail.value.items) {
        soDetail.value.items.forEach(item => {
            const hdoRaw = item.logistics_hdo ? item.logistics_hdo.trim() : null;
            if (hdoRaw) {
                const key = hdoRaw.toLowerCase();
                if (shipmentsMap.has(key)) {
                    shipmentsMap.get(key).items.push(item);
                } else {
                    shipmentsMap.set(key, { no: hdoRaw, date: item.logistics_date ? formatDateSimple(item.logistics_date) : '-', status: 'Manual Update', source: 'MANUAL', items: [item] });
                }
            }
        });
    }
    return Array.from(shipmentsMap.values()).sort((a, b) => b.no.localeCompare(a.no));
})

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

// Helper untuk format tanggal sederhana
const formatDateSimple = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

const exportToExcel = () => {
    if (itemsToPurchase.value.length === 0) return alert("Tidak ada barang yang perlu dipesan.");
    const headers = ['Kode Produk', 'Nama Produk', 'Total Order', 'Stock Gudang', 'SARAN ORDER', 'Keterangan'];
    const rows = itemsToPurchase.value.map(i => {
        const safeName = i.name ? i.name.replace(/,/g, ' ') : '-';
        return [`"${i.code}"`, `"${safeName}"`, i.qty_order, i.parsed_stock_qty, i.qty_to_order, `"${i.admin_note}"`].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ORDER_LIST_${soDetail.value.number}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- BACKGROUND HPO FETCH ---
const fetchHpoInBackground = async (soNumber) => {
  try {
    isSyncing.value = true
    isHpoSyncing.value = true
    syncMessage.value = 'Sinkronisasi status PO dari Accurate...'
    syncProgress.value = 0
    console.log(`Background: Fetching HPO for ${soNumber}...`)
    
    syncProgress.value = 20
    
    const { data: poData, error: poError } = await supabase.functions.invoke('accurate-list-po', {
      body: { hsoNumber: soNumber }
    })
    
    syncProgress.value = 60
    
    if (!poError && poData?.d) {
      const mapping = {}
      const items = poData.d
      const totalItems = items.length
      
      items.forEach((item, idx) => {
        if (item.itemCode && item.poNumber) {
          mapping[item.itemCode] = item.poNumber
        }
        syncProgress.value = 60 + Math.round((idx + 1) / Math.max(totalItems, 1) * 35)
      })
      
      hpoMapping.value = mapping
      hpoDetails.value = items
      console.log(`Background: Found ${Object.keys(mapping).length} HPO mappings from ${poData.totalPOs || 'N/A'} POs checked`)
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
      
      items.forEach(mapItem => {
        // mapItem structure: { itemCode, doNumber, doDate }
        mapping[mapItem.itemCode] = mapItem.doNumber
      })
      
      hdoMapping.value = { ...hdoMapping.value, ...mapping }
      console.log(`Background: Found ${Object.keys(mapping).length} HDO mappings`)

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

// --- 2. DATA FETCHING ---
const fetchDetail = async (skipHpoSync = false) => {
  isLoading.value = true
  loadingProgress.value = 0
  loadingMessage.value = 'Menghubungkan ke Accurate...'
  
  try {
    loadingProgress.value = 20
    loadingMessage.value = 'Mengambil data HSO...'
    
    const { data: accData, error: accError } = await supabase.functions.invoke('accurate-detail-so', {
      body: { id: parseInt(soId), type: 'sales-order' }
    })
    
    loadingProgress.value = 50
    
    // Check specific error structure from Edge Function
    if (accError) throw accError
    
    if (!accData || !accData.s) {
        throw new Error(accData?.message || "Gagal mengambil data dari Accurate (Response Invalid).")
    }

    loadingProgress.value = 70
    loadingMessage.value = 'Memuat data pengiriman...'

    const { data: shipData } = await supabase.from('shipments').select('*').eq('so_id', String(soId))
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

    const linkData = await supabase.from('so_tracking_links').select('unique_code').eq('so_id', String(soId)).maybeSingle()
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
        const myShipment = shipmentList.value.find(s => s.item_code === code) || {}
        
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
          hokiindo_date: myShipment.hokiindo_date || null
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

onMounted(() => fetchDetail())

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
  
  // Jika sudah ada pengiriman sebagian (masih ada sisa), status = DIKIRIM SEBAGIAN
  if (item.qty_shipped > 0 && item.qty_remaining > 0) {
    return { text: 'DIKIRIM SEBAGIAN', class: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800', icon: Truck }
  }
  
  // Jika sudah dikirim semua (tidak ada sisa tapi belum dikonfirmasi fully_shipped)
  if (item.qty_shipped > 0 && item.qty_remaining === 0) {
    return { text: 'PRODUK SUDAH DIKIRIM', class: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800', icon: CheckCircle2 }
  }
  
  // Cek HPO dari Accurate
  const hpoEntries = getHpoEntries(item)
  
  // Jika ada HPO dari Accurate, status = SUDAH DIPESAN
  if (hpoEntries.length > 0) {
    return { text: 'SUDAH DIPESAN', class: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800', icon: CheckCircle2 }
  }
  
  // Jika belum ada HPO dan perlu order (stock kurang)
  if (item.qty_to_order > 0) {
    return { text: 'PERLU DIPESAN', class: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800', icon: AlertCircle }
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

// Helper: Get quantity shipped in HDO for specific item
const getHdoQty = (item) => {
  const hdoNumber = hdoMapping.value[item.code] || item.logistics_hdo
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
  
  // Find ALL PO items that match this item code
  const poItems = hpoDetails.value.filter(p => p.itemCode === item.code)
  return poItems.map(p => ({
    poNumber: p.poNumber,
    quantity: p.quantity,
    description: p.description
  }))
}

const openSiePortal = (item) => { const code = item.code ? item.code.trim() : ''; if(!code || code === '-') return; window.open(`https://sieportal.siemens.com/en-id/products-services/detail/${code}?tree=CatalogTree`, '_blank'); }
const toggleSelectAll = () => { if (isAllSelected.value) selectedItemCodes.value = []; else selectedItemCodes.value = soDetail.value.items.filter(i => !i.is_fully_shipped).map(i => i.code) }
const toggleSelection = (code) => { if (selectedItemCodes.value.includes(code)) selectedItemCodes.value = selectedItemCodes.value.filter(id => id !== code); else selectedItemCodes.value.push(code) }
const openActionModal = (item) => { 
  isBulkMode.value = false
  selectedItem.value = item
  selectedItemCodes.value = []
  
  console.log('📝 Opening modal for item:', item.code, 'Status:', item.logistics_status)
  
  // Auto-populate dengan data yang sudah ada
  const existingHpo = hpoMapping.value[item.code] || ''
  const existingStatus = item.logistics_status || 'Follow up with our forwarder'
  
  // Get all separate date fields
  const existingExworkDate = item.exwork_date || ''
  const existingEtaDate = item.eta_date || ''
  const existingDunexDate = item.dunex_date || ''
  const existingHokiindoDate = item.hokiindo_date || ''
  const existingNotes = item.logistics_note || ''
  
  formStatus.value = { 
    hpo: existingHpo,
    hdo: '', 
    exwork_date: existingExworkDate,
    eta_date: existingEtaDate,
    dunex_date: existingDunexDate,
    hokiindo_date: existingHokiindoDate,
    notes: '', 
    admin_notes: existingNotes
  }
  
  console.log('📋 Form populated:', { 
    status: existingStatus, 
    admin_notes: existingNotes 
  })
  
  // Set status dari data yang ada
  const validStatuses = statusOptions.map(o => o.value)
  selectedTargetStatus.value = validStatuses.includes(existingStatus) ? existingStatus : 'Follow up with our forwarder'
  
  isModalOpen.value = true 
}
const openBulkEditModal = () => { if (selectedItemCodes.value.length === 0) return; isBulkMode.value = true; selectedItem.value = soDetail.value.items.find(i => i.code === selectedItemCodes.value[0]); formStatus.value = { hpo: '', hdo: '', date: getLocalDate(), notes: '', admin_notes: '' }; selectedTargetStatus.value = 'Follow up with our forwarder'; isModalOpen.value = true }

const saveUpdate = async () => { 
    isSubmitting.value = true
    const targetItems = isBulkMode.value ? soDetail.value.items.filter(i => selectedItemCodes.value.includes(i.code)) : [selectedItem.value]
    
    // Determine status: if admin_notes contains "Hold by Customer", set status to "Hold by Customer"
    const isHoldByCustomer = formStatus.value.admin_notes && formStatus.value.admin_notes.includes('Hold by Customer')
    let finalStatus = isHoldByCustomer ? 'Hold by Customer' : selectedTargetStatus.value
    
    let refNumber = formStatus.value.hpo
    if (selectedTargetStatus.value === 'On Delivery' || selectedTargetStatus.value === 'Completed') {
        refNumber = formStatus.value.hdo
    }
    
    console.log('💾 Saving update:', { 
        isHoldByCustomer, 
        finalStatus, 
        admin_notes: formStatus.value.admin_notes 
    })
    
    try { 
        for (const item of targetItems) { 
            const shipmentPayload = { 
                hpo_number: refNumber, 
                current_status: finalStatus, 
                exwork_date: formStatus.value.exwork_date || null,
                eta_date: formStatus.value.eta_date || null,
                dunex_date: formStatus.value.dunex_date || null,
                hokiindo_date: formStatus.value.hokiindo_date || null,
                updated_at: new Date(), 
                item_code: item.code, 
                admin_notes: formStatus.value.admin_notes 
            }
            
            console.log('📦 Shipment payload:', shipmentPayload)
            
            let shipmentId = item.logistics_id
            if (!shipmentId) { 
                const { data: newShip, error: errNew } = await supabase.from('shipments').insert({ so_id: String(soDetail.value.id), shipment_type: 'IMPORT_PO', ...shipmentPayload }).select().single()
                if (errNew) throw errNew
                shipmentId = newShip.id 
            } else { 
                const { error: errUpd } = await supabase.from('shipments').update(shipmentPayload).eq('id', shipmentId)
                if (errUpd) throw errUpd 
            } 
            // Determine event_date based on current status
            let eventDate = null
            if (finalStatus === 'Follow up with our forwarder') eventDate = formStatus.value.exwork_date
            else if (finalStatus === 'ETA Port JKT') eventDate = formStatus.value.eta_date
            else if (finalStatus === 'Already in siemens Warehouse') eventDate = formStatus.value.dunex_date
            else if (finalStatus === 'Already in Hokiindo Raya') eventDate = formStatus.value.hokiindo_date
            else if (finalStatus === 'Hold by Customer') eventDate = new Date().toISOString().split('T')[0] // Use today's date for hold
            
            // Log dengan informasi user
            const userEmail = currentUser.value?.email || 'Unknown User'
            const itemName = item.name || item.code
            await supabase.from('shipment_logs').insert({ 
              shipment_id: shipmentId, 
              status_name: finalStatus, 
              event_date: eventDate, 
              notes: formStatus.value.notes || (isBulkMode.value ? 'Bulk Update' : ''),
              user_email: userEmail,
              action_detail: `Update item "${itemName}" ke status "${finalStatus}"`
            }) 
        } 
        // Skip HPO sync when updating status (HPO data doesn't change)
        await fetchDetail(true) // true = skip HPO sync
        isModalOpen.value = false
        selectedItemCodes.value = [] 
    } catch (error) { alert("Gagal update status: " + error.message) } finally { isSubmitting.value = false } 
}

const shareToClient = async () => { let codeToUse = uniqueTrackingCode.value; if (!codeToUse) { const newUniqueCode = generateUUID(); const { data, error } = await supabase.from('so_tracking_links').insert({ so_id: String(soId), unique_code: newUniqueCode }).select('unique_code').single(); if (error) { alert('Gagal generate link'); return } codeToUse = data.unique_code; uniqueTrackingCode.value = codeToUse; } const trackingUrl = `${window.location.origin}/public/tracking/${codeToUse}`; navigator.clipboard.writeText(trackingUrl).then(() => { isLinkCopied.value = true; setTimeout(() => isLinkCopied.value = false, 3000); }) }
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

        <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-2 border-b border-gray-200 dark:border-gray-800 pb-6">
          <div class="space-y-2">
            <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
              <span class="cursor-pointer hover:text-red-600 dark:hover:text-red-400 transition-colors" @click="router.push('/sales-orders')">Sales Orders</span>
              <span class="text-gray-300 dark:text-gray-600">/</span>
              <span class="font-medium text-gray-900 dark:text-white">Detail</span>
            </div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">{{ soDetail.client }}</h1>
            <div class="flex items-center gap-3 text-sm font-medium text-gray-500 dark:text-gray-400">
               <span class="flex items-center gap-1.5"><Calendar class="w-4 h-4"/> {{ soDetail.date }}</span>
               <span class="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
               <span class="flex items-center gap-1.5"><Building2 class="w-4 h-4"/> {{ soDetail.number }}</span>
               <span class="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
               <span class="text-gray-900 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">PO: {{ soDetail.po_number }}</span>
            </div>
          </div>
          <div class="flex gap-3">
              <Button v-if="selectedItemCodes.length > 0" size="lg" class="shadow-sm bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 transition-all animate-in zoom-in-95 duration-200" @click="openBulkEditModal">
                <Layers class="w-4 h-4 mr-2"/> Update ({{ selectedItemCodes.length }}) Item
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

        <Card class="border shadow-sm rounded-lg overflow-hidden bg-white dark:bg-slate-800 dark:border-slate-700">
          <CardHeader class="border-b border-gray-100 dark:border-slate-700 px-6 py-4 bg-white dark:bg-slate-800">
            <div class="flex items-center justify-between"><CardTitle class="text-base font-bold text-gray-800 dark:text-white">Detail Produk & Logistik</CardTitle></div>
          </CardHeader>
          <div class="overflow-x-auto">
            <Table>
              <TableHeader class="bg-gray-50 dark:bg-slate-900">
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
                    v-for="(item, idx) in soDetail.items" 
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
                    <div class="font-semibold text-gray-900 dark:text-slate-200 text-sm cursor-pointer hover:text-red-600 dark:hover:text-red-400 hover:underline flex items-center gap-1 group-hover/link" @click="openSiePortal(item)" title="Klik untuk membuka SiePortal">{{ item.name }}<ExternalLink class="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"/></div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 flex items-center gap-1">{{ item.code }}</div>
                    <div v-if="item.admin_note" class="text-[10px] text-gray-400 italic mt-1 border-t border-dashed pt-1 max-w-[200px]">Note: {{ item.admin_note }}</div>
                  </TableCell>
                  
                  <TableCell class="text-center align-top pt-4 text-gray-900 dark:text-slate-300 font-medium">{{ item.qty_order }}</TableCell>
                  
                  <TableCell class="text-center align-top pt-4 text-gray-600 dark:text-gray-400">
                      <span class="font-bold text-gray-900 dark:text-white">{{ item.parsed_stock_qty }}</span>
                  </TableCell>
                  
                  <TableCell class="text-center align-top pt-4 bg-blue-50/30 dark:bg-blue-900/10">
                      <div class="flex flex-col items-center gap-1">
                          <span class="font-bold text-blue-600 dark:text-blue-400">{{ item.qty_shipped }}</span>
                          <!-- HDO (Resi) Display - di kolom terkirim -->
                          <div v-if="hdoMapping[item.code] || (item.qty_shipped > 0 && item.logistics_hdo)">
                              <span class="text-blue-600 dark:text-blue-400 font-mono text-[10px] font-bold inline-flex items-center gap-1 border border-blue-100 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 px-1 py-0.5 rounded">
                                  <Truck class="w-2.5 h-2.5"/> {{ hdoMapping[item.code] || item.logistics_hdo }} ({{ getHdoQty(item) || item.qty_shipped }} {{ item.unit }})
                              </span>
                          </div>
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
                    <div v-else-if="isSyncing && item.qty_shipped > 0 && !hdoMapping[item.code]" class="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700">
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
                        
                        <!-- HPO Number + Logistics Status Combined (Support Multiple POs) -->
                        <div v-if="!item.is_fully_shipped && getHpoEntries(item).length > 0" class="mt-1.5 space-y-2">
                            <div v-for="(hpo, idx) in getHpoEntries(item)" :key="idx" class="bg-white dark:bg-slate-800 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3">
                                <!-- HPO Number -->
                                <div class="flex items-center gap-2 mb-2 pb-2 border-b border-dashed border-gray-200 dark:border-gray-700">
                                    <ShoppingCart class="w-4 h-4 text-green-600 dark:text-green-400" />
                                    <span class="text-xs font-bold text-gray-600 dark:text-gray-400">HPO:</span>
                                    <span class="text-sm font-mono font-bold text-green-700 dark:text-green-300">{{ hpo.poNumber }}</span>
                                    <span class="text-xs text-gray-500 dark:text-gray-400">({{ hpo.quantity }} {{ item.unit }})</span>
                                </div>
                                
                                <!-- Logistics Status Tree (if exists for this item) -->
                                <div v-if="item.logistics_status && item.logistics_status !== 'Pending Process'" class="space-y-1.5">
                                    <div class="flex items-center gap-2 mb-1">
                                        <Truck class="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                                        <span class="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase">Status Logistics</span>
                                    </div>
                                    
                                    <!-- Status Items -->
                                    <div class="space-y-1 pl-1">
                                        <!-- ExWork -->
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-2">
                                                <div class="w-2 h-2 rounded-full" :class="item.logistics_status === 'Follow up with our forwarder' ? 'bg-blue-600 ring-2 ring-blue-300' : 'bg-gray-300'"></div>
                                                <span class="text-xs" :class="item.logistics_status === 'Follow up with our forwarder' ? 'text-blue-700 dark:text-blue-300 font-bold' : 'text-gray-500 dark:text-gray-500'">Ex-Works</span>
                                            </div>
                                            <span class="text-[10px] font-mono text-gray-500 dark:text-gray-400">{{ item.exwork_date ? formatDateSimple(item.exwork_date) : '-' }}</span>
                                        </div>
                                        
                                        <!-- ETA Port -->
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-2">
                                                <div class="w-2 h-2 rounded-full" :class="item.logistics_status === 'ETA Port JKT' ? 'bg-blue-600 ring-2 ring-blue-300' : 'bg-gray-300'"></div>
                                                <span class="text-xs" :class="item.logistics_status === 'ETA Port JKT' ? 'text-blue-700 dark:text-blue-300 font-bold' : 'text-gray-500 dark:text-gray-500'">ETA Port JKT</span>
                                            </div>
                                            <span class="text-[10px] font-mono text-gray-500 dark:text-gray-400">{{ item.eta_date ? formatDateSimple(item.eta_date) : '-' }}</span>
                                        </div>
                                        
                                        <!-- Tiba Dunex -->
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-2">
                                                <div class="w-2 h-2 rounded-full" :class="item.logistics_status === 'Already in siemens Warehouse' ? 'bg-blue-600 ring-2 ring-blue-300' : 'bg-gray-300'"></div>
                                                <span class="text-xs" :class="item.logistics_status === 'Already in siemens Warehouse' ? 'text-blue-700 dark:text-blue-300 font-bold' : 'text-gray-500 dark:text-gray-500'">Tiba Dunex</span>
                                            </div>
                                            <span class="text-[10px] font-mono text-gray-500 dark:text-gray-400">{{ item.dunex_date ? formatDateSimple(item.dunex_date) : '-' }}</span>
                                        </div>
                                        
                                        <!-- Tiba Hokiindo -->
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-2">
                                                <div class="w-2 h-2 rounded-full" :class="item.logistics_status === 'Already in Hokiindo Raya' ? 'bg-blue-600 ring-2 ring-blue-300' : 'bg-gray-300'"></div>
                                                <span class="text-xs" :class="item.logistics_status === 'Already in Hokiindo Raya' ? 'text-blue-700 dark:text-blue-300 font-bold' : 'text-gray-500 dark:text-gray-500'">Tiba Hokiindo</span>
                                            </div>
                                            <span class="text-[10px] font-mono text-gray-500 dark:text-gray-400">{{ item.hokiindo_date ? formatDateSimple(item.hokiindo_date) : '-' }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Notifikasi kekurangan untuk partial shipment -->
                            <div v-if="item.qty_shipped > 0 && item.qty_remaining > 0" class="text-[10px] text-orange-600 dark:text-orange-400 italic flex items-center gap-1">
                                <AlertCircle class="w-3 h-3" />
                                Pemesanan Kekurangan ({{ item.qty_remaining }} {{ item.unit }})
                            </div>
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
                        <div v-else-if="item.qty_to_order > 0 && !item.is_fully_shipped && !isSyncing && getHpoEntries(item).length === 0" class="mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
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
                    <div v-if="!isSyncing && item.logistics_note && !item.logistics_note.includes('Auto-synced')" class="text-[11px] text-gray-600 dark:text-gray-400 mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded border-l-2 border-gray-300 dark:border-gray-600">
                        <div class="font-bold text-[9px] uppercase text-gray-500 mb-0.5">Note:</div>
                        {{ item.logistics_note }}
                    </div>
                  </TableCell>
                  
                  <TableCell class="text-right pr-6 align-top pt-3">
                    <!-- Edit button only shows after sync completes -->
                    <Button v-if="!isSyncing" size="sm" variant="outline" class="h-8 px-3 rounded border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-600 dark:hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all bg-white dark:bg-slate-800 flex items-center gap-1.5 ml-auto" @click="openActionModal(item)"><Edit class="w-3.5 h-3.5"/><span class="text-xs font-bold">Edit</span></Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
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
        <Card v-else-if="itemsToPurchase.length > 0" class="border shadow-sm rounded-lg bg-white dark:bg-slate-800 border-l-4 border-l-red-600 animate-in slide-in-from-bottom-2 duration-500">
            <CardHeader class="pb-3 border-b border-gray-100 dark:border-slate-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors select-none" @click="isPurchaseExpanded = !isPurchaseExpanded">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <component :is="isPurchaseExpanded ? ChevronUp : ChevronDown" class="w-5 h-5 text-gray-500 transition-transform duration-200" />
                        <div>
                            <CardTitle class="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                <AlertTriangle class="w-5 h-5 text-red-600"/>
                                Barang Perlu di Order
                                <Badge class="bg-red-100 text-red-700 hover:bg-red-200 border-0">{{ itemsToPurchase.length }} Item</Badge>
                            </CardTitle>
                            <CardDescription class="mt-1" v-if="isPurchaseExpanded">
                                Daftar berikut adalah barang yang <b>belum memiliki stock</b> berdasarkan catatan admin.
                            </CardDescription>
                            <CardDescription class="mt-0" v-else>
                                Klik untuk melihat detail barang yang perlu dipesan.
                            </CardDescription>
                        </div>
                    </div>
                    <div @click.stop>
                        <Button variant="outline" class="border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" @click="exportToExcel">
                            <Download class="w-4 h-4 mr-2"/> Download Excel
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <div v-show="isPurchaseExpanded" class="p-0 overflow-x-auto transition-all duration-300">
                <Table>
                    <TableHeader class="bg-red-50/50 dark:bg-red-900/10">
                        <TableRow>
                            <TableHead class="w-[40%] text-xs font-bold uppercase text-gray-500">Produk</TableHead>
                            <TableHead class="text-center text-xs font-bold uppercase text-gray-500">Stock Gudang (Note)</TableHead>
                            <TableHead class="text-center text-xs font-bold uppercase text-red-600">Saran Order</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow v-for="(item, idx) in itemsToPurchase" :key="idx" class="border-b border-gray-100 dark:border-slate-700 last:border-0">
                            <TableCell class="py-3">
                                <div class="font-bold text-sm text-gray-800 dark:text-gray-200">{{ item.name }}</div>
                                <div class="text-xs text-gray-400 font-mono">{{ item.code }}</div>
                            </TableCell>
                            <TableCell class="text-center">
                                <span v-if="item.parsed_stock_qty === 'Ready'" class="text-xs font-bold text-emerald-600">READY</span>
                                <span v-else>{{ item.parsed_stock_qty }}</span>
                            </TableCell>
                            <TableCell class="text-center">
                                <Badge class="bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-3">
                                    {{ item.order_suggestion }} {{ item.unit }}
                                </Badge>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
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
                            <div class="bg-white dark:bg-slate-800 p-1.5 rounded border border-gray-200 dark:border-slate-600 text-blue-600 dark:text-blue-400 shadow-sm">
                                <Truck class="w-4 h-4"/>
                            </div>
                            <div>
                                <div class="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                    {{ doItem.no }}
                                    <span v-if="doItem.source === 'MANUAL'" class="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">MANUAL</span>
                                </div>
                                <div class="text-xs text-gray-500 dark:text-gray-400">{{ doItem.date }}</div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <Badge variant="secondary" class="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300">{{ doItem.status }}</Badge>
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
              
              <!-- JIKA BELUM ADA HPO: Hanya Peringatan + Admin Notes -->
              <div v-if="selectedItem && !hpoMapping[selectedItem.code] && selectedItem.qty_to_order > 0">
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
                  <div>
                      <label class="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 block">Keterangan Admin (Internal)</label>
                      <textarea v-model="formStatus.admin_notes" rows="4" class="w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 p-3 text-sm focus:ring-2 ring-red-500 dark:ring-red-400 outline-none rounded placeholder-gray-400" placeholder="Tulis catatan internal tentang status pembelian..."></textarea>
                  </div>
              </div>
              
              <!-- JIKA SUDAH ADA HPO: Tampilkan Tree Selection -->
              <div v-else-if="selectedItem && hpoMapping[selectedItem.code]">
                  <!-- HPO Info Box - BIGGER -->
                  <div class="bg-green-50 dark:bg-green-900/20 p-5 rounded-lg border-2 border-green-300 dark:border-green-700">
                      <div class="flex items-center gap-3 mb-2">
                          <ShoppingCart class="w-7 h-7 text-green-600 dark:text-green-400" />
                          <span class="text-base font-bold text-green-700 dark:text-green-300">PURCHASE ORDER</span>
                      </div>
                      <p class="text-2xl font-mono font-bold text-green-800 dark:text-green-200">{{ hpoMapping[selectedItem.code] }}</p>
                  </div>
                  
                  <!-- Status Tree Selection - BIGGER TEXT -->
                  <div>
                      <label class="text-base font-bold text-gray-700 dark:text-gray-300 mb-3 block">STATUS LOGISTICS</label>
                      
                      <div class="bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
                          <!-- Ex-Works -->
                          <div class="border-l-4 pl-3 transition-all" :class="selectedTargetStatus === 'Follow up with our forwarder' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300'">
                              <div class="cursor-pointer py-2" @click="selectedTargetStatus = 'Follow up with our forwarder'">
                                  <div class="flex items-center gap-3 mb-2">
                                      <div class="w-3 h-3 rounded-full" :class="selectedTargetStatus === 'Follow up with our forwarder' ? 'bg-blue-600' : 'bg-gray-300'"></div>
                                      <span class="text-base font-medium" :class="selectedTargetStatus === 'Follow up with our forwarder' ? 'text-blue-700 dark:text-blue-300 font-bold' : 'text-gray-600 dark:text-gray-400'">Barang Ready (Ex-Works)</span>
                                  </div>
                                  <div class="ml-6">
                                      <label class="text-xs text-gray-500 dark:text-gray-400 block mb-1">Tanggal Ex-Work:</label>
                                      <input v-model="formStatus.exwork_date" type="date" class="w-full px-3 py-1.5 text-sm border-2 border-gray-300 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 ring-blue-500 outline-none" @click.stop />
                                  </div>
                              </div>
                          </div>
                          
                          <!-- ETA Port JKT -->
                          <div class="border-l-4 pl-3 transition-all" :class="selectedTargetStatus === 'ETA Port JKT' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300'">
                              <div class="cursor-pointer py-2" @click="selectedTargetStatus = 'ETA Port JKT'">
                                  <div class="flex items-center gap-3 mb-2">
                                      <div class="w-3 h-3 rounded-full" :class="selectedTargetStatus === 'ETA Port JKT' ? 'bg-blue-600' : 'bg-gray-300'"></div>
                                      <span class="text-base font-medium" :class="selectedTargetStatus === 'ETA Port JKT' ? 'text-blue-700 dark:text-blue-300 font-bold' : 'text-gray-600 dark:text-gray-400'">Sedang Transit (ETA JKT)</span>
                                  </div>
                                  <div class="ml-6">
                                      <label class="text-xs text-gray-500 dark:text-gray-400 block mb-1">Tanggal ETA Port:</label>
                                      <input v-model="formStatus.eta_date" type="date" class="w-full px-3 py-1.5 text-sm border-2 border-gray-300 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 ring-blue-500 outline-none" @click.stop />
                                  </div>
                              </div>
                          </div>
                          
                          <!-- Tiba Dunex -->
                          <div class="border-l-4 pl-3 transition-all" :class="selectedTargetStatus === 'Already in siemens Warehouse' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300'">
                              <div class="cursor-pointer py-2" @click="selectedTargetStatus = 'Already in siemens Warehouse'">
                                  <div class="flex items-center gap-3 mb-2">
                                      <div class="w-3 h-3 rounded-full" :class="selectedTargetStatus === 'Already in siemens Warehouse' ? 'bg-blue-600' : 'bg-gray-300'"></div>
                                      <span class="text-base font-medium" :class="selectedTargetStatus === 'Already in siemens Warehouse' ? 'text-blue-700 dark:text-blue-300 font-bold' : 'text-gray-600 dark:text-gray-400'">Tiba di Dunex</span>
                                  </div>
                                  <div class="ml-6">
                                      <label class="text-xs text-gray-500 dark:text-gray-400 block mb-1">Tanggal Tiba Dunex:</label>
                                      <input v-model="formStatus.dunex_date" type="date" class="w-full px-3 py-1.5 text-sm border-2 border-gray-300 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 ring-blue-500 outline-none" @click.stop />
                                  </div>
                              </div>
                          </div>
                          
                          <!-- Tiba Hokiindo -->
                          <div class="border-l-4 pl-3 transition-all" :class="selectedTargetStatus === 'Already in Hokiindo Raya' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300'">
                              <div class="cursor-pointer py-2" @click="selectedTargetStatus = 'Already in Hokiindo Raya'">
                                  <div class="flex items-center gap-3 mb-2">
                                      <div class="w-3 h-3 rounded-full" :class="selectedTargetStatus === 'Already in Hokiindo Raya' ? 'bg-blue-600' : 'bg-gray-300'"></div>
                                      <span class="text-base font-medium" :class="selectedTargetStatus === 'Already in Hokiindo Raya' ? 'text-blue-700 dark:text-blue-300 font-bold' : 'text-gray-600 dark:text-gray-400'">Tiba di Hokiindo</span>
                                  </div>
                                  <div class="ml-6">
                                      <label class="text-xs text-gray-500 dark:text-gray-400 block mb-1">Tanggal Tiba Hokiindo:</label>
                                      <input v-model="formStatus.hokiindo_date" type="date" class="w-full px-3 py-1.5 text-sm border-2 border-gray-300 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 ring-blue-500 outline-none" @click.stop />
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>
                  
                  <!-- Admin Notes -->
                  <div>
                      <label class="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 block">Keterangan Admin (Internal)</label>
                      <textarea v-model="formStatus.admin_notes" rows="3" class="w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 p-3 text-sm focus:ring-2 ring-blue-500 dark:ring-blue-400 outline-none rounded placeholder-gray-400" placeholder="Tulis catatan internal di sini..."></textarea>
                  </div>
              </div>
              
              <!-- JIKA ITEM READY (Stock Ada, Tidak Perlu PO) -->
              <div v-else-if="selectedItem && selectedItem.qty_to_order === 0">
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
                      <textarea v-model="formStatus.admin_notes" rows="3" class="w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 p-3 text-sm focus:ring-2 ring-blue-500 outline-none rounded placeholder-gray-400" placeholder="Tulis catatan internal di sini..."></textarea>
                      
                      <!-- Quick Text Button -->
                      <div class="mt-2 flex gap-2">
                          <button 
                              type="button"
                              @click="() => { const holdText = 'Hold by Customer'; if (!formStatus.admin_notes.includes(holdText)) { formStatus.admin_notes = formStatus.admin_notes ? `${holdText}\n${formStatus.admin_notes}` : holdText } }"
                              class="px-3 py-1.5 text-xs font-bold bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded border border-amber-300 dark:border-amber-700 transition-colors flex items-center gap-1.5"
                          >
                              <Clock class="w-3 h-3" />
                              Hold by Customer
                          </button>
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