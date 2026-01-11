<script>
export default {
  name: 'TrackingView'
}
</script>

<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

// UI Components
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Search, Download, ShoppingCart, Loader2,
  AlertCircle, ChevronRight, Plus, ExternalLink, Box, CheckCircle2, Layers, Calculator
} from 'lucide-vue-next'

const router = useRouter()

// --- STATE ---
const groupedProcurement = ref([]) 
const isLoading = ref(true)
const searchQuery = ref('')
const expandedGroups = ref([]) 

// --- 1. LOGIC HITUNG KEKURANGAN (CORE) ---
const calculateNeeds = (qty_order, qty_shipped, note) => {
    // A. Sisa yang belum dikirim ke customer
    const qty_sisa = qty_order - qty_shipped;
    
    if (qty_sisa <= 0) return { shortage: 0, stock_in_note: 0 };

    // B. Cek Stok yang "Diakui" di Catatan
    let stock_in_note = 0;
    const cleanNote = note ? note.toUpperCase() : '';

    if (cleanNote) {
        if (cleanNote.includes('NO STOCK') || cleanNote.includes('INDENT') || cleanNote.includes('KOSONG')) {
            stock_in_note = 0;
        } else {
            // Cari angka di catatan (Misal: "Stock 5", "Sisa 2")
            const match = cleanNote.match(/(?:STOCK|READY|SISA|QTY)[\s:.]*(\d+)/);
            if (match) {
                stock_in_note = parseInt(match[1]);
            } else if (cleanNote.includes('STOCK') || cleanNote.includes('READY')) {
                // Jika cuma tulis "STOCK" tanpa angka, asumsikan cukup (Full)
                stock_in_note = qty_sisa; 
            }
        }
    } else {
        // Jika TIDAK ADA catatan sama sekali, kita asumsikan stok 0 (Aman untuk procurement)
        // Atau asumsikan Full? Tergantung kebijakan. 
        // Disini kita asumsi: Kosong = Perlu dicek/dianggap 0 agar aman.
        stock_in_note = 0; 
    }

    // C. Hitung Kekurangan (Yang harus dibeli)
    // Rumus: Sisa Kirim - Stok yang ada di Note
    let shortage = qty_sisa - stock_in_note;
    if (shortage < 0) shortage = 0;

    return { 
        shortage, // Ini yang masuk List Procurement
        stock_in_note,
        qty_sisa
    };
}

// --- DATA FETCHING ---
const loadingProgress = ref(0)
const loadingMessage = ref('')
const totalHSOLoaded = ref(0)

// HPO Sync State
const isHpoSyncing = ref(false)
const hpoSyncProgress = ref(0)
const hpoMapping = ref({}) // mapping: itemCode -> poNumber

