<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
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
  FileText,
  Search,
  Building2,
  Check
} from 'lucide-vue-next'

const router = useRouter()
const isLoading = ref(true)
const isSubmitting = ref(false)
const users = ref([])
const currentUserEmail = ref('')
const accurateCustomers = ref([])

// Customer Search Combobox State
const customerComboboxRef = ref(null)
const isCustomerDropdownOpen = ref(false)
const customerSearchQuery = ref('')

const filteredAccurateCustomers = computed(() => {
  const query = customerSearchQuery.value.toLowerCase().trim()
  if (!query) return accurateCustomers.value
  return accurateCustomers.value.filter(c => c.toLowerCase().includes(query))
})

const selectCustomer = (name) => {
  formData.value.customer_name = name
  customerSearchQuery.value = name
  isCustomerDropdownOpen.value = false
}

const handleClickOutsideCustomer = (event) => {
  if (customerComboboxRef.value && !customerComboboxRef.value.contains(event.target)) {
    isCustomerDropdownOpen.value = false
  }
}

// Toast Notification State
const toast = ref({
  show: false,
  type: 'success',
  title: '',
  message: ''
})

const showToast = (title, message, type = 'success') => {
  toast.value = { show: true, type, title, message }
  setTimeout(() => {
    toast.value.show = false
  }, 4500)
}

// Kanban columns
const todoTasks = ref([])
const inProgressTasks = ref([])
const doneTasks = ref([])

