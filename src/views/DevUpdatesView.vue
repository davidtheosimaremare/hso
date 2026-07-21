<script setup>
import { ref, computed, onMounted } from 'vue'
import { 
  GitCommit, 
  Search, 
  User, 
  Calendar, 
  Hash, 
  Code,
  CheckCircle,
  Copy,
  ChevronLeft,
  ChevronRight,
  ListFilter
} from 'lucide-vue-next'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import commitsData from '@/assets/commits.json'

// --- STATE ---
const activeTab = ref('timeline') // 'timeline' or 'calendar'
const searchQuery = ref('')
const commits = ref(commitsData || [])
const copiedHash = ref(null)

// --- TIMELINE FILTER ---
const filteredCommits = computed(() => {
  if (!searchQuery.value) return commits.value
  const query = searchQuery.value.toLowerCase()
  return commits.value.filter(c => 
    c.message.toLowerCase().includes(query) || 
    c.author.toLowerCase().includes(query) ||
    c.shortHash.toLowerCase().includes(query)
  )
})

// --- CALENDAR LOGIC ---
const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]

const currentMonth = ref(new Date().getMonth())
const currentYear = ref(new Date().getFullYear())
const selectedDateStr = ref(null)

// Group commits by YYYY-MM-DD
const commitsByDate = computed(() => {
  const map = {}
  commits.value.forEach(c => {
    try {
      const dateObj = new Date(c.date)
      if (isNaN(dateObj.getTime())) return
      const yyyy = dateObj.getFullYear()
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0')
      const dd = String(dateObj.getDate()).padStart(2, '0')
      const dateStr = `${yyyy}-${mm}-${dd}`
      if (!map[dateStr]) map[dateStr] = []
      map[dateStr].push(c)
    } catch (e) {}
  })
  return map
})

// Generate calendar cells
const calendarCells = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  
  const firstDayIndex = new Date(year, month, 1).getDay()
  const totalDays = new Date(year, month + 1, 0).getDate()
  const prevMonthTotalDays = new Date(year, month, 0).getDate()
  
  const cells = []
  
  // Previous month padding
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = prevMonthTotalDays - i
    const m = month === 0 ? 11 : month - 1
    const y = month === 0 ? year - 1 : year
    cells.push({
      day: d,
      dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      isCurrentMonth: false
    })
  }
  
  // Current month
  for (let d = 1; d <= totalDays; d++) {
    cells.push({
      day: d,
      dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      isCurrentMonth: true
    })
  }
  
  // Next month padding
  const remainingCells = 42 - cells.length
  for (let d = 1; d <= remainingCells; d++) {
    const m = month === 11 ? 0 : month + 1
    const y = month === 11 ? year + 1 : year
    cells.push({
      day: d,
      dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      isCurrentMonth: false
    })
  }
  
  return cells
})

const prevMonth = () => {
  if (currentMonth.value === 0) {
    currentMonth.value = 11
    currentYear.value--
  } else {
    currentMonth.value--
  }
}

const nextMonth = () => {
  if (currentMonth.value === 11) {
    currentMonth.value = 0
    currentYear.value++
  } else {
    currentMonth.value++
  }
}

// Commits on the selected calendar date
const selectedDayCommits = computed(() => {
  if (!selectedDateStr.value) return []
  return commitsByDate.value[selectedDateStr.value] || []
})

// --- UTILITIES ---
const copyToClipboard = (text, hash) => {
  navigator.clipboard.writeText(text)
  copiedHash.value = hash
  setTimeout(() => {
    copiedHash.value = null
  }, 2000)
}

const formatDate = (dateString) => {
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return dateString
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (e) {
    return dateString
  }
}

const formatSimpleDate = (dateStr) => {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  } catch (e) {
    return dateStr
  }
}

// Auto-select latest commit date on mount
onMounted(() => {
  if (commits.value.length > 0) {
    try {
      const latestDate = new Date(commits.value[0].date)
      const y = latestDate.getFullYear()
      const m = String(latestDate.getMonth() + 1).padStart(2, '0')
      const d = String(latestDate.getDate()).padStart(2, '0')
      selectedDateStr.value = `${y}-${m}-${d}`
      currentMonth.value = latestDate.getMonth()
      currentYear.value = latestDate.getFullYear()
    } catch (e) {}
  }
})
</script>

