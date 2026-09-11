<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { 
    Loader2, AlertCircle, ChevronDown, ChevronUp, 
    Truck, Package, Clock, MessageCircle, Send, Download,
    CheckCircle2, Search, Copy, Check, Calendar, ArrowRight, ShieldCheck, Box,
    Layers
} from 'lucide-vue-next'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'

// --- SETUP & STATE ---
const route = useRoute()
const uniqueCode = route.params.code

const soHeader = ref(null)      
const soItems = ref([])         
const isLoading = ref(true)
const fetchError = ref(null)
const searchQuery = ref('')
const isCopied = ref(false)

// State untuk Collapse/Expand Section
const expandedSections = ref({
    shipped: true,
    pending: true
})

const toggleSection = (key) => {
    expandedSections.value[key] = !expandedSections.value[key]
}

const copySoNumber = () => {
    if (!soHeader.value?.number) return
    navigator.clipboard.writeText(soHeader.value.number)
    isCopied.value = true
    setTimeout(() => { isCopied.value = false }, 2000)
}

// --- CONFIG STATUS TEXT ---
const getStatusText = (item, type) => {
    if (type === 'shipped') return 'Barang Sedang Dikirim / Diterima'
    if (type === 'pending') return 'Menunggu Proses Antrian'
    
    const status = item?.status || ''
    if (['Follow up with our forwarder', 'Follow up to factory', 'Follow up to our factory', 'Ex-Works'].includes(status)) {
        if (item?.exwork_waiting || !item?.exwork_date) {
            return 'Ex-Works - Waiting Confirmation'
        }
        return 'Ex-Works'
    }
    
    const map = {
        'Follow up to factory': item?.exwork_waiting || !item?.exwork_date ? 'Ex-Works - Waiting Confirmation' : 'Ex-Works',
        'Follow up to our factory': item?.exwork_waiting || !item?.exwork_date ? 'Ex-Works - Waiting Confirmation' : 'Ex-Works',
        'Ex-Works': item?.exwork_waiting || !item?.exwork_date ? 'Ex-Works - Waiting Confirmation' : 'Ex-Works',
        'ETA Port JKT': 'ETA Port Jakarta',
        'Already in siemens Warehouse': 'Tiba di Gudang Dunex',
        'Already in Hokiindo Raya': 'Siap Dikirim',
        'Ready Stock': 'Siap Dikirim',
        'Completed': 'Selesai',
        'NO ACTION': 'Ex-Works - Waiting Confirmation',
        'Pending Process': 'Menunggu Jadwal Pengiriman',
        'Diproses': 'Menunggu Jadwal Pengiriman'
    }
    return map[status] || (status ? status : 'Menunggu Jadwal Pengiriman')
}

const getStatusBadgeClass = (status) => {
    if (['Completed', 'Already in Hokiindo Raya', 'Ready Stock'].includes(status)) {
        return 'text-emerald-700 bg-emerald-50/90 border-emerald-200/90'
    }
    if (['ETA Port JKT'].includes(status)) {
        return 'text-blue-700 bg-blue-50/90 border-blue-200/90'
    }
    if (['Already in siemens Warehouse'].includes(status)) {
        return 'text-cyan-700 bg-cyan-50/90 border-cyan-200/90'
    }
    // Ex-Works (Follow up with our forwarder, Follow up to factory, NO ACTION, Pending Process, default)
    return 'text-amber-800 bg-amber-50/90 border-amber-200'
}

