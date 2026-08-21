<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Package, Eye, AlertTriangle, Clock, ArrowUpCircle, ChevronDown, ChevronUp, Pin, X, RotateCcw, RefreshCw, CheckSquare, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'

const props = defineProps({
  soList: { type: Array, required: true },
  poList: { type: Array, default: () => [] },
  shipmentsList: { type: Array, default: () => [] },
  isLoading: { type: Boolean, default: false },
  targetYear: { type: Number, required: true }
})

const router = useRouter()

// Shared team interactive states (backed by Supabase hso_priority_states table)
const dismissedOrders = ref([])
const lowPriorityOrders = ref([])
const pinnedOrders = ref([])
let prioritySubscription = null

const fetchPriorityStates = async () => {
  try {
    const { data, error } = await supabase
      .from('hso_priority_states')
      .select('so_number, status')

    if (!error && data) {
      pinnedOrders.value = data.filter(d => d.status === 'pinned').map(d => d.so_number)
      lowPriorityOrders.value = data.filter(d => d.status === 'low_priority').map(d => d.so_number)
      dismissedOrders.value = data.filter(d => d.status === 'dismissed').map(d => d.so_number)

      // Sync local storage as backup cache
      localStorage.setItem('hso_pinned_orders', JSON.stringify(pinnedOrders.value))
      localStorage.setItem('hso_low_priority_orders', JSON.stringify(lowPriorityOrders.value))
      localStorage.setItem('hso_dismissed_orders', JSON.stringify(dismissedOrders.value))
    }
  } catch (e) {
    console.error('Failed to load global priority states:', e)
  }
}

onMounted(async () => {
  // 1. Initial quick load from local storage cache
  try {
    dismissedOrders.value = JSON.parse(localStorage.getItem('hso_dismissed_orders') || '[]')
    lowPriorityOrders.value = JSON.parse(localStorage.getItem('hso_low_priority_orders') || '[]')
    pinnedOrders.value = JSON.parse(localStorage.getItem('hso_pinned_orders') || '[]')
  } catch (e) {}

  // 2. Fetch authoritative database state
  await fetchPriorityStates()

  // 3. Realtime subscription for instant team sync
  prioritySubscription = supabase
    .channel('public:hso_priority_states')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hso_priority_states' }, () => {
      fetchPriorityStates()
    })
    .subscribe()
})

onUnmounted(() => {
  if (prioritySubscription) {
    supabase.removeChannel(prioritySubscription)
  }
})

const togglePin = async (number) => {
  if (pinnedOrders.value.includes(number)) {
    // Unpin item
    pinnedOrders.value = pinnedOrders.value.filter(n => n !== number)
    try {
      await supabase.from('hso_priority_states').delete().eq('so_number', number)
    } catch (e) {
      console.error('Error deleting pin state:', e)
    }
  } else {
    // Pin item
    pinnedOrders.value.push(number)
    lowPriorityOrders.value = lowPriorityOrders.value.filter(n => n !== number)
    dismissedOrders.value = dismissedOrders.value.filter(n => n !== number)
    try {
      await supabase.from('hso_priority_states').upsert({
        so_number: number,
        status: 'pinned',
        updated_at: new Date().toISOString()
      })
    } catch (e) {
      console.error('Error saving pin state:', e)
    }
  }
}

const toggleLowPriority = async (number) => {
  if (lowPriorityOrders.value.includes(number)) {
    lowPriorityOrders.value = lowPriorityOrders.value.filter(n => n !== number)
    try {
      await supabase.from('hso_priority_states').delete().eq('so_number', number)
    } catch (e) {
      console.error('Error resetting priority state:', e)
    }
  } else {
    lowPriorityOrders.value.push(number)
    pinnedOrders.value = pinnedOrders.value.filter(n => n !== number)
    dismissedOrders.value = dismissedOrders.value.filter(n => n !== number)
    try {
      await supabase.from('hso_priority_states').upsert({
        so_number: number,
        status: 'low_priority',
        updated_at: new Date().toISOString()
      })
    } catch (e) {
      console.error('Error saving low priority state:', e)
    }
  }
}

