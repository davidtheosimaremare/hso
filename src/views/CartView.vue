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
      <div class="flex items-center gap-2 shrink-0">
        <Button 
          v-if="items.length > 0"
          variant="outline" 
          class="h-10 px-4 rounded-xl border-red-200 hover:border-red-300 dark:border-red-950 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all flex items-center gap-2 bg-white dark:bg-slate-950 font-bold text-xs uppercase tracking-wider"
          @click="showClearConfirm = true"
        >
          <Trash2 class="w-4 h-4" />
          <span>Kosongkan Keranjang</span>
        </Button>
        <Button 
          v-if="items.length > 0"
          class="h-10 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm font-sans"
          @click="openHpbModalForAll"
        >
          <Send class="w-4 h-4" />
          <span>Kirim ke HPB Accurate</span>
        </Button>
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
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs w-[180px] pl-10">SKU / Item Code</TableHead>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs">Deskripsi</TableHead>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs text-center w-[120px]">Qty Pesan</TableHead>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs text-center w-[150px]">Crosscheck</TableHead>
              <TableHead class="font-bold text-slate-700 dark:text-slate-300 text-xs text-right w-[100px] pr-6">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-for="group in paginatedGroups" :key="group.so_number">
              <!-- Group Header Row -->
              <TableRow class="bg-slate-50/70 dark:bg-slate-900/40 font-bold border-b border-slate-200 dark:border-slate-800">
                <TableCell colspan="5" class="py-3 px-4">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <!-- Collapse Toggle Button -->
                      <button 
                        @click="toggleGroup(group.so_number)" 
                        class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                        title="Expand/Collapse"
                      >
                        <component :is="isGroupCollapsed(group.so_number) ? ChevronRight : ChevronDown" class="w-4 h-4" />
                      </button>
                      
                      <!-- HSO & Client Info -->
                      <div class="flex items-center gap-2">
                        <router-link
                          :to="`/sales-orders/${group.so_number.replace(/\//g, '-')}`"
                          class="inline-flex items-center gap-1.5 text-xs font-extrabold text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-950/20 px-2 py-0.5 rounded font-sans"
                        >
                          <FileText class="w-3.5 h-3.5" />
                          {{ group.so_number }}
                        </router-link>
                        <span class="text-xs text-slate-300 dark:text-slate-700 font-normal">/</span>
                        <span class="text-xs text-slate-700 dark:text-slate-300 font-bold tracking-tight">{{ group.company_name }}</span>
                      </div>
                      
                      <!-- Item Count Badge -->
                      <span class="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full font-bold px-2 py-0.5">
                        {{ group.items.length }} Item
                      </span>
                    </div>
                    
                    <!-- Group Action Option (Crosscheck All) -->
                    <button
                      @click="toggleGroupCrosscheck(group)"
                      class="text-[10px] font-bold text-slate-500 hover:text-green-600 dark:text-slate-400 dark:hover:text-green-400 transition-colors flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-200/50 dark:border-slate-700/50 hover:border-green-300 dark:hover:border-green-800 shadow-sm"
                    >
                      <CheckCircle2 class="w-3.5 h-3.5" />
                      Crosscheck Semua
                    </button>
                  </div>
                </TableCell>
              </TableRow>
              
              <!-- Group Items Rows -->
              <template v-if="!isGroupCollapsed(group.so_number)">
                <TableRow
                  v-for="item in group.items"
                  :key="item.id"
                  class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors"
                >
                  <!-- SKU -->
                  <TableCell class="font-bold text-slate-900 dark:text-white text-xs align-middle pl-10 font-mono tracking-tight">
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
              </template>
            </template>
          </TableBody>
        </Table>

        <div class="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
          <div v-for="group in paginatedGroups" :key="group.so_number" class="bg-slate-50/50 dark:bg-slate-950/20">
            <!-- Group Header Card -->
            <div 
              @click="toggleGroup(group.so_number)"
              class="p-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/50 bg-slate-100/50 dark:bg-slate-900/50 cursor-pointer"
            >
              <div class="flex items-center gap-2 max-w-[80%]">
                <component :is="isGroupCollapsed(group.so_number) ? ChevronRight : ChevronDown" class="w-4 h-4 text-slate-500 shrink-0" />
                <div class="min-w-0">
                  <span class="text-xs font-bold text-blue-600 dark:text-blue-400 block truncate">{{ group.so_number }}</span>
                  <span class="text-[10px] text-slate-600 dark:text-slate-400 block truncate font-medium mt-0.5">{{ group.company_name }}</span>
                </div>
              </div>
              <span class="text-[10px] bg-slate-200 dark:bg-slate-850 text-slate-700 dark:text-slate-300 rounded-full font-bold px-2 py-0.5 shrink-0">
                {{ group.items.length }} Item
              </span>
            </div>
            
            <!-- Group Items List -->
            <div v-if="!isGroupCollapsed(group.so_number)" class="divide-y divide-slate-100 dark:divide-slate-800">
              <div
                v-for="item in group.items"
                :key="item.id"
                class="p-4 space-y-3 bg-white dark:bg-slate-900 animate-in fade-in slide-in-from-top-1 duration-150"
              >
                <!-- SKU & Crosscheck -->
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <span class="text-xs font-bold text-slate-900 dark:text-white block font-mono">
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

                <!-- Qty and date -->
                <div class="flex items-center justify-between text-[11px] bg-slate-50 dark:bg-slate-950/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800/50">
                  <div>
                    <span class="text-slate-400 text-[9px] uppercase font-bold">Qty Pesan:</span>
                    <span class="font-extrabold text-amber-600 dark:text-amber-400 ml-1">
                      {{ item.qty_to_order }}
                    </span>
                  </div>
                  <span class="text-[9px] text-slate-400">
                    Ditambahkan: {{ formatDate(item.created_at) }}
                  </span>
                </div>

                <!-- Card Actions -->
                <div class="flex items-center justify-end pt-1">
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
        </div>
      </div>

      <!-- Pagination Footer -->
      <div v-if="!loading && groupedItems.length > 0" class="p-4 bg-slate-50/50 dark:bg-slate-950/20 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div>
          Menampilkan <span class="font-bold text-slate-700 dark:text-slate-300">{{ startIndex + 1 }}</span> - <span class="font-bold text-slate-700 dark:text-slate-300">{{ Math.min(endIndex, groupedItems.length) }}</span> dari <span class="font-bold text-slate-700 dark:text-slate-300">{{ groupedItems.length }}</span> HSO
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

    <!-- Clear Cart Confirmation Dialog -->
    <div v-if="showClearConfirm" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div class="p-6">
          <div class="flex items-center gap-3 text-red-600 mb-4">
            <div class="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
              <Trash2 class="w-5 h-5" />
            </div>
            <h3 class="text-lg font-bold text-slate-950 dark:text-white">Kosongkan Keranjang?</h3>
          </div>
          <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Apakah Anda yakin ingin menghapus <strong>semua {{ items.length }} item</strong> dari keranjang rencana pembelian? Tindakan ini tidak dapat dibatalkan.
          </p>
        </div>
        <div class="px-6 py-4 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800/60 flex justify-end gap-2">
          <Button 
            variant="outline" 
            class="h-9 px-4 rounded-xl border-slate-200 dark:border-slate-800 font-bold text-xs bg-white dark:bg-slate-950"
            @click="showClearConfirm = false"
            :disabled="isClearing"
          >
            Batal
          </Button>
          <Button 
            variant="destructive"
            class="h-9 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs"
            @click="clearAllCart"
            :disabled="isClearing"
          >
            <Loader2 v-if="isClearing" class="w-4 h-4 animate-spin mr-1 inline-block" />
            <span>Ya, Kosongkan</span>
          </Button>
        </div>
      </div>
    </div>

    <!-- Send to HPB Accurate Modal Dialog -->
    <div v-if="showHpbModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <!-- Modal Header -->
        <div class="p-6 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-500 shrink-0">
            <Send class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-base font-extrabold text-slate-900 dark:text-white">Kirim ke HPB Accurate (Permintaan Barang)</h3>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
              Buat dokumen Permintaan Pembelian baru untuk HSO dan Client ini
            </p>
          </div>
        </div>

        <!-- Modal Body -->
        <div class="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <!-- HSO & Company details -->
          <div class="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/50 text-xs">
            <div>
              <span class="text-slate-400 block text-[9px] uppercase font-bold">Nomor HSO</span>
              <span class="font-extrabold text-slate-900 dark:text-white block mt-0.5 font-sans">
                {{ activeGroupForHpb?.so_number === 'Gabungan HSO' ? 'Gabungan HSO (' + activeGroupForHpb?.items.length + ' Item)' : activeGroupForHpb?.so_number }}
              </span>
            </div>
            <div>
              <span class="text-slate-400 block text-[9px] uppercase font-bold">Perusahaan / Client</span>
              <span class="font-extrabold text-slate-900 dark:text-white block mt-0.5 truncate">
                {{ activeGroupForHpb?.so_number === 'Gabungan HSO' ? 'Multi-Perusahaan' : activeGroupForHpb?.company_name }}
              </span>
            </div>
          </div>

          <!-- Proposed HPB number input -->
          <div class="space-y-1.5">
            <label class="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wide block">
              Nomor HPB Accurate
            </label>
            <div class="relative">
              <Input 
                v-model="proposedHpbNumber" 
                class="h-10 border-slate-200 dark:border-slate-800 rounded-xl w-full bg-white dark:bg-slate-950 font-bold text-xs" 
                placeholder="Memuat nomor HPB baru..."
                :disabled="isFetchingHpbNumber || isSendingHpb"
              />
              <Loader2 v-if="isFetchingHpbNumber" class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
            </div>
            <p class="text-[10px] text-slate-400">
              *Diambil secara otomatis & bertambah (+1) berdasarkan nomor terakhir di bulan yang sama di Accurate.
            </p>
          </div>

          <!-- Item list to select -->
          <div class="space-y-2">
            <label class="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wide block">
              Pilih Item yang akan dikirim ({{ selectedHpbItemIds.length }}/{{ activeGroupForHpb?.items.length }})
            </label>
            <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950/20 max-h-[180px] overflow-y-auto">
              <div 
                v-for="item in activeGroupForHpb?.items" 
                :key="item.id" 
                class="p-3 flex items-center justify-between text-xs hover:bg-slate-50/50 dark:hover:bg-slate-800/10 cursor-pointer"
                @click="selectedHpbItemIds.includes(item.id) ? selectedHpbItemIds = selectedHpbItemIds.filter(id => id !== item.id) : selectedHpbItemIds.push(item.id)"
              >
                <div class="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    class="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500 cursor-pointer" 
                    :checked="selectedHpbItemIds.includes(item.id)"
                    @click.stop
                    @change="selectedHpbItemIds.includes(item.id) ? selectedHpbItemIds = selectedHpbItemIds.filter(id => id !== item.id) : selectedHpbItemIds.push(item.id)"
                  />
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-bold text-slate-900 dark:text-white block font-mono">{{ item.item_code }}</span>
                      <span class="text-[9px] bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-extrabold font-sans shrink-0">{{ item.so_number }}</span>
                    </div>
                    <span class="text-[10px] text-slate-400 block truncate max-w-[280px]">{{ item.item_name }}</span>
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <span class="text-[10px] text-slate-400 block uppercase font-bold">Qty</span>
                  <span class="font-extrabold text-amber-600 dark:text-amber-400 block mt-0.5">{{ item.qty_to_order }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="px-6 py-4 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800/60 flex justify-end gap-2">
          <Button 
            variant="outline" 
            class="h-9 px-4 rounded-xl border-slate-200 dark:border-slate-800 font-bold text-xs bg-white dark:bg-slate-950"
            @click="showHpbModal = false"
            :disabled="isSendingHpb"
          >
            Batal
          </Button>
          <Button 
            class="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs"
            @click="sendToHpb"
            :disabled="isSendingHpb || isFetchingHpbNumber || !proposedHpbNumber"
          >
            <Loader2 v-if="isSendingHpb" class="w-4 h-4 animate-spin mr-1 inline-block" />
            <span>Kirim Sekarang</span>
          </Button>
        </div>
      </div>
    </div>
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
  Clock,
  ChevronDown,
  ChevronRight,
  Send
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
const showClearConfirm = ref(false)
const isClearing = ref(false)
const showHpbModal = ref(false)
const activeGroupForHpb = ref(null)
const proposedHpbNumber = ref('')
const isFetchingHpbNumber = ref(false)
const isSendingHpb = ref(false)
const selectedHpbItemIds = ref([])
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
      .order('created_at', { ascending: true })

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

// Grouping logic (HSO & Company Client)
const collapsedGroups = ref({})

const toggleGroup = (soNumber) => {
  collapsedGroups.value[soNumber] = !collapsedGroups.value[soNumber]
}

const isGroupCollapsed = (soNumber) => {
  return !!collapsedGroups.value[soNumber]
}

const groupedItems = computed(() => {
  const groups = {}
  filteredItems.value.forEach(item => {
    const key = item.so_number
    if (!groups[key]) {
      groups[key] = {
        so_number: item.so_number,
        so_id: item.so_id,
        company_name: item.company_name,
        items: []
      }
    }
    groups[key].items.push(item)
  })
  return Object.values(groups)
})

// Pagination logic based on HSO Groups
const totalPages = computed(() => Math.ceil(groupedItems.value.length / itemsPerPage) || 1)
const startIndex = computed(() => (currentPage.value - 1) * itemsPerPage)
const endIndex = computed(() => startIndex.value + itemsPerPage)
const paginatedGroups = computed(() => groupedItems.value.slice(startIndex.value, endIndex.value))

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

// Toggle crosscheck status for all items in a group
const toggleGroupCrosscheck = async (group) => {
  const allChecked = group.items.every(i => i.is_crosschecked)
  const nextVal = !allChecked

  // Optimistic update
  group.items.forEach(i => { i.is_crosschecked = nextVal })

  try {
    const itemIds = group.items.map(i => i.id)
    const { error } = await supabase
      .from('purchase_cart')
      .update({ is_crosschecked: nextVal, updated_at: new Date().toISOString() })
      .in('id', itemIds)

    if (error) throw error
  } catch (err) {
    console.error('Failed to group crosscheck:', err)
    // Revert on error
    group.items.forEach(i => { i.is_crosschecked = !nextVal })
    alert('Gagal melakukan crosscheck massal: ' + err.message)
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

// Clear all cart items
const clearAllCart = async () => {
  isClearing.value = true
  try {
    const { error } = await supabase
      .from('purchase_cart')
      .delete()
      .neq('so_id', '') // safely delete all matching rows

    if (error) throw error
    items.value = []
    showClearConfirm.value = false
    alert("Keranjang rencana pembelian berhasil dikosongkan!")
  } catch (err) {
    console.error('Failed to clear cart:', err)
    alert("Gagal mengosongkan keranjang: " + err.message)
  } finally {
    isClearing.value = false
  }
}

// Open HPB Modal for all active items in the cart
const openHpbModalForAll = async () => {
  const activeItems = filteredItems.value
  if (activeItems.length === 0) {
    alert('Tidak ada item aktif di keranjang untuk dikirim!')
    return
  }

  // Create mock group containing all active items
  activeGroupForHpb.value = {
    so_number: 'Gabungan HSO',
    company_name: 'Multi-Perusahaan',
    items: activeItems
  }
  selectedHpbItemIds.value = activeItems.map(i => i.id)
  proposedHpbNumber.value = 'Loading...'
  isFetchingHpbNumber.value = true
  showHpbModal.value = true

  try {
    const { data, error } = await supabase.functions.invoke('accurate-create-hpb', {
      body: { action: 'get-next-number' }
    })
    if (error) throw error
    proposedHpbNumber.value = data.proposedNumber || ''
  } catch (err) {
    console.error('Error fetching proposed HPB number:', err)
    proposedHpbNumber.value = ''
    alert('Gagal mengambil nomor HPB baru dari Accurate: ' + err.message)
  } finally {
    isFetchingHpbNumber.value = false
  }
}

// Send selected items to Accurate as Purchase Requisition (HPB)
const sendToHpb = async () => {
  if (!proposedHpbNumber.value) {
    alert('Nomor HPB tidak boleh kosong!')
    return
  }
  const selectedItems = activeGroupForHpb.value.items.filter(i => selectedHpbItemIds.value.includes(i.id))
  if (selectedItems.length === 0) {
    alert('Pilih setidaknya satu item untuk dikirim!')
    return
  }

  isSendingHpb.value = true
  try {
    const { data, error } = await supabase.functions.invoke('accurate-create-hpb', {
      body: {
        action: 'create-hpb',
        number: proposedHpbNumber.value,
        items: selectedItems.map(i => ({
          id: i.id,
          item_code: i.item_code,
          qty_to_order: i.qty_to_order,
          so_number: i.so_number // Use individual item HSO reference
        }))
      }
    })

    if (error) throw error

    alert(data.message || `HPB ${proposedHpbNumber.value} berhasil dibuat di Accurate!`)
    showHpbModal.value = false
    await fetchItems()
  } catch (err) {
    console.error('Failed to send to HPB:', err)
    alert('Gagal mengirim ke HPB Accurate: ' + err.message)
  } finally {
    isSendingHpb.value = false
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