// Format date helper
const formatDate = (dateStr) => {
    if (!dateStr) return null
    try {
        const d = new Date(dateStr)
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch {
        return dateStr
    }
}

// Helper: Active milestone date for single status display
const getItemActiveDate = (item) => {
    if (!item) return null
    if (item.is_ready || item.status === 'Already in Hokiindo Raya' || item.status === 'Ready Stock') {
        return item.hokiindo_date ? `Tiba: ${formatDate(item.hokiindo_date)}` : null
    }
    if (item.status === 'Already in siemens Warehouse') {
        return item.dunex_date ? `Tiba: ${formatDate(item.dunex_date)}` : null
    }
    if (item.status === 'ETA Port JKT') {
        return item.eta_date ? `ETA: ${formatDate(item.eta_date)}` : null
    }
    if (['Follow up to factory', 'Follow up to our factory', 'Follow up with our forwarder', 'Ex-Works'].includes(item.status)) {
        if (item.exwork_date && !item.exwork_waiting) {
            return `Ex-Works: ${formatDate(item.exwork_date)}`
        }
        if (item.exwork_waiting) {
            return 'Menunggu konfirmasi jadwal'
        }
        return null
    }
    return null
}

// Helper: Parse stock info from admin note
const parseStockFromNote = (note) => {
    if (!note) return { qty: 0, isReady: false, hasInfo: false }
    const lower = note.toLowerCase()
    
    // No stock / kosong / indent
    if (lower.includes('no stock') || lower.includes('non stock') || lower.includes('kosong') || lower.includes('indent')) {
        return { qty: 0, isReady: false, hasInfo: true }
    }
    
    // Cek apakah ada angka setelah stock/stok
    const match = lower.match(/(?:stock|stok|sisa)\s*[:.]?\s*(\d+)/)
    if (match) {
        return { qty: parseInt(match[1]), isReady: false, hasInfo: true }
    }
    
    // Jika ada kata stock/stok/ready tapi TIDAK ada angka = ready stock
    if (lower.includes('stock') || lower.includes('stok') || lower.includes('ready')) {
        return { qty: 999999, isReady: true, hasInfo: true }
    }
    
    return { qty: 0, isReady: false, hasInfo: false }
}

// --- DATA FETCHING ---
const fetchTrackingData = async () => {
    isLoading.value = true
    try {
        const { data: linkData, error: linkError } = await supabase
            .from('so_tracking_links').select('so_id').eq('unique_code', uniqueCode).maybeSingle()
        if (linkError || !linkData) throw new Error("Link tracking tidak valid atau sudah kadaluarsa.")
        
        const soId = linkData.so_id

        const { data: accData, error: accError } = await supabase.functions.invoke('accurate-detail-so', {
            body: { id: parseInt(soId), type: 'sales-order' }
        })
        if (accError || !accData?.s) throw new Error("Gagal mengambil data pesanan dari Accurate.")
        const d = accData.d

        const itemCodes = (d.detailItem || []).map(i => i.item?.no || i.detailName).filter(Boolean)

        const [shipRes, rawTrackRes, poItemsRes] = await Promise.all([
            supabase
                .from('shipments')
                .select('item_code, current_status, hpo_number, exwork_date, exwork_waiting, eta_date, dunex_date, hokiindo_date, status_date')
                .eq('so_id', String(soId)),
            itemCodes.length > 0
                ? supabase.from('raw_forwarder_tracking').select('*').in('item_code', itemCodes)
                : Promise.resolve({ data: [] }),
            itemCodes.length > 0
                ? supabase.from('accurate_purchase_order_items').select('item_code, hso_number, detail_notes, po:accurate_purchase_orders(number, status_name)').in('item_code', itemCodes)
                : Promise.resolve({ data: [] })
        ])

        const shipmentsList = shipRes.data || []
        const forwarderList = rawTrackRes.data || []
        const poItemList = poItemsRes.data || []

        const normStr = (s) => String(s || '').trim().toUpperCase().replace(/[\s\-\.]/g, '')
        const normHpo = (s) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')

        soHeader.value = {
            number: d.number,
            client: d.customer?.name || '-',
            po_number: d.poNumber || '-',
            order_date: d.transDate || null,
            do_list: (d.processHistory || [])
                .filter(h => h.historyType === 'DO')
                .map(h => h.historyNumber || h.no)
                .filter(Boolean)
                .join(', '),
            items_raw: d.detailItem
        }

        if (typeof document !== 'undefined') {
            document.title = `${d.number || 'Tracking'} | PT Hokiindo Raya`
        }

        const soNumClean = String(d.number || '').replace(/[^0-9]/g, '')

        soItems.value = (d.detailItem || []).map(item => {
            const itemCode = item.item?.no || item.detailName
            const codeKey = normStr(itemCode)
            
            const note = item.detailNotes || ''
            const stockInfo = parseStockFromNote(note)

            const qtyOrder = item.quantity || 0
            const qtyShipped = item.shipQuantity || 0
            const qtyRemaining = Math.max(0, qtyOrder - qtyShipped)

            // Cek sisa stok yang belum terkirim
            let isRemainingStockReady = false
            if (stockInfo.isReady) {
                isRemainingStockReady = true
            } else if (stockInfo.hasInfo && stockInfo.qty > 0) {
                const stockRemaining = Math.max(0, stockInfo.qty - qtyShipped)
                isRemainingStockReady = stockRemaining >= qtyRemaining && qtyRemaining > 0
            }

            // Ambil semua data shipments untuk item ini
            const myShipments = shipmentsList.filter(s => normStr(s.item_code) === codeKey)
            const inProgressShipments = myShipments.filter(s => !['Already in Hokiindo Raya', 'Completed'].includes(s.current_status) && !s.hokiindo_date)
            const arrivedShipments = myShipments.filter(s => ['Already in Hokiindo Raya', 'Completed'].includes(s.current_status) || s.hokiindo_date)

            // Cari active HPO untuk item ini
            let activeHpo = inProgressShipments[0]?.hpo_number || myShipments[0]?.hpo_number
            if (!activeHpo && soNumClean) {
                const matchedPoItem = poItemList.find(p => normStr(p.item_code) === codeKey && (String(p.hso_number || '').includes(soNumClean) || String(p.detail_notes || '').includes(soNumClean)))
                if (matchedPoItem?.po?.number) {
                    activeHpo = matchedPoItem.po.number
                }
            }

            // Cari live tracking dari raw_forwarder_tracking
            let liveTrack = null
            if (activeHpo) {
                liveTrack = forwarderList.find(t => normStr(t.item_code) === codeKey && normHpo(t.hpo_number) === normHpo(activeHpo))
            }
            if (!liveTrack) {
                liveTrack = forwarderList.find(t => normStr(t.item_code) === codeKey)
            }

            let logistik = {}
            let isReadyToShip = false

            if (isRemainingStockReady) {
                isReadyToShip = true
                logistik = { status: 'Ready Stock' }
            } else if (inProgressShipments.length > 0) {
                const sortedInProgress = [...inProgressShipments].sort((a, b) => {
                    const tA = new Date(a.status_date || a.updated_at || 0).getTime()
                    const tB = new Date(b.status_date || b.updated_at || 0).getTime()
                    return tB - tA
                })
                logistik = { ...sortedInProgress[0] }
                isReadyToShip = false
            } else if (arrivedShipments.length > 0) {
                logistik = { ...arrivedShipments[0] }
                isReadyToShip = true
            } else {
                logistik = {}
                isReadyToShip = false
            }

            // Gabungkan dengan live forwarder tracking jika ada update lebih baru
            let exwork = liveTrack?.exwork_date || logistik.exwork_date || null
            let exworkWaiting = liveTrack ? Boolean(liveTrack.exwork_waiting) : Boolean(logistik.exwork_waiting)
            let eta = liveTrack?.eta_date || logistik.eta_date || null
            let dunex = logistik.dunex_date || null
            let hokiindo = arrivedShipments[0]?.hokiindo_date || logistik.hokiindo_date || null

            let effectiveStatus = isReadyToShip ? 'Ready Stock' : (logistik.current_status || 'Pending Process')

            if (liveTrack && !isReadyToShip && qtyRemaining > 0) {
                const trStat = (liveTrack.status || '').toLowerCase()
                if (trStat.includes('warehouse') || trStat.includes('dunex') || trStat.includes('our warehouse')) {
                    effectiveStatus = 'Already in siemens Warehouse'
                    dunex = liveTrack.eta_date || liveTrack.delivery_date || dunex || '2026-09-09'
                } else if (trStat.includes('factory')) {
                    effectiveStatus = 'Follow up to factory'
                    exworkWaiting = false
                } else if (trStat.includes('done delivery') || trStat.includes('hokiindo')) {
                    effectiveStatus = 'Already in Hokiindo Raya'
                    isReadyToShip = true
                    hokiindo = liveTrack.delivery_date || hokiindo
                } else if (trStat.includes('eta') || trStat.includes('port')) {
                    effectiveStatus = 'ETA Port JKT'
                } else if (trStat.includes('forwarder')) {
                    effectiveStatus = 'Follow up with our forwarder'
                }
            }

            // PENTING: Jika barang berstatus in-progress, jangan set hokiindo_date pada item yang belum sampai
            if (!isReadyToShip && effectiveStatus !== 'Already in Hokiindo Raya') {
                hokiindo = null
            }

            // Ambil sub-schedules / split delivery batches
            const matchingForwarderRows = forwarderList.filter(t => {
                if (normStr(t.item_code) !== codeKey) return false
                if (activeHpo) return normHpo(t.hpo_number) === normHpo(activeHpo)
                return true
            })

            const parseBatchSchedule = (raw) => {
                const sLower = String(raw.status || raw.current_status || '').toLowerCase()
                let status = 'Follow up with our forwarder'
                let label = 'Ex-Works'
                let rawDate = null

                if (raw.delivery_date || raw.hokiindo_date || sLower.includes('done delivery') || sLower.includes('delivered') || sLower.includes('hokiindo')) {
                    status = 'Already in Hokiindo Raya'
                    label = 'Tiba di Hokiindo'
                    rawDate = raw.delivery_date || raw.hokiindo_date
                } else if (raw.dunex_date || sLower.includes('warehouse') || sLower.includes('dunex') || sLower.includes('our wh') || sLower.includes('siemens wh')) {
                    status = 'Already in siemens Warehouse'
                    label = 'Tiba di DUNEX'
                    rawDate = raw.dunex_date || raw.delivery_date || raw.eta_date
                } else if (raw.eta_date || sLower.includes('eta') || sLower.includes('port')) {
                    status = 'ETA Port JKT'
                    label = 'ETA Port JKT'
                    rawDate = raw.eta_date
                } else if (sLower.includes('factory')) {
                    status = 'Follow up to factory'
                    label = 'Ex-Works'
                    rawDate = raw.exwork_date
                } else {
                    status = 'Follow up with our forwarder'
                    label = 'Ex-Works'
                    rawDate = raw.exwork_date
                }

                let displayDate = '-'
                if (rawDate) {
                    displayDate = formatDate(rawDate)
                } else if (raw.exwork_waiting) {
                    displayDate = 'Waiting Confirmation'
                }

                return {
                    qty: Number(raw.quantity || raw.qty || 0),
                    status: label,
                    rawStatus: status,
                    date: displayDate,
                    rawDate
                }
            }

            let subSchedules = []
            let rawBatchesList = []
            if (matchingForwarderRows.length > 1) {
                rawBatchesList = matchingForwarderRows.map(parseBatchSchedule)
            } else if (inProgressShipments.length > 1) {
                rawBatchesList = inProgressShipments.map(parseBatchSchedule)
            }

            if (rawBatchesList.length > 0) {
                const batchMap = new Map()
                rawBatchesList.forEach(b => {
                    const key = `${b.status}__${b.date}`
                    if (!batchMap.has(key)) {
                        batchMap.set(key, { ...b })
                    } else {
                        const existing = batchMap.get(key)
                        if (b.qty && existing.qty) {
                            existing.qty += b.qty
                        }
                    }
                })
                subSchedules = Array.from(batchMap.values())
            }

            return {
                name: item.item?.name || item.detailName,
                code: itemCode,
                qty_order: qtyOrder,
                qty_shipped: qtyShipped,
                qty_remaining: qtyRemaining,
                is_ready: isReadyToShip,
                status: effectiveStatus,
                exwork_date: exwork || null,
                exwork_waiting: exworkWaiting,
                eta_date: eta || null,
                dunex_date: dunex || null,
                hokiindo_date: hokiindo || null,
                sub_schedules: subSchedules
            }
        })

    } catch (error) {
        fetchError.value = error.message
    } finally {
        isLoading.value = false
    }
}

onMounted(() => {
    if (uniqueCode) fetchTrackingData()
    else fetchError.value = "Kode tracking tidak valid atau hilang."
})

// --- COMPUTED GROUPING ---
const groupedData = computed(() => {
    if (!soItems.value.length) return { shipped: [], processing: [], percentage: 0, countShipped: 0, countProcessing: 0, totalItems: 0 };

    const shipped = [];
    const processing = [];
    let totalItems = 0;
    let totalShipped = 0;

    soItems.value.forEach(item => {
        totalItems += item.qty_order;
        totalShipped += item.qty_shipped;

        // 1. Shipped
        if (item.qty_shipped > 0) {
            shipped.push({ ...item, displayQty: item.qty_shipped });
        }

        // 2. Remaining (Processing/In Process)
        const remainingQty = item.qty_order - item.qty_shipped;
        if (remainingQty > 0) {
            processing.push({ ...item, displayQty: remainingQty });
        }
    });

    return { 
        shipped, 
        processing,
        percentage: totalItems === 0 ? 0 : Math.round((totalShipped / totalItems) * 100),
        countShipped: shipped.reduce((acc, i) => acc + i.displayQty, 0),
        countProcessing: processing.reduce((acc, i) => acc + i.displayQty, 0),
        totalItems
    };
})

const filteredProcessing = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return groupedData.value.processing
    return groupedData.value.processing.filter(i => 
        (i.name && i.name.toLowerCase().includes(q)) || 
        (i.code && i.code.toLowerCase().includes(q))
    )
})

