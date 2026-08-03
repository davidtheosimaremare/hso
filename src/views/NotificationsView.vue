<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Bell, BellOff, Check, Inbox, Loader2, ChevronLeft, ChevronRight } from 'lucide-vue-next'

const router = useRouter()
const isLoading = ref(true)
const notifications = ref([])
const currentPage = ref(1)
const pageSize = 10

const readKey = (id) => `notif_read_${id}`

const moduleMeta = {
  '/permintaan':   { label: 'Permintaan',  emoji: '📋', variant: 'secondary' },
  '/marketing-hub':{ label: 'Marketing',   emoji: '📣', variant: 'secondary' },
  '/hpb':          { label: 'HPB',         emoji: '🛒', variant: 'secondary' },
  '/hsq':          { label: 'Penawaran',   emoji: '📑', variant: 'secondary' }
}

const fetchAll = async () => {
  isLoading.value = true
  try {
    const [boq, mkt, hpb, task] = await Promise.all([
      supabase.from('boq_requests').select('id, title, status, created_at').order('created_at', { ascending: false }).limit(50),
      supabase.from('marketing_events').select('id, title, status, created_at').order('created_at', { ascending: false }).limit(50),
      supabase.from('purchase_cart').select('id, title, status, created_at').order('created_at', { ascending: false }).limit(50),
      supabase.from('hsq_tasks').select('id, task_title as title, status, created_at').order('created_at', { ascending: false }).limit(50)
    ])

    const normalize = (items, path) => (items || []).map(i => ({
      id: i.id,
      title: i.title || 'Tanpa Judul',
      status: i.status || '-',
      created_at: i.created_at,
      path,
      read: localStorage.getItem(readKey(i.id)) === 'true'
    }))

    notifications.value = [
      ...normalize(boq.data, '/permintaan'),
      ...normalize(mkt.data, '/marketing-hub'),
      ...normalize(hpb.data, '/hpb'),
      ...normalize(task.data, '/hsq')
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  } catch (err) {
    console.warn('Notifications fetch error:', err)
  } finally {
    isLoading.value = false
  }
}

const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)

const totalPages = computed(() => Math.max(1, Math.ceil(notifications.value.length / pageSize)))
const pagedNotifs = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return notifications.value.slice(start, start + pageSize)
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

const markRead = (n) => {
  if (n.read) return
  n.read = true
  try { localStorage.setItem(readKey(n.id), 'true') } catch {}
}

const markAllRead = () => {
  notifications.value.forEach(n => {
    n.read = true
    try { localStorage.setItem(readKey(n.id), 'true') } catch {}
  })
}

const goTo = (n) => {
  markRead(n)
  router.push(n.path)
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

onMounted(fetchAll)
</script>

<template>
  <div class="space-y-4">
    <!-- Page Header -->
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
          <Bell class="w-5 h-5 text-red-500" />
        </div>
        <div>
          <h1 class="text-lg font-bold text-slate-900 dark:text-white leading-tight">Notifikasi</h1>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            {{ unreadCount }} belum dibaca · {{ notifications.length }} total
          </p>
        </div>
      </div>

      <Button
        v-if="unreadCount > 0"
        variant="outline"
        size="sm"
        @click="markAllRead"
        class="gap-2"
      >
        <Check class="w-4 h-4" />
        Tandai semua dibaca
      </Button>
    </div>

    <!-- Notif Card -->
    <Card class="border-slate-200 dark:border-slate-800 shadow-sm">
      <CardContent class="p-0">
        <!-- Loading -->
        <div v-if="isLoading" class="py-16 text-center">
          <Loader2 class="w-6 h-6 mx-auto text-red-400 animate-spin mb-2" />
          <p class="text-xs text-slate-500">Memuat notifikasi...</p>
        </div>

        <!-- Empty -->
        <div v-else-if="notifications.length === 0" class="py-16 text-center">
          <div class="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 mx-auto flex items-center justify-center mb-2">
            <BellOff class="w-5 h-5 text-slate-400" />
          </div>
          <p class="text-sm font-semibold text-slate-700 dark:text-slate-300">Tidak ada notifikasi</p>
          <p class="text-[11px] text-slate-500 mt-0.5">Anda sudah update dengan semua aktivitas terbaru 🎉</p>
        </div>

        <!-- List -->
        <template v-else>
          <ul class="divide-y divide-slate-100 dark:divide-slate-800">
            <li
              v-for="notif in pagedNotifs"
              :key="notif.id"
              @click="goTo(notif)"
              class="group flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
              :class="{ 'bg-red-50/40 dark:bg-red-950/10': !notif.read }"
            >
              <!-- Icon -->
              <div
                class="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-base shrink-0 group-hover:scale-105 transition-transform"
                :class="{ 'ring-2 ring-red-500/40': !notif.read }"
              >
                {{ moduleMeta[notif.path]?.emoji || '🔔' }}
              </div>

              <!-- Body -->
              <div class="flex-1 min-w-0 flex items-center gap-3">
                <p class="text-sm font-semibold text-slate-900 dark:text-white truncate min-w-0">
                  {{ notif.title }}
                </p>
                <Badge variant="secondary" class="text-[10px] h-5 shrink-0 hidden sm:inline-flex">
                  {{ moduleMeta[notif.path]?.label || 'Umum' }}
                </Badge>
                <span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0 hidden md:inline-flex">
                  {{ notif.status }}
                </span>
              </div>

              <!-- Right: time + indicator -->
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">{{ formatTime(notif.created_at) }}</span>
                <div v-if="!notif.read" class="w-2 h-2 rounded-full bg-red-500"></div>
                <Inbox v-else class="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
              </div>
            </li>
          </ul>

          <!-- Pagination -->
          <Separator v-if="totalPages > 1" />
          <div v-if="totalPages > 1" class="flex items-center justify-between px-4 py-3">
            <p class="text-[11px] text-slate-500 dark:text-slate-400">
              Halaman <span class="font-bold text-slate-700 dark:text-slate-200">{{ currentPage }}</span> dari {{ totalPages }}
              · {{ notifications.length }} notifikasi
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
        </template>
      </CardContent>
    </Card>
  </div>
</template>
