<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
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
  X,
  Search,
  Plus,
  Zap,
  Timer,
  Link,
  Repeat,
  CheckSquare
} from 'lucide-vue-next'
import RichTextEditor from '@/components/RichTextEditor.vue'

const route = useRoute()
const router = useRouter()

const taskId = route.params.id
const task = ref(null)
const isLoading = ref(true)
const isError = ref(false)
const currentUserEmail = ref('')
const isCopied = ref(false)

// Edit Modal State (Full Parity with Create Form)
const isEditModalOpen = ref(false)
const isSavingEdit = ref(false)
const users = ref([])
const accurateCustomers = ref([])

// Customer Search Combobox State
const customerComboboxRef = ref(null)
const isCustomerDropdownOpen = ref(false)
const customerSearchQuery = ref('')

const fileInput = ref(null)
const attachmentMode = ref('file')
const newLinkUrl = ref('')
const newLinkTitle = ref('')
const isUploadingAttachment = ref(false)
const isDraggingOver = ref(false)
const modalNewSubtask = ref('')

const editForm = ref({
  title: '',
  has_project_ref: false,
  project_name: '',
  customer_name: '',
  pic_name: '',
  description: '',
  assignees: [],
  subtasks: [],
  target_date: '',
  file_link: '',
  attachments: [],
  is_recurring: false,
  recurrence_type: 'MONTHLY',
  recurrence_day: 1,
  recurrence_weekday: 1
})
const hasProjectRef = computed(() => editForm.value.has_project_ref)

// --- Inline Description State & Handlers ---
const isEditingInlineDescription = ref(false)
const inlineDescriptionHtml = ref('')
const isSavingInlineDescription = ref(false)

const startEditInlineDescription = () => {
  inlineDescriptionHtml.value = task.value?.description || ''
  isEditingInlineDescription.value = true
}

const cancelEditInlineDescription = () => {
  isEditingInlineDescription.value = false
  inlineDescriptionHtml.value = ''
}

const saveInlineDescription = async () => {
  if (!task.value) return
  isSavingInlineDescription.value = true
  try {
    const newDesc = inlineDescriptionHtml.value.trim()
    
    // Optimistic local UI update
    task.value.description = newDesc
    
    const { error } = await supabase
      .from('boq_requests')
      .update({ description: newDesc })
      .eq('id', taskId)

    if (error) {
      console.warn('Inline description update notice:', error.message)
    }
    isEditingInlineDescription.value = false
  } catch (err) {
    console.error('Error saving inline description:', err)
    alert('Gagal menyimpan deskripsi.')
  } finally {
    isSavingInlineDescription.value = false
  }
}

// --- Inline Attachment State & Handlers ---
const isAddingInlineAttachment = ref(false)
const inlineAttachmentMode = ref('file') // 'file' | 'link'
const inlineLinkUrl = ref('')
const inlineFileInput = ref(null)
const isUploadingInlineAttachment = ref(false)

const startAddInlineAttachment = () => {
  isAddingInlineAttachment.value = true
  inlineAttachmentMode.value = 'file'
  inlineLinkUrl.value = ''
}

const cancelInlineAttachment = () => {
  isAddingInlineAttachment.value = false
  inlineLinkUrl.value = ''
}

const saveInlineAttachmentsToDb = async (newAttachments) => {
  if (!task.value) return
  const existingMeta = parseMeta(task.value.metadata) || {}
  const updatedMeta = { ...existingMeta, attachments: newAttachments }
  
  // Optimistic UI update
  task.value.metadata = updatedMeta
  try { localStorage.setItem(`boq_meta_${taskId}`, JSON.stringify(updatedMeta)) } catch {}

  const firstAtt = newAttachments.length > 0 ? newAttachments[0] : null
  const fileUrl = firstAtt ? firstAtt.url : null
  const fileName = firstAtt ? firstAtt.name : null
  const fileLink = firstAtt && firstAtt.type === 'link' ? firstAtt.url : null

  await supabase.from('boq_requests').update({
    file_url: fileUrl,
    file_name: fileName,
    file_link: fileLink || null,
    metadata: updatedMeta
  }).eq('id', taskId)
}

const removeInlineAttachment = async (index) => {
  if (!confirm('Apakah Anda yakin ingin menghapus lampiran ini?')) return
  const currentAtts = [...taskAttachments.value]
  currentAtts.splice(index, 1)
  await saveInlineAttachmentsToDb(currentAtts)
}

const saveInlineLinkAttachment = async () => {
  if (!inlineLinkUrl.value.trim()) { alert('URL link wajib diisi!'); return }
  let url = inlineLinkUrl.value.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }
  let title = ''
  try { title = new URL(url).hostname } catch { title = url }

  const currentAtts = [...taskAttachments.value]
  currentAtts.push({
    id: Date.now().toString() + Math.random().toString(36).substring(7),
    name: title,
    url: url,
    type: 'link'
  })

  await saveInlineAttachmentsToDb(currentAtts)
  inlineLinkUrl.value = ''
  isAddingInlineAttachment.value = false
}

const handleInlineFileUpload = async (event) => {
  const files = Array.from(event.dataTransfer?.files || event.target?.files || [])
  if (files.length === 0) return

  isUploadingInlineAttachment.value = true
  const currentAtts = [...taskAttachments.value]

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
        currentAtts.push({
          id: Date.now().toString() + Math.random().toString(36).substring(7),
          name: fileName,
          url: fileUrl,
          type: 'file'
        })
      }
    } catch (err) {
      console.error('Error uploading inline file attachment:', err)
    }
  }

  await saveInlineAttachmentsToDb(currentAtts)
  isUploadingInlineAttachment.value = false
  isAddingInlineAttachment.value = false
  if (inlineFileInput.value) inlineFileInput.value.value = ''
}

const toggleAssignee = (email) => {
  if (!email) return
  const idx = editForm.value.assignees.indexOf(email)
  if (idx > -1) {
    editForm.value.assignees.splice(idx, 1)
  } else {
    editForm.value.assignees.push(email)
  }
}

const addModalSubtask = () => {
  if (!modalNewSubtask.value.trim()) return
  editForm.value.subtasks.push({
    id: Date.now().toString() + Math.random().toString(36).substring(7),
    title: modalNewSubtask.value.trim(),
    completed: false
  })
  modalNewSubtask.value = ''
}

const removeModalSubtask = (index) => {
  editForm.value.subtasks.splice(index, 1)
}

