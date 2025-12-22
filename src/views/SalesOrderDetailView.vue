<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

// UI Components
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  ArrowLeft, Loader2, Calendar, MapPin, Truck, Building2,
  Edit, Save, CheckCircle2, Clock, Anchor, Factory, FileText, AlertCircle, PackageCheck, Share2, Info, ExternalLink, Package, X, Hourglass, Layers, MessageSquare, PieChart
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const soId = route.params.id

// --- 1. STATE MANAGEMENT ---
const soDetail = ref(null)
const shipmentList = ref([])
const isLoading = ref(true)
const isSubmitting = ref(false)
const isModalOpen = ref(false)
const uniqueTrackingCode = ref(null)
const isLinkCopied = ref(false)

const selectedItemCodes = ref([]) 
const isBulkMode = ref(false)    
const selectedItem = ref(null)    
const selectedTargetStatus = ref('') 

// --- KONFIGURASI STATUS ---
const statusOptions = [
  { value: 'Pending Process', label: 'Pesanan Menunggu Proses', type: 'none', placeholder: '', dateLabel: '' },
  { value: 'Follow up to factory', label: 'Barang dipesan ke principle', type: 'hpo', placeholder: 'NO HPO', dateLabel: '' },
  { value: 'Follow up with our forwarder', label: 'Persiapan Pengiriman', type: 'date', placeholder: 'Ex Work Date', dateLabel: 'HPO/123/123/123' },
  { value: 'ETA Port JKT', label: 'Estimasi Tiba di Jakarta', type: 'date', placeholder: 'Eta Port Date', dateLabel: 'HPO/123/123/123' },
  { value: 'Already in siemens Warehouse', label: 'Tiba Digudang Siemens(Dunex)', type: 'date', placeholder: 'Date', dateLabel: 'HPO/123/123/123' },
  { value: 'Already in Hokiindo Raya', label: 'Tiba Digudang Hokiindo', type: 'date', placeholder: 'Date', dateLabel: 'HPO/123/123/123' },
  { value: 'Completed', label: 'Pengiriman Barang', type: 'hdo', placeholder: 'No HDO', dateLabel: '' }
]

const getLocalDate = () => {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - (offset * 60 * 1000))
  return localDate.toISOString().split('T')[0]
}

const formStatus = ref({
  step: '', hpo: '', hdo: '', date: getLocalDate(), notes: '', is_hold: false
})

