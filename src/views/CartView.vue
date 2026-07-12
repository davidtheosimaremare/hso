<template>
  <div class="space-y-6">
    <!-- Header Section -->
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <ShoppingCart class="w-6 h-6 text-amber-500" />
          Rencana Pembelian (Keranjang)
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Daftar item yang perlu/kurang dipesan. Rencana ini dapat dilihat dan dikelola oleh seluruh tim.
        </p>
      </div>
    </div>

    <!-- Filters & Search Card -->
    <Card class="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl">
      <CardContent class="p-6">
        <div class="flex flex-col md:flex-row gap-4 items-center justify-between">
          <!-- Search input -->
          <div class="relative w-full md:max-w-md">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <Input
              v-model="searchQuery"
              placeholder="Cari SKU, HSO, atau nama perusahaan..."
              class="pl-10 h-10 border-slate-200 dark:border-slate-800 rounded-lg w-full bg-white dark:bg-slate-950"
            />
          </div>

          <!-- Status Filter Tabs -->
          <div class="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200/50 dark:border-slate-800/50">
            <button
              v-for="tab in filterTabs"
              :key="tab.value"
              @click="activeTab = tab.value"
              class="px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1"
              :class="activeTab === tab.value
                ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
            >
              <component :is="tab.icon" class="w-3.5 h-3.5" />
              {{ tab.label }}
              <span 
                v-if="tab.count !== undefined" 
                class="ml-1 px-1.5 py-0.5 text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full font-bold"
              >
                {{ tab.count }}
              </span>
            </button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Table Card -->
    <Card class="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl overflow-hidden">
      <div v-if="loading" class="flex flex-col items-center justify-center py-20 space-y-3">
        <Loader2 class="w-8 h-8 text-amber-500 animate-spin" />
        <span class="text-sm font-semibold text-slate-500 dark:text-slate-400">Memuat rencana pembelian...</span>
      </div>

      <div v-else-if="filteredItems.length === 0" class="flex flex-col items-center justify-center py-20 text-center px-4">
        <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 text-slate-400 dark:text-slate-500">
          <ShoppingCart class="w-6 h-6" />
        </div>
        <h3 class="text-base font-bold text-slate-900 dark:text-white">Keranjang Kosong</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
          Belum ada item yang dimasukkan ke rencana pembelian. Anda dapat menambahkan item dari halaman Detail Sales Order.
        </p>
      </div>

      <div v-else class="overflow-x-auto">
        <!-- Desktop Table View -->
        <Table class="hidden md:table">
          <TableHeader>
            <TableRow class="bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800">
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs w-[180px]">SKU / Item Code</TableHead>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs">Deskripsi</TableHead>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs text-center w-[120px]">Qty Pesan</TableHead>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs w-[240px]">HSO & Perusahaan</TableHead>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs">Catatan Pembelian</TableHead>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs text-center w-[150px]">Crosscheck</TableHead>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs text-right w-[100px] pr-6">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="item in paginatedItems"
              :key="item.id"
              class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors"
            >
              <!-- SKU -->
              <TableCell class="font-bold text-slate-900 dark:text-white text-xs align-middle">
                {{ item.item_code }}
              </TableCell>

              <!-- Description -->
              <TableCell class="text-xs text-slate-600 dark:text-slate-400 align-middle max-w-xs truncate" :title="item.item_name">
                {{ item.item_name }}
              </TableCell>

              <!-- Qty to Order -->
              <TableCell class="text-center font-extrabold text-xs text-amber-600 dark:text-amber-400 align-middle">
                {{ item.qty_to_order }}
              </TableCell>

              <!-- HSO & Company -->
              <TableCell class="align-middle">
                <div class="space-y-1">
                  <router-link
                    :to="`/sales-order/${item.so_id}`"
                    class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <FileText class="w-3 h-3" />
                    {{ item.so_number }}
                  </router-link>
                  <div class="text-[10px] text-slate-500 dark:text-slate-500 font-medium truncate max-w-[200px]" :title="item.company_name">
                    {{ item.company_name }}
                  </div>
                </div>
              </TableCell>

              <!-- Notes (Inline Editable) -->
              <TableCell class="align-middle">
                <div class="relative group max-w-md">
                  <Input
                    v-model="item.notes"
                    @blur="updateItemNote(item)"
                    @keyup.enter="$event.target.blur()"
                    class="h-8 text-xs border-transparent group-hover:border-slate-200 dark:group-hover:border-slate-800 focus:border-slate-300 dark:focus:border-slate-700 bg-transparent group-hover:bg-white dark:group-hover:bg-slate-950 focus:bg-white dark:focus:bg-slate-950 transition-all rounded px-2 w-full text-slate-700 dark:text-slate-300"
                    placeholder="Tambah catatan..."
                  />
                  <Edit v-if="!item.notes" class="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 dark:text-slate-700 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity" />
                </div>
              </TableCell>

              <!-- Crosscheck Toggle -->
              <TableCell class="text-center align-middle">
                <button
                  @click="toggleCrosscheck(item)"
                  class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border shadow-sm"
                  :class="item.is_crosschecked
                    ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-500/20'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'"
                >
                  <component :is="item.is_crosschecked ? CheckCircle2 : ShieldQuestion" class="w-3.5 h-3.5" />
                  {{ item.is_crosschecked ? 'Checked' : 'Pending' }}
                </button>
              </TableCell>

              <!-- Actions -->
              <TableCell class="text-right pr-6 align-middle">
                <Button
                  size="sm"
                  variant="outline"
                  class="h-8 w-8 p-0 rounded-lg border-slate-200 dark:border-slate-800 text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900/30 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
                  @click="deleteItem(item)"
                >
                  <Trash2 class="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <!-- Mobile Card View -->
        <div class="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
          <div
            v-for="item in paginatedItems"
            :key="item.id"
            class="p-4 space-y-3 bg-white dark:bg-slate-900"
          >
            <!-- Card Header: SKU & Crosscheck -->
            <div class="flex items-start justify-between gap-2">
              <div>
                <span class="text-xs font-bold text-slate-900 dark:text-white block">
                  {{ item.item_code }}
                </span>
                <span class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 block max-w-[200px] truncate">
                  {{ item.item_name }}
                </span>
              </div>

              <div class="flex items-center gap-1.5">
                <button
                  @click="toggleCrosscheck(item)"
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold transition-all border"
                  :class="item.is_crosschecked
                    ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'"
                >
                  <component :is="item.is_crosschecked ? CheckCircle2 : ShieldQuestion" class="w-3 h-3" />
                  {{ item.is_crosschecked ? 'Checked' : 'Pending' }}
                </button>
              </div>
            </div>

            <!-- Qty, HSO & Company -->
            <div class="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-950/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/50 text-[11px]">
              <div>
                <span class="text-slate-400 block text-[9px] uppercase font-bold">Qty Pesan</span>
                <span class="font-extrabold text-amber-600 dark:text-amber-400 block mt-0.5">
                  {{ item.qty_to_order }}
                </span>
              </div>
              <div>
                <span class="text-slate-400 block text-[9px] uppercase font-bold">HSO / Client</span>
                <router-link
                  :to="`/sales-order/${item.so_id}`"
                  class="font-bold text-blue-600 dark:text-blue-400 hover:underline block mt-0.5 truncate"
                >
                  {{ item.so_number }}
                </router-link>
              </div>
            </div>

            <!-- Notes -->
            <div class="space-y-1">
              <span class="text-[9px] uppercase font-bold text-slate-400 block">Catatan Pembelian</span>
              <Input
                v-model="item.notes"
                @blur="updateItemNote(item)"
                @keyup.enter="$event.target.blur()"
                class="h-8 text-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded px-2 w-full text-slate-700 dark:text-slate-300"
                placeholder="Tambah catatan..."
              />
            </div>

            <!-- Card Actions -->
            <div class="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/40">
              <span class="text-[9px] text-slate-400">
                Ditambahkan: {{ formatDate(item.created_at) }}
              </span>
              <Button
                size="sm"
                variant="outline"
                class="h-7 px-2.5 rounded-lg border-slate-200 dark:border-slate-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 text-[10px] font-bold flex items-center gap-1 shadow-sm"
                @click="deleteItem(item)"
              >
                <Trash2 class="w-3.5 h-3.5" />
                Hapus
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination Footer -->
      <div v-if="!loading && filteredItems.length > 0" class="p-4 bg-slate-50/50 dark:bg-slate-950/20 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div>
          Menampilkan <span class="font-bold text-slate-700 dark:text-slate-300">{{ startIndex + 1 }}</span> - <span class="font-bold text-slate-700 dark:text-slate-300">{{ Math.min(endIndex, filteredItems.length) }}</span> dari <span class="font-bold text-slate-700 dark:text-slate-300">{{ filteredItems.length }}</span> item
        </div>
        <div class="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            class="h-8 px-2.5 border-slate-200 dark:border-slate-800"
            :disabled="currentPage === 1"
            @click="currentPage--"
          >
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            class="h-8 px-2.5 border-slate-200 dark:border-slate-800"
            :disabled="currentPage === totalPages"
            @click="currentPage++"
          >
            Next
          </Button>
        </div>
      </div>
    </Card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import {
  ShoppingCart,
  Search,
  Loader2,
  Trash2,
  CheckCircle2,
  ShieldQuestion,
  FileText,
  Edit,
  Layers,
  Clock
} from 'lucide-vue-next'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell
} from '@/components/ui/table'

