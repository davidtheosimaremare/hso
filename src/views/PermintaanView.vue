<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import RichTextEditor from '@/components/RichTextEditor.vue'
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
  Pencil,
  Search,
  Building2,
  Check,
  CheckSquare,
  CheckCircle2,
  Repeat,
  Share2,
  Link,
  BarChart3,
  TableProperties,
  LayoutGrid,
  Eye,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  AlignLeft
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
  has_project_ref: false,
  project_name: '',
  customer_name: '',
  pic_name: '',
  description: '',
  assignees: [],
  target_date: '',
  file_link: '',
  subtasks: []
})
const hasProjectRef = computed(() => formData.value.has_project_ref)
const fileInput = ref(null)
const selectedFile = ref(null)
const attachmentMode = ref('file')
const newLinkTitle = ref('')
const newLinkUrl = ref('')
const isUploadingAttachment = ref(false)
const isDraggingOver = ref(false)
const modalNewSubtask = ref('')

const toggleAssignee = (email) => {
  if (!email) return
  const idx = formData.value.assignees.indexOf(email)
  if (idx > -1) {
    formData.value.assignees.splice(idx, 1)
  } else {
    formData.value.assignees.push(email)
  }
}

const addModalSubtask = () => {
  if (!modalNewSubtask.value.trim()) return
  formData.value.subtasks.push({
    id: Date.now().toString(),
    title: modalNewSubtask.value.trim(),
    completed: false
  })
  modalNewSubtask.value = ''
}

const removeModalSubtask = (index) => {
  formData.value.subtasks.splice(index, 1)
}

const addLinkAttachment = () => {
  if (!newLinkUrl.value.trim()) { alert('URL link wajib diisi!'); return }
  let url = newLinkUrl.value.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }
  // Use URL hostname as title if no title given
  let title = ''
  try { title = new URL(url).hostname } catch { title = url }
  formData.value.attachments.push({
    id: Date.now().toString() + Math.random().toString(36).substring(7),
    name: title,
    url: url,
    type: 'link'
  })
  newLinkUrl.value = ''
}

const removeAttachment = (index) => {
  formData.value.attachments.splice(index, 1)
}

const handleFilesUpload = async (event) => {
  const files = Array.from(event.dataTransfer?.files || event.target?.files || [])
  if (files.length === 0) return

  isUploadingAttachment.value = true
  for (const file of files) {
    try {
      let fileUrl = ''
      let fileName = file.name

      try {
        const driveFormData = new FormData()
        driveFormData.append('file', file)
        const { data: driveData, error: driveError } = await supabase.functions.invoke('upload-to-drive', {
          body: driveFormData
        })
        if (!driveError && driveData?.webViewLink) {
          fileUrl = driveData.webViewLink
        }
      } catch (driveErr) {
        console.warn('Drive upload fallback:', driveErr)
      }

      if (!fileUrl) {
        const fileExt = file.name.split('.').pop()
        const filePath = `uploads/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
        const { error: uploadError } = await supabase.storage.from('boq-files').upload(filePath, file)
        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage.from('boq-files').getPublicUrl(filePath)
          fileUrl = publicUrlData.publicUrl
        }
      }

      if (fileUrl) {
        formData.value.attachments.push({
          id: Date.now().toString() + Math.random().toString(36).substring(7),
          name: fileName,
          url: fileUrl,
          type: 'file'
        })
      }
    } catch (err) {
      console.error('Error uploading file attachment:', err)
    }
  }
  isUploadingAttachment.value = false
  if (fileInput.value) fileInput.value.value = ''
}

const applyRichFormat = (type) => {
  const textarea = document.getElementById('task-description-textarea')
  if (!textarea) return
  const start = textarea.selectionStart || 0
  const end = textarea.selectionEnd || 0
  const currentText = formData.value.description || ''
  const selected = currentText.substring(start, end)
  let formatted = ''

  if (type === 'bold') formatted = `**${selected || 'teks tebal'}**`
  else if (type === 'italic') formatted = `*${selected || 'teks miring'}*`
  else if (type === 'list') formatted = selected ? selected.split('\n').map(l => `• ${l}`).join('\n') : '\n• Item daftar'
  else if (type === 'code') formatted = `\`${selected || 'kode'}\``

  const before = currentText.substring(0, start)
  const after = currentText.substring(end)
  formData.value.description = before + formatted + after
}

// History State
const allTasksRaw = ref([])
const availablePeriods = ref([])
const activePeriod = ref('')

// Drag & Drop
const draggedTask = ref(null)
const draggingOverColumn = ref('')

// ---- Helpers ----
const getPeriodFromDate = (dateString) => {
  if (!dateString) return `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const date = new Date(dateString)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
const getUserDisplayName = (email) => {
  if (!email) return ''
  const trimmed = email.trim()
  try {
    const raw = localStorage.getItem('hir_team_contacts')
    if (raw) {
      const contacts = JSON.parse(raw)
      const contact = contacts[trimmed.toLowerCase()]
      if (contact && contact.full_name && contact.full_name.trim()) {
        return `${contact.full_name.trim()} (${trimmed})`
      }
    }
  } catch (e) {}
  const prefix = trimmed.split('@')[0] || trimmed
  const formatted = prefix.split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return `${formatted} (${trimmed})`
}
const setCurrentPeriod = () => {
  const now = new Date()
  activePeriod.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
// ---- Board Date Filter ----
const boardDateFilter = ref('') // '' = semua waktu, 'today' = hari ini, 'custom' = kustom
const boardDateModalOpen = ref(false)
const boardCustomFrom = ref('')
const boardCustomTo = ref('')

const boardDateLabel = computed(() => {
  if (boardDateFilter.value === 'today') return 'Hari Ini'
  if (boardDateFilter.value === 'custom' && boardCustomFrom.value && boardCustomTo.value)
    return `${boardCustomFrom.value} – ${boardCustomTo.value}`
  if (boardDateFilter.value === 'custom' && boardCustomFrom.value)
    return `≥ ${boardCustomFrom.value}`
  return 'Semua Waktu'
})

const applyBoardDateFilter = (tasks) => {
  if (!boardDateFilter.value) return tasks
  const todayStr = new Date().toISOString().split('T')[0]
  if (boardDateFilter.value === 'today') {
    return tasks.filter(t => t.target_date === todayStr || t.created_at?.split('T')[0] === todayStr)
  }
  if (boardDateFilter.value === 'custom') {
    return tasks.filter(t => {
      const d = t.target_date || t.created_at?.split('T')[0]
      if (!d) return false
      if (boardCustomFrom.value && d < boardCustomFrom.value) return false
      if (boardCustomTo.value && d > boardCustomTo.value) return false
      return true
    })
  }
  return tasks
}

const setBoardCustomRange = () => {
  if (boardCustomFrom.value || boardCustomTo.value) {
    boardDateFilter.value = 'custom'
  }
  boardDateModalOpen.value = false
  filterTasksByPeriod()
}

const resetBoardDateFilter = () => {
  boardDateFilter.value = ''
  boardCustomFrom.value = ''
  boardCustomTo.value = ''
  boardDateModalOpen.value = false
  filterTasksByPeriod()
}

const filterTasksByPeriod = () => {
  const base = activePeriod.value === 'ALL'
    ? allTasksRaw.value
    : allTasksRaw.value.filter(t => getPeriodFromDate(t.created_at) === activePeriod.value)

  let filtered = applyBoardDateFilter(base)

  // Apply assignee filter for board view
  if (tableFilters.value.assignees.length > 0) {
    filtered = filtered.filter(t =>
      getDisplayAssignees(t).some(e => tableFilters.value.assignees.includes(e))
    )
  }

  // Apply search for board view
  if (tableFilters.value.search) {
    const q = tableFilters.value.search.toLowerCase()
    filtered = filtered.filter(t => {
      const hay = `${t.title || ''} ${t.project_name || ''} ${t.customer_name || ''} ${t.assignee || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }

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

const parseMeta = (meta) => {
  if (!meta) return {}
  if (typeof meta === 'object') return meta
  if (typeof meta === 'string') {
    try { return JSON.parse(meta) } catch (e) { return {} }
  }
  return {}
}

const getProjectName = (task) => {
  if (!task) return ''
  const meta = parseMeta(task.metadata)
  return task.project_name || meta.project_name || getLocalMeta(task.id)?.project_name || ''
}
const getCustomerName = (task) => {
  if (!task) return ''
  const meta = parseMeta(task.metadata)
  return task.customer_name || meta.customer_name || getLocalMeta(task.id)?.customer_name || ''
}
const getPicName = (task) => {
  if (!task) return ''
  const meta = parseMeta(task.metadata)
  return task.pic_name || meta.pic_name || getLocalMeta(task.id)?.pic_name || ''
}
const getFileLink = (task) => {
  if (!task) return ''
  const meta = parseMeta(task.metadata)
  return task.file_link || meta.file_link || getLocalMeta(task.id)?.file_link || ''
}
const getTaskAttachments = (task) => {
  if (!task) return []
  const meta = parseMeta(task.metadata)
  if (Array.isArray(meta.attachments) && meta.attachments.length > 0) {
    return meta.attachments
  }
  if (task.file_url || task.file_link) {
    return [{
      id: 'legacy_1',
      name: task.file_name || 'Lampiran Dokumen',
      url: task.file_link || task.file_url,
      type: task.file_link ? 'link' : 'file'
    }]
  }
  return []
}

const getSubtaskProgress = (task) => {
  if (!task) return { completed: 0, total: 0 }
  const meta = parseMeta(task.metadata)
  if (Array.isArray(meta.subtasks) && meta.subtasks.length > 0) {
    const completed = meta.subtasks.filter(s => s.completed).length
    return { completed, total: meta.subtasks.length }
  }
  return { completed: 0, total: 0 }
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
    availablePeriods.value = Array.from(new Set(allTasksRaw.value.map(t => getPeriodFromDate(t.created_at)))).sort((a, b) => b.localeCompare(a))

    activePeriod.value = 'ALL'
    filterTasksByPeriod()

    // Trigger recurring tasks auto-generation & deadline notifications (non-blocking)
    try { await processRecurringTasks(allTasksRaw.value) } catch (e) { console.warn('processRecurringTasks notice:', e) }
    try { checkAndTriggerDeadlineReminders(allTasksRaw.value) } catch (e) { console.warn('deadlineReminders notice:', e) }
  } catch (err) {
    console.error('Error fetching tasks:', err)
    // Don't show alert — silently fail so UI stays responsive
  } finally {
    isLoading.value = false
  }
}

const getWeekOfYear = (d = new Date()) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

// Auto-Generator Engine for Recurring Monthly & Weekly Tasks
const processRecurringTasks = async (tasks) => {
  if (!Array.isArray(tasks) || tasks.length === 0) return

  const now = new Date()
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentWeek = getWeekOfYear(now)
  const currentDayOfMonth = now.getDate()
  const currentDayOfWeek = now.getDay() // 0 = Minggu, 1 = Senin, ... 6 = Sabtu

  const recurringTemplates = tasks.filter(t => {
    const meta = parseMeta(t.metadata)
    if (!meta.is_recurring) return false
    if (meta.recurrence_type === 'WEEKLY') {
      return meta.last_generated_week !== currentWeek
    }
    return meta.last_generated_period !== currentPeriod
  })

  if (recurringTemplates.length === 0) return

  for (const t of recurringTemplates) {
    const meta = parseMeta(t.metadata)
    const type = meta.recurrence_type || 'MONTHLY'
    let shouldGenerate = false
    let newTargetDate = now.toISOString().split('T')[0]

    if (type === 'WEEKLY') {
      const reqWeekday = meta.recurrence_weekday !== undefined ? Number(meta.recurrence_weekday) : 1
      if (currentDayOfWeek === reqWeekday) {
        shouldGenerate = true
      }
    } else {
      const reqDay = Number(meta.recurrence_day) || 1
      if (currentDayOfMonth >= reqDay) {
        shouldGenerate = true
        const targetYear = now.getFullYear()
        const targetMonth = now.getMonth()
        const lastDayOfCurMonth = new Date(targetYear, targetMonth + 1, 0).getDate()
        const actualDay = Math.min(reqDay, lastDayOfCurMonth)
        newTargetDate = new Date(targetYear, targetMonth, actualDay).toISOString().split('T')[0]
      }
    }

    if (shouldGenerate) {
      try {
        const resetSubtasks = Array.isArray(meta.subtasks)
          ? meta.subtasks.map(st => ({ ...st, completed: false }))
          : []

        const newMeta = {
          ...meta,
          subtasks: resetSubtasks,
          last_generated_period: currentPeriod,
          last_generated_week: currentWeek
        }

        const newTaskPayload = {
          title: t.title,
          project_name: t.project_name || '',
          customer_name: t.customer_name || '',
          pic_name: t.pic_name || '',
          description: t.description || '',
          assignee: t.assignee || '',
          target_date: newTargetDate,
          status: 'TODO',
          created_by: 'SISTEM (Tugas Rutin)',
          file_url: t.file_url || null,
          file_name: t.file_name || null,
          file_link: t.file_link || null,
          metadata: newMeta
        }

        const { data: createdTasks, error: insErr } = await supabase
          .from('boq_requests')
          .insert([newTaskPayload])
          .select()

        if (!insErr && createdTasks && createdTasks[0]) {
          meta.last_generated_period = currentPeriod
          meta.last_generated_week = currentWeek
          await supabase
            .from('boq_requests')
            .update({ metadata: meta })
            .eq('id', t.id)

          sendMultiChannelTaskNotification(createdTasks[0], 'ASSIGNED')
        }
      } catch (err) {
        console.warn('Error generating recurring task:', err)
      }
    }
  }
}

const checkAndTriggerDeadlineReminders = (tasks) => {
  if (!Array.isArray(tasks)) return
  const todayStr = new Date().toISOString().split('T')[0]
  
  tasks.forEach(t => {
    if (t.status === 'DONE' || !t.target_date || !t.assignee) return

    const keyNotifAppr = `hir_notif_sent_${t.id}_APPROACHING_${todayStr}`
    const keyNotifOver = `hir_notif_sent_${t.id}_OVERDUE_${todayStr}`

    const isOver = isOverdue(t.target_date)
    const isAppr = isApproachingDeadline(t.target_date)

    if (isOver && !localStorage.getItem(keyNotifOver)) {
      localStorage.setItem(keyNotifOver, '1')
      sendMultiChannelTaskNotification(t, 'OVERDUE')
    } else if (isAppr && !localStorage.getItem(keyNotifAppr)) {
      localStorage.setItem(keyNotifAppr, '1')
      sendMultiChannelTaskNotification(t, 'APPROACHING')
    }
  })
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
  document.addEventListener('click', handleClickOutsideFilterBar)
  setupRealtime()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutsideCustomer)
  document.removeEventListener('click', handleClickOutsideFilterBar)
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
  }
})

