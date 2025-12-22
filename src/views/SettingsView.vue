<script setup>
import { ref, computed } from 'vue'
import { 
  Card, CardContent, CardDescription, CardHeader, CardTitle 
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
  Users, Search, Lock, UserPlus, Edit, Trash2, ShieldCheck, Mail
} from 'lucide-vue-next'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'

// --- DATA SAMPLE USERS ---
const users = ref([
  { id: 1, name: "Jessica Jeane", email: "owner@hso.id", role: "Super Admin", access_price: true, status: "Active" },
  { id: 2, name: "Budi Santoso", email: "gudang@hso.id", role: "Warehouse", access_price: false, status: "Active" },
  { id: 3, name: "Siti Aminah", email: "purchasing@hso.id", role: "Purchasing", access_price: true, status: "Active" },
  { id: 4, name: "Rian Driver", email: "driver@hso.id", role: "Logistics", access_price: false, status: "Inactive" },
])

const searchQuery = ref('')
const isAddUserOpen = ref(false)
const newUser = ref({ name: '', email: '', role: 'Staff', access_price: false })

// --- FILTERED USERS ---
const filteredUsers = computed(() => {
  if (!searchQuery.value) return users.value
  const q = searchQuery.value.toLowerCase()
  return users.value.filter(u => 
    u.name.toLowerCase().includes(q) || 
    u.email.toLowerCase().includes(q) ||
    u.role.toLowerCase().includes(q)
  )
})

// --- ACTIONS ---
const handleAddUser = () => {
  // Simulasi Add User
  const id = users.value.length + 1
  users.value.push({
    id,
    ...newUser.value,
    status: 'Active'
  })
  isAddUserOpen.value = false
  newUser.value = { name: '', email: '', role: 'Staff', access_price: false } // Reset form
}

