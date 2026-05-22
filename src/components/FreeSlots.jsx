import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Clock, Sparkles, Send, Copy, Check, RefreshCw } from 'lucide-react'
import Modal from './Modal.jsx'
import { openGmailCompose, createCalendarEvent, GoogleAuthExpired, signInWithGoogle } from '../lib/google.js'
import { draftMeetingMessage, isGeminiConfigured } from '../lib/gemini.js'
import { useToast } from './Toast.jsx'
import { humanError } from '../lib/userError.js'
import { firmDisplayName } from '../lib/firmIdentity.js'

export default function FreeSlots({ slots, connected, onSent }) {
  const [pick, setPick] = useState(null)

  if (!connected) return null
  if (!slots?.length) {
    return (
      <div className="rounded-xl border border-dashed border-valence-border bg-valence-surface px-5 py-6 text-center">
        <Clock className="mx-auto h-4 w-4 text-valence-subtle" />
        <p className="mt-2 text-sm text-valence-muted">No open slots left in today's workday.</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {slots.map(s => (
          <button
            key={s.start.toISOString()}
            onClick={() => setPick(s)}
            className="inline-flex items-center gap-2 rounded-full border border-valence-blue/30 bg-valence-blue-soft px-3 py-1.5 text-xs font-semibold text-valence-text hover:bg-valence-blue/30 hover:border-valence-blue/50 transition"
            title={`Free ${format(s.start, 'p')} – ${format(s.end, 'p')}`}
          >
            <Clock className="h-3.5 w-3.5 text-valence-blue" />
            <span className="tabular-nums">{format(s.start, 'HH:mm')}</span>
          </button>
        ))}
      </div>

      <ProposeTimeModal
        open={Boolean(pick)}
        slot={pick}
        onClose={() => setPick(null)}
        onSent={(payload) => { setPick(null); onSent?.(payload) }}
      />
    </>
  )
}

function ProposeTimeModal({ open, slot, onClose, onSent }) {
  const toast = useToast()
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [sending, setSending] = useState(false)
  const [addInvite, setAddInvite] = useState(true)
  const [copied, setCopied] = useState(false)

  // Reset fields whenever the modal is opened for a new slot
  useEffect(() => {
    if (!open || !slot) return
    setTitle(''); setTo(''); setSubject(''); setBody(''); setCopied(false)
  }, [open, slot?.start?.toISOString?.()])

  async function autodraft() {
    if (!slot || !title.trim()) return
    setDrafting(true)
    try {
      const text = isGeminiConfigured
        ? await draftMeetingMessage({
            title: title.trim(),
            date: format(slot.start, 'EEEE, d MMMM yyyy'),
            time: format(slot.start, 'HH:mm'),
            attendeeName: to.split('@')[0] || 'there'
          })
        : fallback(title.trim(), slot, to)
      setBody(text)
      if (!subject) setSubject(`Proposed time — ${title.trim()}`)
    } catch (e) {
      setBody(fallback(title.trim(), slot, to))
    } finally {
      setDrafting(false)
    }
  }

  // Opens Gmail compose in a new tab pre-filled. The calendar invite still
  // goes through the Calendar API (sensitive scope, no CASA needed). The
  // user clicks Send on the Gmail draft themselves.
  async function send() {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      toast.error('Fill in recipient, subject, and message.')
      return
    }
    setSending(true)
    try {
      openGmailCompose({ to: to.trim(), subject: subject.trim(), body })
      toast.success('Opened in Gmail to send.')
      if (addInvite) {
        try {
          await createCalendarEvent({
            title: title.trim() || subject.trim(),
            description: body,
            start: slot.start,
            end: slot.end,
            attendees: [to.trim()]
          })
          toast.success('Calendar invite sent.')
        } catch (e) {
          if (e instanceof GoogleAuthExpired) {
            toast.error('Google session expired. Reconnect to send the calendar invite.')
            signInWithGoogle().catch(() => {})
          } else {
            toast.error('Gmail draft opened, but calendar invite failed: ' + humanError(e, 'unknown error'))
          }
        }
      }
      onSent?.({ to: to.trim(), subject: subject.trim(), slot })
    } catch (e) {
      toast.error(humanError(e, 'Could not open Gmail'))
    } finally {
      setSending(false)
    }
  }

  async function copyBody() {
    if (!body) return
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Modal open={open} onClose={onClose}
      title="Propose a time"
      description={slot ? `${format(slot.start, 'EEEE, d MMM')} · ${format(slot.start, 'HH:mm')} – ${format(slot.end, 'HH:mm')}` : ''}
      size="lg"
    >
      {slot && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="vl-label">To (email)</label>
              <input value={to} onChange={e => setTo(e.target.value)} type="email" className="vl-input" placeholder="counterparty@firm.com" autoFocus />
            </div>
            <div>
              <label className="vl-label">What's it about?</label>
              <input value={title} onChange={e => setTitle(e.target.value)} className="vl-input" placeholder="e.g. Nimbus Health — next steps" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[11px] text-valence-muted">
              Tap a slot, fill in the recipient, and ValenceOS drafts the message.
            </p>
            <button onClick={autodraft} disabled={drafting || !title.trim()} className="vl-btn-secondary">
              {drafting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {drafting ? 'Drafting…' : (body ? 'Redraft' : 'Draft message')}
            </button>
          </div>

          {body && (
            <>
              <div>
                <label className="vl-label">Subject</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} className="vl-input" />
              </div>
              <div>
                <label className="vl-label">Message</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} className="vl-input min-h-[200px] leading-relaxed" />
              </div>

              <label className="flex items-center gap-2 text-xs text-valence-muted">
                <input type="checkbox" checked={addInvite} onChange={e => setAddInvite(e.target.checked)} className="accent-valence-blue" />
                Also create a Google Calendar event and invite the recipient
              </label>
            </>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button onClick={copyBody} disabled={!body} className="vl-btn-ghost">
              {copied ? <><Check className="h-4 w-4 text-valence-success" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
            </button>
            <button onClick={onClose} className="vl-btn-secondary">Cancel</button>
            <button onClick={send} disabled={sending || !body} className="vl-btn-primary">
              <Send className="h-4 w-4" /> {sending ? 'Opening…' : 'Open in Gmail'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function fallback(title, slot, to) {
  const first = (to.split('@')[0] || 'there').split('.')[0] || 'there'
  const when = `${format(slot.start, 'EEEE, d MMMM')} at ${format(slot.start, 'HH:mm')}`
  return `Hi ${first},

I hope you're well. Could we lock in ${when} for "${title}"? Happy to adjust if that window is tight — otherwise I'll send a calendar invite to confirm.

Looking forward to the conversation.

Best,
${firmDisplayName('our team')}`
}
