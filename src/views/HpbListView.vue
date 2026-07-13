<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { Loader2, AlertCircle, Search, FileText, Calendar, Eye } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const router = useRouter()
const isLoading = ref(true)
const hpbList = ref([])
const searchQuery = ref('')
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

const goToDetail = (id) => {
  router.push(`/hpb/${id}`)
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
              @click="goToDetail(hpb.id)"
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
                  @click.stop="goToDetail(hpb.id)"
                >
                  <Eye class="w-3.5 h-3.5" /> Detail
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
