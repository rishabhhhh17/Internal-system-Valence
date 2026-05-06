import { useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { setUserContext, clearUserContext } from '../lib/sentry.js'

// Returns the current Supabase session and profile derived from a Google sign-in.
export function useAuth() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authUnavailable, setAuthUnavailable] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    let active = true
    let settled = false
    const settle = (sess, unavailable = false) => {
      if (!active || settled) return
      settled = true
      if (unavailable) setAuthUnavailable(true)
      setSession(sess)
      setLoading(false)
    }
    // Bail fast if Supabase is unreachable. supabase-js retries internally for
    // ~30s before giving up; we don't want users staring at a splash that long.
    const timeout = setTimeout(() => settle(null, true), 2500)
    supabase.auth.getSession()
      .then(({ data, error }) => {
        clearTimeout(timeout)
        settle(data?.session || null, Boolean(error))
      })
      .catch(() => {
        clearTimeout(timeout)
        settle(null, true)
      })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (active) {
        setSession(s)
        if (s) setAuthUnavailable(false)
      }
      if (s?.user) {
        const m = s.user.user_metadata || {}
        setUserContext({ email: s.user.email, name: m.full_name || m.name || s.user.email })
      } else {
        clearUserContext()
      }
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  const user = session?.user || null
  const meta = user?.user_metadata || {}
  const profile = user ? {
    name:  meta.full_name || meta.name || user.email,
    email: user.email,
    avatar: meta.avatar_url || meta.picture || null
  } : null

  const googleConnected = Boolean(session?.provider_token)
  const provider = session?.user?.app_metadata?.provider || null

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) return
    const { data } = await supabase.auth.refreshSession()
    setSession(data.session)
  }, [])

  return { session, profile, loading, googleConnected, provider, refresh, authUnavailable }
}
