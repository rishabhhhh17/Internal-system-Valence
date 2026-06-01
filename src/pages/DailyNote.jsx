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
import { useSeat } from '../hooks/useSeat.js'
import { stageMeta } from '../lib/stages.js'
import { listTodayEvents, GoogleAuthExpired } from '../lib/google.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import WikilinkTextarea from '../components/WikilinkTextarea.jsx'
import WikilinkText from '../components/WikilinkText.jsx'
import StaleRelationships from '../components/StaleRelationships.jsx'
import ExtensionStatus from '../components/ExtensionStatus.jsx'
import { dotClass as ctyDot, labelFor as ctyLabel } from '../lib/counterpartyColors.js'

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

  // Pull everything we need to compute priorities + waiting-on.
  useEffect(() => {
    if (!isSupabaseConfigured) return
    ;(async () => {
      const [d, a, i, m] = await Promise.all([
        supabase.from('deals').select('id, client_name, stage, lead_owner, target_close, expected_close_date, deal_types, deal_subtype, updated_at, created_at, nda_status').order('updated_at', { ascending: false }),
        supabase.from('activities').select('deal_id, kind, created_at').order('created_at', { ascending: false }).limit(2000),
        // Pull ALL recent interactions (not just ones with follow_up_date) so
        // we can compute the latest touch per counterparty. This is what
        // drives the "X days since last touch" detail line — the old query
        // only fetched rows with follow_up_date set, so a stale 2024 deadline
        // would still light up even when the same person was re-engaged
        // last month. Order desc + cap at 5000 to stay deterministic.
        supabase.from('interactions')
          .select('id, counterparty_name, counterparty_company, counterparty_type, follow_up_date, outcome, deal_id, lead_owner, occurred_at, created_at, is_complete')
          .order('occurred_at', { ascending: false, nullsFirst: false })
          .limit(5000),
        supabase.from('meetings').select('id, title, attendee_name, date, time').eq('date', dateIso).order('time')
      ])
      setDeals(d.data || [])
      setActivities(a.data || [])
      setInteractions(i.data || [])
      setMeetings(m.data || [])
      setMeetingsSource('local')
      setReady(true)
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
    for (const i of interactions) {
      if (!i.occurred_at) continue
      const key = (i.counterparty_company || '').toLowerCase().trim() + '|' + normalizeName(i.counterparty_name)
      const t = new Date(i.occurred_at)
      const prev = latestByKey.get(key)
      if (!prev || t > prev) latestByKey.set(key, t)
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
          when:    i.occurred_at,
          context: i.context,
          takeaways: i.takeaways,
          next_steps: i.next_steps,
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
          countBadge={auto.waitingOn.length}
        >
          {!ready ? (
            <SkeletonRows count={3} />
          ) : auto.waitingOn.length === 0 ? (
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

// Lightweight read-only card shown when a Priority row is tapped. Surfaces
// the two things the partner actually wants mid-day — what came out of the
// last meeting and what to do next — without the full edit drawer.
function PriorityPeek({ peek, onClose }) {
  const when = peek.when ? format(new Date(peek.when), 'd MMM yyyy') : null
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
