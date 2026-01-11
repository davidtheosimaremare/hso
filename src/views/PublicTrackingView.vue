<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { 
    Loader2, AlertCircle, ChevronDown, ChevronUp, 
    Truck, Package, Clock, MessageCircle, Send 
} from 'lucide-vue-next'

// --- SETUP & STATE ---
const route = useRoute()
const uniqueCode = route.params.code

const soHeader = ref(null)      
const soItems = ref([])         
const isLoading = ref(true)
const fetchError = ref(null)

// State untuk Collapse/Expand Section
const expandedSections = ref({
    shipped: true,
    pending: true
    // HPO dynamic keys akan ditambahkan saat data load
})

const toggleSection = (key) => {
    expandedSections.value[key] = !expandedSections.value[key]
}

// --- CONFIG STATUS TEXT ---
const getStatusText = (item, type) => {
    if (type === 'shipped') return 'Barang Sedang Dikirim / Diterima'
    if (type === 'pending') return 'Menunggu Proses Antrian'
    
    const map = {
        'Follow up to factory': 'Produksi di Pabrik',
        'Follow up with our forwarder': 'Di Forwarder (Menunggu Kapal)',
        'ETA Port JKT': 'ETA Port Jakarta',
        'Already in siemens Warehouse': 'Tiba di Gudang Dunex',
        'Already in Hokiindo Raya': 'Ready Stock',
        'Completed': 'Selesai',
        'NO ACTION': 'Menunggu Proses',
        'Pending Process': 'Menunggu Proses'
    }
    return map[item.status] || item.status
}

const getStatusColor = (status) => {
    if (['Completed', 'Already in Hokiindo Raya'].includes(status)) return 'text-green-600 bg-green-50 border-green-200'
    if (['ETA Port JKT', 'Follow up with our forwarder'].includes(status)) return 'text-blue-600 bg-blue-50 border-blue-200'
    if (['Already in siemens Warehouse'].includes(status)) return 'text-cyan-600 bg-cyan-50 border-cyan-200'
    if (['Follow up to factory'].includes(status)) return 'text-amber-600 bg-amber-50 border-amber-200'
    return 'text-slate-600 bg-slate-100 border-slate-200'
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

// --- DATA FETCHING ---
const fetchTrackingData = async () => {
    isLoading.value = true
    try {
        const { data: linkData, error: linkError } = await supabase
            .from('so_tracking_links').select('so_id').eq('unique_code', uniqueCode).maybeSingle()
        if (linkError || !linkData) throw new Error("Link tracking tidak valid.")
        
        const soId = linkData.so_id

        const { data: accData, error: accError } = await supabase.functions.invoke('accurate-detail-so', {
            body: { id: parseInt(soId), type: 'sales-order' }
        })
        if (accError || !accData?.s) throw new Error("Gagal mengambil data Accurate.")
        const d = accData.d

        const { data: shipData } = await supabase
            .from('shipments').select('item_code, current_status, hpo_number, exwork_date, eta_date, dunex_date').eq('so_id', String(soId))

        const shipmentsMap = (shipData || []).reduce((map, s) => {
            map[s.item_code] = { 
                status: s.current_status, 
                hpo: s.hpo_number,
                exwork_date: s.exwork_date,
                eta_date: s.eta_date,
                dunex_date: s.dunex_date
            };
            return map;
        }, {});

        soHeader.value = {
            number: d.number,
            client: d.customer?.name || '-',
            po_number: d.poNumber || '-',
            do_list: d.processHistory.filter(h => h.historyType === 'DO').map(h => h.no).join(', '),
            items_raw: d.detailItem
        }

        soItems.value = d.detailItem.map(item => {
            const itemCode = item.item?.no || item.detailName;
            const logistik = shipmentsMap[itemCode] || {};
            
            return {
                name: item.item?.name || item.detailName,
                code: itemCode,
                qty_order: item.quantity,
                qty_shipped: item.shipQuantity || 0,
                status: logistik.status || 'NO ACTION',
                hpo: logistik.hpo || null,
                exwork_date: logistik.exwork_date || null,
                eta_date: logistik.eta_date || null,
                dunex_date: logistik.dunex_date || null
            }
        });

    } catch (error) {
        fetchError.value = error.message
    } finally {
        isLoading.value = false
    }
}

onMounted(() => {
    if (uniqueCode) fetchTrackingData()
    else fetchError.value = "Kode tracking hilang."
})

// --- COMPUTED GROUPING ---
const groupedData = computed(() => {
    if (!soItems.value.length) return { shipped: [], processing: [], percentage: 0, countShipped: 0, countProcessing: 0 };

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
        countProcessing: processing.reduce((acc, i) => acc + i.displayQty, 0)
    };
})
</script>