const dismissOrder = async (number) => {
  if (!dismissedOrders.value.includes(number)) {
    dismissedOrders.value.push(number)
    pinnedOrders.value = pinnedOrders.value.filter(n => n !== number)
    lowPriorityOrders.value = lowPriorityOrders.value.filter(n => n !== number)
    try {
      await supabase.from('hso_priority_states').upsert({
        so_number: number,
        status: 'dismissed',
        updated_at: new Date().toISOString()
      })
    } catch (e) {
      console.error('Error saving dismiss state:', e)
    }
  }
}

const restoreAll = async () => {
  dismissedOrders.value = []
  lowPriorityOrders.value = []
  pinnedOrders.value = []
  localStorage.removeItem('hso_dismissed_orders')
  localStorage.removeItem('hso_low_priority_orders')
  localStorage.removeItem('hso_pinned_orders')
  try {
    await supabase.from('hso_priority_states').delete().neq('so_number', '___impossible_none___')
  } catch (e) {
    console.error('Error restoring all priority states:', e)
  }
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
    case 'Persiapan Barang': return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/40'
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
  }).slice(0, 8)

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

    // Smart Multi-Condition Action Engine based on Product & Logistics Mix
    let actionNeeded = 'Monitor progres logistik secara berkala.'
    
    const hasOtherPending = countNoPo > 0 || countExwork > 0 || countEta > 0 || countDunex > 0

    if (isApproval) {
      actionNeeded = 'SO masih menunggu persetujuan (Approval).'
    } else if (stuckPO) {
      actionNeeded = `Segera push ${contactParty}! Inden tertunda > 14 minggu.`
    } else if (stuckExWork) {
      actionNeeded = isSiemens
        ? 'Push Siemens! Ex-Work tertunda > 2 minggu.'
        : `Hubungi forwarder/supplier (${contactParty})! Ex-Work tertunda > 2 minggu.`
    } else if (countReady > 0 && hasOtherPending) {
      // Combination: Partial Ready + Partial Pending/In-Transit
      if (countNoPo > 0) {
        actionNeeded = 'Sebagian barang siap kirim. Sebagian item belum terbit PO!'
      } else if (countEta > 0 || countDunex > 0) {
        actionNeeded = 'Sebagian barang siap kirim. Sisa item dalam perjalanan (ETA/Dunex).'
      } else {
        actionNeeded = 'Sebagian barang siap kirim. Sisa item proses pengadaan (Ex-Work).'
      }
    } else if (countReady > 0 && !hasOtherPending) {
      actionNeeded = 'Seluruh barang siap dikirim ke kustomer.'
    } else if (countNoPo > 0) {
      actionNeeded = 'Segera terbitkan PO ke supplier (Belum ada PO).'
    } else if (countDunex > 0) {
      actionNeeded = 'Barang tiba di Gudang Dunex/Siemens. Menunggu penarikan.'
    } else if (countEta > 0) {
      actionNeeded = 'Barang dalam perjalanan/transit (ETA Port). Monitor kedatangan.'
    } else if (countExwork > 0) {
      actionNeeded = 'Barang diproses di supplier/forwarder (Ex-Work).'
    }

    // Extract all unique HPOs linked to this HSO
    const hposSet = new Set()
    soShipments.forEach(s => {
      if (s.hpo_number) {
        s.hpo_number.split(',').forEach(n => {
          if (n.trim()) hposSet.add(n.trim())
        })
      }
    })
    const linkedHpos = Array.from(hposSet).filter(Boolean).sort()

    return {
      ...so,
      hasNoPo,
      hasArrived,
      stuckExWork,
      stuckPO,
      actionNeeded,
      linkedHpos,
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

// Pagination
const currentPage = ref(1)
const pageSize = ref(6)

watch(() => props.targetYear, () => {
  currentPage.value = 1
})

const totalPages = computed(() => {
  return Math.ceil(priorityList.value.length / pageSize.value) || 1
})

const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return priorityList.value.slice(start, start + pageSize.value)
})

const prevPage = () => {
  if (currentPage.value > 1) currentPage.value--
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++
}
</script>