const setQuickDate = (daysToAdd) => {
  const target = new Date()
  target.setDate(target.getDate() + daysToAdd)
  editForm.value.target_date = target.toISOString().split('T')[0]
}

const getUserDisplayName = (email) => {
  if (!email) return ''
  const trimmed = email.trim()
  let notifEmail = ''
  let fullName = ''

  if (users.value && Array.isArray(users.value)) {
    const userObj = users.value.find(u => u.email?.toLowerCase() === trimmed.toLowerCase())
    if (userObj?.notification_email && userObj.notification_email.includes('@')) {
      notifEmail = userObj.notification_email
    }
  }

  try {
    const raw = localStorage.getItem('hir_team_contacts')
    if (raw) {
      const contacts = JSON.parse(raw)
      const contact = contacts[trimmed.toLowerCase()]
      if (contact) {
        if (contact.full_name && contact.full_name.trim()) fullName = contact.full_name.trim()
        if (!notifEmail && contact.notification_email && contact.notification_email.includes('@')) {
          notifEmail = contact.notification_email
        }
      }
    }
  } catch (e) {}

  if (!notifEmail) notifEmail = trimmed

  if (fullName) {
    return `${fullName} (${notifEmail})`
  }
  const prefix = trimmed.split('@')[0] || trimmed
  const formatted = prefix.split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return `${formatted} (${notifEmail})`
}

const filteredAccurateCustomers = computed(() => {
  const query = customerSearchQuery.value.toLowerCase().trim()
  if (!query) return accurateCustomers.value
  return accurateCustomers.value.filter(c => c.toLowerCase().includes(query))
})

const selectCustomer = (name) => {
  editForm.value.customer_name = name
  customerSearchQuery.value = name
  isCustomerDropdownOpen.value = false
}

const handleClickOutsideCustomer = (event) => {
  if (customerComboboxRef.value && !customerComboboxRef.value.contains(event.target)) {
    isCustomerDropdownOpen.value = false
  }
}

const handleFileChange = (event) => {
  handleFilesUpload(event)
}

const addLinkAttachment = () => {
  if (!newLinkUrl.value.trim()) { alert('URL link wajib diisi!'); return }
  let url = newLinkUrl.value.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }
  let title = ''
  try { title = new URL(url).hostname } catch { title = url }
  editForm.value.attachments.push({
    id: Date.now().toString() + Math.random().toString(36).substring(7),
    name: title,
    url: url,
    type: 'link'
  })
  newLinkUrl.value = ''
}

