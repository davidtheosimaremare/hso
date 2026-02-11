<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { AlertTriangle, Calendar, Building2, User, FileText, ArrowLeft, Loader2, Package } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const poId = route.params.id

// --- STATE ---
const poDetail = ref(null)
const isLoading = ref(true)
const errorMessage = ref(null)

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

        poDetail.value = {
            ...header,
            items: items || []
        }

    } catch (err) {
        console.error("Fetch Error:", err)
        errorMessage.value = err.message
    } finally {
        isLoading.value = false
    }
}

onMounted(() => {
    fetchDetail()
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
        <Button @click="router.push('/purchase-orders')" variant="outline">Kembali</Button>
      </div>

      <div v-else-if="isLoading" class="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 class="animate-spin w-10 h-10 text-slate-400"/>
        <p class="text-slate-500 mt-4 text-sm font-medium">Memuat detail PO...</p>
      </div>

      <div v-else-if="poDetail" class="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
        
        <!-- HEADER -->
        <div class="flex flex-col gap-4">
            <Button @click="router.push('/purchase-orders')" variant="ghost" class="w-fit pl-0 hover:bg-transparent hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400">
                <ArrowLeft class="w-4 h-4 mr-2"/> Kembali ke List
            </Button>
            
            <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div class="space-y-3">
                    <Badge variant="outline" class="uppercase tracking-widest text-[10px] px-2 py-0.5 border-slate-300 text-slate-500">Purchase Order</Badge>
                    <h1 class="text-3xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
                        {{ poDetail.number }}
                    </h1>
                    <div class="flex flex-wrap items-center gap-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                        <span class="flex items-center gap-1.5"><Calendar class="w-4 h-4"/> {{ formatDate(poDetail.trans_date) }}</span>
                        <span class="hidden md:inline w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                        <span class="flex items-center gap-1.5"><Building2 class="w-4 h-4"/> {{ poDetail.vendor_name || 'No Vendor' }}</span>
                    </div>
                </div>
                
                <div class="flex flex-col items-end gap-2">
                     <Badge class="px-3 py-1 text-sm font-bold uppercase transition-all" :class="getStatusColor(poDetail.status_name)">
                        {{ poDetail.status_name }}
                    </Badge>
                    <p class="text-2xl font-bold text-slate-900 dark:text-white">{{ formatCurrency(poDetail.total_amount) }}</p>
                </div>
            </div>
        </div>

        <!-- ITEMS TABLE -->
        <Card class="border shadow-sm rounded-xl overflow-hidden bg-white dark:bg-slate-800 dark:border-slate-700">
            <CardHeader class="flex flex-row items-center justify-between border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800">
                <div class="flex items-center gap-2">
                    <Package class="w-5 h-5 text-slate-500"/>
                    <CardTitle class="text-base font-bold text-slate-700 dark:text-white">Item Produk</CardTitle>
                </div>
                <Badge variant="secondary">{{ poDetail.items.length }} Items</Badge>
            </CardHeader>
            <CardContent class="p-0">
                <Table>
                    <TableHeader class="bg-gray-50 dark:bg-slate-900/50">
                        <TableRow class="border-b border-gray-100 dark:border-slate-700 hover:bg-transparent">
                            <TableHead class="w-[50px] font-bold text-slate-900 dark:text-white">#</TableHead>
                            <TableHead class="font-bold text-slate-900 dark:text-white">Item</TableHead>
                            <TableHead class="text-right font-bold text-slate-900 dark:text-white w-[100px]">Qty</TableHead>
                            <TableHead class="text-right font-bold text-slate-900 dark:text-white w-[180px]">Harga Satuan</TableHead>
                            <TableHead class="text-right font-bold text-slate-900 dark:text-white w-[180px]">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow v-for="(item, index) in poDetail.items" :key="item.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0">
                            <TableCell class="font-medium text-slate-500 dark:text-slate-400 py-4">{{ index + 1 }}</TableCell>
                            <TableCell class="py-4">
                                <div class="flex flex-col gap-1">
                                    <span class="font-bold text-slate-900 dark:text-white text-sm">{{ item.item_name }}</span>
                                    <span class="text-xs text-slate-500 dark:text-slate-400 font-mono">{{ item.item_code }}</span>
                                    <div v-if="item.detail_notes" class="mt-1 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-900/30 rounded px-2 py-1 w-fit text-xs text-yellow-700 dark:text-yellow-500">
                                        Note: {{ item.detail_notes }}
                                    </div>
                                    <div v-if="item.hso_number" class="mt-1">
                                        <div class="flex items-center gap-1">
                                            <span class="text-xs text-slate-400">Ref:</span>
                                            <span class="text-xs font-bold text-slate-700 dark:text-slate-200">{{ item.hso_number }}</span>
                                            <span class="cursor-pointer text-[10px] text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium ml-1 underline" @click.stop="router.push(`/sales-orders?search=${item.hso_number}`)">
                                                (Lihat HSO)
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell class="text-right font-medium text-slate-700 dark:text-slate-300 py-4">{{ item.quantity }}</TableCell>
                            <TableCell class="text-right text-slate-600 dark:text-slate-400 py-4">{{ formatCurrency(item.unit_price) }}</TableCell>
                            <TableCell class="text-right font-bold text-slate-900 dark:text-white py-4">{{ formatCurrency(item.total_price) }}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

      </div>
    </div>
  </div>
</template>