<template>
  <div class="space-y-6 max-w-6xl mx-auto pb-12">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-slate-800 pb-5">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
          <Code class="w-7 h-7 text-red-600" />
          <span>Development & Update Logs</span>
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Riwayat pembaruan sistem, commit git lokal, dan catatan revisi kode aplikasi HSO Tracker.
        </p>
      </div>

      <!-- Tab Navigation -->
      <div class="flex bg-gray-100 dark:bg-slate-800/80 p-1 rounded-xl border border-gray-200 dark:border-slate-700/50 self-start md:self-auto">
        <button 
          @click="activeTab = 'timeline'"
          :class="activeTab === 'timeline' 
            ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm' 
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          class="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all"
        >
          Timeline View
        </button>
        <button 
          @click="activeTab = 'calendar'"
          :class="activeTab === 'calendar' 
            ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm' 
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          class="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all"
        >
          Calendar View
        </button>
      </div>
    </div>

    <!-- TIMELINE TAB CONTENT -->
    <div v-if="activeTab === 'timeline'" class="space-y-6">
      <!-- Search Bar -->
      <div class="relative w-full max-w-md">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          v-model="searchQuery"
          type="text"
          placeholder="Cari pesan update, author, atau hash..."
          class="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
        />
      </div>

      <!-- Timeline Wrapper -->
      <div class="relative pl-6 md:pl-8 border-l border-gray-200 dark:border-slate-800 space-y-8 mt-4 ml-3">
        <div 
          v-for="commit in filteredCommits" 
          :key="commit.hash"
          class="relative group"
        >
          <!-- Timeline Marker Point -->
          <span class="absolute -left-[31px] md:-left-[39px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-gray-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] group-hover:border-red-500 transition-all duration-300">
            <span class="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-700 group-hover:bg-red-500 transition-all"></span>
          </span>

          <!-- Commit Card -->
          <Card class="bg-white dark:bg-[#1e293b]/70 border border-gray-100 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-all duration-300">
            <CardContent class="p-5">
              <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div class="space-y-2 flex-1">
                  <h3 class="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed break-words font-mono">
                    {{ commit.message }}
                  </h3>
                  <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                    <div class="flex items-center gap-1.5">
                      <User class="w-3.5 h-3.5" />
                      <span class="font-medium">{{ commit.author }}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <Calendar class="w-3.5 h-3.5" />
                      <span>{{ formatDate(commit.date) }}</span>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-2 self-start md:self-auto">
                  <Badge variant="secondary" class="font-mono text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center gap-1">
                    <Hash class="w-3 h-3" />
                    <span>{{ commit.shortHash }}</span>
                  </Badge>
                  
                  <button 
                    @click="copyToClipboard(commit.hash, commit.hash)"
                    title="Salin Full SHA Hash"
                    class="p-1.5 rounded-lg border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-all"
                  >
                    <component 
                      :is="copiedHash === commit.hash ? CheckCircle : Copy" 
                      class="w-3.5 h-3.5" 
                      :class="copiedHash === commit.hash ? 'text-green-600 dark:text-green-400' : ''"
                    />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div v-if="filteredCommits.length === 0" class="py-12 text-center">
          <GitCommit class="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <h3 class="text-sm font-semibold text-slate-900 dark:text-white">Tidak Ada Catatan Update</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Coba sesuaikan kata kunci pencarian Anda.</p>
        </div>
      </div>
    </div>

    <!-- CALENDAR TAB CONTENT -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-12 gap-8">
      
      <!-- Calendar Grid Column -->
      <div class="lg:col-span-7 space-y-4">
        <Card class="bg-white dark:bg-[#1e293b]/70 border border-gray-200/60 dark:border-slate-800/80 shadow-sm">
          <CardContent class="p-6">
            <!-- Calendar Navigation Header -->
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-lg font-bold text-slate-900 dark:text-white">
                {{ monthNames[currentMonth] }} {{ currentYear }}
              </h2>
              
              <div class="flex items-center gap-1">
                <button 
                  @click="prevMonth"
                  class="p-2 rounded-lg border border-gray-200 dark:border-slate-700/80 hover:bg-gray-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all"
                >
                  <ChevronLeft class="w-4 h-4" />
                </button>
                <button 
                  @click="nextMonth"
                  class="p-2 rounded-lg border border-gray-200 dark:border-slate-700/80 hover:bg-gray-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all"
                >
                  <ChevronRight class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Calendar Days Header -->
            <div class="grid grid-cols-7 text-center text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
              <div v-for="day in dayNames" :key="day" class="py-2">
                {{ day }}
              </div>
            </div>

            <!-- Calendar Grid cells -->
            <div class="grid grid-cols-7 gap-1.5">
              <button 
                v-for="cell in calendarCells" 
                :key="cell.dateStr"
                @click="selectedDateStr = cell.dateStr"
                :class="[
                  'aspect-square flex flex-col items-center justify-center p-1 rounded-xl transition-all relative border',
                  cell.isCurrentMonth 
                    ? 'bg-transparent text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600' 
                    : 'bg-slate-50/30 dark:bg-slate-900/10 text-slate-350 dark:text-slate-650 border-transparent opacity-40',
                  selectedDateStr === cell.dateStr 
                    ? 'border-red-600 dark:border-red-500 bg-red-50/20 dark:bg-red-950/20 font-bold ring-2 ring-red-500/20' 
                    : 'border-transparent'
                ]"
              >
                <!-- Day number -->
                <span class="text-sm">{{ cell.day }}</span>
                
                <!-- Commit Indicator Dot -->
                <div 
                  v-if="commitsByDate[cell.dateStr]"
                  class="absolute bottom-2 flex justify-center gap-0.5"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-500 animate-pulse shadow-[0_0_8px_rgba(230,0,0,0.5)]"></span>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Commit Details List Column -->
      <div class="lg:col-span-5 space-y-4">
        <div class="flex items-center gap-2 border-b border-gray-200 dark:border-slate-800 pb-3">
          <ListFilter class="w-5 h-5 text-red-600" />
          <h2 class="text-md font-bold text-slate-950 dark:text-white">
            Update pada {{ formatSimpleDate(selectedDateStr) }}
          </h2>
        </div>

        <div class="space-y-4 max-h-[500px] overflow-y-auto pr-2">
          
          <!-- Commits list for the selected day -->
          <div 
            v-for="commit in selectedDayCommits" 
            :key="commit.hash"
            class="p-4 rounded-xl border border-gray-150 dark:border-slate-800 bg-white dark:bg-[#1e293b]/70 shadow-sm space-y-3 hover:border-red-500/30 transition-all duration-300"
          >
            <h4 class="text-xs font-semibold font-mono text-slate-900 dark:text-white leading-relaxed break-words">
              {{ commit.message }}
            </h4>
            
            <div class="flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400 border-t border-gray-100 dark:border-slate-800 pt-2.5">
              <div class="flex items-center gap-1">
                <User class="w-3 h-3" />
                <span>{{ commit.author }}</span>
              </div>
              
              <div class="flex items-center gap-1.5">
                <span class="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 flex items-center">
                  #{{ commit.shortHash }}
                </span>
                <button 
                  @click="copyToClipboard(commit.hash, commit.hash)"
                  class="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                  title="Salin Full Hash"
                >
                  <component 
                    :is="copiedHash === commit.hash ? CheckCircle : Copy" 
                    class="w-3 h-3 text-slate-500 dark:text-slate-400"
                    :class="copiedHash === commit.hash ? 'text-green-600 dark:text-green-400' : ''"
                  />
                </button>
              </div>
            </div>
          </div>

          <!-- Empty commits state for selected day -->
          <div 
            v-if="selectedDayCommits.length === 0" 
            class="py-16 text-center border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-2xl"
          >
            <GitCommit class="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
            <h4 class="text-xs font-bold text-slate-800 dark:text-slate-400">Tidak ada update pada tanggal ini</h4>
            <p class="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Pilih tanggal yang memiliki indikator lingkaran merah.</p>
          </div>

        </div>
      </div>

    </div>
  </div>
</template>
