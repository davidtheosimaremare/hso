<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { 
  Loader2, AlertCircle, FileText, ArrowLeft, Calendar, 
  FileSpreadsheet, Download, ChevronRight, User, DollarSign, Tag
} from 'lucide-vue-next'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'

const route = useRoute()
const router = useRouter()
const hsqId = route.params.id

const isLoading = ref(true)
const selectedHsq = ref(null)
const fetchError = ref(null)

// --- FETCH HSQ DETAIL ---
const fetchHsqDetail = async () => {
  isLoading.value = true
  fetchError.value = null
  selectedHsq.value = null
  
  try {
    const { data, error } = await supabase.functions.invoke('accurate-detail-so', {
      body: { id: hsqId, type: 'sales-quotation' }
    })
    
    if (error) throw new Error(error.message || 'Gagal mengambil detail dari Edge Function')
    if (!data?.s) throw new Error(data?.error || 'Gagal mengambil detail HSQ')
    
    selectedHsq.value = data.d
  } catch (err) {
    console.error('Fetch HSQ detail error:', err)
    fetchError.value = err.message
  } finally {
    isLoading.value = false
  }
}

// --- HELPERS ---
const getDiscountText = (item) => {
  if (item.itemDisc) return item.itemDisc
  if (item.itemDiscPercent) return `${item.itemDiscPercent}%`
  return '-'
}

const getLineTotal = (item) => {
  const qty = Number(item.quantity) || 0
  const price = Number(item.unitPrice) || 0
  
  // Safely parse discount percent
  let discPercent = 0
  if (item.itemDiscPercent !== undefined && item.itemDiscPercent !== null) {
    const cleanDisc = String(item.itemDiscPercent).replace(/%/g, '').trim()
    if (cleanDisc.includes('+')) {
      const parts = cleanDisc.split('+').map(p => parseFloat(p) || 0)
      let multiplier = 1
      for (const d of parts) {
        multiplier *= (1 - d / 100)
      }
      const total = qty * price * multiplier
      return isNaN(total) ? 0 : total
    } else {
      discPercent = parseFloat(cleanDisc) || 0
    }
  }
  
  const total = qty * price * (1 - discPercent / 100)
  return isNaN(total) ? 0 : total
}

// --- EXPORT TO EXCEL ---
const exportToExcel = () => {
  if (!selectedHsq.value) return
  
  const headers = [
    ['Nomor Quotation (HSQ):', selectedHsq.value.number],
    ['Tanggal:', formatDate(selectedHsq.value.transDate)],
    ['Customer:', selectedHsq.value.customer?.name || '-'],
    ['Status:', selectedHsq.value.statusName || '-'],
    ['Total Nilai:', formatCurrency(selectedHsq.value.totalAmount)],
    ['Keterangan:', selectedHsq.value.description || '-'],
    [],
    ['No.', 'Kode Barang', 'Nama Barang', 'Qty', 'Satuan', 'Harga Satuan', 'Discount', 'Total Harga', 'Catatan Item']
  ]
  
  const rows = (selectedHsq.value.detailItem || []).map((item, idx) => [
    idx + 1,
    item.item?.no || '-',
    item.item?.name || item.detailName || '-',
    item.quantity || 0,
    item.itemUnit?.name || item.unit?.name || '-',
    item.unitPrice || 0,
    getDiscountText(item),
    getLineTotal(item),
    item.detailNotes || '-'
  ])
  
  const fullData = [...headers, ...rows]
  
  const ws = XLSX.utils.aoa_to_sheet(fullData)
  
  // Set column widths
  const wscols = [
    { wch: 6 },  // No
    { wch: 22 }, // Kode Barang
    { wch: 45 }, // Nama Barang
    { wch: 10 }, // Qty
    { wch: 10 }, // Satuan
    { wch: 15 }, // Harga Satuan
    { wch: 12 }, // Discount
    { wch: 18 }, // Total Harga
    { wch: 30 }  // Catatan Item
  ]
  ws['!cols'] = wscols
  
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Detail HSQ")
  XLSX.writeFile(wb, `HSQ_${selectedHsq.value.number.replace(/[\/\\]/g, '_')}.xlsx`)
}

