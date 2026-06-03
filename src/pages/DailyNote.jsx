import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, differenceInCalendarDays, differenceInDays, startOfToday, addDays } from 'date-fns'
import {
  Sparkles, Briefcase, Handshake, MessageSquare, Pencil, Calendar,
  AlertTriangle, Clock, ArrowUpRight, ChevronDown, ChevronUp
} from 'lucide-react'
import MeetingPrepCard from '../components/MeetingPrepCard.jsx'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.js'
import { useSeat } from '../hooks/useSeat.js'
import { stageMeta, LIVE_MANDATE_STAGES } from '../lib/stages.js'
import { listTodayEvents, GoogleAuthExpired } from '../lib/google.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import WikilinkTextarea from '../components/WikilinkTextarea.jsx'
import WikilinkText from '../components/WikilinkText.jsx'
import StaleRelationships from '../components/StaleRelationships.jsx'
import ExtensionStatus from '../components/ExtensionStatus.jsx'
import { dotClass as ctyDot, labelFor as ctyLabel, barFillClass as ctyBar } from '../lib/counterpartyColors.js'

// The Daily Note replaces the previous Overview page. One row per (user, date)
// in the daily_notes table. The auto-section is computed every render from
// live data; the freeform body is what the user writes into the day's note.

const STALE_THRESHOLD_DAYS = 7

