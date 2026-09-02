// src/composables/useAccurateSync.js
// Composable for triggering fast Delta Sync & scheduled sync from HSO to Sync Engine Server

import { ref, computed } from 'vue'

// Global sync state (shared across all component instances)
const isSyncing = ref(false)
const syncStep = ref('idle') // 'idle' | 'hpo' | 'hri' | 'hdo' | 'delta' | 'done'
const syncProgress = ref(0)
const syncLog = ref([]) // [{ type, message, count, timestamp }]
const lastSyncTime = ref(
  localStorage.getItem('accurate_last_sync')
    ? parseInt(localStorage.getItem('accurate_last_sync'), 10)
    : null
)

const SYNC_THROTTLE_MINUTES = 10
const syncServerUrl = import.meta.env.VITE_ACCURATE_SYNC_URL || 'http://localhost:3005'

function addLog(type, message, count = null) {
  syncLog.value.unshift({ type, message, count, timestamp: new Date() })
  if (syncLog.value.length > 30) syncLog.value.pop()
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

  /**
   * Sync Delta (Cepat, data perubahan hari ini)
   */
  async function syncAll({ silent = false } = {}) {
    if (isSyncing.value) return
    isSyncing.value = true
    syncStep.value = 'delta'
    syncProgress.value = 15

    if (!silent) {
      addLog('info', 'Memulai Delta Sync (perubahan hari ini)...')
    }

    try {
      syncProgress.value = 40
      const res = await fetch(`${syncServerUrl}/sync/delta`)
      
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 150)}`)
      }

      const result = await res.json()
      syncProgress.value = 100

      if (result.success) {
        const shipmentsMsg = result.shipmentsUpdated > 0 ? `, ${result.shipmentsUpdated} status logistik terupdate` : ''
        const logMsg = `Delta Sync selesai (${result.processed} dokumen${shipmentsMsg}, ${result.durationMs}ms) ✓`
        addLog('success', logMsg, result.processed)
      } else {
        addLog('error', `Sync gagal: ${result.error || 'Terjadi kesalahan'}`)
      }

      lastSyncTime.value = Date.now()
      localStorage.setItem('accurate_last_sync', lastSyncTime.value.toString())
      syncStep.value = 'done'
      return result
    } catch (err) {
      console.warn('[AccurateSync] Delta sync error:', err.message)
      addLog('error', `Gagal terhubung ke Sync Server: ${err.message}`)
      return { success: false, error: err.message }
    } finally {
      isSyncing.value = false
      setTimeout(() => {
        syncStep.value = 'idle'
        syncProgress.value = 0
      }, 3500)
    }
  }

  /**
   * Sync HRI Saja (Penerimaan Barang)
   */
  async function syncHri({ silent = false, days = 7 } = {}) {
    if (isSyncing.value) return
    isSyncing.value = true
    syncStep.value = 'hri'
    syncProgress.value = 20

    if (!silent) addLog('info', `Sync HRI (${days} hari terakhir)...`)

    try {
      syncProgress.value = 50
      const res = await fetch(`${syncServerUrl}/sync/hri?days=${days}`)
      const result = await res.json()
      syncProgress.value = 100

      if (result.success) {
        const shipMsg = (result.shipmentsUpdated || 0) > 0 ? `, ${result.shipmentsUpdated} shipments terupdate` : ''
        addLog('success', `HRI selesai: ${result.processed || 0} dokumen${shipMsg} (${result.durationMs}ms) ✓`, result.processed)
      } else {
        addLog('error', `HRI gagal: ${result.error}`)
      }

      lastSyncTime.value = Date.now()
      localStorage.setItem('accurate_last_sync', lastSyncTime.value.toString())
      syncStep.value = 'done'
      return result
    } catch (err) {
      addLog('error', `HRI error: ${err.message}`)
      return { success: false, error: err.message }
    } finally {
      isSyncing.value = false
      setTimeout(() => { syncStep.value = 'idle'; syncProgress.value = 0 }, 3000)
    }
  }

  /**
   * Sync HPO Saja (Purchase Order)
   */
  async function syncHpo({ silent = false, days = 7 } = {}) {
    if (isSyncing.value) return
    isSyncing.value = true
    syncStep.value = 'hpo'
    syncProgress.value = 20

    if (!silent) addLog('info', `Sync HPO (${days} hari terakhir)...`)

    try {
      syncProgress.value = 50
      const res = await fetch(`${syncServerUrl}/sync/hpo?days=${days}`)
      const result = await res.json()
      syncProgress.value = 100

      if (result.success) {
        addLog('success', `HPO selesai: ${result.processed || 0} dokumen (${result.durationMs}ms) ✓`, result.processed)
      } else {
        addLog('error', `HPO gagal: ${result.error}`)
      }

      lastSyncTime.value = Date.now()
      localStorage.setItem('accurate_last_sync', lastSyncTime.value.toString())
      syncStep.value = 'done'
      return result
    } catch (err) {
      addLog('error', `HPO error: ${err.message}`)
      return { success: false, error: err.message }
    } finally {
      isSyncing.value = false
      setTimeout(() => { syncStep.value = 'idle'; syncProgress.value = 0 }, 3000)
    }
  }

  /**
   * Sync HDO Saja (Surat Jalan)
   */
  async function syncHdo({ silent = false, days = 7 } = {}) {
    if (isSyncing.value) return
    isSyncing.value = true
    syncStep.value = 'hdo'
    syncProgress.value = 20

    if (!silent) addLog('info', `Sync HDO (${days} hari terakhir)...`)

    try {
      syncProgress.value = 50
      const res = await fetch(`${syncServerUrl}/sync/hdo?days=${days}`)
      const result = await res.json()
      syncProgress.value = 100

      if (result.success) {
        addLog('success', `HDO selesai: ${result.processed || 0} dokumen (${result.durationMs}ms) ✓`, result.processed)
      } else {
        addLog('error', `HDO gagal: ${result.error}`)
      }

      lastSyncTime.value = Date.now()
      localStorage.setItem('accurate_last_sync', lastSyncTime.value.toString())
      syncStep.value = 'done'
      return result
    } catch (err) {
      addLog('error', `HDO error: ${err.message}`)
      return { success: false, error: err.message }
    } finally {
      isSyncing.value = false
      setTimeout(() => { syncStep.value = 'idle'; syncProgress.value = 0 }, 3000)
    }
  }

  /**
   * Background silent sync — dipanggil saat HSO baru dibuka
   */
  async function triggerBackgroundSync() {
    if (isSyncing.value || !shouldAutoSync.value) return
    console.log('[AccurateSync] Auto Delta Sync triggered in background...')
    await syncAll({ silent: true })
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