// State variables
const items = ref([])
const loading = ref(true)
const searchQuery = ref('')
const activeTab = ref('all') // 'all', 'pending', 'checked'
const currentPage = ref(1)
const itemsPerPage = 15

// Fetch items from Supabase
const fetchItems = async () => {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('purchase_cart')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    items.value = data || []
  } catch (err) {
    console.error('Error fetching purchase cart items:', err)
    alert('Gagal mengambil data keranjang rencana pembelian: ' + err.message)
  } finally {
    loading.value = false
  }
}

// Counts for filter tabs
const totalCount = computed(() => items.value.length)
const pendingCount = computed(() => items.value.filter(i => !i.is_crosschecked).length)
const checkedCount = computed(() => items.value.filter(i => i.is_crosschecked).length)

// Filter tabs definition
const filterTabs = computed(() => [
  { label: 'Semua', value: 'all', icon: Layers, count: totalCount.value },
  { label: 'Pending', value: 'pending', icon: ShieldQuestion, count: pendingCount.value },
  { label: 'Checked', value: 'checked', icon: CheckCircle2, count: checkedCount.value }
])

// Filter and Search Logic
const filteredItems = computed(() => {
  let list = items.value

  // Apply tab filter
  if (activeTab.value === 'pending') {
    list = list.filter(i => !i.is_crosschecked)
  } else if (activeTab.value === 'checked') {
    list = list.filter(i => i.is_crosschecked)
  }

  // Apply search query
  const query = searchQuery.value.toLowerCase().trim()
  if (query) {
    list = list.filter(item => 
      (item.item_code && item.item_code.toLowerCase().includes(query)) ||
      (item.item_name && item.item_name.toLowerCase().includes(query)) ||
      (item.so_number && item.so_number.toLowerCase().includes(query)) ||
      (item.company_name && item.company_name.toLowerCase().includes(query)) ||
      (item.notes && item.notes.toLowerCase().includes(query))
    )
  }

  return list
})

