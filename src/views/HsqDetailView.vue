<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { 
  Loader2, AlertCircle, FileText, ArrowLeft, Calendar, 
  FileSpreadsheet, Download, ChevronRight, User, DollarSign, Tag, Search,
  TrendingUp, Plus, Clock, CheckSquare, ListTodo, MessageSquare, PhoneCall,
  Users, Edit, CheckCircle2, XCircle, Send, Activity
} from 'lucide-vue-next'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'

const route = useRoute()
const router = useRouter()
const hsqId = route.params.id

const isLoading = ref(true)
const selectedHsq = ref(null)
const fetchError = ref(null)
const itemSearchQuery = ref('')

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
const taskForm = ref({
  task_title: '',
  due_date: '',
  assigned_to: ''
})

const availableStages = [
  { val: 'Prospecting', label: 'Prospecting (Penjajakan)', defaultProb: 10 },
  { val: 'Pitching / Presentasi', label: 'Pitching / Presentasi', defaultProb: 25 },
  { val: 'Penawaran Dikirim', label: 'Penawaran Dikirim', defaultProb: 50 },
  { val: 'Negosiasi', label: 'Negosiasi', defaultProb: 75 },
  { val: 'Won (Disetujui)', label: 'Won (Disetujui & Deal)', defaultProb: 100 },
  { val: 'Lost (Batal)', label: 'Lost (Batal / Gagal)', defaultProb: 0 }
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
      if (!taskForm.value.assigned_to && data[0]?.email) {
        taskForm.value.assigned_to = data[0].email
      }
    }
  } catch (err) {
    console.error('Error fetching users:', err)
  }
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
        stage: pData.stage || 'Prospecting',
        probability: pData.probability !== undefined ? pData.probability : 10,
        expected_closing_date: pData.expected_closing_date || '',
        notes: pData.notes || ''
      }
    } else {
      const localP = getLocalData(`hsq_progress_${num}`)
      if (localP && localP.stage) {
        hsqProgress.value = localP
        progressForm.value = {
          stage: localP.stage || 'Prospecting',
          probability: localP.probability !== undefined ? localP.probability : 10,
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
    stage: hsqProgress.value?.stage || 'Prospecting',
    probability: hsqProgress.value?.probability !== undefined && hsqProgress.value?.probability !== null ? hsqProgress.value.probability : 10,
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

    activityForm.value = { activity_type: 'Follow Up', notes: '' }
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
    alert('Judul tugas tidak boleh kosong!')
    return
  }

  isSavingTask.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email || 'Sales User'
    const pic = taskForm.value.assigned_to || userList.value[0]?.email || userEmail

    const payload = {
      id: Date.now(),
      hsq_number: String(num),
      client_name: selectedHsq.value?.customer?.name || null,
      task_title: taskForm.value.task_title.trim(),
      due_date: taskForm.value.due_date || null,
      assigned_to: pic,
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
        assigned_to: pic,
        status: 'Pending',
        created_by: userEmail
      })
    } catch (dbErr) {
      console.warn('Supabase DB error, using local fallback:', dbErr)
    }

    const currTasks = getLocalData(`hsq_tasks_${num}`) || taskList.value || []
    currTasks.push(payload)
    setLocalData(`hsq_tasks_${num}`, currTasks)
    taskList.value = currTasks

    taskForm.value = { task_title: '', due_date: '', assigned_to: userList.value[0]?.email || '' }
    isAddTaskOpen.value = false
  } catch (err) {
    console.error('Error saving task:', err)
  } finally {
    isSavingTask.value = false
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
  const parts = dateStr.split('/')
  return new Date(parts[2], parts[1] - 1, parts[0])
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  try {
    const d = parseAccurateDate(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
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
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/60'
  }
  if (name.includes('disetujui')) {
    return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/60'
  }
  if (name.includes('draft') || name.includes('draf')) {
    return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700'
  }
  if (name.includes('diajukan')) {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/60'
  }
  return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/60'
}

const goBack = () => {
  router.push('/hsq')
}

onMounted(() => {
  fetchHsqDetail()
})
</script>

<template>
  <div class="space-y-6 font-mono text-slate-800 dark:text-slate-100 p-1 md:p-3">
    <!-- Breadcrumb & Back -->
    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
        <span>Sales Quotation</span>
        <ChevronRight class="w-3 h-3 text-slate-400" />
        <span class="cursor-pointer hover:text-red-600 dark:hover:text-red-400 transition-colors" @click="goBack">Quotation (HSQ)</span>
        <ChevronRight class="w-3 h-3 text-slate-400" />
        <span class="text-slate-800 dark:text-slate-200 font-black">Detail HSQ</span>
      </div>
      
      <button 
        @click="goBack"
        class="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors bg-white dark:bg-[#1e293b] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm w-fit"
      >
        <ArrowLeft class="w-4 h-4" /> Kembali ke Daftar
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-32 bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800">
      <Loader2 class="w-10 h-10 animate-spin text-red-600 mb-3" />
      <p class="text-xs font-bold text-slate-500 dark:text-slate-400 animate-pulse tracking-widest uppercase">Mengambil detail HSQ dari Accurate...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="fetchError" class="p-6 text-center bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/30">
      <AlertCircle class="w-10 h-10 mx-auto mb-3" />
      <h3 class="text-sm font-bold">Gagal Mengambil Detail</h3>
      <p class="text-xs mt-1.5 font-sans">{{ fetchError }}</p>
      <Button @click="fetchHsqDetail" variant="outline" class="mt-4 border-red-200 hover:bg-red-50 hover:text-red-700 text-xs">Coba Lagi</Button>
    </div>

    <template v-else-if="selectedHsq">
      <!-- Title & Main Actions Card -->
      <div class="bg-white dark:bg-[#1e293b] p-5 md:p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="bg-red-50 dark:bg-red-950/20 p-2.5 rounded-xl border border-red-100 dark:border-red-950/60">
            <FileText class="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h2 class="text-lg md:text-xl font-black text-slate-900 dark:text-white font-mono flex items-center gap-2">
              {{ selectedHsq.number }}
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Dibuat tanggal <span class="font-bold text-slate-800 dark:text-slate-300">{{ formatDate(selectedHsq.transDate) }}</span>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3 flex-wrap">
          <span class="inline-flex px-3 py-1 rounded-full text-xs font-bold border" :class="getStatusClass(selectedHsq.statusName)">
            {{ selectedHsq.statusName || 'Outstanding' }}
          </span>
          
          <Button 
            @click="exportToExcel"
            class="h-9.5 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 shadow-sm rounded-lg"
          >
            <FileSpreadsheet class="w-4 h-4" /> Download Excel
          </Button>
        </div>
      </div>

      <!-- Sales Pipeline & Progress Card -->
      <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-5 md:p-6 rounded-2xl border border-slate-700/60 shadow-md space-y-4">
        <!-- Filled State -->
        <template v-if="hsqProgress && hsqProgress.stage">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700/60 pb-4">
            <div class="flex items-center gap-3">
              <div class="p-2.5 rounded-xl bg-red-600/20 border border-red-500/30 text-red-400">
                <TrendingUp class="w-6 h-6" />
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Tahap Penawaran (Pipeline)</span>
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-red-600/30 text-red-300 border border-red-500/40">
                    {{ hsqProgress.stage }}
                  </span>
                </div>
                <h3 class="text-sm font-semibold text-slate-200 mt-1">
                  Estimasi Closing: <span class="font-bold text-white">{{ hsqProgress.expected_closing_date ? formatDate(hsqProgress.expected_closing_date) : 'Belum ditentukan' }}</span>
                </h3>
              </div>
            </div>

            <div class="flex items-center gap-4">
              <!-- Probability Badge & Bar -->
              <div class="text-right">
                <div class="text-xs text-slate-400 font-bold uppercase">Probabilitas Win</div>
                <div class="text-2xl font-black text-emerald-400">{{ hsqProgress.probability !== undefined ? hsqProgress.probability : 0 }}%</div>
              </div>
              
              <Button 
                @click="openUpdateProgressModal"
                class="h-9 px-4 text-xs font-bold bg-red-600 hover:bg-red-700 text-white gap-2 shadow-sm rounded-xl"
              >
                <Edit class="w-3.5 h-3.5" /> Update Progress
              </Button>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="space-y-1.5">
            <div class="flex justify-between text-[11px] text-slate-400 font-medium">
              <span>Probabilitas Penutupan Proyek</span>
              <span>{{ hsqProgress.probability !== undefined ? hsqProgress.probability : 0 }}% / 100%</span>
            </div>
            <div class="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
              <div 
                class="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-amber-500 via-blue-500 to-emerald-500" 
                :style="`width: ${Math.min(100, Math.max(5, hsqProgress.probability || 0))}%`"
              ></div>
            </div>
          </div>

          <!-- Latest Notes -->
          <div v-if="hsqProgress.notes" class="text-xs text-slate-300 bg-slate-800/60 p-3 rounded-xl border border-slate-700/40 flex items-start gap-2">
            <MessageSquare class="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span class="font-bold text-slate-200">Catatan Progress:</span> {{ hsqProgress.notes }}
              <span v-if="hsqProgress.updated_by" class="text-[10px] text-slate-400 block mt-0.5">Oleh: {{ hsqProgress.updated_by }}</span>
            </div>
          </div>
        </template>

        <!-- Unfilled State -->
        <template v-else>
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-400">
                <TrendingUp class="w-6 h-6" />
              </div>
              <div>
                <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Tahap Penawaran (Pipeline)</span>
                <h3 class="text-sm font-bold text-slate-300 mt-0.5">Progress & Probabilitas Win Belum Diisi</h3>
                <p class="text-xs text-slate-400 mt-0.5">Klik tombol di kanan untuk meng-update progress penawaran ini.</p>
              </div>
            </div>
            <Button 
              @click="openUpdateProgressModal"
              class="h-9 px-4 text-xs font-bold bg-red-600 hover:bg-red-700 text-white gap-2 shadow-sm rounded-xl shrink-0"
            >
              <Plus class="w-3.5 h-3.5" /> Isi Progress & Win %
            </Button>
          </div>
        </template>
      </div>

      <!-- Sales Activity Logs & Client Tasking Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <!-- Left: Sales Activity Logs -->
        <div class="bg-white dark:bg-[#1e293b] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div class="flex items-center gap-2">
              <Activity class="w-5 h-5 text-red-600" />
              <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Aktivitas Sales</h3>
              <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                {{ activityLogs.length }}
              </span>
            </div>
            <Button 
              @click="isAddActivityOpen = true" 
              variant="outline" 
              class="h-8 px-3 text-xs gap-1.5 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold"
            >
              <Plus class="w-3.5 h-3.5 text-red-600" /> Catat Aktivitas
            </Button>
          </div>

          <!-- Timeline List -->
          <div v-if="activityLogs.length > 0" class="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            <div 
              v-for="log in activityLogs" 
              :key="log.id"
              class="p-3.5 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0f172a]/40 space-y-2 relative"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-100 dark:border-red-900/50">
                  {{ log.activity_type }}
                </span>
                <span class="text-[10px] text-slate-400 flex items-center gap-1 font-sans">
                  <Clock class="w-3 h-3 text-slate-400" />
                  {{ formatDate(log.created_at) }}
                </span>
              </div>
              <p class="text-xs text-slate-800 dark:text-slate-200 font-sans leading-relaxed">
                {{ log.notes }}
              </p>
              <div v-if="log.created_by" class="text-[10px] text-slate-400 font-mono">
                Oleh: {{ log.created_by }}
              </div>
            </div>
          </div>

          <div v-else class="py-12 text-center text-slate-400 space-y-2 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <MessageSquare class="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
            <p class="text-xs font-bold text-slate-500">Belum ada catatan aktivitas sales</p>
            <p class="text-[10px] text-slate-400">Klik "Catat Aktivitas" untuk merekam hasil follow up.</p>
          </div>
        </div>

        <!-- Right: Client Tasking Checklist -->
        <div class="bg-white dark:bg-[#1e293b] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div class="flex items-center gap-2">
              <ListTodo class="w-5 h-5 text-red-600" />
              <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Tugas Client & Action Items</h3>
              <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                {{ taskList.length }}
              </span>
            </div>
            <Button 
              @click="isAddTaskOpen = true" 
              variant="outline" 
              class="h-8 px-3 text-xs gap-1.5 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold"
            >
              <Plus class="w-3.5 h-3.5 text-red-600" /> Tambah Task
            </Button>
          </div>

          <!-- Tasks List -->
          <div v-if="taskList.length > 0" class="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            <div 
              v-for="task in taskList" 
              :key="task.id"
              class="p-3.5 rounded-xl border transition-all flex items-start gap-3"
              :class="task.status === 'Completed' 
                ? 'bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/40 opacity-75' 
                : 'bg-slate-50/50 dark:bg-[#0f172a]/40 border-slate-200 dark:border-slate-800'"
            >
              <!-- Checkbox -->
              <input 
                type="checkbox" 
                :checked="task.status === 'Completed'" 
                @change="toggleTaskStatus(task)"
                class="mt-1 w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer"
              />

              <div class="flex-1 space-y-1">
                <div class="flex items-center justify-between gap-2">
                  <h4 
                    class="text-xs font-bold leading-normal text-slate-900 dark:text-white font-sans"
                    :class="{ 'line-through text-slate-400 dark:text-slate-500': task.status === 'Completed' }"
                  >
                    {{ task.task_title }}
                  </h4>
                  <span 
                    class="px-2 py-0.5 rounded text-[9px] font-black uppercase"
                    :class="task.status === 'Completed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'"
                  >
                    {{ task.status }}
                  </span>
                </div>

                <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
                  <span v-if="task.due_date" class="flex items-center gap-1 font-bold text-red-600 dark:text-red-400">
                    <Calendar class="w-3 h-3" /> Due: {{ formatDate(task.due_date) }}
                  </span>
                  <span v-if="task.assigned_to" class="flex items-center gap-1 font-mono">
                    <User class="w-3 h-3" /> PIC: {{ task.assigned_to }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="py-12 text-center text-slate-400 space-y-2 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <CheckSquare class="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
            <p class="text-xs font-bold text-slate-500">Belum ada tugas untuk client ini</p>
            <p class="text-[10px] text-slate-400">Klik "Tambah Task" untuk membuat daftar pekerjaan.</p>
          </div>
        </div>

      </div>

      <!-- Metadata Panel -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- Customer Info -->
        <div class="bg-white dark:bg-[#1e293b] p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div class="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <User class="w-4 h-4" /> Customer
          </div>
          <div class="text-sm font-black text-slate-950 dark:text-white">
            {{ selectedHsq.customer?.name || '-' }}
          </div>
          <div class="text-[10px] text-slate-400">
            Kode: {{ selectedHsq.customer?.customerNo || '-' }}
          </div>
        </div>

        <!-- Total Value -->
        <div class="bg-white dark:bg-[#1e293b] p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div class="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <DollarSign class="w-4 h-4" /> Total Amount
          </div>
          <div class="text-lg font-black text-emerald-600 dark:text-emerald-400">
            {{ formatCurrency(selectedHsq.totalAmount) }}
          </div>
        </div>

        <!-- Extra details/status -->
        <div class="bg-white dark:bg-[#1e293b] p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div class="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <Tag class="w-4 h-4" /> Informasi Lain
          </div>
          <div class="text-xs text-slate-600 dark:text-slate-400">
            Syarat Pembayaran: <span class="font-bold text-slate-900 dark:text-white">{{ selectedHsq.paymentTerm?.name || '-' }}</span>
          </div>
          <div class="text-xs text-slate-600 dark:text-slate-400">
            Mata Uang: <span class="font-bold text-slate-900 dark:text-white">{{ selectedHsq.currency?.code || 'IDR' }}</span>
          </div>
        </div>
      </div>

      <!-- Description / Notes -->
      <div class="bg-white dark:bg-[#1e293b] p-5 md:p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h3 class="text-xs font-black uppercase text-slate-400 tracking-wider">Keterangan Dokumen</h3>
        <p class="text-sm leading-relaxed text-slate-700 dark:text-slate-300 font-sans border-l-4 border-slate-300 dark:border-slate-700 pl-4 py-1.5 italic bg-slate-50 dark:bg-[#0f172a]/30 pr-4 rounded-r">
          {{ selectedHsq.description || 'Tidak ada keterangan tambahan.' }}
        </p>
      </div>

      <!-- Items Section -->
      <div class="bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div class="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-[#0f172a] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <h3 class="text-xs font-black uppercase text-slate-500 tracking-wider">Daftar Barang Penawaran</h3>
            <span class="text-xs font-bold text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 rounded-full">
              {{ filteredItems.length }} dari {{ selectedHsq.detailItem?.length || 0 }} Items
            </span>
          </div>
          <!-- Search Input -->
          <div class="relative w-full sm:w-56">
            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              v-model="itemSearchQuery"
              type="text"
              placeholder="Cari kode / nama barang..."
              class="pl-8 pr-3 py-1.5 w-full text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
        </div>
        
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50/50 dark:bg-[#0f172a]/20 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-12 text-center">No</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-44">Kode Barang</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider">Nama Barang</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-20 text-right">Quantity</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-20 text-center">Satuan</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-32 text-right">Harga Satuan</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-24 text-center">Discount</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-32 text-right">Total Harga</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-40">Catatan Item</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              <tr
                v-for="(item, idx) in filteredItems"
                :key="idx"
                :id="`hsq-item-${item.item?.no}`"
                class="hover:bg-slate-50/40 dark:hover:bg-[#0f172a]/20 transition-colors"
                :class="{ 'bg-yellow-100 dark:bg-yellow-900/30': route.query.highlight === item.item?.no }"
              >
                <td class="py-3.5 px-4 text-center text-slate-400 font-bold">{{ idx + 1 }}</td>
                <td class="py-3.5 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">{{ item.item?.no || '-' }}</td>
                <td class="py-3.5 px-4 font-medium text-slate-900 dark:text-white leading-normal">{{ item.item?.name || item.detailName || '-' }}</td>
                <td class="py-3.5 px-4 text-right font-black text-slate-900 dark:text-white text-sm">{{ item.quantity || 0 }}</td>
                <td class="py-3.5 px-4 text-center font-bold text-slate-600 dark:text-slate-400">{{ item.itemUnit?.name || item.unit?.name || '-' }}</td>
                <td class="py-3.5 px-4 text-right font-semibold text-slate-700 dark:text-slate-300">{{ formatCurrency(item.unitPrice) }}</td>
                <td class="py-3.5 px-4 text-center font-bold text-slate-600 dark:text-slate-400">{{ getDiscountText(item) }}</td>
                <td class="py-3.5 px-4 text-right font-black text-slate-900 dark:text-white">{{ formatCurrency(getLineTotal(item)) }}</td>
                <td class="py-3.5 px-4 font-sans text-slate-500 dark:text-slate-400">{{ item.detailNotes || '-' }}</td>
              </tr>
            </tbody>
          </table>
          <!-- Empty state when filtered -->
          <div v-if="filteredItems.length === 0 && selectedHsq.detailItem?.length" class="text-center py-8 text-slate-400">
            <p class="text-xs font-bold">Produk tidak ditemukan</p>
            <p class="text-[10px] mt-1">Coba gunakan kata kunci pencarian lain.</p>
          </div>
        </div>
      </div>
    </template>

    <!-- MODAL 1: UPDATE PROGRESS & PROBABILITAS -->
    <div v-if="isUpdateProgressOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div class="bg-white dark:bg-[#1e293b] rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 class="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp class="w-5 h-5 text-red-600" />
            Update Progress & Probabilitas
          </h3>
          <button @click="isUpdateProgressOpen = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
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
              class="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl outline-none focus:ring-2 focus:ring-red-500 font-bold"
            >
              <option v-for="st in availableStages" :key="st.val" :value="st.val">
                {{ st.label }}
              </option>
            </select>
          </div>

          <!-- Probability Slider / Number -->
          <div class="space-y-1.5">
            <div class="flex justify-between items-center">
              <label class="font-bold text-slate-700 dark:text-slate-300">Probabilitas Penutupan Proyek (%)</label>
              <span class="text-sm font-black text-emerald-600 dark:text-emerald-400">{{ progressForm.probability }}%</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="100" 
              step="5"
              v-model.number="progressForm.probability"
              class="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-600"
            />
          </div>

          <!-- Expected Closing Date -->
          <div class="space-y-1.5">
            <label class="font-bold text-slate-700 dark:text-slate-300">Estimasi Tanggal Closing</label>
            <input 
              type="date"
              v-model="progressForm.expected_closing_date"
              class="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl outline-none focus:ring-2 focus:ring-red-500 font-mono"
            />
          </div>

          <!-- Progress Notes -->
          <div class="space-y-1.5">
            <label class="font-bold text-slate-700 dark:text-slate-300">Catatan Progress Terbaru</label>
            <textarea 
              v-model="progressForm.notes"
              rows="3"
              placeholder="Tuliskan perkembangan terbaru seputar penawaran ini..."
              class="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 p-3 rounded-xl outline-none focus:ring-2 focus:ring-red-500 font-sans"
            ></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button @click="isUpdateProgressOpen = false" variant="outline" class="text-xs h-9 px-4">Batal</Button>
          <Button @click="saveHsqProgress" :disabled="isSavingProgress" class="text-xs h-9 px-4 bg-red-600 hover:bg-red-700 text-white font-bold gap-2">
            <Loader2 v-if="isSavingProgress" class="w-4 h-4 animate-spin" /> Simpan Progress
          </Button>
        </div>
      </div>
    </div>

    <!-- MODAL 2: CATAT AKTIVITAS SALES -->
    <div v-if="isAddActivityOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div class="bg-white dark:bg-[#1e293b] rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 class="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Activity class="w-5 h-5 text-red-600" />
            Catat Aktivitas Sales
          </h3>
          <button @click="isAddActivityOpen = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <XCircle class="w-5 h-5" />
          </button>
        </div>

        <div class="space-y-4 text-xs">
          <!-- Activity Type -->
          <div class="space-y-1.5">
            <label class="font-bold text-slate-700 dark:text-slate-300">Jenis Aktivitas</label>
            <select 
              v-model="activityForm.activity_type"
              class="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl outline-none focus:ring-2 focus:ring-red-500 font-bold"
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
              class="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 p-3 rounded-xl outline-none focus:ring-2 focus:ring-red-500 font-sans"
            ></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button @click="isAddActivityOpen = false" variant="outline" class="text-xs h-9 px-4">Batal</Button>
          <Button @click="saveActivityLog" :disabled="isSavingActivity" class="text-xs h-9 px-4 bg-red-600 hover:bg-red-700 text-white font-bold gap-2">
            <Loader2 v-if="isSavingActivity" class="w-4 h-4 animate-spin" /> Simpan Aktivitas
          </Button>
        </div>
      </div>
    </div>

    <!-- MODAL 3: TAMBAH TUGAS CLIENT -->
    <div v-if="isAddTaskOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div class="bg-white dark:bg-[#1e293b] rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 class="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ListTodo class="w-5 h-5 text-red-600" />
            Tambah Tugas / Action Item
          </h3>
          <button @click="isAddTaskOpen = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <XCircle class="w-5 h-5" />
          </button>
        </div>

        <div class="space-y-4 text-xs">
          <!-- Task Title -->
          <div class="space-y-1.5">
            <label class="font-bold text-slate-700 dark:text-slate-300">Deskripsi Tugas</label>
            <input 
              v-model="taskForm.task_title"
              type="text"
              placeholder="Contoh: Kirim penawaran harga revisi item Siemens S7-1200..."
              class="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl outline-none focus:ring-2 focus:ring-red-500 font-sans"
            />
          </div>

          <!-- Due Date & Assigned To -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="font-bold text-slate-700 dark:text-slate-300">Jatuh Tempo (Due Date)</label>
              <input 
                type="date"
                v-model="taskForm.due_date"
                class="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl outline-none focus:ring-2 focus:ring-red-500 font-mono"
              />
            </div>
            <div class="space-y-1.5">
              <label class="font-bold text-slate-700 dark:text-slate-300">Penanggung Jawab (PIC HSO)</label>
              <select 
                v-model="taskForm.assigned_to"
                class="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl outline-none focus:ring-2 focus:ring-red-500 font-mono font-bold"
              >
                <option v-for="user in userList" :key="user.email" :value="user.email">
                  {{ user.email }} {{ user.role ? `(${user.role})` : '' }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button @click="isAddTaskOpen = false" variant="outline" class="text-xs h-9 px-4">Batal</Button>
          <Button @click="saveTask" :disabled="isSavingTask" class="text-xs h-9 px-4 bg-red-600 hover:bg-red-700 text-white font-bold gap-2">
            <Loader2 v-if="isSavingTask" class="w-4 h-4 animate-spin" /> Simpan Tugas
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
