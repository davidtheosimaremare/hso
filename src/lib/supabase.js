import { createClient } from '@supabase/supabase-js'
import { callAccurateProxy } from './accurateProxy'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Transparent Routing:
// Semua pemanggilan yang berurusan dengan Accurate Online otomatis dialihkan
// ke VPS hso-sync.hokiindo.co.id (Indonesia) untuk respons sub-detik (300ms).
// Supabase Cloud tetap menjadi Single Source of Truth untuk Database PostgreSQL, Auth, dan Realtime.
const originalInvoke = supabase.functions.invoke.bind(supabase.functions)

const ACCURATE_FUNCTIONS = new Set([
  'accurate-detail-so',
  'detail-so',
  'accurate-detail-sq',
  'detail-sq',
  'accurate-list-so',
  'list-so',
  'accurate-list-sq',
  'list-sq',
  'accurate-list-do',
  'list-do',
  'accurate-list-si',
  'list-si',
  'accurate-list-po',
  'list-po',
  'accurate-list-all-po',
  'list-all-po',
  'accurate-list-tracking-so',
  'list-tracking-so',
  'accurate-print-doc',
  'print-doc',
  'accurate-create-hpb',
  'create-hpb',
  'accurate-create-spa',
  'create-spa',
  'get-stock-availability',
  'accurate-sync-hdo',
  'accurate-sync-hpo',
  'sync-accurate-dos',
  'sync-accurate-receive-items',
  'sync-accurate-pos',
  'sync-accurate-po-single',
  'sync-accurate-items'
])

supabase.functions.invoke = async function (functionName, options = {}) {
  if (ACCURATE_FUNCTIONS.has(functionName)) {
    const endpoint = functionName.replace(/^accurate-/, '')
    const body = options?.body || {}
    const res = await callAccurateProxy(endpoint, body)
    return { data: res.data, error: res.error ? { message: res.error } : null }
  }
  return originalInvoke(functionName, options)
}
