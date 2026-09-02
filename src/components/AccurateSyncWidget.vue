<script setup>
import { computed } from 'vue'
import { useAccurateSync } from '@/composables/useAccurateSync'
import { 
  Database, RefreshCcw, CheckCircle, XCircle, Info, X, Zap, Clock
} from 'lucide-vue-next'

const props = defineProps({
  open: { type: Boolean, default: false }
})
const emit = defineEmits(['update:open'])

const isOpen = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v)
})

const {
  isSyncing, syncStep, syncProgress, syncLog,
  lastSyncFormatted,
  syncDelta
} = useAccurateSync()

const syncStepLabel = computed(() => {
  switch (syncStep.value) {
    case 'delta': return 'Menyinkronkan data hari ini...'
    case 'done': return 'Selesai!'
    default: return ''
  }
})

const syncLogIcon = (type) => {
  if (type === 'success') return CheckCircle
  if (type === 'error' || type === 'warn') return XCircle
  return Info
}

const syncLogColor = (type) => {
  if (type === 'success') return 'text-emerald-500'
  if (type === 'error') return 'text-red-500'
  if (type === 'warn') return 'text-amber-500'
  return 'text-slate-400'
}
</script>

<template>
  <div class="fixed bottom-20 md:bottom-20 left-4 md:left-[276px] z-50 flex flex-col items-start gap-3">
    <!-- Panel (visible when open) -->
    <transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="opacity-0 translate-y-4 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-4 scale-95"
    >
      <div v-if="isOpen" class="w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div class="flex items-center gap-2.5">
            <div class="p-1.5 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg shadow-sm shadow-violet-500/20">
              <Database class="w-3.5 h-3.5 text-white"/>
            </div>
            <div>
              <h2 class="font-bold text-slate-900 dark:text-white text-sm">Sync Cepat Accurate</h2>
              <p class="text-[10px] text-slate-400 dark:text-slate-500">
                <span v-if="lastSyncFormatted">Terakhir: <span class="font-semibold text-slate-600 dark:text-slate-300">{{ lastSyncFormatted }}</span></span>
                <span v-else class="text-amber-500">Belum pernah sync</span>
              </p>
            </div>
          </div>
          <button @click="isOpen = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer">
            <X class="w-4 h-4"/>
          </button>
        </div>

        <!-- Progress bar (visible while syncing) -->
        <div v-if="isSyncing" class="px-4 pt-3 pb-0">
          <div class="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1">
            <span class="font-medium text-violet-600 dark:text-violet-400 truncate pr-2">{{ syncStepLabel }}</span>
            <span>{{ syncProgress }}%</span>
          </div>
          <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1 overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
              :style="{ width: syncProgress + '%' }"
            />
          </div>
        </div>

        <!-- Single Action Button & Info Note -->
        <div class="p-4 flex flex-col gap-3 border-b border-slate-100 dark:border-slate-800">
          <button
            @click="syncDelta()"
            :disabled="isSyncing"
            class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md shadow-violet-500/20 transition-all hover:shadow-lg active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            <RefreshCcw :class="['w-4 h-4', isSyncing && 'animate-spin']"/>
            {{ isSyncing ? 'Menyinkronkan Data...' : 'Sync Cepat (Data Hari Ini)' }}
          </button>

          <div class="p-2.5 rounded-xl bg-violet-50/70 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/30 text-[11px] text-violet-700 dark:text-violet-300 space-y-1">
            <div class="flex items-start gap-1.5 font-medium">
              <Zap class="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
              <span>Sinkronisasi data dokumen yang diperbarui hari ini.</span>
            </div>
            <div class="flex items-start gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
              <Clock class="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
              <span>Sync keseluruhan otomatis berjalan setiap 1 jam di server.</span>
            </div>
          </div>
        </div>

        <!-- Logs -->
        <div class="p-3 bg-slate-50/50 dark:bg-slate-900/50 min-h-[80px] max-h-[140px] overflow-y-auto">
          <div v-if="syncLog.length > 0" class="space-y-1 pr-1">
            <div
              v-for="(log, i) in syncLog"
              :key="i"
              class="flex items-start gap-1.5 text-[10px] py-1 px-1.5 rounded-md"
              :class="{
                'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-800 dark:text-emerald-300': log.type === 'success',
                'bg-red-50 dark:bg-red-900/10 text-red-800 dark:text-red-300': log.type === 'error',
                'bg-amber-50 dark:bg-amber-900/10 text-amber-800 dark:text-amber-300': log.type === 'warn',
                'bg-slate-100 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300': log.type === 'info',
              }"
            >
              <component :is="syncLogIcon(log.type)" class="w-3 h-3 mt-0.5 flex-shrink-0" :class="syncLogColor(log.type)"/>
              <span class="flex-1 leading-tight">{{ log.message }}</span>
            </div>
          </div>
          <div v-else class="text-[10px] text-slate-400 dark:text-slate-500 italic text-center py-3">
            Klik tombol di atas untuk sinkronisasi data hari ini.
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>
