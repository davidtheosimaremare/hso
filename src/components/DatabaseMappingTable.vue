<script setup>
import { ref, reactive, computed, onMounted, watch, inject } from 'vue'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAccurateItems, CATEGORY_PRIORITY } from '@/composables/useAccurateItems'
import { formatRupiah, cleanPartNumber } from '@/utils/componentConverter'
import { 
  Search, 
  Download, 
  Upload, 
  RefreshCw, 
  Database, 
  Check, 
  AlertCircle,
  Shield,
  Info,
  Lock
} from 'lucide-vue-next'

const emit = defineEmits(['test-product'])

// Role & Permissions Injection
const userRole = inject('userRole', ref('STAFF'))
const allowedModules = inject('allowedModules', ref([]))

const canEdit = computed(() => {
  return userRole.value === 'ADMIN' || 
         allowedModules.value?.includes('database-mapping:write') || 
         allowedModules.value?.includes('settings:write')
})

const canRead = computed(() => {
  return canEdit.value || 
         allowedModules.value?.includes('database-mapping:read') || 
         allowedModules.value?.includes('settings:read')
})

const { 
  items: accurateItems, 
  customRules, 
  mappedCount,
  isLoading: isAccurateLoading,
  isSyncing: isCatalogSyncing,
  syncProgress: catalogSyncProgress,
  fetchItems,
  fetchCustomRules,
  upsertRuleBySiemensMlfb,
  syncFromShopApi 
} = useAccurateItems()

// Inline Inputs State for Spreadsheet Table
const inlineInputs = ref({})
const inlineSaveStatus = ref({}) // { [mlfb]: 'saving' | 'saved' | 'error' }

// Search & Filter State
const ruleSearch = ref('')
const selectedRuleCategory = ref('ALL')
const mappingStatusFilter = ref('ALL') // 'ALL' | 'MAPPED' | 'UNMAPPED'
const itemsPerPage = ref(50)
const currentPage = ref(1)

const fileInputRef = ref(null)

// Toast Feedback State
const toastMessage = ref('')
const toastType = ref('success')
let toastTimer = null

const showToast = (msg, type = 'success') => {
  toastMessage.value = msg
  toastType.value = type
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMessage.value = ''
  }, 4000)
}

// Category list
const categoryOptions = computed(() => {
  const cats = new Set((accurateItems.value || []).map(i => i.category || 'OTHER'))
  const sorted = Array.from(cats).sort((a, b) => {
    const pA = CATEGORY_PRIORITY[a] ?? 99
    const pB = CATEGORY_PRIORITY[b] ?? 99
    if (pA !== pB) return pA - pB
    return a.localeCompare(b)
  })
  return [{ key: 'ALL', label: 'Semua Kategori' }, ...sorted.map(c => ({ key: c, label: c }))]
})

// Populate inlineInputs from customRules
const syncInlineInputsFromRules = () => {
  const map = {}
  ;(customRules.value || []).forEach(r => {
    const rawMlfb = (r.siemens_mlfb || r.target_siemens_mlfb || '').toUpperCase()
    const cleanMlfb = cleanPartNumber(rawMlfb)
    const hasSch = r.schneider_model && r.schneider_model.trim() && r.schneider_model.trim() !== '-'
    const hasAbb = r.abb_model && r.abb_model.trim() && r.abb_model.trim() !== '-'
    const rowData = {
      schneider: hasSch ? r.schneider_model.trim() : '',
      schneider_desc: r.schneider_desc || '',
      schneider_price: r.schneider_price || '',
      abb: hasAbb ? r.abb_model.trim() : '',
      abb_desc: r.abb_desc || '',
      abb_price: r.abb_price || ''
    }
    if (rawMlfb) map[rawMlfb] = rowData
    if (cleanMlfb) map[cleanMlfb] = rowData
  })
  inlineInputs.value = map
}

watch(customRules, () => {
  syncInlineInputsFromRules()
}, { immediate: true, deep: true })

onMounted(async () => {
  await Promise.all([fetchItems(), fetchCustomRules()])
  syncInlineInputsFromRules()
})

// Cell Get / Set Helper
const getCellValue = (mlfb, field) => {
  const code = (mlfb || '').toUpperCase()
  const clean = cleanPartNumber(code)
  return inlineInputs.value[code]?.[field] ?? inlineInputs.value[clean]?.[field] ?? ''
}

