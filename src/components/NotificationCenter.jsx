// =============================================================================
// NotificationCenter — DB-backed in-app notifications (Phase 20)
// =============================================================================
// Was a client-side synthesizer (computed items by querying activities /
// tasks / meetings / deals and storing "last read" timestamp in
// localStorage). Now reads from the real `public.notifications` table:
//
//   - Six trigger types from Postgres triggers + an edge fn cron:
//     mention · task_assigned · stage_change · new_deal · document_uploaded
//     · reminder_due
//   - Realtime: subscribes to INSERT events on `notifications` filtered
//     by user_id so the bell updates the moment a coworker fires one
//   - Mark-read flips `is_read` in the DB (optimistic update). No more
//     localStorage timestamp.
//
// Public API kept exactly the same so Topbar.jsx works unchanged:
//   useNotifications({ live }) → { items, unread, refresh, markRead,
//                                  markAllAsRead, isLoading }
//   <NotificationCenter open onClose items unread refresh markRead
//                       markAllAsRead />
//
// `markRead` historically marked-all; we keep that behaviour for the
// drawer-level "mark all" button. The list rows call `markOne(id)` from
// the hook for per-row mark.

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import {
  Bell, BellOff, ArrowUpRight, RefreshCw, Clock,
  AtSign, CheckSquare, ArrowRight, Plus, FileText
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.js'
import Drawer from './Drawer.jsx'
import { iconForType, labelForType, catForType } from '../lib/notifications.js'

// How many rows to pull on load. The bell only ever shows 40 in the
// dropdown UI; the full-page /notifications route paginates beyond that.
const PAGE_SIZE = 40

// Hook: returns the shape Topbar + the drawer + the /notifications page
// all consume. Same field names as the legacy hook so callers don't
// need to change.
export function useNotifications({ live = true } = {}) {
  const { session } = useAuth()
  const userId = session?.user?.id || null

  const [rows, setRows]         = useState([])      // raw notifications table rows
  const [isLoading, setLoading] = useState(false)

  // Initial fetch + manual refresh.
  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !userId) { setRows([]); return }
    setLoading(true)
    try {
      const { data } = await supabase
        .from('notifications')
        .select('id, user_id, type, title, body, actor_id, deal_id, task_id, reminder_id, kb_note_id, deal_comment_id, deal_file_id, link, is_read, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      setRows(data || [])
    } catch {
      // Silently degrade — the bell just shows zero until the next refresh.
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { refresh() }, [refresh])

  // Realtime: subscribe to INSERT events for THIS user only. The DB
  // filter trims the firehose to one user's notifications at the source,
  // so the client never gets other users' rows over the wire.
  useEffect(() => {
    if (!live || !isSupabaseConfigured || !userId) return
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          // Prepend the new row. Cap the list so the bell doesn't grow
          // unbounded — match the initial fetch limit.
          setRows(prev => [payload.new, ...prev].slice(0, PAGE_SIZE))
        }
      )
      .subscribe()
    return () => { try { supabase.removeChannel(channel) } catch {} }
  }, [userId, live])

  // Shape rows into items the existing Drawer renderer understands.
  const items = useMemo(() => rows.map(r => ({
    id:        r.id,
    type:      r.type,
    cat:       catForType(r.type),
    ts:        new Date(r.created_at).getTime(),
    icon:      iconForType(r.type),
    iconTone:  toneForType(r.type),
    title:     r.title,
    body:      r.body || '',
    to:        r.link,
    is_read:   r.is_read
  })), [rows])

  const unread = useMemo(() => items.filter(i => !i.is_read).length, [items])

  // Mark a single row read. Optimistic: flip local state immediately,
  // then send the update. If the DB rejects we silently revert on the
  // next refresh — the worst case is a momentarily stuck "unread" dot.
  const markOne = useCallback(async (id) => {
    if (!id) return
    setRows(prev => prev.map(r => r.id === id ? { ...r, is_read: true } : r))
    if (!isSupabaseConfigured) return
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    } catch { /* will reconcile on next refresh */ }
  }, [])

  // Mark every unread row read. Bulk update via `in (ids)` so it's a
  // single round-trip. Drawer's "Mark all as read" button hits this.
  const markAllAsRead = useCallback(async () => {
    const unreadIds = rows.filter(r => !r.is_read).map(r => r.id)
    if (unreadIds.length === 0) return
    setRows(prev => prev.map(r => r.is_read ? r : { ...r, is_read: true }))
    if (!isSupabaseConfigured) return
    try {
      await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds)
    } catch { /* reconcile on next refresh */ }
  }, [rows])

  // Backwards-compat: the legacy hook exposed `markRead` to mean
  // "mark all". Keep that alias so Topbar.jsx doesn't have to change.
  const markRead = markAllAsRead

  return { items, unread, refresh, markRead, markAllAsRead, markOne, isLoading }
}

