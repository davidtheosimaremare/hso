<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { 
  Plus, 
  Calendar, 
  User, 
  Clock,
  CheckCircle,
  PlayCircle,
  X,
  Trash2,
  Paperclip,
  Loader2,
  Folder,
} from 'lucide-vue-next'

const router = useRouter()
const isLoading = ref(true)
const isSubmitting = ref(false)
const users = ref([])
const currentUserEmail = ref('')

// Kanban columns
const todoTasks = ref([])
const inProgressTasks = ref([])
const doneTasks = ref([])

// Modal State
const isModalOpen = ref(false)
const editingTask = ref(null)
const formData = ref({ title: '', description: '', assignee: '', target_date: '' })
const fileInput = ref(null)
const selectedFile = ref(null)

// History State
const allTasksRaw = ref([])
const availablePeriods = ref([])
const activePeriod = ref('')

// Drag & Drop
const draggedTask = ref(null)
const draggingOverColumn = ref('')

// ---- Helpers ----
const getPeriodFromDate = (dateString) => {
  const date = new Date(dateString)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
const formatPeriodLabel = (period) => {
  const [year, month] = period.split('-')
  return new Date(year, month - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
}
const setCurrentPeriod = () => {
  const now = new Date()
  activePeriod.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
const filterTasksByPeriod = () => {
  const filtered = allTasksRaw.value.filter(t => getPeriodFromDate(t.created_at) === activePeriod.value)
  todoTasks.value = filtered.filter(t => t.status === 'TODO')
  inProgressTasks.value = filtered.filter(t => t.status === 'IN_PROGRESS')
  doneTasks.value = filtered.filter(t => t.status === 'DONE')
}
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(dateStr))
}
const isOverdue = (dateStr) => {
  if (!dateStr) return false
  const target = new Date(dateStr)
  target.setHours(23, 59, 59, 999)
  return new Date() > target
}

// ---- Data Loading ----
const fetchTasks = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('boq_requests')
      .select('*')
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: false })
    if (error) throw error

    allTasksRaw.value = data || []
    const periods = new Set(allTasksRaw.value.map(t => getPeriodFromDate(t.created_at)))
    const currentPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    periods.add(currentPeriod)
    availablePeriods.value = Array.from(periods).sort((a, b) => b.localeCompare(a))
    if (!activePeriod.value) setCurrentPeriod()
    filterTasksByPeriod()
  } catch (err) {
    console.error('Error fetching tasks:', err)
    alert('Gagal memuat data permintaan.')
  } finally {
    isLoading.value = false
  }
}

const fetchUsers = async () => {
  try {
    const { data, error } = await supabase.from('user_access').select('email').order('email')
    if (error) throw error
    users.value = data || []
  } catch (err) {
    console.error('Error fetching users:', err)
  }
}

onMounted(async () => {
  const { data } = await supabase.auth.getUser()
  currentUserEmail.value = data?.user?.email || ''
  fetchTasks()
  fetchUsers()
})

// ---- Drag & Drop ----
const onDragStart = (evt, task) => {
  draggedTask.value = task
  if (evt.dataTransfer) {
    evt.dataTransfer.effectAllowed = 'move'
    evt.dataTransfer.setData('text/plain', String(task.id))
  }
}
const onDragOver = (evt, columnStatus) => {
  evt.preventDefault()
  if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'move'
  draggingOverColumn.value = columnStatus
}
const onDragLeave = (evt, columnStatus) => {
  if (draggingOverColumn.value === columnStatus) draggingOverColumn.value = ''
}
const onDrop = async (evt, newStatus) => {
  evt.preventDefault()
  draggingOverColumn.value = ''
  const task = draggedTask.value
  if (!task || task.status === newStatus) { draggedTask.value = null; return }
  await updateStatus(task.id, newStatus)
  draggedTask.value = null
}

// ---- Modal ----
const openModal = (task = null) => {
  if (task) {
    editingTask.value = task
    formData.value = {
      title: task.title,
      description: task.description || '',
      assignee: task.assignee || '',
      target_date: task.target_date || ''
    }
  } else {
    editingTask.value = null
    formData.value = { title: '', description: '', assignee: '', target_date: '' }
  }
  selectedFile.value = null
  if (fileInput.value) fileInput.value.value = ''
  isModalOpen.value = true
}
const closeModal = () => { isModalOpen.value = false }
const handleFileChange = (event) => { selectedFile.value = event.target.files[0] || null }

