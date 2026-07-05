<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { AlertTriangle, Calendar, Building2, User, FileText, ArrowLeft, Loader2, Package, RefreshCw, CheckCircle2, XCircle } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const poId = route.params.id

// --- STATE ---
const poData = ref(null)
const poItems = ref([])
const isLoading = ref(true)
const errorMessage = ref(null)

// --- REALTIME STATE ---
const isRealtimeConnected = ref(false)
const realtimeUpdatePulse = ref(false) // flashes briefly when update received
let realtimeChannel: any = null

const pulseUpdate = () => {
    realtimeUpdatePulse.value = true
    setTimeout(() => { realtimeUpdatePulse.value = false }, 2000)
}

// --- REFRESH (Webhook Single PO) ---
const isRefreshing = ref(false)
const refreshStatus = ref(null) // null | 'success' | 'error'
const refreshMessage = ref('')

const refreshSinglePO = async () => {
    if (!poId || isRefreshing.value) return

    isRefreshing.value = true
    refreshStatus.value = null
    refreshMessage.value = ''

    try {
        const { data: { session } } = await supabase.auth.getSession()
        const endpoint = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/sync-accurate-po-single'

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ po_id: parseInt(poId) })
        })

        const result = await res.json()

        if (!res.ok || !result.success) {
            throw new Error(result.error || 'Refresh gagal, coba lagi.')
        }

        refreshStatus.value = 'success'
        refreshMessage.value = result.message || `Berhasil: ${result.items_updated} item diperbarui.`

        // Reload detail silently
        await fetchDetail()

        // Auto-clear message after 5s
        setTimeout(() => { refreshStatus.value = null; refreshMessage.value = '' }, 5000)

    } catch (err) {
        console.error('[RefreshPO] Error:', err)
        refreshStatus.value = 'error'
        refreshMessage.value = err.message || 'Terjadi kesalahan saat refresh.'
    } finally {
        isRefreshing.value = false
    }
}

// --- DATA FETCHING ---
const fetchOrderDetails = async () => {
  isLoading.value = true
  const orderId = route.params.id
  if (!orderId) return

  // Query header
  const { data: headerData, error: headerError } = await supabase
    .from('accurate_receive_items')
    .select('*')
    .eq('id', orderId)
    .single()

  if (headerError || !headerData) {
    console.error("Error fetching RI header:", headerError)
    isLoading.value = false
    return
  }

  poData.value = headerData

  // Query items
  const { data: itemsData, error: itemsError } = await supabase
    .from('accurate_receive_item_items')
    .select('*')
    .eq('receive_item_id', orderId)
    .order('item_seq', { ascending: true })

  if (itemsError) {
    console.error("Error fetching RI items:", itemsError)
  } else {
    poItems.value = itemsData || []
  }

  isLoading.value = false
}

const totalQuantity = computed(() => {
    return poItems.value.reduce((acc, item) => acc + (item.quantity || 0), 0)
})

