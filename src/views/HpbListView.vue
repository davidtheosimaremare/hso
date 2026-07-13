<script setup>
import { onMounted, ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { 
  Loader2, AlertCircle, Search, FileText, X, Download, 
  Calendar, FileSpreadsheet, Eye, ChevronRight 
} from 'lucide-vue-next'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'

const isLoading = ref(true)
const isDetailLoading = ref(false)
const hpbList = ref([])
const searchQuery = ref('')
const selectedHpb = ref(null)
const isDetailModalOpen = ref(false)
const fetchError = ref(null)

// --- FETCH HPB LIST ---
const fetchHpbList = async () => {
  isLoading.value = true
  fetchError.value = null
  try {
    const { data, error } = await supabase.functions.invoke('accurate-create-hpb', {
      body: { action: 'list-hpb' }
    })
    
    if (error) throw new Error(error.message || 'Gagal mengambil data dari Edge Function')
    if (!data?.s) throw new Error(data?.error || 'Gagal mengambil data list HPB')
    
    hpbList.value = data.d || []
  } catch (err) {
    console.error('Fetch HPB error:', err)
    fetchError.value = err.message
  } finally {
    isLoading.value = false
  }
}

// --- FETCH HPB DETAIL ---
const viewHpbDetail = async (hpbId) => {
  isDetailModalOpen.value = true
  isDetailLoading.value = true
  selectedHpb.value = null
  
  try {
    const { data, error } = await supabase.functions.invoke('accurate-create-hpb', {
      body: { action: 'detail-hpb', id: hpbId }
    })
    
    if (error) throw new Error(error.message || 'Gagal mengambil detail dari Edge Function')
    if (!data?.s) throw new Error(data?.error || 'Gagal mengambil detail HPB')
    
    selectedHpb.value = data.d
  } catch (err) {
    console.error('Fetch HPB detail error:', err)
    alert(`Gagal mengambil detail HPB: ${err.message}`)
    isDetailModalOpen.value = false
  } finally {
    isDetailLoading.value = false
  }
}

onMounted(() => {
  fetchHpbList()
})

// --- FILTER & SEARCH ---
const filteredHpbList = computed(() => {
  if (!searchQuery.value.trim()) return hpbList.value
  const query = searchQuery.value.toLowerCase()
  return hpbList.value.filter(hpb => {
    const num = (hpb.number || '').toLowerCase()
    const desc = (hpb.description || '').toLowerCase()
    return num.includes(query) || desc.includes(query)
  })
})

// --- EXPORT TO EXCEL ---
const exportToExcel = () => {
  if (!selectedHpb.value) return
  
  const headers = [
    ['Nomor HPB:', selectedHpb.value.number],
    ['Tanggal:', formatDate(selectedHpb.value.transDate)],
    ['Status:', selectedHpb.value.statusName || 'Outstanding'],
    ['Keterangan:', selectedHpb.value.description || '-'],
    [],
    ['No.', 'Kode Barang', 'Nama Barang', 'Qty', 'Satuan', 'Catatan Detail (HSO Ref)']
  ]
  
  const rows = (selectedHpb.value.detailItem || []).map((item, idx) => [
    idx + 1,
    item.item?.no || '-',
    item.item?.name || item.detailName || '-',
    item.quantity || 0,
    item.unit?.name || '-',
    item.detailNotes || '-'
  ])
  
  const fullData = [...headers, ...rows]
  
  const ws = XLSX.utils.aoa_to_sheet(fullData)
  
  // Set column widths
  const wscols = [
    { wch: 6 },  // No
    { wch: 22 }, // Kode Barang
    { wch: 45 }, // Nama Barang
    { wch: 10 }, // Qty
    { wch: 10 }, // Satuan
    { wch: 25 }  // Catatan Detail
  ]
  ws['!cols'] = wscols
  
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Detail HPB")
  XLSX.writeFile(wb, `HPB_${selectedHpb.value.number.replace(/[\/\\]/g, '_')}.xlsx`)
}

// --- UTILS ---
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr.split('/').reverse().join('-'))
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

const getStatusClass = (status) => {
  const name = (status || '').toLowerCase()
  if (name.includes('closed') || name.includes('selesai')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/60'
  }
  if (name.includes('partial') || name.includes('sebagian')) {
    return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/60'
  }
  if (name.includes('draft')) {
    return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700'
  }
  return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/60'
}
</script>

