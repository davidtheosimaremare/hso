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
import { AlertTriangle, Calendar, Building2, User, FileText, ArrowLeft, Loader2, Package, RefreshCw, CheckCircle2, XCircle, Copy } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const poId = route.params.id

// --- STATE ---
const poDetail = ref(null)
const isLoading = ref(true)
const errorMessage = ref(null)
const copiedSku = ref('')

const copySku = async (sku) => {
  try {
    await navigator.clipboard.writeText(sku)
    copiedSku.value = sku
    setTimeout(() => { copiedSku.value = '' }, 2000)
  } catch (err) {
    console.error('Failed to copy SKU:', err)
  }
}

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
const fetchDetail = async () => {
    isLoading.value = true
    errorMessage.value = null

    try {
        // Fetch Header
        const { data: header, error: headErr } = await supabase
            .from('accurate_purchase_orders')
            .select('*')
            .eq('id', poId)
            .single()
        
        if (headErr) throw headErr
        if (!header) throw new Error("Purchase Order tidak ditemukan.")

        // Fetch Items
        const { data: items, error: itemErr } = await supabase
            .from('accurate_purchase_order_items')
            .select('*')
            .eq('po_id', poId)
            .order('item_seq', { ascending: true })

        if (itemErr) throw itemErr

        // Collect unique HSO/HSQ numbers from items to fetch customer names
        const hsoRefs = [...new Set((items || [])
            .map(i => i.hso_number || extractRef(i.detail_notes))
            .filter(Boolean))]

        let refCustomerMap = {}

        // Fetch SO references for customer names
        if (hsoRefs.length > 0) {
            const hsoNumbers = hsoRefs.filter(r => r.startsWith('HSO'))
            if (hsoNumbers.length > 0) {
                const { data: soHeaders } = await supabase
                    .from('sales_orders')
                    .select('number, client')
                    .in('number', hsoNumbers)
                if (soHeaders) {
                    soHeaders.forEach(so => { refCustomerMap[so.number] = so.client })
                }
            }
        }

        poDetail.value = {
            ...header,
            items: items || [],
            refCustomerMap
        }

    } catch (err) {
        console.error("Fetch Error:", err)
        errorMessage.value = err.message
    } finally {
        isLoading.value = false
    }
}

const extractRef = (note) => {
    if (!note) return null
    const m = note.match(/(HS[OQ]\/[\w\d\/]+)/i)
    return m ? m[1] : null
}

const goToHsqDetail = async (number, itemCode) => {
  try {
    const { data, error } = await supabase.functions.invoke('accurate-list-sq', {
      body: { filterNumber: number, fields: 'id,number', limit: 1 }
    })
    if (data?.d?.[0]?.id) {
      router.push(`/hsq/${data.d[0].id}?search=${itemCode}&highlight=${itemCode}`)
    } else {
      router.push(`/hsq?search=${number}`)
    }
  } catch {
    router.push(`/hsq?search=${number}`)
  }
}

onMounted(() => {
    fetchDetail()

    // --- Supabase Realtime: auto-reload when items change ---
    // This fires whenever cron sync updates this PO's items in the DB
    realtimeChannel = supabase
        .channel(`po-detail-${poId}`)
        .on(
            'postgres_changes',
            {
                event: '*',          // INSERT, UPDATE, DELETE
                schema: 'public',
                table: 'accurate_purchase_order_items',
                filter: `po_id=eq.${poId}`
            },
            (payload) => {
                console.log('[Realtime] PO items updated, reloading...', payload)
                pulseUpdate()
                fetchDetail() // Reload data silently
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'accurate_purchase_orders',
                filter: `id=eq.${poId}`
            },
            (payload) => {
                console.log('[Realtime] PO header updated, reloading...', payload)
                pulseUpdate()
                fetchDetail()
            }
        )
        .subscribe((status) => {
            console.log('[Realtime] Channel status:', status)
            isRealtimeConnected.value = status === 'SUBSCRIBED'
        })
})

