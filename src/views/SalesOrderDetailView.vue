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
  Dialog, DialogContent
} from '@/components/ui/dialog'
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
const isSubmitting = ref(false)
const isModalOpen = ref(false)
const uniqueTrackingCode = ref(null)
const isLinkCopied = ref(false)
const errorMessage = ref(null)

const selectedItemCodes = ref([]) 
const isBulkMode = ref(false)    
const selectedItem = ref(null)    
const selectedTargetStatus = ref('') 

// State Toggle
const isPurchaseExpanded = ref(false) 
const expandedDocNo = ref(null)

// --- KONFIGURASI STATUS ---
const statusOptions = [
  { value: 'Pending Process', label: 'Pesanan Menunggu Proses', type: 'none', placeholder: '', dateLabel: '' },
  { value: 'Follow up to factory', label: 'Order ke Principle (Indent)', type: 'hpo', placeholder: 'NO HPO', dateLabel: 'Tgl Order' },
  { value: 'Follow up with our forwarder', label: 'Barang Ready (Ex-Works)', type: 'date', placeholder: 'Ex Work Date', dateLabel: 'Ex Work Date' },
  { value: 'ETA Port JKT', label: 'Sedang Transit (ETA JKT)', type: 'date', placeholder: 'Eta Port Date', dateLabel: 'ETA Port' },
  { value: 'Already in siemens Warehouse', label: 'Tiba di Gudang Dunex', type: 'date', placeholder: 'Date', dateLabel: 'Tiba Dunex' },
  { value: 'Already in Hokiindo Raya', label: 'Tiba di Gudang Hokiindo', type: 'date', placeholder: 'Date', dateLabel: 'Tiba Hokiindo' },
  { value: 'On Delivery', label: 'Sedang Dikirim ke Customer', type: 'hdo', placeholder: 'No. Surat Jalan / HDO (Baru)', dateLabel: 'Tgl Jalan' },
  { value: 'Completed', label: 'Selesai Diterima Customer', type: 'date', placeholder: 'Tanggal Diterima', dateLabel: 'Diterima Tgl' }
]

const getLocalDate = () => {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - (offset * 60 * 1000))
  return localDate.toISOString().split('T')[0]
}

