<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

// UI Components
import { 
  Card, CardContent, CardHeader, CardTitle 
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  ClipboardList, ArrowRight, Loader2, 
  ShoppingCart, TrendingUp, Package, Truck, Ship, Factory, Building2, AlertCircle
} from 'lucide-vue-next'

const router = useRouter()
const isLoading = ref(true)
const soList = ref([])

// --- LOGIC FILTER & STATS ---
const stats = computed(() => {
  const total = soList.value.length
  // Simulasi: Status 'Open' = pending
  const pending = soList.value.filter(i => i.statusName === 'Open').length 
  
  // Simulasi angka
  const needOrder = Math.round(pending * 0.4) 
  const readyToSend = Math.round(pending * 0.6) 

  return { 
    pendingSo: pending, 
    needPo: needOrder, 
    ready: readyToSend 
  }
})

const todoList = computed(() => {
  return soList.value
    .filter(item => item.statusName !== 'Closed')
    .slice(0, 5)
})

// --- FETCH DATA ---
const fetchSO = async () => {
  isLoading.value = true
  try {
    const { data: accData, error } = await supabase.functions.invoke('accurate-list-so', { 
        body: { limit: 50, sort: 'transDate desc' } 
    })

    if (error) throw error
    
    soList.value = (accData?.d || []).map(so => ({
        id: so.id,
        number: so.number,
        customer: so.customer?.name || 'Pelanggan Umum',
        date: so.transDate,
        statusName: so.statusName, 
        amount: so.totalAmount
    }))

  } catch (err) {
    console.error("Error:", err)
  } finally {
    isLoading.value = false
  }
}

const formatMoney = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val)

onMounted(() => {
  fetchSO()
})

const weeklyPOData = [
    { day: 'Sen', value: 45, label: '12 PO' },
    { day: 'Sel', value: 70, label: '18 PO' },
    { day: 'Rab', value: 30, label: '8 PO' },
    { day: 'Kam', value: 85, label: '22 PO' },
    { day: 'Jum', value: 60, label: '15 PO' },
    { day: 'Sab', value: 20, label: '5 PO' },
    { day: 'Min', value: 10, label: '2 PO' },
]
</script>

