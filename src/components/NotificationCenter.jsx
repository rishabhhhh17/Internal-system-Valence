import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow, isToday, isPast, parseISO, startOfDay } from 'date-fns'
import {
  Bell, Briefcase, CalendarDays, CheckSquare, AlertTriangle, FileText,
  BookOpen, ArrowUpRight, RefreshCw, BellOff, Layers, Clock
} from 'lucide-react'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import { staleDeals } from '../lib/insights.js'
import Drawer from './Drawer.jsx'

const LAST_READ_KEY = 'valence.notif.lastRead'

function readLastRead() {
  try {
    const s = localStorage.getItem(LAST_READ_KEY)
    return s ? new Date(s).getTime() : 0
  } catch { return 0 }
}

function writeLastRead() {
  try { localStorage.setItem(LAST_READ_KEY, new Date().toISOString()) } catch {}
}

// Hook: returns { items, unread, refresh, markRead }
// Keep it public so Topbar can show an unread badge without opening the drawer.
export function useNotifications({ live = true } = {}) {
  const [activities, setActivities] = useState([])
  const [tasks,      setTasks]      = useState([])
  const [meetings,   setMeetings]   = useState([])
  const [deals,      setDeals]      = useState([])
  const [activityMap, setActivityMap] = useState({})
  const [lastRead,    setLastRead]  = useState(readLastRead())

  async function refresh() {
    if (!isSupabaseConfigured) return
    const todayIso = new Date().toISOString().slice(0, 10)
    const [a, t, m, d] = await Promise.all([
      supabase.from('activities')
        .select('id, deal_id, kind, body, created_at, deals(client_name)')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('tasks')
        .select('id, title, due_date, completed, deal_id')
        .eq('completed', false)
        .order('due_date', { ascending: true })
        .limit(50),
      supabase.from('meetings')
        .select('id, title, attendee_name, date, time, deal_id')
        .eq('date', todayIso)
        .order('time'),
      supabase.from('deals').select('id, client_name, stage, lead_owner, updated_at, created_at')
    ])
    setActivities(a.data || [])
    setTasks(t.data || [])
    setMeetings(m.data || [])
    setDeals(d.data || [])
    // Build last-activity map for stale-deal computation
    const map = {}
    for (const row of (a.data || [])) {
      if (row.deal_id && !map[row.deal_id]) map[row.deal_id] = row.created_at
    }
    setActivityMap(map)
  }

  useEffect(() => {
    refresh()
    if (!live || !isSupabaseConfigured) return
    const offs = [
      subscribeTable('activities', refresh),
      subscribeTable('tasks',      refresh),
      subscribeTable('meetings',   refresh)
    ]
    return () => offs.forEach(off => off?.())
  }, [live])

  const items = useMemo(() => {
    const out = []
    // Activities → deal events
    for (const a of activities) {
      out.push({
        id:      `act:${a.id}`,
        cat:     'deals',
        ts:      new Date(a.created_at).getTime(),
        icon:    iconForKind(a.kind),
        title:   labelForKind(a.kind),
        body:    `${a.deals?.client_name || 'Deal'} — ${a.body || ''}`,
        to:      a.deal_id ? `/deals?open=${a.deal_id}` : '/deals'
      })
    }
    // Tasks → due today or overdue
    for (const t of tasks) {
      if (!t.due_date) continue
      const due = parseISO(t.due_date)
      const overdue = isPast(due) && !isToday(due)
      const todayTask = isToday(due)
      if (!overdue && !todayTask) continue
      out.push({
        id:       `task:${t.id}`,
        cat:      'tasks',
        ts:       due.getTime(),
        icon:     CheckSquare,
        iconTone: overdue ? 'text-valence-danger bg-valence-danger/10' : 'text-valence-blue bg-valence-blue-soft',
        title:    overdue ? 'Task overdue' : 'Due today',
        body:     t.title,
        to:       t.deal_id ? `/deals?open=${t.deal_id}` : '/planner'
      })
    }
    // Meetings → today's
    for (const m of meetings) {
      out.push({
        id:    `meet:${m.id}`,
        cat:   'meetings',
        ts:    new Date(`${m.date}T${(m.time || '09:00').slice(0,5)}`).getTime(),
        icon:  CalendarDays,
        title: `Meeting · ${(m.time || '').slice(0,5)}`,
        body:  `${m.title || 'Meeting'}${m.attendee_name ? ` · ${m.attendee_name}` : ''}`,
        to:    '/planner'
      })
    }
    // Stale deals → synthesized "attention" item
    const stale = staleDeals(deals, activityMap, 7).slice(0, 5)
    for (const d of stale) {
      out.push({
        id:    `stale:${d.id}`,
        cat:   'deals',
        ts:    Date.now() - d._staleDays * 86400_000,
        icon:  AlertTriangle,
        iconTone: 'text-valence-warning bg-valence-warning/10',
        title: 'Deal going cold',
        body:  `${d.client_name} · ${d.stage} · ${d._staleDays} day${d._staleDays === 1 ? '' : 's'} idle`,
        to:    `/deals?open=${d.id}`
      })
    }
    out.sort((a, b) => b.ts - a.ts)
    return out.slice(0, 40)
  }, [activities, tasks, meetings, deals, activityMap])

  const unread = useMemo(() => items.filter(i => i.ts > lastRead).length, [items, lastRead])

  function markRead() {
    writeLastRead()
    setLastRead(Date.now())
  }

  return { items, unread, refresh, markRead, lastRead }
}

