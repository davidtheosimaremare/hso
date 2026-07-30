<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Package, Eye, AlertTriangle, Clock, ArrowUpCircle, ChevronDown, ChevronUp, Pin, X, RotateCcw, RefreshCw } from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'

const props = defineProps({
  soList: { type: Array, required: true },
  poList: { type: Array, default: () => [] },
  shipmentsList: { type: Array, default: () => [] },
  isLoading: { type: Boolean, default: false },
  targetYear: { type: Number, required: true }
})

const router = useRouter()

// Local storage interactive states
const dismissedOrders = ref([])
const lowPriorityOrders = ref([])
const pinnedOrders = ref([])

onMounted(() => {
  try {
    dismissedOrders.value = JSON.parse(localStorage.getItem('hso_dismissed_orders') || '[]')
    lowPriorityOrders.value = JSON.parse(localStorage.getItem('hso_low_priority_orders') || '[]')
    pinnedOrders.value = JSON.parse(localStorage.getItem('hso_pinned_orders') || '[]')
  } catch (e) {
    console.error('Failed to load local storage state:', e)
  }
})

const saveState = () => {
  localStorage.setItem('hso_dismissed_orders', JSON.stringify(dismissedOrders.value))
  localStorage.setItem('hso_low_priority_orders', JSON.stringify(lowPriorityOrders.value))
  localStorage.setItem('hso_pinned_orders', JSON.stringify(pinnedOrders.value))
}

const dismissOrder = (number) => {
  if (!dismissedOrders.value.includes(number)) {
    dismissedOrders.value.push(number)
    saveState()
  }
}

const togglePin = (number) => {
  if (pinnedOrders.value.includes(number)) {
    pinnedOrders.value = pinnedOrders.value.filter(n => n !== number)
  } else {
    pinnedOrders.value.push(number)
    // Remove from low priority just in case
    lowPriorityOrders.value = lowPriorityOrders.value.filter(n => n !== number)
  }
  saveState()
}

const toggleLowPriority = (number) => {
  if (lowPriorityOrders.value.includes(number)) {
    lowPriorityOrders.value = lowPriorityOrders.value.filter(n => n !== number)
  } else {
    lowPriorityOrders.value.push(number)
    // Remove from pinned just in case
    pinnedOrders.value = pinnedOrders.value.filter(n => n !== number)
  }
  saveState()
}

const restoreAll = () => {
  dismissedOrders.value = []
  lowPriorityOrders.value = []
  pinnedOrders.value = []
  localStorage.removeItem('hso_dismissed_orders')
  localStorage.removeItem('hso_low_priority_orders')
  localStorage.removeItem('hso_pinned_orders')
}

const formatCurrency = (val) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0)
}

const formatCurrencyShort = (val) => {
  if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(1) + 'M'
  if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(0) + 'jt'
  return formatCurrency(val)
}

const parseAccurateDate = (dateStr) => {
  if (!dateStr) return new Date()
  const parts = dateStr.split('/')
  if (parts.length !== 3) return new Date()
  return new Date(parts[2], parts[1] - 1, parts[0])
}

const formatDateId = (dateStr) => {
  if (!dateStr) return '-'
  const d = parseAccurateDate(dateStr)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Age in days
const getAgeDays = (dateStr) => {
  const d = parseAccurateDate(dateStr)
  const today = new Date()
  today.setHours(0,0,0,0)
  d.setHours(0,0,0,0)
  const diffTime = today - d
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)))
}

// Process stage description based on Accurate status & percentShipped
const getProcessStage = (so) => {
  const s = (so.statusName || '').toLowerCase()
  if (s === 'draft' || s === 'diajukan' || s === 'menunggu persetujuan') return 'Approval'
  if (so.percentShipped === 0) return 'Persiapan Barang'
  if (so.percentShipped > 0 && so.percentShipped < 100) return 'Pengiriman'
  return 'Menunggu Invoice'
}

// Process stage styling
const getStageBadgeClass = (stage) => {
  switch (stage) {
    case 'Approval': return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40'
    case 'Persiapan Barang': return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/40'
    case 'Pengiriman': return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-900/40'
    default: return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40'
  }
}

