<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import {
  Search, RefreshCw, FileSpreadsheet, Package, Boxes, ChevronDown, ChevronUp,
  Calendar, ExternalLink, Filter, CheckCircle2, Clock, Truck, ShieldAlert,
  ArrowRight, Copy, Check, Info, ArrowUpDown, ChevronLeft, ChevronRight,
  Sparkles, Layers, Anchor, Building2, ListFilter, Hash
} from 'lucide-vue-next'

const router = useRouter()

// --- STATE ---
const isLoading = ref(true)
const rawPoItems = ref([])
const trackingData = ref([])
const shipmentsData = ref([])
const copiedText = ref('')

// View Mode: 'ITEMS' (List Semua Produk - Data Utama) vs 'SKU_GROUP' (Ringkasan per Part Number)
const viewMode = ref('ITEMS')

// Filter State
const searchQuery = ref('')
const categoryFilter = ref('ALL') // ALL | 3VJ | 3MT | 3MU | 3WJ | 5TJ
const vendorFilter = ref('ALL') // ALL | SIEMENS | OTHERS
const logisticsStatusFilter = ref('ALL') // ALL | delivered | warehouse | transit | forwarder | unknown
const poStatusFilter = ref('ALL')
const startDate = ref('')
const endDate = ref('')

// Sorting & Pagination
const sortField = ref('date') // date | sku | qty | hpo | status
const sortOrder = ref('desc') // desc | asc
const currentPage = ref(1)
const itemsPerPage = ref(20)

// Expanded SKUs (for SKU_GROUP mode)
const expandedSkus = ref(new Set())

// Detail Modal
const selectedItem = ref(null)
const isDetailModalOpen = ref(false)

// --- SINOVA DEFINITIONS ---
const SINOVA_PREFIXES = ['3VJ', '3MT', '3MU', '3WJ', '5TJ']

const getSinovaCategory = (code) => {
  const c = String(code || '').trim().toUpperCase()
  if (c.startsWith('3VJ')) {
    return {
      code: '3VJ',
      family: 'SENTRON 3VJ',
      type: 'MCCB',
      label: 'MCCB (3VJ)',
      color: 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border-blue-300 dark:border-blue-800'
    }
  }
  if (c.startsWith('3MT')) {
    return {
      code: '3MT',
      family: 'SIRIUS 3MT',
      type: 'Contactor',
      label: 'Contactor (3MT)',
      color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
    }
  }
  if (c.startsWith('3MU')) {
    return {
      code: '3MU',
      family: 'SIRIUS 3MU',
      type: 'Overload Relay',
      label: 'TOR (3MU)',
      color: 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border-purple-300 dark:border-purple-800'
    }
  }
  if (c.startsWith('3WJ')) {
    return {
      code: '3WJ',
      family: 'SENTRON 3WJ',
      type: 'ACB',
      label: 'ACB (3WJ)',
      color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-800'
    }
  }
  if (c.startsWith('5TJ')) {
    return {
      code: '5TJ',
      family: 'SENTRON 5TJ',
      type: 'MCB',
      label: 'MCB (5TJ)',
      color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800'
    }
  }
  return {
    code: 'SINOVA',
    family: 'SINOVA',
    type: 'Sinova Series',
    label: 'Sinova',
    color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300'
  }
}

// Format date helper (e.g. 2026-07-30 -> 30 Jul 2026)
const formatDate = (val) => {
  if (!val || val === '-' || val === '__waiting__') return '-'
  try {
    const d = new Date(val)
    if (isNaN(d.getTime())) return String(val)
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return String(val)
  }
}

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    copiedText.value = text
    setTimeout(() => {
      copiedText.value = ''
    }, 2000)
  } catch (err) {
    console.error('Copy failed:', err)
  }
}

// Normalizers for match
const normStr = (s) => String(s || '').trim().toLowerCase().replace(/[\s\-\.]/g, '')
const normHpo = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').replace(/0/g, 'o')

// --- DATA FETCHING ---
const fetchData = async () => {
  isLoading.value = true
  try {
    // Fetch accurate_purchase_order_items for Sinova product codes: 3vj, 3mt, 3mu, 3wj, 5tj
    const orFilter = 'item_code.ilike.3vj%,item_code.ilike.3mt%,item_code.ilike.3mu%,item_code.ilike.3wj%,item_code.ilike.5tj%'

    const { data: items, error: itemsErr } = await supabase
      .from('accurate_purchase_order_items')
      .select(`
        id,
        po_id,
        item_code,
        item_name,
        quantity,
        unit_name,
        unit_price,
        detail_notes,
        hso_number,
        po:accurate_purchase_orders (
          id,
          number,
          vendor_id,
          vendor_name,
          trans_date,
          status_name,
          total_amount,
          currency_code
        )
      `)
      .or(orFilter)
      .order('id', { ascending: false })

    if (itemsErr) throw itemsErr

    rawPoItems.value = items || []

    // Fetch logistics info for Siemens HPOs only
    const siemensItems = rawPoItems.value.filter(i => String(i.po?.vendor_name || '').toUpperCase().includes('SIEMENS'))
    const uniqueHpos = [...new Set(siemensItems.map(i => i.po?.number).filter(Boolean))]

    if (uniqueHpos.length > 0) {
      const chunks = []
      for (let i = 0; i < uniqueHpos.length; i += 40) {
        chunks.push(uniqueHpos.slice(i, i + 40))
      }

      const [trackingRes, shipmentsRes] = await Promise.all([
        Promise.all(chunks.map(chunk => supabase.from('raw_forwarder_tracking').select('*').in('hpo_number', chunk))),
        Promise.all(chunks.map(chunk => supabase.from('shipments').select('*').in('hpo_number', chunk)))
      ])

      trackingData.value = trackingRes.flatMap(r => r.data || [])
      shipmentsData.value = shipmentsRes.flatMap(r => r.data || [])
    } else {
      trackingData.value = []
      shipmentsData.value = []
    }
  } catch (err) {
    console.error('Error fetching PO Siemens Sinova data:', err)
  } finally {
    isLoading.value = false
  }
}

