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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Loader2, Calendar, MapPin, Truck, Building2, ArrowLeft,
  Edit, CheckCircle2, Clock, Anchor, Factory, FileText, 
  PackageCheck, Share2, Info, ExternalLink, Package, Hourglass, 
  Layers, AlertCircle, ShoppingCart, Download, AlertTriangle,
  ChevronDown, ChevronUp, Plane, Box, Copy, Search, UploadCloud, FileSpreadsheet, Mail
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
const isAddingToCart = ref(null)
const syncProgress = ref(0) // Progress sync HPO 0-100
const hpoMapping = ref({}) // Mapping item_code -> HPO number dari Accurate PO
const hpoDetails = ref([]) // Full PO details with quantities
const hdoMapping = ref({}) // Mapping item_code -> HDO number dari Accurate DO
const uniqueTrackingCode = ref(null)
const isLinkCopied = ref(false)
const isSoNumberCopied = ref(false)
const errorMessage = ref(null)

const cartItems = ref([])

const fetchCartItems = async () => {
  if (!soDetail.value) return
  try {
    const { data, error } = await supabase
      .from('purchase_cart')
      .select('item_code, qty_to_order, is_crosschecked')
      .eq('so_id', String(soDetail.value.id))
    if (!error) {
      cartItems.value = data || []
    }
  } catch (err) {
    console.error('Error fetching cart items:', err)
  }
}

const isInCart = (itemCode) => {
  return cartItems.value.some(c => c.item_code === itemCode)
}

const needsOrdering = (item) => {
  if (item.qty_to_order > 0) {
    const hpoEntries = getHpoEntries(item)
    const hasHpoInDb = item.logistics_hpo && item.logistics_hpo.trim().length > 0
    if (hpoEntries.length > 0) {
      const totalPo = hpoEntries.reduce((sum, hpo) => sum + (hpo.quantity || 0), 0)
      return totalPo < item.qty_to_order
    }
    return !hasHpoInDb
  }
  return false
}

const addToPurchaseCart = async (item) => {
  if (!soDetail.value) return
  isAddingToCart.value = item.code
  
  try {
    let qty = item.qty_to_order || 0
    const hpoEntries = getHpoEntries(item)
    if (hpoEntries.length > 0) {
      const totalPo = hpoEntries.reduce((sum, hpo) => sum + (hpo.quantity || 0), 0)
      if (totalPo < item.qty_to_order) {
        qty = item.qty_to_order - totalPo
      }
    }
    
    if (qty <= 0) {
      alert("Kuantitas rencana pembelian tidak valid atau sudah terpenuhi.")
      isAddingToCart.value = null
      return
    }

    const { error } = await supabase
      .from('purchase_cart')
      .upsert({
        so_id: String(soDetail.value.id),
        so_number: soDetail.value.number,
        company_name: soDetail.value.client,
        item_code: item.code,
        item_name: item.name,
        qty_to_order: qty,
        notes: '',
        is_crosschecked: false,
        updated_at: new Date().toISOString()
      }, { onConflict: 'so_id,item_code' })

    if (error) throw error
    alert(`Berhasil memasukkan item "${item.code}" ke keranjang pembelian!`)
    await fetchCartItems()
  } catch (err) {
    console.error(err)
    alert("Gagal memasukkan ke keranjang: " + err.message)
  } finally {
    isAddingToCart.value = null
  }
}

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
      const isOrdered = statusText === 'SUDAH DIPESAN' || statusText === 'KELEBIHAN DIPESAN'
      const hpos = getHpoEntries(item)
      const hasHpoInDb = item.logistics_hpo && item.logistics_hpo.trim().length > 0
      
      let isFullyOrdered = false
      if (hpos.length > 0) {
        const totalPo = hpos.reduce((sum, hpo) => sum + (hpo.quantity || 0), 0)
        if (totalPo >= item.qty_to_order) {
          isFullyOrdered = true
        }
      } else if (hasHpoInDb) {
        isFullyOrdered = true
      }
      
      const isPartial = statusText.includes('DIKIRIM SEBAGIAN')
      
      return isOrdered || (isFullyOrdered && isPartial)
    }
    if (itemStatusFilter.value === 'READY') {
      return statusText === 'MENUNGGU PENGIRIMAN' || statusText === 'SIAP DIKIRIM'
    }
    if (itemStatusFilter.value === 'PARTIAL') {
      return statusText.includes('DIKIRIM SEBAGIAN')
    }
    if (itemStatusFilter.value === 'SHIPPED') {
      return statusText === 'PRODUK SUDAH DIKIRIM'
    }
    if (itemStatusFilter.value === 'EXWORK') {
      return hasAnyShipmentStatus(item, 'Follow up with our forwarder')
    }
    if (itemStatusFilter.value === 'ETA_PORT') {
      return hasAnyShipmentStatus(item, 'ETA Port JKT')
    }
    if (itemStatusFilter.value === 'TIBA_DUNEX') {
      return hasAnyShipmentStatus(item, 'Already in siemens Warehouse')
    }
    if (itemStatusFilter.value === 'TIBA_HOKIINDO') {
      return hasAnyShipmentStatus(item, 'Already in Hokiindo Raya')
    }
    
    return true
  })
})