// ---- Realtime Sync (Supabase) ----
let realtimeChannel = null

const setupRealtime = () => {
  realtimeChannel = supabase
    .channel('boq-requests-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'boq_requests' }, (payload) => {
      handleRealtimeChange(payload)
    })
    .subscribe()
}

const handleRealtimeChange = (payload) => {
  const { eventType, new: newRow, old: oldRow } = payload
  const id = (newRow?.id) || (oldRow?.id)
  if (!id) return

  if (eventType === 'DELETE') {
    allTasksRaw.value = allTasksRaw.value.filter(t => String(t.id) !== String(id))
    filterTasksByPeriod()
    return
  }

  const idx = allTasksRaw.value.findIndex(t => String(t.id) === String(id))
  if (idx === -1) {
    allTasksRaw.value = [newRow, ...allTasksRaw.value]
    const newPeriod = getPeriodFromDate(newRow.created_at)
    if (!availablePeriods.value.includes(newPeriod)) {
      availablePeriods.value = [newPeriod, ...availablePeriods.value].sort((a, b) => b.localeCompare(a))
    }
  } else {
    allTasksRaw.value.splice(idx, 1, newRow)
  }
  filterTasksByPeriod()

  if (eventType === 'UPDATE' && oldRow?.status && newRow?.status && oldRow.status !== newRow.status) {
    try { localStorage.setItem(`boq_status_${id}`, newRow.status) } catch {}
  }
}

// ---- Gantt Chart ----
const viewMode = ref('board')
const ganttDayWidth = 36

const ganttTasks = computed(() => {
  // Use tableTasks (which respects all filters) for gantt view
  return tableTasks.value
    .slice()
    .sort((a, b) => {
      const aStart = a.created_at || ''
      const bStart = b.created_at || ''
      return String(aStart).localeCompare(String(bStart))
    })
})

const ganttRange = computed(() => {
  const tasks = ganttTasks.value
  if (tasks.length === 0) return { start: null, end: null, days: [] }
  const times = []
  tasks.forEach(t => {
    if (t.created_at) times.push(new Date(t.created_at).getTime())
    if (t.target_date) times.push(new Date(t.target_date + 'T00:00:00').getTime())
  })
  times.push(new Date().getTime())
  let start = new Date(Math.min(...times))
  let end = new Date(Math.max(...times))

  const startOfWeek = new Date(start)
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7))
  startOfWeek.setHours(0, 0, 0, 0)

  const endOfWeek = new Date(end)
  endOfWeek.setDate(endOfWeek.getDate() + (6 - ((endOfWeek.getDay() + 6) % 7)))
  endOfWeek.setHours(23, 59, 59, 999)

  const spanDays = Math.round((endOfWeek - startOfWeek) / 86400000) + 1
  if (spanDays > 182) {
    endOfWeek.setTime(startOfWeek.getTime() + 181 * 86400000)
  }

  const days = []
  for (let d = new Date(startOfWeek); d <= endOfWeek; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d))
  }
  return { start: startOfWeek, end: endOfWeek, days }
})

const weekColumns = computed(() => {
  const days = ganttRange.value.days
  if (!days || days.length === 0) return []
  const weeks = []
  let current = []
  days.forEach(d => {
    current.push(d)
    if (((d.getDay() + 6) % 7) === 6) { weeks.push(current); current = [] }
  })
  if (current.length) weeks.push(current)
  return weeks
})

const monthColumns = computed(() => {
  const days = ganttRange.value.days
  if (!days || days.length === 0) return []
  const months = []
  let cur = null
  days.forEach((d, i) => {
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!cur || cur.monthKey !== key) {
      if (cur) months.push({ ...cur, width: (i - cur.startIndex) * ganttDayWidth })
      cur = { monthKey: key, label: d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }), width: 0, startIndex: i }
    }
  })
  months.push({ ...cur, width: (days.length - cur.startIndex) * ganttDayWidth })
  return months
})

const ganttTotalWidth = computed(() => (ganttRange.value.days.length || 0) * ganttDayWidth)

const todayOffset = computed(() => {
  const { start } = ganttRange.value
  if (!start) return 0
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const d = Math.round((now - start) / 86400000)
  return d >= 0 ? d * ganttDayWidth : 0
})

const ganttDayLabel = (d) => {
  const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
  return { date: d.getDate(), day: dayNames[d.getDay()], isWeekend: d.getDay() === 0 || d.getDay() === 6 }
}

const getTaskStart = (task) => {
  const rangeStart = ganttRange.value.start
  if (!rangeStart) return new Date()
  const t = task.created_at ? new Date(task.created_at) : new Date(rangeStart)
  return t < rangeStart ? new Date(rangeStart) : t
}
const getTaskEnd = (task) => {
  const rangeEnd = ganttRange.value.end
  if (task.target_date) {
    const e = new Date(task.target_date + 'T23:59:59')
    return e > rangeEnd ? new Date(rangeEnd) : e
  }
  if (task.done_at) {
    const e = new Date(task.done_at)
    return e > rangeEnd ? new Date(rangeEnd) : e
  }
  return new Date(rangeEnd)
}
const ganttBarStyle = (task) => {
  const { start, days } = ganttRange.value
  if (!start || !days || days.length === 0) return {}
  const s = getTaskStart(task)
  const e = getTaskEnd(task)
  const left = Math.max(0, Math.round((s - start) / 86400000))
  const right = Math.min(days.length - 1, Math.round((e - start) / 86400000))
  const width = Math.max(right - left + 1, 1) * ganttDayWidth - 4
  const offset = left * ganttDayWidth
  return { left: offset + 'px', width: width + 'px' }
}
const ganttStatusColor = (status) => {
  if (status === 'DONE') return 'bg-emerald-500'
  if (status === 'IN_PROGRESS') return 'bg-red-500'
  return 'bg-amber-400'
}

// ---- Table View ----
const tableFilters = ref({ assignees: [], statuses: [], dateFrom: '', dateTo: '', datePreset: '', search: '' })
const statusFilterOpen = ref(false)
const assigneeFilterOpen = ref(false)
const datePopoverOpen = ref(false)
const filterBarRef = ref(null)

const activeFilterCount = computed(() => {
  let count = 0
  if (tableFilters.value.search) count++
  if (tableFilters.value.statuses.length > 0) count += tableFilters.value.statuses.length
  if (tableFilters.value.assignees.length > 0) count += tableFilters.value.assignees.length
  if (tableFilters.value.dateFrom || tableFilters.value.dateTo || tableFilters.value.datePreset) count++
  return count
})

const dateFilterLabel = computed(() => {
  if (tableFilters.value.datePreset) {
    const found = datePresets.find(p => String(p.days) === String(tableFilters.value.datePreset))
    return found ? found.label : 'Periode'
  }
  if (tableFilters.value.dateFrom && tableFilters.value.dateTo) {
    return `${formatDate(tableFilters.value.dateFrom)} - ${formatDate(tableFilters.value.dateTo)}`
  }
  if (tableFilters.value.dateFrom) return `Dari ${formatDate(tableFilters.value.dateFrom)}`
  if (tableFilters.value.dateTo) return `s/d ${formatDate(tableFilters.value.dateTo)}`
  return 'Semua Waktu'
})

const resetDateFilter = () => {
  tableFilters.value.dateFrom = ''
  tableFilters.value.dateTo = ''
  tableFilters.value.datePreset = ''
}

// ---- Pagination ----
const tablePage = ref(1)
const tablePageSize = ref(20)

watch(tableFilters, () => { tablePage.value = 1 }, { deep: true })

const toggleStatusFilter = (status) => {
  const idx = tableFilters.value.statuses.indexOf(status)
  if (idx > -1) {
    tableFilters.value.statuses.splice(idx, 1)
  } else {
    tableFilters.value.statuses.push(status)
  }
}
const toggleAssigneeFilter = (email) => {
  const idx = tableFilters.value.assignees.indexOf(email)
  if (idx > -1) {
    tableFilters.value.assignees.splice(idx, 1)
  } else {
    tableFilters.value.assignees.push(email)
  }
}
const handleClickOutsideFilterBar = (event) => {
  if (filterBarRef.value && !filterBarRef.value.contains(event.target)) {
    statusFilterOpen.value = false
    assigneeFilterOpen.value = false
    datePopoverOpen.value = false
    boardDateModalOpen.value = false
  }
}

// Re-filter board tasks when search or assignees change
watch(
  [() => tableFilters.value.search, () => tableFilters.value.assignees],
  () => { filterTasksByPeriod() },
  { deep: true }
)

const datePresets = [
  { label: 'Hari Ini', days: 1 },
  { label: '7 Hari', days: 7 },
  { label: '30 Hari', days: 30 },
  { label: '3 Bulan', days: 90 },
  { label: '1 Tahun', days: 365 }
]

const setDatePreset = (days) => {
  if (!days) {
    tableFilters.value.dateFrom = ''
    tableFilters.value.dateTo = ''
    tableFilters.value.datePreset = ''
    return
  }
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - (days - 1))
  tableFilters.value.dateFrom = from.toISOString().split('T')[0]
  tableFilters.value.dateTo = to.toISOString().split('T')[0]
  tableFilters.value.datePreset = String(days)
}

const assigneeOptions = computed(() => {
  const set = new Set()
  allTasksRaw.value.forEach(t => getDisplayAssignees(t).forEach(e => set.add(e)))
  return Array.from(set).sort()
})

