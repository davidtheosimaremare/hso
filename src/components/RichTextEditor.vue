<script setup>
import { ref, watch, onMounted } from 'vue'
import { 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough, 
  List, 
  ListOrdered, 
  Heading2, 
  Heading3, 
  Code, 
  Quote, 
  Link, 
  Eraser, 
  AlignLeft, 
  AlignCenter, 
  AlignRight,
  Highlighter
} from 'lucide-vue-next'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: 'Tuliskan detail pekerjaan, catatan teknis, instruksi...'
  }
})

const emit = defineEmits(['update:modelValue'])

const editorRef = ref(null)

const syncContentFromModel = () => {
  if (editorRef.value && editorRef.value.innerHTML !== props.modelValue) {
    editorRef.value.innerHTML = props.modelValue || ''
  }
}

onMounted(() => {
  syncContentFromModel()
})

watch(() => props.modelValue, (newVal) => {
  if (editorRef.value && editorRef.value.innerHTML !== newVal) {
    editorRef.value.innerHTML = newVal || ''
  }
})

const handleInput = () => {
  if (editorRef.value) {
    emit('update:modelValue', editorRef.value.innerHTML)
  }
}

const exec = (command, value = null) => {
  if (editorRef.value) {
    editorRef.value.focus()
  }
  try {
    document.execCommand(command, false, value)
  } catch (e) {
    console.warn('execCommand notice:', e)
  }
  handleInput()
}

const toggleHighlight = () => {
  if (editorRef.value) {
    editorRef.value.focus()
  }

  const selection = window.getSelection()
  let isAlreadyHighlighted = false

  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    let parentEl = range.commonAncestorContainer
    if (parentEl.nodeType === 3) parentEl = parentEl.parentElement

    if (parentEl && editorRef.value.contains(parentEl)) {
      const bg = window.getComputedStyle(parentEl).backgroundColor
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== 'initial') {
        isAlreadyHighlighted = true
      }
    }
  }

  const targetColor = isAlreadyHighlighted ? 'transparent' : '#fef08a'

  try {
    const ok = document.execCommand('hiliteColor', false, targetColor)
    if (!ok) {
      document.execCommand('backColor', false, targetColor)
    }
  } catch (e) {
    document.execCommand('backColor', false, targetColor)
  }

  handleInput()
}

const addLink = () => {
  if (editorRef.value) editorRef.value.focus()
  const url = prompt('Masukkan URL Link:')
  if (url) {
    exec('createLink', url)
  }
}

const clearFormat = () => {
  if (editorRef.value) editorRef.value.focus()
  exec('removeFormat')
}
</script>

