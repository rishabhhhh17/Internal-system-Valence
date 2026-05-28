// =============================================================================
// /notifications — Full-page notifications feed (Phase 20)
// =============================================================================
// The topbar drawer shows the last 40 notifications. This page is the
// "see all" destination from the drawer footer. Filter tabs + infinite
// scroll + paginated DB fetch.
//
// Reuses the type maps from src/lib/notifications.js so icons + labels
// stay consistent with the drawer. Mark-as-read happens on row click
// (same as drawer) plus a "Mark all read" button at the top.
// =============================================================================

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ArrowUpRight, BellOff, Clock, RefreshCw } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.js'
import { iconForType, labelForType, catForType } from '../lib/notifications.js'

const PAGE_SIZE = 20

const TABS = [
  { id: 'all',       label: 'All',       types: null },
  { id: 'unread',    label: 'Unread',    types: null, onlyUnread: true },
  { id: 'mentions',  label: 'Mentions',  types: ['mention'] },
  { id: 'tasks',     label: 'Tasks',     types: ['task_assigned'] },
  { id: 'deals',     label: 'Deals',     types: ['stage_change', 'new_deal', 'document_uploaded'] },
  { id: 'documents', label: 'Documents', types: ['document_uploaded'] },
  { id: 'reminders', label: 'Reminders', types: ['reminder_due'] }
]

export default function NotificationsPage() {
  const { session } = useAuth()
  const userId = session?.user?.id || null
  const navigate = useNavigate()

  const [tab, setTab]           = useState('all')
  const [rows, setRows]         = useState([])
  const [page, setPage]         = useState(0)
  const [hasMore, setHasMore]   = useState(true)
  const [isLoading, setLoading] = useState(false)
  const sentinelRef = useRef(null)
  // fetchToken increments on tab change. Any in-flight fetch checks the
  // token before applying its result and bails if stale — kills the
  // duplicate-fetch + race-condition pattern the IntersectionObserver
  // hits when tab+page change in the same render.
  const fetchTokenRef = useRef(0)

  const tabCfg = useMemo(() => TABS.find(t => t.id === tab) || TABS[0], [tab])

  // Build the query once per (tab, page) tuple. Server-side filtering on
  // type[] and is_read because pulling everything and trimming client-side
  // ruins the point of pagination on a big notifications history.
  const fetchPage = useCallback(async (pageIndex, append) => {
    if (!isSupabaseConfigured || !userId) return
    const myToken = ++fetchTokenRef.current
    setLoading(true)
    try {
      let q = supabase
        .from('notifications')
        .select('id, type, title, body, actor_id, deal_id, link, is_read, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE - 1)
      if (tabCfg.types) q = q.in('type', tabCfg.types)
      if (tabCfg.onlyUnread) q = q.eq('is_read', false)
      const { data } = await q
      // Abandon stale fetch — a newer one already started.
      if (myToken !== fetchTokenRef.current) return
      const next = data || []
      setHasMore(next.length === PAGE_SIZE)
      setRows(prev => append ? [...prev, ...next] : next)
    } finally {
      if (myToken === fetchTokenRef.current) setLoading(false)
    }
  }, [userId, tabCfg.types, tabCfg.onlyUnread])

  // Tab change → reset & fetch from page 0.
  useEffect(() => {
    setRows([])
    setPage(0)
    setHasMore(true)
    fetchPage(0, false)
  }, [fetchPage])

  // IntersectionObserver pagination. Triggers when the sentinel scrolls
  // into view; loads the next page if hasMore + not currently loading.
  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting) && hasMore && !isLoading) {
        const next = page + 1
        setPage(next)
        fetchPage(next, true)
      }
    }, { rootMargin: '300px' })
    io.observe(node)
    return () => io.disconnect()
  }, [page, hasMore, isLoading, fetchPage])

  async function markOne(id) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, is_read: true } : r))
    if (!isSupabaseConfigured) return
    try { await supabase.from('notifications').update({ is_read: true }).eq('id', id) }
    catch { /* reconcile on next refresh */ }
  }

  async function markAll() {
    const ids = rows.filter(r => !r.is_read).map(r => r.id)
    if (ids.length === 0) return
    setRows(prev => prev.map(r => r.is_read ? r : { ...r, is_read: true }))
    if (!isSupabaseConfigured) return
    try { await supabase.from('notifications').update({ is_read: true }).in('id', ids) }
    catch { /* swallow */ }
  }

  function go(row) {
    markOne(row.id)
    if (row.link) navigate(row.link)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-10">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="vl-eyebrow-ink">Inbox</p>
          <h1 className="font-display text-3xl font-bold text-valence-text mt-2">Notifications</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRows([]); setPage(0); setHasMore(true); fetchPage(0, false) }}
            className="vl-btn-ghost text-xs"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
          <button onClick={markAll} className="vl-btn-ghost text-xs">Mark all read</button>
        </div>
      </header>

      {/* Filter tabs */}
      <div className="mb-6 flex items-center gap-1 rounded-lg border border-valence-border bg-valence-surface p-1 w-fit overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
              tab === t.id ? 'bg-valence-elevated text-valence-text shadow-sm' : 'text-valence-muted hover:text-valence-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {rows.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-valence-surface ring-1 ring-valence-border">
            <BellOff className="h-5 w-5 text-valence-subtle" />
          </div>
          <h3 className="text-base font-semibold text-valence-text">Nothing here</h3>
          <p className="mt-1 max-w-sm text-sm text-valence-muted">
            Nothing in this view yet. Mandates moving stages, mentions, task assignments, file uploads, and reminders all land here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(r => {
            const Icon = iconForType(r.type)
            const isUnread = !r.is_read
            const when = formatDistanceToNow(new Date(r.created_at), { addSuffix: true })
            return (
              <li key={r.id}>
                <button
                  onClick={() => go(r)}
                  className={`group flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition ${
                    isUnread
                      ? 'border-valence-blue/30 bg-valence-blue-soft/40 hover:bg-valence-blue-soft/60'
                      : 'border-valence-border bg-valence-elevated hover:bg-valence-surface'
                  }`}
                >
                  <div className="grid h-8 w-8 place-items-center rounded-lg shrink-0 bg-valence-blue-soft text-valence-blue">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-valence-text truncate">{r.title}</p>
                      {isUnread && <span className="inline-block h-1.5 w-1.5 rounded-full bg-valence-blue shrink-0" aria-label="unread" />}
                    </div>
                    {r.body && <p className="mt-0.5 text-xs text-valence-muted line-clamp-2">{r.body}</p>}
                    <p className="mt-1 inline-flex items-center gap-2 text-[10px] text-valence-subtle">
                      <span className="inline-flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {when}</span>
                      <span className="text-valence-border">·</span>
                      <span>{labelForType(r.type)}</span>
                    </p>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 mt-1 text-valence-subtle opacity-0 group-hover:opacity-100 transition shrink-0" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Infinite-scroll sentinel */}
      <div ref={sentinelRef} className="h-10 mt-6 flex items-center justify-center text-[11px] text-valence-subtle">
        {isLoading
          ? 'Loading more…'
          : hasMore
            ? '' /* sentinel handles the auto-load; no manual button */
            : rows.length > 0 ? 'No more notifications.' : ''}
      </div>
    </div>
  )
}
