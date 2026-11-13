
<script setup>
import { onMounted, ref, watch, computed, provide, KeepAlive } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAccurateSync } from '@/composables/useAccurateSync'
import { 
  LayoutDashboard, 
  FileText, 
  Settings, 
  LogOut, 
  Moon, 
  Sun,
  User,
  Bell,
  Search,
  X,
  Megaphone,
  ShoppingCart,
  Truck,
  UploadCloud,
  Menu,
  Database,
  RefreshCcw,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Code,
  ClipboardList,
  Wrench,
  Building2,
  ArrowRightLeft,
  ArrowRight,
  Boxes,
  BadgePercent
} from 'lucide-vue-next'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet'
import AccurateSyncWidget from '@/components/AccurateSyncWidget.vue'

const route = useRoute()
const router = useRouter()
const userEmail = ref('Memuat...')
const isDarkMode = ref(false)
const userRole = ref('STAFF')
const allowedModules = ref([])

// Provide roles & permissions to child components reactively
provide('userRole', userRole)
provide('allowedModules', allowedModules)

const isPembelianOpen = ref(route.path.startsWith('/cart') || route.path.startsWith('/hpb') || route.path.startsWith('/purchase-orders'))
const isLogistikOpen = ref(route.path.startsWith('/logistics-db') || route.path.startsWith('/delivery-orders') || route.path.startsWith('/receive-items'))
const isSettingOpen = ref(route.path.startsWith('/settings') || route.path.startsWith('/weekly-task-recap'))
const isSyncWidgetOpen = ref(false)
const { isSyncing } = useAccurateSync()

// Purchase cart item count badge (sidebar)
const cartItemCount = ref(0)
const fetchCartItemCount = async () => {
  try {
    const { count, error } = await supabase
      .from('purchase_cart')
      .select('id', { count: 'exact', head: true })
    if (error) throw error
    cartItemCount.value = count || 0
  } catch (err) {
    console.warn('Failed to fetch cart count:', err.message)
    cartItemCount.value = 0
  }
}

watch(() => route.path, (newPath) => {
  if (newPath.startsWith('/cart') || newPath.startsWith('/hpb') || newPath.startsWith('/purchase-orders')) {
    isPembelianOpen.value = true
  }
  if (newPath.startsWith('/logistics-db') || newPath.startsWith('/delivery-orders') || newPath.startsWith('/receive-items')) {
    isLogistikOpen.value = true
  }
  if (newPath.startsWith('/settings') || newPath.startsWith('/weekly-task-recap')) {
    isSettingOpen.value = true
  }
})

// --- 1. Dark Mode Logic ---
const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value
  if (isDarkMode.value) {
    document.documentElement.classList.add('dark')
    localStorage.setItem('theme', 'dark')
  } else {
    document.documentElement.classList.remove('dark')
    localStorage.setItem('theme', 'light')
  }
}

// Single IP-Based Device Session Modal State
const showSessionModal = ref(false)
const sessionModalInfo = ref({ newIp: "", time: "" })

const triggerSessionModal = (ip) => {
  sessionModalInfo.value = {
    newIp: ip || "Jaringan/IP Lain",
    time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
  }
  showSessionModal.value = true
}

const handleSessionLogout = async () => {
  showSessionModal.value = false
  localStorage.removeItem("hir_active_session_id")
  await supabase.auth.signOut()
  router.push("/")
}

// Single IP-Based Device Session Verification
const checkSingleDeviceSession = async (email) => {
  const localSessionId = localStorage.getItem('hir_active_session_id')
  if (!email) return

  try {
    const { data, error } = await supabase
      .from('user_access')
      .select('active_session_id, last_login_ip')
      .eq('email', email)
      .maybeSingle()

    if (error || !data) return

    const localIp = localStorage.getItem('hir_client_ip') || ''

    // Only kick out session if login comes from a DIFFERENT IP address!
    if (data.last_login_ip && localIp && data.last_login_ip !== localIp) {
      triggerSessionModal(data.last_login_ip)
      localStorage.removeItem('hir_active_session_id')
      await supabase.auth.signOut()
      router.push('/')
    } else {
      // Same IP -> update local session id seamlessly so user is never logged out on the same network
      if (data.active_session_id) {
        localStorage.setItem('hir_active_session_id', data.active_session_id)
      }
    }
  } catch (err) {
    console.warn('Session verification notice:', err)
  }
}

