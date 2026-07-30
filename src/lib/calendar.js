// Calendar helpers — split into two concerns:
//   1. The legacy "Add to Google" URL builder (used by Day Planner).
//   2. The Phase 3.3 team-calendar overlay: week math, slot finding,
//      attendee → People CRM matching, and demo data.

import { startOfWeek, endOfWeek, startOfDay, endOfDay, addMinutes, addDays, isWithinInterval, max as maxDate, min as minDate, isBefore } from 'date-fns'
import { listEventsBetween, GoogleAuthExpired } from './google.js'
import { supabase, isSupabaseConfigured } from './supabase.js'

// ============================================================================
// Legacy: Google "Add to calendar" deep-link builder
// ============================================================================
function pad(n) { return String(n).padStart(2, '0') }

function toGcalDate(date, time, durationMin = 30) {
  // date: 'YYYY-MM-DD', time: 'HH:MM'
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm]  = time.split(':').map(Number)
  const start = new Date(y, m - 1, d, hh, mm)
  const end   = new Date(start.getTime() + durationMin * 60 * 1000)
  const fmt = (dt) =>
    `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`
  return `${fmt(start)}/${fmt(end)}`
}

export function googleCalendarUrl({ title, date, time, attendeeEmail, details }) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: toGcalDate(date, time),
    details: details || '',
    add: attendeeEmail || ''
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

// ============================================================================
// Phase 3.3 — Team Calendar overlay
// ============================================================================
export function weekStart(date)           { return startOfWeek(date, { weekStartsOn: 1 }) } // Mon
export function weekEnd(date)             { return endOfWeek(date,   { weekStartsOn: 1 }) }
export function dayStart(date, hour = 0)  { const d = startOfDay(date); d.setHours(hour); return d }
export function dayEnd(date, hour = 24)   {
  if (hour === 24) return endOfDay(date)
  const d = startOfDay(date); d.setHours(hour); return d
}

// Default working hours for the slot finder. Indian bankers run 09:00–20:00
// most days; tweak via the `workingHours` arg if needed.
export const DEFAULT_WORKING_HOURS = { start: 9, end: 20 }

// Find common free slots when ALL of the requested calendars are free in
// the given date range, of the given duration, within working hours.
export function findCommonFreeSlots({ busyByCalendarId, calendarIds, durationMinutes = 30, from, to, workingHours = DEFAULT_WORKING_HOURS, stepMinutes = 30 }) {
  if (!calendarIds?.length || !from || !to || !durationMinutes) return []
  const slots = []
  let cursor = new Date(from)
  const end = new Date(to)

  while (cursor < end) {
    const d = startOfDay(cursor)
    const workStart = new Date(d); workStart.setHours(workingHours.start, 0, 0, 0)
    const workEnd   = new Date(d); workEnd.setHours(workingHours.end,   0, 0, 0)
    let slotStart = workStart < cursor ? cursor : workStart
    while (slotStart.getTime() + durationMinutes * 60_000 <= workEnd.getTime()) {
      const slotEnd = addMinutes(slotStart, durationMinutes)
      const everyoneFree = calendarIds.every(cid => {
        const busy = busyByCalendarId.get(cid) || []
        return !busy.some(b => intervalsOverlap(slotStart, slotEnd, new Date(b.starts_at), new Date(b.ends_at)))
      })
      if (everyoneFree) slots.push({ start: new Date(slotStart), end: slotEnd })
      slotStart = addMinutes(slotStart, stepMinutes)
    }
    cursor = startOfDay(addDays(d, 1))
  }
  return slots
}

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd
}

export function groupBusyByCalendar(events) {
  const map = new Map()
  for (const ev of events || []) {
    if (!map.has(ev.calendar_id)) map.set(ev.calendar_id, [])
    map.get(ev.calendar_id).push(ev)
  }
  return map
}

// Place overlapping events side-by-side. Each event gets `_lane` (0..n-1)
// and `_lanes` (total parallel columns) so the renderer can position them.
export function layoutDayColumn(events) {
  const sorted = [...(events || [])].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  const lanes = []
  const out = []
  for (const ev of sorted) {
    const start = new Date(ev.starts_at)
    const end   = new Date(ev.ends_at)
    let placedLane = -1
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] <= start.getTime()) { placedLane = i; lanes[i] = end.getTime(); break }
    }
    if (placedLane === -1) { lanes.push(end.getTime()); placedLane = lanes.length - 1 }
    out.push({ ...ev, _lane: placedLane })
  }
  const total = Math.max(1, lanes.length)
  return out.map(ev => ({ ...ev, _lanes: total }))
}