onUnmounted(() => {
    // Clean up realtime subscription when leaving the page
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel)
        realtimeChannel = null
    }
})

// --- HELPERS ---
const formatCurrency = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0)
const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    // Handle specific format if needed, assuming standard ISO or YYYY-MM-DD from DB
    // However, our sync logic saves raw strings sometimes. Let's try parsing.
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

// --- HELPER UNTUK PARSING REFERENSI ---
const getReferenceLabel = (item) => {
  const notes = (item.detail_notes || '').trim().toUpperCase()
  const hsoNum = (item.hso_number || '').trim().toUpperCase()

  // Jika hso_number ada
  if (hsoNum) {
    if (hsoNum.includes('HSO')) return { type: 'HSO', number: hsoNum, isLink: true }
    if (hsoNum.includes('HSQ')) return { type: 'HSQ', number: hsoNum, isLink: false }
    return { type: 'REF', number: hsoNum, isLink: false }
  }

  // Jika di detail_notes ada HSO / HSQ
  if (notes) {
    const hsoMatch = notes.match(/(HSO\/[^\s,;]+)/i)
    if (hsoMatch) return { type: 'HSO', number: hsoMatch[1], isLink: true }

    const hsqMatch = notes.match(/(HSQ\/[^\s,;]+)/i)
    if (hsqMatch) return { type: 'HSQ', number: hsqMatch[1], isLink: false }

    if (notes.includes('STOCK') || notes.includes('STOK') || notes.includes('PERSEDIAAN')) {
      return { type: 'STOCK', number: 'STOCK', isLink: false }
    }
    
    return { type: 'NOTES', number: item.detail_notes, isLink: false }
  }

  return { type: 'STOCK', number: 'STOCK', isLink: false }
}

const getCustomerName = (refNumber) => {
    return poDetail.value?.refCustomerMap?.[refNumber] || ''
}
</script>