// Modal State
const isModalOpen = ref(false)
const editingTask = ref(null)
const formData = ref({
  title: '',
  project_name: '',
  customer_name: '',
  pic_name: '',
  description: '',
  assignee: '',
  target_date: ''
})
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
  const filtered = activePeriod.value === 'ALL'
    ? allTasksRaw.value
    : allTasksRaw.value.filter(t => getPeriodFromDate(t.created_at) === activePeriod.value)

  todoTasks.value = filtered.filter(t => t.status === 'TODO')
  inProgressTasks.value = filtered.filter(t => t.status === 'IN_PROGRESS')
  doneTasks.value = filtered.filter(t => t.status === 'DONE')
}
const getLocalMeta = (id) => {
  if (!id) return null
  try {
    const raw = localStorage.getItem(`boq_meta_${id}`)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

const getProjectName = (task) => task.project_name || task.metadata?.project_name || getLocalMeta(task.id)?.project_name || ''
const getCustomerName = (task) => task.customer_name || task.metadata?.customer_name || getLocalMeta(task.id)?.customer_name || ''
const getPicName = (task) => task.pic_name || task.metadata?.pic_name || getLocalMeta(task.id)?.pic_name || ''

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

    if (!activePeriod.value || activePeriod.value !== 'ALL') {
      const periodWithTasks = availablePeriods.value.find(p => allTasksRaw.value.some(t => getPeriodFromDate(t.created_at) === p))
      activePeriod.value = periodWithTasks || 'ALL'
    }
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

const fetchAccurateCustomers = async () => {
  try {
    const [soRes, sqRes] = await Promise.allSettled([
      supabase.functions.invoke('accurate-list-so', { body: { fields: 'customer' } }),
      supabase.functions.invoke('accurate-list-sq', { body: { fields: 'customer' } })
    ])
    const names = new Set()
    if (soRes.status === 'fulfilled' && soRes.value.data?.d) {
      soRes.value.data.d.forEach(i => { if (i.customer?.name) names.add(i.customer.name.trim()) })
    }
    if (sqRes.status === 'fulfilled' && sqRes.value.data?.d) {
      sqRes.value.data.d.forEach(i => { if (i.customer?.name) names.add(i.customer.name.trim()) })
    }
    accurateCustomers.value = Array.from(names).sort()
  } catch (err) {
    console.error('Error fetching accurate customers:', err)
  }
}

onMounted(async () => {
  const { data } = await supabase.auth.getUser()
  currentUserEmail.value = data?.user?.email || ''
  fetchTasks()
  fetchUsers()
  fetchAccurateCustomers()
  document.addEventListener('click', handleClickOutsideCustomer)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutsideCustomer)
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
    const projName = getProjectName(task)
    const custName = getCustomerName(task)
    const picName = getPicName(task)

    formData.value = {
      title: task.title || '',
      project_name: projName,
      customer_name: custName,
      pic_name: picName,
      description: task.description || '',
      assignee: task.assignee || '',
      target_date: task.target_date || ''
    }
    customerSearchQuery.value = custName
  } else {
    editingTask.value = null
    formData.value = {
      title: '',
      project_name: '',
      customer_name: '',
      pic_name: '',
      description: '',
      assignee: '',
      target_date: ''
    }
    customerSearchQuery.value = ''
  }
  isCustomerDropdownOpen.value = false
  selectedFile.value = null
  if (fileInput.value) fileInput.value.value = ''
  isModalOpen.value = true
}
const closeModal = () => { 
  isModalOpen.value = false 
  isCustomerDropdownOpen.value = false
}
const handleFileChange = (event) => { selectedFile.value = event.target.files[0] || null }

// ---- Submit ----
const submitForm = async () => {
  if (!formData.value.title) { alert('Subject / Judul permintaan harus diisi!'); return }
  isSubmitting.value = true
  try {
    let fileUrl = editingTask.value?.file_url
    let fileName = editingTask.value?.file_name
    if (selectedFile.value) {
      // 1. Upload to Google Drive via 'upload-to-drive' edge function (same as Marketing Hub)
      try {
        const driveFormData = new FormData()
        driveFormData.append('file', selectedFile.value)
        const { data: driveData, error: driveError } = await supabase.functions.invoke('upload-to-drive', {
          body: driveFormData
        })
        if (!driveError && driveData?.webViewLink) {
          fileUrl = driveData.webViewLink
          fileName = selectedFile.value.name
        }
      } catch (driveErr) {
        console.warn('Google Drive upload notice, using storage fallback:', driveErr)
      }

      // 2. Fallback to Supabase Storage if Google Drive link not obtained
      if (!fileUrl || fileUrl === editingTask.value?.file_url) {
        const fileExt = selectedFile.value.name.split('.').pop()
        const filePath = `uploads/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
        const { error: uploadError } = await supabase.storage.from('boq-files').upload(filePath, selectedFile.value)
        if (uploadError) throw uploadError
        const { data: publicUrlData } = supabase.storage.from('boq-files').getPublicUrl(filePath)
        fileUrl = publicUrlData.publicUrl
        fileName = selectedFile.value.name
      }
    }

    const finalCustomer = customerSearchQuery.value || formData.value.customer_name || ''

    const payload = {
      title: formData.value.title,
      project_name: formData.value.project_name || '',
      customer_name: finalCustomer,
      pic_name: formData.value.pic_name || '',
      description: formData.value.description || '',
      assignee: formData.value.assignee || '',
      target_date: formData.value.target_date || null,
      file_url: fileUrl,
      file_name: fileName,
      metadata: {
        project_name: formData.value.project_name || '',
        customer_name: finalCustomer,
        pic_name: formData.value.pic_name || ''
      }
    }

    const saveLocalMeta = (id, meta) => {
      if (!id) return
      try {
        localStorage.setItem(`boq_meta_${id}`, JSON.stringify(meta))
      } catch (e) {}
    }

    if (editingTask.value) {
      const taskId = editingTask.value.id
      saveLocalMeta(taskId, payload.metadata)

      // Stage 1: Try full payload with direct columns + metadata
      const { error: err1 } = await supabase.from('boq_requests').update(payload).eq('id', taskId)
      if (err1) {
        console.warn('Stage 1 Update notice:', err1.message)
        // Stage 2: Try payload with metadata
        const stage2Payload = {
          title: payload.title,
          description: payload.description,
          assignee: payload.assignee,
          target_date: payload.target_date,
          file_url: payload.file_url,
          file_name: payload.file_name,
          metadata: payload.metadata
        }
        const { error: err2 } = await supabase.from('boq_requests').update(stage2Payload).eq('id', taskId)
        if (err2) {
          console.warn('Stage 2 Update notice:', err2.message)
          // Stage 3: Base payload (100% guaranteed to succeed)
          const basePayload = {
            title: payload.title,
            description: payload.description,
            assignee: payload.assignee,
            target_date: payload.target_date,
            file_url: payload.file_url,
            file_name: payload.file_name
          }
          const { error: err3 } = await supabase.from('boq_requests').update(basePayload).eq('id', taskId)
          if (err3) throw err3
        }
      }
      showToast('Permintaan Diperbarui', `Tugas "${payload.title}" berhasil diperbarui.`)
    } else {
      const { data: userData } = await supabase.auth.getUser()
      payload.created_by = userData?.user?.email || 'Unknown'
      payload.status = 'TODO'

      // Stage 1: Try full payload
      const { data: insData1, error: err1 } = await supabase.from('boq_requests').insert([payload]).select()
      if (err1) {
        console.warn('Stage 1 Insert notice:', err1.message)
        // Stage 2: Try with metadata
        const stage2Payload = {
          title: payload.title,
          description: payload.description,
          assignee: payload.assignee,
          target_date: payload.target_date,
          file_url: payload.file_url,
          file_name: payload.file_name,
          created_by: payload.created_by,
          status: payload.status,
          metadata: payload.metadata
        }
        const { data: insData2, error: err2 } = await supabase.from('boq_requests').insert([stage2Payload]).select()
        if (err2) {
          console.warn('Stage 2 Insert notice:', err2.message)
          // Stage 3: Base payload
          const basePayload = {
            title: payload.title,
            description: payload.description,
            assignee: payload.assignee,
            target_date: payload.target_date,
            file_url: payload.file_url,
            file_name: payload.file_name,
            created_by: payload.created_by,
            status: payload.status
          }
          const { data: insData3, error: err3 } = await supabase.from('boq_requests').insert([basePayload]).select()
          if (err3) throw err3
          if (insData3?.[0]?.id) saveLocalMeta(insData3[0].id, payload.metadata)
        } else if (insData2?.[0]?.id) {
          saveLocalMeta(insData2[0].id, payload.metadata)
        }
      } else if (insData1?.[0]?.id) {
        saveLocalMeta(insData1[0].id, payload.metadata)
      }
      showToast('Permintaan Baru Dibuat!', `Tugas "${payload.title}" berhasil ditambahkan ke To Do.`)
    }

    closeModal()
    await fetchTasks()
  } catch (err) {
    console.error('Error submitting task:', err)
    alert('Terjadi kesalahan saat menyimpan data: ' + (err?.message || 'Silakan coba lagi.'))
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
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="space-y-1">
        <h1 class="text-2xl font-bold text-foreground tracking-tight">Permintaan</h1>
        <p class="text-sm text-muted-foreground">Antrian permintaan penawaran harga & spesifikasi (BOQ)</p>
      </div>
      <button 
        @click="openModal()" 
        class="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all gap-2 cursor-pointer shrink-0"
      >
        <Plus class="w-4 h-4" />
        Tambah Permintaan
      </button>
    </div>

    <!-- Kanban Board Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 items-start pb-10">
      
      <!-- 1. TODO COLUMN -->
      <div 
        class="flex flex-col bg-muted/30 rounded-2xl border border-border h-full overflow-hidden transition-all duration-200"
        :class="{ 'ring-2 ring-primary/50 bg-primary/5': draggingOverColumn === 'TODO' }"
        @dragover="onDragOver($event, 'TODO')"
        @dragleave="onDragLeave($event, 'TODO')"
        @drop="onDrop($event, 'TODO')"
      >
        <!-- Column Header -->
        <div class="p-4 border-b border-border bg-card flex justify-between items-center">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-amber-500"></span>
            <h3 class="font-bold text-foreground text-xs uppercase tracking-wider">To Do</h3>
          </div>
          <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
            {{ todoTasks.length }}
          </span>
        </div>

        <!-- Tasks Content Container -->
        <div class="p-4 space-y-3 min-h-[360px]">
          <div v-if="isLoading && todoTasks.length === 0" class="flex flex-col justify-center items-center py-16 space-y-2">
            <Loader2 class="w-6 h-6 animate-spin text-muted-foreground" />
            <span class="text-xs text-muted-foreground">Memuat permintaan...</span>
          </div>

          <!-- Empty State -->
          <div v-else-if="todoTasks.length === 0" class="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/70 rounded-xl bg-card/40 p-4 space-y-2">
            <div class="p-2.5 rounded-full bg-muted/60 text-muted-foreground">
              <Clock class="w-5 h-5 opacity-60" />
            </div>
            <p class="text-xs font-medium text-muted-foreground">Belum ada antrean To Do</p>
          </div>
          
          <!-- Task Card -->
          <div 
            v-for="task in todoTasks" 
            :key="task.id" 
            draggable="true"
            @dragstart="onDragStart($event, task)"
            class="bg-card p-4 rounded-xl border border-border shadow-2xs group hover:border-primary/50 transition-all cursor-grab active:cursor-grabbing select-none space-y-2.5"
          >
            <div class="flex justify-between items-center">
              <span v-if="task.task_number" class="text-[10px] font-bold text-muted-foreground tracking-wider uppercase bg-muted px-1.5 py-0.5 rounded">
                TASK-{{ task.task_number }}
              </span>
              <div class="flex items-center gap-1">
                <button 
                  @click.stop="openModal(task)" 
                  class="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted" 
                  title="Edit Permintaan"
                >
                  <FileText class="w-3.5 h-3.5" />
                </button>
                <button 
                  v-if="task.created_by === currentUserEmail" 
                  @click.stop="deleteTask(task.id)" 
                  class="text-muted-foreground hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted" 
                  title="Hapus Tugas"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <h4 
                class="font-semibold text-sm text-foreground leading-snug cursor-pointer hover:text-primary transition-colors" 
                @click="router.push('/permintaan/' + task.id)"
              >
                {{ task.title }}
              </h4>
              <div v-if="getProjectName(task) || getCustomerName(task)" class="flex flex-wrap items-center gap-2 text-xs mt-1 font-medium">
                <span v-if="getProjectName(task)" class="text-foreground truncate max-w-[140px]" :title="getProjectName(task)">
                  Proyek: {{ getProjectName(task) }}
                </span>
                <span v-if="getCustomerName(task)" class="text-muted-foreground truncate max-w-[140px]" :title="getCustomerName(task)">
                  Customer: {{ getCustomerName(task) }}
                </span>
              </div>
              <p v-if="getPicName(task)" class="text-[11px] text-muted-foreground mt-0.5">
                PIC: {{ getPicName(task) }}
              </p>
              <p v-if="task.description" class="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                {{ task.description }}
              </p>
            </div>
            
            <div class="flex flex-wrap items-center gap-2 pt-1">
              <span v-if="task.assignee" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-[10px] font-medium text-muted-foreground truncate max-w-[120px]">
                <User class="w-3 h-3" /> {{ task.assignee.split('@')[0] }}
              </span>
              <span v-if="task.target_date" :class="[
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border',
                isOverdue(task.target_date) 
                  ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/40' 
                  : 'bg-muted text-muted-foreground border-border'
              ]">
                <Calendar class="w-3 h-3" /> {{ formatDate(task.target_date) }}
              </span>
            </div>

            <div v-if="task.file_url" class="pt-1">
               <a :href="task.file_url" target="_blank" class="inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline font-medium bg-primary/5 px-2 py-1 rounded-md border border-primary/10">
                 <Paperclip class="w-3 h-3" />
                 <span class="truncate max-w-[160px]">{{ task.file_name || 'Lihat Lampiran' }}</span>
               </a>
            </div>

            <!-- Quick Actions -->
            <div class="pt-2 border-t border-border flex items-center justify-end gap-1.5">
              <button 
                @click.stop="updateStatus(task.id, 'IN_PROGRESS')" 
                class="px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer" 
                title="Pindah ke In Progress"
              >
                <PlayCircle class="w-3 h-3" /> In Progress
              </button>
              <button 
                @click.stop="updateStatus(task.id, 'DONE')" 
                class="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer" 
                title="Pindah ke Done"
              >
                <CheckCircle class="w-3 h-3" /> Done
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. IN PROGRESS COLUMN -->
      <div 
        class="flex flex-col bg-muted/30 rounded-2xl border border-border h-full overflow-hidden transition-all duration-200"
        :class="{ 'ring-2 ring-primary/50 bg-primary/5': draggingOverColumn === 'IN_PROGRESS' }"
        @dragover="onDragOver($event, 'IN_PROGRESS')"
        @dragleave="onDragLeave($event, 'IN_PROGRESS')"
        @drop="onDrop($event, 'IN_PROGRESS')"
      >
        <!-- Column Header -->
        <div class="p-4 border-b border-border bg-card flex justify-between items-center">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-sky-500"></span>
            <h3 class="font-bold text-foreground text-xs uppercase tracking-wider">In Progress</h3>
          </div>
          <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
            {{ inProgressTasks.length }}
          </span>
        </div>

        <!-- Tasks Content Container -->
        <div class="p-4 space-y-3 min-h-[360px]">
          <!-- Empty State -->
          <div v-if="inProgressTasks.length === 0" class="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/70 rounded-xl bg-card/40 p-4 space-y-2">
            <div class="p-2.5 rounded-full bg-muted/60 text-muted-foreground">
              <PlayCircle class="w-5 h-5 opacity-60" />
            </div>
            <p class="text-xs font-medium text-muted-foreground">Tidak ada yang sedang diproses</p>
          </div>

          <!-- Task Card -->
          <div 
            v-for="task in inProgressTasks" 
            :key="task.id" 
            draggable="true"
            @dragstart="onDragStart($event, task)"
            class="bg-card p-4 rounded-xl border border-border border-l-4 border-l-sky-500 shadow-2xs group hover:border-primary/50 transition-all cursor-grab active:cursor-grabbing select-none space-y-2.5"
          >
            <div class="flex justify-between items-center">
              <span v-if="task.task_number" class="text-[10px] font-bold text-muted-foreground tracking-wider uppercase bg-muted px-1.5 py-0.5 rounded">
                TASK-{{ task.task_number }}
              </span>
              <div class="flex items-center gap-1">
                <button 
                  @click.stop="openModal(task)" 
                  class="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted" 
                  title="Edit Permintaan"
                >
                  <FileText class="w-3.5 h-3.5" />
                </button>
                <button 
                  v-if="task.created_by === currentUserEmail" 
                  @click.stop="deleteTask(task.id)" 
                  class="text-muted-foreground hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted" 
                  title="Hapus Tugas"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <h4 
                class="font-semibold text-sm text-foreground leading-snug cursor-pointer hover:text-primary transition-colors" 
                @click="router.push('/permintaan/' + task.id)"
              >
                {{ task.title }}
              </h4>
              <div v-if="task.project_name || task.customer_name" class="flex flex-wrap items-center gap-2 text-xs mt-1 font-medium">
                <span v-if="task.project_name" class="text-foreground truncate max-w-[140px]" :title="task.project_name">
                  Proyek: {{ task.project_name }}
                </span>
                <span v-if="task.customer_name" class="text-muted-foreground truncate max-w-[140px]" :title="task.customer_name">
                  Customer: {{ task.customer_name }}
                </span>
              </div>
              <p v-if="task.pic_name" class="text-[11px] text-muted-foreground mt-0.5">
                PIC: {{ task.pic_name }}
              </p>
              <p v-if="task.description" class="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                {{ task.description }}
              </p>
            </div>
            
            <div class="flex flex-wrap items-center gap-2 pt-1">
              <span v-if="task.assignee" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-[10px] font-medium text-muted-foreground truncate max-w-[120px]">
                <User class="w-3 h-3" /> {{ task.assignee.split('@')[0] }}
              </span>
              <span v-if="task.target_date" :class="[
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border',
                isOverdue(task.target_date) 
                  ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/40' 
                  : 'bg-muted text-muted-foreground border-border'
              ]">
                <Calendar class="w-3 h-3" /> {{ formatDate(task.target_date) }}
              </span>
            </div>

            <div v-if="task.file_url" class="pt-1">
               <a :href="task.file_url" target="_blank" class="inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline font-medium bg-primary/5 px-2 py-1 rounded-md border border-primary/10">
                 <Paperclip class="w-3 h-3" />
                 <span class="truncate max-w-[160px]">{{ task.file_name || 'Lihat Lampiran' }}</span>
               </a>
            </div>

            <!-- Quick Actions -->
            <div class="pt-2 border-t border-border flex items-center justify-between gap-1.5">
              <button 
                @click.stop="updateStatus(task.id, 'TODO')" 
                class="px-2.5 py-1 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer" 
                title="Kembalikan ke To Do"
              >
                <Clock class="w-3 h-3" /> To Do
              </button>
              <button 
                @click.stop="updateStatus(task.id, 'DONE')" 
                class="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer" 
                title="Pindah ke Done"
              >
                <CheckCircle class="w-3 h-3" /> Done
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. DONE COLUMN -->
      <div 
        class="flex flex-col bg-muted/30 rounded-2xl border border-border h-full overflow-hidden transition-all duration-200"
        :class="{ 'ring-2 ring-emerald-500/50 bg-emerald-500/5': draggingOverColumn === 'DONE' }"
        @dragover="onDragOver($event, 'DONE')"
        @dragleave="onDragLeave($event, 'DONE')"
        @drop="onDrop($event, 'DONE')"
      >
        <!-- Column Header -->
        <div class="p-4 border-b border-border bg-card flex justify-between items-center">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <h3 class="font-bold text-foreground text-xs uppercase tracking-wider">Done</h3>
          </div>
          <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
            {{ doneTasks.length }}
          </span>
        </div>

        <!-- Tasks Content Container -->
        <div class="p-4 space-y-3 min-h-[360px]">
          <!-- Empty State -->
          <div v-if="doneTasks.length === 0" class="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/70 rounded-xl bg-card/40 p-4 space-y-2">
            <div class="p-2.5 rounded-full bg-muted/60 text-muted-foreground">
              <CheckCircle class="w-5 h-5 opacity-60" />
            </div>
            <p class="text-xs font-medium text-muted-foreground">Belum ada tugas selesai</p>
          </div>

          <!-- Task Card -->
          <div 
            v-for="task in doneTasks" 
            :key="task.id" 
            draggable="true"
            @dragstart="onDragStart($event, task)"
            class="bg-card/70 p-4 rounded-xl border border-border shadow-2xs group opacity-75 hover:opacity-100 transition-all cursor-grab active:cursor-grabbing select-none space-y-2.5"
          >
            <div class="flex justify-between items-center">
              <span v-if="task.task_number" class="text-[10px] font-bold text-muted-foreground tracking-wider uppercase bg-muted px-1.5 py-0.5 rounded">
                TASK-{{ task.task_number }}
              </span>
              <button 
                v-if="task.created_by === currentUserEmail" 
                @click.stop="deleteTask(task.id)" 
                class="text-muted-foreground hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted" 
                title="Hapus Tugas"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <h4 
                class="font-medium text-sm text-muted-foreground line-through cursor-pointer hover:text-foreground transition-colors" 
                @click="router.push('/permintaan/' + task.id)"
              >
                {{ task.title }}
              </h4>
            </div>
            
            <div class="flex flex-wrap items-center gap-2 pt-1">
              <span v-if="task.assignee" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-[10px] font-medium text-muted-foreground truncate max-w-[120px]">
                <User class="w-3 h-3" /> {{ task.assignee.split('@')[0] }}
              </span>
            </div>

            <!-- Quick Actions -->
            <div class="pt-2 border-t border-border flex items-center justify-start gap-1.5">
              <button 
                @click.stop="updateStatus(task.id, 'IN_PROGRESS')" 
                class="px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer" 
                title="Kembalikan ke In Progress"
              >
                <PlayCircle class="w-3 h-3" /> In Progress
              </button>
              <button 
                @click.stop="updateStatus(task.id, 'TODO')" 
                class="px-2.5 py-1 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer" 
                title="Kembalikan ke To Do"
              >
                <Clock class="w-3 h-3" /> To Do
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Monthly History Folders -->
    <div v-if="availablePeriods.length > 0" class="pt-6 border-t border-border space-y-3">
      <h3 class="text-xs font-bold text-muted-foreground uppercase tracking-wider">Filter Periode Permintaan</h3>
      <div class="flex flex-wrap gap-2.5">
        <button 
          @click="activePeriod = 'ALL'; filterTasksByPeriod()"
          :class="[
            'inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border',
            activePeriod === 'ALL' 
              ? 'bg-primary text-primary-foreground border-primary shadow-2xs' 
              : 'bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground'
          ]"
        >
          <Folder class="w-3.5 h-3.5 mr-2" :class="activePeriod === 'ALL' ? 'text-primary-foreground' : 'text-primary'" />
          Semua Permintaan ({{ allTasksRaw.length }})
        </button>

        <button 
          v-for="period in availablePeriods" 
          :key="period"
          @click="activePeriod = period; filterTasksByPeriod()"
          :class="[
            'inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border',
            activePeriod === period 
              ? 'bg-primary text-primary-foreground border-primary shadow-2xs' 
              : 'bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground'
          ]"
        >
          <Folder class="w-3.5 h-3.5 mr-2" :class="activePeriod === period ? 'text-primary-foreground' : 'text-primary'" />
          {{ formatPeriodLabel(period) }}
        </button>
      </div>
    </div>

    <!-- Modal Form (8 Required Fields) -->
    <div v-if="isModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
      <div class="bg-card rounded-2xl shadow-xl w-full max-w-xl overflow-hidden border border-border">
        <div class="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 class="text-base font-bold text-foreground">{{ editingTask ? 'Edit Permintaan' : 'Permintaan Baru' }}</h2>
          <button @click="closeModal" class="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="p-6 space-y-4 text-sm max-h-[80vh] overflow-y-auto sidebar-thin">
          <!-- 1. Subject / Judul -->
          <div>
            <label class="block text-xs font-semibold text-muted-foreground mb-1.5">1. Subject / Judul <span class="text-rose-500">*</span></label>
            <input v-model="formData.title" type="text" placeholder="Contoh: Permintaan BOQ Panel GI Subang 150kV..." class="w-full px-3 py-2 border border-input rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <!-- 2. Project / Proyek & 3. Customer (2-Column Grid) -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- 2. Project / Proyek -->
            <div>
              <label class="block text-xs font-semibold text-muted-foreground mb-1.5">2. Project / Proyek</label>
              <input v-model="formData.project_name" type="text" placeholder="Nama proyek / pekerjaan..." class="w-full px-3 py-2 border border-input rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <!-- 3. Customer (Searchable Combobox) -->
            <div ref="customerComboboxRef" class="relative">
              <label class="block text-xs font-semibold text-muted-foreground mb-1.5">3. Customer</label>
              <div class="relative">
                <input 
                  type="text" 
                  v-model="customerSearchQuery"
                  @focus="isCustomerDropdownOpen = true"
                  @input="formData.customer_name = customerSearchQuery; isCustomerDropdownOpen = true"
                  placeholder="Cari / ketik nama customer..." 
                  class="w-full pl-9 pr-8 py-2 border border-input rounded-xl bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Search class="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
                <button 
                  v-if="customerSearchQuery" 
                  type="button"
                  @click="customerSearchQuery = ''; formData.customer_name = ''; isCustomerDropdownOpen = true" 
                  class="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                >
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- Searchable Popover Dropdown List -->
              <div 
                v-if="isCustomerDropdownOpen" 
                class="absolute z-50 left-0 right-0 mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-border bg-card shadow-lg p-1 text-xs space-y-0.5 sidebar-thin"
              >
                <!-- Registered Customers from Accurate -->
                <div 
                  v-for="cName in filteredAccurateCustomers" 
                  :key="cName"
                  @click="selectCustomer(cName)"
                  class="px-3 py-2 rounded-lg hover:bg-muted font-medium text-foreground cursor-pointer flex items-center justify-between transition-colors"
                >
                  <div class="flex items-center gap-2 truncate">
                    <Building2 class="w-3.5 h-3.5 text-primary shrink-0" />
                    <span class="truncate">{{ cName }}</span>
                  </div>
                  <Check v-if="formData.customer_name === cName" class="w-3.5 h-3.5 text-primary shrink-0" />
                </div>

                <!-- Custom Input Selection -->
                <div 
                  v-if="customerSearchQuery && !accurateCustomers.includes(customerSearchQuery)"
                  @click="selectCustomer(customerSearchQuery)"
                  class="px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 font-semibold text-primary cursor-pointer flex items-center gap-2 border border-primary/20 transition-colors"
                >
                  <Plus class="w-3.5 h-3.5 shrink-0" />
                  <span class="truncate">Gunakan Kustom: "{{ customerSearchQuery }}"</span>
                </div>

                <div v-if="filteredAccurateCustomers.length === 0 && !customerSearchQuery" class="px-3 py-3 text-center text-muted-foreground">
                  Ketik nama customer untuk mencari...
                </div>
              </div>
            </div>
          </div>

          <!-- 4. PIC & 6. Action by (2-Column Grid) -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- 4. PIC -->
            <div>
              <label class="block text-xs font-semibold text-muted-foreground mb-1.5">4. PIC Customer</label>
              <input v-model="formData.pic_name" type="text" placeholder="Nama PIC / Kontak Person..." class="w-full px-3 py-2 border border-input rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <!-- 6. Action by -->
            <div>
              <label class="block text-xs font-semibold text-muted-foreground mb-1.5">6. Action by (Delegasi)</label>
              <select v-model="formData.assignee" class="w-full px-3 py-2 border border-input rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer">
                <option value="">-- Pilih Tim / User --</option>
                <option v-for="u in users" :key="u.email" :value="u.email">{{ u.email }}</option>
              </select>
            </div>
          </div>

          <!-- 5. Description / Catatan -->
          <div>
            <label class="block text-xs font-semibold text-muted-foreground mb-1.5">5. Description / Catatan</label>
            <textarea v-model="formData.description" rows="3" placeholder="Tuliskan spesifikasi, catatan teknis, atau keterangan..." class="w-full px-3 py-2 border border-input rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"></textarea>
          </div>

          <!-- 7. Deadline & 8. File (2-Column Grid) -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- 7. Deadline -->
            <div>
              <label class="block text-xs font-semibold text-muted-foreground mb-1.5">7. Deadline (Target Selesai)</label>
              <input v-model="formData.target_date" type="date" class="w-full px-3 py-2 border border-input rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer" />
            </div>

            <!-- 8. File -->
            <div>
              <label class="block text-xs font-semibold text-muted-foreground mb-1.5">8. File Attachment (PDF/Excel)</label>
              <input type="file" ref="fileInput" @change="handleFileChange" accept=".pdf,.xls,.xlsx,.csv" class="block w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer" />
              <p v-if="editingTask?.file_url && !selectedFile" class="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                File tersimpan: <a :href="editingTask.file_url" target="_blank" class="text-primary underline font-medium">{{ editingTask.file_name || 'Lihat' }}</a>
              </p>
            </div>
          </div>
        </div>

        <div class="px-6 py-4 bg-muted/40 border-t border-border flex justify-end gap-2.5">
          <button @click="closeModal" class="px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-xl transition-colors cursor-pointer">Batal</button>
          <button @click="submitForm" :disabled="isSubmitting" class="px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-xs">
            <Loader2 v-if="isSubmitting" class="w-3.5 h-3.5 animate-spin" />
            Simpan Permintaan
          </button>
        </div>
      </div>
    </div>

    <!-- In-App Toast Notification -->
    <transition 
      enter-active-class="transition duration-300 ease-out" 
      enter-from-class="transform translate-y-2 opacity-0" 
      enter-to-class="transform translate-y-0 opacity-100" 
      leave-active-class="transition duration-200 ease-in" 
      leave-from-class="transform translate-y-0 opacity-100" 
      leave-to-class="transform translate-y-2 opacity-0"
    >
      <div 
        v-if="toast.show" 
        class="fixed bottom-6 right-6 z-50 flex items-start gap-3.5 bg-card border border-emerald-500/30 text-foreground p-4 rounded-2xl shadow-2xl max-w-sm backdrop-blur-md"
      >
        <div class="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
          <CheckCircle class="w-5 h-5" />
        </div>
        <div class="flex-1 space-y-1 text-xs">
          <h4 class="font-bold text-sm text-foreground leading-tight">{{ toast.title }}</h4>
          <p class="text-muted-foreground leading-relaxed">{{ toast.message }}</p>
        </div>
        <button @click="toast.show = false" class="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors cursor-pointer">
          <X class="w-4 h-4" />
        </button>
      </div>
    </transition>

  </div>
</template>
