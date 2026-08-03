<script setup>
import { onMounted, ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { Loader2, AlertCircle, Search, FileText, Calendar, Eye, Pin, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const router = useRouter()
const isLoading = ref(true)
const hsqList = ref([])
const searchQuery = ref('')
const fetchError = ref(null)

// --- Filter & Date State ---
const startDate = ref('')
const endDate = ref('')
const statusFilter = ref('all')
const activeDateShortcut = ref('')

// Status options dynamically generated from the fetched data
const availableStatuses = computed(() => {
  const statuses = new Set()
  hsqList.value.forEach(hsq => {
    if (hsq.statusName) statuses.add(hsq.statusName)
  })
  
  const statusArray = Array.from(statuses).sort()
  
  return [
    { val: 'all', label: 'Semua Status' },
    ...statusArray.map(s => ({ val: s, label: s }))
  ]
})

// --- FETCH HSQ LIST ---
const fetchHsqList = async () => {
  isLoading.value = true
  fetchError.value = null
  try {
    const { data, error } = await supabase.functions.invoke('accurate-list-sq', {
      body: { fields: 'id,number,transDate,customer,totalAmount,statusName,description,detailItem' }
    })
    
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

// Pinning (temporarily reorder)
const pinned = ref(new Set())
const pinQuote = (hsq) => {
  if (pinned.value.has(hsq.id)) {
    pinned.value.delete(hsq.id)
  } else {
    pinned.value.add(hsq.id)
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
    // apply pin ordering: pinned items first
    if (pinned.value.size) {
      result.sort((a, b) => {
        const aPinned = pinned.value.has(a.id)
        const bPinned = pinned.value.has(b.id)
        if (aPinned && !bPinned) return -1
        if (!aPinned && bPinned) return 1
        return 0
      })
    }

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
const dateFilterOption = ref('')
const applyDateFilter = () => {
  // reset dates first
  startDate.value = ''
  endDate.value = ''
  if (dateFilterOption.value === 'month') setDateFilter('month')
  else if (dateFilterOption.value === 'last_month') setDateFilter('last_month')
  else if (dateFilterOption.value === 'year') setDateFilter('year')
  else if (dateFilterOption.value === 'range') nextTick(() => document.querySelector('input[data-range-start]')?.focus())
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
  activeDateShortcut.value = ''
  currentPage.value = 1
}

const extractProjectName = (hsq) => {
  let text = hsq.description || ''
  if (!text.toLowerCase().includes('pro') && hsq.detailItem && hsq.detailItem.length > 0) {
    text = hsq.detailItem[0].detailNotes || ''
  }
  if (!text) return null
  
  // Match "project" or "proyek", optional colon/dash, then capture everything until ">" or "status" or end of string.
  const regex = /pro(?:ject|yek)\s*[:\-]?\s*(.*?)(?=\s*(?:>|status|$))/i
  const match = text.match(regex)
  if (match && match[1]) {
    return match[1].replace(/[\s\-]+$/, '').trim()
  }
  return null
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

const getStatusVariant = (status) => {
  const name = (status || '').toLowerCase()
  if (name.includes('tolak') || name.includes('batal') || name.includes('gagal')) return 'destructive'
  if (name.includes('terproses') || name.includes('selesai') || name.includes('ditutup')) return 'default'
  if (name.includes('menunggu') || name.includes('diajukan')) return 'secondary'
  if (name.includes('draft') || name.includes('draf')) return 'outline'
  return 'outline'
}

const getStatusClasses = (status) => {
  const variant = getStatusVariant(status)
  if (variant === 'default') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900'
  if (variant === 'secondary') return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-900'
  if (variant === 'destructive') return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900'
  return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900'
}

const getStageBadgeClass = (stage) => {
  if (!stage || stage === 'Prospecting') return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  if (stage.includes('Pitching') || stage.includes('Dikirim')) return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400'
  if (stage.includes('Negosiasi')) return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400'
  if (stage.includes('Won')) return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400'
  if (stage.includes('Lost')) return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400'
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

const getProbabilityBarClass = (prob) => {
  if (prob >= 70) return 'bg-emerald-500'
  if (prob >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Penawaran (HSQ)
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Daftar dokumen Penawaran Penjualan dengan pelacakan progress & probabilitas deal.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
          Total: <strong class="mx-1 text-slate-900 dark:text-white">{{ filteredHsqList.length }}</strong> dokumen
        </span>
        <Button @click="fetchHsqList" variant="outline" size="sm" class="gap-1.5">
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
              placeholder="Cari Nomor HSQ, Customer, atau Keterangan..."
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
              <input v-model="startDate" type="date" data-range-start class="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg text-xs outline-none focus:ring-2 focus:ring-red-500/60" />
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
      <p class="text-xs font-medium text-slate-500 dark:text-slate-400">Memuat data Sales Quotation dari Accurate...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="fetchError" class="p-6 text-center bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/30">
      <AlertCircle class="w-8 h-8 mx-auto mb-3" />
      <h3 class="text-sm font-semibold">Gagal Mengambil Data</h3>
      <p class="text-xs mt-1.5">{{ fetchError }}</p>
      <Button @click="fetchHsqList" variant="outline" size="sm" class="mt-4 border-red-200 hover:bg-red-50 hover:text-red-700 text-xs">Coba Lagi</Button>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredHsqList.length === 0" class="text-center py-16 bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800">
      <FileText class="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
      <p class="text-sm font-medium text-slate-400">Tidak ada dokumen Sales Quotation ditemukan</p>
      <p class="text-xs text-slate-500 mt-1">Coba ubah kata kunci atau filter pencarian.</p>
    </div>

    <!-- Table -->
    <div v-else class="bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
      <Table>
        <TableHeader>
          <TableRow class="bg-slate-50 dark:bg-[#0f172a] hover:bg-slate-50 dark:hover:bg-[#0f172a]">
            <TableHead class="text-xs font-medium uppercase tracking-wider text-slate-500 w-12 text-center">No</TableHead>
            <TableHead class="text-xs font-medium uppercase tracking-wider text-slate-500">No. Quotation</TableHead>
            <TableHead class="text-xs font-medium uppercase tracking-wider text-slate-500 w-32">Tanggal</TableHead>
            <TableHead class="text-xs font-medium uppercase tracking-wider text-slate-500">Customer</TableHead>
            <TableHead class="text-xs font-medium uppercase tracking-wider text-slate-500">Proyek</TableHead>
            <TableHead class="text-xs font-medium uppercase tracking-wider text-slate-500 text-right">Nilai Total</TableHead>
            <TableHead class="text-xs font-medium uppercase tracking-wider text-slate-500 w-44">Progress</TableHead>
            <TableHead class="text-xs font-medium uppercase tracking-wider text-slate-500 w-28 text-center">Status</TableHead>
            <TableHead class="text-xs font-medium uppercase tracking-wider text-slate-500 w-24 text-center">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="(hsq, idx) in paginatedHsqList"
            :key="hsq.id"
            class="group cursor-pointer hover:bg-slate-50 dark:hover:bg-[#0f172a]/50"
            @click="goToDetail(hsq)"
          >
            <TableCell class="text-center text-xs font-medium text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">
              {{ (currentPage - 1) * itemsPerPage + idx + 1 }}
            </TableCell>
            <TableCell>
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                  {{ hsq.number }}
                </span>
                <Badge
                  v-if="getHsqPendingTasks(hsq)"
                  variant="destructive"
                  class="text-[10px] h-5 px-1.5"
                >
                  {{ getHsqPendingTasks(hsq) }} Task
                </Badge>
              </div>
            </TableCell>
            <TableCell class="text-xs text-slate-600 dark:text-slate-400">
              <div class="flex items-center gap-1.5">
                <Calendar class="w-3.5 h-3.5 text-slate-400" />
                {{ formatDate(hsq.transDate) }}
              </div>
            </TableCell>
            <TableCell>
              <div class="text-sm font-medium text-slate-900 dark:text-white">{{ hsq.customer?.name || '-' }}</div>
              <div class="text-[10px] text-slate-400">{{ hsq.customer?.customerNo || '' }}</div>
            </TableCell>
<TableCell>
              <div class="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug">
                {{ extractProjectName(hsq) || '-' }}
              </div>
            </TableCell>
            <TableCell class="text-sm font-semibold text-slate-900 dark:text-white text-right tabular-nums">
              {{ formatCurrency(hsq.totalAmount) }}
            </TableCell>
            <TableCell>
              <div v-if="getHsqProgress(hsq)" class="flex flex-col gap-1.5">
                <div class="flex items-center justify-center gap-1.5">
                  <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-medium" :class="getStageBadgeClass(getHsqProgress(hsq).stage)">
                    {{ getHsqProgress(hsq).stage }}
                  </span>
                  <span v-if="getHsqProgress(hsq).probability !== undefined && getHsqProgress(hsq).probability !== null" class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {{ getHsqProgress(hsq).probability }}%
                  </span>
                </div>
                <div class="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    v-if="getHsqProgress(hsq).probability !== undefined && getHsqProgress(hsq).probability !== null"
                    class="h-full rounded-full transition-all"
                    :class="getProbabilityBarClass(getHsqProgress(hsq).probability)"
                    :style="{ width: getHsqProgress(hsq).probability + '%' }"
                  ></div>
                </div>
              </div>
              <div v-else class="text-xs font-medium text-slate-400 dark:text-slate-600">-</div>
            </TableCell>
            <TableCell class="text-center">
              <Badge variant="outline" :class="getStatusClasses(hsq.statusName)">
                {{ hsq.statusName || 'Outstanding' }}
              </Badge>
            </TableCell>
            <TableCell class="text-center">
              <Button variant="ghost" size="sm" class="text-slate-500 hover:text-slate-900 dark:hover:text-white" @click.stop="goToDetail(hsq)">
                <Eye class="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" :class="pinned.has(hsq.id) ? 'text-red-600' : 'text-slate-500'" class="hover:text-slate-900 dark:hover:text-white" @click.stop="pinQuote(hsq)">
                <Pin class="w-4 h-4" :class="{ 'fill-current': pinned.has(hsq.id) }" />
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
