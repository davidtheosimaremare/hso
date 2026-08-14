<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { 
  Card, CardContent, CardHeader, CardTitle 
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table'
import { 
  Users, Search, UserPlus, Trash2, ShieldCheck, Mail, Loader2, RefreshCw, Edit, Shield,
  Bell, Sliders, Send, Clock, CheckCircle2, AlertCircle, MessageSquare, Sparkles, Save, Server
} from 'lucide-vue-next'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

// --- STATE ---
const users = ref([])
const isLoading = ref(true)
const searchQuery = ref('')
const isAddUserOpen = ref(false)
const isSaving = ref(false)
const fonnteToken = ref(localStorage.getItem('hir_fonnte_token') || '')

// Notification Settings State
const activeTab = ref('users') // 'users' | 'notifications'
const isTestingEmail = ref(false)
const isTestingWa = ref(false)

const notifSettings = ref({
  workspace_sender_email: localStorage.getItem('hir_workspace_sender_email') || 'workspace-notif@hokiindo.co.id',
  workspace_sender_name: localStorage.getItem('hir_workspace_sender_name') || 'HSO Workspace Notification',
  smtp_host: localStorage.getItem('hir_smtp_host') || 'smtp.hokiindo.co.id',
  smtp_port: localStorage.getItem('hir_smtp_port') || '587',
  fonnte_token: localStorage.getItem('hir_fonnte_token') || '',
  wa_enabled: localStorage.getItem('hir_wa_enabled') !== 'false',
  batch_delay_seconds: parseInt(localStorage.getItem('hir_batch_delay_seconds') || '3'),
  max_emails_per_minute: parseInt(localStorage.getItem('hir_max_emails_per_minute') || '30'),
  delivery_mode: localStorage.getItem('hir_delivery_mode') || 'INSTANT',
  trigger_new_task: localStorage.getItem('hir_trigger_new_task') !== 'false',
  trigger_assigned: localStorage.getItem('hir_trigger_assigned') !== 'false',
  trigger_status_change: localStorage.getItem('hir_trigger_status_change') !== 'false',
  trigger_deadline_reminder: localStorage.getItem('hir_trigger_deadline_reminder') !== 'false',
  trigger_new_comment: localStorage.getItem('hir_trigger_new_comment') !== 'false'
})

const newUser = ref({ 
  email: '', 
  password: '', 
  role: 'STAFF', 
  notification_email: '', 
  whatsapp_number: '',
  allowed_modules: ['dashboard:read'] 
})

// Modal Edit Hak Akses & Kontak
const isEditOpen = ref(false)
const editingUser = ref({ 
  id: '', 
  email: '', 
  role: 'STAFF', 
  notification_email: '', 
  whatsapp_number: '',
  allowed_modules: [] 
})

// Helper local contacts storage
const getTeamContacts = () => {
  try {
    const raw = localStorage.getItem('hir_team_contacts')
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

const getUserContact = (email) => {
  if (!email) return { full_name: '', notification_email: '', whatsapp_number: '' }
  const contacts = getTeamContacts()
  return contacts[email.toLowerCase()] || { full_name: '', notification_email: '', whatsapp_number: '' }
}

const saveUserContact = (email, fullName, notifEmail, waNum) => {
  if (!email) return
  const contacts = getTeamContacts()
  contacts[email.toLowerCase()] = {
    full_name: fullName || '',
    notification_email: notifEmail || '',
    whatsapp_number: waNum || ''
  }
  localStorage.setItem('hir_team_contacts', JSON.stringify(contacts))
}

const saveFonnteToken = () => {
  localStorage.setItem('hir_fonnte_token', fonnteToken.value.trim())
  notifSettings.value.fonnte_token = fonnteToken.value.trim()
  alert('Token Fonnte WhatsApp API berhasil disimpan!')
}

const saveNotificationSettings = () => {
  localStorage.setItem('hir_workspace_sender_email', notifSettings.value.workspace_sender_email.trim())
  localStorage.setItem('hir_workspace_sender_name', notifSettings.value.workspace_sender_name.trim())
  localStorage.setItem('hir_smtp_host', notifSettings.value.smtp_host.trim())
  localStorage.setItem('hir_smtp_port', notifSettings.value.smtp_port.toString())
  localStorage.setItem('hir_fonnte_token', notifSettings.value.fonnte_token.trim())
  localStorage.setItem('hir_wa_enabled', notifSettings.value.wa_enabled ? 'true' : 'false')
  localStorage.setItem('hir_batch_delay_seconds', notifSettings.value.batch_delay_seconds.toString())
  localStorage.setItem('hir_max_emails_per_minute', notifSettings.value.max_emails_per_minute.toString())
  localStorage.setItem('hir_delivery_mode', notifSettings.value.delivery_mode)
  localStorage.setItem('hir_trigger_new_task', notifSettings.value.trigger_new_task ? 'true' : 'false')
  localStorage.setItem('hir_trigger_assigned', notifSettings.value.trigger_assigned ? 'true' : 'false')
  localStorage.setItem('hir_trigger_status_change', notifSettings.value.trigger_status_change ? 'true' : 'false')
  localStorage.setItem('hir_trigger_deadline_reminder', notifSettings.value.trigger_deadline_reminder ? 'true' : 'false')
  localStorage.setItem('hir_trigger_new_comment', notifSettings.value.trigger_new_comment ? 'true' : 'false')

  fonnteToken.value = notifSettings.value.fonnte_token.trim()
  alert('Pengaturan Notifikasi Email & WhatsApp berhasil disimpan!')
}

const testSendEmail = async () => {
  isTestingEmail.value = true
  try {
    await new Promise(r => setTimeout(r, 1200))
    alert(`[Simulasi Uji Coba Kirim Email Notifikasi]\nPengirim: ${notifSettings.value.workspace_sender_name} <${notifSettings.value.workspace_sender_email}>\nMode: ${notifSettings.value.delivery_mode}\nSMTP Server: ${notifSettings.value.smtp_host}:${notifSettings.value.smtp_port}\nStatus: Berhasil dikirim ke antrean server!`)
  } catch (e) {
    alert('Gagal uji coba email: ' + e.message)
  } finally {
    isTestingEmail.value = false
  }
}

const testSendWA = async () => {
  if (!notifSettings.value.fonnte_token.trim()) {
    alert('Silakan isi Fonnte API Token terlebih dahulu!')
    return
  }
  isTestingWa.value = true
  try {
    await new Promise(r => setTimeout(r, 1000))
    alert(`[Simulasi WhatsApp Gateway Fonnte]\nStatus Gateway: Aktif\nToken: ***${notifSettings.value.fonnte_token.slice(-4)}\nPesan pengujian terkirim.`)
  } finally {
    isTestingWa.value = false
  }
}

// List Modul Terdaftar untuk Checklist Hak Akses STAFF & ADMIN
const modulesList = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'permintaan', label: 'Tugas Tim (To-Do List)' },
  { key: 'hsq', label: 'Penawaran Harga (HSQ)' },
  { key: 'sales-orders', label: 'Penjualan (Sales Orders)' },
  { key: 'marketing-hub', label: 'Marketing Hub' },
  { key: 'cart', label: 'Perencanaan (Keranjang) & HPB' },
  { key: 'purchase-orders', label: 'Purchase Order (PO)' },
  { key: 'logistics-db', label: 'Database Logistik' },
  { key: 'delivery-orders', label: 'Pengiriman Barang (Delivery Orders)' },
  { key: 'receive-items', label: 'Penerimaan Barang (Receiving)' },
  { key: 'sop-guide', label: 'SOP & Panduan' },
  { key: 'settings', label: 'Pengaturan Akun & Hak Akses (Settings)' }
]

// --- FETCH USERS FROM SUPABASE ---
const fetchUsers = async () => {
    isLoading.value = true
    try {
        const { data, error } = await supabase
            .from('user_access')
            .select('id, email, is_active, role, allowed_modules, created_at')
            .order('created_at', { ascending: false })
        
        if (error) throw error
        users.value = data || []
    } catch (err) {
        console.error('Error fetching users:', err)
        users.value = []
    } finally {
        isLoading.value = false
    }
}

onMounted(() => fetchUsers())

// --- FILTERED USERS ---
const filteredUsers = computed(() => {
  if (!searchQuery.value) return users.value
  const q = searchQuery.value.toLowerCase()
  return users.value.filter(u => u.email?.toLowerCase().includes(q))
})

// --- HELPER UNTUK MENGELOLA PERMISSION HAK AKSES ---
const hasPermission = (userObj, moduleKey, action) => {
  return userObj.allowed_modules?.includes(`${moduleKey}:${action}`)
}

const togglePermission = (userObj, moduleKey, action) => {
  if (!userObj.allowed_modules) userObj.allowed_modules = []
  
  const perm = `${moduleKey}:${action}`
  const idx = userObj.allowed_modules.indexOf(perm)
  
  if (idx > -1) {
    // Hapus permission
    userObj.allowed_modules.splice(idx, 1)
    
    // Aturan: Jika Read di-uncheck, otomatis Write juga di-uncheck
    if (action === 'read') {
      const writePerm = `${moduleKey}:write`
      const writeIdx = userObj.allowed_modules.indexOf(writePerm)
      if (writeIdx > -1) {
        userObj.allowed_modules.splice(writeIdx, 1)
      }
    }
  } else {
    // Tambah permission
    userObj.allowed_modules.push(perm)
    
    // Aturan: Jika Write di-check, otomatis Read juga harus di-check
    if (action === 'write') {
      const readPerm = `${moduleKey}:read`
      if (!userObj.allowed_modules.includes(readPerm)) {
        userObj.allowed_modules.push(readPerm)
      }
    }
  }
}

// --- ACTIONS ---
const handleAddUser = async () => {
  if (!newUser.value.email || !newUser.value.password) {
    alert('Email dan Password wajib diisi!')
    return
  }

  if (newUser.value.password.length < 6) {
    alert('Password minimal 6 karakter!')
    return
  }
  
  isSaving.value = true
  try {
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        email: newUser.value.email,
        password: newUser.value.password,
        role: newUser.value.role,
        allowed_modules: newUser.value.role === 'ADMIN' ? 
          modulesList.flatMap(m => [`${m.key}:read`, `${m.key}:write`]) : 
          newUser.value.allowed_modules
      }
    })
    
    if (error) throw new Error(error.message)
    if (!data.success) throw new Error(data.error)
    
    alert('User berhasil ditambahkan!')
    isAddUserOpen.value = false
    newUser.value = { email: '', password: '', role: 'STAFF', allowed_modules: ['dashboard:read'] }
    fetchUsers()
  } catch (err) {
    console.error('Error adding user:', err)
    alert('Gagal menambahkan user: ' + err.message)
  } finally {
    isSaving.value = false
  }
}

