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
  Users, Search, UserPlus, Trash2, ShieldCheck, Mail, Loader2, RefreshCw, Edit, Shield
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
const newUser = ref({ email: '', password: '', role: 'STAFF', allowed_modules: ['dashboard:read'] })

// Modal Edit Hak Akses
const isEditOpen = ref(false)
const editingUser = ref({ id: '', email: '', role: 'STAFF', allowed_modules: [] })

// List Modul untuk Checklist
const modulesList = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'sales-orders', label: 'Penjualan' },
  { key: 'hsq', label: 'Penawaran' },
  { key: 'cart', label: 'Keranjang & HPB' },
  { key: 'purchase-orders', label: 'Purchase Order' },
  { key: 'receive-items', label: 'Penerimaan Barang' },
  { key: 'delivery-orders', label: 'Pengiriman' },
  { key: 'logistics-db', label: 'Database Logistik' },
  { key: 'sop-guide', label: 'SOP & Panduan' },
  { key: 'settings', label: 'Manage Account (Settings)' }
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

// Buka Modal Edit Hak Akses
const openEditModal = (user) => {
  editingUser.value = {
    id: user.id,
    email: user.email,
    role: user.role || 'STAFF',
    allowed_modules: user.allowed_modules ? [...user.allowed_modules] : ['dashboard:read']
  }
  isEditOpen.value = true
}

// Simpan Hak Akses Baru
const handleUpdatePermissions = async () => {
  isSaving.value = true
  try {
    const { error } = await supabase
      .from('user_access')
      .update({
        role: editingUser.value.role,
        allowed_modules: editingUser.value.role === 'ADMIN' ? 
          modulesList.flatMap(m => [`${m.key}:read`, `${m.key}:write`]) : 
          editingUser.value.allowed_modules
      })
      .eq('id', editingUser.value.id)

    if (error) throw error

    alert('Hak akses user berhasil diperbarui!')
    isEditOpen.value = false
    fetchUsers()
  } catch (err) {
    console.error('Error updating user access:', err)
    alert('Gagal memperbarui hak akses: ' + err.message)
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
  <div class="space-y-6 pb-20 font-source-code text-slate-900 dark:text-slate-100">
    
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users class="w-6 h-6 text-red-600 dark:text-red-400"/> User Management
        </h2>
        <p class="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Kelola akses login pengguna sistem.
        </p>
      </div>
      
      <div class="flex gap-2">
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
          <DialogContent class="sm:max-w-[400px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-source-code">
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
                         <TableHead class="text-slate-500 dark:text-slate-400 font-bold h-10">Email</TableHead>
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
                                         {{ user.email?.substring(0,2).toUpperCase() }}
                                     </AvatarFallback>
                                 </Avatar>
                                 <div>
                                     <div class="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                                         <Mail class="w-3 h-3 text-slate-400"/> {{ user.email }}
                                     </div>
                                 </div>
                             </div>
                         </TableCell>
                         <TableCell class="py-3">
                             <Badge :class="user.role === 'ADMIN' ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900' : 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900'">
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
 
     <!-- Edit Permissions Dialog -->
     <Dialog :open="isEditOpen" @update:open="isEditOpen = $event">
       <DialogContent class="sm:max-w-[450px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-source-code">
           <DialogHeader>
               <DialogTitle class="text-slate-900 dark:text-white">Edit Hak Akses Pengguna</DialogTitle>
               <DialogDescription class="text-slate-500 dark:text-slate-400">
                   Sesuaikan peran dan hak akses untuk {{ editingUser.email }}.
               </DialogDescription>
           </DialogHeader>
           
           <div class="grid gap-4 py-4">
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
</template>