// Calendar colors — one of these per team calendar.
export const CALENDAR_COLOR_PALETTE = ['blue', 'emerald', 'violet', 'amber', 'rose', 'cyan', 'orange', 'lime']

export function colorClassesFor(name) {
  const map = {
    blue:    { dot: 'bg-valence-blue',    chip: 'bg-valence-blue-soft text-valence-blue border-valence-blue/30',  block: 'bg-valence-blue/15 text-valence-blue border-valence-blue/40 hover:bg-valence-blue/25' },
    emerald: { dot: 'bg-emerald-500',     chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',              block: 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200' },
    violet:  { dot: 'bg-violet-500',      chip: 'bg-violet-50 text-violet-700 border-violet-200',                 block: 'bg-violet-100 text-violet-800 border-violet-300 hover:bg-violet-200' },
    amber:   { dot: 'bg-amber-500',       chip: 'bg-amber-50 text-amber-800 border-amber-200',                    block: 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200' },
    rose:    { dot: 'bg-rose-500',        chip: 'bg-rose-50 text-rose-700 border-rose-200',                       block: 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200' },
    cyan:    { dot: 'bg-cyan-500',        chip: 'bg-cyan-50 text-cyan-700 border-cyan-200',                       block: 'bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-200' },
    orange:  { dot: 'bg-orange-500',      chip: 'bg-orange-50 text-orange-700 border-orange-200',                 block: 'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200' },
    lime:    { dot: 'bg-lime-500',        chip: 'bg-lime-50 text-lime-700 border-lime-200',                       block: 'bg-lime-100 text-lime-800 border-lime-300 hover:bg-lime-200' }
  }
  return map[name] || map.blue
}

// People CRM crosswalk — when an event has an attendee email matching a
// person row (case-insensitive), surface the persona alongside the event.
// The People table column is `email` (not `email_primary`).
export function personByEmail(people, email) {
  if (!email) return null
  const needle = email.toLowerCase().trim()
  return (people || []).find(p => (p.email || '').toLowerCase().trim() === needle) || null
}

export function attendeesWithPersonas(event, people) {
  const list = Array.isArray(event?.attendees) ? event.attendees : []
  return list.map(a => {
    const email = typeof a === 'string' ? a : a?.email
    const name  = typeof a === 'string' ? a : (a?.name || a?.email)
    return { email, name, person: personByEmail(people, email) }
  })
}

// ============================================================================
// Demo data — pre-seeded so the page renders without Supabase
// ============================================================================
const NOW = new Date()
const MONDAY = weekStart(NOW)

function ev(calendar_id, dayOffset, hour, minute, durationMinutes, title, attendees = [], extras = {}) {
  const start = new Date(MONDAY)
  start.setDate(start.getDate() + dayOffset)
  start.setHours(hour, minute, 0, 0)
  const end = addMinutes(start, durationMinutes)
  return {
    id: `demo-ev-${calendar_id}-${dayOffset}-${hour}-${minute}`,
    calendar_id, title,
    starts_at: start.toISOString(),
    ends_at:   end.toISOString(),
    attendees,
    ...extras
  }
}

export const DEMO_TEAM_CALENDARS = [
  { id: 'cal-vk',   name: 'Vikram Patel', owner_email: 'vikram@valencegrowth.com', color: 'blue',    is_active: true,  lead_owner: 'Vikram Patel',  google_calendar_id: null },
  { id: 'cal-nj',   name: 'Neha Jain',    owner_email: 'neha@valencegrowth.com',   color: 'emerald', is_active: true,  lead_owner: 'Neha Jain',     google_calendar_id: null },
  { id: 'cal-rg',   name: 'Rohan Gupta',  owner_email: 'rohan@valencegrowth.com',  color: 'violet',  is_active: true,  lead_owner: 'Rohan Gupta',   google_calendar_id: null },
  { id: 'cal-pn',   name: 'Priya Sharma', owner_email: 'priya@valencegrowth.com',  color: 'amber',   is_active: true,  lead_owner: 'Priya Sharma',  google_calendar_id: null },
  { id: 'cal-firm', name: 'Firm-wide',    owner_email: 'firm@valencegrowth.com',   color: 'rose',    is_active: false, lead_owner: null,            google_calendar_id: null }
]

export const DEMO_CALENDAR_EVENTS = [
  // Monday
  ev('cal-vk', 0,  9, 30,  60, 'Pipeline review (internal)',           [{ email: 'neha@valencegrowth.com', name: 'Neha Jain' }, { email: 'rohan@valencegrowth.com', name: 'Rohan Gupta' }]),
  ev('cal-vk', 0, 11,  0,  90, 'Crescent Pharma — sell-side prep',     [{ email: 'arvind@crescentpharma.in', name: 'Arvind Kulkarni' }]),
  ev('cal-vk', 0, 14,  0,  60, 'Brookfield catch-up',                  [{ email: 'sara.menon@brookfield.com', name: 'Sara Menon' }]),
  ev('cal-vk', 0, 16, 30,  45, 'Mandate sync — Orion Realty',          [{ email: 'priya@valencegrowth.com', name: 'Priya Sharma' }]),

  ev('cal-nj', 0,  9, 30,  60, 'Pipeline review (internal)',           [{ email: 'vikram@valencegrowth.com', name: 'Vikram Patel' }]),
  ev('cal-nj', 0, 11, 30,  60, 'Veda Biotech — IM walkthrough',        [{ email: 'foundr@vedabio.in', name: 'Veda Founders' }]),
  ev('cal-nj', 0, 15,  0,  30, 'Fee letter sign-off — Crescent',       []),

  ev('cal-rg', 0,  9, 30,  60, 'Pipeline review (internal)',           [{ email: 'vikram@valencegrowth.com', name: 'Vikram Patel' }]),
  ev('cal-rg', 0, 13,  0,  60, 'Arclight Capital — investor call',     []),
  ev('cal-rg', 0, 17,  0,  60, 'Drafting — Veda teaser',               []),

  ev('cal-pn', 0, 10,  0,  90, 'Kavya Foods — vendor diligence',       []),
  ev('cal-pn', 0, 16,  0,  60, 'HoV Mushrooms — Dubai distribution',   [{ email: 'trishant@hov.in', name: 'Trishant Patel' }]),

  // Tuesday
  ev('cal-vk', 1,  9,  0,  60, 'Quantum Edge — anchor investor call',  [{ email: 'mark.stern@premjiinvest.com', name: 'Mark Stern' }]),
  ev('cal-vk', 1, 14,  0, 120, 'Helios Infra — SPA negotiation',       [{ email: 'priya@valencegrowth.com', name: 'Priya Sharma' }, { email: 'rishi@valencegrowth.com', name: 'Rishi Kapoor' }]),

  ev('cal-nj', 1, 10, 30,  60, 'Crescent Pharma — buyer outreach prep', []),
  ev('cal-nj', 1, 15,  0,  60, 'OFR — counsel sync',                   []),

  ev('cal-rg', 1, 11,  0,  60, 'Saffron Studios — slate model review', [{ email: 'manav@saffronstudios.in', name: 'Manav Kapoor' }]),
  ev('cal-rg', 1, 16,  0,  60, 'Quantum Edge — investor decks',        []),

  ev('cal-pn', 1,  9, 30,  60, 'Day-zero planning',                    []),
  ev('cal-pn', 1, 13,  0,  90, 'HoV — D2C → B2B working session',      [{ email: 'trishant@hov.in', name: 'Trishant Patel' }]),

  // Wednesday — slot-finder favorite (real common gaps)
  ev('cal-vk', 2, 11,  0,  30, 'Polaris Energy — investor call',       []),
  ev('cal-nj', 2, 11, 30,  60, 'Arvind — relationship building',       [{ email: 'arvind@crescentpharma.in', name: 'Arvind Kulkarni' }]),
  ev('cal-rg', 2, 14,  0,  60, 'Veda — sector research',               []),
  ev('cal-pn', 2, 10,  0,  60, 'Saffron Studios — partner sync',       []),

  // Thursday
  ev('cal-vk', 3, 10,  0,  60, 'Brookfield exit prep — Orion',         [{ email: 'sara.menon@brookfield.com', name: 'Sara Menon' }]),
  ev('cal-vk', 3, 15,  0,  90, 'Quantum Edge — prospect Q&A',          []),

  ev('cal-nj', 3, 11,  0,  60, 'Crescent Pharma — buyer outreach',     []),
  ev('cal-nj', 3, 14,  0,  30, 'Bain Capital intro',                   [{ email: 'rohit.bain@bain.com', name: 'Rohit (Bain)' }]),

  ev('cal-rg', 3,  9, 30,  60, 'Quantum Edge — anchor decks',          []),
  ev('cal-rg', 3, 16,  0,  60, 'Sector deep dive — Renewables',        []),

  ev('cal-pn', 3, 10,  0,  90, 'Kavya Foods — distribution mapping',   []),
  ev('cal-pn', 3, 15,  0,  60, 'HoV peppers — Q-commerce intros',      []),

  // Friday — Mandate Friday morning huddle
  ev('cal-vk', 4,  9,  0,  60, 'Friday huddle — full team',            [{ email: 'neha@valencegrowth.com', name: 'Neha Jain' }, { email: 'rohan@valencegrowth.com', name: 'Rohan Gupta' }, { email: 'priya@valencegrowth.com', name: 'Priya Sharma' }]),
  ev('cal-vk', 4, 14,  0,  60, 'Investor follow-up letters',           []),

  ev('cal-nj', 4,  9,  0,  60, 'Friday huddle — full team',            []),
  ev('cal-nj', 4, 11,  0,  60, 'Veda — model review',                  []),

  ev('cal-rg', 4,  9,  0,  60, 'Friday huddle — full team',            []),
  ev('cal-rg', 4, 13,  0,  60, 'Quantum Edge — final shortlist',       []),

  ev('cal-pn', 4,  9,  0,  60, 'Friday huddle — full team',            []),
  ev('cal-pn', 4, 15,  0,  60, 'HoV — week wrap',                      [])
]

// ============================================================================
// Phase 3.4 — Real Google Calendar sync
// ============================================================================
// Pull events from a single team-member's Google Calendar between [from, to)
// and upsert them into our `calendar_events` table keyed by
// (calendar_id, google_event_id). Idempotent — calling twice produces the
// same set of rows. Throws GoogleAuthExpired when the provider token is
// missing or expired so the caller can prompt a reconnect.
//
// `cal` must be a row from team_calendars with a non-empty
// `google_calendar_id` (an email address for primary calendars or a
// `c_*@group.calendar.google.com` UID for shared / secondary calendars).
//
// Returns { upserted, removed } counts.
export async function syncCalendarFromGoogle(cal, { from, to }) {
  if (!cal?.google_calendar_id) throw new Error('Calendar has no google_calendar_id')
  if (!isSupabaseConfigured)    throw new Error('Supabase is not configured')

  const events = await listEventsBetween(from, to, cal.google_calendar_id)

  // Cancelled events come back with status === 'cancelled'; we drop them.
  const live = events.filter(e => !e.allDay && e.start && e.end && e.raw?.status !== 'cancelled')

  const rows = live.map(e => ({
    calendar_id:     cal.id,
    google_event_id: e.id,
    title:           e.summary || '(no title)',
    description:     e.description || null,
    location:        e.location || null,
    starts_at:       e.start.toISOString(),
    ends_at:         e.end.toISOString(),
    attendees:       e.attendees || []
  }))

  if (rows.length === 0) return { upserted: 0, removed: 0 }

  const { error } = await supabase
    .from('calendar_events')
    .upsert(rows, { onConflict: 'calendar_id,google_event_id' })
  if (error) throw error
  return { upserted: rows.length, removed: 0 }
}

// Classify a Google API error so the UI can show the right message. The most
// common case is a 403 — "this user hasn't shared their calendar with the
// signed-in account" — which we want to surface explicitly so the partner
// knows to chase the share request, not "something blew up".
function classifySyncError(err) {
  if (err instanceof GoogleAuthExpired) return 'auth_expired'
  const msg = String(err?.message || '')
  if (msg.includes('403') || /forbidden|not authorized|insufficient/i.test(msg)) return 'forbidden'
  if (msg.includes('404')) return 'not_found'
  return 'error'
}

async function persistSyncStatus(calendarId, status, errorMessage = null) {
  if (!isSupabaseConfigured) return
  try {
    await supabase.from('team_calendars').update({
      last_synced_at:   new Date().toISOString(),
      last_sync_status: status,
      last_sync_error:  errorMessage
    }).eq('id', calendarId)
  } catch (e) {
    console.warn('Could not persist sync status', e)
  }
}

// Sync every team_calendar row that has a google_calendar_id set, returning
// per-calendar results so the caller can surface partial success. Writes the
// per-row sync status back to team_calendars so the right rail can render
// "✓ synced 2m ago" vs "⚠️ awaiting share" without re-running the sync.
export async function syncAllGoogleCalendars(calendars, { from, to }) {
  const results = []
  for (const cal of calendars) {
    if (!cal.google_calendar_id) continue
    try {
      const r = await syncCalendarFromGoogle(cal, { from, to })
      await persistSyncStatus(cal.id, 'ok', null)
      results.push({ calendar: cal, ...r, ok: true })
    } catch (err) {
      const status = classifySyncError(err)
      await persistSyncStatus(cal.id, status, err?.message?.slice(0, 500) || null)
      results.push({ calendar: cal, ok: false, error: err, status })
      // Bail early on auth expiry — every subsequent call would fail too.
      if (status === 'auth_expired') break
    }
  }
  return results
}

// Re-export the date-fns helpers other modules might want.
export { startOfWeek, endOfWeek, startOfDay, endOfDay, addDays, addMinutes, isBefore, maxDate, minDate, isWithinInterval }
