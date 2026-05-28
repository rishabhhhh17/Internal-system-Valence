// useSeat — resolves the currently signed-in user's seat row + the org
// that seat belongs to. Drives the auth-gate redirect logic in App.jsx:
//
//   no session         → Login screen
//   session, no seat   → Welcome screen (start a team / join a team)
//   session + seat     → normal app
//
// Returns { seat, org, loading, refresh, error }.
//   seat — row from public.seats with the new identity columns
//          (full_name, title, phone, role) merged in
//   org  — row from public.orgs (just id + name + plan)
//
// Refresh is exposed so the Welcome → Start team / Join team flow can
// invalidate the cache after the RPC succeeds and the app re-routes.

import { useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useAuth } from './useAuth.js'

export function useSeat() {
  const { session, loading: authLoading } = useAuth()
  const [seat, setSeat]   = useState(null)
  const [org, setOrg]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const userId = session?.user?.id || null

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !userId) {
      setSeat(null); setOrg(null); setLoading(false); return
    }
    setLoading(true); setError(null)

    // The query we run multiple times: own row from seats, joined to orgs.
    // Wrapped in a fn because we may retry once after RLS cache lag.
    const seatQuery = () => supabase
      .from('seats')
      .select('id, org_id, user_id, email, full_name, title, phone, role, active, added_at, billable_from, profile_completed_at, orgs:org_id ( id, name, plan, cycle_anchor_day )')
      .eq('user_id', userId)
      .eq('active', true)
      .limit(1)
      .maybeSingle()

    try {
      // First attempt.
      let { data, error: err } = await seatQuery()
      if (err) throw err

      // No seat yet? Try the trusted-domain auto-claim — RPC creates a
      // seat for @valencegrowth.com emails. Returns null for other
      // domains; caller (App.jsx) routes those users to /welcome.
      if (!data) {
        try {
          const { data: claimedOrgId, error: claimErr } = await supabase.rpc('auto_claim_seat_for_domain')
          if (!claimErr && claimedOrgId) {
            // Auto-claim just inserted a row; re-fetch the full shape.
            const refetch = await seatQuery()
            if (refetch.data) data = refetch.data
          }
        } catch {
          // Auto-claim failures are non-fatal.
        }
      }

      // ── RLS cache lag retry ────────────────────────────────────────
      // Supabase's PostgREST caches RLS policy evaluation for ~1s. When
      // the caller is `refresh()` immediately after start_team /
      // join_team / auto_claim succeeded, the JUST-inserted row may
      // still be invisible to the cached evaluator. One delayed retry
      // catches the common case without spamming the API. Skip when
      // we already have data — only retry on the null path.
      if (!data) {
        await new Promise(r => setTimeout(r, 500))
        const retry = await seatQuery()
        if (!retry.error && retry.data) data = retry.data
      }

      if (!data) {
        setSeat(null); setOrg(null)
      } else {
        const { orgs, ...rest } = data
        setSeat(rest)
        setOrg(orgs || null)
      }
    } catch (e) {
      setError(e?.message || 'Failed to load seat')
      setSeat(null); setOrg(null)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (authLoading) return
    load()
  }, [authLoading, userId, load])

  return {
    seat,
    org,
    loading: authLoading || loading,
    refresh: load,
    error,
    hasSeat: Boolean(seat)
  }
}
