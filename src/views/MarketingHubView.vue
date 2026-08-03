<script setup>
import { ref, computed, onMounted, nextTick, inject, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import {
  Lightbulb, Send, Heart, MessageCircle, Loader2, X, Image,
  RefreshCw, Sparkles, AlertCircle, ChevronDown, Globe,
  MoreHorizontal, Bookmark, Share2, ThumbsUp, Calendar, ChevronLeft, ChevronRight, List, ExternalLink, Pin
} from 'lucide-vue-next'

// --- State ---
const isLoading = ref(true)
const isSubmitting = ref(false)
const ideas = ref([])
const currentUser = ref('')
const currentUserName = ref('')
const userRole = inject('userRole')
const fetchError = ref(null)
const activeFilter = ref('all')
const activeStatus = ref('all')
const commentTarget = ref(null)
const openMenuId = ref(null)
const newComment = ref('')
const commentAttachment = ref(null)
const commentAttachmentPreview = ref('')
const isSubmittingComment = ref(false)
const commentFileInput = ref(null)
const replyToId = ref(null)
const replyToName = ref('')

watch(commentTarget, () => {
  commentAttachment.value = null
  commentAttachmentPreview.value = ''
  newComment.value = ''
  replyToId.value = null
  replyToName.value = ''
})

const onCommentFileChange = (e) => {
  const file = e.target.files[0]
  if (!file) return
  commentAttachment.value = file
  commentAttachmentPreview.value = URL.createObjectURL(file)
}

const removeCommentAttachment = () => {
  commentAttachment.value = null
  commentAttachmentPreview.value = ''
}

// Tabs
const activeTab = ref('digital') // 'digital' | 'event'

// Events state
const events = ref([])
const showEventModal = ref(false)
const eventViewMode = ref('list') // 'list' | 'calendar'

// --- CALENDAR LOGIC ---
const currentMonth = ref(new Date().getMonth())
const currentYear = ref(new Date().getFullYear())
const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]

const calendarCells = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  
  const firstDayIndex = new Date(year, month, 1).getDay()
  const totalDays = new Date(year, month + 1, 0).getDate()
  const prevMonthTotalDays = new Date(year, month, 0).getDate()
  
  const cells = []
  
  // Previous month padding
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = prevMonthTotalDays - i
    const m = month === 0 ? 11 : month - 1
    const y = month === 0 ? year - 1 : year
    cells.push({
      day: d,
      dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      isCurrentMonth: false
    })
  }
  
  // Current month
  for (let d = 1; d <= totalDays; d++) {
    cells.push({
      day: d,
      dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      isCurrentMonth: true
    })
  }
  
  // Next month padding
  const remainingCells = 42 - cells.length
  for (let d = 1; d <= remainingCells; d++) {
    const m = month === 11 ? 0 : month + 1
    const y = month === 11 ? year + 1 : year
    cells.push({
      day: d,
      dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      isCurrentMonth: false
    })
  }
  
  return cells
})

const eventsByDate = computed(() => {
  const map = {}
  events.value.forEach(evt => {
    if (!evt.date_start) return
    try {
      const dateObj = new Date(evt.date_start)
      if (isNaN(dateObj.getTime())) return
      const yyyy = dateObj.getFullYear()
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0')
      const dd = String(dateObj.getDate()).padStart(2, '0')
      const dateStr = `${yyyy}-${mm}-${dd}`
      if (!map[dateStr]) map[dateStr] = []
      map[dateStr].push(evt)
    } catch (e) {}
  })
  return map
})

const prevMonth = () => {
  if (currentMonth.value === 0) {
    currentMonth.value = 11
    currentYear.value--
  } else {
    currentMonth.value--
  }
}

const nextMonth = () => {
  if (currentMonth.value === 11) {
    currentMonth.value = 0
    currentYear.value++
  } else {
    currentMonth.value++
  }
}

const editingEvent = ref(null)
const newEvent = ref({ name: '', date_start: '', date_end: '', status: 'upcoming', kpis: [{ name: '', target: null, actual: null }] })
const eventStatuses = [
  { key: 'upcoming', label: 'Akan Datang', color: 'bg-amber-100 text-amber-700' },
  { key: 'ongoing', label: 'Sedang Berjalan', color: 'bg-blue-100 text-blue-700' },
  { key: 'completed', label: 'Selesai', color: 'bg-emerald-100 text-emerald-700' },
]

// Composer state
const isComposerExpanded = ref(false)
const composerRef = ref(null)
const fileInputRef = ref(null)
const newIdea = ref({ platforms: [], title: '', description: '', tags: '', attachment: null })

const handleAttachmentClick = () => {
  // Simulate clicking the hidden file input
  if(fileInputRef.value) fileInputRef.value.click()
}

const attachmentPreviewUrl = ref(null)

const handleFileChange = (e) => {
  const file = e.target.files[0]
  if (file) {
    newIdea.value.attachment = file
    if (attachmentPreviewUrl.value) {
      URL.revokeObjectURL(attachmentPreviewUrl.value)
    }
    if (file.type.startsWith('image/')) {
      attachmentPreviewUrl.value = URL.createObjectURL(file)
    } else {
      attachmentPreviewUrl.value = null
    }
  }
}

const buildCommentTree = (comments) => {
  if (!comments || !Array.isArray(comments)) return []
  const map = {}
  const roots = []
  
  const parsedComments = comments.map(c => {
    let text = c.comment
    let parentId = null
    const match = text.match(/^\[REPLY_TO:(.+?)\]\s*/)
    if (match) {
      parentId = match[1]
      text = text.substring(match[0].length)
    }
    return { ...c, _parsedText: text, _parentId: parentId, _children: [] }
  })
  
  parsedComments.forEach(c => { map[c.id] = c })
  
  parsedComments.forEach(c => {
    if (c._parentId && map[c._parentId]) {
      map[c._parentId]._children.push(c)
    } else {
      roots.push(c)
    }
  })
  
  return roots
}

const parseIdeaDescription = (text) => {
  if (!text) return { text: '', driveLink: null, originalLink: null }
  const urlRegex = /(https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view\?usp=drivesdk)/;
  const match = text.match(urlRegex)
  if (match) {
    const link = match[1]
    const cleanText = text.replace('🔗 Link Referensi: ' + link, '').replace(link, '').trim()
    const previewLink = link.replace('/view?usp=drivesdk', '/preview')
    return { text: cleanText, driveLink: previewLink, originalLink: link }
  }
  return { text, driveLink: null, originalLink: null }
}

// Target Date Modal
const showDateModal = ref(false)
const dateModalTarget = ref(null)
const selectedDate = ref('')

const PLATFORMS = [
  { key: 'all', label: 'Semua', emoji: '🌐' },
  { key: 'instagram', label: 'Instagram', icon: 'instagram.png' },
  { key: 'facebook', label: 'Facebook', icon: 'fb.png' },
  { key: 'tiktok', label: 'TikTok', icon: 'tik-tok.png' },
  { key: 'linkedin', label: 'LinkedIn', icon: 'linkedin.png' },
  { key: 'email', label: 'Email', icon: 'gmail.png' },
]

const STATUSES = [
  { key: 'all', label: 'Semua' },
  { key: 'idea', label: '💡 Ide Masuk' },
  { key: 'planning', label: '📝 Planning' },
  { key: 'designing', label: '🎨 Desain' },
  { key: 'scheduled', label: '📅 Terjadwal' },
  { key: 'published', label: '🚀 Tayang' },
  { key: 'archived', label: '📥 Disimpan Dulu' },
]

const STATUS_FLOW = ['idea', 'planning', 'designing', 'scheduled', 'published', 'archived']