const fetchProcurementData = async () => {
  isLoading.value = true
  loadingProgress.value = 0
  loadingMessage.value = 'Mengambil data HSO...'
  groupedProcurement.value = []
  totalHSOLoaded.value = 0
  hpoMapping.value = {} // Reset mapping

  try {
    let allSOs = []
    let currentPage = 1
    let totalPages = 1
    const pageSize = 50

    // Fetch all pages with progress
    while (currentPage <= totalPages) {
      loadingMessage.value = `Mengambil halaman ${currentPage}...`
      
      const { data: accData, error } = await supabase.functions.invoke('accurate-list-tracking-so', {
        body: { page: currentPage, pageSize: pageSize }
      })

      if (error) throw error

      if (accData?.pagination) {
        totalPages = accData.pagination.totalPages
      }

      const pageSOs = accData?.d || []
      // STRICT FILTER: Hanya ambil yang statusnya "Menunggu diproses" atau "Sebagian diproses"
      const pendingSOs = pageSOs.filter(so => 
          so.statusName === 'Menunggu diproses' || 
          so.statusName === 'Sebagian diproses'
      )

      allSOs = allSOs.concat(pendingSOs)
      totalHSOLoaded.value = allSOs.length
      
      // Update progress (0-80% for fetching)
      loadingProgress.value = Math.min(80, Math.round((currentPage / totalPages) * 80))
      loadingMessage.value = `Mengambil halaman ${currentPage}/${totalPages} (${allSOs.length} HSO Pending)`

      currentPage++
    }

    loadingProgress.value = 85
    loadingMessage.value = `Memproses ${allSOs.length} HSO...`

    // Fetch shipments from Supabase for initial status
    const soIds = allSOs.map(so => String(so.id))
    let shipmentsMap = {}
    
    if (soIds.length > 0) {
      loadingMessage.value = 'Mengambil status shipment...'
      // Chunk requests to avoid URL too long error if many IDs
      const chunkSize = 50
      for (let i = 0; i < soIds.length; i += chunkSize) {
          const chunk = soIds.slice(i, i + chunkSize)
          const { data: shipments, error: shipErr } = await supabase
            .from('shipments')
            .select('so_id, item_code, current_status, hpo_number, status_date, admin_notes')
            .in('so_id', chunk)
          
          if (!shipErr && shipments) {
            shipments.forEach(s => {
              const key = `${s.so_id}|${s.item_code}`
              shipmentsMap[key] = s
            })
          }
      }
    }

    loadingProgress.value = 90
    loadingMessage.value = 'Menganalisa kebutuhan procurement...'

    const tempGroups = {}
    const processedSoNumbers = new Set() // Track unique SO numbers for sync

    if (allSOs.length > 0) {
        allSOs.forEach(so => {
            processedSoNumbers.add(so.number)

            if (!so.detailItem || !Array.isArray(so.detailItem)) return;

            so.detailItem.forEach(d => {
                if (!d.item || !d.item.no) return;

                const qty_order = d.quantity || 0;
                const qty_shipped = d.quantityShipped || 0;
                const note = d.detailNotes || '';
                const code = d.item.no;

                // HITUNG KEBUTUHAN
                const { shortage, stock_in_note, qty_sisa } = calculateNeeds(qty_order, qty_shipped, note);

                // Cari status dari Supabase shipments
                const shipmentKey = `${so.id}|${code}`
                const shipment = shipmentsMap[shipmentKey] || null
                const logisticsStatus = shipment?.current_status || 'Pending Process'
                const hpoNumber = shipment?.hpo_number || null // HPO dari DB (backup)
                const adminNotes = shipment?.admin_notes || null

                // REMOVED: Logic to skip processed items. User wants ALL data from pending/partial HSOs.
                
                // 2. Skip jika tidak ada shortage (sudah cukup stock) - OPTIONAL, user wants "seluruh HSO" but logic "need process" implies checking needs.
                // Keeping shortage check for "Procurement Plan" context, but if user wants RAW data, we might need to relax this.
                // For now, keeping shortage logic as it defines "Procurement Needs".

                if (shortage > 0) {
                    
                    if (!tempGroups[code]) {
                        tempGroups[code] = {
                            code: code,
                            name: d.item.name || d.detailName,
                            unit: d.itemUnit?.name || 'Pcs',
                            total_shortage: 0,
                            hso_list: []
                        }
                    }

                    // Akumulasi Total Beli
                    tempGroups[code].total_shortage += shortage;

                    // Detail HSO
                    tempGroups[code].hso_list.push({
                        id: Math.random(),
                        so_id: so.id,
                        so_number: so.number,
                        customer: so.customer?.name || '-',
                        date: so.transDate,
                        item_code: code, // Saved for mapping lookup
                        
                        qty_order: qty_order,
                        qty_sisa: qty_sisa,
                        stock_note: stock_in_note,
                        qty_buy: shortage,
                        
                        note: note,
                        
                        // STATUS
                        logistics_status: logisticsStatus,
                        hpo_number: hpoNumber, // Initial value from DB
                        admin_notes: adminNotes
                    });
                }
            })
        })
    }

    // Process Groups
    const sortedGroups = Object.values(tempGroups).map((group) => {
        group.hso_list.sort((a, b) => {
            const parseDate = (dateStr) => {
                if (!dateStr) return new Date(0);
                const parts = dateStr.split('/');
                if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]);
                return new Date(dateStr);
            };
            return parseDate(b.date) - parseDate(a.date);
        });
        return group;
    });
    
    groupedProcurement.value = sortedGroups.sort((a, b) => b.total_shortage - a.total_shortage);
    
    // Trigger Background Sync
    syncHpoInBackground(Array.from(processedSoNumbers))

  } catch (err) {
    console.error("Gagal Analisa:", err)
    alert("Terjadi kesalahan saat menarik data.")
  } finally {
    isLoading.value = false
  }
}

