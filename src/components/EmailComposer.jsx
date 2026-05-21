import { useEffect, useRef, useState } from 'react'
import { Mail, Copy, Check, Wand2, RefreshCw, Send, FileEdit } from 'lucide-react'
import Modal from './Modal.jsx'
import { draftEmail, emailScenarios, isGeminiConfigured } from '../lib/gemini.js'
import { openGmailCompose } from '../lib/google.js'
import { logActivity } from '../lib/activity.js'
import { useToast } from './Toast.jsx'
import { humanError } from '../lib/userError.js'

export default function EmailComposer({ open, onClose, deal, contact }) {
  const toast = useToast()
  const [scenario, setScenario] = useState('intro')
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const bodyRef = useRef(null)

  const scenarios = emailScenarios()

  useEffect(() => {
    if (!open) return
    setScenario('intro'); setBody(''); setSubject(''); setError('')
  }, [open, contact?.id])

  async function run(s = scenario) {
    if (!deal) return
    setScenario(s); setLoading(true); setError(''); setBody('')
    setSubject(defaultSubject(s, deal))
    try {
      const text = isGeminiConfigured
        ? await draftEmail({ scenario: s, deal, contact })
        : fallbackBody(s, deal, contact)
      setBody(text)
      if (deal?.id) await logActivity({ dealId: deal.id, kind: 'email_drafted', body: `${scenarios[s].label} — ${contact?.name || 'counterparty'}` })
    } catch (err) {
      setError(err.message || 'Could not draft email')
      setBody(fallbackBody(s, deal, contact))
    } finally {
      setLoading(false)
    }
  }

  function currentBody() { return bodyRef.current?.value ?? body }
  function currentSubject() { return subject || defaultSubject(scenario, deal) }

  async function copy() {
    const text = `Subject: ${currentSubject()}\n\n${currentBody()}`
    await navigator.clipboard.writeText(text)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  // Opens Gmail's compose URL in a new tab with everything pre-filled.
  // The user hits Send themselves — we don't have (and intentionally don't
  // want) gmail.send scope. Same effect from the partner's seat; no CASA
  // audit needed for OAuth verification.
  async function openInGmail() {
    if (!contact?.email) { toast.error('This counterparty has no email on file.'); return }
    setSending(true)
    try {
      openGmailCompose({ to: contact.email, subject: currentSubject(), body: currentBody() })
      toast.success('Opened in Gmail to send.')
      if (deal?.id) await logActivity({ dealId: deal.id, kind: 'email_drafted', body: `Drafted via Gmail to ${contact.name || contact.email}` })
      onClose?.()
    } catch (err) {
      toast.error(humanError(err, 'Could not open Gmail. Allow pop-ups for this site and try again.'))
    } finally {
      setSending(false)
    }
  }

  const mailto = `mailto:${encodeURIComponent(contact?.email || '')}?subject=${encodeURIComponent(currentSubject())}&body=${encodeURIComponent(currentBody())}`

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Draft an email"
      description={contact ? `To ${contact.name}${contact.company ? ' — ' + contact.company : ''}` : 'Compose a message for the mandate.'}
      size="xl"
    >
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        {/* Scenario picker */}
        <div className="space-y-1.5">
          <p className="vl-label">Scenario</p>
          {Object.entries(scenarios).map(([id, s]) => (
            <button
              key={id}
              onClick={() => run(id)}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                scenario === id
                  ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text'
                  : 'border-valence-border bg-valence-surface text-valence-muted hover:text-valence-text hover:bg-valence-surface'
              }`}
            >
              <Wand2 className={`h-3.5 w-3.5 ${scenario === id ? 'text-valence-blue' : ''}`} />
              <span className="flex-1">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Editor */}
        <div className="space-y-3">
          {!body && !loading && (
            <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-8 text-center">
              <Mail className="mx-auto h-5 w-5 text-valence-subtle" />
              <p className="mt-2 text-sm text-valence-muted">Pick a scenario to draft the email.</p>
            </div>
          )}

          {loading && (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 w-full rounded bg-valence-surface" />
              <div className="h-3 w-11/12 rounded bg-valence-surface" />
              <div className="h-3 w-4/5 rounded bg-valence-surface" />
              <div className="h-3 w-3/4 rounded bg-valence-surface" />
            </div>
          )}

          {error && <p className="text-xs text-valence-danger">{error}</p>}

          {body && (
            <>
              <div>
                <label className="vl-label">Subject</label>
                <input className="vl-input" value={subject} onChange={e => setSubject(e.target.value)} />
              </div>
              <div>
                <label className="vl-label">Message</label>
                <textarea ref={bodyRef} className="vl-input min-h-[240px] leading-relaxed" defaultValue={body} />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button onClick={() => run(scenario)} className="vl-btn-secondary" disabled={loading}>
                  <RefreshCw className="h-4 w-4" /> Regenerate
                </button>
                <button onClick={copy} className="vl-btn-ghost">
                  {copied ? <><Check className="h-4 w-4 text-valence-success" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
                </button>
                <a href={mailto} className="vl-btn-ghost" title="Open in your default mail client">
                  <Mail className="h-4 w-4" /> Mail app
                </a>
                <button onClick={openInGmail} disabled={sending || !contact?.email} className="vl-btn-primary">
                  <Send className="h-4 w-4" /> {sending ? 'Opening…' : 'Open in Gmail'}
                </button>
              </div>

              <p className="text-[11px] text-valence-muted text-right">
                Opens a pre-filled draft in Gmail. You hit Send.
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function defaultSubject(scenario, deal) {
  const base = deal?.client_name || 'Mandate'
  switch (scenario) {
    case 'intro':           return `Introduction — ${base}`
    case 'followup':        return `Following up — ${base}`
    case 'status':          return `Status update — ${base}`
    case 'decline':         return `Thank you — ${base}`
    case 'propose_meeting': return `Proposed time — ${base}`
    case 'nda_request':     return `NDA — ${base}`
    default:                return base
  }
}

function fallbackBody(scenario, deal, contact) {
  const first = (contact?.name || '').split(' ')[0] || 'there'
  const name = deal?.client_name || 'the mandate'
  const map = {
    intro:           `Hi ${first},\n\nIntroducing myself from Valence Growth Partners — we're advising on ${name}. I'd welcome a short call to walk you through the opportunity and gauge your appetite. Could we find 20 minutes in the next week?\n\nBest,\nValence Growth Partners`,
    followup:        `Hi ${first},\n\nJust a quick follow-up on ${name}. Happy to share additional materials or take any questions. Let me know what would be most useful on your end.\n\nBest,\nValence Growth Partners`,
    status:          `Hi ${first},\n\nA short update on ${name}: we're currently in ${deal?.stage || 'the next phase'} and expect to revert with further materials shortly. Please let me know if anything specific would help frame your view.\n\nBest,\nValence Growth Partners`,
    decline:         `Hi ${first},\n\nThank you for the engagement on ${name}. On balance we'll be stepping back from active discussions at this stage, but we'd welcome the chance to reconnect as the situation evolves.\n\nBest,\nValence Growth Partners`,
    propose_meeting: `Hi ${first},\n\nWould you have 30 minutes this week to walk through ${name}? I can send across a couple of times that work on our side — just let me know what suits you.\n\nBest,\nValence Growth Partners`,
    nda_request:     `Hi ${first},\n\nAhead of sharing materials on ${name}, could we put our mutual NDA in place? I'll send across the Valence standard this morning for your review — happy to mark up if your firm prefers its own template.\n\nBest,\nValence Growth Partners`
  }
  return map[scenario] || map.intro
}