export default function DailyNote() {
  const { profile, googleConnected } = useAuth()
  // org_id is required on insert by the multi-tenant RLS policy on
  // daily_notes. Without it the insert raised "new row violates
  // row-level security policy" on every page load and Today never
  // hydrated for a fresh seat.
  const { org } = useSeat()
  const [deals, setDeals]         = useState([])
  const [activities, setActivities] = useState([])
  const [interactions, setInteractions] = useState([])
  const [meetings, setMeetings]   = useState([])
  // 'all' | 'founder' | 'investor' | 'general' — drives the Priorities filter row.
  const [priorityFilter, setPriorityFilter] = useState('all')
  // Lightweight peek card for a tapped priority (takeaways + next steps).
  const [peek, setPeek] = useState(null)
  const [prepMeeting, setPrepMeeting] = useState(null) // meeting object → opens MeetingPrepCard
  const [meetingsSource, setMeetingsSource] = useState('local') // 'local' | 'google'
  // When Google API call fails, set an actionable "Reconnect Google" hint
  // on the Today's meetings card so the partner knows the empty state is
  // a session problem, not "I have no meetings". Cleared on next successful
  // listTodayEvents.
  const [googleStaleHint, setGoogleStaleHint] = useState(false)
  const [note, setNote]           = useState(null)         // { id, body }
  const [body, setBody]           = useState('')
  const [saving, setSaving]       = useState(false)
  const [savedAt, setSavedAt]     = useState(0)
  // Loading flicker fix: without this flag, the Today cards render their
  // "Inbox zero. Rare day." / "No meetings on the board today." empty
  // states for ~200-400ms on the initial paint (state defaults to []),
  // then snap to real data as soon as Promise.all settles. The flash
  // looked like the product was empty and then suddenly populated.
  // With `ready`, the cards show a small skeleton until the first
  // fetch has returned.
  const [ready, setReady]         = useState(!isSupabaseConfigured)

  const today    = useMemo(() => startOfToday(), [])
  const dateIso  = format(today, 'yyyy-MM-dd')
  const dateLabel = format(today, 'EEEE, d MMMM yyyy')

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const rawName  = profile?.name || profile?.email || ''
  const firstName = rawName ? rawName.split(/\s|@/)[0] : ''
  const userId   = profile?.id || '00000000-0000-0000-0000-000000000000'  // anon demo fallback

  // Pull everything we need to compute priorities + waiting-on, and keep it
  // LIVE — subscribe to interactions + deals so logging a touch or moving a
  // stage updates the KPI tiles / Pulse / priorities instantly, no refresh.
  useEffect(() => {
    if (!isSupabaseConfigured) return
    let alive = true

    // Core fetch — deals / activities / interactions. Deliberately excludes
    // meetings so a realtime refresh doesn't clobber Google Calendar events
    // (those are owned by the googleConnected effect below).
    async function loadCore() {
      const [d, a, i] = await Promise.all([
        supabase.from('deals').select('id, client_name, stage, lead_owner, target_close, expected_close_date, deal_types, deal_subtype, updated_at, created_at, nda_status').order('updated_at', { ascending: false }),
        supabase.from('activities').select('deal_id, kind, created_at').order('created_at', { ascending: false }).limit(2000),
        supabase.from('interactions')
          .select('id, counterparty_name, counterparty_company, counterparty_type, follow_up_date, outcome, deal_id, lead_owner, occurred_at, created_at, is_complete, context, takeaways, next_steps')
          .order('occurred_at', { ascending: false, nullsFirst: false })
          .limit(5000)
      ])
      if (!alive) return
      setDeals(d.data || [])
      setActivities(a.data || [])
      setInteractions(i.data || [])
      setReady(true)
    }

    // Meetings — fetched once on mount; the Google effect may override.
    async function loadMeetings() {
      const m = await supabase.from('meetings').select('id, title, attendee_name, date, time').eq('date', dateIso).order('time')
      if (!alive) return
      setMeetings(m.data || [])
      setMeetingsSource('local')
    }

    loadCore()
    loadMeetings()

    const offInteractions = subscribeTable('interactions', loadCore)
    const offDeals = subscribeTable('deals', loadCore)
    return () => { alive = false; offInteractions?.(); offDeals?.() }
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
        setGoogleStaleHint(false)
      } catch (err) {
        if (err instanceof GoogleAuthExpired) {
          // Surface this to the user — silent fail makes the empty card
          // read like "you have no meetings" rather than "your session
          // expired, click Reconnect". Empty meetings array left intact
          // so the card still renders the actionable hint below it.
          console.warn('Google session expired; surfacing Reconnect hint')
          setGoogleStaleHint(true)
        } else {
          console.warn('Google calendar fetch failed', err)
        }
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
      // Wait for org_id before inserting — RLS rejects rows whose
      // org_id doesn't match current_user_org_id(). If the user isn't
      // seated yet (still in onboarding) we don't insert; the gate
      // pages handle their own state.
      if (!org?.id) return
      const inserted = await supabase
        .from('daily_notes')
        .insert({ user_id: userId, date: dateIso, body: '', org_id: org.id })
        .select()
        .single()
      if (inserted.data) { setNote(inserted.data); setBody('') }
    })()
  }, [userId, dateIso, org?.id])

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

    // Mandates with target close inside 30 days. Use the same live-stage
    // set as the Live Mandates page (Pre-Mandate + Mandate) so a near-close
    // Pre-Mandate deal isn't silently dropped from Today.
    const horizon30 = addDays(today, 30)
    for (const d of deals) {
      if (!LIVE_MANDATE_STAGES.includes(d.stage)) continue
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

    // Interactions due today or overdue.
    //
    // BUG CONTEXT: same person logged under different spellings —
    //   "Madhvi and Satish Datwani"
    //   "Satish & Madhvi Datwani"
    //   "Madhvi Datwani, Satish Datwani"
    // Three rows, one human. The old grouper used raw `name + company`
    // so each spelling looked like a different person, and the "latest
    // touch" lookup never connected them. Result: a Friday meeting with
    // Madhvi never reset the August deadline, and the dashboard kept
    // showing "283 days overdue" on a re-engaged relationship.
    //
    // FIX: normalize the name into a token-bag (lower, strip
    // and/&/,/punct, dedupe, sort, join) so all three spellings collapse
    // to "datwani madhvi satish". Group by `company|normalizedName` so
    // distinct people at the same company stay separate.
    //
    // SORT: oldest-overdue first — matches the backlog sheet the partner
    // is used to (longest-waiting at the top), not a severity bucket.
    function normalizeName(s) {
      if (!s) return ''
      const tokens = s.toLowerCase()
        .replace(/&/g, ' ')
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t && t !== 'and' && t !== 'the' && t !== 'of')
      return Array.from(new Set(tokens)).sort().join(' ')
    }

    // Build latest-touch map. CRITICAL: only count rows that have a real
    // `occurred_at`. Falling back to `created_at` looked sensible but it
    // means freshly-imported rows (where occurred_at was never set)
    // register as "touched today" — which suppresses every genuine
    // overdue follow-up below them. The Mastersheet import does write
    // occurred_at so this only bites legacy or AI-imported rows, but
    // it's worth being strict.
    const latestByKey = new Map()
    const latestRowByKey = new Map()   // most-recent interaction row per counterparty
    for (const i of interactions) {
      if (!i.occurred_at) continue
      const key = (i.counterparty_company || '').toLowerCase().trim() + '|' + normalizeName(i.counterparty_name)
      const t = new Date(i.occurred_at)
      const prev = latestByKey.get(key)
      if (!prev || t > prev) { latestByKey.set(key, t); latestRowByKey.set(key, i) }
    }
    // Backlog = overdue deadlines that aren't ticked complete. The
    // partner's mental model is deadline-driven and oldest-first, so the
    // displayed number anchors on the DEADLINE (follow_up_date), not on
    // the last touch. One entry per counterparty — the MOST overdue
    // surviving deadline — so a person with several open follow-ups shows
    // their longest-waiting one (the backlog item that actually matters),
    // not whichever row happened to be logged most recently.
    const backlogByKey = new Map()
    for (const i of interactions) {
      const dueIso = i.follow_up_date ? String(i.follow_up_date).slice(0, 10) : null
      if (!dueIso) continue
      // Complete? ticked = explicitly off the backlog.
      if (i.is_complete) continue
      const due  = parseISO(dueIso)
      const dueDays = differenceInCalendarDays(today, due)
      if (dueDays < 0) continue // not yet due

      const key = (i.counterparty_company || '').toLowerCase().trim() + '|' + normalizeName(i.counterparty_name)
      const latest = latestByKey.get(key)
      // Re-engaged: we've spoken to them (any name-variant) AFTER this
      // deadline, so the promise is effectively kept — drop it.
      if (latest && latest > due) continue

      const prev = backlogByKey.get(key)
      // Keep the most overdue (largest dueDays = oldest deadline).
      if (!prev || dueDays > prev.dueDays) backlogByKey.set(key, { row: i, dueDays })
    }
    for (const { row: i, dueDays } of backlogByKey.values()) {
      // The peek card should show the LATEST meeting's notes for this
      // counterparty (what came out of the last conversation), not the
      // overdue-deadline row's — which may predate the most recent touch
      // and be blank. The priority itself still sorts/labels by deadline.
      const pkey = (i.counterparty_company || '').toLowerCase().trim() + '|' + normalizeName(i.counterparty_name)
      const latestRow = latestRowByKey.get(pkey) || i
      priorities.push({
        id: `int-${i.id}`,
        // > 30 days past deadline = high; fresher = warn.
        severity: dueDays > 30 ? 'high' : 'warn',
        message: `Follow up · ${i.counterparty_name}${i.counterparty_company ? ' · ' + i.counterparty_company : ''}`,
        detail: dueDays === 0
          ? 'Due today'
          : `Follow-up due ${dueDays} day${dueDays === 1 ? '' : 's'} ago`,
        cty: i.counterparty_type || null,
        // sortAge drives oldest-first: larger = more overdue = higher.
        sortAge: dueDays,
        // Lightweight peek-card payload — tapping shows takeaways + next
        // steps inline, not the full edit drawer.
        peek: {
          name:    i.counterparty_name,
          company: i.counterparty_company,
          when:    latestRow.occurred_at,
          context: latestRow.context,
          takeaways: latestRow.takeaways,
          next_steps: latestRow.next_steps,
          cty: i.counterparty_type || null
        },
        // Deep-link to the full interaction drawer (used by the card's
        // "Open full interaction" action).
        to: `/interactions?open=${i.id}`
      })
    }

    // Sort: MOST RECENT first (partner's call) — the freshest overdue
    // deadline sits at the top so still-warm follow-ups get acted on,
    // and ancient dead-leads sink to the bottom. Backlog items (with a
    // sortAge = days past deadline) always rank above stale-mandate /
    // close-window items (no sortAge); within the backlog, fewer days
    // overdue = higher.
    const order = { high: 0, warn: 1, info: 2 }
    priorities.sort((a, b) => {
      const aHas = a.sortAge != null
      const bHas = b.sortAge != null
      if (aHas !== bHas) return aHas ? -1 : 1            // backlog before stale/close
      if (aHas && bHas && a.sortAge !== b.sortAge) return a.sortAge - b.sortAge  // recent first
      return order[a.severity] - order[b.severity]
    })

    // Phase 27 — "Waiting on" is no longer computed here. It comes from
    // public.compute_waiting_for_org(), which detects stale follow-ups
    // (interactions with outcome='to_followup' + follow_up_date in the
    // past and no later interaction with the same counterparty). State
    // lives in the `waiting` slice below.

    // No hard cap — the Priorities card collapses the list to a small
    // preview by default and lets the user expand to see the rest.
    return { priorities }
  }, [deals, activities, interactions, today])

  // ─── Waiting On ─────────────────────────────────────────────────────────
  // Pulled from the SQL function compute_waiting_for_org(). Refreshed when
  // interactions change so logging a fresh follow-up clears stale ones.
  const [waiting, setWaiting] = useState([])
  const [waitingBusy, setWaitingBusy] = useState({})  // { [key]: 'snooze' | 'resolve' }
  const orgId = org?.id

  useEffect(() => {
    if (!isSupabaseConfigured || !orgId) return
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.rpc('compute_waiting_for_org', { p_org_id: orgId })
      if (!alive) return
      if (error) { console.warn('waiting rpc failed', error); return }
      setWaiting(data || [])
    })()
    return () => { alive = false }
  }, [orgId, interactions.length])

  async function snoozeWaiting(w, days = 3) {
    const key = waitingKey(w)
    setWaitingBusy(b => ({ ...b, [key]: 'snooze' }))
    try {
      const { error } = await supabase.rpc('waiting_snooze', {
        p_deal_id: w.deal_id,
        p_counterparty_name: w.counterparty_name,
        p_days: days
      })
      if (error) throw error
      setWaiting(prev => prev.filter(r => waitingKey(r) !== key))
    } catch (e) { console.warn('snooze failed', e) }
    finally { setWaitingBusy(b => { const n = { ...b }; delete n[key]; return n }) }
  }

  async function resolveWaiting(w) {
    const key = waitingKey(w)
    setWaitingBusy(b => ({ ...b, [key]: 'resolve' }))
    try {
      const { error } = await supabase.rpc('waiting_resolve', {
        p_deal_id: w.deal_id,
        p_counterparty_name: w.counterparty_name,
        p_note: null
      })
      if (error) throw error
      setWaiting(prev => prev.filter(r => waitingKey(r) !== key))
    } catch (e) { console.warn('resolve failed', e) }
    finally { setWaitingBusy(b => { const n = { ...b }; delete n[key]; return n }) }
  }

  // KPI strip metrics — the "command center" numbers at the top of Today.
  // All computed from the data already in memory; no extra fetch.
  const stats = useMemo(() => {
    const weekAgo = addDays(today, -7)
    const liveMandates = deals.filter(d => LIVE_MANDATE_STAGES.includes(d.stage)).length
    const week = interactions.filter(i => {
      if (!i.occurred_at) return false
      const t = new Date(i.occurred_at)
      return t >= weekAgo && t <= addDays(today, 1)
    })
    const split = { founder: 0, investor: 0, general: 0 }
    for (const i of week) {
      const t = i.counterparty_type
      if (t === 'founder' || t === 'investor' || t === 'general') split[t] += 1
    }
    const overdue = auto.priorities.filter(p => p.sortAge != null).length
    return {
      liveMandates,
      totalMandates: deals.length,
      weekTouches: week.length,
      split,
      splitTotal: split.founder + split.investor + split.general,
      overdue
    }
  }, [deals, interactions, today, auto.priorities])

  // Pulse — a daily "coach" that reads the week and gives ONE opinionated,
  // human nudge tied to the firm's founder/investor-balance thesis. Useful
  // (actionable + a CTA) and a little fun (it has a voice). Pure read of
  // data already in memory.
  const pulse = useMemo(() => {
    const { split, splitTotal, weekTouches, overdue } = stats
    const weekAgo = addDays(today, -7)
    const days = new Set()
    for (const i of interactions) {
      if (!i.occurred_at) continue
      const t = new Date(i.occurred_at)
      if (t >= weekAgo) days.add(format(t, 'yyyy-MM-dd'))
    }
    const activeDays = days.size

    if (overdue >= 6)
      return { tone: 'alert', icon: AlertTriangle, msg: `${overdue} follow-ups are overdue. Clear the oldest first — momentum compounds.`, to: '/interactions', cta: 'Open backlog' }

    if (splitTotal >= 4) {
      const fPct = Math.round((split.founder / splitTotal) * 100)
      const iPct = Math.round((split.investor / splitTotal) * 100)
      if (fPct >= 70)
        return { tone: 'tilt', icon: Briefcase, msg: `You're ${fPct}% founder-side this week. Balance the book — line up a couple of investor touches.`, to: '/funds', cta: 'Find investors' }
      if (iPct >= 70)
        return { tone: 'tilt', icon: Handshake, msg: `${iPct}% investor-side this week. Don't let the founders cool — check in on a live mandate.`, to: '/mandates', cta: 'Live mandates' }
      return { tone: 'good', icon: Sparkles, msg: `Balanced week — ${split.founder} founder, ${split.investor} investor across ${activeDays} active day${activeDays === 1 ? '' : 's'}. Nicely played.` }
    }

    if (weekTouches === 0)
      return { tone: 'quiet', icon: MessageSquare, msg: `No touches logged this week yet. Who's worth a call?`, to: '/people', cta: 'Open People' }
    if (weekTouches < 3)
      return { tone: 'quiet', icon: MessageSquare, msg: `Quiet week so far — ${weekTouches} touch${weekTouches === 1 ? '' : 'es'}. A couple more keeps the book warm.` }
    if (overdue === 0)
      return { tone: 'good', icon: Sparkles, msg: `All caught up — nothing overdue, ${weekTouches} touches this week. Clean book.` }
    return { tone: 'good', icon: Sparkles, msg: `${weekTouches} touches this week, ${overdue} to follow up. Steady hands.` }
  }, [stats, interactions, today])

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

      {/* KPI command-center strip — the numbers that matter at a glance. */}
      {ready && <StatStrip stats={stats} />}

      {/* Pulse — the daily coach nudge. */}
      {ready && <PulseBanner pulse={pulse} />}

      {/* Auto sections — read-only, regenerated every render */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card tour="today-meetings" icon={Calendar} title="Today's meetings" subtitle={meetingsSource === 'google' ? 'From your Google Calendar' : 'From your calendar'}>
          {!ready ? (
            <SkeletonRows count={3} />
          ) : googleStaleHint ? (
            <div className="rounded-lg border border-valence-warning/40 bg-valence-warning/10 px-4 py-3 text-xs leading-relaxed">
              <p className="font-semibold text-valence-text">Google session expired.</p>
              <p className="text-valence-muted mt-0.5">
                Your Calendar scope needs to be re-granted to see today's events.{' '}
                <Link to="/settings?section=integrations" className="text-valence-blue hover:underline font-semibold">Reconnect Google →</Link>
              </p>
            </div>
          ) : meetings.length === 0 ? (
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
          {/* Phase 26 filter row — collapse the list down to one counterparty
              type. Only renders when there are any tagged priorities so it
              doesn't add visual noise to an inbox-zero day. Stale mandates
              and close-window items have no counterparty_type so they only
              show under "All". */}
          {ready && auto.priorities.some(p => p.cty) && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {['all', 'founder', 'investor', 'general'].map(t => {
                const count = t === 'all'
                  ? auto.priorities.length
                  : auto.priorities.filter(p => p.cty === t).length
                const active = priorityFilter === t
                // Hide empty buckets (keep All + whatever's currently
                // selected) so we don't show a clickable chip that leads
                // to a dead "Nothing in this bucket" view.
                if (t !== 'all' && count === 0 && !active) return null
                return (
                  <button
                    key={t}
                    onClick={() => setPriorityFilter(t)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${
                      active
                        ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-blue'
                        : 'border-valence-border bg-valence-surface text-valence-muted hover:text-valence-text'
                    }`}
                  >
                    {t !== 'all' && <span className={`inline-block h-1.5 w-1.5 rounded-full ${ctyDot(t)}`} />}
                    {t === 'all' ? 'All' : ctyLabel(t)}
                    <span className="tabular-nums text-[10px] opacity-70">{count}</span>
                  </button>
                )
              })}
            </div>
          )}
          {!ready ? (
            <SkeletonRows count={4} />
          ) : (() => {
              // Apply the filter — keep all stale-mandate / close-window
              // items only when filter is 'all', since those don't carry a
              // counterparty type.
              const visible = priorityFilter === 'all'
                ? auto.priorities
                : auto.priorities.filter(p => p.cty === priorityFilter)
              if (visible.length === 0) {
                return <Empty>{priorityFilter === 'all' ? 'Inbox zero. Rare day.' : 'Nothing in this bucket.'}</Empty>
              }
              return (
                <ExpandableList items={visible} initial={4} kind="priorities">
                  {p => (
                    <li key={p.id} className="flex items-start gap-3 py-2">
                      <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${SEV_DOT[p.severity]}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {p.cty && <span className={`inline-block h-1.5 w-1.5 rounded-full ${ctyDot(p.cty)}`} title={ctyLabel(p.cty)} />}
                          {/* Tap opens a lightweight peek card (takeaways +
                              next steps) instead of the full edit drawer.
                              Stale-mandate / close-window items have no peek
                              payload — they keep the deep-link. */}
                          {p.peek ? (
                            <button onClick={() => setPeek(p.peek)} className="text-left text-sm text-valence-text hover:text-valence-blue truncate">
                              {p.message}
                            </button>
                          ) : (
                            <Link to={p.to} className="text-sm text-valence-text hover:text-valence-blue truncate">{p.message}</Link>
                          )}
                        </div>
                        {p.detail && <p className="mt-0.5 text-[11px] text-valence-muted">{p.detail}</p>}
                      </div>
                    </li>
                  )}
                </ExpandableList>
              )
            })()}
        </Card>

        <Card
          icon={Clock}
          title="Waiting on"
          subtitle="Where we're blocked on someone else"
          countBadge={waiting.length}
        >
          {!ready ? (
            <SkeletonRows count={3} />
          ) : waiting.length === 0 ? (
            <Empty>Nothing flagged.</Empty>
          ) : (
            <ExpandableList items={waiting} initial={4} kind="items">
              {w => {
                const key  = waitingKey(w)
                const busy = waitingBusy[key]
                const subjectLine = firstLineOf(w.last_subject)
                return (
                  <li key={key} className="group flex items-start gap-3 py-2.5 border-b border-valence-border/40 last:border-b-0">
                    <AlertTriangle className="h-3 w-3 mt-1 text-valence-warning shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <Link
                          to={`/deals?open=${w.deal_id}`}
                          className="text-sm font-medium text-valence-text hover:text-valence-blue"
                        >
                          {w.counterparty_name}
                        </Link>
                        <span className="text-xs text-valence-muted">·</span>
                        <span className="text-xs text-valence-muted">{w.client_name}</span>
                        <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-valence-subtle">
                          {w.days_blocked}d
                        </span>
                      </div>
                      {subjectLine && (
                        <div className="mt-0.5 text-xs text-valence-muted line-clamp-1">{subjectLine}</div>
                      )}
                      <div className="mt-1.5 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => snoozeWaiting(w, 3)}
                          disabled={!!busy}
                          className="text-[10px] font-medium text-valence-muted hover:text-valence-text disabled:opacity-50"
                        >
                          {busy === 'snooze' ? 'Snoozing…' : 'Snooze 3d'}
                        </button>
                        <span className="text-valence-subtle">·</span>
                        <button
                          type="button"
                          onClick={() => resolveWaiting(w)}
                          disabled={!!busy}
                          className="text-[10px] font-medium text-valence-muted hover:text-valence-text disabled:opacity-50"
                        >
                          {busy === 'resolve' ? 'Resolving…' : 'Mark resolved'}
                        </button>
                      </div>
                    </div>
                  </li>
                )
              }}
            </ExpandableList>
          )}
        </Card>

        {/* Quick actions, Stale relationships, and the Chrome-extension
            install prompt all live behind "More" — the partner explicitly
            asked for "less is more" on the landing page. Hidden by default;
            one click reveals everything. */}
        <details className="rounded-xl border border-valence-border bg-valence-surface/40">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-4 py-3 text-xs font-semibold text-valence-muted hover:text-valence-text transition">
            <span className="inline-flex items-center gap-2"><ArrowUpRight className="h-3.5 w-3.5" /> More on Today</span>
            <span className="text-[10px] text-valence-subtle">Quick actions · cooling relationships · capture extension</span>
          </summary>
          <div className="space-y-3 px-3 pb-3">
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
          </div>
        </details>
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
          placeholder={"What happened? What's on your mind?"}
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

      {/* Priority peek card — quick read of takeaways + next steps for a
          tapped follow-up, no heavy edit drawer. */}
      {peek && <PriorityPeek peek={peek} onClose={() => setPeek(null)} />}
    </div>
  )
}

// ============================================================================
// StatStrip — the "command center" KPI row at the top of Today. Four tiles:
// live mandates, touches this week, the founder/investor balance (the
// partner's headline metric, as a mini stacked bar), and overdue follow-ups.
// Each tile links to where you'd act on it.
// ============================================================================
function StatStrip({ stats }) {
  const { liveMandates, totalMandates, weekTouches, split, splitTotal, overdue } = stats
  const pct = n => (splitTotal ? (n / splitTotal) * 100 : 0)
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile to="/mandates" icon={Handshake} label="Live mandates"
        value={liveMandates} sub={`of ${totalMandates} total`} />
      <StatTile to="/interactions" icon={MessageSquare} label="Touches this week"
        value={weekTouches} sub={weekTouches === 0 ? 'log your first' : 'interactions logged'} />

      {/* Founder / Investor balance — the headline tile. */}
      <Link to="/interactions" className="vl-card vl-card-hover p-4 block">
        <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Briefcase className="h-3 w-3" /> This week's balance</p>
        {splitTotal === 0 ? (
          <p className="mt-3 text-sm text-valence-subtle">No interactions yet this week.</p>
        ) : (
          <>
            <div className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-valence-surface">
              {split.founder  > 0 && <div className={ctyBar('founder')}  style={{ width: `${pct(split.founder)}%`  }} title={`Founder ${split.founder}`} />}
              {split.investor > 0 && <div className={ctyBar('investor')} style={{ width: `${pct(split.investor)}%` }} title={`Investor ${split.investor}`} />}
              {split.general  > 0 && <div className={ctyBar('general')}  style={{ width: `${pct(split.general)}%`  }} title={`General ${split.general}`} />}
            </div>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-valence-muted tabular-nums">
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{split.founder} founder</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />{split.investor} investor</span>
            </div>
          </>
        )}
      </Link>

      <StatTile to={overdue > 0 ? '/interactions' : undefined} icon={AlertTriangle} label="Overdue follow-ups"
        value={overdue} sub={overdue === 0 ? 'all clear' : 'need a touch'} danger={overdue > 0} />
    </section>
  )
}

// PulseBanner — renders the daily coach nudge with a tone-matched accent.
const PULSE_TONE = {
  alert: { rail: 'border-l-valence-warning', iconBg: 'bg-valence-warning/15 text-valence-warning' },
  tilt:  { rail: 'border-l-indigo-400',      iconBg: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300' },
  quiet: { rail: 'border-l-slate-300',       iconBg: 'bg-valence-surface text-valence-muted' },
  good:  { rail: 'border-l-emerald-400',     iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' }
}
function PulseBanner({ pulse }) {
  const tone = PULSE_TONE[pulse.tone] || PULSE_TONE.good
  const Icon = pulse.icon
  return (
    <div className={`vl-card flex items-center gap-3 border-l-[3px] p-4 ${tone.rail}`}>
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone.iconBg}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="vl-eyebrow-ink">Pulse</p>
        <p className="mt-0.5 text-sm font-medium text-valence-text leading-snug">{pulse.msg}</p>
      </div>
      {pulse.to && (
        <Link to={pulse.to} className="vl-btn-secondary-sm shrink-0">{pulse.cta}</Link>
      )}
    </div>
  )
}

function StatTile({ to, icon: Icon, label, value, sub, danger }) {
  const inner = (
    <>
      <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Icon className="h-3 w-3" /> {label}</p>
      <p className={`mt-1.5 font-display text-3xl font-bold tabular-nums ${danger ? 'text-valence-danger' : 'text-valence-text'}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-valence-subtle">{sub}</p>
    </>
  )
  return to
    ? <Link to={to} className="vl-card vl-card-hover p-4 block">{inner}</Link>
    : <div className="vl-card p-4">{inner}</div>
}

// Lightweight read-only card shown when a Priority row is tapped. Surfaces
// the two things the partner actually wants mid-day — what came out of the
// last meeting and what to do next — without the full edit drawer.
function PriorityPeek({ peek, onClose }) {
  // Guard against a malformed timestamp — new Date('garbage') → Invalid
  // Date, and format() throws on it, which would crash the whole card.
  const whenDate = peek.when ? new Date(peek.when) : null
  const when = whenDate && !Number.isNaN(whenDate.getTime()) ? format(whenDate, 'd MMM yyyy') : null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-valence-border bg-valence-elevated shadow-2xl animate-slide-up">
        <div className="flex items-start justify-between gap-3 border-b border-valence-border/60 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {peek.cty && <span className={`inline-block h-2 w-2 rounded-full ${ctyDot(peek.cty)}`} title={ctyLabel(peek.cty)} />}
              <p className="font-semibold text-valence-text truncate">{peek.name}</p>
            </div>
            <p className="mt-0.5 text-[11px] text-valence-muted">
              {[peek.company, when].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
          <button onClick={onClose} className="vl-btn-ghost -mr-2 shrink-0 text-valence-muted" aria-label="Close">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {peek.context && (
            <div>
              <p className="vl-eyebrow-ink mb-1">Context</p>
              <p className="text-sm text-valence-text">{peek.context}</p>
            </div>
          )}
          <div>
            <p className="vl-eyebrow-ink mb-1">Takeaways</p>
            <p className="text-sm text-valence-text whitespace-pre-wrap leading-relaxed">{peek.takeaways?.trim() || '—'}</p>
          </div>
          <div className="rounded-lg border border-valence-blue/30 bg-valence-blue-soft/40 px-3 py-2.5">
            <p className="vl-eyebrow-ink mb-1 text-valence-blue">Next steps</p>
            <p className="text-sm font-medium text-valence-text whitespace-pre-wrap leading-relaxed">{peek.next_steps?.trim() || '—'}</p>
          </div>
        </div>
      </div>
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

// Loading skeleton for the Today cards. Renders `count` faint pulse-rows
// so the prospect sees calm "data on its way" affordance instead of the
// briefly-visible empty-state messaging.
function SkeletonRows({ count = 3 }) {
  return (
    <ul className="divide-y divide-valence-border/40">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-2">
          <span className="h-2 w-12 rounded-full bg-valence-border/60 animate-pulse" />
          <span className="h-2 w-3/5 rounded-full bg-valence-border/40 animate-pulse" />
        </li>
      ))}
    </ul>
  )
}

// Phase 27 — stable key per Waiting On row. counterparty_name is matched
// case-insensitively by the SQL function so we normalise the same way here.
function waitingKey(w) {
  return `${w.deal_id}:${(w.counterparty_name || '').trim().toLowerCase()}`
}

// Interaction notes are multi-line "Context:/Origination:/Next Steps:" blobs;
// the first non-empty line after stripping the field label is usually the
// useful summary. Falls back to the whole string when there's no structure.
function firstLineOf(text) {
  if (!text) return ''
  const first = String(text).split(/\r?\n/).map(s => s.trim()).find(Boolean) || ''
  return first.replace(/^Context:\s*/i, '')
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
