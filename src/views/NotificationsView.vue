<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Bell, BellOff, Check, CheckCheck, Loader2, ChevronLeft, ChevronRight, 
  Search, ArrowRight, MessageSquare, ClipboardList, ShoppingCart, 
  Megaphone, Clock, ExternalLink, RefreshCw, Filter, Sparkles
} from 'lucide-vue-next'

const router = useRouter()
const isLoading = ref(true)
const notifications = ref([])
const activeCategory = ref('all') // 'all' | 'unread' | 'hso' | 'todo' | 'hpb' | 'marketing'
const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = 12

const readKey = (id) => `notif_read_${id}`

const getModuleMeta = (item) => {
  const path = item.path || ''
  const type = item.type || ''

  if (type === 'HSO_MENTION' || path.startsWith('/sales-orders')) {
    return {
      category: 'hso',
      label: 'Diskusi HSO',
      emoji: '💬',
      badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800'
    }
  }
  if (type.startsWith('TASK') || path.startsWith('/collaborate')) {
    return {
      category: 'todo',
      label: 'TO-DO Task',
      emoji: '🤝',
      badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800'
    }
  }
  if (path.startsWith('/hpb') || path.startsWith('/cart')) {
    return {
      category: 'hpb',
      label: 'Pengadaan HPB',
      emoji: '🛒',
      badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
    }
  }
  if (path.startsWith('/marketing-hub')) {
    return {
      category: 'marketing',
      label: 'Marketing Hub',
      emoji: '📣',
      badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800'
    }
  }
  if (path.startsWith('/hsq')) {
    return {
      category: 'todo',
      label: 'Penawaran',
      emoji: '📑',
      badgeClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
    }
  }
  return {
    category: 'other',
    label: 'Notifikasi',
    emoji: '🔔',
    badgeClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
  }
}

const fetchAll = async () => {
  isLoading.value = true
  try {
    const [boq, mkt, mktIdeas, hpb, task] = await Promise.all([
      supabase.from('boq_requests').select('id, title, status, created_at').order('created_at', { ascending: false }).limit(40),
      supabase.from('marketing_events').select('id, title:name, status, created_at').order('created_at', { ascending: false }).limit(30),
      supabase.from('marketing_ideas').select('id, title, status, created_at').order('created_at', { ascending: false }).limit(30),
      supabase.from('purchase_cart').select('id, title:item_name, created_at').order('created_at', { ascending: false }).limit(30),
      supabase.from('hsq_tasks').select('id, title:task_title, status, created_at').order('created_at', { ascending: false }).limit(30)
    ])

    // Fetch user-specific notifications (mentions, HSO discussions)
    let userNotifs = []
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const currentEmail = user?.email || localStorage.getItem('user_email') || ''
      if (currentEmail) {
        const { data: nData } = await supabase
          .from('notifications')
          .select('*')
          .or(`recipient_email.ilike.${currentEmail},user_email.ilike.${currentEmail}`)
          .order('created_at', { ascending: false })
          .limit(60)

        if (nData) {
          userNotifs = nData.map(n => ({
            id: n.id,
            title: n.title || 'Notifikasi HSO',
            message: n.message || '',
            status: n.message ? (n.message.length > 55 ? n.message.slice(0, 55) + '...' : n.message) : (n.type || 'INFO'),
            type: n.type || 'HSO_MENTION',
            created_at: n.created_at,
            path: n.link || '/sales-orders',
            read: n.is_read || localStorage.getItem(readKey(n.id)) === 'true'
          }))
        }
      }
    } catch (e) {
      console.warn('User notifications fetch note:', e)
    }

    const normalize = (items, path, type = 'TASK') => (items || []).map(i => ({
      id: i.id,
      title: i.title || 'Tanpa Judul',
      message: i.status ? `Status tugas: ${i.status}` : '',
      status: i.status || '-',
      type,
      created_at: i.created_at,
      path,
      read: localStorage.getItem(readKey(i.id)) === 'true'
    }))

    // Filter out event-tagged ideas
    const nonEventIdeas = (mktIdeas.data || []).filter(i =>
      !(i.tags && i.tags.includes && i.tags.includes('EVENT')) &&
      i.platform !== 'event' &&
      !(Array.isArray(i.platforms) && i.platforms.includes('event'))
    )

    notifications.value = [
      ...userNotifs,
      ...normalize(boq.data, '/collaborate', 'TASK'),
      ...normalize(mkt.data, '/marketing-hub', 'MARKETING'),
      ...normalize(nonEventIdeas, '/marketing-hub', 'MARKETING'),
      ...normalize(hpb.data, '/hpb', 'HPB'),
      ...normalize(task.data, '/hsq', 'TASK')
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  } catch (err) {
    console.warn('Notifications fetch error:', err)
  } finally {
    isLoading.value = false
  }
}

