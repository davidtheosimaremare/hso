<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { 
  Loader2, AlertCircle, FileText, ArrowLeft, Calendar, 
  FileSpreadsheet, Download, ChevronRight 
} from 'lucide-vue-next'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'

const route = useRoute()
const router = useRouter()
const hpbId = route.params.id

const isLoading = ref(true)
const selectedHpb = ref(null)
const fetchError = ref(null)

// --- FETCH HPB DETAIL ---
const fetchHpbDetail = async () => {
  isLoading.value = true
  fetchError.value = null
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
    fetchError.value = err.message
  } finally {
    isLoading.value = false
  }
}

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

const goBack = () => {
  router.push('/hpb')
}

onMounted(() => {
  fetchHpbDetail()
})
</script>

<template>
  <div class="space-y-6 font-mono text-slate-800 dark:text-slate-100 p-1 md:p-3">
    <!-- Breadcrumb & Back -->
    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
        <span>Rencana Pembelian</span>
        <ChevronRight class="w-3 h-3 text-slate-400" />
        <span class="cursor-pointer hover:text-red-600 dark:hover:text-red-400 transition-colors" @click="goBack">Permintaan Barang (HPB)</span>
        <ChevronRight class="w-3 h-3 text-slate-400" />
        <span class="text-slate-800 dark:text-slate-200 font-black">Detail HPB</span>
      </div>
      
      <button 
        @click="goBack"
        class="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors bg-white dark:bg-[#1e293b] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm w-fit"
      >
        <ArrowLeft class="w-4 h-4" /> Kembali ke Daftar
      </button>
    </div>

    <!-- Main Detail Wrapper -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-32 bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800">
      <Loader2 class="w-10 h-10 animate-spin text-red-600 mb-3" />
      <p class="text-xs font-bold text-slate-500 dark:text-slate-400 animate-pulse tracking-widest uppercase">Mengambil detail HPB dari Accurate...</p>
    </div>

    <div v-else-if="fetchError" class="p-6 text-center bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/30">
      <AlertCircle class="w-10 h-10 mx-auto mb-3" />
      <h3 class="text-sm font-bold">Gagal Mengambil Detail</h3>
      <p class="text-xs mt-1.5 font-sans">{{ fetchError }}</p>
      <Button @click="fetchHpbDetail" variant="outline" class="mt-4 border-red-200 hover:bg-red-50 hover:text-red-700 text-xs">Coba Lagi</Button>
    </div>

    <template v-else-if="selectedHpb">
      <!-- Title Card -->
      <div class="bg-white dark:bg-[#1e293b] p-5 md:p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="bg-red-50 dark:bg-red-950/20 p-2.5 rounded-xl border border-red-100 dark:border-red-950/60">
            <FileText class="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h2 class="text-lg md:text-xl font-black text-slate-900 dark:text-white font-mono flex items-center gap-2">
              {{ selectedHpb.number }}
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Dibuat tanggal <span class="font-bold text-slate-800 dark:text-slate-300">{{ formatDate(selectedHpb.transDate) }}</span>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3 flex-wrap">
          <span class="inline-flex px-3.5 py-1 rounded-full text-xs font-bold border" :class="getStatusClass(selectedHpb.statusName)">
            {{ selectedHpb.statusName || 'Outstanding' }}
          </span>
          
          <Button 
            @click="exportToExcel"
            class="h-9.5 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 shadow-sm rounded-lg"
          >
            <FileSpreadsheet class="w-4 h-4" /> Download Excel
          </Button>
        </div>
      </div>

      <!-- Metadata & Description Card -->
      <div class="bg-white dark:bg-[#1e293b] p-5 md:p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h3 class="text-xs font-black uppercase text-slate-400 tracking-wider">Keterangan Dokumen</h3>
        <p class="text-sm leading-relaxed text-slate-700 dark:text-slate-300 font-sans border-l-4 border-slate-300 dark:border-slate-700 pl-4 py-1.5 italic bg-slate-50 dark:bg-[#0f172a]/30 pr-4 rounded-r">
          {{ selectedHpb.description || 'Tidak ada keterangan tambahan.' }}
        </p>
      </div>

      <!-- Items Section -->
      <div class="bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div class="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-[#0f172a] flex items-center justify-between">
          <h3 class="text-xs font-black uppercase text-slate-500 tracking-wider">Daftar Barang Permintaan</h3>
          <span class="text-xs font-bold text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 rounded-full">
            {{ selectedHpb.detailItem?.length || 0 }} Items
          </span>
        </div>
        
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50/50 dark:bg-[#0f172a]/20 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-12 text-center">No</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-44">Kode Barang</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider">Nama Barang</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-24 text-right">Quantity</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-24 text-center">Satuan</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-48">HSO Ref (Catatan)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              <tr 
                v-for="(item, idx) in selectedHpb.detailItem" 
                :key="idx" 
                class="hover:bg-slate-50/40 dark:hover:bg-[#0f172a]/20 transition-colors"
              >
                <td class="py-3.5 px-4 text-center text-slate-400 font-bold">{{ idx + 1 }}</td>
                <td class="py-3.5 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">{{ item.item?.no || '-' }}</td>
                <td class="py-3.5 px-4 font-medium text-slate-900 dark:text-white leading-normal">{{ item.item?.name || item.detailName || '-' }}</td>
                <td class="py-3.5 px-4 text-right font-black text-slate-900 dark:text-white text-sm">{{ item.quantity || 0 }}</td>
                <td class="py-3.5 px-4 text-center font-bold text-slate-600 dark:text-slate-400">{{ item.unit?.name || '-' }}</td>
                <td class="py-3.5 px-4 font-mono font-semibold text-slate-600 dark:text-slate-400">{{ item.detailNotes || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
