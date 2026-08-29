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
import { 
  AlertTriangle, Calendar, Building2, User, FileText, ArrowLeft, Loader2, 
  Package, RefreshCw, CheckCircle2, XCircle, Download, Eye, ExternalLink, 
  Copy, Check, Paperclip, FileSpreadsheet, FileImage, File as FileIcon,
  Printer, X, ChevronRight, Warehouse, MessageSquare
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const rawRouteId = String(route.params.id || '')

// --- STATE ---
const poData = ref<any>(null)
const poItems = ref<any[]>([])
const attachments = ref<any[]>([])
const isLoading = ref(true)
const errorMessage = ref<string | null>(null)
const isCopied = ref<Record<string, boolean>>({})

// --- REALTIME STATE ---
const isRealtimeConnected = ref(false)
const realtimeUpdatePulse = ref(false)
let realtimeChannel: any = null

const pulseUpdate = () => {
  realtimeUpdatePulse.value = true
  setTimeout(() => { realtimeUpdatePulse.value = false }, 2000)
}

// --- DOCUMENT PREVIEW MODAL STATE ---
const previewModalOpen = ref(false)
const previewDoc = ref<any>(null)
const previewDocUrl = ref<string>('')
const previewTextContent = ref<string>('')
const previewCsvHeaders = ref<string[]>([])
const previewCsvRows = ref<string[][]>([])
const isLoadingPreview = ref(false)
const previewAttKey = ref<string | null>(null)
const downloadingAttId = ref<string | null>(null)
const isPrintingDoc = ref(false)

// --- REFRESH STATE ---
const isRefreshing = ref(false)
const refreshStatus = ref<string | null>(null)
const refreshMessage = ref('')

// Helper Signature / Edge Function invoker
const invokeEdgeFunctionWithRetry = async (functionName: string, options: any, maxRetries = 2) => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await supabase.functions.invoke(functionName, options)
      if (res.error) throw res.error
      return res
    } catch (err: any) {
      if (attempt === maxRetries) return { data: null, error: err }
      const delay = 1000 * Math.pow(2, attempt)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  return { data: null, error: new Error("Max retries exceeded") }
}

// --- DATA FETCHING ---
const fetchOrderDetails = async () => {
  isLoading.value = true
  errorMessage.value = null

  try {
    const isNumeric = /^\d+$/.test(rawRouteId)
    let dbHeader: any = null

    if (isNumeric) {
      const { data, error } = await supabase
        .from('accurate_receive_items')
        .select('*')
        .eq('id', parseInt(rawRouteId))
        .maybeSingle()
      if (error) console.warn("Supabase RI query error:", error)
      dbHeader = data
    } else {
      const targetNumber = rawRouteId.replace(/-/g, '/')
      const { data, error } = await supabase
        .from('accurate_receive_items')
        .select('*')
        .or(`number.eq.${targetNumber},number.eq.${rawRouteId}`)
        .maybeSingle()
      if (error) console.warn("Supabase RI query by number error:", error)
      dbHeader = data
    }

    // Also fetch items from database if header found
    if (dbHeader) {
      poData.value = dbHeader
      const { data: itemsData, error: itemsError } = await supabase
        .from('accurate_receive_item_items')
        .select('*')
        .eq('receive_item_id', dbHeader.id)
        .order('item_seq', { ascending: true })

      if (itemsError) {
        console.warn("Error fetching RI items from DB:", itemsError)
      } else {
        poItems.value = itemsData || []
      }
    }

    // Live sync / enrich from Accurate to get attachments, description, and live details
    try {
      const lookupParam = dbHeader?.id || rawRouteId
      const { data: accData } = await invokeEdgeFunctionWithRetry('accurate-detail-so', {
        body: { id: lookupParam, type: 'receive-item' }
      })

      if (accData && accData.s && accData.d) {
        const d = accData.d

        // Update header info with rich Accurate live fields
        poData.value = {
          ...(poData.value || {}),
          id: d.id || poData.value?.id,
          number: d.number || poData.value?.number,
          trans_date: d.transDate || poData.value?.trans_date,
          status_name: d.statusName || poData.value?.status_name,
          vendor_name: d.vendor?.name || d.vendorName || poData.value?.vendor_name,
          po_number: d.purchaseOrder?.number || d.poNumber || poData.value?.po_number,
          description: d.description || d.notes || poData.value?.description || '',
          warehouse_name: d.warehouse?.name || d.warehouseName || '',
          branch_name: d.branch?.name || d.branchName || '',
          received_by: d.receivedBy || d.charField1 || ''
        }

        // Extract attachments
        const rawAtts = d.attachments || d.attachment || d.attachmentList || d.files || []
        if (Array.isArray(rawAtts) && rawAtts.length > 0) {
          attachments.value = rawAtts.map((att: any, idx: number) => ({
            id: att.id || att.attachmentId || idx + 1,
            fileName: att.fileName || att.name || att.title || `Lampiran_${idx + 1}`,
            fileSize: att.fileSize || att.size || att.filesize || 0,
            tempPath: att.tempPath || att.url || att.downloadUrl || att.path,
            mimeType: att.mimeType || att.contentType || '',
            uploadDate: att.uploadDate || att.createdDate || d.transDate
          }))
        }

        // If items were not found in DB, populate from live Accurate response
        if (poItems.value.length === 0 && Array.isArray(d.detailItem)) {
          const extractHso = (note: string) => {
            if (!note) return null
            const match = note.match(/(HSO\/[\w\d\/]+)/i)
            return match ? match[1] : null
          }

          poItems.value = d.detailItem.map((item: any, idx: number) => ({
            id: item.id || idx + 1,
            receive_item_id: d.id,
            item_code: item.item?.no || item.itemNo || item.code || '-',
            item_name: item.item?.name || item.itemName || item.name || '-',
            quantity: parseFloat(item.quantity) || 0,
            unit_name: item.itemUnit?.name || item.unitName || 'PCS',
            detail_notes: item.detailNotes || item.notes || '',
            item_seq: idx,
            hso_number: extractHso(item.detailNotes || '') || item.hsoNumber || null,
            po_number: item.purchaseOrder?.number || item.poNumber || d.purchaseOrder?.number || d.poNumber || null,
            warehouse_name: item.warehouse?.name || d.warehouse?.name || ''
          }))
        }
      }
    } catch (accErr) {
      console.warn("Live Accurate detail enrich notice:", accErr)
    }

    if (!poData.value) {
      throw new Error(`Data Penerimaan Barang dengan ID/Nomor "${rawRouteId}" tidak ditemukan.`)
    }

  } catch (err: any) {
    console.error("Fetch RI Error:", err)
    errorMessage.value = err.message || 'Terjadi kesalahan saat memuat data Penerimaan Barang.'
  } finally {
    isLoading.value = false
  }
}