// Counts computed
const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)
const hsoCount = computed(() => notifications.value.filter(n => getModuleMeta(n).category === 'hso').length)
const todoCount = computed(() => notifications.value.filter(n => getModuleMeta(n).category === 'todo').length)
const hpbCount = computed(() => notifications.value.filter(n => getModuleMeta(n).category === 'hpb').length)
const marketingCount = computed(() => notifications.value.filter(n => getModuleMeta(n).category === 'marketing').length)

// Filtered notifications
const filteredNotifs = computed(() => {
  let list = notifications.value

  // Category filter
  if (activeCategory.value === 'unread') {
    list = list.filter(n => !n.read)
  } else if (activeCategory.value !== 'all') {
    list = list.filter(n => getModuleMeta(n).category === activeCategory.value)
  }

  // Search filter
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(n => {
      return (n.title || '').toLowerCase().includes(q) ||
        (n.message || '').toLowerCase().includes(q) ||
        (n.status || '').toLowerCase().includes(q) ||
        (n.path || '').toLowerCase().includes(q)
    })
  }

  return list
})

// Pagination
const totalPages = computed(() => Math.max(1, Math.ceil(filteredNotifs.value.length / pageSize)))
const pagedNotifs = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredNotifs.value.slice(start, start + pageSize)
})

const pageRange = computed(() => {
  const total = totalPages.value
  const cur = currentPage.value
  const delta = 2
  const range = []
  const left = Math.max(2, cur - delta)
  const right = Math.min(total - 1, cur + delta)
  range.push(1)
  if (left > 2) range.push('...')
  for (let i = left; i <= right; i++) range.push(i)
  if (right < total - 1) range.push('...')
  if (total > 1) range.push(total)
  return range
})

const goToPage = (p) => {
  if (p === '...') return
  currentPage.value = Math.min(Math.max(1, p), totalPages.value)
}

const markRead = async (n) => {
  if (n.read) return
  n.read = true
  try { localStorage.setItem(readKey(n.id), 'true') } catch {}
  try {
    if (n.id) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
    }
  } catch (e) {}
}

const markAllRead = async () => {
  notifications.value.forEach(n => {
    n.read = true
    try { localStorage.setItem(readKey(n.id), 'true') } catch {}
  })
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const currentEmail = user?.email || localStorage.getItem('user_email') || ''
    if (currentEmail) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .or(`recipient_email.ilike.${currentEmail},user_email.ilike.${currentEmail}`)
        .eq('is_read', false)
    }
  } catch (e) {}
}

const goTo = (n) => {
  markRead(n)
  if (n.path) {
    router.push(n.path)
  }
}

const formatTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = (now - d) / 1000
  if (diff < 60) return 'Baru saja'
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

let notifChannel = null

onMounted(() => {
  fetchAll()
  // Realtime: refresh notification list when any source table changes
  notifChannel = supabase
    .channel('realtime_notifications_page')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => fetchAll())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hso_discussions' }, () => fetchAll())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'boq_requests' }, () => fetchAll())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'marketing_ideas' }, () => fetchAll())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'marketing_events' }, () => fetchAll())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'purchase_cart' }, () => fetchAll())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hsq_tasks' }, () => fetchAll())
    .subscribe()
})