<template>
    <div class="min-h-screen bg-slate-50 text-slate-800 pb-24" style="font-family: 'Source Code Pro', monospace;">
        
        <div v-if="isLoading" class="h-screen flex flex-col items-center justify-center bg-white">
            <Loader2 class="w-12 h-12 animate-spin text-red-600 mb-4"/>
            <p class="text-sm font-semibold tracking-widest text-slate-500 animate-pulse">LOADING DATA...</p>
        </div>

        <div v-else-if="fetchError" class="h-screen flex flex-col items-center justify-center p-6 text-red-600 bg-red-50">
            <AlertCircle class="w-12 h-12 mb-4"/>
            <h3 class="text-xl font-bold">Terjadi Kesalahan</h3>
            <p class="mt-2">{{ fetchError }}</p>
        </div>

        <div v-else class="max-w-3xl mx-auto px-4 pt-8 md:pt-12">
            
            <div class="text-center md:text-left mb-8 border-b-2 border-slate-200 pb-6">
                <div class="inline-flex items-center gap-3 mb-4">
                    <img src="https://hokiindo.co.id/wp-content/uploads/2025/09/cropped-fav-300x300.png" alt="Hokiindo Logo" class="w-12 h-12 rounded-lg shadow"/>
                    <h2 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">HSO Tracking</h2>
                </div>
                <h1 class="text-3xl md:text-4xl font-bold mt-2 text-slate-900">{{ soHeader?.client }}</h1>
                <div class="flex flex-col md:flex-row md:items-center gap-2 md:gap-6 mt-3 text-sm text-slate-500 font-medium">
                    <span>SO #: <span class="text-slate-900">{{ soHeader?.number }}</span></span>
                    <span class="hidden md:inline text-slate-300">|</span>
                    <span>PO Cust: <span class="text-slate-900">{{ soHeader?.po_number }}</span></span>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <!-- Card Sudah Dikirim -->
                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
                    <div class="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Truck class="w-16 h-16 text-green-600"/>
                    </div>
                    <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Barang Sudah Dikirim</p>
                    <p class="text-3xl font-bold text-slate-800 mt-1">{{ groupedData.countShipped }} <span class="text-sm text-slate-400">Unit</span></p>
                </div>
                <!-- Card Dalam Proses -->
                 <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
                     <div class="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Clock class="w-16 h-16 text-blue-600"/>
                    </div>
                    <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Barang Dalam Proses</p>
                    <p class="text-3xl font-bold text-slate-800 mt-1">{{ groupedData.countProcessing }} <span class="text-sm text-slate-400">Unit</span></p>
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-10">
                <div class="flex justify-between items-end mb-2">
                    <span class="text-xs font-bold text-slate-500 uppercase">Fulfillment Rate</span>
                    <span class="text-lg font-bold text-red-600">{{ groupedData.percentage }}%</span>
                </div>
                <div class="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-red-500 to-red-600 rounded-full transition-all duration-1000 ease-out" 
                         :style="{ width: groupedData.percentage + '%' }"></div>
                </div>
            </div>

            <div class="space-y-6">

                <div v-if="groupedData.shipped.length > 0" class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <div @click="toggleSection('shipped')" class="cursor-pointer bg-slate-50 p-4 flex justify-between items-center border-b border-slate-100 select-none">
                        <div class="flex items-center gap-3">
                            <div class="bg-green-100 p-2 rounded-lg text-green-700">
                                <Truck class="w-5 h-5" />
                            </div>
                            <div>
                                <h3 class="font-bold text-slate-800 text-sm md:text-base">SUDAH DIKIRIM (COMPLETED)</h3>
                                <p class="text-xs text-slate-500 mt-0.5" v-if="soHeader.do_list">DO No: {{ soHeader.do_list }}</p>
                            </div>
                        </div>
                        <component :is="expandedSections.shipped ? ChevronUp : ChevronDown" class="w-5 h-5 text-slate-400"/>
                    </div>
                    
                    <div v-show="expandedSections.shipped" class="divide-y divide-slate-100">
                        <div v-for="(item, idx) in groupedData.shipped" :key="idx" class="p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                            <div class="flex-1">
                                <p class="font-bold text-sm text-slate-800">{{ item.name }}</p>
                                <p class="text-xs text-slate-400 mt-1 font-mono">{{ item.code }}</p>
                            </div>
                            <div class="flex items-center gap-4">
                                <span class="bg-green-100 text-green-700 px-3 py-1 rounded text-xs font-bold">
                                    {{ item.displayQty }} Unit
                                </span>
                                <div class="text-right">
                                    <p class="text-xs font-bold text-green-700">SUDAH DIKIRIM</p>
                                    <p class="text-[10px] text-slate-400">Ke Alamat Anda</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- SECTION 2: PROSES -->
                <div v-if="groupedData.processing.length > 0" class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    
                    <div @click="toggleSection('pending')" class="cursor-pointer bg-slate-50 p-4 flex justify-between items-center border-b border-slate-100 select-none">
                        <div class="flex items-center gap-3">
                            <div class="bg-blue-100 p-2 rounded-lg text-blue-700">
                                <Clock class="w-5 h-5" />
                            </div>
                            <div>
                                <h3 class="font-bold text-slate-800 text-sm md:text-base">BARANG DALAM PROSES (IN PROCESS)</h3>
                                <p class="text-xs text-slate-500 mt-0.5">Produksi, Ex-Works, ETA, Dunex</p>
                            </div>
                        </div>
                        <component :is="expandedSections.pending ? ChevronUp : ChevronDown" class="w-5 h-5 text-slate-400"/>
                    </div>
                    
                    <div v-show="expandedSections.pending" class="divide-y divide-slate-100">
                        <div v-for="(item, idx) in groupedData.processing" :key="idx" class="p-4 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0">
                            <div class="flex justify-between items-start gap-4">
                                <!-- Product Info -->
                                <div class="flex-1">
                                    <p class="font-bold text-sm text-slate-800">{{ item.name }}</p>
                                    <p class="text-xs text-slate-400 font-mono mt-0.5">{{ item.code }}</p>
                                    <span class="inline-block mt-2 bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">
                                        Qty: {{ item.displayQty }} Unit
                                    </span>
                                </div>
                                
                                <!-- Dates Timeline - Only show if date exists -->
                                <div class="text-right text-xs space-y-1">
                                    <div v-if="item.exwork_date" class="flex items-center justify-end gap-2">
                                        <span class="text-slate-500">EXWORK</span>
                                        <span class="font-bold text-amber-700">{{ formatDate(item.exwork_date) }}</span>
                                    </div>
                                    <div v-if="item.eta_date" class="flex items-center justify-end gap-2">
                                        <span class="text-slate-500">ETA PORT JKT</span>
                                        <span class="font-bold text-blue-700">{{ formatDate(item.eta_date) }}</span>
                                    </div>
                                    <div v-if="item.dunex_date" class="flex items-center justify-end gap-2">
                                        <span class="text-slate-500">Tiba di DUNEX</span>
                                        <span class="font-bold text-cyan-700">{{ formatDate(item.dunex_date) }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>

        <a href="https://wa.me/6282112564252" target="_blank" 
           class="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-full shadow-xl transition-transform hover:scale-105 active:scale-95 group">
            <div class="relative">
                 <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-200 opacity-75"></span>
                 <MessageCircle class="w-6 h-6 relative z-10" />
            </div>
            <span class="font-bold text-sm hidden md:inline group-hover:inline transition-all duration-300">Hubungi Admin</span>
        </a>

    </div>
</template>

<style>
/* Import Font Langsung di Style agar aman */
@import url('https://fonts.googleapis.com/css2?family=Source+Code+Pro:ital,wght@0,300;0,400;0,600;0,700;1,400&display=swap');
</style>