const filteredShipped = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return groupedData.value.shipped
    return groupedData.value.shipped.filter(i => 
        (i.name && i.name.toLowerCase().includes(q)) || 
        (i.code && i.code.toLowerCase().includes(q))
    )
})

const exportToExcel = () => {
    const data = [];
    soItems.value.forEach(item => {
        let splitDetail = '-'
        if (item.sub_schedules && item.sub_schedules.length > 1) {
            splitDetail = item.sub_schedules.map((s, idx) => `Batch ${idx + 1}: ${s.qty ? s.qty + ' Unit ' : ''}[${s.status}] ${s.date && s.date !== '-' ? s.date : ''}`.trim()).join('; ')
        }

        data.push({
            "Kode Produk": item.code,
            "Nama Produk": item.name,
            "Total Order": item.qty_order,
            "Total Terkirim": item.qty_shipped,
            "Sisa/Proses": item.qty_order - item.qty_shipped,
            "Status Logistik": getStatusText(item, 'process'),
            "Pengiriman Parsial": item.sub_schedules && item.sub_schedules.length > 1 ? `Split (${item.sub_schedules.length} Batch)` : 'Normal',
            "Rincian Split": splitDetail,
            "Ex-Work Date": formatDate(item.exwork_date) || '-',
            "ETA Port": formatDate(item.eta_date) || '-',
            "Tiba di DUNEX": formatDate(item.dunex_date) || '-',
            "Siap Kirim": item.is_ready ? 'Ya' : 'Tidak'
        });
    });
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tracking Status");
    XLSX.writeFile(wb, `Tracking_${soHeader.value?.number || 'Data'}_PT_Hokiindo_Raya.xlsx`);
}
</script>