// Single RI Refresh from Accurate
const refreshSingleRI = async () => {
  if (isRefreshing.value || !poData.value?.id) return

  isRefreshing.value = true
  refreshStatus.value = null
  refreshMessage.value = ''

  try {
    await fetchOrderDetails()
    refreshStatus.value = 'success'
    refreshMessage.value = 'Data RI berhasil diperbarui langsung dari Accurate.'
    setTimeout(() => { refreshStatus.value = null; refreshMessage.value = '' }, 4000)
  } catch (err: any) {
    refreshStatus.value = 'error'
    refreshMessage.value = err.message || 'Gagal merefresh data RI.'
  } finally {
    isRefreshing.value = false
  }
}

// Total Qty Received
const totalQuantity = computed(() => {
  return poItems.value.reduce((acc, item) => acc + (parseFloat(item.quantity) || 0), 0)
})

// --- COPY HELPER ---
const copyToClipboard = (text: string, key: string) => {
  if (!text) return
  navigator.clipboard.writeText(text)
  isCopied.value[key] = true
  setTimeout(() => {
    isCopied.value[key] = false
  }, 2000)
}

// --- DOCUMENT & ATTACHMENT HELPERS ---
const getFileExt = (att: any) => {
  const name = att?.fileName || att?.name || ''
  return name.split('.').pop()?.toLowerCase() || ''
}

const isPdfDoc = (att: any) => {
  if (!att) return false
  const ext = getFileExt(att)
  const mime = att.mimeType || att.contentType || ''
  return ext === 'pdf' || mime.includes('pdf') || att.isOfficialPdf
}

const isImageDoc = (att: any) => {
  if (!att) return false
  const ext = getFileExt(att)
  const mime = att.mimeType || att.contentType || ''
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext) || mime.startsWith('image/')
}