// Pagination logic
const totalPages = computed(() => Math.ceil(filteredItems.value.length / itemsPerPage) || 1)
const startIndex = computed(() => (currentPage.value - 1) * itemsPerPage)
const endIndex = computed(() => startIndex.value + itemsPerPage)
const paginatedItems = computed(() => filteredItems.value.slice(startIndex.value, endIndex.value))

// Watch search or tab change to reset page
watch([searchQuery, activeTab], () => {
  currentPage.value = 1
})

// Toggle Crosscheck status in Supabase
const toggleCrosscheck = async (item) => {
  const nextVal = !item.is_crosschecked
  // Optimistic update
  item.is_crosschecked = nextVal
  
  try {
    const { error } = await supabase
      .from('purchase_cart')
      .update({ is_crosschecked: nextVal, updated_at: new Date().toISOString() })
      .eq('id', item.id)

    if (error) throw error
  } catch (err) {
    console.error('Failed to toggle crosscheck:', err)
    // Revert on error
    item.is_crosschecked = !nextVal
    alert('Gagal memperbarui status crosscheck: ' + err.message)
  }
}

// Update note in Supabase
const updateItemNote = async (item) => {
  try {
    const { error } = await supabase
      .from('purchase_cart')
      .update({ notes: item.notes || '', updated_at: new Date().toISOString() })
      .eq('id', item.id)

    if (error) throw error
  } catch (err) {
    console.error('Failed to update note:', err)
    alert('Gagal memperbarui catatan: ' + err.message)
  }
}

// Delete item from cart
const deleteItem = async (item) => {
  if (!confirm(`Apakah Anda yakin ingin menghapus item "${item.item_code}" dari rencana pembelian?`)) return

  try {
    const { error } = await supabase
      .from('purchase_cart')
      .delete()
      .eq('id', item.id)

    if (error) throw error
    // Remove locally
    items.value = items.value.filter(i => i.id !== item.id)
  } catch (err) {
    console.error('Failed to delete item:', err)
    alert('Gagal menghapus item: ' + err.message)
  }
}

// Date formatter helper
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

onMounted(() => {
  fetchItems()
})
</script>

<style scoped>
/* Glassmorphism custom styles if needed */
</style>
