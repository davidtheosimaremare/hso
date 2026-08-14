<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { 
  Loader2, AlertCircle, FileText, ArrowLeft, Calendar, 
  FileSpreadsheet, Download, ChevronRight, User, DollarSign, Tag, Search,
  TrendingUp, Plus, Clock, CheckSquare, ListTodo, MessageSquare, PhoneCall,
  Users, Edit, CheckCircle2, XCircle, Send, Activity, Share2, Check, Pencil, Trash2
} from 'lucide-vue-next'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

const route = useRoute()
const router = useRouter()
const hsqId = route.params.id

const isLoading = ref(true)
const selectedHsq = ref(null)
const fetchError = ref(null)
const itemSearchQuery = ref('')
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

const filteredItems = computed(() => {
  if (!selectedHsq.value?.detailItem) return []
  const query = itemSearchQuery.value.trim().toLowerCase()
  if (!query) return selectedHsq.value.detailItem
  return selectedHsq.value.detailItem.filter(item => {
    const code = (item.item?.no || '').toLowerCase()
    const name = (item.item?.name || item.detailName || '').toLowerCase()
    const notes = (item.detailNotes || '').toLowerCase()
    return code.includes(query) || name.includes(query) || notes.includes(query)
  })
})

// --- FETCH HSQ DETAIL ---
const fetchHsqDetail = async () => {
  isLoading.value = true
  fetchError.value = null
  selectedHsq.value = null
  
  try {
    const { data, error } = await supabase.functions.invoke('accurate-detail-so', {
      body: { id: hsqId, type: 'sales-quotation' }
    })
    
    if (error) throw new Error(error.message || 'Gagal mengambil detail dari Edge Function')
    if (!data?.s) throw new Error(data?.error || 'Gagal mengambil detail HSQ')
    
    selectedHsq.value = data.d

    // Fetch tracking data for this HSQ
    await fetchHsqTrackingData()

    // Auto scroll & search if highlight param exists
    if (route.query.highlight) {
      setTimeout(() => {
        const el = document.getElementById(`hsq-item-${route.query.highlight}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 500)
    }
    if (route.query.search) {
      itemSearchQuery.value = route.query.search
    }
  } catch (err) {
    console.error('Fetch HSQ detail error:', err)
    fetchError.value = err.message
  } finally {
    isLoading.value = false
  }
}

// --- PROGRESS, ACTIVITY LOGS & TASKS STATE ---
// --- PROGRESS, ACTIVITY LOGS & TASKS STATE ---
const hsqProgress = ref(null)
const activityLogs = ref([])
const taskList = ref([])
const isSavingProgress = ref(false)
const isSavingActivity = ref(false)
const isSavingTask = ref(false)

// Modals
const isUpdateProgressOpen = ref(false)
const isAddActivityOpen = ref(false)
const isAddTaskOpen = ref(false)

// Form States
const progressForm = ref({
  stage: 'Prospecting',
  probability: 10,
  expected_closing_date: '',
  notes: ''
})
const activityForm = ref({
  activity_type: 'Follow Up',
  notes: ''
})
const selectedPics = ref([])

const formatUserName = (email) => {
  if (!email) return '-'
  const namePart = email.split('@')[0] || ''
  if (namePart.toLowerCase() === 'davidtheo') return 'David Theo'
  if (namePart.toLowerCase() === 'bobdovi') return 'Bob Dovi'
  if (namePart.toLowerCase() === 'dolly') return 'Dolly'
  if (namePart.toLowerCase() === 'admin') return 'Admin HSO'
  return namePart.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const getUserInitials = (email) => {
  const name = formatUserName(email)
  const parts = name.split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.substring(0, 2).toUpperCase()
}

const formatUserNameList = (assignedToString) => {
  if (!assignedToString) return '-'
  return assignedToString
    .split(',')
    .map(e => formatUserName(e.trim()))
    .join(', ')
}

const taskForm = ref({
  task_title: '',
  due_date: '',
  assigned_to: '',
  send_email_notif: true
})

const editingActivityId = ref(null)
const editingTaskId = ref(null)

const openAddActivityModal = () => {
  editingActivityId.value = null
  activityForm.value = { activity_type: 'Follow Up', notes: '' }
  isAddActivityOpen.value = true
}

const openEditActivityModal = (log) => {
  editingActivityId.value = log.id
  activityForm.value = {
    activity_type: log.activity_type || 'Follow Up',
    notes: log.notes || ''
  }
  isAddActivityOpen.value = true
}

const openAddTaskModal = () => {
  editingTaskId.value = null
  taskForm.value = { task_title: '', due_date: '', assigned_to: '', send_email_notif: true }
  if (selectedPics.value.length === 0 && userList.value.length > 0) {
    const defaultUser = userList.value.find(u => u.email === 'davidtheo@hokiindo.co.id') || userList.value[0]
    if (defaultUser) selectedPics.value = [defaultUser.email]
  }
  isAddTaskOpen.value = true
}

const openEditTaskModal = (task) => {
  editingTaskId.value = task.id
  taskForm.value = {
    task_title: task.task_title || '',
    due_date: task.due_date || '',
    assigned_to: task.assigned_to || '',
    send_email_notif: false
  }
  if (task.assigned_to) {
    selectedPics.value = task.assigned_to.split(',').map(s => s.trim()).filter(Boolean)
  } else {
    selectedPics.value = []
  }
  isAddTaskOpen.value = true
}

const togglePicSelection = (email) => {
  const idx = selectedPics.value.indexOf(email)
  if (idx > -1) {
    selectedPics.value.splice(idx, 1)
  } else {
    selectedPics.value.push(email)
  }
}

const availableStages = [
  { val: 'Negosiasi', label: 'Negosiasi', defaultProb: 50 },
  { val: 'Won', label: 'Won (Disetujui & Deal)', defaultProb: 100 },
  { val: 'Lost', label: 'Lost (Batal / Gagal)', defaultProb: 0 }
]

const activityTypes = [
  { val: 'Follow Up', label: 'Follow Up Client' },
  { val: 'Telepon', label: 'Panggilan Telepon' },
  { val: 'WhatsApp / Email', label: 'WhatsApp / Email' },
  { val: 'Meeting', label: 'Meeting / Diskusi' },
  { val: 'Site Visit', label: 'Kunjungan Lapangan' },
  { val: 'Kirim Revisi', label: 'Kirim Revisi Penawaran' }
]

// --- HSO USERS & LOCALSTORAGE FALLBACK ---
const userList = ref([])

const fetchHsoUsers = async () => {
  try {
    const { data } = await supabase
      .from('user_access')
      .select('email, role')
      .order('email', { ascending: true })

    if (data && data.length > 0) {
      userList.value = data
      if (selectedPics.value.length === 0 && data[0]?.email) {
        selectedPics.value = [data[0].email]
      }
    }
  } catch (err) {
    console.error('Error fetching users:', err)
  }
}

const extractProjectName = (hsq) => {
  let text = hsq?.description || ''
  if (!text.toLowerCase().includes('pro') && hsq?.detailItem && hsq.detailItem.length > 0) {
    text = hsq.detailItem[0].detailNotes || ''
  }
  if (!text) return null
  
  const regex = /pro(?:ject|yek)\s*[:\-]?\s*(.*?)(?=\s*(?:>|status|$))/i
  const match = text.match(regex)
  if (match && match[1]) {
    return match[1].replace(/[\s\-]+$/, '').trim()
  }
  return null
}

const getLocalData = (key) => {
  try {
    const d = localStorage.getItem(key)
    return d ? JSON.parse(d) : null
  } catch { return null }
}
const setLocalData = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

// Fetch Progress & Activity Logs & Tasks
const fetchHsqTrackingData = async () => {
  const num = selectedHsq.value?.number || hsqId
  if (!num) return

  await fetchHsoUsers()

  // 1. Progress
  hsqProgress.value = null
  try {
    const { data: pData, error: pErr } = await supabase
      .from('hsq_progress')
      .select('*')
      .eq('hsq_number', String(num))
      .maybeSingle()

    if (!pErr && pData && pData.stage) {
      hsqProgress.value = pData
      progressForm.value = {
        stage: pData.stage || 'Negosiasi',
        probability: pData.probability !== undefined ? pData.probability : 50,
        expected_closing_date: pData.expected_closing_date || '',
        notes: pData.notes || ''
      }
    } else {
      const localP = getLocalData(`hsq_progress_${num}`)
      if (localP && localP.stage) {
        hsqProgress.value = localP
        progressForm.value = {
          stage: localP.stage || 'Negosiasi',
          probability: localP.probability !== undefined ? localP.probability : 50,
          expected_closing_date: localP.expected_closing_date || '',
          notes: localP.notes || ''
        }
      }
    }
  } catch {
    const localP = getLocalData(`hsq_progress_${num}`)
    if (localP && localP.stage) hsqProgress.value = localP
  }

  // 2. Activity Logs
  try {
    const { data: aData, error: aErr } = await supabase
      .from('hsq_activity_logs')
      .select('*')
      .eq('hsq_number', String(num))
      .order('created_at', { ascending: false })

    if (!aErr && aData) {
      activityLogs.value = aData
    } else {
      activityLogs.value = getLocalData(`hsq_activity_logs_${num}`) || []
    }
  } catch {
    activityLogs.value = getLocalData(`hsq_activity_logs_${num}`) || []
  }

  // 3. Tasks
  try {
    const { data: tData, error: tErr } = await supabase
      .from('hsq_tasks')
      .select('*')
      .eq('hsq_number', String(num))
      .order('due_date', { ascending: true })

    if (!tErr && tData) {
      taskList.value = tData
    } else {
      taskList.value = getLocalData(`hsq_tasks_${num}`) || []
    }
  } catch {
    taskList.value = getLocalData(`hsq_tasks_${num}`) || []
  }
}

// Open Progress Modal
const openUpdateProgressModal = () => {
  progressForm.value = {
    stage: hsqProgress.value?.stage || 'Negosiasi',
    probability: hsqProgress.value?.probability !== undefined && hsqProgress.value?.probability !== null ? hsqProgress.value.probability : 50,
    expected_closing_date: hsqProgress.value?.expected_closing_date || '',
    notes: hsqProgress.value?.notes || ''
  }
  isUpdateProgressOpen.value = true
}

// When Stage changes, auto set default probability suggestion
const onStageChange = () => {
  const found = availableStages.find(s => s.val === progressForm.value.stage)
  if (found) {
    progressForm.value.probability = found.defaultProb
  }
}

// Save Progress
const saveHsqProgress = async () => {
  const num = selectedHsq.value?.number || hsqId
  if (!num) return

  isSavingProgress.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email || 'Sales User'

    const payload = {
      hsq_number: String(num),
      stage: progressForm.value.stage,
      probability: Number(progressForm.value.probability),
      expected_closing_date: progressForm.value.expected_closing_date || null,
      notes: progressForm.value.notes || null,
      updated_by: userEmail,
      updated_at: new Date().toISOString()
    }

    let savedData = payload
    try {
      const { data, error } = await supabase
        .from('hsq_progress')
        .upsert(payload, { onConflict: 'hsq_number' })
        .select()
        .single()

      if (!error && data) savedData = data
    } catch (dbErr) {
      console.warn('Supabase DB error, using local fallback:', dbErr)
    }

    setLocalData(`hsq_progress_${num}`, savedData)
    hsqProgress.value = savedData

    // Automatically record activity log entry for progress update
    const actPayload = {
      id: Date.now(),
      hsq_number: String(num),
      activity_type: 'Pembaruan Progress',
      notes: `Update Tahap: ${progressForm.value.stage} | Probabilitas: ${progressForm.value.probability}%. ${progressForm.value.notes ? 'Catatan: ' + progressForm.value.notes : ''}`,
      created_by: userEmail,
      created_at: new Date().toISOString()
    }

    try {
      await supabase.from('hsq_activity_logs').insert({
        hsq_number: String(num),
        activity_type: 'Pembaruan Progress',
        notes: actPayload.notes,
        created_by: userEmail
      })
    } catch {}

    const currLogs = getLocalData(`hsq_activity_logs_${num}`) || activityLogs.value || []
    currLogs.unshift(actPayload)
    setLocalData(`hsq_activity_logs_${num}`, currLogs)
    activityLogs.value = currLogs

    isUpdateProgressOpen.value = false
  } catch (err) {
    console.error('Error saving progress:', err)
  } finally {
    isSavingProgress.value = false
  }
}

// Save Activity Log
const saveActivityLog = async () => {
  const num = selectedHsq.value?.number || hsqId
  if (!num || !activityForm.value.notes.trim()) {
    alert('Catatan aktivitas tidak boleh kosong!')
    return
  }

  isSavingActivity.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email || 'Sales User'

    if (editingActivityId.value) {
      try {
        await supabase.from('hsq_activity_logs').update({
          activity_type: activityForm.value.activity_type,
          notes: activityForm.value.notes.trim()
        }).eq('id', editingActivityId.value)
      } catch (dbErr) {
        console.warn('Supabase DB error:', dbErr)
      }

      const currLogs = getLocalData(`hsq_activity_logs_${num}`) || activityLogs.value || []
      const idx = currLogs.findIndex(l => l.id === editingActivityId.value)
      if (idx !== -1) {
        currLogs[idx].activity_type = activityForm.value.activity_type
        currLogs[idx].notes = activityForm.value.notes.trim()
        setLocalData(`hsq_activity_logs_${num}`, currLogs)
      }
      activityLogs.value = currLogs
    } else {
      const payload = {
        id: Date.now(),
        hsq_number: String(num),
        activity_type: activityForm.value.activity_type,
        notes: activityForm.value.notes.trim(),
        created_by: userEmail,
        created_at: new Date().toISOString()
      }

      try {
        await supabase.from('hsq_activity_logs').insert({
          hsq_number: String(num),
          activity_type: activityForm.value.activity_type,
          notes: activityForm.value.notes.trim(),
          created_by: userEmail
        })
      } catch (dbErr) {
        console.warn('Supabase DB error, using local fallback:', dbErr)
      }

      const currLogs = getLocalData(`hsq_activity_logs_${num}`) || activityLogs.value || []
      currLogs.unshift(payload)
      setLocalData(`hsq_activity_logs_${num}`, currLogs)
      activityLogs.value = currLogs
    }

    activityForm.value = { activity_type: 'Follow Up', notes: '' }
    editingActivityId.value = null
    isAddActivityOpen.value = false
  } catch (err) {
    console.error('Error saving activity:', err)
  } finally {
    isSavingActivity.value = false
  }
}

// Save Task
const saveTask = async () => {
  const num = selectedHsq.value?.number || hsqId
  if (!num || !taskForm.value.task_title.trim()) {
    alert('Deskripsi task tidak boleh kosong!')
    return
  }

  isSavingTask.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email || 'Sales User'
    
    const picList = selectedPics.value.length > 0 ? selectedPics.value : [userList.value[0]?.email || userEmail]
    const picString = picList.join(', ')

    if (editingTaskId.value) {
      try {
        await supabase.from('hsq_tasks').update({
          task_title: taskForm.value.task_title.trim(),
          due_date: taskForm.value.due_date || null,
          assigned_to: picString
        }).eq('id', editingTaskId.value)
      } catch (dbErr) {
        console.warn('Supabase DB error:', dbErr)
      }

      const currTasks = getLocalData(`hsq_tasks_${num}`) || taskList.value || []
      const idx = currTasks.findIndex(t => t.id === editingTaskId.value)
      if (idx !== -1) {
        currTasks[idx].task_title = taskForm.value.task_title.trim()
        currTasks[idx].due_date = taskForm.value.due_date || null
        currTasks[idx].assigned_to = picString
        setLocalData(`hsq_tasks_${num}`, currTasks)
      }
      taskList.value = currTasks
    } else {
      const payload = {
        id: Date.now(),
        hsq_number: String(num),
        client_name: selectedHsq.value?.customer?.name || null,
        task_title: taskForm.value.task_title.trim(),
        due_date: taskForm.value.due_date || null,
        assigned_to: picString,
        status: 'Pending',
        created_by: userEmail,
        created_at: new Date().toISOString()
      }

      try {
        await supabase.from('hsq_tasks').insert({
          hsq_number: String(num),
          client_name: selectedHsq.value?.customer?.name || null,
          task_title: taskForm.value.task_title.trim(),
          due_date: taskForm.value.due_date || null,
          assigned_to: picString,
          status: 'Pending',
          created_by: userEmail
        })

        if (taskForm.value.send_email_notif && picList.length > 0) {
          for (const picEmail of picList) {
            await supabase.from('notifications').insert({
              title: `Task Baru: HSQ ${num}`,
              message: `Task: ${taskForm.value.task_title.trim()} (Customer: ${selectedHsq.value?.customer?.name || '-'}). Jatuh Tempo: ${taskForm.value.due_date ? formatDate(taskForm.value.due_date) : 'Segera'}.`,
              user_email: picEmail,
              created_at: new Date().toISOString()
            })
          }
        }
      } catch (dbErr) {
        console.warn('Supabase DB error, using local fallback:', dbErr)
      }

      const currTasks = getLocalData(`hsq_tasks_${num}`) || taskList.value || []
      currTasks.push(payload)
      setLocalData(`hsq_tasks_${num}`, currTasks)
      taskList.value = currTasks
    }

    taskForm.value = { task_title: '', due_date: '', assigned_to: '', send_email_notif: true }
    editingTaskId.value = null
    isAddTaskOpen.value = false
  } catch (err) {
    console.error('Error saving task:', err)
  } finally {
    isSavingTask.value = false
  }
}

// Delete Activity Log
const deleteActivityLog = async (logId) => {
  if (!confirm('Apakah Anda yakin ingin menghapus catatan aktivitas ini?')) return
  const num = selectedHsq.value?.number || hsqId

  // 1. Immediately update reactive state so UI reflects deletion right away
  activityLogs.value = (activityLogs.value || []).filter(l => String(l.id) !== String(logId))

  // 2. Update local storage if present
  const localLogs = getLocalData(`hsq_activity_logs_${num}`)
  if (localLogs && Array.isArray(localLogs)) {
    const updatedLocal = localLogs.filter(l => String(l.id) !== String(logId))
    setLocalData(`hsq_activity_logs_${num}`, updatedLocal)
  }

  // 3. Delete from Supabase database
  try {
    await supabase.from('hsq_activity_logs').delete().eq('id', logId)
  } catch (err) {
    console.warn('Supabase DB delete error:', err)
  }
}

// Delete Task
const deleteTask = async (taskId) => {
  if (!confirm('Apakah Anda yakin ingin menghapus task ini?')) return
  const num = selectedHsq.value?.number || hsqId

  // 1. Immediately update reactive state so UI reflects deletion right away
  taskList.value = (taskList.value || []).filter(t => String(t.id) !== String(taskId))

  // 2. Update local storage if present
  const localTasks = getLocalData(`hsq_tasks_${num}`)
  if (localTasks && Array.isArray(localTasks)) {
    const updatedLocal = localTasks.filter(t => String(t.id) !== String(taskId))
    setLocalData(`hsq_tasks_${num}`, updatedLocal)
  }

  // 3. Delete from Supabase database
  try {
    await supabase.from('hsq_tasks').delete().eq('id', taskId)
  } catch (err) {
    console.warn('Supabase DB delete error:', err)
  }
}

// Toggle Task Status
const toggleTaskStatus = async (task) => {
  const num = selectedHsq.value?.number || hsqId
  const newStatus = task.status === 'Completed' ? 'Pending' : 'Completed'
  task.status = newStatus

  try {
    await supabase
      .from('hsq_tasks')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', task.id)
  } catch (err) {
    console.warn('Supabase DB update failed, using local fallback:', err)
  }

  const currTasks = getLocalData(`hsq_tasks_${num}`) || taskList.value || []
  const idx = currTasks.findIndex(t => t.id === task.id || t.task_title === task.task_title)
  if (idx !== -1) {
    currTasks[idx].status = newStatus
    setLocalData(`hsq_tasks_${num}`, currTasks)
  }
}

// --- HELPERS ---
const getDiscountText = (item) => {
  if (item.itemDisc) return item.itemDisc
  if (item.itemDiscPercent) return `${item.itemDiscPercent}%`
  return '-'
}

const getLineTotal = (item) => {
  const qty = Number(item.quantity) || 0
  const price = Number(item.unitPrice) || 0
  
  // Safely parse discount percent
  let discPercent = 0
  if (item.itemDiscPercent !== undefined && item.itemDiscPercent !== null) {
    const cleanDisc = String(item.itemDiscPercent).replace(/%/g, '').trim()
    if (cleanDisc.includes('+')) {
      const parts = cleanDisc.split('+').map(p => parseFloat(p) || 0)
      let multiplier = 1
      for (const d of parts) {
        multiplier *= (1 - d / 100)
      }
      const total = qty * price * multiplier
      return isNaN(total) ? 0 : total
    } else {
      discPercent = parseFloat(cleanDisc) || 0
    }
  }
  
  const total = qty * price * (1 - discPercent / 100)
  return isNaN(total) ? 0 : total
}

// --- EXPORT TO EXCEL ---
const exportToExcel = () => {
  if (!selectedHsq.value) return
  
  const headers = [
    ['Nomor Quotation (HSQ):', selectedHsq.value.number],
    ['Tanggal:', formatDate(selectedHsq.value.transDate)],
    ['Customer:', selectedHsq.value.customer?.name || '-'],
    ['Status:', selectedHsq.value.statusName || '-'],
    ['Total Nilai:', formatCurrency(selectedHsq.value.totalAmount)],
    ['Keterangan:', selectedHsq.value.description || '-'],
    [],
    ['No.', 'Kode Barang', 'Nama Barang', 'Qty', 'Satuan', 'Harga Satuan', 'Discount', 'Total Harga', 'Catatan Item']
  ]
  
  const rows = (selectedHsq.value.detailItem || []).map((item, idx) => [
    idx + 1,
    item.item?.no || '-',
    item.item?.name || item.detailName || '-',
    item.quantity || 0,
    item.itemUnit?.name || item.unit?.name || '-',
    item.unitPrice || 0,
    getDiscountText(item),
    getLineTotal(item),
    item.detailNotes || '-'
  ])
  
  const fullData = [...headers, ...rows]
  
  const ws = XLSX.utils.aoa_to_sheet(fullData)
  
  // Set column widths
  const wscols = [
    { wch: 6 },  // No
    { wch: 22 }, // Kode Barang
    { wch: 45 }, // Nama Barang
    { wch: 10 }, // Qty
    { wch: 10 }, // Satuan
    { wch: 15 }, // Harga Satuan
    { wch: 12 }, // Discount
    { wch: 18 }, // Total Harga
    { wch: 30 }  // Catatan Item
  ]
  ws['!cols'] = wscols
  
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Detail HSQ")
  XLSX.writeFile(wb, `HSQ_${selectedHsq.value.number.replace(/[\/\\]/g, '_')}.xlsx`)
}

// --- UTILS ---
const parseAccurateDate = (dateStr) => {
  if (!dateStr) return new Date(0)
  if (typeof dateStr === 'string' && dateStr.includes('/')) {
    const parts = dateStr.split('/')
    return new Date(parts[2], parts[1] - 1, parts[0])
  }
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? new Date(0) : d
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  try {
    const d = parseAccurateDate(dateStr)
    if (isNaN(d.getTime()) || d.getTime() === 0) return dateStr
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

const formatDateTime = (dateStr) => {
  if (!dateStr) return '-'
  try {
    const d = parseAccurateDate(dateStr)
    if (isNaN(d.getTime()) || d.getTime() === 0) return dateStr
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return dateStr
  }
}

const formatCurrency = (val) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0)
}

const getStatusClass = (status) => {
  const name = (status || '').toLowerCase()
  if (name.includes('closed') || name.includes('selesai') || name.includes('ditutup') || name.includes('terproses')) {
    if (name.includes('sebagian')) {
      return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/60'
    }
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/60'
  }
  if (name.includes('menunggu') || name.includes('diajukan') || name.includes('disetujui')) {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/60'
  }
  if (name.includes('draft') || name.includes('draf')) {
    return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700'
  }
  if (name.includes('tolak') || name.includes('batal') || name.includes('gagal')) {
    return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/60'
  }
  return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/60'
}

const goBack = () => {
  router.push('/hsq')
}

// Combined feed: activities + tasks, sorted by date (newest first)
const combinedActivityFeed = computed(() => {
  const activities = (activityLogs.value || []).map(log => ({
    key: 'act-' + log.id,
    type: 'activity',
    raw: log,
    title: log.activity_type || 'Aktivitas',
    notes: log.notes,
    status: null,
    created_by: log.created_by,
    created_at: log.created_at,
    due_date: null,
    assigned_to: null
  }))

  const tasks = (taskList.value || []).map(task => ({
    key: 'task-' + task.id,
    type: 'task',
    raw: task,
    title: task.task_title,
    notes: '',
    status: task.status,
    created_by: task.created_by,
    created_at: task.created_at,
    due_date: task.due_date,
    assigned_to: task.assigned_to
  }))

  return [...activities, ...tasks]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
})

onMounted(() => {
  fetchHsqDetail()
})
</script>

<template>
  <div class="space-y-6 font-sans text-slate-900 dark:text-slate-100">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-32 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
      <Loader2 class="w-9 h-9 animate-spin text-red-600 mb-3" />
      <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 animate-pulse tracking-wide">Mengambil detail HSQ dari Accurate...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="fetchError" class="p-6 text-center bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-2xl border border-rose-200/80 dark:border-rose-900/30">
      <AlertCircle class="w-9 h-9 mx-auto mb-3 text-rose-500" />
      <h3 class="text-sm font-bold">Gagal Mengambil Detail</h3>
      <p class="text-xs mt-1 font-sans">{{ fetchError }}</p>
      <Button @click="fetchHsqDetail" variant="outline" class="mt-4 border-rose-200 hover:bg-rose-100 hover:text-rose-700 text-xs font-semibold rounded-xl">Coba Lagi</Button>
    </div>

    <template v-else-if="selectedHsq">
      <!-- Header (No Box) -->
      <div class="flex flex-col gap-4">
        <!-- Title + Action Buttons -->
        <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div class="space-y-1">
            <div class="flex items-center gap-3 flex-wrap">
              <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {{ selectedHsq.number }}
              </h1>
              <!-- Stage Stamp (Won / Lost / Negosiasi) -->
              <span
                v-if="hsqProgress?.stage === 'Won'"
                class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider border border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
              >
                Won
              </span>
              <span
                v-else-if="hsqProgress?.stage === 'Lost'"
                class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider border border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900"
              >
                Lost
              </span>
              <span
                v-else-if="hsqProgress?.stage?.includes('Negosiasi')"
                class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider border border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900"
              >
                {{ hsqProgress.stage }}
              </span>
            </div>
            <p v-if="extractProjectName(selectedHsq)" class="text-sm font-medium text-slate-700 dark:text-slate-300">
              {{ extractProjectName(selectedHsq) }}
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Dibuat tanggal <span class="font-semibold text-slate-700 dark:text-slate-300">{{ formatDate(selectedHsq.transDate) }}</span>
            </p>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" :class="getStatusClass(selectedHsq.statusName)" class="text-xs">
              {{ selectedHsq.statusName || 'Outstanding' }}
            </Badge>

            <Button @click="shareLink" variant="outline" size="sm" class="gap-2" :class="{ 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900': isCopied }">
              <Check v-if="isCopied" class="w-4 h-4" />
              <Share2 v-else class="w-4 h-4" />
              {{ isCopied ? 'Link Disalin!' : 'Bagikan Link' }}
            </Button>

            <Button @click="exportToExcel" size="sm" class="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              <FileSpreadsheet class="w-4 h-4" /> Download Excel
            </Button>

            <Button @click="goBack" variant="outline" size="sm" class="gap-2">
              <ArrowLeft class="w-4 h-4" /> Kembali ke Daftar
            </Button>
          </div>
        </div>

        <!-- Data Strip -->
        <div class="grid grid-cols-1 md:grid-cols-4 text-sm border-t border-slate-200 dark:border-slate-800 pt-4">
          <div class="md:border-r border-slate-200 dark:border-slate-800 md:pr-6 py-3 space-y-0.5">
            <div class="text-[10px] font-medium uppercase tracking-wider text-slate-400">Customer</div>
            <div class="font-semibold text-slate-900 dark:text-white">{{ selectedHsq.customer?.name || '-' }}</div>
          </div>
          <div class="md:border-r border-slate-200 dark:border-slate-800 md:px-6 py-3 space-y-0.5">
            <div class="text-[10px] font-medium uppercase tracking-wider text-slate-400">Total Nilai</div>
            <div class="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{{ formatCurrency(selectedHsq.totalAmount) }}</div>
          </div>
          <div class="md:border-r border-slate-200 dark:border-slate-800 md:px-6 py-3 space-y-0.5">
            <div class="text-[10px] font-medium uppercase tracking-wider text-slate-400">Syarat Pembayaran</div>
            <div class="font-medium text-slate-900 dark:text-white">{{ selectedHsq.paymentTerm?.name || '-' }}</div>
          </div>
          <div class="md:px-6 py-3 space-y-0.5">
            <div class="text-[10px] font-medium uppercase tracking-wider text-slate-400">Keterangan</div>
            <div class="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 leading-snug" :title="selectedHsq.description">
              {{ selectedHsq.description || 'Tidak ada keterangan.' }}
            </div>
          </div>
        </div>
      </div>

      <!-- Sales Pipeline & Progress Card -->
      <div class="bg-slate-900 dark:bg-slate-950 text-white p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4 font-sans">
        <!-- Filled State -->
        <template v-if="hsqProgress && hsqProgress.stage">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div class="flex items-center gap-3.5">
              <div class="p-3 rounded-2xl bg-red-600/20 border border-red-500/30 text-red-400">
                <TrendingUp class="w-6 h-6" />
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Tahap Penawaran (Pipeline)</span>
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-600/30 text-red-300 border border-red-500/40">
                    {{ hsqProgress.stage }}
                  </span>
                </div>
                <h3 class="text-xs font-semibold text-slate-300 mt-1">
                  Estimasi Closing: <span class="font-bold text-white">{{ hsqProgress.expected_closing_date ? formatDate(hsqProgress.expected_closing_date) : 'Belum ditentukan' }}</span>
                </h3>
              </div>
            </div>

            <div class="flex items-center gap-4">
              <!-- Probability Badge -->
              <div class="text-right">
                <div class="text-xs text-slate-400 font-bold uppercase tracking-wider">Probabilitas Win</div>
                <div class="text-2xl font-black text-emerald-400 tracking-tight">{{ hsqProgress.probability !== undefined ? hsqProgress.probability : 0 }}%</div>
              </div>
              
              <Button 
                @click="openUpdateProgressModal"
                class="h-9 px-4 text-xs font-bold bg-red-600 hover:bg-red-700 text-white gap-2 shadow-xs rounded-xl cursor-pointer"
              >
                <Edit class="w-3.5 h-3.5" /> Update Progress
              </Button>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="space-y-1.5">
            <div class="flex justify-between text-xs text-slate-400 font-medium">
              <span>Probabilitas Penutupan Proyek</span>
              <span class="font-bold text-slate-200">{{ hsqProgress.probability !== undefined ? hsqProgress.probability : 0 }}% / 100%</span>
            </div>
            <div class="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/60">
              <div 
                class="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-amber-500 via-red-500 to-emerald-500" 
                :style="`width: ${Math.min(100, Math.max(5, hsqProgress.probability || 0))}%`"
              ></div>
            </div>
          </div>

          <!-- Latest Notes -->
          <div v-if="hsqProgress.notes" class="text-xs text-slate-300 bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/50 flex items-start gap-2.5">
            <MessageSquare class="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span class="font-bold text-slate-100">Catatan Progress:</span> {{ hsqProgress.notes }}
              <span v-if="hsqProgress.updated_by" class="text-[11px] text-slate-400 block mt-1">Oleh: {{ hsqProgress.updated_by }}</span>
            </div>
          </div>
        </template>

        <!-- Unfilled State -->
        <template v-else>
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex items-center gap-3.5">
              <div class="p-3 rounded-2xl bg-slate-800 border border-slate-700 text-slate-400">
                <TrendingUp class="w-6 h-6" />
              </div>
              <div>
                <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Tahap Penawaran (Pipeline)</span>
                <h3 class="text-sm font-bold text-slate-200 mt-0.5">Progress & Probabilitas Win Belum Diisi</h3>
                <p class="text-xs text-slate-400 mt-0.5">Klik tombol di kanan untuk meng-update progress penawaran ini.</p>
              </div>
            </div>
            <Button 
              @click="openUpdateProgressModal"
              class="h-9 px-4 text-xs font-bold bg-red-600 hover:bg-red-700 text-white gap-2 shadow-xs rounded-xl shrink-0 cursor-pointer"
            >
              <Plus class="w-3.5 h-3.5" /> Isi Progress & Win %
            </Button>
          </div>
        </template>
      </div>

<div class="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs font-sans space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
          <div class="flex items-center gap-2.5">
            <Activity class="w-5 h-5 text-red-600" />
            <h3 class="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Aktivitas & Task Client</h3>
            <span class="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold border border-slate-200/60 dark:border-slate-700">
              {{ activityLogs.length + taskList.length }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <Button @click="openAddActivityModal" variant="outline" class="h-8 px-3 text-xs gap-1.5 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold rounded-xl cursor-pointer">
              <Plus class="w-3.5 h-3.5 text-red-600" /> Catat Aktivitas
            </Button>
            <Button @click="openAddTaskModal" variant="outline" class="h-8 px-3 text-xs gap-1.5 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold rounded-xl cursor-pointer">
              <Plus class="w-3.5 h-3.5 text-red-600" /> Tambah Task
            </Button>
          </div>
        </div>

        <!-- Timeline List (Activities + Tasks combined - Shadcn UI Clean Style) -->
        <div v-if="combinedActivityFeed.length > 0" class="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
          <div
            v-for="entry in combinedActivityFeed"
            :key="entry.key"
            class="group p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/90 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-2xs flex items-start gap-3"
            :class="{ 'opacity-65': entry.type === 'task' && entry.status === 'Completed' }"
          >
            <!-- Checkbox for Task / Accent Indicator for Activity -->
            <div class="shrink-0 mt-0.5">
              <input
                v-if="entry.type === 'task'"
                type="checkbox"
                :checked="entry.status === 'Completed'"
                @change="toggleTaskStatus(entry.raw)"
                class="w-4 h-4 rounded accent-red-600 cursor-pointer"
              />
              <span v-else class="block w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 mt-1.5 ml-1"></span>
            </div>

            <div class="flex-1 min-w-0 space-y-1">
              <!-- Top Row: Badge, Title & Created Time + Actions -->
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-2 flex-wrap">
                  <span
                    class="px-2 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wider"
                    :class="entry.type === 'task'
                      ? 'border-amber-200/80 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
                  >
                    {{ entry.type === 'task' ? 'Task' : (entry.activity_type || 'Aktivitas') }}
                  </span>
                  <h4
                    class="text-xs font-semibold leading-normal text-slate-900 dark:text-white"
                    :class="{ 'line-through text-slate-400 dark:text-slate-500': entry.type === 'task' && entry.status === 'Completed' }"
                  >
                    {{ entry.title }}
                  </h4>
                </div>

                <div class="flex items-center gap-3 shrink-0">
                  <!-- Edit & Delete Buttons -->
                  <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button 
                      @click="entry.type === 'task' ? openEditTaskModal(entry.raw) : openEditActivityModal(entry.raw)"
                      title="Edit"
                      class="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Pencil class="w-3.5 h-3.5" />
                    </button>
                    <button 
                      @click="entry.type === 'task' ? deleteTask(entry.raw.id) : deleteActivityLog(entry.raw.id)"
                      title="Hapus"
                      class="p-1 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <!-- Clean Formatted Timestamp -->
                  <span class="text-[11px] text-slate-400 font-normal flex items-center gap-1">
                    <Clock class="w-3 h-3 text-slate-400" />
                    {{ formatDateTime(entry.created_at) }}
                  </span>
                </div>
              </div>

              <!-- Task Metadata (Due Date, Penanggung Jawab, Status) -->
              <div v-if="entry.type === 'task'" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                <span v-if="entry.due_date" class="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                  <Calendar class="w-3 h-3 text-slate-400" /> Jatuh Tempo: <span class="font-semibold text-slate-900 dark:text-white">{{ formatDate(entry.due_date) }}</span>
                </span>
                <span v-if="entry.assigned_to" class="flex items-center gap-1 font-medium">
                  <User class="w-3 h-3 text-slate-400" /> Penanggung Jawab: <span class="font-semibold text-slate-800 dark:text-slate-200">{{ formatUserNameList(entry.assigned_to) }}</span>
                </span>
                <span
                  v-if="entry.status"
                  class="px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase"
                  :class="entry.status === 'Completed'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60'
                    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60'"
                >
                  {{ entry.status === 'Completed' ? 'Selesai' : 'Pending' }}
                </span>
              </div>

              <!-- Activity note -->
              <p v-if="entry.type === 'activity'" class="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
                {{ entry.notes }}
              </p>

              <!-- Author -->
              <p v-if="entry.created_by" class="text-[11px] text-slate-400 font-normal pt-0.5">
                Oleh: <span class="font-medium text-slate-600 dark:text-slate-400">{{ formatUserName(entry.created_by) }}</span>
              </p>
            </div>
          </div>
        </div>

        <div v-else class="py-12 text-center text-slate-400 space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/30 dark:bg-slate-800/20">
          <MessageSquare class="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p class="text-xs font-bold text-slate-600 dark:text-slate-400">Belum ada aktivitas atau task</p>
          <p class="text-[11px] text-slate-400">Klik "Catat Aktivitas" atau "Tambah Task" untuk memulai.</p>
        </div>
      </div>

      <!-- Items Table Section (Shadcn UI Minimalist Style) -->
      <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-2xs font-sans">
        <!-- Card Header & Search -->
        <div class="px-5 py-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <h3 class="text-xs font-semibold text-slate-900 dark:text-white">Daftar Barang Penawaran</h3>
            <span class="text-[11px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 px-2 py-0.5 rounded-full">
              {{ filteredItems.length }} / {{ selectedHsq.detailItem?.length || 0 }} Items
            </span>
          </div>

          <!-- Search Input -->
          <div class="relative w-full sm:w-60">
            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              v-model="itemSearchQuery"
              type="text"
              placeholder="Cari kode / nama barang..."
              class="pl-8 pr-3 py-1.5 w-full text-xs border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-700 transition-all font-sans"
            />
          </div>
        </div>
        
        <!-- Table -->
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse font-sans">
            <thead>
              <tr class="bg-slate-50/60 dark:bg-slate-900/60 text-slate-500 border-b border-slate-200/80 dark:border-slate-800">
                <th class="py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider w-12 text-center">No</th>
                <th class="py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider w-40">Kode Barang</th>
                <th class="py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider">Nama Barang</th>
                <th class="py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider w-20 text-right">Qty</th>
                <th class="py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider w-16 text-center">Satuan</th>
                <th class="py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider w-32 text-right">Harga Satuan</th>
                <th class="py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider w-24 text-center">Diskon</th>
                <th class="py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider w-36 text-right">Total Harga</th>
                <th class="py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider w-36">Status / Catatan</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              <tr
                v-for="(item, idx) in filteredItems"
                :key="idx"
                :id="`hsq-item-${item.item?.no}`"
                class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                :class="{ 'bg-amber-50/60 dark:bg-amber-950/20': route.query.highlight === item.item?.no }"
              >
                <!-- No -->
                <td class="py-3 px-4 text-center text-slate-400 font-normal">{{ idx + 1 }}</td>
                
                <!-- Kode Barang Badge -->
                <td class="py-3 px-4">
                  <span class="inline-block whitespace-nowrap font-mono text-[11px] font-medium text-slate-700 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200/50 dark:border-slate-700/50">
                    {{ item.item?.no || '-' }}
                  </span>
                </td>
                
                <!-- Nama Barang -->
                <td class="py-3 px-4 font-medium text-slate-900 dark:text-slate-100 leading-normal max-w-xs md:max-w-md">
                  {{ item.item?.name || item.detailName || '-' }}
                </td>

                <!-- Qty -->
                <td class="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white tabular-nums">
                  {{ item.quantity || 0 }}
                </td>

                <!-- Satuan -->
                <td class="py-3 px-4 text-center text-slate-500 dark:text-slate-400">
                  {{ item.itemUnit?.name || item.unit?.name || '-' }}
                </td>

                <!-- Harga Satuan -->
                <td class="py-3 px-4 text-right text-slate-600 dark:text-slate-400 tabular-nums">
                  {{ formatCurrency(item.unitPrice) }}
                </td>

                <!-- Diskon -->
                <td class="py-3 px-4 text-center text-slate-500 dark:text-slate-400 font-medium">
                  {{ getDiscountText(item) }}
                </td>

                <!-- Total Harga -->
                <td class="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white tabular-nums">
                  {{ formatCurrency(getLineTotal(item)) }}
                </td>

                <!-- Catatan Item / Stock Micro Badge -->
                <td class="py-3 px-4">
                  <template v-if="(item.detailNotes || '').trim().toUpperCase() === 'STOCK'">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-900/40">
                      STOCK
                    </span>
                  </template>
                  <template v-else-if="(item.detailNotes || '').trim().toUpperCase() === 'NO STOCK'">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60">
                      NO STOCK
                    </span>
                  </template>
                  <template v-else>
                    <span class="text-slate-500 dark:text-slate-400 text-xs">
                      {{ item.detailNotes || '-' }}
                    </span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Empty state when filtered -->
          <div v-if="filteredItems.length === 0 && selectedHsq.detailItem?.length" class="text-center py-10 text-slate-400">
            <p class="text-xs font-semibold text-slate-600 dark:text-slate-400">Produk tidak ditemukan</p>
            <p class="text-[11px] text-slate-400 mt-1">Coba gunakan kata kunci pencarian lain.</p>
          </div>
        </div>

        <!-- Table Financial Summary Footer -->
        <div class="px-5 py-3.5 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-end sm:items-center justify-between gap-4 font-sans text-xs">
          <div class="text-slate-500 font-normal">
            Menampilkan <span class="font-semibold text-slate-900 dark:text-white">{{ filteredItems.length }}</span> dari <span class="font-semibold text-slate-900 dark:text-white">{{ selectedHsq.detailItem?.length || 0 }}</span> item barang
          </div>
          <div class="w-full sm:w-auto space-y-1 text-right min-w-[240px]">
            <div v-if="selectedHsq.subTotal" class="flex justify-between gap-6 text-slate-500 dark:text-slate-400">
              <span>Subtotal:</span>
              <span class="font-medium text-slate-900 dark:text-white tabular-nums">{{ formatCurrency(selectedHsq.subTotal) }}</span>
            </div>
            <div v-if="selectedHsq.totalDiscount" class="flex justify-between gap-6 text-rose-600 dark:text-rose-400 font-medium">
              <span>Total Diskon:</span>
              <span class="tabular-nums">-{{ formatCurrency(selectedHsq.totalDiscount) }}</span>
            </div>
            <div v-if="selectedHsq.taxAmount" class="flex justify-between gap-6 text-slate-500 dark:text-slate-400">
              <span>PPN / Pajak:</span>
              <span class="font-medium text-slate-900 dark:text-white tabular-nums">{{ formatCurrency(selectedHsq.taxAmount) }}</span>
            </div>
            <div class="flex justify-between gap-6 pt-1.5 border-t border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white">
              <span>Grand Total:</span>
              <span class="text-slate-900 dark:text-white font-bold tabular-nums">{{ formatCurrency(selectedHsq.totalAmount) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- MODAL 1: UPDATE PROGRESS & PROBABILITAS -->
    <div v-if="isUpdateProgressOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div class="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200/80 dark:border-slate-800 shadow-2xl space-y-5 font-sans">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3.5">
          <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp class="w-5 h-5 text-red-600" />
            Update Progress & Probabilitas
          </h3>
          <button @click="isUpdateProgressOpen = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
            <XCircle class="w-5 h-5" />
          </button>
        </div>

        <div class="space-y-4 text-xs">
          <!-- Stage Select -->
          <div class="space-y-1.5">
            <label class="font-bold text-slate-700 dark:text-slate-300">Tahap Penawaran (Stage)</label>
            <select 
              v-model="progressForm.stage"
              @change="onStageChange"
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-bold"
            >
              <option v-for="st in availableStages" :key="st.val" :value="st.val">
                {{ st.label }}
              </option>
            </select>
          </div>

          <!-- Probability Slider / Number -->
          <div class="space-y-1.5">
            <label class="font-bold text-slate-700 dark:text-slate-300">Probabilitas Penutupan Proyek (%)</label>
            <div class="flex items-center gap-4">
              <input 
                type="range" 
                min="0" 
                max="100" 
                step="1"
                v-model.number="progressForm.probability"
                class="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-600"
              />
              <div class="relative w-24">
                <input 
                  type="number"
                  min="0"
                  max="100"
                  v-model.number="progressForm.probability"
                  class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pl-3 pr-6 py-2 rounded-xl outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-black text-emerald-600 dark:text-emerald-400 text-center"
                />
                <span class="absolute right-3 top-1/2 -translate-y-1/2 font-black text-emerald-600 dark:text-emerald-400">%</span>
              </div>
            </div>
          </div>

          <!-- Expected Closing Date -->
          <div class="space-y-1.5">
            <label class="font-bold text-slate-700 dark:text-slate-300">Estimasi Tanggal Closing</label>
            <input 
              type="date"
              v-model="progressForm.expected_closing_date"
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-sans cursor-pointer"
            />
          </div>

          <!-- Progress Notes -->
          <div class="space-y-1.5">
            <label class="font-bold text-slate-700 dark:text-slate-300">Catatan Progress Terbaru</label>
            <textarea 
              v-model="progressForm.notes"
              rows="3"
              placeholder="Tuliskan perkembangan terbaru seputar penawaran ini..."
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-sans"
            ></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button @click="isUpdateProgressOpen = false" variant="outline" class="text-xs h-9 px-4 rounded-xl font-semibold">Batal</Button>
          <Button @click="saveHsqProgress" :disabled="isSavingProgress" class="text-xs h-9 px-4 bg-red-600 hover:bg-red-700 text-white font-bold gap-2 rounded-xl cursor-pointer">
            <Loader2 v-if="isSavingProgress" class="w-4 h-4 animate-spin" /> Simpan Progress
          </Button>
        </div>
      </div>
    </div>

    <!-- MODAL 2: CATAT / EDIT AKTIVITAS SALES -->
    <div v-if="isAddActivityOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div class="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200/80 dark:border-slate-800 shadow-2xl space-y-5 font-sans">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3.5">
          <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity class="w-5 h-5 text-red-600" />
            {{ editingActivityId ? 'Edit Aktivitas Sales' : 'Catat Aktivitas Sales' }}
          </h3>
          <button @click="isAddActivityOpen = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
            <XCircle class="w-5 h-5" />
          </button>
        </div>

        <div class="space-y-4 text-xs">
          <!-- Activity Type -->
          <div class="space-y-1.5">
            <label class="font-bold text-slate-700 dark:text-slate-300">Jenis Aktivitas</label>
            <select 
              v-model="activityForm.activity_type"
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-bold"
            >
              <option v-for="act in activityTypes" :key="act.val" :value="act.val">
                {{ act.label }}
              </option>
            </select>
          </div>

          <!-- Notes -->
          <div class="space-y-1.5">
            <label class="font-bold text-slate-700 dark:text-slate-300">Catatan Aktivitas / Hasil Follow Up</label>
            <textarea 
              v-model="activityForm.notes"
              rows="4"
              placeholder="Contoh: Menghubungi Pak Budi via WhatsApp, meminta pertimbangan diskon 5% tambahan..."
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-sans"
            ></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button @click="isAddActivityOpen = false" variant="outline" class="text-xs h-9 px-4 rounded-xl font-semibold">Batal</Button>
          <Button @click="saveActivityLog" :disabled="isSavingActivity" class="text-xs h-9 px-4 bg-red-600 hover:bg-red-700 text-white font-bold gap-2 rounded-xl cursor-pointer">
            <Loader2 v-if="isSavingActivity" class="w-4 h-4 animate-spin" /> {{ editingActivityId ? 'Simpan Perubahan' : 'Simpan Aktivitas' }}
          </Button>
        </div>
      </div>
    </div>

    <!-- MODAL 3: TAMBAH / EDIT TASK CLIENT -->
    <div v-if="isAddTaskOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div class="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200/80 dark:border-slate-800 shadow-2xl space-y-5 font-sans">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3.5">
          <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ListTodo class="w-5 h-5 text-red-600" />
            {{ editingTaskId ? 'Edit Task / Action Item' : 'Tambah Task / Action Item' }}
          </h3>
          <button @click="isAddTaskOpen = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
            <XCircle class="w-5 h-5" />
          </button>
        </div>

        <div class="space-y-4 text-xs">
          <!-- Task Title -->
          <div class="space-y-1.5">
            <label class="font-bold text-slate-700 dark:text-slate-300">Deskripsi Task</label>
            <input 
              v-model="taskForm.task_title"
              type="text"
              placeholder="Contoh: Kirim penawaran harga revisi item Siemens S7-1200..."
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-sans"
            />
          </div>

          <!-- Due Date & Penanggung Jawab Multi-select -->
          <div class="space-y-4">
            <!-- Due Date -->
            <div class="space-y-1.5">
              <label class="font-bold text-slate-700 dark:text-slate-300">Jatuh Tempo (Target Selesai)</label>
              <input 
                type="date"
                v-model="taskForm.due_date"
                class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-sans cursor-pointer"
              />
            </div>

            <!-- Penanggung Jawab User Grid Cards -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="font-bold text-slate-700 dark:text-slate-300">Penanggung Jawab Tim HSO</label>
                <span class="text-[11px] font-medium text-slate-400">Klik untuk memilih (bisa 1+)</span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                <div
                  v-for="user in userList"
                  :key="user.email"
                  @click="togglePicSelection(user.email)"
                  class="p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 font-sans select-none"
                  :class="selectedPics.includes(user.email)
                    ? 'bg-red-50/70 dark:bg-red-950/30 border-red-300 dark:border-red-800 shadow-2xs'
                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/60 hover:bg-white dark:hover:bg-slate-800'"
                >
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div 
                      class="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors"
                      :class="selectedPics.includes(user.email)
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'"
                    >
                      {{ getUserInitials(user.email) }}
                    </div>

                    <div class="min-w-0">
                      <p class="text-xs font-bold text-slate-900 dark:text-white truncate leading-snug">
                        {{ formatUserName(user.email) }}
                      </p>
                      <p class="text-[10px] text-slate-400 truncate leading-none mt-0.5">
                        {{ user.email }}
                      </p>
                    </div>
                  </div>

                  <div 
                    class="w-4 h-4 rounded-md flex items-center justify-center shrink-0 transition-colors"
                    :class="selectedPics.includes(user.email) ? 'bg-red-600 text-white' : 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'"
                  >
                    <Check v-if="selectedPics.includes(user.email)" class="w-3 h-3 stroke-[3]" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Selected PIC Chips -->
          <div v-if="selectedPics.length > 0" class="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 flex-wrap pt-1">
            <span class="font-bold text-slate-700 dark:text-slate-300">Penanggung Jawab Terpilih:</span>
            <span v-for="pic in selectedPics" :key="pic" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 text-[11px] font-bold">
              {{ formatUserName(pic) }}
              <button @click.stop="togglePicSelection(pic)" type="button" class="hover:text-red-900 dark:hover:text-white font-bold ml-0.5 cursor-pointer">×</button>
            </span>
          </div>

          <!-- Email Notif Checkbox -->
          <div class="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <input 
              id="sendEmailCheck"
              type="checkbox"
              v-model="taskForm.send_email_notif"
              class="w-4 h-4 rounded accent-red-600 cursor-pointer shrink-0"
            />
            <label for="sendEmailCheck" class="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
              Kirim Notifikasi Email ke Penanggung Jawab ({{ selectedPics.length }} orang)
            </label>
          </div>
        </div>

        <div class="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button @click="isAddTaskOpen = false" variant="outline" class="text-xs h-9 px-4 rounded-xl font-semibold">Batal</Button>
          <Button @click="saveTask" :disabled="isSavingTask" class="text-xs h-9 px-4 bg-red-600 hover:bg-red-700 text-white font-bold gap-2 rounded-xl cursor-pointer">
            <Loader2 v-if="isSavingTask" class="w-4 h-4 animate-spin" /> {{ editingTaskId ? 'Simpan Perubahan' : 'Simpan Task' }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