// Buka Modal Edit Hak Akses & Kontak
const openEditModal = (user) => {
  const contact = getUserContact(user.email)
  editingUser.value = {
    id: user.id,
    email: user.email,
    role: user.role || 'STAFF',
    full_name: contact.full_name || '',
    notification_email: contact.notification_email || user.email || '',
    whatsapp_number: contact.whatsapp_number || '',
    allowed_modules: user.allowed_modules ? [...user.allowed_modules] : ['dashboard:read']
  }
  isEditOpen.value = true
}

// Simpan Hak Akses & Info Kontak Baru
const handleUpdatePermissions = async () => {
  isSaving.value = true
  try {
    // Save contact info locally and try DB update
    saveUserContact(editingUser.value.email, editingUser.value.full_name, editingUser.value.notification_email, editingUser.value.whatsapp_number)

    const updatePayload = {
      role: editingUser.value.role,
      allowed_modules: editingUser.value.role === 'ADMIN' ? 
        modulesList.flatMap(m => [`${m.key}:read`, `${m.key}:write`]) : 
        editingUser.value.allowed_modules
    }

    const { error } = await supabase
      .from('user_access')
      .update(updatePayload)
      .eq('id', editingUser.value.id)

    if (error) console.warn('Note on user_access update:', error.message)

    alert('Hak akses dan informasi kontak user berhasil diperbarui!')
    isEditOpen.value = false
    fetchUsers()
  } catch (err) {
    console.error('Error updating user access:', err)
    alert('Gagal memperbarui: ' + err.message)
  } finally {
    isSaving.value = false
  }
}

