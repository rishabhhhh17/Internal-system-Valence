import { useEffect, useMemo, useRef, useState } from 'react'
import { format, addDays, addWeeks, isSameDay, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, X, MapPin, Users as UsersIcon, AlignLeft, ExternalLink, Loader2 } from 'lucide-react'
import { listEventsBetween, createCalendarEvent, GoogleAuthExpired } from '../lib/google.js'
import { useToast } from './Toast.jsx'
import Modal from './Modal.jsx'

// Google-Calendar-style day/week grid with click-drag-to-create. Drops
// any selected range straight into the user's real Google Calendar via
// the createCalendarEvent helper — sendUpdates=all on the request line
// means attendees get real invite emails. Hour rows are 56px tall and
// divided into four 15-min slots for snap-friendly drag.
//
// Tasked with: "if i wanna meet someone in here i can't just move my
// cursor and send a calendar invite". This is the cursor.

const HOUR_PX     = 56
const SLOT_PX     = HOUR_PX / 4        // 14px per 15-min slot
const WORK_START  = 7                  // first visible hour
const WORK_END    = 22                 // last visible hour (exclusive top of grid)
const HOURS       = WORK_END - WORK_START

function snapMins(y) {
  const slots = Math.max(0, Math.min(HOURS * 4 - 1, Math.floor(y / SLOT_PX)))
  return slots * 15 + WORK_START * 60
}

function minsToTop(mins) {
  return ((mins - WORK_START * 60) / 60) * HOUR_PX
}

function fmtTime(d) { return format(d, 'h:mm a') }