// Helper to find the HPO creation date
const getPoDate = (hpoNumberStr) => {
  if (!hpoNumberStr) return null
  const numbers = hpoNumberStr.split(',').map(n => n.trim())
  for (const num of numbers) {
    const target = num.replace(/HP0/gi, 'HPO').toLowerCase()
    const matchedPo = props.poList.find(p => String(p.number || '').replace(/HP0/gi, 'HPO').toLowerCase() === target)
    if (matchedPo && matchedPo.transDate) {
      return parseAccurateDate(matchedPo.transDate)
    }
  }
  return null
}

// Helper to find the HPO vendor name
const getPoVendor = (hpoNumberStr) => {
  if (!hpoNumberStr) return null
  const numbers = hpoNumberStr.split(',').map(n => n.trim())
  for (const num of numbers) {
    const target = num.replace(/HP0/gi, 'HPO').toLowerCase()
    const matchedPo = props.poList.find(p => String(p.number || '').replace(/HP0/gi, 'HPO').toLowerCase() === target)
    if (matchedPo && matchedPo.vendorName) {
      return matchedPo.vendorName
    }
  }
  return null
}

const soDetailsMap = ref({})
const soPoItemsMap = ref({})
const isFetchingDetails = ref({})
const isSyncing = ref(false)

const fetchDetailsForList = async (force = false) => {
  const visibleList = props.soList.filter(so => {
    const d = parseAccurateDate(so.transDate)
    if (d.getFullYear() !== props.targetYear) return false
    
    const s = (so.statusName || '').toLowerCase().trim()
    return s === 'menunggu diproses' || s === 'sebagian diproses'
  })

  const promises = visibleList.map(async (so) => {
    if (force || (!soDetailsMap.value[so.id] && !isFetchingDetails.value[so.id])) {
      isFetchingDetails.value[so.id] = true
      try {
        const detailPromise = supabase.functions.invoke('accurate-detail-so', {
          body: { id: so.id }
        })
        
        const poPromise = supabase
          .from('accurate_purchase_order_items')
          .select('item_code, quantity')
          .ilike('detail_notes', `%${so.number}%`)

        const [detailRes, poRes] = await Promise.all([detailPromise, poPromise])
        
        if (!detailRes.error && detailRes.data?.s && detailRes.data?.d?.detailItem) {
          soDetailsMap.value[so.id] = detailRes.data.d.detailItem
        }
        if (!poRes.error && poRes.data) {
          soPoItemsMap.value[so.id] = poRes.data
        }
      } catch (e) {
        console.error('Error fetching details for SO', so.number, e)
      } finally {
        isFetchingDetails.value[so.id] = false
      }
    }
  })

  await Promise.all(promises)
}

const emit = defineEmits(['refresh'])

const syncData = async () => {
  if (isSyncing.value) return
  isSyncing.value = true
  try {
    isFetchingDetails.value = {}
    emit('refresh')
    await fetchDetailsForList(true)
    soDetailsMap.value = { ...soDetailsMap.value }
    soPoItemsMap.value = { ...soPoItemsMap.value }
  } catch (e) {
    console.error('Error syncing HSO priority data:', e)
  } finally {
    isSyncing.value = false
  }
}

// Watch for priorityList changes to fetch items
watch(
  () => props.soList,
  () => {
    fetchDetailsForList(false)
  },
  { immediate: true, deep: true }
)