// Consolidate status level & multi-batch split deliveries for each item
const determineItemLogistics = (itemCode, hpoNumber, poStatus, poQty = 0) => {
  const normItem = normStr(itemCode)
  const normH = normHpo(hpoNumber)

  // 1. Check raw_forwarder_tracking
  const matchedTracking = trackingData.value.filter(t =>
    (normHpo(t.hpo_number) === normH || t.hpo_number === hpoNumber) &&
    (normStr(t.item_code) === normItem || t.item_code === itemCode)
  )

  // 2. Check shipments
  const matchedShipment = shipmentsData.value.filter(s =>
    (normHpo(s.hpo_number) === normH || s.hpo_number === hpoNumber) &&
    (normStr(s.item_code) === normItem || s.item_code === itemCode)
  )

  const pLower = String(poStatus || '').toLowerCase()

  // Helper to evaluate a single tracking/shipment record into a structured batch
  const evaluateRecord = (rec) => {
    const rawStatus = rec.status || rec.current_status || ''
    const sLower = rawStatus.toLowerCase()
    const qty = Number(rec.quantity || rec.qty || 0)

    let stage = 'unknown'
    let label = 'Belum Ada Data'
    let badgeClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700'
    let dotClass = 'bg-slate-400'
    let primaryDate = null

    const exworkDate = rec.exwork_date || null
    const exworkWaiting = Boolean(rec.exwork_waiting)
    const etaDate = rec.eta_date || null
    const dunexDate = rec.dunex_date || (sLower.includes('warehouse') || sLower.includes('dunex') || sLower.includes('siemens wh') || sLower.includes('our wh') ? (rec.eta_date || rec.delivery_date) : null)
    const hokiindoDate = rec.delivery_date || rec.hokiindo_date || null

    if (hokiindoDate || sLower.includes('hokiindo') || sLower.includes('done delivery') || sLower.includes('delivered') || sLower.includes('selesai') || pLower === 'terproses' || pLower === 'ditutup') {
      stage = 'delivered'
      label = sLower.includes('hokiindo') ? 'Tiba di Hokiindo' : (sLower.includes('done') ? 'Selesai Kirim' : 'Tiba di Hokiindo')
      badgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
      dotClass = 'bg-emerald-500'
      primaryDate = hokiindoDate || dunexDate || etaDate
    } else if (dunexDate || sLower.includes('siemens') || sLower.includes('dunex') || sLower.includes('warehouse') || sLower.includes('our warehouse')) {
      stage = 'warehouse'
      label = 'Gudang Siemens / Dunex'
      badgeClass = 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800'
      dotClass = 'bg-cyan-500'
      primaryDate = dunexDate || etaDate
    } else if (etaDate || sLower.includes('eta') || sLower.includes('port') || sLower.includes('transit')) {
      stage = 'transit'
      label = 'ETA Port JKT (Transit)'
      badgeClass = 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300 border-red-300 dark:border-red-800'
      dotClass = 'bg-red-500'
      primaryDate = etaDate
    } else if (exworkDate || exworkWaiting || sLower.includes('forwarder') || sLower.includes('factory') || sLower.includes('exwork') || sLower.includes('ex-work')) {
      stage = 'forwarder'
      const isFactory = sLower.includes('factory')
      label = isFactory ? 'Follow up Factory' : 'Follow up Forwarder'
      badgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-800'
      dotClass = 'bg-amber-500'
      primaryDate = exworkWaiting ? 'Waiting' : exworkDate
    }

    return {
      qty,
      stage,
      label,
      rawStatus,
      badgeClass,
      dotClass,
      primaryDate,
      exworkDate,
      exworkWaiting,
      etaDate,
      dunexDate: stage === 'forwarder' || stage === 'transit' ? null : dunexDate,
      hokiindoDate: stage !== 'delivered' ? null : hokiindoDate
    }
  }

  // 1. If tracking data exists, use tracking data as primary source of truth for batches
  let rawBatches = []
  if (matchedTracking.length > 0) {
    rawBatches = matchedTracking.map(evaluateRecord)
  } else if (matchedShipment.length > 0) {
    rawBatches = matchedShipment.map(evaluateRecord)
  }

  // Consolidate identical batches (same stage, same primaryDate, same label)
  const consolidatedMap = new Map()
  rawBatches.forEach(b => {
    const key = `${b.stage}__${b.label}__${b.primaryDate || 'none'}__${b.exworkDate || ''}`
    if (!consolidatedMap.has(key)) {
      consolidatedMap.set(key, { ...b })
    } else {
      const existing = consolidatedMap.get(key)
      if (b.qty && existing.qty) {
        existing.qty += b.qty
      }
    }
  })

  let subBatches = Array.from(consolidatedMap.values())

  // Sort subBatches: delivered first, then warehouse, transit, forwarder
  const stageWeight = { delivered: 4, warehouse: 3, transit: 2, forwarder: 1, unknown: 0 }
  subBatches.sort((a, b) => (stageWeight[b.stage] || 0) - (stageWeight[a.stage] || 0))

  // If subBatches count > 1 AND they have different stages or different dates, this is a SPLIT batch!
  const isSplit = subBatches.length > 1 && (
    new Set(subBatches.map(b => b.stage)).size > 1 ||
    new Set(subBatches.map(b => b.primaryDate)).size > 1
  )

  // Aggregate dates
  const allExwork = subBatches.map(b => b.exworkDate).filter(Boolean).sort().reverse()
  const allEta = subBatches.map(b => b.etaDate).filter(Boolean).sort().reverse()
  const allDunex = subBatches.map(b => b.dunexDate).filter(Boolean).sort().reverse()
  const allHoki = subBatches.map(b => b.hokiindoDate).filter(Boolean).sort().reverse()
  const anyExworkWaiting = subBatches.some(b => b.exworkWaiting)

  let primaryBatch = subBatches[0] || evaluateRecord({})

  let overallStage = primaryBatch.stage
  let overallLabel = primaryBatch.label
  let overallBadgeClass = primaryBatch.badgeClass
  let overallDotClass = primaryBatch.dotClass

  if (isSplit) {
    overallLabel = `Split (${subBatches.length} Batch)`
    overallBadgeClass = 'bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-700'
    overallDotClass = 'bg-amber-500'
  }

  return {
    isSplit,
    subBatches: subBatches.map((b, idx) => ({ ...b, batchNumber: idx + 1 })),
    rawStatus: primaryBatch.rawStatus || (overallStage === 'delivered' ? 'Selesai Diterima' : 'Menunggu Update Forwarder'),
    label: overallLabel,
    stage: overallStage,
    badgeClass: overallBadgeClass,
    dotClass: overallDotClass,
    exworkDate: allExwork[0] || null,
    exworkWaiting: anyExworkWaiting,
    etaDate: allEta[0] || null,
    dunexDate: overallStage === 'forwarder' || overallStage === 'transit' ? null : (allDunex[0] || null),
    hokiindoDate: overallStage !== 'delivered' ? null : (allHoki[0] || null),
    deliveryDate: allHoki[0] || allDunex[0] || null
  }
}

// --- FLATTENED PRODUCT LIST (DATA UTAMA - KHUSUS VENDOR SIEMENS) ---
const productItems = computed(() => {
  return rawPoItems.value
    .filter(item => {
      const vendor = String(item.po?.vendor_name || '').toUpperCase()
      return vendor.includes('SIEMENS')
    })
    .map(item => {
      const hpoNumber = item.po?.number || '-'
      const vendorName = item.po?.vendor_name || 'PT. SIEMENS INDONESIA'
      const isDirectSiemens = true
      const poDate = item.po?.trans_date || '-'
      const poStatus = item.po?.status_name || '-'
      const poId = item.po?.id
      const category = getSinovaCategory(item.item_code)
      const quantity = Number(item.quantity || 0)
      const logistics = determineItemLogistics(item.item_code, hpoNumber, poStatus, quantity)

      return {
        id: item.id,
        po_id: poId,
        item_code: item.item_code,
        item_name: item.item_name || '-',
        quantity,
        unit_name: item.unit_name || 'PCS',
        detail_notes: item.detail_notes || '',
        hso_number: item.hso_number || '',
        hpo_number: hpoNumber,
        po_date: poDate,
        vendor_name: vendorName,
        is_direct_siemens: isDirectSiemens,
        po_status: poStatus,
        category,
        logistics
      }
    })
})