export default function QuickCalendar({ googleConnected, onConnect }) {
  const toast = useToast()
  const [view, setView]     = useState('week')   // 'day' | 'week'
  const [anchor, setAnchor] = useState(new Date())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [authExpired, setAuthExpired] = useState(false)
  const [drag, setDrag]     = useState(null)     // { col, startMin, endMin }
  const [composer, setComposer] = useState(null) // { start, end }
  const columnRefs = useRef([])

  const days = useMemo(() => {
    if (view === 'day') return [anchor]
    const s = startOfWeek(anchor, { weekStartsOn: 1 }) // Monday
    return Array.from({ length: 7 }, (_, i) => addDays(s, i))
  }, [view, anchor])

  useEffect(() => { if (googleConnected) load() }, [googleConnected, days[0]?.toDateString(), days[days.length - 1]?.toDateString()])

  async function load() {
    setLoading(true); setAuthExpired(false)
    try {
      const start = new Date(days[0]);              start.setHours(0, 0, 0, 0)
      const end   = new Date(days[days.length - 1]); end.setHours(23, 59, 59, 999)
      const evs = await listEventsBetween(start, end)
      setEvents(evs)
    } catch (err) {
      if (err instanceof GoogleAuthExpired) setAuthExpired(true)
      else toast.error(err?.message || 'Could not load calendar')
    } finally {
      setLoading(false)
    }
  }

  function localYInCol(e, colIdx) {
    const el = columnRefs.current[colIdx]
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return e.clientY - rect.top
  }

  function onMouseDown(e, colIdx) {
    if (e.button !== 0) return
    const y = localYInCol(e, colIdx)
    const startMin = snapMins(y)
    setDrag({ col: colIdx, startMin, endMin: startMin + 30 })
    e.preventDefault()
  }
  function onMouseMove(e) {
    if (!drag) return
    const y = localYInCol(e, drag.col)
    const endMin = snapMins(y) + 15
    setDrag(prev => prev && ({ ...prev, endMin: Math.max(prev.startMin + 15, endMin) }))
  }
  function onMouseUp() {
    if (!drag) return
    const day = days[drag.col]
    const start = new Date(day); start.setHours(Math.floor(drag.startMin / 60), drag.startMin % 60, 0, 0)
    const end   = new Date(day); end.setHours(Math.floor(drag.endMin / 60),   drag.endMin % 60,   0, 0)
    setComposer({ start, end })
    setDrag(null)
  }

  function shift(direction) {
    if (view === 'day') setAnchor(prev => addDays(prev, direction))
    else                setAnchor(prev => addWeeks(prev, direction))
  }

  async function saveEvent(payload) {
    try {
      const created = await createCalendarEvent({
        title:       payload.title,
        description: payload.description,
        start:       composer.start,
        end:         composer.end,
        attendees:   payload.attendees
      })
      toast.success(payload.attendees.length > 0 ? 'Event created · invites sent' : 'Event created')
      setComposer(null)
      // Optimistic: insert + reload from Google so the new event shows up.
      setEvents(prev => [...prev, created])
      load()
    } catch (err) {
      if (err instanceof GoogleAuthExpired) {
        toast.error('Google session expired. Reconnect Google.')
        setAuthExpired(true)
      } else {
        toast.error(err?.message || 'Could not create event')
      }
    }
  }

  if (!googleConnected) {
    return (
      <div className="vl-card p-10 text-center space-y-3">
        <p className="text-sm font-semibold text-valence-text">Connect Google to use the calendar</p>
        <p className="text-xs text-valence-muted max-w-md mx-auto">Click-drag-to-create events go straight to your real Google Calendar and send invites to attendees from your Gmail.</p>
        <button onClick={onConnect} className="vl-btn-primary">Connect Google</button>
      </div>
    )
  }

  if (authExpired) {
    return (
      <div className="vl-card p-10 text-center space-y-3">
        <p className="text-sm font-semibold text-valence-text">Google session expired</p>
        <button onClick={onConnect} className="vl-btn-primary">Reconnect Google</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setAnchor(new Date())} className="vl-btn-ghost text-xs">Today</button>
          <button onClick={() => shift(-1)} className="vl-btn-ghost p-1.5" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => shift(1)}  className="vl-btn-ghost p-1.5" aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
          <h2 className="ml-1 text-base font-semibold text-valence-text">
            {view === 'day' ? format(anchor, 'EEEE, d MMM yyyy') : `${format(days[0], 'd MMM')} – ${format(days[6], 'd MMM yyyy')}`}
          </h2>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-valence-muted" />}
        </div>
        <div className="inline-flex items-center rounded-full border border-valence-border bg-white p-0.5">
          <button onClick={() => setView('day')}  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${view === 'day'  ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`}>Day</button>
          <button onClick={() => setView('week')} className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${view === 'week' ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`}>Week</button>
        </div>
      </div>

      {/* Day-header row */}
      <div className="grid sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-valence-border" style={{ gridTemplateColumns: `60px repeat(${days.length}, 1fr)` }}>
        <div />
        {days.map((d, i) => {
          const today = isSameDay(d, new Date())
          return (
            <div key={i} className={`px-2 py-2 text-center border-l border-valence-border ${today ? 'text-valence-blue' : 'text-valence-text'}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-valence-muted">{format(d, 'EEE')}</p>
              <p className={`mt-0.5 text-base ${today ? 'font-bold' : 'font-semibold'}`}>{format(d, 'd')}</p>
            </div>
          )
        })}
      </div>

      {/* Grid body */}
      <div
        className="grid select-none overflow-auto rounded-xl border border-valence-border bg-white"
        style={{ gridTemplateColumns: `60px repeat(${days.length}, 1fr)`, maxHeight: '70vh' }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* Hour-labels column */}
        <div className="relative" style={{ height: HOURS * HOUR_PX }}>
          {Array.from({ length: HOURS }, (_, i) => (
            <div key={i} className="absolute right-2 -translate-y-1/2 text-[10px] text-valence-subtle tabular-nums" style={{ top: i * HOUR_PX }}>
              {((WORK_START + i) % 12 === 0 ? 12 : (WORK_START + i) % 12)} {WORK_START + i < 12 ? 'AM' : 'PM'}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day, colIdx) => {
          const dayEvents = events.filter(ev => ev.start && isSameDay(ev.start, day) && !ev.allDay)
          const isToday  = isSameDay(day, new Date())
          const nowMins  = isToday ? (new Date().getHours() * 60 + new Date().getMinutes()) : null
          return (
            <div
              key={colIdx}
              ref={el => (columnRefs.current[colIdx] = el)}
              className="relative border-l border-valence-border"
              style={{ height: HOURS * HOUR_PX, cursor: 'crosshair' }}
              onMouseDown={e => onMouseDown(e, colIdx)}
            >
              {/* Hour gridlines */}
              {Array.from({ length: HOURS }, (_, h) => (
                <div key={h} className="absolute left-0 right-0 border-t border-valence-border/60" style={{ top: h * HOUR_PX }} />
              ))}
              {/* Half-hour gridlines (lighter) */}
              {Array.from({ length: HOURS }, (_, h) => (
                <div key={`half-${h}`} className="absolute left-0 right-0 border-t border-valence-border/30" style={{ top: h * HOUR_PX + HOUR_PX / 2 }} />
              ))}

              {/* Today's "now" line */}
              {nowMins !== null && nowMins >= WORK_START * 60 && nowMins <= WORK_END * 60 && (
                <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: minsToTop(nowMins) }}>
                  <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-red-500" />
                  <div className="h-px bg-red-500" />
                </div>
              )}

              {/* Events */}
              {dayEvents.map(ev => {
                const startMin = ev.start.getHours() * 60 + ev.start.getMinutes()
                const endMin   = ev.end.getHours() * 60 + ev.end.getMinutes()
                const top      = minsToTop(Math.max(WORK_START * 60, startMin))
                const height   = Math.max(20, ((Math.min(WORK_END * 60, endMin) - Math.max(WORK_START * 60, startMin)) / 60) * HOUR_PX)
                return (
                  <a
                    key={ev.id}
                    href={ev.htmlLink}
                    target="_blank"
                    rel="noreferrer"
                    onMouseDown={e => e.stopPropagation()}
                    className="absolute left-1 right-1 rounded-md border-l-2 border-valence-blue bg-valence-blue-soft px-1.5 py-1 text-[11px] font-semibold text-valence-text hover:shadow-sm transition overflow-hidden"
                    style={{ top, height }}
                    title={`${ev.summary} · ${fmtTime(ev.start)} – ${fmtTime(ev.end)}`}
                  >
                    <p className="truncate">{ev.summary}</p>
                    <p className="truncate text-[9px] font-normal text-valence-muted">{fmtTime(ev.start)} – {fmtTime(ev.end)}</p>
                  </a>
                )
              })}

              {/* Drag selection */}
              {drag?.col === colIdx && (
                <div
                  className="absolute left-1 right-1 z-30 rounded-md border-2 border-valence-blue bg-valence-blue/15 pointer-events-none"
                  style={{
                    top:    minsToTop(drag.startMin),
                    height: ((drag.endMin - drag.startMin) / 60) * HOUR_PX
                  }}
                >
                  <p className="px-1 py-0.5 text-[10px] font-semibold text-valence-blue">
                    {fmtTime(new Date(0, 0, 0, Math.floor(drag.startMin / 60), drag.startMin % 60))}
                    {' – '}
                    {fmtTime(new Date(0, 0, 0, Math.floor(drag.endMin / 60), drag.endMin % 60))}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Quick-create composer */}
      {composer && <QuickCreateModal range={composer} onClose={() => setComposer(null)} onSave={saveEvent} />}
    </div>
  )
}

function QuickCreateModal({ range, onClose, onSave }) {
  const [title, setTitle]       = useState('')
  const [attendees, setAtt]     = useState('')
  const [description, setDesc]  = useState('')
  const [saving, setSaving]     = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function submit(e) {
    e?.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({
        title:       title.trim(),
        description: description.trim(),
        attendees:   attendees.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
      })
    } finally {
      setSaving(false)
    }
  }

  const startStr = format(range.start, 'EEE d MMM · h:mm a')
  const endStr   = format(range.end,   'h:mm a')

  return (
    <Modal open onClose={onClose} title="New event">
      <form onSubmit={submit} className="space-y-3">
        <input
          ref={inputRef}
          className="vl-input w-full text-base font-semibold"
          placeholder="Add title (e.g. Catch-up with Sivaan)"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
        />
        <p className="text-xs text-valence-muted">{startStr} – {endStr}</p>

        <label className="block">
          <span className="vl-label inline-flex items-center gap-1.5"><UsersIcon className="h-3 w-3" /> Attendees</span>
          <input
            className="vl-input mt-1 w-full text-sm"
            placeholder="email1@example.com, email2@example.com"
            value={attendees}
            onChange={e => setAtt(e.target.value)}
          />
          <p className="mt-1 text-[10px] text-valence-subtle">Comma-separated. They'll get a Google Calendar invite from your Gmail.</p>
        </label>

        <label className="block">
          <span className="vl-label inline-flex items-center gap-1.5"><AlignLeft className="h-3 w-3" /> Description</span>
          <textarea
            rows={3}
            className="vl-input mt-1 w-full text-sm resize-none"
            placeholder="Notes, agenda, links…"
            value={description}
            onChange={e => setDesc(e.target.value)}
          />
        </label>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-valence-border">
          <button type="button" onClick={onClose} className="vl-btn-ghost text-sm">Cancel</button>
          <button type="submit" disabled={saving || !title.trim()} className="vl-btn-primary text-sm">
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…</> : 'Create & send invites'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
