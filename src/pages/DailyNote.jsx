import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, differenceInCalendarDays, differenceInDays, startOfToday, addDays } from 'date-fns'
import {
  Sparkles, Briefcase, Handshake, MessageSquare, Pencil, Calendar,
  AlertTriangle, Clock, ArrowUpRight, ChevronDown, ChevronUp
} from 'lucide-react'
import MeetingPrepCard from '../components/MeetingPrepCard.jsx'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import { useToast } from '../components/Toast.jsx'
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
        supabase.from('deals').select('id, client_name, stage, lead_owner, target_close, deal_types, deal_subtype, updated_at, created_at, nda_status').order('updated_at', { ascending: false }),
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
  //
  // The earlier version fetched ONCE on mount, so if a teammate added a
  // meeting after the page loaded the partner had to hard-refresh to see
  // it — that was the "today's meetings is lagging" complaint. We now
  // refetch on window focus, on tab visibility, and every 60s while the
  // page is open. All three share one debounced fetcher.
  const [meetingsBusy, setMeetingsBusy] = useState(false)

  useEffect(() => {
    if (!googleConnected) return
    let cancelled = false
    let lastFetchAt = 0

    async function pull(force = false) {
      // Coalesce — don't hammer Google when focus + visibility + interval
      // all fire within a few seconds of each other.
      const now = Date.now()
      if (!force && now - lastFetchAt < 8_000) return
      lastFetchAt = now
      setMeetingsBusy(true)
      try {
        const evs = await listTodayEvents()
        if (cancelled) return
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
          // Silent fail makes the empty card read like "you have no
          // meetings" rather than "your session expired, click Reconnect".
          console.warn('Google session expired; surfacing Reconnect hint')
          setGoogleStaleHint(true)
        } else {
          console.warn('Google calendar fetch failed', err)
        }
      } finally {
        if (!cancelled) setMeetingsBusy(false)
      }
    }

    pull(true)
    const onFocus = () => pull()
    const onVis   = () => { if (document.visibilityState === 'visible') pull() }
    const interval = setInterval(() => pull(), 60_000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
    }
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
    // Phase 32 — staleness reads BOTH the activities log and interactions.
    // The old version checked only activities, so a deal with fresh
    // interactions logged (Deal Logger / InteractionDrawer / Gmail capture)
    // but no activity row looked "stale" — bankers saw stale warnings on
    // mandates they had touched yesterday.
    const lastActivity = new Map()
    for (const a of activities) {
      const t = new Date(a.created_at)
      const prev = lastActivity.get(a.deal_id)
      if (!prev || t > prev) lastActivity.set(a.deal_id, t)
    }
    for (const i of interactions) {
      if (!i.deal_id) continue
      const ts = i.occurred_at || i.created_at
      if (!ts) continue
      const t = new Date(ts)
      const prev = lastActivity.get(i.deal_id)
      if (!prev || t > prev) lastActivity.set(i.deal_id, t)
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
          to: `/deals?open=${d.id}`,
          // Phase 32 signal_anchor — changes whenever this deal gets new
          // activity, so an override resolved against the previous quiet
          // period stops applying the next time it goes silent.
          signalAnchor: `stale:${last.toISOString()}`
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
          to: `/deals?open=${d.id}`,
          // If the target_close shifts the override should not silence
          // the new date. Anchor on the date itself.
          signalAnchor: `closing:${String(iso).slice(0,10)}`
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
        // Anchor on follow_up_date so if the banker bumps the deadline,
        // the old override stops applying.
        signalAnchor: `int:${String(i.follow_up_date).slice(0,10)}`,
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
    // public.compute_waiting_for_org(), which detects both stale manual
    // follow-ups (outcome='to_followup' + past follow_up_date with no
    // later reply) AND silent outbound emails (email_sent with no later
    // inbound for > email_silent_days). State lives in the `waiting`
    // slice below.

    // No hard cap — the Priorities card collapses the list to a small
    // preview by default and lets the user expand to see the rest.
    return { priorities }
  }, [deals, activities, interactions, today])

  // ─── Waiting On ─────────────────────────────────────────────────────────
  // Pulled from the compute_waiting_for_org SQL function. Refreshed when
  //   (a) the SQL inputs change — i.e. anyone in the org writes to the
  //       interactions or waiting_overrides tables (Phase 28 realtime)
  //   (b) the window regains focus, in case the realtime channel dropped
  // Previous version depended on interactions.length, but the on-mount
  // fetch is filtered to follow-ups only — a teammate adding a Gmail
  // capture (no follow_up_date) wouldn't bump the array length and the
  // email_silent blocker would never refresh.
  const [waiting, setWaiting]         = useState([])
  const [waitingBusy, setWaitingBusy] = useState({})    // { [key]: 'snooze' | 'resolve' }
  const orgId = org?.id

  useEffect(() => {
    if (!isSupabaseConfigured || !orgId) return
    let alive = true
    let pending = false
    let lastFetchAt = 0

    async function refresh() {
      // Coalesce — realtime can burst events. Don't fire more than once
      // per ~1.5s, and never overlap two in-flight calls.
      if (pending) return
      const now = Date.now()
      if (now - lastFetchAt < 1_500) return
      lastFetchAt = now
      pending = true
      try {
        const { data, error } = await supabase.rpc('compute_waiting_for_org', { p_org_id: orgId })
        if (!alive) return
        if (error) { console.warn('waiting rpc failed', error); return }
        setWaiting(data || [])
      } finally {
        pending = false
      }
    }

    refresh()
    // Multi-teammate sync — any seat in the same org writing to either
    // table propagates instantly. RLS already scopes us to the right org,
    // so we don't need a server-side filter on the channel.
    const offInter = subscribeTable('interactions',       refresh)
    const offOverr = subscribeTable('waiting_overrides',  refresh)
    const onFocus  = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      alive = false
      offInter?.(); offOverr?.()
      window.removeEventListener('focus', onFocus)
    }
  }, [orgId])

  async function snoozeWaiting(w, days = 3) {
    const key = waitingKey(w)
    setWaitingBusy(b => ({ ...b, [key]: 'snooze' }))
    try {
      const { error } = await supabase.rpc('waiting_snooze', {
        p_deal_id: w.deal_id,
        p_counterparty_name: w.counterparty_name,
        p_days: days,
        // Phase 32 anchor — `since` is the source interaction timestamp,
        // so a new outbound on the same (deal, counterparty) gets a
        // different anchor and the old snooze stops applying.
        p_signal_anchor: w.since || null
      })
      if (error) throw error
      setWaiting(prev => prev.filter(r => waitingKey(r) !== key))
    } catch (e) { console.warn('snooze failed', e) }
    finally { setWaitingBusy(b => { const n = { ...b }; delete n[key]; return n }) }
  }

  // Open a Gmail search for this counterparty in a new tab. We don't
  // have the counterparty's email on the waiting row (would need a
  // people-join in the SQL function), so we use the search URL which
  // surfaces every existing thread with that name — banker picks the
  // right one and hits Reply. Beats a blank compose draft any day.
  function nudgeWaiting(w) {
    const q = encodeURIComponent(`${w.counterparty_name} ${w.client_name || ''}`.trim())
    const url = `https://mail.google.com/mail/u/0/#search/${q}`
    try { window.open(url, '_blank', 'noopener,noreferrer') } catch {}
  }

  async function resolveWaiting(w) {
    const key = waitingKey(w)
    setWaitingBusy(b => ({ ...b, [key]: 'resolve' }))
    try {
      const { error } = await supabase.rpc('waiting_resolve', {
        p_deal_id: w.deal_id,
        p_counterparty_name: w.counterparty_name,
        p_note: null,
        // Phase 32 anchor — see snoozeWaiting comment above.
        p_signal_anchor: w.since || null
      })
      if (error) throw error
      setWaiting(prev => prev.filter(r => waitingKey(r) !== key))
    } catch (e) { console.warn('resolve failed', e) }
    finally { setWaitingBusy(b => { const n = { ...b }; delete n[key]; return n }) }
  }

  // ─── Priority overrides ─────────────────────────────────────────────────
  // Same model as Waiting On. priority_overrides table keyed on a string
  // priority_key (matches the p.id we already assign: 'stale-<deal>',
  // 'closing-<deal>', 'int-<interaction>'). Shared across teammates so the
  // firm's pipeline reads consistently for everyone.
  const [priorityOverrides, setPriorityOverrides] = useState(new Map())
  const [priorityBusy, setPriorityBusy]           = useState({})
  const toast = useToast()

  useEffect(() => {
    if (!isSupabaseConfigured || !orgId) return
    let alive = true

    async function load() {
      const { data, error } = await supabase
        .from('priority_overrides')
        .select('priority_key, snoozed_until, resolved_at')
        .eq('org_id', orgId)
      if (!alive) return
      if (error) { console.warn('priority overrides load failed', error); return }
      const next = new Map()
      for (const r of (data || [])) next.set(r.priority_key, r)
      setPriorityOverrides(next)
    }

    load()
    const off = subscribeTable('priority_overrides', load)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { alive = false; off?.(); window.removeEventListener('focus', onFocus) }
  }, [orgId])

  // Tick — bumps every 30s so visiblePriorities + Waiting On filters
  // recompute and snoozed rows re-appear when their snoozed_until passes,
  // without a manual refresh. Realtime pushes nothing for "time passed",
  // so we have to drive this on the client.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  // Drop priorities the user has either snoozed (still active) or resolved.
  // Phase 32: only honour overrides whose stored signal_anchor matches the
  // priority's current anchor — so an override against the previous
  // staleness window stops applying when fresh activity restarts the
  // signal. Realtime keeps the override Map fresh across teammates.
  const visiblePriorities = useMemo(() => {
    const now = Date.now()
    return auto.priorities.filter(p => {
      const ov = priorityOverrides.get(p.id)
      if (!ov) return true
      // Stale anchor → underlying signal moved, ignore the override.
      if (p.signalAnchor && ov.signal_anchor && ov.signal_anchor !== p.signalAnchor) return true
      if (ov.resolved_at) return false
      if (ov.snoozed_until && new Date(ov.snoozed_until).getTime() > now) return false
      return true
    })
    // tick is intentionally in the deps so the snooze-expiry filter
    // re-evaluates every 30s.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.priorities, priorityOverrides, tick])

  async function resolvePriority(p) {
    const key = p.id
    setPriorityBusy(b => ({ ...b, [key]: 'resolve' }))
    // Optimistic local hide so the row disappears immediately.
    setPriorityOverrides(prev => {
      const next = new Map(prev)
      next.set(key, { priority_key: key, resolved_at: new Date().toISOString(), snoozed_until: null })
      return next
    })
    try {
      const { error } = await supabase.rpc('priority_resolve', {
        p_priority_key: key,
        p_note: null,
        p_signal_anchor: p.signalAnchor || null
      })
      if (error) throw error
      // 5-second Undo window — undo just deletes the override row, which
      // realtime then pushes back to every open tab.
      toast.success('Marked done.', {
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: async () => {
            try { await supabase.rpc('priority_unresolve', { p_priority_key: key }) }
            catch (e) { console.warn('undo failed', e) }
            setPriorityOverrides(prev => {
              const next = new Map(prev); next.delete(key); return next
            })
          }
        }
      })
    } catch (e) {
      console.warn('resolve priority failed', e)
      setPriorityOverrides(prev => { const next = new Map(prev); next.delete(key); return next })
      toast.error('Couldn\'t mark done — try again.')
    } finally { setPriorityBusy(b => { const n = { ...b }; delete n[key]; return n }) }
  }

  async function snoozePriority(p, days = 3) {
    const key = p.id
    setPriorityBusy(b => ({ ...b, [key]: 'snooze' }))
    setPriorityOverrides(prev => {
      const next = new Map(prev)
      next.set(key, {
        priority_key: key,
        snoozed_until: new Date(Date.now() + days * 86400_000).toISOString(),
        resolved_at: null
      })
      return next
    })
    try {
      const { error } = await supabase.rpc('priority_snooze', {
        p_priority_key: key,
        p_days: days,
        p_signal_anchor: p.signalAnchor || null
      })
      if (error) throw error
    } catch (e) {
      console.warn('snooze priority failed', e)
      setPriorityOverrides(prev => { const next = new Map(prev); next.delete(key); return next })
    } finally { setPriorityBusy(b => { const n = { ...b }; delete n[key]; return n }) }
  }

  // Open Gmail search with the counterparty. Only meaningful for the
  // interaction-based priorities (peek.name is set there); stale-mandate
  // and close-window rows don't carry a counterparty so we fall back to
  // the client name from the deal link.
  function nudgePriority(p) {
    const q = encodeURIComponent(
      p.peek?.name
        ? `${p.peek.name} ${p.peek.company || ''}`.trim()
        : (p.message || '').replace(/^Follow up · /, '')
    )
    if (!q) return
    const url = `https://mail.google.com/mail/u/0/#search/${q}`
    try { window.open(url, '_blank', 'noopener,noreferrer') } catch {}
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
    // Use the override-filtered list so the "Overdue follow-ups" KPI drops
    // as soon as the user marks one done — otherwise the tile and the card
    // disagree on the count.
    const overdue = visiblePriorities.filter(p => p.sortAge != null).length
    return {
      liveMandates,
      totalMandates: deals.length,
      weekTouches: week.length,
      split,
      splitTotal: split.founder + split.investor + split.general,
      overdue
    }
  }, [deals, interactions, today, visiblePriorities])

  // Pulse coach was removed — the partner asked for less visual noise on
  // the Today page. KPI strip + Priorities + Waiting On already surface
  // everything the Pulse banner used to nudge about.

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
          countBadge={visiblePriorities.length}
        >
          {/* Phase 26 filter row — collapse the list down to one counterparty
              type. Only renders when there are any tagged priorities so it
              doesn't add visual noise to an inbox-zero day. Stale mandates
              and close-window items have no counterparty_type so they only
              show under "All". */}
          {ready && visiblePriorities.some(p => p.cty) && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {['all', 'founder', 'investor', 'general'].map(t => {
                const count = t === 'all'
                  ? visiblePriorities.length
                  : visiblePriorities.filter(p => p.cty === t).length
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
                ? visiblePriorities
                : visiblePriorities.filter(p => p.cty === priorityFilter)
              if (visible.length === 0) {
                return <Empty>{priorityFilter === 'all' ? 'No priorities right now.' : 'Nothing in this bucket.'}</Empty>
              }
              return (
                <ExpandableList items={visible} initial={4} kind="priorities">
                  {p => {
                    const busy = priorityBusy[p.id]
                    const hasCounterparty = !!p.peek?.name || /^Follow up · /.test(p.message || '')
                    return (
                      <li key={p.id} className="group flex items-start gap-3 py-2 border-b border-valence-border/40 last:border-b-0">
                        <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${SEV_DOT[p.severity]}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {p.cty && <span className={`inline-block h-1.5 w-1.5 rounded-full ${ctyDot(p.cty)}`} title={ctyLabel(p.cty)} />}
                            {p.peek ? (
                              <button onClick={() => setPeek(p.peek)} className="text-left text-sm text-valence-text hover:text-valence-blue truncate">
                                {p.message}
                              </button>
                            ) : (
                              <Link to={p.to} className="text-sm text-valence-text hover:text-valence-blue truncate">{p.message}</Link>
                            )}
                          </div>
                          {p.detail && <p className="mt-0.5 text-[11px] text-valence-muted">{p.detail}</p>}
                          {/* Action triad — same shape as Waiting On. Mark
                              done writes priority_overrides; snooze hides
                              for 3 days; nudge opens Gmail search. */}
                          <div className="mt-1.5 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {hasCounterparty && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => nudgePriority(p)}
                                  className="text-[10px] font-semibold text-valence-blue hover:text-valence-blue-hover"
                                >
                                  Send nudge →
                                </button>
                                <span className="text-valence-subtle">·</span>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => resolvePriority(p)}
                              disabled={!!busy}
                              className="text-[10px] font-medium text-valence-muted hover:text-valence-text disabled:opacity-50"
                            >
                              {busy === 'resolve' ? 'Marking…' : 'Mark done'}
                            </button>
                            <span className="text-valence-subtle">·</span>
                            <button
                              type="button"
                              onClick={() => snoozePriority(p, 3)}
                              disabled={!!busy}
                              className="text-[10px] font-medium text-valence-muted hover:text-valence-text disabled:opacity-50"
                            >
                              {busy === 'snooze' ? 'Snoozing…' : 'Snooze 3d'}
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  }}
                </ExpandableList>
              )
            })()}
        </Card>

        <Card
          icon={Clock}
          title="Waiting on"
          subtitle="Follow-ups past due and threads with no reply"
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
                    {w.blocker_kind === 'email_silent'
                      ? <MessageSquare className="h-3 w-3 mt-1 text-valence-blue shrink-0" />
                      : <AlertTriangle className="h-3 w-3 mt-1 text-valence-warning shrink-0" />}
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
                        <span
                          className={`ml-1 inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-medium uppercase tracking-wider ${
                            w.blocker_kind === 'email_silent'
                              ? 'bg-valence-blue-soft text-valence-blue'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {w.blocker_kind === 'email_silent' ? 'No reply' : 'Follow-up'}
                        </span>
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
                          onClick={() => nudgeWaiting(w)}
                          className="text-[10px] font-semibold text-valence-blue hover:text-valence-blue-hover"
                        >
                          Send nudge →
                        </button>
                        <span className="text-valence-subtle">·</span>
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
// live mandates, interactions this week, the founder/investor client-type
// breakdown (the partner's headline metric, as a mini stacked bar), and
// overdue follow-ups. Each tile links to where you'd act on it.
// ============================================================================
function StatStrip({ stats }) {
  const { liveMandates, totalMandates, weekTouches, split, splitTotal, overdue } = stats
  const pct = n => (splitTotal ? (n / splitTotal) * 100 : 0)
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile to="/mandates" icon={Handshake} label="Live mandates"
        value={liveMandates} sub={`of ${totalMandates} total`} />
      <StatTile to="/interactions" icon={MessageSquare} label="Interactions this week"
        value={weekTouches} />

      {/* Founder / Investor client-type breakdown — the headline tile. */}
      <Link to="/interactions" className="vl-card vl-card-hover p-4 block">
        <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Briefcase className="h-3 w-3" /> Client type</p>
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
        value={overdue} danger={overdue > 0} />
    </section>
  )
}

function StatTile({ to, icon: Icon, label, value, sub, danger }) {
  const inner = (
    <>
      <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Icon className="h-3 w-3" /> {label}</p>
      <p className={`mt-1.5 font-display text-3xl font-bold tabular-nums ${danger ? 'text-valence-danger' : 'text-valence-text'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-valence-subtle">{sub}</p>}
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