const TABS = [
  { id: 'all',      label: 'All',       cats: ['deals','tasks','meetings'] },
  { id: 'deals',    label: 'Deals',     cats: ['deals'] },
  { id: 'tasks',    label: 'Tasks',     cats: ['tasks'] },
  { id: 'meetings', label: 'Meetings',  cats: ['meetings'] }
]

export default function NotificationCenter({ open, onClose, items, unread, refresh, markRead, lastRead }) {
  const [tab, setTab] = useState('all')
  const navigate = useNavigate()

  // When the drawer opens, don't auto-mark-read — let the user do it explicitly
  // (or auto-mark when they close). That way the badge reflects "since last
  // time you actually engaged", not "since last peek".
  useEffect(() => {
    if (!open) return
    // Prune the tab back to All each open
    setTab('all')
  }, [open])

  const visible = useMemo(() => {
    const cats = TABS.find(t => t.id === tab)?.cats || []
    return items.filter(i => cats.includes(i.cat))
  }, [items, tab])

  function go(item) {
    markRead()
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
            onClick={markRead}
            disabled={unread === 0}
            className="inline-flex items-center gap-1.5 font-semibold text-valence-blue hover:text-valence-blue-hover disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Mark all as read
          </button>
        </div>
      }
    >
      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-valence-border bg-valence-surface p-1 w-fit">
        {TABS.map(t => {
          const count = items.filter(i => t.cats.includes(i.cat)).length
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
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

      {/* List */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-valence-surface ring-1 ring-valence-border">
            <BellOff className="h-5 w-5 text-valence-subtle" />
          </div>
          <h3 className="text-base font-semibold text-valence-text">You're all caught up</h3>
          <p className="mt-1 max-w-xs text-sm text-valence-muted">Nothing new in this view. As the team moves deals and logs activity, it shows up here.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {visible.map(item => {
            const Icon = item.icon
            const isUnread = item.ts > lastRead
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
                  <div className={`grid h-8 w-8 place-items-center rounded-lg shrink-0 ${item.iconTone || 'bg-valence-blue-soft text-valence-blue'}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-valence-text truncate">{item.title}</p>
                      {isUnread && <span className="inline-block h-1.5 w-1.5 rounded-full bg-valence-blue shadow-[0_0_6px_#3399FF] shrink-0" aria-label="unread" />}
                    </div>
                    <p className="mt-0.5 text-xs text-valence-muted truncate">{item.body}</p>
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

function iconForKind(kind) {
  switch (kind) {
    case 'created':       return Briefcase
    case 'stage_change':  return Layers
    case 'note':          return FileText
    case 'nda_signed':    return CheckSquare
    case 'teaser_sent':
    case 'email_drafted': return FileText
    case 'meeting':       return CalendarDays
    case 'file_upload':   return FileText
    case 'contact_added': return Briefcase
    case 'brief_generated': return BookOpen
    default:              return Bell
  }
}

function labelForKind(kind) {
  return {
    created:         'New deal logged',
    stage_change:    'Stage updated',
    note:            'Note added',
    nda_signed:      'NDA signed',
    teaser_sent:     'Teaser sent',
    meeting:         'Meeting logged',
    file_upload:     'File uploaded',
    email_drafted:   'Email drafted',
    contact_added:   'Contact added',
    brief_generated: 'AI brief generated'
  }[kind] || 'Activity'
}
