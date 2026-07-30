<script setup>
import { ref, onMounted } from 'vue'
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
  Check
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

const taskId = route.params.id
const task = ref(null)
const isLoading = ref(true)
const isError = ref(false)
const currentUserEmail = ref('')
const isCopied = ref(false)

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
  'TODO': { label: 'To Do', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: Clock },
  'IN_PROGRESS': { label: 'In Progress', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Loader2 },
  'DONE': { label: 'Done', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 }
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
    task.value = data
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
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

const formatShortDate = (dateString) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}
</script>

<template>
  <div class="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-20">
      <Loader2 class="w-8 h-8 animate-spin text-blue-500 mb-4" />
      <p class="text-slate-500">Memuat detail permintaan...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="isError || !task" class="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
      <p class="text-red-500 font-medium mb-4">Permintaan tidak ditemukan atau telah dihapus.</p>
      <button @click="router.push('/permintaan')" class="text-blue-600 hover:underline">
        Kembali ke Board Permintaan
      </button>
    </div>

    <!-- Main Content -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      <!-- Left Column: Task Details -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Header -->
        <div>
          <div class="flex items-center justify-between mb-4">
            <button @click="router.push('/permintaan')" class="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
              <ArrowLeft class="w-4 h-4 mr-1" />
              Kembali ke Board
            </button>
            <div class="flex items-center gap-2">
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
          <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div v-if="task.task_number" class="mb-2">
                <span class="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">TASK-{{ task.task_number }}</span>
              </div>
              <h1 class="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                {{ task.title }}
              </h1>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <select 
                :value="task.status" 
                @change="updateTaskStatus($event.target.value)"
                class="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border outline-none cursor-pointer shadow-sm transition-all"
                :class="statusConfig[task.status]?.color || 'bg-slate-100 text-slate-500'"
              >
                <option value="TODO">⏰ To Do</option>
                <option value="IN_PROGRESS">🔄 In Progress</option>
                <option value="DONE">✅ Done</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Meta Info Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
            <div class="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <User class="w-5 h-5" />
            </div>
            <div>
              <p class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Assignee</p>
              <p class="font-bold text-slate-900 dark:text-white truncate" :title="task.assignee">
                {{ task.assignee || 'Belum ditugaskan' }}
              </p>
            </div>
          </div>
          <div class="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
            <div class="w-10 h-10 rounded-full bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
              <Calendar class="w-5 h-5" />
            </div>
            <div>
              <p class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Target Date</p>
              <p class="font-bold text-slate-900 dark:text-white">
                {{ formatShortDate(task.target_date) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Time Tracking -->
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <h2 class="text-lg font-bold text-slate-900 dark:text-white mb-4">Jejak Waktu</h2>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Didelegasikan</p>
              <p class="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                {{ task.delegated_at ? formatDate(task.delegated_at) : '-' }}
              </p>
            </div>
            <div>
              <p class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Mulai Dikerjakan</p>
              <p class="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                {{ task.in_progress_at ? formatDate(task.in_progress_at) : '-' }}
              </p>
            </div>
            <div>
              <p class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Selesai</p>
              <p class="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                {{ task.done_at ? formatDate(task.done_at) : '-' }}
              </p>
            </div>
          </div>
        </div>

        <!-- Description -->
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <h2 class="text-lg font-bold text-slate-900 dark:text-white mb-4">Deskripsi Tugas</h2>
          <div class="prose prose-slate dark:prose-invert max-w-none text-sm whitespace-pre-wrap leading-relaxed">
            {{ task.description || 'Tidak ada deskripsi.' }}
          </div>
        </div>

        <!-- Attachment -->
        <div v-if="task.file_url" class="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <h2 class="text-lg font-bold text-slate-900 dark:text-white mb-4">Lampiran File</h2>
          <a :href="task.file_url" target="_blank" class="inline-flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
            <div class="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Paperclip class="w-5 h-5" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-slate-900 dark:text-white truncate">{{ task.file_name || 'Lihat Dokumen' }}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">Klik untuk mengunduh / melihat</p>
            </div>
            <Download class="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
          </a>
        </div>
      </div>

      <!-- Right Column: Comments -->
      <div class="lg:col-span-1">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col h-[600px]">
          <div class="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <MessageSquare class="w-5 h-5 text-slate-500" />
            <h2 class="font-bold text-slate-900 dark:text-white">Komentar & Diskusi</h2>
          </div>
          
          <!-- Comments List -->
          <div class="flex-1 overflow-y-auto p-4 space-y-4">
            <div v-if="comments.length === 0" class="h-full flex flex-col items-center justify-center text-slate-500 text-sm text-center">
              <MessageSquare class="w-10 h-10 mb-2 opacity-20" />
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
                class="relative max-w-[85%] rounded-2xl px-4 py-2 text-sm group"
                :class="comment.user_email === currentUserEmail 
                  ? 'bg-blue-600 text-white rounded-tr-sm' 
                  : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 rounded-tl-sm'"
              >
                <p class="whitespace-pre-wrap">{{ comment.comment_text }}</p>
                <button 
                  v-if="comment.user_email === currentUserEmail"
                  @click="deleteComment(comment.id)"
                  class="absolute -left-8 top-2 p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Hapus komentar"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <!-- Input Area -->
          <div class="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
            <form @submit.prevent="submitComment" class="flex gap-2 relative">
              <textarea
                v-model="newComment"
                rows="1"
                placeholder="Tulis pesan..."
                class="w-full bg-white dark:bg-slate-800 border-0 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none pr-12 shadow-sm"
                @keydown.enter.exact.prevent="submitComment"
              ></textarea>
              <button 
                type="submit" 
                :disabled="isSubmittingComment || !newComment.trim()"
                class="absolute right-2 bottom-2 p-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Loader2 v-if="isSubmittingComment" class="w-4 h-4 animate-spin" />
                <Send v-else class="w-4 h-4" />
              </button>
            </form>
            <p class="text-[10px] text-slate-400 mt-2 text-center">Tekan Enter untuk mengirim</p>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