const isAllSelected = computed(() => {
    if (filteredItems.value.length === 0) return false
    const activeItems = filteredItems.value.filter(i => !isDisplayedFullyShipped(i))
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
    if (status === 'Follow up with our forwarder') {
      if (shipment.exwork_waiting) return 'Waiting for confirmation'
      return formatDateSimple(shipment.exwork_date)
    }
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
        // Skip items yang sudah sepenuhnya terkirim — tidak perlu di-reminder
        if (isDisplayedFullyShipped(item)) return;
        
        const hpos = getHpoEntries(item);
        const siemensHpos = hpos.filter(hpo => hpo.vendorName && hpo.vendorName.toLowerCase().includes('siemens'));
        
        if (siemensHpos.length > 0) {
            siemensHpos.forEach(hpo => {
                const shipment = getHpoShipment(item, hpo.poNumber);
                const status = getVisualStatus(shipment);
                if (['Follow up with our forwarder', 'ETA Port JKT', 'Already in siemens Warehouse'].includes(status)) {
                    reminderItems.push({
                        hpoNumber: hpo.poNumber,
                        itemCode: item.code,
                        itemName: item.name,
                        qty: hpo.quantity || item.qty_order,
                        status: status === 'Follow up with our forwarder' ? 'Ex-Works' : status === 'ETA Port JKT' ? 'ETA JKT' : 'Tiba Dunex',
                        exworkDate: shipment.exwork_waiting ? 'Waiting for confirmation' : (shipment.exwork_date || '-'),
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

const exportAllHpoExcel = () => {
    if (!soDetail.value || !soDetail.value.items) return;
    
    const hpoItems = [];
    
    soDetail.value.items.forEach(item => {
        const hpos = getHpoEntries(item);
        if (hpos.length > 0) {
            hpos.forEach(hpo => {
                const shipment = getHpoShipment(item, hpo.poNumber);
                const status = getVisualStatus(shipment);
                hpoItems.push({
                    hpoNumber: hpo.poNumber,
                    itemCode: item.code,
                    itemName: item.name,
                    qtyOrder: item.qty_order,
                    qtyHpo: hpo.quantity || item.qty_order,
                    status: status === 'Follow up with our forwarder' ? 'Ex-Works' : status === 'ETA Port JKT' ? 'ETA JKT' : status === 'Already in siemens Warehouse' ? 'Tiba Dunex' : status === 'Already in Hokiindo Raya' ? 'Tiba Hokiindo' : status,
                    exworkDate: shipment.exwork_waiting ? 'Waiting for confirmation' : (shipment.exwork_date || '-'),
                    etaDate: shipment.eta_date || '-',
                    dunexDate: shipment.dunex_date || '-',
                    hokiindoDate: shipment.hokiindo_date || '-',
                    note: shipment.admin_notes || item.logistics_note || '-'
                });
            });
        } else if (item.logistics_hpo && item.logistics_hpo.trim().length > 0) {
            // Fallback for HPO from DB/Excel manual input when getHpoEntries is empty
            const status = item.logistics_status || 'Follow up with our forwarder';
            hpoItems.push({
                hpoNumber: item.logistics_hpo,
                itemCode: item.code,
                itemName: item.name,
                qtyOrder: item.qty_order,
                qtyHpo: item.qty_order,
                status: status === 'Follow up with our forwarder' ? 'Ex-Works' : status === 'ETA Port JKT' ? 'ETA JKT' : status === 'Already in siemens Warehouse' ? 'Tiba Dunex' : status === 'Already in Hokiindo Raya' ? 'Tiba Hokiindo' : status,
                exworkDate: item.exwork_waiting ? 'Waiting for confirmation' : (item.exwork_date || '-'),
                etaDate: item.eta_date || '-',
                dunexDate: item.dunex_date || '-',
                hokiindoDate: item.hokiindo_date || '-',
                note: item.logistics_note || '-'
            });
        }
    });

    if (hpoItems.length === 0) {
        alert("Tidak ada item yang memiliki nomor HPO untuk HSO ini.");
        return;
    }

    const hsoNumber = soDetail.value?.number || '-';
    const customerName = soDetail.value?.client || '-';

    const dataToExport = hpoItems.map(item => ({
        "No HSO": hsoNumber,
        "Nama Customer": customerName,
        "No HPO (Purchase Order)": item.hpoNumber,
        "Kode Barang (MLFB)": item.itemCode,
        "Nama Barang": item.itemName,
        "Qty Order (SO)": item.qtyOrder,
        "Qty HPO": item.qtyHpo,
        "Status Logistik": item.status,
        "Tanggal Ex-Works": item.exworkDate,
        "Tanggal ETA JKT": item.etaDate,
        "Tanggal Tiba Dunex": item.dunexDate,
        "Tanggal Tiba Hokiindo": item.hokiindoDate,
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
        { wch: 12 }, // Qty Order
        { wch: 10 }, // Qty HPO
        { wch: 18 }, // Status Logistik
        { wch: 18 }, // Tanggal Ex-Works
        { wch: 18 }, // Tanggal ETA JKT
        { wch: 18 }, // Tanggal Tiba Dunex
        { wch: 18 }, // Tanggal Tiba Hokiindo
        { wch: 35 }  // Catatan
    ];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Semua HPO");

    const safeSoNumber = (soDetail.value.number || 'SO').replace(/[\/\\]/g, '_');
    XLSX.writeFile(wb, `ALL_HPO_${safeSoNumber}.xlsx`);
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

// --- DATABASE LOGISTICS STATUS SYNC LOGIC ---
const isExcelParsing = ref(false)
const isExcelModalOpen = ref(false)
const excelRowsToUpdate = ref([]) // Matched items to update
const excelProgressCount = ref(0)
const detectedExcelCols = ref({ exwork: false, eta: false, delivery: false, status: false })

const syncFromLogisticsDb = async () => {
  if (!soDetail.value || !soDetail.value.items || soDetail.value.items.length === 0) return
  
  isExcelParsing.value = true
  try {
    const itemCodes = soDetail.value.items.map(i => i.code)
    
    // Fetch matching tracking rows from Supabase
    const { data: rows, error } = await supabase
      .from('raw_forwarder_tracking')
      .select('*')
      .in('item_code', itemCodes)
    
    if (error) throw error
    
    if (!rows || rows.length === 0) {
      alert("Tidak ada data pelacakan di database yang cocok dengan item produk di SO ini. Pastikan Anda sudah mengunggah Excel logistik terbaru di Dashboard.")
      return
    }

    // Map database rows to mock rows structured like the old Excel parser
    const mockRows = rows.map(r => {
      let exworkVal = r.exwork_date || ''
      if (r.exwork_waiting) exworkVal = 'waiting'
      
      return {
        _hpo: r.hpo_number,
        _item: r.item_code,
        _exwork: exworkVal,
        _eta: r.eta_date || '',
        _delivery: r.delivery_date || '',
        _status: r.status || ''
      }
    })

    const hpoCol = '_hpo'
    const itemCol = '_item'
    const exworkCol = '_exwork'
    const etaCol = '_eta'
    const deliveryCol = '_delivery'
    const statusCol = '_status'

    detectedExcelCols.value = {
      exwork: true,
      eta: true,
      delivery: true,
      status: true
    }

    // Date parser helper
    const parseExcelDateLocal = (val) => {
      if (val === undefined || val === null || val === '') return null
      if (typeof val === 'string' && val.trim().toLowerCase().includes('waiting')) {
        return '__waiting__'
      }
      return val
    }

    // Extract date embedded in status text
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

    const getBestMatchingExcelRow = (matchingRows) => {
      if (!matchingRows || matchingRows.length === 0) return null
      if (matchingRows.length === 1) return matchingRows[0]
      
      const statusLevels = {
        'Already in Hokiindo Raya': 4,
        'Already in siemens Warehouse': 3,
        'ETA Port JKT': 2,
        'Follow up with our forwarder': 1,
        '': 0
      }
      
      return matchingRows.reduce((best, current) => {
        const bestStatus = statusCol ? mapStatusLocal(best[statusCol]) : ''
        const currentStatus = statusCol ? mapStatusLocal(current[statusCol]) : ''
        
        const bestLevel = statusLevels[bestStatus] || 0
        const currentLevel = statusLevels[currentStatus] || 0
        
        if (currentLevel !== bestLevel) {
          return currentLevel > bestLevel ? current : best
        }
        
        const bestDatesCount = (best[exworkCol] ? 1 : 0) + (best[etaCol] ? 1 : 0)
        const currentDatesCount = (current[exworkCol] ? 1 : 0) + (current[etaCol] ? 1 : 0)
        
        if (currentDatesCount !== bestDatesCount) {
          return currentDatesCount > bestDatesCount ? current : best
        }
        
        return best
      })
    }

    const matches = []
    const seenKeys = new Set()

    // ── PASS 1: DB Shipments yang sudah punya HPO ────────────────────────
    shipmentList.value.forEach(shipment => {
      if (!shipment.hpo_number || !shipment.item_code) return

      const soItemForShipment = soDetail.value?.items?.find(i => i.code === shipment.item_code)
      if (soItemForShipment && isDisplayedFullyShipped(soItemForShipment)) return

      const key = `${String(shipment.item_code).trim().toLowerCase()}||${String(shipment.hpo_number).trim().toLowerCase()}`
      if (seenKeys.has(key)) return

      const matchedExcelRows = mockRows.filter(row => {
        const excelHpo = row[hpoCol] ? String(row[hpoCol]).trim() : ''
        const excelItem = row[itemCol] ? String(row[itemCol]).trim() : ''
        return isItemMatch(shipment.item_code, excelItem) && isHpoMatch(shipment.hpo_number, excelHpo)
      })
      const matchingExcelRow = getBestMatchingExcelRow(matchedExcelRows)

      if (!matchingExcelRow) return

      seenKeys.add(key)

      let excelExwork = exworkCol ? parseExcelDateLocal(matchingExcelRow[exworkCol]) : null
      let excelEta = etaCol ? parseExcelDateLocal(matchingExcelRow[etaCol]) : null
      let excelDelivery = deliveryCol ? parseExcelDateLocal(matchingExcelRow[deliveryCol]) : null
      let excelStatus = statusCol ? mapStatusLocal(matchingExcelRow[statusCol]) : ''
      const excelStatusText = statusCol ? String(matchingExcelRow[statusCol]) : ''

      if (excelStatusText) {
        if (!excelExwork && excelStatus === 'Follow up with our forwarder') {
          excelExwork = extractDateFromText(excelStatusText)
        }
        if (!excelEta && excelStatus === 'ETA Port JKT') {
          excelEta = extractDateFromText(excelStatusText)
        }
        if (!excelDelivery && (excelStatus === 'Already in siemens Warehouse' || excelStatus === 'Already in Hokiindo Raya')) {
          excelDelivery = extractDateFromText(excelStatusText)
        }
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

      const dbShipments = shipmentList.value.filter(s =>
        isItemMatch(s.item_code, shipment.item_code) && isHpoMatch(s.hpo_number, shipment.hpo_number)
      )
      const primaryShipment = dbShipments[0]

      if (!excelDelivery && (excelStatus === 'Already in siemens Warehouse' || excelStatus === 'Already in Hokiindo Raya')) {
        const dbAlreadyHasDelivery = primaryShipment && (primaryShipment.dunex_date || primaryShipment.hokiindo_date)
        if (!dbAlreadyHasDelivery) excelDelivery = getLocalDate()
      }

      matches.push({
        hpoNumber: shipment.hpo_number,
        itemCode: shipment.item_code,
        excelExwork,
        excelEta,
        excelDelivery,
        excelStatus,
        dbStatus: primaryShipment.current_status || '',
        dbExwork: primaryShipment.exwork_waiting ? 'Waiting for confirmation' : (primaryShipment.exwork_date || ''),
        dbEta: primaryShipment.eta_date || '',
        dbDelivery: primaryShipment.hokiindo_date || primaryShipment.dunex_date || '',
        shipmentIds: dbShipments.map(s => s.id),
        isVirtual: false
      })
    })

    // ── PASS 2: Items dengan hpoMapping yang belum ada di DB ─────────────
    if (soDetail.value && soDetail.value.items) {
      soDetail.value.items.forEach(item => {
        if (isDisplayedFullyShipped(item)) return
        const hpoVal = hpoMapping.value[item.code]
        if (!hpoVal) return

        const hpos = String(hpoVal).split(',').map(x => x.trim()).filter(Boolean)
        hpos.forEach(hpo => {
          const key = `${String(item.code).trim().toLowerCase()}||${hpo.trim().toLowerCase()}`
          
          const alreadySeen = Array.from(seenKeys).some(seenKey => {
            const [seenItem, seenHpo] = seenKey.split('||')
            return isItemMatch(item.code, seenItem) && isHpoMatch(hpo, seenHpo)
          })
          if (alreadySeen) return

          const matchedExcelRows = mockRows.filter(row => {
            const excelHpo = row[hpoCol] ? String(row[hpoCol]).trim() : ''
            const excelItem = row[itemCol] ? String(row[itemCol]).trim() : ''
            return isItemMatch(item.code, excelItem) && isHpoMatch(hpo, excelHpo)
          })
          const matchingExcelRow = getBestMatchingExcelRow(matchedExcelRows)

          if (!matchingExcelRow) return

          seenKeys.add(key)

          let excelExwork = exworkCol ? parseExcelDateLocal(matchingExcelRow[exworkCol]) : null
          let excelEta = etaCol ? parseExcelDateLocal(matchingExcelRow[etaCol]) : null
          let excelDelivery = deliveryCol ? parseExcelDateLocal(matchingExcelRow[deliveryCol]) : null
          let excelStatus = statusCol ? mapStatusLocal(matchingExcelRow[statusCol]) : ''
          const excelStatusText = statusCol ? String(matchingExcelRow[statusCol]) : ''

          if (excelStatusText) {
            if (!excelExwork && excelStatus === 'Follow up with our forwarder') {
              excelExwork = extractDateFromText(excelStatusText)
            }
            if (!excelEta && excelStatus === 'ETA Port JKT') {
              excelEta = extractDateFromText(excelStatusText)
            }
            if (!excelDelivery && (excelStatus === 'Already in siemens Warehouse' || excelStatus === 'Already in Hokiindo Raya')) {
              excelDelivery = extractDateFromText(excelStatusText)
            }
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

          matches.push({
            hpoNumber: hpo,
            itemCode: item.code,
            excelExwork,
            excelEta,
            excelDelivery,
            excelStatus,
            dbStatus: '(Akan Dibuat)',
            dbExwork: '-',
            dbEta: '-',
            dbDelivery: '-',
            shipmentIds: [],
            isVirtual: true
          })
        })
      })
    }

    console.log('[ExcelSync] Total matches found:', matches.length)
    
    if (matches.length === 0) {
      alert("Tidak ada item SO dengan nomor HPO yang cocok dengan database pelacakan. Pastikan nomor HPO di PO Siemens sudah diinput dengan benar.")
      return
    }

    excelRowsToUpdate.value = matches
    isExcelModalOpen.value = true
  } catch (err) {
    console.error(err)
    alert("Gagal mensinkronkan status logistik dari database: " + err.message)
  } finally {
    isExcelParsing.value = false
  }
}

const applyExcelUpdates = async () => {
  isExcelParsing.value = true
  excelProgressCount.value = 0
  let successCount = 0
  let errorCount = 0
  
  for (const item of excelRowsToUpdate.value) {
    try {
      console.log(`[ApplyExcel] ${item.itemCode} | ${item.hpoNumber} | virtual=${item.isVirtual} | ids=${JSON.stringify(item.shipmentIds)} | status=${item.excelStatus} | exwork=${item.excelExwork}`)
      
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
        if (item.excelExwork === '__waiting__') {
          insertPayload.exwork_waiting = true
          insertPayload.exwork_date = null
        } else if (item.excelExwork) insertPayload.exwork_date = item.excelExwork
        if (item.excelEta) insertPayload.eta_date = item.excelEta
        
        // Map excelDelivery based on status
        if (item.excelDelivery) {
          if (item.excelStatus === 'Already in Hokiindo Raya') {
            insertPayload.hokiindo_date = item.excelDelivery
            insertPayload.dunex_date = item.excelDelivery
          } else {
            insertPayload.dunex_date = item.excelDelivery
          }
        }
        
        console.log(`[ApplyExcel] INSERT payload:`, insertPayload)
        const { error } = await supabase
          .from('shipments')
          .insert(insertPayload)
          
        if (error) throw error
        successCount++
        console.log(`[ApplyExcel] INSERT OK: ${item.itemCode}`)
      } else {
        // Update existing shipment record in database
        const updateData = {}
        if (item.hpoNumber) {
          updateData.hpo_number = item.hpoNumber
        }
        if (item.excelStatus) {
          updateData.current_status = item.excelStatus
          updateData.status_date = new Date().toISOString().split('T')[0]
          
          // Clear future dates if we go back to an earlier stage,
          // BUT only if they are not explicitly provided in the Excel row!
          if (item.excelStatus === 'Follow up with our forwarder') {
            updateData.eta_date = item.excelEta || null
            updateData.dunex_date = item.excelDelivery || null
            updateData.hokiindo_date = item.excelDelivery || null
          } else if (item.excelStatus === 'ETA Port JKT') {
            updateData.dunex_date = item.excelDelivery || null
            updateData.hokiindo_date = item.excelDelivery || null
          } else if (item.excelStatus === 'Already in siemens Warehouse') {
            updateData.hokiindo_date = item.excelDelivery || null
          }
        }
        
        // Sync Ex-Works date if column is defined
        if (detectedExcelCols.value.exwork) {
          if (item.excelExwork === '__waiting__') {
            updateData.exwork_waiting = true
            updateData.exwork_date = null
          } else {
            updateData.exwork_waiting = false
            updateData.exwork_date = item.excelExwork || null
          }
        }
        
        // Sync ETA date if column is defined
        if (detectedExcelCols.value.eta) {
          updateData.eta_date = item.excelEta || null
        }
        
        if (item.excelDelivery) {
          if (item.excelStatus === 'Already in Hokiindo Raya') {
            updateData.hokiindo_date = item.excelDelivery
            if (!item.dbDelivery || item.dbDelivery === '-') {
              updateData.dunex_date = item.excelDelivery
            }
          } else {
            if (!item.dbDelivery || item.dbDelivery === '-') {
              updateData.dunex_date = item.excelDelivery
            }
          }
        }
        
        updateData.updated_at = new Date().toISOString()

        // Skip if no shipment IDs to update
        if (!item.shipmentIds || item.shipmentIds.length === 0) {
          console.warn(`[ApplyExcel] SKIP - no shipmentIds for ${item.itemCode} | ${item.hpoNumber}`)
          errorCount++
          continue
        }
        
        console.log(`[ApplyExcel] UPDATE ids=${item.shipmentIds} payload:`, updateData)
        const { error } = await supabase
          .from('shipments')
          .update(updateData)
          .in('id', item.shipmentIds)
          
        if (error) throw error
        successCount += item.shipmentIds.length
        console.log(`[ApplyExcel] UPDATE OK: ${item.itemCode} (${item.shipmentIds.length} records)`)
      }
    } catch (err) {
      console.error(`[ApplyExcel] ERROR for ${item.itemCode} | ${item.hpoNumber}:`, err)
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
  errorMessage.value = null
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
          ready_date: myShipment.ready_date || null,
          exwork_waiting: myShipment.exwork_waiting || false
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
    await fetchCartItems()
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

// Helper: Get HDOs that match this SO item using note-type matching
// Step 1: strict note match (STOCK→STOCK, NO STOCK→NO STOCK)
// Step 2: fallback to any HDO containing this item IF Accurate says it's shipped
const getHdosForItem = (item) => {
  if (!soDetail.value?.shipments) return []
  
  const itemNoteType = getNoteType(item.admin_note)
  const sameCodeSoItems = soDetail.value?.items
    ? soDetail.value.items.filter(i => i.code === item.code)
    : []
  const hasMultipleRows = sameCodeSoItems.length > 1
  
  // Step 1: Strict note-type matching
  const strictMatches = soDetail.value.shipments.filter(shipment => {
    if (!shipment.items) return false
    return shipment.items.some(i => {
      if (i.code !== item.code) return false
      const doItemNoteType = getNoteType(i.note)
      if (hasMultipleRows) {
        // Both notes must be known and equal (STOCK=STOCK or NO STOCK=NO STOCK)
        if (itemNoteType !== 'unknown' && doItemNoteType !== 'unknown') {
          return itemNoteType === doItemNoteType
        }
        return false // Ambiguous → don't cross-contaminate rows
      }
      return true // Single SO row → match by code alone
    })
  })
  
  if (strictMatches.length > 0) return strictMatches
  
  // Step 2: Fallback — Accurate says item was shipped but no strict note match found.
  // Show any HDO containing this item. Safe because:
  // - NO STOCK items always have qty_shipped=0 → fallback never triggers for them
  // - Only STOCK/already-shipped items reach here
  if ((item.qty_shipped || 0) > 0) {
    return soDetail.value.shipments.filter(s =>
      s.items && s.items.some(i => i.code === item.code)
    )
  }
  
  return []
}

// Helper: Get quantity shipped from a specific HDO for this item, respecting note type
const getSingleHdoQty = (hdo, item) => {
  if (!hdo || !hdo.items) return 0
  const itemNoteType = getNoteType(item.admin_note)
  const sameCodeSoItems = soDetail.value?.items
    ? soDetail.value.items.filter(i => i.code === item.code)
    : []
  const hasMultipleRows = sameCodeSoItems.length > 1
  
  // Try strict note matching first
  let doItem = hdo.items.find(i => {
    if (i.code !== item.code) return false
    if (!hasMultipleRows) return true
    const doItemNoteType = getNoteType(i.note)
    if (itemNoteType !== 'unknown' && doItemNoteType !== 'unknown') {
      return itemNoteType === doItemNoteType
    }
    return false
  })
  
  // Fallback: match by code alone (only reached when getHdosForItem used Step 2 fallback)
  if (!doItem) {
    doItem = hdo.items.find(i => i.code === item.code)
  }
  
  return doItem ? Number(doItem.qty_shipped || 0) : 0
}

const getDisplayedQtyShipped = (item) => {
  let totalHdoQty = 0
  const hdos = getHdosForItem(item)
  hdos.forEach(hdo => {
    totalHdoQty += getSingleHdoQty(hdo, item)
  })
  // If no HDO found via note-matching, fall back to Accurate's shipQuantity
  if (hdos.length === 0) {
    return item.qty_shipped || 0
  }
  return Math.max(item.qty_shipped || 0, totalHdoQty)
}

const getDisplayedQtyRemaining = (item) => {
  const shipped = getDisplayedQtyShipped(item)
  return Math.max(0, (item.qty_order || 0) - shipped)
}

const isDisplayedFullyShipped = (item) => {
  return getDisplayedQtyRemaining(item) <= 0
}

const getRowStatus = (item) => {
  // PRIORITAS TERTINGGI: Jika item di-hold oleh customer
  if (item.logistics_status === 'Hold by Customer') {
    return { text: 'HOLD BY CUSTOMER', class: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800', icon: Clock }
  }
  
  // Jika fully shipped (semua terkirim dan dikonfirmasi selesai)
  if (isDisplayedFullyShipped(item)) return { text: 'PRODUK SUDAH DIKIRIM', class: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800', icon: CheckCircle2 }
  
  // Jika sudah dikirim semua (tidak ada sisa tapi belum dikonfirmasi fully_shipped)
  if (getDisplayedQtyShipped(item) > 0 && getDisplayedQtyRemaining(item) === 0) {
    return { text: 'PRODUK SUDAH DIKIRIM', class: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800', icon: CheckCircle2 }
  }
  
  // Item STOCK (qty_to_order === 0): tidak perlu dipesan, cek status pengiriman saja
  // Harus dicek SEBELUM pengecekan HPO agar HPO lama dari DB tidak salah memicu "SUDAH DIPESAN"
  if (item.qty_to_order === 0) {
    if (getDisplayedQtyShipped(item) > 0 && getDisplayedQtyRemaining(item) > 0) {
      return { text: `DIKIRIM SEBAGIAN (SISA ${getDisplayedQtyRemaining(item)} ${item.unit})`, class: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800', icon: Truck }
    }
    // Belum ada pengiriman sama sekali → siap dikirim
    return { text: 'SIAP DIKIRIM', class: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-800', icon: Package }
  }

  // Cek HPO dari Accurate atau dari DB (hanya untuk item NO STOCK / qty_to_order > 0)
  const hpoEntries = getHpoEntries(item)
  const hasHpoInDb = item.logistics_hpo && item.logistics_hpo.trim().length > 0

  // Jika belum/kurang dipesan (Prioritas di atas pengiriman sebagian agar masuk logika order)
  if (item.qty_to_order > 0) {
    if (hpoEntries.length > 0) {
      const totalPo = hpoEntries.reduce((sum, hpo) => sum + (hpo.quantity || 0), 0)
      if (totalPo < item.qty_to_order) {
        const shortage = item.qty_to_order - totalPo
        if (isInCart(item.code)) {
          return { text: `DI KERANJANG (KURANG ${shortage} ${item.unit})`, class: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800', icon: ShoppingCart }
        }
        return { text: `KURANG DIPESAN (${shortage} ${item.unit})`, class: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800', icon: AlertTriangle }
      }
    } else if (!hasHpoInDb) {
      if (isInCart(item.code)) {
        return { text: `DI KERANJANG (PERLU ${item.qty_to_order} ${item.unit})`, class: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800', icon: ShoppingCart }
      }
      return { text: `PERLU DIPESAN (${item.qty_to_order} ${item.unit})`, class: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800', icon: AlertCircle }
    }
  }

  // Jika sudah ada pengiriman sebagian (masih ada sisa), status = DIKIRIM SEBAGIAN
  if (getDisplayedQtyShipped(item) > 0 && getDisplayedQtyRemaining(item) > 0) {
    return { text: `DIKIRIM SEBAGIAN (SISA ${getDisplayedQtyRemaining(item)} ${item.unit})`, class: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800', icon: Truck }
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
  
  // Fallback: stock belum dikirim (seharusnya sudah ditangani di atas)
  if (item.qty_shipped === 0) {
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
  const hdos = getHdosForItem(item)
  if (hdos.length > 0) return hdos[0].no
  return item.logistics_hdo
}

// Helper: Get quantity shipped in HDO for specific item
const getHdoQty = (item) => {
  const hdos = getHdosForItem(item)
  if (hdos.length > 0) {
    return getSingleHdoQty(hdos[0], item)
  }
  return item.qty_shipped
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
    description: p.description,
    vendorName: p.vendorName
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

// Helper: Check if item has a specific shipment status (Exwork, ETA, Dunex, Hokiindo)
const hasAnyShipmentStatus = (item, targetStatus) => {
  const hpos = getHpoEntries(item)
  if (hpos.length === 0) {
    const status = getVisualStatus({
      current_status: item.logistics_status,
      exwork_date: item.exwork_date,
      eta_date: item.eta_date,
      dunex_date: item.dunex_date,
      hokiindo_date: item.hokiindo_date
    })
    return status === targetStatus
  }
  return hpos.some(hpo => {
    const shipment = getHpoShipment(item, hpo.poNumber)
    return getVisualStatus(shipment) === targetStatus
  })
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
    const activeFilteredCodes = filteredItems.value.filter(i => !isDisplayedFullyShipped(i)).map(i => i.code)
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

// --- HSO EMAIL REMINDER SYSTEM ---
const isEmailModalOpen = ref(false)
const isSendingEmail = ref(false)
const isSiemensCopied = ref(false)
const isResumeCopied = ref(false)
const emailForm = ref({
  to: 'info@hokiindo.co.id, sales@hokiindo.co.id',
  subject: '',
  customMessage: ''
})

const openEmailModal = () => {
  if (!soDetail.value) return
  emailForm.value.subject = `[Reminder HSO] Resume Logistik ${soDetail.value.number} - ${soDetail.value.client}`
  emailForm.value.customMessage = `Berikut resume status pengiriman produk untuk Sales Order ${soDetail.value.number} (${soDetail.value.client}):`
  isEmailModalOpen.value = true
}

const undeliveredItems = computed(() => {
  if (!soDetail.value || !soDetail.value.items) return []
  return soDetail.value.items
    .filter(item => !isDisplayedFullyShipped(item))
    .map(item => {
      const rowStatus = getRowStatus(item)
      return {
        code: item.code,
        name: item.name,
        qty_order: item.quantity || item.qty_order || 0,
        qty_shipped: getDisplayedQtyShipped(item),
        qty_remaining: getDisplayedQtyRemaining(item),
        statusText: rowStatus.text,
        statusClass: rowStatus.class
      }
    })
})

const siemensPushItems = computed(() => {
  if (!soDetail.value || !soDetail.value.items) return []
  const list = []
  
  soDetail.value.items.forEach(item => {
    const noteType = getNoteType(item.admin_note)
    const isNoStock = noteType === 'no_stock' || item.qty_to_order > 0
    if (!isNoStock) return

    const hpos = getHpoEntries(item)
    hpos.forEach(hpo => {
      const shipment = getHpoShipment(item, hpo.poNumber)
      const visualStatus = getVisualStatus(shipment)
      
      // Status must NOT be "Already in Hokiindo Raya"
      if (visualStatus !== 'Already in Hokiindo Raya') {
        list.push({
          code: item.code,
          name: item.name,
          hpo: hpo.poNumber,
          qty: hpo.quantity,
          status: visualStatus === 'Follow up with our forwarder' ? 'Ex-Works' : visualStatus === 'ETA Port JKT' ? 'ETA JKT' : visualStatus === 'Already in siemens Warehouse' ? 'Tiba Dunex' : visualStatus,
          date: getVisualStatusDate(shipment)
        })
      }
    })
  })
  
  return list
})

const copyTableToClipboard = async (tableType) => {
  let htmlContent = ''
  
  if (tableType === 'siemens') {
    if (siemensPushItems.value.length === 0) return
    
    htmlContent = `
      <table style="width: 100%; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; color: #334155;">
        <thead>
          <tr style="background-color: #f8fafc; border-bottom: 2px solid #fee2e2;">
            <th style="text-align: left; padding: 10px; font-weight: 700; color: #475569;">Kode Produk</th>
            <th style="text-align: left; padding: 10px; font-weight: 700; color: #475569;">Nama Produk</th>
            <th style="text-align: left; padding: 10px; font-weight: 700; color: #475569;">HPO</th>
            <th style="text-align: center; padding: 10px; font-weight: 700; color: #475569; width: 60px;">Qty</th>
            <th style="text-align: left; padding: 10px; font-weight: 700; color: #475569;">Status</th>
          </tr>
        </thead>
        <tbody>
    `
    siemensPushItems.value.forEach(item => {
      htmlContent += `
        <tr style="border-bottom: 1px solid #fee2e2;">
          <td style="padding: 10px; font-family: monospace; font-weight: bold; color: #0f172a;">${item.code}</td>
          <td style="padding: 10px; color: #334155;">${item.name}</td>
          <td style="padding: 10px; font-family: monospace; color: #475569;">${item.hpo}</td>
          <td style="padding: 10px; text-align: center; font-weight: bold; color: #0f172a;">${item.qty}</td>
          <td style="padding: 10px; color: #dc2626; font-weight: bold;">${item.status} (${item.date || '-'})</td>
        </tr>
      `
    })
    htmlContent += `
        </tbody>
      </table>
    `
  } else if (tableType === 'resume') {
    if (undeliveredItems.value.length === 0) return
    
    htmlContent = `
      <table style="width: 100%; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; color: #334155;">
        <thead>
          <tr style="background-color: #f8fafc; border-bottom: 2px solid #fee2e2;">
            <th style="text-align: left; padding: 10px; font-weight: 700; color: #475569;">Kode Produk</th>
            <th style="text-align: left; padding: 10px; font-weight: 700; color: #475569;">Nama Produk</th>
            <th style="text-align: center; padding: 10px; font-weight: 700; color: #475569; width: 60px;">Order</th>
            <th style="text-align: center; padding: 10px; font-weight: 700; color: #475569; width: 60px;">Kirim</th>
            <th style="text-align: center; padding: 10px; font-weight: 700; color: #475569; width: 60px;">Sisa</th>
          </tr>
        </thead>
        <tbody>
    `
    undeliveredItems.value.forEach(item => {
      htmlContent += `
        <tr style="border-bottom: 1px solid #fee2e2;">
          <td style="padding: 10px; font-family: monospace; font-weight: bold; color: #0f172a;">${item.code}</td>
          <td style="padding: 10px; color: #334155;">${item.name}</td>
          <td style="padding: 10px; text-align: center; color: #334155;">${item.qty_order}</td>
          <td style="padding: 10px; text-align: center; color: #2563eb; font-weight: bold;">${item.qty_shipped}</td>
          <td style="padding: 10px; text-align: center; color: #dc2626; font-weight: bold;">${item.qty_remaining}</td>
        </tr>
      `
    })
    htmlContent += `
        </tbody>
      </table>
    `
  }

  try {
    const type = 'text/html'
    const blob = new Blob([htmlContent], { type })
    const data = [new ClipboardItem({ [type]: blob })]
    await navigator.clipboard.write(data)
    
    if (tableType === 'siemens') {
      isSiemensCopied.value = true
      setTimeout(() => isSiemensCopied.value = false, 2000)
    } else {
      isResumeCopied.value = true
      setTimeout(() => isResumeCopied.value = false, 2000)
    }
  } catch (err) {
    console.error('Failed to copy table:', err)
    alert('Gagal menyalin tabel.')
  }
}

const generateEmailHtml = () => {
  const number = soDetail.value.number
  const client = soDetail.value.client
  const customMsg = emailForm.value.customMessage || ''
  
  let html = `
  <html>
  <head>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 20px; background-color: #f8fafc; }
      .container { max-width: 750px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03); border: 1px solid #e2e8f0; }
      .header { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: #ffffff; padding: 25px; text-align: center; }
      .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
      .header p { margin: 5px 0 0 0; opacity: 0.8; font-size: 13px; }
      .content { padding: 25px; }
      .custom-msg { font-size: 13.5px; color: #1e293b; margin-bottom: 20px; white-space: pre-line; background-color: #f1f5f9; padding: 12px 16px; border-left: 4px solid #dc2626; border-radius: 4px; }
      .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin: 25px 0 10px 0; padding-bottom: 6px; border-bottom: 2px solid #fee2e2; }
      .section-title.push { color: #dc2626; border-color: #fee2e2; }
      .section-title.resume { color: #dc2626; border-color: #fee2e2; }
      
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
      th { background-color: #f8fafc; color: #475569; font-weight: 700; text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
      td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
      
      .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
      .badge.push { background-color: #fef2f2; color: #991b1b; border: 1px solid #fee2e2; }
      .badge.info { background-color: #eff6ff; color: #1e40af; border: 1px solid #dbeafe; }
      
      .footer { background-color: #f8fafc; padding: 15px; text-align: center; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>RESUME LOGISTIK SALES ORDER</h1>
        <p>${number} &bull; ${client}</p>
      </div>
      <div class="content">
        <div class="custom-msg">${customMsg}</div>
  `

  if (siemensPushItems.value.length > 0) {
    html += `
        <div class="section-title push">🚨 KELOMPOK PUSH SIEMENS (NO STOCK + HPO AKTIF)</div>
        <table>
          <thead>
            <tr>
              <th style="width: 25%;">Kode Produk</th>
              <th style="width: 35%;">Nama Produk</th>
              <th style="width: 15%;">HPO</th>
              <th style="text-align: center; width: 8%;">Qty</th>
              <th style="width: 17%;">Status</th>
            </tr>
          </thead>
          <tbody>
    `
    siemensPushItems.value.forEach(item => {
      html += `
            <tr>
              <td style="font-family: monospace; font-weight: bold;">${item.code}</td>
              <td>${item.name}</td>
              <td style="font-family: monospace;">${item.hpo}</td>
              <td style="text-align: center; font-weight: bold;">${item.qty}</td>
              <td><span class="badge push">${item.status} (${item.date || '-'})</span></td>
            </tr>
      `
    })
    html += `
          </tbody>
        </table>
    `
  }

  if (undeliveredItems.value.length > 0) {
    html += `
        <div class="section-title resume">📋 RESUME PRODUK SO (BELUM DIKIRIM PENUH)</div>
        <table>
          <thead>
            <tr>
              <th style="width: 25%;">Kode Produk</th>
              <th style="width: 45%;">Nama Produk</th>
              <th style="text-align: center; width: 10%;">Order</th>
              <th style="text-align: center; width: 10%;">Kirim</th>
              <th style="text-align: center; width: 10%;">Sisa</th>
            </tr>
          </thead>
          <tbody>
    `
    undeliveredItems.value.forEach(item => {
      html += `
            <tr>
              <td style="font-family: monospace; font-weight: bold;">${item.code}</td>
              <td>${item.name}</td>
              <td style="text-align: center;">${item.qty_order}</td>
              <td style="text-align: center; color: #2563eb; font-weight: bold;">${item.qty_shipped}</td>
              <td style="text-align: center; color: #dc2626; font-weight: bold;">${item.qty_remaining}</td>
            </tr>
      `
    })
    html += `
          </tbody>
        </table>
    `
  }

  html += `
      </div>
      <div class="footer">
        <p>Email ini dikirimkan via sistem <strong>HSO Logistics Tracker</strong> Hokiindo Raya.</p>
        <p>&copy; ${new Date().getFullYear()} PT Hokiindo Raya. All rights reserved.</p>
      </div>
    </div>
  </body>
  </html>
  `
  return html
}

const sendReminderEmail = async () => {
  if (isSendingEmail.value) return
  isSendingEmail.value = true
  
  try {
    const htmlBody = generateEmailHtml()
    
    const { data, error } = await supabase.functions.invoke('send-custom-email', {
      body: {
        to: emailForm.value.to,
        subject: emailForm.value.subject,
        html: htmlBody
      }
    })
    
    if (error) throw error
    if (data && data.error) throw new Error(data.error)
    
    alert('Email reminder berhasil terkirim!')
    isEmailModalOpen.value = false
  } catch (err) {
    console.error('[SendEmail] Error:', err)
    alert('Gagal mengirim email: ' + err.message)
  } finally {
    isSendingEmail.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50/50 dark:bg-[#0f172a] pb-20 font-source-code transition-colors duration-300">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-8">

      <!-- ERROR STATE -->
      <div v-if="errorMessage" class="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-800 rounded-xl border border-amber-100 dark:border-amber-900 shadow-sm animate-in zoom-in-95 duration-300">
        <div class="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-full mb-6">
            <AlertTriangle class="w-12 h-12 text-amber-500" />
        </div>
        <h3 class="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">Gagal Menghubungkan ke Accurate</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-md mx-auto">
          Koneksi Accurate sedang sibuk atau sesi Anda perlu disegarkan. Jangan panik, data Anda aman. Silakan klik tombol <strong>Coba Lagi</strong> di bawah.
        </p>
        <p class="text-[11px] text-slate-400 dark:text-slate-500 font-mono mb-8 max-w-sm mx-auto bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800 break-all">
          Detail Error: {{ errorMessage }}
        </p>
        <div class="flex gap-4">
            <Button @click="router.push('/sales-orders')" variant="outline" class="font-bold text-xs uppercase tracking-wider rounded-xl">Kembali ke List</Button>
            <Button @click="fetchDetail(false, true)" variant="default" class="bg-red-650 hover:bg-red-550 text-white font-bold text-xs uppercase tracking-wider rounded-xl bg-red-600 hover:bg-red-500">Coba Lagi</Button>
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

        <!-- PAGE HEADER CARD -->
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6 space-y-5 transition-all duration-300">
          
          <!-- TOP ROW: BREADCRUMBS & BUTTONS -->
          <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-3 border-b border-gray-100 dark:border-slate-700/60">
            <!-- Breadcrumbs -->
            <div class="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 shrink-0">
              <button 
                @click="router.push('/sales-orders')" 
                class="flex items-center gap-1.5 hover:text-red-600 dark:hover:text-red-400 transition-colors bg-gray-50 hover:bg-gray-100 dark:bg-slate-900/60 dark:hover:bg-slate-900 px-2.5 py-1.5 rounded-md text-xs font-bold border border-gray-200/50 dark:border-slate-800 shadow-sm"
              >
                <ArrowLeft class="w-3.5 h-3.5"/>
                <span>Kembali</span>
              </button>
              <div class="h-4 w-[1px] bg-gray-200 dark:bg-slate-700"></div>
              <div class="flex items-center gap-1.5 text-xs font-semibold">
                <span class="cursor-pointer hover:text-red-600 dark:hover:text-red-400 transition-colors" @click="router.push('/sales-orders')">Sales Orders</span>
                <span class="text-gray-300 dark:text-gray-600">/</span>
                <span class="text-gray-900 dark:text-white font-extrabold">Detail</span>
              </div>
            </div>
            
            <!-- Actions (Top Right) -->
            <div class="flex flex-wrap items-center gap-2.5 w-full xl:w-auto xl:justify-end mt-1 xl:mt-0">
              <!-- BULK EDIT BUTTON -->
              <Button v-if="selectedItemCodes.length > 0" size="sm" class="w-full sm:w-auto shadow-sm bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 transition-all animate-in zoom-in-95 duration-200 flex items-center justify-center gap-1.5 font-bold" @click="openBulkEditModal">
                <Layers class="w-4 h-4"/> Update ({{ selectedItemCodes.length }}) Item
              </Button>

              <!-- SYNC LOGISTICS BUTTON -->
              <Button size="sm" variant="outline" class="w-full sm:w-auto shadow-sm border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all duration-200 hover:shadow-xs active:scale-95 flex items-center justify-center gap-1.5 font-bold" @click="syncFromLogisticsDb" :disabled="isExcelParsing || isLoading">
                <RefreshCw class="w-4 h-4 shrink-0" :class="isExcelParsing ? 'animate-spin' : ''"/>
                <span>{{ isExcelParsing ? 'Mensinkronkan...' : 'Sync Logistik (Database)' }}</span>
              </Button>

              <!-- EXPORT EXCEL DROPDOWN -->
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button size="sm" variant="outline" class="w-full sm:w-auto shadow-sm border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-400 bg-emerald-50/20 hover:bg-emerald-100/40 dark:bg-emerald-950/5 dark:hover:bg-emerald-950/20 transition-all duration-200 hover:shadow-xs active:scale-95 flex items-center justify-center gap-1.5 font-bold" :disabled="isLoading">
                    <FileSpreadsheet class="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400"/>
                    <span>Export Excel</span>
                    <ChevronDown class="w-3.5 h-3.5 opacity-70 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="dark:bg-slate-800 dark:border-slate-700 rounded-xl w-64 p-1.5 shadow-lg border border-gray-150">
                  <DropdownMenuItem @click="exportReminderExcel" class="dark:hover:bg-slate-700 dark:text-slate-300 rounded-lg cursor-pointer py-2.5 px-3 flex items-start gap-2.5 focus:bg-emerald-50 dark:focus:bg-emerald-950/30">
                    <FileSpreadsheet class="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div class="flex flex-col">
                      <span class="font-bold text-xs text-gray-800 dark:text-gray-200">Export Reminder PO</span>
                      <span class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Filter PO Siemens & Status Aktif</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="exportAllHpoExcel" class="dark:hover:bg-slate-700 dark:text-slate-300 rounded-lg cursor-pointer py-2.5 px-3 flex items-start gap-2.5 focus:bg-teal-50 dark:focus:bg-teal-950/30 mt-1">
                    <FileSpreadsheet class="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                    <div class="flex flex-col">
                      <span class="font-bold text-xs text-gray-800 dark:text-gray-200">Export Semua HPO</span>
                      <span class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Semua item dengan nomor HPO</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <!-- SEND REMINDER EMAIL BUTTON -->
              <Button size="sm" variant="outline" class="w-full sm:w-auto shadow-sm border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all duration-200 hover:shadow-xs active:scale-95 flex items-center justify-center gap-1.5 font-bold" @click="openEmailModal" :disabled="isLoading">
                <Mail class="w-4 h-4 shrink-0"/>
                <span>Kirim Email Reminder</span>
              </Button>

              <!-- SHARE TRACKING LINK BUTTON -->
              <Button size="sm" class="w-full sm:w-auto shadow-sm transition-all duration-300 active:scale-95 flex items-center justify-center gap-1.5 text-white font-bold" :class="isLinkCopied ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/10' : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-red-500/10'" @click="shareToClient" :disabled="isLinkCopied || isLoading">
                <component :is="isLinkCopied ? CheckCircle2 : Share2" class="w-4 h-4 shrink-0"/>
                <span>{{ isLinkCopied ? 'Link Disalin!' : 'Share Tracking Link' }}</span>
              </Button>
            </div>
          </div>

          <!-- CLIENT SECTION (FULL WIDTH) -->
          <div class="space-y-2 pt-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 border border-slate-200/40 dark:border-slate-600/40">
              Client / Customer
            </span>
            <div class="flex items-center gap-3">
              <div class="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl shrink-0 border border-red-100/30 dark:border-red-900/30 shadow-sm">
                <Building2 class="w-6 h-6"/>
              </div>
              <h1 class="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight leading-tight">
                {{ soDetail.client }}
              </h1>
            </div>
          </div>

          <!-- META INFO BADGES -->
          <div class="flex flex-wrap items-center gap-3 pt-3 text-xs border-t border-gray-100 dark:border-slate-700/60">
            <!-- Date Info -->
            <div class="inline-flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 text-gray-600 dark:text-gray-400 px-3 py-1.5 rounded-lg border border-gray-150 dark:border-slate-800 font-medium">
              <Calendar class="w-3.5 h-3.5 text-gray-400 dark:text-gray-500"/>
              <span>Tanggal SO:</span>
              <span class="font-semibold text-gray-800 dark:text-gray-200">{{ soDetail.date }}</span>
            </div>

            <!-- HSO Code Info -->
            <div class="inline-flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 text-gray-600 dark:text-gray-400 px-3 py-1.5 rounded-lg border border-gray-150 dark:border-slate-800 font-medium">
              <span class="text-slate-400 dark:text-slate-500 font-bold tracking-wider text-[10px] uppercase font-sans">SO Code</span>
              <span class="font-bold font-mono text-gray-800 dark:text-gray-200">{{ soDetail.number }}</span>
              <button @click="copySoNumber" class="ml-1 p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex items-center justify-center" title="Copy HSO Number">
                <component :is="isSoNumberCopied ? CheckCircle2 : Copy" class="w-3.5 h-3.5" :class="isSoNumberCopied ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'"/>
              </button>
            </div>

            <!-- PO Number -->
            <div class="inline-flex items-center gap-1.5 bg-rose-50/70 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 px-3 py-1.5 rounded-lg border border-rose-100/80 dark:border-rose-900/30 font-medium">
              <span class="text-rose-400 dark:text-rose-500/60 font-bold tracking-wider text-[10px] uppercase font-sans">PO Customer</span>
              <span class="font-bold font-mono text-rose-800 dark:text-rose-300">{{ soDetail.po_number }}</span>
            </div>
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
              <CardTitle class="text-base font-bold text-gray-800 dark:text-white flex items-center gap-2 flex-wrap">
                <span>Detail Produk & Logistik</span>
                <span class="text-xs font-normal text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 px-2.5 py-0.5 rounded-full border border-slate-200/60 dark:border-slate-800/80">
                  Menampilkan {{ filteredItems.length }} dari {{ soDetail?.items?.length || 0 }} produk
                </span>
              </CardTitle>
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
                    <option value="EXWORK">Ex-Works (Forwarder)</option>
                    <option value="ETA_PORT">ETA Port JKT</option>
                    <option value="TIBA_DUNEX">Tiba di Gudang Dunex</option>
                    <option value="TIBA_HOKIINDO">Tiba di Gudang Hokiindo</option>
                  </select>
                </div>
              </div>
            </div>
            <!-- Mobile Select All Checkbox -->
            <div class="flex items-center gap-2.5 sm:hidden mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
              <input type="checkbox" id="mobile-select-all" class="w-4.5 h-4.5 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer" :checked="isAllSelected" @change="toggleSelectAll"/>
              <label for="mobile-select-all" class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer">Pilih Semua Produk</label>
            </div>
          </CardHeader>
          <!-- Desktop/Tablet View (Table Layout) -->
          <div class="hidden md:block overflow-auto flex-1">
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
                    <input v-if="!isDisplayedFullyShipped(item)" type="checkbox" class="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer" :checked="selectedItemCodes.includes(item.code)" @change="toggleSelection(item.code)"/>
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
                          <span class="font-bold text-blue-600 dark:text-blue-400">{{ getDisplayedQtyShipped(item) }}</span>
                      </div>
                  </TableCell>
                  
                  <TableCell class="text-center align-top pt-4 bg-red-50/30 dark:bg-red-900/10">
                      <span class="font-bold" :class="getDisplayedQtyRemaining(item) > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'">{{ getDisplayedQtyRemaining(item) }}</span>
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
                        <!-- Case 1: HDO sudah di-sync dan ditemukan (strict atau fallback) -->
                        <div v-if="getHdosForItem(item).length > 0" class="mt-2 space-y-2">
                            <div v-for="hdo in getHdosForItem(item)" :key="hdo.no" class="bg-blue-50 dark:bg-blue-900/20 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg p-3">
                                <div class="flex items-center gap-2 mb-2 pb-2 border-b border-dashed border-blue-200 dark:border-blue-800">
                                    <Truck class="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    <span class="text-xs font-bold text-blue-700 dark:text-blue-300">Pengiriman (HDO)</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">{{ hdo.no }}</span>
                                    <span class="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-800 px-1.5 py-0.5 rounded">{{ getSingleHdoQty(hdo, item) }} {{ item.unit }}</span>
                                </div>
                                <div v-if="hpoMapping[item.code] && getNoteType(item.admin_note) !== 'stock'" class="mt-2 pt-2 border-t border-dashed border-blue-200 dark:border-blue-800 text-[10px] text-blue-600 dark:text-blue-400 font-medium text-center">
                                    Ex PO: {{ hpoMapping[item.code] }}
                                </div>
                            </div>
                        </div>
                        <!-- Case 2: HDO sedang di-sync (loading) — item sudah terkirim di Accurate tapi detail belum selesai dimuat -->
                        <div v-else-if="isHdoSyncing && getDisplayedQtyShipped(item) > 0" class="mt-2 bg-blue-50 dark:bg-blue-900/20 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg p-3 flex items-center gap-2">
                            <Loader2 class="w-4 h-4 text-blue-400 animate-spin" />
                            <span class="text-xs text-blue-500 font-medium">Memuat data HDO...</span>
                        </div>
                        <!-- Case 3: Fallback dari DB (hdo tersimpan di logistics_hdo tapi tidak ada di Accurate sync) -->
                        <div v-else-if="getDisplayedQtyShipped(item) > 0 && item.logistics_hdo" class="mt-2">
                            <div class="bg-blue-50 dark:bg-blue-900/20 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg p-3">
                                <div class="flex items-center gap-2 mb-2 pb-2 border-b border-dashed border-blue-200 dark:border-blue-800">
                                    <Truck class="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    <span class="text-xs font-bold text-blue-700 dark:text-blue-300">Pengiriman (HDO)</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">{{ item.logistics_hdo }}</span>
                                    <span class="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-800 px-1.5 py-0.5 rounded">{{ item.qty_shipped }} {{ item.unit }}</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- HPO Number + Logistics Status Combined (Support Multiple POs) -->
                        <div v-if="!isDisplayedFullyShipped(item) && getNoteType(item.admin_note) !== 'stock' && getHpoEntries(item).length > 0" class="mt-1.5 space-y-2">
                            <template v-for="(hpo, idx) in getHpoEntries(item)" :key="idx">
                            <div v-show="!(getDisplayedQtyShipped(item) > 0 && getVisualStatus(getHpoShipment(item, hpo.poNumber)) === 'Already in Hokiindo Raya')" class="bg-white dark:bg-slate-800 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3">
                                <!-- HPO Number -->
                                <div class="flex items-center gap-2 mb-2 pb-2 border-b border-dashed border-gray-200 dark:border-gray-700">
                                    <ShoppingCart class="w-4 h-4 text-green-600 dark:text-green-400" />
                                    <span class="text-xs font-bold text-gray-600 dark:text-gray-400">HPO:</span>
                                    <span class="text-sm font-mono font-bold text-green-700 dark:text-green-300">{{ hpo.poNumber }}</span>
                                    <span class="ml-auto text-xs font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                                        {{ hpo.quantity }} {{ item.unit }}
                                    </span>
                                </div>

                                <!-- Supplier Badge -->
                                <div v-if="hpo.vendorName" class="mb-2">
                                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
                                        🏢 {{ hpo.vendorName }}
                                    </span>
                                </div>
                                
                                <!-- Logistics Status Tree (if exists for this item) -->
                                <template v-for="hpoShipment in [getHpoShipment(item, hpo.poNumber)]" :key="hpoShipment.id || hpo.poNumber">
                                <div v-if="hpoShipment.current_status && hpoShipment.current_status !== 'Pending Process'" class="mt-2">
                                    <div class="flex items-center justify-between gap-2 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded border border-blue-100 dark:border-blue-800">
                                        <div class="flex items-center gap-1.5 flex-shrink-0">
                                            <Truck class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                            <span class="text-[11px] font-bold text-blue-700 dark:text-blue-300 whitespace-nowrap">
                                                {{ getVisualStatus(hpoShipment) === 'Follow up with our forwarder' ? 'Ex-Works' : getVisualStatus(hpoShipment) === 'Already in siemens Warehouse' ? 'Tiba Dunex' : getVisualStatus(hpoShipment) === 'Already in Hokiindo Raya' ? 'Tiba Hokiindo' : getVisualStatus(hpoShipment) }}
                                            </span>
                                        </div>
                                        <span v-if="hpoShipment.exwork_waiting && getVisualStatus(hpoShipment) === 'Follow up with our forwarder'"
                                              class="text-[10px] font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                                            ⏳ Waiting
                                        </span>
                                        <span v-else class="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                            {{ getVisualStatusDate(hpoShipment) || '-' }}
                                        </span>
                                    </div>
                                </div>
                                </template>
                            </div>
                            </template>
                        </div>
                        
                        <!-- Fallback HPO from DB (when not found in PO sync list, e.g. manual input/import) -->
                        <div v-else-if="!isDisplayedFullyShipped(item) && getNoteType(item.admin_note) !== 'stock' && item.logistics_hpo" class="mt-1.5 bg-white dark:bg-slate-800 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3">
                            <div class="flex items-center gap-2 mb-2 pb-2 border-b border-dashed border-gray-200 dark:border-gray-700">
                                <ShoppingCart class="w-4 h-4 text-green-600 dark:text-green-400" />
                                <span class="text-xs font-bold text-gray-600 dark:text-gray-400">HPO:</span>
                                <span class="text-sm font-mono font-bold text-green-700 dark:text-green-300">{{ item.logistics_hpo }}</span>
                                <span class="ml-auto text-xs font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                                    {{ item.qty_order }} {{ item.unit }}
                                </span>
                            </div>
                            
                            <!-- Logistics Status if any -->
                            <div v-if="item.logistics_status && item.logistics_status !== 'Pending Process'" class="mt-2">
                                <div class="flex items-center justify-between gap-2 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded border border-blue-100 dark:border-blue-800">
                                    <div class="flex items-center gap-1.5 flex-shrink-0">
                                        <Truck class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                        <span class="text-[11px] font-bold text-blue-700 dark:text-blue-300 whitespace-nowrap">
                                            {{ item.logistics_status === 'Follow up with our forwarder' ? 'Ex-Works' : item.logistics_status === 'ETA Port JKT' ? 'ETA JKT' : item.logistics_status === 'Already in siemens Warehouse' ? 'Tiba Dunex' : item.logistics_status === 'Already in Hokiindo Raya' ? 'Tiba Hokiindo' : item.logistics_status }}
                                        </span>
                                    </div>
                                    <span v-if="item.exwork_waiting && item.logistics_status === 'Follow up with our forwarder'"
                                          class="text-[10px] font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                                        ⏳ Waiting
                                    </span>
                                    <span v-else class="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                        {{ formatDateSimple(item.exwork_date || item.eta_date || item.dunex_date || item.hokiindo_date || item.logistics_date) || '-' }}
                                    </span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Warning jika dikirim sebagian tapi belum ada HPO -->
                        <div v-else-if="getDisplayedQtyShipped(item) > 0 && getDisplayedQtyRemaining(item) > 0 && !isSyncing" class="mt-1.5 text-[10px] italic">
                            <!-- Jika stock kurang (perlu order) -->
                            <span v-if="item.qty_to_order > 0" class="text-red-600 dark:text-red-400 flex items-center gap-1">
                                <AlertTriangle class="w-3.5 h-3.5 shrink-0" />
                                Ada kekurangan PO ({{ getDisplayedQtyRemaining(item) }} {{ item.unit }})
                            </span>
                            <!-- Jika stock ready tapi belum dikirim semua -->
                            <span v-else class="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                <Info class="w-3.5 h-3.5 shrink-0" />
                                Ada {{ getDisplayedQtyRemaining(item) }} {{ item.unit }} belum dikirim
                            </span>
                        </div>

                        <!-- Warning jika perlu PO tapi belum ada HPO -->
                        <div v-else-if="item.qty_to_order > 0 && !isDisplayedFullyShipped(item) && !isSyncing && getHpoEntries(item).length === 0" class="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                            <Clock class="w-3.5 h-3.5 shrink-0" />
                            Pesanan sudah {{ getDaysSinceOrder() }} hari
                        </div>
                    </div>
                    
                    <!-- Hold by Customer Indicator -->
                    <div v-if="!isSyncing && item.logistics_status === 'Hold by Customer'" class="text-[11px] font-bold mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded border-l-4 border-amber-500 flex items-center gap-2">
                        <Clock class="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <div>
                            <div class="text-amber-800 dark:text-amber-300 uppercase tracking-wide">⚠️ HOLD BY CUSTOMER</div>
                            <div class="text-amber-600 dark:text-amber-400 text-[10px] mt-0.5 font-normal">Item ditunda oleh customer</div>
                        </div>
                    </div>
                    
                    <!-- Admin Notes -->
                    <div v-if="!isSyncing && item.logistics_note && !item.logistics_note.includes('Auto-synced') && !item.logistics_note.includes('Auto-created')" class="text-[11px] text-gray-600 dark:text-gray-400 mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded border-l-2 border-gray-300 dark:border-gray-600 leading-normal">
                        <div class="font-bold text-[9px] uppercase text-slate-400 mb-0.5">Admin Logistics Note:</div>
                        {{ item.logistics_note }}
                    </div>
                  </TableCell>
                  
                  <TableCell class="text-right pr-6 align-top pt-3">
                    <div class="flex items-center gap-2 justify-end">
                      <Button 
                        v-if="!isSyncing && needsOrdering(item) && isInCart(item.code)" 
                        size="sm" 
                        variant="outline" 
                        class="h-8 px-2.5 rounded border-green-300 dark:border-green-800 text-green-600 dark:text-green-400 bg-green-50/30 dark:bg-green-950/10 cursor-default pointer-events-none transition-all flex items-center gap-1 shadow-sm"
                      >
                        <CheckCircle2 class="w-3.5 h-3.5" />
                        <span class="text-xs font-bold">Di Keranjang</span>
                      </Button>
                      <Button 
                        v-else-if="!isSyncing && needsOrdering(item)" 
                        size="sm" 
                        variant="outline" 
                        class="h-8 px-2.5 rounded border-amber-300 dark:border-amber-700/50 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-all flex items-center gap-1 bg-white dark:bg-slate-800 shadow-sm" 
                        @click="addToPurchaseCart(item)"
                        :disabled="isAddingToCart === item.code"
                      >
                        <Loader2 v-if="isAddingToCart === item.code" class="w-3.5 h-3.5 animate-spin" />
                        <ShoppingCart v-else class="w-3.5 h-3.5" />
                        <span class="text-xs font-bold">{{ isAddingToCart === item.code ? 'Memproses...' : '+ Keranjang' }}</span>
                      </Button>
                      <Button v-if="!isSyncing" size="sm" variant="outline" class="h-8 px-3 rounded border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-600 dark:hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all bg-white dark:bg-slate-800 flex items-center gap-1.5" @click="openActionModal(item)"><Edit class="w-3.5 h-3.5"/><span class="text-xs font-bold">Edit</span></Button>
                    </div>
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

          <!-- Mobile View (Card Layout) -->
          <div class="md:hidden overflow-y-auto flex-1 p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/30">
            <div v-if="filteredItems.length === 0" class="text-center py-12 text-slate-500 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 p-6">
              <Search class="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p class="text-sm font-semibold">Produk tidak ditemukan</p>
              <p class="text-xs text-slate-400 mt-1">Coba gunakan kata kunci pencarian lain atau ubah filter status.</p>
            </div>
            
            <div v-else 
                 v-for="(item, idx) in filteredItems" 
                 v-show="!isPurchaseExpanded || item.qty_to_order > 0"
                 :key="idx" 
                 class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm relative space-y-4 transition-all"
                 :class="{ 'border-yellow-400 dark:border-yellow-600 bg-yellow-50/30 dark:bg-yellow-950/20': route.query.highlight === item.code }"
                 :id="`item-mob-${item.code}`"
            >
              <!-- Card Top: Checkbox, SKU, and Action -->
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-3">
                  <input v-if="!isDisplayedFullyShipped(item)" 
                         type="checkbox" 
                         class="w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer" 
                         :checked="selectedItemCodes.includes(item.code)" 
                         @change="toggleSelection(item.code)" />
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-gray-900 dark:text-slate-200 text-sm font-mono tracking-tight">{{ item.code }}</span>
                    <button @click="copySku(item.code)" class="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" title="Copy SKU">
                      <component :is="copiedSku === item.code ? CheckCircle2 : Copy" class="w-3.5 h-3.5" :class="copiedSku === item.code ? 'text-green-600 dark:text-green-400' : ''"/>
                    </button>
                  </div>
                </div>
                
                <!-- Action Button (Edit) -->
                <div class="flex items-center gap-1.5 shrink-0">
                  <Button 
                    v-if="!isSyncing && needsOrdering(item) && isInCart(item.code)" 
                    size="sm" 
                    variant="outline" 
                    class="h-8 w-8 p-0 rounded-lg border-green-300 dark:border-green-800 text-green-600 dark:text-green-400 bg-green-50/30 dark:bg-green-950/10 cursor-default pointer-events-none flex items-center justify-center shadow-sm"
                    title="Sudah di keranjang"
                  >
                    <CheckCircle2 class="w-3.5 h-3.5" />
                  </Button>
                  <Button 
                    v-else-if="!isSyncing && needsOrdering(item)" 
                    size="sm" 
                    variant="outline" 
                    class="h-8 w-8 p-0 rounded-lg border-amber-300 dark:border-amber-700/50 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20 bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm" 
                    @click="addToPurchaseCart(item)"
                    :disabled="isAddingToCart === item.code"
                    title="Masukkan ke keranjang"
                  >
                    <Loader2 v-if="isAddingToCart === item.code" class="w-3.5 h-3.5 animate-spin" />
                    <ShoppingCart v-else class="w-3.5 h-3.5" />
                  </Button>
                  <Button v-if="!isSyncing" size="sm" variant="outline" class="h-8 px-2.5 rounded-lg border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-600 bg-white dark:bg-slate-800 flex items-center gap-1 shadow-sm transition-all" @click="openActionModal(item)">
                    <Edit class="w-3.5 h-3.5"/>
                    <span class="text-xs font-bold">Edit</span>
                  </Button>
                </div>
              </div>

              <!-- Product Name -->
              <div class="text-xs font-medium text-slate-700 dark:text-slate-300 leading-relaxed">
                {{ item.name }}
              </div>
              
              <!-- SKU Admin Note if exists -->
              <div v-if="item.admin_note" class="text-[10px] text-slate-500 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg border border-slate-100 dark:border-slate-800/60 leading-normal">
                <span class="font-semibold text-slate-400 block mb-0.5">Admin Note:</span>
                {{ item.admin_note }}
              </div>

              <div class="border-t border-slate-100 dark:border-slate-800 my-1"></div>

              <!-- Metrics Stats Section -->
              <div class="grid grid-cols-2 gap-3">
                <!-- Qty Order -->
                <div class="bg-slate-50/50 dark:bg-slate-800/30 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60">
                  <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Qty Order</div>
                  <div class="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{{ item.qty_order }} <span class="text-[10px] font-normal text-slate-500">{{ item.unit }}</span></div>
                </div>
                <!-- Stock Gudang -->
                <div class="bg-slate-50/50 dark:bg-slate-800/30 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60">
                  <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Stok Gudang</div>
                  <div class="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{{ item.parsed_stock_qty }} <span class="text-[10px] font-normal text-slate-500">{{ item.unit }}</span></div>
                </div>
                <!-- Terkirim -->
                <div class="bg-blue-50/20 dark:bg-blue-900/10 p-2.5 rounded-xl border border-blue-100/50 dark:border-blue-900/20">
                  <div class="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wider">Terkirim</div>
                  <div class="text-sm font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">{{ getDisplayedQtyShipped(item) }} <span class="text-[10px] font-normal text-blue-500">{{ item.unit }}</span></div>
                </div>
                <!-- Sisa Kirim -->
                <div class="p-2.5 rounded-xl border" :class="getDisplayedQtyRemaining(item) > 0 ? 'bg-red-50/20 dark:bg-red-900/10 border-red-100/50 dark:border-red-900/20' : 'bg-emerald-50/20 dark:bg-emerald-900/10 border-emerald-100/50 dark:border-emerald-900/20'">
                  <div class="text-[10px] font-bold uppercase tracking-wider" :class="getDisplayedQtyRemaining(item) > 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'">Sisa Kirim</div>
                  <div class="text-sm font-extrabold mt-0.5" :class="getDisplayedQtyRemaining(item) > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'">{{ getDisplayedQtyRemaining(item) }} <span class="text-[10px] font-normal">{{ item.unit }}</span></div>
                </div>
              </div>

              <!-- General Logistics Status Section -->
              <div class="space-y-3 pt-1">
                <!-- Check PO/HDO Loading -->
                <div v-if="isSyncing && item.qty_to_order > 0" class="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-950 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                  <Loader2 class="w-4 h-4 animate-spin" />
                  <span>Checking purchase order...</span>
                </div>
                <div v-else-if="isSyncing && item.qty_shipped > 0 && !getHdoNumber(item)" class="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-950 text-blue-700 dark:text-blue-400 text-xs font-semibold">
                  <Loader2 class="w-4 h-4 animate-spin" />
                  <span>Checking shipment logs...</span>
                </div>
                
                <div v-else class="space-y-3">
                  <!-- General Status Badge -->
                  <div>
                    <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold shadow-sm" :class="getRowStatus(item).class">
                      <component :is="getRowStatus(item).icon" class="w-4 h-4" />
                      {{ getRowStatus(item).text }}
                    </div>
                  </div>

                  <!-- HDO List -->
                  <div v-if="getHdosForItem(item).length > 0" class="space-y-2">
                    <div v-for="hdo in getHdosForItem(item)" :key="hdo.no" class="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-3">
                      <div class="flex items-center gap-2 mb-2 pb-2 border-b border-dashed border-blue-100 dark:border-blue-900/60">
                        <Truck class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span class="text-[10px] font-bold text-blue-500 uppercase tracking-wider">HDO Pengiriman</span>
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-xs font-mono font-bold text-blue-700 dark:text-blue-300">{{ hdo.no }}</span>
                        <span class="text-xs font-bold text-blue-800 dark:text-blue-200 bg-blue-100 dark:bg-blue-900/60 px-2 py-0.5 rounded-lg border border-blue-200/50 dark:border-blue-800">{{ getSingleHdoQty(hdo, item) }} {{ item.unit }}</span>
                      </div>
                      <div v-if="hpoMapping[item.code] && getNoteType(item.admin_note) !== 'stock'" class="mt-2 text-[10px] text-blue-500 dark:text-blue-400 font-medium">
                        Ex PO: {{ hpoMapping[item.code] }}
                      </div>
                    </div>
                  </div>
                  
                  <div v-else-if="isHdoSyncing && getDisplayedQtyShipped(item) > 0" class="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-3 flex items-center gap-2">
                    <Loader2 class="w-4 h-4 text-blue-400 animate-spin" />
                    <span class="text-xs text-blue-500 font-medium">Memuat data HDO...</span>
                  </div>
                  
                  <div v-else-if="getDisplayedQtyShipped(item) > 0 && item.logistics_hdo" class="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-3">
                    <div class="flex items-center gap-2 mb-2 pb-2 border-b border-dashed border-blue-100 dark:border-blue-900/60">
                      <Truck class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span class="text-[10px] font-bold text-blue-500 uppercase tracking-wider">HDO Pengiriman</span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-mono font-bold text-blue-700 dark:text-blue-300">{{ item.logistics_hdo }}</span>
                      <span class="text-xs font-bold text-blue-800 dark:text-blue-200 bg-blue-100 dark:bg-blue-900/60 px-2 py-0.5 rounded-lg border border-blue-200/50 dark:border-blue-800">{{ item.qty_shipped }} {{ item.unit }}</span>
                    </div>
                  </div>

                  <!-- HPO List -->
                  <div v-if="!isDisplayedFullyShipped(item) && getNoteType(item.admin_note) !== 'stock' && getHpoEntries(item).length > 0" class="space-y-2">
                    <div v-for="(hpo, idx) in getHpoEntries(item)" :key="idx" 
                         v-show="!(getDisplayedQtyShipped(item) > 0 && getVisualStatus(getHpoShipment(item, hpo.poNumber)) === 'Already in Hokiindo Raya')"
                         class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm">
                      <div class="flex items-center gap-2 mb-2 pb-2 border-b border-dashed border-slate-100 dark:border-slate-700">
                        <ShoppingCart class="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PO Siemens</span>
                      </div>
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 truncate">{{ hpo.poNumber }}</span>
                        <span class="text-xs font-extrabold text-red-600 dark:text-red-400 whitespace-nowrap bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded-lg border border-red-100 dark:border-red-950/60">{{ hpo.quantity }} {{ item.unit }}</span>
                      </div>
                      
                      <div v-if="hpo.vendorName" class="mt-2 flex">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
                          🏢 {{ hpo.vendorName }}
                        </span>
                      </div>

                      <!-- Logistics status tree inside HPO -->
                      <template v-for="hpoShipment in [getHpoShipment(item, hpo.poNumber)]" :key="hpoShipment.id || hpo.poNumber">
                        <div v-if="hpoShipment.current_status && hpoShipment.current_status !== 'Pending Process'" class="mt-2.5">
                          <div class="flex items-center justify-between gap-2 bg-blue-50/50 dark:bg-blue-950/20 px-2.5 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900">
                            <div class="flex items-center gap-1.5 min-w-0">
                              <Truck class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                              <span class="text-[11px] font-bold text-blue-700 dark:text-blue-300 truncate">
                                {{ getVisualStatus(hpoShipment) === 'Follow up with our forwarder' ? 'Ex-Works' : getVisualStatus(hpoShipment) === 'Already in siemens Warehouse' ? 'Tiba Dunex' : getVisualStatus(hpoShipment) === 'Already in Hokiindo Raya' ? 'Tiba Hokiindo' : getVisualStatus(hpoShipment) }}
                              </span>
                            </div>
                            <span v-if="hpoShipment.exwork_waiting && getVisualStatus(hpoShipment) === 'Follow up with our forwarder'"
                                  class="text-[10px] font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                              ⏳ Waiting
                            </span>
                            <span v-else class="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                              {{ getVisualStatusDate(hpoShipment) || '-' }}
                            </span>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>

                  <!-- Fallback HPO from DB (imported status/manual PO) -->
                  <div v-else-if="!isDisplayedFullyShipped(item) && getNoteType(item.admin_note) !== 'stock' && item.logistics_hpo" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm">
                    <div class="flex items-center gap-2 mb-2 pb-2 border-b border-dashed border-slate-100 dark:border-slate-700">
                      <ShoppingCart class="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                      <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PO Siemens</span>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 truncate">{{ item.logistics_hpo }}</span>
                      <span class="text-xs font-extrabold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded-lg border border-red-100 dark:border-red-950/60">{{ item.qty_order }} {{ item.unit }}</span>
                    </div>

                    <!-- Logistics status if exists -->
                    <div v-if="item.logistics_status && item.logistics_status !== 'Pending Process'" class="mt-2.5">
                      <div class="flex items-center justify-between gap-2 bg-blue-50/50 dark:bg-blue-950/20 px-2.5 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900">
                        <div class="flex items-center gap-1.5 min-w-0">
                          <Truck class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                          <span class="text-[11px] font-bold text-blue-700 dark:text-blue-300 truncate">
                            {{ item.logistics_status === 'Follow up with our forwarder' ? 'Ex-Works' : item.logistics_status === 'ETA Port JKT' ? 'ETA JKT' : item.logistics_status === 'Already in siemens Warehouse' ? 'Tiba Dunex' : item.logistics_status === 'Already in Hokiindo Raya' ? 'Tiba Hokiindo' : item.logistics_status }}
                          </span>
                        </div>
                        <span v-if="item.exwork_waiting && item.logistics_status === 'Follow up with our forwarder'"
                              class="text-[10px] font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                          ⏳ Waiting
                        </span>
                        <span v-else class="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {{ formatDateSimple(item.exwork_date || item.eta_date || item.dunex_date || item.hokiindo_date || item.logistics_date) || '-' }}
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- Alert if partial shipped but no PO/ready -->
                  <div v-else-if="getDisplayedQtyShipped(item) > 0 && getDisplayedQtyRemaining(item) > 0 && !isSyncing" class="text-[11px] italic p-2 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                    <span v-if="item.qty_to_order > 0" class="text-red-600 dark:text-red-400 flex items-center gap-1.5">
                      <AlertTriangle class="w-3.5 h-3.5" />
                      Ada kekurangan PO ({{ getDisplayedQtyRemaining(item) }} {{ item.unit }})
                    </span>
                    <span v-else class="text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                      <Info class="w-3.5 h-3.5" />
                      Ada {{ getDisplayedQtyRemaining(item) }} {{ item.unit }} belum dikirim
                    </span>
                  </div>

                  <!-- Alert if old items need PO -->
                  <div v-else-if="item.qty_to_order > 0 && !isDisplayedFullyShipped(item) && !isSyncing && getHpoEntries(item).length === 0" class="text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <Clock class="w-3.5 h-3.5" />
                    <span>Pesanan sudah {{ getDaysSinceOrder() }} hari</span>
                  </div>

                  <!-- Hold by Customer Notification -->
                  <div v-if="!isSyncing && item.logistics_status === 'Hold by Customer'" class="text-[11px] font-bold p-3 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 rounded-lg flex items-center gap-2">
                    <Clock class="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <div>
                      <div class="text-amber-800 dark:text-amber-300">⚠️ HOLD BY CUSTOMER</div>
                      <div class="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 font-normal">Item ditunda oleh customer</div>
                    </div>
                  </div>

                  <!-- Admin Note -->
                  <div v-if="!isSyncing && item.logistics_note && !item.logistics_note.includes('Auto-synced') && !item.logistics_note.includes('Auto-created')" class="text-[11px] text-slate-600 dark:text-slate-400 p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-800 leading-normal">
                    <span class="font-bold text-[9px] uppercase text-slate-400 block mb-0.5">Admin Logistics Note:</span>
                    {{ item.logistics_note }}
                  </div>
                </div>
              </div>
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
                      <!-- Jika ada stock, siap dikirim -->
                      <div v-else class="flex items-center gap-2">
                          <Hourglass class="w-5 h-5 text-blue-600" />
                          <div>
                              <p class="text-xs font-bold text-blue-700">SIAP DIKIRIM</p>
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
                                 <p class="text-base font-bold text-blue-800 dark:text-blue-300">Barang Ready / Siap Kirim</p>
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

      <!-- EMAIL REMINDER MODAL -->
      <div v-if="isEmailModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-3xl w-full mx-4 flex flex-col border border-slate-200 dark:border-slate-800 max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200 text-slate-900 dark:text-white">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex justify-between items-center shrink-0">
            <div>
              <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Mail class="w-5 h-5 text-blue-600 dark:text-blue-400"/>
                Kirim Email Reminder HSO
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Kirim resume produk HSO yang belum dikirim ke email info & sales Hokiindo.
              </p>
            </div>
            <button @click="isEmailModalOpen = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl font-bold p-1">&times;</button>
          </div>
          
          <!-- Content -->
          <div class="p-6 overflow-y-auto flex-1 space-y-4 text-sm">
            <!-- Recipients -->
            <div class="space-y-1">
              <label class="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Penerima Email (Koma sebagai pemisah)</label>
              <input 
                v-model="emailForm.to" 
                type="text" 
                class="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-medium"
              />
            </div>

            <!-- Subject -->
            <div class="space-y-1">
              <label class="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Subjek Email</label>
              <input 
                v-model="emailForm.subject" 
                type="text" 
                class="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-medium"
              />
            </div>

            <!-- Custom Message -->
            <div class="space-y-1">
              <label class="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Pesan Tambahan (Opsional, di bagian atas resume)</label>
              <textarea 
                v-model="emailForm.customMessage" 
                rows="3" 
                placeholder="Contoh: Berikut resume status pengiriman produk HSO..."
                class="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-medium"
              ></textarea>
            </div>

            <!-- Email Preview -->
            <div class="space-y-1">
              <label class="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Pratinjau Resume Email</label>
              <div class="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/60 max-h-[30vh] overflow-y-auto text-xs space-y-4">
                <!-- Custom Message Preview -->
                <p class="font-medium whitespace-pre-line text-slate-700 dark:text-slate-300">
                  {{ emailForm.customMessage || 'Berikut resume status pengiriman produk HSO...' }}
                </p>
                
                <div v-if="siemensPushItems.length > 0" class="space-y-2 border-t pt-3 border-dashed border-slate-200 dark:border-slate-700">
                  <div class="flex items-center justify-between mb-1">
                    <h4 class="font-bold text-red-600 dark:text-red-400 uppercase tracking-wider text-[10px]">
                      🚨 KELOMPOK PUSH SIEMENS (NO STOCK + HPO AKTIF)
                    </h4>
                    <button 
                      @click="copyTableToClipboard('siemens')"
                      class="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700 transition-all flex items-center gap-1 active:scale-95 focus:ring-1 focus:ring-red-500"
                    >
                      <component :is="isSiemensCopied ? CheckCircle2 : Copy" class="w-3 h-3 text-slate-500" />
                      {{ isSiemensCopied ? 'Tabel Disalin!' : 'Copy Table' }}
                    </button>
                  </div>
                  <div class="border rounded-md overflow-hidden bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <table class="w-full text-left border-collapse text-[11px]">
                      <thead class="bg-slate-50 dark:bg-slate-900 text-slate-500">
                        <tr>
                          <th class="p-2 font-semibold">SKU / Nama</th>
                          <th class="p-2 font-semibold">HPO</th>
                          <th class="p-2 font-semibold text-center">Qty</th>
                          <th class="p-2 font-semibold">Status</th>
                          <th class="p-2 font-semibold">Tanggal</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                        <tr v-for="item in siemensPushItems" :key="item.code" class="text-slate-700 dark:text-slate-300">
                          <td class="p-2">
                            <span class="font-bold font-mono">{{ item.code }}</span>
                            <span class="block text-[10px] text-slate-400 truncate max-w-[200px]">{{ item.name }}</span>
                          </td>
                          <td class="p-2 font-mono font-semibold">{{ item.hpo }}</td>
                          <td class="p-2 font-bold text-center">{{ item.qty }}</td>
                          <td class="p-2">
                            <span class="inline-block px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-bold border border-blue-200 dark:border-blue-800">
                              {{ item.status }}
                            </span>
                          </td>
                          <td class="p-2 font-mono">{{ item.date || '-' }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div v-if="undeliveredItems.length > 0" class="space-y-2 border-t pt-3 border-dashed border-slate-200 dark:border-slate-700">
                  <div class="flex items-center justify-between mb-1">
                    <h4 class="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[10px]">
                      📋 RESUME PRODUK SO (BELUM DIKIRIM PENUH)
                    </h4>
                    <button 
                      @click="copyTableToClipboard('resume')"
                      class="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700 transition-all flex items-center gap-1 active:scale-95 focus:ring-1 focus:ring-blue-500"
                    >
                      <component :is="isResumeCopied ? CheckCircle2 : Copy" class="w-3 h-3 text-slate-500" />
                      {{ isResumeCopied ? 'Tabel Disalin!' : 'Copy Table' }}
                    </button>
                  </div>
                  <div class="border rounded-md overflow-hidden bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <table class="w-full text-left border-collapse text-[11px]">
                      <thead class="bg-slate-50 dark:bg-slate-900 text-slate-500">
                        <tr>
                          <th class="p-2 font-semibold">SKU / Nama</th>
                          <th class="p-2 font-semibold text-center">Order</th>
                          <th class="p-2 font-semibold text-center">Terkirim</th>
                          <th class="p-2 font-semibold text-center">Sisa</th>
                          <th class="p-2 font-semibold">Status Utama</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                        <tr v-for="item in undeliveredItems" :key="item.code" class="text-slate-700 dark:text-slate-300">
                          <td class="p-2">
                            <span class="font-bold font-mono">{{ item.code }}</span>
                            <span class="block text-[10px] text-slate-400 truncate max-w-[200px]">{{ item.name }}</span>
                          </td>
                          <td class="p-2 text-center">{{ item.qty_order }}</td>
                          <td class="p-2 text-center text-blue-600 dark:text-blue-400 font-bold">{{ item.qty_shipped }}</td>
                          <td class="p-2 text-center text-red-600 dark:text-red-400 font-bold">{{ item.qty_remaining }}</td>
                          <td class="p-2">
                            <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border" :class="item.statusClass">
                              {{ item.statusText }}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30 flex justify-end gap-3 shrink-0">
            <Button variant="outline" @click="isEmailModalOpen = false" :disabled="isSendingEmail">BATAL</Button>
            <Button class="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5" @click="sendReminderEmail" :disabled="isSendingEmail">
              <Loader2 v-if="isSendingEmail" class="w-4 h-4 animate-spin"/>
              <Mail v-else class="w-4 h-4"/>
              <span>{{ isSendingEmail ? 'MENGIRIM...' : 'KIRIM EMAIL' }}</span>
            </Button>
          </div>
        </div>
      </div>
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