const removeAttachment = (index) => {
  editForm.value.attachments.splice(index, 1)
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
        editForm.value.attachments.push({
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

const fetchUsers = async () => {
  try {
    const { data } = await supabase.from('user_access').select('id, email, notification_email').order('email')
    users.value = data || []
  } catch (e) {}
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

const openEditModal = () => {
  if (!task.value) return
  const custName = getCustomerName.value !== '-' ? getCustomerName.value : ''
  const meta = parseMeta(task.value.metadata)

  let attachmentsArr = Array.isArray(meta.attachments) ? JSON.parse(JSON.stringify(meta.attachments)) : []
  if (attachmentsArr.length === 0 && (task.value.file_url || task.value.file_link)) {
    attachmentsArr.push({
      id: 'legacy_1',
      name: task.value.file_name || 'Lampiran Dokumen',
      url: task.value.file_link || task.value.file_url,
      type: task.value.file_link ? 'link' : 'file'
    })
  }

  let assigneesArr = Array.isArray(meta.assignees) ? [...meta.assignees] : []
  if (assigneesArr.length === 0 && task.value.assignee) {
    assigneesArr = task.value.assignee.split(',').map(s => s.trim()).filter(Boolean)
  }

  const projName = getProjectName.value !== '-' ? getProjectName.value : ''
  const picName = getPicName.value !== '-' ? getPicName.value : ''

  editForm.value = {
    title: task.value.title || '',
    has_project_ref: meta.has_project_ref !== undefined ? meta.has_project_ref : !!(projName || custName || picName),
    project_name: projName,
    customer_name: custName,
    pic_name: picName,
    description: task.value.description || '',
    assignees: assigneesArr,
    subtasks: Array.isArray(meta.subtasks) ? JSON.parse(JSON.stringify(meta.subtasks)) : [],
    target_date: task.value.target_date || '',
    file_link: '',
    attachments: attachmentsArr,
    is_recurring: meta.is_recurring || false,
    recurrence_type: meta.recurrence_type || 'MONTHLY',
    recurrence_day: meta.recurrence_day || 1,
    recurrence_weekday: meta.recurrence_weekday !== undefined ? meta.recurrence_weekday : 1
  }
  customerSearchQuery.value = custName
  attachmentMode.value = 'file'
  newLinkUrl.value = ''
  modalNewSubtask.value = ''
  if (fileInput.value) fileInput.value.value = ''
  
  fetchUsers()
  fetchAccurateCustomers()
  isEditModalOpen.value = true
}

const closeEditModal = () => {
  isEditModalOpen.value = false
  isCustomerDropdownOpen.value = false
}

const saveEditTask = async () => {
  if (!editForm.value.title) { alert('Subject / Judul permintaan harus diisi!'); return }
  if (editForm.value.assignees.length === 0) { alert('Silakan pilih minimal satu penanggung jawab (Action by)!'); return }
  if (!editForm.value.target_date) { alert('Deadline harus diisi!'); return }
  if (hasProjectRef.value) {
    if (!editForm.value.project_name) { alert('Project / Proyek harus diisi!'); return }
    if (!editForm.value.customer_name) { alert('Customer harus diisi!'); return }
    if (!editForm.value.pic_name) { alert('PIC Customer harus diisi!'); return }
  }

  isSavingEdit.value = true
  try {
    const firstAtt = editForm.value.attachments && editForm.value.attachments.length > 0 ? editForm.value.attachments[0] : null
    const fileUrl = firstAtt ? firstAtt.url : null
    const fileName = firstAtt ? firstAtt.name : null
    const fileLink = firstAtt && firstAtt.type === 'link' ? firstAtt.url : null

    const finalCustomer = hasProjectRef.value ? (customerSearchQuery.value || editForm.value.customer_name || '') : ''
    const finalAssigneeStr = editForm.value.assignees.join(', ')

    const existingMeta = parseMeta(task.value?.metadata) || {}
    const meta = {
      ...existingMeta,
      has_project_ref: hasProjectRef.value,
      project_name: hasProjectRef.value ? (editForm.value.project_name || '') : '',
      customer_name: finalCustomer,
      pic_name: hasProjectRef.value ? (editForm.value.pic_name || '') : '',
      file_link: fileLink || '',
      assignees: editForm.value.assignees || [],
      subtasks: editForm.value.subtasks || [],
      attachments: editForm.value.attachments || [],
      is_recurring: editForm.value.is_recurring || false,
      recurrence_type: editForm.value.is_recurring ? (editForm.value.recurrence_type || 'MONTHLY') : 'NONE',
      recurrence_day: editForm.value.is_recurring ? (Number(editForm.value.recurrence_day) || 1) : 1,
      recurrence_weekday: editForm.value.is_recurring ? (editForm.value.recurrence_weekday !== undefined ? Number(editForm.value.recurrence_weekday) : 1) : 1
    }

    const payload = {
      title: editForm.value.title,
      project_name: hasProjectRef.value ? (editForm.value.project_name || '') : '',
      customer_name: finalCustomer,
      pic_name: hasProjectRef.value ? (editForm.value.pic_name || '') : '',
      description: editForm.value.description || '',
      assignee: finalAssigneeStr,
      target_date: editForm.value.target_date || null,
      file_url: fileUrl,
      file_name: fileName,
      file_link: fileLink || null,
      metadata: meta
    }

    try { localStorage.setItem(`boq_meta_${taskId}`, JSON.stringify(meta)) } catch {}

    const { error: err1 } = await supabase.from('boq_requests').update(payload).eq('id', taskId)
    if (err1) {
      console.warn('Stage 1 update notice (full payload):', err1.message)
      // Stage 2: Direct columns + metadata (without file_link)
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
        console.warn('Stage 2 update notice (without file_link column):', err2.message)
        // Stage 3: Metadata + base columns (without customer_name/project_name/pic_name direct columns)
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
          console.warn('Stage 3 update notice (without metadata column):', err3.message)
          // Stage 4: Base payload only
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

    task.value = {
      ...task.value,
      ...payload
    }

    closeEditModal()
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
  const oldStatus = task.value.status
  if (oldStatus === newStatus) return

  if (!canChangeStatus.value) {
    alert('Anda hanya dapat melihat tugas ini. Hanya penanggung jawab / pembuat yang bisa mengubah status.')
    return
  }
  if (!confirm(`Pindahkan tugas "${task.value.title}" ke ${newStatus === 'IN_PROGRESS' ? 'In Progress' : (newStatus === 'DONE' ? 'Done' : 'To Do')}?`)) return

  task.value.status = newStatus
  try { localStorage.setItem(`boq_status_${taskId}`, newStatus) } catch {}

  const updatePayload = { status: newStatus }
  const now = new Date().toISOString()
  if (newStatus === 'IN_PROGRESS' && !task.value.in_progress_at) {
    updatePayload.in_progress_at = now
    task.value.in_progress_at = now
  } else if (newStatus === 'DONE') {
    if (!task.value.in_progress_at) {
      updatePayload.in_progress_at = task.value.created_at || now
      task.value.in_progress_at = task.value.created_at || now
    }
    if (!task.value.done_at) {
      updatePayload.done_at = now
      task.value.done_at = now
    }
  }

  // Catat riwayat perubahan status di metadata.status_history
  const meta = parseMeta(task.value.metadata)
  const history = Array.isArray(meta.status_history) ? JSON.parse(JSON.stringify(meta.status_history)) : []
  history.push({ from: oldStatus, to: newStatus, changed_by: currentUserEmail.value, changed_at: now })
  meta.status_history = history
  task.value.metadata = meta
  updatePayload.metadata = meta
  try { localStorage.setItem(`boq_meta_${taskId}`, JSON.stringify(meta)) } catch {}

  try {
    const { error } = await supabase
      .from('boq_requests')
      .update(updatePayload)
      .eq('id', taskId)
    
    if (error) {
      console.warn('Update with timestamps notice:', error.message)
      const { error: err2 } = await supabase
        .from('boq_requests')
        .update({ status: newStatus, metadata: meta })
        .eq('id', taskId)
      if (err2) {
        const { error: err3 } = await supabase.from('boq_requests').update({ status: newStatus }).eq('id', taskId)
        if (err3) {
          task.value.status = oldStatus
        }
      }
    }
  } catch (err) {
    console.warn('Supabase DB update notice (saved locally):', err)
  }
}

// Comments
const comments = ref([])
const newComment = ref('')
const isSubmittingComment = ref(false)
let commentsRealtimeChannel = null

// Warna tema merah untuk komentar
const COMMENT_PRIMARY_COLOR = 'bg-red-600'
const COMMENT_HOVER_COLOR = 'hover:bg-red-700'
const COMMENT_TEXT_COLOR = 'text-white'

const statusConfig = {
  'TODO': { label: 'To Do', color: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
  'IN_PROGRESS': { label: 'In Progress', color: 'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800' },
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
  document.addEventListener('click', handleClickOutsideCustomer)
  setupCommentsRealtime()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutsideCustomer)
  if (commentsRealtimeChannel) {
    supabase.removeChannel(commentsRealtimeChannel)
  }
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
    
    if (task.value && task.value.status) {
      try { localStorage.setItem(`boq_status_${taskId}`, task.value.status) } catch {}
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

const setupCommentsRealtime = () => {
  if (!taskId) return
  
  commentsRealtimeChannel = supabase
    .channel('boq-comments-realtime')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'boq_comments',
        filter: `request_id=eq.${taskId}`
      },
      (payload) => {
        const newComment = payload.new
        if (!comments.value.some(c => c.id === newComment.id)) {
          comments.value.push(newComment)
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'boq_comments',
        filter: `request_id=eq.${taskId}`
      },
      (payload) => {
        if (payload.old) {
          comments.value = comments.value.filter(c => c.id !== payload.old.id)
        }
      }
    )
    .subscribe()
}

const deleteTask = async () => {
  if (!confirm('Apakah Anda yakin ingin menghapus permintaan ini? Semua data terkait (termasuk komentar) akan terhapus.')) return
  try {
    const { error } = await supabase
      .from('boq_requests')
      .delete()
      .eq('id', taskId)
    if (error) throw error
    router.push('/collaborate')
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
const taskAttachments = computed(() => {
  if (!task.value) return []
  const meta = parseMeta(task.value.metadata)
  if (Array.isArray(meta.attachments) && meta.attachments.length > 0) {
    return meta.attachments
  }
  if (task.value.file_url || task.value.file_link) {
    return [{
      id: 'legacy_1',
      name: task.value.file_name || 'Lampiran Dokumen',
      url: task.value.file_link || task.value.file_url,
      type: task.value.file_link ? 'link' : 'file'
    }]
  }
  return []
})

const taskAssignees = computed(() => {
  if (!task.value) return []
  const meta = parseMeta(task.value.metadata)
  if (Array.isArray(meta.assignees) && meta.assignees.length > 0) {
    return meta.assignees
  }
  if (task.value.assignee) {
    return task.value.assignee.split(',').map(s => s.trim()).filter(Boolean)
  }
  return []
})

const taskSubtasks = computed(() => {
  if (!task.value) return []
  const meta = parseMeta(task.value.metadata)
  return Array.isArray(meta.subtasks) ? meta.subtasks : []
})

const recurringInfo = computed(() => {
  if (!task.value) return null
  const meta = parseMeta(task.value.metadata)
  if (!meta.is_recurring) return null
  if (meta.recurrence_type === 'WEEKLY') {
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
    return `Mingguan • Setiap ${dayNames[meta.recurrence_weekday !== undefined ? Number(meta.recurrence_weekday) : 1]}`
  }
  return `Bulanan • Setiap tanggal ${meta.recurrence_day || 1}`
})

const doneSubtasksCount = computed(() => taskSubtasks.value.filter(s => s.completed).length)

const canChangeStatus = computed(() => {
  if (!task.value) return false
  return taskAssignees.value.includes(currentUserEmail.value) || task.value.created_by === currentUserEmail.value
})

const statusHistory = computed(() => {
  if (!task.value) return []
  const meta = parseMeta(task.value.metadata)
  return Array.isArray(meta.status_history) ? [...meta.status_history].reverse() : []
})

const isOverdue = computed(() => {
  if (!task.value || !task.value.target_date || task.value.status === 'DONE') return false
  const target = new Date(task.value.target_date)
  target.setHours(23, 59, 59, 999)
  return new Date() > target
})

const toggleSubtask = async (subtask) => {
  if (!task.value) return
  subtask.completed = !subtask.completed
  const meta = parseMeta(task.value.metadata)
  meta.subtasks = taskSubtasks.value
  try {
    const { error } = await supabase
      .from('boq_requests')
      .update({ metadata: meta })
      .eq('id', taskId)
    if (error) {
      console.warn('Subtask toggle notice:', error.message)
      subtask.completed = !subtask.completed
    } else {
      try { localStorage.setItem(`boq_meta_${taskId}`, JSON.stringify(meta)) } catch {}
    }
  } catch (err) {
    console.warn('Subtask toggle error:', err)
    subtask.completed = !subtask.completed
  }
}

const getWorkDuration = computed(() => {
  if (!task.value || task.value.status !== 'DONE' || !task.value.in_progress_at || !task.value.done_at) {
    return '-'
  }
  
  const start = new Date(task.value.in_progress_at)
  const end = new Date(task.value.done_at)
    
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '-'

  const diffMs = Math.max(0, end.getTime() - start.getTime())
  const totalMinutes = Math.floor(diffMs / (1000 * 60))
  const totalHours = Math.floor(totalMinutes / 60)
  const days = Math.floor(totalHours / 24)

  const hours = totalHours % 24
  const minutes = totalMinutes % 60

  const timeParts = []
  if (days > 0) timeParts.push(`${days} Hari`)
  if (hours > 0) timeParts.push(`${hours} Jam`)
  if (minutes > 0 || (days === 0 && hours === 0)) timeParts.push(`${minutes} Menit`)

  return timeParts.join(' ')
})
</script>

<template>
  <div class="p-4 md:p-6 w-full max-w-[1600px] mx-auto space-y-5">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-20">
      <Loader2 class="w-8 h-8 animate-spin text-red-500 mb-4" />
      <p class="text-slate-500 font-medium">Memuat detail permintaan...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="isError || !task" class="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
      <p class="text-red-500 font-medium mb-4">Permintaan tidak ditemukan atau telah dihapus.</p>
      <button @click="router.push('/collaborate')" class="text-red-600 hover:underline">
        Kembali ke Board Permintaan
      </button>
    </div>

    <!-- Main Content -->
    <div v-else class="space-y-5">
      <!-- Top Action Bar -->
      <div class="flex items-center justify-between">
        <button @click="router.push('/collaborate')" class="inline-flex items-center text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
          <ArrowLeft class="w-4 h-4 mr-1.5" />
          Kembali ke Board
        </button>
        <div class="flex items-center gap-2">
          <button 
            @click="openEditModal" 
            class="inline-flex items-center text-xs font-bold text-red-700 dark:text-red-200 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 transition-all shadow-sm cursor-pointer"
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
                <div class="flex items-center gap-2 flex-wrap">
                  <span v-if="task.task_number" class="px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-black text-slate-600 dark:text-slate-400 tracking-wider">
                    TASK-{{ task.task_number }}
                  </span>
                  <router-link 
                    v-if="task.marketing_idea_id || parseMeta(task.metadata).marketing_idea_id" 
                    to="/marketing-hub"
                    class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/50 text-xs font-bold text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-200 dark:hover:bg-purple-900 transition-all cursor-pointer"
                  >
                    🎨 Terhubung dengan Marketing Hub ➔
                  </router-link>
                </div>
                
                <div class="flex items-center gap-2">
                  <select 
                    v-if="canChangeStatus"
                    :value="task.status" 
                    @change="updateTaskStatus($event.target.value)"
                    class="px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border outline-none cursor-pointer shadow-sm transition-all"
                    :class="statusConfig[task.status]?.color || 'bg-slate-100 text-slate-700 border-slate-200'"
                  >
                    <option value="TODO" class="bg-white text-slate-800 font-semibold">To Do</option>
                    <option value="IN_PROGRESS" class="bg-white text-slate-800 font-semibold">In Progress</option>
                    <option value="DONE" class="bg-white text-slate-800 font-semibold">Done</option>
                  </select>
                  <span
                    v-else
                    class="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border shadow-sm"
                    :class="statusConfig[task.status]?.color || 'bg-slate-100 text-slate-700 border-slate-200'"
                    title="Hanya penanggung jawab / pembuat yang dapat mengubah status"
                  >
                    {{ statusConfig[task.status]?.label || task.status }}
                  </span>

                  <button 
                    v-if="task.status !== 'IN_PROGRESS' && canChangeStatus" 
                    @click="updateTaskStatus('IN_PROGRESS')"
                    class="inline-flex items-center px-3.5 py-1 rounded-lg text-xs font-bold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800 transition-all shadow-sm cursor-pointer"
                  >
                    Mulai Dikerjakan
                  </button>

                  <button 
                    v-if="task.status === 'IN_PROGRESS' && canChangeStatus" 
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

              <div class="flex flex-wrap items-center gap-2">
                <span v-if="recurringInfo" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-[10px] font-bold border border-red-200 dark:border-red-800">
                  <Repeat class="w-3 h-3 text-red-600 dark:text-red-400" />
                  Tugas Rutin — {{ recurringInfo }}
                </span>
                <span v-if="task.created_by" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold">
                  <User class="w-3 h-3" /> Dibuat oleh {{ getUserDisplayName(task.created_by) }}
                </span>
              </div>
            </div>

            <!-- Metadata Info Panel (Conditional Layout: Only Shows Filled Fields!) -->
            <div class="bg-slate-50/70 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-100 dark:border-slate-800/80 flex flex-wrap gap-4 min-w-0">
              <!-- Proyek (Only shown if filled) -->
              <div v-if="getProjectName !== '-'" class="flex items-start gap-3 min-w-[200px] flex-1">
                <div class="p-2 rounded-lg bg-red-100/70 dark:bg-red-900/40 text-red-600 dark:text-red-400 mt-0.5 shrink-0">
                  <FolderKanban class="w-4 h-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Proyek</p>
                  <p class="font-bold text-slate-800 dark:text-slate-100 text-xs md:text-sm break-words leading-snug">
                    {{ getProjectName }}
                  </p>
                </div>
              </div>

              <!-- Customer (Only shown if filled) -->
              <div v-if="getCustomerName !== '-'" class="flex items-start gap-3 min-w-[200px] flex-1">
                <div class="p-2 rounded-lg bg-rose-100/70 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0">
                  <Building2 class="w-4 h-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Customer</p>
                  <p class="font-bold text-slate-800 dark:text-slate-100 text-xs md:text-sm break-words leading-snug">
                    {{ getCustomerName }}
                  </p>
                </div>
              </div>

              <!-- PIC (Only shown if filled) -->
              <div v-if="getPicName !== '-'" class="flex items-start gap-3 min-w-[200px] flex-1">
                <div class="p-2 rounded-lg bg-red-100/70 dark:bg-red-900/40 text-red-600 dark:text-red-400 mt-0.5 shrink-0">
                  <User class="w-4 h-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">PIC</p>
                  <p class="font-bold text-slate-800 dark:text-slate-100 text-xs md:text-sm break-words leading-snug">
                    {{ getPicName }}
                  </p>
                </div>
              </div>

              <!-- Action By (Multi-Assignee) -->
              <div class="flex items-start gap-3 min-w-[200px] flex-1">
                <div class="p-2 rounded-lg bg-rose-100/70 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0">
                  <UserCheck class="w-4 h-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-1">
                    <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Action By / Delegasi</p>
                    <button @click="openEditModal" class="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer">
                      <Pencil class="w-2.5 h-2.5" /> Edit
                    </button>
                  </div>
                  <div class="flex flex-wrap gap-1.5 pt-1">
                    <span
                      v-for="email in taskAssignees"
                      :key="email"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-[10px] font-bold border border-red-200 dark:border-red-800 truncate max-w-[160px]"
                      :title="email"
                    >
                      <User class="w-3 h-3 text-red-600 dark:text-red-400 shrink-0" /> {{ email.split('@')[0] }}
                    </span>
                    <span v-if="taskAssignees.length === 0" class="text-xs font-bold text-slate-500">Belum ditugaskan</span>
                  </div>
                </div>
              </div>

              <!-- Deadline -->
              <div class="flex items-start gap-3 min-w-[200px] flex-1">
                <div class="p-2 rounded-lg bg-red-100/70 dark:bg-red-900/40 text-red-600 dark:text-red-400 mt-0.5 shrink-0">
                  <Calendar class="w-4 h-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Deadline</p>
                  <p class="font-bold text-slate-800 dark:text-slate-100 text-xs md:text-sm break-words leading-snug" :class="{ 'text-red-600': isOverdue }">
                    {{ task.target_date ? formatDate(task.target_date) : '-' }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Description (In-Line Edit Mode supported!) -->
            <div class="space-y-2 min-w-0">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Deskripsi Tugas</h3>
                <button
                  v-if="!isEditingInlineDescription"
                  @click="startEditInlineDescription"
                  class="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                >
                  <Pencil class="w-3 h-3" /> Edit Deskripsi
                </button>
              </div>

              <!-- Inline Editor View -->
              <div v-if="isEditingInlineDescription" class="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 animate-in fade-in duration-200">
                <RichTextEditor v-model="inlineDescriptionHtml" placeholder="Tuliskan deskripsi atau rincian tugas..." />
                <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <button
                    @click="cancelEditInlineDescription"
                    class="px-3.5 py-1.5 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    @click="saveInlineDescription"
                    :disabled="isSavingInlineDescription"
                    class="px-4 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                  >
                    <Loader2 v-if="isSavingInlineDescription" class="w-3.5 h-3.5 animate-spin" />
                    <span>{{ isSavingInlineDescription ? 'Menyimpan...' : 'Simpan Deskripsi' }}</span>
                  </button>
                </div>
              </div>

              <!-- Read-only Description Display -->
              <template v-else>
                <div
                  v-if="task.description"
                  class="rich-content-display prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed bg-slate-50/50 dark:bg-slate-800/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80 overflow-hidden"
                  v-html="task.description"
                />
                <div v-else class="flex items-center justify-between p-4 rounded-xl bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/80 text-sm text-muted-foreground italic">
                  <span>Tidak ada deskripsi.</span>
                  <button @click="startEditInlineDescription" class="inline-flex items-center gap-1 not-italic font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer">
                    <Plus class="w-3.5 h-3.5" /> Tambah Deskripsi
                  </button>
                </div>
              </template>
            </div>

            <!-- Sub-tugas & Checklist -->
            <div v-if="taskSubtasks.length > 0" class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Sub-tugas & Checklist</h3>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800">
                  {{ doneSubtasksCount }}/{{ taskSubtasks.length }}
                </span>
              </div>
              <div class="space-y-1.5">
                <div
                  v-for="sub in taskSubtasks"
                  :key="sub.id || sub.title"
                  class="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 text-xs transition-all"
                >
                  <button
                    type="button"
                    @click="toggleSubtask(sub)"
                    class="shrink-0 w-4.5 h-4.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer"
                    :class="sub.completed
                      ? 'bg-red-600 border-red-600 text-white'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-red-400'"
                  >
                    <Check v-if="sub.completed" class="w-3 h-3" stroke-width="3" />
                  </button>
                  <span :class="{ 'line-through text-slate-400': sub.completed }" class="font-medium text-slate-800 dark:text-slate-200 leading-snug break-words">
                    {{ sub.title }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Attachments (In-Line Add Mode supported!) -->
            <div class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                  Lampiran Dokumen ({{ taskAttachments.length }})
                </h3>
                <button
                  v-if="!isAddingInlineAttachment"
                  @click="startAddInlineAttachment"
                  class="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                >
                  <Plus class="w-3 h-3" /> Tambah Lampiran
                </button>
              </div>

              <!-- Inline Attachment Add Container -->
              <div v-if="isAddingInlineAttachment" class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 animate-in fade-in duration-200">
                <div class="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      @click="inlineAttachmentMode = 'file'"
                      class="px-3 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer"
                      :class="inlineAttachmentMode === 'file' ? 'bg-red-600 text-white border-red-600 shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'"
                    >
                      Upload Berkas / File
                    </button>
                    <button
                      type="button"
                      @click="inlineAttachmentMode = 'link'"
                      class="px-3 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer"
                      :class="inlineAttachmentMode === 'link' ? 'bg-red-600 text-white border-red-600 shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'"
                    >
                      Input URL Link Dokumen
                    </button>
                  </div>
                  <button @click="cancelInlineAttachment" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    <X class="w-4 h-4" />
                  </button>
                </div>

                <!-- Mode File Upload -->
                <div v-if="inlineAttachmentMode === 'file'" class="space-y-2">
                  <label class="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/80 cursor-pointer transition-all text-center">
                    <input ref="inlineFileInput" type="file" multiple @change="handleInlineFileUpload" class="hidden" />
                    <Loader2 v-if="isUploadingInlineAttachment" class="w-6 h-6 animate-spin text-red-600 mb-2" />
                    <Paperclip v-else class="w-6 h-6 text-slate-400 mb-2" />
                    <span class="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {{ isUploadingInlineAttachment ? 'Mengunggah Berkas...' : 'Klik untuk Pilih Berkas / File' }}
                    </span>
                    <span class="text-[11px] text-slate-400 mt-0.5">PDF, Gambar, Excel, DOCX, ZIP (Sync Otomatis)</span>
                  </label>
                </div>

                <!-- Mode Link Input -->
                <div v-else class="space-y-3">
                  <input
                    v-model="inlineLinkUrl"
                    type="url"
                    placeholder="Tempelkan URL Link Dokumen (contoh: https://drive.google.com/...)"
                    class="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:border-red-500"
                  />
                  <div class="flex justify-end gap-2">
                    <button
                      @click="saveInlineLinkAttachment"
                      class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm active:scale-95 transition-all"
                    >
                      Simpan Link Dokumen
                    </button>
                  </div>
                </div>
              </div>

              <!-- Attachments List -->
              <div v-if="taskAttachments.length > 0" class="space-y-2">
                <div
                  v-for="(att, idx) in taskAttachments"
                  :key="att.id || att.url"
                  class="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 hover:border-red-400 dark:hover:border-red-500 bg-slate-50 dark:bg-slate-800/40 hover:bg-red-50/40 dark:hover:bg-red-900/20 transition-all group"
                >
                  <a :href="att.url" target="_blank" class="flex items-center gap-3 flex-1 min-w-0">
                    <div class="w-9 h-9 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Paperclip v-if="att.type === 'file'" class="w-4 h-4" />
                      <Link v-else class="w-4 h-4" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-red-600 dark:group-hover:text-red-400">
                        {{ att.type === 'link' ? (att.name || 'Buka Link Dokumen') : (att.name || 'Lihat Dokumen Lampiran') }}
                      </p>
                      <p class="text-[11px] text-slate-400">Klik untuk membuka / mengunduh {{ att.type === 'link' ? 'link' : 'file' }}</p>
                    </div>
                  </a>
                  <div class="flex items-center gap-2">
                    <a :href="att.url" target="_blank" class="p-1.5 text-slate-400 hover:text-red-500 rounded-lg">
                      <Download class="w-4 h-4" />
                    </a>
                    <button
                      @click.prevent="removeInlineAttachment(idx)"
                      class="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                      title="Hapus Lampiran Ini"
                    >
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div v-else-if="!isAddingInlineAttachment" class="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/80 text-xs text-slate-400">
                <span>Belum ada lampiran berkas atau link dokumen.</span>
                <button @click="startAddInlineAttachment" class="inline-flex items-center gap-1 font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer">
                  <Paperclip class="w-3.5 h-3.5" /> Tambah Berkas / Link
                </button>
              </div>
            </div>

          </div>

          <!-- Riwayat Perubahan Status -->
          <div v-if="statusHistory.length > 0" class="bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-5 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 class="text-xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Riwayat Perubahan Status ({{ statusHistory.length }})</h3>
            <div class="space-y-2">
              <div
                v-for="(h, i) in statusHistory"
                :key="i"
                class="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 text-xs"
              >
                <div class="p-1.5 rounded-lg bg-red-100/70 dark:bg-red-900/40 text-red-600 dark:text-red-400 shrink-0">
                  <Clock class="w-3.5 h-3.5" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-bold text-slate-800 dark:text-slate-100">
                    {{ statusConfig[h.from]?.label || h.from }}
                    <span class="text-slate-400 mx-1">&rarr;</span>
                    {{ statusConfig[h.to]?.label || h.to }}
                  </p>
                  <p class="text-[10px] text-slate-400 mt-0.5">
                    oleh {{ h.changed_by ? getUserDisplayName(h.changed_by) : 'Sistem' }} &bull; {{ formatDate(h.changed_at) }}
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- Right Column: Comments -->
        <div class="lg:col-span-1">
          <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 flex flex-col h-[600px] sticky top-6">
            <div class="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <MessageSquare class="w-5 h-5 text-red-600" />
              <h2 class="font-bold text-base text-slate-900 dark:text-white">Komentar & Diskusi</h2>
              <span v-if="comments.length > 0" class="ml-auto text-xs font-bold bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-2.5 py-1 rounded-full border border-red-200 dark:border-red-800">
                {{ comments.length }}
              </span>
            </div>
            
            <!-- Comments List -->
            <div class="flex-1 overflow-y-auto p-5 space-y-5">
              <div v-if="comments.length === 0" class="h-full flex flex-col items-center justify-center text-slate-400 text-xs text-center py-10">
                <MessageSquare class="w-10 h-10 mb-3 opacity-20" />
                <p>Belum ada diskusi.<br>Mulai percakapan pertama!</p>
              </div>
              
              <div 
                v-for="comment in comments" 
                :key="comment.id"
                class="flex flex-col space-y-2"
                :class="comment.user_email === currentUserEmail ? 'items-end' : 'items-start'"
              >
                <span class="text-xs text-slate-500 font-medium px-1">
                  {{ comment.user_email.split('@')[0] }} • {{ formatDate(comment.created_at) }}
                </span>
                <div 
                  class="relative max-w-[90%] rounded-2xl px-4 py-3 text-sm group shadow-sm"
                  :class="comment.user_email === currentUserEmail 
                    ? 'bg-red-600 text-white rounded-tr-sm' 
                    : 'bg-slate-50 text-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:border border-slate-200 rounded-tl-sm'"
                >
                  <p class="whitespace-pre-wrap leading-relaxed">{{ comment.comment_text }}</p>
                  <button 
                    v-if="comment.user_email === currentUserEmail"
                    @click="deleteComment(comment.id)"
                    class="absolute -left-8 top-3 p-1 text-red-400/70 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Hapus komentar"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <!-- Input Area -->
            <div class="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 rounded-b-2xl">
              <form @submit.prevent="submitComment" class="flex gap-3 relative">
                <textarea
                  v-model="newComment"
                  rows="2"
                  placeholder="Tulis pesan atau diskusi..."
                  class="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent focus:outline-none resize-none pr-14 shadow-sm transition-all"
                  @keydown.enter.exact.prevent="submitComment"
                ></textarea>
                <button 
                  type="submit" 
                  :disabled="isSubmittingComment || !newComment.trim()"
                  class="absolute right-3 bottom-3 p-2 rounded-lg text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md"
                >
                  <Loader2 v-if="isSubmittingComment" class="w-5 h-5 animate-spin" />
                  <Send v-else class="w-5 h-5" />
                </button>
              </form>
              <p class="text-[10px] text-slate-400 mt-2 text-center">Enter untuk mengirim pesan</p>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- Modal Form Edit Permintaan (Matches Create Form Exactly) -->
    <div v-if="isEditModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
      <div class="bg-card rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden border border-border">
        <div class="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 class="text-base font-bold text-foreground">Edit Permintaan</h2>
          <button @click="closeEditModal" class="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="p-6 space-y-4 text-sm max-h-[85vh] overflow-y-auto sidebar-thin text-left">
          <!-- 1. Judul -->
          <div>
            <label class="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">Judul Tugas <span class="text-rose-500">*</span></label>
            <input v-model="editForm.title" type="text" placeholder="Contoh: Permintaan BOQ Panel GI Subang 150kV..." class="w-full px-4 py-2.5 text-sm font-semibold border border-input rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-red-500 shadow-2xs" />
          </div>

          <!-- 2. Ditugaskan Untuk & Target Deadline -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Ditugaskan untuk (Multi-select) -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
                Ditugaskan untuk <span class="text-rose-500">*</span>
              </label>
              <div class="p-2.5 border border-input rounded-xl bg-background max-h-40 overflow-y-auto space-y-1 sidebar-thin">
                <div
                  v-for="u in users"
                  :key="u.email"
                  @click="toggleAssignee(u.email)"
                  :class="[
                    'flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors',
                    editForm.assignees.includes(u.email)
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400 font-semibold'
                      : 'hover:bg-muted text-muted-foreground'
                  ]"
                >
                  <span class="truncate">👤 {{ getUserDisplayName(u.email) }}</span>
                  <Check v-if="editForm.assignees.includes(u.email)" class="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
                </div>
                <div v-if="users.length === 0" class="text-[11px] text-muted-foreground text-center py-1">
                  Memuat daftar tim...
                </div>
              </div>
              <p class="text-[10px] text-muted-foreground">Bisa pilih lebih dari satu penanggung jawab.</p>
            </div>

            <!-- Target Deadline & Quick Date Chips -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">Target Deadline <span class="text-rose-500">*</span></label>
              <input
                v-model="editForm.target_date"
                type="date"
                class="w-full px-3.5 py-2 text-xs font-medium border border-input rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
              />

              <!-- Quick Date Chips -->
              <div class="flex items-center gap-1.5 pt-1 flex-wrap">
                <button type="button" @click="setQuickDate(0)" class="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-[10px] font-bold text-muted-foreground border border-border cursor-pointer transition-colors">Hari Ini</button>
                <button type="button" @click="setQuickDate(1)" class="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-[10px] font-bold text-muted-foreground border border-border cursor-pointer transition-colors">Besok</button>
                <button type="button" @click="setQuickDate(3)" class="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-[10px] font-bold text-muted-foreground border border-border cursor-pointer transition-colors">3 Hari</button>
                <button type="button" @click="setQuickDate(7)" class="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-[10px] font-bold text-muted-foreground border border-border cursor-pointer transition-colors">1 Minggu</button>
              </div>

              <!-- Tugas Rutin (Recurring) -->
              <div class="pt-2.5 border-t border-border mt-2 space-y-2">
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" v-model="editForm.is_recurring" class="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-input cursor-pointer" />
                  <div class="flex items-center gap-1 text-xs font-bold text-foreground">
                    <Repeat class="w-3.5 h-3.5 text-indigo-500" />
                    <span>Tugas Rutin (Berulang)</span>
                  </div>
                </label>

                <div v-if="editForm.is_recurring" class="p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-2 text-xs">
                  <div>
                    <label class="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Frekuensi Berulang</label>
                    <select v-model="editForm.recurrence_type" class="w-full px-2.5 py-1.5 rounded-lg border border-input bg-background text-foreground text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500">
                      <option value="MONTHLY">Bulanan (Monthly)</option>
                      <option value="WEEKLY">Mingguan (Weekly)</option>
                    </select>
                  </div>

                  <div v-if="editForm.recurrence_type === 'MONTHLY'">
                    <label class="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Setiap Tanggal</label>
                    <select v-model.number="editForm.recurrence_day" class="w-full px-2.5 py-1.5 rounded-lg border border-input bg-background text-foreground text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500">
                      <option v-for="d in 31" :key="d" :value="d">Tanggal {{ d }} Setiap Bulan</option>
                    </select>
                  </div>

                  <div v-else-if="editForm.recurrence_type === 'WEEKLY'">
                    <label class="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Setiap Hari</label>
                    <select v-model.number="editForm.recurrence_weekday" class="w-full px-2.5 py-1.5 rounded-lg border border-input bg-background text-foreground text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500">
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

          <!-- 3. Description / Catatan -->
          <div>
            <label class="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">Detail Pekerjaan & Catatan</label>
            <RichTextEditor
              v-model="editForm.description"
              placeholder="Tuliskan spesifikasi, catatan teknis, atau keterangan..."
            />
          </div>

          <!-- 4. Sub-tugas & Checklist -->
          <div class="p-3.5 bg-muted/20 border border-border rounded-xl space-y-2.5">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare class="w-3.5 h-3.5 text-red-500" /> Sub-tugas & Checklist ({{ editForm.subtasks.length }})
              </label>
            </div>

            <div v-if="editForm.subtasks.length > 0" class="space-y-1.5">
              <div
                v-for="(sub, idx) in editForm.subtasks"
                :key="sub.id || idx"
                class="flex items-center justify-between p-2 rounded-lg bg-card border border-border text-xs"
              >
                <div class="flex items-center gap-2">
                  <input type="checkbox" v-model="sub.completed" class="rounded text-red-600 focus:ring-red-500 cursor-pointer" />
                  <span :class="{ 'line-through text-muted-foreground': sub.completed }" class="font-medium">{{ sub.title }}</span>
                </div>
                <button type="button" @click="removeModalSubtask(idx)" class="text-muted-foreground hover:text-rose-500 p-1 cursor-pointer">
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <input
                type="text"
                v-model="modalNewSubtask"
                @keydown.enter.prevent="addModalSubtask"
                placeholder="+ Tambah item sub-tugas (Tekan Enter)..."
                class="flex-1 px-3 py-1.5 text-xs border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <button type="button" @click="addModalSubtask" class="px-3 py-1.5 text-xs font-semibold bg-muted hover:bg-muted/80 rounded-lg text-foreground border border-border cursor-pointer shrink-0">
                Tambah
              </button>
            </div>
          </div>

          <!-- 5. Kaitan Proyek & Customer -->
          <div class="space-y-3 pt-1 border-t border-border/60">
            <label class="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer select-none">
              <input type="checkbox" v-model="editForm.has_project_ref" class="rounded text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer" />
              <span>Ada kaitan dengan Proyek / Customer</span>
            </label>

            <div v-if="hasProjectRef" class="p-3.5 bg-muted/20 border border-border rounded-xl grid grid-cols-1 md:grid-cols-3 gap-3">
              <!-- Proyek -->
              <div>
                <label class="block text-[11px] font-semibold text-muted-foreground mb-1">Nama Proyek</label>
                <input v-model="editForm.project_name" type="text" placeholder="Nama proyek / lokasi..." class="w-full px-3 py-1.5 text-xs border border-input rounded-lg bg-background text-foreground outline-none focus:ring-1 focus:ring-red-500" />
              </div>

              <!-- Customer Combobox -->
              <div ref="customerComboboxRef" class="relative">
                <label class="block text-[11px] font-semibold text-muted-foreground mb-1">Customer / Klien</label>
                <div class="relative">
                  <input
                    type="text"
                    v-model="customerSearchQuery"
                    @focus="isCustomerDropdownOpen = true"
                    @input="editForm.customer_name = customerSearchQuery; isCustomerDropdownOpen = true"
                    placeholder="Cari / ketik customer..."
                    class="w-full pl-8 pr-7 py-1.5 text-xs border border-input rounded-lg bg-background text-foreground outline-none focus:ring-1 focus:ring-red-500"
                  />
                  <Search class="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2" />
                  <button
                    v-if="customerSearchQuery"
                    type="button"
                    @click="customerSearchQuery = ''; editForm.customer_name = ''; isCustomerDropdownOpen = true"
                    class="absolute right-2 top-2 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                  >
                    <X class="w-3 h-3" />
                  </button>
                </div>

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
                    <Check v-if="editForm.customer_name === cName" class="w-3.5 h-3.5 text-red-500 shrink-0" />
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
                <input v-model="editForm.pic_name" type="text" placeholder="Nama PIC kontak..." class="w-full px-3 py-1.5 text-xs border border-input rounded-lg bg-background text-foreground outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
          </div>

          <!-- 6. Lampiran Berkas & Link (Multiple) -->
          <div class="space-y-2.5">
            <label class="block text-xs font-bold text-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Lampiran Berkas & Link ({{ editForm.attachments.length }})</span>
              <span class="text-[10px] font-normal text-muted-foreground">Bisa tambah banyak file & link</span>
            </label>

            <!-- Tab toggle -->
            <div class="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              <button
                type="button"
                @click="attachmentMode = 'file'"
                :class="[
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer',
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
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer',
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
                'relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-all py-6 px-4',
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
              <div class="p-2.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
                <Paperclip class="w-4 h-4" />
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
            <div v-if="editForm.attachments.length > 0" class="space-y-1.5">
              <div
                v-for="(att, idx) in editForm.attachments"
                :key="att.id || idx"
                class="flex items-center justify-between px-3 py-2 rounded-xl bg-card border border-border text-xs shadow-2xs"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <Paperclip v-if="att.type === 'file'" class="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <Link v-else class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <a :href="att.url" target="_blank" class="font-semibold text-foreground hover:text-red-600 truncate max-w-[140px] sm:max-w-[240px]">
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

        <div class="px-6 py-4 bg-muted/40 border-t border-border flex justify-end gap-2.5">
          <button @click="closeEditModal" class="px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-xl transition-colors cursor-pointer">Batal</button>
          <button @click="saveEditTask" :disabled="isSavingEdit || isUploadingAttachment" class="px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-xs">
            <Loader2 v-if="isSavingEdit" class="w-3.5 h-3.5 animate-spin" />
            <span>{{ isSavingEdit ? 'Menyimpan...' : (isUploadingAttachment ? 'Mengunggah...' : 'Simpan Perubahan') }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
