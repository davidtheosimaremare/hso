<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { 
  Building2, 
  UserCheck, 
  Phone, 
  Mail, 
  MapPin, 
  Plus, 
  Search, 
  Pencil, 
  Trash2, 
  Clock, 
  Send, 
  MessageSquare, 
  Sparkles, 
  X,
  Loader2,
  Share2,
  Globe,
  Compass
} from 'lucide-vue-next'

// Reactive State
const leads = ref([])
const isLoading = ref(true)
const searchKey = ref('')
const selectedSource = ref('')
const selectedIndustry = ref('')

// Logged In User State
const currentUserEmail = ref('')

// Modal States
const isLeadModalOpen = ref(false)
const isSavingLead = ref(false)
const editingLeadId = ref(null)

const isActivityModalOpen = ref(false)
const activeLeadForActivity = ref(null)
const newActivityText = ref('')
const newActivityType = ref('Telepon / WA')

// Form State
const leadForm = ref({
  company_name: '',
  contact_person: '',
  phone: '',
  email: '',
  industry_type: 'Panel Maker',
  address: '',
  city: '',
  source: 'Google Maps',
  notes: ''
})

const industryOptions = [
  'Panel Maker',
  'Kontraktor ME',
  'Data Center',
  'Industri / Pabrik',
  'End User / Gedung',
  'Distributor / Reseller',
  'Lainnya'
]

const sourceOptions = [
  'Google Maps',
  'Website / Inbound',
  'Referensi / Klien',
  'Pameran / Event',
  'Cold Calling / Field Sales',
  'Manual Input'
]

const sourceBadgeConfig = {
  'Google Maps': 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  'Website / Inbound': 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
  'Referensi / Klien': 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
  'Pameran / Event': 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  'Cold Calling / Field Sales': 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
  'Manual Input': 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
}

// Format Date
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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
  return `${formatted}`
}



// Fetch Leads Data
const fetchLeads = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('sales_leads')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    if (data) {
      const localTemp = leads.value.filter(l => String(l.id).startsWith('temp_'))
      leads.value = [...localTemp, ...data.filter(d => !localTemp.some(t => t.lead_code === d.lead_code))]
      localStorage.setItem('sales_leads_cache', JSON.stringify(leads.value))
    }
  } catch (err) {
    console.warn('Fallback to local storage cache for sales_leads:', err.message)
    const cached = localStorage.getItem('sales_leads_cache')
    if (cached) {
      try { leads.value = JSON.parse(cached) } catch (e) {}
    }
  } finally {
    isLoading.value = false
  }
}

// Filtered Leads List
const filteredLeads = computed(() => {
  return leads.value.filter(lead => {
    const q = searchKey.value.toLowerCase().trim()
    const matchQuery = !q || 
      (lead.company_name && lead.company_name.toLowerCase().includes(q)) ||
      (lead.contact_person && lead.contact_person.toLowerCase().includes(q)) ||
      (lead.email && lead.email.toLowerCase().includes(q)) ||
      (lead.phone && lead.phone.toLowerCase().includes(q)) ||
      (lead.city && lead.city.toLowerCase().includes(q)) ||
      (lead.lead_code && lead.lead_code.toLowerCase().includes(q))

    const matchSource = !selectedSource.value || lead.source === selectedSource.value
    const matchIndustry = !selectedIndustry.value || lead.industry_type === selectedIndustry.value

    return matchQuery && matchSource && matchIndustry
  })
})

// Statistics
const stats = computed(() => {
  const total = leads.value.length
  const gmapsCount = leads.value.filter(l => l.source === 'Google Maps').length
  const refCount = leads.value.filter(l => l.source === 'Referensi / Klien').length
  const webCount = leads.value.filter(l => l.source === 'Website / Inbound').length

  return { total, gmapsCount, refCount, webCount }
})

// Open Add / Edit Modal
const openAddModal = () => {
  isSavingLead.value = false
  editingLeadId.value = null
  leadForm.value = {
    company_name: '',
    contact_person: '',
    phone: '',
    email: '',
    industry_type: 'Panel Maker',
    address: '',
    city: '',
    source: 'Google Maps',
    notes: ''
  }
  isLeadModalOpen.value = true
}

const openEditModal = (lead) => {
  isSavingLead.value = false
  editingLeadId.value = lead.id
  leadForm.value = {
    company_name: lead.company_name || '',
    contact_person: lead.contact_person || '',
    phone: lead.phone || '',
    email: lead.email || '',
    industry_type: lead.industry_type || 'Panel Maker',
    address: lead.address || '',
    city: lead.city || '',
    source: lead.source || 'Google Maps',
    notes: ''
  }
  isLeadModalOpen.value = true
}

