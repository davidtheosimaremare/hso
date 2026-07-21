import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/lib/supabase' // Import auth checker

import LoginView from '@/views/LoginView.vue'
import MainLayout from '@/layouts/MainLayout.vue'
// ... import view lainnya (DashboardView, dll)
import DashboardView from '@/views/DashboardView.vue'
import SalesOrderView from '@/views/SalesOrderView.vue'
import SettingsView from '@/views/SettingsView.vue'
import SalesOrderDetailView from '@/views/SalesOrderDetailView.vue'
import PurchaseOrderListView from '@/views/PurchaseOrderListView.vue'
import PurchaseOrderDetailView from '@/views/PurchaseOrderDetailView.vue'
import DeliveryOrderListView from '@/views/DeliveryOrderListView.vue'
import DeliveryOrderDetailView from '@/views/DeliveryOrderDetailView.vue'
import ReceiveItemListView from '@/views/ReceiveItemListView.vue'
import ReceiveItemDetailView from '@/views/ReceiveItemDetailView.vue'
import LogisticsDbView from '@/views/LogisticsDbView.vue'
import CartView from '@/views/CartView.vue'
import HpbListView from '@/views/HpbListView.vue'
import HpbDetailView from '@/views/HpbDetailView.vue'
import HsqListView from '@/views/HsqListView.vue'
import HsqDetailView from '@/views/HsqDetailView.vue'
import SopGuideView from '@/views/SopGuideView.vue'
import DevUpdatesView from '@/views/DevUpdatesView.vue'


// Import Public
import PublicLayout from '@/layouts/PublicLayout.vue'
import PublicTrackingView from '@/views/PublicTrackingView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView,
      meta: { requiresGuest: true } // Hanya tamu yg boleh lihat login
    },
    {
      path: '/app',
      component: MainLayout,
      meta: { requiresAuth: true }, // <--- INI KUNCINYA (Halaman Terkunci)
      redirect: '/dashboard',
      children: [
        { path: '/dashboard', component: DashboardView },
        { path: '/sales-orders', component: SalesOrderView },
        { path: '/sales-orders/:id', component: SalesOrderDetailView },
        { path: '/purchase-orders', component: PurchaseOrderListView },
        { path: '/purchase-orders/:id', component: PurchaseOrderDetailView },
        { path: '/delivery-orders', component: DeliveryOrderListView },
        { path: '/delivery-orders/:id', component: DeliveryOrderDetailView },
        { path: '/receive-items', component: ReceiveItemListView },
        { path: '/receive-items/:id', component: ReceiveItemDetailView },
        { path: '/logistics-db', component: LogisticsDbView },
        { path: '/cart', component: CartView },
        { path: '/hpb', component: HpbListView },
        { path: '/hpb/:id', component: HpbDetailView },
        { path: '/hsq', component: HsqListView },
        { path: '/hsq/:id', component: HsqDetailView },
        { path: '/settings', component: SettingsView },
        { path: '/sop-guide', component: SopGuideView },
        { path: '/development', component: DevUpdatesView },
      ]
    },
    {
      path: '/track',
      component: PublicLayout,
      // Public tidak butuh requiresAuth
      children: [
        { path: '', component: PublicTrackingView }
      ]
    },
    {
      path: '/public/tracking/:code', // <-- DAFTARKAN ROUTE DENGAN PARAMETER DINAMIS ':code'
      name: 'public-tracking',
      component: PublicTrackingView
    }
  ]
})

// --- CACHED PERMISSION STATE ---
let userAccess = null