// --- FILTERED & SORTED PRODUCT ITEMS ---
const filteredProductItems = computed(() => {
  let list = productItems.value

  // 1. Search Query
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter(item => {
      const skuMatch = item.item_code.toLowerCase().includes(q)
      const nameMatch = item.item_name.toLowerCase().includes(q)
      const hpoMatch = item.hpo_number.toLowerCase().includes(q)
      const vendorMatch = item.vendor_name.toLowerCase().includes(q)
      const hsoMatch = item.hso_number.toLowerCase().includes(q)
      const notesMatch = item.detail_notes.toLowerCase().includes(q)
      return skuMatch || nameMatch || hpoMatch || vendorMatch || hsoMatch || notesMatch
    })
  }

  // 2. Category Filter (3VJ, 3MT, 3MU, 3WJ, 5TJ)
  if (categoryFilter.value !== 'ALL') {
    list = list.filter(item => item.category.code === categoryFilter.value)
  }

  // 3. Logistics Status Filter (with Split Deliveries support)
  if (logisticsStatusFilter.value !== 'ALL') {
    if (logisticsStatusFilter.value === 'split') {
      list = list.filter(item => item.logistics.isSplit)
    } else {
      list = list.filter(item =>
        item.logistics.stage === logisticsStatusFilter.value ||
        (item.logistics.isSplit && item.logistics.subBatches?.some(b => b.stage === logisticsStatusFilter.value))
      )
    }
  }

  // 5. PO Status Filter
  if (poStatusFilter.value !== 'ALL') {
    list = list.filter(item => item.po_status === poStatusFilter.value)
  }

  // 6. Date Range Filter (PO Date)
  if (startDate.value) {
    list = list.filter(item => item.po_date >= startDate.value)
  }
  if (endDate.value) {
    list = list.filter(item => item.po_date <= endDate.value)
  }

  // 7. Sorting
  return [...list].sort((a, b) => {
    let cmp = 0
    if (sortField.value === 'date') {
      cmp = (b.po_date || '').localeCompare(a.po_date || '')
    } else if (sortField.value === 'sku') {
      cmp = a.item_code.localeCompare(b.item_code)
    } else if (sortField.value === 'qty') {
      cmp = b.quantity - a.quantity
    } else if (sortField.value === 'hpo') {
      cmp = a.hpo_number.localeCompare(b.hpo_number, undefined, { numeric: true })
    } else if (sortField.value === 'status') {
      cmp = a.logistics.label.localeCompare(b.logistics.label)
    }
    return sortOrder.value === 'desc' ? cmp : -cmp
  })
})

// Pagination for Item List
const totalPages = computed(() => Math.max(1, Math.ceil(filteredProductItems.value.length / itemsPerPage.value)))

const paginatedProductItems = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return filteredProductItems.value.slice(start, start + itemsPerPage.value)
})

// --- GROUPED BY SKU / PART NUMBER (ALTERNATIVE VIEW) ---
const groupedBySku = computed(() => {
  const map = new Map()

  filteredProductItems.value.forEach(item => {
    const sku = item.item_code
    if (!map.has(sku)) {
      map.set(sku, {
        sku,
        name: item.item_name,
        category: item.category,
        total_qty: 0,
        unit: item.unit_name,
        hpos: [],
        latest_status: item.logistics.label,
        latest_badge: item.logistics.badgeClass,
        latest_dot: item.logistics.dotClass,
        latest_date: item.po_date
      })
    }

    const entry = map.get(sku)
    entry.total_qty += item.quantity
    entry.hpos.push(item)
    if (item.po_date > entry.latest_date) {
      entry.latest_date = item.po_date
      entry.latest_status = item.logistics.label
      entry.latest_badge = item.logistics.badgeClass
      entry.latest_dot = item.logistics.dotClass
    }
  })

  return Array.from(map.values()).sort((a, b) => b.total_qty - a.total_qty)
})

watch([searchQuery, categoryFilter, vendorFilter, logisticsStatusFilter, poStatusFilter, startDate, endDate], () => {
  currentPage.value = 1
})

const toggleSkuExpand = (sku) => {
  if (expandedSkus.value.has(sku)) {
    expandedSkus.value.delete(sku)
  } else {
    expandedSkus.value.add(sku)
  }
}

// --- KPI METRICS ---
const metrics = computed(() => {
  const all = productItems.value
  const totalItems = all.length
  let totalPcs = 0
  const uniqueSkus = new Set()
  const uniqueHpos = new Set()

  let deliveredCount = 0
  let warehouseCount = 0
  let transitCount = 0
  let forwarderCount = 0
  let splitCount = 0

  const catCount = {
    '3VJ': 0,
    '3MT': 0,
    '3MU': 0,
    '3WJ': 0,
    '5TJ': 0
  }

  all.forEach(it => {
    totalPcs += it.quantity
    uniqueSkus.add(it.item_code)
    if (it.hpo_number) uniqueHpos.add(it.hpo_number)

    if (catCount[it.category.code] !== undefined) {
      catCount[it.category.code]++
    }

    if (it.logistics.isSplit) splitCount++

    if (it.logistics.stage === 'delivered') deliveredCount++
    else if (it.logistics.stage === 'warehouse') warehouseCount++
    else if (it.logistics.stage === 'transit') transitCount++
    else if (it.logistics.stage === 'forwarder') forwarderCount++
  })

  return {
    totalItems,
    totalPcs,
    uniqueSkus: uniqueSkus.size,
    uniqueHpos: uniqueHpos.size,
    deliveredCount,
    warehouseCount,
    transitCount,
    forwarderCount,
    splitCount,
    catCount
  }
})

// Available PO Statuses
const availablePoStatuses = computed(() => {
  const set = new Set(productItems.value.map(p => p.po_status).filter(Boolean))
  return Array.from(set).sort()
})

const getAccurateBadgeClass = (status) => {
  switch (status) {
    case 'Terproses':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300'
    case 'Sebagian diproses':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300'
    case 'Menunggu diproses':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300'
    case 'Ditutup':
      return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300'
    case 'Ditolak':
      return 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border-red-300'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-300'
  }
}

// Reset filters
const resetFilters = () => {
  searchQuery.value = ''
  categoryFilter.value = 'ALL'
  vendorFilter.value = 'ALL'
  logisticsStatusFilter.value = 'ALL'
  poStatusFilter.value = 'ALL'
  startDate.value = ''
  endDate.value = ''
  currentPage.value = 1
}