// --- HPO SYNC LOGIC ---
const syncHpoInBackground = async (soNumbers) => {
    if (soNumbers.length === 0) return
    
    isHpoSyncing.value = true
    hpoSyncProgress.value = 0
    let processed = 0
    const total = soNumbers.length
    
    // Process in chunks of 5 parallel requests to avoid overwhelming
    const batchSize = 5
    for (let i = 0; i < total; i += batchSize) {
        const batch = soNumbers.slice(i, i + batchSize)
        
        await Promise.all(batch.map(async (soNumber) => {
            try {
                const { data: poData, error } = await supabase.functions.invoke('accurate-list-po', {
                    body: { hsoNumber: soNumber }
                })
                
                if (!error && poData?.d) {
                    poData.d.forEach(poItem => {
                        // Store mapping: SO_NUMBER|ITEM_CODE -> PO_NUMBER
                        const key = `${soNumber}|${poItem.itemCode}`
                        hpoMapping.value[key] = poItem.poNumber
                    })
                }
            } catch (e) {
                console.warn(`Failed to sync PO for ${soNumber}`, e)
            } finally {
                processed++
                hpoSyncProgress.value = Math.round((processed / total) * 100)
            }
        }))
    }
    
    isHpoSyncing.value = false
}

onMounted(() => {
    // Cache Check: Hanya fetch jika data kosong
    if (groupedProcurement.value.length === 0) {
        fetchProcurementData()
    }
})

// --- COMPUTED & ACTION ---
// Pagination state
const currentPage = ref(1)
const itemsPerPage = 20

const filteredGroups = computed(() => {
    if (!searchQuery.value) return groupedProcurement.value;
    const q = searchQuery.value.toLowerCase();
    return groupedProcurement.value.filter(g => 
        g.name.toLowerCase().includes(q) || 
        g.code.toLowerCase().includes(q)
    );
})

// Paginated groups for display
const paginatedGroups = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredGroups.value.slice(start, end);
})

const totalPages = computed(() => Math.ceil(filteredGroups.value.length / itemsPerPage))

const goToPage = (page) => {
    if (page >= 1 && page <= totalPages.value) {
        currentPage.value = page;
        expandedGroups.value = []; // Collapse all when changing page
    }
}

// Reset to page 1 when search changes
const onSearchChange = () => {
    currentPage.value = 1;
}

const toggleGroup = (code) => {
  const idx = expandedGroups.value.indexOf(code)
  if (idx === -1) expandedGroups.value.push(code)
  else expandedGroups.value.splice(idx, 1)
}

const exportProcurement = () => {
  const data = []
  filteredGroups.value.forEach(g => {
      g.hso_list.forEach(h => {
          data.push({
              "Kode Barang": g.code,
              "Nama Barang": g.name,
              "No HSO": h.so_number,
              "Customer": h.customer,
              "Order": h.qty_order,
              "Sisa Kirim": h.qty_sisa,
              "Stok (Note)": h.stock_note,
              "Wajib Beli": h.qty_buy,
              "Satuan": g.unit
          })
      })
  })
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Procurement Plan")
  XLSX.writeFile(wb, `Plan_Pembelian_${new Date().toISOString().split('T')[0]}.xlsx`)
}

