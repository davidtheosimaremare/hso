<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { Loader2, AlertCircle, Search, FileText, Calendar, Eye, RefreshCw, DollarSign } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const router = useRouter()
const isLoading = ref(true)
const hsqList = ref([])
const searchQuery = ref('')
const fetchError = ref(null)

// --- Filter & Date State ---
const startDate = ref('')
const endDate = ref('')
const statusFilter = ref('all')

// Status options for Sales Quotations
const availableStatuses = [
  { val: 'all', label: 'Semua Status' },
  { val: 'Draf', label: 'Draf' },
  { val: 'Diajukan', label: 'Diajukan' },
  { val: 'Disetujui', label: 'Disetujui' },
  { val: 'Terproses', label: 'Terproses' },
  { val: 'Ditutup', label: 'Ditutup' }
]

// --- FETCH HSQ LIST ---
const fetchHsqList = async () => {
  isLoading.value = true
  fetchError.value = null
  try {
    const { data, error } = await supabase.functions.invoke('accurate-list-sq')
    
    if (error) throw new Error(error.message || 'Gagal mengambil data dari Edge Function')
    if (!data?.s) throw new Error(data?.error || 'Gagal mengambil data list HSQ')
    
    hsqList.value = data.d || []
  } catch (err) {
    console.error('Fetch HSQ error:', err)
    fetchError.value = err.message
  } finally {
    isLoading.value = false
  }
}

const goToDetail = (id) => {
  router.push(`/hsq/${id}`)
}

onMounted(() => {
  fetchHsqList()
})

// --- FILTER & SEARCH ---
const parseAccurateDate = (dateStr) => {
  if (!dateStr) return new Date(0)
  const parts = dateStr.split('/')
  return new Date(parts[2], parts[1] - 1, parts[0])
}

const filteredHsqList = computed(() => {
  let result = [...hsqList.value]

  // 1. Search Query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(hsq => {
      const num = (hsq.number || '').toLowerCase()
      const client = (hsq.customer?.name || '').toLowerCase()
      const desc = (hsq.description || '').toLowerCase()
      return num.includes(query) || client.includes(query) || desc.includes(query)
    })
  }

  // 2. Status Filter
  if (statusFilter.value !== 'all') {
    result = result.filter(hsq => hsq.statusName === statusFilter.value)
  }

  // 3. Date Filters
  if (startDate.value || endDate.value) {
    result = result.filter(hsq => {
      const itemDate = parseAccurateDate(hsq.transDate)
      let validStart = true
      let validEnd = true
      if (startDate.value) {
        const start = new Date(startDate.value); start.setHours(0, 0, 0, 0)
        if (itemDate < start) validStart = false
      }
      if (endDate.value) {
        const end = new Date(endDate.value); end.setHours(23, 59, 59, 999)
        if (itemDate > end) validEnd = false
      }
      return validStart && validEnd
    })
  }

  return result
})

// --- DATE SHORTCUTS ---
const setDateFilter = (type) => {
  const now = new Date()
  const formatDate = (d) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  if (type === 'today') {
    startDate.value = formatDate(now)
    endDate.value = formatDate(now)
  } else if (type === 'week') {
    const day = now.getDay() || 7
    const startOfWeek = new Date(now)
    if (day !== 1) startOfWeek.setHours(-24 * (day - 1))
    startDate.value = formatDate(startOfWeek)
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)
    endDate.value = formatDate(endOfWeek)
  } else if (type === 'month') {
    startDate.value = formatDate(new Date(now.getFullYear(), now.getMonth(), 1))
    endDate.value = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  }
}

const resetFilter = () => {
  searchQuery.value = ''
  startDate.value = ''
  endDate.value = ''
  statusFilter.value = 'all'
}

// --- UTILS ---
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  try {
    const d = parseAccurateDate(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

const formatCurrency = (val) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0)
}

