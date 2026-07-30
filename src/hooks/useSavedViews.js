// =============================================================================
// useSavedViews — saved pipeline filter combos (Phase 21)
// =============================================================================
// Read + write hook for public.saved_views. Splits results into:
//   - myViews   : views the current user owns (any visibility)
//   - teamViews : shared views owned by OTHER users in the same org
//
// Filters live in URL params (?stage=…&sector=…) — applyView() writes the
// view's filters to the URL so the existing pipeline page picks them up
// without any new state plumbing.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useAuth } from './useAuth.js'
import { useSeat } from './useSeat.js'

// Filter keys that can hold multiple comma-containing values. URL-encoded
// as repeated `?key=v1&key=v2` instead of `key=v1,v2` so values like
// "Last, First" survive a round-trip without being split mid-name.
const ARRAY_FILTER_KEYS = new Set(['deal_types'])

// Filter keys we serialise to/from URL params. Anything else in the JSONB
// `filters` blob is ignored on apply — keeps URL clean and predictable.
const FILTER_KEYS = ['stage', 'sector', 'deal_types', 'deal_subtype', 'nda_status', 'ma_side', 'lead_owner', 'pipeline_type']

export function useSavedViews() {
  const { session } = useAuth()
  const { org }     = useSeat()    // org.id needed when is_shared so the row routes to the right tenant
  const userId = session?.user?.id || null
  const orgId  = org?.id || null
  const navigate = useNavigate()

  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !userId) { setRows([]); return }
    setLoading(true)
    setError(null)
    try {
      // RLS handles the "own + shared-in-my-org" filter server-side; we
      // just order by updated_at so the sidebar feels fresh.
      const { data, error: err } = await supabase
        .from('saved_views')
        .select('id, user_id, org_id, name, emoji, pipeline_type, filters, sort, visible_columns, is_shared, created_at, updated_at')
        .order('updated_at', { ascending: false })
      if (err) throw err
      setRows(data || [])
    } catch (e) {
      setError(e?.message || 'Could not load views')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { refresh() }, [refresh])

  const { myViews, teamViews } = useMemo(() => {
    const mine = []
    const team = []
    for (const v of rows) {
      if (v.user_id === userId) mine.push(v)
      else if (v.is_shared) team.push(v)
    }
    return { myViews: mine, teamViews: team }
  }, [rows, userId])

  // Save a new view. `filters` is whatever the caller hands us — usually
  // the current URL params. Returns the inserted row (with the generated
  // id) so the caller can navigate or highlight it.
  const saveView = useCallback(async ({ name, emoji = null, pipeline_type = 'all', filters = {}, is_shared = false }) => {
    if (!isSupabaseConfigured || !userId) throw new Error('Sign in to save views')
    const trimmed = String(name || '').trim()
    if (!trimmed) throw new Error('Name required')

    // Hard-fail when the user toggles "Shared with team" but isn't
    // resolved to an org yet (RLS lag immediately after start_team /
    // join_team). Otherwise the server trigger fills org_id as null and
    // the team-share is a silent no-op — they'd see a success toast and
    // nobody would ever see the view. Better to surface the race.
    if (is_shared && !orgId) {
      throw new Error("Couldn't resolve your firm yet — try again in a moment, or save it private for now.")
    }

    // Whitelist filter keys so we don't accidentally persist transient
    // UI flags (e.g. ?open=… or ?tab=…) as part of the view.
    const cleaned = {}
    for (const k of FILTER_KEYS) {
      if (filters[k] !== undefined && filters[k] !== null && filters[k] !== '') cleaned[k] = filters[k]
    }

    const { data, error: err } = await supabase
      .from('saved_views')
      .insert({
        user_id: userId,
        org_id:  orgId,   // explicit; the server trigger falls back to current_user_org_id() if null, but pass it directly to dodge the RLS-cache race
        name: trimmed,
        emoji,
        pipeline_type,
        filters: cleaned,
        is_shared
      })
      .select()
      .single()
    if (err) throw err
    await refresh()
    return data
  }, [userId, orgId, refresh])

  const updateView = useCallback(async (id, patch) => {
    if (!isSupabaseConfigured) return
    const { error: err } = await supabase
      .from('saved_views')
      .update(patch)
      .eq('id', id)
    if (err) throw err
    await refresh()
  }, [refresh])

  const deleteView = useCallback(async (id) => {
    if (!isSupabaseConfigured) return
    const { error: err } = await supabase.from('saved_views').delete().eq('id', id)
    if (err) throw err
    setRows(prev => prev.filter(r => r.id !== id))
  }, [])

  // Apply a view by writing its filters to the URL on the pipeline page.
  // Caller usually wraps this so they can also navigate to /deals if the
  // user clicked from somewhere else.
  const applyView = useCallback((view, { route = '/deals' } = {}) => {
    if (!view) return
    const params = new URLSearchParams()
    const f = view.filters || {}
    for (const k of FILTER_KEYS) {
      const v = f[k]
      if (v === undefined || v === null || v === '') continue
      // Multi-value filters serialise as repeated ?k=v1&k=v2 so values
      // containing commas (e.g. "Last, First") survive a round-trip
      // without being mangled by .join(',') + .split(',').
      if (Array.isArray(v)) v.forEach(item => { if (item !== '' && item != null) params.append(k, String(item)) })
      else                  params.set(k, String(v))
    }
    const qs = params.toString()
    navigate(qs ? `${route}?${qs}` : route)
  }, [navigate])

  return { myViews, teamViews, loading, error, refresh, saveView, updateView, deleteView, applyView }
}

// Helper: read the current URL params as a filters object. Useful for
// "Save current filters as a view" buttons that don't want to plumb
// state through their component tree.
export function filtersFromUrl(searchParams) {
  const out = {}
  for (const k of FILTER_KEYS) {
    if (ARRAY_FILTER_KEYS.has(k)) {
      // Read all repeated values for this key. Backwards-compat: if a
      // legacy view still serialised as comma-joined, fall back to
      // splitting the single value.
      const all = searchParams.getAll(k).filter(Boolean)
      if (all.length === 1 && all[0].includes(',')) out[k] = all[0].split(',').filter(Boolean)
      else if (all.length) out[k] = all
    } else {
      const raw = searchParams.get(k)
      if (raw != null && raw !== '') out[k] = raw
    }
  }
  return out
}