const isAllSelected = computed(() => {
    if (!soDetail.value?.items) return false
    const activeItems = soDetail.value.items.filter(i => !i.is_fully_shipped)
    return activeItems.length > 0 && selectedItemCodes.value.length === activeItems.length
})

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// --- 2. DATA FETCHING ---
const fetchDetail = async () => {
  isLoading.value = true
  try {
    const { data: accData, error: accError } = await supabase.functions.invoke('accurate-detail-so', {
      body: { id: parseInt(soId), type: 'sales-order' }
    })
    if (accError || !accData || !accData.s) throw new Error("Gagal mengambil data dari Accurate.")

    const { data: shipData } = await supabase.from('shipments').select('*').eq('so_id', String(soId))
    shipmentList.value = shipData || []

    const { data: linkData } = await supabase.from('so_tracking_links').select('unique_code').eq('so_id', String(soId)).maybeSingle()
    uniqueTrackingCode.value = linkData?.unique_code || null

    const d = accData.d
    const history = d.processHistory || []

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
      items: d.detailItem.map(item => {
        const code = item.item?.no || '-'
        const myShipment = shipmentList.value.find(s => s.item_code === code) || {}
        
        // 1. Hitung Sisa
        const qty_order = item.quantity
        const qty_shipped = item.shipQuantity || 0
        const qty_sisa = qty_order - qty_shipped
        
        // 2. PARSING CATATAN ADMIN
        const note = item.detailNotes ? item.detailNotes.toUpperCase() : ''
        let admin_stock_val = null;

        if (note) {
            if (note.includes('NO STOCK') || note.includes('INDENT') || note.includes('KOSONG')) {
                admin_stock_val = 0; 
            } else {
                // Cari angka
                const match = note.match(/(?:STOCK|READY|SISA|QTY)[\s:.]*(\d+)/);
                if (match) {
                    admin_stock_val = parseInt(match[1]);
                } else if (note.includes('STOCK') || note.includes('READY')) {
                    // Jika cuma tulisan STOCK tanpa angka, ambil nilai qty_sisa (Ada sesuai kebutuhan)
                    admin_stock_val = qty_sisa; 
                }
            }
        }

        // 3. LOGIC STATUS
        let internal_status = 'PENDING';
        let qty_short = 0;

        if (qty_sisa > 0) {
            if (admin_stock_val !== null) {
                if (admin_stock_val === 0) {
                    internal_status = 'NO_STOCK';
                    qty_short = qty_sisa;
                } else if (admin_stock_val >= qty_sisa) {
                    internal_status = 'STOCK';
                    qty_short = 0;
                } else {
                    internal_status = 'PARTIAL'; 
                    qty_short = qty_sisa - admin_stock_val;
                }
            }
        } else {
            internal_status = 'COMPLETED';
        }

        return {
          code: code,
          name: item.item?.name || item.detailName,
          unit: item.itemUnit?.name || 'Pcs',
          unit_price: item.unitPrice,
          total_price: item.totalPrice,
          qty_order, qty_shipped, qty_sisa,
          
          admin_stock_val: admin_stock_val,
          admin_note: item.detailNotes,
          internal_status: internal_status,
          qty_short: qty_short,
          
          is_fully_shipped: qty_sisa <= 0,
          logistics_status: myShipment.current_status || null,
          logistics_hpo: myShipment.hpo_number || null,
          logistics_id: myShipment.id || null
        }
      }),
      shipments: history.filter(h => h.historyType === 'DO').map(h => ({ no: h.historyNumber, date: h.historyDate, status: h.approvalStatus })),
      invoices: history.filter(h => h.historyType === 'SI').map(h => ({ no: h.historyNumber, date: h.historyDate, status: h.approvalStatus }))
    }
  } catch (err) {
    console.error(err)
    alert(err.message)
    router.push('/sales-orders')
  } finally {
    isLoading.value = false
  }
}

onMounted(() => fetchDetail())

// --- 3. HELPERS ---
const formatCurrency = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0)
const fulfillmentPercentage = (items) => {
  if (!items || items.length === 0) return 0
  const total = items.reduce((acc, i) => acc + i.qty_order, 0)
  const shipped = items.reduce((acc, i) => acc + i.qty_shipped, 0)
  return total === 0 ? 0 : Math.round((shipped / total) * 100)
}