const getRoleColor = (role) => {
    switch(role) {
        case 'Super Admin': return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800'
        case 'Purchasing': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
        case 'Warehouse': return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800'
        default: return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
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
            Kelola akses login dan izin staf.
        </p>
      </div>
      
      <Dialog :open="isAddUserOpen" @update:open="isAddUserOpen = $event">
        <DialogTrigger as-child>
            <Button class="bg-red-600 hover:bg-red-700 text-white dark:bg-red-600 dark:hover:bg-red-500 gap-2 w-full md:w-auto shadow-sm">
                <UserPlus class="w-4 h-4"/> Tambah User
            </Button>
        </DialogTrigger>
        <DialogContent class="sm:max-w-[425px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-source-code">
            <DialogHeader>
                <DialogTitle class="text-slate-900 dark:text-white">Tambah Pengguna Baru</DialogTitle>
                <DialogDescription class="text-slate-500 dark:text-slate-400">
                    Isi detail akun untuk staf baru. Password default akan dikirim via email.
                </DialogDescription>
            </DialogHeader>
            <div class="grid gap-4 py-4">
                <div class="grid gap-2">
                    <Label class="text-slate-700 dark:text-slate-300">Nama Lengkap</Label>
                    <Input v-model="newUser.name" placeholder="Contoh: Budi Santoso" class="bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-white"/>
                </div>
                <div class="grid gap-2">
                    <Label class="text-slate-700 dark:text-slate-300">Email Kerja</Label>
                    <Input v-model="newUser.email" placeholder="nama@hso.id" class="bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-white"/>
                </div>
                <div class="grid gap-2">
                    <Label class="text-slate-700 dark:text-slate-300">Role / Jabatan</Label>
                    <Select v-model="newUser.role">
                        <SelectTrigger class="bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                            <SelectValue placeholder="Pilih Role" />
                        </SelectTrigger>
                        <SelectContent class="dark:bg-slate-800 dark:border-slate-700">
                            <SelectItem value="Super Admin" class="dark:text-slate-300 dark:focus:bg-slate-700">Super Admin</SelectItem>
                            <SelectItem value="Purchasing" class="dark:text-slate-300 dark:focus:bg-slate-700">Purchasing</SelectItem>
                            <SelectItem value="Warehouse" class="dark:text-slate-300 dark:focus:bg-slate-700">Warehouse</SelectItem>
                            <SelectItem value="Logistics" class="dark:text-slate-300 dark:focus:bg-slate-700">Logistics (Driver)</SelectItem>
                            <SelectItem value="Sales" class="dark:text-slate-300 dark:focus:bg-slate-700">Sales</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div class="flex items-center justify-between space-x-2 border dark:border-slate-700 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                    <Label class="flex flex-col space-y-1 cursor-pointer" for="price-access">
                        <span class="font-bold text-slate-900 dark:text-white">Akses Harga</span>
                        <span class="text-xs text-slate-500 dark:text-slate-400">Izinkan melihat harga beli/modal?</span>
                    </Label>
                    <Switch id="price-access" v-model:checked="newUser.access_price" />
                </div>
            </div>
            <DialogFooter>
                <Button type="submit" @click="handleAddUser" class="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto">Simpan User</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

    <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <CardHeader class="border-b border-slate-100 dark:border-slate-700/50 pb-4">
            <div class="flex flex-col md:flex-row justify-between items-center gap-4">
                <CardTitle class="text-base text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck class="w-4 h-4"/> Daftar Akun Aktif
                </CardTitle>
                <div class="relative w-full md:w-72">
                    <Search class="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input 
                        v-model="searchQuery"
                        placeholder="Cari user..." 
                        class="pl-9 bg-slate-50 border-slate-200 focus:bg-white dark:bg-slate-900 dark:border-slate-700 dark:focus:bg-slate-950 dark:text-white transition-all h-9" 
                    />
                </div>
            </div>
        </CardHeader>
        
        <CardContent class="p-0">
            <Table>
                <TableHeader class="bg-slate-50 dark:bg-slate-900/50">
                    <TableRow class="border-slate-100 dark:border-slate-700 hover:bg-transparent">
                        <TableHead class="text-slate-500 dark:text-slate-400 font-bold h-10 w-[250px]">Nama User</TableHead>
                        <TableHead class="text-slate-500 dark:text-slate-400 font-bold h-10">Role</TableHead>
                        <TableHead class="text-slate-500 dark:text-slate-400 font-bold h-10 text-center">Akses Harga</TableHead>
                        <TableHead class="text-slate-500 dark:text-slate-400 font-bold h-10">Status</TableHead>
                        <TableHead class="text-slate-500 dark:text-slate-400 font-bold h-10 text-right pr-6">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow v-for="user in filteredUsers" :key="user.id" class="border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <TableCell class="py-3">
                            <div class="flex items-center gap-3">
                                <Avatar class="h-9 w-9 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700">
                                    <AvatarFallback class="text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 text-xs font-bold">
                                        {{ user.name.substring(0,2).toUpperCase() }}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <p class="font-bold text-slate-900 dark:text-white text-sm">{{ user.name }}</p>
                                    <div class="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                        <Mail class="w-3 h-3"/> {{ user.email }}
                                    </div>
                                </div>
                            </div>
                        </TableCell>
                        <TableCell class="py-3">
                            <Badge variant="outline" class="font-medium border shadow-sm" :class="getRoleColor(user.role)">
                                {{ user.role }}
                            </Badge>
                        </TableCell>
                        <TableCell class="py-3 text-center">
                            <div class="flex flex-col items-center justify-center gap-1">
                                <Switch :checked="user.access_price" class="data-[state=checked]:bg-green-600 h-5 w-9"/>
                                <span class="text-[10px] font-medium" :class="user.access_price ? 'text-green-600 dark:text-green-400' : 'text-slate-400'">
                                    {{ user.access_price ? 'Allowed' : 'Denied' }}
                                </span>
                            </div>
                        </TableCell>
                        <TableCell class="py-3">
                            <div class="flex items-center gap-2">
                                <span class="relative flex h-2.5 w-2.5">
                                  <span v-if="user.status === 'Active'" class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span class="relative inline-flex rounded-full h-2.5 w-2.5" :class="user.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'"></span>
                                </span>
                                <span class="text-xs font-bold" :class="user.status === 'Active' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'">
                                    {{ user.status }}
                                </span>
                            </div>
                        </TableCell>
                        <TableCell class="py-3 text-right pr-6">
                            <div class="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" class="h-8 w-8 p-0 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                                    <Edit class="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" class="h-8 w-8 p-0 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20">
                                    <Lock class="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" class="h-8 w-8 p-0 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                                    <Trash2 class="w-4 h-4" />
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </CardContent>
    </Card>

  </div>
</template>