const setCellValue = (mlfb, field, value) => {
  const code = (mlfb || '').toUpperCase()
  const clean = cleanPartNumber(code)
  if (!inlineInputs.value[code]) {
    const existing = inlineInputs.value[clean] || {}
    inlineInputs.value[code] = {
      schneider: existing.schneider || '',
      schneider_desc: existing.schneider_desc || '',
      schneider_price: existing.schneider_price || '',
      abb: existing.abb || '',
      abb_desc: existing.abb_desc || '',
      abb_price: existing.abb_price || ''
    }
  }
  inlineInputs.value[code][field] = value
  if (clean && clean !== code) {
    inlineInputs.value[clean] = inlineInputs.value[code]
  }
}

// Inline Input & Blur Handler
const handleCellInput = (item, field, value) => {
  const mlfb = (item.item_no || '').toUpperCase()
  setCellValue(mlfb, field, value)
}

const handleCellBlur = async (item) => {
  await saveRowInline(item)
}

const isItemMapped = (mlfb) => {
  const code = (mlfb || '').toUpperCase()
  const clean = cleanPartNumber(code)
  const data = inlineInputs.value[code] || inlineInputs.value[clean]
  if (data) {
    const hasSch = data.schneider && data.schneider.trim() && data.schneider.trim() !== '-'
    const hasAbb = data.abb && data.abb.trim() && data.abb.trim() !== '-'
    if (hasSch || hasAbb) return true
  }
  const rule = (customRules.value || []).find(r => {
    const rRaw = (r.siemens_mlfb || r.target_siemens_mlfb || '').toUpperCase()
    return rRaw === code || (clean && cleanPartNumber(rRaw) === clean)
  })
  return !!(rule && (
    (rule.schneider_model && rule.schneider_model.trim() && rule.schneider_model.trim() !== '-') || 
    (rule.abb_model && rule.abb_model.trim() && rule.abb_model.trim() !== '-') ||
    (rule.other_model && rule.other_model.trim() && rule.other_model.trim() !== '-')
  ))
}

// Database stats
const databaseStats = computed(() => {
  const total = accurateItems.value.length
  let mapped = 0
  accurateItems.value.forEach(item => {
    if (isItemMapped(item.item_no)) mapped++
  })
  return {
    total,
    mapped,
    unmapped: Math.max(0, total - mapped),
    percentage: total > 0 ? Math.round((mapped / total) * 100) : 0
  }
})

// Filtered database products
const filteredDatabaseProducts = computed(() => {
  return accurateItems.value.filter(item => {
    const mlfb = (item.item_no || '').toUpperCase()
    const name = (item.item_name || '').toUpperCase()
    const cat = item.category || 'OTHER'
    const sch = (inlineInputs.value[mlfb]?.schneider || '').toUpperCase()
    const abb = (inlineInputs.value[mlfb]?.abb || '').toUpperCase()

    if (selectedRuleCategory.value !== 'ALL' && cat !== selectedRuleCategory.value) {
      return false
    }

    if (mappingStatusFilter.value === 'MAPPED' && !isItemMapped(mlfb)) return false
    if (mappingStatusFilter.value === 'UNMAPPED' && isItemMapped(mlfb)) return false

    if (ruleSearch.value.trim()) {
      const q = ruleSearch.value.trim().toUpperCase()
      const matches = mlfb.includes(q) || name.includes(q) || sch.includes(q) || abb.includes(q)
      if (!matches) return false
    }

    return true
  })
})

const totalDatabasePages = computed(() => {
  return Math.ceil(filteredDatabaseProducts.value.length / itemsPerPage.value) || 1
})

const paginatedProducts = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return filteredDatabaseProducts.value.slice(start, start + itemsPerPage.value)
})

watch([ruleSearch, selectedRuleCategory, mappingStatusFilter, itemsPerPage], () => {
  currentPage.value = 1
})