const TABS = [
  { id: 'all',       label: 'All',       types: null /* all */ },
  { id: 'unread',    label: 'Unread',    types: null, filter: i => !i.is_read },
  { id: 'mentions',  label: 'Mentions',  types: ['mention'] },
  { id: 'tasks',     label: 'Tasks',     types: ['task_assigned'] },
  { id: 'deals',     label: 'Deals',     types: ['stage_change', 'new_deal', 'document_uploaded'] },
  { id: 'reminders', label: 'Reminders', types: ['reminder_due'] }
]

export default function NotificationCenter({ open, onClose, items, unread, refresh, markAllAsRead, markOne }) {
  const [tab, setTab] = useState('all')
  const navigate = useNavigate()

  useEffect(() => { if (open) setTab('all') }, [open])

  const visible = useMemo(() => {
    const t = TABS.find(t => t.id === tab) || TABS[0]
    let out = items
    if (t.types) out = out.filter(i => t.types.includes(i.type))
    if (t.filter) out = out.filter(t.filter)
    return out
  }, [items, tab])

  function go(item) {
    if (markOne) markOne(item.id)
    onClose?.()
    if (item.to) navigate(item.to)
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={unread > 0 ? `Notifications · ${unread} new` : 'Notifications'}
      footer={
        <div className="flex items-center justify-between text-xs">
          <button
            onClick={() => refresh?.()}
            className="inline-flex items-center gap-1.5 text-valence-muted hover:text-valence-text transition"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
          <button
            onClick={() => markAllAsRead?.()}
            disabled={unread === 0}
            className="inline-flex items-center gap-1.5 font-semibold text-valence-blue hover:text-valence-blue-hover disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Mark all as read
          </button>
        </div>
      }
    >
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-valence-border bg-valence-surface p-1 w-fit overflow-x-auto">
        {TABS.map(t => {
          const count = (t.types
            ? items.filter(i => t.types.includes(i.type))
            : (t.filter ? items.filter(t.filter) : items)).length
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                tab === t.id ? 'bg-valence-elevated text-valence-text shadow-sm' : 'text-valence-muted hover:text-valence-text'
              }`}
            >
              {t.label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 py-0 text-[10px] font-semibold ${tab === t.id ? 'bg-valence-blue-soft text-valence-blue' : 'bg-valence-border text-valence-muted'}`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-valence-surface ring-1 ring-valence-border">
            <BellOff className="h-5 w-5 text-valence-subtle" />
          </div>
          <h3 className="text-base font-semibold text-valence-text">You're all caught up</h3>
          <p className="mt-1 max-w-xs text-sm text-valence-muted">Nothing new in this view. As the team moves deals and assigns tasks, it shows up here.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {visible.map(item => {
            const Icon = item.icon
            const isUnread = !item.is_read
            const when = formatDistanceToNow(new Date(item.ts), { addSuffix: true })
            return (
              <li key={item.id}>
                <button
                  onClick={() => go(item)}
                  className={`group flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition ${
                    isUnread
                      ? 'border-valence-blue/30 bg-valence-blue-soft/40 hover:bg-valence-blue-soft/60'
                      : 'border-valence-border bg-valence-elevated hover:bg-valence-surface'
                  }`}
                >
                  <div className={`grid h-8 w-8 place-items-center rounded-lg shrink-0 ${item.iconTone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-valence-text truncate">{item.title}</p>
                      {isUnread && <span className="inline-block h-1.5 w-1.5 rounded-full bg-valence-blue shadow-[0_0_6px_#3399FF] shrink-0" aria-label="unread" />}
                    </div>
                    {item.body && <p className="mt-0.5 text-xs text-valence-muted truncate">{item.body}</p>}
                    <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-valence-subtle">
                      <Clock className="h-2.5 w-2.5" /> {when}
                    </p>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 mt-1 text-valence-subtle opacity-0 group-hover:opacity-100 transition shrink-0" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Drawer>
  )
}

// Soft icon-tone classes per type. Mentions are blue, tasks blue, deals
// neutral, reminders warning-coloured (overdue feeling). Keep these
// inside this file so the renderer doesn't need to import from /lib
// just for a className.
function toneForType(type) {
  switch (type) {
    case 'mention':           return 'bg-valence-blue-soft text-valence-blue'
    case 'task_assigned':     return 'bg-valence-blue-soft text-valence-blue'
    case 'stage_change':      return 'bg-valence-surface text-valence-muted'
    case 'new_deal':          return 'bg-valence-success/10 text-valence-success'
    case 'document_uploaded': return 'bg-valence-surface text-valence-muted'
    case 'reminder_due':      return 'bg-valence-warning/10 text-valence-warning'
    default:                  return 'bg-valence-blue-soft text-valence-blue'
  }
}