// --- UTILS ---
const parseAccurateDate = (dateStr) => {
  if (!dateStr) return new Date(0)
  const parts = dateStr.split('/')
  return new Date(parts[2], parts[1] - 1, parts[0])
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  try {
    const d = parseAccurateDate(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

const formatCurrency = (val) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0)
}

const getStatusClass = (status) => {
  const name = (status || '').toLowerCase()
  if (name.includes('closed') || name.includes('selesai') || name.includes('ditutup') || name.includes('terproses')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/60'
  }
  if (name.includes('disetujui')) {
    return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/60'
  }
  if (name.includes('draft') || name.includes('draf')) {
    return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700'
  }
  if (name.includes('diajukan')) {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/60'
  }
  return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/60'
}

const goBack = () => {
  router.push('/hsq')
}

onMounted(() => {
  fetchHsqDetail()
})
</script>

<template>
  <div class="space-y-6 font-mono text-slate-800 dark:text-slate-100 p-1 md:p-3">
    <!-- Breadcrumb & Back -->
    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
        <span>Sales Quotation</span>
        <ChevronRight class="w-3 h-3 text-slate-400" />
        <span class="cursor-pointer hover:text-red-600 dark:hover:text-red-400 transition-colors" @click="goBack">Quotation (HSQ)</span>
        <ChevronRight class="w-3 h-3 text-slate-400" />
        <span class="text-slate-800 dark:text-slate-200 font-black">Detail HSQ</span>
      </div>
      
      <button 
        @click="goBack"
        class="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors bg-white dark:bg-[#1e293b] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm w-fit"
      >
        <ArrowLeft class="w-4 h-4" /> Kembali ke Daftar
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-32 bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800">
      <Loader2 class="w-10 h-10 animate-spin text-red-600 mb-3" />
      <p class="text-xs font-bold text-slate-500 dark:text-slate-400 animate-pulse tracking-widest uppercase">Mengambil detail HSQ dari Accurate...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="fetchError" class="p-6 text-center bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/30">
      <AlertCircle class="w-10 h-10 mx-auto mb-3" />
      <h3 class="text-sm font-bold">Gagal Mengambil Detail</h3>
      <p class="text-xs mt-1.5 font-sans">{{ fetchError }}</p>
      <Button @click="fetchHsqDetail" variant="outline" class="mt-4 border-red-200 hover:bg-red-50 hover:text-red-700 text-xs">Coba Lagi</Button>
    </div>

    <template v-else-if="selectedHsq">
      <!-- Title & Main Actions Card -->
      <div class="bg-white dark:bg-[#1e293b] p-5 md:p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="bg-red-50 dark:bg-red-950/20 p-2.5 rounded-xl border border-red-100 dark:border-red-950/60">
            <FileText class="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h2 class="text-lg md:text-xl font-black text-slate-900 dark:text-white font-mono flex items-center gap-2">
              {{ selectedHsq.number }}
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Dibuat tanggal <span class="font-bold text-slate-800 dark:text-slate-300">{{ formatDate(selectedHsq.transDate) }}</span>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3 flex-wrap">
          <span class="inline-flex px-3 py-1 rounded-full text-xs font-bold border" :class="getStatusClass(selectedHsq.statusName)">
            {{ selectedHsq.statusName || 'Outstanding' }}
          </span>
          
          <Button 
            @click="exportToExcel"
            class="h-9.5 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 shadow-sm rounded-lg"
          >
            <FileSpreadsheet class="w-4 h-4" /> Download Excel
          </Button>
        </div>
      </div>

      <!-- Metadata Panel -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- Customer Info -->
        <div class="bg-white dark:bg-[#1e293b] p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div class="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <User class="w-4 h-4" /> Customer
          </div>
          <div class="text-sm font-black text-slate-950 dark:text-white">
            {{ selectedHsq.customer?.name || '-' }}
          </div>
          <div class="text-[10px] text-slate-400">
            Kode: {{ selectedHsq.customer?.customerNo || '-' }}
          </div>
        </div>

        <!-- Total Value -->
        <div class="bg-white dark:bg-[#1e293b] p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div class="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <DollarSign class="w-4 h-4" /> Total Amount
          </div>
          <div class="text-lg font-black text-emerald-600 dark:text-emerald-400">
            {{ formatCurrency(selectedHsq.totalAmount) }}
          </div>
        </div>

        <!-- Extra details/status -->
        <div class="bg-white dark:bg-[#1e293b] p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div class="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <Tag class="w-4 h-4" /> Informasi Lain
          </div>
          <div class="text-xs text-slate-600 dark:text-slate-400">
            Syarat Pembayaran: <span class="font-bold text-slate-900 dark:text-white">{{ selectedHsq.paymentTerm?.name || '-' }}</span>
          </div>
          <div class="text-xs text-slate-600 dark:text-slate-400">
            Mata Uang: <span class="font-bold text-slate-900 dark:text-white">{{ selectedHsq.currency?.code || 'IDR' }}</span>
          </div>
        </div>
      </div>

      <!-- Description / Notes -->
      <div class="bg-white dark:bg-[#1e293b] p-5 md:p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h3 class="text-xs font-black uppercase text-slate-400 tracking-wider">Keterangan Dokumen</h3>
        <p class="text-sm leading-relaxed text-slate-700 dark:text-slate-300 font-sans border-l-4 border-slate-300 dark:border-slate-700 pl-4 py-1.5 italic bg-slate-50 dark:bg-[#0f172a]/30 pr-4 rounded-r">
          {{ selectedHsq.description || 'Tidak ada keterangan tambahan.' }}
        </p>
      </div>

      <!-- Items Section -->
      <div class="bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div class="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-[#0f172a] flex items-center justify-between">
          <h3 class="text-xs font-black uppercase text-slate-500 tracking-wider">Daftar Barang Penawaran</h3>
          <span class="text-xs font-bold text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 rounded-full">
            {{ selectedHsq.detailItem?.length || 0 }} Items
          </span>
        </div>
        
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50/50 dark:bg-[#0f172a]/20 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-12 text-center">No</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-44">Kode Barang</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider">Nama Barang</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-20 text-right">Quantity</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-20 text-center">Satuan</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-32 text-right">Harga Satuan</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-24 text-center">Discount</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-32 text-right">Total Harga</th>
                <th class="py-3 px-4 text-xs font-bold uppercase tracking-wider w-40">Catatan Item</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              <tr 
                v-for="(item, idx) in selectedHsq.detailItem" 
                :key="idx" 
                class="hover:bg-slate-50/40 dark:hover:bg-[#0f172a]/20 transition-colors"
              >
                <td class="py-3.5 px-4 text-center text-slate-400 font-bold">{{ idx + 1 }}</td>
                <td class="py-3.5 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">{{ item.item?.no || '-' }}</td>
                <td class="py-3.5 px-4 font-medium text-slate-900 dark:text-white leading-normal">{{ item.item?.name || item.detailName || '-' }}</td>
                <td class="py-3.5 px-4 text-right font-black text-slate-900 dark:text-white text-sm">{{ item.quantity || 0 }}</td>
                <td class="py-3.5 px-4 text-center font-bold text-slate-600 dark:text-slate-400">{{ item.itemUnit?.name || item.unit?.name || '-' }}</td>
                <td class="py-3.5 px-4 text-right font-semibold text-slate-700 dark:text-slate-300">{{ formatCurrency(item.unitPrice) }}</td>
                <td class="py-3.5 px-4 text-center font-bold text-slate-600 dark:text-slate-400">{{ getDiscountText(item) }}</td>
                <td class="py-3.5 px-4 text-right font-black text-slate-900 dark:text-white">{{ formatCurrency(getLineTotal(item)) }}</td>
                <td class="py-3.5 px-4 font-sans text-slate-500 dark:text-slate-400">{{ item.detailNotes || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