<template>
    <div class="tracking-root min-h-screen bg-zinc-50/70 text-zinc-900 pb-28 antialiased selection:bg-zinc-900 selection:text-white">
        
        <!-- Loading State -->
        <div v-if="isLoading" class="h-screen flex flex-col items-center justify-center bg-white px-4">
            <div class="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-50 border border-zinc-200/80 shadow-xs mb-4">
                <Loader2 class="w-8 h-8 animate-spin text-zinc-900"/>
            </div>
            <p class="text-xs font-semibold tracking-wider text-zinc-500 uppercase">Memuat data pengiriman...</p>
            <p class="text-xs text-zinc-400 mt-1">Sinkronisasi status real-time</p>
        </div>

        <!-- Error State -->
        <div v-else-if="fetchError" class="h-screen flex flex-col items-center justify-center p-6 text-center bg-zinc-50">
            <div class="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4 shadow-xs">
                <AlertCircle class="w-8 h-8"/>
            </div>
            <h3 class="text-lg font-semibold text-zinc-900 tracking-tight">Terjadi Kesalahan</h3>
            <p class="mt-1 text-sm text-zinc-500 max-w-md">{{ fetchError }}</p>
            <Button variant="outline" class="mt-6 text-xs h-9 rounded-lg border-zinc-300" @click="fetchTrackingData">
                Coba Lagi
            </Button>
        </div>

        <!-- Main Tracking Content -->
        <div v-else class="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10">
            
            <!-- Top Navbar / Brand -->
            <header class="bg-white rounded-2xl border border-zinc-200/80 p-5 sm:p-7 shadow-[0_1px_3px_rgba(0,0,0,0.03)] mb-6 transition-all">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-5 border-b border-zinc-100 pb-6">
                    <div class="flex items-center gap-3.5">
                        <div class="w-12 h-12 rounded-xl bg-white border border-zinc-200/80 shadow-2xs flex items-center justify-center overflow-hidden p-1.5 shrink-0">
                            <img src="https://shop.hokiindo.co.id/favicon.ico" alt="PT Hokiindo Raya" class="w-full h-full object-contain"/>
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="text-xs font-semibold tracking-wide uppercase text-zinc-500">PT Hokiindo Raya</span>
                                <span class="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Live Status
                                </span>
                            </div>
                            <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950 mt-0.5">{{ soHeader?.client }}</h1>
                        </div>
                    </div>

                    <div class="flex items-center gap-2.5">
                        <Button variant="outline" class="h-9 px-3.5 text-xs font-medium border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 rounded-lg shadow-2xs gap-1.5 transition-colors" @click="exportToExcel">
                            <Download class="w-3.5 h-3.5 text-zinc-500" />
                            <span>Export Excel</span>
                        </Button>
                    </div>
                </div>

                <!-- Metadata Row -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 text-xs">
                    <!-- SO Number -->
                    <div class="bg-zinc-50/70 border border-zinc-200/60 rounded-xl p-3 relative group">
                        <p class="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">No. Sales Order</p>
                        <div class="flex items-center justify-between mt-1">
                            <span class="font-mono font-semibold text-zinc-900 text-xs sm:text-[13px] truncate">{{ soHeader?.number }}</span>
                            <button 
                                @click="copySoNumber" 
                                class="text-zinc-400 hover:text-zinc-700 p-1 rounded transition-colors" 
                                :title="isCopied ? 'Tersalin!' : 'Salin nomor SO'">
                                <Check v-if="isCopied" class="w-3.5 h-3.5 text-emerald-600" />
                                <Copy v-else class="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    <!-- Customer PO -->
                    <div class="bg-zinc-50/70 border border-zinc-200/60 rounded-xl p-3">
                        <p class="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">No. PO Customer</p>
                        <p class="font-mono font-semibold text-zinc-900 text-xs sm:text-[13px] mt-1 truncate">{{ soHeader?.po_number || '-' }}</p>
                    </div>

                    <!-- Total Items -->
                    <div class="bg-zinc-50/70 border border-zinc-200/60 rounded-xl p-3">
                        <p class="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Total Pesanan</p>
                        <p class="font-semibold text-zinc-900 text-xs sm:text-[13px] mt-1">{{ groupedData.totalItems }} Unit</p>
                    </div>

                    <!-- DO Reference -->
                    <div class="bg-zinc-50/70 border border-zinc-200/60 rounded-xl p-3">
                        <p class="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Surat Jalan (DO)</p>
                        <p class="font-mono font-semibold text-emerald-700 text-xs sm:text-[13px] mt-1 truncate" :title="soHeader?.do_list || '-'">
                            {{ soHeader?.do_list || 'Belum ada' }}
                        </p>
                    </div>
                </div>
            </header>

            <!-- Metrics Bento Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <!-- Card 1: Delivered -->
                <div class="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Sudah Dikirim</span>
                        <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                            <CheckCircle2 class="w-4 h-4" />
                        </div>
                    </div>
                    <div class="mt-3">
                        <div class="flex items-baseline gap-2">
                            <span class="text-3xl font-bold tracking-tight text-zinc-950 font-mono">{{ groupedData.countShipped }}</span>
                            <span class="text-xs font-medium text-zinc-400">Unit</span>
                        </div>
                        <p class="text-[11px] text-emerald-600 font-medium mt-1">Selesai terkirim ke customer</p>
                    </div>
                </div>

                <!-- Card 2: In Process -->
                <div class="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Dalam Proses</span>
                        <div class="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                            <Clock class="w-4 h-4" />
                        </div>
                    </div>
                    <div class="mt-3">
                        <div class="flex items-baseline gap-2">
                            <span class="text-3xl font-bold tracking-tight text-zinc-950 font-mono">{{ groupedData.countProcessing }}</span>
                            <span class="text-xs font-medium text-zinc-400">Unit</span>
                        </div>
                        <p class="text-[11px] text-amber-600 font-medium mt-1">Sedang logistik / pengadaan</p>
                    </div>
                </div>

                <!-- Card 3: Fulfillment Progress -->
                <div class="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Fulfillment Rate</span>
                        <span class="font-mono text-xs font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded-md">
                            {{ groupedData.percentage }}%
                        </span>
                    </div>
                    <div class="mt-4">
                        <div class="h-2.5 w-full bg-zinc-100 rounded-full overflow-hidden p-0.5 border border-zinc-200/60">
                            <div class="h-full bg-zinc-900 rounded-full transition-all duration-700 ease-out" 
                                 :style="{ width: `${groupedData.percentage}%` }"></div>
                        </div>
                        <p class="text-[11px] text-zinc-400 font-medium mt-2 flex justify-between">
                            <span>{{ groupedData.countShipped }} dari {{ groupedData.totalItems }} unit</span>
                            <span>{{ groupedData.percentage }}% Lengkap</span>
                        </p>
                    </div>
                </div>
            </div>

            <!-- Search Filter Bar (if items exist) -->
            <div v-if="soItems.length > 2" class="mb-5">
                <div class="relative">
                    <Search class="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input 
                        v-model="searchQuery" 
                        type="text" 
                        placeholder="Cari berdasarkan kode part atau nama barang..."
                        class="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200/90 rounded-xl text-xs sm:text-sm text-zinc-800 placeholder-zinc-400 shadow-2xs focus:outline-hidden focus:border-zinc-400 transition-colors"
                    />
                </div>
            </div>

            <!-- Sections Container -->
            <div class="space-y-6">

                <!-- SECTION 1: SUDAH DIKIRIM (COMPLETED) -->
                <section v-if="groupedData.shipped.length > 0" class="bg-white border border-zinc-200/80 rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                    <!-- Header -->
                    <div @click="toggleSection('shipped')" class="cursor-pointer bg-zinc-50/50 p-4 sm:p-5 flex justify-between items-center border-b border-zinc-100 select-none hover:bg-zinc-50 transition-colors">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
                                <Truck class="w-4 h-4" />
                            </div>
                            <div>
                                <div class="flex items-center gap-2">
                                    <h2 class="font-semibold text-zinc-900 text-sm sm:text-base tracking-tight">BARANG SUDAH DIKIRIM</h2>
                                    <span class="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                        {{ groupedData.countShipped }} Unit
                                    </span>
                                </div>
                                <p class="text-xs text-zinc-500 mt-0.5" v-if="soHeader.do_list">Surat Jalan: {{ soHeader.do_list }}</p>
                            </div>
                        </div>
                        <component :is="expandedSections.shipped ? ChevronUp : ChevronDown" class="w-4 h-4 text-zinc-400"/>
                    </div>
                    
                    <!-- Items List -->
                    <div v-show="expandedSections.shipped" class="divide-y divide-zinc-100">
                        <div v-if="filteredShipped.length === 0" class="p-6 text-center text-xs text-zinc-400 italic">
                            Tidak ada barang terkirim yang cocok dengan pencarian.
                        </div>
                        <div v-for="(item, idx) in filteredShipped" :key="idx" class="p-4 sm:p-5 hover:bg-zinc-50/50 transition-colors flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                            <div class="flex-1 min-w-0">
                                <p class="font-medium text-sm text-zinc-900 leading-snug">{{ item.name }}</p>
                                <div class="flex flex-wrap items-center gap-2 mt-1.5">
                                    <span class="font-mono text-xs font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-md">
                                        {{ item.code }}
                                    </span>
                                    <span class="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-md">
                                        {{ item.displayQty }} Unit
                                    </span>
                                </div>
                            </div>
                            <div class="flex items-center gap-3 sm:text-right shrink-0">
                                <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                                    <CheckCircle2 class="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Terkirim</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- SECTION 2: DALAM PROSES (IN PROCESS) -->
                <section v-if="groupedData.processing.length > 0" class="bg-white border border-zinc-200/80 rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                    <!-- Header -->
                    <div @click="toggleSection('pending')" class="cursor-pointer bg-zinc-50/50 p-4 sm:p-5 flex justify-between items-center border-b border-zinc-100 select-none hover:bg-zinc-50 transition-colors">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
                                <Clock class="w-4 h-4" />
                            </div>
                            <div>
                                <div class="flex items-center gap-2">
                                    <h2 class="font-semibold text-zinc-900 text-sm sm:text-base tracking-tight">BARANG DALAM PROSES</h2>
                                    <span class="text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                                        {{ groupedData.countProcessing }} Unit
                                    </span>
                                </div>
                                <p class="text-xs text-zinc-500 mt-0.5">Status tahapan logistik & pengadaan</p>
                            </div>
                        </div>
                        <component :is="expandedSections.pending ? ChevronUp : ChevronDown" class="w-4 h-4 text-zinc-400"/>
                    </div>
                    
                    <!-- Items List -->
                    <div v-show="expandedSections.pending" class="divide-y divide-zinc-100">
                        <div v-if="filteredProcessing.length === 0" class="p-6 text-center text-xs text-zinc-400 italic">
                            Tidak ada barang proses yang cocok dengan pencarian.
                        </div>
                        <div v-for="(item, idx) in filteredProcessing" :key="idx" class="p-4 sm:p-5 hover:bg-zinc-50/50 transition-colors">
                            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                                <!-- Product Info -->
                                <div class="flex-1 min-w-0">
                                    <p class="font-medium text-sm text-zinc-900 leading-snug">{{ item.name }}</p>
                                    <div class="flex flex-wrap items-center gap-2 mt-2">
                                        <span class="font-mono text-xs font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-md">
                                            {{ item.code }}
                                        </span>
                                        <span class="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-md">
                                            Qty: {{ item.displayQty }} Unit
                                        </span>
                                    </div>
                                </div>
                                
                                <!-- Logistics Status (Single Badge & Milestone Date) -->
                                <div class="sm:text-right shrink-0">
                                    <div v-if="item.is_ready" class="flex flex-col sm:items-end gap-1">
                                        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            <CheckCircle2 class="w-3.5 h-3.5 text-emerald-600" />
                                            <span>Siap Dikirim</span>
                                        </span>
                                        <span v-if="item.hokiindo_date" class="text-[11px] font-mono text-zinc-500 sm:text-right">
                                            Tiba: {{ formatDate(item.hokiindo_date) }}
                                        </span>
                                    </div>
                                    <div v-else class="flex flex-col sm:items-end gap-1">
                                        <!-- Primary Status Badge -->
                                        <div class="flex items-center sm:justify-end">
                                            <span class="inline-block px-3 py-1 rounded-lg text-xs font-medium border" :class="getStatusBadgeClass(item.status)">
                                                {{ getStatusText(item, 'process') }}
                                            </span>
                                        </div>
                                        <!-- Single Active Milestone Date -->
                                        <span v-if="getItemActiveDate(item)" class="text-[11px] font-mono text-zinc-500 sm:text-right">
                                            {{ getItemActiveDate(item) }}
                                        </span>
                                        <span v-else class="text-[11px] text-zinc-400 flex items-center sm:justify-end gap-1">
                                            <Clock class="w-3 h-3 text-zinc-400" />
                                            <span>Jadwal sedang dikoordinasikan</span>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <!-- Split Batches Delivery Breakdown (List Kebawah Rapi) -->
                            <div v-if="item.sub_schedules && item.sub_schedules.length > 1" 
                                 class="mt-3.5 pt-3 border-t border-zinc-100">
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <Layers class="w-3.5 h-3.5 text-amber-600" />
                                        Jadwal Pengiriman Parsial ({{ item.sub_schedules.length }} Batch)
                                    </span>
                                    <span class="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                        Split Deliveries
                                    </span>
                                </div>
                                <div class="divide-y divide-zinc-100 border border-zinc-200/80 rounded-xl bg-zinc-50/50 overflow-hidden">
                                    <div v-for="(sub, sIdx) in item.sub_schedules" :key="sIdx" 
                                         class="px-3.5 py-2 flex items-center justify-between gap-3 hover:bg-zinc-50 transition-colors">
                                        <div class="flex items-center gap-2.5 min-w-0">
                                            <span class="text-xs font-bold text-zinc-900 font-mono shrink-0">
                                                Batch {{ sIdx + 1 }}<span v-if="sub.qty" class="text-zinc-500 font-normal"> ({{ sub.qty }} Unit)</span>
                                            </span>
                                            <span class="text-[10px] px-2 py-0.5 rounded-md font-medium border shrink-0" :class="getStatusBadgeClass(sub.rawStatus)">
                                                {{ sub.status }}
                                            </span>
                                        </div>
                                        <div v-if="sub.date && sub.date !== '-'" class="text-xs font-mono font-semibold text-zinc-700 shrink-0 text-right">
                                            {{ sub.date }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

            </div>

            <!-- Footer note -->
            <footer class="mt-12 text-center text-xs text-zinc-400 pb-4">
                <p class="font-medium text-zinc-600">PT Hokiindo Raya</p>
                <p class="mt-0.5 text-[11px] text-zinc-400">Portal Tracking & Informasi Pengiriman Pesanan</p>
                <p class="mt-0.5 text-[10px] text-zinc-300">Informasi diperbarui otomatis secara real-time</p>
            </footer>

        </div>

        <!-- Floating WhatsApp Contact -->
        <a href="https://wa.me/6282112564252" target="_blank" 
           class="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-zinc-950 hover:bg-zinc-800 text-white pl-4 pr-5 py-3 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95 border border-zinc-800 group">
            <div class="relative flex items-center justify-center">
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
                <div class="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white relative z-10">
                    <MessageCircle class="w-3.5 h-3.5 fill-current" />
                </div>
            </div>
            <span class="font-medium text-xs sm:text-sm tracking-tight text-zinc-100">Bantuan Admin</span>
        </a>

    </div>
</template>

<style>
/* Geist & Geist Mono Minimalist Typography */
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600&display=swap');

.tracking-root {
    font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    letter-spacing: -0.011em;
}

.tracking-root code,
.tracking-root .font-mono {
    font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    letter-spacing: -0.02em;
}
</style>