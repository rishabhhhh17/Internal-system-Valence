import { useEffect, useMemo, useState } from 'react'
import { format, addDays, addWeeks, addMonths, startOfMonth, endOfMonth, isSameDay, isSameMonth, differenceInMinutes, isAfter } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Users, Clock, MapPin, Sparkles, ExternalLink, Globe, X, RefreshCw, LogOut, AlertTriangle } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import {
  weekStart, weekEnd, addMinutes,
  DEFAULT_WORKING_HOURS, CALENDAR_COLOR_PALETTE,
  findCommonFreeSlots, groupBusyByCalendar, layoutDayColumn, colorClassesFor,
  attendeesWithPersonas,
  syncAllGoogleCalendars,
  DEMO_TEAM_CALENDARS, DEMO_CALENDAR_EVENTS
} from '../lib/calendar.js'
import { signInWithGoogle, signOut, GoogleAuthExpired } from '../lib/google.js'
import { useAuth } from '../hooks/useAuth.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import WikilinkTextarea from '../components/WikilinkTextarea.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Modal from '../components/Modal.jsx'
import QuickCalendar from '../components/QuickCalendar.jsx'
import { useToast } from '../components/Toast.jsx'

const VIEWS = ['Day', 'Week', 'Month']
const DURATIONS = [15, 30, 45, 60, 90, 120]
const MODES = [
  { id: 'quick',  label: 'Quick plan',   sub: 'Drag to create · invites send' },
  { id: 'team',   label: 'Team overlay', sub: 'Slot finder + cross-calendar' },
  { id: 'google', label: 'My Google',    sub: 'Your real Google Calendar' }
]

