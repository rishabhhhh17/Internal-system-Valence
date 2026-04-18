import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles, Send, User2, Loader2, Copy, Check, Bot, RotateCcw,
  Briefcase, BookOpen, File as FileIcon, Table as TableIcon, ExternalLink
} from 'lucide-react'
import { askWithStreaming } from '../lib/rag.js'
import { isGeminiConfigured } from '../lib/gemini.js'
import { filePublicUrl } from '../lib/knowledge.js'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useToast } from './Toast.jsx'

const SUGGESTED = [
  'What is our thesis on healthcare consolidation?',
  'Summarise the active fintech deals.',
  'What playbook do we follow for M&A mandates?',
  'Which precedent comps did we price around 10x EBITDA?',
  'Which deals are in negotiation right now?'
]

export default function AskChat() {
  const toast = useToast()
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  async function ask(qOverride) {
    const q = (qOverride ?? input).trim()
    if (!q || streaming) return
    setInput('')

    const history = messages.filter(m => !m.error).map(m => ({ role: m.role, text: m.text }))
    const user = { id: crypto.randomUUID(), role: 'user', text: q }
    const assistant = { id: crypto.randomUUID(), role: 'assistant', text: '', sources: [], streaming: true }
    setMessages(m => [...m, user, assistant])
    setStreaming(true)

    const update = (patch) => setMessages(m => m.map(x => x.id === assistant.id ? { ...x, ...patch } : x))

    try {
      await askWithStreaming(q, {
        history,
        onSources: (sources) => update({ sources }),
        onChunk:   (_, full) => update({ text: full }),
        onDone:    () => update({ streaming: false }),
        onError:   (err) => update({ streaming: false, error: true, text: err.message })
      })
    } catch (err) {
      if (!err.message.includes('not configured')) toast.error(err.message)
    } finally {
      setStreaming(false)
    }
  }

  function reset() {
    setMessages([])
    setInput('')
  }

  function openSource(src) {
    if (!src) return
    if (src.source_type === 'document') navigate(`/knowledge?tab=memos&open=${src.source_id}`)
    else if (src.source_type === 'deal' || src.source_type === 'deal_file') navigate(`/deals?open=${src.metadata?.deal_id || src.source_id}`)
    else if (src.source_type === 'comp') navigate('/knowledge?tab=comps')
    else if (src.source_type === 'file') {
      supabase.from('knowledge_files').select('path').eq('id', src.source_id).single().then(({ data }) => {
        if (data?.path) window.open(filePublicUrl(data.path), '_blank')
      })
    }
  }

  const hasAnyConversation = messages.length > 0

  return (
    <div className="flex flex-col space-y-5">
      {/* Hero */}
      {!hasAnyConversation && (
        <section className="relative overflow-hidden rounded-2xl border border-valence-border bg-white vl-circles py-16 px-8 lg:py-24 lg:px-14">
          <div className="absolute inset-0 bg-valence-grid opacity-50" aria-hidden />
          <div className="relative max-w-2xl z-10">
            <p className="vl-eyebrow"><Sparkles className="h-3 w-3" /> Ask ValanceOS</p>
            <h1 className="mt-5 font-display text-display font-bold text-valence-text">
              Ask anything. Answers grounded in your documents.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-valence-muted lg:text-base">
              Plain-English questions. Responses drawn from memos, files, deal notes, and precedent comps — every fact cited to source.
            </p>
            {!isGeminiConfigured && (
              <p className="mt-3 inline-block rounded-md border border-valence-warning/30 bg-valence-warning/10 px-3 py-1.5 text-[11px] text-valence-warning">
                Add <span className="vl-kbd">VITE_GEMINI_API_KEY</span> to activate Ask. Search tab still works without it.
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              {SUGGESTED.map(s => (
                <button
                  key={s}
                  disabled={streaming || !isGeminiConfigured}
                  onClick={() => ask(s)}
                  className="group rounded-full border border-valence-border bg-valence-surface px-3.5 py-1.5 text-[12px] font-medium text-valence-muted hover:border-valence-blue/40 hover:text-valence-text hover:bg-valence-blue-soft/40 transition disabled:opacity-50"
                >
                  <Sparkles className="inline h-3 w-3 mr-1.5 text-valence-blue" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Conversation */}
      {hasAnyConversation && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-valence-muted">
            {messages.filter(m => m.role === 'user').length} question{messages.filter(m => m.role === 'user').length === 1 ? '' : 's'} · answers grounded in your knowledge base
          </p>
          <button onClick={reset} className="vl-btn-ghost" aria-label="New conversation">
            <RotateCcw className="h-3.5 w-3.5" /> New thread
          </button>
        </div>
      )}

      <div className="space-y-4">
        {messages.map(m => (
          <Message key={m.id} message={m} onOpenSource={openSource} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); ask() }}
        className="sticky bottom-4 z-10 rounded-2xl border border-valence-border-strong bg-valence-surface/95 backdrop-blur-md shadow-valence"
      >
        <div className="flex items-end gap-2 p-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() }
            }}
            placeholder={isGeminiConfigured ? 'Ask anything about Valence deals, memos, files, comps…' : 'Add a Gemini key to unlock Ask'}
            disabled={!isGeminiConfigured || streaming}
            rows={1}
            className="flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-valence-text placeholder:text-valence-subtle outline-none max-h-40"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming || !isGeminiConfigured}
            className="vl-btn-primary shrink-0"
            aria-label="Send"
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">Ask</span>
          </button>
        </div>
        <div className="flex items-center justify-between border-t border-valence-border px-3 py-1.5 text-[10px] text-valence-subtle">
          <span>
            <span className="vl-kbd">↵</span> send · <span className="vl-kbd">shift+↵</span> newline
          </span>
          <span>grounded · semantic · cited</span>
        </div>
      </form>
    </div>
  )
}

function Message({ message, onOpenSource }) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(message.text)
    setCopied(true); setTimeout(() => setCopied(false), 1200)
  }

  if (isUser) {
    return (
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-valence-blue-soft ring-1 ring-valence-blue/30 shrink-0 mt-0.5">
          <User2 className="h-4 w-4 text-valence-blue" />
        </div>
        <div className="flex-1 rounded-2xl rounded-tl-sm border border-valence-border bg-valence-surface px-4 py-3">
          <p className="text-sm leading-relaxed text-valence-text whitespace-pre-wrap">{message.text}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-valence-blue to-[#1a85ff] ring-1 ring-valence-border-strong shrink-0 mt-0.5">
        <Sparkles className="h-4 w-4 text-valence-text" />
      </div>
      <div className="flex-1 space-y-3">
        <div className={`relative rounded-2xl rounded-tl-sm border px-4 py-3 ${message.error ? 'border-valence-danger/30 bg-valence-danger/10' : 'border-valence-border bg-valence-surface'}`}>
          {message.text ? (
            <div className="text-sm leading-relaxed text-valence-text whitespace-pre-wrap">
              {renderWithCitations(message.text, message.sources || [], onOpenSource)}
              {message.streaming && <span className="inline-block h-4 w-1.5 ml-0.5 bg-valence-blue/80 animate-pulse align-middle rounded-sm" />}
            </div>
          ) : message.streaming ? (
            <div className="flex items-center gap-2 text-sm text-valence-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
            </div>
          ) : null}

          {!message.streaming && !message.error && message.text && (
            <button onClick={copy} className="absolute right-2 top-2 vl-btn-ghost opacity-60 hover:opacity-100" aria-label="Copy">
              {copied ? <Check className="h-3.5 w-3.5 text-valence-success" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {message.sources && message.sources.length > 0 && (
          <SourcesList sources={message.sources} onOpenSource={onOpenSource} />
        )}
      </div>
    </div>
  )
}

function renderWithCitations(text, sources, onOpenSource) {
  if (!text) return null
  const parts = text.split(/(\[\d+\])/g)
  return parts.map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/)
    if (!m) return <span key={i}>{part}</span>
    const idx = parseInt(m[1], 10) - 1
    const source = sources[idx]
    return (
      <button
        key={i}
        onClick={() => onOpenSource(source)}
        className="mx-0.5 inline-flex items-center rounded border border-valence-blue/40 bg-valence-blue-soft px-1.5 py-0 text-[10px] font-semibold text-valence-blue align-middle hover:bg-valence-blue/30 hover:text-valence-text transition"
        title={source ? `${sourceLabel(source.source_type)} · ${source.title}` : 'Unknown source'}
      >
        {m[1]}
      </button>
    )
  })
}

function SourcesList({ sources, onOpenSource }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-[11px] font-semibold text-valence-muted hover:text-valence-text">
        <Bot className="h-3 w-3" /> {sources.length} source{sources.length === 1 ? '' : 's'} · show
      </summary>
      <ul className="mt-2 space-y-1.5">
        {sources.map((s, i) => {
          const Icon = iconFor(s.source_type)
          return (
            <li key={s.id}>
              <button
                onClick={() => onOpenSource(s)}
                className="group/item flex w-full items-start gap-2 rounded-lg border border-valence-border bg-valence-surface px-3 py-2 text-left transition hover:border-valence-border-strong hover:bg-valence-surface"
              >
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded bg-valence-blue-soft text-[9px] font-bold text-valence-blue">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-valence-text">{s.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-valence-muted" dangerouslySetInnerHTML={{ __html: cleanSnippet(s.snippet) }} />
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] text-valence-subtle">
                  <Icon className="h-3 w-3" /> {sourceLabel(s.source_type)}
                </span>
                <ExternalLink className="h-3 w-3 text-valence-subtle opacity-0 group-hover/item:opacity-100 transition" />
              </button>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

function iconFor(type) {
  return type === 'document' ? BookOpen
       : type === 'file'     ? FileIcon
       : type === 'comp'     ? TableIcon
       : Briefcase
}

function sourceLabel(type) {
  return type === 'document' ? 'Memo'
       : type === 'file'     ? 'File'
       : type === 'comp'     ? 'Comp'
       : type === 'deal'     ? 'Deal'
       : type === 'deal_file' ? 'Deal file'
       : 'Source'
}

function cleanSnippet(snippet) {
  if (!snippet) return ''
  const escaped = String(snippet).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  return escaped
    .replace(/&lt;&lt;/g, '<mark class="rounded bg-valence-blue/20 px-0.5 text-valence-blue">')
    .replace(/&gt;&gt;/g, '</mark>')
}
