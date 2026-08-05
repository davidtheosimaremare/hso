<script setup>
import { ref, onMounted, watch } from 'vue'
import {
  Bold, Italic, Underline, Heading1, List, ListOrdered,
  Quote, RemoveFormatting
} from 'lucide-vue-next'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: 'Tulis detail/angle konten di sini...'
  },
  minHeight: {
    type: String,
    default: '100px'
  }
})

const emit = defineEmits(['update:modelValue'])

const editorRef = ref(null)
const isFocused = ref(false)
const activeStates = ref({
  bold: false,
  italic: false,
  underline: false,
  ul: false,
  ol: false,
  h3: false,
  quote: false
})

const normalizeInitialContent = (text) => {
  if (!text) return ''
  if (/<[a-z][\s\S]*>/i.test(text)) return text

  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>')
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>')
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')
  html = html.replace(/^&gt;\s?(.*$)/gim, '<blockquote>$1</blockquote>')
  html = html.replace(/^[\-\*]\s+(.*$)/gim, '<li>$1</li>')
  html = html.replace(/\n/g, '<br>')
  return html
}

onMounted(() => {
  if (editorRef.value) {
    editorRef.value.innerHTML = normalizeInitialContent(props.modelValue)
  }
})

watch(() => props.modelValue, (newVal) => {
  if (editorRef.value && document.activeElement !== editorRef.value) {
    editorRef.value.innerHTML = normalizeInitialContent(newVal)
  }
})

const updateValue = () => {
  if (!editorRef.value) return
  const html = editorRef.value.innerHTML
  if (html === '<br>' || html === '<p><br></p>' || html.trim() === '') {
    emit('update:modelValue', '')
  } else {
    emit('update:modelValue', html)
  }
  checkActiveStates()
}

const exec = (command, value = null) => {
  if (!editorRef.value) return
  editorRef.value.focus()
  document.execCommand(command, false, value)
  updateValue()
}

const checkActiveStates = () => {
  try {
    activeStates.value.bold = document.queryCommandState('bold')
    activeStates.value.italic = document.queryCommandState('italic')
    activeStates.value.underline = document.queryCommandState('underline')
    activeStates.value.ul = document.queryCommandState('insertUnorderedList')
    activeStates.value.ol = document.queryCommandState('insertOrderedList')
    
    const block = document.queryCommandValue('formatBlock')
    activeStates.value.h3 = block === 'h3' || block === 'H3' || block === 'h2' || block === 'H2'
    activeStates.value.quote = block === 'blockquote' || block === 'BLOCKQUOTE'
  } catch (e) {}
}

const handleKeydown = (e) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modifier = isMac ? e.metaKey : e.ctrlKey

  if (modifier) {
    const key = e.key.toLowerCase()
    if (key === 'b') {
      e.preventDefault()
      exec('bold')
    } else if (key === 'i') {
      e.preventDefault()
      exec('italic')
    } else if (key === 'u') {
      e.preventDefault()
      exec('underline')
    }
  }
}

const formatHeading = () => {
  if (activeStates.value.h3) {
    exec('formatBlock', '<p>')
  } else {
    exec('formatBlock', '<h3>')
  }
}

const formatQuote = () => {
  if (activeStates.value.quote) {
    exec('formatBlock', '<p>')
  } else {
    exec('formatBlock', '<blockquote>')
  }
}
</script>

<template>
  <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-[#1e293b] focus-within:border-red-500 dark:focus-within:border-red-500 transition-colors shadow-xs">
    <!-- Toolbar -->
    <div class="flex items-center gap-1 flex-wrap p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50">
      <button
        type="button"
        @click="exec('bold')"
        class="p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
        :class="activeStates.bold ? 'bg-red-500 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'"
        title="Bold (Ctrl/Cmd + B)"
      >
        <Bold class="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        @click="exec('italic')"
        class="p-1.5 rounded-lg text-xs font-bold transition-all"
        :class="activeStates.italic ? 'bg-red-500 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'"
        title="Italic (Ctrl/Cmd + I)"
      >
        <Italic class="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        @click="exec('underline')"
        class="p-1.5 rounded-lg text-xs font-bold transition-all"
        :class="activeStates.underline ? 'bg-red-500 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'"
        title="Underline (Ctrl/Cmd + U)"
      >
        <Underline class="w-3.5 h-3.5" />
      </button>

      <div class="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1"></div>

      <button
        type="button"
        @click="formatHeading"
        class="p-1.5 rounded-lg text-xs font-bold transition-all"
        :class="activeStates.h3 ? 'bg-red-500 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'"
        title="Heading / Judul Sub-Poin"
      >
        <Heading1 class="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        @click="exec('insertUnorderedList')"
        class="p-1.5 rounded-lg text-xs font-bold transition-all"
        :class="activeStates.ul ? 'bg-red-500 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'"
        title="Bullet List (- Poin)"
      >
        <List class="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        @click="exec('insertOrderedList')"
        class="p-1.5 rounded-lg text-xs font-bold transition-all"
        :class="activeStates.ol ? 'bg-red-500 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'"
        title="Numbered List (1. Poin)"
      >
        <ListOrdered class="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        @click="formatQuote"
        class="p-1.5 rounded-lg text-xs font-bold transition-all"
        :class="activeStates.quote ? 'bg-red-500 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'"
        title="Quote / Catatan Spesial"
      >
        <Quote class="w-3.5 h-3.5" />
      </button>

      <div class="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1"></div>

      <button
        type="button"
        @click="exec('removeFormat')"
        class="p-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all"
        title="Hapus Format Teks"
      >
        <RemoveFormatting class="w-3.5 h-3.5" />
      </button>

      <span class="ml-auto text-[10px] text-slate-400 hidden sm:inline font-mono">
        Shortcut: Ctrl/Cmd + B, I, U
      </span>
    </div>

    <!-- Visual Editor Editable Container -->
    <div class="relative p-3">
      <div
        ref="editorRef"
        contenteditable="true"
        @input="updateValue"
        @keyup="checkActiveStates"
        @mouseup="checkActiveStates"
        @keydown="handleKeydown"
        @focus="isFocused = true; checkActiveStates()"
        @blur="isFocused = false"
        class="rich-text-content outline-none text-xs text-slate-800 dark:text-slate-100 font-sans leading-relaxed overflow-y-auto"
        :style="{ minHeight: minHeight }"
      ></div>

      <!-- Placeholder -->
      <div
        v-if="!modelValue || modelValue === '<br>' || modelValue.trim() === ''"
        class="absolute top-3 left-3 pointer-events-none text-xs text-slate-400 dark:text-slate-500 font-sans"
      >
        {{ placeholder }}
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.rich-text-content) h3,
:deep(.rich-text-content) h2 {
  font-weight: 800;
  font-size: 0.9rem;
  margin-top: 0.5rem;
  margin-bottom: 0.25rem;
  color: inherit;
}

:deep(.rich-text-content) strong {
  font-weight: 700;
}

:deep(.rich-text-content) em {
  font-style: italic;
}

:deep(.rich-text-content) u {
  text-decoration: underline;
}

:deep(.rich-text-content) ul {
  list-style-type: disc;
  padding-left: 1.25rem;
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}

:deep(.rich-text-content) ol {
  list-style-type: decimal;
  padding-left: 1.25rem;
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}

:deep(.rich-text-content) blockquote {
  border-left: 3px solid #ef4444;
  padding-left: 0.75rem;
  font-style: italic;
  margin-top: 0.35rem;
  margin-bottom: 0.35rem;
  opacity: 0.9;
}
</style>