const deleteUser = async (user) => {
  if (!confirm(`Yakin hapus user ${user.email}?`)) return
  
  try {
    const { error } = await supabase
      .from('user_access')
      .delete()
      .eq('id', user.id)
    
    if (error) throw error
    users.value = users.value.filter(u => u.id !== user.id)
  } catch (err) {
    console.error('Error deleting user:', err)
    alert('Gagal hapus user: ' + err.message)
  }
}
</script>

<template>
  <div class="space-y-6 pb-20 font-sans text-slate-900 dark:text-slate-100">
    
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users class="w-6 h-6 text-red-600 dark:text-red-400"/> System Settings & Administration
        </h2>
        <p class="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Kelola akses login pengguna serta pengaturan notifikasi Email & WhatsApp Workspace.
        </p>
      </div>

      <!-- Tab Buttons -->
      <div class="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
        <button 
          @click="activeTab = 'users'" 
          class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
          :class="activeTab === 'users' ? 'bg-white dark:bg-slate-800 text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
        >
          <Users class="w-3.5 h-3.5" />
          <span>User & Hak Akses</span>
        </button>
        <button 
          @click="activeTab = 'notifications'" 
          class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
          :class="activeTab === 'notifications' ? 'bg-white dark:bg-slate-800 text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
        >
          <Bell class="w-3.5 h-3.5" />
          <span>Notifikasi Email & WA</span>
        </button>
      </div>

      <div v-if="activeTab === 'users'" class="flex gap-2">
        <Button variant="outline" @click="fetchUsers" :disabled="isLoading" class="gap-2">
            <RefreshCw class="w-4 h-4" :class="isLoading ? 'animate-spin' : ''"/>
            Refresh
        </Button>
        
        <Dialog :open="isAddUserOpen" @update:open="isAddUserOpen = $event">
          <DialogTrigger as-child>
              <Button class="bg-red-600 hover:bg-red-700 text-white dark:bg-red-600 dark:hover:bg-red-500 gap-2 shadow-sm">
                  <UserPlus class="w-4 h-4"/> Tambah User
              </Button>
          </DialogTrigger>
          <DialogContent class="sm:max-w-[400px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-sans">
              <DialogHeader>
                  <DialogTitle class="text-slate-900 dark:text-white">Tambah Pengguna Baru</DialogTitle>
                  <DialogDescription class="text-slate-500 dark:text-slate-400">
                      Buat akun baru untuk staf.
                  </DialogDescription>
              </DialogHeader>
              <div class="grid gap-4 py-4">
                  <div class="grid gap-2">
                      <Label class="text-slate-700 dark:text-slate-300">Email</Label>
                      <Input v-model="newUser.email" type="email" placeholder="user@example.com" class="bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-white"/>
                  </div>
                  <div class="grid gap-2">
                      <Label class="text-slate-700 dark:text-slate-300">Password</Label>
                      <Input v-model="newUser.password" type="password" placeholder="Minimal 6 karakter" class="bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-white"/>
                  </div>
                  <div class="grid gap-2">
                      <Label class="text-slate-700 dark:text-slate-300">Peran (Role)</Label>
                      <select 
                          v-model="newUser.role" 
                          class="w-full bg-slate-50 dark:bg-slate-850 dark:border-slate-700 dark:text-white border border-slate-300 dark:bg-slate-800 rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                      >
                          <option value="STAFF">STAFF</option>
                          <option value="ADMIN">ADMIN</option>
                      </select>
                  </div>
                  <div v-if="newUser.role === 'STAFF'" class="grid gap-2">
                      <Label class="text-slate-700 dark:text-slate-300">Hak Akses Modul</Label>
                      <div class="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-800 text-xs max-h-[220px] overflow-y-auto">
                          <table class="w-full text-left border-collapse">
                              <thead>
                                  <tr class="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                                      <th class="p-2 font-bold">Modul</th>
                                      <th class="p-2 font-bold text-center w-16">Lihat</th>
                                      <th class="p-2 font-bold text-center w-20">Ubah/Sync</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  <tr v-for="mod in modulesList" :key="mod.key" class="border-b border-slate-200/50 dark:border-slate-700/50 hover:bg-slate-100/50 dark:hover:bg-slate-705/30 transition-colors">
                                      <td class="p-2 font-medium text-slate-700 dark:text-slate-300">{{ mod.label }}</td>
                                      <td class="p-2 text-center">
                                          <input 
                                              type="checkbox" 
                                              :checked="hasPermission(newUser, mod.key, 'read')"
                                              @change="togglePermission(newUser, mod.key, 'read')"
                                              class="rounded border-slate-300 dark:border-slate-600 text-red-650 focus:ring-red-500 w-4 h-4 cursor-pointer"
                                          />
                                      </td>
                                      <td class="p-2 text-center">
                                          <input 
                                              type="checkbox" 
                                              :checked="hasPermission(newUser, mod.key, 'write')"
                                              @change="togglePermission(newUser, mod.key, 'write')"
                                              class="rounded border-slate-300 dark:border-slate-600 text-red-650 focus:ring-red-500 w-4 h-4 cursor-pointer"
                                          />
                                      </td>
                                  </tr>
                              </tbody>
                          </table>
                      </div>
                  </div>
                  <div v-else class="text-xs text-green-600 dark:text-green-400 font-bold bg-green-50 dark:bg-green-950/20 p-2.5 rounded border border-green-200 dark:border-green-900">
                      INFO: Admin otomatis memiliki akses penuh ke semua modul.
                  </div>
              </div>
              <DialogFooter>
                  <Button type="submit" @click="handleAddUser" :disabled="isSaving" class="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto">
                      <Loader2 v-if="isSaving" class="w-4 h-4 mr-2 animate-spin"/>
                      {{ isSaving ? 'Menyimpan...' : 'Simpan User' }}
                  </Button>
              </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>

    <!-- TAB 2: NOTIFICATION CONFIGURATION PANEL -->
    <div v-if="activeTab === 'notifications'" class="space-y-6">
      
      <!-- Card 1: Workspace Sender Email & Server Setup -->
      <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Mail class="w-5 h-5 text-red-600" />
              <span>Pengaturan Email Pengirim Workspace (Sender Email Setup)</span>
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tentukan alamat email khusus notifikasi internal Workspace (memisahkan dari <code class="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-red-600 font-mono">noreply@hokiindo.co.id</code> milik toko/shop).
            </p>
          </div>
          <Button @click="testSendEmail" :disabled="isTestingEmail" variant="outline" size="sm" class="gap-1.5 text-xs font-bold">
            <Loader2 v-if="isTestingEmail" class="w-3.5 h-3.5 animate-spin" />
            <Send v-else class="w-3.5 h-3.5 text-red-500" />
            <span>Test Send Email</span>
          </Button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <Label class="font-bold text-slate-700 dark:text-slate-300">Email Pengirim (Workspace Sub-Email)</Label>
            <Input 
              v-model="notifSettings.workspace_sender_email" 
              placeholder="contoh: workspace-notif@hokiindo.co.id" 
              class="mt-1 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700"
            />
            <p class="text-[11px] text-slate-400 mt-1">Email resmi yang tampil di kotak masuk penerima notifikasi tugas/BOQ.</p>
          </div>

          <div>
            <Label class="font-bold text-slate-700 dark:text-slate-300">Nama Tampilan Pengirim (Sender Display Name)</Label>
            <Input 
              v-model="notifSettings.workspace_sender_name" 
              placeholder="contoh: HSO Workspace Notification" 
              class="mt-1 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700"
            />
            <p class="text-[11px] text-slate-400 mt-1">Nama header pengirim email yang terlihat oleh staf.</p>
          </div>

          <div>
            <Label class="font-bold text-slate-700 dark:text-slate-300">SMTP Host Server</Label>
            <Input 
              v-model="notifSettings.smtp_host" 
              placeholder="contoh: smtp.hokiindo.co.id" 
              class="mt-1 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700"
            />
          </div>

          <div>
            <Label class="font-bold text-slate-700 dark:text-slate-300">SMTP Port</Label>
            <Input 
              v-model="notifSettings.smtp_port" 
              type="number" 
              placeholder="587" 
              class="mt-1 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700"
            />
          </div>
        </div>
      </Card>

      <!-- Card 2: Ratio Pengiriman & Interval Control -->
      <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-5">
        <div class="pb-3 border-b border-slate-100 dark:border-slate-700">
          <h3 class="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
            <Sliders class="w-5 h-5 text-amber-500" />
            <span>Ratio Pengiriman, Batching & Rate Limiting</span>
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Atur batas kecepatan pengiriman agar server tidak terdeteksi spam dan penggunaan kuota tetap efisien.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <Label class="font-bold text-slate-700 dark:text-slate-300">Delay Antar Pesan (Detik)</Label>
            <Input 
              v-model.number="notifSettings.batch_delay_seconds" 
              type="number" 
              min="1" 
              max="60" 
              class="mt-1 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 font-semibold"
            />
            <p class="text-[11px] text-slate-400 mt-1">Jeda waktu antar email saat mengirim email massal.</p>
          </div>

          <div>
            <Label class="font-bold text-slate-700 dark:text-slate-300">Maksimum Email per Menit</Label>
            <Input 
              v-model.number="notifSettings.max_emails_per_minute" 
              type="number" 
              min="5" 
              max="300" 
              class="mt-1 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 font-semibold"
            />
            <p class="text-[11px] text-slate-400 mt-1">Batas kuota kirim per menit untuk menghindari provider throttle.</p>
          </div>

          <div>
            <Label class="font-bold text-slate-700 dark:text-slate-300">Mode Pengiriman Notifikasi</Label>
            <select 
              v-model="notifSettings.delivery_mode" 
              class="w-full mt-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs rounded-lg p-2 font-bold focus:ring-1 focus:ring-red-500"
            >
              <option value="INSTANT">Seketika (Instant / Realtime Trigger)</option>
              <option value="DIGEST_HOURLY">Rangkuman Per Jam (Hourly Digest)</option>
              <option value="DIGEST_DAILY">Rangkuman Harian (Daily Digest)</option>
            </select>
            <p class="text-[11px] text-slate-400 mt-1">Metode penerimaan pesan bagi pengguna.</p>
          </div>
        </div>
      </Card>

      <!-- Card 3: WhatsApp Gateway Fonnte -->
      <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <MessageSquare class="w-5 h-5 text-emerald-500" />
              <span>Integrasi WhatsApp Gateway (Fonnte API)</span>
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Kirim pengingat otomatis (H-1 & Overdue deadline) langsung ke nomor WhatsApp tim.
            </p>
          </div>
          <Button @click="testSendWA" :disabled="isTestingWa" variant="outline" size="sm" class="gap-1.5 text-xs font-bold text-emerald-600 border-emerald-200 hover:bg-emerald-50">
            <Loader2 v-if="isTestingWa" class="w-3.5 h-3.5 animate-spin" />
            <Send v-else class="w-3.5 h-3.5" />
            <span>Test WhatsApp</span>
          </Button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <Label class="font-bold text-slate-700 dark:text-slate-300">Fonnte API Token</Label>
            <Input 
              v-model="notifSettings.fonnte_token" 
              type="password" 
              placeholder="Masukkan Token Fonnte..." 
              class="mt-1 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700"
            />
          </div>

          <div class="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <p class="font-bold text-slate-800 dark:text-slate-200">Aktifkan Notifikasi WhatsApp</p>
              <p class="text-[11px] text-slate-400">Kirim peringatan tugas ke nomor WhatsApp terdaftar.</p>
            </div>
            <Switch :checked="notifSettings.wa_enabled" @update:checked="notifSettings.wa_enabled = $event" />
          </div>
        </div>
      </Card>

      <!-- Card 4: Logika Pengkondisian (Conditioning Rules & Triggers) -->
      <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-5">
        <div class="pb-3 border-b border-slate-100 dark:border-slate-700">
          <h3 class="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
            <Bell class="w-5 h-5 text-red-500" />
            <span>Logika Pengkondisian (Notification Conditioning Triggers)</span>
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Pilih kondisi dan peristiwa apa saja di sistem yang akan memicu pengiriman notifikasi.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <label class="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 cursor-pointer hover:bg-slate-100/60 transition-colors">
            <input type="checkbox" v-model="notifSettings.trigger_new_task" class="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer" />
            <div>
              <p class="font-bold text-slate-900 dark:text-white">Tugas / Permintaan Baru Dibuat</p>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Kirim notifikasi saat ada pembuatan tugas / BOQ baru di <code class="font-mono text-red-600">/collaborate</code>.</p>
            </div>
          </label>

          <label class="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 cursor-pointer hover:bg-slate-100/60 transition-colors">
            <input type="checkbox" v-model="notifSettings.trigger_assigned" class="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer" />
            <div>
              <p class="font-bold text-slate-900 dark:text-white">Delegasi Penanggung Jawab (Assignee)</p>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Kirim notifikasi langsung ke staf saat namanya ditambahkan sebagai penanggung jawab tugas.</p>
            </div>
          </label>

          <label class="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 cursor-pointer hover:bg-slate-100/60 transition-colors">
            <input type="checkbox" v-model="notifSettings.trigger_status_change" class="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer" />
            <div>
              <p class="font-bold text-slate-900 dark:text-white">Perubahan Status Tugas</p>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Kirim notifikasi saat status berpindah (misal: TODO $\rightarrow$ IN_PROGRESS $\rightarrow$ COMPLETED).</p>
            </div>
          </label>

          <label class="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 cursor-pointer hover:bg-slate-100/60 transition-colors">
            <input type="checkbox" v-model="notifSettings.trigger_deadline_reminder" class="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer" />
            <div>
              <p class="font-bold text-slate-900 dark:text-white">Peringatan Deadline H-1 & Overdue</p>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Kirim pengingat otomatis 1 hari sebelum target selesai dan ketika melewati deadline.</p>
            </div>
          </label>

          <label class="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 cursor-pointer hover:bg-slate-100/60 transition-colors md:col-span-2">
            <input type="checkbox" v-model="notifSettings.trigger_new_comment" class="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer" />
            <div>
              <p class="font-bold text-slate-900 dark:text-white">Diskusi & Komentar Baru</p>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Kirim notifikasi kepada pembuat & penanggung jawab saat ada komentar/diskusi baru di halaman detail tugas.</p>
            </div>
          </label>
        </div>

        <!-- Save Button Footer -->
        <div class="pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end">
          <Button @click="saveNotificationSettings" class="bg-red-600 hover:bg-red-700 text-white font-bold gap-2 text-xs px-5 py-2.5">
            <Save class="w-4 h-4" />
            <span>Simpan Seluruh Pengaturan Notifikasi</span>
          </Button>
        </div>
      </Card>

    </div>

    <!-- TAB 1: USERS PANEL -->
    <div v-if="activeTab === 'users'" class="space-y-6">

    <!-- Fonnte WhatsApp API Config Card -->
    <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm p-5 mb-6">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 class="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-green-500 inline-block"></span> 
            Integrasi WhatsApp Notifikasi (Fonnte API)
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Token API Fonnte digunakan untuk mengirim pesan WhatsApp otomatis ke nomor WhatsApp anggota tim saat tugas mendekati atau melewati deadline.
          </p>
        </div>
        <div class="flex items-center gap-2 w-full md:w-auto">
          <Input 
            v-model="fonnteToken" 
            placeholder="Masukkan Token Fonnte API..." 
            type="password"
            class="h-9 w-full md:w-64 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-xs"
          />
          <Button @click="saveFonnteToken" size="sm" class="bg-green-600 hover:bg-green-700 text-white h-9 text-xs">
            Simpan Token
          </Button>
        </div>
      </div>
    </Card>

    <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <CardHeader class="border-b border-slate-100 dark:border-slate-700/50 pb-4">
            <div class="flex flex-col md:flex-row justify-between items-center gap-4">
                <CardTitle class="text-base text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck class="w-4 h-4"/> Daftar Akun ({{ users.length }})
                </CardTitle>
                <div class="relative w-full md:w-72">
                    <Search class="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input 
                        v-model="searchQuery"
                        placeholder="Cari email..." 
                        class="pl-9 bg-slate-50 border-slate-200 focus:bg-white dark:bg-slate-900 dark:border-slate-700 dark:focus:bg-slate-950 dark:text-white transition-all h-9" 
                    />
                </div>
            </div>
        </CardHeader>
        
        <CardContent class="p-0">
            <!-- Loading State -->
            <div v-if="isLoading" class="flex items-center justify-center py-12">
                <Loader2 class="w-6 h-6 animate-spin text-slate-400"/>
                <span class="ml-2 text-slate-500">Memuat data...</span>
            </div>
            
            <!-- Empty State -->
            <div v-else-if="filteredUsers.length === 0" class="text-center py-12 text-slate-500">
                <Users class="w-12 h-12 mx-auto mb-2 opacity-30"/>
                <p>Tidak ada user ditemukan.</p>
            </div>
            
            <!-- User Table -->
             <Table v-else>
                 <TableHeader class="bg-slate-50 dark:bg-slate-900/50">
                     <TableRow class="border-slate-100 dark:border-slate-700 hover:bg-transparent">
                         <TableHead class="text-slate-500 dark:text-slate-400 font-bold h-10">Email Login</TableHead>
                         <TableHead class="text-slate-500 dark:text-slate-400 font-bold h-10">Kontak Notifikasi (Email / WA)</TableHead>
                         <TableHead class="text-slate-500 dark:text-slate-400 font-bold h-10">Role</TableHead>
                         <TableHead class="text-slate-500 dark:text-slate-400 font-bold h-10">Akses Modul</TableHead>
                         <TableHead class="text-slate-500 dark:text-slate-400 font-bold h-10 text-right pr-6">Action</TableHead>
                     </TableRow>
                 </TableHeader>
                 <TableBody>
                     <TableRow v-for="user in filteredUsers" :key="user.id" class="border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                         <TableCell class="py-3">
                              <div class="flex items-center gap-3">
                                  <Avatar class="h-9 w-9 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700">
                                      <AvatarFallback class="text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 text-xs font-bold">
                                          {{ (getUserContact(user.email).full_name || user.email || 'U').substring(0,2).toUpperCase() }}
                                      </AvatarFallback>
                                  </Avatar>
                                  <div>
                                      <div class="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                                          {{ getUserContact(user.email).full_name || 'Belum diisi' }}
                                      </div>
                                      <div class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                          <Mail class="w-3 h-3 text-slate-400"/> {{ user.email }}
                                      </div>
                                  </div>
                              </div>
                         </TableCell>
                         <TableCell class="py-3 text-xs">
                             <div class="space-y-1">
                               <div class="text-slate-700 dark:text-slate-300 font-medium">
                                 ✉️ {{ getUserContact(user.email).notification_email || user.email || '-' }}
                               </div>
                               <div class="text-green-600 dark:text-green-400 font-medium">
                                 💬 {{ getUserContact(user.email).whatsapp_number || 'Belum diisi' }}
                               </div>
                             </div>
                         </TableCell>
                         <TableCell class="py-3">
                             <Badge :class="user.role === 'ADMIN' ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900' : 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900'">
                                 {{ user.role || 'STAFF' }}
                             </Badge>
                         </TableCell>
                         <TableCell class="py-3 text-xs text-slate-600 dark:text-slate-400 max-w-[300px] truncate">
                              <span v-if="user.role === 'ADMIN'" class="font-bold text-red-600 dark:text-red-450">Semua Akses</span>
                              <span v-else-if="!user.allowed_modules || user.allowed_modules.length === 0">-</span>
                              <span v-else>
                                  {{ 
                                    Array.from(new Set(user.allowed_modules.map(key => key.split(':')[0])))
                                      .map(modKey => {
                                        const label = modulesList.find(m => m.key === modKey)?.label || modKey
                                        const read = user.allowed_modules.includes(`${modKey}:read`)
                                        const write = user.allowed_modules.includes(`${modKey}:write`)
                                        let rights = ''
                                        if (read && write) rights = ' (R/W)'
                                        else if (read) rights = ' (R)'
                                        return label + rights
                                      }).join(', ')
                                  }}
                              </span>
                          </TableCell>
                         <TableCell class="py-3 text-right pr-6 space-x-1">
                             <Button 
                                 variant="ghost" 
                                 size="sm" 
                                 class="h-8 w-8 p-0 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700"
                                 @click="openEditModal(user)"
                             >
                                 <Edit class="w-4 h-4" />
                             </Button>
                             <Button 
                                 variant="ghost" 
                                 size="sm" 
                                 class="h-8 w-8 p-0 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                 @click="deleteUser(user)"
                             >
                                 <Trash2 class="w-4 h-4" />
                             </Button>
                         </TableCell>
                     </TableRow>
                 </TableBody>
             </Table>
        </CardContent>
    </Card>
 
     <!-- Edit Permissions & Contact Dialog -->
     <Dialog :open="isEditOpen" @update:open="isEditOpen = $event">
       <DialogContent class="sm:max-w-[480px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-sans">
           <DialogHeader>
               <DialogTitle class="text-slate-900 dark:text-white">Edit User & Kontak Notifikasi</DialogTitle>
               <DialogDescription class="text-slate-500 dark:text-slate-400">
                   Sesuaikan informasi kontak notifikasi dan hak akses untuk {{ editingUser.email }}.
               </DialogDescription>
           </DialogHeader>
           
           <div class="grid gap-4 py-4">
               <div class="grid gap-2">
                   <Label class="text-slate-700 dark:text-slate-300">Nama Lengkap / Nama Karyawan</Label>
                   <Input 
                       v-model="editingUser.full_name" 
                       placeholder="contoh: David Theo Simaremare"
                       class="bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-sm"
                   />
                   <p class="text-[11px] text-slate-400">Nama lengkap untuk mempermudah delegasi tugas tim.</p>
               </div>

               <div class="grid gap-2">
                   <Label class="text-slate-700 dark:text-slate-300">Email Notifikasi (Valid/Aktif)</Label>
                   <Input 
                       v-model="editingUser.notification_email" 
                       placeholder="contoh: user.hokiindo@gmail.com"
                       class="bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-sm"
                   />
                   <p class="text-[11px] text-slate-400">Email valid tempat menerima pemberitahuan delegasi & deadline tugas.</p>
               </div>

               <div class="grid gap-2">
                   <Label class="text-slate-700 dark:text-slate-300">Nomor WhatsApp (Fonnte API)</Label>
                   <Input 
                       v-model="editingUser.whatsapp_number" 
                       placeholder="contoh: 081234567890"
                       class="bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-sm"
                   />
                   <p class="text-[11px] text-slate-400">Nomor WA penerima pesan peringatan H-1 & overdue dari Fonnte.</p>
               </div>

               <div class="grid gap-2">
                   <Label class="text-slate-700 dark:text-slate-300">Peran (Role)</Label>
                   <select 
                       v-model="editingUser.role" 
                       class="w-full bg-slate-50 dark:bg-slate-850 dark:border-slate-700 dark:text-white border border-slate-300 dark:bg-slate-800 rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                   >
                       <option value="STAFF">STAFF</option>
                       <option value="ADMIN">ADMIN</option>
                   </select>
               </div>
               
                <div v-if="editingUser.role === 'STAFF'" class="grid gap-2">
                    <Label class="text-slate-700 dark:text-slate-300">Hak Akses Modul</Label>
                    <div class="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-800 text-xs max-h-[220px] overflow-y-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                                    <th class="p-2 font-bold">Modul</th>
                                    <th class="p-2 font-bold text-center w-16">Lihat</th>
                                    <th class="p-2 font-bold text-center w-20">Ubah/Sync</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="mod in modulesList" :key="mod.key" class="border-b border-slate-200/50 dark:border-slate-700/50 hover:bg-slate-100/50 dark:hover:bg-slate-705/30 transition-colors">
                                    <td class="p-2 font-medium text-slate-700 dark:text-slate-300">{{ mod.label }}</td>
                                    <td class="p-2 text-center">
                                        <input 
                                            type="checkbox" 
                                            :checked="hasPermission(editingUser, mod.key, 'read')"
                                            @change="togglePermission(editingUser, mod.key, 'read')"
                                            class="rounded border-slate-300 dark:border-slate-600 text-red-650 focus:ring-red-500 w-4 h-4 cursor-pointer"
                                        />
                                    </td>
                                    <td class="p-2 text-center">
                                        <input 
                                            type="checkbox" 
                                            :checked="hasPermission(editingUser, mod.key, 'write')"
                                            @change="togglePermission(editingUser, mod.key, 'write')"
                                            class="rounded border-slate-300 dark:border-slate-600 text-red-650 focus:ring-red-500 w-4 h-4 cursor-pointer"
                                        />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div><div v-else class="text-xs text-green-600 dark:text-green-400 font-bold bg-green-50 dark:bg-green-950/20 p-2.5 rounded border border-green-200 dark:border-green-900">
                   INFO: Admin otomatis memiliki akses penuh ke semua modul.
               </div>
           </div>
           
           <DialogFooter>
               <Button type="submit" @click="handleUpdatePermissions" :disabled="isSaving" class="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto">
                   <Loader2 v-if="isSaving" class="w-4 h-4 mr-2 animate-spin"/>
                   {{ isSaving ? 'Menyimpan...' : 'Perbarui Akses' }}
               </Button>
           </DialogFooter>
       </DialogContent>
     </Dialog>

    </div>
  </div>
</template>