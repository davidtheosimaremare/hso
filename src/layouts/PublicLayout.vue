<script setup>
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
    <header class="bg-white border-b py-4 px-6 flex justify-center shadow-sm">
      <h1 class="text-xl font-bold text-red-600 tracking-tight">HSO Tracker Public</h1>
    </header>

    <main class="flex-1 flex flex-col items-center justify-center p-4">
      <RouterView />
    </main>
    
    <footer class="py-4 text-center text-xs text-slate-400">
      &copy; 2025 Hokiindo Raya. All Rights Reserved.
    </footer>
  </div>
</template>