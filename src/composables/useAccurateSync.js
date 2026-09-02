// src/composables/useAccurateSync.js
// Composable for triggering fast Delta Sync from HSO to Sync Engine Server

import { ref, computed } from 'vue'

// Global sync state (shared across all component instances)
const isSyncing = ref(false)
const syncStep = ref('idle') // 'idle' | 'delta' | 'done'
const syncProgress = ref(0)
const syncLog = ref([]) // [{ type, message, count, timestamp }]
const lastSyncTime = ref(
  localStorage.getItem('accurate_last_sync')
    ? parseInt(localStorage.getItem('accurate_last_sync'), 10)
    : null
)

const SYNC_THROTTLE_MINUTES = 10
const syncServerUrl = import.meta.env.VITE_ACCURATE_SYNC_URL || 'https://hso-sync.hokiindo.co.id'

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
  async function syncDelta({ silent = false } = {}) {
    if (isSyncing.value) return
    isSyncing.value = true
    syncStep.value = 'delta'
    syncProgress.value = 20

    if (!silent) {
      addLog('info', 'Memulai Sync Cepat (data perubahan hari ini)...')
    }

    try {
      syncProgress.value = 45
      const res = await fetch(`${syncServerUrl}/sync/delta`)
      
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 150)}`)
      }

      const result = await res.json()
      syncProgress.value = 100

      if (result.success !== false) {
        const shipmentsMsg = (result.shipmentsUpdated && result.shipmentsUpdated > 0) ? `, ${result.shipmentsUpdated} status logistik terupdate` : ''
        const countMsg = result.processed !== undefined ? `${result.processed} dokumen` : (result.message || 'Berhasil disinkronisasi')
        const durationMsg = result.durationMs ? ` (${result.durationMs}ms)` : ''
        const logMsg = `Sync Cepat selesai: ${countMsg}${shipmentsMsg}${durationMsg} ✓`
        addLog('success', logMsg, result.processed)
      } else {
        addLog('error', `Sync gagal: ${result.error || result.message || 'Terjadi kesalahan'}`)
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

  // Alias syncAll to syncDelta for backwards compatibility
  const syncAll = syncDelta

  /**
   * Background silent sync — dipanggil saat HSO baru dibuka jika throttling terpenuhi
   */
  async function triggerBackgroundSync() {
    if (isSyncing.value || !shouldAutoSync.value) return
    console.log('[AccurateSync] Auto Delta Sync triggered in background...')
    await syncDelta({ silent: true })
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
    syncDelta,
    syncAll,
    triggerBackgroundSync
  }
}
