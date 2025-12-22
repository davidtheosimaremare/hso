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
import {
  Search, Download, ShoppingCart, 
  AlertCircle, ChevronRight, Plus, ExternalLink, Box, CheckCircle2, Layers
} from 'lucide-vue-next'

const router = useRouter()

// --- STATE ---
const groupedProcurement = ref([]) 
const isLoading = ref(true)
const searchQuery = ref('')
const expandedGroups = ref([]) // Untuk accordion detail HSO

// --- HELPER: LOGIC PARSER CATATAN (CORE LOGIC) ---
const calculateShortageFromNote = (note, qty_sisa, system_available) => {
    // 1. Jika sudah lunas, tidak ada shortage
    if (qty_sisa <= 0) return 0;

    const cleanNote = note ? note.toUpperCase() : '';
    let admin_recognized_stock = null;

    if (cleanNote) {
        // A. Cek "NO STOCK" / "INDENT" -> Stok dianggap 0
        if (cleanNote.includes('NO STOCK') || cleanNote.includes('INDENT') || cleanNote.includes('KOSONG')) {
            admin_recognized_stock = 0;
        } 
        // B. Cek "STOCK" diikuti Angka -> Stok dianggap sesuai angka
        else {
            const match = cleanNote.match(/(?:STOCK|READY|SISA|QTY)[\s:.]*(\d+)/);
            if (match) {
                admin_recognized_stock = parseInt(match[1]);
            } 
            // C. Cek "STOCK" tanpa angka -> Stok dianggap Cukup (Sama dengan Sisa)
            else if (cleanNote.includes('STOCK') || cleanNote.includes('READY')) {
                admin_recognized_stock = qty_sisa; 
            }
        }
    }

    // --- KEPUTUSAN FINAL ---
    let final_stock = 0;

    if (admin_recognized_stock !== null) {
        // Jika ada catatan admin, PAKAI ITU (Override System)
        final_stock = admin_recognized_stock;
    } else {
        // Jika tidak ada catatan, PAKAI SYSTEM ACCURATE
        final_stock = system_available;
    }

    // Shortage = Yang Diminta - Yang Ada
    const shortage = qty_sisa - final_stock;
    return shortage > 0 ? shortage : 0;
}

// --- DATA FETCHING ---
const fetchProcurementData = async () => {
  isLoading.value = true
  groupedProcurement.value = [] // Reset

  try {
    // 1. DEFINISIKAN FIELD WAJIB AGAR DATA MUNCUL
    const fieldsToFetch = 'id,number,transDate,customer,statusName,detailItem.item,detailItem.quantity,detailItem.quantityShipped,detailItem.detailNotes,detailItem.availableQuantity,detailItem.itemUnit'

    // 2. Request ke Backend (yang sudah diperbaiki)
    const { data: accData, error } = await supabase.functions.invoke('accurate-list-so', {
        body: { 
            limit: 100, // Ambil 100 SO terakhir
            sort: 'transDate desc',
            fields: fieldsToFetch // <-- PENTING: Backend akan baca ini
        } 
    })

    if (error) throw error

    // Debugging: Cek di console apakah detailItem masuk
    console.log("Data Accurate:", accData?.d);

    const tempGroups = {}

    // 3. Loop Semua SO & Cari Barang Kurang
    if (accData?.d) {
        accData.d.forEach(so => {
            // Skip jika SO Dibatalkan/Closed
            if (['Closed', 'Dibatalkan'].includes(so.statusName)) return

            if (so.detailItem && Array.isArray(so.detailItem)) {
                so.detailItem.forEach(d => {
                    const qty_sisa = (d.quantity || 0) - (d.quantityShipped || 0);
                    const note = d.detailNotes || '';
                    const system_avail = d.availableQuantity || 0;

                    // Hitung kekurangan pakai Logic Admin
                    const qty_shortage = calculateShortageFromNote(note, qty_sisa, system_avail);

                    // Jika ada kekurangan, masukkan ke daftar belanja
                    if (qty_shortage > 0) {
                        const code = d.item?.no || 'N/A';
                        
                        if (!tempGroups[code]) {
                            tempGroups[code] = {
                                code: code,
                                name: d.item?.name || d.detailName || 'Unknown Product',
                                unit: d.itemUnit?.name || 'Pcs',
                                total_shortage: 0,
                                hso_list: []
                            }
                        }

                        // Akumulasi Total
                        tempGroups[code].total_shortage += qty_shortage;

                        // Simpan Detail HSO
                        tempGroups[code].hso_list.push({
                            id: Math.random(),
                            so_id: so.id,
                            so_number: so.number,
                            customer: so.customer?.name || '-',
                            date: so.transDate,
                            qty_order: d.quantity,
                            qty_sisa: qty_sisa,
                            note: note, // Bukti catatan admin
                            shortage_per_so: qty_shortage
                        });
                    }
                })
            }
        })
    }

    // Convert Object -> Array & Sort by Urgency
    groupedProcurement.value = Object.values(tempGroups).sort((a, b) => b.total_shortage - a.total_shortage);

  } catch (err) {
    console.error("Error fetching procurement:", err)
    alert("Gagal memuat data. Pastikan Backend 'accurate-list-so' sudah diperbarui.")
  } finally {
    isLoading.value = false
  }
}