// Save Row Inline to Supabase
const saveRowInline = async (item) => {
  const mlfb = (item.item_no || '').toUpperCase()
  if (!mlfb) return

  const rowData = inlineInputs.value[mlfb] || {}
  const schneiderModel = (rowData.schneider || '').trim()
  const schneiderDesc = (rowData.schneider_desc || '').trim()
  const schneiderPrice = rowData.schneider_price ? Number(rowData.schneider_price) : null
  const abbModel = (rowData.abb || '').trim()
  const abbDesc = (rowData.abb_desc || '').trim()
  const abbPrice = rowData.abb_price ? Number(rowData.abb_price) : null

  inlineSaveStatus.value[mlfb] = 'saving'

  try {
    const ruleObj = {
      siemens_mlfb: mlfb,
      target_siemens_mlfb: mlfb,
      siemens_name: item.item_name || `Siemens ${mlfb}`,
      category: item.category || 'OTHER',
      schneider_model: schneiderModel || '-',
      schneider_desc: schneiderDesc,
      schneider_price: schneiderPrice,
      abb_model: abbModel || '-',
      abb_desc: abbDesc,
      abb_price: abbPrice,
      notes: 'Mapping Inline Autosave',
      updated_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('siemens_product_mappings')
      .upsert(ruleObj, { onConflict: 'siemens_mlfb' })

    if (error) throw error

    inlineSaveStatus.value[mlfb] = 'saved'
    setTimeout(() => {
      if (inlineSaveStatus.value[mlfb] === 'saved') {
        delete inlineSaveStatus.value[mlfb]
      }
    }, 2000)

    const existingIdx = customRules.value.findIndex(r => (r.siemens_mlfb || r.target_siemens_mlfb || '').toUpperCase() === mlfb)
    if (existingIdx >= 0) {
      customRules.value[existingIdx] = { ...customRules.value[existingIdx], ...ruleObj }
    } else {
      customRules.value.push(ruleObj)
    }
  } catch (err) {
    console.error('Error saving row inline:', err)
    inlineSaveStatus.value[mlfb] = 'error'
    showToast(`Gagal menyimpan ${mlfb}: ${err.message}`, 'error')
  }
}

// Direct Sync Siemens from Accurate API
const handleDirectSyncSiemens = async () => {
  try {
    showToast('Memulai sinkronisasi katalog Siemens dari Toko...', 'info')
    const res = await syncFromShopApi(null, {
      brand: 'SIEMENS',
      limit: 500
    })
    await Promise.all([fetchItems({ force: true }), fetchCustomRules()])
    syncInlineInputsFromRules()
    showToast(`Berhasil! Seluruh ${res.totalImported || res.totalRecords} produk Siemens berhasil disinkronkan ke database!`, 'success')
  } catch (err) {
    console.error('Direct sync failed:', err)
    showToast(`Sinkronisasi gagal: ${err.message}. Memuat ulang data lokal...`, 'error')
    await fetchItems({ force: true })
  }
}

// Export to Excel
const exportToExcel = () => {
  try {
    const exportData = accurateItems.value.map(item => {
      const mlfb = (item.item_no || '').toUpperCase()
      const data = inlineInputs.value[mlfb] || {}
      return {
        'Category': item.category || 'OTHER',
        'Siemens MLFB': item.item_no,
        'Siemens Item Name': item.item_name,
        'Siemens Price': item.unit_price || 0,
        'Schneider Model': data.schneider || '',
        'Schneider Description': data.schneider_desc || '',
        'Schneider Price': data.schneider_price || '',
        'ABB Model': data.abb || '',
        'ABB Description': data.abb_desc || '',
        'ABB Price': data.abb_price || ''
      }
    })

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Product Mapping')

    const dateStr = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `HSO_Product_Mapping_Database_${dateStr}.xlsx`)
    showToast('Data database mapping berhasil diexport ke Excel!', 'success')
  } catch (err) {
    showToast(`Gagal export Excel: ${err.message}`, 'error')
  }
}

// Import from Excel
const triggerFileInput = () => {
  if (fileInputRef.value) fileInputRef.value.click()
}