// Init Theme & User & Permissions
onMounted(async () => {
  // Check User
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    userEmail.value = user.email

    // Enforce Single IP Active Session
    await checkSingleDeviceSession(user.email)
    
    // Realtime listener for session overrides from other IP addresses
    supabase
      .channel(`single_device_${user.email}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_access',
          filter: `email=eq.${user.email}`
        },
        (payload) => {
          const localIp = localStorage.getItem('hir_client_ip') || ''
          const newIp = payload.new?.last_login_ip
          if (newIp && localIp && newIp !== localIp) {
            triggerSessionModal(newIp)
            localStorage.removeItem('hir_active_session_id')
            supabase.auth.signOut()
            router.push('/')
          } else if (payload.new?.active_session_id) {
            localStorage.setItem('hir_active_session_id', payload.new.active_session_id)
          }
        }
      )
      .subscribe()

    // Periodic heartbeat check every 30s
    setInterval(() => checkSingleDeviceSession(userEmail.value), 30000)

    try {
      const { data } = await supabase
        .from('user_access')
        .select('role, allowed_modules')
        .eq('email', user.email)
        .maybeSingle()

      if (data) {
        userRole.value = data.role || 'STAFF'
        allowedModules.value = data.allowed_modules || ['dashboard:read']
      } else {
        userRole.value = 'ADMIN'
        allowedModules.value = [
          'dashboard:read', 'dashboard:write',
          'sales-orders:read', 'sales-orders:write',
          'hsq:read', 'hsq:write',
          'cart:read', 'cart:write',
          'purchase-orders:read', 'purchase-orders:write',
          'receive-items:read', 'receive-items:write',
          'delivery-orders:read', 'delivery-orders:write',
          'logistics-db:read', 'logistics-db:write',
          'sop-guide:read', 'sop-guide:write',
          'database-mapping:read', 'database-mapping:write',
          'settings:read', 'settings:write'
        ]
      }
    } catch (err) {
      console.error('Error fetching permissions:', err)
      userRole.value = 'STAFF'
      allowedModules.value = ['dashboard:read']
    }
  }

  // Check Theme Preference
  const savedTheme = localStorage.getItem('theme')
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  
  if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
    isDarkMode.value = true
    document.documentElement.classList.add('dark')
  }

  // Fetch cart count badge & keep it in sync (items added from SO Detail)
  fetchCartItemCount()
  supabase
    .channel('realtime_cart_count')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'purchase_cart' },
      () => {
        fetchCartItemCount()
      }
    )
    .subscribe()

  // Fetch initial notifications & listen for new Permintaan tasks in Realtime
  fetchNotifications()
  supabase
    .channel('realtime_boq_notifications')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'boq_requests' },
      () => {
        fetchNotifications()
      }
    )
    .subscribe()

  // Realtime refresh for marketing ideas & events
  supabase
    .channel('realtime_marketing_notifications')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'marketing_ideas' },
      () => {
        fetchNotifications()
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'marketing_events' },
      () => {
        fetchNotifications()
      }
    )
    .subscribe()

  // Realtime refresh for user mentions, HSO discussions, and notifications
  supabase
    .channel('realtime_hso_team_notifications')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      (payload) => {
        fetchNotifications()
        if (payload?.new) {
          const currentEmail = (userEmail.value || localStorage.getItem('user_email') || '').toLowerCase().trim()
          const target = (payload.new.recipient_email || payload.new.user_email || '').toLowerCase().trim()
          if (currentEmail && target === currentEmail) {
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                const n = new Notification(payload.new.title || 'Mention Baru di HSO', {
                  body: payload.new.message || 'Anda ditandai dalam sebuah diskusi.',
                  icon: '/favicon.ico'
                })
                n.onclick = () => {
                  window.focus()
                  if (payload.new.link) router.push(payload.new.link)
                }
              } catch (e) {}
            }
          }
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'hso_discussions' },
      () => {
        fetchNotifications()
      }
    )
    .subscribe()

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {})
  }
})

const menuGroups = [
  {
    type: 'category',
    name: 'Overview',
    items: [
      { type: 'item', name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, moduleKey: 'dashboard' },
      { type: 'item', name: 'TO-DO', path: '/collaborate', icon: ClipboardList, moduleKey: 'permintaan' },
      { type: 'item', name: 'Notifikasi', path: '/notifications', icon: Bell, moduleKey: 'dashboard' }
    ]
  },
  {
    type: 'category',
    name: 'Sales',
    items: [
      { type: 'item', name: 'Penawaran', path: '/hsq', icon: FileText, moduleKey: 'hsq' },
      { type: 'item', name: 'Penjualan', path: '/sales-orders', icon: FileText, moduleKey: 'sales-orders' },
      { type: 'item', name: 'Database Leads', path: '/sales-leads', icon: Building2, moduleKey: 'hsq' },
      { type: 'item', name: 'Marketing Hub', path: '/marketing-hub', icon: Megaphone, moduleKey: 'marketing-hub' },
      { type: 'item', name: 'Penyesuaian Harga', path: '/penyesuaian-harga', icon: BadgePercent, moduleKey: 'hsq' }
    ]
  },
  {
    type: 'category',
    name: 'Tools',
    items: [
      { type: 'item', name: 'Alokasi Produk', path: '/tools/product-tracker', icon: Boxes, moduleKey: 'hsq' },
      { type: 'item', name: 'Component Converter', path: '/tools/converter', icon: ArrowRightLeft, moduleKey: 'hsq' }
    ]
  },
  {
    type: 'category',
    name: 'Pembelian',
    items: [
      {
        type: 'group',
        name: 'Pembelian',
        icon: ShoppingCart,
        isOpen: isPembelianOpen,
        children: [
          { name: 'Perencanaan (Keranjang)', path: '/cart', moduleKey: 'cart' },
          { name: 'HPB', path: '/hpb', moduleKey: 'cart' },
          { name: 'Purchase Order', path: '/purchase-orders', moduleKey: 'purchase-orders' }
        ]
      }
    ]
  },
  {
    type: 'category',
    name: 'Logistik',
    items: [
      {
        type: 'group',
        name: 'Logistik',
        icon: Truck,
        isOpen: isLogistikOpen,
        children: [
          { name: 'Database Logistik', path: '/logistics-db', moduleKey: 'logistics-db' },
          { name: 'Pengiriman', path: '/delivery-orders', moduleKey: 'delivery-orders' },
          { name: 'Penerimaan Barang', path: '/receive-items', moduleKey: 'receive-items' }
        ]
      }
    ]
  },
  {
    type: 'category',
    name: 'Resources',
    items: [
      { type: 'item', name: 'SOP & Panduan', path: '/sop-guide', icon: BookOpen, moduleKey: 'sop-guide' }
    ]
  },
  {
    type: 'category',
    name: 'System',
    items: [
      {
        type: 'group',
        name: 'Setting',
        icon: Settings,
        isOpen: isSettingOpen,
        children: [
          { name: 'Manage Account', path: '/settings', moduleKey: 'settings' },
          { name: 'Rekapan Mingguan HSO', path: '/weekly-task-recap', moduleKey: 'settings' }
        ]
      },
      { type: 'item', name: 'Development', path: '/development', icon: Code, moduleKey: 'settings' }
    ]
  }
]

const filteredMenuGroups = computed(() => {
  return menuGroups.map(category => {
    const items = category.items.map(item => {
      if (item.type === 'item') {
        const isAllowed = userRole.value === 'ADMIN' || 
          allowedModules.value.includes(`${item.moduleKey}:read`)
        return isAllowed ? item : null
      } else {
        const allowedChildren = item.children.filter(child => {
          return userRole.value === 'ADMIN' || allowedModules.value.includes(`${child.moduleKey}:read`)
        })
        if (allowedChildren.length > 0) {
          return { ...item, children: allowedChildren }
        }
        return null
      }
    }).filter(Boolean)
    return items.length > 0 ? { ...category, items } : null
  }).filter(Boolean)
})

const handleLogout = async () => {
  await supabase.auth.signOut()
  router.push('/')
}

// --- Global Search ---
const globalSearch = ref('')
const isSearchFocused = ref(false)
const isSearchLoading = ref(false)
const searchResults = ref({ hsq: [], hso: [], permintaan: [] })
let searchDebounceTimer = null

const doGlobalSearch = async (query) => {
  if (!query || query.trim().length < 2) {
    searchResults.value = { hsq: [], hso: [], permintaan: [] }
    isSearchLoading.value = false
    return
  }
  isSearchLoading.value = true
  const q = query.trim().toLowerCase()
  try {
    // Search HSQ (Sales Quotation) from Accurate
    const hsqRes = await supabase.functions.invoke('accurate-list-sq', {
      body: { fields: 'id,number,transDate,customer,totalAmount,statusName,description' }
    })
    const hsqAll = hsqRes.data?.d || []
    searchResults.value.hsq = hsqAll.filter(h =>
      (h.number || '').toLowerCase().includes(q) ||
      (h.customer?.name || '').toLowerCase().includes(q) ||
      (h.description || '').toLowerCase().includes(q)
    ).slice(0, 4)

    // Search HSO (Sales Order) from Accurate
    const hsoRes = await supabase.functions.invoke('accurate-list-so', {
      body: { fields: 'id,number,transDate,customer,totalAmount,statusName' }
    })
    const hsoAll = hsoRes.data?.d || []
    searchResults.value.hso = hsoAll.filter(h =>
      (h.number || '').toLowerCase().includes(q) ||
      (h.customer?.name || '').toLowerCase().includes(q)
    ).slice(0, 4)

    // Search Permintaan from Supabase
    const { data: permData } = await supabase
      .from('permintaan')
      .select('id, title, status, created_by, delegated_to')
      .or(`title.ilike.%${query.trim()}%,created_by.ilike.%${query.trim()}%`)
      .limit(4)
    searchResults.value.permintaan = permData || []
  } catch (e) {
    console.error('Global search error:', e)
  } finally {
    isSearchLoading.value = false
  }
}

const onSearchInput = () => {
  clearTimeout(searchDebounceTimer)
  if (!globalSearch.value.trim()) {
    searchResults.value = { hsq: [], hso: [], permintaan: [] }
    return
  }
  searchDebounceTimer = setTimeout(() => doGlobalSearch(globalSearch.value), 400)
}

const hasSearchResults = computed(() =>
  searchResults.value.hsq.length > 0 ||
  searchResults.value.hso.length > 0 ||
  searchResults.value.permintaan.length > 0
)

const navigateResult = (path) => {
  router.push(path)
  globalSearch.value = ''
  isSearchFocused.value = false
  searchResults.value = { hsq: [], hso: [], permintaan: [] }
}

const handleSearchEnter = () => {
  if (!globalSearch.value.trim()) return
  router.push({ path: '/hsq', query: { q: globalSearch.value.trim() } })
  globalSearch.value = ''
  isSearchFocused.value = false
  searchResults.value = { hsq: [], hso: [], permintaan: [] }
}

// Close all dropdowns on escape / outside click
const closeAllDropdowns = (e) => {
  // Only close if click is outside any dropdown trigger
  isNotifOpen.value = false
  isProfileOpen.value = false
}

// --- Notifications ---
const isNotifOpen = ref(false)
const notifications = ref([])
const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)

const fetchNotifications = async () => {
  try {
    // Fetch BOQ requests
    const { data: boqData, error: boqError } = await supabase
      .from('boq_requests')
      .select('id, title, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10)

    // Fetch marketing events
    const { data: marketingData, error: marketingError } = await supabase
      .from('marketing_events')
      .select('id, title:name, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5)

    // Fetch marketing ideas (digital posts/ideas)
    const { data: marketingIdeasData, error: marketingIdeasError } = await supabase
      .from('marketing_ideas')
      .select('id, title, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10)

    // Fetch HPB proposals (from purchase_cart as placeholder)
    const { data: hpbData, error: hpbError } = await supabase
      .from('purchase_cart')
      .select('id, title:item_name, created_at')
      .order('created_at', { ascending: false })
      .limit(5)

    // Fetch sales tasks (hsq_tasks) – map to related HSQ number for route
    const { data: taskData, error: taskError } = await supabase
      .from('hsq_tasks')
      .select('id, title:task_title, status, created_at, hsq_number')
      .order('created_at', { ascending: false })
      .limit(5)

    // Log any fetch errors (but continue with available data)
    if (boqError) console.warn('Notif BOQ error:', boqError.message)
    if (marketingError) console.warn('Notif marketing error:', marketingError.message)
    if (marketingIdeasError) console.warn('Notif marketing ideas error:', marketingIdeasError.message)
    if (hpbError) console.warn('Notif HPB error:', hpbError.message)
    if (taskError) console.warn('Notif task error:', taskError.message)

    // Filter out event-tagged ideas from marketing_ideas (they belong to event tab)
    const nonEventIdeas = (marketingIdeasData || []).filter(i =>
      !(i.tags && i.tags.includes && i.tags.includes('EVENT')) &&
      i.platform !== 'event' &&
      !(Array.isArray(i.platforms) && i.platforms.includes('event'))
    )

    // Fetch user-specific notifications (including HSO mentions & discussions)
    let userNotifs = []
    try {
      let currentEmail = userEmail.value
      if (!currentEmail || currentEmail === 'Memuat...') {
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email) {
          currentEmail = user.email
          userEmail.value = user.email
        } else {
          currentEmail = localStorage.getItem('user_email') || ''
        }
      }

      if (currentEmail) {
        const { data: nData, error: nErr } = await supabase
          .from('notifications')
          .select('id, title, message, type, link, is_read, created_at, recipient_email, user_email')
          .or(`recipient_email.ilike.${currentEmail},user_email.ilike.${currentEmail}`)
          .order('created_at', { ascending: false })
          .limit(50)

        if (!nErr && nData) {
          userNotifs = nData.map(n => ({
            id: n.id,
            title: n.title || 'Notifikasi HSO',
            message: n.message || '',
            status: n.message ? (n.message.length > 50 ? n.message.slice(0, 50) + '...' : n.message) : (n.type || 'INFO'),
            type: n.type || 'HSO_MENTION',
            created_at: n.created_at,
            path: n.link || '/sales-orders',
            read: n.is_read || localStorage.getItem(`notif_read_${n.id}`) === 'true'
          }))
        }
      }
    } catch (e) {
      console.warn('Notifications user fetch note:', e)
    }

    // Normalize each source to common shape {id, title, status, created_at, path, read}
    const normalize = (items, pathBase) =>
      (items || []).map(i => ({
        id: i.id,
        title: i.title || 'Tanpa Judul',
        message: i.status || '',
        status: i.status || '-',
        type: 'TASK',
        created_at: i.created_at,
        path: pathBase,
        read: localStorage.getItem(`notif_read_${i.id}`) === 'true'
      }))

    const allNotifs = [
      ...userNotifs,
      ...normalize(boqData, '/collaborate'),
      ...normalize(marketingData, '/marketing-hub'),
      ...normalize(nonEventIdeas, '/marketing-hub'),
      ...normalize(hpbData, '/hpb'),
      ...normalize(taskData, '/hsq')
    ]

    // Sort by newest first
    notifications.value = allNotifs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  } catch (err) {
    console.warn('Error fetching notifications:', err)
    notifications.value = []
  }
}

const formatTimeAgo = (iso) => {
  if (!iso) return ''
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60) return 'Baru saja'
    if (diff < 3600) return `${Math.floor(diff / 60)} m lalu`
    if (diff < 86400) return `${Math.floor(diff / 3600)} j lalu`
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  } catch (e) {
    return ''
  }
}

const handleNotifClick = async (notif) => {
  notif.read = true
  try { localStorage.setItem(`notif_read_${notif.id}`, 'true') } catch {}
  try {
    if (notif.id) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id)
    }
  } catch (e) {}
  isNotifOpen.value = false
  if (notif.path) {
    router.push(notif.path)
  }
}

const markAllRead = async () => {
  notifications.value.forEach(n => {
    n.read = true
    try { localStorage.setItem(`notif_read_${n.id}`, 'true') } catch {}
  })
  try {
    const currentEmail = userEmail.value
    if (currentEmail && currentEmail !== 'Memuat...') {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .or(`recipient_email.ilike.${currentEmail},user_email.ilike.${currentEmail}`)
        .eq('is_read', false)
    }
  } catch (e) {}
}

// --- Profile Dropdown ---
const isProfileOpen = ref(false)
const userInitials = computed(() => {
  const email = userEmail.value || ''
  if (email === 'Memuat...') return '?'
  const parts = email.split('@')[0].split('.')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return email.substring(0, 2).toUpperCase()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-[#0f172a] flex flex-col md:flex-row font-sans transition-colors duration-300">
    
    <!-- Mobile Top Header Bar -->
    <header class="md:hidden flex items-center justify-between px-5 py-3.5 bg-white dark:bg-[#1e293b] border-b border-gray-200 dark:border-slate-800 sticky top-0 z-40 transition-colors duration-300">
      <div class="flex items-center gap-2.5">
        <img src="https://shop.hokiindo.co.id/favicon.ico" alt="Hokiindo Logo" class="w-7 h-7 object-contain" />
        <h1 class="text-[15px] font-bold uppercase text-slate-900 dark:text-white tracking-tight">HIR Workspace</h1>
      </div>
      <div class="flex items-center gap-2">
        <RouterLink 
          to="/notifications" 
          class="relative p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          :class="unreadCount > 0 ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40' : ''"
        >
          <Bell class="w-5 h-5" />
          <span 
            v-if="unreadCount > 0" 
            class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-white dark:ring-[#1e293b] shadow-sm animate-pulse"
          >
            {{ unreadCount > 99 ? '99+' : unreadCount }}
          </span>
        </RouterLink>
        <div class="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center text-[11px] font-bold">
          {{ userInitials }}
        </div>
      </div>
    </header>

    <!-- Desktop Sidebar -->
    <aside class="hidden md:flex w-[260px] shrink-0 bg-white dark:bg-[#1e293b] border-r border-gray-200 dark:border-slate-800 flex-col sticky top-0 h-screen transition-colors duration-300">
      
      <div class="p-5 flex items-center gap-2.5">
        <img src="https://shop.hokiindo.co.id/favicon.ico" alt="Hokiindo Logo" class="w-7 h-7 object-contain" />
        <h1 class="text-[15px] font-bold uppercase tracking-tight text-slate-900 dark:text-white">HIR Workspace</h1>
      </div>
      
      <nav class="flex-1 px-3 py-2 overflow-y-auto">
        <template v-for="category in filteredMenuGroups" :key="category.name">
          <p class="px-2.5 pt-4 pb-1.5 text-xs font-medium text-slate-400 dark:text-slate-500 tracking-wide">{{ category.name }}</p>
          
          <template v-for="group in category.items" :key="group.name">
            <!-- Single Menu Item -->
            <RouterLink 
              v-if="group.type === 'item'"
              :to="group.path"
              class="flex items-center gap-3 px-2.5 py-2 text-sm rounded-md transition-all group"
              :class="route.path.startsWith(group.path) 
                ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white font-medium shadow-sm' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50'"
            >
              <div class="relative flex items-center justify-center">
                <component 
                  :is="group.icon" 
                  class="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" 
                  :class="group.path === '/notifications' && unreadCount > 0 ? 'text-rose-600 dark:text-rose-400' : ''"
                />
                <span 
                  v-if="group.path === '/notifications' && unreadCount > 0"
                  class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 animate-ping pointer-events-none"
                ></span>
              </div>
              <span class="truncate flex-1">{{ group.name }}</span>

              <!-- Dynamic Badge for Notifications -->
              <span
                v-if="group.path === '/notifications' && unreadCount > 0"
                class="ml-auto shrink-0 min-w-[20px] h-[20px] px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-black bg-rose-600 text-white shadow-sm ring-2 ring-white dark:ring-slate-800 animate-pulse"
              >
                {{ unreadCount > 99 ? '99+' : unreadCount }}
              </span>
            </RouterLink>

            <!-- Group Collapsible Menu -->
            <div v-else class="space-y-0.5">
              <button 
                @click="group.isOpen.value = !group.isOpen.value"
                class="flex items-center justify-between w-full px-2.5 py-2 text-sm rounded-md transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <div class="flex items-center gap-3">
                  <component :is="group.icon" class="w-4 h-4 shrink-0" />
                  <span class="truncate">{{ group.name }}</span>
                </div>
                <component :is="group.isOpen.value ? ChevronUp : ChevronDown" class="w-3.5 h-3.5 text-slate-400" />
              </button>
              
              <!-- Collapsible Content -->
              <div v-show="group.isOpen.value" class="pl-6 space-y-0.5 mt-0.5">
                <RouterLink 
                  v-for="child in group.children"
                  :key="child.name"
                  :to="child.path"
                  class="flex items-center gap-3 px-2.5 py-2 text-sm rounded-md transition-colors"
                  :class="route.path.startsWith(child.path) 
                    ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50'"
                >
                  <span class="truncate">{{ child.name }}</span>
                  <span
                    v-if="child.isComingSoon"
                    class="ml-auto shrink-0 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800/80"
                  >
                    Soon
                  </span>
                  <span
                    v-else-if="child.path === '/cart' && cartItemCount > 0"
                    class="ml-auto shrink-0 min-w-[18px] h-[18px] px-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-sm"
                  >
                    {{ cartItemCount }}
                  </span>
                </RouterLink>
              </div>
            </div>
          </template>
        </template>
      </nav>

      <div class="p-3 border-t border-gray-100 dark:border-slate-800">
        <button
          @click="isSyncWidgetOpen = !isSyncWidgetOpen"
          class="flex items-center gap-3 w-full px-2.5 py-2 text-sm rounded-md transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50"
          :class="{ 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white': isSyncWidgetOpen }"
        >
          <Database class="w-4 h-4 shrink-0" :class="{ 'text-violet-500': isSyncing }" />
          <span class="truncate">{{ isSyncing ? 'Menyinkronkan...' : 'Sinkronisasi Database' }}</span>
          <RefreshCcw v-if="isSyncing" class="w-3.5 h-3.5 ml-auto animate-spin text-violet-400" />
        </button>
      </div>

    </aside>

    <!-- Main Content Area -->
    <main class="flex-1 min-w-0 bg-gray-50/50 dark:bg-[#0f172a] text-black dark:text-gray-200 transition-colors duration-300 flex flex-col">

      <!-- Desktop Top Bar -->
      <header class="hidden md:flex sticky top-0 z-40 items-center justify-between px-6 py-3 bg-white dark:bg-[#1e293b] border-b border-slate-200 dark:border-slate-800">
        
        <!-- Left: Global Search -->
        <div class="flex items-center gap-3 flex-1">
          <!-- Global Search Bar -->
          <div class="relative flex-1 max-w-lg">
            <div
              class="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 rounded-xl px-3 py-2 border border-transparent transition-all"
              :class="isSearchFocused ? 'border-red-400 dark:border-red-600' : ''"
            >
              <Search class="w-4 h-4 text-slate-400 shrink-0" />
              <input
                v-model="globalSearch"
                @input="onSearchInput"
                @keyup.enter="handleSearchEnter"
                @focus="isSearchFocused = true"
                @blur="setTimeout(() => isSearchFocused = false, 200)"
                type="text"
                placeholder="Cari nomor SO, SQ, penawaran, customer, permintaan..."
                class="flex-1 bg-transparent outline-none text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500"
              />
              <span v-if="isSearchLoading" class="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></span>
              <button v-else-if="globalSearch" @click="globalSearch = ''; searchResults = { hsq: [], hso: [], permintaan: [] }" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- Search Results Dropdown -->
            <div
              v-if="isSearchFocused && globalSearch.length >= 2"
              class="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden z-50"
            >
              <!-- Loading -->
              <div v-if="isSearchLoading" class="py-8 text-center">
                <span class="w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin inline-block"></span>
                <p class="text-xs text-slate-400 mt-2">Mencari di semua modul...</p>
              </div>

              <!-- No Results -->
              <div v-else-if="!hasSearchResults" class="py-8 text-center">
                <Search class="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p class="text-xs text-slate-400">Tidak ditemukan hasil untuk "{{ globalSearch }}"</p>
                <p class="text-[10px] text-slate-300 dark:text-slate-600 mt-1">Coba tekan Enter untuk cari di halaman HSQ</p>
              </div>

              <!-- Results -->
              <div v-else class="max-h-[420px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">

                <!-- HSQ Results -->
                <div v-if="searchResults.hsq.length > 0">
                  <div class="px-4 pt-3 pb-1.5 flex items-center justify-between">
                    <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Penawaran (HSQ)</span>
                    <button @click="navigateResult('/hsq')" class="text-[10px] text-red-500 font-bold hover:underline">Lihat Semua →</button>
                  </div>
                  <div
                    v-for="hsq in searchResults.hsq"
                    :key="'hsq-' + hsq.id"
                    @click="navigateResult('/hsq/' + hsq.id)"
                    class="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <div class="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
                      <FileText class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono">{{ hsq.number }}</p>
                      <p class="text-[10px] text-slate-400 truncate">{{ hsq.customer?.name || '-' }}</p>
                    </div>
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">{{ hsq.statusName }}</span>
                  </div>
                </div>

                <!-- HSO Results -->
                <div v-if="searchResults.hso.length > 0">
                  <div class="px-4 pt-3 pb-1.5 flex items-center justify-between">
                    <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Penjualan (HSO)</span>
                    <button @click="navigateResult('/sales-orders')" class="text-[10px] text-red-500 font-bold hover:underline">Lihat Semua →</button>
                  </div>
                  <div
                    v-for="hso in searchResults.hso"
                    :key="'hso-' + hso.id"
                    @click="navigateResult('/sales-orders/' + hso.id)"
                    class="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <div class="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
                      <FileText class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono">{{ hso.number }}</p>
                      <p class="text-[10px] text-slate-400 truncate">{{ hso.customer?.name || '-' }}</p>
                    </div>
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">{{ hso.statusName }}</span>
                  </div>
                </div>

                <!-- Permintaan Results -->
                <div v-if="searchResults.permintaan.length > 0">
                  <div class="px-4 pt-3 pb-1.5 flex items-center justify-between">
                    <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Antrian Permintaan</span>
                    <button @click="navigateResult('/collaborate')" class="text-[10px] text-red-500 font-bold hover:underline">Lihat Semua →</button>
                  </div>
                  <div
                    v-for="p in searchResults.permintaan"
                    :key="'p-' + p.id"
                    @click="navigateResult('/collaborate')"
                    class="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <div class="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center shrink-0">
                      <ClipboardList class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{{ p.title }}</p>
                      <p class="text-[10px] text-slate-400">{{ p.created_by || '-' }}</p>
                    </div>
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-bold" :class="p.status === 'DONE' ? 'bg-emerald-50 text-emerald-600' : p.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'">{{ p.status }}</span>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        <!-- Right: Notifications + Profile -->
        <div class="flex items-center gap-2 ml-4">

          <!-- Notifications Bell -->
          <div class="relative">
            <button
              @click="isNotifOpen = !isNotifOpen; if(isNotifOpen) fetchNotifications()"
              class="relative p-2 rounded-xl transition-all flex items-center justify-center"
              :class="unreadCount > 0 
                ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 ring-1 ring-rose-200 dark:ring-rose-800' 
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-white'"
              title="Notifikasi"
            >
              <Bell class="w-5 h-5 transition-transform" :class="{ 'animate-bounce': unreadCount > 0 }" />
              <span 
                v-if="unreadCount > 0" 
                class="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 bg-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-white dark:ring-[#1e293b] shadow-md animate-pulse"
              >
                {{ unreadCount > 99 ? '99+' : unreadCount }}
              </span>
            </button>

            <!-- Notif Dropdown -->
            <div
              v-if="isNotifOpen"
              class="absolute right-0 top-full mt-2 bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150"
              style="width: 22rem;"
            >
              <div class="flex items-center justify-between px-4 py-3 bg-slate-50/70 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Notifikasi</span>
                  <span v-if="unreadCount > 0" class="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    {{ unreadCount }} baru
                  </span>
                </div>
                <button v-if="unreadCount > 0" @click="markAllRead" class="text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-semibold">Tandai Semua Dibaca</button>
              </div>
              <div v-if="notifications.length === 0" class="py-10 text-center">
                <Bell class="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p class="text-xs text-slate-400">Tidak ada notifikasi baru</p>
              </div>
              <div v-else class="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                <div
                  v-for="notif in notifications"
                  :key="notif.id"
                  @click="handleNotifClick(notif)"
                  class="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                  :class="{ 'bg-rose-50/40 dark:bg-rose-950/20': !notif.read }"
                >
                  <div class="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" :class="notif.read ? 'bg-slate-300 dark:bg-slate-600' : 'bg-rose-500 ring-2 ring-rose-200 dark:ring-rose-900'"></div>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{{ notif.title }}</p>
                    <p class="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2 mt-0.5 leading-snug">{{ notif.message || notif.status }}</p>
                    <div class="flex items-center gap-2 mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                      <span>{{ formatTimeAgo(notif.created_at) }}</span>
                      <span v-if="notif.path?.startsWith('/sales-orders')" class="text-blue-500 dark:text-blue-400 font-medium">• HSO Diskusi</span>
                      <span v-else-if="notif.path?.startsWith('/collaborate')" class="text-amber-500 dark:text-amber-400 font-medium">• TO-DO Task</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="p-2.5 bg-slate-50/70 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800">
                <button 
                  @click="router.push('/notifications'); isNotifOpen = false" 
                  class="w-full text-center text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-rose-600 dark:hover:text-rose-400 py-1 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Buka Semua Notifikasi Lengkap</span>
                  <ArrowRight class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <!-- Profile Avatar -->
          <div class="relative">
            <button
              @click="isProfileOpen = !isProfileOpen"
              class="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all group"
            >
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 text-white flex items-center justify-center font-black text-xs shadow-sm">
                {{ userInitials }}
              </div>
              <div class="text-left">
                <div class="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight max-w-[120px] truncate">{{ userEmail.split('@')[0] }}</div>
                <div class="text-[10px] text-slate-400 font-mono leading-tight">{{ userRole }}</div>
              </div>
              <ChevronDown class="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-transform" :class="{ 'rotate-180': isProfileOpen }" />
            </button>

            <!-- Profile Dropdown -->
            <div
              v-if="isProfileOpen"
              class="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden z-50"
            >
              <div class="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <p class="text-xs font-black text-slate-800 dark:text-white truncate">{{ userEmail }}</p>
                <p class="text-[10px] text-slate-400 mt-0.5">{{ userRole }}</p>
              </div>
              <div class="py-1">
                <button
                  @click="() => { toggleDarkMode(); isProfileOpen = false }"
                  class="flex items-center gap-3 px-4 py-2.5 w-full text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <component :is="isDarkMode ? Sun : Moon" class="w-4 h-4" />
                  {{ isDarkMode ? 'Light Mode' : 'Dark Mode' }}
                </button>
                <button
                  @click="router.push('/settings'); isProfileOpen = false"
                  class="flex items-center gap-3 px-4 py-2.5 w-full text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <Settings class="w-4 h-4" />
                  Pengaturan
                </button>
                <button
                  @click="handleLogout"
                  class="flex items-center gap-3 px-4 py-2.5 w-full text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                >
                  <LogOut class="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          </div>

        </div>
      </header>

      <!-- Page Content -->
      <div class="flex-1 pt-4 md:pt-6 px-6 pb-24 md:pb-8">
        <RouterView v-slot="{ Component }">
          <KeepAlive :include="['SalesOrderView']">
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </div>
    </main>

    <!-- Mobile Bottom Navigation Bar (Capped at 4 items) -->
    <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1e293b] border-t border-gray-200 dark:border-slate-800 flex justify-around items-center p-2 z-50 pb-safe shadow-lg transition-colors duration-300">
      
        <RouterLink 
        v-if="userRole === 'ADMIN' || allowedModules.includes('hsq:read')"
        to="/hsq"
        class="flex flex-col items-center justify-center p-2 rounded-lg w-full transition-colors"
        :class="route.path.startsWith('/hsq') ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'"
      >
        <FileText class="w-4 h-4 mb-0.5" />
        <span class="text-[10px]">Penawaran</span>
      </RouterLink>

      <RouterLink 
        v-if="userRole === 'ADMIN' || allowedModules.includes('sales-orders:read')"
        to="/sales-orders"
        class="flex flex-col items-center justify-center p-2 rounded-lg w-full transition-colors"
        :class="route.path.startsWith('/sales-orders') ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'"
      >
        <FileText class="w-4 h-4 mb-0.5" />
        <span class="text-[10px]">Penjualan</span>
      </RouterLink>

      <RouterLink 
        v-if="userRole === 'ADMIN' || allowedModules.includes('cart:read')"
        to="/cart"
        class="flex flex-col items-center justify-center p-2 rounded-lg w-full transition-colors"
        :class="route.path.startsWith('/cart') ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'"
      >
        <ShoppingCart class="w-4 h-4 mb-0.5" />
        <span class="text-[10px]">Keranjang</span>
      </RouterLink>

      <!-- More Menu using Sheet Drawer -->
      <Sheet>
        <SheetTrigger as-child>
          <button class="flex flex-col items-center justify-center p-2 rounded-lg w-full text-slate-500 dark:text-slate-400 transition-colors">
            <Menu class="w-4 h-4 mb-0.5" />
            <span class="text-[10px]">Menu</span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" class="dark:bg-[#1e293b] dark:border-slate-800 rounded-t-2xl max-h-[85vh] p-6 focus:outline-none">
          <SheetHeader class="pb-4 border-b border-gray-100 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <img src="https://shop.hokiindo.co.id/favicon.ico" alt="Hokiindo Logo" class="w-6 h-6 object-contain" />
              <SheetTitle class="text-[14px] font-bold uppercase text-slate-900 dark:text-white">HIR Workspace</SheetTitle>
            </div>
            <div class="text-[11px] text-slate-400 dark:text-slate-500 mt-1 break-all">{{ userEmail }}</div>
          </SheetHeader>
          
          <div class="py-3 overflow-y-auto max-h-[50vh]">
            <template v-for="category in filteredMenuGroups" :key="'mob-' + category.name">
              <p class="px-2.5 pt-3 pb-1.5 text-xs font-medium text-slate-400 dark:text-slate-500 tracking-wide">{{ category.name }}</p>
              <div class="space-y-0.5">
              <template v-for="group in category.items" :key="group.name">
                <!-- Render Single Item Mobile -->
                <RouterLink 
                  v-if="group.type === 'item'"
                  :to="group.path"
                  class="flex items-center gap-3 px-2.5 py-2 text-sm rounded-md transition-colors"
                  :class="route.path.startsWith(group.path) 
                    ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white font-medium' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50'"
                >
                  <component :is="group.icon" class="w-4 h-4 shrink-0" :class="group.path === '/notifications' && unreadCount > 0 ? 'text-rose-500' : ''" />
                  <span class="truncate flex-1">{{ group.name }}</span>
                  <span
                    v-if="group.path === '/notifications' && unreadCount > 0"
                    class="ml-auto shrink-0 min-w-[20px] h-[20px] px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-bold bg-rose-500 text-white shadow-sm"
                  >
                    {{ unreadCount > 99 ? '99+' : unreadCount }}
                  </span>
                </RouterLink>

                <!-- Render Group Mobile -->
                <div v-else class="space-y-0.5">
                  <button 
                    @click="group.isOpen.value = !group.isOpen.value"
                    class="flex items-center justify-between w-full px-2.5 py-2 text-sm rounded-md transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <div class="flex items-center gap-3">
                      <component :is="group.icon" class="w-4 h-4 shrink-0" />
                      <span>{{ group.name }}</span>
                    </div>
                    <component :is="group.isOpen.value ? ChevronUp : ChevronDown" class="w-3.5 h-3.5 text-slate-400" />
                  </button>
                  
                  <!-- Collapsible Content Mobile -->
                  <div v-show="group.isOpen.value" class="pl-6 space-y-0.5 mt-0.5">
                    <RouterLink 
                      v-for="child in group.children"
                      :key="'mob-' + child.name"
                      :to="child.path"
                      class="flex items-center gap-3 px-2.5 py-2 text-sm rounded-md transition-colors"
                      :class="route.path.startsWith(child.path) 
                        ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white' 
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50'"
                    >
                      <span>{{ child.name }}</span>
                      <span
                        v-if="child.path === '/cart' && cartItemCount > 0"
                        class="ml-auto shrink-0 min-w-[18px] h-[18px] px-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-sm"
                      >
                        {{ cartItemCount }}
                      </span>
                    </RouterLink>
                  </div>
                </div>
              </template>
              </div>
            </template>
            
            <div class="border-t border-slate-100 dark:border-slate-800 my-3"></div>
            
            <button 
              @click="toggleDarkMode"
              class="flex items-center gap-3 px-2.5 py-2 w-full text-sm rounded-md transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <component :is="isDarkMode ? Sun : Moon" class="w-4 h-4" />
              <span>{{ isDarkMode ? 'Light Mode' : 'Dark Mode' }}</span>
            </button>
            
            <button 
              @click="handleLogout"
              class="flex items-center gap-3 px-2.5 py-2 w-full text-sm rounded-md transition-colors text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
            >
              <LogOut class="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

    </nav>

    <!-- Sync Log Modal -->

    <!-- Floating Sync Widget -->
    <AccurateSyncWidget v-model:open="isSyncWidgetOpen" />

  </div>
</template>

<style>
/* Scrollbar Customization for Dark Mode */
.dark ::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.dark ::-webkit-scrollbar-track {
  background: #1a1a1a; 
}
.dark ::-webkit-scrollbar-thumb {
  background: #333; 
  border-radius: 4px;
}
.dark ::-webkit-scrollbar-thumb:hover {
  background: #444; 
}
</style>