onMounted(() => fetchProcurementData())

// --- COMPUTED: SEARCH FILTER ---
const filteredGroups = computed(() => {
    if (!searchQuery.value) return groupedProcurement.value;
    const q = searchQuery.value.toLowerCase();
    return groupedProcurement.value.filter(g => 
        g.name.toLowerCase().includes(q) || 
        g.code.toLowerCase().includes(q)
    );
})

// --- ACTIONS ---
const toggleGroup = (code) => {
  const idx = expandedGroups.value.indexOf(code)
  if (idx === -1) expandedGroups.value.push(code)
  else expandedGroups.value.splice(idx, 1)
}

const exportProcurement = () => {
  const data = filteredGroups.value.map(g => ({
    "Kode Barang": g.code,
    "Nama Barang": g.name,
    "Total Kekurangan": g.total_shortage,
    "Satuan": g.unit,
    "Jumlah HSO": g.hso_list.length
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Procurement Plan")
  XLSX.writeFile(wb, `Procurement_Plan_${new Date().toISOString().split('T')[0]}.xlsx`)
}

const openSiePortal = (code) => {
    if(!code || code === '-') return;
    window.open(`https://sieportal.siemens.com/en-id/products-services/detail/${code}?tree=CatalogTree`, '_blank');
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
            Akumulasi barang <b>NO STOCK</b> & <b>PARTIAL</b> dari 100 HSO terakhir.
        </p>
      </div>
      <div class="flex gap-2 w-full md:w-auto">
        <Button variant="outline" class="gap-2 border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700" @click="exportProcurement">
          <Download class="w-4 h-4" /> Export Excel
        </Button>
        <Button class="gap-2 bg-red-600 hover:bg-red-700 text-white" @click="fetchProcurementData" :disabled="isLoading">
            <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin"/>
            <span v-else>Refresh Data</span>
        </Button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card class="bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30">
            <CardContent class="p-4 flex items-center justify-between">
                <div>
                    <p class="text-xs font-bold text-red-600 dark:text-red-400 uppercase">Item Harus Dibeli</p>
                    <p class="text-2xl font-bold text-slate-900 dark:text-white mt-1">{{ filteredGroups.length }} <span class="text-sm font-normal text-slate-500">SKU Unik</span></p>
                </div>
                <AlertCircle class="w-8 h-8 text-red-500 opacity-50"/>
            </CardContent>
        </Card>
        <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <CardContent class="p-4 flex items-center justify-between">
                <div>
                    <p class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Total Unit Kurang</p>
                    <p class="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                        {{ filteredGroups.reduce((acc, g) => acc + g.total_shortage, 0).toLocaleString() }} 
                        <span class="text-sm font-normal text-slate-500">Pcs</span>
                    </p>
                </div>
                <Box class="w-8 h-8 text-slate-400 opacity-50"/>
            </CardContent>
        </Card>
        <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <CardContent class="p-4 flex items-center justify-between">
                <div>
                    <p class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">HSO Terdampak</p>
                    <p class="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                        {{ new Set(filteredGroups.flatMap(g => g.hso_list.map(h => h.so_number))).size }}
                        <span class="text-sm font-normal text-slate-500">Dokumen</span>
                    </p>
                </div>
                <FileText class="w-8 h-8 text-slate-400 opacity-50"/>
            </CardContent>
        </Card>
    </div>

    <div class="relative">
        <Search class="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input 
            v-model="searchQuery"
            placeholder="Cari Kode Barang / Nama Barang..." 
            class="pl-9 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700" 
        />
    </div>

    <div class="space-y-4">
        <div v-if="filteredGroups.length === 0 && !isLoading" class="text-center py-12 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
            <CheckCircle2 class="w-12 h-12 mx-auto mb-2 text-emerald-500 opacity-50"/>
            <p>Tidak ada kekurangan stok (Semua HSO Aman).</p>
        </div>

        <div v-for="group in filteredGroups" :key="group.code" class="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md transition-all">
            
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
                        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Dibutuhkan di <span class="font-bold text-slate-700 dark:text-slate-300">{{ group.hso_list.length }} HSO</span> berbeda
                        </p>
                    </div>
                </div>

                <div class="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 dark:border-slate-700">
                    <div class="text-right">
                        <p class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Total Kekurangan</p>
                        <p class="text-2xl font-bold text-red-600 dark:text-red-400">{{ group.total_shortage }} <span class="text-sm text-slate-400 font-medium">{{ group.unit }}</span></p>
                    </div>
                    <Button size="sm" class="bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200">
                        <Plus class="w-4 h-4 mr-1"/> Buat PO
                    </Button>
                </div>
            </div>

            <div v-if="expandedGroups.includes(group.code)" class="border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-4 animate-in slide-in-from-top-2 duration-200">
                <h4 class="text-xs font-bold text-slate-500 mb-3 uppercase flex items-center gap-2"><Layers class="w-3 h-3"/> Detail HSO yang Kekurangan</h4>
                <div class="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <Table>
                        <TableHeader class="bg-slate-50 dark:bg-slate-900">
                            <TableRow class="border-b border-slate-200 dark:border-slate-700">
                                <TableHead class="text-xs h-8">No. HSO</TableHead>
                                <TableHead class="text-xs h-8">Customer</TableHead>
                                <TableHead class="text-xs h-8 text-center">Tgl Order</TableHead>
                                <TableHead class="text-xs h-8">Catatan Admin</TableHead>
                                <TableHead class="text-xs h-8 text-center">Sisa Kirim</TableHead>
                                <TableHead class="text-xs h-8 text-right text-red-600 font-bold bg-red-50/50">Kurang</TableHead>
                                <TableHead class="text-xs h-8 w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow v-for="hso in group.hso_list" :key="hso.id" class="border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <TableCell class="font-medium text-slate-700 dark:text-slate-300 text-xs">{{ hso.so_number }}</TableCell>
                                <TableCell class="text-slate-600 dark:text-slate-400 text-xs">{{ hso.customer }}</TableCell>
                                <TableCell class="text-center text-xs text-slate-500">{{ hso.date }}</TableCell>
                                
                                <TableCell class="text-xs">
                                    <Badge v-if="hso.note" variant="outline" class="font-normal text-[10px] text-slate-500 bg-slate-50">{{ hso.note }}</Badge>
                                    <span v-else class="text-slate-300 italic text-[10px]">Auto System</span>
                                </TableCell>

                                <TableCell class="text-center text-xs font-medium">{{ hso.qty_sisa }}</TableCell>
                                <TableCell class="text-right font-bold text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-900/10 text-xs">- {{ hso.shortage_per_so }}</TableCell>
                                <TableCell class="text-right">
                                    <Button variant="ghost" size="sm" class="h-6 w-6 p-0" @click="router.push(`/sales-orders/${hso.so_id}`)" title="Lihat Detail SO">
                                        <ExternalLink class="w-3 h-3 text-slate-400 hover:text-slate-700"/>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    </div>

  </div>
</template>