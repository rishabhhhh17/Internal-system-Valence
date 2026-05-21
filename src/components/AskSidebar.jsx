// AskSidebar — floating chat window for natural-language CRM queries.
//
// Layout:
//   - When closed: a compact pill in the bottom-right corner.
//   - When open: a floating window (~440×620) anchored bottom-right,
//     overlaid on top of page content. NO layout reflow — the rest of
//     the app stays untouched.
//   - On mobile (< sm), the open state takes the full width minus
//     small margins so the input stays usable.
//
// State persists in localStorage so a partner who prefers it closed
// keeps it closed across navigations.
//
// Streaming: hits POST /api/ask with the user's Supabase JWT, reads
// the SSE response and renders chunks as they land. While the model
// is calling a tool we show a small status line ("Searching people…")
// so the user knows something's happening within 200ms of submit.
//
// Citations: when the model output mentions a person we found in the
// tool results, we don't link it directly here — citation chips come
// from the AI emitting them in markdown-ish form, e.g.
// `[Rohan Mehta](/people?open=<uuid>)`. We render those as styled
// chips. v1 leaves links inert; v2 wires them.
//
// History is per-session only (no persistence) — opening a new tab is
// a fresh thread. Matches the spec.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Send, X, Loader2, AlertTriangle } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

const STORAGE_KEY = 'valence.askSidebar.open'