// Filtered, analyzed, and sorted priority list
const priorityList = computed(() => {
  const filtered = props.soList.filter(so => {
    const d = parseAccurateDate(so.transDate)
    if (d.getFullYear() !== props.targetYear) return false
    
    const s = (so.statusName || '').toLowerCase().trim()
    // Kriteria: Hanya status "Menunggu diproses" dan "Sebagian diproses"
    return s === 'menunggu diproses' || s === 'sebagian diproses'
  })

  const isMatchingSoId = (shipmentSoId, so) => {
    if (!shipmentSoId || !so) return false
    const shipIdStr = String(shipmentSoId).trim()
    const soIdStr = String(so.id).trim()
    if (shipIdStr === soIdStr) return true
    
    if (so.number) {
      const soNumStr = String(so.number).trim()
      if (shipIdStr === soNumStr) return true
      
      const normShip = shipIdStr.replace(/[\/\\]/g, '-').toLowerCase()
      const normSo = soNumStr.replace(/[\/\\]/g, '-').toLowerCase()
      if (normShip === normSo) return true
    }
    return false
  }

  const parseStockFromNote = (note) => {
    if (!note) return { qty: 0, isReady: false, hasInfo: false }
    const lower = note.toLowerCase()
    
    if (lower.includes('no stock') || lower.includes('non stock') || lower.includes('kosong') || lower.includes('indent')) {
        return { qty: 0, isReady: false, hasInfo: true }
    }
    
    const match = lower.match(/(?:stock|stok|sisa)\s*[:.]?\s*(\d+)/)
    if (match) {
        return { qty: parseInt(match[1]), isReady: false, hasInfo: true }
    }
    
    if (lower.includes('stock') || lower.includes('stok') || lower.includes('ready')) {
        return { qty: 999999, isReady: true, hasInfo: true }
    }
    return { qty: 0, isReady: false, hasInfo: false }
  }

  // Map logistik warnings & bahasa manusia tindakan
  const mapped = filtered.map(so => {
    const allSoShipments = props.shipmentsList.filter(s => isMatchingSoId(s.so_id, so))
    
    // Deduplicate per item_code: for each item, keep only the most logistically advanced row.
    // This eliminates orphan/stale rows created before HPO sync or Excel upload.
    // Helper: item is only 'shipped' if SO is 100% completed or status explicitly says fully shipped / completed
    const isFullyShippedStatus = (s) => {
      if (so.percentShipped === 100) return true
      if (s.current_status) {
        const cs = s.current_status.toLowerCase()
        if (cs.includes('produk sudah dikirim') || cs.includes('completed') || cs.includes('fully shipped') || cs.includes('terkirim semua')) {
          return true
        }
      }
      return false
    }

    // Stage order (higher = more advanced): shipped > ready > dunex > eta > exwork > pending > nopo
    const stageScore = (s) => {
      if (isFullyShippedStatus(s)) return 7
      const cs = (s.current_status || '').toLowerCase()
      if (s.hokiindo_date || cs.includes('hokiindo') || cs.includes('siap kirim')) return 6
      if (s.dunex_date || cs.includes('dunex') || cs.includes('siemens warehouse')) return 5
      if (s.eta_date || cs.includes('eta port') || cs.includes('transit')) return 4
      if (s.exwork_date || cs.includes('ex-work') || cs.includes('exwork') || cs.includes('forwarder')) return 3
      if (s.hpo_number) return 2  // has HPO, just no date yet
      return 1  // no HPO, no date = orphan / truly unordered
    }
    
    // Group by item_code and keep the best row per item
    const byItemCode = new Map()
    for (const s of allSoShipments) {
      const key = s.item_code || s.id  // fall back to id if no item_code
      const existing = byItemCode.get(key)
      if (!existing || stageScore(s) > stageScore(existing)) {
        byItemCode.set(key, s)
      }
    }
    const soShipments = [...byItemCode.values()]
    
    const isApproval = getProcessStage(so) === 'Approval'
    
    // Calculate logistics counters using EXACT same priority as getVisualStatus in SalesOrderDetailView:
    const getItemStage = (s) => {
      if (isFullyShippedStatus(s)) return 'shipped'
      const cs = (s.current_status || '').toLowerCase()
      if (s.hokiindo_date || cs.includes('hokiindo') || cs.includes('siap kirim')) return 'ready'
      if (s.dunex_date || cs.includes('dunex') || cs.includes('siemens warehouse')) return 'dunex'
      if (s.eta_date || cs.includes('eta port') || cs.includes('transit')) return 'eta'
      if (s.exwork_date || s.hpo_number || cs.includes('ex-work') || cs.includes('exwork') || cs.includes('forwarder')) return 'exwork'
      return 'nopo'
    }

    let countNoPo = 0
    let countExwork = 0
    let countEta = 0
    let countDunex = 0
    let countReady = 0

    // Fetch real data to compute "Perlu PO" and "Stock / Siap Kirim" accurately.
    if (soDetailsMap.value[so.id]) {
       const detailItems = soDetailsMap.value[so.id]
       
       detailItems.forEach(item => {
          if (!item.item || item.quantity <= 0) return

          // Match shipments for this item code
          const matchedShipments = soShipments.filter(s => {
            const sCode = String(s.item_code || '').trim().toLowerCase()
            const iCode = String(item.item?.no || '').trim().toLowerCase()
            return sCode === iCode
          })

          // Calculate total shipped quantity including HDOs
          const rawShipped = Number(item.shipQuantity || 0)
          let hdoQty = 0
          matchedShipments.forEach(s => {
            const cs = (s.current_status || '').toLowerCase()
            if (s.hdo_number || cs.includes('hdo') || cs.includes('produk sudah dikirim') || cs.includes('terkirim')) {
              hdoQty += Number(s.quantity || s.qty || 0)
            }
          })
          const totalShipped = Math.max(rawShipped, hdoQty)
          const qtyRemaining = Math.max(0, item.quantity - totalShipped)

          const isFullyShipped = so.percentShipped === 100 || qtyRemaining <= 0 || (matchedShipments.length > 0 && isFullyShippedStatus(matchedShipments[0]))
          if (isFullyShipped) return

          // 1. Calculate stock availability & qty_to_order
          const note = item.detailNotes || item.itemNotes || ''
          const stockInfo = parseStockFromNote(note)
          let qty_to_order = 0

          if (stockInfo.isReady) {
            qty_to_order = 0
          } else if (stockInfo.hasInfo) {
            qty_to_order = Math.max(0, item.quantity - stockInfo.qty)
          } else {
            qty_to_order = qtyRemaining
          }

          // 2. Stok Ready di gudang Hokiindo sendiri (Menunggu Pengiriman)
          if (qty_to_order === 0) {
            countReady++ // Menunggu Pengiriman (Siap Kirim dari stok sendiri)
            return
          }

          // 3. Check PO coverage (PERLU DIPESAN / KURANG DIPESAN)
          const poItems = soPoItemsMap.value[so.id] || []
          const matchingPoItems = poItems.filter(p => p.item_code === item.item?.no)
          const totalPo = matchingPoItems.reduce((sum, p) => sum + (p.quantity || 0), 0)
          const hasHpoInDb = matchedShipments.some(s => s.hpo_number)

          if (totalPo < qty_to_order && !hasHpoInDb) {
            countNoPo++ // Belum ada PO atau PO kurang (Perlu / Kurang PO)
            return
          }

          // 4. Check logistics tracking shipments for ordered items (Tiba di Hokiindo / Dunex / ETA)
          if (matchedShipments.length > 0) {
            const stage = getItemStage(matchedShipments[0])
            if (stage === 'ready') {
              countReady++ // Tiba di Gudang Hokiindo (Siap Kirim ke customer)
              return
            }
            if (stage === 'dunex') {
              countDunex++
              return
            }
            if (stage === 'eta') {
              countEta++
              return
            }
          }

          // 4. Sudah PO tapi belum sampai ETA/Dunex/Hokiindo (berstatus Ex-Works / Forwarder)
          countExwork++
       })
    } else {
       // Fallback while loading
       countNoPo = soShipments.filter(s => getItemStage(s) === 'nopo').length
       countExwork = soShipments.filter(s => getItemStage(s) === 'exwork').length
       countEta = soShipments.filter(s => getItemStage(s) === 'eta').length
       countDunex = soShipments.filter(s => getItemStage(s) === 'dunex').length
       countReady = soShipments.filter(s => getItemStage(s) === 'ready').length
       
       if (soShipments.length === 0 && so.percentShipped < 100) {
          countNoPo = 1 // Loading placeholder
       }
    }

    // 1. Belum Ada PO: jika HSO bukan Approval & belum 100% dikirim
    const hasNoPo = !isApproval && so.percentShipped < 100 && countNoPo > 0

    // 2. Tiba di Gudang Hokiindo (Masih Siap Kirim, belum dikirim ke customer):
    const hasArrived = (so.percentShipped < 100) && countReady > 0
    
    // 3. Stuck Ex-Work: jika statusnya ex-work (atau ada exwork_date) AND sudah >= 14 hari (2 minggu) sejak exwork_date, tapi belum ada ETA & belum tiba di Hokiindo
    const stuckExWork = soShipments.some(s => {
      const cs = (s.current_status || '').toLowerCase()
      const isExworkStatus = s.exwork_date || cs.includes('ex-work') || cs.includes('exwork') || cs.includes('forwarder')
      if (isExworkStatus && s.exwork_date) {
        const exDate = new Date(s.exwork_date)
        if (!isNaN(exDate.getTime())) {
          const today = new Date()
          const diffDays = Math.floor((today - exDate) / (1000 * 60 * 60 * 24))
          return diffDays >= 14 && !s.eta_date && !s.hokiindo_date && !cs.includes('hokiindo') && !cs.includes('dunex') && !cs.includes('eta')
        }
      }
      return false
    })

    // 4. Stuck PO (Push Principal): HPO sudah dibuat >= 14 minggu yang lalu tetapi barang belum juga sampai di Hokiindo
    const stuckPO = soShipments.some(s => {
      if (s.hpo_number) {
        const poDate = getPoDate(s.hpo_number)
        if (poDate) {
          const today = new Date()
          const diffWeeks = (today - poDate) / (1000 * 60 * 60 * 24 * 7)
          const arrived = s.hokiindo_date || (s.current_status && s.current_status.toLowerCase().includes('hokiindo'))
          return diffWeeks >= 14 && !arrived
        }
      }
      return false
    })

    // Determine the vendor / party to contact for logistics push
    let linkedVendor = null
    for (const s of soShipments) {
      if (s.hpo_number) {
        linkedVendor = getPoVendor(s.hpo_number)
        if (linkedVendor) break
      }
    }
    const isSiemens = linkedVendor && linkedVendor.toLowerCase().includes('siemens')
    const contactParty = isSiemens ? 'Siemens' : (linkedVendor || 'supplier')

    // Determine Action Needed (Bahasa Manusia)
    let actionNeeded = 'Monitor progres logistik secara berkala.'
    let actionClass = 'bg-slate-50 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300'
    
    if (isApproval) {
      actionNeeded = 'Sales Order masih menunggu persetujuan (Approval).'
      actionClass = 'bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300 border-l-4 border-amber-500 font-bold'
    } else if (stuckPO) {
      actionNeeded = `Segera hubungi ${contactParty}! Pengapalan/inden sudah tertunda lebih dari 14 minggu dari PO.`
      actionClass = 'bg-orange-50 text-orange-800 dark:bg-orange-950/20 dark:text-orange-300 border-l-4 border-orange-500 font-bold'
    } else if (stuckExWork) {
      actionNeeded = isSiemens
        ? 'Status Ex-Work tertunda lebih dari 2 minggu (perlu push ke Siemens).'
        : `Hubungi forwarder! Status Ex-Work tertunda lebih dari 2 minggu (perlu push ke ${contactParty}).`
      actionClass = 'bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300 border-l-4 border-amber-500 font-bold'
    } else if (hasNoPo) {
      actionNeeded = 'Segera terbitkan PO.'
      actionClass = 'bg-rose-50 text-rose-800 dark:bg-rose-950/20 dark:text-rose-300 border-l-4 border-rose-500 font-bold'
    } else if (hasArrived) {
      actionNeeded = 'Barang siap dikirim.'
      actionClass = 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300 border-l-4 border-emerald-500 font-bold'
    }

    return {
      ...so,
      hasNoPo,
      hasArrived,
      stuckExWork,
      stuckPO,
      actionNeeded,
      actionClass,
      countNoPo,
      countExwork,
      countEta,
      countDunex,
      countReady,
      totalItemsTracked: soShipments.length
    }
  })

  // Filter out dismissed orders
  const active = mapped.filter(item => !dismissedOrders.value.includes(item.number))

  // Sort: Pinned first, then normal priority
  return active.sort((a, b) => {
    const aPinned = pinnedOrders.value.includes(a.number) ? 1 : 0
    const bPinned = pinnedOrders.value.includes(b.number) ? 1 : 0
    if (aPinned !== bPinned) return bPinned - aPinned
    
    const aLow = lowPriorityOrders.value.includes(a.number) ? 1 : 0
    const bLow = lowPriorityOrders.value.includes(b.number) ? 1 : 0
    if (aLow !== bLow) return aLow - bLow
    
    return 0
  })
})