const formatFileSize = (bytes: number) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// 1. View Official Accurate Document (Print PDF)
const viewOfficialDocument = async () => {
  if (!poData.value?.id) return
  isPrintingDoc.value = true

  try {
    const docId = poData.value.id
    const docNumber = poData.value.number || 'RI'

    const { data, error } = await supabase.functions.invoke('accurate-print-doc', {
      body: {
        id: docId,
        type: 'receive-item',
        filename: `Penerimaan_Barang_${docNumber.replace(/[\/\\]/g, '_')}.pdf`,
        returnBase64: true
      }
    })

    if (error) throw error
    if (!data || !data.base64) throw new Error('Gagal mendapatkan dokumen PDF dari Accurate.')

    const byteCharacters = atob(data.base64)
    const byteNumbers = new Uint8Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const blob = new Blob([byteNumbers], { type: 'application/pdf' })

    if (previewDocUrl.value && previewDocUrl.value.startsWith('blob:')) {
      window.URL.revokeObjectURL(previewDocUrl.value)
    }

    previewDocUrl.value = window.URL.createObjectURL(blob)
    previewDoc.value = {
      fileName: `Penerimaan_Barang_${docNumber}.pdf`,
      fileSize: byteNumbers.length,
      isOfficialPdf: true,
      mimeType: 'application/pdf'
    }
    previewModalOpen.value = true

  } catch (err: any) {
    console.error("View Official Document Error:", err)
    alert("Gagal memuat Dokumen Penerimaan Barang: " + (err.message || 'Error'))
  } finally {
    isPrintingDoc.value = false
  }
}

// 2. Preview Attachment
const previewAttachment = async (att: any) => {
  if (!att) return
  const attKey = String(att.id || att.fileName)
  previewAttKey.value = attKey
  isLoadingPreview.value = true

  try {
    const fileName = att.fileName || att.name || 'lampiran_dokumen'
    const { data, error } = await supabase.functions.invoke('accurate-print-doc', {
      body: {
        attachmentId: att.id,
        url: att.tempPath || att.url || att.downloadUrl,
        filename: fileName,
        returnBase64: true
      }
    })

    if (error) throw error
    if (!data) throw new Error('File tidak ditemukan dari Accurate')

    if (previewDocUrl.value && previewDocUrl.value.startsWith('blob:')) {
      window.URL.revokeObjectURL(previewDocUrl.value)
    }

    previewDoc.value = att

    if (data.base64) {
      const byteCharacters = atob(data.base64)
      const byteNumbers = new Uint8Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }

      if (isImageDoc(att)) {
        previewDocUrl.value = data.dataUrl || `data:${data.contentType || 'image/jpeg'};base64,${data.base64}`
      } else if (isPdfDoc(att)) {
        const blob = new Blob([byteNumbers], { type: 'application/pdf' })
        previewDocUrl.value = window.URL.createObjectURL(blob)
      } else {
        const blob = new Blob([byteNumbers], { type: data.contentType || 'application/octet-stream' })
        previewDocUrl.value = window.URL.createObjectURL(blob)
      }
    } else if (data.dataUrl) {
      previewDocUrl.value = data.dataUrl
    }

    previewModalOpen.value = true

  } catch (err: any) {
    console.error('Preview attachment error:', err)
    alert('Gagal memuat preview lampiran: ' + (err.message || 'Error'))
  } finally {
    isLoadingPreview.value = false
    previewAttKey.value = null
  }
}