const statusConfig = {
  idea:      { label: 'Ide Masuk',      emoji: '💡', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800' },
  planning:  { label: 'Direncanakan',   emoji: '📝', cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800' },
  designing: { label: 'Desain',         emoji: '🎨', cls: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800' },
  scheduled: { label: 'Terjadwal',      emoji: '📅', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800' },
  published: { label: 'Tayang',         emoji: '🚀', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800' },
  archived:  { label: 'Disimpan Dulu',  emoji: '📥', cls: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' },
}

const platformGradient = {
  instagram: 'from-pink-500 to-rose-500',
  linkedin:  'from-blue-600 to-blue-700',
  tiktok:    'from-violet-600 to-pink-600',
  facebook:  'from-blue-600 to-indigo-600',
  email:     'from-amber-500 to-orange-500',
}

const platformBg = {
  instagram: 'bg-pink-100 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400',
  linkedin:  'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  tiktok:    'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  facebook:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400',
  email:     'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
}

const getPlatform  = (key) => PLATFORMS.find(p => p.key === key) || { label: key, emoji: '🌐' }
const getStatus    = (key) => statusConfig[key] || statusConfig['idea']
const nextStatus   = (current) => { const i = STATUS_FLOW.indexOf(current); return i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i+1] : null }

const formatTime = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr), diff = Math.floor((new Date() - d) / 1000)
  if (diff < 60)    return `${diff}d lalu`
  if (diff < 3600)  return `${Math.floor(diff/60)} mnt lalu`
  if (diff < 86400) return `${Math.floor(diff/3600)} jam lalu`
  if (diff < 604800)return `${Math.floor(diff/86400)} hari lalu`
  return d.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })
}

const getInitials = (email) => {
  if (!email) return '?'
  const p = email.split('@')[0].split('.')
  return p.length >= 2 ? (p[0][0]+p[1][0]).toUpperCase() : email.substring(0,2).toUpperCase()
}

const getAvatarColor = (email) => {
  const colors = ['from-pink-500 to-rose-500','from-blue-500 to-indigo-600','from-violet-500 to-purple-600','from-emerald-500 to-teal-600','from-amber-500 to-orange-500','from-cyan-500 to-blue-500']
  let hash = 0
  for (let i = 0; i < (email||'').length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

// --- Fetch ---
const fetchIdeas = async () => {
  isLoading.value = true
  fetchError.value = null
  try {
    const { data, error } = await supabase
      .from('marketing_ideas')
      .select('*, comments:marketing_idea_comments(id, comment, created_by, created_at), likes:marketing_idea_likes(id, user_email)')
      .order('created_at', { ascending: false })
    if (error) throw error
    ideas.value = data || []
  } catch (err) {
    fetchError.value = err.message
  } finally {
    isLoading.value = false
  }
}

const fetchEvents = async () => {
  try {
    const { data, error } = await supabase.from('marketing_events').select('*').order('date_start', { ascending: false })
    if (error) throw error
    events.value = data || []
  } catch (err) { console.error('Gagal memuat event:', err.message) }
}

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    currentUser.value = user.email
    const parts = user.email.split('@')[0].split('.')
    currentUserName.value = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
  }
  await fetchIdeas()
  await fetchEvents()

  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMoreIdeas.value) {
        loadMoreIdeas()
      }
    }, { rootMargin: '250px' })
  }
})

// --- Digital View Mode & Infinite Scroll ---
const digitalViewMode = ref('feed') // 'feed' | 'calendar'
const displayLimit = ref(6)
const loadMoreSentinel = ref(null)

const displayedIdeas = computed(() => {
  return filteredIdeas.value.slice(0, displayLimit.value)
})

const hasMoreIdeas = computed(() => {
  return displayLimit.value < filteredIdeas.value.length
})

const loadMoreIdeas = () => {
  if (hasMoreIdeas.value) {
    displayLimit.value += 6
  }
}

watch([activeFilter, activeStatus], () => {
  displayLimit.value = 6
})

let observer = null

watch(loadMoreSentinel, (el) => {
  if (observer) {
    observer.disconnect()
    if (el) observer.observe(el)
  }
})

// --- Digital Ideas Calendar Mapping ---
const digitalIdeasByDate = computed(() => {
  const map = {}
  ideas.value.forEach(idea => {
    const dateField = idea.target_date || idea.created_at
    if (!dateField) return
    try {
      const dateObj = new Date(dateField)
      if (isNaN(dateObj.getTime())) return
      const yyyy = dateObj.getFullYear()
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0')
      const dd = String(dateObj.getDate()).padStart(2, '0')
      const dateStr = `${yyyy}-${mm}-${dd}`
      if (!map[dateStr]) map[dateStr] = []
      map[dateStr].push(idea)
    } catch (e) {}
  })
  return map
})

const selectedIdeaModal = ref(null)

// --- Filtered ---
const filteredIdeas = computed(() => {
  let list = ideas.value
  if (activeFilter.value !== 'all') {
    list = list.filter(i => {
      const plt = Array.isArray(i.platforms) && i.platforms.length ? i.platforms : (i.platform ? [i.platform] : [])
      return plt.includes(activeFilter.value)
    })
  }
  if (activeStatus.value !== 'all') list = list.filter(i => i.status === activeStatus.value)
  
  return list.sort((a, b) => {
    const aPriority = a.tags?.includes('PRIORITY') ? 1 : 0
    const bPriority = b.tags?.includes('PRIORITY') ? 1 : 0
    if (aPriority !== bPriority) return bPriority - aPriority
    return new Date(b.created_at) - new Date(a.created_at)
  })
})

const platformCounts = computed(() => {
  const c = {}
  PLATFORMS.forEach(p => {
    c[p.key] = p.key === 'all' ? ideas.value.length : ideas.value.filter(i => {
      const plt = Array.isArray(i.platforms) && i.platforms.length ? i.platforms : (i.platform ? [i.platform] : [])
      return plt.includes(p.key)
    }).length
  })
  return c
})

// --- Composer ---
const expandComposer = async () => {
  isComposerExpanded.value = true
  await nextTick()
  composerRef.value?.focus()
}

const closeComposer = () => {
  isComposerExpanded.value = false
  if (attachmentPreviewUrl.value) {
    URL.revokeObjectURL(attachmentPreviewUrl.value)
    attachmentPreviewUrl.value = null
  }
  newIdea.value = { platforms: [], title: '', description: '', tags: '', attachment: null }
}

const togglePlatform = (key) => {
  const idx = newIdea.value.platforms.indexOf(key)
  if (idx === -1) newIdea.value.platforms.push(key)
  else newIdea.value.platforms.splice(idx, 1)
}

const canSubmit = computed(() => newIdea.value.title.trim().length > 0 && newIdea.value.platforms.length > 0 && !isSubmitting.value)

const submitIdea = async () => {
  if (!canSubmit.value) return
  isSubmitting.value = true
  try {
    let attachmentUrl = ''
    if (newIdea.value.attachment) {
      const formData = new FormData()
      formData.append('file', newIdea.value.attachment)
      
      const { data, error: uploadError } = await supabase.functions.invoke('upload-to-drive', {
        body: formData,
      })
      
      if (uploadError) {
        console.error("Full upload error:", uploadError)
        throw new Error((uploadError.context && uploadError.context.error) || uploadError.message || 'Gagal mengupload file ke Google Drive')
      }
      if (data && data.webViewLink) {
        attachmentUrl = data.webViewLink
      }
    }

    let finalDescription = newIdea.value.description.trim()
    if (attachmentUrl) {
      finalDescription += finalDescription ? `\n\n🔗 Link Referensi: ${attachmentUrl}` : `🔗 Link Referensi: ${attachmentUrl}`
    }

    const { error } = await supabase.from('marketing_ideas').insert([{
      platforms: newIdea.value.platforms,
      platform: newIdea.value.platforms[0],
      title: newIdea.value.title.trim(),
      description: finalDescription,
      tags: newIdea.value.tags.split(',').map(t => t.trim()).filter(Boolean),
      submitted_by: currentUser.value,
      status: 'idea',
    }])
    if (error) throw error
    closeComposer()
    await fetchIdeas()
  } catch (err) {
    alert('Gagal menyimpan ide: ' + err.message)
  } finally {
    isSubmitting.value = false
  }
}