<template>
  <div class="min-h-screen bg-gray-50/50 dark:bg-[#0f172a] pb-20 font-source-code transition-colors duration-300">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-6">

      <!-- ERROR STATE -->
      <div v-if="errorMessage" class="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-800 rounded-xl border border-red-100 dark:border-red-900 shadow-sm animate-in zoom-in-95 duration-300">
        <div class="bg-red-50 dark:bg-red-900/20 p-4 rounded-full mb-6">
            <AlertTriangle class="w-12 h-12 text-red-500" />
        </div>
        <h3 class="text-xl font-bold text-slate-900 dark:text-white mb-2">Gagal Memuat Data</h3>
        <p class="text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto">{{ errorMessage }}</p>
        <Button @click="router.push('/purchase-orders')" variant="outline">Kembali</Button>
      </div>

      <div v-else-if="isLoading" class="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 class="animate-spin w-10 h-10 text-slate-400"/>
        <p class="text-slate-500 mt-4 text-sm font-medium">Memuat detail PO...</p>
      </div>

      <div v-else-if="poDetail" class="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">

        <!-- TOP NAV BAR -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Button @click="router.push('/purchase-orders')" variant="ghost" size="sm" class="hover:bg-transparent hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400">
              <ArrowLeft class="w-4 h-4 mr-1"/> Kembali
            </Button>
          </div>
          <div class="flex items-center gap-2">
            <span class="flex items-center gap-1.5 text-[11px] font-medium select-none rounded-full px-2.5 py-1"
                  :class="realtimeUpdatePulse
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                    : isRealtimeConnected
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'">
              <span class="relative flex h-2 w-2">
                <span v-if="isRealtimeConnected || realtimeUpdatePulse"
                      class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                      :class="realtimeUpdatePulse ? 'bg-blue-400' : 'bg-emerald-400'"></span>
                <span class="relative inline-flex rounded-full h-2 w-2"
                      :class="realtimeUpdatePulse ? 'bg-blue-500' : isRealtimeConnected ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'"></span>
              </span>
              <span class="hidden sm:inline">{{ realtimeUpdatePulse ? 'Diperbarui!' : isRealtimeConnected ? 'Live' : 'Offline' }}</span>
            </span>

            <Transition
              enter-active-class="transition-all duration-300"
              enter-from-class="opacity-0 translate-x-2"
              enter-to-class="opacity-100 translate-x-0"
              leave-active-class="transition-all duration-200"
              leave-from-class="opacity-100"
              leave-to-class="opacity-0">
              <div v-if="refreshStatus === 'success'" class="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-1.5">
                <CheckCircle2 class="w-3.5 h-3.5 shrink-0" /> {{ refreshMessage }}
              </div>
              <div v-else-if="refreshStatus === 'error'" class="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-1.5">
                <XCircle class="w-3.5 h-3.5 shrink-0" /> {{ refreshMessage }}
              </div>
            </Transition>

            <Button @click="refreshSinglePO" :disabled="isRefreshing" size="sm" variant="outline"
                    class="gap-2 border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 hover:border-slate-400 transition-all">
              <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isRefreshing }" />
              {{ isRefreshing ? 'Memperbarui...' : 'Refresh' }}
            </Button>
          </div>
        </div>

        <!-- INFO CARD -->
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-5 p-6">
            <div class="space-y-2 min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <Badge variant="outline" class="uppercase tracking-widest text-[10px] px-2 py-0.5 border-slate-300 text-slate-500 shrink-0">Purchase Order</Badge>
                <Badge class="px-2.5 py-0.5 text-xs font-bold uppercase" :class="getStatusColor(poDetail.status_name)">{{ poDetail.status_name }}</Badge>
              </div>
              <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight break-all">{{ poDetail.number }}</h1>
              <div class="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-slate-500 dark:text-slate-400">
                <span class="flex items-center gap-1.5"><Calendar class="w-3.5 h-3.5 shrink-0"/> {{ formatDate(poDetail.trans_date) }}</span>
                <span class="flex items-center gap-1.5"><Building2 class="w-3.5 h-3.5 shrink-0"/> <span class="font-semibold text-slate-700 dark:text-slate-300">{{ poDetail.vendor_name || 'No Vendor' }}</span></span>
              </div>
            </div>
            <div class="flex flex-col items-start md:items-end gap-1 shrink-0">
              <span class="text-xs text-slate-400 uppercase tracking-wider font-medium">Total Amount</span>
              <p class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{{ formatCurrency(poDetail.total_amount) }}</p>
            </div>
          </div>
        </div>

        <!-- ITEMS TABLE -->
        <Card class="border shadow-sm rounded-xl overflow-hidden bg-white dark:bg-slate-800 dark:border-slate-700">
          <CardHeader class="flex flex-row items-center justify-between border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800 px-5 py-3.5">
            <div class="flex items-center gap-2">
              <Package class="w-4.5 h-4.5 text-slate-500"/>
              <CardTitle class="text-sm font-bold text-slate-700 dark:text-white">Item Produk</CardTitle>
            </div>
            <Badge variant="secondary" class="text-xs">{{ poDetail.items.length }} Items</Badge>
          </CardHeader>
          <CardContent class="p-0">
            <div class="overflow-x-auto">
              <Table>
                <TableHeader class="bg-slate-50 dark:bg-slate-900/50">
                  <TableRow class="border-b border-slate-100 dark:border-slate-700 hover:bg-transparent">
                    <TableHead class="w-10 text-center font-bold text-slate-600 dark:text-slate-300 text-[11px] uppercase tracking-wider">#</TableHead>
                    <TableHead class="font-bold text-slate-600 dark:text-slate-300 text-[11px] uppercase tracking-wider">Produk</TableHead>
                    <TableHead class="font-bold text-slate-600 dark:text-slate-300 text-[11px] uppercase tracking-wider w-[180px]">Referensi / Target</TableHead>
                    <TableHead class="text-right font-bold text-slate-600 dark:text-slate-300 text-[11px] uppercase tracking-wider w-[80px]">Qty</TableHead>
                    <TableHead class="text-right font-bold text-slate-600 dark:text-slate-300 text-[11px] uppercase tracking-wider w-[140px] hidden sm:table-cell">Harga</TableHead>
                    <TableHead class="text-right font-bold text-slate-600 dark:text-slate-300 text-[11px] uppercase tracking-wider w-[140px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="(item, index) in poDetail.items" :key="item.id"
                    class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0">
                    <TableCell class="text-center text-slate-400 dark:text-slate-500 text-sm py-2">{{ index + 1 }}</TableCell>
                    <TableCell class="py-2 min-w-[200px]">
                      <div class="flex flex-col gap-0.5">
                        <div class="flex items-center gap-1.5">
                          <span class="font-bold text-slate-900 dark:text-white text-sm font-mono leading-none">{{ item.item_code }}</span>
                          <button @click="copySku(item.item_code)" class="p-1 rounded hover:bg-slate-150 dark:hover:bg-slate-750 text-slate-400 hover:text-slate-600 dark:hover:text-slate-350 transition-colors" title="Copy SKU">
                            <component :is="copiedSku === item.item_code ? CheckCircle2 : Copy" class="w-3.5 h-3.5" :class="copiedSku === item.item_code ? 'text-green-600 dark:text-green-400' : ''"/>
                          </button>
                        </div>
                        <span class="text-xs text-slate-500 dark:text-slate-400 font-medium leading-tight truncate max-w-[320px]" :title="item.item_name">
                          {{ item.item_name }}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell class="py-2">
                      <!-- Kolom Referensi / Target -->
                      <div class="flex flex-col gap-0.5 min-w-[150px]">
                        <div class="flex items-center gap-1.5">
                          <template v-if="getReferenceLabel(item).type === 'HSO'">
                            <span class="font-mono text-xs font-bold text-slate-700 dark:text-slate-350">{{ getReferenceLabel(item).number }}</span>
                            <span class="cursor-pointer text-[10px] text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline font-medium" @click.stop="router.push(`/sales-orders/${getReferenceLabel(item).number.replace(/\//g, '-')}?search=${item.item_code}&highlight=${item.item_code}`)">Lihat</span>
                          </template>
                          <template v-else-if="getReferenceLabel(item).type === 'HSQ'">
                            <span class="font-mono text-xs font-semibold text-slate-700 dark:text-slate-350">{{ getReferenceLabel(item).number }}</span>
                            <span class="cursor-pointer text-[10px] text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 underline font-medium" @click.stop="goToHsqDetail(getReferenceLabel(item).number, item.item_code)">Lihat</span>
                          </template>
                          <template v-else-if="getReferenceLabel(item).type === 'STOCK'">
                            <span class="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 rounded px-1.5 py-0.5">
                              STOCK
                            </span>
                          </template>
                          <template v-else>
                            <span class="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[120px]" :title="getReferenceLabel(item).number">{{ getReferenceLabel(item).number }}</span>
                          </template>
                        </div>
                        <!-- Display customer name for HSO -->
                        <div v-if="getReferenceLabel(item).type === 'HSO' && getCustomerName(getReferenceLabel(item).number)" class="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate max-w-[200px]">
                          {{ getCustomerName(getReferenceLabel(item).number) }}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell class="text-right font-semibold text-slate-800 dark:text-slate-200 py-2 text-sm">{{ item.quantity }}</TableCell>
                    <TableCell class="text-right text-slate-500 dark:text-slate-400 py-2 text-sm hidden sm:table-cell">{{ formatCurrency(item.unit_price) }}</TableCell>
                    <TableCell class="text-right font-bold text-slate-900 dark:text-white py-2 text-sm">{{ formatCurrency(item.total_price) }}</TableCell>
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