<template>
  <div class="space-y-8 pb-20 font-source-code text-slate-900 dark:text-slate-100">
    
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
            <span class="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
            <h2 class="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-widest">Dashboard Operasional</h2>
        </div>
        <h1 class="text-3xl font-bold tracking-tight">HSO Control Center</h1>
      </div>
      <Button class="bg-red-600 hover:bg-red-700 text-white shadow-sm dark:shadow-red-900/20" @click="fetchSO" :disabled="isLoading">
         <Loader2 v-if="isLoading" class="w-4 h-4 mr-2 animate-spin"/>
         {{ isLoading ? 'Memuat...' : 'Refresh Data' }}
      </Button>
    </div>

    <div class="grid gap-6 md:grid-cols-3">
        
        <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
            <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <ClipboardList class="w-16 h-16 text-slate-900 dark:text-white" />
            </div>
            <CardHeader class="pb-2">
                <CardTitle class="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Belum Diproses</CardTitle>
            </CardHeader>
            <CardContent>
                <div class="text-5xl font-bold text-slate-900 dark:text-white mb-1">{{ stats.pendingSo }}</div>
                <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <span class="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-200">SO</span>
                    Menunggu konfirmasi admin
                </div>
            </CardContent>
        </Card>

        <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
            <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <ShoppingCart class="w-16 h-16 text-slate-900 dark:text-white" />
            </div>
            <CardHeader class="pb-2">
                <CardTitle class="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Perlu Order</CardTitle>
            </CardHeader>
            <CardContent>
                <div class="text-5xl font-bold text-slate-900 dark:text-white mb-1">{{ stats.needPo }}</div>
                <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <span class="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded">Item</span>
                    Stok kosong (No Stock)
                </div>
            </CardContent>
        </Card>

        <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
            <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Package class="w-16 h-16 text-slate-900 dark:text-white" />
            </div>
            <CardHeader class="pb-2">
                <CardTitle class="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Siap Kirim</CardTitle>
            </CardHeader>
            <CardContent>
                <div class="text-5xl font-bold text-slate-900 dark:text-white mb-1">{{ stats.ready }}</div>
                <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <span class="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded">Item</span>
                    Ada di gudang, belum jalan
                </div>
            </CardContent>
        </Card>

    </div>

    <div class="grid gap-6 md:grid-cols-2">
        
        <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm overflow-visible">
            <CardHeader>
                <CardTitle class="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <TrendingUp class="w-4 h-4 text-red-600 dark:text-red-400"/> Aktivitas PO (7 Hari Terakhir)
                </CardTitle>
            </CardHeader>
            <CardContent class="pt-6">
                <div class="flex items-end justify-between h-[160px] gap-2">
                    <div v-for="(data, index) in weeklyPOData" :key="index" class="relative flex flex-col items-center flex-1 h-full group">
                        
                        <div class="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap pointer-events-none mb-2 z-10 shadow-lg">
                            {{ data.label }}
                            <div class="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-slate-900 dark:border-t-white"></div>
                        </div>

                        <div class="w-full bg-slate-100 dark:bg-slate-700 rounded-t-md relative overflow-hidden flex-1 flex items-end">
                            <div 
                                class="w-full bg-gradient-to-t from-red-600 to-red-400 dark:from-red-700 dark:to-red-500 rounded-t-sm transition-all duration-500 ease-out group-hover:from-red-700 group-hover:to-red-500"
                                :style="{ height: data.value + '%' }"
                            ></div>
                        </div>
                        
                        <span class="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-2">{{ data.day }}</span>
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader>
                <CardTitle class="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Truck class="w-4 h-4 text-blue-600 dark:text-blue-400"/> Logistic Pipeline
                </CardTitle>
            </CardHeader>
            <CardContent class="space-y-8 pt-4 pl-2">
                
                <div class="flex items-start gap-4 relative z-10">
                    <div class="w-12 h-12 rounded-xl bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-sm relative z-10 shrink-0">
                        <Factory class="w-6 h-6"/>
                    </div>
                    <div class="flex-1 pt-1">
                        <div class="flex justify-between items-center mb-1.5">
                            <span class="text-sm font-bold text-slate-800 dark:text-slate-200">1. Order ke Principal</span>
                            <span class="text-xs font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">12 PO</span>
                        </div>
                        <Progress :model-value="75" class="h-2 bg-slate-100 dark:bg-slate-700 rounded-full" indicator-class="bg-blue-500 dark:bg-blue-400 rounded-full"/>
                        <p class="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Menunggu konfirmasi produksi.</p>
                    </div>
                    <div class="absolute left-[23px] top-12 w-[2px] h-10 bg-slate-200 dark:bg-slate-600 -z-0"></div>
                </div>

                <div class="flex items-start gap-4 relative z-10">
                     <div class="w-12 h-12 rounded-xl bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-sm relative z-10 shrink-0">
                        <Ship class="w-6 h-6"/>
                    </div>
                    <div class="flex-1 pt-1">
                        <div class="flex justify-between items-center mb-1.5">
                            <span class="text-sm font-bold text-slate-800 dark:text-slate-200">2. In Transit</span>
                            <span class="text-xs font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">8 Shipment</span>
                        </div>
                        <Progress :model-value="45" class="h-2 bg-slate-100 dark:bg-slate-700 rounded-full" indicator-class="bg-amber-500 dark:bg-amber-400 rounded-full"/>
                        <p class="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Estimasi tiba 1-2 minggu.</p>
                    </div>
                     <div class="absolute left-[23px] top-12 w-[2px] h-10 bg-slate-200 dark:bg-slate-600 -z-0"></div>
                </div>

                <div class="flex items-start gap-4 relative z-10">
                     <div class="w-12 h-12 rounded-xl bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-sm relative z-10 shrink-0">
                        <Building2 class="w-6 h-6"/>
                    </div>
                    <div class="flex-1 pt-1">
                        <div class="flex justify-between items-center mb-1.5">
                            <span class="text-sm font-bold text-slate-800 dark:text-slate-200">3. Tiba di Gudang</span>
                            <span class="text-xs font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">24 Item</span>
                        </div>
                        <Progress :model-value="90" class="h-2 bg-slate-100 dark:bg-slate-700 rounded-full" indicator-class="bg-emerald-500 dark:bg-emerald-400 rounded-full"/>
                        <p class="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Proses QC dan input stok.</p>
                    </div>
                </div>
            </CardContent>
        </Card>

    </div>

    <div class="space-y-4">
        <div class="flex items-center gap-2">
            <AlertCircle class="w-5 h-5 text-red-600 dark:text-red-400"/>
            <h3 class="text-lg font-bold text-slate-800 dark:text-white">Prioritas Proses (Terbaru)</h3>
        </div>

        <div v-if="isLoading" class="space-y-2">
            <div v-for="i in 3" :key="i" class="h-16 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse"></div>
        </div>

        <div v-else class="space-y-3">
            <div 
                v-for="so in todoList" 
                :key="so.id" 
                class="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between hover:border-red-300 dark:hover:border-red-500 transition-colors cursor-pointer group"
                @click="router.push(`/sales-orders/${so.id}`)"
            >
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-300 font-bold text-xs">
                        SO
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-slate-900 dark:text-white text-sm">{{ so.number }}</span>
                            <span class="text-xs text-slate-400 dark:text-slate-500">• {{ so.date }}</span>
                        </div>
                        <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{{ so.customer }}</div>
                    </div>
                </div>
                
                <div class="flex items-center gap-6">
                    <div class="text-right hidden md:block">
                        <div class="text-xs font-bold text-slate-900 dark:text-white">{{ formatMoney(so.amount) }}</div>
                        <Badge variant="outline" class="text-[10px] h-5 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400">{{ so.statusName }}</Badge>
                    </div>
                    <ArrowRight class="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors"/>
                </div>
            </div>
        </div>
    </div>

  </div>
</template>