const openSiePortal = (code) => {
    if(!code || code === '-') return;
    window.open(`https://sieportal.siemens.com/en-id/products-services/detail/${code}?tree=CatalogTree`, '_blank');
}

const openDetail = (soId, itemCode) => {
    router.push({ 
        path: `/sales-orders/${soId}`, 
        query: { highlight: itemCode } 
    })
}
</script>

<template>
  <div class="space-y-6 pb-20 font-source-code text-slate-900 dark:text-slate-100 min-h-screen bg-gray-50/50 dark:bg-[#0f172a] p-6">
    
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingCart class="w-6 h-6 text-red-600"/> Procurement Plan
        </h2>
        <p class="text-slate-500 dark:text-slate-400 text-sm mt-1">
           Saran Barang dipesan
        </p>
      </div>
      <div class="flex gap-2 w-full md:w-auto">
        <Button variant="outline" class="gap-2 border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700" @click="exportProcurement">
          <Download class="w-4 h-4" /> Export Excel
        </Button>
        <Button class="gap-2 bg-red-600 hover:bg-red-700 text-white" @click="fetchProcurementData" :disabled="isLoading">
            <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin"/>
            <span v-else>Analisa Ulang</span>
        </Button>
      </div>
    </div>

    <!-- Progress Bar -->
    <div v-if="isLoading" class="space-y-2">
        <div class="flex justify-between text-xs text-slate-500">
            <span>{{ loadingMessage }}</span>
            <span>{{ loadingProgress }}%</span>
        </div>
        <Progress :model-value="loadingProgress" class="h-2" />
    </div>

    <!-- HPO Sync Progress -->
    <div v-if="isHpoSyncing" class="space-y-2 mb-4 bg-sky-50 dark:bg-sky-900/20 p-3 rounded-lg border border-sky-100 dark:border-sky-800">
        <div class="flex justify-between text-xs text-sky-600 dark:text-sky-400 font-medium">
            <span class="flex items-center gap-2">
                <Loader2 class="w-3 h-3 animate-spin"/> Sinkronisasi PO dari Accurate...
            </span>
            <span>{{ hpoSyncProgress }}%</span>
        </div>
        <Progress :model-value="hpoSyncProgress" class="h-1.5 bg-sky-100 dark:bg-sky-900" indicator-class="bg-sky-500" />
    </div>

    <div class="relative" v-if="!isLoading">
        <Search class="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input 
            v-model="searchQuery"
            @input="onSearchChange"
            placeholder="Cari Kode Barang / Nama Barang..." 
            class="pl-9 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700" 
        />
    </div>

    <!-- Pagination Info -->
    <div v-if="filteredGroups.length > 0 && !isLoading" class="flex justify-between items-center text-sm text-slate-500">
        <span>Menampilkan {{ (currentPage - 1) * itemsPerPage + 1 }} - {{ Math.min(currentPage * itemsPerPage, filteredGroups.length) }} dari {{ filteredGroups.length }} produk</span>
        <span>Halaman {{ currentPage }} / {{ totalPages }}</span>
    </div>

    <div class="space-y-4">
        <div v-if="filteredGroups.length === 0 && !isLoading" class="text-center py-12 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
            <CheckCircle2 class="w-12 h-12 mx-auto mb-2 text-emerald-500 opacity-50"/>
            <p>Semua stok aman sesuai catatan (Tidak ada yang perlu dibeli).</p>
        </div>

        <div v-for="group in paginatedGroups" :key="group.code" class="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md transition-all">
            
            <div 
                class="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                @click="toggleGroup(group.code)"
            >
                <div class="flex items-center gap-4 flex-1">
                    <div class="bg-slate-100 dark:bg-slate-700 p-2 rounded-lg transition-transform duration-200" :class="expandedGroups.includes(group.code) ? 'rotate-90' : ''">
                        <ChevronRight class="w-5 h-5 text-slate-500"/>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h3 class="font-bold text-lg text-slate-900 dark:text-white hover:text-red-600 transition-colors" @click.stop="openSiePortal(group.code)">{{ group.name }}</h3>
                            <Badge variant="outline" class="text-xs font-mono bg-slate-50 dark:bg-slate-900 text-slate-500">{{ group.code }}</Badge>
                        </div>
                        <div class="flex gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400">
                            <span>Dibutuhkan oleh: <b>{{ group.hso_list.length }} HSO</b></span>
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 dark:border-slate-700">
                    <div class="text-right">
                        <p class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Total Harus Dipesan</p>
                        <p class="text-2xl font-bold text-red-600 dark:text-red-400">{{ group.total_shortage }} <span class="text-sm text-slate-400 font-medium">{{ group.unit }}</span></p>
                    </div>
                </div>
            </div>

            <div v-if="expandedGroups.includes(group.code)" class="border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-4 animate-in slide-in-from-top-2 duration-200">
                <div class="flex items-center gap-2 mb-3">
                    <Calculator class="w-4 h-4 text-slate-500"/>
                    <span class="text-xs font-bold text-slate-500 uppercase">Rincian Perhitungan (Selisih)</span>
                </div>

                <div class="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <Table>
                        <TableHeader class="bg-slate-50 dark:bg-slate-900">
                            <TableRow class="border-b border-slate-200 dark:border-slate-700">
                                <TableHead class="text-xs h-8 font-bold">No. HSO / Customer</TableHead>
                                <TableHead class="text-xs h-8 font-bold text-center">Status</TableHead>
                                <TableHead class="text-xs h-8 font-bold text-center bg-blue-50 dark:bg-blue-900/20 text-blue-700">Order</TableHead>
                                <TableHead class="text-xs h-8 font-bold text-center bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700">Stock</TableHead>
                                <TableHead class="text-xs h-8 font-bold text-center bg-red-50 dark:bg-red-900/20 text-red-700">Saran Order</TableHead>
                                <TableHead class="text-xs h-8 w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow v-for="hso in group.hso_list" :key="hso.id" class="border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <TableCell class="py-3">
                                    <div class="font-bold text-slate-700 dark:text-slate-300 text-xs">{{ hso.so_number }}</div>
                                    <div class="text-[10px] text-slate-500">{{ hso.customer }}</div>
                                    <div class="text-[9px] text-blue-500 font-medium mt-0.5">📅 {{ hso.date }}</div>
                                </TableCell>
                                
                                <TableCell class="text-center">
                                    <Badge 
                                        class="text-[10px] font-bold px-2 py-0.5"
                                        :class="{
                                            'bg-gray-100 text-gray-600 border-gray-300': hso.logistics_status === 'Pending Process',
                                            'bg-amber-100 text-amber-700 border-amber-300': hso.logistics_status === 'Follow up to factory',
                                            'bg-orange-100 text-orange-700 border-orange-300': hso.logistics_status === 'Follow up with our forwarder',
                                            'bg-blue-100 text-blue-700 border-blue-300': hso.logistics_status === 'ETA Port JKT',
                                            'bg-cyan-100 text-cyan-700 border-cyan-300': hso.logistics_status === 'Already in siemens Warehouse',
                                            'bg-indigo-100 text-indigo-700 border-indigo-300': hso.logistics_status === 'Already in Hokiindo Raya',
                                            'bg-blue-200 text-blue-800 border-blue-400': hso.logistics_status === 'On Delivery',
                                            'bg-emerald-100 text-emerald-700 border-emerald-300': hso.logistics_status === 'Completed',
                                            'bg-purple-100 text-purple-700 border-purple-300': hso.logistics_status === 'Hold by Customer'
                                        }"
                                    >
                                        {{ hso.logistics_status === 'Pending Process' ? 'PENDING' :
                                           hso.logistics_status === 'Follow up to factory' ? 'ORDER' :
                                           hso.logistics_status === 'Follow up with our forwarder' ? 'EX-WORKS' :
                                           hso.logistics_status === 'ETA Port JKT' ? 'TRANSIT' :
                                           hso.logistics_status === 'Already in siemens Warehouse' ? 'WH DUNEX' :
                                           hso.logistics_status === 'Already in Hokiindo Raya' ? 'WH HOKI' :
                                           hso.logistics_status === 'On Delivery' ? 'KIRIM' :
                                           hso.logistics_status === 'Completed' ? 'SELESAI' :
                                           hso.logistics_status === 'Hold by Customer' ? 'HOLD' :
                                           hso.logistics_status }}
                                    </Badge>
                                    <!-- HPO Indicator: Priority from Sync Mapping, fallback to DB -->
                                    <div v-if="hpoMapping[`${hso.so_number}|${hso.item_code}`] || hso.hpo_number" class="text-[9px] text-green-600 mt-0.5 font-mono font-bold flex items-center gap-1">
                                        <CheckCircle2 v-if="hpoMapping[`${hso.so_number}|${hso.item_code}`]" class="w-3 h-3"/> HPO: {{ hpoMapping[`${hso.so_number}|${hso.item_code}`] || hso.hpo_number }}
                                    </div>
                                    <div v-else class="text-[9px] text-red-500 mt-0.5 font-mono font-bold italic">
                                        Belum ada HPO
                                    </div>
                                </TableCell>
                                
                                <!-- Order (Qty Pesanan Client) -->
                                <TableCell class="text-center text-xs font-bold text-blue-700 bg-blue-50/30 dark:bg-blue-900/10">
                                    {{ hso.qty_sisa }}
                                </TableCell>
                                
                                <!-- Stock -->
                                <TableCell class="text-center text-xs font-bold bg-emerald-50/30 dark:bg-emerald-900/10">
                                    <span v-if="hso.stock_note === 0" class="text-red-600">No Stock</span>
                                    <span v-else class="text-emerald-600">{{ hso.stock_note }}</span>
                                </TableCell>
                                
                                <!-- Saran Order -->
                                <TableCell class="text-center">
                                    <Badge variant="solid" class="bg-red-600 text-white hover:bg-red-700 border-0 text-xs px-3">
                                        {{ hso.qty_buy }}
                                    </Badge>
                                </TableCell>

                                <TableCell>
                                    <Button variant="ghost" size="icon" class="h-6 w-6 text-slate-400 hover:text-blue-600" @click.stop="openDetail(hso.so_id, group.code)">
                                        <ExternalLink class="w-3 h-3" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    </div>

    <!-- Pagination Controls -->
    <div v-if="totalPages > 1" class="flex justify-center items-center gap-4 mt-6 pb-4">
        <Button 
            variant="outline" 
            size="sm" 
            :disabled="currentPage <= 1"
            @click="goToPage(currentPage - 1)"
            class="border-slate-300 dark:border-slate-600"
        >
            ← Sebelumnya
        </Button>
        
        <div class="flex items-center gap-2">
            <Button 
                v-for="page in Math.min(5, totalPages)" 
                :key="page"
                variant="outline" 
                size="sm"
                :class="currentPage === page ? 'bg-red-600 text-white border-red-600 hover:bg-red-700' : 'border-slate-300 dark:border-slate-600'"
                @click="goToPage(page)"
            >
                {{ page }}
            </Button>
            <span v-if="totalPages > 5" class="text-slate-400">...</span>
            <Button 
                v-if="totalPages > 5"
                variant="outline" 
                size="sm"
                :class="currentPage === totalPages ? 'bg-red-600 text-white border-red-600' : 'border-slate-300 dark:border-slate-600'"
                @click="goToPage(totalPages)"
            >
                {{ totalPages }}
            </Button>
        </div>
        
        <Button 
            variant="outline" 
            size="sm" 
            :disabled="currentPage >= totalPages"
            @click="goToPage(currentPage + 1)"
            class="border-slate-300 dark:border-slate-600"
        >
            Selanjutnya →
        </Button>
    </div>

  </div>
</template>