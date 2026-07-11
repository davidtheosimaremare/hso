<script setup>
import { onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { 
  LayoutDashboard, 
  FileText, 
  Settings, 
  LogOut, 
  Moon, 
  Sun,
  User,

  ShoppingBag,
  Truck,
  UploadCloud,
  Package,
  Menu,
  Database
} from 'lucide-vue-next'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet'



const route = useRoute()
const router = useRouter()
const userEmail = ref('Memuat...')
const isDarkMode = ref(false)

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

// Init Theme & User
onMounted(async () => {
  // Check User
  const { data: { user } } = await supabase.auth.getUser()
  if (user) userEmail.value = user.email

  // Check Theme Preference
  const savedTheme = localStorage.getItem('theme')
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  
  if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
    isDarkMode.value = true
    document.documentElement.classList.add('dark')
  }
})

const menuItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Sales Order', path: '/sales-orders', icon: FileText },
  { name: 'Purchase Order', path: '/purchase-orders', icon: ShoppingBag },
  { name: 'Penerimaan Barang', path: '/receive-items', icon: Package },
  { name: 'Delivery Order', path: '/delivery-orders', icon: Truck },
  { name: 'Database Logistik', path: '/logistics-db', icon: Database },
  { name: 'Manage Account', path: '/settings', icon: Settings },
]

