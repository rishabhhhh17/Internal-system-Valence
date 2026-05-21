import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, differenceInCalendarDays, differenceInDays, startOfToday, addDays } from 'date-fns'
import {
  Sparkles, Briefcase, Handshake, MessageSquare, Pencil, Calendar,
  AlertTriangle, Clock, ArrowUpRight, ChevronDown, ChevronUp
} from 'lucide-react'
import MeetingPrepCard from '../components/MeetingPrepCard.jsx'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.js'
import { stageMeta } from '../lib/stages.js'
import { listTodayEvents, GoogleAuthExpired } from '../lib/google.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import WikilinkTextarea from '../components/WikilinkTextarea.jsx'
import WikilinkText from '../components/WikilinkText.jsx'
import StaleRelationships from '../components/StaleRelationships.jsx'
import ExtensionStatus from '../components/ExtensionStatus.jsx'

// The Daily Note replaces the previous Overview page. One row per (user, date)
// in the daily_notes table. The auto-section is computed every render from
// live data; the freeform body is what the user writes into the day's note.

const STALE_THRESHOLD_DAYS = 7

export default function DailyNote() {
  const { profile, googleConnected } = useAuth()
  const [deals, setDeals]         = useState([])
  const [activities, setActivities] = useState([])
  const [interactions, setInteractions] = useState([])
  const [meetings, setMeetings]   = useState([])
  const [prepMeeting, setPrepMeeting] = useState(null) // meeting object → opens MeetingPrepCard
  const [meetingsSource, setMeetingsSource] = useState('local') // 'local' | 'google'
  const [note, setNote]           = useState(null)         // { id, body }
  const [body, setBody]           = useState('')
  const [saving, setSaving]       = useState(false)
  const [savedAt, setSavedAt]     = useState(0)

  const today    = useMemo(() => startOfToday(), [])
  const dateIso  = format(today, 'yyyy-MM-dd')
  const dateLabel = format(today, 'EEEE, d MMMM yyyy')

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const rawName  = profile?.name || profile?.email || ''
  const firstName = rawName ? rawName.split(/\s|@/)[0] : ''
  const userId   = profile?.id || '00000000-0000-0000-0000-000000000000'  // anon demo fallback

  // Pull everything we need to compute priorities + waiting-on.
  useEffect(() => {
    if (!isSupabaseConfigured) return
    ;(async () => {
      const [d, a, i, m] = await Promise.all([
        supabase.from('deals').select('id, client_name, stage, lead_owner, target_close, expected_close_date, deal_types, deal_subtype, updated_at, created_at, nda_status').order('updated_at', { ascending: false }),
        supabase.from('activities').select('deal_id, kind, created_at').order('created_at', { ascending: false }).limit(2000),
        supabase.from('interactions').select('id, counterparty_name, counterparty_company, follow_up_date, outcome, deal_id, lead_owner').not('follow_up_date', 'is', null).lte('follow_up_date', dateIso),
        supabase.from('meetings').select('id, title, attendee_name, date, time').eq('date', dateIso).order('time')
      ])
      setDeals(d.data || [])
      setActivities(a.data || [])
      setInteractions(i.data || [])
      setMeetings(m.data || [])
      setMeetingsSource('local')
    })()
  }, [dateIso])

  // Prefer Google Calendar when connected — the daily_notes 'meetings' table
  // was always a stub. If Google is wired, swap today's meetings list to the
  // real Calendar events so the partner sees the day they actually have.
  useEffect(() => {
    if (!googleConnected) return
    let cancelled = false
    ;(async () => {
      try {
        const evs = await listTodayEvents()
        if (cancelled) return
        // Translate Google event shape → the local row shape this card renders.
        const mapped = (evs || [])
          .filter(ev => !ev.allDay && ev.start)
          .sort((a, b) => a.start - b.start)
          .map(ev => ({
            id: ev.id,
            title: ev.summary,
            attendee_name: (ev.attendees || []).map(a => a.name || a.email).filter(Boolean).slice(0, 2).join(', '),
            date: dateIso,
            time: `${String(ev.start.getHours()).padStart(2, '0')}:${String(ev.start.getMinutes()).padStart(2, '0')}`
          }))
        setMeetings(mapped)
        setMeetingsSource('google')
      } catch (err) {
        if (err instanceof GoogleAuthExpired) console.warn('Google session expired; keeping local meetings')
        else console.warn('Google calendar fetch failed', err)
      }
    })()
    return () => { cancelled = true }
  }, [googleConnected, dateIso])

  // Upsert today's daily_note row on first load.
  useEffect(() => {
    if (!isSupabaseConfigured) { setNote({ id: 'local', body: '' }); return }
    ;(async () => {
      const existing = await supabase.from('daily_notes').select('*').eq('user_id', userId).eq('date', dateIso).maybeSingle()
      if (existing.data) {
        setNote(existing.data); setBody(existing.data.body || '')
        return
      }
      const inserted = await supabase.from('daily_notes').insert({ user_id: userId, date: dateIso, body: '' }).select().single()
      if (inserted.data) { setNote(inserted.data); setBody('') }
    })()
  }, [userId, dateIso])

  // Debounced auto-save of the body.
  useEffect(() => {
    if (!note) return
    if (body === (note.body || '')) return
    const t = setTimeout(async () => {
      setSaving(true)
      if (isSupabaseConfigured && note.id !== 'local') {
        await supabase.from('daily_notes').update({ body, updated_at: new Date().toISOString() }).eq('id', note.id)
      }
      setNote(prev => ({ ...prev, body }))
      setSaving(false); setSavedAt(Date.now())
    }, 700)
    return () => clearTimeout(t)
  }, [body])

  // Compute the AI-section heuristics. When VITE_GEMINI_API_KEY arrives, swap
  // to a Gemini prompt; the output shape stays the same.
  const auto = useMemo(() => {
    const lastActivity = new Map()
    for (const a of activities) {
      const t = new Date(a.created_at)
      const prev = lastActivity.get(a.deal_id)
      if (!prev || t > prev) lastActivity.set(a.deal_id, t)
    }

    const priorities = []

    // Stale active mandates
    for (const d of deals) {
      if (stageMeta(d.stage).terminal) continue
      const last = lastActivity.get(d.id) || new Date(d.updated_at || d.created_at || today)
      const days = differenceInDays(today, last)
      if (days >= STALE_THRESHOLD_DAYS) {
        priorities.push({
          id: `stale-${d.id}`,
          severity: 'warn',
          message: `${d.client_name} — no activity in ${days} days`,
          detail: `Stage: ${d.stage}. Worth a touch.`,
          to: `/deals?open=${d.id}`
        })
      }
    }

    // Mandates with target close inside 30 days
    const horizon30 = addDays(today, 30)
    for (const d of deals) {
      if (d.stage !== 'Mandate') continue
      const iso = d.expected_close_date || d.target_close
      if (!iso) continue
      const t = parseISO(String(iso).slice(0, 10))
      if (Number.isNaN(t.getTime())) continue
      const days = differenceInCalendarDays(t, today)
      if (days >= 0 && days <= 30) {
        priorities.push({
          id: `closing-${d.id}`,
          severity: 'high',
          message: `${d.client_name} — target close in ${days} day${days === 1 ? '' : 's'}`,
          detail: `Stage: ${d.stage}.`,
          to: `/deals?open=${d.id}`
        })
      }
    }

    // Interactions due today or overdue
    for (const i of interactions) {
      const dueIso = i.follow_up_date ? String(i.follow_up_date).slice(0, 10) : null
      if (!dueIso) continue
      const t = parseISO(dueIso)
      const days = differenceInCalendarDays(today, t)
      const overdue = days > 0
      priorities.push({
        id: `int-${i.id}`,
        severity: overdue ? 'high' : 'warn',
        message: `Follow up · ${i.counterparty_name}${i.counterparty_company ? ' · ' + i.counterparty_company : ''}`,
        detail: overdue ? `${days} day${days === 1 ? '' : 's'} overdue` : 'Due today',
        to: '/interactions'
      })
    }

    const order = { high: 0, warn: 1, info: 2 }
    priorities.sort((a, b) => order[a.severity] - order[b.severity])

    // "Waiting on" — mandates whose NDA is still pending (stub for richer
    // parsing once the KB is in place).
    const waitingOn = deals
      .filter(d => ['Pre-Mandate', 'Mandate'].includes(d.stage) && d.nda_status === 'Pending')
      .map(d => ({ id: d.id, label: `${d.client_name} — NDA still pending` }))

    // No hard cap — the Priorities / Waiting-on cards collapse the list to
    // a small preview by default and let the user expand to see the rest.
    return { priorities, waitingOn }
  }, [deals, activities, interactions, today])

  return (
    <div className="space-y-8">
      <ConfigBanner />

      {/* Greeting + date */}
      <header>
        <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
          <Calendar className="h-3 w-3" /> Daily note
        </p>
        <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
          {firstName ? `${greeting}, ${firstName}.` : `${greeting}.`}
        </h1>
        <p className="mt-2 text-sm text-valence-muted">{dateLabel}</p>
      </header>

      {/* Auto sections — read-only, regenerated every render */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card tour="today-meetings" icon={Calendar} title="Today's meetings" subtitle={meetingsSource === 'google' ? 'From your Google Calendar' : 'From your calendar'}>
          {meetings.length === 0 ? (
            <Empty>No meetings on the board today.</Empty>
          ) : (
            <ul className="divide-y divide-valence-border/60">
              {meetings.slice(0, 5).map(m => (
                <li key={m.id} className="group flex items-start gap-3 py-2">
                  <span className="text-[11px] tabular-nums font-semibold text-valence-blue shrink-0 w-12">
                    {m.time?.slice(0, 5) || '--:--'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-valence-text">{m.title}</p>
                    <p className="truncate text-[11px] text-valence-muted">{m.attendee_name}</p>
                  </div>
                  {/* "Prep" button — opens MeetingPrepCard with persona,
                      recent interactions, open mandates, talking points.
                      Always visible on hover so the partner finds it. */}
                  <button
                    type="button"
                    onClick={() => setPrepMeeting(m)}
                    className="shrink-0 inline-flex items-center gap-1 rounded-full border border-valence-blue/30 bg-valence-blue-soft px-2 py-0.5 text-[10px] font-semibold text-valence-blue opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                    title="60-second prep for this meeting"
                  >
                    <Sparkles className="h-2.5 w-2.5" /> Prep
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          tour="today-priorities"
          icon={Sparkles}
          title="Priorities"
          subtitle="Stale mandates · close-window · overdue follow-ups"
          countBadge={auto.priorities.length}
        >
          {auto.priorities.length === 0 ? (
            <Empty>Inbox zero. Rare day.</Empty>
          ) : (
            <ExpandableList items={auto.priorities} initial={4} kind="priorities">
              {p => (
                <li key={p.id} className="flex items-start gap-3 py-2">
                  <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${SEV_DOT[p.severity]}`} />
                  <div className="min-w-0 flex-1">
                    <Link to={p.to} className="text-sm text-valence-text hover:text-valence-blue">{p.message}</Link>
                    {p.detail && <p className="mt-0.5 text-[11px] text-valence-muted">{p.detail}</p>}
                  </div>
                </li>
              )}
            </ExpandableList>
          )}
        </Card>

        <Card
          icon={Clock}
          title="Waiting on"
          subtitle="Where we're blocked on someone else"
          countBadge={auto.waitingOn.length}
        >
          {auto.waitingOn.length === 0 ? (
            <Empty>Nothing flagged.</Empty>
          ) : (
            <ExpandableList items={auto.waitingOn} initial={3} kind="items">
              {w => (
                <li key={w.id} className="flex items-start gap-3 py-2">
                  <AlertTriangle className="h-3 w-3 mt-1 text-valence-warning shrink-0" />
                  <Link to={`/deals?open=${w.id}`} className="text-sm text-valence-text hover:text-valence-blue">{w.label}</Link>
                </li>
              )}
            </ExpandableList>
          )}
        </Card>

        <Card icon={ArrowUpRight} title="Quick actions" subtitle="Log fast, write later">
          <div className="grid grid-cols-2 gap-2">
            <ActionLink to="/interactions" icon={MessageSquare} label="Log interaction" />
            <ActionLink to="/deals" icon={Briefcase} label="Open Deal Logger" />
            <ActionLink to="/mandates" icon={Handshake} label="Live Mandates" />
            <ActionLink to="/planner" icon={Calendar} label="Day Planner" />
          </div>
        </Card>

        <StaleRelationships />

        <ExtensionStatus />
      </section>

      {/* Free-form body */}
      <section data-tour="today-body" className="vl-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Pencil className="h-3 w-3" /> Today, in your own words</p>
          <span className="text-[11px] text-valence-subtle">
            {saving ? 'Saving…' : savedAt ? `Saved ${format(new Date(savedAt), 'HH:mm:ss')}` : ''}
          </span>
        </div>
        <WikilinkTextarea
          value={body}
          onChange={setBody}
          placeholder={"What happened? What's on your mind? Type [[ to link a person, fund, or mandate."}
          className="vl-input min-h-[280px] leading-relaxed bg-valence-elevated"
        />
        <p className="text-[11px] text-valence-subtle">
          Auto-saves as you type. The day's note is keyed to {dateIso}; opening tomorrow creates a new one.
        </p>
      </section>

      {/* Meeting prep modal — opens when a partner clicks "Prep" on a row
          above. Pulls persona / interactions / mandates / talking points. */}
      {prepMeeting && (
        <MeetingPrepCard meeting={prepMeeting} onClose={() => setPrepMeeting(null)} />
      )}
    </div>
  )
}

const SEV_DOT = {
  high: 'bg-valence-danger',
  warn: 'bg-valence-warning',
  info: 'bg-valence-blue'
}

function Card({ icon: Icon, title, subtitle, children, tour, countBadge }) {
  return (
    <section data-tour={tour} className="vl-card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Icon className="h-3 w-3" /> {title}</p>
          {subtitle && <p className="mt-0.5 text-[11px] text-valence-muted">{subtitle}</p>}
        </div>
        {typeof countBadge === 'number' && countBadge > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-valence-blue-soft px-2 py-0.5 text-[10px] font-semibold tabular-nums text-valence-blue shrink-0">
            {countBadge}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

// Collapsed-by-default list that reveals the remainder behind a "Show all"
// toggle. Caller supplies a render function for each item — we keep the
// container <ul> + divider styling consistent across the Today cards.
//
//   <ExpandableList items={priorities} initial={4} kind="priorities">
//     {item => <li key={item.id}>…</li>}
//   </ExpandableList>
function ExpandableList({ items, initial = 4, kind = 'items', children }) {
  const [expanded, setExpanded] = useState(false)
  const hasOverflow = items.length > initial
  const visible = expanded ? items : items.slice(0, initial)
  return (
    <>
      <ul className="divide-y divide-valence-border/60">
        {visible.map(children)}
      </ul>
      {hasOverflow && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-valence-blue hover:text-valence-blue/80 transition"
        >
          {expanded
            ? <>Show less <ChevronUp className="h-3 w-3" /></>
            : <>Show all {items.length} {kind} <ChevronDown className="h-3 w-3" /></>}
        </button>
      )}
    </>
  )
}

function Empty({ children }) {
  return (
    <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-4 py-5 text-center">
      <p className="text-sm text-valence-muted">{children}</p>
    </div>
  )
}

function ActionLink({ to, icon: Icon, label }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-2 rounded-lg border border-valence-border bg-valence-elevated px-3 py-2 text-xs font-semibold text-valence-text hover:border-valence-blue/40 hover:bg-valence-blue-soft/40 transition"
    >
      <Icon className="h-3.5 w-3.5 text-valence-blue" /> {label}
      <ArrowUpRight className="h-3 w-3 ml-auto text-valence-subtle group-hover:text-valence-blue transition" />
    </Link>
  )
}
