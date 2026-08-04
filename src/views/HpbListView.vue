<script setup>
import { onMounted, ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { Loader2, AlertCircle, Search, FileText, Calendar, Eye, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const router = useRouter()
const isLoading = ref(true)
const hpbList = ref([])
const searchQuery = ref('')
const fetchError = ref(null)

// --- Filter & Date State ---
const startDate = ref('')
const endDate = ref('')
const statusFilter = ref('all')
const dateFilterOption = ref('')

const availableStatuses = computed(() => {
  const statuses = new Set()
  hpbList.value.forEach(hpb => {
    if (hpb.statusName) statuses.add(hpb.statusName)
  })
  const statusArray = Array.from(statuses).sort()
  return [
    { val: 'all', label: 'Semua Status' },
    ...statusArray.map(s => ({ val: s, label: s }))
  ]
})

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
const parseAccurateDate = (dateStr) => {
  if (!dateStr) return new Date(0)
  const parts = dateStr.split('/')
  return new Date(parts[2], parts[1] - 1, parts[0])
}

const filteredHpbList = computed(() => {
  let result = [...hpbList.value]

  // 1. Search Query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(hpb => {
      const num = (hpb.number || '').toLowerCase()
      const desc = (hpb.description || '').toLowerCase()
      return num.includes(query) || desc.includes(query)
    })
  }

  // 2. Status Filter
  if (statusFilter.value !== 'all') {
    result = result.filter(hpb => hpb.statusName === statusFilter.value)
  }

  // 3. Date Filters
  if (startDate.value || endDate.value) {
    result = result.filter(hpb => {
      const itemDate = parseAccurateDate(hpb.transDate)
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

  // 4. Sort by Date (newest first)
  result.sort((a, b) => {
    const dateA = parseAccurateDate(a.transDate).getTime()
    const dateB = parseAccurateDate(b.transDate).getTime()
    if (dateA !== dateB) return dateB - dateA
    return (b.number || '').localeCompare(a.number || '')
  })

  return result
})

// --- PAGINATION ---
const currentPage = ref(1)
const itemsPerPage = ref(20)

watch([searchQuery, statusFilter, startDate, endDate, itemsPerPage], () => {
  currentPage.value = 1
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredHpbList.value.length / itemsPerPage.value)))

const paginatedHpbList = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return filteredHpbList.value.slice(start, start + itemsPerPage.value)
})

const startIndex = computed(() => filteredHpbList.value.length === 0 ? 0 : (currentPage.value - 1) * itemsPerPage.value + 1)
const endIndex = computed(() => Math.min(currentPage.value * itemsPerPage.value, filteredHpbList.value.length))

const prevPage = () => {
  if (currentPage.value > 1) currentPage.value--
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++
}

// --- DATE SHORTCUTS ---
const applyDateFilter = () => {
  startDate.value = ''
  endDate.value = ''
  if (dateFilterOption.value === 'month') setDateFilter('month')
  else if (dateFilterOption.value === 'last_month') setDateFilter('last_month')
  else if (dateFilterOption.value === 'year') setDateFilter('year')
  else if (dateFilterOption.value === 'range') { /* user enters range manually */ }
}

const setDateFilter = (type) => {
  const now = new Date()
  const formatDate = (d) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  if (type === 'month') {
    startDate.value = formatDate(new Date(now.getFullYear(), now.getMonth(), 1))
    endDate.value = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  } else if (type === 'last_month') {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    startDate.value = formatDate(lastMonth)
    endDate.value = formatDate(new Date(now.getFullYear(), now.getMonth(), 0))
  } else if (type === 'year') {
    startDate.value = formatDate(new Date(now.getFullYear(), 0, 1))
    endDate.value = formatDate(new Date(now.getFullYear(), 11, 31))
  }
}