<template>
  <div class="bg-card text-card-foreground border border-border rounded-xl p-5 flex flex-col h-full shadow-xs">
    <!-- Header -->
    <div class="flex items-center justify-between pb-4 border-b border-border">
      <div>
        <h3 class="font-semibold text-foreground text-sm">Task Status Order</h3>
        <p class="text-xs text-muted-foreground">Tindak lanjut order & kendala logistik</p>
      </div>
      <div class="flex items-center gap-2">
        <button 
          v-if="hasCustomState" 
          @click="restoreAll"
          class="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted px-2 py-1 rounded-md border border-input transition-colors cursor-pointer"
        >
          <RotateCcw class="w-3 h-3" /> Atur Ulang
        </button>

        <button 
          @click="syncData"
          :disabled="isSyncing"
          title="Sinkronkan & Muat Ulang Detail HSO"
          class="inline-flex items-center gap-1.5 text-xs font-medium text-foreground bg-background hover:bg-accent px-2.5 py-1 rounded-md border border-input transition-all disabled:opacity-50 cursor-pointer shadow-xs"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isSyncing }" />
          <span>{{ isSyncing ? 'Syncing...' : 'Sync' }}</span>
        </button>

        <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
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

      <!-- Priority List (Full Width Desktop Friendly 4-Column Layout) -->
      <div v-else class="flex-1 divide-y divide-border">
        <!-- Desktop Table Header -->
        <div class="hidden md:grid gap-4 pb-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-3 items-center"
             style="grid-template-columns: 14rem 1fr 14rem 7.5rem">
          <div>Order & Customer</div>
          <div>Action</div>
          <div>Status Logistik</div>
          <div class="text-right">Aksi</div>
        </div>

        <div v-for="item in paginatedList" :key="item.id" 
          @click="goToDetail(item)"
          :class="[
            'flex flex-wrap md:grid gap-4 py-3 px-3 hover:bg-muted/40 items-center transition-colors cursor-pointer group rounded-lg relative',
            pinnedOrders.includes(item.number) ? 'bg-primary/5 border-l-2 border-l-primary rounded-l-none' : '',
            lowPriorityOrders.includes(item.number) ? 'opacity-50 hover:opacity-80' : ''
          ]"
          style="grid-template-columns: 14rem 1fr 14rem 7.5rem"
        >
          <!-- 1. Order & Customer -->
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 mb-0.5 flex-wrap">
              <Pin v-if="pinnedOrders.includes(item.number)" class="w-3 h-3 text-primary fill-primary shrink-0" />
              
              <span class="text-xs font-bold text-foreground group-hover:text-primary transition-colors truncate">
                {{ item.number }}
              </span>
              <span class="text-[10px] font-medium px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border shrink-0">
                {{ getAgeDays(item.transDate) }} hari
              </span>
            </div>
            <p class="text-xs font-medium text-foreground truncate" :title="item.customer">{{ item.customer }}</p>
            <p v-if="item.salesmanName && item.salesmanName !== '-'" class="text-[11px] text-muted-foreground mt-0.5">Sales: {{ item.salesmanName }}</p>
            <!-- Linked HPO list if any -->
            <div v-if="item.linkedHpos && item.linkedHpos.length > 0" class="flex items-center gap-1 mt-1 flex-wrap" @click.stop>
              <span class="text-[10px] text-muted-foreground font-semibold">HPO ({{ item.linkedHpos.length }}):</span>
              <span 
                v-for="hpoNum in item.linkedHpos" 
                :key="hpoNum"
                @click.stop="router.push(`/purchase-orders/${hpoNum.replace(/\//g, '-')}`)"
                class="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 cursor-pointer shadow-2xs"
                :title="`Buka detail Purchase Order: ${hpoNum}`"
              >
                {{ hpoNum }}
              </span>
            </div>
          </div>

          <!-- 2. Action (Clean Text + Dot Indicator, No Heavy Blocks) -->
          <div class="min-w-0">
            <p :class="[
              'text-xs flex items-center gap-2',
              item.hasNoPo ? 'text-rose-600 dark:text-rose-400 font-semibold' :
              item.hasArrived ? 'text-emerald-600 dark:text-emerald-400 font-semibold' :
              item.stuckPO || item.stuckExWork ? 'text-amber-600 dark:text-amber-400 font-semibold' :
              'text-muted-foreground'
            ]">
              <span class="w-1.5 h-1.5 rounded-full bg-current shrink-0"></span>
              <span class="truncate">{{ item.actionNeeded }}</span>
            </p>
          </div>

          <!-- 3. Status Logistik (Clean Active Badges Only, No Dashes) -->
          <div @click.stop class="flex items-center gap-1.5 flex-wrap">
            <span v-if="item.countNoPo > 0" 
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/40"
              title="Ada item belum terbit PO (Perlu PO)">
              <span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
              Perlu PO
            </span>
            <span v-if="item.countExwork > 0" 
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40"
              title="Ada item berstatus Ex-Work di supplier">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Ex-Work
            </span>
            <span v-if="item.countEta > 0" 
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200/80 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900/40"
              title="Ada item dalam perjalanan (ETA Port JKT)">
              <span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
              ETA
            </span>
            <span v-if="item.countDunex > 0" 
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-violet-50 text-violet-700 border border-violet-200/80 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900/40"
              title="Ada item di Gudang Siemens / Dunex">
              <span class="w-1.5 h-1.5 rounded-full bg-violet-500"></span>
              Dunex
            </span>
            <span v-if="item.countReady > 0" 
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40"
              title="Ada item siap dikirim">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Siap Kirim
            </span>
          </div>

          <!-- 4. Aksi Buttons -->
          <div class="flex items-center justify-end gap-1 shrink-0" @click.stop>
            <button 
              @click="togglePin(item.number)"
              :class="[
                'inline-flex items-center justify-center p-1.5 rounded-md border transition-colors cursor-pointer',
                pinnedOrders.includes(item.number) 
                  ? 'text-primary bg-primary/10 border-primary/30' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted border-input'
              ]"
              :title="pinnedOrders.includes(item.number) ? 'Lepas Pin Prioritas' : 'Sematkan / Pin ke Atas'"
            >
              <Pin class="w-3.5 h-3.5" :class="pinnedOrders.includes(item.number) ? 'fill-primary' : ''" />
            </button>

            <button 
              @click="goToDetail(item)"
              class="inline-flex items-center justify-center p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md border border-input transition-colors cursor-pointer"
              title="Lihat Detail HSO"
            >
              <Eye class="w-3.5 h-3.5" />
            </button>
            
            <button 
              @click="toggleLowPriority(item.number)"
              class="inline-flex items-center justify-center p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md border border-input transition-colors cursor-pointer"
              :title="lowPriorityOrders.includes(item.number) ? 'Naikkan Prioritas' : 'Turunkan Prioritas'"
            >
              <component :is="lowPriorityOrders.includes(item.number) ? ChevronUp : ChevronDown" class="w-3.5 h-3.5" />
            </button>

            <button 
              @click="dismissOrder(item.number)"
              class="inline-flex items-center justify-center p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md border border-input transition-colors cursor-pointer"
              title="Abaikan / Sembunyikan"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

        <!-- Controls Pagination -->
        <div v-if="priorityList.length > pageSize" class="flex flex-col sm:flex-row items-center justify-between pt-3 border-t border-border text-xs gap-2 mt-3">
          <span class="text-muted-foreground font-medium">
            Menampilkan <strong class="text-foreground">{{ (currentPage - 1) * pageSize + 1 }} - {{ Math.min(currentPage * pageSize, priorityList.length) }}</strong> dari <strong class="text-foreground">{{ priorityList.length }}</strong> HSO
          </span>
          <div class="flex items-center gap-2">
            <button 
              @click="prevPage" 
              :disabled="currentPage === 1"
              class="px-3 py-1.5 rounded-lg border border-input bg-background font-bold text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1 shadow-2xs cursor-pointer"
            >
              <ChevronLeft class="w-3.5 h-3.5" />
              <span>Sebelumnya</span>
            </button>

            <span class="px-2 font-extrabold text-foreground">
              Halaman {{ currentPage }} dari {{ totalPages }}
            </span>

            <button 
              @click="nextPage" 
              :disabled="currentPage >= totalPages"
              class="px-3 py-1.5 rounded-lg border border-input bg-background font-bold text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1 shadow-2xs cursor-pointer"
            >
              <span>Berikutnya</span>
              <ChevronRight class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
