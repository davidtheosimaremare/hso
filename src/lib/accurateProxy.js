// src/lib/accurateProxy.js
// Client untuk memanggil HSO Accurate Proxy di hso-sync.hokiindo.co.id
// Menggantikan Supabase Edge Functions untuk operasi Accurate Online
// Server VPS di Indonesia → koneksi ke zeus.accurate.id jauh lebih cepat

const PROXY_BASE_URL = import.meta.env.VITE_ACCURATE_SYNC_URL || 'https://hso-sync.hokiindo.co.id'
const PROXY_KEY = import.meta.env.VITE_HSO_PROXY_KEY || ''

/**
 * Wrapper pemanggilan ke HSO Accurate Proxy server
 * Drop-in replacement untuk supabase.functions.invoke()
 *
 * @param {string} endpoint - path tanpa /accurate/ prefix, e.g. 'detail-so'
 * @param {object} body - request body
 * @returns {{ data: object|null, error: string|null }}
 */
export async function callAccurateProxy(endpoint, body = {}) {
  const url = `${PROXY_BASE_URL}/accurate/${endpoint}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(PROXY_KEY ? { 'X-Hso-Proxy-Key': PROXY_KEY } : {}),
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status}: ${res.statusText}` }
    }

    const json = await res.json()
    return { data: json, error: json.s === false ? (json.error || 'Response dari Accurate tidak valid') : null }

  } catch (err) {
    return { data: null, error: err.message }
  }
}

/**
 * Shortcut: ambil detail Sales Order berdasarkan ID
 * Pengganti: supabase.functions.invoke('accurate-detail-so', { body: { id, type } })
 */
export async function getDetailSo(id, type = 'sales-order') {
  return callAccurateProxy('detail-so', { id, type })
}

/**
 * Shortcut: ambil detail Sales Quotation (HSQ) berdasarkan ID atau nomor
 * Dipanggil langsung ke HSO Sync server di hso-sync.hokiindo.co.id
 */
export async function getDetailSq(id) {
  return callAccurateProxy('detail-so', { id, type: 'sales-quotation' })
}

/**
 * Shortcut: ambil list Sales Orders
 * Pengganti: supabase.functions.invoke('accurate-list-so', { body: { fields, limit, sort, filterNumber } })
 */
export async function getListSo(options = {}) {
  return callAccurateProxy('list-so', options)
}

/**
 * Shortcut: ambil list Sales Quotations
 */
export async function getListSq(options = {}) {
  return callAccurateProxy('list-sq', options)
}

/**
 * Shortcut: ambil list Delivery Orders
 */
export async function getListDo(options = {}) {
  return callAccurateProxy('list-do', options)
}

/**
 * Shortcut: ambil list Sales Invoices
 */
export async function getListSi(options = {}) {
  return callAccurateProxy('list-si', options)
}

/**
 * Shortcut: ambil list Purchase Orders
 */
export async function getListPo(options = {}) {
  return callAccurateProxy('list-po', options)
}

/**
 * Shortcut: ambil tracking Sales Orders
 */
export async function getListTrackingSo(options = {}) {
  return callAccurateProxy('list-tracking-so', options)
}

/**
 * Shortcut: ambil usulan nomor HSO urut berikutnya
 */
export async function getNextHsoNumber() {
  return callAccurateProxy('get-next-hso-number', {})
}

/**
 * Shortcut: eksekusi konversi HSB ke HSO (Pecah atau Penuh)
 */
export async function convertHsbToHso(payload) {
  return callAccurateProxy('convert-hsb-to-hso', payload)
}

/**
 * Shortcut: resolve public tracking link (unique_code -> so_id)
 */
export async function resolveTrackingLink(code) {
  return callAccurateProxy('resolve-tracking-link', { code })
}


