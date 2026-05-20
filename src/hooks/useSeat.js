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
    try {
      // Pull the active seat for this auth user, joining the org row.
      // RLS allows the user to read their own seat (seats_self_read).
      let { data, error: err } = await supabase
        .from('seats')
        .select('id, org_id, user_id, email, full_name, title, phone, role, active, added_at, billable_from, orgs:org_id ( id, name, plan, cycle_anchor_day )')
        .eq('user_id', userId)
        .eq('active', true)
        .limit(1)
        .maybeSingle()
      if (err) throw err

      // No seat? Give the trusted-domain auto-claim a shot — if the
      // signed-in user's email matches the allow-list (currently
      // @valencegrowth.com), the RPC silently creates a seat in the
      // Valence team and we re-fetch. Returns null for other domains,
      // in which case the caller (App.jsx) routes them to /welcome.
      if (!data) {
        try {
          const { data: claimedOrgId, error: claimErr } = await supabase.rpc('auto_claim_seat_for_domain')
          if (!claimErr && claimedOrgId) {
            // Re-query the seat row we just created so the UI gets the full shape.
            const refetch = await supabase
              .from('seats')
              .select('id, org_id, user_id, email, full_name, title, phone, role, active, added_at, billable_from, orgs:org_id ( id, name, plan, cycle_anchor_day )')
              .eq('user_id', userId)
              .eq('active', true)
              .limit(1)
              .maybeSingle()
            if (refetch.data) data = refetch.data
          }
        } catch {
          // Auto-claim failures are non-fatal — fall through to /welcome.
        }
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
