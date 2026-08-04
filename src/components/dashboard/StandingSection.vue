<script setup>
import { CheckSquare } from 'lucide-vue-next'
import HSOPriorityCard from './HSOPriorityCard.vue'
import InvoicePriorityCard from './InvoicePriorityCard.vue'

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
    <!-- Header Task Prioritas Sales & Logistik -->
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-bold text-foreground tracking-tight">Task Prioritas Sales & Logistik</h2>
      <span class="text-xs text-muted-foreground font-medium uppercase tracking-wider hidden sm:inline-block">
        Daftar Tugas & Action Items
      </span>
    </div>

    <!-- HSO Priority (Full Width) -->
    <div class="w-full">
      <HSOPriorityCard :soList="soList" :shipmentsList="shipmentsList" :poList="poList" :isLoading="isLoading" :targetYear="targetYear" @refresh="$emit('refresh')" />
    </div>

    <!-- Invoice Priority / Tagihan Belum Dibayar (Full Width) -->
    <div class="w-full">
      <InvoicePriorityCard :soList="soList" :siList="siList" :isLoading="isLoading" :targetYear="targetYear" />
    </div>
  </div>
</template>