const resetFilter = () => {
  searchQuery.value = ''
  startDate.value = ''
  endDate.value = ''
  statusFilter.value = 'all'
  dateFilterOption.value = ''
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

const getStatusClasses = (status) => {
  const name = (status || '').toLowerCase()
  if (name.includes('closed') || name.includes('selesai') || name.includes('ditutup')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900'
  }
  if (name.includes('partial') || name.includes('sebagian')) {
    return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900'
  }
  if (name.includes('draft')) {
    return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700'
  }
  return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Permintaan Barang (HPB)
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Daftar dokumen Permintaan Pembelian Barang (HPB) yang diambil dari Accurate Online.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
          Total: <strong class="mx-1 text-slate-900 dark:text-white">{{ filteredHpbList.length }}</strong> dokumen
        </span>
        <Button @click="fetchHpbList" variant="outline" size="sm" class="gap-1.5">
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isLoading }" /> Refresh
        </Button>
      </div>
    </div>

    <!-- Filters -->
    <Card class="border-slate-200 dark:border-slate-800 shadow-sm">
      <CardContent class="p-4 space-y-4">
        <div class="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          <div class="relative flex-1">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Cari Nomor HPB atau Keterangan..."
              class="w-full bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 pl-10 pr-4 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500/60 focus:border-transparent transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
          <select v-model="statusFilter" class="w-full lg:w-48 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500/60 transition-all">
            <option v-for="st in availableStatuses" :key="st.val" :value="st.val">{{ st.label }}</option>
          </select>
          <div class="flex items-center gap-2 w-full lg:w-auto">
            <select v-model="dateFilterOption" @change="applyDateFilter" class="w-full lg:w-44 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500/60 transition-all">
              <option value="">Semua Tanggal</option>
              <option value="month">Bulan Ini</option>
              <option value="last_month">Bulan Lalu</option>
              <option value="year">Tahun Ini</option>
              <option value="range">Range Tanggal</option>
            </select>
            <template v-if="dateFilterOption === 'range'">
              <input v-model="startDate" type="date" class="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg text-xs outline-none focus:ring-2 focus:ring-red-500/60" />
              <span class="text-slate-300 dark:text-slate-600">—</span>
              <input v-model="endDate" type="date" class="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg text-xs outline-none focus:ring-2 focus:ring-red-500/60" />
            </template>
            <button @click="resetFilter" class="px-3 py-2 rounded-lg text-xs font-medium bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors shrink-0">Reset</button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800">
      <Loader2 class="w-8 h-8 animate-spin text-red-600 mb-3" />
      <p class="text-xs font-medium text-slate-500 dark:text-slate-400">Memuat data HPB dari Accurate...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="fetchError" class="p-6 text-center bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/30">
      <AlertCircle class="w-8 h-8 mx-auto mb-3" />
      <h3 class="text-sm font-semibold">Gagal Mengambil Data</h3>
      <p class="text-xs mt-1.5">{{ fetchError }}</p>
      <Button @click="fetchHpbList" variant="outline" size="sm" class="mt-4 border-red-200 hover:bg-red-50 hover:text-red-700 text-xs">Coba Lagi</Button>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredHpbList.length === 0" class="text-center py-16 bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800">
      <FileText class="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
      <p class="text-sm font-medium text-slate-400">Tidak ada dokumen HPB ditemukan</p>
      <p class="text-xs text-slate-500 mt-1">Coba ubah kata kunci atau filter pencarian.</p>
    </div>

    <!-- Table -->
    <div v-else class="bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
      <Table>
        <TableHeader>
          <TableRow class="bg-slate-50 dark:bg-[#0f172a] hover:bg-slate-50 dark:hover:bg-[#0f172a]">
            <TableHead class="text-xs font-medium uppercase tracking-wider text-slate-500 w-12 text-center">No</TableHead>
            <TableHead class="text-xs font-medium uppercase tracking-wider text-slate-500">No. HPB</TableHead>
            <TableHead class="text-xs font-medium uppercase tracking-wider text-slate-500 w-32">Tanggal</TableHead>
            <TableHead class="text-xs font-medium uppercase tracking-wider text-slate-500">Keterangan</TableHead>
            <TableHead class="text-xs font-medium uppercase tracking-wider text-slate-500 w-28 text-center">Status</TableHead>
            <TableHead class="text-xs font-medium uppercase tracking-wider text-slate-500 w-24 text-center">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="(hpb, idx) in paginatedHpbList"
            :key="hpb.id"
            class="group cursor-pointer hover:bg-slate-50 dark:hover:bg-[#0f172a]/50"
            @click="goToDetail(hpb.id)"
          >
            <TableCell class="text-center text-xs font-medium text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">
              {{ (currentPage - 1) * itemsPerPage + idx + 1 }}
            </TableCell>
            <TableCell>
              <span class="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                {{ hpb.number }}
              </span>
            </TableCell>
            <TableCell class="text-xs text-slate-600 dark:text-slate-400">
              <div class="flex items-center gap-1.5">
                <Calendar class="w-3.5 h-3.5 text-slate-400" />
                {{ formatDate(hpb.transDate) }}
              </div>
            </TableCell>
            <TableCell class="text-xs font-medium text-slate-500 dark:text-slate-400 truncate max-w-md">
              {{ hpb.description || '-' }}
            </TableCell>
            <TableCell class="text-center">
              <span class="inline-flex px-2.5 py-1 rounded text-[10px] font-medium border" :class="getStatusClasses(hpb.statusName)">
                {{ hpb.statusName || 'Outstanding' }}
              </span>
            </TableCell>
            <TableCell class="text-center">
              <Button variant="ghost" size="sm" class="text-slate-500 hover:text-slate-900 dark:hover:text-white" @click.stop="goToDetail(hpb.id)">
                <Eye class="w-4 h-4" />
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <!-- Pagination Footer -->
      <div class="flex flex-col sm:flex-row items-center justify-between px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 gap-4 text-xs">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Baris/halaman:</span>
            <select
              v-model.number="itemsPerPage"
              class="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-lg text-xs outline-none focus:ring-2 focus:ring-red-500 dark:text-slate-200 font-medium"
            >
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </div>
          <span class="text-slate-500 dark:text-slate-400 hidden sm:inline">
            Menampilkan <strong class="text-slate-800 dark:text-slate-200">{{ startIndex }} - {{ endIndex }}</strong> dari <strong class="text-slate-800 dark:text-slate-200">{{ filteredHpbList.length }}</strong> dokumen
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
              class="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft class="w-4 h-4"/>
            </button>
            <button
              :disabled="currentPage >= totalPages"
              @click="nextPage"
              class="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
