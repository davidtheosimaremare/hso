<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { 
  ArrowLeft, 
  Calendar, 
  User, 
  Paperclip, 
  MessageSquare, 
  Send,
  Loader2,
  Clock,
  CheckCircle2,
  Trash2,
  Download,
  Share2,
  Check,
  Building2,
  FolderKanban,
  UserCheck,
  Pencil,
  X
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

const taskId = route.params.id
const task = ref(null)
const isLoading = ref(true)
const isError = ref(false)
const currentUserEmail = ref('')
const isCopied = ref(false)

// Edit Modal State
const isEditModalOpen = ref(false)
const isSavingEdit = ref(false)
const users = ref([])
const editForm = ref({
  title: '',
  project_name: '',
  customer_name: '',
  pic_name: '',
  description: '',
  assignee: '',
  target_date: '',
  file_link: ''
})

const fetchUsers = async () => {
  try {
    const { data } = await supabase.from('user_access').select('email').order('email')
    users.value = data || []
  } catch (e) {}
}

const openEditModal = () => {
  if (!task.value) return
  editForm.value = {
    title: task.value.title || '',
    project_name: getProjectName.value !== '-' ? getProjectName.value : '',
    customer_name: getCustomerName.value !== '-' ? getCustomerName.value : '',
    pic_name: getPicName.value !== '-' ? getPicName.value : '',
    description: task.value.description || '',
    assignee: task.value.assignee || '',
    target_date: task.value.target_date || '',
    file_link: getFileLink.value || task.value.file_url || ''
  }
  fetchUsers()
  isEditModalOpen.value = true
}

const saveEditTask = async () => {
  if (!editForm.value.title) { alert('Judul harus diisi!'); return }
  isSavingEdit.value = true
  try {
    const meta = {
      project_name: editForm.value.project_name || '',
      customer_name: editForm.value.customer_name || '',
      pic_name: editForm.value.pic_name || '',
      file_link: editForm.value.file_link || ''
    }

    const payload = {
      title: editForm.value.title,
      project_name: editForm.value.project_name || '',
      customer_name: editForm.value.customer_name || '',
      pic_name: editForm.value.pic_name || '',
      description: editForm.value.description || '',
      assignee: editForm.value.assignee || '',
      target_date: editForm.value.target_date || null,
      file_link: editForm.value.file_link || null,
      metadata: meta
    }

    try { localStorage.setItem(`boq_meta_${taskId}`, JSON.stringify(meta)) } catch {}

    const { error: err1 } = await supabase.from('boq_requests').update(payload).eq('id', taskId)
    if (err1) {
      console.warn('Update payload notice:', err1.message)
      const stage2 = {
        title: payload.title,
        project_name: payload.project_name,
        customer_name: payload.customer_name,
        pic_name: payload.pic_name,
        description: payload.description,
        assignee: payload.assignee,
        target_date: payload.target_date,
        metadata: payload.metadata
      }
      const { error: err2 } = await supabase.from('boq_requests').update(stage2).eq('id', taskId)
      if (err2) {
        await supabase.from('boq_requests').update({
          title: payload.title,
          project_name: payload.project_name,
          customer_name: payload.customer_name,
          pic_name: payload.pic_name,
          description: payload.description,
          assignee: payload.assignee,
          target_date: payload.target_date
        }).eq('id', taskId)
      }
    }

    task.value = {
      ...task.value,
      ...payload
    }

    isEditModalOpen.value = false
  } catch (err) {
    console.error('Error saving task edit:', err)
    alert('Gagal menyimpan perubahan.')
  } finally {
    isSavingEdit.value = false
  }
}

const shareLink = async () => {
  const url = window.location.href
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url)
    } else {
      const textArea = document.createElement('textarea')
      textArea.value = url
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
    isCopied.value = true
    setTimeout(() => {
      isCopied.value = false
    }, 2500)
  } catch (err) {
    console.error('Failed to copy link:', err)
  }
}

const updateTaskStatus = async (newStatus) => {
  if (!task.value) return
  
  // Update state & localStorage immediately
  task.value.status = newStatus
  try { localStorage.setItem(`boq_status_${taskId}`, newStatus) } catch {}

  const updatePayload = { status: newStatus }
  const now = new Date().toISOString()
  if (newStatus === 'IN_PROGRESS' && !task.value.in_progress_at) {
    updatePayload.in_progress_at = now
    task.value.in_progress_at = now
  }
  if (newStatus === 'DONE' && !task.value.done_at) {
    updatePayload.done_at = now
    task.value.done_at = now
  }

  try {
    const { error } = await supabase
      .from('boq_requests')
      .update(updatePayload)
      .eq('id', taskId)
    
    if (error) {
      console.warn('Update with timestamps notice:', error.message)
      await supabase
        .from('boq_requests')
        .update({ status: newStatus })
        .eq('id', taskId)
    }
  } catch (err) {
    console.warn('Supabase DB update notice (saved locally):', err)
  }
}