export default function Calendar() {
  const toast = useToast()
  const { googleConnected, profile, refresh: refreshAuth } = useAuth()
  const [mode, setMode]   = useState('quick')
  const [view, setView]   = useState('Week')
  const [anchor, setAnchor] = useState(new Date())
  const [calendars, setCalendars] = useState([])
  const [events, setEvents]       = useState([])
  const [people, setPeople]       = useState([])
  const [hidden, setHidden]       = useState(new Set())  // calendar IDs to hide
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [composeAt, setComposeAt] = useState(null)       // Date when user clicks an empty slot
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState(null)

  // Slot finder state
  const [slotAttendees, setSlotAttendees] = useState([])
  const [slotDuration, setSlotDuration]   = useState(30)
  const [slotResults, setSlotResults]     = useState(null)

  // Google sync state
  const [syncing, setSyncing] = useState(false)
  const [showAddCal, setShowAddCal] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setLoadError(null)
    if (!isSupabaseConfigured) {
      setCalendars(DEMO_TEAM_CALENDARS); setEvents(DEMO_CALENDAR_EVENTS); setPeople([]); setLoading(false); return
    }
    try {
      const [c, e, p] = await Promise.all([
        supabase.from('team_calendars').select('*').order('name'),
        supabase.from('calendar_events').select('*').order('starts_at'),
        supabase.from('people').select('id, full_name, email, role, company')
      ])
      const cs = c.data?.length ? c.data : DEMO_TEAM_CALENDARS
      const es = e.data?.length ? e.data : DEMO_CALENDAR_EVENTS
      setCalendars(cs); setEvents(es); setPeople(p.data || [])
    } catch (err) {
      setLoadError(err?.message || 'Couldn\'t load calendars.')
      setCalendars(DEMO_TEAM_CALENDARS); setEvents(DEMO_CALENDAR_EVENTS); setPeople([])
    } finally { setLoading(false) }
  }

  function toggleHidden(calId) {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(calId)) next.delete(calId); else next.add(calId)
      return next
    })
  }

  const visibleCalendars = useMemo(() => calendars.filter(c => c.is_active && !hidden.has(c.id)), [calendars, hidden])
  const visibleEvents    = useMemo(() => {
    const ids = new Set(visibleCalendars.map(c => c.id))
    return events.filter(e => ids.has(e.calendar_id))
  }, [events, visibleCalendars])

  // Window the events to the active view so the day grid renders cleanly
  const viewRange = useMemo(() => {
    if (view === 'Day') return { start: startOfDay(anchor), end: endOfDay(anchor) }
    if (view === 'Week') return { start: weekStart(anchor), end: weekEnd(anchor) }
    return { start: startOfMonth(anchor), end: endOfMonth(anchor) }
  }, [view, anchor])

  const eventsInView = useMemo(
    () => visibleEvents.filter(e => isAfter(new Date(e.ends_at), viewRange.start) && isAfter(viewRange.end, new Date(e.starts_at))),
    [visibleEvents, viewRange]
  )

  const calendarsById = useMemo(() => new Map(calendars.map(c => [c.id, c])), [calendars])

  function findSlots() {
    if (slotAttendees.length === 0) return setSlotResults({ slots: [] })
    const busyMap = groupBusyByCalendar(visibleEvents)
    const from = new Date(); from.setHours(Math.max(DEFAULT_WORKING_HOURS.start, from.getHours()), 0, 0, 0)
    const to   = addDays(from, 7)
    const slots = findCommonFreeSlots({
      busyByCalendarId: busyMap,
      calendarIds: slotAttendees,
      durationMinutes: slotDuration,
      from, to
    })
    setSlotResults({ slots: slots.slice(0, 12) })
  }

  async function connectGoogle() {
    try {
      await signInWithGoogle({ redirectTo: `${window.location.origin}/calendar` })
    } catch (err) {
      toast.error(err?.message || 'Could not start Google sign-in')
    }
  }

  async function disconnectGoogle() {
    try { await signOut(); await refreshAuth(); toast.success('Signed out of Google') }
    catch (err) { toast.error(err?.message || 'Sign out failed') }
  }

  async function syncFromGoogle() {
    if (!googleConnected) {
      toast.error('Connect a Google account first.')
      return
    }
    const eligible = calendars.filter(c => c.google_calendar_id)
    if (eligible.length === 0) {
      toast.info('No calendars have a Google Calendar ID yet. Add one with "Add Google calendar".')
      return
    }
    setSyncing(true)
    try {
      const from = new Date(); from.setDate(from.getDate() - 7)
      const to   = new Date(); to.setDate(to.getDate()   + 30)
      const results = await syncAllGoogleCalendars(eligible, { from, to })
      const ok    = results.filter(r => r.ok)
      const fail  = results.filter(r => !r.ok)
      const expired = fail.find(f => f.error instanceof GoogleAuthExpired)
      if (expired) {
        toast.error('Google session expired — click Connect to reauthorise.')
        await refreshAuth()
      } else if (fail.length > 0) {
        toast.error(`Synced ${ok.length} calendars · ${fail.length} failed (${fail[0].error?.message || 'unknown error'})`)
      } else {
        const total = ok.reduce((sum, r) => sum + r.upserted, 0)
        toast.success(`Synced ${total} events from ${ok.length} Google calendar${ok.length === 1 ? '' : 's'}.`)
      }
      await load()
    } catch (err) {
      toast.error(err?.message || 'Google sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function addGoogleCalendar({ name, owner_email, google_calendar_id, color }) {
    const payload = { name: name.trim(), owner_email: owner_email.trim() || null, google_calendar_id: google_calendar_id.trim(), color, is_active: true }
    if (!isSupabaseConfigured) {
      const optimistic = { id: `local-${Date.now()}`, ...payload }
      setCalendars(prev => [optimistic, ...prev])
      setShowAddCal(false)
      toast.success(`${payload.name} added (demo mode — not persisted).`)
      return
    }
    const { data, error } = await supabase.from('team_calendars').insert(payload).select().single()
    if (error) return toast.error(error.message)
    setCalendars(prev => [...prev, data])
    setShowAddCal(false)
    toast.success(`${payload.name} added — click Sync to pull events.`)
  }

  async function createEvent({ calendar_id, title, starts_at, ends_at, attendees, location, description }) {
    const payload = { calendar_id, title, starts_at, ends_at, location: location || null, attendees: attendees || [], description: description || null }
    if (!isSupabaseConfigured) {
      const optimistic = { id: `local-${Date.now()}`, ...payload, created_at: new Date().toISOString() }
      setEvents(prev => [optimistic, ...prev])
      setComposeAt(null)
      toast.success(`${title} added to ${calendarsById.get(calendar_id)?.name || 'calendar'}.`)
      return
    }
    const { data, error } = await supabase.from('calendar_events').insert(payload).select().single()
    if (error) return toast.error(error.message)
    setEvents(prev => [data, ...prev])
    setComposeAt(null)
    toast.success(`${title} added to ${calendarsById.get(calendar_id)?.name || 'calendar'}.`)
  }

  function shiftAnchor(direction) {
    if (view === 'Day')   setAnchor(d => addDays(d, direction))
    if (view === 'Week')  setAnchor(d => addWeeks(d, direction))
    if (view === 'Month') setAnchor(d => addMonths(d, direction))
  }

  const headerLabel = useMemo(() => {
    if (view === 'Day')  return format(anchor, 'EEEE · LLL d, yyyy')
    if (view === 'Week') return `${format(weekStart(anchor), 'LLL d')} – ${format(weekEnd(anchor), 'LLL d, yyyy')}`
    return format(anchor, 'LLLL yyyy')
  }, [view, anchor])

  return (
    <div className="space-y-6">
      <ConfigBanner />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vl-eyebrow-ink">Team Calendar</p>
          <h1 className="mt-2 font-display text-feature font-bold text-valence-text">Everyone's week, in one view.</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {googleConnected ? (
            <>
              <button onClick={syncFromGoogle} disabled={syncing} className="vl-btn-secondary text-xs disabled:opacity-50 disabled:cursor-not-allowed">
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync from Google'}
              </button>
              <button onClick={() => setShowAddCal(true)} className="vl-btn-secondary text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Google calendar
              </button>
              <button onClick={disconnectGoogle} className="vl-btn-ghost text-xs" title={profile?.email ? `Signed in as ${profile.email}` : 'Sign out'}>
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </>
          ) : (
            <button onClick={connectGoogle} className="vl-btn-primary text-xs" disabled={!isSupabaseConfigured}>
              <Globe className="h-3.5 w-3.5" /> Connect Google
            </button>
          )}
          {mode === 'team' && (
            <div className="inline-flex items-center rounded-full border border-valence-border bg-white p-0.5">
              {VIEWS.map(v => (
                <button key={v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${view === v ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`}>{v}</button>
              ))}
            </div>
          )}
          {mode === 'google' && profile?.email && (
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noreferrer"
              className="vl-btn-secondary text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open in Google Calendar
            </a>
          )}
        </div>
      </div>

      {/* Mode toggle: Team overlay (our custom UI) vs My Google (iframe embed) */}
      <div className="inline-flex items-center rounded-xl border border-valence-border bg-white p-1">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex flex-col items-start rounded-lg px-3.5 py-1.5 text-left transition ${mode === m.id ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`}
          >
            <span className="text-[12px] font-semibold leading-tight">{m.label}</span>
            <span className={`text-[10px] leading-tight ${mode === m.id ? 'text-white/70' : 'text-valence-subtle'}`}>{m.sub}</span>
          </button>
        ))}
      </div>

      {googleConnected && profile?.email && (
        <div className="rounded-lg border border-valence-success/30 bg-valence-success/5 px-4 py-2 text-[12px] text-valence-success">
          Signed in as <b>{profile.email}</b>. Sync pulls events from each calendar's Google Calendar ID — make sure each team-member has shared their calendar with this account.
        </div>
      )}

      {/* Quick-plan mode: full-width Google-Calendar-style click-drag grid */}
      {mode === 'quick' && (
        <QuickCalendar googleConnected={googleConnected} onConnect={connectGoogle} />
      )}

      {mode !== 'quick' && (
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        {/* Left: either the team overlay grid OR the real Google Calendar iframe */}
        {mode === 'team' ? (
          <section className="vl-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-valence-border bg-valence-surface/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <button onClick={() => shiftAnchor(-1)} className="rounded-md border border-valence-border bg-white p-1.5 text-valence-muted hover:text-valence-text"><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => setAnchor(new Date())} className="rounded-md border border-valence-border bg-white px-3 py-1 text-[11px] font-semibold text-valence-text hover:bg-valence-surface">Today</button>
                <button onClick={() => shiftAnchor(1)}  className="rounded-md border border-valence-border bg-white p-1.5 text-valence-muted hover:text-valence-text"><ChevronRight className="h-4 w-4" /></button>
                <p className="ml-2 text-sm font-semibold text-valence-text">{headerLabel}</p>
              </div>
              <p className="text-[11px] text-valence-muted">{visibleCalendars.length} of {calendars.length} calendars · {eventsInView.length} events</p>
            </div>

            {loading ? (
              <div className="p-12 text-sm text-valence-muted">Loading calendars…</div>
            ) : loadError ? (
              <div className="p-8">
                <EmptyState icon={CalendarDays} title="Couldn't load calendars" description={loadError} action={<button onClick={load} className="vl-btn-primary">Retry</button>} />
              </div>
            ) : visibleCalendars.length === 0 ? (
              <div className="p-8">
                <EmptyState icon={CalendarDays} title="No calendars visible" description="Pick at least one team calendar from the right rail." />
              </div>
            ) : view === 'Month' ? (
              <MonthView anchor={anchor} events={visibleEvents} calendarsById={calendarsById} onEventClick={setSelectedEvent} />
            ) : (
              <TimeGrid
                view={view}
                anchor={anchor}
                calendars={visibleCalendars}
                events={eventsInView}
                calendarsById={calendarsById}
                onEventClick={setSelectedEvent}
                onSlotClick={(date, calId) => setComposeAt({ date, calendar_id: calId })}
              />
            )}
          </section>
        ) : (
          <GoogleCalendarEmbed userEmail={profile?.email} />
        )}

        {/* Right rail */}
        <aside className="space-y-5">
          {/* Calendar visibility */}
          <section className="vl-card p-4">
            <p className="vl-eyebrow-ink">Calendars</p>
            <ul className="mt-2 space-y-1.5">
              {calendars.map(c => {
                const cls = colorClassesFor(c.color).dot
                const checked = c.is_active && !hidden.has(c.id)
                return (
                  <li key={c.id} className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-valence-surface">
                    <label className="flex flex-1 items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="h-3.5 w-3.5 accent-valence-blue" checked={checked} onChange={() => toggleHidden(c.id)} disabled={!c.is_active} />
                      <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />
                      <span className="text-sm text-valence-text">{c.name}</span>
                      {c.google_calendar_id && (
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-valence-blue/30 bg-valence-blue-soft px-1.5 py-0 text-[9px] font-semibold text-valence-blue" title={`Synced from ${c.google_calendar_id}`}>
                          <Globe className="h-2.5 w-2.5" /> Google
                        </span>
                      )}
                    </label>
                    {!c.is_active && <span className="text-[10px] text-valence-subtle">paused</span>}
                  </li>
                )
              })}
            </ul>
          </section>

          {/* Slot finder */}
          <section className="vl-card p-4 space-y-3">
            <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-valence-blue" /> Slot finder</p>
            <div>
              <label className="vl-label">Who needs to be free</label>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {calendars.filter(c => c.is_active).map(c => {
                  const active = slotAttendees.includes(c.id)
                  const dot = colorClassesFor(c.color).dot
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSlotAttendees(prev => active ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition ${active ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text' : 'border-valence-border bg-white text-valence-muted hover:text-valence-text'}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${dot}`} />
                      <span className="truncate">{c.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="vl-label whitespace-nowrap">Duration</label>
              <select className="vl-input flex-1" value={slotDuration} onChange={e => setSlotDuration(Number(e.target.value))}>
                {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
            <button onClick={findSlots} disabled={slotAttendees.length === 0} className="vl-btn-primary w-full text-xs disabled:opacity-50 disabled:cursor-not-allowed">
              <Sparkles className="h-3.5 w-3.5" /> Find slots in next 7 days
            </button>
            {slotResults && (
              <div className="rounded-lg border border-valence-border bg-valence-surface/40 p-2.5">
                {slotResults.slots.length === 0 ? (
                  <p className="text-[11px] text-valence-muted">No common windows in working hours. Try a shorter duration or fewer people.</p>
                ) : (
                  <ul className="space-y-1 max-h-56 overflow-y-auto">
                    {slotResults.slots.map((s, i) => {
                      const attendeeEmails = slotAttendees
                        .map(cid => calendarsById.get(cid)?.owner_email)
                        .filter(Boolean)
                      return (
                        <li key={i} className="flex items-center justify-between gap-2 rounded-md bg-white border border-valence-border px-2 py-1 text-[11px]">
                          <span className="text-valence-text font-medium">{format(s.start, 'EEE LLL d · HH:mm')}–{format(s.end, 'HH:mm')}</span>
                          <button onClick={() => setComposeAt({ date: s.start, calendar_id: slotAttendees[0], duration: slotDuration, attendee_emails: attendeeEmails })} className="vl-btn-ghost text-[10px]">
                            <Plus className="h-3 w-3" /> Book
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* Selected event detail */}
          {selectedEvent && (
            <EventDetail
              event={selectedEvent}
              calendar={calendarsById.get(selectedEvent.calendar_id)}
              people={people}
              onClose={() => setSelectedEvent(null)}
            />
          )}
        </aside>
      </div>
      )}

      {/* Compose modal */}
      <Modal
        open={Boolean(composeAt)}
        onClose={() => setComposeAt(null)}
        title="New event"
        description="Schedule a meeting on a team calendar."
        size="lg"
      >
        {composeAt && (
          <NewEventForm
            initial={composeAt}
            calendars={calendars.filter(c => c.is_active)}
            onSubmit={createEvent}
            onCancel={() => setComposeAt(null)}
          />
        )}
      </Modal>

      {/* Add Google calendar modal */}
      <Modal
        open={showAddCal}
        onClose={() => setShowAddCal(false)}
        title="Add a Google calendar"
        description="Paste the Google Calendar ID — an email for primary calendars or a c_…@group.calendar.google.com UID for shared calendars."
        size="md"
      >
        <AddGoogleCalendarForm onSubmit={addGoogleCalendar} onCancel={() => setShowAddCal(false)} />
      </Modal>
    </div>
  )
}

// ============================================================================
// Day / Week time grid
// ============================================================================
const HOUR_HEIGHT = 64 // px per hour — Google Calendar uses ~60-64px
const DAY_START_HOUR = 8
const DAY_END_HOUR = 21
const HEADER_HEIGHT = 48
// Cap simultaneous lanes for legibility. Anything beyond gets a "+N" chip
// instead of a sliver too narrow to read.
const MAX_VISIBLE_LANES = 2

function TimeGrid({ view, anchor, calendars, events, calendarsById, onEventClick, onSlotClick }) {
  const days = view === 'Day' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i))
  const totalRows = DAY_END_HOUR - DAY_START_HOUR
  const totalHeight = totalRows * HOUR_HEIGHT
  // 7-day week needs ~960px to render comfortably; 1-day view is fine narrow.
  const minW = view === 'Day' ? 480 : 960

  return (
    <div className="overflow-x-auto">
      <div className="flex" style={{ minWidth: minW }}>
        {/* Hour rail */}
        <div className="w-16 shrink-0 border-r border-valence-border bg-valence-surface/30">
          <div className="border-b border-valence-border" style={{ height: HEADER_HEIGHT }} />
          {Array.from({ length: totalRows }, (_, i) => (
            <div key={i} className="relative" style={{ height: HOUR_HEIGHT }}>
              <span className="absolute -top-2 right-2 text-[11px] font-medium text-valence-subtle tabular-nums">
                {(DAY_START_HOUR + i).toString().padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
          {days.map(d => (
            <DayColumn
              key={d.toISOString()}
              date={d}
              events={events.filter(e => sameDayLocal(new Date(e.starts_at), d))}
              calendars={calendars}
              calendarsById={calendarsById}
              onEventClick={onEventClick}
              onSlotClick={onSlotClick}
              totalHeight={totalHeight}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DayColumn({ date, events, calendars, calendarsById, onEventClick, onSlotClick, totalHeight }) {
  const isToday = isSameDay(date, new Date())
  const laidOut = useMemo(() => layoutDayColumn(events), [events])

  // Default new-event calendar = first visible calendar
  const defaultCal = calendars[0]?.id

  // For each event, decide whether to render it inline (lane < cap) or fold
  // it into a "+N" overflow chip at the same start time.
  const overflowByMinute = useMemo(() => {
    const map = new Map()
    for (const ev of laidOut) {
      if (ev._lane < MAX_VISIBLE_LANES) continue
      const key = new Date(ev.starts_at).toISOString()
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(ev)
    }
    return map
  }, [laidOut])

  return (
    <div className="relative border-r border-valence-border last:border-r-0">
      <div
        className={`border-b border-valence-border px-2 py-2 ${isToday ? 'bg-valence-blue-soft' : 'bg-valence-surface/30'}`}
        style={{ height: HEADER_HEIGHT }}
      >
        <div className={`text-[11px] font-semibold uppercase tracking-wider ${isToday ? 'text-valence-blue' : 'text-valence-muted'}`}>{format(date, 'EEE')}</div>
        <div className={`text-base font-semibold ${isToday ? 'text-valence-text' : 'text-valence-text/80'}`}>{format(date, 'd')}</div>
      </div>

      {/* Hour grid lines + slot click handlers */}
      <div className="relative" style={{ height: totalHeight }}>
        {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => {
          const slotDate = new Date(date); slotDate.setHours(DAY_START_HOUR + i, 0, 0, 0)
          return (
            <button
              key={i}
              onClick={() => defaultCal && onSlotClick(slotDate, defaultCal)}
              className="absolute inset-x-0 border-b border-valence-border/40 hover:bg-valence-blue-soft/30 transition-colors"
              style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              aria-label={`Create event at ${format(slotDate, 'HH:mm')}`}
            />
          )
        })}

        {/* Events (visible lanes only) */}
        {laidOut.filter(ev => ev._lane < MAX_VISIBLE_LANES).map(ev => {
          const cal = calendarsById.get(ev.calendar_id)
          const cls = colorClassesFor(cal?.color || 'blue').block
          const start = new Date(ev.starts_at)
          const end   = new Date(ev.ends_at)
          const startMin = (start.getHours() + start.getMinutes() / 60 - DAY_START_HOUR) * HOUR_HEIGHT
          const durationMins = differenceInMinutes(end, start)
          const heightPx = Math.max(28, durationMins / 60 * HOUR_HEIGHT)
          const visibleLanes = Math.min(ev._lanes, MAX_VISIBLE_LANES)
          const widthPct = 100 / visibleLanes
          // For events ≥45min we have room to show title + time on separate lines.
          const compact = durationMins < 45
          return (
            <button
              key={ev.id}
              onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
              className={`absolute rounded-md border px-1.5 py-1 text-left leading-snug transition shadow-sm ${cls}`}
              style={{
                top: startMin + 1,
                height: heightPx - 2,
                left: `calc(${ev._lane * widthPct}% + 2px)`,
                width: `calc(${widthPct}% - 4px)`
              }}
              title={`${ev.title} · ${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`}
            >
              {compact ? (
                <div className="flex items-baseline gap-1.5 text-[11px]">
                  <span className="font-semibold opacity-70 tabular-nums shrink-0">{format(start, 'HH:mm')}</span>
                  <span className="font-semibold truncate">{ev.title}</span>
                </div>
              ) : (
                <>
                  <p className="text-[11px] font-semibold leading-tight" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ev.title}</p>
                  <p className="text-[10px] opacity-70 tabular-nums mt-0.5">{format(start, 'HH:mm')}–{format(end, 'HH:mm')}</p>
                </>
              )}
            </button>
          )
        })}

        {/* "+N more" overflow chips for slots with too many overlaps */}
        {Array.from(overflowByMinute.entries()).map(([key, evs]) => {
          const start = new Date(key)
          const startMin = (start.getHours() + start.getMinutes() / 60 - DAY_START_HOUR) * HOUR_HEIGHT
          return (
            <button
              key={`overflow-${key}`}
              onClick={(e) => { e.stopPropagation(); onEventClick(evs[0]) }}
              className="absolute right-1 rounded-full bg-valence-ink/80 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm hover:bg-valence-ink"
              style={{ top: startMin + 2, zIndex: 5 }}
              title={evs.map(e => e.title).join(' · ')}
            >
              +{evs.length}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Month view — classic 5x7 grid with event chips
// ============================================================================
function MonthView({ anchor, events, calendarsById, onEventClick }) {
  const monthStart = startOfMonth(anchor)
  const monthEnd   = endOfMonth(anchor)
  const gridStart  = weekStart(monthStart)
  const gridEnd    = weekEnd(monthEnd)
  const cells = []
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) cells.push(d)

  const eventsByDay = useMemo(() => {
    const m = new Map()
    for (const ev of events) {
      const key = format(new Date(ev.starts_at), 'yyyy-MM-dd')
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(ev)
    }
    return m
  }, [events])

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-valence-border bg-valence-surface/30 text-[11px] font-semibold uppercase tracking-wider text-valence-muted">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="px-2 py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map(d => {
          const inMonth = isSameMonth(d, anchor)
          const isToday = isSameDay(d, new Date())
          const dayEvents = eventsByDay.get(format(d, 'yyyy-MM-dd')) || []
          return (
            <div key={d.toISOString()} className={`min-h-[88px] border-b border-r border-valence-border p-1.5 ${inMonth ? 'bg-white' : 'bg-valence-surface/40'}`}>
              <div className={`text-[11px] ${isToday ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-valence-blue text-white font-bold' : inMonth ? 'text-valence-text font-semibold' : 'text-valence-subtle'}`}>{format(d, 'd')}</div>
              <ul className="mt-1 space-y-0.5">
                {dayEvents.slice(0, 3).map(ev => {
                  const cal = calendarsById.get(ev.calendar_id)
                  const cls = colorClassesFor(cal?.color || 'blue').chip
                  return (
                    <li key={ev.id}>
                      <button
                        onClick={() => onEventClick(ev)}
                        className={`w-full truncate rounded border px-1.5 py-0.5 text-left text-[10px] leading-tight ${cls}`}
                        title={ev.title}
                      >
                        {format(new Date(ev.starts_at), 'HH:mm')} {ev.title}
                      </button>
                    </li>
                  )
                })}
                {dayEvents.length > 3 && <li className="text-[10px] text-valence-subtle px-1">+{dayEvents.length - 3} more</li>}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Event detail panel — surfaces People CRM personas for matching attendees
// ============================================================================
function EventDetail({ event, calendar, people, onClose }) {
  const start = new Date(event.starts_at)
  const end   = new Date(event.ends_at)
  const cls = colorClassesFor(calendar?.color || 'blue').dot
  const attendees = attendeesWithPersonas(event, people)

  return (
    <section className="vl-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />
            <p className="text-xs text-valence-muted">{calendar?.name || 'Unknown calendar'}</p>
          </div>
          <h3 className="mt-1 text-base font-semibold text-valence-text">{event.title}</h3>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-valence-muted hover:bg-valence-surface" aria-label="Close"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="space-y-1.5 text-[12px] text-valence-muted">
        <p className="inline-flex items-center gap-1.5"><Clock className="h-3 w-3" /> {format(start, 'EEE LLL d · HH:mm')}–{format(end, 'HH:mm')}</p>
        {event.location && <p className="inline-flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {event.location}</p>}
        {event.description && <p className="text-valence-text whitespace-pre-wrap">{event.description}</p>}
      </div>
      {attendees.length > 0 && (
        <div className="space-y-2">
          <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Users className="h-3 w-3" /> Attendees</p>
          <ul className="space-y-1">
            {attendees.map((a, i) => (
              <li key={i} className="flex items-start gap-2 rounded-md border border-valence-border bg-white px-2 py-1.5">
                <div className="grid h-7 w-7 place-items-center rounded-full bg-valence-blue-soft text-[10px] font-bold text-valence-blue shrink-0">
                  {(a.name || a.email || '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-valence-text truncate">{a.name || a.email}</p>
                  {a.email && a.email !== a.name && <p className="text-[10px] text-valence-muted truncate">{a.email}</p>}
                  {a.person && (
                    <a href={`/people?open=${a.person.id}`} className="mt-1 inline-flex items-center gap-1 rounded-md border border-valence-blue/30 bg-valence-blue-soft px-1.5 py-0.5 text-[10px] font-semibold text-valence-blue">
                      <ExternalLink className="h-2.5 w-2.5" /> {a.person.role || 'Person'} · {a.person.company || 'on file'}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ============================================================================
// New event form — keeps the Calendar page fully functional in demo mode
// ============================================================================
function NewEventForm({ initial, calendars, onSubmit, onCancel }) {
  const start = initial.date instanceof Date ? initial.date : new Date()
  const duration = initial.duration || 30
  const preEmails = Array.isArray(initial.attendee_emails) ? initial.attendee_emails.join(', ') : ''
  const [form, setForm] = useState({
    calendar_id: initial.calendar_id || calendars[0]?.id || '',
    title: '',
    starts_at: toLocalInput(start),
    ends_at:   toLocalInput(addMinutes(start, duration)),
    location: '',
    attendees: preEmails,
    description: ''
  })
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.calendar_id) return
    const attendees = (form.attendees || '').split(',').map(s => s.trim()).filter(Boolean).map(email => ({ email, name: email }))
    onSubmit({
      calendar_id: form.calendar_id,
      title: form.title.trim(),
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at:   new Date(form.ends_at).toISOString(),
      location:  form.location.trim() || null,
      attendees,
      description: form.description.trim() || null
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="vl-label">Title</label>
        <input className="vl-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Crescent Pharma — sell-side prep" required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="vl-label">Calendar</label>
          <select className="vl-input" value={form.calendar_id} onChange={e => set('calendar_id', e.target.value)} required>
            {calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="vl-label">Location</label>
          <input className="vl-input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="Room 4 / Zoom / coffee" />
        </div>
        <div>
          <label className="vl-label">Starts</label>
          <input className="vl-input" type="datetime-local" value={form.starts_at} onChange={e => set('starts_at', e.target.value)} required />
        </div>
        <div>
          <label className="vl-label">Ends</label>
          <input className="vl-input" type="datetime-local" value={form.ends_at} onChange={e => set('ends_at', e.target.value)} required />
        </div>
      </div>
      <div>
        <label className="vl-label">Attendees (comma-separated emails)</label>
        <input className="vl-input" value={form.attendees} onChange={e => set('attendees', e.target.value)} placeholder="arvind@crescentpharma.in, neha@valencegrowth.com" />
      </div>
      <div>
        <label className="vl-label">Notes</label>
        <WikilinkTextarea className="vl-input min-h-[80px]" value={form.description} onChange={v => set('description', v)} placeholder="Agenda, prep links, attachments to bring. Type [[ to link people / funds / mandates" />
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="vl-btn-secondary">Cancel</button>
        <button type="submit" className="vl-btn-primary"><Plus className="h-4 w-4" /> Create event</button>
      </div>
    </form>
  )
}

// Format a Date for an <input type="datetime-local"> field — needs LOCAL time
// without timezone suffix. Yes, this is the worst part of the standard.
function toLocalInput(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function endOfDay(d)   { const x = new Date(d); x.setHours(23, 59, 59, 999); return x }
function sameDayLocal(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }

// ============================================================================
// Real Google Calendar embed — uses Google's officially-iframable embed URL.
// What you see is YOUR Google Calendar (not a clone), provided you're signed
// in to that Google account in this browser. Editing inside the iframe is
// limited (Google's embed mode is read-mostly); for full editing the
// "Open in Google Calendar" button at the top opens calendar.google.com in
// a new tab.
// ============================================================================
function GoogleCalendarEmbed({ userEmail }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'
  if (!userEmail) {
    return (
      <section className="vl-card flex flex-col items-center justify-center gap-4 p-12 text-center">
        <Globe className="h-10 w-10 text-valence-blue" />
        <div>
          <p className="text-base font-semibold text-valence-text">Sign in to see your Google Calendar.</p>
          <p className="mt-2 max-w-md text-sm text-valence-muted">
            Click <b>Connect Google</b> at the top to authorise. We'll embed your real Google Calendar here so you can browse, search, and click through to the full app for editing.
          </p>
        </div>
      </section>
    )
  }
  const params = new URLSearchParams({
    src: userEmail,
    ctz: tz,
    mode: 'WEEK',
    showTitle: '0',
    showPrint: '0',
    showCalendars: '0',
    showTabs: '1',
    showTz: '0'
  })
  const src = `https://calendar.google.com/calendar/embed?${params.toString()}`
  return (
    <section className="vl-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-valence-border bg-valence-surface/50 px-4 py-3 text-[11px] text-valence-muted">
        <span className="inline-flex items-center gap-1.5"><Globe className="h-3 w-3 text-valence-blue" /> Embedded from Google Calendar — <b className="font-semibold text-valence-text">{userEmail}</b></span>
        <span>For full editing, use <a href="https://calendar.google.com" target="_blank" rel="noreferrer" className="font-semibold text-valence-blue hover:underline">Open in Google Calendar</a></span>
      </div>
      <iframe
        title="Google Calendar"
        src={src}
        className="block w-full"
        style={{ height: 760, border: 0 }}
        loading="lazy"
      />
    </section>
  )
}

// ============================================================================
// Add Google calendar form
// ============================================================================
function AddGoogleCalendarForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState({ name: '', owner_email: '', google_calendar_id: '', color: 'blue' })
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.google_calendar_id.trim()) return
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-valence-warning/30 bg-valence-warning/5 px-3 py-2 text-[12px] text-valence-warning flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>The owner must <b>share their calendar</b> with the signed-in account (Google Calendar → Settings → Share with specific people → "See all event details"). Without this, the API returns 403.</span>
      </div>

      <div>
        <label className="vl-label">Display name</label>
        <input className="vl-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Vikram Patel" required autoFocus />
      </div>

      <div>
        <label className="vl-label">Owner email <span className="text-valence-subtle">(for slot finder + UI)</span></label>
        <input type="email" className="vl-input" value={form.owner_email} onChange={e => set('owner_email', e.target.value)} placeholder="vikram@valencegrowth.com" />
      </div>

      <div>
        <label className="vl-label">Google Calendar ID</label>
        <input className="vl-input font-mono text-[12px]" value={form.google_calendar_id} onChange={e => set('google_calendar_id', e.target.value)} placeholder="vikram@valencegrowth.com  or  c_abc123@group.calendar.google.com" required />
        <p className="mt-1 text-[11px] text-valence-muted">
          For a primary calendar, this is the user's email. For a shared / secondary calendar, it's the long ID ending in <code>@group.calendar.google.com</code> (Google Calendar → Settings → the calendar → "Integrate calendar").
        </p>
      </div>

      <div>
        <label className="vl-label">Colour</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {CALENDAR_COLOR_PALETTE.map(c => (
            <button
              type="button"
              key={c}
              onClick={() => set('color', c)}
              className={`h-7 w-7 rounded-full border-2 transition ${colorClassesFor(c).dot} ${form.color === c ? 'ring-2 ring-offset-2 ring-valence-blue' : 'opacity-70 hover:opacity-100'}`}
              aria-label={c}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="vl-btn-secondary">Cancel</button>
        <button type="submit" className="vl-btn-primary"><Plus className="h-4 w-4" /> Add calendar</button>
      </div>
    </form>
  )
}
