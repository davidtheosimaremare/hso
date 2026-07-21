import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'

// Global sync state (shared across all component instances)
const isSyncing = ref(false)
const syncStep = ref('idle') // 'idle' | 'hpo' | 'hri' | 'hdo' | 'done'
const syncProgress = ref(0)
const syncLog = ref([]) // [{ type, message, count, timestamp }]
const lastSyncTime = ref(
  localStorage.getItem('accurate_last_sync')
    ? parseInt(localStorage.getItem('accurate_last_sync'))
    : null
)

const SYNC_THROTTLE_MINUTES = 30

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

function addLog(type, message, count = null) {
  syncLog.value.unshift({ type, message, count, timestamp: new Date() })
  if (syncLog.value.length > 30) syncLog.value.pop()
}

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  }
}

async function callPagedSync(fnName, { silent = false } = {}) {
  const headers = await getAuthHeaders()
  const endpoint = `${supabaseUrl}/functions/v1/${fnName}`
  let page = 1
  let hasMore = true
  let totalProcessed = 0
  let totalUpdated = 0
  let errors = 0

  while (hasMore) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ page })
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`)
      }

      const result = await res.json()
      totalProcessed += result.processed || 0

      const match = result.message?.match(/(\d+)\s+shipments?\s+updated/i)
      if (match) totalUpdated += parseInt(match[1])

      if (result.errors?.length) errors += result.errors.length

      hasMore = result.hasMore === true
      if (hasMore) {
        page++
        await new Promise(r => setTimeout(r, 800))
      }
    } catch (err) {
      console.warn(`[AccurateSync] ${fnName} page ${page} error:`, err.message)
      if (!silent) addLog('warn', `${fnName} hal. ${page}: ${err.message}`)
      page++
      if (page > 15) { hasMore = false; break }
      await new Promise(r => setTimeout(r, 1500))
    }
  }

  return { totalProcessed, totalUpdated, errors, pages: page }
}

export function useAccurateSync() {
  const lastSyncFormatted = computed(() => {
    if (!lastSyncTime.value) return null
    const d = new Date(lastSyncTime.value)
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  })

  const minutesSinceLastSync = computed(() => {
    if (!lastSyncTime.value) return Infinity
    return (Date.now() - lastSyncTime.value) / (1000 * 60)
  })

  const shouldAutoSync = computed(() => minutesSinceLastSync.value > SYNC_THROTTLE_MINUTES)

  async function syncHri({ silent = false } = {}) {
    syncStep.value = 'hri'
    if (!silent) addLog('info', 'Sinkronisasi HRI dimulai...')
    try {
      const result = await callPagedSync('sync-accurate-receive-items', { silent })
      const updatedMsg = result.totalUpdated > 0 ? `, ${result.totalUpdated} status logistik diperbarui` : ''
      addLog('success', `HRI selesai: ${result.totalProcessed} data diproses${updatedMsg}`, result.totalProcessed)
      return result
    } catch (err) {
      addLog('error', `HRI gagal: ${err.message}`)
      return { totalProcessed: 0, error: err.message }
    }
  }

  async function syncHpo({ silent = false } = {}) {
    syncStep.value = 'hpo'
    if (!silent) addLog('info', 'Sinkronisasi HPO dimulai...')
    try {
      const result = await callPagedSync('sync-accurate-pos', { silent })
      addLog('success', `HPO selesai: ${result.totalProcessed} data diproses`, result.totalProcessed)
      return result
    } catch (err) {
      addLog('error', `HPO gagal: ${err.message}`)
      return { totalProcessed: 0, error: err.message }
    }
  }

  async function syncHdo({ silent = false } = {}) {
    syncStep.value = 'hdo'
    if (!silent) addLog('info', 'Sinkronisasi HDO dimulai...')
    try {
      const result = await callPagedSync('sync-accurate-dos', { silent })
      addLog('success', `HDO selesai: ${result.totalProcessed} data diproses`, result.totalProcessed)
      return result
    } catch (err) {
      addLog('error', `HDO gagal: ${err.message}`)
      return { totalProcessed: 0, error: err.message }
    }
  }

  async function syncAll({ silent = false } = {}) {
    if (isSyncing.value) return
    isSyncing.value = true
    syncProgress.value = 0
    if (!silent) {
      syncLog.value = []
      addLog('info', 'Memulai sinkronisasi semua data Accurate...')
    }
    try {
      // 1. HRI first — updates logistics status immediately
      syncProgress.value = 5
      await syncHri({ silent })
      syncProgress.value = 40

      // 2. HPO
      await syncHpo({ silent })
      syncProgress.value = 72

      // 3. HDO
      await syncHdo({ silent })
      syncProgress.value = 100

      lastSyncTime.value = Date.now()
      localStorage.setItem('accurate_last_sync', lastSyncTime.value.toString())
      syncStep.value = 'done'
      if (!silent) addLog('success', 'Semua sinkronisasi selesai! ✓')
    } catch (err) {
      addLog('error', `Sync gagal: ${err.message}`)
    } finally {
      isSyncing.value = false
      setTimeout(() => { syncStep.value = 'idle'; syncProgress.value = 0 }, 4000)
    }
  }

  // Silent background sync — only HRI, called on app open
  async function triggerBackgroundSync() {
    if (isSyncing.value) return
    if (!shouldAutoSync.value) {
      console.log('[AccurateSync] Skipped — synced recently')
      return
    }
    console.log('[AccurateSync] Starting background HRI sync...')
    isSyncing.value = true
    syncStep.value = 'hri'
    try {
      await callPagedSync('sync-accurate-receive-items', { silent: true })
      lastSyncTime.value = Date.now()
      localStorage.setItem('accurate_last_sync', lastSyncTime.value.toString())
      addLog('success', 'Background sync HRI selesai ✓')
      console.log('[AccurateSync] Background sync done')
    } catch (err) {
      console.warn('[AccurateSync] Background sync failed:', err.message)
    } finally {
      isSyncing.value = false
      syncStep.value = 'idle'
    }
  }

  return {
    isSyncing,
    syncStep,
    syncProgress,
    syncLog,
    lastSyncTime,
    lastSyncFormatted,
    minutesSinceLastSync,
    shouldAutoSync,
    syncHri,
    syncHpo,
    syncHdo,
    syncAll,
    triggerBackgroundSync
  }
}