const goToDetail = (item) => {
  const targetId = item.number
  if (targetId) {
    router.push(`/sales-orders/${encodeURIComponent(targetId.replace(/\//g, '-'))}`)
  }
}

const hasCustomState = computed(() => {
  return dismissedOrders.value.length > 0 || lowPriorityOrders.value.length > 0 || pinnedOrders.value.length > 0
})
</script>

<template>
  <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col h-full shadow-xs">
    <!-- Header -->
    <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center gap-2.5">
        <Package class="w-5 h-5 text-indigo-500" />
        <div>
          <h3 class="font-extrabold text-slate-800 dark:text-slate-200 text-sm">HSO Priority</h3>
          <p class="text-[10px] text-slate-400 font-medium">Antrean prioritas penjualan & kendala logistik terlama</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button 
          v-if="hasCustomState" 
          @click="restoreAll"
          class="inline-flex items-center gap-1 text-[10px] font-black text-slate-500 hover:text-indigo-600 bg-slate-50 dark:bg-slate-800 dark:text-slate-400 hover:bg-indigo-50 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 transition-colors"
        >
          <RotateCcw class="w-3 h-3" /> Atur Ulang
        </button>

        <button 
          @click="syncData"
          :disabled="isSyncing"
          title="Sinkronkan & Muat Ulang Detail HSO"
          class="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-2.5 py-1 rounded-lg border border-indigo-200/60 dark:border-indigo-800/60 transition-all disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isSyncing }" />
          <span>{{ isSyncing ? 'Syncing...' : 'Sync' }}</span>
        </button>

        <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-900/50">
          SO ({{ priorityList.length }})
        </span>
      </div>
    </div>

    <!-- Body -->
    <div class="flex-1 flex flex-col mt-4 min-h-[300px]">
      <!-- Loading state -->
      <div v-if="isLoading" class="flex-1 flex flex-col justify-center items-center py-10 space-y-2">
        <div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <span class="text-xs text-slate-400 font-bold">Memuat antrean...</span>
      </div>

      <!-- Empty state -->
      <div v-else-if="priorityList.length === 0" class="flex-1 flex flex-col justify-center items-center py-10 text-slate-400 text-center">
        <Package class="w-10 h-10 mb-2 opacity-30" />
        <p class="text-xs font-bold text-slate-400">Semua HSO Beres</p>
        <p class="text-[10px] text-slate-500 mt-0.5">Tidak ada order outstanding untuk tahun berjalan</p>
      </div>

      <!-- Priority List (Full Width Desktop Friendly layout) -->
      <div v-else class="flex-1 divide-y divide-slate-100 dark:divide-slate-800">
        <!-- Desktop Table Header -->
        <div class="hidden md:grid gap-3 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 items-center"
             style="grid-template-columns: 13rem 1fr 5.5rem 5rem 4.5rem 4.5rem 5.5rem 8.5rem">
          <div>Order & Customer</div>
          <div>Tindakan Sales</div>
          <div></div>
          <div></div>
          <div></div>
          <div></div>
          <div></div>
          <div class="text-right">Aksi</div>
        </div>

        <div v-for="item in priorityList" :key="item.id" 
          @click="goToDetail(item)"
          :class="[
            'flex flex-wrap md:grid gap-3 py-3.5 px-2 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 items-center transition-all cursor-pointer group rounded-lg relative',
            pinnedOrders.includes(item.number) ? 'bg-blue-50/20 dark:bg-blue-950/10 border-l-4 border-l-blue-500 rounded-l-none' : '',
            lowPriorityOrders.includes(item.number) ? 'opacity-60 hover:opacity-90 bg-slate-50/30' : ''
          ]"
          style="grid-template-columns: 13rem 1fr 5.5rem 5rem 4.5rem 4.5rem 5.5rem 8.5rem"
        >
          <!-- Order & Customer -->
          <div class="min-w-0 w-full">
            <div class="flex items-center gap-1.5 mb-0.5 flex-wrap">
              <!-- Pin icon indicator -->
              <Pin v-if="pinnedOrders.includes(item.number)" class="w-3 h-3 text-blue-500 fill-blue-500 shrink-0" />
              
              <span class="text-xs font-black text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                {{ item.number }}
              </span>
              <span class="text-[9px] font-black px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-500 dark:text-slate-400 shrink-0">
                {{ getAgeDays(item.transDate) }} hari
              </span>
            </div>
            <p class="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 truncate" :title="item.customer">{{ item.customer }}</p>
            <p v-if="item.salesmanName && item.salesmanName !== '-'" class="text-[10px] text-slate-400 mt-0.5">Sales: {{ item.salesmanName }}</p>
          </div>

          <!-- Tindakan Sales (Bahasa Manusia) -->
          <div class="min-w-0 w-full">
            <div :class="['p-2 rounded-lg border border-transparent text-xs font-semibold flex items-start gap-2', item.actionClass]">
              <span class="flex h-1.5 w-1.5 translate-y-1.5 rounded-full bg-current shrink-0"></span>
              <p class="leading-relaxed">{{ item.actionNeeded }}</p>
            </div>
          </div>

          <!-- Pipeline Badges — 5 fixed chips -->
          <!-- 1. Perlu PO -->
          <div @click.stop class="w-full flex items-center justify-center">
            <span v-if="item.countNoPo > 0" 
              class="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60 shadow-2xs"
              title="Ada item belum terbit PO (Perlu PO)">
              <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0"></span>
              <span>Perlu PO</span>
            </span>
            <span v-else class="text-slate-300 dark:text-slate-700 text-xs font-medium text-center">—</span>
          </div>

          <!-- 2. Ex-Work -->
          <div @click.stop class="w-full flex items-center justify-center">
            <span v-if="item.countExwork > 0" 
              class="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60 shadow-2xs"
              title="Ada item berstatus Ex-Work di supplier">
              <span class="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
              <span>Ex-Work</span>
            </span>
            <span v-else class="text-slate-300 dark:text-slate-700 text-xs font-medium text-center">—</span>
          </div>

          <!-- 3. ETA -->
          <div @click.stop class="w-full flex items-center justify-center">
            <span v-if="item.countEta > 0" 
              class="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60 shadow-2xs"
              title="Ada item dalam perjalanan (ETA Port JKT)">
              <span class="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
              <span>ETA</span>
            </span>
            <span v-else class="text-slate-300 dark:text-slate-700 text-xs font-medium text-center">—</span>
          </div>

          <!-- 4. Dunex -->
          <div @click.stop class="w-full flex items-center justify-center">
            <span v-if="item.countDunex > 0" 
              class="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/60 shadow-2xs"
              title="Ada item di Gudang Siemens / Dunex">
              <span class="w-2 h-2 rounded-full bg-purple-500 shrink-0"></span>
              <span>Dunex</span>
            </span>
            <span v-else class="text-slate-300 dark:text-slate-700 text-xs font-medium text-center">—</span>
          </div>

          <!-- 5. Siap Kirim -->
          <div @click.stop class="w-full flex items-center justify-center">
            <span v-if="item.countReady > 0" 
              class="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60 shadow-2xs"
              title="Ada item siap dikirim (Tiba Hokiindo / Stok)">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
              <span>Siap Kirim</span>
            </span>
            <span v-else class="text-slate-300 dark:text-slate-700 text-xs font-medium text-center">—</span>
          </div>

          <!-- Aksi (grouped at right) -->
          <div class="w-full flex items-center justify-end gap-1.5 shrink-0" @click.stop>
            <!-- Pin Button -->
            <button 
              @click="togglePin(item.number)"
              :class="[
                'inline-flex items-center justify-center p-1.5 rounded border transition-colors',
                pinnedOrders.includes(item.number) 
                  ? 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-900/30' 
                  : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:text-slate-500 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-200'
              ]"
              :title="pinnedOrders.includes(item.number) ? 'Lepas Pin Prioritas' : 'Sematkan / Pin ke Atas'"
            >
              <Pin class="w-3.5 h-3.5" :class="pinnedOrders.includes(item.number) ? 'fill-blue-500 dark:fill-blue-400' : ''" />
            </button>

            <button 
              @click="goToDetail(item)"
              class="inline-flex items-center justify-center p-1.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-950/30 rounded border border-indigo-100 dark:border-indigo-900/30 transition-colors"
              title="Lihat Detail HSO"
            >
              <Eye class="w-3.5 h-3.5" />
            </button>
            
            <!-- Toggle Low Priority Button (Down/Up) -->
            <button 
              @click="toggleLowPriority(item.number)"
              class="inline-flex items-center justify-center p-1.5 text-slate-500 bg-slate-50 hover:bg-slate-100 dark:text-slate-400 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 transition-colors"
              :title="lowPriorityOrders.includes(item.number) ? 'Naikkan Prioritas ke Normal' : 'Turunkan Prioritas ke Bawah'"
            >
              <component :is="lowPriorityOrders.includes(item.number) ? ChevronUp : ChevronDown" class="w-3.5 h-3.5" />
            </button>

            <button 
              @click="dismissOrder(item.number)"
              class="inline-flex items-center justify-center p-1.5 text-slate-500 bg-slate-50 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 hover:border-rose-150 dark:hover:border-rose-900/30 transition-colors"
              title="Abaikan / Sembunyikan dari Standing"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>
