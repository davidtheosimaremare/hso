<script setup>
import { onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { 
  LayoutDashboard, 
  FileText, 
  PackageSearch, 
  Settings, 
  LogOut, 
  Moon, 
  Sun,
  User
} from 'lucide-vue-next'

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

// --- 2. Menu Config ---
const menuItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Sales Order', path: '/sales-orders', icon: FileText },
  { name: 'Procurement', path: '/tracking', icon: PackageSearch }, // Rename Tracking -> Procurement sesuai gambar
  { name: 'Manage Account', path: '/settings', icon: Settings },
]

const handleLogout = async () => {
  await supabase.auth.signOut()
  router.push('/')
}
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-[#1a1a1a] flex flex-col md:flex-row font-source-code transition-colors duration-300">
    
    <aside class="hidden md:flex w-[280px] bg-white dark:bg-[#1a1a1a] border-r border-gray-200 dark:border-gray-800 flex-col sticky top-0 h-screen transition-colors duration-300">
      
      <div class="p-6 flex items-center gap-3">
        <div class="w-8 h-8 bg-[#e60000] rounded-full flex items-center justify-center text-white font-bold text-lg select-none">
          H
        </div>
        <h1 class="text-xl font-bold text-black dark:text-white tracking-tight">HSO TRACKER</h1>
      </div>
      
      <nav class="flex-1 px-4 space-y-1 mt-2">
        
        <RouterLink 
          v-for="item in menuItems" 
          :key="item.path" 
          :to="item.path"
          class="flex items-center gap-4 px-4 py-3.5 text-sm font-medium transition-all border-l-4"
          :class="route.path.startsWith(item.path) 
            ? 'border-[#e60000] text-black dark:text-white bg-gray-50 dark:bg-gray-800/50' 
            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800/30'"
        >
          <span v-if="route.path.startsWith(item.path)" class="w-1.5 h-1.5 rounded-full bg-[#e60000] absolute left-8"></span>
          
          <span :class="route.path.startsWith(item.path) ? 'ml-2' : ''">{{ item.name }}</span>
        </RouterLink>

      </nav>

      <div class="p-4 border-t border-gray-200 dark:border-gray-800 space-y-2">
        
        <button 
          @click="toggleDarkMode"
          class="flex items-center gap-3 px-4 py-3 w-full text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-all rounded-md"
        >
          <component :is="isDarkMode ? Sun : Moon" class="w-4 h-4" />
          {{ isDarkMode ? 'Light Mode' : 'Dark Mode' }}
        </button>

        <button 
          @click="handleLogout"
          class="flex items-center gap-3 px-4 py-3 w-full text-sm font-bold text-white bg-[#e60000] hover:bg-[#cc0000] transition-all rounded-md"
        >
          <LogOut class="w-4 h-4" />
          Logout
        </button>
      </div>
    </aside>

    <main class="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto bg-white dark:bg-[#1a1a1a] text-black dark:text-gray-200 transition-colors duration-300">
      <RouterView v-slot="{ Component }">
        <KeepAlive include="TrackingView">
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </main>

    <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 flex justify-around items-center p-2 z-50 pb-safe shadow-lg transition-colors duration-300">
      
      <RouterLink 
        v-for="item in menuItems" 
        :key="item.path" 
        :to="item.path"
        class="flex flex-col items-center justify-center p-2 rounded-lg w-full transition-colors"
        :class="route.path.startsWith(item.path) ? 'text-[#e60000]' : 'text-gray-400 dark:text-gray-500'"
      >
        <component :is="item.icon" class="w-5 h-5 mb-1" />
        <span class="text-[10px] font-bold">{{ item.name }}</span>
      </RouterLink>

      <button 
        @click="toggleDarkMode"
        class="flex flex-col items-center justify-center p-2 rounded-lg w-full text-gray-400 dark:text-gray-500"
      >
        <component :is="isDarkMode ? Sun : Moon" class="w-5 h-5 mb-1" />
        <span class="text-[10px] font-bold">Theme</span>
      </button>

    </nav>

  </div>
</template>

<style>
/* Import Font */
@import url('https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;600;700&display=swap');

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