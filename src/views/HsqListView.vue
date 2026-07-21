<script setup>
import { onMounted, ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { Loader2, AlertCircle, Search, FileText, Calendar, Eye, RefreshCw, DollarSign, ChevronLeft, ChevronRight } from 'lucide-vue-next'
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
    await fetchProgressDataMap()
  } catch (err) {
    console.error('Fetch HSQ error:', err)
    fetchError.value = err.message
  } finally {
    isLoading.value = false
  }
}

// --- HSQ TRACKING & PIPELINE MAP ---
const progressMap = ref({})
const pendingTasksMap = ref({})

const fetchProgressDataMap = async () => {
  const pMap = {}
  const tMap = {}

  // 1. Try Supabase
  try {
    const { data: pData, error: pErr } = await supabase.from('hsq_progress').select('hsq_number, stage, probability')
    if (!pErr && pData) {
      pData.forEach(item => {
        if (item.hsq_number) pMap[item.hsq_number] = item
      })
    }

    const { data: tData, error: tErr } = await supabase.from('hsq_tasks').select('hsq_number').eq('status', 'Pending')
    if (!tErr && tData) {
      tData.forEach(item => {
        if (item.hsq_number) {
          tMap[item.hsq_number] = (tMap[item.hsq_number] || 0) + 1
        }
      })
    }
  } catch (err) {
    console.warn('Supabase fetch failed, scanning local storage fallback:', err)
  }

  // 2. Scan localStorage fallback
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('hsq_progress_')) {
        const num = key.replace('hsq_progress_', '')
        try {
          const val = JSON.parse(localStorage.getItem(key))
          if (val && !pMap[num]) pMap[num] = val
        } catch {}
      } else if (key && key.startsWith('hsq_tasks_')) {
        const num = key.replace('hsq_tasks_', '')
        try {
          const val = JSON.parse(localStorage.getItem(key))
          if (Array.isArray(val)) {
            const pendingCount = val.filter(t => t.status === 'Pending').length
            if (pendingCount > 0) tMap[num] = Math.max(tMap[num] || 0, pendingCount)
          }
        } catch {}
      }
    }
  } catch {}

  progressMap.value = pMap
  pendingTasksMap.value = tMap
}