const handleLogout = async () => {
  await supabase.auth.signOut()
  router.push('/')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-[#0f172a] flex flex-col md:flex-row font-source-code transition-colors duration-300">
    
    <!-- Mobile Top Header Bar -->
    <header class="md:hidden flex items-center justify-between px-6 py-4 bg-white dark:bg-[#1e293b] border-b border-gray-200 dark:border-slate-800 sticky top-0 z-40 shadow-sm transition-colors duration-300">
      <div class="flex items-center gap-3">
        <img src="https://shop.hokiindo.co.id/favicon.ico" alt="Hokiindo Logo" class="w-8 h-8 object-contain" />
        <h1 class="text-lg font-bold text-slate-900 dark:text-white tracking-tight">HSO TRACKER</h1>
      </div>
      <div class="w-8 h-8 rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center font-bold text-xs">
        H
      </div>
    </header>

    <!-- Desktop Sidebar -->
    <aside class="hidden md:flex w-[280px] bg-white dark:bg-[#1e293b] border-r border-gray-200 dark:border-slate-800 flex-col sticky top-0 h-screen transition-colors duration-300">
      
      <div class="p-6 flex items-center gap-3">
        <img src="https://shop.hokiindo.co.id/favicon.ico" alt="Hokiindo Logo" class="w-8 h-8 object-contain" />
        <h1 class="text-xl font-bold text-black dark:text-white tracking-tight">HSO TRACKER</h1>
      </div>
      
      <nav class="flex-1 px-4 space-y-1 mt-2">
        
        <RouterLink 
          v-for="item in menuItems" 
          :key="item.path" 
          :to="item.path"
          class="flex items-center gap-4 px-4 py-3.5 text-sm font-medium transition-all border-l-4"
          :class="route.path.startsWith(item.path) 
            ? 'border-[#e60000] text-black dark:text-white bg-gray-50 dark:bg-slate-800/50' 
            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800/30'"
        >
          <span v-if="route.path.startsWith(item.path)" class="w-1.5 h-1.5 rounded-full bg-[#e60000] absolute left-8"></span>
          
          <span :class="route.path.startsWith(item.path) ? 'ml-2' : ''">{{ item.name }}</span>
        </RouterLink>

      </nav>

      <div class="p-4 border-t border-gray-200 dark:border-slate-800 space-y-2">
        
        <button 
          @click="toggleDarkMode"
          class="flex items-center gap-3 px-4 py-3 w-full text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-all rounded-md"
        >
          <component :is="isDarkMode ? Sun : Moon" class="w-4 h-4" />
          {{ isDarkMode ? 'Light Mode' : 'Dark Mode' }}
        </button>

        <button 
          @click="handleLogout"
          class="flex items-center gap-3 px-4 py-3 w-full text-sm font-semibold text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all rounded-md border border-transparent hover:border-red-150 dark:hover:border-red-900/30"
        >
          <LogOut class="w-4 h-4 text-slate-400 hover:text-red-500 transition-colors" />
          Logout
        </button>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto bg-gray-50/50 dark:bg-[#0f172a] text-black dark:text-gray-200 transition-colors duration-300">
      <RouterView />
    </main>

    <!-- Mobile Bottom Navigation Bar (Capped at 4 items) -->
    <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1e293b] border-t border-gray-200 dark:border-slate-800 flex justify-around items-center p-2 z-50 pb-safe shadow-lg transition-colors duration-300">
      
      <RouterLink 
        to="/dashboard"
        class="flex flex-col items-center justify-center p-2 rounded-lg w-full transition-colors"
        :class="route.path.startsWith('/dashboard') ? 'text-[#e60000] font-bold' : 'text-gray-400 dark:text-gray-400'"
      >
        <LayoutDashboard class="w-5 h-5 mb-1" />
        <span class="text-[10px]">Dashboard</span>
      </RouterLink>

      <RouterLink 
        to="/sales-orders"
        class="flex flex-col items-center justify-center p-2 rounded-lg w-full transition-colors"
        :class="route.path.startsWith('/sales-orders') ? 'text-[#e60000] font-bold' : 'text-gray-400 dark:text-gray-400'"
      >
        <FileText class="w-5 h-5 mb-1" />
        <span class="text-[10px]">Sales Order</span>
      </RouterLink>

      <RouterLink 
        to="/purchase-orders"
        class="flex flex-col items-center justify-center p-2 rounded-lg w-full transition-colors"
        :class="route.path.startsWith('/purchase-orders') ? 'text-[#e60000] font-bold' : 'text-gray-400 dark:text-gray-400'"
      >
        <ShoppingBag class="w-5 h-5 mb-1" />
        <span class="text-[10px]">PO Siemens</span>
      </RouterLink>

      <!-- More Menu using Sheet Drawer -->
      <Sheet>
        <SheetTrigger as-child>
          <button class="flex flex-col items-center justify-center p-2 rounded-lg w-full text-gray-400 dark:text-gray-400 transition-colors">
            <Menu class="w-5 h-5 mb-1" />
            <span class="text-[10px]">Menu</span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" class="dark:bg-[#1e293b] dark:border-slate-800 rounded-t-2xl max-h-[85vh] p-6 focus:outline-none">
          <SheetHeader class="pb-4 border-b border-gray-100 dark:border-slate-800">
            <div class="flex items-center gap-3">
              <img src="https://shop.hokiindo.co.id/favicon.ico" alt="Hokiindo Logo" class="w-7 h-7 object-contain" />
              <SheetTitle class="text-base font-bold text-slate-900 dark:text-white">HSO TRACKER</SheetTitle>
            </div>
            <div class="text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-mono break-all">{{ userEmail }}</div>
          </SheetHeader>
          
          <div class="py-4 space-y-1.5 overflow-y-auto max-h-[50vh]">
            <RouterLink 
              to="/receive-items"
              class="flex items-center gap-4 px-4 py-3 text-sm font-medium transition-all rounded-xl border border-transparent"
              :class="route.path.startsWith('/receive-items') 
                ? 'text-[#e60000] bg-red-50/50 dark:bg-red-950/20 border-red-100 dark:border-red-950' 
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/30'"
            >
              <Package class="w-5 h-5 text-slate-500 dark:text-slate-400" />
              <span>Penerimaan Barang</span>
            </RouterLink>
            
            <RouterLink 
              to="/delivery-orders"
              class="flex items-center gap-4 px-4 py-3 text-sm font-medium transition-all rounded-xl border border-transparent"
              :class="route.path.startsWith('/delivery-orders') 
                ? 'text-[#e60000] bg-red-50/50 dark:bg-red-950/20 border-red-100 dark:border-red-950' 
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/30'"
            >
              <Truck class="w-5 h-5 text-slate-500 dark:text-slate-400" />
              <span>Delivery Order</span>
            </RouterLink>

            <RouterLink 
              to="/settings"
              class="flex items-center gap-4 px-4 py-3 text-sm font-medium transition-all rounded-xl border border-transparent"
              :class="route.path.startsWith('/settings') 
                ? 'text-[#e60000] bg-red-50/50 dark:bg-red-950/20 border-red-100 dark:border-red-950' 
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/30'"
            >
              <Settings class="w-5 h-5 text-slate-500 dark:text-slate-400" />
              <span>Manage Account</span>
            </RouterLink>
            
            <div class="border-t border-slate-100 dark:border-slate-800 my-3"></div>
            
            <button 
              @click="toggleDarkMode"
              class="flex items-center gap-4 px-4 py-3 w-full text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/30 transition-all rounded-xl"
            >
              <component :is="isDarkMode ? Sun : Moon" class="w-5 h-5 text-slate-500 dark:text-slate-400" />
              <span>{{ isDarkMode ? 'Light Mode' : 'Dark Mode' }}</span>
            </button>
            
            <button 
              @click="handleLogout"
              class="flex items-center gap-4 px-4 py-3 w-full text-sm font-bold text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all rounded-xl border border-transparent hover:border-red-150 dark:hover:border-red-900/30"
            >
              <LogOut class="w-5 h-5 text-slate-400 hover:text-red-500 transition-colors" />
              <span>Logout</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

    </nav>

    <!-- Sync Log Modal -->


  </div>
</template>

<style>
/* Import Font */
@import url('https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;600;700&display=swap');
/* ... */

.font-source-code {
  font-family: 'Source Code Pro', monospace;
}

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