const getRowStatus = (item) => {
  if (item.is_fully_shipped) return { text: 'COMPLETED', sub: 'Pengiriman Selesai', class: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', icon: CheckCircle2 }
  const status = item.logistics_status
  if (status === 'Hold by Customer') return { text: 'HOLD', sub: 'Ditahan Customer', class: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800', icon: Clock }
  
  const isShippingProcess = ['Follow up with our forwarder', 'ETA Port JKT', 'Already in siemens Warehouse', 'Already in Hokiindo Raya'].includes(status)
  
  if (item.internal_status === 'STOCK' && !isShippingProcess) {
      return { text: 'STOCK', sub: 'Siap Dikirim', class: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800', icon: PackageCheck }
  }
  if (item.internal_status === 'NO_STOCK' && !isShippingProcess) {
      return { text: 'NO STOCK', sub: 'Menunggu Restock', class: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800', icon: AlertCircle }
  }
  if (item.internal_status === 'PARTIAL' && !isShippingProcess) {
      return { text: 'PARTIAL', sub: 'Stok Kurang Sebagian', class: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800', icon: Layers }
  }

  switch (status) {
    case 'Pending Process': return { text: 'PENDING', sub: 'Pesanan Menunggu Proses', class: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600', icon: Hourglass }
    case 'Follow up to factory': return { text: 'ON ORDER', sub: 'Barang dipesan ke principle', class: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800', icon: FileText }
    case 'Follow up with our forwarder': return { text: 'EX-WORKS', sub: 'Persiapan Pengiriman', class: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800', icon: Factory }
    case 'ETA Port JKT': return { text: 'TRANSIT', sub: 'Estimasi Tiba di Jakarta', class: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800', icon: Anchor }
    case 'Already in siemens Warehouse': return { text: 'WH DUNEX', sub: 'Tiba Digudang Siemens(Dunex)', class: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-800', icon: Building2 }
    case 'Already in Hokiindo Raya': return { text: 'WH HOKIINDO', sub: 'Tiba Digudang Hokiindo', class: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800', icon: MapPin }
    case 'Completed': return { text: 'DELIVERED', sub: 'Pengiriman Barang', class: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', icon: CheckCircle2 }
    default: return { text: 'PENDING', sub: 'Menunggu Proses', class: 'bg-gray-50 text-gray-500 border-dashed dark:bg-gray-800/50 dark:text-gray-500 dark:border-gray-700', icon: AlertCircle }
  }
}

const openSiePortal = (item) => { const code = item.code ? item.code.trim() : ''; if(!code || code === '-') return; window.open(`https://sieportal.siemens.com/en-id/products-services/detail/${code}?tree=CatalogTree`, '_blank'); }
const toggleSelectAll = () => { if (isAllSelected.value) selectedItemCodes.value = []; else selectedItemCodes.value = soDetail.value.items.filter(i => !i.is_fully_shipped).map(i => i.code) }
const toggleSelection = (code) => { if (selectedItemCodes.value.includes(code)) selectedItemCodes.value = selectedItemCodes.value.filter(id => id !== code); else selectedItemCodes.value.push(code) }
const openActionModal = (item) => { isBulkMode.value = false; selectedItem.value = item; selectedItemCodes.value = []; formStatus.value = { hpo: item.logistics_hpo || '', hdo: '', date: getLocalDate(), notes: '', is_hold: item.logistics_status === 'Hold by Customer' }; selectedTargetStatus.value = item.logistics_status || 'Pending Process'; if(item.is_fully_shipped) selectedTargetStatus.value = 'Completed'; isModalOpen.value = true }
const openBulkEditModal = () => { if (selectedItemCodes.value.length === 0) return; isBulkMode.value = true; selectedItem.value = soDetail.value.items.find(i => i.code === selectedItemCodes.value[0]); formStatus.value = { hpo: '', hdo: '', date: getLocalDate(), notes: '', is_hold: false }; selectedTargetStatus.value = 'Pending Process'; isModalOpen.value = true }
const saveUpdate = async () => { isSubmitting.value = true; const targetItems = isBulkMode.value ? soDetail.value.items.filter(i => selectedItemCodes.value.includes(i.code)) : [selectedItem.value]; let finalStatus = formStatus.value.is_hold ? 'Hold by Customer' : selectedTargetStatus.value; let refNumber = formStatus.value.hpo; if (selectedTargetStatus.value === 'Completed') refNumber = formStatus.value.hdo; try { for (const item of targetItems) { const shipmentPayload = { hpo_number: refNumber, current_status: finalStatus, updated_at: new Date(), item_code: item.code }; let shipmentId = item.logistics_id; if (!shipmentId) { const { data: newShip, error: errNew } = await supabase.from('shipments').insert({ so_id: String(soDetail.value.id), shipment_type: item.is_in_stock ? 'READY_STOCK' : 'IMPORT_PO', ...shipmentPayload }).select().single(); if (errNew) throw errNew; shipmentId = newShip.id } else { const { error: errUpd } = await supabase.from('shipments').update(shipmentPayload).eq('id', shipmentId); if (errUpd) throw errUpd } await supabase.from('shipment_logs').insert({ shipment_id: shipmentId, status_name: finalStatus, event_date: formStatus.value.date, notes: formStatus.value.notes || (isBulkMode.value ? 'Bulk Update' : '') }) } await fetchDetail(); isModalOpen.value = false; selectedItemCodes.value = [] } catch (error) { alert("Gagal update status: " + error.message) } finally { isSubmitting.value = false } }
const shareToClient = async () => { let codeToUse = uniqueTrackingCode.value; if (!codeToUse) { const newUniqueCode = generateUUID(); const { data, error } = await supabase.from('so_tracking_links').insert({ so_id: String(soId), unique_code: newUniqueCode }).select('unique_code').single(); if (error) { alert('Gagal generate link'); return } codeToUse = data.unique_code; uniqueTrackingCode.value = codeToUse; } const trackingUrl = `${window.location.origin}/public/tracking/${codeToUse}`; navigator.clipboard.writeText(trackingUrl).then(() => { isLinkCopied.value = true; setTimeout(() => isLinkCopied.value = false, 3000); }) }
</script>

<template>
  <div class="min-h-screen bg-gray-50/50 dark:bg-[#0f172a] pb-20 font-source-code transition-colors duration-300">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-8">

      <div v-if="isLoading" class="flex flex-col items-center justify-center h-[60vh] animate-pulse">
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
            <div class="flex items-center justify-between"><CardTitle class="text-base font-bold text-gray-800 dark:text-white">Detail Produk & Stok</CardTitle></div>
          </CardHeader>
          <div class="overflow-x-auto">
            <Table>
              <TableHeader class="bg-gray-50/50 dark:bg-slate-800/50">
                <TableRow class="border-b border-gray-200 dark:border-slate-700">
                  <TableHead class="w-[50px] text-center"><input type="checkbox" class="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer" :checked="isAllSelected" @change="toggleSelectAll"/></TableHead>
                  <TableHead class="w-[30%] py-3 pl-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Produk</TableHead>
                  <TableHead class="text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[10%]">Order</TableHead>
                  <TableHead class="text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[10%]">Kirim</TableHead>
                  
                  <TableHead class="text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[10%]">Belum Dikirim</TableHead>
                  
                  <TableHead class="text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[10%]">Stock dari Gudang</TableHead>
                  
                  <TableHead class="text-center text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider w-[10%] bg-red-50/30 dark:bg-red-900/10">Kekurangan</TableHead>
                  <TableHead class="pl-6 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[15%]">Status</TableHead>
                  <TableHead class="text-right pr-6 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[8%]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="(item, idx) in soDetail.items" :key="idx" class="group hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors border-b border-gray-100 dark:border-slate-700 last:border-0">
                  
                  <TableCell class="text-center"><input v-if="!item.is_fully_shipped" type="checkbox" class="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer" :checked="selectedItemCodes.includes(item.code)" @change="toggleSelection(item.code)"/></TableCell>

                  <TableCell class="pl-2 py-4 align-top">
                    <div class="font-semibold text-gray-900 dark:text-slate-200 text-sm cursor-pointer hover:text-red-600 dark:hover:text-red-400 hover:underline flex items-center gap-1 group-hover/link" @click="openSiePortal(item)" title="Klik untuk membuka SiePortal">{{ item.name }}<ExternalLink class="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"/></div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 flex items-center gap-1">{{ item.code }}</div>
                  </TableCell>

                  <TableCell class="text-center align-top text-gray-900 dark:text-slate-300 font-medium">{{ item.qty_order }}</TableCell>
                  <TableCell class="text-center align-top text-gray-500 dark:text-gray-400">{{ item.qty_shipped }}</TableCell>
                  <TableCell class="text-center align-top"><span v-if="item.qty_sisa > 0" class="font-bold text-gray-900 dark:text-slate-200">{{ item.qty_sisa }}</span><span v-else class="text-gray-300 dark:text-slate-600">-</span></TableCell>

                  <TableCell class="text-center align-top">
                    <div v-if="item.qty_sisa > 0" class="flex flex-col items-center">
                        <div v-if="item.admin_stock_val !== null">
                            <span class="font-bold text-gray-900 dark:text-white">{{ item.admin_stock_val }}</span>
                            
                        </div>
                        <span v-else class="text-gray-300 dark:text-slate-600 font-medium">-</span>
                    </div>
                    <span v-else class="text-gray-300 dark:text-slate-600">-</span>
                  </TableCell>

                  <TableCell class="text-center align-top bg-red-50/30 dark:bg-red-900/10">
                    <div v-if="item.qty_sisa > 0">
                        <Badge v-if="item.qty_short > 0" variant="solid" class="bg-red-600 hover:bg-red-700 text-white border-0 shadow-sm dark:bg-red-700 dark:hover:bg-red-600">
                            -{{ item.qty_short }}
                        </Badge>
                        <span v-else class="text-emerald-600 dark:text-emerald-400 font-bold text-xs flex justify-center items-center gap-1">
                            <CheckCircle2 class="w-4 h-4"/> Cukup
                        </span>
                    </div>
                    <span v-else class="text-gray-300 dark:text-slate-600">-</span>
                  </TableCell>

                  <TableCell class="pl-6 align-top">
                    <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-bold shadow-sm" :class="getRowStatus(item).class">
                      <component :is="getRowStatus(item).icon" class="w-3.5 h-3.5" />{{ getRowStatus(item).text }}
                    </div>
                    
                    <div v-if="item.admin_note" class="mt-1 flex items-start gap-1">
                        <MessageSquare class="w-3 h-3 text-gray-400 mt-0.5"/>
                        <span class="text-[10px] text-gray-500 italic max-w-[120px] leading-tight">{{ item.admin_note }}</span>
                    </div>

                    <div v-if="item.logistics_hpo" class="flex items-center gap-1 mt-1.5 text-[11px] text-gray-500 dark:text-gray-400 font-medium"><Factory class="w-3 h-3 text-gray-400"/><span>{{ item.logistics_hpo }}</span></div>
                  </TableCell>

                  <TableCell class="text-right pr-6 align-top">
                    <Button 
                      v-if="!item.is_fully_shipped" 
                      size="sm" 
                      variant="outline" 
                      class="h-8 px-3 rounded border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-600 dark:hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all bg-white dark:bg-slate-800 flex items-center gap-1.5 ml-auto" 
                      @click="openActionModal(item)"
                    >
                      <Edit class="w-3.5 h-3.5"/>
                      <span class="text-xs font-bold">Edit</span>
                    </Button>
                    <span v-else class="text-emerald-600 dark:text-emerald-400"><CheckCircle2 class="w-5 h-5 ml-auto"/></span>
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
              <div v-if="soDetail.shipments.length || soDetail.invoices.length" class="space-y-3">
                <div v-for="doItem in soDetail.shipments" :key="doItem.no" class="flex justify-between items-center bg-gray-50 dark:bg-slate-700/50 p-3 rounded-lg border border-gray-200 dark:border-slate-600">
                  <div class="flex items-center gap-3"><div class="bg-white dark:bg-slate-800 p-1.5 rounded border border-gray-200 dark:border-slate-600 text-blue-600 dark:text-blue-400 shadow-sm"><Truck class="w-4 h-4"/></div><div><div class="text-sm font-bold text-gray-800 dark:text-white">{{ doItem.no }}</div><div class="text-xs text-gray-500 dark:text-gray-400">{{ doItem.date }}</div></div></div>
                  <Badge variant="secondary" class="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300">{{ doItem.status }}</Badge>
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

      </div>

      <Dialog :open="isModalOpen" @update:open="isModalOpen = $event">
        <DialogContent class="sm:max-w-[500px] p-0 overflow-hidden gap-0 rounded-none bg-[#e5e5e5] dark:bg-[#1a1a1a] font-source-code border-0 shadow-2xl">
          <div class="p-6 pb-2">
              <div class="flex justify-between items-start"><h2 class="text-2xl font-bold text-black dark:text-white mb-4">{{ isBulkMode ? `Update (${selectedItemCodes.length}) Item` : 'Update Item' }}</h2></div>
              <div class="bg-white dark:bg-[#2a2a2a] p-4 flex items-center justify-between shadow-sm border-l-4 border-black dark:border-white">
                  <div v-if="!isBulkMode" class="w-full flex justify-between items-center"><span class="font-bold text-sm text-black dark:text-white truncate max-w-[300px]">{{ selectedItem?.name }}</span><span class="text-xs font-mono text-gray-500">{{ selectedItem?.code }}</span></div>
                  <div v-else class="w-full"><p class="font-bold text-sm text-black dark:text-white">Mass Update</p><p class="text-xs text-gray-500 mt-1">Status akan diterapkan ke {{ selectedItemCodes.length }} item yang dipilih.</p></div>
              </div>
          </div>
          <div class="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div v-if="!isBulkMode"><p class="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2 uppercase">Status Produk</p><div class="bg-red-600 text-white p-4 font-bold text-sm shadow-md flex justify-between items-center"><span>{{ selectedItem?.logistics_status || 'Menunggu Proses' }}</span><div v-if="formStatus.is_hold" class="bg-white text-red-600 text-[10px] px-2 py-0.5 rounded font-bold">ON HOLD</div></div></div>
              <div class="space-y-3">
                  <div v-for="opt in statusOptions" :key="opt.value" class="bg-white dark:bg-[#2a2a2a] p-1 shadow-sm transition-all duration-200" :class="selectedTargetStatus === opt.value ? 'ring-2 ring-black dark:ring-white scale-[1.01]' : 'opacity-80 hover:opacity-100'">
                      <div class="p-3 flex justify-between items-center cursor-pointer" @click="selectedTargetStatus = opt.value"><span class="text-sm font-medium text-black dark:text-white">{{ opt.label }}</span>
                          <span v-if="(opt.type === 'hpo' && formStatus.hpo) && selectedTargetStatus !== opt.value && opt.value !== 'Completed'" class="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1">{{ formStatus.hpo }}</span>
                          <span v-if="(opt.type === 'hdo' && formStatus.hdo) && selectedTargetStatus !== opt.value" class="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1">{{ formStatus.hdo }}</span>
                      </div>
                      <div v-if="selectedTargetStatus === opt.value" class="px-3 pb-3 animate-in slide-in-from-top-1 duration-200">
                          <div v-if="opt.type === 'hpo'" class="flex gap-2"><div class="bg-[#1a1a1a] text-white px-3 py-2 text-xs flex items-center font-mono whitespace-nowrap min-w-[80px]">{{ opt.placeholder }}</div><input v-model="formStatus.hpo" type="text" class="flex-1 bg-[#333] text-white px-3 py-2 text-sm outline-none font-mono focus:bg-black transition-colors placeholder-gray-500" :placeholder="opt.placeholder"/></div>
                          <div v-else-if="opt.type === 'hdo'" class="flex gap-2"><div class="bg-[#1a1a1a] text-white px-3 py-2 text-xs flex items-center font-mono whitespace-nowrap min-w-[80px]">{{ opt.placeholder }}</div><input v-model="formStatus.hdo" type="text" class="flex-1 bg-[#333] text-white px-3 py-2 text-sm outline-none font-mono focus:bg-black transition-colors placeholder-gray-500" :placeholder="opt.placeholder"/></div>
                          <div v-else-if="opt.type === 'date'" class="flex flex-col gap-2"><div class="text-[10px] text-gray-500 font-mono flex items-center gap-1"><span class="text-red-600 font-bold">REF:</span> {{ formStatus.hpo || '-' }}</div><div class="flex gap-2"><div class="bg-[#1a1a1a] text-white px-3 py-2 text-xs flex items-center font-mono whitespace-nowrap min-w-[80px]">{{ opt.placeholder }}</div><input v-model="formStatus.date" type="date" class="flex-1 bg-[#333] text-white px-3 py-2 text-sm outline-none font-mono focus:bg-black transition-colors"/></div></div>
                          <div v-else class="text-xs text-gray-500 font-mono italic">Set status ke Menunggu Proses (Reset).</div>
                      </div>
                  </div>
              </div>
              <div class="flex items-center justify-between bg-white dark:bg-[#2a2a2a] p-3 border-l-4" :class="formStatus.is_hold ? 'border-amber-500' : 'border-gray-300'"><span class="text-sm font-bold text-gray-700 dark:text-gray-300">Hold by Customer</span><Switch v-model:checked="formStatus.is_hold" class="data-[state=checked]:bg-amber-500"/></div>
          </div>
          <div class="p-4 bg-white dark:bg-[#2a2a2a] border-t border-gray-200 dark:border-gray-700 flex justify-end items-center gap-4">
              <button @click="isModalOpen = false" class="text-gray-500 hover:text-black dark:hover:text-white text-sm font-bold px-4">BATAL</button>
              <button @click="saveUpdate" :disabled="isSubmitting" class="bg-red-600 hover:bg-red-700 text-white px-8 py-3 font-bold text-sm shadow-lg active:scale-95 transition-all flex items-center gap-2"><Loader2 v-if="isSubmitting" class="w-4 h-4 animate-spin" /> {{ isSubmitting ? 'SAVING...' : isBulkMode ? 'UPDATE ALL' : 'UPDATE ITEM' }}</button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  </div>
</template>

<style>
/* Custom Scrollbar for Modal */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 20px;
}
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #475569;
}
</style>