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
  Users, Search, UserPlus, Trash2, ShieldCheck, Mail, Loader2, RefreshCw
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
const newUser = ref({ email: '', password: '' })

// --- FETCH USERS FROM SUPABASE ---
const fetchUsers = async () => {
    isLoading.value = true
    try {
        // Fetch from user_access table (tabel terpisah tanpa FK ke auth.users)
        const { data, error } = await supabase
            .from('user_access')
            .select('id, email, is_active, created_at')
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
    // Panggil Edge Function untuk create user (pakai Admin API)
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        email: newUser.value.email,
        password: newUser.value.password
      }
    })
    
    if (error) throw new Error(error.message)
    if (!data.success) throw new Error(data.error)
    
    alert('User berhasil ditambahkan! User bisa login dengan email dan password.')
    isAddUserOpen.value = false
    newUser.value = { email: '', password: '' }
    fetchUsers()
  } catch (err) {
    console.error('Error adding user:', err)
    alert('Gagal menambahkan user: ' + err.message)
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
                        <TableCell class="py-3 text-right pr-6">
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

  </div>
</template>