const importFromExcel = async (e) => {
  const file = e.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (evt) => {
    try {
      const data = new Uint8Array(evt.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const firstSheet = workbook.SheetNames[0]
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet])

      if (!rows.length) {
        showToast('File Excel kosong.', 'error')
        return
      }

      let importedCount = 0
      const upsertPayload = []

      rows.forEach(r => {
        const mlfb = cleanPartNumber(r['Siemens MLFB'] || r['siemens_mlfb'] || r['MLFB'] || '')
        if (mlfb) {
          const schneider = cleanPartNumber(r['Schneider Model'] || r['schneider_model'] || '')
          const schneider_desc = (r['Schneider Description'] || r['schneider_desc'] || '').trim()
          const schneider_price = r['Schneider Price'] || r['schneider_price'] ? Number(r['Schneider Price'] || r['schneider_price']) : null
          const abb = cleanPartNumber(r['ABB Model'] || r['abb_model'] || '')
          const abb_desc = (r['ABB Description'] || r['abb_desc'] || '').trim()
          const abb_price = r['ABB Price'] || r['abb_price'] ? Number(r['ABB Price'] || r['abb_price']) : null
          const category = (r['Category'] || r['category'] || 'OTHER').trim()
          const siemens_name = (r['Siemens Item Name'] || r['siemens_name'] || `Siemens ${mlfb}`).trim()

          upsertPayload.push({
            siemens_mlfb: mlfb,
            target_siemens_mlfb: mlfb,
            siemens_name,
            category,
            schneider_model: schneider || '-',
            schneider_desc,
            schneider_price,
            abb_model: abb || '-',
            abb_desc,
            abb_price,
            notes: 'Imported from Excel',
            updated_at: new Date().toISOString()
          })
          importedCount++
        }
      })

      if (upsertPayload.length > 0) {
        const { error } = await supabase
          .from('siemens_product_mappings')
          .upsert(upsertPayload, { onConflict: 'siemens_mlfb' })

        if (error) throw error

        await fetchCustomRules()
        syncInlineInputsFromRules()
        showToast(`Berhasil mengimpor ${importedCount} mapping dari Excel!`, 'success')
      }
    } catch (err) {
      console.error('Error importing Excel:', err)
      showToast(`Gagal impor Excel: ${err.message}`, 'error')
    } finally {
      if (fileInputRef.value) fileInputRef.value.value = ''
    }
  }
  reader.readAsArrayBuffer(file)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Toast Feedback -->
    <div 
      v-if="toastMessage" 
      class="fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-xs font-semibold shadow-lg transition-all animate-in fade-in slide-in-from-top-3 flex items-center gap-2"
      :class="toastType === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'"
    >
      <Check v-if="toastType === 'success'" class="w-4 h-4" />
      <AlertCircle v-else class="w-4 h-4" />
      <span>{{ toastMessage }}</span>
    </div>

    <!-- Hidden file input for Excel import -->
    <input 
      ref="fileInputRef" 
      type="file" 
      accept=".xlsx, .xls, .csv" 
      class="hidden" 
      @change="importFromExcel" 
    />

    <!-- Header & Action Bar -->
    <div class="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-slate-200 dark:border-zinc-800 shadow-sm space-y-3">
      
      <!-- Read-Only Banner for View-Only Users -->
      <div v-if="!canEdit" class="flex items-center gap-2.5 p-3 bg-blue-50/80 dark:bg-blue-950/40 rounded-xl border border-blue-200/80 dark:border-blue-900/60 text-xs text-blue-800 dark:text-blue-200">
        <Info class="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
        <div>
          <strong class="font-semibold">Mode Pratinjau (Hanya Lihat):</strong> 
          Anda memiliki akses untuk meninjau data referensi pemetaan. Pengubahan data, impor, dan sinkronisasi master hanya dapat dilakukan oleh <strong>Tim Technical Engineer</strong> dan <strong>Administrator</strong>.
        </div>
      </div>

      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Database class="w-4 h-4 text-red-600" />
            <span>Master Database Mapping Converter</span>
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {{ canEdit ? 'Ketik langsung kode Schneider dan ABB pada baris produk yang sesuai. Data otomatis tersimpan (Autosave).' : 'Pratinjau master pemetaan komponen teknik lintas merek (Siemens, Schneider, ABB).' }}
          </p>
        </div>

        <!-- Action Buttons & Quick Stats -->
        <div class="flex items-center gap-2 flex-wrap">
          <button
            @click="exportToExcel"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300 text-xs font-semibold shadow-2xs cursor-pointer transition-all"
            title="Download Spreadsheet Excel"
          >
            <Download class="w-3.5 h-3.5" />
            <span>Export Excel</span>
          </button>

          <button
            v-if="canEdit"
            @click="triggerFileInput"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300 text-xs font-semibold shadow-2xs cursor-pointer transition-all"
            title="Upload File Excel"
          >
            <Upload class="w-3.5 h-3.5" />
            <span>Import Excel</span>
          </button>

          <button
            v-if="canEdit"
            @click="handleDirectSyncSiemens"
            :disabled="isCatalogSyncing"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isCatalogSyncing }" />
            <span>{{ isCatalogSyncing ? `Syncing ${catalogSyncProgress}%...` : 'Sync Database' }}</span>
          </button>
        </div>
      </div>

      <!-- Quick Stats Pills -->
      <div class="flex items-center gap-2 text-xs font-semibold flex-wrap pt-2 border-t border-slate-100 dark:border-zinc-800">
        <span class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-zinc-700">
          Total Siemens: <strong class="text-slate-900 dark:text-white font-mono">{{ databaseStats.total }}</strong>
        </span>
        <span class="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40">
          Sudah Di-mapping: <strong class="font-mono">{{ databaseStats.mapped }} ({{ databaseStats.percentage }}%)</strong>
        </span>
        <span class="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40">
          Belum Di-mapping: <strong class="font-mono">{{ databaseStats.unmapped }}</strong>
        </span>
      </div>

      <!-- Filter & Search Controls Bar -->
      <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-zinc-800 flex-wrap">
        
        <!-- Search input -->
        <div class="relative flex-1 min-w-[220px]">
          <Search class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            v-model="ruleSearch"
            type="text"
            placeholder="Cari part number Siemens, Schneider, ABB, atau nama..."
            class="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
          />
        </div>

        <!-- Status Filter Tabs -->
        <div class="flex items-center gap-1">
          <button
            @click="mappingStatusFilter = 'ALL'"
            class="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border"
            :class="mappingStatusFilter === 'ALL'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm'
              : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-zinc-800 hover:bg-slate-50'"
          >
            Semua ({{ databaseStats.total }})
          </button>

          <button
            @click="mappingStatusFilter = 'UNMAPPED'"
            class="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border"
            :class="mappingStatusFilter === 'UNMAPPED'
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
              : 'bg-white dark:bg-zinc-900 text-amber-700 dark:text-amber-400 border-slate-200 dark:border-zinc-800 hover:bg-amber-50/50'"
          >
            Belum ({{ databaseStats.unmapped }})
          </button>

          <button
            @click="mappingStatusFilter = 'MAPPED'"
            class="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border"
            :class="mappingStatusFilter === 'MAPPED'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              : 'bg-white dark:bg-zinc-900 text-emerald-700 dark:text-emerald-400 border-slate-200 dark:border-zinc-800 hover:bg-emerald-50/50'"
          >
            Sudah ({{ databaseStats.mapped }})
          </button>
        </div>

        <!-- Category filter & page limit -->
        <div class="flex items-center gap-2">
          <select
            v-model="selectedRuleCategory"
            class="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-red-500 cursor-pointer"
          >
            <option v-for="cat in categoryOptions" :key="cat.key" :value="cat.key">
              {{ cat.label }}
            </option>
          </select>

          <select
            v-model="itemsPerPage"
            class="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-red-500 cursor-pointer"
          >
            <option :value="25">25 baris</option>
            <option :value="50">50 baris</option>
            <option :value="100">100 baris</option>
            <option :value="200">200 baris</option>
          </select>
        </div>

      </div>

    </div>

    <!-- SPREADSHEET TABLE -->
    <div class="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm">
      <div class="overflow-x-auto max-h-[600px]">
        <table class="w-full text-xs text-left border-collapse">
          <thead class="bg-slate-100/80 dark:bg-zinc-800/80 text-slate-600 dark:text-slate-400 uppercase font-bold text-[10px] sticky top-0 z-10 border-b border-slate-200 dark:border-zinc-800">
            <tr>
              <th class="p-2.5 w-10 text-center">#</th>
              <th class="p-2.5 w-28">Kategori</th>
              <th class="p-2.5 min-w-[260px]">Siemens (Rujukan Asal)</th>
              <th class="p-2.5 min-w-[290px]">Schneider (Kode, Deskripsi & Harga)</th>
              <th class="p-2.5 min-w-[290px]">ABB (Kode, Deskripsi & Harga)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-zinc-800">
            <tr 
              v-for="(item, idx) in paginatedProducts" 
              :key="item.item_no" 
              class="hover:bg-slate-50/70 dark:hover:bg-zinc-800/40 transition-colors"
              :class="{ 'bg-emerald-50/20 dark:bg-emerald-950/10': isItemMapped(item.item_no) }"
            >
              <!-- Index -->
              <td class="p-2.5 text-center text-slate-400 font-mono text-[11px] align-top">
                {{ (currentPage - 1) * itemsPerPage + idx + 1 }}
              </td>

              <!-- Category -->
              <td class="p-2.5 align-top">
                <span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold tracking-tight bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-zinc-700/60">
                  {{ item.category || 'OTHER' }}
                </span>
              </td>

              <!-- Siemens Product (MLFB + Name + Price) -->
              <td class="p-2.5 align-top">
                <div class="font-mono font-bold text-slate-900 dark:text-white text-xs">
                  {{ item.item_no }}
                </div>
                <div class="text-[11px] text-slate-500 line-clamp-2 font-normal mt-0.5" :title="item.item_name">
                  {{ item.item_name }}
                </div>
                <div v-if="item.unit_price" class="text-[11px] font-mono text-red-600 dark:text-red-400 font-bold mt-1">
                  {{ formatRupiah(item.unit_price) }}
                </div>
              </td>

              <!-- Schneider Input Cell (Code + Description Textarea + Price) -->
              <td class="p-2 align-top space-y-1.5">
                <input
                  type="text"
                  :value="getCellValue(item.item_no, 'schneider')"
                  :readonly="!canEdit"
                  @input="canEdit && handleCellInput(item, 'schneider', $event.target.value)"
                  @blur="canEdit && handleCellBlur(item)"
                  placeholder="Kode Model Schneider (e.g. A9F74106)"
                  class="w-full px-2.5 py-1.5 rounded-lg font-mono font-bold uppercase text-xs border transition-all"
                  :class="canEdit 
                    ? 'bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-white border-slate-200 dark:border-zinc-800 focus:outline-none focus:border-red-500 focus:bg-white dark:focus:bg-zinc-900 focus:ring-1 focus:ring-red-500' 
                    : 'bg-slate-100/70 dark:bg-zinc-900/60 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-zinc-800/60 cursor-default select-all'"
                />
                <textarea
                  :value="getCellValue(item.item_no, 'schneider_desc')"
                  :readonly="!canEdit"
                  @input="canEdit && handleCellInput(item, 'schneider_desc', $event.target.value)"
                  @blur="canEdit && handleCellBlur(item)"
                  rows="2"
                  placeholder="Deskripsi Schneider"
                  class="w-full px-2.5 py-1.5 rounded-lg text-[11px] leading-relaxed border resize-y transition-all"
                  :class="canEdit 
                    ? 'bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-white border-slate-200 dark:border-zinc-800 focus:outline-none focus:border-red-500 focus:bg-white dark:focus:bg-zinc-900' 
                    : 'bg-slate-100/70 dark:bg-zinc-900/60 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-zinc-800/60 cursor-default select-all'"
                ></textarea>
                <div class="relative">
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">Rp</span>
                  <input
                    type="number"
                    :value="getCellValue(item.item_no, 'schneider_price')"
                    :readonly="!canEdit"
                    @input="canEdit && handleCellInput(item, 'schneider_price', $event.target.value)"
                    @blur="canEdit && handleCellBlur(item)"
                    placeholder="Harga Schneider (Rp)"
                    class="w-full pl-8 pr-2.5 py-1 rounded-lg font-mono font-semibold text-[11px] border transition-all"
                    :class="canEdit 
                      ? 'bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-white border-slate-200 dark:border-zinc-800 focus:outline-none focus:border-red-500 focus:bg-white dark:focus:bg-zinc-900' 
                      : 'bg-slate-100/70 dark:bg-zinc-900/60 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-zinc-800/60 cursor-default select-all'"
                  />
                </div>
              </td>

              <!-- ABB Input Cell (Code + Description Textarea + Price) -->
              <td class="p-2 align-top space-y-1.5">
                <input
                  type="text"
                  :value="getCellValue(item.item_no, 'abb')"
                  :readonly="!canEdit"
                  @input="canEdit && handleCellInput(item, 'abb', $event.target.value)"
                  @blur="canEdit && handleCellBlur(item)"
                  placeholder="Kode Model ABB (e.g. SH201-C6)"
                  class="w-full px-2.5 py-1.5 rounded-lg font-mono font-bold uppercase text-xs border transition-all"
                  :class="canEdit 
                    ? 'bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-white border-slate-200 dark:border-zinc-800 focus:outline-none focus:border-red-500 focus:bg-white dark:focus:bg-zinc-900 focus:ring-1 focus:ring-red-500' 
                    : 'bg-slate-100/70 dark:bg-zinc-900/60 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-zinc-800/60 cursor-default select-all'"
                />
                <textarea
                  :value="getCellValue(item.item_no, 'abb_desc')"
                  :readonly="!canEdit"
                  @input="canEdit && handleCellInput(item, 'abb_desc', $event.target.value)"
                  @blur="canEdit && handleCellBlur(item)"
                  rows="2"
                  placeholder="Deskripsi ABB"
                  class="w-full px-2.5 py-1.5 rounded-lg text-[11px] leading-relaxed border resize-y transition-all"
                  :class="canEdit 
                    ? 'bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-white border-slate-200 dark:border-zinc-800 focus:outline-none focus:border-red-500 focus:bg-white dark:focus:bg-zinc-900' 
                    : 'bg-slate-100/70 dark:bg-zinc-900/60 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-zinc-800/60 cursor-default select-all'"
                ></textarea>
                <div class="relative">
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">Rp</span>
                  <input
                    type="number"
                    :value="getCellValue(item.item_no, 'abb_price')"
                    :readonly="!canEdit"
                    @input="canEdit && handleCellInput(item, 'abb_price', $event.target.value)"
                    @blur="canEdit && handleCellBlur(item)"
                    placeholder="Harga ABB (Rp)"
                    class="w-full pl-8 pr-2.5 py-1 rounded-lg font-mono font-semibold text-[11px] border transition-all"
                    :class="canEdit 
                      ? 'bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-white border-slate-200 dark:border-zinc-800 focus:outline-none focus:border-red-500 focus:bg-white dark:focus:bg-zinc-900' 
                      : 'bg-slate-100/70 dark:bg-zinc-900/60 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-zinc-800/60 cursor-default select-all'"
                  />
                </div>
              </td>
            </tr>

            <tr v-if="!paginatedProducts.length">
              <td colspan="5" class="p-10 text-center text-slate-400">
                Tidak ada data produk yang cocok dengan pencarian / filter.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Controls Bar -->
      <div class="p-3 bg-slate-50/80 dark:bg-zinc-800/50 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3 text-xs text-slate-500 font-semibold flex-wrap">
        <div>
          Menampilkan 
          <strong class="text-slate-800 dark:text-slate-200 font-mono">{{ filteredDatabaseProducts.length ? (currentPage - 1) * itemsPerPage + 1 : 0 }}</strong>
          s/d 
          <strong class="text-slate-800 dark:text-slate-200 font-mono">{{ Math.min(currentPage * itemsPerPage, filteredDatabaseProducts.length) }}</strong> 
          dari <strong class="text-slate-800 dark:text-slate-200 font-mono">{{ filteredDatabaseProducts.length }}</strong> produk
        </div>

        <div class="flex items-center gap-1.5">
          <button
            @click="currentPage--"
            :disabled="currentPage <= 1"
            class="px-3 py-1 rounded-md bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
          >
            Sebelumnya
          </button>

          <span class="px-2 font-mono text-slate-700 dark:text-slate-300">
            Halaman {{ currentPage }} / {{ totalDatabasePages }}
          </span>

          <button
            @click="currentPage++"
            :disabled="currentPage >= totalDatabasePages"
            class="px-3 py-1 rounded-md bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
          >
            Selanjutnya
          </button>
        </div>
      </div>

    </div>
  </div>
</template>
