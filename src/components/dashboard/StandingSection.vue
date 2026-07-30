<script setup>
import { AlertCircle } from 'lucide-vue-next'
import HSOPriorityCard from './HSOPriorityCard.vue'
defineProps({
  sqList: { type: Array, required: true },
  soList: { type: Array, required: true },
  siList: { type: Array, required: true },
  poList: { type: Array, default: () => [] },
  shipmentsList: { type: Array, default: () => [] },
  yearlyTarget: { type: Number, required: true },
  targetYear: { type: Number, required: true },
  isLoading: { type: Boolean, default: false }
})
defineEmits(['refresh'])
</script>

<template>
  <div class="space-y-4">
    <!-- Header Standing Hari Ini -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="p-1.5 bg-red-100 dark:bg-red-950/30 rounded-lg text-red-600 dark:text-red-400">
          <AlertCircle class="w-4 h-4" />
        </div>
        <h2 class="text-lg font-black text-slate-900 dark:text-white tracking-tight">Standing Hari Ini</h2>
      </div>
      <span class="text-xs text-slate-400 font-semibold uppercase tracking-wider hidden sm:inline-block">
        Pusat Prioritas Kerja Terkini
      </span>
    </div>

    <!-- HSO Priority (Full Width) -->
    <div class="w-full">
      <HSOPriorityCard :soList="soList" :shipmentsList="shipmentsList" :poList="poList" :isLoading="isLoading" :targetYear="targetYear" @refresh="$emit('refresh')" />
    </div>
  </div>
</template>