// --- Actions ---
const updateStatus = async (ideaId, newSt, targetDate = null) => {
  try {
    const updateData = { status: newSt, updated_by: currentUser.value }
    if (targetDate) updateData.target_date = targetDate

    await supabase.from('marketing_ideas').update(updateData).eq('id', ideaId)
    const idea = ideas.value.find(i => i.id === ideaId)
    if (idea) {
      idea.status = newSt
      if (targetDate) idea.target_date = targetDate
    }
    openMenuId.value = null
  } catch (err) { alert('Gagal update status: ' + err.message) }
}

const handleStatusSelect = (ideaId, newSt) => {
  if (newSt === 'planning' || newSt === 'published') {
    dateModalTarget.value = { ideaId, status: newSt }
    selectedDate.value = ''
    showDateModal.value = true
    openMenuId.value = null
  } else {
    updateStatus(ideaId, newSt)
  }
}

const confirmStatusWithDate = () => {
  if (!selectedDate.value) return
  updateStatus(dateModalTarget.value.ideaId, dateModalTarget.value.status, selectedDate.value)
  showDateModal.value = false
}

const deleteIdea = async (ideaId) => {
  if (!confirm('Apakah Anda yakin ingin menghapus ide ini?')) return
  try {
    const { error } = await supabase.from('marketing_ideas').delete().eq('id', ideaId)
    if (error) throw error
    ideas.value = ideas.value.filter(i => i.id !== ideaId)
    openMenuId.value = null
  } catch (err) { alert('Gagal menghapus ide: ' + err.message) }
}

const toggleLike = async (idea) => {
  const liked = (idea.likes||[]).some(l => l.user_email === currentUser.value)
  try {
    if (liked) {
      await supabase.from('marketing_idea_likes').delete().eq('idea_id', idea.id).eq('user_email', currentUser.value)
      idea.likes = idea.likes.filter(l => l.user_email !== currentUser.value)
    } else {
      await supabase.from('marketing_idea_likes').insert([{ idea_id: idea.id, user_email: currentUser.value }])
      idea.likes = [...(idea.likes||[]), { user_email: currentUser.value }]
    }
  } catch (err) { console.error(err) }
}

const togglePriority = async (idea) => {
  const isPriority = idea.tags?.includes('PRIORITY')
  let newTags = [...(idea.tags || [])]
  if (isPriority) {
    newTags = newTags.filter(t => t !== 'PRIORITY')
  } else {
    newTags.push('PRIORITY')
  }
  
  // Optimistic update
  const oldTags = idea.tags
  idea.tags = newTags
  
  try {
    const { error } = await supabase.from('marketing_ideas').update({ tags: newTags }).eq('id', idea.id)
    if (error) throw error
  } catch (err) {
    idea.tags = oldTags // Revert on failure
    alert('Gagal update prioritas: ' + err.message)
  }
}

const submitComment = async (ideaId) => {
  if (!newComment.value.trim() && !commentAttachment.value) return
  isSubmittingComment.value = true
  try {
    let attachmentUrl = ''
    if (commentAttachment.value) {
      const formData = new FormData()
      formData.append('file', commentAttachment.value)
      const { data, error: uploadError } = await supabase.functions.invoke('upload-to-drive', { body: formData })
      if (uploadError) throw new Error((uploadError.context && uploadError.context.error) || uploadError.message || 'Gagal upload lampiran')
      if (data && data.webViewLink) attachmentUrl = data.webViewLink
    }

    let finalComment = newComment.value.trim()
    if (attachmentUrl) {
      finalComment += finalComment ? `\n\n🔗 Link Referensi: ${attachmentUrl}` : `🔗 Link Referensi: ${attachmentUrl}`
    }

    if (replyToId.value) {
      finalComment = `[REPLY_TO:${replyToId.value}] ${finalComment}`
    }

    const { data, error } = await supabase.from('marketing_idea_comments').insert([{
      idea_id: ideaId, comment: finalComment, created_by: currentUser.value
    }]).select()
    if (error) throw error
    
    const idea = ideas.value.find(i => i.id === ideaId)
    if (idea) idea.comments = [...(idea.comments||[]), data[0]]
    newComment.value = ''
    replyToId.value = null
    replyToName.value = ''
    commentTarget.value = null
    removeCommentAttachment()
  } catch (err) { alert('Gagal mengirim komentar: ' + err.message) }
  finally {
    isSubmittingComment.value = false
  }
}

const setReply = (comment, parentIdeaId) => {
  const isChangingTarget = commentTarget.value !== parentIdeaId
  commentTarget.value = parentIdeaId
  
  const applyReply = () => {
    replyToId.value = comment.id
    replyToName.value = comment.created_by?.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase())
    if (commentFileInput.value && commentFileInput.value[0]) {
      commentFileInput.value[0].focus()
    }
  }

  if (isChangingTarget) {
    nextTick(applyReply)
  } else {
    applyReply()
  }
}

// --- Event Actions ---
const openEventModal = (evt = null) => {
  if (evt) {
    editingEvent.value = evt
    newEvent.value = JSON.parse(JSON.stringify(evt))
    if (!newEvent.value.kpis || newEvent.value.kpis.length === 0) {
      newEvent.value.kpis = [{ name: '', target: null, actual: null }]
    }
  } else {
    editingEvent.value = null
    newEvent.value = { name: '', description: '', drive_link: '', date_start: '', date_end: '', status: 'upcoming', kpis: [{ name: '', target: null, actual: null }] }
  }
  showEventModal.value = true
}

const addKpiField = () => newEvent.value.kpis.push({ name: '', target: null, actual: null })
const removeKpiField = (idx) => newEvent.value.kpis.splice(idx, 1)

const saveEvent = async () => {
  try {
    const payload = {
      name: newEvent.value.name,
      description: newEvent.value.description,
      drive_link: newEvent.value.drive_link,
      date_start: newEvent.value.date_start,
      date_end: newEvent.value.date_end,
      status: newEvent.value.status,
      kpis: newEvent.value.kpis.filter(k => k.name.trim() !== ''),
      created_by: currentUser.value
    }
    
    if (editingEvent.value) {
      await supabase.from('marketing_events').update(payload).eq('id', editingEvent.value.id)
    } else {
      await supabase.from('marketing_events').insert([payload])
    }
    await fetchEvents()
    showEventModal.value = false
  } catch (err) { alert('Gagal menyimpan event: ' + err.message) }
}