export default function AskSidebar() {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    // Floating window default: closed. Users explicitly open it; we
    // don't steal screen real estate by default. State persists so
    // anyone who likes it open keeps it open across page navigations.
    const v = window.localStorage?.getItem(STORAGE_KEY)
    return v === '1'
  })
  const [messages, setMessages] = useState([])  // [{role, text, toolCalls:[{name,status,matchCount}]}]
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)
  // AbortController for the in-flight /api/ask stream. LLM responses can
  // take 5-30s, during which the user might navigate away or close the
  // sidebar. Without this, the SSE reader keeps consuming the body and
  // setState fires on an unmounted component, logging React warnings
  // and burning bytes server-side. The ref + cleanup pattern ensures
  // unmount aborts the stream cleanly.
  const abortRef = useRef(null)

  useEffect(() => {
    try { window.localStorage?.setItem(STORAGE_KEY, open ? '1' : '0') } catch {}
  }, [open])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, busy])

  // Abort any in-flight stream on unmount. Also clears the ref so a
  // stale controller from a previous mount can't leak.
  useEffect(() => () => {
    try { abortRef.current?.abort() } catch { /* already aborted */ }
    abortRef.current = null
  }, [])

  async function submit(e) {
    e?.preventDefault()
    const q = input.trim()
    if (!q || busy) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text: q }])
    const assistantIndex = (() => {
      let next
      setMessages(m => { next = m.length; return [...m, { role: 'assistant', text: '', toolCalls: [] }] })
      return next
    })()
    setBusy(true)

    try {
      const { data: sess } = isSupabaseConfigured
        ? await supabase.auth.getSession()
        : { data: { session: null } }
      const token = sess?.session?.access_token
      if (!token) throw new Error('Sign in to ask questions.')

      // Abort any previous in-flight stream before kicking off a new one
      // (user submitted a second question before the first finished). And
      // store the new controller in the ref so the unmount cleanup can
      // reach it.
      try { abortRef.current?.abort() } catch { /* already aborted */ }
      const ctrl = new AbortController()
      abortRef.current = ctrl

      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ question: q }),
        signal: ctrl.signal
      })
      if (!res.ok || !res.body) {
        const errTxt = await res.text().catch(() => '')
        // Common case: server can't reach Gemini → 503 with a JSON body.
        // Translate that into a user-friendly message instead of dumping
        // the raw "{\"error\":\"GEMINI_API_KEY not set on server\"}" string.
        if (res.status === 503 && /gemini/i.test(errTxt)) {
          throw new Error("AI features aren't connected yet. Ask your admin to set the Gemini API key in Vercel settings, then refresh.")
        }
        // Try to surface the JSON `error` field if there is one, otherwise
        // raw text, otherwise the HTTP status.
        let msg = ''
        try { msg = JSON.parse(errTxt)?.error || '' } catch { /* not JSON */ }
        throw new Error(msg || errTxt.slice(0, 200) || `Server ${res.status}`)
      }
      await parseEventStream(res.body, (event, data) => {
        setMessages(m => {
          const copy = m.slice()
          const cur = { ...copy[assistantIndex] }
          if (event === 'tool_call') {
            cur.toolCalls = [...(cur.toolCalls || []), { name: data.name, status: 'running' }]
          } else if (event === 'tool_result') {
            const tcs = (cur.toolCalls || []).slice()
            for (let i = tcs.length - 1; i >= 0; i--) {
              if (tcs[i].name === data.name && tcs[i].status === 'running') {
                tcs[i] = { ...tcs[i], status: 'done', matchCount: data.match_count, hasError: data.has_error }
                break
              }
            }
            cur.toolCalls = tcs
          } else if (event === 'chunk') {
            cur.text = (cur.text || '') + (data.text || '')
          } else if (event === 'error') {
            cur.error = data.message
          } else if (event === 'done') {
            cur.finished = true
          }
          copy[assistantIndex] = cur
          return copy
        })
      })
    } catch (err) {
      // AbortError is not user-facing — it fires when the component
      // unmounts mid-stream or when a new question pre-empts an
      // in-flight one. Surface only real errors.
      if (err?.name === 'AbortError') return
      setMessages(m => {
        const copy = m.slice()
        copy[assistantIndex] = { ...copy[assistantIndex], error: err?.message || 'Request failed', finished: true }
        return copy
      })
    } finally {
      setBusy(false)
    }
  }

  // Collapsed: a small ink-coloured pill in the bottom-right corner.
  // Always visible (above MobileNav on mobile via z-40 + bottom-offset
  // logic baked into the class set).
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed z-40 inline-flex items-center gap-2 rounded-full bg-valence-ink text-white px-4 py-2.5 text-xs font-semibold tracking-[0.04em] shadow-valence hover:bg-valence-ink-soft transition
                   bottom-24 right-4 sm:bottom-6 sm:right-6"
        title="Ask anything about the Valence network"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Ask
      </button>
    )
  }

  // Floating window: anchored bottom-right, full-width on small
  // screens (with margin), fixed width on sm+. No layout reflow.
  return (
    <aside
      role="dialog"
      aria-label="Ask"
      className="fixed z-40 flex flex-col rounded-2xl border border-valence-border bg-valence-elevated shadow-valence-lg overflow-hidden
                 bottom-4 right-3 left-3 max-h-[78vh]
                 sm:left-auto sm:bottom-6 sm:right-6 sm:w-[420px] sm:max-h-[620px]"
      style={{ height: 'min(620px, 78vh)' }}
    >
      <header className="flex items-center justify-between gap-2 border-b border-valence-border px-4 py-3 bg-valence-elevated">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-valence-blue-soft p-1.5 text-valence-blue">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="leading-tight">
            <p className="text-[10px] uppercase tracking-[0.18em] text-valence-subtle">VALENCEOS</p>
            <p className="text-sm font-semibold text-valence-text">Ask</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="vl-btn-ghost text-xs" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <EmptyHints onPick={(q) => { setInput(q); setTimeout(() => submit(), 0) }} />
        )}
        {messages.map((m, i) => (
          <Message key={i} m={m} />
        ))}
        {busy && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1].finished && (
          <Typing />
        )}
      </div>

      <form onSubmit={submit} className="border-t border-valence-border px-3 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e) }
            }}
            rows={2}
            placeholder="Ask anything about the Valence network"
            className="vl-input flex-1 resize-none text-sm py-2"
            disabled={busy}
          />
          <button type="submit" disabled={!input.trim() || busy} className="vl-btn-primary-sm shrink-0">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-valence-subtle">
          Answers come from the CRM data only. Nothing made up.
        </p>
      </form>
    </aside>
  )
}

