import { useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { setUserContext, clearUserContext } from '../lib/sentry.js'
import { rememberGoogleTokens, hasGoogleConnection } from '../lib/google.js'

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
      // Stash the Google provider token before React state drops it — this
      // is often the only moment it's available (right off the OAuth callback).
      rememberGoogleTokens(sess)
      setSession(sess)
      setLoading(false)
    }
    // Detect an in-progress OAuth callback. Right after Google redirects
    // back, the URL has `#access_token=…` (implicit) or `?code=…`
    // (PKCE). supabase-js needs to parse this and exchange it for a real
    // session — this is the SLOWEST moment of the entire auth flow on a
    // bad network. Bailing here was producing the user-reported
    // "sign-in screen twice, no Welcome" bug: the timeout fired,
    // authUnavailable flipped on, App.jsx skipped the auth gate
    // entirely and dumped the user into the broken main app.
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    const search = typeof window !== 'undefined' ? window.location.search : ''
    const isOAuthCallback = /access_token=|provider_token=/.test(hash) || /(\?|&)code=/.test(search)

    // Timeout strategy:
    //   - OAuth callback in progress → 15s (parsing + token exchange + remote round-trip)
    //   - Cold cache, no callback   → 8s (real-world LTE on a flaky day)
    // Old value of 2.5s was way too aggressive — it fired on perfectly
    // healthy networks just because Supabase took a beat to respond.
    const timeoutMs = isOAuthCallback ? 15000 : 8000
    const timeout = setTimeout(() => settle(null, true), timeoutMs)
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
        // Capture provider tokens whenever they ride in on a session (the
        // SIGNED_IN event carries them; later TOKEN_REFRESHED events don't,
        // and rememberGoogleTokens no-ops on those so the stash survives).
        rememberGoogleTokens(s)
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

  // Survives reloads + TOKEN_REFRESHED by falling back to the stashed token,
  // not just the (often-stripped) in-session provider_token.
  const googleConnected = hasGoogleConnection(session)
  const provider = session?.user?.app_metadata?.provider || null

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) return
    const { data } = await supabase.auth.refreshSession()
    setSession(data.session)
  }, [])

  return { session, profile, loading, googleConnected, provider, refresh, authUnavailable }
}