const statusOptions = [
  { value: 'TODO', label: 'To Do' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DONE', label: 'Done' }
]

const tableTasks = computed(() => {
  const { assignees, statuses, dateFrom, dateTo, search } = tableFilters.value
  return allTasksRaw.value.filter(t => {
    if (statuses.length > 0 && !statuses.includes(t.status)) return false
    if (assignees.length > 0 && !getDisplayAssignees(t).some(e => assignees.includes(e))) return false
    if (dateFrom && (!t.target_date || t.target_date < dateFrom)) return false
    if (dateTo && (!t.target_date || t.target_date > dateTo)) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${t.title || ''} ${t.project_name || ''} ${getCustomerName(t)} ${t.assignee || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }).sort((a, b) => {
    const aD = a.target_date || '9999-99-99'
    const bD = b.target_date || '9999-99-99'
    return aD.localeCompare(bD)
  })
})

const totalTablePages = computed(() => Math.max(1, Math.ceil(tableTasks.value.length / tablePageSize.value)))
const paginatedTableTasks = computed(() => {
  const start = (tablePage.value - 1) * tablePageSize.value
  return tableTasks.value.slice(start, start + tablePageSize.value)
})

const tableStatusBadge = (status) => {
  if (status === 'DONE') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
  if (status === 'IN_PROGRESS') return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
  return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
}
const tableStatusLabel = (status) => {
  if (status === 'DONE') return 'Done'
  if (status === 'IN_PROGRESS') return 'In Progress'
  return 'To Do'
}

const compactStatusBadge = (status) => {
  if (status === 'DONE') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
  if (status === 'IN_PROGRESS') return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
  return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
}

const statusColumns = computed(() => [
  { status: 'TODO', label: 'To Do', count: todoTasks.length, bg: 'bg-amber-50/40 dark:bg-amber-950/10', dot: 'bg-amber-500' },
  { status: 'IN_PROGRESS', label: 'In Progress', count: inProgressTasks.length, bg: 'bg-red-50/40 dark:bg-red-950/10', dot: 'bg-red-500' },
  { status: 'DONE', label: 'Done', count: doneTasks.length, bg: 'bg-emerald-50/40 dark:bg-emerald-950/10', dot: 'bg-emerald-500' }
])

const boardColumns = computed(() => [
  { status: 'TODO', label: 'To Do', dot: 'bg-amber-500', tasks: todoTasks.value },
  { status: 'IN_PROGRESS', label: 'In Progress', dot: 'bg-red-500', tasks: inProgressTasks.value },
  { status: 'DONE', label: 'Done', dot: 'bg-emerald-500', tasks: doneTasks.value }
])

const statusActions = (task) => {
  const all = [
    { value: 'TODO', label: 'To Do' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'DONE', label: 'Done' }
  ]
  return all.filter(s => s.value !== task.status)
}
const resetTableFilters = () => {
  tableFilters.value = { assignees: [], statuses: [], dateFrom: '', dateTo: '', datePreset: '', search: '' }
}

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

// Strip HTML tags and return plain text (for description preview)
const stripHtml = (html) => {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim()
}
const descPreview = (html, maxLen = 80) => {
  const text = stripHtml(html)
  if (!text) return ''
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

const getDisplayAssignees = (task) => {
  if (!task) return []
  const meta = parseMeta(task.metadata)
  if (Array.isArray(meta.assignees) && meta.assignees.length > 0) {
    return meta.assignees
  }
  if (task.assignee) {
    return task.assignee.split(',').map(s => s.trim()).filter(Boolean)
  }
  return []
}

// ---- Modal ----
const openModal = (task = null) => {
  fetchUsers()
  fetchAccurateCustomers()
  modalNewSubtask.value = ''

  if (task) {
    editingTask.value = task
    const projName = getProjectName(task)
    const custName = getCustomerName(task)
    const picName = getPicName(task)
    const meta = parseMeta(task.metadata)

    let assigneesArr = Array.isArray(meta.assignees) ? [...meta.assignees] : []
    if (assigneesArr.length === 0 && task.assignee) {
      assigneesArr = task.assignee.split(',').map(s => s.trim()).filter(Boolean)
    }

    let attachmentsArr = Array.isArray(meta.attachments) ? JSON.parse(JSON.stringify(meta.attachments)) : []
    if (attachmentsArr.length === 0 && (task.file_url || task.file_link)) {
      const url = task.file_link || task.file_url
      const name = task.file_name || 'Lampiran Dokumen'
      attachmentsArr.push({
        id: 'legacy_1',
        name: name,
        url: url,
        type: task.file_link ? 'link' : 'file'
      })
    }

    formData.value = {
      title: task.title || '',
      has_project_ref: meta.has_project_ref !== undefined ? meta.has_project_ref : !!(projName || custName || picName),
      project_name: projName,
      customer_name: custName,
      pic_name: picName,
      description: task.description || '',
      assignees: assigneesArr,
      target_date: task.target_date || '',
      file_link: task.file_link || '',
      subtasks: Array.isArray(meta.subtasks) ? JSON.parse(JSON.stringify(meta.subtasks)) : [],
      attachments: attachmentsArr,
      is_recurring: meta.is_recurring || false,
      recurrence_type: meta.recurrence_type || 'MONTHLY',
      recurrence_day: meta.recurrence_day || 1,
      recurrence_weekday: meta.recurrence_weekday !== undefined ? meta.recurrence_weekday : 1
    }
    customerSearchQuery.value = custName
    attachmentMode.value = 'file'
  } else {
    editingTask.value = null
    formData.value = {
      title: '',
      has_project_ref: false,
      project_name: '',
      customer_name: '',
      pic_name: '',
      description: '',
      assignees: [],
      target_date: '',
      file_link: '',
      subtasks: [],
      attachments: [],
      is_recurring: false,
      recurrence_type: 'MONTHLY',
      recurrence_day: 1,
      recurrence_weekday: 1
    }
    customerSearchQuery.value = ''
    attachmentMode.value = 'file'
  }
  isCustomerDropdownOpen.value = false
  if (fileInput.value) fileInput.value.value = ''
  newLinkTitle.value = ''
  newLinkUrl.value = ''
  isModalOpen.value = true
}
const closeModal = () => { 
  isModalOpen.value = false 
  isCustomerDropdownOpen.value = false
}
const handleFileChange = (event) => { selectedFile.value = event.target.files[0] || null }
const handleLinkChange = (event) => { formData.value.file_link = event.target.value }

// Quick Date Picker Chip Helper (Google Tasks style)
const setQuickDate = (daysToAdd) => {
  const target = new Date()
  target.setDate(target.getDate() + daysToAdd)
  formData.value.target_date = target.toISOString().split('T')[0]
}

// --- MULTI-CHANNEL NOTIFICATION HELPER (IN-APP, EMAIL, FONNTE WHATSAPP) ---
const sendMultiChannelTaskNotification = async (taskData, type = 'ASSIGNED', opts = {}) => {
  // Kebijakan notifikasi:
  // - Email: hanya saat CREATE (ASSIGNED) dan H-1 deadline (APPROACHING)
  // - WhatsApp: hanya saat H-1 deadline (APPROACHING)
  const shouldEmail = opts.email !== undefined ? opts.email : (type === 'ASSIGNED' || type === 'APPROACHING')
  const shouldWa = opts.wa !== undefined ? opts.wa : (type === 'APPROACHING')
  const meta = parseMeta(taskData.metadata)
  let recipients = Array.isArray(meta.assignees) && meta.assignees.length > 0
    ? meta.assignees
    : (taskData.assignee ? taskData.assignee.split(',').map(s => s.trim()).filter(Boolean) : [])

  if (recipients.length === 0) return

  for (const recipient of recipients) {
    if (!recipient) continue

    // Resolve user contact info live from user_access / local storage
    let notifEmail = recipient
    try {
      const { data: userAcc } = await supabase
        .from('user_access')
        .select('notification_email')
        .eq('email', recipient)
        .maybeSingle()

      if (userAcc?.notification_email && userAcc.notification_email.includes('@')) {
        notifEmail = userAcc.notification_email
      } else {
        const raw = localStorage.getItem('hir_team_contacts')
        if (raw) {
          const contacts = JSON.parse(raw)
          const contact = contacts[recipient.toLowerCase()]
          if (contact?.notification_email) notifEmail = contact.notification_email
        }
      }
    } catch (e) {}

    const taskNumStr = taskData.task_number ? `TASK-${taskData.task_number}` : 'TASK'
    const appUrl = `${window.location.origin}/collaborate/${taskData.id}`
    const projectStr = taskData.project_name || getProjectName(taskData) || '-'
    const targetDateStr = taskData.target_date || '-'

    // 1. In-App Notification (Supabase notifications table)
    try {
      let titleStr = 'Tugas Baru Didelegasikan'
      let msgStr = `Anda ditugaskan pada "${taskData.title}" (${taskNumStr}). Deadline: ${targetDateStr}`
      if (type === 'APPROACHING') {
        titleStr = 'Peringatan Deadline (H-1)'
        msgStr = `Tugas "${taskData.title}" (${taskNumStr}) mendekati deadline (${targetDateStr}). Mohon segera diselesaikan.`
      } else if (type === 'OVERDUE') {
        titleStr = 'Peringatan Tugas Overdue'
        msgStr = `Tugas "${taskData.title}" (${taskNumStr}) telah melewati deadline (${targetDateStr}).`
      }

      await supabase.from('notifications').insert([{
        recipient_email: recipient,
        title: titleStr,
        message: msgStr,
        type: type === 'ASSIGNED' ? 'TASK_ASSIGNED' : 'TASK_DEADLINE',
        link: `/collaborate/${taskData.id}`,
        is_read: false
      }])
    } catch (err) {
      console.warn('Note on In-App notification insert:', err)
    }

    // 2. Email Notification (send-custom-email Edge Function)
    if (shouldEmail && notifEmail && notifEmail.includes('@')) {
      try {
        let subject = `[Tugas Baru] ${taskData.title}`
        let headerTitle = 'Tugas Baru Didelegasikan Kepada Anda'
        if (type === 'APPROACHING') {
          subject = `[Peringatan Deadline H-1] Tugas: "${taskData.title}"`
          headerTitle = 'Pengingat Deadline Tugas (H-1)'
        } else if (type === 'OVERDUE') {
          subject = `[Peringatan Overdue] Tugas: "${taskData.title}"`
          headerTitle = 'Peringatan Tugas Overdue (Lewat Deadline)'
        }

        const htmlBody = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; padding: 32px 16px; color: #1e293b;">
            <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
              
              <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 13px; font-weight: 800; color: #0f172a; tracking: 0.5px;">HIR WORKSPACE</span>
                <span style="font-size: 12px; color: #64748b; font-weight: 500;">Pemberitahuan Tugas</span>
              </div>

              <div style="margin-bottom: 20px;">
                <h2 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 700; color: #0f172a; line-height: 1.3;">${headerTitle}</h2>
                <p style="margin: 0; font-size: 13px; color: #64748b;">Halo, Anda ditugaskan pada item pekerjaan berikut di HIR Workspace.</p>
              </div>

              <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; background-color: #ffffff; margin-bottom: 24px;">
                <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 4px;">ID TUGAS: ${taskNumStr}</div>
                <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.4;">${taskData.title}</h3>
                
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                  <tr style="border-top: 1px solid #f8fafc;">
                    <td style="padding: 8px 0; color: #64748b; width: 130px; font-weight: 500;">Target Deadline:</td>
                    <td style="padding: 8px 0; color: #dc2626; font-weight: 700;">${targetDateStr}</td>
                  </tr>
                  ${projectStr !== '-' ? `
                  <tr style="border-top: 1px solid #f8fafc;">
                    <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Proyek / Unit:</td>
                    <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${projectStr}</td>
                  </tr>` : ''}
                  ${meta.customer_name ? `
                  <tr style="border-top: 1px solid #f8fafc;">
                    <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Pelanggan:</td>
                    <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${meta.customer_name}</td>
                  </tr>` : ''}
                  ${meta.notes || taskData.description ? `
                  <tr style="border-top: 1px solid #f8fafc;">
                    <td style="padding: 8px 0; color: #64748b; font-weight: 500; vertical-align: top;">Deskripsi:</td>
                    <td style="padding: 8px 0; color: #334155; font-weight: 400; line-height: 1.5;">${meta.notes || taskData.description}</td>
                  </tr>` : ''}
                </table>
              </div>

              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${appUrl}" target="_blank" style="display: inline-block; background-color: #dc2626; color: #ffffff; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px;">
                  Lihat Detail Tugas
                </a>
              </div>

              <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 24px; font-size: 12px; color: #94a3b8; text-align: center;">
                Email notifikasi ini dikirimkan secara otomatis dari Sistem HIR Workspace Hokiindo.
              </div>

            </div>
          </div>
        `

        await supabase.functions.invoke('send-custom-email', {
          body: {
            to: notifEmail,
            from_email: 'workspace@hokiindo.co.id',
            from_name: 'HIR Workspace Notification',
            subject,
            html: htmlBody
          }
        })
      } catch (err) {
        console.warn('Note on email notification invoke:', err)
      }
    }

    // Note: Mobile/WhatsApp notifications for To-Do tasks are intentionally disabled to prevent user distraction.
    // Task updates are sent via Web In-App Notification & Workspace Email.
  }
}

// ---- Submit ----
const submitForm = async () => {
  if (!formData.value.title.trim()) { alert('Judul tugas wajib diisi!'); return }
  if (formData.value.assignees.length === 0) { alert('Silakan pilih minimal satu penanggung jawab (Ditugaskan untuk)!'); return }
  if (!formData.value.target_date) { alert('Target deadline wajib diisi!'); return }
  
  isSubmitting.value = true
  try {
    const firstAtt = formData.value.attachments && formData.value.attachments.length > 0 ? formData.value.attachments[0] : null
    const finalCustomer = hasProjectRef.value ? (customerSearchQuery.value || formData.value.customer_name || '') : ''
    const finalAssigneeStr = formData.value.assignees.join(', ')

    const payload = {
      title: formData.value.title,
      project_name: hasProjectRef.value ? (formData.value.project_name || '') : '',
      customer_name: finalCustomer,
      pic_name: hasProjectRef.value ? (formData.value.pic_name || '') : '',
      description: formData.value.description || '',
      assignee: finalAssigneeStr,
      target_date: formData.value.target_date || null,
      file_url: firstAtt ? firstAtt.url : null,
      file_name: firstAtt ? firstAtt.name : null,
      file_link: firstAtt && firstAtt.type === 'link' ? firstAtt.url : null,
      metadata: {
        has_project_ref: hasProjectRef.value,
        project_name: hasProjectRef.value ? (formData.value.project_name || '') : '',
        customer_name: finalCustomer,
        pic_name: hasProjectRef.value ? (formData.value.pic_name || '') : '',
        file_link: firstAtt && firstAtt.type === 'link' ? firstAtt.url : '',
        assignees: formData.value.assignees || [],
        subtasks: formData.value.subtasks || [],
        attachments: formData.value.attachments || [],
        is_recurring: formData.value.is_recurring || false,
        recurrence_type: formData.value.is_recurring ? (formData.value.recurrence_type || 'MONTHLY') : 'NONE',
        recurrence_day: formData.value.is_recurring ? (Number(formData.value.recurrence_day) || 1) : 1,
        recurrence_weekday: formData.value.is_recurring ? (formData.value.recurrence_weekday !== undefined ? Number(formData.value.recurrence_weekday) : 1) : 1,
        last_generated_period: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
        last_generated_week: getWeekOfYear(new Date())
      }
    }

    const saveLocalMeta = (id, meta) => {
      if (!id) return
      try {
        localStorage.setItem(`boq_meta_${id}`, JSON.stringify(meta))
      } catch (e) {}
    }

    let savedTaskObj = null

    if (editingTask.value) {
      const taskId = editingTask.value.id
      saveLocalMeta(taskId, payload.metadata)

      // Stage 1: Try full payload with direct columns + metadata + file_link
      const { error: err1 } = await supabase.from('boq_requests').update(payload).eq('id', taskId)
      if (err1) {
        console.warn('Stage 1 Update notice (full payload):', err1.message)
        // Stage 2: Try payload with direct columns + metadata (without file_link)
        const stage2Payload = {
          title: payload.title,
          project_name: payload.project_name,
          customer_name: payload.customer_name,
          pic_name: payload.pic_name,
          description: payload.description,
          assignee: payload.assignee,
          target_date: payload.target_date,
          file_url: payload.file_url,
          file_name: payload.file_name,
          metadata: payload.metadata
        }
        const { error: err2 } = await supabase.from('boq_requests').update(stage2Payload).eq('id', taskId)
        if (err2) {
          console.warn('Stage 2 Update notice (without file_link):', err2.message)
          // Stage 3: Try payload with metadata + base columns (without project_name/customer_name/pic_name)
          const stage3Payload = {
            title: payload.title,
            description: payload.description,
            assignee: payload.assignee,
            target_date: payload.target_date,
            file_url: payload.file_url,
            file_name: payload.file_name,
            metadata: payload.metadata
          }
          const { error: err3 } = await supabase.from('boq_requests').update(stage3Payload).eq('id', taskId)
          if (err3) {
            console.warn('Stage 3 Update notice (without metadata):', err3.message)
            // Stage 4: Pure base payload
            const stage4Payload = {
              title: payload.title,
              description: payload.description,
              assignee: payload.assignee,
              target_date: payload.target_date,
              file_url: payload.file_url,
              file_name: payload.file_name
            }
            const { error: err4 } = await supabase.from('boq_requests').update(stage4Payload).eq('id', taskId)
            if (err4) throw err4
          }
        }
      }
      savedTaskObj = { ...payload, id: taskId, task_number: editingTask.value.task_number }
      showToast('Permintaan Diperbarui', `Tugas "${payload.title}" berhasil diperbarui.`)
    } else {
      const { data: userData } = await supabase.auth.getUser()
      payload.created_by = userData?.user?.email || 'Unknown'
      payload.status = 'TODO'

      // Stage 1: Try full payload
      const { data: insData1, error: err1 } = await supabase.from('boq_requests').insert([payload]).select()
      if (err1) {
        console.warn('Stage 1 Insert notice (full payload):', err1.message)
        // Stage 2: Try without file_link column
        const stage2Payload = {
          title: payload.title,
          project_name: payload.project_name,
          customer_name: payload.customer_name,
          pic_name: payload.pic_name,
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
          console.warn('Stage 2 Insert notice (without file_link):', err2.message)
          // Stage 3: Metadata + base columns
          const stage3Payload = {
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
          const { data: insData3, error: err3 } = await supabase.from('boq_requests').insert([stage3Payload]).select()
          if (err3) {
            console.warn('Stage 3 Insert notice (without metadata):', err3.message)
            // Stage 4: Pure base payload
            const stage4Payload = {
              title: payload.title,
              description: payload.description,
              assignee: payload.assignee,
              target_date: payload.target_date,
              file_url: payload.file_url,
              file_name: payload.file_name,
              created_by: payload.created_by,
              status: payload.status
            }
            const { data: insData4, error: err4 } = await supabase.from('boq_requests').insert([stage4Payload]).select()
            if (err4) throw err4
            if (insData4?.[0]?.id) {
              saveLocalMeta(insData4[0].id, payload.metadata)
              savedTaskObj = insData4[0]
            }
          } else if (insData3?.[0]?.id) {
            saveLocalMeta(insData3[0].id, payload.metadata)
            savedTaskObj = insData3[0]
          }
        } else if (insData2?.[0]?.id) {
          saveLocalMeta(insData2[0].id, payload.metadata)
          savedTaskObj = insData2[0]
        }
      } else if (insData1?.[0]?.id) {
        saveLocalMeta(insData1[0].id, payload.metadata)
        savedTaskObj = insData1[0]
      }
      showToast('Permintaan Baru Dibuat!', `Tugas "${payload.title}" berhasil ditambahkan ke To Do.`)
    }

    if (savedTaskObj) {
      // Create: email + in-app (tanpa WA). Update: hanya notifikasi in-app (tanpa email/WA).
      if (editingTask.value) {
        sendMultiChannelTaskNotification(savedTaskObj, 'ASSIGNED', { email: false, wa: false })
      } else {
        sendMultiChannelTaskNotification(savedTaskObj, 'ASSIGNED')
      }
    }

    closeModal()
    await fetchTasks()
  } catch (err) {
    console.error('Error submitting task:', err)
    showToast('Gagal Menyimpan', err?.message || 'Terjadi kesalahan. Silakan coba lagi.', 'error')
  } finally {
    isSubmitting.value = false
  }
}

// ---- Status Update (with timestamps & localStorage sync) ----
const canChangeStatus = (task) => {
  if (!task) return false
  const assignees = getDisplayAssignees(task)
  return assignees.includes(currentUserEmail.value) || task.created_by === currentUserEmail.value
}

const updateStatus = async (taskId, newStatus) => {
  const task = allTasksRaw.value.find(t => String(t.id) === String(taskId))
  if (!task) return

  const oldStatus = task.status
  if (oldStatus === newStatus) return
  if (!canChangeStatus(task)) {
    alert('Anda hanya dapat melihat tugas ini. Hanya penanggung jawab / pembuat yang bisa mengubah status.')
    return
  }
  if (!confirm(`Pindahkan tugas "${task.title}" ke ${newStatus === 'IN_PROGRESS' ? 'In Progress' : (newStatus === 'DONE' ? 'Done' : 'To Do')}?`)) return

  task.status = newStatus
  try { localStorage.setItem(`boq_status_${taskId}`, newStatus) } catch {}
  filterTasksByPeriod()

  const now = new Date().toISOString()
  const payload = { status: newStatus }

  if (newStatus === 'IN_PROGRESS' && !task.in_progress_at) {
    payload.in_progress_at = now
    task.in_progress_at = now
  } else if (newStatus === 'DONE') {
    if (!task.in_progress_at) {
      payload.in_progress_at = task.created_at || now
      task.in_progress_at = task.created_at || now
    }
    if (!task.done_at) {
      payload.done_at = now
      task.done_at = now
    }
  }

  // Catat riwayat perubahan status di metadata.status_history
  const meta = parseMeta(task.metadata)
  const history = Array.isArray(meta.status_history) ? JSON.parse(JSON.stringify(meta.status_history)) : []
  history.push({ from: oldStatus, to: newStatus, changed_by: currentUserEmail.value, changed_at: now })
  meta.status_history = history
  task.metadata = meta
  payload.metadata = meta
  try { localStorage.setItem(`boq_meta_${taskId}`, JSON.stringify(meta)) } catch {}

  // Sync to DB
  try {
    const { error } = await supabase
      .from('boq_requests')
      .update(payload)
      .eq('id', taskId)
    if (error) {
      console.warn('Status update notice:', error.message)
      const { error: err2 } = await supabase
        .from('boq_requests')
        .update({ status: newStatus, metadata: meta })
        .eq('id', taskId)
      if (err2) {
        const { error: err3 } = await supabase.from('boq_requests').update({ status: newStatus }).eq('id', taskId)
        if (err3) {
          task.status = oldStatus
          filterTasksByPeriod()
        }
      }
    }
  } catch (err) {
    console.warn('DB error:', err)
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
  <div class="space-y-5">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="space-y-0.5">
        <h1 class="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <CheckCircle2 class="w-5 h-5 text-red-600 dark:text-red-400" /> Tugas Tim
        </h1>
        <p class="text-xs text-muted-foreground">Manajemen tugas, delegasi tim & pengingat deadline</p>
      </div>
      <div class="flex items-center gap-2">
        <!-- View Mode Switcher -->
        <div class="flex items-center gap-0.5 bg-muted/60 rounded-xl p-1 border border-border">
          <button
            type="button"
            @click="viewMode = 'board'"
            :class="[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
              viewMode === 'board' ? 'bg-card text-red-600 shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'
            ]"
            title="Board Kanban"
          >
            <LayoutGrid class="w-3.5 h-3.5" /> Board
          </button>
          <button
            type="button"
            @click="viewMode = 'table'"
            :class="[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
              viewMode === 'table' ? 'bg-card text-red-600 shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'
            ]"
            title="Tabel"
          >
            <TableProperties class="w-3.5 h-3.5" /> Tabel
          </button>
          <button
            type="button"
            @click="viewMode = 'gantt'"
            :class="[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
              viewMode === 'gantt' ? 'bg-card text-red-600 shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'
            ]"
            title="Gantt Chart"
          >
            <BarChart3 class="w-3.5 h-3.5" /> Gantt
          </button>
        </div>
        <button 
          @click="openModal()" 
          class="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700 active:scale-95 transition-all gap-2 cursor-pointer shrink-0"
        >
          <Plus class="w-4 h-4" />
          Tambah Tugas
        </button>
      </div>
    </div>

    <!-- Filter Bar (Compact, Responsive & Space-Filled for Board, Table, Gantt) -->
    <div ref="filterBarRef" class="bg-card rounded-2xl border border-border p-3">
      <div class="flex flex-wrap items-center gap-2.5 w-full">
        <!-- 1. Search Box (Fluid & Space Filled) -->
        <div class="relative flex-1 min-w-[200px]">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            v-model="tableFilters.search"
            type="text"
            placeholder="Cari judul, proyek, customer..."
            class="w-full pl-8 pr-8 py-1.5 text-xs border border-input rounded-xl bg-background text-foreground outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-600 transition-all"
          />
          <button 
            v-if="tableFilters.search" 
            @click="tableFilters.search = ''" 
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
          >
            <X class="w-3 h-3" />
          </button>
        </div>

        <!-- 2. Status Filter Dropdown -->
        <div v-if="viewMode !== 'board'" class="relative shrink-0 sm:shrink">
          <button
            type="button"
            @click.stop="statusFilterOpen = !statusFilterOpen; assigneeFilterOpen = false; datePopoverOpen = false"
            class="inline-flex items-center justify-between gap-2 px-3.5 py-1.5 text-xs font-semibold border rounded-xl bg-background text-foreground cursor-pointer hover:bg-muted/40 transition-colors shadow-2xs min-w-[130px]"
            :class="tableFilters.statuses.length > 0 ? 'border-slate-400 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold' : 'border-input'"
          >
            <span v-if="tableFilters.statuses.length === 0">Semua Status</span>
            <span v-else>{{ tableFilters.statuses.length }} Status</span>
            <ChevronDown class="w-3 h-3 text-muted-foreground shrink-0" />
          </button>
          <div v-if="statusFilterOpen" class="absolute z-50 left-0 top-full mt-1.5 w-48 rounded-2xl border border-border bg-card shadow-2xl p-2 text-xs space-y-1">
            <div
              v-for="s in statusOptions"
              :key="s.value"
              @click="toggleStatusFilter(s.value)"
              class="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-muted font-medium text-foreground cursor-pointer transition-colors"
              :class="tableFilters.statuses.includes(s.value) ? 'bg-slate-100 dark:bg-slate-800 font-bold' : ''"
            >
              <span>{{ s.label }}</span>
              <Check v-if="tableFilters.statuses.includes(s.value)" class="w-3.5 h-3.5 text-slate-700 dark:text-slate-300 shrink-0" />
            </div>
          </div>
        </div>

        <!-- 3. PIC / Assignee Filter Dropdown -->
        <div class="relative shrink-0 sm:shrink">
          <button
            type="button"
            @click.stop="assigneeFilterOpen = !assigneeFilterOpen; statusFilterOpen = false; datePopoverOpen = false"
            class="inline-flex items-center justify-between gap-2 px-3.5 py-1.5 text-xs font-semibold border rounded-xl bg-background text-foreground cursor-pointer hover:bg-muted/40 transition-colors shadow-2xs min-w-[130px] max-w-[200px]"
            :class="tableFilters.assignees.length > 0 ? 'border-slate-400 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold' : 'border-input'"
          >
            <div class="flex items-center gap-1.5 truncate">
              <User class="w-3.5 h-3.5 shrink-0 text-slate-500" />
              <span v-if="tableFilters.assignees.length === 0">Semua PIC</span>
              <span v-else class="truncate">{{ tableFilters.assignees.length }} PIC</span>
            </div>
            <ChevronDown class="w-3 h-3 text-muted-foreground shrink-0" />
          </button>
          <div v-if="assigneeFilterOpen" class="absolute z-50 left-0 top-full mt-1.5 w-60 rounded-2xl border border-border bg-card shadow-2xl p-2 text-xs max-h-64 overflow-y-auto sidebar-thin space-y-1">
            <div
              v-for="email in assigneeOptions"
              :key="email"
              @click="toggleAssigneeFilter(email)"
              class="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-muted font-medium text-foreground cursor-pointer transition-colors"
              :class="tableFilters.assignees.includes(email) ? 'bg-slate-100 dark:bg-slate-800 font-bold' : ''"
            >
              <span class="truncate">{{ getUserDisplayName(email) }}</span>
              <Check v-if="tableFilters.assignees.includes(email)" class="w-3.5 h-3.5 text-slate-700 dark:text-slate-300 shrink-0" />
            </div>
            <div v-if="assigneeOptions.length === 0" class="px-3 py-3 text-muted-foreground text-center">Belum ada tim terdaftar.</div>
          </div>
        </div>

        <!-- 4. Rentang Waktu Popover Filter -->
        <div class="relative shrink-0 sm:shrink">
          <button
            type="button"
            @click.stop="datePopoverOpen = !datePopoverOpen; statusFilterOpen = false; assigneeFilterOpen = false"
            class="inline-flex items-center justify-between gap-2 px-3.5 py-1.5 text-xs font-semibold border rounded-xl bg-background text-foreground cursor-pointer hover:bg-muted/40 transition-colors shadow-2xs min-w-[140px]"
            :class="(tableFilters.datePreset || tableFilters.dateFrom || tableFilters.dateTo) ? 'border-slate-400 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold' : 'border-input'"
          >
            <div class="flex items-center gap-1.5 truncate">
              <Calendar class="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>{{ dateFilterLabel }}</span>
            </div>
            <ChevronDown class="w-3 h-3 text-muted-foreground shrink-0" />
          </button>

          <!-- Date Filter Popover (Right-aligned to prevent screen overflow) -->
          <div 
            v-if="datePopoverOpen" 
            class="absolute z-50 right-0 left-auto top-full mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card shadow-2xl p-4 space-y-3"
          >
            <div class="flex items-center justify-between pb-1 border-b border-border">
              <p class="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Filter Rentang Waktu</p>
              <button v-if="tableFilters.datePreset || tableFilters.dateFrom || tableFilters.dateTo" @click="resetDateFilter" class="text-[10px] font-bold text-slate-600 hover:underline">Reset Waktu</button>
            </div>

            <!-- Presets -->
            <div class="grid grid-cols-2 gap-1.5 text-xs">
              <button 
                type="button" 
                @click="resetDateFilter(); datePopoverOpen = false"
                class="px-2.5 py-1.5 rounded-xl font-bold border text-left transition-all cursor-pointer"
                :class="!tableFilters.datePreset && !tableFilters.dateFrom && !tableFilters.dateTo ? 'bg-foreground text-background border-foreground' : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'"
              >
                Semua Waktu
              </button>
              <button 
                v-for="p in datePresets" 
                :key="p.days" 
                type="button" 
                @click="setDatePreset(p.days); datePopoverOpen = false"
                class="px-2.5 py-1.5 rounded-xl font-bold border text-left transition-all cursor-pointer"
                :class="tableFilters.datePreset === String(p.days) ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900' : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'"
              >
                {{ p.label }}
              </button>
            </div>

            <!-- Custom Date Range -->
            <div class="pt-2 border-t border-border space-y-2">
              <p class="text-[10px] font-bold text-muted-foreground uppercase">Rentang Tanggal Kustom</p>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label class="text-[10px] text-muted-foreground font-semibold block mb-0.5">Dari</label>
                  <input 
                    v-model="tableFilters.dateFrom" 
                    type="date" 
                    @click="$event.target.showPicker && $event.target.showPicker()"
                    @change="tableFilters.datePreset = ''"
                    class="w-full px-2 py-1.5 border border-input rounded-xl bg-background text-foreground text-xs focus:ring-1 focus:ring-slate-400 cursor-pointer"
                  />
                </div>
                <div>
                  <label class="text-[10px] text-muted-foreground font-semibold block mb-0.5">Sampai</label>
                  <input 
                    v-model="tableFilters.dateTo" 
                    type="date" 
                    @click="$event.target.showPicker && $event.target.showPicker()"
                    @change="tableFilters.datePreset = ''"
                    class="w-full px-2 py-1.5 border border-input rounded-xl bg-background text-foreground text-xs focus:ring-1 focus:ring-slate-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 5. Reset Filter Button -->
        <button 
          v-if="activeFilterCount > 0"
          type="button" 
          @click="resetTableFilters"
          class="px-3.5 py-1.5 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 border border-red-200 dark:border-red-900 rounded-xl transition-all cursor-pointer shrink-0 ml-auto"
        >
          Reset Filter ({{ activeFilterCount }})
        </button>
      </div>
    </div>

    <!-- ========== BOARD VIEW ========== -->
    <div v-if="viewMode === 'board'" class="h-[calc(100vh-280px)] min-h-[500px]">
      <div v-if="isLoading && allTasksRaw.length === 0" class="flex flex-col items-center justify-center h-full">
        <Loader2 class="w-7 h-7 animate-spin text-muted-foreground" />
        <span class="text-xs text-muted-foreground mt-2">Memuat tugas...</span>
      </div>
      <div v-else class="grid grid-cols-3 gap-3 h-full">
        <!-- TO DO Column -->
        <div
          class="flex flex-col rounded-2xl border border-dashed transition-all"
          :class="[
            'bg-amber-50/30 dark:bg-amber-950/10 border-amber-200/60 dark:border-amber-900/40',
            draggingOverColumn === 'TODO' ? 'ring-2 ring-amber-400 bg-amber-50/60 dark:bg-amber-950/20' : ''
          ]"
          @dragover="onDragOver($event, 'TODO')"
          @dragleave="onDragLeave($event, 'TODO')"
          @drop="onDrop($event, 'TODO')"
        >
          <!-- Column Header -->
          <div class="px-3 py-2.5 flex items-center justify-between border-b border-amber-200/50 dark:border-amber-900/30 shrink-0">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
              <span class="text-xs font-black uppercase tracking-wide text-amber-700 dark:text-amber-400">To Do</span>
            </div>
            <span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">{{ todoTasks.length }}</span>
          </div>
          <!-- Column Body (Scrollable) -->
          <div class="flex-1 overflow-y-auto p-2 space-y-2 sidebar-thin">
            <div v-if="todoTasks.length === 0" class="flex flex-col items-center justify-center h-24 text-center">
              <p class="text-[11px] text-muted-foreground/60 font-medium">Tidak ada tugas</p>
            </div>
            <div
              v-for="task in todoTasks"
              :key="task.id"
              draggable="true"
              @dragstart="onDragStart($event, task)"
              class="rounded-xl border p-3 cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5 transition-all space-y-2 select-none group"
              :class="getDisplayAssignees(task).includes(currentUserEmail)
                ? 'bg-red-50/70 dark:bg-red-950/25 border-2 border-red-500/80 shadow-md shadow-red-500/10'
                : 'bg-card border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'"
            >
              <!-- Task Number + Rutin Badge + My Task indicator + Detail Button -->
              <div class="flex items-center justify-between gap-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span v-if="task.task_number" class="text-[9px] font-black text-muted-foreground">TASK-{{ task.task_number }}</span>
                  <span v-if="getDisplayAssignees(task).includes(currentUserEmail)" class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-red-600 text-white text-[9px] font-black shadow-2xs">
                    ✦ TUGAS ANDA
                  </span>
                  <span v-if="parseMeta(task.metadata).is_recurring" class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-bold border border-slate-200 dark:border-slate-700">
                    <Repeat class="w-2.5 h-2.5" /> Rutin
                  </span>
                </div>
                <button @click.stop="router.push('/collaborate/' + task.id)"
                  class="inline-flex items-center gap-1 text-[9px] font-bold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shrink-0" title="Lihat Detail">
                  <Eye class="w-2.5 h-2.5" /> Detail
                </button>
              </div>
              <!-- Title -->
              <button @click="router.push('/collaborate/' + task.id)"
                class="text-[11px] font-bold text-foreground hover:text-red-600 transition-colors text-left leading-snug w-full cursor-pointer">
                {{ task.title }}
              </button>
              <!-- Description Preview -->
              <p v-if="task.description" class="text-[10px] text-muted-foreground/80 line-clamp-2 leading-snug">
                {{ descPreview(task.description, 75) }}
              </p>
              <!-- Project / Customer -->
              <div v-if="getProjectName(task) || getCustomerName(task)" class="space-y-0.5">
                <p v-if="getProjectName(task)" class="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                  <Building2 class="w-2.5 h-2.5 shrink-0" /> {{ getProjectName(task) }}
                </p>
                <p v-if="getCustomerName(task)" class="text-[10px] text-muted-foreground truncate">{{ getCustomerName(task) }}</p>
              </div>
              <!-- Footer -->
              <div class="flex items-center justify-between pt-1 border-t border-border/50">
                <!-- Assignees -->
                <div class="flex items-center gap-1 flex-wrap min-w-0">
                  <span v-for="email in getDisplayAssignees(task).slice(0, 2)" :key="email"
                    class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-bold border border-slate-200 dark:border-slate-700 truncate max-w-[80px]"
                    :title="email">
                    <User class="w-2.5 h-2.5 shrink-0 text-slate-400" /> {{ email.split('@')[0] }}
                  </span>
                  <span v-if="getDisplayAssignees(task).length > 2" class="text-[9px] text-muted-foreground font-bold">+{{ getDisplayAssignees(task).length - 2 }}</span>
                </div>
                <!-- Deadline -->
                <div class="flex items-center gap-1.5 shrink-0">
                  <span v-if="task.target_date" class="text-[9px] font-bold" :class="isOverdue(task.target_date) ? 'text-red-500' : 'text-muted-foreground'">
                    <Calendar class="w-2.5 h-2.5 inline mr-0.5" />{{ formatDate(task.target_date) }}
                  </span>
                  <!-- Quick actions on hover -->
                  <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button v-if="canChangeStatus(task)" @click="openModal(task)"
                      class="p-1 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer">
                      <Pencil class="w-3 h-3" />
                    </button>
                    <button @click="router.push('/collaborate/' + task.id)"
                      class="p-1 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors cursor-pointer">
                      <Eye class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- IN PROGRESS Column -->
        <div
          class="flex flex-col rounded-2xl border border-dashed transition-all"
          :class="[
            'bg-red-50/30 dark:bg-red-950/10 border-red-200/60 dark:border-red-900/40',
            draggingOverColumn === 'IN_PROGRESS' ? 'ring-2 ring-red-400 bg-red-50/60 dark:bg-red-950/20' : ''
          ]"
          @dragover="onDragOver($event, 'IN_PROGRESS')"
          @dragleave="onDragLeave($event, 'IN_PROGRESS')"
          @drop="onDrop($event, 'IN_PROGRESS')"
        >
          <div class="px-3 py-2.5 flex items-center justify-between border-b border-red-200/50 dark:border-red-900/30 shrink-0">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
              <span class="text-xs font-black uppercase tracking-wide text-red-700 dark:text-red-400">In Progress</span>
            </div>
            <span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400">{{ inProgressTasks.length }}</span>
          </div>
          <div class="flex-1 overflow-y-auto p-2 space-y-2 sidebar-thin">
            <div v-if="inProgressTasks.length === 0" class="flex flex-col items-center justify-center h-24 text-center">
              <p class="text-[11px] text-muted-foreground/60 font-medium">Tidak ada tugas</p>
            </div>
            <div
              v-for="task in inProgressTasks"
              :key="task.id"
              draggable="true"
              @dragstart="onDragStart($event, task)"
              class="rounded-xl border p-3 cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5 transition-all space-y-2 select-none group"
              :class="getDisplayAssignees(task).includes(currentUserEmail)
                ? 'bg-red-50/70 dark:bg-red-950/25 border-2 border-red-500/80 shadow-md shadow-red-500/10'
                : 'bg-card border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'"
            >
              <div class="flex items-center justify-between gap-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span v-if="task.task_number" class="text-[9px] font-black text-muted-foreground">TASK-{{ task.task_number }}</span>
                  <span v-if="getDisplayAssignees(task).includes(currentUserEmail)" class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-red-600 text-white text-[9px] font-black shadow-2xs">
                    ✦ TUGAS ANDA
                  </span>
                  <span v-if="parseMeta(task.metadata).is_recurring" class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-bold border border-slate-200 dark:border-slate-700">
                    <Repeat class="w-2.5 h-2.5" /> Rutin
                  </span>
                </div>
                <button @click.stop="router.push('/collaborate/' + task.id)"
                  class="inline-flex items-center gap-1 text-[9px] font-bold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shrink-0" title="Lihat Detail">
                  <Eye class="w-2.5 h-2.5" /> Detail
                </button>
              </div>
              <button @click="router.push('/collaborate/' + task.id)"
                class="text-[11px] font-bold text-foreground hover:text-red-600 transition-colors text-left leading-snug w-full cursor-pointer">
                {{ task.title }}
              </button>
              <!-- Description Preview -->
              <p v-if="task.description" class="text-[10px] text-muted-foreground/80 line-clamp-2 leading-snug">
                {{ descPreview(task.description, 75) }}
              </p>
              <div v-if="getProjectName(task) || getCustomerName(task)" class="space-y-0.5">
                <p v-if="getProjectName(task)" class="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                  <Building2 class="w-2.5 h-2.5 shrink-0" /> {{ getProjectName(task) }}
                </p>
                <p v-if="getCustomerName(task)" class="text-[10px] text-muted-foreground truncate">{{ getCustomerName(task) }}</p>
              </div>
              <div class="flex items-center justify-between pt-1 border-t border-border/50">
                <div class="flex items-center gap-1 flex-wrap min-w-0">
                  <span v-for="email in getDisplayAssignees(task).slice(0, 2)" :key="email"
                    class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[9px] font-bold border border-amber-200 dark:border-amber-800 truncate max-w-[80px]"
                    :title="email">
                    <User class="w-2.5 h-2.5 shrink-0" /> {{ email.split('@')[0] }}
                  </span>
                  <span v-if="getDisplayAssignees(task).length > 2" class="text-[9px] text-muted-foreground font-bold">+{{ getDisplayAssignees(task).length - 2 }}</span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <span v-if="task.target_date" class="text-[9px] font-bold" :class="isOverdue(task.target_date) ? 'text-red-500' : 'text-muted-foreground'">
                    <Calendar class="w-2.5 h-2.5 inline mr-0.5" />{{ formatDate(task.target_date) }}
                  </span>
                  <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button v-if="canChangeStatus(task)" @click="openModal(task)"
                      class="p-1 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer">
                      <Pencil class="w-3 h-3" />
                    </button>
                    <button @click="router.push('/collaborate/' + task.id)"
                      class="p-1 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors cursor-pointer">
                      <Eye class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- DONE Column -->
        <div
          class="flex flex-col rounded-2xl border border-dashed transition-all"
          :class="[
            'bg-emerald-50/30 dark:bg-emerald-950/10 border-emerald-200/60 dark:border-emerald-900/40',
            draggingOverColumn === 'DONE' ? 'ring-2 ring-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20' : ''
          ]"
          @dragover="onDragOver($event, 'DONE')"
          @dragleave="onDragLeave($event, 'DONE')"
          @drop="onDrop($event, 'DONE')"
        >
          <div class="px-3 py-2.5 flex items-center justify-between border-b border-emerald-200/50 dark:border-emerald-900/30 shrink-0">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
              <span class="text-xs font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Done</span>
            </div>
            <span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">{{ doneTasks.length }}</span>
          </div>
          <div class="flex-1 overflow-y-auto p-2 space-y-2 sidebar-thin">
            <div v-if="doneTasks.length === 0" class="flex flex-col items-center justify-center h-24 text-center">
              <p class="text-[11px] text-muted-foreground/60 font-medium">Tidak ada tugas</p>
            </div>
            <div
              v-for="task in doneTasks"
              :key="task.id"
              draggable="true"
              @dragstart="onDragStart($event, task)"
              class="rounded-xl border p-3 cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5 transition-all space-y-2 select-none group opacity-70 hover:opacity-100"
              :class="getDisplayAssignees(task).includes(currentUserEmail)
                ? 'bg-sky-50/40 dark:bg-sky-950/20 border-sky-300/50 dark:border-sky-700/30'
                : 'bg-card border-border'"
            >
              <div class="flex items-center justify-between gap-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span v-if="task.task_number" class="text-[9px] font-black text-muted-foreground">TASK-{{ task.task_number }}</span>
                  <span v-if="getDisplayAssignees(task).includes(currentUserEmail)" class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-sky-100/70 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 text-[9px] font-black border border-sky-200/60 dark:border-sky-700/40">
                    ✦ Tugasmu
                  </span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <CheckCircle class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <button @click.stop="router.push('/collaborate/' + task.id)"
                    class="inline-flex items-center gap-1 text-[9px] font-bold text-slate-600 hover:text-emerald-600 dark:text-slate-300 dark:hover:text-emerald-400 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 hover:border-emerald-200 dark:hover:border-emerald-800 transition-all cursor-pointer" title="Lihat Detail">
                    <Eye class="w-2.5 h-2.5" /> Lihat Detail
                  </button>
                </div>
              </div>
              <button @click="router.push('/collaborate/' + task.id)"
                class="text-[11px] font-bold text-muted-foreground line-through hover:text-foreground hover:no-underline transition-colors text-left leading-snug w-full cursor-pointer">
                {{ task.title }}
              </button>
              <!-- Description Preview -->
              <p v-if="task.description" class="text-[10px] text-muted-foreground/70 line-clamp-2 leading-snug">
                {{ descPreview(task.description, 75) }}
              </p>
              <div v-if="getProjectName(task) || getCustomerName(task)" class="space-y-0.5">
                <p v-if="getProjectName(task)" class="text-[10px] text-muted-foreground truncate">{{ getProjectName(task) }}</p>
              </div>
              <div class="flex items-center justify-between pt-1 border-t border-border/50">
                <div class="flex items-center gap-1 flex-wrap min-w-0">
                  <span v-for="email in getDisplayAssignees(task).slice(0, 2)" :key="email"
                    class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold border border-emerald-200 dark:border-emerald-800 truncate max-w-[80px]"
                    :title="email">
                    <User class="w-2.5 h-2.5 shrink-0" /> {{ email.split('@')[0] }}
                  </span>
                </div>
                <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button @click="router.push('/collaborate/' + task.id)"
                    class="p-1 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors cursor-pointer">
                    <Eye class="w-3 h-3" />
                  </button>
                  <button v-if="task.created_by === currentUserEmail" @click="deleteTask(task.id)"
                    class="p-1 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer">
                    <Trash2 class="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== TABLE VIEW ========== -->
    <div v-if="viewMode === 'table'" class="bg-card rounded-2xl border border-border overflow-hidden">
      <!-- Empty State -->
      <div v-if="tableTasks.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
        <div class="p-4 rounded-full bg-muted/60 mb-3">
          <TableProperties class="w-7 h-7 text-muted-foreground opacity-50" />
        </div>
        <p class="text-sm font-semibold text-muted-foreground">Tidak ada tugas yang cocok.</p>
        <p class="text-xs text-muted-foreground mt-1">Coba ubah atau reset filter.</p>
      </div>

      <div v-else>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[820px] text-sm">
            <thead>
              <tr class="border-b border-border bg-muted/40 text-left">
                <th class="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground w-20">No / ID</th>
                <th class="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground min-w-[280px]">Judul & Instruksi Pekerjaan</th>
                <th class="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground min-w-[170px]">Proyek & Customer</th>
                <th class="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground min-w-[180px]">Lampiran & Berkas</th>
                <th class="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground min-w-[130px]">PIC / Assignee</th>
                <th class="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Deadline</th>
                <th class="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Status</th>
                <th class="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground text-right">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border/50">
              <tr
                v-for="(task, i) in paginatedTableTasks"
                :key="task.id"
                class="transition-colors group align-top"
                :class="[
                  getDisplayAssignees(task).includes(currentUserEmail)
                    ? 'bg-red-50/50 dark:bg-red-950/20 border-l-4 border-l-red-600 font-medium'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                  { 'opacity-60': task.status === 'DONE' }
                ]"
              >
                <!-- No / ID -->
                <td class="px-4 py-3.5 whitespace-nowrap">
                  <span v-if="task.task_number" class="text-[10px] font-black bg-muted px-2 py-1 rounded-lg text-muted-foreground">TASK-{{ task.task_number }}</span>
                  <span v-else class="text-xs text-muted-foreground">{{ (tablePage - 1) * tablePageSize + i + 1 }}</span>
                </td>

                <!-- Judul & Instruksi Pekerjaan (What needs to be done) -->
                <td class="px-4 py-3.5 min-w-[280px] max-w-[400px]">
                  <div class="space-y-1.5">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <button @click="router.push('/collaborate/' + task.id)"
                        class="text-xs font-bold text-foreground hover:text-slate-600 transition-colors text-left leading-snug">
                        {{ task.title }}
                      </button>
                      <span v-if="getDisplayAssignees(task).includes(currentUserEmail)" class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-red-600 text-white text-[9px] font-black shrink-0 shadow-2xs">
                        ✦ TUGAS ANDA
                      </span>
                      <span v-if="parseMeta(task.metadata).is_recurring" class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-bold border border-slate-200 dark:border-slate-700">
                        <Repeat class="w-2.5 h-2.5" /> Rutin
                      </span>
                    </div>

                    <!-- Description Preview (Instruksi/Catatan Pekerjaan) -->
                    <div v-if="task.description" class="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 line-clamp-3 leading-relaxed font-normal">
                      <span class="font-bold text-[10px] text-slate-400 dark:text-slate-500 block mb-0.5 uppercase tracking-wider flex items-center gap-1">
                        <AlignLeft class="w-2.5 h-2.5 text-slate-400" /> Instruksi & Detail:
                      </span>
                      {{ stripHtml(task.description) }}
                    </div>
                    <div v-else class="text-[11px] text-slate-400 italic">
                      - Belum ada deskripsi instruksi -
                    </div>

                    <!-- Checklist / Sub-tugas Progress -->
                    <div v-if="getSubtaskProgress(task).total > 0" class="flex items-center gap-2 pt-0.5">
                      <span class="text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                        <CheckSquare class="w-3 h-3 text-slate-400" />
                        Sub-tugas: {{ getSubtaskProgress(task).completed }}/{{ getSubtaskProgress(task).total }} Selesai
                      </span>
                    </div>
                  </div>
                </td>

                <!-- Proyek / Customer -->
                <td class="px-4 py-3.5">
                  <p class="text-xs font-semibold text-foreground truncate max-w-[180px]">{{ getProjectName(task) || '-' }}</p>
                  <p class="text-[10px] text-muted-foreground truncate max-w-[180px]">{{ getCustomerName(task) || '' }}</p>
                  <p v-if="getPicName(task)" class="text-[10px] text-muted-foreground/70 truncate max-w-[180px]">PIC: {{ getPicName(task) }}</p>
                </td>

                <!-- Lampiran & Berkas (Attachments Column) -->
                <td class="px-4 py-3.5 min-w-[180px] max-w-[240px]">
                  <div v-if="getTaskAttachments(task).length > 0" class="flex flex-col gap-1.5">
                    <a 
                      v-for="att in getTaskAttachments(task)" 
                      :key="att.id || att.url" 
                      :href="att.url" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      @click.stop
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all truncate max-w-[220px]"
                      :title="att.name"
                    >
                      <Paperclip v-if="att.type === 'file'" class="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <Link v-else class="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span class="truncate">{{ att.name || 'Buka Berkas' }}</span>
                    </a>
                  </div>
                  <span v-else class="text-xs text-muted-foreground/60 italic">- Tidak ada -</span>
                </td>

                <!-- Assignees -->
                <td class="px-4 py-3.5">
                  <div class="flex flex-wrap gap-1">
                    <span v-for="email in getDisplayAssignees(task)" :key="email"
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-bold border border-slate-200 dark:border-slate-700 truncate max-w-[120px]"
                      :title="email">
                      <User class="w-2.5 h-2.5 shrink-0 text-slate-400" /> {{ email.split('@')[0] }}
                    </span>
                    <span v-if="getDisplayAssignees(task).length === 0" class="text-xs text-muted-foreground">-</span>
                  </div>
                </td>

                <!-- Deadline -->
                <td class="px-4 py-3.5 whitespace-nowrap">
                  <span v-if="task.target_date"
                    class="inline-flex items-center gap-1 text-xs font-bold"
                    :class="isOverdue(task.target_date) && task.status !== 'DONE' ? 'text-red-600' : 'text-foreground'">
                    <Calendar class="w-3 h-3" /> {{ formatDate(task.target_date) }}
                  </span>
                  <span v-else class="text-xs text-muted-foreground">-</span>
                </td>

                <!-- Status -->
                <td class="px-4 py-3.5 whitespace-nowrap">
                  <select v-if="canChangeStatus(task)"
                    :value="task.status"
                    @change="updateStatus(task.id, $event.target.value)"
                    class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border outline-none cursor-pointer"
                    :class="tableStatusBadge(task.status)">
                    <option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
                  </select>
                  <span v-else class="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border" :class="tableStatusBadge(task.status)">
                    {{ tableStatusLabel(task.status) }}
                  </span>
                </td>

                <!-- Actions -->
                <td class="px-4 py-3.5">
                  <div class="flex items-center justify-end gap-1">
                    <button @click="router.push('/collaborate/' + task.id)"
                      class="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer" title="Buka Detail">
                      <Eye class="w-4 h-4" />
                    </button>
                    <button v-if="canChangeStatus(task)" @click="openModal(task)"
                      class="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer" title="Edit">
                      <Pencil class="w-4 h-4" />
                    </button>
                    <button v-if="task.created_by === currentUserEmail" @click="deleteTask(task.id)"
                      class="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer" title="Hapus">
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="px-4 py-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-muted-foreground">Baris per halaman:</span>
            <select v-model.number="tablePageSize" @change="tablePage = 1"
              class="px-2 py-1 text-xs border border-input rounded-lg bg-background text-foreground outline-none focus:ring-1 focus:ring-red-500 cursor-pointer">
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
            <span class="text-[11px] text-muted-foreground">
              {{ (tablePage - 1) * tablePageSize + 1 }}–{{ Math.min(tablePage * tablePageSize, tableTasks.length) }} dari {{ tableTasks.length }}
            </span>
          </div>
          <div class="flex items-center gap-1">
            <button @click="tablePage = 1" :disabled="tablePage === 1"
              class="p-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
              «
            </button>
            <button @click="tablePage--" :disabled="tablePage === 1"
              class="p-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
              <ChevronLeft class="w-4 h-4" />
            </button>
            <template v-for="p in totalTablePages" :key="p">
              <button v-if="Math.abs(p - tablePage) <= 2 || p === 1 || p === totalTablePages"
                @click="tablePage = p"
                class="w-8 h-8 rounded-lg border text-xs font-bold transition-colors cursor-pointer"
                :class="p === tablePage ? 'bg-red-600 text-white border-red-600' : 'border-border text-muted-foreground hover:bg-muted'">
                {{ p }}
              </button>
              <span v-else-if="(p === tablePage - 3 || p === tablePage + 3) && totalTablePages > 6" class="text-muted-foreground text-xs">…</span>
            </template>
            <button @click="tablePage++" :disabled="tablePage === totalTablePages"
              class="p-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
              <ChevronRight class="w-4 h-4" />
            </button>
            <button @click="tablePage = totalTablePages" :disabled="tablePage === totalTablePages"
              class="p-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
              »
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== GANTT VIEW ========== -->
    <div v-if="viewMode === 'gantt'" class="bg-card rounded-2xl border border-border overflow-hidden">
      <div class="px-4 py-3 border-b border-border flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <BarChart3 class="w-4 h-4 text-red-600 dark:text-red-400" />
          <h3 class="text-sm font-bold text-foreground">Gantt Chart</h3>
        </div>
        <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md font-semibold">{{ ganttTasks.length }} tugas</span>
        <p class="text-[10px] text-muted-foreground">Menampilkan tugas sesuai filter aktif</p>
        <div class="ml-auto flex items-center gap-3 text-[10px] font-bold">
          <span class="flex items-center gap-1.5 text-muted-foreground"><span class="w-3 h-3 rounded bg-amber-400"></span> To Do</span>
          <span class="flex items-center gap-1.5 text-muted-foreground"><span class="w-3 h-3 rounded bg-red-500"></span> In Progress</span>
          <span class="flex items-center gap-1.5 text-muted-foreground"><span class="w-3 h-3 rounded bg-emerald-500"></span> Done</span>
        </div>
      </div>

      <div v-if="ganttTasks.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
        <div class="p-4 rounded-full bg-muted/60 mb-3">
          <BarChart3 class="w-7 h-7 text-muted-foreground opacity-40" />
        </div>
        <p class="text-sm font-semibold text-muted-foreground">Tidak ada data Gantt.</p>
        <p class="text-xs text-muted-foreground mt-1">Sesuaikan filter untuk menampilkan tugas.</p>
      </div>

      <div v-else class="overflow-x-auto">
        <div class="min-w-max">
          <!-- Month Header -->
          <div class="flex border-b border-border">
            <div class="sticky left-0 z-20 bg-card w-72 shrink-0 border-r border-border px-4 py-2.5 flex items-end">
              <span class="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Tugas</span>
            </div>
            <div class="relative shrink-0" :style="{ width: ganttTotalWidth + 'px', height: '52px' }">
              <!-- Month labels -->
              <div v-for="m in monthColumns" :key="m.monthKey"
                class="absolute top-0 h-6 flex items-center px-2 text-[9px] font-black uppercase tracking-wide text-muted-foreground border-r border-border/30"
                :style="{ left: m.startIndex * ganttDayWidth + 'px', width: m.width + 'px' }">
                {{ m.label }}
              </div>
              <!-- Day labels -->
              <div v-for="(d, i) in ganttRange.days" :key="i"
                class="absolute bottom-0 border-l border-border/30 flex flex-col items-center justify-end pb-1"
                :class="{ 'bg-muted/20': ganttDayLabel(d).isWeekend }"
                :style="{ left: i * ganttDayWidth + 'px', width: ganttDayWidth + 'px', height: '28px' }">
                <span class="text-[9px] font-bold leading-none"
                  :class="ganttDayLabel(d).isWeekend ? 'text-muted-foreground/50' : 'text-foreground/60'">
                  {{ ganttDayLabel(d).date }}
                </span>
              </div>
              <!-- Today line -->
              <div v-if="todayOffset > 0" class="absolute top-0 bottom-0 w-0.5 bg-red-500/80 z-10" :style="{ left: todayOffset + 'px' }" title="Hari Ini"></div>
            </div>
          </div>

          <!-- Task Rows -->
          <div v-for="task in ganttTasks" :key="task.id"
            class="flex border-b border-border/40 hover:bg-muted/10 transition-colors"
            :class="{ 'opacity-50': task.status === 'DONE' }">
            <!-- Task Info Column -->
            <div class="sticky left-0 z-10 bg-card w-72 shrink-0 border-r border-border px-3 py-2.5 flex flex-col gap-0.5 min-w-0">
              <div class="flex items-center gap-1.5 min-w-0">
                <span v-if="task.task_number" class="text-[9px] font-black text-muted-foreground/70 shrink-0">TASK-{{ task.task_number }}</span>
                <span class="text-[11px] font-bold text-foreground truncate">{{ task.title }}</span>
              </div>
              <div class="flex flex-wrap items-center gap-1">
                <span v-if="getProjectName(task)" class="text-[9px] font-medium text-muted-foreground truncate max-w-[150px]">{{ getProjectName(task) }}</span>
                <template v-for="email in getDisplayAssignees(task).slice(0, 2)" :key="email">
                  <span class="inline-flex items-center gap-0.5 px-1 py-px rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[8px] font-bold border border-amber-200 dark:border-amber-800">
                    <User class="w-2 h-2" /> {{ email.split('@')[0] }}
                  </span>
                </template>
                <span v-if="getDisplayAssignees(task).length > 2" class="text-[8px] text-muted-foreground font-bold">+{{ getDisplayAssignees(task).length - 2 }}</span>
              </div>
            </div>
            <!-- Gantt Bar -->
            <div class="relative shrink-0" :style="{ width: ganttTotalWidth + 'px', height: '52px' }">
              <!-- Weekend columns -->
              <div v-for="(d, i) in ganttRange.days" :key="i"
                class="absolute top-0 bottom-0 border-l border-border/20"
                :class="{ 'bg-muted/15': ganttDayLabel(d).isWeekend }"
                :style="{ left: i * ganttDayWidth + 'px', width: ganttDayWidth + 'px' }">
              </div>
              <!-- Task bar -->
              <div
                class="absolute top-1/2 -translate-y-1/2 h-6 rounded-md cursor-pointer flex items-center px-2 overflow-hidden shadow-sm border border-black/10 hover:brightness-110 transition-all"
                :class="ganttStatusColor(task.status)"
                :style="ganttBarStyle(task)"
                :title="task.title + (task.target_date ? ' • Deadline: ' + formatDate(task.target_date) : '')"
                @click="router.push('/collaborate/' + task.id)">
                <span class="text-[9px] font-black text-white truncate">{{ task.title }}</span>
              </div>
              <!-- Today line -->
              <div v-if="todayOffset > 0" class="absolute top-0 bottom-0 w-0.5 bg-red-500/60 z-10 pointer-events-none" :style="{ left: todayOffset + 'px' }"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Task Creation / Edit Modal (Teleported to Body for 100% full screen coverage) -->
    <Teleport to="body">
      <div v-if="isModalOpen" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-6 bg-slate-950/70 backdrop-blur-sm overflow-y-auto w-screen h-screen">
        <div class="bg-card rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-border my-auto">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
          <div class="flex items-center gap-2.5">
            <div class="p-2 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
              <CheckCircle2 class="w-5 h-5" />
            </div>
            <div>
              <h2 class="text-base font-bold text-foreground leading-tight">
                {{ editingTask ? 'Edit Tugas' : 'Tambah Tugas Baru' }}
              </h2>
              <p class="text-xs text-muted-foreground">Kelola tugas, penanggung jawab, & checklist tim</p>
            </div>
          </div>
          <button @click="closeModal" class="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="p-6 space-y-5 text-sm max-h-[80vh] overflow-y-auto sidebar-thin">
          <!-- 1. Task Title -->
          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-foreground uppercase tracking-wider">Judul Tugas <span class="text-rose-500">*</span></label>
            <input 
              v-model="formData.title" 
              type="text" 
              placeholder="Ketik judul tugas (misal: Follow up PO Siemens S7-1200, Cek stok Inverter SINAMICS G120, Penawaran SIRIUS Breaker)..." 
              class="w-full px-4 py-2.5 text-sm font-semibold border border-input rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-red-500 shadow-2xs" 
            />
          </div>

          <!-- 2. Ditugaskan Untuk (Multi-Assignees) & Target Deadline -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Ditugaskan untuk (Multi-select) -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold text-foreground uppercase tracking-wider">
                Ditugaskan untuk <span class="text-rose-500">*</span>
              </label>
              
              <!-- Multi-select User Chips / Checklist Dropdown -->
              <div class="p-2.5 border border-input rounded-xl bg-background max-h-36 overflow-y-auto space-y-1 sidebar-thin">
                <div 
                  v-for="u in users" 
                  :key="u.email" 
                  @click="toggleAssignee(u.email)"
                  :class="[
                    'flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors',
                    formData.assignees.includes(u.email)
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400 font-semibold'
                      : 'hover:bg-muted text-muted-foreground'
                  ]"
                >
                  <span class="truncate">👤 {{ getUserDisplayName(u.email) }}</span>
                  <Check v-if="formData.assignees.includes(u.email)" class="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
                </div>
                <div v-if="users.length === 0" class="text-[11px] text-muted-foreground text-center py-1">
                  Memuat daftar tim...
                </div>
              </div>
              <p class="text-[10px] text-muted-foreground">Bisa pilih lebih dari satu penanggung jawab.</p>
            </div>

            <!-- Target Date & Quick Date Chips -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold text-foreground uppercase tracking-wider">Target Deadline <span class="text-rose-500">*</span></label>
              <input 
                v-model="formData.target_date" 
                type="date" 
                @click="$event.target.showPicker && $event.target.showPicker()"
                class="w-full px-3.5 py-2 text-xs font-medium border border-input rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-slate-400 cursor-pointer" 
              />
              
              <!-- Quick Date Chips -->
              <div class="flex items-center gap-1.5 pt-1">
                <button 
                  type="button" 
                  @click="setQuickDate(0)" 
                  class="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-[10px] font-bold text-muted-foreground border border-border cursor-pointer transition-colors"
                >
                  Hari Ini
                </button>
                <button 
                  type="button" 
                  @click="setQuickDate(1)" 
                  class="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-[10px] font-bold text-muted-foreground border border-border cursor-pointer transition-colors"
                >
                  Besok
                </button>
                <button 
                  type="button" 
                  @click="setQuickDate(3)" 
                  class="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-[10px] font-bold text-muted-foreground border border-border cursor-pointer transition-colors"
                >
                  3 Hari
                </button>
                <button 
                  type="button" 
                  @click="setQuickDate(7)" 
                  class="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-[10px] font-bold text-muted-foreground border border-border cursor-pointer transition-colors"
                >
                  1 Minggu
                </button>
              </div>

              <!-- Opsi Tugas Rutin (Compact 50% width inside Target Deadline column) -->
              <div class="pt-2.5 border-t border-border mt-2 space-y-2">
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    v-model="formData.is_recurring" 
                    class="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-input cursor-pointer"
                  />
                  <div class="flex items-center gap-1 text-xs font-bold text-foreground">
                    <Repeat class="w-3.5 h-3.5 text-indigo-500" />
                    <span>Tugas Rutin (Berulang)</span>
                  </div>
                </label>

                <div v-if="formData.is_recurring" class="p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-2 text-xs">
                  <div>
                    <label class="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Frekuensi Berulang</label>
                    <select 
                      v-model="formData.recurrence_type"
                      class="w-full px-2.5 py-1.5 rounded-lg border border-input bg-background text-foreground text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="MONTHLY">Bulanan (Monthly)</option>
                      <option value="WEEKLY">Mingguan (Weekly)</option>
                    </select>
                  </div>

                  <!-- Jika Bulanan: Pilih Tanggal (1-31) -->
                  <div v-if="formData.recurrence_type === 'MONTHLY'">
                    <label class="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Setiap Tanggal</label>
                    <select 
                      v-model.number="formData.recurrence_day"
                      class="w-full px-2.5 py-1.5 rounded-lg border border-input bg-background text-foreground text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option v-for="d in 31" :key="d" :value="d">Tanggal {{ d }} Setiap Bulan</option>
                    </select>
                  </div>

                  <!-- Jika Mingguan: Pilih Hari (Senin - Minggu) -->
                  <div v-else-if="formData.recurrence_type === 'WEEKLY'">
                    <label class="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Setiap Hari</label>
                    <select 
                      v-model.number="formData.recurrence_weekday"
                      class="w-full px-2.5 py-1.5 rounded-lg border border-input bg-background text-foreground text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option :value="1">Senin</option>
                      <option :value="2">Selasa</option>
                      <option :value="3">Rabu</option>
                      <option :value="4">Kamis</option>
                      <option :value="5">Jumat</option>
                      <option :value="6">Sabtu</option>
                      <option :value="0">Minggu</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 3. Detail Pekerjaan (Rich Text Editor) -->
          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-foreground uppercase tracking-wider">Detail Pekerjaan & Catatan</label>
            <RichTextEditor 
              v-model="formData.description" 
              placeholder="Tuliskan detail pekerjaan, instruksi teknis, catatan penting..." 
            />
          </div>

          <!-- 4. Sub-tugas & Checklist Card inside Modal -->
          <div class="p-3.5 bg-muted/20 border border-border rounded-xl space-y-2.5">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare class="w-3.5 h-3.5 text-red-500" /> Sub-tugas & Checklist ({{ formData.subtasks.length }})
              </label>
            </div>

            <!-- Existing Subtasks List -->
            <div v-if="formData.subtasks.length > 0" class="space-y-1.5">
              <div 
                v-for="(sub, idx) in formData.subtasks" 
                :key="sub.id || idx" 
                class="flex items-center justify-between p-2 rounded-lg bg-card border border-border text-xs"
              >
                <div class="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    v-model="sub.completed" 
                    class="rounded text-red-600 focus:ring-red-500 cursor-pointer" 
                  />
                  <span :class="{ 'line-through text-muted-foreground': sub.completed }" class="font-medium">
                    {{ sub.title }}
                  </span>
                </div>
                <button type="button" @click="removeModalSubtask(idx)" class="text-muted-foreground hover:text-rose-500 p-1 cursor-pointer">
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- Add Subtask Input -->
            <div class="flex items-center gap-2">
              <input 
                type="text" 
                v-model="modalNewSubtask" 
                @keydown.enter.prevent="addModalSubtask"
                placeholder="+ Tambah item sub-tugas (Tekan Enter)..." 
                class="flex-1 px-3 py-1.5 text-xs border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-red-500" 
              />
              <button 
                type="button" 
                @click="addModalSubtask" 
                class="px-3 py-1.5 text-xs font-semibold bg-muted hover:bg-muted/80 rounded-lg text-foreground border border-border cursor-pointer shrink-0"
              >
                Tambah
              </button>
            </div>
          </div>

          <!-- 5. Kaitan Proyek & Customer Checkbox -->
          <div class="space-y-3 pt-1 border-t border-border/60">
            <label class="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer select-none">
              <input 
                type="checkbox" 
                v-model="formData.has_project_ref" 
                class="rounded text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer" 
              />
              <span>Ada kaitan dengan Proyek / Customer</span>
            </label>

            <!-- Show only if checked -->
            <div v-if="formData.has_project_ref" class="p-3.5 bg-muted/20 border border-border rounded-xl grid grid-cols-1 md:grid-cols-3 gap-3">
              <!-- Proyek -->
              <div>
                <label class="block text-[11px] font-semibold text-muted-foreground mb-1">Nama Proyek</label>
                <input 
                  v-model="formData.project_name" 
                  type="text" 
                  placeholder="Nama proyek / lokasi..." 
                  class="w-full px-3 py-1.5 text-xs border border-input rounded-lg bg-background text-foreground outline-none focus:ring-1 focus:ring-red-500" 
                />
              </div>

              <!-- Customer Combobox -->
              <div ref="customerComboboxRef" class="relative">
                <label class="block text-[11px] font-semibold text-muted-foreground mb-1">Customer / Klien</label>
                <div class="relative">
                  <input 
                    type="text" 
                    v-model="customerSearchQuery"
                    @focus="isCustomerDropdownOpen = true"
                    @input="formData.customer_name = customerSearchQuery; isCustomerDropdownOpen = true"
                    placeholder="Cari / ketik customer..." 
                    class="w-full pl-8 pr-7 py-1.5 text-xs border border-input rounded-lg bg-background text-foreground outline-none focus:ring-1 focus:ring-red-500"
                  />
                  <Search class="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2" />
                  <button 
                    v-if="customerSearchQuery" 
                    type="button"
                    @click="customerSearchQuery = ''; formData.customer_name = ''; isCustomerDropdownOpen = true" 
                    class="absolute right-2 top-2 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                  >
                    <X class="w-3 h-3" />
                  </button>
                </div>

                <!-- Dropdown -->
                <div 
                  v-if="isCustomerDropdownOpen" 
                  class="absolute z-50 left-0 right-0 mt-1 max-h-44 overflow-y-auto rounded-xl border border-border bg-card shadow-lg p-1 text-xs space-y-0.5 sidebar-thin"
                >
                  <div 
                    v-for="cName in filteredAccurateCustomers" 
                    :key="cName"
                    @click="selectCustomer(cName)"
                    class="px-2.5 py-1.5 rounded-lg hover:bg-muted font-medium text-foreground cursor-pointer flex items-center justify-between"
                  >
                    <span class="truncate">{{ cName }}</span>
                    <Check v-if="formData.customer_name === cName" class="w-3.5 h-3.5 text-red-500 shrink-0" />
                  </div>
                  <div 
                    v-if="customerSearchQuery && !accurateCustomers.includes(customerSearchQuery)"
                    @click="selectCustomer(customerSearchQuery)"
                    class="px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 font-semibold cursor-pointer flex items-center gap-1"
                  >
                    <Plus class="w-3 h-3" /> Use "{{ customerSearchQuery }}"
                  </div>
                </div>
              </div>

              <!-- PIC -->
              <div>
                <label class="block text-[11px] font-semibold text-muted-foreground mb-1">PIC Customer</label>
                <input 
                  v-model="formData.pic_name" 
                  type="text" 
                  placeholder="Nama PIC kontak..." 
                  class="w-full px-3 py-1.5 text-xs border border-input rounded-lg bg-background text-foreground outline-none focus:ring-1 focus:ring-red-500" 
                />
              </div>
            </div>
          </div>

          <!-- 6. Multiple Lampiran Dokumen & Link URL -->
          <div class="space-y-2.5 pt-1 border-t border-border/60">
            <label class="block text-xs font-bold text-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Lampiran Berkas & Link ({{ formData.attachments.length }})</span>
              <span class="text-[10px] font-normal text-muted-foreground">Bisa tambah banyak file & link</span>
            </label>

            <!-- Tab toggle -->
            <div class="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              <button
                type="button"
                @click="attachmentMode = 'file'"
                :class="[
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold transition-all',
                  attachmentMode === 'file'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                ]"
              >
                <Paperclip class="w-3.5 h-3.5" /> Upload Berkas
              </button>
              <button
                type="button"
                @click="attachmentMode = 'link'"
                :class="[
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold transition-all',
                  attachmentMode === 'link'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                ]"
              >
                <Link class="w-3.5 h-3.5" /> Tautan Link
              </button>
            </div>

            <!-- Drag & Drop Upload Zone -->
            <div
              v-if="attachmentMode === 'file'"
              @dragenter.prevent="isDraggingOver = true"
              @dragover.prevent="isDraggingOver = true"
              @dragleave.prevent="isDraggingOver = false"
              @drop.prevent="e => { isDraggingOver = false; handleFilesUpload(e) }"
              @click="fileInput.click()"
              :class="[
                'relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-all py-8 px-4',
                isDraggingOver
                  ? 'border-red-400 bg-red-50/60 dark:bg-red-950/30'
                  : 'border-border hover:border-red-400/60 hover:bg-muted/40 bg-muted/20'
              ]"
            >
              <input
                type="file"
                ref="fileInput"
                multiple
                @change="handleFilesUpload"
                accept="*/*"
                class="sr-only"
              />
              <div class="p-3 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
                <Paperclip class="w-5 h-5" />
              </div>
              <div class="text-center">
                <p class="text-xs font-bold text-foreground">
                  <span v-if="isDraggingOver">Lepaskan untuk upload...</span>
                  <span v-else>Drag & drop file di sini, atau <span class="text-red-600 underline">klik untuk pilih</span></span>
                </p>
                <p class="text-[10px] text-muted-foreground mt-0.5">Semua format • Bisa pilih lebih dari satu file</p>
              </div>
              <Loader2 v-if="isUploadingAttachment" class="absolute w-5 h-5 animate-spin text-red-500" />
            </div>

            <!-- Link mode: URL only -->
            <div v-if="attachmentMode === 'link'" class="flex flex-col sm:flex-row sm:items-center gap-2">
              <div class="relative flex-1 min-w-0">
                <Link class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  v-model="newLinkUrl"
                  type="text"
                  @keydown.enter.prevent="addLinkAttachment"
                  placeholder="Tempel URL (https://drive.google.com/...)..."
                  class="w-full pl-9 pr-3 py-2 text-xs border border-input rounded-lg bg-background text-foreground outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <button
                type="button"
                @click="addLinkAttachment"
                class="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
              >
                + Tambah
              </button>
            </div>

            <!-- List Multi-Lampiran -->
            <div v-if="formData.attachments.length > 0" class="space-y-1.5">
              <div
                v-for="(att, idx) in formData.attachments"
                :key="att.id || idx"
                class="flex items-center justify-between px-3 py-2 rounded-xl bg-card border border-border text-xs shadow-2xs"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <Paperclip v-if="att.type === 'file'" class="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <Link v-else class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <a :href="att.url" target="_blank" class="font-semibold text-foreground hover:text-red-600 truncate max-w-[160px] sm:max-w-[280px]">
                    {{ att.name }}
                  </a>
                  <span :class="[
                    'text-[10px] px-1.5 py-0.5 rounded uppercase font-bold shrink-0',
                    att.type === 'file' ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                  ]">
                    {{ att.type }}
                  </span>
                </div>
                <button type="button" @click="removeAttachment(idx)" class="p-1 text-muted-foreground hover:text-rose-500 rounded hover:bg-muted transition-colors cursor-pointer shrink-0">
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="px-6 py-3.5 bg-muted/30 border-t border-border flex justify-end gap-2.5">
          <button 
            @click="closeModal" 
            class="px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted rounded-xl transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button 
            @click="submitForm" 
            :disabled="isSubmitting || isUploadingAttachment" 
            class="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Loader2 v-if="isSubmitting" class="w-3.5 h-3.5 animate-spin" />
            <span>{{ isSubmitting ? 'Menyimpan...' : (isUploadingAttachment ? 'Mengunggah...' : (editingTask ? 'Simpan Perubahan' : 'Buat Tugas Baru')) }}</span>
          </button>
        </div>
      </div>
    </div>
    </Teleport>

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