// Helper to map route paths to module keys
function getRequiredModule(path) {
  if (path.startsWith('/dashboard')) return 'dashboard'
  if (path.startsWith('/sales-orders')) return 'sales-orders'
  if (path.startsWith('/hsq')) return 'hsq'
  if (path.startsWith('/cart') || path.startsWith('/hpb')) return 'cart'
  if (path.startsWith('/purchase-orders')) return 'purchase-orders'
  if (path.startsWith('/receive-items')) return 'receive-items'
  if (path.startsWith('/delivery-orders')) return 'delivery-orders'
  if (path.startsWith('/logistics-db')) return 'logistics-db'
  if (path.startsWith('/sop-guide')) return 'sop-guide'
  if (path.startsWith('/settings') || path.startsWith('/development')) return 'settings'
  return null
}

// Helper to find the first allowed module's path for redirection
function getFirstAllowedPath(allowedModules) {
  if (!allowedModules || allowedModules.length === 0) return '/'
  const moduleToPath = {
    'dashboard:read': '/dashboard',
    'sales-orders:read': '/sales-orders',
    'hsq:read': '/hsq',
    'cart:read': '/cart',
    'purchase-orders:read': '/purchase-orders',
    'receive-items:read': '/receive-items',
    'delivery-orders:read': '/delivery-orders',
    'logistics-db:read': '/logistics-db',
    'sop-guide:read': '/sop-guide',
    'settings:read': '/settings'
  }
  for (const mod of allowedModules) {
    if (moduleToPath[mod]) return moduleToPath[mod]
  }
  return '/'
}

// Reset permission cache when auth state changes (e.g., logout)
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    userAccess = null
  }
})

// --- LOGIC SATPAM (RBAC Enabled) ---
router.beforeEach(async (to, from, next) => {
  // Cek apakah user sedang login
  const { data: { session } } = await supabase.auth.getSession()

  // Skenario 1: Mau masuk ke halaman 'requiresAuth' tapi belum login
  if (to.matched.some(record => record.meta.requiresAuth) && !session) {
    userAccess = null
    next('/') // Tendang ke halaman login
  }
  // Skenario 2: Sudah login, tapi mau balik ke halaman Login
  else if (to.matched.some(record => record.meta.requiresGuest) && session) {
    next('/dashboard') // Arahkan langsung ke dashboard
  }
  // Skenario 3: Cek Hak Akses User
  else if (session) {
    if (!userAccess) {
      try {
        const { data, error } = await supabase
          .from('user_access')
          .select('role, allowed_modules')
          .eq('email', session.user.email)
          .maybeSingle()

        if (error) throw error

        if (data) {
          userAccess = data
        } else {
          // Fallback untuk existing user atau login pertama agar tidak kekunci
          userAccess = {
            role: 'ADMIN',
            allowed_modules: [
              'dashboard:read', 'dashboard:write',
              'sales-orders:read', 'sales-orders:write',
              'hsq:read', 'hsq:write',
              'cart:read', 'cart:write',
              'purchase-orders:read', 'purchase-orders:write',
              'receive-items:read', 'receive-items:write',
              'delivery-orders:read', 'delivery-orders:write',
              'logistics-db:read', 'logistics-db:write',
              'sop-guide:read', 'sop-guide:write',
              'settings:read', 'settings:write'
            ]
          }
        }
      } catch (err) {
        console.error('Error fetching user access:', err)
        // Fallback agar tidak crash jika DB sedang error
        userAccess = {
          role: 'STAFF',
          allowed_modules: ['dashboard:read']
        }
      }
    }

    // Admin bebas mengakses apa saja
    if (userAccess.role === 'ADMIN') {
      next()
      return
    }

    // Cek modul spesifik (harus memiliki permission :read)
    const requiredModule = getRequiredModule(to.path)
    if (requiredModule && !userAccess.allowed_modules?.includes(`${requiredModule}:read`)) {
      const redirectPath = getFirstAllowedPath(userAccess.allowed_modules)
      if (redirectPath && redirectPath !== to.path) {
        next(redirectPath)
      } else {
        next(false) // Batalkan navigasi
      }
    } else {
      next()
    }
  }
  // Skenario 4: Halaman public atau track
  else {
    next()
  }
})

export default router