const formStatus = ref({
  step: '', hpo: '', hdo: '', date: getLocalDate(), notes: '', admin_notes: '', is_hold: false
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
        // Tampilkan di card alert jika To Order > 0 DAN belum ada HPO
        if (item.qty_to_order <= 0) return false;
        
        const hasHPO = item.logistics_hpo && item.logistics_hpo.trim().length > 0;
        const isProcessRunning = item.logistics_status !== 'Pending Process';
        
        if (hasHPO || isProcessRunning) return false;
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
            shipmentsMap.set(key, { no: s.no, date: s.date, status: s.status, source: 'ACCURATE', items: [] });
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
    
    if (lower.includes('no stock') || lower.includes('non stock') || lower.includes('kosong') || lower.includes('indent')) {
        return { qty: 0, isReady: false, hasInfo: true };
    }
    const match = lower.match(/(?:stock|stok|sisa)\s*[:.]?\s*(\d+)/);
    if (match) {
        return { qty: parseInt(match[1]), isReady: false, hasInfo: true };
    }
    if (lower.includes('stock') || lower.includes('stok') || lower.includes('ready')) {
        // PERBAIKAN LOGIC: Jika Ready, kita tandai true, qty nanti diset sama dengan Order
        return { qty: 999999, isReady: true, hasInfo: true }; 
    }
    return { qty: 0, isReady: false, hasInfo: false };
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

// --- 2. DATA FETCHING ---
const fetchDetail = async () => {
  isLoading.value = true
  try {
    const { data: accData, error: accError } = await supabase.functions.invoke('accurate-detail-so', {
      body: { id: parseInt(soId), type: 'sales-order' }
    })
    
    // Check specific error structure from Edge Function
    if (accError) throw accError
    
    if (!accData || !accData.s) {
        throw new Error(accData?.message || "Gagal mengambil data dari Accurate (Response Invalid).")
    }

    const { data: shipData } = await supabase.from('shipments').select('*').eq('so_id', String(soId))
    shipmentList.value = shipData || []

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

    const { data: linkData } = await supabase.from('so_tracking_links').select('unique_code').eq('so_id', String(soId)).maybeSingle()
    uniqueTrackingCode.value = linkData?.unique_code || null

    const d = accData.d
    const history = d.processHistory || []
    const rawItems = d.detailItem || []
    const sortedItems = rawItems.sort((a, b) => (a.seq || 0) - (b.seq || 0))

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
          
          parsed_stock_qty: stockInfo.isReady ? qty_stock_admin : qty_stock_admin, // Tampilkan Angka
          qty_to_order: qty_to_order, 
          
          admin_note: note,
          parsed_has_info: stockInfo.hasInfo,
          order_suggestion: qty_to_order,

          is_fully_shipped: qty_remaining <= 0,
          
          logistics_status: myShipment.current_status || 'Pending Process', 
          logistics_hpo: myShipment.hpo_number || null,
          logistics_date: myShipment.status_date || myShipment.updated_at || null, 
          logistics_id: myShipment.id || null,
          logistics_id: myShipment.id || null,
          logistics_hdo: myShipment.hpo_number && ['On Delivery','Completed'].includes(myShipment.current_status) ? myShipment.hpo_number : null,
          logistics_note: myShipment.admin_notes || null
        }
      }),
      shipments: history.filter(h => h.historyType === 'DO').map(h => ({ no: h.historyNumber, date: h.historyDate, status: h.approvalStatus })),
      invoices: history.filter(h => h.historyType === 'SI').map(h => ({ no: h.historyNumber, date: h.historyDate, status: h.approvalStatus }))
    }
  } catch (err) {
    console.error("Fetch Error:", err)
    errorMessage.value = err.message || "Terjadi kesalahan tidak diketahui."
    // router.push('/sales-orders')
  } finally {
    isLoading.value = false
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
const formatDateSimple = (dateStr) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
const fulfillmentPercentage = (items) => {
  if (!items || items.length === 0) return 0
  const total = items.reduce((acc, i) => acc + i.qty_order, 0)
  const shipped = items.reduce((acc, i) => acc + i.qty_shipped, 0)
  return total === 0 ? 0 : Math.round((shipped / total) * 100)
}

const getRowStatus = (item) => {
  if (item.is_fully_shipped) return { text: 'SELESAI', class: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', icon: CheckCircle2 }
  
  const status = item.logistics_status
  if (status === 'Hold by Customer') return { text: 'ON HOLD', class: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800', icon: Clock }
  
  switch (status) {
    case 'Pending Process': return { text: 'MENUNGGU', class: 'bg-gray-100 text-gray-600 border-gray-200', icon: Hourglass }
    case 'Follow up to factory': return { text: 'ORDER PABRIK', class: 'bg-amber-50 text-amber-700 border-amber-200', icon: FileText }
    case 'Follow up with our forwarder': return { text: 'EX-WORKS', class: 'bg-orange-50 text-orange-700 border-orange-200', icon: Factory }
    case 'ETA Port JKT': return { text: 'TRANSIT', class: 'bg-blue-50 text-blue-700 border-blue-200', icon: Anchor }
    case 'Already in siemens Warehouse': return { text: 'WH DUNEX', class: 'bg-cyan-50 text-cyan-700 border-cyan-200', icon: Building2 }
    case 'Already in Hokiindo Raya': return { text: 'WH HOKIINDO', class: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: MapPin }
    case 'On Delivery': return { text: 'KIRIM BARANG', class: 'bg-blue-100 text-blue-700 border-blue-200', icon: Truck }
    case 'Completed': return { text: 'DITERIMA', class: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 }
    default: return { text: 'MENUNGGU', class: 'bg-gray-100 text-gray-600 border-gray-200', icon: Hourglass }
  }
}

const openSiePortal = (item) => { const code = item.code ? item.code.trim() : ''; if(!code || code === '-') return; window.open(`https://sieportal.siemens.com/en-id/products-services/detail/${code}?tree=CatalogTree`, '_blank'); }
const toggleSelectAll = () => { if (isAllSelected.value) selectedItemCodes.value = []; else selectedItemCodes.value = soDetail.value.items.filter(i => !i.is_fully_shipped).map(i => i.code) }
const toggleSelection = (code) => { if (selectedItemCodes.value.includes(code)) selectedItemCodes.value = selectedItemCodes.value.filter(id => id !== code); else selectedItemCodes.value.push(code) }
const openActionModal = (item) => { isBulkMode.value = false; selectedItem.value = item; selectedItemCodes.value = []; formStatus.value = { hpo: item.logistics_hpo || '', hdo: '', date: getLocalDate(), notes: '', admin_notes: item.logistics_note || '', is_hold: item.logistics_status === 'Hold by Customer' }; selectedTargetStatus.value = item.logistics_status || 'Pending Process'; if(item.is_fully_shipped && item.logistics_status === 'Pending Process') selectedTargetStatus.value = 'Completed'; isModalOpen.value = true }
const openBulkEditModal = () => { if (selectedItemCodes.value.length === 0) return; isBulkMode.value = true; selectedItem.value = soDetail.value.items.find(i => i.code === selectedItemCodes.value[0]); formStatus.value = { hpo: '', hdo: '', date: getLocalDate(), notes: '', admin_notes: '', is_hold: false }; selectedTargetStatus.value = 'Pending Process'; isModalOpen.value = true }

const saveUpdate = async () => { 
    isSubmitting.value = true
    const targetItems = isBulkMode.value ? soDetail.value.items.filter(i => selectedItemCodes.value.includes(i.code)) : [selectedItem.value]
    let finalStatus = formStatus.value.is_hold ? 'Hold by Customer' : selectedTargetStatus.value
    let refNumber = formStatus.value.hpo
    if (selectedTargetStatus.value === 'On Delivery' || selectedTargetStatus.value === 'Completed') {
        refNumber = formStatus.value.hdo
    }
    try { 
        for (const item of targetItems) { 
            const shipmentPayload = { hpo_number: refNumber, current_status: finalStatus, status_date: formStatus.value.date, updated_at: new Date(), item_code: item.code, admin_notes: formStatus.value.admin_notes }
            let shipmentId = item.logistics_id
            if (!shipmentId) { 
                const { data: newShip, error: errNew } = await supabase.from('shipments').insert({ so_id: String(soDetail.value.id), shipment_type: 'IMPORT_PO', ...shipmentPayload }).select().single()
                if (errNew) throw errNew
                shipmentId = newShip.id 
            } else { 
                const { error: errUpd } = await supabase.from('shipments').update(shipmentPayload).eq('id', shipmentId)
                if (errUpd) throw errUpd 
            } 
            // Log dengan informasi user
            const userEmail = currentUser.value?.email || 'Unknown User'
            const itemName = item.name || item.code
            await supabase.from('shipment_logs').insert({ 
              shipment_id: shipmentId, 
              status_name: finalStatus, 
              event_date: formStatus.value.date, 
              notes: formStatus.value.notes || (isBulkMode.value ? 'Bulk Update' : ''),
              user_email: userEmail,
              action_detail: `Update item "${itemName}" ke status "${finalStatus}"`
            }) 
        } 
        await fetchDetail()
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

      <div v-else-if="isLoading" class="flex flex-col items-center justify-center h-[60vh] animate-pulse">
        <Loader2 class="w-12 h-12 animate-spin text-red-600 dark:text-red-500 mb-4" />
        <p class="text-gray-500 dark:text-gray-400 font-medium">Memuat data pesanan...</p>
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
              <TableHeader class="bg-gray-50/50 dark:bg-slate-800/50">
                <TableRow class="border-b border-gray-200 dark:border-slate-700">
                  <TableHead class="w-[40px] text-center"><input type="checkbox" class="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer" :checked="isAllSelected" @change="toggleSelectAll"/></TableHead>
                  <TableHead class="w-[25%] py-3 pl-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Produk</TableHead>
                  
                  <TableHead class="text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[8%]">Order</TableHead>
                  <TableHead class="text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[8%]">Stock (Gudang)</TableHead>
                  <TableHead class="text-center text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider w-[10%] bg-blue-50/30 dark:bg-blue-900/10">To Order</TableHead>
                  <TableHead class="text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[8%]">Terkirim</TableHead>
                  <TableHead class="text-center text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider w-[10%] bg-red-50/30 dark:bg-red-900/10">Sisa (Kirim)</TableHead>
                  
                  <TableHead class="pl-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[15%]">Status</TableHead>
                  <TableHead class="text-right pr-6 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[8%]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow 
                    v-for="(item, idx) in soDetail.items" 
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
                      <div v-if="item.qty_to_order > 0"><span class="text-blue-600 dark:text-blue-400 font-bold text-sm">{{ item.qty_to_order }}</span></div>
                      <div v-else class="text-gray-300 text-xs">-</div>
                  </TableCell>

                  <TableCell class="text-center align-top pt-4 text-gray-500 dark:text-gray-400">{{ item.qty_shipped }}</TableCell>
                  
                  <TableCell class="text-center align-top pt-4 bg-red-50/30 dark:bg-red-900/10">
                    <div v-if="item.qty_remaining > 0"><span class="text-red-600 dark:text-red-400 font-bold text-sm">{{ item.qty_remaining }}</span></div>
                    <div v-else><CheckCircle2 class="w-5 h-5 text-emerald-500 mx-auto" /></div>
                  </TableCell>

                  <TableCell class="pl-4 align-top pt-3">
                    <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-bold shadow-sm mb-1" :class="getRowStatus(item).class"><component :is="getRowStatus(item).icon" class="w-3.5 h-3.5" />{{ getRowStatus(item).text }}</div>
                    <div v-if="item.logistics_hpo && !['Pending Process'].includes(item.logistics_status)" class="text-[11px] text-gray-500 mt-1 font-mono">
                        <span v-if="['On Delivery', 'Completed'].includes(item.logistics_status)">HDO: {{ item.logistics_hpo }}</span>
                        <span v-else>HPO: {{ item.logistics_hpo }}</span>
                    </div>
                    <div v-if="item.logistics_note" class="text-[11px] text-blue-600 dark:text-blue-400 mt-1 font-mono italic border-t border-dashed border-blue-200 dark:border-blue-900/30 pt-1">
                        Note: {{ item.logistics_note }}
                    </div>
                  </TableCell>
                  
                  <TableCell class="text-right pr-6 align-top pt-3">
                    <Button size="sm" variant="outline" class="h-8 px-3 rounded border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-600 dark:hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all bg-white dark:bg-slate-800 flex items-center gap-1.5 ml-auto" @click="openActionModal(item)"><Edit class="w-3.5 h-3.5"/><span class="text-xs font-bold">Edit</span></Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card v-if="itemsToPurchase.length > 0" class="border shadow-sm rounded-lg bg-white dark:bg-slate-800 border-l-4 border-l-red-600 animate-in slide-in-from-bottom-2 duration-500">
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
            <CardHeader class="pb-3 border-b border-gray-100 dark:border-slate-700 px-6 py-4"><CardTitle class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2"><FileText class="w-4 h-4"/> Riwayat Dokumen</CardTitle></CardHeader>
            <CardContent class="pt-4 px-6 pb-6">
              <div v-if="groupedShipments.length || soDetail.invoices.length" class="space-y-3">
                
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


      <Dialog :open="isModalOpen" @update:open="isModalOpen = $event">
        <DialogContent class="sm:max-w-[500px] p-0 overflow-hidden gap-0 rounded-none bg-[#e5e5e5] dark:bg-[#1a1a1a] font-source-code border-0 shadow-2xl">
          <div class="p-6 pb-2">
              <div class="flex justify-between items-start"><h2 class="text-2xl font-bold text-black dark:text-white mb-4">{{ isBulkMode ? `Update (${selectedItemCodes.length}) Item` : 'Update Item' }}</h2></div>
              <div class="bg-white dark:bg-[#2a2a2a] p-4 flex flex-col gap-1 shadow-sm border-l-4 border-black dark:border-white mb-4">
                  <div v-if="!isBulkMode" class="w-full flex justify-between items-start">
                      <span class="font-bold text-sm text-black dark:text-white truncate max-w-[300px]">{{ selectedItem?.name }}</span>
                      <span class="text-xs font-mono text-gray-500">{{ selectedItem?.code }}</span>
                  </div>
                  <div v-else class="w-full"><p class="font-bold text-sm text-black dark:text-white">Mass Update</p></div>
                  <div v-if="selectedItem" class="grid grid-cols-2 gap-2 mt-2">
                      <div class="bg-emerald-50 dark:bg-emerald-900/20 p-2 border border-emerald-100 dark:border-emerald-800 rounded">
                          <p class="text-[10px] uppercase font-bold text-emerald-600">Sudah Dikirim</p>
                          <p class="text-lg font-bold text-emerald-800 dark:text-emerald-300">{{ selectedItem.qty_shipped }} <span class="text-[10px] text-gray-400">Unit</span></p>
                      </div>
                      <div class="bg-red-50 dark:bg-red-900/20 p-2 border border-red-100 dark:border-red-800 rounded">
                          <p class="text-[10px] uppercase font-bold text-red-600">Sisa Kirim (Hutang)</p>
                          <p class="text-lg font-bold text-red-800 dark:text-red-300">{{ selectedItem.qty_remaining }} <span class="text-[10px] text-gray-400">Unit</span></p>
                      </div>
                  </div>
              </div>
              <div class="space-y-3 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
                  <div v-for="opt in statusOptions" :key="opt.value" class="bg-white dark:bg-[#2a2a2a] p-1 shadow-sm transition-all duration-200" :class="selectedTargetStatus === opt.value ? 'ring-2 ring-black dark:ring-white scale-[1.01]' : 'opacity-80 hover:opacity-100'">
                      <div class="p-3 flex justify-between items-center cursor-pointer" @click="selectedTargetStatus = opt.value"><span class="text-sm font-medium text-black dark:text-white">{{ opt.label }}</span>
                          <span v-if="(opt.type === 'hpo' && formStatus.hpo) && selectedTargetStatus !== opt.value && opt.value !== 'Completed'" class="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1">{{ formStatus.hpo }}</span>
                          <span v-if="(opt.type === 'hdo' && formStatus.hdo) && selectedTargetStatus !== opt.value" class="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1">{{ formStatus.hdo }}</span>
                      </div>
                      <div v-if="selectedTargetStatus === opt.value" class="px-3 pb-3 animate-in slide-in-from-top-1 duration-200">
                          <div v-if="opt.type === 'hpo'" class="flex gap-2"><div class="bg-[#1a1a1a] text-white px-3 py-2 text-xs flex items-center font-mono whitespace-nowrap min-w-[80px]">{{ opt.placeholder }}</div><input v-model="formStatus.hpo" type="text" class="flex-1 bg-[#333] text-white px-3 py-2 text-sm outline-none font-mono focus:bg-black transition-colors placeholder-gray-500" :placeholder="opt.placeholder"/></div>
                          <div v-else-if="opt.type === 'hdo'" class="flex gap-2"><div class="bg-[#1a1a1a] text-white px-3 py-2 text-xs flex items-center font-mono whitespace-nowrap min-w-[80px]">{{ opt.placeholder }}</div><input v-model="formStatus.hdo" type="text" class="flex-1 bg-[#333] text-white px-3 py-2 text-sm outline-none font-mono focus:bg-black transition-colors placeholder-gray-500" :placeholder="opt.placeholder"/></div>
                          <div v-else-if="opt.type === 'date'" class="flex flex-col gap-2"><div class="text-[10px] text-gray-500 font-mono flex items-center gap-1"><span class="text-red-600 font-bold">REF:</span> {{ formStatus.hpo || '-' }}</div><div class="flex gap-2"><div class="bg-[#1a1a1a] text-white px-3 py-2 text-xs flex items-center font-mono whitespace-nowrap min-w-[80px]">{{ opt.placeholder }}</div><input v-model="formStatus.date" type="date" class="flex-1 bg-[#333] text-white px-3 py-2 text-sm outline-none font-mono focus:bg-black transition-colors"/></div></div>
                      </div>
                  </div>
              </div>
              
              <div class="mt-4 px-1">
                  <label class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 block">Keterangan Admin (Internal)</label>
                  <textarea v-model="formStatus.admin_notes" rows="2" class="w-full bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 p-3 text-sm focus:ring-2 ring-black dark:ring-white outline-none rounded-none placeholder-gray-400" placeholder="Tulis catatan internal di sini..."></textarea>
              </div>

              <div class="flex items-center justify-between bg-white dark:bg-[#2a2a2a] p-3 border-l-4 mt-3" :class="formStatus.is_hold ? 'border-amber-500' : 'border-gray-300'"><span class="text-sm font-bold text-gray-700 dark:text-gray-300">Hold by Customer</span><Switch v-model:checked="formStatus.is_hold" class="data-[state=checked]:bg-amber-500"/></div>
          </div>
          <div class="p-4 bg-white dark:bg-[#2a2a2a] border-t border-gray-200 dark:border-gray-700 flex justify-end items-center gap-4">
              <button @click="isModalOpen = false" class="text-gray-500 hover:text-black dark:hover:text-white text-sm font-bold px-4">BATAL</button>
              <button @click="saveUpdate" :disabled="isSubmitting" class="bg-red-600 hover:bg-red-700 text-white px-8 py-3 font-bold text-sm shadow-lg active:scale-95 transition-all flex items-center gap-2"><Loader2 v-if="isSubmitting" class="w-4 h-4 animate-spin" /> {{ isSubmitting ? 'SAVING...' : isBulkMode ? 'UPDATE ALL' : 'UPDATE ITEM' }}</button>
          </div>
        </DialogContent>
      </Dialog>
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