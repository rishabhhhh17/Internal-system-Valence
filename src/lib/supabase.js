import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      },
      db: { schema: 'public' },
      realtime: { params: { eventsPerSecond: 5 } }
    })
  : null

// Subscribe to a postgres table and re-run `reload()` on any change.
// Returns an unsubscribe function.
export function subscribeTable(table, reload) {
  if (!isSupabaseConfigured) return () => {}
  const ch = supabase
    .channel(`rt:${table}:${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
      reload?.()
    })
    .subscribe()
  return () => { try { supabase.removeChannel(ch) } catch {} }
}

const DEAL_FILES_BUCKET = 'deal-files'
let _bucketStatus = null // 'ok' | 'missing' | 'error' | null

export async function checkDealFilesBucket() {
  if (!isSupabaseConfigured) return 'unconfigured'
  if (_bucketStatus) return _bucketStatus
  try {
    // listBuckets() requires elevated privileges. Instead, try a lightweight
    // list against the bucket itself — succeeds on public buckets, 404s if
    // the bucket is missing.
    const { error } = await supabase.storage.from(DEAL_FILES_BUCKET).list('', { limit: 1 })
    if (error) {
      _bucketStatus = error.message?.toLowerCase().includes('not found') ? 'missing' : 'error'
    } else {
      _bucketStatus = 'ok'
    }
  } catch {
    _bucketStatus = 'error'
  }
  return _bucketStatus
}

export function resetBucketStatus() { _bucketStatus = null }

export function supabaseError() {
  return new Error(
    'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  )
}