// --- EXPORT TO EXCEL ---
const exportToExcel = () => {
  const itemsToExport = filteredProductItems.value
  if (!itemsToExport || itemsToExport.length === 0) {
    alert('Tidak ada data produk yang dapat diekspor sesuai filter saat ini.')
    return
  }

  const exportRows = itemsToExport.map((it, idx) => {
    let splitDetailText = '-'
    if (it.logistics.isSplit && it.logistics.subBatches) {
      splitDetailText = it.logistics.subBatches.map(b => {
        const qStr = b.qty ? `${b.qty} ${it.unit_name}` : ''
        const dateStr = b.hokiindoDate ? `Tiba: ${formatDate(b.hokiindoDate)}`
          : b.dunexDate ? `Dunex: ${formatDate(b.dunexDate)}`
          : b.etaDate ? `ETA: ${formatDate(b.etaDate)}`
          : b.exworkDate ? `Exwork: ${formatDate(b.exworkDate)}`
          : b.exworkWaiting ? 'Exwork: Waiting' : ''
        return `Batch ${b.batchNumber}: ${qStr} [${b.label}] ${dateStr}`.trim()
      }).join('; ')
    }

    return {
      'No': idx + 1,
      'Kode SKU / Part Number': it.item_code,
      'Kategori Sinova': it.category.label,
      'Nama Produk / Deskripsi': it.item_name,
      'Qty Dipesan': it.quantity,
      'Satuan': it.unit_name,
      'Nomor HPO': it.hpo_number,
      'Tanggal PO': it.po_date,
      'Vendor': it.vendor_name,
      'Status PO Accurate': it.po_status,
      'Status Logistik': it.logistics.label,
      'Status Logistik Asli': it.logistics.rawStatus,
      'Status Pengiriman': it.logistics.isSplit ? `Split (${it.logistics.subBatches.length} Batch)` : 'Normal',
      'Rincian Split Batch': splitDetailText,
      'Tgl Ex-Works (Pabrik)': it.logistics.exworkWaiting ? 'Waiting' : (it.logistics.exworkDate || '-'),
      'Tgl ETA Port Jakarta': it.logistics.etaDate || '-',
      'Tgl Gudang Siemens / Dunex': it.logistics.dunexDate || '-',
      'Tgl Tiba di Hokiindo': it.logistics.hokiindoDate || '-',
      'Referensi HSO / Catatan': it.hso_number || it.detail_notes || '-'
    }
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(exportRows)
  XLSX.utils.book_append_sheet(wb, ws, 'Produk Siemens Sinova')

  const fileName = `Produk_Siemens_Sinova_${new Date().toISOString().split('T')[0]}.xlsx`
  XLSX.writeFile(wb, fileName)
}

const openItemDetail = (item) => {
  selectedItem.value = item
  isDetailModalOpen.value = true
}

const navigateToPoPage = (poId) => {
  if (poId) {
    router.push(`/purchase-orders/${poId}`)
  }
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="space-y-6 max-w-[1650px] mx-auto">
    <!-- Header Section -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all">
      <div class="space-y-1.5">
        <div class="flex items-center gap-2.5 flex-wrap">
          <div class="p-2 bg-gradient-to-tr from-cyan-600 to-blue-600 text-white rounded-xl shadow-md">
            <Boxes class="w-6 h-6" />
          </div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">PO Siemens Sinova</h1>
          <Badge variant="outline" class="bg-blue-50 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
            List Produk: 3VJ • 3MT • 3MU • 3WJ • 5TJ
          </Badge>
          <Badge variant="outline" class="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 text-xs px-2.5 py-0.5 rounded-full flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Realtime Sync
          </Badge>
        </div>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          Daftar utama produk Siemens Sinova yang dipesan, disertai nomor HPO pemesan, vendor, dan rincian status logistik terkini.
        </p>
      </div>

      <!-- Header Actions & View Mode Toggle -->
      <div class="flex items-center gap-2.5 flex-wrap">
        <!-- View Mode Switcher -->
        <div class="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            @click="viewMode = 'ITEMS'"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
            :class="viewMode === 'ITEMS'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'"
          >
            <ListFilter class="w-3.5 h-3.5" />
            <span>List Produk (Utama)</span>
          </button>
          <button
            @click="viewMode = 'SKU_GROUP'"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
            :class="viewMode === 'SKU_GROUP'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'"
          >
            <Hash class="w-3.5 h-3.5" />
            <span>Rekap per Part Number</span>
          </button>
        </div>

        <Button
          variant="outline"
          size="sm"
          @click="fetchData"
          :disabled="isLoading"
          class="h-9 px-3.5 gap-2 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoading }" />
          <span>{{ isLoading ? 'Memuat...' : 'Refresh Data' }}</span>
        </Button>

        <Button
          size="sm"
          @click="exportToExcel"
          :disabled="isLoading || filteredProductItems.length === 0"
          class="h-9 px-3.5 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm transition-all"
        >
          <FileSpreadsheet class="w-4 h-4" />
          <span>Export Excel</span>
        </Button>
      </div>
    </div>

    <!-- KPI Metrics Cards -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
      <!-- Card 1: Total Item Produk -->
      <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl hover:shadow-md transition-shadow">
        <CardContent class="p-4">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span class="text-xs font-medium uppercase tracking-wider">Item Dipesan</span>
            <Package class="w-4 h-4 text-blue-500" />
          </div>
          <div class="text-2xl font-bold text-slate-900 dark:text-white">
            {{ Number(metrics.totalItems).toLocaleString('id-ID') }}
          </div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            dari {{ metrics.uniqueHpos }} nomor HPO
          </p>
        </CardContent>
      </Card>

      <!-- Card 2: Total Kuantitas (Pcs) -->
      <Card class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl hover:shadow-md transition-shadow">
        <CardContent class="p-4">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span class="text-xs font-medium uppercase tracking-wider">Total Kuantitas</span>
            <Layers class="w-4 h-4 text-indigo-500" />
          </div>
          <div class="text-2xl font-bold text-slate-900 dark:text-white">
            {{ Number(metrics.totalPcs).toLocaleString('id-ID') }}
          </div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            {{ metrics.uniqueSkus }} part number unik
          </p>
        </CardContent>
      </Card>

      <!-- Card 3: Forwarder / Pabrik -->
      <Card
        @click="logisticsStatusFilter = logisticsStatusFilter === 'forwarder' ? 'ALL' : 'forwarder'"
        class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl cursor-pointer hover:border-amber-400 dark:hover:border-amber-600 transition-all"
        :class="{ 'ring-2 ring-amber-500 border-transparent': logisticsStatusFilter === 'forwarder' }"
      >
        <CardContent class="p-4">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span class="text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">Pabrik / Forwarder</span>
            <Clock class="w-4 h-4 text-amber-500" />
          </div>
          <div class="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {{ metrics.forwarderCount }}
          </div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Menunggu Ex-Works / pickup
          </p>
        </CardContent>
      </Card>

      <!-- Card 4: Transit / ETA Port -->
      <Card
        @click="logisticsStatusFilter = logisticsStatusFilter === 'transit' ? 'ALL' : 'transit'"
        class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl cursor-pointer hover:border-red-400 dark:hover:border-red-600 transition-all"
        :class="{ 'ring-2 ring-red-500 border-transparent': logisticsStatusFilter === 'transit' }"
      >
        <CardContent class="p-4">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span class="text-xs font-medium uppercase tracking-wider text-red-600 dark:text-red-400">Transit / ETA Port</span>
            <Anchor class="w-4 h-4 text-red-500" />
          </div>
          <div class="text-2xl font-bold text-red-600 dark:text-red-400">
            {{ metrics.transitCount }}
          </div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Dalam pengiriman ke JKT
          </p>
        </CardContent>
      </Card>

      <!-- Card 5: Gudang Siemens / Dunex -->
      <Card
        @click="logisticsStatusFilter = logisticsStatusFilter === 'warehouse' ? 'ALL' : 'warehouse'"
        class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl cursor-pointer hover:border-cyan-400 dark:hover:border-cyan-600 transition-all"
        :class="{ 'ring-2 ring-cyan-500 border-transparent': logisticsStatusFilter === 'warehouse' }"
      >
        <CardContent class="p-4">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span class="text-xs font-medium uppercase tracking-wider text-cyan-600 dark:text-cyan-400">Gudang Siemens</span>
            <Truck class="w-4 h-4 text-cyan-500" />
          </div>
          <div class="text-2xl font-bold text-cyan-600 dark:text-cyan-400">
            {{ metrics.warehouseCount }}
          </div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Tiba Gudang Dunex / Siemens
          </p>
        </CardContent>
      </Card>

      <!-- Card 6: Tiba di Hokiindo / Selesai -->
      <Card
        @click="logisticsStatusFilter = logisticsStatusFilter === 'delivered' ? 'ALL' : 'delivered'"
        class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-600 transition-all"
        :class="{ 'ring-2 ring-emerald-500 border-transparent': logisticsStatusFilter === 'delivered' }"
      >
        <CardContent class="p-4">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span class="text-xs font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Tiba di Hokiindo</span>
            <CheckCircle2 class="w-4 h-4 text-emerald-500" />
          </div>
          <div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {{ metrics.deliveredCount }}
          </div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Selesai / barang diterima
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Filter & Search Controls Bar -->
    <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
      
      <!-- Top Row: Search & Category Filter Pills -->
      <div class="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <!-- Search Input -->
        <div class="relative flex-1 max-w-lg">
          <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            v-model="searchQuery"
            placeholder="Cari SKU (3VJ/3MT/3MU/3WJ/5TJ), Nama Barang, Nomor HPO, Vendor, HSO..."
            class="pl-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs p-1"
          >
            ✕
          </button>
        </div>

        <!-- Quick Sinova Family Filter Pills -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
          <button
            @click="categoryFilter = 'ALL'"
            class="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0"
            :class="categoryFilter === 'ALL'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'"
          >
            Semua Produk ({{ metrics.totalItems }})
          </button>

          <button
            v-for="prefix in SINOVA_PREFIXES"
            :key="prefix"
            @click="categoryFilter = categoryFilter === prefix ? 'ALL' : prefix"
            class="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 border"
            :class="categoryFilter === prefix
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'"
          >
            <span class="font-bold">{{ prefix }}</span>
            <span class="text-[10px] opacity-80">
              {{ prefix === '3VJ' ? 'MCCB' : prefix === '3MT' ? 'Contactor' : prefix === '3MU' ? 'TOR' : prefix === '3WJ' ? 'ACB' : 'MCB' }}
            </span>
            <span class="ml-1 px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 text-[9px] font-mono" :class="{ 'bg-blue-800 text-white': categoryFilter === prefix }">
              {{ metrics.catCount[prefix] || 0 }}
            </span>
          </button>

          <button
            v-if="metrics.splitCount > 0"
            @click="logisticsStatusFilter = logisticsStatusFilter === 'split' ? 'ALL' : 'split'"
            class="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 border"
            :class="logisticsStatusFilter === 'split'
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
              : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:border-amber-400'"
          >
            <Layers class="w-3.5 h-3.5" />
            <span>Split Delivery</span>
            <span class="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-mono" :class="logisticsStatusFilter === 'split' ? 'bg-amber-800 text-white' : 'bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100'">
              {{ metrics.splitCount }}
            </span>
          </button>
        </div>
      </div>

      <!-- Bottom Row: Detailed Dropdowns & Date Pickers -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-3 border-t border-slate-100 dark:border-slate-700/60">
        
        <!-- Vendor Indicator (Khusus Siemens) -->
        <div class="space-y-1">
          <label class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Vendor Pemesanan</label>
          <div class="w-full h-9 px-3 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between text-slate-800 dark:text-slate-200 cursor-default">
            <span class="font-semibold text-cyan-700 dark:text-cyan-400 truncate">PT. SIEMENS INDONESIA</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-cyan-100 text-cyan-800 dark:bg-cyan-950/80 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800 shrink-0">
              Siemens Only
            </span>
          </div>
        </div>

        <!-- Logistics Status Filter -->
        <div class="space-y-1">
          <label class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Status Logistik</label>
          <select
            v-model="logisticsStatusFilter"
            class="w-full h-9 px-3 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 outline-none"
          >
            <option value="ALL">Semua Status Logistik</option>
            <option value="split">⚡ Pengiriman Parsial (Split Batch)</option>
            <option value="forwarder">Pabrik / Follow up Forwarder</option>
            <option value="transit">Transit / ETA Port JKT</option>
            <option value="warehouse">Gudang Siemens / Dunex</option>
            <option value="delivered">Tiba di Hokiindo / Selesai</option>
            <option value="unknown">Belum Ada Data Logistik</option>
          </select>
        </div>

        <!-- PO Accurate Status Filter -->
        <div class="space-y-1">
          <label class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Status PO Accurate</label>
          <select
            v-model="poStatusFilter"
            class="w-full h-9 px-3 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 outline-none"
          >
            <option value="ALL">Semua Status PO</option>
            <option v-for="st in availablePoStatuses" :key="st" :value="st">{{ st }}</option>
          </select>
        </div>

        <!-- Date Range Filter: Start Date -->
        <div class="space-y-1">
          <label class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Dari Tanggal PO</label>
          <input
            v-model="startDate"
            type="date"
            class="w-full h-9 px-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 outline-none"
          />
        </div>

        <!-- Date Range Filter: End Date & Reset -->
        <div class="space-y-1 flex items-end gap-2">
          <div class="flex-1">
            <label class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Sampai Tanggal</label>
            <input
              v-model="endDate"
              type="date"
              class="w-full h-9 px-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 outline-none"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            @click="resetFilters"
            title="Reset semua filter"
            class="h-9 px-2.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white shrink-0 rounded-xl"
          >
            Reset
          </Button>
        </div>

      </div>

      <!-- Active Filters Summary Banner -->
      <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
        <div>
          Menampilkan <span class="font-bold text-slate-900 dark:text-white">{{ filteredProductItems.length }}</span> produk Sinova (dari total {{ productItems.length }} pesanan barang)
        </div>
        <div v-if="viewMode === 'SKU_GROUP'" class="text-xs text-slate-400">
          Tergolong dalam {{ groupedBySku.length }} part number unik
        </div>
      </div>

    </div>

    <!-- MAIN DATA TABLE: MODE 1 (LIST PRODUK SEBAGAI DATA UTAMA) -->
    <div v-if="viewMode === 'ITEMS'" class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      
      <div v-if="isLoading" class="p-12 text-center space-y-3">
        <RefreshCw class="w-8 h-8 text-blue-500 animate-spin mx-auto" />
        <p class="text-sm text-slate-500 dark:text-slate-400">Sedang memuat data produk Siemens Sinova dan status logistik...</p>
      </div>

      <div v-else-if="filteredProductItems.length === 0" class="p-16 text-center space-y-3">
        <Boxes class="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
        <h3 class="text-base font-semibold text-slate-800 dark:text-slate-200">Tidak ada produk yang cocok</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Tidak ditemukan produk Sinova (3VJ, 3MT, 3MU, 3WJ, 5TJ) yang sesuai filter atau pencarian "{{ searchQuery }}". Coba ubah kata kunci atau reset filter.
        </p>
        <Button variant="outline" size="sm" @click="resetFilters" class="mt-2 rounded-xl">
          Reset Filter
        </Button>
      </div>

      <div v-else class="overflow-x-auto">
        <Table>
          <TableHeader class="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
            <TableRow>
              <TableHead class="w-12 text-center">No</TableHead>
              <TableHead class="min-w-[190px]">
                <button @click="sortField = 'sku'; sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'" class="flex items-center gap-1.5 font-bold hover:text-blue-600">
                  <span>Kode SKU / Part Number</span>
                  <ArrowUpDown class="w-3.5 h-3.5 text-slate-400" />
                </button>
              </TableHead>
              <TableHead class="min-w-[280px] font-bold">Nama & Spesifikasi Produk</TableHead>
              <TableHead class="min-w-[100px] text-right">
                <button @click="sortField = 'qty'; sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'" class="flex items-center gap-1.5 font-bold hover:text-blue-600 justify-end w-full">
                  <span>Qty</span>
                  <ArrowUpDown class="w-3.5 h-3.5 text-slate-400" />
                </button>
              </TableHead>
              <TableHead class="min-w-[170px]">
                <button @click="sortField = 'hpo'; sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'" class="flex items-center gap-1.5 font-bold hover:text-blue-600">
                  <span>Nomor HPO</span>
                  <ArrowUpDown class="w-3.5 h-3.5 text-slate-400" />
                </button>
              </TableHead>
              <TableHead class="min-w-[110px]">
                <button @click="sortField = 'date'; sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'" class="flex items-center gap-1.5 font-bold hover:text-blue-600">
                  <span>Tgl PO</span>
                  <ArrowUpDown class="w-3.5 h-3.5 text-slate-400" />
                </button>
              </TableHead>
              <TableHead class="min-w-[180px] font-bold">Vendor</TableHead>
              <TableHead class="min-w-[180px]">
                <button @click="sortField = 'status'; sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'" class="flex items-center gap-1.5 font-bold hover:text-blue-600">
                  <span>Status Logistik</span>
                  <ArrowUpDown class="w-3.5 h-3.5 text-slate-400" />
                </button>
              </TableHead>
              <TableHead class="min-w-[190px] font-bold">Jadwal Logistik</TableHead>
              <TableHead class="min-w-[140px] font-bold">Ref HSO / Notes</TableHead>
              <TableHead class="w-16 text-right pr-4 font-bold">Aksi</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <TableRow
              v-for="(item, idx) in paginatedProductItems"
              :key="item.id"
              class="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors border-b border-slate-100 dark:border-slate-800"
            >
              <!-- Index -->
              <TableCell class="text-center font-mono text-xs text-slate-400">
                {{ (currentPage - 1) * itemsPerPage + idx + 1 }}
              </TableCell>

              <!-- SKU with copy button & Category Badge -->
              <TableCell>
                <div class="space-y-1">
                  <div class="flex items-center gap-1.5">
                    <span class="font-mono font-bold text-sm text-slate-900 dark:text-white">
                      {{ item.item_code }}
                    </span>
                    <button
                      @click="copyToClipboard(item.item_code)"
                      class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                      title="Salin SKU"
                    >
                      <component :is="copiedText === item.item_code ? Check : Copy" class="w-3 h-3" :class="{ 'text-emerald-500': copiedText === item.item_code }" />
                    </button>
                  </div>
                  <Badge variant="outline" class="text-[10px] font-semibold px-2 py-0.2 rounded w-fit" :class="item.category.color">
                    {{ item.category.label }}
                  </Badge>
                </div>
              </TableCell>

              <!-- Product Name / Description -->
              <TableCell>
                <div class="text-xs text-slate-800 dark:text-slate-200 line-clamp-2 max-w-[340px]" :title="item.item_name">
                  {{ item.item_name }}
                </div>
              </TableCell>

              <!-- Quantity -->
              <TableCell class="text-right">
                <span class="font-mono font-bold text-sm text-slate-900 dark:text-white">
                  {{ item.quantity }}
                </span>
                <span class="text-[11px] text-slate-400 ml-1">{{ item.unit_name }}</span>
              </TableCell>

              <!-- HPO Number (Clickable to PO Page) -->
              <TableCell>
                <div class="flex items-center gap-1.5">
                  <span
                    @click="navigateToPoPage(item.po_id)"
                    class="font-mono font-bold text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                    title="Lihat Detail PO"
                  >
                    {{ item.hpo_number }}
                    <ExternalLink class="w-3 h-3 opacity-60" />
                  </span>
                  <button
                    @click="copyToClipboard(item.hpo_number)"
                    class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                    title="Salin Nomor HPO"
                  >
                    <component :is="copiedText === item.hpo_number ? Check : Copy" class="w-2.5 h-2.5" :class="{ 'text-emerald-500': copiedText === item.hpo_number }" />
                  </button>
                </div>
                <div class="mt-0.5">
                  <Badge variant="outline" class="text-[9px] px-1.5 py-0.2 rounded" :class="getAccurateBadgeClass(item.po_status)">
                    {{ item.po_status }}
                  </Badge>
                </div>
              </TableCell>

              <!-- PO Date -->
              <TableCell class="text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                {{ formatDate(item.po_date) }}
              </TableCell>

              <!-- Vendor -->
              <TableCell>
                <div class="space-y-0.5">
                  <div class="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[170px]" :title="item.vendor_name">
                    {{ item.vendor_name }}
                  </div>
                  <span
                    v-if="item.is_direct_siemens"
                    class="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-cyan-100 text-cyan-800 dark:bg-cyan-950/80 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800 inline-block"
                  >
                    Direct Siemens
                  </span>
                </div>
              </TableCell>

              <!-- Logistics Status Badge -->
              <TableCell>
                <div v-if="!item.logistics.isSplit" class="space-y-1">
                  <Badge variant="outline" class="text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 w-fit" :class="item.logistics.badgeClass">
                    <span class="w-1.5 h-1.5 rounded-full" :class="item.logistics.dotClass"></span>
                    <span>{{ item.logistics.label }}</span>
                  </Badge>
                  <div v-if="item.logistics.rawStatus && item.logistics.rawStatus !== item.logistics.label" class="text-[10px] text-slate-400 truncate max-w-[180px]" :title="item.logistics.rawStatus">
                    {{ item.logistics.rawStatus }}
                  </div>
                </div>

                <div v-else class="space-y-1.5 min-w-[170px]">
                  <Badge variant="outline" class="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-700 flex items-center gap-1.5 w-fit">
                    <Layers class="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    <span>Split ({{ item.logistics.subBatches.length }} Batch)</span>
                  </Badge>
                  <div class="space-y-1">
                    <div v-for="b in item.logistics.subBatches" :key="b.batchNumber" class="flex items-center gap-1.5 text-[10px] leading-tight">
                      <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="b.dotClass"></span>
                      <span v-if="b.qty" class="font-mono font-bold text-slate-800 dark:text-slate-200">{{ b.qty }} {{ item.unit_name }}</span>
                      <span class="text-slate-600 dark:text-slate-400 font-medium truncate" :title="b.label">{{ b.label }}</span>
                    </div>
                  </div>
                </div>
              </TableCell>

              <!-- Logistics Timeline / Dates -->
              <TableCell class="text-[11px] text-slate-600 dark:text-slate-400 min-w-[190px]">
                <div v-if="!item.logistics.isSplit" class="space-y-0.5">
                  <div class="flex items-center gap-1">
                    <span class="text-slate-400 w-20">Ex-Works:</span>
                    <span v-if="item.logistics.exworkWaiting" class="text-amber-600 font-medium">Waiting</span>
                    <span v-else-if="item.logistics.exworkDate" class="font-mono font-medium text-slate-800 dark:text-slate-200">{{ formatDate(item.logistics.exworkDate) }}</span>
                    <span v-else class="text-slate-400">-</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <span class="text-slate-400 w-20">ETA Port:</span>
                    <span v-if="item.logistics.etaDate" class="font-mono font-medium text-red-600 dark:text-red-400">{{ formatDate(item.logistics.etaDate) }}</span>
                    <span v-else class="text-slate-400">-</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <span class="text-slate-400 w-20">Gdg Dunex:</span>
                    <span v-if="item.logistics.dunexDate" class="font-mono font-medium text-cyan-600 dark:text-cyan-400">{{ formatDate(item.logistics.dunexDate) }}</span>
                    <span v-else class="text-slate-400">-</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <span class="text-slate-400 w-20">Hokiindo:</span>
                    <span v-if="item.logistics.hokiindoDate" class="font-mono font-bold text-emerald-600 dark:text-emerald-400">{{ formatDate(item.logistics.hokiindoDate) }}</span>
                    <span v-else class="text-slate-400">-</span>
                  </div>
                </div>

                <div v-else class="space-y-1.5">
                  <div v-for="b in item.logistics.subBatches" :key="b.batchNumber" class="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 text-[10px] space-y-0.5">
                    <div class="flex items-center justify-between font-medium">
                      <span class="font-mono font-bold text-slate-800 dark:text-slate-200">Batch {{ b.batchNumber }}<span v-if="b.qty"> ({{ b.qty }} {{ item.unit_name }})</span></span>
                      <span class="font-semibold" :class="b.stage === 'delivered' ? 'text-emerald-600' : b.stage === 'warehouse' ? 'text-cyan-600' : b.stage === 'transit' ? 'text-red-600' : 'text-amber-600'">{{ b.label }}</span>
                    </div>
                    <div class="text-slate-500 font-mono text-[9.5px]">
                      <span v-if="b.hokiindoDate">Tiba Hokiindo: {{ formatDate(b.hokiindoDate) }}</span>
                      <span v-else-if="b.dunexDate">Tiba Dunex: {{ formatDate(b.dunexDate) }}</span>
                      <span v-else-if="b.etaDate">ETA Port: {{ formatDate(b.etaDate) }}</span>
                      <span v-else-if="b.exworkDate">Ex-Works: {{ formatDate(b.exworkDate) }}</span>
                      <span v-else-if="b.exworkWaiting">Ex-Works: Waiting</span>
                      <span v-else>Jadwal belum ada</span>
                    </div>
                  </div>
                </div>
              </TableCell>

              <!-- Ref HSO / Notes -->
              <TableCell>
                <div class="text-xs text-slate-600 dark:text-slate-400 truncate max-w-[150px]" :title="item.hso_number || item.detail_notes">
                  <span v-if="item.hso_number" class="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                    {{ item.hso_number }}
                  </span>
                  <span v-else-if="item.detail_notes">{{ item.detail_notes }}</span>
                  <span v-else class="text-slate-400">-</span>
                </div>
              </TableCell>

              <!-- Quick Action -->
              <TableCell class="text-right pr-4">
                <Button
                  variant="ghost"
                  size="sm"
                  @click="openItemDetail(item)"
                  class="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-blue-600"
                  title="Lihat Detail Produk"
                >
                  <Info class="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- Pagination Footer -->
      <div v-if="filteredProductItems.length > 0" class="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <div class="flex items-center gap-2">
          <span>Tampilkan per halaman:</span>
          <select
            v-model="itemsPerPage"
            class="h-8 px-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500"
          >
            <option :value="15">15</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
            <option :value="200">200</option>
          </select>
          <span class="ml-2">
            Halaman {{ currentPage }} dari {{ totalPages }} ({{ filteredProductItems.length }} produk ditemukan)
          </span>
        </div>

        <div class="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            @click="currentPage--"
            :disabled="currentPage <= 1"
            class="h-8 w-8 p-0 rounded-lg"
          >
            <ChevronLeft class="w-4 h-4" />
          </Button>
          <span class="px-3 font-semibold text-slate-800 dark:text-slate-200">
            {{ currentPage }} / {{ totalPages }}
          </span>
          <Button
            variant="outline"
            size="sm"
            @click="currentPage++"
            :disabled="currentPage >= totalPages"
            class="h-8 w-8 p-0 rounded-lg"
          >
            <ChevronRight class="w-4 h-4" />
          </Button>
        </div>
      </div>

    </div>

    <!-- ALTERNATIVE VIEW: MODE 2 (REKAP PER PART NUMBER / SKU GROUP) -->
    <div v-else class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      
      <div v-if="groupedBySku.length === 0" class="p-12 text-center text-slate-400 text-sm">
        Tidak ada part number yang cocok dengan filter saat ini.
      </div>

      <div v-else class="overflow-x-auto">
        <Table>
          <TableHeader class="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
            <TableRow>
              <TableHead class="w-12 text-center"></TableHead>
              <TableHead class="min-w-[200px] font-bold">Kode SKU / Part Number</TableHead>
              <TableHead class="min-w-[120px] font-bold">Kategori</TableHead>
              <TableHead class="min-w-[320px] font-bold">Deskripsi Produk</TableHead>
              <TableHead class="min-w-[120px] text-right font-bold">Total Dipesan</TableHead>
              <TableHead class="min-w-[120px] text-center font-bold">Jumlah HPO</TableHead>
              <TableHead class="min-w-[180px] font-bold">Status Logistik Terbaru</TableHead>
              <TableHead class="min-w-[120px] font-bold">Tgl Order Terakhir</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <template v-for="skuItem in groupedBySku" :key="skuItem.sku">
              <!-- Master SKU Row -->
              <TableRow class="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors border-b border-slate-100 dark:border-slate-800">
                <TableCell class="text-center p-2">
                  <button
                    @click="toggleSkuExpand(skuItem.sku)"
                    class="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                  >
                    <component :is="expandedSkus.has(skuItem.sku) ? ChevronUp : ChevronDown" class="w-4 h-4" />
                  </button>
                </TableCell>
                <TableCell>
                  <div class="flex items-center gap-1.5 font-mono font-bold text-sm text-slate-900 dark:text-white">
                    <span>{{ skuItem.sku }}</span>
                    <button @click="copyToClipboard(skuItem.sku)" class="text-slate-400 hover:text-slate-600 p-0.5">
                      <component :is="copiedText === skuItem.sku ? Check : Copy" class="w-3 h-3" :class="{ 'text-emerald-500': copiedText === skuItem.sku }" />
                    </button>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" class="text-[10px] font-semibold" :class="skuItem.category.color">
                    {{ skuItem.category.label }}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div class="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 max-w-[340px]">
                    {{ skuItem.name }}
                  </div>
                </TableCell>
                <TableCell class="text-right font-mono font-bold text-sm text-slate-900 dark:text-white">
                  {{ skuItem.total_qty }} {{ skuItem.unit }}
                </TableCell>
                <TableCell class="text-center font-semibold text-xs text-blue-600 dark:text-blue-400">
                  {{ skuItem.hpos.length }} HPO
                </TableCell>
                <TableCell>
                  <Badge variant="outline" class="text-xs font-semibold px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 w-fit" :class="skuItem.latest_badge">
                    <span class="w-1.5 h-1.5 rounded-full" :class="skuItem.latest_dot"></span>
                    <span>{{ skuItem.latest_status }}</span>
                  </Badge>
                </TableCell>
                <TableCell class="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {{ formatDate(skuItem.latest_date) }}
                </TableCell>
              </TableRow>

              <!-- Sub-Table: HPO Breakdown for this SKU -->
              <TableRow v-if="expandedSkus.has(skuItem.sku)" class="bg-slate-50/60 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800">
                <TableCell colspan="8" class="p-4 pl-12 pr-6">
                  <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-inner">
                    <div class="px-4 py-2 bg-slate-100/60 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Riwayat Pemesanan {{ skuItem.sku }} ({{ skuItem.hpos.length }} Pesanan)
                    </div>
                    <Table class="text-xs">
                      <TableHeader class="bg-slate-50 dark:bg-slate-900 text-slate-500">
                        <TableRow>
                          <TableHead>Nomor HPO</TableHead>
                          <TableHead>Tanggal PO</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead class="text-right">Qty</TableHead>
                          <TableHead>Status Logistik</TableHead>
                          <TableHead>Ex-Works</TableHead>
                          <TableHead>ETA Port</TableHead>
                          <TableHead>Gdg Dunex</TableHead>
                          <TableHead>Tiba Hokiindo</TableHead>
                          <TableHead>Ref HSO / Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow v-for="hpoIt in skuItem.hpos" :key="hpoIt.id" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <TableCell class="font-mono font-bold text-blue-600 dark:text-blue-400 cursor-pointer" @click="navigateToPoPage(hpoIt.po_id)">
                            {{ hpoIt.hpo_number }}
                          </TableCell>
                          <TableCell>{{ formatDate(hpoIt.po_date) }}</TableCell>
                          <TableCell>{{ hpoIt.vendor_name }}</TableCell>
                          <TableCell class="text-right font-bold font-mono">{{ hpoIt.quantity }} {{ hpoIt.unit_name }}</TableCell>
                          <TableCell>
                            <div v-if="!hpoIt.logistics.isSplit">
                              <Badge variant="outline" class="text-[10px]" :class="hpoIt.logistics.badgeClass">
                                {{ hpoIt.logistics.label }}
                              </Badge>
                            </div>
                            <div v-else class="space-y-1">
                              <Badge variant="outline" class="text-[9px] bg-amber-50 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold">
                                Split ({{ hpoIt.logistics.subBatches.length }} Batch)
                              </Badge>
                              <div v-for="b in hpoIt.logistics.subBatches" :key="b.batchNumber" class="text-[9px] text-slate-600 dark:text-slate-400 font-mono">
                                {{ b.qty ? b.qty + ' ' + hpoIt.unit_name : '' }} {{ b.label }}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell class="font-mono text-[11px]">{{ hpoIt.logistics.exworkWaiting ? 'Waiting' : formatDate(hpoIt.logistics.exworkDate) }}</TableCell>
                          <TableCell class="font-mono text-[11px] text-red-600">{{ formatDate(hpoIt.logistics.etaDate) }}</TableCell>
                          <TableCell class="font-mono text-[11px] text-cyan-600">{{ formatDate(hpoIt.logistics.dunexDate) }}</TableCell>
                          <TableCell class="font-mono text-[11px] text-emerald-600 font-bold">{{ formatDate(hpoIt.logistics.hokiindoDate) }}</TableCell>
                          <TableCell class="text-slate-500">{{ hpoIt.hso_number || hpoIt.detail_notes || '-' }}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </div>

    </div>

    <!-- Product Detail Modal -->
    <Dialog :open="isDetailModalOpen" @update:open="isDetailModalOpen = $event">
      <DialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6">
        <DialogHeader v-if="selectedItem" class="space-y-2 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-xl">
                <Boxes class="w-6 h-6" />
              </div>
              <div>
                <DialogTitle class="text-lg font-bold font-mono text-slate-900 dark:text-white">
                  {{ selectedItem.item_code }}
                </DialogTitle>
                <DialogDescription class="text-xs text-slate-500 mt-0.5">
                  {{ selectedItem.category.label }} • {{ selectedItem.category.family }}
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" class="text-xs font-semibold px-3 py-1 rounded-full" :class="selectedItem.logistics.badgeClass">
              {{ selectedItem.logistics.label }}
            </Badge>
          </div>
        </DialogHeader>

        <div v-if="selectedItem" class="space-y-5 pt-3 text-xs">
          <!-- Description -->
          <div class="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
            <span class="text-[11px] font-semibold text-slate-400 uppercase">Deskripsi Produk</span>
            <p class="text-sm font-medium text-slate-800 dark:text-slate-200 mt-1">
              {{ selectedItem.item_name }}
            </p>
          </div>

          <!-- Key Data Grid -->
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <span class="text-[11px] text-slate-400">Nomor HPO Pemesan:</span>
              <div class="font-mono font-bold text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                <span>{{ selectedItem.hpo_number }}</span>
                <ExternalLink class="w-3 h-3 cursor-pointer" @click="navigateToPoPage(selectedItem.po_id)" />
              </div>
              <span class="text-[11px] text-slate-400">Tanggal PO: {{ formatDate(selectedItem.po_date) }}</span>
            </div>

            <div class="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <span class="text-[11px] text-slate-400">Kuantitas Dipesan:</span>
              <div class="font-mono font-bold text-base text-slate-900 dark:text-white">
                {{ selectedItem.quantity }} {{ selectedItem.unit_name }}
              </div>
              <span class="text-[11px] text-slate-400">Status PO: {{ selectedItem.po_status }}</span>
            </div>

            <div class="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <span class="text-[11px] text-slate-400">Vendor:</span>
              <div class="font-semibold text-slate-800 dark:text-slate-200">
                {{ selectedItem.vendor_name }}
              </div>
              <span v-if="selectedItem.is_direct_siemens" class="text-[10px] text-cyan-600 font-bold uppercase">Direct Siemens</span>
            </div>

            <div class="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <span class="text-[11px] text-slate-400">Referensi HSO / Catatan:</span>
              <div class="font-mono font-medium text-slate-800 dark:text-slate-200">
                {{ selectedItem.hso_number || selectedItem.detail_notes || '-' }}
              </div>
            </div>
          </div>

          <!-- Split Deliveries Dedicated Table (Jika ada Split Batches) -->
          <div v-if="selectedItem.logistics.isSplit" class="p-4 bg-amber-50/70 dark:bg-amber-950/30 rounded-xl border border-amber-200/80 dark:border-amber-800/60 space-y-3">
            <div class="flex items-center justify-between">
              <h5 class="font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                <Layers class="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Rincian Pengiriman Parsial (Split Deliveries - {{ selectedItem.logistics.subBatches.length }} Batch)</span>
              </h5>
              <span class="text-[10px] font-semibold bg-amber-200/70 text-amber-900 dark:bg-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-full font-mono">
                Total: {{ selectedItem.quantity }} {{ selectedItem.unit_name }}
              </span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs border-collapse">
                <thead>
                  <tr class="border-b border-amber-200 dark:border-amber-800 text-[10px] text-amber-800/80 dark:text-amber-300 uppercase tracking-wider">
                    <th class="py-1.5 px-2">Batch</th>
                    <th class="py-1.5 px-2 text-right">Kuantitas</th>
                    <th class="py-1.5 px-2">Status Logistik</th>
                    <th class="py-1.5 px-2">Ex-Works</th>
                    <th class="py-1.5 px-2">ETA Port</th>
                    <th class="py-1.5 px-2">Gdg Dunex</th>
                    <th class="py-1.5 px-2">Tiba Hokiindo</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-amber-100 dark:divide-amber-900/50 text-[11px]">
                  <tr v-for="b in selectedItem.logistics.subBatches" :key="b.batchNumber" class="hover:bg-amber-100/40 dark:hover:bg-amber-900/20 transition-colors">
                    <td class="py-2 px-2 font-mono font-bold text-slate-800 dark:text-slate-200">Batch {{ b.batchNumber }}</td>
                    <td class="py-2 px-2 text-right font-mono font-bold text-slate-900 dark:text-white">{{ b.qty ? b.qty + ' ' + selectedItem.unit_name : '-' }}</td>
                    <td class="py-2 px-2">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border" :class="b.badgeClass">
                        <span class="w-1 h-1 rounded-full" :class="b.dotClass"></span>
                        {{ b.label }}
                      </span>
                    </td>
                    <td class="py-2 px-2 font-mono text-[10px] text-slate-600 dark:text-slate-400">{{ b.exworkWaiting ? 'Waiting' : (formatDate(b.exworkDate) || '-') }}</td>
                    <td class="py-2 px-2 font-mono text-[10px] text-red-600 dark:text-red-400">{{ formatDate(b.etaDate) || '-' }}</td>
                    <td class="py-2 px-2 font-mono text-[10px] text-cyan-600 dark:text-cyan-400">{{ formatDate(b.dunexDate) || '-' }}</td>
                    <td class="py-2 px-2 font-mono text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">{{ formatDate(b.hokiindoDate) || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Logistics Schedule Timeline (4 Tahapan) -->
          <div class="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h5 class="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Truck class="w-4 h-4 text-blue-500" />
              <span>Jadwal & Riwayat Logistik (4 Tahapan)</span>
            </h5>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div class="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                <span class="text-[10px] text-slate-400 block">1. Ex-Works (Pabrik)</span>
                <span class="font-mono font-bold text-xs mt-0.5 block" :class="selectedItem.logistics.exworkWaiting ? 'text-amber-600' : 'text-slate-700 dark:text-slate-300'">
                  {{ selectedItem.logistics.exworkWaiting ? 'Waiting Confirmation' : formatDate(selectedItem.logistics.exworkDate) }}
                </span>
              </div>
              <div class="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                <span class="text-[10px] text-slate-400 block">2. ETA Port Jakarta</span>
                <span class="font-mono font-bold text-xs mt-0.5 block text-red-600 dark:text-red-400">
                  {{ formatDate(selectedItem.logistics.etaDate) }}
                </span>
              </div>
              <div class="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                <span class="text-[10px] text-slate-400 block">3. Gudang Dunex</span>
                <span class="font-mono font-bold text-xs mt-0.5 block text-cyan-600 dark:text-cyan-400">
                  {{ formatDate(selectedItem.logistics.dunexDate) }}
                </span>
              </div>
              <div class="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                <span class="text-[10px] text-slate-400 block">4. Tiba di Hokiindo</span>
                <span class="font-mono font-bold text-xs mt-0.5 block text-emerald-600 dark:text-emerald-400">
                  {{ formatDate(selectedItem.logistics.hokiindoDate) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" size="sm" @click="isDetailModalOpen = false" class="rounded-xl">
              Tutup
            </Button>
            <Button size="sm" @click="navigateToPoPage(selectedItem.po_id)" class="bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-1.5">
              <span>Buka PO {{ selectedItem.hpo_number }}</span>
              <ExternalLink class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

  </div>
</template>