onUnmounted(() => {
  if (notifChannel) supabase.removeChannel(notifChannel)
})
</script>

<template>
  <div class="space-y-6 max-w-6xl mx-auto">
    <!-- Header Section -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-200 dark:border-slate-800">
      <div class="flex items-center gap-3.5">
        <div class="relative w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50 flex items-center justify-center shadow-sm">
          <Bell class="w-6 h-6" :class="{ 'animate-bounce': unreadCount > 0 }" />
          <span 
            v-if="unreadCount > 0" 
            class="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 bg-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-white dark:ring-slate-900 shadow-sm"
          >
            {{ unreadCount }}
          </span>
        </div>
        <div>
          <h1 class="text-xl md:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            Pusat Notifikasi & Aktivitas
          </h1>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-2">
            <span>{{ unreadCount }} pesan belum dibaca</span>
            <span>•</span>
            <span>{{ notifications.length }} total aktivitas terekam</span>
          </p>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2 self-start sm:self-auto">
        <Button 
          variant="outline" 
          size="sm" 
          @click="fetchAll" 
          :disabled="isLoading" 
          class="gap-1.5 text-xs h-9 border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-800"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isLoading }" />
          <span>Segarkan</span>
        </Button>
        <Button 
          v-if="unreadCount > 0" 
          size="sm" 
          @click="markAllRead" 
          class="gap-1.5 text-xs h-9 bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
        >
          <CheckCheck class="w-3.5 h-3.5" />
          <span>Tandai Semua Dibaca</span>
        </Button>
      </div>
    </div>

    <!-- Filter Pills & Search Bar -->
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm">
      <!-- Tabs -->
      <div class="flex flex-wrap items-center gap-1.5">
        <button 
          @click="activeCategory = 'all'; currentPage = 1"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
          :class="activeCategory === 'all' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
        >
          <span>Semua</span>
          <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200/50 dark:bg-slate-700 font-bold">
            {{ notifications.length }}
          </span>
        </button>

        <button 
          @click="activeCategory = 'unread'; currentPage = 1"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
          :class="activeCategory === 'unread' ? 'bg-rose-600 text-white shadow-sm' : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'"
        >
          <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse" v-if="unreadCount > 0"></span>
          <span>Belum Dibaca</span>
          <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300 font-bold">
            {{ unreadCount }}
          </span>
        </button>

        <button 
          @click="activeCategory = 'hso'; currentPage = 1"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
          :class="activeCategory === 'hso' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
        >
          <span>💬 Diskusi HSO</span>
          <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200/50 dark:bg-slate-700 font-bold">
            {{ hsoCount }}
          </span>
        </button>

        <button 
          @click="activeCategory = 'todo'; currentPage = 1"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
          :class="activeCategory === 'todo' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
        >
          <span>🤝 TO-DO & BOQ</span>
          <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200/50 dark:bg-slate-700 font-bold">
            {{ todoCount }}
          </span>
        </button>

        <button 
          @click="activeCategory = 'hpb'; currentPage = 1"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
          :class="activeCategory === 'hpb' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
        >
          <span>🛒 HPB</span>
          <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200/50 dark:bg-slate-700 font-bold">
            {{ hpbCount }}
          </span>
        </button>

        <button 
          @click="activeCategory = 'marketing'; currentPage = 1"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
          :class="activeCategory === 'marketing' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
        >
          <span>📣 Marketing</span>
          <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200/50 dark:bg-slate-700 font-bold">
            {{ marketingCount }}
          </span>
        </button>
      </div>

      <!-- Search Input -->
      <div class="relative w-full md:w-64">
        <Search class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input 
          v-model="searchQuery" 
          placeholder="Cari notifikasi, pesan, HSO..." 
          class="pl-8 text-xs h-8 dark:bg-slate-800 dark:border-slate-700"
        />
      </div>
    </div>

    <!-- Notifications List Content -->
    <div>
      <!-- Loading State -->
      <div v-if="isLoading" class="py-20 text-center bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800">
        <Loader2 class="w-8 h-8 mx-auto text-rose-500 animate-spin mb-3" />
        <p class="text-sm font-semibold text-slate-700 dark:text-slate-300">Menyinkronkan notifikasi realtime...</p>
        <p class="text-xs text-slate-400 mt-1">Mengambil mention HSO, tugas TO-DO, dan update sistem.</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredNotifs.length === 0" class="py-20 text-center bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800">
        <div class="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/30 text-rose-500 mx-auto flex items-center justify-center mb-3">
          <BellOff class="w-8 h-8" />
        </div>
        <h3 class="text-base font-bold text-slate-800 dark:text-slate-200">Tidak ada notifikasi ditemukan</h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
          {{ searchQuery ? `Tidak ada notifikasi yang cocok dengan kata kunci "${searchQuery}".` : 'Anda sudah up-to-date dengan semua bahasan dan tugas terbaru 🎉' }}
        </p>
      </div>

      <!-- Cards Grid / List -->
      <div v-else class="space-y-3">
        <div
          v-for="notif in pagedNotifs"
          :key="notif.id"
          class="group relative bg-white dark:bg-slate-900 rounded-xl p-4 border transition-all duration-200 shadow-sm hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          :class="!notif.read ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10 border-l-4 border-l-rose-500' : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700'"
        >
          <!-- Left Content -->
          <div class="flex items-start gap-3.5 flex-1 min-w-0">
            <!-- Icon Avatar -->
            <div 
              class="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 mt-0.5 transition-transform group-hover:scale-105"
              :class="!notif.read ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 ring-2 ring-rose-300 dark:ring-rose-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
            >
              {{ getModuleMeta(notif).emoji }}
            </div>

            <!-- Texts -->
            <div class="flex-1 min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <span 
                  class="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                  :class="getModuleMeta(notif).badgeClass"
                >
                  {{ getModuleMeta(notif).label }}
                </span>
                
                <span v-if="!notif.read" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                  Baru
                </span>

                <span class="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1 ml-auto sm:ml-0">
                  <Clock class="w-3 h-3" />
                  {{ formatTime(notif.created_at) }}
                </span>
              </div>

              <!-- Title -->
              <h3 
                @click="goTo(notif)"
                class="text-sm font-bold text-slate-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {{ notif.title }}
              </h3>

              <!-- Message Body -->
              <p 
                v-if="notif.message" 
                class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words"
              >
                {{ notif.message }}
              </p>
            </div>
          </div>

          <!-- Right Action Buttons -->
          <div class="flex items-center gap-2 self-end sm:self-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-slate-800 w-full sm:w-auto justify-end">
            <button
              v-if="!notif.read"
              @click="markRead(notif)"
              class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
              title="Tandai Sudah Dibaca"
            >
              <Check class="w-3.5 h-3.5" />
              <span class="hidden md:inline">Dibaca</span>
            </button>

            <Button
              size="sm"
              @click="goTo(notif)"
              class="gap-1.5 text-xs h-8 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white shadow-sm"
            >
              <span>Buka Detail</span>
              <ArrowRight class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm mt-4">
        <p class="text-xs text-slate-500 dark:text-slate-400">
          Halaman <span class="font-bold text-slate-800 dark:text-slate-200">{{ currentPage }}</span> dari {{ totalPages }}
          · {{ filteredNotifs.length }} notifikasi
        </p>

        <div class="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            :disabled="currentPage === 1"
            @click="currentPage--"
            class="h-8 w-8 p-0"
          >
            <ChevronLeft class="w-4 h-4" />
          </Button>

          <template v-for="(p, idx) in pageRange" :key="idx">
            <span v-if="p === '...'" class="px-2 text-slate-400 text-xs">…</span>
            <Button
              v-else
              :variant="currentPage === p ? 'default' : 'outline'"
              size="sm"
              @click="goToPage(p)"
              class="h-8 min-w-[2rem] px-2 text-xs"
            >
              {{ p }}
            </Button>
          </template>

          <Button
            variant="outline"
            size="sm"
            :disabled="currentPage === totalPages"
            @click="currentPage++"
            class="h-8 w-8 p-0"
          >
            <ChevronRight class="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