// ---- Submit ----
const submitForm = async () => {
  if (!formData.value.title) { alert('Judul permintaan harus diisi!'); return }
  isSubmitting.value = true
  try {
    let fileUrl = editingTask.value?.file_url
    let fileName = editingTask.value?.file_name
    if (selectedFile.value) {
      const fileExt = selectedFile.value.name.split('.').pop()
      const filePath = `uploads/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from('boq-files').upload(filePath, selectedFile.value)
      if (uploadError) throw uploadError
      const { data: publicUrlData } = supabase.storage.from('boq-files').getPublicUrl(filePath)
      fileUrl = publicUrlData.publicUrl
      fileName = selectedFile.value.name
    }

    const payload = {
      title: formData.value.title,
      description: formData.value.description,
      assignee: formData.value.assignee,
      target_date: formData.value.target_date || null,
      file_url: fileUrl,
      file_name: fileName
    }

    if (editingTask.value) {
      const { error } = await supabase.from('boq_requests').update(payload).eq('id', editingTask.value.id)
      if (error) throw error
    } else {
      const { data: userData } = await supabase.auth.getUser()
      payload.created_by = userData?.user?.email || 'Unknown'
      payload.status = 'TODO'
      const { error } = await supabase.from('boq_requests').insert([payload])
      if (error) console.warn('Insert notice:', error)
    }

    closeModal()
    await fetchTasks()
  } catch (err) {
    console.error('Error submitting task:', err)
    alert('Terjadi kesalahan saat menyimpan data.')
  } finally {
    isSubmitting.value = false
  }
}

// ---- Status Update (status column only - avoids DB trigger issues) ----
const updateStatus = async (taskId, newStatus) => {
  const task = allTasksRaw.value.find(t => String(t.id) === String(taskId))
  if (!task) return

  // Optimistic update
  task.status = newStatus
  filterTasksByPeriod()

  // Sync to DB - only update status column
  try {
    const { error } = await supabase
      .from('boq_requests')
      .update({ status: newStatus })
      .eq('id', taskId)
    if (error) {
      console.warn('Status update error, reverting:', error.message)
      await fetchTasks()
    }
  } catch (err) {
    console.warn('DB error:', err)
    await fetchTasks()
  }
}

// ---- Delete ----
const deleteTask = async (taskId) => {
  if (!confirm('Apakah Anda yakin ingin menghapus permintaan ini?')) return
  allTasksRaw.value = allTasksRaw.value.filter(t => String(t.id) !== String(taskId))
  filterTasksByPeriod()
  try {
    const { error } = await supabase.from('boq_requests').delete().eq('id', taskId)
    if (error) { console.warn('Delete error:', error.message); await fetchTasks() }
  } catch (err) {
    console.warn('Failed to delete:', err)
    await fetchTasks()
  }
}
</script>


<template>
  <div class="p-4 md:p-8 space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Permintaan</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Antrian permintaan penawaran</p>
      </div>
      <button @click="openModal()" class="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-blue-700 transition-colors gap-2">
        <Plus class="w-4 h-4" />
        Tambah Permintaan
      </button>
    </div>

    <!-- Kanban Board -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 items-start h-full pb-10">
      
      <!-- TODO COLUMN -->
      <div 
        class="flex flex-col bg-slate-100/50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 h-full overflow-hidden transition-all duration-200"
        :class="{ 'ring-2 ring-blue-500 bg-blue-50/40 dark:bg-blue-900/20': draggingOverColumn === 'TODO' }"
        @dragover="onDragOver($event, 'TODO')"
        @dragleave="onDragLeave($event, 'TODO')"
        @drop="onDrop($event, 'TODO')"
      >
        <div class="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 flex justify-between items-center">
          <div class="flex items-center gap-2">
            <div class="p-1.5 rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <Clock class="w-4 h-4" />
            </div>
            <h3 class="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-sm">To Do</h3>
          </div>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            {{ todoTasks.length }}
          </span>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]">
          <div v-if="isLoading && todoTasks.length === 0" class="flex justify-center p-4">
            <Loader2 class="w-6 h-6 animate-spin text-slate-400" />
          </div>
          
          <div 
            v-for="task in todoTasks" 
            :key="task.id" 
            draggable="true"
            @dragstart="onDragStart($event, task)"
            class="bg-white dark:bg-slate-900 p-3 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 group hover:border-blue-300 transition-all cursor-grab active:cursor-grabbing select-none"
          >
            <div v-if="task.task_number" class="mb-1">
              <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">TASK-{{ task.task_number }}</span>
            </div>
            <div class="flex justify-between items-start mb-1.5">
              <h4 class="font-bold text-sm text-slate-900 dark:text-white leading-tight cursor-pointer hover:text-blue-600" @click="router.push('/permintaan/' + task.id)">{{ task.title }}</h4>
              <button v-if="task.created_by === currentUserEmail" @click.stop="deleteTask(task.id)" class="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1" title="Hapus Tugas">
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
            <p v-if="task.description" class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-2 leading-snug">{{ task.description }}</p>
            
            <div class="flex flex-wrap items-center gap-1.5 mb-2">
              <span v-if="task.assignee" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[9px] font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[100px]">
                <User class="w-2.5 h-2.5" /> {{ task.assignee.split('@')[0] }}
              </span>
              <span v-if="task.target_date" :class="[
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold',
                isOverdue(task.target_date) ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              ]">
                <Calendar class="w-2.5 h-2.5" /> {{ formatDate(task.target_date) }}
              </span>
            </div>

            <div v-if="task.file_url">
               <a :href="task.file_url" target="_blank" class="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 font-medium bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">
                 <Paperclip class="w-2.5 h-2.5" />
                 <span class="truncate max-w-[150px]">{{ task.file_name || 'Lihat File' }}</span>
               </a>
            </div>

            <!-- Quick Actions -->
            <div class="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-1.5">
              <button @click.stop="updateStatus(task.id, 'IN_PROGRESS')" class="px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-[10px] font-bold transition-colors flex items-center gap-1" title="Pindah ke In Progress">
                <PlayCircle class="w-3 h-3" /> In Progress
              </button>
              <button @click.stop="updateStatus(task.id, 'DONE')" class="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-[10px] font-bold transition-colors flex items-center gap-1" title="Pindah ke Done">
                <CheckCircle class="w-3 h-3" /> Done
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- IN PROGRESS COLUMN -->
      <div 
        class="flex flex-col bg-slate-100/50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 h-full overflow-hidden transition-all duration-200"
        :class="{ 'ring-2 ring-blue-500 bg-blue-50/40 dark:bg-blue-900/20': draggingOverColumn === 'IN_PROGRESS' }"
        @dragover="onDragOver($event, 'IN_PROGRESS')"
        @dragleave="onDragLeave($event, 'IN_PROGRESS')"
        @drop="onDrop($event, 'IN_PROGRESS')"
      >
        <div class="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 flex justify-between items-center">
          <div class="flex items-center gap-2">
            <div class="p-1.5 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <PlayCircle class="w-4 h-4" />
            </div>
            <h3 class="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-sm">In Progress</h3>
          </div>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            {{ inProgressTasks.length }}
          </span>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]">
          <div 
            v-for="task in inProgressTasks" 
            :key="task.id" 
            draggable="true"
            @dragstart="onDragStart($event, task)"
            class="bg-white dark:bg-slate-900 p-3 rounded-lg shadow-sm border-l-2 border-l-blue-500 border border-slate-200 dark:border-slate-700 group transition-all cursor-grab active:cursor-grabbing select-none"
          >
            <div v-if="task.task_number" class="mb-1">
              <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">TASK-{{ task.task_number }}</span>
            </div>
            <div class="flex justify-between items-start mb-1.5">
              <h4 class="font-bold text-sm text-slate-900 dark:text-white leading-tight cursor-pointer hover:text-blue-600" @click="router.push('/permintaan/' + task.id)">{{ task.title }}</h4>
              <button v-if="task.created_by === currentUserEmail" @click.stop="deleteTask(task.id)" class="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1" title="Hapus Tugas">
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
            <p v-if="task.description" class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-2 leading-snug">{{ task.description }}</p>
            
            <div class="flex flex-wrap items-center gap-1.5 mb-2">
              <span v-if="task.assignee" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[9px] font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[100px]">
                <User class="w-2.5 h-2.5" /> {{ task.assignee.split('@')[0] }}
              </span>
              <span v-if="task.target_date" :class="[
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold',
                isOverdue(task.target_date) ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              ]">
                <Calendar class="w-2.5 h-2.5" /> {{ formatDate(task.target_date) }}
              </span>
            </div>

            <div v-if="task.file_url">
               <a :href="task.file_url" target="_blank" class="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 font-medium bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">
                 <Paperclip class="w-2.5 h-2.5" />
                 <span class="truncate max-w-[150px]">{{ task.file_name || 'Lihat File' }}</span>
               </a>
            </div>

            <!-- Quick Actions -->
            <div class="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1">
              <button @click.stop="updateStatus(task.id, 'TODO')" class="px-2 py-1 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 text-[10px] font-bold transition-colors flex items-center gap-1" title="Kembalikan ke To Do">
                <Clock class="w-3 h-3" /> To Do
              </button>
              <button @click.stop="updateStatus(task.id, 'DONE')" class="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-[10px] font-bold transition-colors flex items-center gap-1" title="Pindah ke Done">
                <CheckCircle class="w-3 h-3" /> Done
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- DONE COLUMN -->
      <div 
        class="flex flex-col bg-slate-100/50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 h-full overflow-hidden opacity-80 transition-all duration-200"
        :class="{ 'ring-2 ring-emerald-500 bg-emerald-50/40 dark:bg-emerald-900/20': draggingOverColumn === 'DONE' }"
        @dragover="onDragOver($event, 'DONE')"
        @dragleave="onDragLeave($event, 'DONE')"
        @drop="onDrop($event, 'DONE')"
      >
        <div class="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 flex justify-between items-center">
          <div class="flex items-center gap-2">
            <div class="p-1.5 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              <CheckCircle class="w-4 h-4" />
            </div>
            <h3 class="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-sm">Done</h3>
          </div>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            {{ doneTasks.length }}
          </span>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]">
          <div 
            v-for="task in doneTasks" 
            :key="task.id" 
            draggable="true"
            @dragstart="onDragStart($event, task)"
            class="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800 cursor-grab active:cursor-grabbing opacity-75 hover:opacity-100 transition-all group select-none"
          >
            <div v-if="task.task_number" class="mb-1">
              <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">TASK-{{ task.task_number }}</span>
            </div>
            <div class="flex justify-between items-start mb-1.5">
              <h4 class="font-bold text-sm text-slate-600 dark:text-slate-400 leading-tight line-through cursor-pointer hover:text-blue-600" @click="router.push('/permintaan/' + task.id)">{{ task.title }}</h4>
              <button v-if="task.created_by === currentUserEmail" @click.stop="deleteTask(task.id)" class="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1" title="Hapus Tugas">
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
            
            <div class="flex flex-wrap items-center gap-1.5 mt-1">
              <span v-if="task.assignee" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-200/50 dark:bg-slate-800 text-[9px] font-semibold text-slate-500 truncate max-w-[100px]">
                <User class="w-2.5 h-2.5" /> {{ task.assignee.split('@')[0] }}
              </span>
            </div>

            <!-- Quick Actions -->
            <div class="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-start gap-1.5">
              <button @click.stop="updateStatus(task.id, 'IN_PROGRESS')" class="px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-[10px] font-bold transition-colors flex items-center gap-1" title="Kembalikan ke In Progress">
                <PlayCircle class="w-3 h-3" /> In Progress
              </button>
              <button @click.stop="updateStatus(task.id, 'TODO')" class="px-2 py-1 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-[10px] font-bold transition-colors flex items-center gap-1" title="Kembalikan ke To Do">
                <Clock class="w-3 h-3" /> To Do
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Monthly History Folders -->
    <div v-if="availablePeriods.length > 0" class="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
      <h3 class="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Riwayat Bulanan</h3>
      <div class="flex flex-wrap gap-3">
        <button 
          v-for="period in availablePeriods" 
          :key="period"
          @click="activePeriod = period; filterTasksByPeriod()"
          :class="[
            'inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm border',
            activePeriod === period 
              ? 'bg-blue-600 text-white border-blue-600 shadow-blue-500/30' 
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          ]"
        >
          <Folder class="w-4 h-4 mr-2" :class="activePeriod === period ? 'text-blue-100' : 'text-blue-500'" />
          {{ formatPeriodLabel(period) }}
        </button>
      </div>
    </div>

    <!-- Modal Form -->
    <div v-if="isModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">{{ editingTask ? 'Edit Permintaan' : 'Permintaan Baru' }}</h2>
          <button @click="closeModal" class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Judul <span class="text-red-500">*</span></label>
            <input v-model="formData.title" type="text" placeholder="Permintaan Penawaran" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Deskripsi / Catatan</label>
            <textarea v-model="formData.description" rows="3" placeholder="Tuliskan spesifikasi atau keterangan..." class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Assignee (Delegasi)</label>
              <select v-model="formData.assignee" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Pilih Tim/User --</option>
                <option v-for="u in users" :key="u.email" :value="u.email">{{ u.email }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Target Selesai</label>
              <input v-model="formData.target_date" type="date" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Upload File (Excel/PDF)</label>
            <input type="file" ref="fileInput" @change="handleFileChange" accept=".pdf,.xls,.xlsx,.csv" class="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-slate-800 dark:file:text-slate-300" />
            <p v-if="editingTask?.file_url && !selectedFile" class="text-xs text-slate-500 mt-2 flex items-center gap-1">
              File tersimpan: <a :href="editingTask.file_url" target="_blank" class="text-blue-600 underline">{{ editingTask.file_name || 'Lihat' }}</a>
            </p>
          </div>
        </div>
        <div class="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
          <button @click="closeModal" class="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors">Batal</button>
          <button @click="submitForm" :disabled="isSubmitting" class="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2">
            <Loader2 v-if="isSubmitting" class="w-4 h-4 animate-spin" />
            Simpan
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