const getStatusClass = (status) => {
  const name = (status || '').toLowerCase()
  if (name.includes('closed') || name.includes('selesai') || name.includes('ditutup') || name.includes('terproses')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/60'
  }
  if (name.includes('disetujui')) {
    return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/60'
  }
  if (name.includes('draft') || name.includes('draf')) {
    return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700'
  }
  if (name.includes('diajukan')) {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/60'
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
          Sales Quotation (HSQ)
        </h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Daftar dokumen Penawaran Penjualan (Sales Quotation) yang diambil dari Accurate Online secara real-time.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          Total: {{ filteredHsqList.length }} / {{ hsqList.length }} Dokumen
        </span>
        <Button @click="fetchHsqList" variant="outline" class="h-9 px-4 border-slate-300 dark:border-slate-700 text-xs gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isLoading }" /> Refresh
        </Button>
      </div>
    </div>

    <!-- Controls / Filters -->
    <div class="bg-white dark:bg-[#1e293b] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
      <div class="flex flex-col lg:flex-row gap-3">
        <!-- Search Input -->
        <div class="relative flex-1">
          <Search class="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400" />
          <input 
            v-model="searchQuery" 
            type="text" 
            placeholder="Cari Nomor HSQ, Customer, atau Keterangan..." 
            class="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 pl-10 pr-4 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all placeholder-slate-400 dark:placeholder-slate-500"
          />
        </div>

        <!-- Status Filter -->
        <div class="w-full lg:w-48">
          <select 
            v-model="statusFilter"
            class="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
          >
            <option v-for="st in availableStatuses" :key="st.val" :value="st.val">
              {{ st.label }}
            </option>
          </select>
        </div>
      </div>

      <!-- Date Filters -->
      <div class="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/60">
        <span class="text-xs text-slate-400 font-bold">Filter Tanggal:</span>
        <div class="flex items-center gap-2">
          <input 
            v-model="startDate" 
            type="date" 
            class="bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 px-2 py-1 rounded text-xs outline-none"
          />
          <span class="text-xs text-slate-400">s/d</span>
          <input 
            v-model="endDate" 
            type="date" 
            class="bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 px-2 py-1 rounded text-xs outline-none"
          />
        </div>

        <div class="flex items-center gap-1">
          <button @click="setDateFilter('today')" class="px-2.5 py-1 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/80">Hari Ini</button>
          <button @click="setDateFilter('week')" class="px-2.5 py-1 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/80">Minggu Ini</button>
          <button @click="setDateFilter('month')" class="px-2.5 py-1 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/80">Bulan Ini</button>
          <button @click="resetFilter" class="px-2.5 py-1 rounded text-[10px] font-bold bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40">Reset</button>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800">
      <Loader2 class="w-10 h-10 animate-spin text-red-600 mb-3" />
      <p class="text-xs font-bold text-slate-500 dark:text-slate-400 animate-pulse tracking-widest uppercase">Memuat data Sales Quotation dari Accurate...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="fetchError" class="p-6 text-center bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/30">
      <AlertCircle class="w-10 h-10 mx-auto mb-3" />
      <h3 class="text-sm font-bold">Gagal Mengambil Data</h3>
      <p class="text-xs mt-1.5 font-sans">{{ fetchError }}</p>
      <Button @click="fetchHsqList" variant="outline" class="mt-4 border-red-200 hover:bg-red-50 hover:text-red-700 text-xs">Coba Lagi</Button>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredHsqList.length === 0" class="text-center py-16 bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800">
      <FileText class="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
      <p class="text-sm font-bold text-slate-400">Tidak ada dokumen Sales Quotation ditemukan</p>
      <p class="text-xs text-slate-500 mt-1">Coba gunakan kata kunci atau filter pencarian yang lain.</p>
    </div>

    <!-- Table List -->
    <div v-else class="bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-slate-50 dark:bg-[#0f172a] text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <th class="py-3.5 px-4 text-xs font-bold uppercase tracking-wider w-12 text-center">No</th>
              <th class="py-3.5 px-4 text-xs font-bold uppercase tracking-wider">No. Quotation</th>
              <th class="py-3.5 px-4 text-xs font-bold uppercase tracking-wider w-36">Tanggal</th>
              <th class="py-3.5 px-4 text-xs font-bold uppercase tracking-wider">Customer</th>
              <th class="py-3.5 px-4 text-xs font-bold uppercase tracking-wider">Nilai Total</th>
              <th class="py-3.5 px-4 text-xs font-bold uppercase tracking-wider w-32 text-center">Status</th>
              <th class="py-3.5 px-4 text-xs font-bold uppercase tracking-wider w-24 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
            <tr 
              v-for="(hsq, idx) in filteredHsqList" 
              :key="hsq.id" 
              class="hover:bg-slate-50/70 dark:hover:bg-[#0f172a]/30 transition-colors cursor-pointer group"
              @click="goToDetail(hsq.id)"
            >
              <td class="py-3.5 px-4 text-center text-xs font-bold text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">{{ idx + 1 }}</td>
              <td class="py-3.5 px-4">
                <span class="text-sm font-bold text-slate-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                  {{ hsq.number }}
                </span>
              </td>
              <td class="py-3.5 px-4 text-xs font-bold text-slate-600 dark:text-slate-400">
                <div class="flex items-center gap-1.5">
                  <Calendar class="w-3.5 h-3.5 text-slate-400" />
                  {{ formatDate(hsq.transDate) }}
                </div>
              </td>
              <td class="py-3.5 px-4">
                <div class="text-xs font-bold text-slate-900 dark:text-white">{{ hsq.customer?.name || '-' }}</div>
                <div class="text-[10px] text-slate-400">{{ hsq.customer?.customerNo || '' }}</div>
              </td>
              <td class="py-3.5 px-4 text-xs font-bold text-slate-700 dark:text-slate-300">
                {{ formatCurrency(hsq.totalAmount) }}
              </td>
              <td class="py-3.5 px-4 text-center">
                <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border" :class="getStatusClass(hsq.statusName)">
                  {{ hsq.statusName || 'Outstanding' }}
                </span>
              </td>
              <td class="py-3.5 px-4 text-center">
                <button 
                  class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 border border-blue-100 dark:border-blue-950 px-2 py-1 rounded transition-all"
                  @click.stop="goToDetail(hsq.id)"
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