// Save Lead
const saveLead = async () => {
  if (!leadForm.value.company_name.trim()) {
    alert('Nama Perusahaan / Calon Customer wajib diisi!')
    return
  }

  isSavingLead.value = true
  try {
    const nextCode = 'LEAD-' + Math.floor(100 + Math.random() * 900)
    
    if (editingLeadId.value) {
      // Update local state immediately (Optimistic Update)
      const idx = leads.value.findIndex(l => l.id === editingLeadId.value)
      if (idx > -1) {
        leads.value[idx] = { ...leads.value[idx], ...leadForm.value, updated_at: new Date().toISOString() }
      }
      isLeadModalOpen.value = false

      // Sync with Supabase
      supabase
        .from('sales_leads')
        .update({
          company_name: leadForm.value.company_name,
          contact_person: leadForm.value.contact_person,
          phone: leadForm.value.phone,
          email: leadForm.value.email,
          industry_type: leadForm.value.industry_type,
          address: leadForm.value.address,
          city: leadForm.value.city,
          source: leadForm.value.source,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingLeadId.value)
        .catch(e => console.warn('Supabase update notice:', e))
    } else {
      // Insert (Optimistic Insert)
      const initialActivity = leadForm.value.notes ? [{
        id: Date.now().toString(),
        date: new Date().toISOString(),
        type: 'Catatan Awal Lead',
        notes: leadForm.value.notes,
        author: currentUserEmail.value || 'Sales'
      }] : []

      const tempId = 'temp_' + Date.now()
      const newLeadPayload = {
        id: tempId,
        lead_code: nextCode,
        company_name: leadForm.value.company_name,
        contact_person: leadForm.value.contact_person,
        phone: leadForm.value.phone,
        email: leadForm.value.email,
        industry_type: leadForm.value.industry_type,
        address: leadForm.value.address,
        city: leadForm.value.city,
        source: leadForm.value.source,
        activities: initialActivity,
        created_by: currentUserEmail.value,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      leads.value.unshift(newLeadPayload)
      isLeadModalOpen.value = false
      localStorage.setItem('sales_leads_cache', JSON.stringify(leads.value))

      const { data, error } = await supabase
        .from('sales_leads')
        .insert({
          lead_code: nextCode,
          company_name: leadForm.value.company_name,
          contact_person: leadForm.value.contact_person,
          phone: leadForm.value.phone,
          email: leadForm.value.email,
          industry_type: leadForm.value.industry_type,
          address: leadForm.value.address,
          city: leadForm.value.city,
          source: leadForm.value.source,
          activities: initialActivity,
          created_by: currentUserEmail.value,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (!error && data) {
        const idx = leads.value.findIndex(l => l.id === tempId || l.lead_code === nextCode)
        if (idx > -1) {
          leads.value[idx] = data
        }
      }
    }

    localStorage.setItem('sales_leads_cache', JSON.stringify(leads.value))
    isLeadModalOpen.value = false
  } catch (err) {
    alert('Gagal menyimpan lead: ' + err.message)
  } finally {
    isSavingLead.value = false
  }
}

// Delete Lead
const deleteLead = async (id) => {
  if (!confirm('Apakah Anda yakin ingin menghapus data lead ini?')) return
  
  // Optimistic local delete
  leads.value = leads.value.filter(l => l.id !== id)
  localStorage.setItem('sales_leads_cache', JSON.stringify(leads.value))

  supabase.from('sales_leads').delete().eq('id', id).catch(e => console.warn('Supabase delete notice:', e))
}

// Open Activity Modal
const openActivityModal = (lead) => {
  activeLeadForActivity.value = lead
  newActivityText.value = ''
  newActivityType.value = 'Telepon / WA'
  isActivityModalOpen.value = true
}

// Add Sales Activity Note
const addActivityLog = async () => {
  if (!newActivityText.value.trim() || !activeLeadForActivity.value) return

  const newLog = {
    id: Date.now().toString(),
    date: new Date().toISOString(),
    type: newActivityType.value,
    notes: newActivityText.value.trim(),
    author: currentUserEmail.value || 'Sales'
  }

  const existingActivities = Array.isArray(activeLeadForActivity.value.activities) 
    ? [...activeLeadForActivity.value.activities] 
    : []

  existingActivities.unshift(newLog)

  activeLeadForActivity.value.activities = existingActivities
  
  const idx = leads.value.findIndex(l => l.id === activeLeadForActivity.value.id)
  if (idx > -1) {
    leads.value[idx].activities = existingActivities
  }

  localStorage.setItem('sales_leads_cache', JSON.stringify(leads.value))
  newActivityText.value = ''

  supabase
    .from('sales_leads')
    .update({ activities: existingActivities, updated_at: new Date().toISOString() })
    .eq('id', activeLeadForActivity.value.id)
    .catch(e => console.warn('Supabase activity log update notice:', e))
}

onMounted(() => {
  try {
    const rawUser = localStorage.getItem('hir_user_session')
    if (rawUser) {
      const u = JSON.parse(rawUser)
      currentUserEmail.value = u.email || ''
    }
  } catch (e) {}

  fetchLeads()
})
</script>

<template>
  <div class="p-4 md:p-6 w-full max-w-[1600px] mx-auto space-y-6">

    <!-- Header Banner -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
            <Building2 class="w-6 h-6" />
          </span>
          <h1 class="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Database Lead Sales
          </h1>
        </div>
        <p class="text-xs md:text-sm text-slate-500 dark:text-slate-400">
          Pencatatan data calon customer (Panel Maker, Kontraktor ME, Data Center), asal sumber lead, serta aktivitas yang telah dilakukan oleh sales.
        </p>
      </div>

      <button
        @click="openAddModal"
        class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer shrink-0"
      >
        <Plus class="w-4 h-4" />
        <span>Tambah Data Lead</span>
      </button>
    </div>

    <!-- Stat Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
        <p class="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Total Data Lead</p>
        <p class="text-xl md:text-2xl font-black text-slate-900 dark:text-white">{{ stats.total }}</p>
      </div>

      <div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
        <p class="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">Dari Google Maps</p>
        <p class="text-xl md:text-2xl font-black text-emerald-600 dark:text-emerald-400">{{ stats.gmapsCount }}</p>
      </div>

      <div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
        <p class="text-[10px] font-bold uppercase text-purple-600 dark:text-purple-400 tracking-wider">Dari Referensi / Klien</p>
        <p class="text-xl md:text-2xl font-black text-purple-600 dark:text-purple-400">{{ stats.refCount }}</p>
      </div>

      <div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
        <p class="text-[10px] font-bold uppercase text-sky-600 dark:text-sky-400 tracking-wider">Dari Website / Inbound</p>
        <p class="text-xl md:text-2xl font-black text-sky-600 dark:text-sky-400">{{ stats.webCount }}</p>
      </div>
    </div>

    <!-- Controls: Search & Filters -->
    <div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
      
      <!-- Search Input -->
      <div class="relative flex-1 min-w-[240px]">
        <Search class="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        <input 
          v-model="searchKey" 
          type="text" 
          placeholder="Cari nama perusahaan, PIC, no. HP, kota..." 
          class="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-red-500" 
        />
        <button v-if="searchKey" @click="searchKey = ''" class="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
          <X class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Filters -->
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Source Filter -->
        <select 
          v-model="selectedSource" 
          class="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
        >
          <option value="">Semua Sumber Lead</option>
          <option v-for="src in sourceOptions" :key="src" :value="src">{{ src }}</option>
        </select>

        <!-- Industry Filter -->
        <select 
          v-model="selectedIndustry" 
          class="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
        >
          <option value="">Semua Industri</option>
          <option v-for="ind in industryOptions" :key="ind" :value="ind">{{ ind }}</option>
        </select>
      </div>

    </div>

    <!-- Data Table View -->
    <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      
      <!-- Loading State -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-16">
        <Loader2 class="w-7 h-7 animate-spin text-red-500 mb-3" />
        <p class="text-xs text-slate-500 font-medium">Memuat database lead...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredLeads.length === 0" class="text-center py-16 space-y-3">
        <Building2 class="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700" />
        <p class="text-sm font-bold text-slate-600 dark:text-slate-400">Belum ada data lead yang tersimpan.</p>
        <button @click="openAddModal" class="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 hover:underline">
          <Plus class="w-3.5 h-3.5" /> Tambah Lead Pertama
        </button>
      </div>

      <!-- Data Table -->
      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-black uppercase tracking-wider">
              <th class="py-3.5 px-4">Nama Perusahaan</th>
              <th class="py-3.5 px-4">PIC / Kontak Person</th>
              <th class="py-3.5 px-4">Industri & Kota</th>
              <th class="py-3.5 px-4">Sumber Lead</th>
              <th class="py-3.5 px-4 text-right">Aktivitas Sales & Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80">
            <tr v-for="lead in filteredLeads" :key="lead.id" class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
              
              <!-- Company Name -->
              <td class="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                <div class="space-y-0.5">
                  <div class="flex items-center gap-1.5">
                    <span v-if="lead.lead_code" class="text-[9px] font-black text-slate-400">[{{ lead.lead_code }}]</span>
                    <span class="text-sm font-extrabold text-slate-900 dark:text-white">{{ lead.company_name }}</span>
                  </div>
                </div>
              </td>

              <!-- PIC & Contact -->
              <td class="py-3.5 px-4">
                <div class="space-y-1">
                  <p class="font-bold text-slate-800 dark:text-slate-200">{{ lead.contact_person || '-' }}</p>
                  <div class="flex items-center gap-2 text-[11px] text-slate-500">
                    <span v-if="lead.phone" class="inline-flex items-center gap-1"><Phone class="w-3 h-3 text-emerald-500" /> {{ lead.phone }}</span>
                    <span v-if="lead.email" class="inline-flex items-center gap-1 truncate max-w-[140px]" :title="lead.email"><Mail class="w-3 h-3 text-sky-500" /> {{ lead.email }}</span>
                  </div>
                </div>
              </td>

              <!-- Industry & City -->
              <td class="py-3.5 px-4">
                <div class="space-y-1">
                  <span class="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold">
                    {{ lead.industry_type || 'Lainnya' }}
                  </span>
                  <p class="text-[11px] text-slate-500 flex items-center gap-1">
                    <MapPin class="w-3 h-3 text-red-500 shrink-0" />
                    <span>{{ lead.city || lead.address || '-' }}</span>
                  </p>
                </div>
              </td>

              <!-- Source -->
              <td class="py-3.5 px-4">
                <span 
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border shadow-xs"
                  :class="sourceBadgeConfig[lead.source] || 'bg-slate-100 text-slate-700'"
                >
                  <Globe v-if="lead.source === 'Website / Inbound'" class="w-3 h-3" />
                  <Compass v-else-if="lead.source === 'Google Maps'" class="w-3 h-3" />
                  <span>{{ lead.source || 'Manual Input' }}</span>
                </span>
              </td>



              <!-- Actions & Activity Log -->
              <td class="py-3.5 px-4 text-right">
                <div class="flex items-center justify-end gap-2">
                  <button 
                    @click="openActivityModal(lead)" 
                    class="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-xs"
                    title="Lihat & Catat Aktivitas Sales"
                  >
                    <MessageSquare class="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                    <span>Aktivitas Sales ({{ (lead.activities || []).length }})</span>
                  </button>

                  <button 
                    @click="openEditModal(lead)" 
                    class="p-1.5 text-slate-500 hover:text-red-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Edit Lead"
                  >
                    <Pencil class="w-3.5 h-3.5" />
                  </button>

                  <button 
                    @click="deleteLead(lead.id)" 
                    class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    title="Hapus Lead"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>

            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Add / Edit Lead -->
    <div v-if="isLeadModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div class="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
        
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 class="w-5 h-5 text-red-600" />
            <span>{{ editingLeadId ? 'Edit Data Lead' : 'Tambah Data Lead Baru' }}</span>
          </h3>
          <button @click="isLeadModalOpen = false" class="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
            <X class="w-5 h-5" />
          </button>
        </div>

        <form @submit.prevent="saveLead" class="space-y-3.5 text-xs">
          
          <!-- Company Name -->
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">Nama Perusahaan / Calon Customer <span class="text-red-500">*</span></label>
            <input 
              v-model="leadForm.company_name" 
              type="text" 
              placeholder="Contoh: PT. Elektrika Panel Nusantara" 
              required
              class="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-red-500" 
            />
          </div>

          <!-- Industry & Source -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">Kategori / Industri</label>
              <select v-model="leadForm.industry_type" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-red-500 font-semibold">
                <option v-for="ind in industryOptions" :key="ind" :value="ind">{{ ind }}</option>
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">Sumber Lead (Dari Mana)</label>
              <select v-model="leadForm.source" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-red-500 font-semibold">
                <option v-for="src in sourceOptions" :key="src" :value="src">{{ src }}</option>
              </select>
            </div>
          </div>

          <!-- Contact Person & Phone -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">PIC / Kontak Person</label>
              <input v-model="leadForm.contact_person" type="text" placeholder="Nama Pak Budi (Procurement)" class="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-red-500" />
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">No. HP / WhatsApp</label>
              <input v-model="leadForm.phone" type="text" placeholder="081234567890" class="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-red-500" />
            </div>
          </div>

          <!-- Email & City -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">Email</label>
              <input v-model="leadForm.email" type="email" placeholder="budi@elektrika.co.id" class="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-red-500" />
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">Kota / Lokasi</label>
              <input v-model="leadForm.city" type="text" placeholder="Cikarang / Surabaya" class="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-red-500" />
            </div>
          </div>

          <!-- Full Address -->
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">Alamat Lengkap</label>
            <input v-model="leadForm.address" type="text" placeholder="Jl. Industri Raya No. 12, Cikarang" class="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-red-500" />
          </div>

          <!-- Initial Notes (Only on Add) -->
          <div v-if="!editingLeadId">
            <label class="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">Catatan Awal / Spesifikasi Kebutuhan</label>
            <textarea v-model="leadForm.notes" rows="2" placeholder="Tuliskan catatan awal seputar lead ini..." class="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-red-500"></textarea>
          </div>

          <!-- Footer Actions -->
          <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button type="button" @click="isLeadModalOpen = false" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold cursor-pointer">
              Batal
            </button>
            <button type="submit" :disabled="isSavingLead" class="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer inline-flex items-center gap-1.5">
              <Loader2 v-if="isSavingLead" class="w-4 h-4 animate-spin" />
              <span>{{ editingLeadId ? 'Simpan Perubahan' : 'Tambah Data Lead' }}</span>
            </button>
          </div>

        </form>
      </div>
    </div>

    <!-- Modal Activity Logs History & New Log -->
    <div v-if="isActivityModalOpen && activeLeadForActivity" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div class="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
        
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 class="text-base font-bold text-slate-900 dark:text-white">
              Riwayat & Catatan Aktivitas Sales
            </h3>
            <p class="text-xs text-red-600 dark:text-red-400 font-bold">
              {{ activeLeadForActivity.company_name }}
            </p>
          </div>
          <button @click="isActivityModalOpen = false" class="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Add New Log Input -->
        <div class="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2.5">
          <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Catat Aktivitas Baru</label>
          <div class="flex items-center gap-2">
            <select v-model="newActivityType" class="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold">
              <option value="Telepon / WA">Telepon / WA</option>
              <option value="Email / Surat">Email / Surat</option>
              <option value="Meeting Offline">Meeting Offline</option>
              <option value="Survey Lokasi">Survey Lokasi</option>
              <option value="Kirim Katalog / Info">Kirim Katalog / Info</option>
            </select>
          </div>
          <textarea 
            v-model="newActivityText" 
            rows="2.5" 
            placeholder="Tuliskan aktivitas yang sudah dilakukan sales (misal: Telepon PIC Pak Budi, beliau minati catalog MCCB 3VA)..." 
            class="w-full p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:ring-1 focus:ring-red-500"
          ></textarea>
          <button 
            @click="addActivityLog" 
            class="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            <Send class="w-3.5 h-3.5" />
            <span>Simpan Catatan Aktivitas</span>
          </button>
        </div>

        <!-- Activity Timeline -->
        <div class="space-y-3 pt-2">
          <h4 class="text-xs font-black uppercase text-slate-400 tracking-wider">Histori Aktivitas Sales ({{ (activeLeadForActivity.activities || []).length }})</h4>
          
          <div v-if="(!activeLeadForActivity.activities || activeLeadForActivity.activities.length === 0)" class="text-center py-6 text-xs text-slate-400 italic">
            Belum ada catatan aktivitas sales.
          </div>

          <div v-else class="space-y-2.5">
            <div 
              v-for="act in activeLeadForActivity.activities" 
              :key="act.id || act.date" 
              class="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs space-y-1"
            >
              <div class="flex items-center justify-between">
                <span class="px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-[10px] font-bold">
                  {{ act.type || 'Aktivitas' }}
                </span>
                <span class="text-[10px] text-slate-400">{{ formatDate(act.date) }}</span>
              </div>
              <p class="text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                {{ act.notes }}
              </p>
              <p class="text-[10px] text-slate-400 pt-1">Oleh: {{ getUserDisplayName(act.author) }}</p>
            </div>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>
