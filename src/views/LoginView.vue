<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase' 
import { Loader2, Mail, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-vue-next'

const router = useRouter()
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const rememberMe = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')

onMounted(() => {
  // Restore saved credentials if "Ingat Password" was checked previously
  const savedEmail = localStorage.getItem('hir_saved_email')
  const savedPassword = localStorage.getItem('hir_saved_password')
  if (savedEmail) {
    email.value = savedEmail
    if (savedPassword) password.value = savedPassword
    rememberMe.value = true
  }
})

const handleLogin = async () => {
  if (!email.value || !password.value) {
    errorMessage.value = 'Silakan isi Username dan Password.'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  // 1. Panggil Supabase Auth
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  })

  isLoading.value = false

  // 2. Cek Error
  if (error) {
    errorMessage.value = 'Username atau Password salah.'
    return
  }

  // 3. Simpan / Hapus Remember Password state
  if (rememberMe.value) {
    localStorage.setItem('hir_saved_email', email.value)
    localStorage.setItem('hir_saved_password', password.value)
  } else {
    localStorage.removeItem('hir_saved_email')
    localStorage.removeItem('hir_saved_password')
  }

  // 4. Generate Single Device Active Session ID
  if (data.user) {
    const newSessionId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess_${Date.now()}_${Math.random().toString(36).substring(2)}`
    localStorage.setItem('hir_active_session_id', newSessionId)

    try {
      await supabase.from('user_access').update({
        active_session_id: newSessionId,
        last_login_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString()
      }).eq('email', data.user.email)
    } catch (e) {
      console.warn('Single session update notice:', e)
    }

    // Redirect ke Dashboard
    router.push('/dashboard')
  }
}
</script>

<template>
  <div class="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-red-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 font-sans p-4 select-none overflow-hidden">
    
    <!-- Ambient Soft Glow Behind Card -->
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] bg-red-500/10 rounded-full blur-[100px] pointer-events-none"></div>
    
    <!-- Smooth Full-Bleed Seamless Pattern Backdrop -->
    <div class="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none"></div>

    <!-- Login Card with Seamless Curved Red Top Border Accent -->
    <div class="relative z-10 w-full max-w-[380px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t-4 border-t-[#ff0000] border-x border-b border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.08)] p-8 sm:p-9 space-y-6 text-center">
      
      <!-- Header: Logo Favicon + HIR WORKSPACE -->
      <div class="space-y-1.5 pt-1">
        <div class="flex items-center justify-center gap-3 select-none">
          <img 
            src="https://shop.hokiindo.co.id/favicon.ico" 
            alt="Hokiindo Favicon Logo" 
            class="w-9 h-9 object-contain shrink-0 drop-shadow-xs" 
            @error="(e) => e.target.src = '/favicon.ico'"
          />
          <span class="text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase whitespace-nowrap">
            HIR WORKSPACE
          </span>
        </div>
        <p class="text-[11px] font-medium text-slate-400 dark:text-slate-500">
          Internal Management & Operations Portal
        </p>
      </div>

      <!-- Form Inputs -->
      <form @submit.prevent="handleLogin" class="space-y-4 text-left">
        
        <!-- Error Alert -->
        <div v-if="errorMessage" class="flex items-center gap-2 p-3 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 rounded-xl">
          <ShieldCheck class="w-4 h-4 shrink-0 text-rose-500" />
          <span>{{ errorMessage }}</span>
        </div>

        <!-- Username / Email Field -->
        <div class="space-y-1">
          <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">Username / Email</label>
          <div class="relative flex items-center">
            <Mail class="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input 
              type="email" 
              placeholder="Masukkan email Anda..." 
              v-model="email"
              required
              class="w-full bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 rounded-xl outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all font-sans"
            />
          </div>
        </div>

        <!-- Password Field -->
        <div class="space-y-1">
          <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">Password</label>
          <div class="relative flex items-center">
            <Lock class="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input 
              :type="showPassword ? 'text' : 'password'" 
              placeholder="Masukkan password Anda..." 
              v-model="password"
              required
              class="w-full bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 pl-10 pr-10 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 rounded-xl outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all font-sans"
            />
            <button 
              type="button" 
              @click="showPassword = !showPassword" 
              class="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 cursor-pointer"
            >
              <EyeOff v-if="showPassword" class="w-4 h-4" />
              <Eye v-else class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Checkbox Ingat Password -->
        <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 pt-0.5">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              v-model="rememberMe"
              class="w-4 h-4 accent-[#ff0000] rounded cursor-pointer"
            />
            <span class="font-medium text-slate-700 dark:text-slate-300">Ingat Password</span>
          </label>
        </div>

        <!-- Tombol Login -->
        <button 
          type="submit" 
          :disabled="isLoading"
          class="w-full bg-gradient-to-r from-red-600 to-[#ff0000] hover:from-red-700 hover:to-red-600 text-white font-extrabold py-3.5 px-4 text-sm rounded-xl shadow-md shadow-red-500/25 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-2"
        >
          <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin" />
          <span v-else class="uppercase tracking-wider">LOGIN WORKSPACE</span>
        </button>

      </form>

      <!-- Footer Info -->
      <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
        <p class="text-[11px] text-slate-400 dark:text-slate-500">
          © 2026 <span class="font-semibold text-slate-600 dark:text-slate-400">PT Hokiindo Raya</span>. All Rights Reserved.
        </p>
      </div>

    </div>

  </div>
</template>