<template>
  <div class="space-y-6 font-mono text-slate-800 dark:text-slate-100 p-1 md:p-3">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
          <FileText class="w-7 h-7 text-red-600" />
          Permintaan Barang (HPB)
        </h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Daftar dokumen Permintaan Pembelian Barang (HPB) yang diambil dari Accurate Online.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          Total: {{ hpbList.length }} Dokumen
        </span>
        <Button @click="fetchHpbList" variant="outline" class="h-9 px-4 border-slate-300 dark:border-slate-700 text-xs gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
          🔄 Refresh
        </Button>
      </div>
    </div>

    <!-- Controls -->
    <div class="bg-white dark:bg-[#1e293b] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-3">
      <div class="relative flex-1">
        <Search class="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400" />
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Cari Nomor HPB atau Keterangan..." 
          class="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 pl-10 pr-4 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all placeholder-slate-400 dark:placeholder-slate-500"
        />
      </div>
    </div>

    <!-- Main List Container -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800">
      <Loader2 class="w-10 h-10 animate-spin text-red-600 mb-3" />
      <p class="text-xs font-bold text-slate-500 dark:text-slate-400 animate-pulse tracking-widest uppercase">Memuat data HPB dari Accurate...</p>
    </div>

    <div v-else-if="fetchError" class="p-6 text-center bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/30">
      <AlertCircle class="w-10 h-10 mx-auto mb-3" />
      <h3 class="text-sm font-bold">Gagal Mengambil Data</h3>
      <p class="text-xs mt-1.5 font-sans">{{ fetchError }}</p>
      <Button @click="fetchHpbList" variant="outline" class="mt-4 border-red-200 hover:bg-red-50 hover:text-red-700 text-xs">Coba Lagi</Button>
    </div>

    <div v-else-if="filteredHpbList.length === 0" class="text-center py-16 bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800">
      <FileText class="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
      <p class="text-sm font-bold text-slate-400">Tidak ada dokumen HPB ditemukan</p>
      <p class="text-xs text-slate-500 mt-1">Coba gunakan kata kunci pencarian yang lain.</p>
    </div>

    <!-- Table List -->
    <div v-else class="bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-slate-50 dark:bg-[#0f172a] text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <th class="py-3.5 px-4 text-xs font-bold uppercase tracking-wider w-12 text-center">No</th>
              <th class="py-3.5 px-4 text-xs font-bold uppercase tracking-wider">No. HPB</th>
              <th class="py-3.5 px-4 text-xs font-bold uppercase tracking-wider w-36">Tanggal</th>
              <th class="py-3.5 px-4 text-xs font-bold uppercase tracking-wider">Keterangan</th>
              <th class="py-3.5 px-4 text-xs font-bold uppercase tracking-wider w-32 text-center">Status</th>
              <th class="py-3.5 px-4 text-xs font-bold uppercase tracking-wider w-24 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
            <tr 
              v-for="(hpb, idx) in filteredHpbList" 
              :key="hpb.id" 
              class="hover:bg-slate-50/70 dark:hover:bg-[#0f172a]/30 transition-colors cursor-pointer group"
              @click="viewHpbDetail(hpb.id)"
            >
              <td class="py-3.5 px-4 text-center text-xs font-bold text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">{{ idx + 1 }}</td>
              <td class="py-3.5 px-4">
                <span class="text-sm font-bold text-slate-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                  {{ hpb.number }}
                </span>
              </td>
              <td class="py-3.5 px-4 text-xs font-bold text-slate-600 dark:text-slate-400">
                <div class="flex items-center gap-1.5">
                  <Calendar class="w-3.5 h-3.5 text-slate-400" />
                  {{ formatDate(hpb.transDate) }}
                </div>
              </td>
              <td class="py-3.5 px-4 text-xs font-medium text-slate-500 dark:text-slate-400 truncate max-w-md">
                {{ hpb.description || '-' }}
              </td>
              <td class="py-3.5 px-4 text-center">
                <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border" :class="getStatusClass(hpb.statusName)">
                  {{ hpb.statusName || 'Outstanding' }}
                </span>
              </td>
              <td class="py-3.5 px-4 text-center">
                <button 
                  class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 border border-blue-100 dark:border-blue-950 px-2 py-1 rounded transition-all"
                  @click.stop="viewHpbDetail(hpb.id)"
                >
                  <Eye class="w-3.5 h-3.5" /> Detail
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- DETAIL MODAL -->
    <div 
      v-if="isDetailModalOpen" 
      class="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      @click="isDetailModalOpen = false"
    >
      <div 
        class="bg-white dark:bg-[#1e293b] rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all"
        @click.stop
      >
        <!-- Modal Header -->
        <div class="px-6 py-4.5 bg-slate-50 dark:bg-[#0f172a] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="bg-red-50 dark:bg-red-950/20 p-2 rounded-lg border border-red-100 dark:border-red-950/60">
              <FileText class="w-5 h-5 text-red-600" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-base font-black text-slate-900 dark:text-white">Detail Permintaan Barang</span>
                <span 
                  v-if="selectedHpb"
                  class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border" 
                  :class="getStatusClass(selectedHpb.statusName)"
                >
                  {{ selectedHpb.statusName || 'Outstanding' }}
                </span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5 font-bold" v-if="selectedHpb">No: <span class="font-mono text-slate-800 dark:text-slate-300">{{ selectedHpb.number }}</span></p>
            </div>
          </div>
          <button 
            @click="isDetailModalOpen = false"
            class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Modal Content -->
        <div class="flex-1 overflow-y-auto p-6 space-y-5">
          <!-- Loading State -->
          <div v-if="isDetailLoading" class="flex flex-col items-center justify-center py-24">
            <Loader2 class="w-10 h-10 animate-spin text-red-600 mb-3" />
            <p class="text-xs font-bold text-slate-400 animate-pulse uppercase tracking-widest">Mengambil detail HPB dari Accurate...</p>
          </div>

          <!-- Loaded Details -->
          <template v-else-if="selectedHpb">
            <!-- Header Metadata Card -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-[#0f172a]/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 text-xs">
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <span class="text-slate-400 font-bold w-24">Nomor HPB</span>
                  <span class="text-slate-900 dark:text-white font-mono font-bold">: {{ selectedHpb.number }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-slate-400 font-bold w-24">Tanggal</span>
                  <span class="text-slate-900 dark:text-white font-bold">: {{ formatDate(selectedHpb.transDate) }}</span>
                </div>
              </div>
              <div class="space-y-2">
                <div class="flex items-start gap-2">
                  <span class="text-slate-400 font-bold w-24 flex-shrink-0">Keterangan</span>
                  <span class="text-slate-900 dark:text-white font-medium">: {{ selectedHpb.description || '-' }}</span>
                </div>
              </div>
            </div>

            <!-- Items Table Section -->
            <div>
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-xs font-black uppercase text-slate-500 tracking-wider">Daftar Barang Requisition</h3>
                <span class="text-xs font-bold text-slate-400">{{ selectedHpb.detailItem?.length || 0 }} Items</span>
              </div>

              <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/20">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="bg-slate-50 dark:bg-[#0f172a] text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <th class="py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider w-10 text-center">No</th>
                      <th class="py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider w-40">Kode Barang</th>
                      <th class="py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider">Nama Barang</th>
                      <th class="py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider w-20 text-right">Qty</th>
                      <th class="py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider w-20 text-center">Satuan</th>
                      <th class="py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider w-36">HSO Ref (Catatan)</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                    <tr v-for="(item, idx) in selectedHpb.detailItem" :key="idx" class="hover:bg-slate-50/50 dark:hover:bg-[#0f172a]/20">
                      <td class="py-2.5 px-3 text-center text-slate-400 font-bold">{{ idx + 1 }}</td>
                      <td class="py-2.5 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">{{ item.item?.no || '-' }}</td>
                      <td class="py-2.5 px-3 font-medium text-slate-900 dark:text-white">{{ item.item?.name || item.detailName || '-' }}</td>
                      <td class="py-2.5 px-3 text-right font-black text-slate-900 dark:text-white">{{ item.quantity || 0 }}</td>
                      <td class="py-2.5 px-3 text-center font-bold text-slate-600 dark:text-slate-400">{{ item.unit?.name || '-' }}</td>
                      <td class="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-400 font-mono">{{ item.detailNotes || '-' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </template>
        </div>

        <!-- Modal Footer -->
        <div class="px-6 py-4.5 bg-slate-50 dark:bg-[#0f172a] border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <Button 
            @click="isDetailModalOpen = false" 
            variant="outline" 
            class="h-9.5 px-5 text-xs border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-850"
          >
            Tutup
          </Button>

          <Button 
            v-if="selectedHpb"
            @click="exportToExcel" 
            class="h-9.5 px-5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 shadow-sm rounded-lg"
          >
            <FileSpreadsheet class="w-4.5 h-4.5" /> Download Excel
          </Button>
        </div>
      </div>
    </div>

  </div>
</template>