const deleteEvent = async (id) => {
  if(!confirm('Apakah Anda yakin ingin menghapus event ini?')) return
  try {
    await supabase.from('marketing_events').delete().eq('id', id)
    events.value = events.value.filter(e => e.id !== id)
  } catch(err) { alert('Gagal hapus event: '+err.message) }
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-4 font-mono pb-12">

    <!-- Page Header -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <div class="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-widest font-bold mb-1">
          <Sparkles class="w-3.5 h-3.5 text-red-500" />
          Marketing Hub
        </div>
        <h1 class="text-xl font-black text-slate-900 dark:text-white">Kolaborasi Tim</h1>
      </div>
      <button @click="activeTab === 'digital' ? fetchIdeas() : fetchEvents()" class="p-2 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors shadow-sm">
        <RefreshCw class="w-4 h-4" />
      </button>
    </div>

    <!-- Tabs & View Mode Switcher -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between mb-4 gap-3">
      <!-- Main Tabs -->
      <div class="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl flex-1">
        <button @click="activeTab = 'digital'"
          class="flex-1 py-2 text-sm font-bold rounded-lg transition-all"
          :class="activeTab === 'digital' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'">
          Digital Marketing
        </button>
        <button @click="activeTab = 'event'"
          class="flex-1 py-2 text-sm font-bold rounded-lg transition-all"
          :class="activeTab === 'event' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'">
          Event & Activation
        </button>
      </div>

      <!-- View Mode Switcher for Digital Marketing -->
      <div v-if="activeTab === 'digital'" class="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl shrink-0">
        <button @click="digitalViewMode = 'feed'"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
          :class="digitalViewMode === 'feed' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'">
          <List class="w-3.5 h-3.5" />
          <span>Timeline Feed</span>
        </button>
        <button @click="digitalViewMode = 'calendar'"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
          :class="digitalViewMode === 'calendar' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'">
          <Calendar class="w-3.5 h-3.5" />
          <span>Kalender Konten</span>
        </button>
      </div>
    </div>

    <!-- TAB: DIGITAL MARKETING -->
    <div v-if="activeTab === 'digital'" class="space-y-4">
      <!-- Platform & Status Filter Row -->
      <div class="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
        <!-- Platform Filter Pills (Left) -->
        <div class="flex gap-2 overflow-x-auto pb-1 scrollbar-hide flex-1 min-w-0">
          <button v-for="p in PLATFORMS" :key="p.key" @click="activeFilter = p.key"
            class="px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1.5 shrink-0"
            :class="activeFilter === p.key
              ? 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900 dark:border-white shadow-md'
              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-400'">
            <img v-if="p.icon" :src="`/${p.icon}`" class="w-3.5 h-3.5 object-contain" :alt="p.label" />
            <span v-else-if="p.emoji">{{ p.emoji }}</span>
            <span>{{ p.label }}</span>
            <span class="px-1.5 py-0.5 rounded-full text-[9px] font-black"
              :class="activeFilter === p.key ? 'bg-white/20 dark:bg-black/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'">
              {{ platformCounts[p.key] || 0 }}
            </span>
          </button>
        </div>

        <!-- Status Filter Select Dropdown (Far Right) -->
        <div class="flex items-center gap-1.5 shrink-0 ml-auto">
          <span class="text-xs font-bold text-slate-400">Status:</span>
          <select v-model="activeStatus"
            class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 outline-none focus:border-red-500 shadow-sm cursor-pointer transition-colors">
            <option v-for="st in STATUSES" :key="st.key" :value="st.key">
              {{ st.label }}
            </option>
          </select>
        </div>
      </div>

    <!-- ===================== COMPOSER (Facebook-style) ===================== -->
    <div class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">

      <!-- Collapsed: avatar + prompt -->
      <div v-if="!isComposerExpanded" @click="expandComposer"
        class="flex items-center gap-4 p-5 sm:p-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
        <div class="w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-black shrink-0 shadow-sm"
          :class="getAvatarColor(currentUser)">
          {{ getInitials(currentUser) }}
        </div>
        <div class="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full px-5 py-2.5 text-sm text-slate-400 dark:text-slate-500 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/70 transition-colors">
          💡 Apa ide konten Anda hari ini, {{ currentUserName.split(' ')[0] || 'Tim' }}?
        </div>
      </div>

      <!-- Expanded composer -->
      <div v-else class="p-5 sm:p-6 space-y-5">

        <!-- Author Row -->
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-black shrink-0 shadow-sm"
            :class="getAvatarColor(currentUser)">
            {{ getInitials(currentUser) }}
          </div>
          <div>
            <p class="text-sm font-black text-slate-900 dark:text-white">{{ currentUserName || currentUser }}</p>
            <p class="text-[10px] text-slate-400">Bagikan ide konten ke tim</p>
          </div>
          <button @click="closeComposer" class="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Title Input (main text area like FB "What's on your mind") -->
        <textarea
          ref="composerRef"
          v-model="newIdea.title"
          rows="3"
          placeholder="💡 Apa ide kontennya? Mis: Tips pilih lampu downlight rumah, Cara hitung kapasitas MCB, Promo LED Highbay Pabrik..."
          class="w-full bg-transparent outline-none text-base text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 resize-none leading-relaxed font-sans"
          @keydown.ctrl.enter="submitIdea"
        ></textarea>

        <!-- Description (optional, smaller) -->
        <textarea
          v-model="newIdea.description"
          rows="2"
          placeholder="Tambahkan detail... angle, target audiens, referensi, dll. (opsional)"
          class="w-full bg-slate-50 dark:bg-slate-800/50 rounded-xl px-4 py-2.5 outline-none text-xs text-slate-600 dark:text-slate-400 placeholder-slate-300 dark:placeholder-slate-600 resize-none leading-relaxed font-sans border border-slate-100 dark:border-slate-800 focus:border-red-300 dark:focus:border-red-700 transition-colors"
        ></textarea>

        <!-- Attachment Upload -->
        <div class="flex items-center gap-3">
          <button type="button" @click="handleAttachmentClick" class="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <Image class="w-3.5 h-3.5" />
            Upload Referensi Desain
          </button>
          <input type="file" ref="fileInputRef" class="hidden" @change="handleFileChange" accept="image/*,.pdf,.doc,.docx" />
          <div v-if="newIdea.attachment" class="flex flex-col gap-2 mt-2">
            <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold border border-red-200 dark:border-red-800/30 w-max">
              <span class="truncate max-w-[150px]">{{ newIdea.attachment.name }}</span>
              <button @click="newIdea.attachment = null; attachmentPreviewUrl = null" class="hover:text-red-800 dark:hover:text-red-200 transition-colors">
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
            <div v-if="attachmentPreviewUrl" class="relative w-48 h-32 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
              <img :src="attachmentPreviewUrl" class="w-full h-full object-cover" />
            </div>
          </div>
        </div>

        <!-- Tags -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-400 shrink-0">🏷 Tag:</span>
          <input v-model="newIdea.tags" type="text" placeholder="tips, tutorial, promo (pisahkan koma)"
            class="flex-1 bg-transparent outline-none text-xs text-slate-600 dark:text-slate-400 placeholder-slate-300 dark:placeholder-slate-600 font-sans border-b border-slate-200 dark:border-slate-700 pb-0.5 focus:border-red-400 transition-colors" />
        </div>

        <!-- Platform Multi-Select -->
        <div class="space-y-2 pt-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tayang di Platform:</span>
            <span class="text-[10px] text-slate-400">
              {{ newIdea.platforms.length === 0 ? '⚠️ pilih minimal 1' : `✅ ${newIdea.platforms.length} dipilih` }}
            </span>
          </div>
          <div class="flex flex-wrap gap-2">
            <button v-for="p in PLATFORMS.filter(x=>x.key!=='all')" :key="p.key"
              @click="togglePlatform(p.key)"
              type="button"
              class="relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all"
              :class="newIdea.platforms.includes(p.key)
                ? 'text-white border-transparent bg-gradient-to-r shadow-md ' + (platformGradient[p.key]||'from-slate-500 to-slate-600')
                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-500 bg-slate-50 dark:bg-slate-800/50'">
              <img v-if="p.icon" :src="`/${p.icon}`" class="w-3.5 h-3.5 object-contain" :alt="p.label" />
              <span v-else-if="p.emoji">{{ p.emoji }}</span>
              <span>{{ p.label }}</span>
              <span v-if="newIdea.platforms.includes(p.key)"
                class="w-4 h-4 bg-white/30 rounded-full flex items-center justify-center text-[9px] font-black ml-0.5">✓</span>
            </button>
          </div>
        </div>

        <!-- Divider -->
        <div class="border-t border-slate-100 dark:border-slate-800 pt-4 flex items-center justify-end gap-3">
          <div class="flex gap-2">
            <button @click="closeComposer"
              class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-700">
              Batal
            </button>
            <button @click="submitIdea" :disabled="!canSubmit"
              class="px-5 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 bg-gradient-to-r from-red-600 to-red-600 hover:from-red-700 hover:to-red-700 shadow-md shadow-red-500/20">
              <Loader2 v-if="isSubmitting" class="w-3.5 h-3.5 animate-spin" />
              <Send v-else class="w-3.5 h-3.5" />
              {{ isSubmitting ? 'Mengirim...' : 'Kirim Ide' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-24">
      <Loader2 class="w-8 h-8 animate-spin text-red-500 mb-3" />
      <p class="text-xs text-slate-400 animate-pulse">Memuat timeline...</p>
    </div>

    <!-- Error -->
    <div v-else-if="fetchError" class="p-6 text-center bg-red-50 dark:bg-red-950/20 rounded-2xl border border-red-200 dark:border-red-900/30">
      <AlertCircle class="w-8 h-8 mx-auto mb-2 text-red-500" />
      <p class="text-xs font-bold text-red-600 dark:text-red-400 mb-1">{{ fetchError }}</p>
      <p class="text-[11px] text-slate-400">
        Pastikan tabel <code class="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">marketing_ideas</code> sudah dibuat di Supabase.
      </p>
      <button @click="fetchIdeas" class="mt-3 px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl">Coba Lagi</button>
    </div>

    <!-- Main Content (Feed vs Calendar) -->
    <div v-else>
      <!-- Empty Feed -->
      <div v-if="digitalViewMode === 'feed' && filteredIdeas.length === 0"
        class="py-20 text-center bg-white dark:bg-[#1e293b] rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
        <div class="text-5xl mb-3">💡</div>
        <h3 class="text-sm font-black text-slate-700 dark:text-slate-300">Belum ada ide konten</h3>
        <p class="text-xs text-slate-400 mt-1">Jadilah yang pertama! Klik kolom di atas untuk berbagi ide.</p>
      </div>

      <!-- TIMELINE FEED VIEW -->
      <div v-else-if="digitalViewMode === 'feed'" class="space-y-4">
        <div v-for="idea in displayedIdeas" :key="idea.id"
        class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">

        <!-- Post Header -->
        <div class="flex items-start gap-3 p-4 pb-3">
          <!-- Avatar -->
          <div class="w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-black shrink-0 shadow-sm"
            :class="getAvatarColor(idea.submitted_by)">
            {{ getInitials(idea.submitted_by) }}
          </div>

          <div class="flex-1 min-w-0">
            <!-- Name + time + platforms -->
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="text-sm font-black text-slate-900 dark:text-white leading-tight">
                  {{ idea.submitted_by?.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()) }}
                </p>
                <div class="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span class="text-[10px] text-slate-400">{{ formatTime(idea.created_at) }}</span>
                  <span class="text-slate-300 dark:text-slate-700">·</span>
                  <!-- Platform badges -->
                  <span v-for="plt in (Array.isArray(idea.platforms) && idea.platforms.length ? idea.platforms : [idea.platform])" :key="plt"
                    class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-black"
                    :class="platformBg[plt] || 'bg-slate-100 text-slate-500'">
                    <img v-if="getPlatform(plt).icon" :src="`/${getPlatform(plt).icon}`" class="w-2.5 h-2.5 object-contain" :alt="getPlatform(plt).label" />
                    <span v-else-if="getPlatform(plt).emoji">{{ getPlatform(plt).emoji }}</span>
                    <span>{{ getPlatform(plt).label }}</span>
                  </span>
                  <!-- Target Date Badge -->
                  <span v-if="idea.target_date" class="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10 px-1.5 py-0.5 rounded-md ml-1">
                    🎯 {{ new Date(idea.target_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) }}
                  </span>
                </div>
              </div>

              <!-- Status + Menu -->
              <div class="flex items-center gap-2 shrink-0">
                <span class="px-2.5 py-1 rounded-xl text-[11px] md:text-xs font-black border-2"
                  :class="getStatus(idea.status).cls">
                  {{ getStatus(idea.status).emoji }} {{ getStatus(idea.status).label }}
                </span>
                
                <!-- Pin Button -->
                <button @click="togglePriority(idea)"
                  class="p-1.5 rounded-lg transition-colors border"
                  :title="idea.tags?.includes('PRIORITY') ? 'Lepas Prioritas' : 'Jadikan Prioritas'"
                  :class="idea.tags?.includes('PRIORITY') ? 'bg-amber-100 border-amber-200 text-amber-600 dark:bg-amber-500/20 dark:border-amber-500/30 dark:text-amber-400' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 border-transparent'">
                  <Pin class="w-4 h-4" :class="{ 'fill-current': idea.tags?.includes('PRIORITY') }" />
                </button>

                <!-- More menu -->
                <div class="relative">
                  <button @click="openMenuId = openMenuId===idea.id ? null : idea.id"
                    class="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                    <MoreHorizontal class="w-4 h-4" />
                  </button>
                  <div v-if="openMenuId === idea.id"
                    class="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl z-20 overflow-hidden">
                    <p class="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">Pindah Tahap</p>
                    <button v-for="s in STATUS_FLOW.filter(k => k !== idea.status)" :key="s"
                      @click="handleStatusSelect(idea.id, s)"
                      class="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white transition-colors text-left">
                      {{ getStatus(s).emoji }} {{ getStatus(s).label }}
                    </button>
                    
                    <template v-if="userRole === 'ADMIN'">
                      <div class="h-px bg-slate-100 dark:bg-slate-800 my-1"></div>
                      <button @click="deleteIdea(idea.id)"
                        class="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left">
                        🗑️ Hapus Ide
                      </button>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Post Content -->
        <div class="px-4 pb-3">
          <p class="text-base font-normal text-slate-900 dark:text-white leading-snug mb-2 font-sans">{{ idea.title }}</p>
          <p v-if="parseIdeaDescription(idea.description).text" class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-sans mb-2">{{ parseIdeaDescription(idea.description).text }}</p>
          
          <!-- Reference Preview as Post Image -->
          <div v-if="parseIdeaDescription(idea.description).driveLink" class="mt-3 mb-3 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 max-w-[320px] aspect-[4/5] relative group">
            <a :href="parseIdeaDescription(idea.description).originalLink" target="_blank" class="absolute top-2 right-2 bg-black/50 hover:bg-black/80 text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 backdrop-blur-sm" title="Buka di tab baru">
              <ExternalLink class="w-4 h-4" />
            </a>
            <a :href="parseIdeaDescription(idea.description).originalLink" target="_blank" class="absolute inset-0 z-10 block cursor-pointer" title="Lihat Penuh"></a>
            <iframe :src="parseIdeaDescription(idea.description).driveLink" class="absolute top-0 left-0 w-full h-[calc(100%+60px)] border-0 pointer-events-none" allow="autoplay"></iframe>
          </div>
          <!-- Tags -->
          <div v-if="idea.tags && idea.tags.length" class="flex flex-wrap gap-1">
            <span v-for="tag in idea.tags" :key="tag"
              class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-bold rounded-full">
              #{{ tag }}
            </span>
          </div>
        </div>

        <!-- Like/Comment Count Bar -->
        <div v-if="(idea.likes||[]).length || (idea.comments||[]).length"
          class="px-4 pb-2 flex items-center justify-between text-[11px] text-slate-400">
          <span v-if="(idea.likes||[]).length">
            👍 {{ (idea.likes||[]).length }} suka
          </span>
          <span class="ml-auto" v-if="(idea.comments||[]).length">
            {{ (idea.comments||[]).length }} komentar
          </span>
        </div>

        <!-- Action Buttons (Facebook style) -->
        <div class="flex border-t border-slate-100 dark:border-slate-800 px-1">
          <button @click="toggleLike(idea)"
            class="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold transition-colors"
            :class="(idea.likes||[]).some(l=>l.user_email===currentUser)
              ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/10'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-700 dark:hover:text-slate-300'">
            <ThumbsUp class="w-4 h-4" :fill="(idea.likes||[]).some(l=>l.user_email===currentUser)?'currentColor':'none'" />
            Suka
          </button>
          <button @click="commentTarget = commentTarget===idea.id ? null : idea.id"
            class="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            <MessageCircle class="w-4 h-4" />
            Komentar
          </button>
        </div>

        <!-- Comments Section -->
        <div v-if="commentTarget===idea.id || (idea.comments||[]).length > 0" class="px-4 py-3 space-y-3 bg-slate-50/50 dark:bg-slate-900/20 rounded-b-2xl">
          <!-- Existing Comments (Tree) -->
          <template v-for="c in buildCommentTree(idea.comments)" :key="c.id">
            <!-- Top level comment -->
            <div class="flex gap-2.5">
              <div class="w-7 h-7 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[9px] font-black shrink-0"
                :class="getAvatarColor(c.created_by)">
                {{ getInitials(c.created_by) }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="bg-white dark:bg-[#1e293b] rounded-2xl px-3 py-2 inline-block max-w-full border border-slate-100 dark:border-slate-800">
                  <p class="text-[11px] font-black text-slate-800 dark:text-slate-200 mb-0.5">
                    {{ c.created_by?.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()) }}
                  </p>
                  <p v-if="parseIdeaDescription(c._parsedText).text" class="text-xs text-slate-600 dark:text-slate-400 font-sans leading-relaxed whitespace-pre-wrap">{{ parseIdeaDescription(c._parsedText).text }}</p>
                  <div v-if="parseIdeaDescription(c._parsedText).driveLink" class="mt-2 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 max-w-[240px] aspect-[4/5] relative group">
                    <a :href="parseIdeaDescription(c._parsedText).originalLink" target="_blank" class="absolute top-2 right-2 bg-black/50 hover:bg-black/80 text-white p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity z-20 backdrop-blur-sm" title="Buka di tab baru">
                      <ExternalLink class="w-3 h-3" />
                    </a>
                    <a :href="parseIdeaDescription(c._parsedText).originalLink" target="_blank" class="absolute inset-0 z-10 block cursor-pointer" title="Lihat Penuh"></a>
                    <iframe :src="parseIdeaDescription(c._parsedText).driveLink" class="absolute top-0 left-0 w-full h-[calc(100%+60px)] border-0 pointer-events-none" allow="autoplay"></iframe>
                  </div>
                </div>
                <div class="flex items-center gap-3 mt-1 px-1">
                  <p class="text-[9px] text-slate-400">{{ formatTime(c.created_at) }}</p>
                  <button @click="setReply(c, idea.id)" class="text-[10px] font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">Balas</button>
                </div>
              </div>
            </div>

            <!-- Children (Replies) -->
            <div v-for="child in c._children" :key="child.id" class="flex gap-2.5 ml-10 mt-2 relative">
              <div class="absolute -left-[22px] -top-2 w-[16px] h-[22px] border-b-2 border-l-2 border-slate-200 dark:border-slate-700 rounded-bl-xl z-0"></div>
              
              <div class="w-6 h-6 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[8px] font-black shrink-0 relative z-10"
                :class="getAvatarColor(child.created_by)">
                {{ getInitials(child.created_by) }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="bg-white dark:bg-[#1e293b] rounded-2xl px-3 py-2 inline-block max-w-full border border-slate-100 dark:border-slate-800">
                  <p class="text-[10px] font-black text-slate-800 dark:text-slate-200 mb-0.5">
                    {{ child.created_by?.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()) }}
                  </p>
                  <p v-if="parseIdeaDescription(child._parsedText).text" class="text-[11px] text-slate-600 dark:text-slate-400 font-sans leading-relaxed whitespace-pre-wrap">{{ parseIdeaDescription(child._parsedText).text }}</p>
                  <div v-if="parseIdeaDescription(child._parsedText).driveLink" class="mt-2 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 max-w-[200px] aspect-[4/5] relative group">
                    <a :href="parseIdeaDescription(child._parsedText).originalLink" target="_blank" class="absolute top-2 right-2 bg-black/50 hover:bg-black/80 text-white p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity z-20 backdrop-blur-sm" title="Buka di tab baru">
                      <ExternalLink class="w-3 h-3" />
                    </a>
                    <a :href="parseIdeaDescription(child._parsedText).originalLink" target="_blank" class="absolute inset-0 z-10 block cursor-pointer" title="Lihat Penuh"></a>
                    <iframe :src="parseIdeaDescription(child._parsedText).driveLink" class="absolute top-0 left-0 w-full h-[calc(100%+60px)] border-0 pointer-events-none" allow="autoplay"></iframe>
                  </div>
                </div>
                <div class="flex items-center gap-3 mt-1 px-1">
                  <p class="text-[9px] text-slate-400">{{ formatTime(child.created_at) }}</p>
                  <button @click="setReply(c, idea.id)" class="text-[10px] font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">Balas</button>
                </div>
              </div>
            </div>
          </template>

          <!-- New Comment Input -->
          <div v-if="commentTarget===idea.id" class="flex gap-2.5 items-start">
            <div class="w-7 h-7 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[9px] font-black shrink-0"
              :class="getAvatarColor(currentUser)">
              {{ getInitials(currentUser) }}
            </div>
            <div class="flex-1 flex flex-col gap-2 bg-white dark:bg-[#1e293b] rounded-2xl p-2 border border-slate-200 dark:border-slate-700 focus-within:border-red-400 dark:focus-within:border-red-600 transition-colors">
              <div v-if="replyToId" class="px-3 pt-1.5 pb-2 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 rounded-xl mb-1">
                <p class="text-[10px] text-slate-500 font-bold flex items-center gap-1.5">
                  <MessageCircle class="w-3 h-3" /> Membalas {{ replyToName }}...
                </p>
                <button @click="replyToId = null; replyToName = ''" class="text-slate-400 hover:text-red-500 text-[10px] p-1">
                  Batal
                </button>
              </div>
              <div v-if="commentAttachment" class="relative inline-block mt-1 ml-2 self-start">
                <img :src="commentAttachmentPreview" class="h-16 w-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
                <button @click="removeCommentAttachment" class="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 shadow-sm">
                  <X class="w-2.5 h-2.5" />
                </button>
              </div>
              <div class="flex items-center gap-2">
                <input v-model="newComment" @keyup.enter="submitComment(idea.id)" type="text"
                  placeholder="Tulis komentar..."
                  class="flex-1 bg-transparent outline-none text-xs px-2 text-slate-700 dark:text-slate-300 placeholder-slate-400 font-sans" />
                
                <input type="file" ref="commentFileInput" class="hidden" accept="image/*,video/*" @change="onCommentFileChange" />
                <button @click="$refs.commentFileInput[0].click()"
                  class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1"
                  title="Lampirkan File">
                  <Image class="w-4 h-4" />
                </button>

                <button @click="submitComment(idea.id)"
                  class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors disabled:opacity-40 p-1"
                  :disabled="(!newComment.trim() && !commentAttachment) || isSubmittingComment">
                  <Loader2 v-if="isSubmittingComment" class="w-4 h-4 animate-spin" />
                  <Send v-else class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

        <!-- INFINITE SCROLL / LOAD MORE SENTINEL -->
        <div ref="loadMoreSentinel" class="py-6 text-center">
          <div v-if="hasMoreIdeas" class="flex flex-col items-center gap-2">
            <button @click="loadMoreIdeas" 
              class="px-6 py-2.5 rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm flex items-center gap-2">
              <Loader2 class="w-3.5 h-3.5 animate-spin text-red-500" />
              <span>Muat Lebih Banyak Postingan (Tersisa {{ filteredIdeas.length - displayLimit.value }})</span>
            </button>
          </div>
          <div v-else-if="filteredIdeas.length > 0" class="text-xs text-slate-400 dark:text-slate-500 font-medium py-2">
            🎉 Semua {{ filteredIdeas.length }} postingan telah ditampilkan
          </div>
        </div>

      </div>

    <!-- ===================== CONTENT CALENDAR VIEW ===================== -->
    <div v-else-if="digitalViewMode === 'calendar'">
      <div class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        
        <!-- Calendar Header -->
        <div class="flex items-center justify-between mb-2">
          <div>
            <h3 class="text-base font-black text-slate-900 dark:text-white">
              📅 Kalender Konten Digital — {{ monthNames[currentMonth] }} {{ currentYear }}
            </h3>
            <p class="text-xs text-slate-400">Tracking penayangan & deadline postingan media sosial</p>
          </div>
          <div class="flex gap-1">
            <button @click="prevMonth" class="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <ChevronLeft class="w-4 h-4" />
            </button>
            <button @click="nextMonth" class="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <ChevronRight class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Days Header -->
        <div class="grid grid-cols-7 mb-2">
          <div v-for="day in dayNames" :key="day" class="text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">
            {{ day }}
          </div>
        </div>

        <!-- Calendar Grid -->
        <div class="grid grid-cols-7 gap-1.5 sm:gap-2">
          <div v-for="cell in calendarCells" :key="cell.dateStr"
            class="min-h-[95px] p-1.5 rounded-xl border transition-all flex flex-col"
            :class="[
              cell.isCurrentMonth ? 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800/50' : 'bg-transparent border-transparent opacity-30',
            ]">
            
            <div class="text-xs font-bold mb-1.5 flex items-center justify-between"
              :class="cell.dateStr === new Date().toISOString().split('T')[0] ? 'text-red-500 font-black' : 'text-slate-500 dark:text-slate-400'">
              <span>{{ cell.day }}</span>
              <span v-if="cell.dateStr === new Date().toISOString().split('T')[0]" class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            </div>

            <!-- Items for this date -->
            <div class="space-y-1 flex-1 overflow-y-auto max-h-[110px] scrollbar-hide">
              <div v-for="idea in (digitalIdeasByDate[cell.dateStr] || [])" :key="idea.id"
                @click="selectedIdeaModal = idea"
                class="p-1.5 rounded-lg text-[9px] cursor-pointer font-bold transition-all border shadow-2xs hover:scale-[1.02] flex flex-col gap-0.5"
                :class="idea.status === 'published' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300' :
                        idea.status === 'scheduled' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-700 dark:text-indigo-300' :
                        'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'">
                <div class="flex items-center gap-1 justify-between">
                  <span class="inline-flex items-center gap-0.5 truncate">
                    <span v-for="plt in (Array.isArray(idea.platforms) && idea.platforms.length ? idea.platforms : [idea.platform])" :key="plt">
                      <img v-if="getPlatform(plt).icon" :src="`/${getPlatform(plt).icon}`" class="w-2.5 h-2.5 object-contain inline" :alt="plt" />
                      <span v-else-if="getPlatform(plt).emoji">{{ getPlatform(plt).emoji }}</span>
                    </span>
                  </span>
                  <span class="text-[8px] font-black uppercase px-1 rounded bg-black/5 dark:bg-white/10 shrink-0">
                    {{ getStatus(idea.status).emoji }}
                  </span>
                </div>
                <p class="truncate font-sans leading-tight text-[10px] text-slate-800 dark:text-slate-200">{{ idea.title }}</p>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
    </div> <!-- END MAIN CONTENT -->
    </div> <!-- END DIGITAL MARKETING TAB -->

    <!-- TAB: EVENT & ACTIVATION -->
    <div v-if="activeTab === 'event'" class="space-y-4">
      
      <!-- EVENT LIST VIEW -->
      <template v-if="!showEventModal">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
          <h2 class="text-lg font-bold text-slate-800 dark:text-slate-200">Daftar Event</h2>
          <div class="flex items-center gap-2">
            <div class="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <button @click="eventViewMode = 'list'"
                class="p-1.5 rounded-md transition-colors"
                :class="eventViewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'">
                <List class="w-4 h-4" />
              </button>
              <button @click="eventViewMode = 'calendar'"
                class="p-1.5 rounded-md transition-colors"
                :class="eventViewMode === 'calendar' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'">
                <Calendar class="w-4 h-4" />
              </button>
            </div>
            <button @click="openEventModal()" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-sm transition-colors">
              + Event Baru
            </button>
          </div>
        </div>

        <div v-if="eventViewMode === 'list'" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div v-for="evt in events" :key="evt.id" @click="openEventModal(evt)"
          class="bg-white dark:bg-[#1e293b] rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative group">
          
          <div class="flex justify-between items-start mb-3">
            <div>
              <span class="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold mb-2"
                :class="eventStatuses.find(s => s.key === evt.status)?.color || 'bg-slate-100 text-slate-600'">
                {{ eventStatuses.find(s => s.key === evt.status)?.label || evt.status }}
              </span>
              <h3 class="text-base font-black text-slate-900 dark:text-white">{{ evt.name }}</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {{ evt.date_start ? new Date(evt.date_start).toLocaleDateString('id-ID') : 'TBD' }} - 
                {{ evt.date_end ? new Date(evt.date_end).toLocaleDateString('id-ID') : 'TBD' }}
              </p>
            </div>
            <button @click.stop="deleteEvent(evt.id)" class="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <X class="w-4 h-4" />
            </button>
          </div>

          <!-- KPIs -->
          <div v-if="evt.kpis && evt.kpis.length" class="mt-4 space-y-3">
            <div v-for="(kpi, i) in evt.kpis" :key="i">
              <div class="flex justify-between text-[11px] font-bold mb-1">
                <span class="text-slate-600 dark:text-slate-400">{{ kpi.name }}</span>
                <span class="text-slate-900 dark:text-white">{{ kpi.actual || 0 }} / {{ kpi.target || 0 }}</span>
              </div>
              <div class="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full bg-emerald-500 rounded-full" 
                  :style="`width: ${Math.min(100, ((kpi.actual || 0) / (kpi.target || 1)) * 100)}%`"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
        <!-- End Grid View -->
        
        <div v-if="eventViewMode === 'list' && !events.length && !isLoading" class="text-center py-12 text-slate-500 dark:text-slate-400 text-sm">
          Belum ada event. Buat event pertama Anda!
        </div>

        <!-- CALENDAR VIEW -->
        <div v-if="eventViewMode === 'calendar'" class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
          
          <!-- Calendar Header -->
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-bold text-slate-800 dark:text-slate-200">
              {{ monthNames[currentMonth] }} {{ currentYear }}
            </h3>
            <div class="flex gap-1">
              <button @click="prevMonth" class="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <ChevronLeft class="w-4 h-4" />
              </button>
              <button @click="nextMonth" class="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <ChevronRight class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Calendar Days Header -->
          <div class="grid grid-cols-7 mb-2">
            <div v-for="day in dayNames" :key="day" class="text-center text-[10px] font-bold text-slate-400 uppercase">
              {{ day }}
            </div>
          </div>

          <!-- Calendar Grid cells -->
          <div class="grid grid-cols-7 gap-1 sm:gap-2">
            <div v-for="cell in calendarCells" :key="cell.dateStr" 
              class="min-h-[80px] p-1.5 rounded-xl border transition-all flex flex-col"
              :class="[
                cell.isCurrentMonth ? 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800/50' : 'bg-transparent border-transparent opacity-40',
              ]">
              
              <div class="text-xs font-bold mb-1 text-slate-600 dark:text-slate-400"
                :class="cell.dateStr === new Date().toISOString().split('T')[0] ? 'text-red-500' : ''">
                {{ cell.day }}
              </div>
              
              <div class="space-y-1 flex-1">
                <div v-for="evt in (eventsByDate[cell.dateStr] || [])" :key="evt.id" 
                  @click="openEventModal(evt)"
                  class="text-[9px] px-1.5 py-1 rounded-md truncate cursor-pointer font-bold hover:opacity-80 transition-opacity bg-red-500 text-white shadow-sm">
                  {{ evt.name }}
                </div>
              </div>

            </div>
          </div>

        </div> <!-- End Calendar View -->

      </template>

      <!-- EVENT FORM VIEW -->
      <template v-else>
        <div class="bg-white dark:bg-[#1e293b] rounded-3xl w-full overflow-hidden border border-slate-200 dark:border-slate-800 p-6 sm:p-8 mt-2 shadow-sm">
          <div class="flex justify-between items-center mb-8 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h3 class="text-xl font-black text-slate-900 dark:text-white">{{ editingEvent ? 'Edit Event' : 'Event Baru' }}</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Masukkan detail event dan target pencapaian (KPI) Anda.</p>
            </div>
            <button @click="showEventModal = false" class="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-full transition-colors">
              <X class="w-5 h-5" />
            </button>
          </div>
      
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-500 mb-1">Nama Event / Kampanye</label>
          <input type="text" v-model="newEvent.name" placeholder="Contoh: Pameran Siemens"
            class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-red-500" />
        </div>
        <div class="flex gap-4">
          <div class="flex-1">
            <label class="block text-xs font-bold text-slate-500 mb-1">Tanggal Mulai</label>
            <input type="date" v-model="newEvent.date_start"
              class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-red-500" />
          </div>
          <div class="flex-1">
            <label class="block text-xs font-bold text-slate-500 mb-1">Tanggal Selesai</label>
            <input type="date" v-model="newEvent.date_end"
              class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-red-500" />
          </div>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 mb-1">Status</label>
          <select v-model="newEvent.status"
            class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-red-500">
            <option v-for="st in eventStatuses" :key="st.key" :value="st.key">{{ st.label }}</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-500 mb-1">Detail Event</label>
          <textarea v-model="newEvent.description" rows="3" placeholder="Deskripsi event, konsep, atau catatan penting..."
            class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-red-500 resize-none"></textarea>
        </div>

        <hr class="border-slate-100 dark:border-slate-800 my-4" />

        <div>
          <div class="flex justify-between items-center mb-2">
            <label class="block text-xs font-bold text-slate-500">Target KPI Event</label>
            <button @click="addKpiField" class="text-[10px] font-bold text-red-500 hover:text-red-600">+ Tambah KPI</button>
          </div>
          
          <div v-for="(kpi, i) in newEvent.kpis" :key="i" class="flex gap-2 items-start mb-2">
            <input type="text" v-model="kpi.name" placeholder="Nama KPI (misal: Leads)"
              class="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none" />
            <input type="number" v-model="kpi.target" placeholder="Target"
              class="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none" />
            <input v-if="newEvent.status !== 'upcoming'" type="number" v-model="kpi.actual" placeholder="Aktual"
              class="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none" />
            <button v-if="newEvent.kpis.length > 1" @click="removeKpiField(i)" class="mt-2 text-slate-400 hover:text-red-500"><X class="w-4 h-4"/></button>
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-500 mb-1">Keperluan Asset (Link Google Drive)</label>
          <input type="url" v-model="newEvent.drive_link" placeholder="https://drive.google.com/..."
            class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-red-500" />
        </div>
      </div>
      
        <div class="mt-8 flex gap-3">
          <button @click="showEventModal = false" class="flex-1 py-3 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 rounded-xl transition-colors">
            Kembali
          </button>
          <button @click="saveEvent" :disabled="!newEvent.name" class="flex-1 py-3 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors disabled:opacity-50 shadow-sm">
            Simpan Event
          </button>
        </div>
        </div>
      </template>

    </div> <!-- END EVENT TAB -->

  </div>

  <!-- Target Date Modal -->
  <div v-if="showDateModal" class="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm">
    <div class="bg-white dark:bg-[#1e293b] rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 p-5">
      <h3 class="text-lg font-black text-slate-900 dark:text-white mb-2">{{ dateModalTarget?.status === 'published' ? 'Tanggal Tayang' : 'Tentukan Deadline' }}</h3>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">{{ dateModalTarget?.status === 'published' ? 'Kapan konten ini ditayangkan?' : 'Kapan ide konten ini ditargetkan untuk selesai (deadline)?' }}</p>
      
      <input type="date" v-model="selectedDate"
        class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-red-500 mb-5" />
      
      <div class="flex gap-2">
        <button @click="showDateModal = false" class="flex-1 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 rounded-xl transition-colors">Batal</button>
        <button @click="confirmStatusWithDate" :disabled="!selectedDate" class="flex-1 py-2.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors disabled:opacity-50">Simpan Status</button>
      </div>
    </div>
  </div>

  <!-- Selected Idea Modal (from Calendar View) -->
  <div v-if="selectedIdeaModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
    <div class="bg-white dark:bg-[#1e293b] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-8">
      
      <!-- Modal Header -->
      <div class="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-1 rounded-xl text-xs font-black border-2" :class="getStatus(selectedIdeaModal.status).cls">
            {{ getStatus(selectedIdeaModal.status).emoji }} {{ getStatus(selectedIdeaModal.status).label }}
          </span>
          <span v-if="selectedIdeaModal.target_date" class="text-xs font-bold text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10 px-2 py-0.5 rounded-lg">
            🎯 {{ new Date(selectedIdeaModal.target_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) }}
          </span>
        </div>
        <button @click="selectedIdeaModal = null" class="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
        <!-- Author info & platforms -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-black shadow-sm"
              :class="getAvatarColor(selectedIdeaModal.submitted_by)">
              {{ getInitials(selectedIdeaModal.submitted_by) }}
            </div>
            <div>
              <p class="text-xs font-black text-slate-900 dark:text-white leading-tight">
                {{ selectedIdeaModal.submitted_by?.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()) }}
              </p>
              <p class="text-[10px] text-slate-400">{{ formatTime(selectedIdeaModal.created_at) }}</p>
            </div>
          </div>

          <div class="flex items-center gap-1">
            <span v-for="plt in (Array.isArray(selectedIdeaModal.platforms) && selectedIdeaModal.platforms.length ? selectedIdeaModal.platforms : [selectedIdeaModal.platform])" :key="plt"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black"
              :class="platformBg[plt] || 'bg-slate-100 text-slate-500'">
              <img v-if="getPlatform(plt).icon" :src="`/${getPlatform(plt).icon}`" class="w-3 h-3 object-contain" :alt="plt" />
              <span>{{ getPlatform(plt).label }}</span>
            </span>
          </div>
        </div>

        <!-- Title & Description -->
        <div>
          <h2 class="text-lg font-black text-slate-900 dark:text-white leading-snug mb-1">{{ selectedIdeaModal.title }}</h2>
          <p v-if="parseIdeaDescription(selectedIdeaModal.description).text" class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap font-sans">{{ parseIdeaDescription(selectedIdeaModal.description).text }}</p>
        </div>

        <!-- Attached Media Preview -->
        <div v-if="parseIdeaDescription(selectedIdeaModal.description).driveLink" class="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 aspect-[4/5] max-w-[280px] relative group mx-auto">
          <a :href="parseIdeaDescription(selectedIdeaModal.description).originalLink" target="_blank" class="absolute top-2 right-2 bg-black/50 hover:bg-black/80 text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 backdrop-blur-sm" title="Buka di tab baru">
            <ExternalLink class="w-4 h-4" />
          </a>
          <a :href="parseIdeaDescription(selectedIdeaModal.description).originalLink" target="_blank" class="absolute inset-0 z-10 block cursor-pointer" title="Lihat Penuh"></a>
          <iframe :src="parseIdeaDescription(selectedIdeaModal.description).driveLink" class="absolute top-0 left-0 w-full h-[calc(100%+60px)] border-0 pointer-events-none" allow="autoplay"></iframe>
        </div>

        <!-- Quick Status Change & Priority -->
        <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-xs text-slate-400 font-bold">Status:</span>
            <button v-for="s in STATUS_FLOW.filter(k => k !== selectedIdeaModal.status)" :key="s"
              @click="handleStatusSelect(selectedIdeaModal.id, s); selectedIdeaModal.status = s"
              class="px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-red-400">
              {{ getStatus(s).emoji }} {{ getStatus(s).label }}
            </button>
          </div>
          <button @click="togglePriority(selectedIdeaModal)"
            class="px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border flex items-center gap-1 shrink-0"
            :class="selectedIdeaModal.tags?.includes('PRIORITY') ? 'bg-amber-100 border-amber-200 text-amber-600 dark:bg-amber-500/20 dark:border-amber-500/30 dark:text-amber-400' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700'">
            <Pin class="w-3.5 h-3.5" :class="{ 'fill-current': selectedIdeaModal.tags?.includes('PRIORITY') }" />
            <span>{{ selectedIdeaModal.tags?.includes('PRIORITY') ? 'Prioritas' : 'Pin' }}</span>
          </button>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
        <button @click="selectedIdeaModal = null" class="px-5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">
          Tutup
        </button>
      </div>

    </div>
  </div>
</template>