const formatHsqUrlSlug = (num) => {
  if (!num) return ''
  return String(num).replace(/\//g, '-')
}

const getHsqProgress = (num) => {
  if (!num) return null
  const str = String(num)
  const slashNum = str.replace(/-/g, '/')
  const hyphenNum = str.replace(/\//g, '-')
  return progressMap.value[str] || progressMap.value[slashNum] || progressMap.value[hyphenNum] || null
}

const getHsqPendingTasks = (num) => {
  if (!num) return 0
  const str = String(num)
  const slashNum = str.replace(/-/g, '/')
  const hyphenNum = str.replace(/\//g, '-')
  return pendingTasksMap.value[str] || pendingTasksMap.value[slashNum] || pendingTasksMap.value[hyphenNum] || 0
}

const goToDetail = (item) => {
  const targetId = typeof item === 'object' ? (item.id || item.number) : item
  if (targetId) {
    router.push(`/hsq/${encodeURIComponent(targetId)}`)
  }
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

// --- PAGINATION ---
const currentPage = ref(1)
const itemsPerPage = ref(20)

watch([searchQuery, statusFilter, startDate, endDate, itemsPerPage], () => {
  currentPage.value = 1
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredHsqList.value.length / itemsPerPage.value)))

const paginatedHsqList = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return filteredHsqList.value.slice(start, start + itemsPerPage.value)
})

const startIndex = computed(() => filteredHsqList.value.length === 0 ? 0 : (currentPage.value - 1) * itemsPerPage.value + 1)
const endIndex = computed(() => Math.min(currentPage.value * itemsPerPage.value, filteredHsqList.value.length))

const prevPage = () => {
  if (currentPage.value > 1) currentPage.value--
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++
}

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
  currentPage.value = 1
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

const getStageBadgeClass = (stage) => {
  if (!stage || stage === 'Prospecting') return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  if (stage.includes('Pitching') || stage.includes('Dikirim')) return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400'
  if (stage.includes('Negosiasi')) return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400'
  if (stage.includes('Won')) return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400'
  if (stage.includes('Lost')) return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400'
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
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
          Daftar dokumen Penawaran Penjualan (Sales Quotation) dengan pelacakan progress & probabilitas deal.
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
              <th class="py-3.5 px-4 text-xs font-bold uppercase tracking-wider w-40 text-center">Progress & Win %</th>
              <th class="py-3.5 px-4 text-xs font-bold uppercase tracking-wider w-28 text-center">Status</th>
              <th class="py-3.5 px-4 text-xs font-bold uppercase tracking-wider w-24 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
            <tr 
              v-for="(hsq, idx) in paginatedHsqList" 
              :key="hsq.id" 
              class="hover:bg-slate-50/70 dark:hover:bg-[#0f172a]/30 transition-colors cursor-pointer group"
              @click="goToDetail(hsq)"
            >
              <td class="py-3.5 px-4 text-center text-xs font-bold text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">
                {{ (currentPage - 1) * itemsPerPage + idx + 1 }}
              </td>
              <td class="py-3.5 px-4">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold text-slate-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                    {{ hsq.number }}
                  </span>
                  <!-- Pending task badge if any -->
                  <span 
                    v-if="getHsqPendingTasks(hsq)" 
                    title="Ada tugas pending"
                    class="px-1.5 py-0.5 rounded text-[9px] font-black bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border border-red-200 dark:border-red-900"
                  >
                    {{ getHsqPendingTasks(hsq) }} Task
                  </span>
                </div>
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
              <!-- Pipeline Progress & Prob -->
              <td class="py-3.5 px-4 text-center">
                <div v-if="getHsqProgress(hsq)" class="flex flex-col items-center gap-1">
                  <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border" :class="getStageBadgeClass(getHsqProgress(hsq).stage)">
                    {{ getHsqProgress(hsq).stage }}
                  </span>
                  <div v-if="getHsqProgress(hsq).probability !== undefined && getHsqProgress(hsq).probability !== null" class="flex items-center gap-1 text-[10px]">
                    <span class="font-bold text-emerald-600 dark:text-emerald-400">
                      {{ getHsqProgress(hsq).probability }}% Win
                    </span>
                  </div>
                </div>
                <span v-else class="text-xs font-bold text-slate-400 dark:text-slate-600">-</span>
              </td>
              <td class="py-3.5 px-4 text-center">
                <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border" :class="getStatusClass(hsq.statusName)">
                  {{ hsq.statusName || 'Outstanding' }}
                </span>
              </td>
              <td class="py-3.5 px-4 text-center">
                <button 
                  class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 border border-blue-100 dark:border-blue-950 px-2 py-1 rounded transition-all"
                  @click.stop="goToDetail(hsq)"
                >
                  <Eye class="w-3.5 h-3.5" /> Detail
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      <div class="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 gap-4 text-xs">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Baris/halaman:</span>
            <select 
              v-model.number="itemsPerPage" 
              class="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-lg text-xs outline-none focus:ring-2 focus:ring-red-500 dark:text-slate-200 font-bold"
            >
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </div>
          <span class="text-slate-500 dark:text-slate-400 hidden sm:inline">
            Menampilkan <strong class="text-slate-800 dark:text-slate-200">{{ startIndex }} - {{ endIndex }}</strong> dari <strong class="text-slate-800 dark:text-slate-200">{{ filteredHsqList.length }}</strong> dokumen
          </span>
        </div>

        <div class="flex items-center gap-3">
          <span class="text-slate-500 dark:text-slate-400">
            Halaman <strong class="text-slate-800 dark:text-slate-200">{{ currentPage }}</strong> dari <strong class="text-slate-800 dark:text-slate-200">{{ totalPages }}</strong>
          </span>
          <div class="flex gap-1">
            <button 
              :disabled="currentPage === 1" 
              @click="prevPage"
              class="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft class="w-4 h-4"/>
            </button>
            <button 
              :disabled="currentPage >= totalPages" 
              @click="nextPage"
              class="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Halaman Selanjutnya"
            >
              <ChevronRight class="w-4 h-4"/>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
