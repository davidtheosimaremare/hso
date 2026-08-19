<script setup>
import { cn } from "@/lib/utils";

const props = defineProps({
  class: { type: null, required: false },
  wrapperClass: { type: null, required: false },
});
</script>

<template>
  <div :class="cn('relative w-full overflow-auto', props.wrapperClass)">
    <table :class="cn('w-full caption-bottom text-sm', props.class)">
      <slot />
    </table>
  </div>
</template>