// ============ MESSAGE ============
function Message({ m }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-valence-ink text-white px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
          {m.text}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      {(m.toolCalls || []).map((tc, i) => (
        <ToolBadge key={i} call={tc} />
      ))}
      {m.text && (
        <div className="rounded-lg bg-valence-surface px-3 py-2 text-sm leading-relaxed text-valence-text whitespace-pre-wrap">
          {renderAssistantText(m.text)}
        </div>
      )}
      {m.error && (
        <div className="flex items-start gap-1.5 rounded-lg bg-valence-danger/10 px-3 py-2 text-xs text-valence-danger">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{m.error}</span>
        </div>
      )}
    </div>
  )
}

function ToolBadge({ call }) {
  const friendly = {
    search_people:        'Searching people…',
    get_relationship:     'Pulling relationship history…',
    find_best_intro_path: 'Looking for the warmest intro…',
    find_top_connectors:  'Finding top connectors…',
    search_deals:         'Searching deals…',
    get_recent_activity:  'Pulling recent activity…'
  }[call.name] || `Calling ${call.name}…`

  if (call.status === 'running') {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-valence-blue-soft text-valence-blue-deep px-2.5 py-1 text-[10px] font-semibold">
        <Loader2 className="h-3 w-3 animate-spin" />
        {friendly}
      </div>
    )
  }
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
      call.hasError
        ? 'bg-valence-danger/10 text-valence-danger'
        : 'bg-valence-surface text-valence-muted'
    }`}>
      {call.hasError
        ? `${call.name} · error`
        : `${call.name} · ${call.matchCount || 0} match${call.matchCount === 1 ? '' : 'es'}`}
    </div>
  )
}

// Parse the AI's text for citation markdown of the form
// `[Visible label](/internal/path)` and render those segments as
// inline <Link>s. Everything else stays as plain text. Per the
// spec, the AI prompt instructs the model to emit citations as
// markdown links — without this renderer the user just sees the
// raw `[Name](/people?open=...)` syntax on screen.
//
// SECURITY:
//   - Only paths starting with a single '/' are turned into links.
//     '//foo' (protocol-relative) and 'http://foo' (absolute) are
//     left as plain text — prevents an LLM-induced open-redirect
//     to a malicious URL.
//   - The label is rendered as a React child, not innerHTML, so
//     any HTML/scripts in the label are inert.
function renderAssistantText(text) {
  if (!text) return null
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g
  const out = []
  let lastIndex = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) out.push(text.slice(lastIndex, m.index))
    const label = m[1]
    const path  = m[2]
    if (path.startsWith('/') && !path.startsWith('//')) {
      out.push(
        <Link
          key={`${m.index}-${path}`}
          to={path}
          className="text-valence-blue font-semibold hover:underline"
        >
          {label}
        </Link>
      )
    } else {
      // Unsafe / external — surface the raw token so it's obvious
      // something off-spec came back, rather than silently dropping it.
      out.push(m[0])
    }
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex))
  return out.length === 1 ? out[0] : <>{out}</>
}

function Typing() {
  return (
    <div className="inline-flex items-center gap-1 px-2 text-valence-subtle">
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse [animation-delay:240ms]" />
    </div>
  )
}

function EmptyHints({ onPick }) {
  const hints = [
    'Who at Valence knows the most PE funds?',
    "What's the warmest path into Apollo?",
    'Who have we talked to at ChrysCapital in the last 30 days?',
    'Find founders in healthcare we know in Mumbai'
  ]
  return (
    <div className="space-y-2">
      <p className="text-xs text-valence-muted">Try one of these:</p>
      {hints.map(h => (
        <button
          key={h}
          onClick={() => onPick(h)}
          className="block w-full text-left rounded-lg border border-valence-border bg-valence-elevated px-3 py-2 text-xs text-valence-text hover:border-valence-ink/30 hover:bg-valence-surface transition"
        >
          {h}
        </button>
      ))}
    </div>
  )
}

// ============ SSE PARSER ============
// We can't use EventSource here because it doesn't support custom headers
// (Authorization). Fetch + ReadableStream + manual frame parsing instead.
async function parseEventStream(body, onEvent) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const frames = buf.split('\n\n')
    buf = frames.pop() || ''
    for (const frame of frames) {
      let event = 'message', data = ''
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) continue
      let payload = null
      try { payload = JSON.parse(data) } catch { payload = { raw: data } }
      onEvent(event, payload)
    }
  }
}
