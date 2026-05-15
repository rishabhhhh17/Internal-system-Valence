import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { X, Users as UsersIcon, AlignLeft, MapPin, Video, Clock, Loader2 } from 'lucide-react'

// Google-Calendar-style quick-create modal. Stays anchored to a fixed
// position (top-right of the viewport) so the user can still see the
// week grid beneath it. Submits the title, attendee emails, optional
// location, optional Google Meet link, and description; the caller
// translates this into a createCalendarEvent call (Google API).

export default function EventComposer({ range, onClose, onSave }) {
  const [title, setTitle]     = useState('')
  const [attendees, setAtt]   = useState('')
  const [location, setLoc]    = useState('')
  const [description, setDesc] = useState('')
  const [withMeet, setMeet]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e) {
    e?.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({
        title:       title.trim(),
        location:    location.trim(),
        description: description.trim(),
        attendees:   attendees.split(/[,\s]+/).map(s => s.trim()).filter(Boolean),
        withMeet
      })
    } finally {
      setSaving(false)
    }
  }

  const day  = format(range.start, 'EEEE, d MMM')
  const from = format(range.start, 'h:mm a')
  const to   = format(range.end,   'h:mm a')

  return (
    <>
      {/* Click-outside overlay — closes when clicking elsewhere on the page */}
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />

      <div className="fixed right-6 top-24 z-50 w-[440px] max-w-[calc(100vw-3rem)] rounded-2xl border border-valence-border bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-2 border-b border-valence-border px-5 pt-4 pb-3">
          <input
            ref={inputRef}
            className="w-full bg-transparent text-lg font-semibold text-valence-text placeholder:text-valence-subtle focus:outline-none"
            placeholder="Add title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            required
          />
          <button onClick={onClose} className="rounded-md p-1 text-valence-subtle hover:bg-valence-surface hover:text-valence-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-3">
          {/* Time row */}
          <div className="flex items-center gap-3 text-sm text-valence-text">
            <Clock className="h-4 w-4 text-valence-subtle shrink-0" />
            <span>{day} · <b>{from} – {to}</b></span>
          </div>

          {/* Guests */}
          <div className="flex items-start gap-3">
            <UsersIcon className="h-4 w-4 text-valence-subtle shrink-0 mt-2" />
            <input
              className="vl-input flex-1 text-sm"
              placeholder="Add guests (comma-separated emails)"
              value={attendees}
              onChange={e => setAtt(e.target.value)}
            />
          </div>

          {/* Google Meet toggle */}
          <button
            type="button"
            onClick={() => setMeet(m => !m)}
            className={`w-full flex items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition ${
              withMeet
                ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text'
                : 'border-valence-border bg-white text-valence-muted hover:text-valence-text'
            }`}
          >
            <Video className="h-4 w-4 shrink-0" />
            <span className="flex-1">{withMeet ? 'Google Meet link will be added' : 'Add Google Meet video conferencing'}</span>
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${withMeet ? 'text-valence-blue' : 'text-valence-subtle'}`}>{withMeet ? 'On' : 'Off'}</span>
          </button>

          {/* Fathom auto-record hint — Fathom doesn't have a programmatic
              "schedule this URL" endpoint; it auto-joins meetings on a
              connected Google Calendar. So the right thing here isn't
              another API call, it's making the auto-record behaviour
              discoverable so partners don't worry about whether the bot
              will show up. */}
          {withMeet && (
            <p className="-mt-1 pl-7 text-[10.5px] leading-snug text-valence-blue/80">
              Fathom will auto-record this meeting and the transcript will
              auto-log as an interaction in ValenceOS — provided Fathom is
              connected to your Google Calendar.
            </p>
          )}

          {/* Location */}
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 text-valence-subtle shrink-0 mt-2" />
            <input
              className="vl-input flex-1 text-sm"
              placeholder="Add location"
              value={location}
              onChange={e => setLoc(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="flex items-start gap-3">
            <AlignLeft className="h-4 w-4 text-valence-subtle shrink-0 mt-2" />
            <textarea
              rows={3}
              className="vl-input flex-1 text-sm resize-none"
              placeholder="Add description"
              value={description}
              onChange={e => setDesc(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-valence-border">
            <button type="button" onClick={onClose} className="vl-btn-ghost text-sm">Cancel</button>
            <button type="submit" disabled={saving || !title.trim()} className="vl-btn-primary text-sm">
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
