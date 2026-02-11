import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/lib/supabase' // Import auth checker

import LoginView from '@/views/LoginView.vue'
import MainLayout from '@/layouts/MainLayout.vue'
// ... import view lainnya (DashboardView, dll)
import DashboardView from '@/views/DashboardView.vue'
import SalesOrderView from '@/views/SalesOrderView.vue'
import TrackingView from '@/views/TrackingView.vue'
import SettingsView from '@/views/SettingsView.vue'
import SalesOrderDetailView from '@/views/SalesOrderDetailView.vue'
import PurchaseOrderListView from '@/views/PurchaseOrderListView.vue'
import PurchaseOrderDetailView from '@/views/PurchaseOrderDetailView.vue'
import DeliveryOrderListView from '@/views/DeliveryOrderListView.vue'
import DeliveryOrderDetailView from '@/views/DeliveryOrderDetailView.vue'

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
        { path: '/tracking', component: TrackingView },
        { path: '/purchase-orders', component: PurchaseOrderListView },
        { path: '/purchase-orders/:id', component: PurchaseOrderDetailView },
        { path: '/delivery-orders', component: DeliveryOrderListView },
        { path: '/delivery-orders/:id', component: DeliveryOrderDetailView },
        { path: '/settings', component: SettingsView },
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

// --- LOGIC SATPAM ---
router.beforeEach(async (to, from, next) => {
  // Cek apakah user sedang login
  const { data: { session } } = await supabase.auth.getSession()

  // Skenario 1: Mau masuk ke halaman 'requiresAuth' tapi belum login
  if (to.matched.some(record => record.meta.requiresAuth) && !session) {
    next('/') // Tendang ke halaman login
  }
  // Skenario 2: Sudah login, tapi mau balik ke halaman Login
  else if (to.matched.some(record => record.meta.requiresGuest) && session) {
    next('/dashboard') // Arahkan langsung ke dashboard
  }
  // Skenario 3: Aman
  else {
    next()
  }
})

export default router