import { useEffect, useMemo, useRef, useState } from 'react'
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
import { signInWithGoogle, signOut, GoogleAuthExpired, createCalendarEvent, listCalendarsAccessible } from '../lib/google.js'
import { useAuth } from '../hooks/useAuth.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import WikilinkTextarea from '../components/WikilinkTextarea.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Modal from '../components/Modal.jsx'
import EventComposer from '../components/EventComposer.jsx'
import { useToast } from '../components/Toast.jsx'

const VIEWS = ['Day', 'Week', 'Month']
const DURATIONS = [15, 30, 45, 60, 90, 120]

export default function Calendar() {
  const toast = useToast()
  const { googleConnected, profile, refresh: refreshAuth } = useAuth()
  const [view, setView]   = useState('Week')
  const [anchor, setAnchor] = useState(new Date())
  const [calendars, setCalendars] = useState([])
  const [events, setEvents]       = useState([])
  const [people, setPeople]       = useState([])
  const [hidden, setHidden]       = useState(new Set())  // calendar IDs to hide
  const [selectedEvent, setSelectedEvent] = useState(null)   // { event, anchor }
  const [stackedEvents, setStackedEvents] = useState(null)   // { events, anchor }
  const [composeAt, setComposeAt] = useState(null)       // Date when user clicks an empty slot (legacy local-DB flow)
  const [dragCompose, setDragCompose] = useState(null)   // { start, end } from drag-create
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState(null)
  const hiddenInitRef = useRef(false)

  // Slot finder state
  const [slotAttendees, setSlotAttendees] = useState([])
  const [slotDuration, setSlotDuration]   = useState(30)
  const [slotResults, setSlotResults]     = useState(null)

  // Google sync state
  const [syncing, setSyncing] = useState(false)
  const [showAddCal, setShowAddCal] = useState(false)
  const [showImport, setShowImport] = useState(false)

  useEffect(() => { load() }, [])

  // Auto-sync: if there are eligible calendars (have a google_calendar_id,
  // are active) that have never been synced, kick off an initial sync so
  // the user doesn't have to hunt for the "Sync now" button. Runs once
  // per page load when Google is connected.
  const autoSyncRef = useRef(false)
  useEffect(() => {
    if (autoSyncRef.current) return
    if (!googleConnected) return
    if (!calendars || calendars.length === 0) return
    const unsynced = calendars.filter(c => c.is_active && c.google_calendar_id && !c.last_synced_at)
    if (unsynced.length === 0) return
    autoSyncRef.current = true
    syncFromGoogle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendars, googleConnected])

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

  // Default visibility: only the current user's own calendar visible on first
  // load. Everyone else is unticked and the user opts them in from the right
  // rail. If the user's email doesn't match any calendar owner (demo mode,
  // unsigned-in), leave the default of "show everything" alone.
  useEffect(() => {
    if (hiddenInitRef.current) return
    if (calendars.length === 0) return
    hiddenInitRef.current = true
    const myEmail = profile?.email?.toLowerCase()
    if (!myEmail) return
    const mine = calendars.find(c => (c.owner_email || '').toLowerCase() === myEmail)
    if (!mine) return
    setHidden(new Set(calendars.filter(c => c.id !== mine.id).map(c => c.id)))
  }, [calendars, profile?.email])

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

  function looksLikeEmail(s) {
    return /@/.test(s || '') && !/@group\.calendar\.google\.com$/.test(s)
  }

  // Bulk-import calendars the signed-in user has access to (their own primary
  // + every calendar shared with them). One round-trip to Google replaces the
  // "type the calendar ID by hand for every team-member" friction.
  async function bulkImportCalendars(picks) {
    if (!isSupabaseConfigured) {
      toast.error('Connect Supabase to import calendars.')
      return
    }
    const existing = new Set(calendars.map(c => (c.google_calendar_id || '').toLowerCase()).filter(Boolean))
    const palette = ['blue', 'emerald', 'violet', 'amber', 'rose', 'cyan', 'orange']
    const rows = picks
      .filter(p => !existing.has(p.id.toLowerCase()))
      .map((p, i) => ({
        name:               p.summary,
        owner_email:        looksLikeEmail(p.id) ? p.id : null,
        google_calendar_id: p.id,
        color:              palette[(calendars.length + i) % palette.length],
        is_active:          true
      }))
    if (rows.length === 0) {
      toast.info('All those calendars are already added.')
      setShowImport(false)
      return
    }
    const { data, error } = await supabase.from('team_calendars').insert(rows).select()
    if (error) return toast.error(error.message)
    setCalendars(prev => [...prev, ...(data || [])])
    setShowImport(false)
    toast.success(`Imported ${data?.length || 0} calendar${data?.length === 1 ? '' : 's'} — running first sync…`)
    // Kick off an immediate sync so the new rows show events rather than
    // empty columns until the user manually clicks Sync.
    if (data?.length) syncFromGoogle()
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
    if (view === 'Day')  return format(anchor, 'EEEE · d MMM yyyy')
    if (view === 'Week') return `${format(weekStart(anchor), 'd MMM')} – ${format(weekEnd(anchor), 'd MMM yyyy')}`
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
              <button onClick={() => setShowImport(true)} className="vl-btn-primary text-xs">
                <Sparkles className="h-3.5 w-3.5" /> Import from Google
              </button>
              <button onClick={syncFromGoogle} disabled={syncing} className="vl-btn-secondary text-xs disabled:opacity-50 disabled:cursor-not-allowed">
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync now'}
              </button>
              <button onClick={() => setShowAddCal(true)} className="vl-btn-ghost text-xs">
                <Plus className="h-3.5 w-3.5" /> Add manually
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
          <div className="inline-flex items-center rounded-full border border-valence-border bg-valence-elevated p-0.5">
            {VIEWS.map(v => (
              <button key={v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${view === v ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      {googleConnected && profile?.email && (
        <div className="rounded-lg border border-valence-success/30 bg-valence-success/5 px-4 py-2 text-[12px] text-valence-success">
          Signed in as <b>{profile.email}</b>. Drag any empty slot on the grid to create an event with Google Calendar invites.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        {/* Team overlay grid */}
        <section className="vl-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-valence-border bg-valence-surface/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <button onClick={() => shiftAnchor(-1)} className="rounded-md border border-valence-border bg-valence-elevated p-1.5 text-valence-muted hover:text-valence-text"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={() => setAnchor(new Date())} className="rounded-md border border-valence-border bg-valence-elevated px-3 py-1 text-[11px] font-semibold text-valence-text hover:bg-valence-surface">Today</button>
              <button onClick={() => shiftAnchor(1)}  className="rounded-md border border-valence-border bg-valence-elevated p-1.5 text-valence-muted hover:text-valence-text"><ChevronRight className="h-4 w-4" /></button>
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
            <MonthView anchor={anchor} events={visibleEvents} calendarsById={calendarsById} onEventClick={(ev, anchorRect) => setSelectedEvent({ event: ev, anchor: anchorRect })} />
          ) : (
            <TimeGrid
              view={view}
              anchor={anchor}
              calendars={visibleCalendars}
              events={eventsInView}
              calendarsById={calendarsById}
              onEventClick={(ev, anchorRect) => setSelectedEvent({ event: ev, anchor: anchorRect })}
              onStackClick={(evs, anchorRect) => setStackedEvents({ events: evs, anchor: anchorRect })}
              onSlotClick={(date, calId) => setComposeAt({ date, calendar_id: calId })}
              onDragCreate={(start, end) => {
                if (!googleConnected) {
                  setComposeAt({ date: start, calendar_id: visibleCalendars[0]?.id })
                  return
                }
                setDragCompose({ start, end })
              }}
            />
          )}
        </section>

        {/* Right rail */}
        <aside className="space-y-5">
          {/* Calendar visibility */}
          <section className="vl-card p-4">
            <p className="vl-eyebrow-ink">Calendars</p>
            <ul className="mt-2 space-y-1.5">
              {calendars.map(c => {
                const cls = colorClassesFor(c.color).dot
                const checked = c.is_active && !hidden.has(c.id)
                const status = c.last_sync_status
                return (
                  <li key={c.id} className="rounded-md px-2 py-1 hover:bg-valence-surface">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex flex-1 items-center gap-2 cursor-pointer min-w-0">
                        <input type="checkbox" className="h-3.5 w-3.5 accent-valence-blue" checked={checked} onChange={() => toggleHidden(c.id)} disabled={!c.is_active} />
                        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${cls}`} />
                        <span className="text-sm text-valence-text truncate">{c.name}</span>
                      </label>
                      {!c.is_active && <span className="text-[10px] text-valence-subtle shrink-0">paused</span>}
                      {c.is_active && status === 'ok' && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-valence-success shrink-0" title={c.last_synced_at ? `Synced ${format(new Date(c.last_synced_at), 'd MMM HH:mm')}` : 'Synced'}>
                          ✓ Synced
                        </span>
                      )}
                      {c.is_active && status === 'forbidden' && (
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-valence-warning/40 bg-valence-warning/10 px-1.5 py-0 text-[9px] font-semibold text-valence-warning shrink-0" title={`${c.name} hasn't shared their calendar with the signed-in account. Ask them to: Google Calendar → Settings → Share with specific people → See all event details.`}>
                          ⚠ Not shared
                        </span>
                      )}
                      {c.is_active && status === 'auth_expired' && (
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-valence-danger/40 bg-valence-danger/10 px-1.5 py-0 text-[9px] font-semibold text-valence-danger shrink-0" title="Google session expired — reconnect.">
                          ⚠ Reconnect
                        </span>
                      )}
                      {c.is_active && status === 'error' && (
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-valence-danger/40 bg-valence-danger/10 px-1.5 py-0 text-[9px] font-semibold text-valence-danger shrink-0" title={c.last_sync_error || 'Sync failed'}>
                          ⚠ Error
                        </span>
                      )}
                      {c.is_active && c.google_calendar_id && !status && (
                        <span className="text-[9px] text-valence-subtle shrink-0">never synced</span>
                      )}
                    </div>
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
                      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition ${active ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text' : 'border-valence-border bg-valence-elevated text-valence-muted hover:text-valence-text'}`}
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
                        <li key={i} className="flex items-center justify-between gap-2 rounded-md bg-valence-elevated border border-valence-border px-2 py-1 text-[11px]">
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

        </aside>
      </div>

      {/* Event popover — appears at the click position rather than the right rail
          so the partner doesn't have to hunt in the corner. */}
      {selectedEvent && (
        <EventPopover
          event={selectedEvent.event}
          anchor={selectedEvent.anchor}
          calendar={calendarsById.get(selectedEvent.event.calendar_id)}
          people={people}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* Stacked-events popover — every event at a slot, each with full details
          (title, calendar, time, location, description, attendees with personas)
          visible inline. No drill-down. */}
      {stackedEvents && (
        <StackedEventsPopover
          events={stackedEvents.events}
          anchor={stackedEvents.anchor}
          calendarsById={calendarsById}
          people={people}
          onClose={() => setStackedEvents(null)}
        />
      )}

      {/* Drag-create composer — Google-style modal, writes to Google Calendar */}
      {dragCompose && (
        <EventComposer
          range={dragCompose}
          onClose={() => setDragCompose(null)}
          onSave={async (payload) => {
            try {
              await createCalendarEvent({
                title:       payload.title,
                description: payload.description,
                location:    payload.location,
                start:       dragCompose.start,
                end:         dragCompose.end,
                attendees:   payload.attendees,
                withMeet:    payload.withMeet
              })
              toast.success(payload.attendees.length > 0 ? 'Event saved · invites sent' : 'Event saved')
              setDragCompose(null)
              if (googleConnected) syncFromGoogle()
            } catch (err) {
              if (err instanceof GoogleAuthExpired) toast.error('Google session expired. Reconnect Google.')
              else toast.error(err?.message || 'Could not create event')
            }
          }}
        />
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

      {/* Bulk import modal — lists every calendar Google says this user can
          access, lets them tick which to add. No typing required. */}
      <Modal
        open={showImport}
        onClose={() => setShowImport(false)}
        title="Import from Google"
        description="These are the calendars you already have access to. Tick the ones to add to the team overlay — first sync runs automatically."
        size="md"
      >
        <ImportCalendarsForm
          existingIds={calendars.map(c => (c.google_calendar_id || '').toLowerCase()).filter(Boolean)}
          onImport={bulkImportCalendars}
          onCancel={() => setShowImport(false)}
        />
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

function TimeGrid({ view, anchor, calendars, events, calendarsById, onEventClick, onStackClick, onSlotClick, onDragCreate }) {
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
              onStackClick={onStackClick}
              onSlotClick={onSlotClick}
              onDragCreate={onDragCreate}
              totalHeight={totalHeight}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DayColumn({ date, events, calendars, calendarsById, onEventClick, onStackClick, onSlotClick, onDragCreate, totalHeight }) {
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

      {/* Hour gridlines (visual) + drag-create layer */}
      <div className="relative" style={{ height: totalHeight }}>
        {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => (
          <div
            key={i}
            className="absolute inset-x-0 border-b border-valence-border/40 pointer-events-none"
            style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
          />
        ))}
        <DragCreateLayer
          date={date}
          onSingleClick={hourSlot => defaultCal && onSlotClick(hourSlot, defaultCal)}
          onRange={(start, end) => onDragCreate?.(start, end)}
        />

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
              data-event-card
              onMouseDown={e => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                // If other events overlap this event's time window, surface
                // the whole stack in the popover so the user sees all of
                // them at once instead of just the one they clicked.
                const evStart = new Date(ev.starts_at)
                const evEnd   = new Date(ev.ends_at)
                const overlapping = laidOut.filter(o => {
                  if (o.id === ev.id) return false
                  const oStart = new Date(o.starts_at)
                  const oEnd   = new Date(o.ends_at)
                  return oStart < evEnd && oEnd > evStart
                })
                const rect = e.currentTarget.getBoundingClientRect()
                if (overlapping.length > 0) onStackClick?.([ev, ...overlapping], rect)
                else onEventClick(ev, rect)
              }}
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

        {/* "+N more" overflow chips for slots with too many overlaps. Clicking
            opens a popover listing every event at that slot — visible AND
            hidden — so the partner doesn't have to hunt for the +1's in a
            corner. */}
        {Array.from(overflowByMinute.entries()).map(([key, hiddenEvs]) => {
          const start = new Date(key)
          const startMin = (start.getHours() + start.getMinutes() / 60 - DAY_START_HOUR) * HOUR_HEIGHT
          // Bundle every event that overlaps this start time (visible + hidden)
          // so the popover shows the full stack.
          const stack = laidOut.filter(ev => new Date(ev.starts_at).toISOString() === key)
          return (
            <button
              key={`overflow-${key}`}
              data-event-card
              onMouseDown={e => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onStackClick?.(stack, e.currentTarget.getBoundingClientRect()) }}
              className="absolute right-1 rounded-full bg-valence-ink/80 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm hover:bg-valence-ink"
              style={{ top: startMin + 2, zIndex: 5 }}
              title="Click to see every event in this slot"
            >
              +{hiddenEvs.length}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Drag-create overlay — captures mousedown / mousemove / mouseup, snaps to
// 15-minute slots, fires onRange(start, end) on commit. A click that doesn't
// grow past a single slot falls through to onSingleClick with the hour-
// aligned date so existing slot-click flows still work.
// ============================================================================
const SLOT_MIN_FOR_DRAG = 15
const SLOT_PX_FOR_DRAG  = HOUR_HEIGHT / 4
function DragCreateLayer({ date, onSingleClick, onRange }) {
  const ref = useRef(null)
  const [drag, setDrag] = useState(null)

  function yToSlot(clientY) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return DAY_START_HOUR * 60
    const y = Math.max(0, Math.min(rect.height - 1, clientY - rect.top))
    const slots = Math.floor(y / SLOT_PX_FOR_DRAG)
    return DAY_START_HOUR * 60 + slots * SLOT_MIN_FOR_DRAG
  }

  useEffect(() => {
    if (!drag) return
    function move(e) {
      const end = yToSlot(e.clientY) + SLOT_MIN_FOR_DRAG
      setDrag(prev => prev && ({ ...prev, endMin: Math.max(prev.startMin + SLOT_MIN_FOR_DRAG, end) }))
    }
    function up(e) {
      const finalEnd = yToSlot(e.clientY) + SLOT_MIN_FOR_DRAG
      const startMin = drag.startMin
      const endMin   = Math.max(startMin + SLOT_MIN_FOR_DRAG, finalEnd)
      setDrag(null)
      const start = new Date(date); start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0)
      const end   = new Date(date); end.setHours(Math.floor(endMin / 60),   endMin % 60,   0, 0)
      if (endMin - startMin <= SLOT_MIN_FOR_DRAG) {
        // Treat as a single click at the hour the user pressed.
        const hourStart = new Date(date); hourStart.setHours(Math.floor(startMin / 60), 0, 0, 0)
        onSingleClick?.(hourStart)
      } else {
        onRange?.(start, end)
      }
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [drag, date])

  function onMouseDown(e) {
    if (e.button !== 0) return
    if (e.target.closest('[data-event-card]')) return
    const startMin = yToSlot(e.clientY)
    setDrag({ startMin, endMin: startMin + 30 })
    e.preventDefault()
  }

  return (
    <div
      ref={ref}
      onMouseDown={onMouseDown}
      className="absolute inset-0"
      style={{ cursor: 'crosshair' }}
    >
      {drag && (
        <div
          className="absolute left-1 right-1 z-30 rounded-md border-2 border-valence-blue bg-valence-blue/15 pointer-events-none"
          style={{
            top:    ((drag.startMin - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT,
            height: ((drag.endMin - drag.startMin) / 60) * HOUR_HEIGHT
          }}
        >
          <p className="px-1 py-0.5 text-[10px] font-semibold text-valence-blue">
            {String(Math.floor(drag.startMin / 60)).padStart(2, '0')}:{String(drag.startMin % 60).padStart(2, '0')}
            {' – '}
            {String(Math.floor(drag.endMin / 60)).padStart(2, '0')}:{String(drag.endMin % 60).padStart(2, '0')}
          </p>
        </div>
      )}
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
            <div key={d.toISOString()} className={`min-h-[88px] border-b border-r border-valence-border p-1.5 ${inMonth ? 'bg-valence-elevated' : 'bg-valence-surface/40'}`}>
              <div className={`text-[11px] ${isToday ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-valence-blue text-white font-bold' : inMonth ? 'text-valence-text font-semibold' : 'text-valence-subtle'}`}>{format(d, 'd')}</div>
              <ul className="mt-1 space-y-0.5">
                {dayEvents.slice(0, 3).map(ev => {
                  const cal = calendarsById.get(ev.calendar_id)
                  const cls = colorClassesFor(cal?.color || 'blue').chip
                  return (
                    <li key={ev.id}>
                      <button
                        onClick={(e) => onEventClick(ev, e.currentTarget.getBoundingClientRect())}
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
// Floating popover anchored near the click target. Constrains itself to the
// viewport so it never spills off-screen. Closes on click-outside or Escape.
// ============================================================================
const POPOVER_WIDTH = 360
function popoverPosition(anchor, height = 320, width = POPOVER_WIDTH) {
  if (!anchor) return { left: 100, top: 100 }
  const margin = 12
  const vw = typeof window !== 'undefined' ? window.innerWidth  : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  // Prefer placing the popover to the right of the event card; flip left if
  // there's no room.
  let left = anchor.right + 8
  if (left + width + margin > vw) left = Math.max(margin, anchor.left - width - 8)
  let top = anchor.top
  if (top + height + margin > vh) top = Math.max(margin, vh - height - margin)
  return { left, top }
}

function ClickAwayOverlay({ onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return <div className="fixed inset-0 z-40" onMouseDown={onClose} />
}

// Single-event popover — surfaces People CRM personas for matching attendees.
function EventPopover({ event, anchor, calendar, people, onClose }) {
  const start = new Date(event.starts_at)
  const end   = new Date(event.ends_at)
  const cls = colorClassesFor(calendar?.color || 'blue').dot
  const attendees = attendeesWithPersonas(event, people)
  const pos = popoverPosition(anchor, 380)

  return (
    <>
      <ClickAwayOverlay onClose={onClose} />
      <div
        className="fixed z-50 rounded-2xl border border-valence-border bg-valence-elevated shadow-2xl"
        style={{ left: pos.left, top: pos.top, width: 'min(' + POPOVER_WIDTH + 'px, calc(100vw - 24px))', maxHeight: '70vh', overflowY: 'auto' }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />
              <p className="text-xs text-valence-muted truncate">{calendar?.name || 'Unknown calendar'}</p>
            </div>
            <h3 className="mt-1 text-base font-semibold text-valence-text">{event.title}</h3>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-valence-muted hover:bg-valence-surface" aria-label="Close"><X className="h-3.5 w-3.5" /></button>
        </div>
        <div className="px-5 pb-4 space-y-3">
          <div className="space-y-1.5 text-[12px] text-valence-muted">
            <p className="inline-flex items-center gap-1.5"><Clock className="h-3 w-3" /> {format(start, 'EEE LLL d · HH:mm')}–{format(end, 'HH:mm')}</p>
            {event.location && <p className="inline-flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {event.location}</p>}
            {event.description && <p className="text-valence-text whitespace-pre-wrap">{event.description}</p>}
          </div>
          {attendees.length > 0 && (
            <div className="space-y-2">
              <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Users className="h-3 w-3" /> Attendees ({attendees.length})</p>
              <ul className="space-y-1">
                {attendees.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-md border border-valence-border bg-valence-elevated px-2 py-1.5">
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
        </div>
      </div>
    </>
  )
}

// Stacked-events popover — fires when the +N overflow chip is clicked. Lists
// every event at that slot (visible + hidden). Each row click drills into the
// single-event popover.
// Stacked-events popover — shows every overlapping event's full detail card
// at once. No drill-down: title, calendar, time, location, description and
// attendees with persona chips for every event live in the same scrollable
// popover so the user sees who's meeting with whom at this slot in one shot.
function StackedEventsPopover({ events, calendarsById, people, onClose }) {
  // Centered on the viewport — when you have 3 parallel meetings to read,
  // the user shouldn't have to chase the popover into a corner.
  return (
    <>
      <ClickAwayOverlay onClose={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-valence-border bg-valence-elevated shadow-2xl"
        style={{ width: 'min(520px, calc(100vw - 32px))', maxHeight: '80vh', overflowY: 'auto' }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 pt-4 pb-3 border-b border-valence-border bg-white/95 backdrop-blur">
          <p className="text-sm font-semibold text-valence-text">{events.length} events at this slot</p>
          <button onClick={onClose} className="rounded-md p-1 text-valence-muted hover:bg-valence-surface" aria-label="Close"><X className="h-3.5 w-3.5" /></button>
        </div>
        <div className="px-5 py-3 space-y-4 divide-y divide-valence-border/60">
          {events.map((ev, idx) => {
            const cal = calendarsById.get(ev.calendar_id)
            const dot = colorClassesFor(cal?.color || 'blue').dot
            const start = new Date(ev.starts_at)
            const end   = new Date(ev.ends_at)
            const attendees = attendeesWithPersonas(ev, people || [])
            return (
              <div key={ev.id} className={`space-y-2 ${idx > 0 ? 'pt-4' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                  <p className="text-[11px] text-valence-muted truncate">{cal?.name || 'Unknown calendar'}</p>
                </div>
                <h3 className="text-base font-semibold text-valence-text">{ev.title || '(no title)'}</h3>
                <div className="space-y-1 text-[12px] text-valence-muted">
                  <p className="inline-flex items-center gap-1.5"><Clock className="h-3 w-3" /> {format(start, 'EEE LLL d · HH:mm')}–{format(end, 'HH:mm')}</p>
                  {ev.location && <p className="inline-flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {ev.location}</p>}
                  {ev.description && <p className="text-valence-text whitespace-pre-wrap text-[12px]">{ev.description}</p>}
                </div>
                {attendees.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Users className="h-3 w-3" /> Attendees ({attendees.length})</p>
                    <ul className="space-y-1">
                      {attendees.map((a, i) => (
                        <li key={i} className="flex items-start gap-2 rounded-md border border-valence-border bg-valence-elevated px-2 py-1.5">
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
              </div>
            )
          })}
        </div>
      </div>
    </>
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

// Bulk import — list every Google calendar accessible to the signed-in user,
// let them tick which to add. Skips ones already registered. The toast +
// auto-sync handshake happens in the parent's bulkImportCalendars handler.
function ImportCalendarsForm({ existingIds, onImport, onCancel }) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [items, setItems]     = useState([])
  const [picked, setPicked]   = useState(new Set())
  const existingSet = useMemo(() => new Set((existingIds || []).map(s => s.toLowerCase())), [existingIds])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    listCalendarsAccessible()
      .then(list => {
        if (cancelled) return
        setItems(list)
        // Auto-tick the ones the user hasn't added yet. They can untick noise
        // (Holidays in India, contacts birthdays, etc).
        const next = new Set()
        for (const c of list) {
          if (!existingSet.has(c.id.toLowerCase())) next.add(c.id)
        }
        setPicked(next)
      })
      .catch(err => {
        if (cancelled) return
        if (err instanceof GoogleAuthExpired) setError('Google session expired. Reconnect Google.')
        else setError(err?.message || 'Could not list calendars')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [existingSet])

  function toggle(id) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function submit(e) {
    e.preventDefault()
    if (picked.size === 0) {
      toast.error('Pick at least one calendar.')
      return
    }
    const rows = items.filter(c => picked.has(c.id))
    await onImport(rows)
  }

  if (loading) return <div className="py-8 text-center text-sm text-valence-muted">Loading your calendars from Google…</div>
  if (error)   return <div className="py-8 text-center text-sm text-valence-danger">{error}</div>
  if (items.length === 0) return <div className="py-8 text-center text-sm text-valence-muted">No calendars found.</div>

  return (
    <form onSubmit={submit} className="space-y-3">
      <ul className="max-h-[55vh] overflow-y-auto divide-y divide-valence-border/60 rounded-lg border border-valence-border bg-valence-elevated">
        {items.map(c => {
          const already = (existingIds || []).map(s => s.toLowerCase()).includes(c.id.toLowerCase())
          const checked = picked.has(c.id)
          return (
            <li key={c.id}>
              <label className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition ${already ? 'opacity-60' : 'hover:bg-valence-surface/60'}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={already}
                  onChange={() => toggle(c.id)}
                  className="mt-1 h-4 w-4 rounded border-valence-border"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-valence-text">{c.summary}</p>
                    {c.primary && <span className="rounded-full bg-valence-blue-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-valence-blue">Primary</span>}
                    {already && <span className="text-[10px] text-valence-subtle">already added</span>}
                  </div>
                  <p className="truncate text-[10px] text-valence-subtle font-mono">{c.id}</p>
                  <p className="mt-0.5 text-[10px] text-valence-muted">Access: {c.accessRole}</p>
                </div>
              </label>
            </li>
          )
        })}
      </ul>
      <p className="text-[11px] text-valence-muted">
        Tip: if a team-member's calendar isn't here, they need to share it with you in Google Calendar
        (Settings → Share with specific people → "See all event details"), then come back and re-open this modal.
      </p>
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-valence-border">
        <button type="button" onClick={onCancel} className="vl-btn-secondary">Cancel</button>
        <button type="submit" disabled={picked.size === 0} className="vl-btn-primary">
          <Sparkles className="h-4 w-4" /> Import {picked.size > 0 ? `${picked.size} calendar${picked.size === 1 ? '' : 's'}` : ''}
        </button>
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
