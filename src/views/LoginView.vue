<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase' 
import { Loader2 } from 'lucide-vue-next'

const router = useRouter()
const email = ref('')
const password = ref('')
const isLoading = ref(false)
const errorMessage = ref('')

const handleLogin = async () => {
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

  // 3. Jika Sukses, Redirect ke Dashboard
  if (data.user) {
    router.push('/sales-orders')
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-white font-source-code">
    
    <div class="w-[300px] text-center">
      
      <div class="flex items-center justify-center mb-8 gap-3">
        <div class="w-10 h-10 bg-[#e60000] rounded-full flex items-center justify-center text-white font-bold text-2xl select-none">
          H
        </div>
        <div class="text-2xl font-bold text-[#333333] tracking-tighter">
          HSO TRACKER
        </div>
      </div>

      <div class="space-y-4">
        
        <div v-if="errorMessage" class="bg-red-50 text-red-600 p-2 text-xs font-bold mb-2 animate-pulse border border-red-100">
          {{ errorMessage }}
        </div>

        <input 
          type="text" 
          placeholder="Username" 
          v-model="email"
          class="w-full bg-[#eaeaea] p-3 text-sm text-[#333333] placeholder-gray-500 border-none outline-none focus:ring-2 focus:ring-[#e60000] transition-all font-source-code"
        />

        <input 
          type="password" 
          placeholder="Password" 
          v-model="password"
          @keyup.enter="handleLogin"
          class="w-full bg-[#eaeaea] p-3 text-sm text-[#333333] placeholder-gray-500 border-none outline-none focus:ring-2 focus:ring-[#e60000] transition-all font-source-code"
        />

        <button 
          @click="handleLogin" 
          :disabled="isLoading"
          class="w-full bg-[#ff0000] text-white font-bold p-3 text-base hover:bg-[#d60000] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-source-code"
        >
          <Loader2 v-if="isLoading" class="w-5 h-5 animate-spin" />
          <span v-else>LOGIN</span>
        </button>

      </div>
    </div>

  </div>
</template>

<style>
/* Import Font Source Code Pro dari Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;600;700&display=swap');

.font-source-code {
  font-family: 'Source Code Pro', monospace;
}
</style>