onMounted(() => {
    fetchOrderDetails()

    // --- Supabase Realtime ---
    realtimeChannel = supabase
        .channel(`ri-detail-${poId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'accurate_receive_item_items',
                filter: `receive_item_id=eq.${poId}`
            },
            (payload) => {
                console.log('[Realtime] Items updated', payload)
                pulseUpdate()
                fetchOrderDetails()
            }
        )
        .subscribe((status) => {
            isRealtimeConnected.value = status === 'SUBSCRIBED'
        })
})

onUnmounted(() => {
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel)
    }
})

// --- HELPERS ---
const formatCurrency = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0)
const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return isNaN(date.getTime()) ? dateStr : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

const getStatusColor = (status) => {
  switch (status) {
    case 'Terproses': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
    case 'Ditutup': return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
    case 'Draf': return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'
    case 'Diajukan': return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800'
    default: return 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50/50 dark:bg-[#0f172a] pb-20 font-source-code transition-colors duration-300">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-8">

      <!-- ERROR STATE -->
      <div v-if="errorMessage" class="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-800 rounded-xl border border-red-100 dark:border-red-900 shadow-sm animate-in zoom-in-95 duration-300">
        <div class="bg-red-50 dark:bg-red-900/20 p-4 rounded-full mb-6">
            <AlertTriangle class="w-12 h-12 text-red-500" />
        </div>
        <h3 class="text-xl font-bold text-slate-900 dark:text-white mb-2">Gagal Memuat Data</h3>
        <p class="text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto">{{ errorMessage }}</p>
        <Button @click="router.push('/receive-items')" variant="outline">Kembali</Button>
      </div>

      <div v-else-if="isLoading" class="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 class="animate-spin w-10 h-10 text-slate-400"/>
        <p class="text-slate-500 mt-4 text-sm font-medium">Memuat detail RI...</p>
      </div>

      <div v-else-if="poData" class="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
        
        <!-- HEADER -->
        <div class="flex flex-col gap-4">
            <div class="flex items-center justify-between">
                <Button @click="router.push('/receive-items')" variant="ghost" class="w-fit pl-0 hover:bg-transparent hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400">
                    <ArrowLeft class="w-4 h-4 mr-2"/> Kembali ke List
                </Button>

                <div class="flex items-center gap-3">
                    <div class="flex items-center gap-1.5 text-[11px] font-medium select-none"
                         :class="realtimeUpdatePulse 
                           ? 'text-blue-600 dark:text-blue-400' 
                           : isRealtimeConnected 
                             ? 'text-emerald-600 dark:text-emerald-400' 
                             : 'text-slate-400 dark:text-slate-600'">
                        <span class="relative flex h-2 w-2">
                            <span v-if="isRealtimeConnected || realtimeUpdatePulse" 
                                  class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                                  :class="realtimeUpdatePulse ? 'bg-blue-400' : 'bg-emerald-400'">
                            </span>
                            <span class="relative inline-flex rounded-full h-2 w-2 transition-colors duration-300"
                                  :class="realtimeUpdatePulse ? 'bg-blue-500' : isRealtimeConnected ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'">
                            </span>
                        </span>
                        <span class="hidden sm:inline">
                            {{ realtimeUpdatePulse ? 'Diperbarui!' : isRealtimeConnected ? 'Live' : 'Offline' }}
                        </span>
                    </div>

                    <Transition
                        enter-active-class="transition-all duration-300"
                        enter-from-class="opacity-0 translate-x-2"
                        enter-to-class="opacity-100 translate-x-0"
                        leave-active-class="transition-all duration-200"
                        leave-from-class="opacity-100"
                        leave-to-class="opacity-0"
                    >
                        <div v-if="refreshStatus === 'success'" class="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-1.5">
                            <CheckCircle2 class="w-3.5 h-3.5 shrink-0" />
                            {{ refreshMessage }}
                        </div>
                        <div v-else-if="refreshStatus === 'error'" class="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-1.5">
                            <XCircle class="w-3.5 h-3.5 shrink-0" />
                            {{ refreshMessage }}
                        </div>
                    </Transition>

                    <Button
                        @click="refreshSinglePO"
                        :disabled="isRefreshing"
                        size="sm"
                        variant="outline"
                        class="gap-2 border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 hover:border-slate-400 transition-all"
                    >
                        <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isRefreshing }" />
                        {{ isRefreshing ? 'Memperbarui...' : 'Refresh RI Ini' }}
                    </Button>
                </div>
            </div>
            <div class="grid md:grid-cols-2 gap-6 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div class="space-y-4">
                <Badge variant="outline" class="uppercase tracking-widest text-[10px] px-2 py-0.5 border-slate-300 text-slate-500">Receive Item</Badge>
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">{{ poData.number }}</h1>
                
                <div class="flex items-center gap-2">
                  <span class="text-xs uppercase tracking-wider text-slate-400 font-bold mb-1">Status RI</span>
                  <Badge :class="getStatusColor(poData?.status_name)" class="w-max px-3 py-1 shadow-sm">{{ poData?.status_name || 'Tidak ada status' }}</Badge>
                </div>
              </div>
              
              <!-- Right Column: Vendor Info -->
              <div class="space-y-4 pt-4 md:pt-0 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-700 md:pl-8">
                <div class="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                   Informasi Penerimaan
                </div>
                
                <div class="flex gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 group hover:border-slate-300 dark:hover:border-slate-500 transition-colors">
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 group-hover:scale-105 transition-transform text-slate-400">
                     <Calendar class="w-6 h-6" />
                  </div>
                  <div>
                    <div class="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Tanggal Terima</div>
                    <div class="font-bold text-slate-900 dark:text-white">{{ formatDate(poData?.trans_date) }}</div>
                  </div>
                </div>

                <div class="flex gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 group hover:border-slate-300 dark:hover:border-slate-500 transition-colors">
                  <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 group-hover:scale-105 transition-transform text-slate-400">
                     <FileText class="w-6 h-6" />
                  </div>
                  <div>
                    <div class="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">No. Purchase Order</div>
                    <div class="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      {{ poData?.po_number || '-' }}
                      <button v-if="poData?.po_number" @click="navigator.clipboard.writeText(poData.po_number)" class="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors" title="Copy PO Number">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
        </div>

        <!-- ITEMS TABLE -->
        <Card class="border shadow-sm rounded-xl overflow-hidden bg-white dark:bg-slate-800 dark:border-slate-700 flex flex-col max-h-[75vh]">
            <CardHeader class="flex flex-row items-center justify-between border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800 shrink-0">
                <div class="flex items-center gap-2">
                    <Package class="w-5 h-5 text-slate-500"/>
                    <CardTitle class="text-base font-bold text-slate-700 dark:text-white">Item Diterima</CardTitle>
                </div>
                <Badge variant="secondary">{{ poItems.length }} Items</Badge>
            </CardHeader>
            <CardContent class="p-0 overflow-auto flex-1">
                <div class="[&>div]:overflow-visible min-w-[600px] w-full">
                    <Table class="relative">
        <TableHeader class="bg-gray-50 dark:bg-slate-900 sticky top-0 z-20 shadow-sm border-b">
          <TableRow class="hover:bg-transparent">
            <TableHead class="text-slate-500 font-bold">Item Detail</TableHead>
            <TableHead class="text-slate-500 font-bold hidden sm:table-cell">HSO Number</TableHead>
            <TableHead class="text-right text-slate-500 font-bold">Qty ({{ totalQuantity }} total)</TableHead>
          </TableRow>
        </TableHeader>
        
        <TableBody>
          <TableRow v-for="(item, idx) in poItems" :key="item.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
            
            <TableCell class="py-4 align-top">
              <div class="flex items-start gap-4">
                <div class="hidden sm:flex w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 items-center justify-center text-xs font-bold text-slate-400 shrink-0 mt-1 shadow-sm">
                  {{ idx + 1 }}
                </div>
                <div>
                  <div class="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      {{ item.item_code }}
                      <Badge variant="outline" class="text-[10px] py-0 bg-slate-50 dark:bg-slate-800 dark:border-slate-600 text-slate-500 dark:text-slate-400">SKU</Badge>
                  </div>
                  <div class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-[400px] leading-snug">{{ item.item_name }}</div>
                  <div v-if="item.detail_notes" class="text-xs text-slate-400 dark:text-slate-500 mt-2 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-slate-100 dark:border-slate-700/50 italic flex items-start gap-2">
                     <span class="font-bold not-italic shrink-0 mt-0.5">Catatan:</span> {{ item.detail_notes }}
                  </div>
                </div>
              </div>
            </TableCell>

            <TableCell class="py-4 align-top font-medium text-slate-600 dark:text-slate-300 hidden sm:table-cell">
               <Badge v-if="item.hso_number" variant="secondary" class="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                  {{ item.hso_number }}
               </Badge>
               <span v-else class="text-slate-400 italic text-xs">Tidak ada</span>
            </TableCell>

            <TableCell class="py-4 align-top text-right">
              <div class="font-bold text-slate-900 dark:text-white text-lg tabular-nums">{{ item.quantity }}</div>
              <div class="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">{{ item.unit_name || 'PCS' }}</div>
            </TableCell>
            
          </TableRow>
        </TableBody>
      </Table>
                </div>
            </CardContent>
        </Card>

      </div>
    </div>
  </div>
</template>