<template>
  <div class="border border-input rounded-xl overflow-hidden bg-background focus-within:ring-2 focus-within:ring-red-500 focus-within:border-red-500 transition-all shadow-2xs">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-1 p-2 bg-muted/40 border-b border-border text-xs select-none">
      <!-- Headings -->
      <button 
        type="button" 
        @mousedown.prevent
        @click="exec('formatBlock', '<h2>')" 
        class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title="Judul Besar (H2)"
      >
        <Heading2 class="w-4 h-4" />
      </button>
      <button 
        type="button" 
        @mousedown.prevent
        @click="exec('formatBlock', '<h3>')" 
        class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title="Sub-judul (H3)"
      >
        <Heading3 class="w-4 h-4" />
      </button>

      <div class="h-4 w-px bg-border my-auto mx-0.5"></div>

      <!-- Basic Formatting -->
      <button 
        type="button" 
        @mousedown.prevent
        @click="exec('bold')" 
        class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground font-bold transition-colors cursor-pointer"
        title="Teks Tebal (Bold)"
      >
        <Bold class="w-4 h-4" />
      </button>
      <button 
        type="button" 
        @mousedown.prevent
        @click="exec('italic')" 
        class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground italic transition-colors cursor-pointer"
        title="Teks Miring (Italic)"
      >
        <Italic class="w-4 h-4" />
      </button>
      <button 
        type="button" 
        @mousedown.prevent
        @click="exec('underline')" 
        class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground underline transition-colors cursor-pointer"
        title="Garis Bawah (Underline)"
      >
        <Underline class="w-4 h-4" />
      </button>
      <button 
        type="button" 
        @mousedown.prevent
        @click="exec('strikeThrough')" 
        class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground line-through transition-colors cursor-pointer"
        title="Coretan (Strikethrough)"
      >
        <Strikethrough class="w-4 h-4" />
      </button>

      <!-- Highlight Yellow -->
      <button 
        type="button" 
        @mousedown.prevent
        @click="toggleHighlight" 
        class="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-600 dark:text-amber-400 transition-colors cursor-pointer"
        title="Stabilo / Highlight Yellow"
      >
        <Highlighter class="w-4 h-4" />
      </button>

      <div class="h-4 w-px bg-border my-auto mx-0.5"></div>

      <!-- Lists -->
      <button 
        type="button" 
        @mousedown.prevent
        @click="exec('insertUnorderedList')" 
        class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title="Bullet List (Poin)"
      >
        <List class="w-4 h-4" />
      </button>
      <button 
        type="button" 
        @mousedown.prevent
        @click="exec('insertOrderedList')" 
        class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title="Numbered List (Angka)"
      >
        <ListOrdered class="w-4 h-4" />
      </button>

      <div class="h-4 w-px bg-border my-auto mx-0.5"></div>

      <!-- Quote & Code -->
      <button 
        type="button" 
        @mousedown.prevent
        @click="exec('formatBlock', 'blockquote')" 
        class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title="Kutipan (Quote)"
      >
        <Quote class="w-4 h-4" />
      </button>
      <button 
        type="button" 
        @mousedown.prevent
        @click="exec('formatBlock', 'pre')" 
        class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground font-mono transition-colors cursor-pointer"
        title="Blok Kode / Highlight Code"
      >
        <Code class="w-4 h-4" />
      </button>

      <div class="h-4 w-px bg-border my-auto mx-0.5"></div>

      <!-- Alignment -->
      <button 
        type="button" 
        @mousedown.prevent
        @click="exec('justifyLeft')" 
        class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title="Rata Kiri"
      >
        <AlignLeft class="w-4 h-4" />
      </button>
      <button 
        type="button" 
        @mousedown.prevent
        @click="exec('justifyCenter')" 
        class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title="Rata Tengah"
      >
        <AlignCenter class="w-4 h-4" />
      </button>
      <button 
        type="button" 
        @mousedown.prevent
        @click="exec('justifyRight')" 
        class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title="Rata Kanan"
      >
        <AlignRight class="w-4 h-4" />
      </button>

      <div class="h-4 w-px bg-border my-auto mx-0.5"></div>

      <!-- Link & Eraser -->
      <button 
        type="button" 
        @mousedown.prevent
        @click="addLink" 
        class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title="Sisipkan Link URL"
      >
        <Link class="w-4 h-4" />
      </button>
      <button 
        type="button" 
        @mousedown.prevent
        @click="clearFormat" 
        class="p-1.5 rounded-lg hover:bg-muted text-rose-500 hover:text-rose-600 transition-colors cursor-pointer"
        title="Hapus Format Teks"
      >
        <Eraser class="w-4 h-4" />
      </button>
    </div>

    <!-- Editable Content Area -->
    <div
      ref="editorRef"
      contenteditable="true"
      @input="handleInput"
      @blur="handleInput"
      class="rich-editor-content p-3.5 min-h-[140px] max-h-[300px] overflow-y-auto text-xs md:text-sm text-foreground focus:outline-none leading-relaxed prose prose-sm dark:prose-invert max-w-none sidebar-thin"
      :data-placeholder="placeholder"
    ></div>
  </div>
</template>

<style scoped>
[contenteditable="true"]:empty:before {
  content: attr(data-placeholder);
  color: var(--color-muted-foreground, #94a3b8);
  pointer-events: none;
  display: block;
}

/* Explicit CSS Styles for Contenteditable HTML lists, code & highlight */
.rich-editor-content :deep(ul),
.rich-editor-content ul {
  list-style-type: disc !important;
  padding-left: 1.5rem !important;
  margin-top: 0.5rem !important;
  margin-bottom: 0.5rem !important;
}

.rich-editor-content :deep(ol),
.rich-editor-content ol {
  list-style-type: decimal !important;
  padding-left: 1.5rem !important;
  margin-top: 0.5rem !important;
  margin-bottom: 0.5rem !important;
}

.rich-editor-content :deep(li),
.rich-editor-content li {
  margin-bottom: 0.25rem !important;
  display: list-item !important;
}

.rich-editor-content :deep(blockquote),
.rich-editor-content blockquote {
  border-left: 4px solid #3b82f6 !important;
  padding-left: 1rem !important;
  margin: 0.5rem 0 !important;
  font-style: italic !important;
  color: #64748b !important;
}

.rich-editor-content :deep(pre),
.rich-editor-content pre {
  background-color: #1e293b !important;
  color: #f8fafc !important;
  padding: 0.75rem !important;
  border-radius: 0.5rem !important;
  font-family: monospace !important;
  white-space: pre-wrap !important;
  margin: 0.5rem 0 !important;
}

.rich-editor-content :deep(h2),
.rich-editor-content h2 {
  font-size: 1.25rem !important;
  font-weight: 800 !important;
  margin-top: 0.75rem !important;
  margin-bottom: 0.5rem !important;
}

.rich-editor-content :deep(h3),
.rich-editor-content h3 {
  font-size: 1.1rem !important;
  font-weight: 700 !important;
  margin-top: 0.5rem !important;
  margin-bottom: 0.25rem !important;
}
</style>