// Comments
const comments = ref([])
const newComment = ref('')
const isSubmittingComment = ref(false)

const statusConfig = {
  'TODO': { label: 'To Do', color: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
  'IN_PROGRESS': { label: 'In Progress', color: 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800' },
  'DONE': { label: 'Done', color: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800' }
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

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    currentUserEmail.value = user.email
  }
  
  await fetchTaskDetail()
  await fetchComments()
})

const fetchTaskDetail = async () => {
  try {
    const { data, error } = await supabase
      .from('boq_requests')
      .select('*')
      .eq('id', taskId)
      .single()
      
    if (error) throw error
    console.log('Task data fetched:', data)
    task.value = data || {}
    
    if (task.value) {
      const localStatus = localStorage.getItem(`boq_status_${taskId}`)
      if (localStatus) {
        task.value.status = localStatus
      } else if (!task.value.in_progress_at && !task.value.done_at) {
        task.value.status = 'TODO'
        try { localStorage.setItem(`boq_status_${taskId}`, 'TODO') } catch {}
      }
    }
  } catch (err) {
    console.error('Error fetching task:', err)
    isError.value = true
  } finally {
    isLoading.value = false
  }
}

const fetchComments = async () => {
  try {
    const { data, error } = await supabase
      .from('boq_comments')
      .select('*')
      .eq('request_id', taskId)
      .order('created_at', { ascending: true })
      
    if (error) throw error
    comments.value = data
  } catch (err) {
    console.error('Error fetching comments:', err)
  }
}

const submitComment = async () => {
  if (!newComment.value.trim()) return
  
  isSubmittingComment.value = true
  try {
    const { data, error } = await supabase
      .from('boq_comments')
      .insert({
        request_id: taskId,
        user_email: currentUserEmail.value,
        comment_text: newComment.value.trim()
      })
      .select()
      
    if (error) throw error
    
    // Add to list and clear input
    comments.value.push(data[0])
    newComment.value = ''
  } catch (err) {
    console.error('Error submitting comment:', err)
    alert('Gagal mengirim komentar.')
  } finally {
    isSubmittingComment.value = false
  }
}

const deleteComment = async (commentId) => {
  if (!confirm('Hapus komentar ini?')) return
  
  try {
    const { error } = await supabase
      .from('boq_comments')
      .delete()
      .eq('id', commentId)
      
    if (error) throw error
    comments.value = comments.value.filter(c => c.id !== commentId)
  } catch (err) {
    alert('Gagal menghapus komentar.')
  }
}

const deleteTask = async () => {
  if (!confirm('Apakah Anda yakin ingin menghapus permintaan ini? Semua data terkait (termasuk komentar) akan terhapus.')) return
  try {
    const { error } = await supabase
      .from('boq_requests')
      .delete()
      .eq('id', taskId)
    if (error) throw error
    router.push('/permintaan')
  } catch (err) {
    alert('Gagal menghapus permintaan.')
  }
}

const formatDate = (dateString) => {
  if (!dateString || dateString === '-') return '-'
  const d = new Date(dateString)
  if (isNaN(d.getTime())) return '-'
  if (typeof dateString === 'string' && (dateString.includes('T') || dateString.includes(':'))) {
    return d.toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }
  return d.toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

const formatShortDate = (dateString) => {
  if (!dateString || dateString === '-') return '-'
  const d = new Date(dateString)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

const parseMeta = (meta) => {
  if (!meta) return {}
  if (typeof meta === 'object') return meta
  if (typeof meta === 'string') {
    try { return JSON.parse(meta) } catch (e) { return {} }
  }
  return {}
}

// Helper functions to get data from metadata fallback and localStorage
const getProjectName = computed(() => {
  if (!task.value) return '-'
  const meta = parseMeta(task.value.metadata)
  const val = task.value.project_name || meta.project_name || getLocalMeta(taskId)?.project_name
  return (val && val !== '-') ? val : '-'
})
const getCustomerName = computed(() => {
  if (!task.value) return '-'
  const meta = parseMeta(task.value.metadata)
  const val = task.value.customer_name || meta.customer_name || getLocalMeta(taskId)?.customer_name
  return (val && val !== '-') ? val : '-'
})
const getPicName = computed(() => {
  if (!task.value) return '-'
  const meta = parseMeta(task.value.metadata)
  const val = task.value.pic_name || meta.pic_name || getLocalMeta(taskId)?.pic_name
  return (val && val !== '-') ? val : '-'
})
const getFileLink = computed(() => {
  if (!task.value) return null
  const meta = parseMeta(task.value.metadata)
  const val = task.value.file_link || meta.file_link || getLocalMeta(taskId)?.file_link
  return (val && val !== '-') ? val : null
})
</script>

<template>
  <div class="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-20">
      <Loader2 class="w-8 h-8 animate-spin text-blue-500 mb-4" />
      <p class="text-slate-500 font-medium">Memuat detail permintaan...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="isError || !task" class="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
      <p class="text-red-500 font-medium mb-4">Permintaan tidak ditemukan atau telah dihapus.</p>
      <button @click="router.push('/permintaan')" class="text-blue-600 hover:underline">
        Kembali ke Board Permintaan
      </button>
    </div>

    <!-- Main Content -->
    <div v-else class="space-y-5">
      <!-- Top Action Bar -->
      <div class="flex items-center justify-between">
        <button @click="router.push('/permintaan')" class="inline-flex items-center text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
          <ArrowLeft class="w-4 h-4 mr-1.5" />
          Kembali ke Board
        </button>
        <div class="flex items-center gap-2">
          <button 
            @click="openEditModal" 
            class="inline-flex items-center text-xs font-bold text-blue-700 dark:text-blue-200 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 transition-all shadow-sm cursor-pointer"
          >
            <Pencil class="w-3.5 h-3.5 mr-1.5" />
            <span>Edit Permintaan</span>
          </button>

          <button 
            @click="shareLink" 
            class="inline-flex items-center text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 transition-all shadow-sm cursor-pointer"
            :class="{ 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700': isCopied }"
          >
            <Check v-if="isCopied" class="w-3.5 h-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400" />
            <Share2 v-else class="w-3.5 h-3.5 mr-1.5 text-slate-500 dark:text-slate-400" />
            <span>{{ isCopied ? 'Link Disalin!' : 'Bagikan Link' }}</span>
          </button>

          <button 
            v-if="task.created_by === currentUserEmail" 
            @click="deleteTask" 
            class="inline-flex items-center text-xs font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            <Trash2 class="w-3.5 h-3.5 mr-1.5" />
            Hapus Permintaan
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        
        <!-- Left Column: Task Details -->
        <div class="lg:col-span-2 space-y-5 min-w-0">

          <!-- Main Card (Title, Header, Metadata Grid, Description, Attachment) -->
          <div class="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-5 min-w-0 overflow-hidden">
            
            <!-- Title & Status Header -->
            <div class="space-y-3 pb-4 border-b border-slate-100 dark:border-slate-800 min-w-0">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <span v-if="task.task_number" class="px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-black text-slate-600 dark:text-slate-400 tracking-wider">
                  TASK-{{ task.task_number }}
                </span>
                
                <div class="flex items-center gap-2">
                  <select 
                    :value="task.status" 
                    @change="updateTaskStatus($event.target.value)"
                    class="px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border outline-none cursor-pointer shadow-sm transition-all"
                    :class="statusConfig[task.status]?.color || 'bg-slate-100 text-slate-700 border-slate-200'"
                  >
                    <option value="TODO" class="bg-white text-slate-800 font-semibold">To Do</option>
                    <option value="IN_PROGRESS" class="bg-white text-slate-800 font-semibold">In Progress</option>
                    <option value="DONE" class="bg-white text-slate-800 font-semibold">Done</option>
                  </select>

                  <button 
                    v-if="task.status !== 'IN_PROGRESS' && task.assignee === currentUserEmail" 
                    @click="updateTaskStatus('IN_PROGRESS')"
                    class="inline-flex items-center px-3.5 py-1 rounded-lg text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 transition-all shadow-sm cursor-pointer"
                  >
                    Mulai Dikerjakan
                  </button>

                  <button 
                    v-if="task.status === 'IN_PROGRESS' && task.assignee === currentUserEmail" 
                    @click="updateTaskStatus('DONE')"
                    class="inline-flex items-center px-3.5 py-1 rounded-lg text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 transition-all shadow-sm cursor-pointer"
                  >
                    Selesai
                  </button>
                </div>
              </div>

              <h1 class="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight break-words min-w-0">
                {{ task.title }}
              </h1>
            </div>

            <!-- Metadata Info Panel (Full Readable Text, No Truncation!) -->
            <div class="bg-slate-50/70 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-100 dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 min-w-0">
              <!-- Proyek -->
              <div class="flex items-start gap-3 min-w-0">
                <div class="p-2 rounded-lg bg-blue-100/70 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0">
                  <FolderKanban class="w-4 h-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Proyek</p>
                  <p class="font-bold text-slate-800 dark:text-slate-100 text-xs md:text-sm break-words leading-snug">
                    {{ getProjectName }}
                  </p>
                </div>
              </div>

              <!-- Customer -->
              <div class="flex items-start gap-3 min-w-0">
                <div class="p-2 rounded-lg bg-emerald-100/70 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0">
                  <Building2 class="w-4 h-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Customer</p>
                  <p class="font-bold text-slate-800 dark:text-slate-100 text-xs md:text-sm break-words leading-snug">
                    {{ getCustomerName }}
                  </p>
                </div>
              </div>

              <!-- PIC -->
              <div class="flex items-start gap-3 min-w-0">
                <div class="p-2 rounded-lg bg-purple-100/70 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0">
                  <User class="w-4 h-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">PIC</p>
                  <p class="font-bold text-slate-800 dark:text-slate-100 text-xs md:text-sm break-words leading-snug">
                    {{ getPicName }}
                  </p>
                </div>
              </div>

              <!-- Action By -->
              <div class="flex items-start gap-3 min-w-0">
                <div class="p-2 rounded-lg bg-amber-100/70 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0">
                  <UserCheck class="w-4 h-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Action By</p>
                  <p class="font-bold text-slate-800 dark:text-slate-100 text-xs md:text-sm break-words leading-snug">
                    {{ task.assignee ? task.assignee.split('@')[0] : 'Belum ditugaskan' }}
                  </p>
                </div>
              </div>

              <!-- Deadline -->
              <div class="flex items-start gap-3 sm:col-span-2 md:col-span-1 min-w-0">
                <div class="p-2 rounded-lg bg-rose-100/70 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0">
                  <Calendar class="w-4 h-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Deadline</p>
                  <p class="font-bold text-slate-800 dark:text-slate-100 text-xs md:text-sm break-words leading-snug">
                    {{ task.target_date ? formatDate(task.target_date) : '-' }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Description -->
            <div class="space-y-2 min-w-0">
              <h3 class="text-xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Deskripsi Tugas</h3>
              <div class="prose prose-slate dark:prose-invert max-w-none text-sm whitespace-pre-wrap leading-relaxed bg-slate-50/50 dark:bg-slate-800/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80 break-words break-all [overflow-wrap:anywhere] overflow-hidden">
                {{ task.description || 'Tidak ada deskripsi.' }}
              </div>
            </div>

            <!-- Attachment (If Available) -->
            <div v-if="task.file_url || getFileLink" class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <h3 class="text-xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Lampiran Dokumen</h3>
              <a :href="getFileLink || task.file_url" target="_blank" class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50 dark:bg-slate-800/40 hover:bg-blue-50/40 dark:hover:bg-blue-900/20 transition-all group">
                <div class="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Paperclip class="w-4 h-4" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {{ getFileLink ? 'Lihat Google Sheet / Link' : (task.file_name || 'Lihat Dokumen Lampiran') }}
                  </p>
                  <p class="text-[11px] text-slate-400">Klik untuk membuka / mengunduh file</p>
                </div>
                <Download class="w-4 h-4 text-slate-400 group-hover:text-blue-500 shrink-0" />
              </a>
            </div>

          </div>

          <!-- Compact Time Tracking Card -->
          <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-5 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 class="text-xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Jejak Waktu</h3>
            <div class="grid grid-cols-3 gap-2 text-center bg-slate-50/70 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
              <div class="space-y-0.5">
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Didelegasikan</p>
                <p class="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {{ task.delegated_at ? formatDate(task.delegated_at) : (task.created_at ? formatDate(task.created_at) : '-') }}
                </p>
              </div>
              <div class="space-y-0.5 border-x border-slate-200 dark:border-slate-700/60 px-2">
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mulai Dikerjakan</p>
                <p class="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {{ task.in_progress_at ? formatDate(task.in_progress_at) : '-' }}
                </p>
              </div>
              <div class="space-y-0.5">
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Selesai</p>
                <p class="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {{ task.done_at ? formatDate(task.done_at) : '-' }}
                </p>
              </div>
            </div>
          </div>

        </div>

        <!-- Right Column: Comments -->
        <div class="lg:col-span-1">
          <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col h-[560px] sticky top-6">
            <div class="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <MessageSquare class="w-4 h-4 text-slate-500" />
              <h2 class="font-bold text-sm text-slate-900 dark:text-white">Komentar & Diskusi</h2>
            </div>
            
            <!-- Comments List -->
            <div class="flex-1 overflow-y-auto p-4 space-y-4">
              <div v-if="comments.length === 0" class="h-full flex flex-col items-center justify-center text-slate-400 text-xs text-center">
                <MessageSquare class="w-8 h-8 mb-2 opacity-20" />
                <p>Belum ada diskusi.<br>Mulai percakapan pertama!</p>
              </div>
              
              <div 
                v-for="comment in comments" 
                :key="comment.id"
                class="flex flex-col space-y-1"
                :class="comment.user_email === currentUserEmail ? 'items-end' : 'items-start'"
              >
                <span class="text-[10px] text-slate-400 font-medium px-1">
                  {{ comment.user_email.split('@')[0] }} • {{ formatDate(comment.created_at) }}
                </span>
                <div 
                  class="relative max-w-[85%] rounded-2xl px-3.5 py-2 text-xs md:text-sm group"
                  :class="comment.user_email === currentUserEmail 
                    ? 'bg-blue-600 text-white rounded-tr-sm' 
                    : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 rounded-tl-sm'"
                >
                  <p class="whitespace-pre-wrap leading-relaxed">{{ comment.comment_text }}</p>
                  <button 
                    v-if="comment.user_email === currentUserEmail"
                    @click="deleteComment(comment.id)"
                    class="absolute -left-7 top-2 p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Hapus komentar"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <!-- Input Area -->
            <div class="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 rounded-b-2xl">
              <form @submit.prevent="submitComment" class="flex gap-2 relative">
                <textarea
                  v-model="newComment"
                  rows="1"
                  placeholder="Tulis pesan..."
                  class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs md:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none pr-11 shadow-sm"
                  @keydown.enter.exact.prevent="submitComment"
                ></textarea>
                <button 
                  type="submit" 
                  :disabled="isSubmittingComment || !newComment.trim()"
                  class="absolute right-2 bottom-2 p-1.5 rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Loader2 v-if="isSubmittingComment" class="w-3.5 h-3.5 animate-spin" />
                  <Send v-else class="w-3.5 h-3.5" />
                </button>
              </form>
              <p class="text-[10px] text-slate-400 mt-1.5 text-center">Tekan Enter untuk mengirim</p>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- Modal Edit Permintaan -->
    <div v-if="isEditModalOpen" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div class="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 my-8">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 class="text-lg font-black text-slate-900 dark:text-white">Edit Detail Permintaan</h3>
          <button @click="isEditModalOpen = false" class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X class="w-5 h-5" />
          </button>
        </div>

        <form @submit.prevent="saveEditTask" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">Judul / Subject *</label>
            <input v-model="editForm.title" type="text" required class="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">Proyek *</label>
              <input v-model="editForm.project_name" type="text" placeholder="Nama proyek..." class="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">Customer *</label>
              <input v-model="editForm.customer_name" type="text" placeholder="Nama customer..." class="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">PIC Customer *</label>
              <input v-model="editForm.pic_name" type="text" placeholder="Nama PIC..." class="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">Deadline *</label>
              <input v-model="editForm.target_date" type="date" class="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">Action By / Assignee</label>
            <select v-model="editForm.assignee" class="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Pilih User --</option>
              <option v-for="u in users" :key="u.email" :value="u.email">{{ u.email }}</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">Link Dokumen / Google Drive</label>
            <input v-model="editForm.file_link" type="url" placeholder="https://drive.google.com/..." class="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">Deskripsi Tugas</label>
            <textarea v-model="editForm.description" rows="3" class="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"></textarea>
          </div>

          <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button type="button" @click="isEditModalOpen = false" class="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl">
              Batal
            </button>
            <button type="submit" :disabled="isSavingEdit" class="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md disabled:opacity-50 inline-flex items-center">
              <Loader2 v-if="isSavingEdit" class="w-4 h-4 mr-2 animate-spin" />
              Simpan Perubahan
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