// 3. Download Attachment / Official Document
const downloadAttachment = async (att: any) => {
  if (!att) return
  const attKey = String(att.id || att.fileName)
  downloadingAttId.value = attKey

  try {
    const fileName = att.fileName || att.name || 'dokumen'
    
    // If it's already an active blob preview url, download directly
    if (previewDocUrl.value && previewDoc.value?.fileName === fileName) {
      const a = document.createElement('a')
      a.href = previewDocUrl.value
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      return
    }

    const { data, error } = await supabase.functions.invoke('accurate-print-doc', {
      body: {
        attachmentId: att.id,
        url: att.tempPath || att.url || att.downloadUrl,
        filename: fileName,
        returnBase64: true
      }
    })

    if (error) throw error
    if (!data || !data.base64) throw new Error('File tidak ditemukan')

    const byteCharacters = atob(data.base64)
    const byteNumbers = new Uint8Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const blob = new Blob([byteNumbers], { type: data.contentType || 'application/octet-stream' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    a.remove()

  } catch (err: any) {
    console.error('Download attachment error:', err)
    alert('Gagal mengunduh dokumen: ' + (err.message || 'Error'))
  } finally {
    downloadingAttId.value = null
  }
}

const openInNewTab = () => {
  if (previewDocUrl.value) {
    window.open(previewDocUrl.value, '_blank')
  }
}

const printDocument = () => {
  if (previewDocUrl.value) {
    const iframe = document.querySelector('iframe')
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.print()
    } else {
      window.open(previewDocUrl.value, '_blank')?.print()
    }
  }
}

const closeAttachmentPreview = () => {
  previewModalOpen.value = false
  if (previewDocUrl.value && previewDocUrl.value.startsWith('blob:')) {
    window.URL.revokeObjectURL(previewDocUrl.value)
  }
  previewDocUrl.value = ''
  previewTextContent.value = ''
  previewCsvHeaders.value = []
  previewCsvRows.value = []
  previewDoc.value = null
}

onMounted(() => {
  fetchOrderDetails()

  // Realtime subscription
  if (rawRouteId && /^\d+$/.test(rawRouteId)) {
    realtimeChannel = supabase
      .channel(`ri-detail-${rawRouteId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'accurate_receive_item_items',
          filter: `receive_item_id=eq.${rawRouteId}`
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
  }
})

onUnmounted(() => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
  }
  if (previewDocUrl.value && previewDocUrl.value.startsWith('blob:')) {
    window.URL.revokeObjectURL(previewDocUrl.value)
  }
})

// --- HELPERS ---
const formatDate = (dateStr: string) => {
  if (!dateStr) return '-'
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/')
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
      if (!isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
      }
    }
  }
  const date = new Date(dateStr)
  return isNaN(date.getTime()) ? dateStr : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Terproses': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
    case 'Ditutup': return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
    case 'Draf': return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'
    case 'Diajukan': return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800'
    case 'Menunggu diproses': return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800'
    case 'Sebagian diproses': return 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800'
    case 'Ditolak': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
    default: return 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700'
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50/50 dark:bg-[#0f172a] pb-24 font-sans transition-colors duration-300">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">

      <!-- ERROR STATE -->
      <div v-if="errorMessage" class="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-800 rounded-2xl border border-red-100 dark:border-red-900 shadow-sm animate-in zoom-in-95 duration-300">
        <div class="bg-red-50 dark:bg-red-900/20 p-4 rounded-full mb-6">
          <AlertTriangle class="w-12 h-12 text-red-500" />
        </div>
        <h3 class="text-xl font-bold text-slate-900 dark:text-white mb-2">Gagal Memuat Data</h3>
        <p class="text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto">{{ errorMessage }}</p>
        <Button @click="router.push('/receive-items')" variant="outline" class="rounded-xl">
          <ArrowLeft class="w-4 h-4 mr-2" /> Kembali ke List
        </Button>
      </div>

      <!-- LOADING STATE -->
      <div v-else-if="isLoading" class="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 class="animate-spin w-10 h-10 text-red-600"/>
        <p class="text-slate-500 dark:text-slate-400 mt-4 text-sm font-medium">Memuat detail Penerimaan Barang (RI)...</p>
      </div>

      <!-- MAIN CONTENT -->
      <div v-else-if="poData" class="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
        
        <!-- TOP BREADCRUMB & LIVE STATUS -->
        <div class="flex items-center justify-between gap-4">
          <Button @click="router.push('/receive-items')" variant="ghost" class="w-fit pl-0 text-xs font-semibold hover:bg-transparent hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 cursor-pointer">
            <ArrowLeft class="w-4 h-4 mr-1.5"/> Kembali ke List Penerimaan Barang
          </Button>

          <div class="flex items-center gap-3">
            <!-- Realtime Pulse -->
            <div class="flex items-center gap-1.5 text-[11px] font-medium select-none"
                 :class="realtimeUpdatePulse 
                   ? 'text-red-600 dark:text-red-400' 
                   : isRealtimeConnected 
                     ? 'text-emerald-600 dark:text-emerald-400' 
                     : 'text-slate-400 dark:text-slate-600'">
              <span class="relative flex h-2 w-2">
                <span v-if="isRealtimeConnected || realtimeUpdatePulse" 
                      class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                      :class="realtimeUpdatePulse ? 'bg-red-400' : 'bg-emerald-400'">
                </span>
                <span class="relative inline-flex rounded-full h-2 w-2 transition-colors duration-300"
                      :class="realtimeUpdatePulse ? 'bg-red-500' : isRealtimeConnected ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'">
                </span>
              </span>
              <span class="hidden sm:inline">
                {{ realtimeUpdatePulse ? 'Diperbarui!' : isRealtimeConnected ? 'Live Realtime' : 'Offline' }}
              </span>
            </div>

            <Button
              @click="refreshSingleRI"
              :disabled="isRefreshing"
              size="sm"
              variant="outline"
              class="h-8 px-3 text-xs font-semibold gap-1.5 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer"
            >
              <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isRefreshing }" />
              <span>{{ isRefreshing ? 'Memperbarui...' : 'Refresh RI' }}</span>
            </Button>
          </div>
        </div>

        <!-- REFRESH FEEDBACK MESSAGE -->
        <Transition
          enter-active-class="transition-all duration-300"
          enter-from-class="opacity-0 -translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-200"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <div v-if="refreshStatus === 'success'" class="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 shadow-sm">
            <CheckCircle2 class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{{ refreshMessage }}</span>
          </div>
          <div v-else-if="refreshStatus === 'error'" class="flex items-center gap-2 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl p-3 shadow-sm">
            <XCircle class="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            <span>{{ refreshMessage }}</span>
          </div>
        </Transition>

        <!-- MAIN HEADER CARD -->
        <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-sm space-y-6">
          <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-700/60">
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <Badge variant="outline" class="uppercase tracking-widest text-[10px] px-2.5 py-0.5 border-red-200 bg-red-50/50 dark:bg-red-950/30 text-red-700 dark:text-red-300 font-bold">
                  Penerimaan Barang (RI)
                </Badge>
                <Badge :class="getStatusColor(poData?.status_name)" class="px-3 py-0.5 text-xs font-bold rounded-lg shadow-2xs border">
                  {{ poData?.status_name || 'Terproses' }}
                </Badge>
              </div>

              <div class="flex items-center gap-3">
                <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight font-sans">
                  {{ poData.number }}
                </h1>
                <button 
                  @click="copyToClipboard(poData.number, 'ri_number')" 
                  class="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                  title="Salin Nomor RI"
                >
                  <component :is="isCopied['ri_number'] ? Check : Copy" class="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </div>

            <!-- ACTION BUTTONS: VIEW OFFICIAL PDF & PRINT -->
            <div class="flex flex-wrap items-center gap-3">
              <Button 
                @click="viewOfficialDocument" 
                :disabled="isPrintingDoc"
                class="bg-red-600 hover:bg-red-700 text-white font-bold text-xs h-10 px-5 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
              >
                <Loader2 v-if="isPrintingDoc" class="w-4 h-4 animate-spin" />
                <FileText v-else class="w-4 h-4" />
                <span>{{ isPrintingDoc ? 'Memuat Dokumen...' : 'Lihat Dokumen RI (PDF)' }}</span>
              </Button>
            </div>
          </div>

          <!-- KEY INFORMATION GRID -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <!-- Tanggal Terima -->
            <div class="flex items-start gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
              <div class="p-2.5 bg-white dark:bg-slate-800 rounded-lg shadow-2xs border border-slate-200/60 dark:border-slate-700 text-red-600 dark:text-red-400">
                <Calendar class="w-5 h-5" />
              </div>
              <div class="min-w-0">
                <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tanggal Terima</div>
                <div class="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{{ formatDate(poData?.trans_date) }}</div>
              </div>
            </div>

            <!-- Vendor / Supplier -->
            <div class="flex items-start gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
              <div class="p-2.5 bg-white dark:bg-slate-800 rounded-lg shadow-2xs border border-slate-200/60 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                <Building2 class="w-5 h-5" />
              </div>
              <div class="min-w-0">
                <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vendor / Pemasok</div>
                <div class="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 truncate" :title="poData?.vendor_name">
                  {{ poData?.vendor_name || 'Tanpa Vendor' }}
                </div>
              </div>
            </div>

            <!-- No. Purchase Order (PO) -->
            <div class="flex items-start gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
              <div class="p-2.5 bg-white dark:bg-slate-800 rounded-lg shadow-2xs border border-slate-200/60 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                <FileText class="w-5 h-5" />
              </div>
              <div class="min-w-0">
                <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">No. Purchase Order</div>
                <div class="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 flex items-center gap-1.5">
                  <span class="truncate">{{ poData?.po_number || '-' }}</span>
                  <button 
                    v-if="poData?.po_number && poData.po_number !== '-'" 
                    @click="copyToClipboard(poData.po_number, 'po_number')"
                    class="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                    title="Salin No PO"
                  >
                    <component :is="isCopied['po_number'] ? Check : Copy" class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <!-- Total Qty Diterima -->
            <div class="flex items-start gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
              <div class="p-2.5 bg-white dark:bg-slate-800 rounded-lg shadow-2xs border border-slate-200/60 dark:border-slate-700 text-emerald-600 dark:text-emerald-400">
                <Package class="w-5 h-5" />
              </div>
              <div class="min-w-0">
                <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Barang Diterima</div>
                <div class="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {{ poItems.length }} Item ({{ totalQuantity }} PCS)
                </div>
              </div>
            </div>
          </div>

          <!-- CATATAN DOKUMEN DARI ADMIN -->
          <div v-if="poData?.description" class="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
            <MessageSquare class="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span class="font-bold uppercase tracking-wider text-[10px] text-amber-800 dark:text-amber-300 block mb-0.5">Catatan Penerimaan Admin / Gudang:</span>
              <p class="whitespace-pre-wrap leading-relaxed">{{ poData.description }}</p>
            </div>
          </div>
        </div>

        <!-- ITEMS TABLE (DETAIL BARANG DITERIMA) -->
        <Card class="border border-slate-200/80 dark:border-slate-700/80 shadow-sm rounded-2xl overflow-hidden bg-white dark:bg-slate-800">
          <CardHeader class="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-900/60 px-6 py-4">
            <div class="flex items-center gap-2.5">
              <div class="p-2 bg-red-100 dark:bg-red-950/50 rounded-lg text-red-600 dark:text-red-400">
                <Package class="w-4 h-4"/>
              </div>
              <div>
                <CardTitle class="text-base font-bold text-slate-900 dark:text-white">Detail Barang Diterima</CardTitle>
                <p class="text-xs text-slate-500 dark:text-slate-400">Rincian produk yang diinput oleh admin/gudang ke dalam dokumen penerimaan ini</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Badge variant="outline" class="font-bold text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                {{ poItems.length }} Item
              </Badge>
            </div>
          </CardHeader>
          <CardContent class="p-0">
            <div class="overflow-x-auto">
              <Table>
                <TableHeader class="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-100 dark:border-slate-700">
                  <TableRow class="hover:bg-transparent">
                    <TableHead class="w-[50px] font-bold text-xs text-slate-500 uppercase tracking-wider py-3.5 px-4">#</TableHead>
                    <TableHead class="font-bold text-xs text-slate-500 uppercase tracking-wider py-3.5 px-4 min-w-[280px]">Item Produk & Catatan</TableHead>
                    <TableHead class="font-bold text-xs text-slate-500 uppercase tracking-wider py-3.5 px-4 hidden md:table-cell w-[180px]">Referensi HSO</TableHead>
                    <TableHead class="font-bold text-xs text-slate-500 uppercase tracking-wider py-3.5 px-4 hidden sm:table-cell w-[180px]">No. PO</TableHead>
                    <TableHead class="text-right font-bold text-xs text-slate-500 uppercase tracking-wider py-3.5 px-4 w-[140px]">Qty Diterima</TableHead>
                  </TableRow>
                </TableHeader>
                
                <TableBody>
                  <TableRow v-for="(item, idx) in poItems" :key="item.id || idx" class="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors border-b border-slate-100 dark:border-slate-700/60 last:border-0">
                    
                    <TableCell class="py-4 px-4 align-top font-bold text-xs text-slate-400">
                      {{ idx + 1 }}
                    </TableCell>

                    <TableCell class="py-4 px-4 align-top">
                      <div class="space-y-1.5">
                        <div class="flex items-center gap-2">
                          <span class="font-bold font-mono text-sm text-slate-900 dark:text-white">{{ item.item_code }}</span>
                          <button 
                            @click="copyToClipboard(item.item_code, `sku_${idx}`)"
                            class="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                            title="Salin SKU"
                          >
                            <component :is="isCopied[`sku_${idx}`] ? Check : Copy" class="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div class="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                          {{ item.item_name }}
                        </div>

                        <!-- Catatan Khusus Barang yang diinput Admin -->
                        <div v-if="item.detail_notes" class="mt-2 p-2.5 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 rounded-lg text-xs text-amber-900 dark:text-amber-200 space-y-0.5">
                          <div class="font-bold text-[10px] uppercase tracking-wider text-amber-800 dark:text-amber-400 flex items-center gap-1">
                            <MessageSquare class="w-3 h-3" />
                            <span>Catatan Barang (Admin):</span>
                          </div>
                          <p class="whitespace-pre-wrap pl-4">{{ item.detail_notes }}</p>
                        </div>
                      </div>
                    </TableCell>

                    <!-- Referensi HSO -->
                    <TableCell class="py-4 px-4 align-top hidden md:table-cell">
                      <div v-if="item.hso_number">
                        <Badge 
                          @click="router.push(`/sales-orders/${item.hso_number.replace(/\//g, '-')}?search=${encodeURIComponent(item.item_code)}&highlight=${encodeURIComponent(item.item_code)}`)"
                          class="bg-red-50 hover:bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:hover:bg-red-900/50 dark:text-red-300 dark:border-red-800 cursor-pointer transition-all font-semibold text-xs py-1 px-2.5 rounded-lg flex items-center gap-1 w-fit shadow-2xs"
                          title="Buka Halaman Detail HSO Ini"
                        >
                          <span>{{ item.hso_number }}</span>
                          <ExternalLink class="w-3 h-3 opacity-70" />
                        </Badge>
                      </div>
                      <span v-else class="text-xs text-slate-400 italic">-</span>
                    </TableCell>

                    <!-- Referensi PO -->
                    <TableCell class="py-4 px-4 align-top hidden sm:table-cell">
                      <div v-if="item.po_number || poData?.po_number" class="text-xs font-semibold text-slate-700 dark:text-slate-300 font-mono">
                        {{ item.po_number || poData?.po_number }}
                      </div>
                      <span v-else class="text-xs text-slate-400 italic">-</span>
                    </TableCell>

                    <!-- Qty Diterima -->
                    <TableCell class="py-4 px-4 align-top text-right whitespace-nowrap">
                      <div class="font-extrabold text-base text-slate-900 dark:text-white tabular-nums">
                        {{ item.quantity }}
                      </div>
                      <div class="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        {{ item.unit_name || 'PCS' }}
                      </div>
                    </TableCell>
                    
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <!-- SECTION: LAMPIRAN & BERKAS DOKUMEN -->
        <Card class="border border-slate-200/80 dark:border-slate-700/80 shadow-sm rounded-2xl overflow-hidden bg-white dark:bg-slate-800">
          <CardHeader class="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-900/60 px-6 py-4">
            <div class="flex items-center gap-2.5">
              <div class="p-2 bg-emerald-100 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                <Paperclip class="w-4 h-4"/>
              </div>
              <div>
                <CardTitle class="text-base font-bold text-slate-900 dark:text-white">Lampiran & Berkas Dokumen</CardTitle>
                <p class="text-xs text-slate-500 dark:text-slate-400">Berkas fisik/surat jalan yang diunggah oleh admin pada transaksi Accurate ini</p>
              </div>
            </div>
            <Badge variant="outline" class="font-bold text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              {{ attachments.length }} Berkas
            </Badge>
          </CardHeader>
          
          <CardContent class="p-6">
            <!-- If attachments exist -->
            <div v-if="attachments.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div 
                v-for="att in attachments" 
                :key="att.id" 
                class="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/80 hover:border-red-300 dark:hover:border-red-700 transition-all flex flex-col justify-between space-y-3 group"
              >
                <div class="flex items-start gap-3">
                  <div class="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 shrink-0">
                    <FileText v-if="isPdfDoc(att)" class="w-5 h-5 text-red-600" />
                    <FileImage v-else-if="isImageDoc(att)" class="w-5 h-5 text-blue-600" />
                    <FileSpreadsheet v-else-if="getFileExt(att).includes('xls') || getFileExt(att).includes('csv')" class="w-5 h-5 text-emerald-600" />
                    <FileIcon v-else class="w-5 h-5 text-slate-500" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors" :title="att.fileName">
                      {{ att.fileName }}
                    </h4>
                    <p class="text-[11px] text-slate-400 mt-0.5 font-medium">
                      {{ formatFileSize(att.fileSize) }} &bull; {{ getFileExt(att).toUpperCase() }}
                    </p>
                  </div>
                </div>

                <div class="flex items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    class="h-8 flex-1 text-xs font-semibold gap-1.5 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-red-50 hover:text-red-600 dark:hover:bg-slate-700 transition-all cursor-pointer"
                    @click="previewAttachment(att)"
                    :disabled="isLoadingPreview && previewAttKey === String(att.id)"
                  >
                    <Loader2 v-if="isLoadingPreview && previewAttKey === String(att.id)" class="w-3.5 h-3.5 animate-spin" />
                    <Eye v-else class="w-3.5 h-3.5" />
                    <span>Lihat</span>
                  </Button>

                  <Button 
                    size="sm" 
                    variant="ghost" 
                    class="h-8 px-2 text-xs text-slate-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                    @click="downloadAttachment(att)"
                    :disabled="downloadingAttId === String(att.id)"
                    title="Unduh File"
                  >
                    <Loader2 v-if="downloadingAttId === String(att.id)" class="w-3.5 h-3.5 animate-spin" />
                    <Download v-else class="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <!-- Empty Attachments Prompt -->
            <div v-else class="flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              <div class="p-3 bg-white dark:bg-slate-800 rounded-full shadow-2xs border border-slate-100 dark:border-slate-700 mb-3 text-slate-400">
                <Paperclip class="w-6 h-6" />
              </div>
              <h4 class="text-sm font-bold text-slate-800 dark:text-slate-200">Tidak Ada Lampiran Tambahan</h4>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
                Admin belum mengunggah lampiran foto/file khusus untuk transaksi ini. Dokumen resmi Penerimaan Barang (RI) tetap dapat dilihat melalui tombol <strong>"Lihat Dokumen RI (PDF)"</strong> di atas.
              </p>
              <Button 
                @click="viewOfficialDocument" 
                variant="outline" 
                size="sm" 
                class="mt-4 gap-1.5 text-xs font-semibold rounded-xl border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40 cursor-pointer"
              >
                <FileText class="w-3.5 h-3.5" />
                <span>Buka Dokumen Cetak RI</span>
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>

    <!-- ATTACHMENT & OFFICIAL DOCUMENT PREVIEW MODAL -->
    <div 
      v-if="previewModalOpen" 
      class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200"
      @click.self="closeAttachmentPreview"
    >
      <div class="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[94vh] overflow-hidden animate-in zoom-in-95 duration-150">
        <!-- Header -->
        <div class="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-950/50 shrink-0">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0">
              <FileText v-if="isPdfDoc(previewDoc)" class="w-4 h-4 text-red-600 dark:text-red-400" />
              <Paperclip v-else class="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
            <div class="min-w-0">
              <h3 class="text-sm font-bold text-slate-900 dark:text-white truncate">
                {{ previewDoc?.fileName || previewDoc?.name || 'Dokumen Penerimaan Barang' }}
              </h3>
              <p class="text-[11px] text-slate-400 dark:text-slate-500">
                {{ formatFileSize(previewDoc?.fileSize) }} &bull; Dokumen Resmi Accurate Online
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button 
              v-if="previewDocUrl" 
              @click="printDocument" 
              class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Cetak Dokumen"
            >
              <Printer class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">Cetak</span>
            </button>

            <button 
              v-if="previewDocUrl" 
              @click="openInNewTab" 
              class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Buka di Tab Baru"
            >
              <ExternalLink class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">Tab Baru</span>
            </button>

            <button 
              @click="downloadAttachment(previewDoc)" 
              class="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 shadow-sm transition-colors cursor-pointer"
              title="Download File"
            >
              <Download class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">Download</span>
            </button>

            <button 
              @click="closeAttachmentPreview" 
              class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ml-1"
              title="Tutup Preview"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- Body Content -->
        <div class="flex-1 overflow-auto p-2 sm:p-4 bg-slate-100/80 dark:bg-slate-950/80 flex flex-col items-center justify-center min-h-[460px]">
          
          <!-- 1. PDF Viewer -->
          <iframe 
            v-if="isPdfDoc(previewDoc)" 
            :src="previewDocUrl" 
            class="w-full h-[80vh] rounded-xl border border-slate-200 dark:border-slate-800 bg-white" 
            title="PDF Document Preview"
          />

          <!-- 2. Image Viewer -->
          <div v-else-if="isImageDoc(previewDoc)" class="flex items-center justify-center p-3 w-full h-full max-h-[80vh] overflow-auto">
            <img 
              :src="previewDocUrl" 
              :alt="previewDoc?.fileName" 
              class="max-w-full max-h-[75vh] object-contain rounded-xl shadow-lg border border-slate-200 dark:border-slate-800"
            />
          </div>

          <!-- 3. Fallback Document -->
          <div v-else class="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <FileIcon class="w-16 h-16 text-slate-400 mb-4" />
            <h4 class="text-base font-bold text-slate-900 dark:text-white">{{ previewDoc?.fileName }}</h4>
            <p class="text-xs text-slate-500 mt-1 mb-6">Format file ini dapat diunduh untuk dibuka pada aplikasi terkait.</p>
            <Button @click="downloadAttachment(previewDoc)" class="bg-red-600 hover:bg-red-700 text-white font-bold text-xs">
              <Download class="w-4 h-4 mr-2" /> Download File
            </Button>
          </div>

        </div>
      </div>
    </div>

  </div>
</template>
