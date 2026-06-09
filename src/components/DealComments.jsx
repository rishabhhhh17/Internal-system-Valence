import { useEffect, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Send, Loader2, MessageSquare } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.js'
import { humanError } from '../lib/userError.js'
import { useToast } from './Toast.jsx'
import WikilinkText from './WikilinkText.jsx'
import MentionEditor, { extractMentionLabels } from './MentionEditor.jsx'
import { notifyMentions } from '../lib/notifications.js'

export default function DealComments({ deal }) {
  const toast = useToast()
  const { session, profile } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  // editorPayload holds the latest { json, text, mentionedUserIds } from
  // MentionEditor's onChange. Submit reads from this ref + an
  // editor-internal counter (key) so we can "reset" the editor after
  // post by re-mounting it with a new key.
  const editorPayload = useRef({ json: null, text: '', mentionedUserIds: [] })
  const [editorKey, setEditorKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!deal?.id) return
    if (!isSupabaseConfigured) { setRows([]); setLoading(false); return }
    load()
    // Was subscribeTable('deal_comments', load) which fires `load()` on
    // EVERY comment INSERT across the entire org — opening one deal's
    // drawer would refetch this deal's comments anytime someone, anywhere,
    // posted on a different deal. Scope the subscription to THIS deal.
    const channel = supabase
      .channel(`deal_comments:${deal.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deal_comments', filter: `deal_id=eq.${deal.id}` },
        () => load()
      )
      .subscribe()
    return () => { try { supabase.removeChannel(channel) } catch {} }
  }, [deal?.id])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('deal_comments').select('*').eq('deal_id', deal.id)
      .order('created_at', { ascending: true })
    if (error) toast.error(humanError(error, 'Could not load comments'))
    setRows(data || [])
    setLoading(false)
  }

  // Submit handler used by both the form's Send button and MentionEditor's
  // Cmd+Enter. Reads the editor's latest payload from the ref so we don't
  // race the editor's onChange when Send is clicked rapidly.
  async function post(payloadOverride) {
    const payload = payloadOverride || editorPayload.current
    const text = (payload.text || '').trim()
    if (!text || submitting) return
    setSubmitting(true)
    const author = profile?.name || profile?.email || 'Anonymous'
    const meId   = session?.user?.id || null
    if (!isSupabaseConfigured) {
      setRows(prev => [...prev, { id: `local-${Date.now()}`, deal_id: deal.id, author, body: text, content_json: payload.json, mentioned_users: payload.mentionedUserIds, created_at: new Date().toISOString() }])
      setEditorKey(k => k + 1)   // reset editor
      editorPayload.current = { json: null, text: '', mentionedUserIds: [] }
      setSubmitting(false); return
    }
    const { data, error } = await supabase.from('deal_comments').insert({
      deal_id: deal.id,
      author,
      body: text,
      content_json:    payload.json,
      mentioned_users: payload.mentionedUserIds
    }).select().single()
    if (error) { toast.error(humanError(error, 'Could not post comment')); setSubmitting(false); return }

    setRows(prev => [...prev, data])

    // Fire @mention notifications for every tagged teammate. Helper
    // handles self-mention filtering + dedupe + silent failure (we
    // never want a notification hiccup to break a comment post).
    if (payload.mentionedUserIds?.length && meId) {
      notifyMentions({
        mentionedUserIds: payload.mentionedUserIds,
        actor:            { id: meId, name: profile?.name, email: profile?.email },
        target:           { kind: 'deal_comment', id: data.id },
        dealId:           deal.id,
        snippet:          text,
        link:             `/deals?open=${deal.id}#comment-${data.id}`
      })
    }

    setEditorKey(k => k + 1)
    editorPayload.current = { json: null, text: '', mentionedUserIds: [] }
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-valence-text">Deal discussion</p>
        <p className="mt-0.5 text-xs text-valence-muted">
          Internal thread for this deal. Use <span className="vl-kbd">@name</span> to tag a teammate. Everything is timestamped and kept with the deal.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-valence-surface animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-6 text-center">
          <MessageSquare className="mx-auto h-4 w-4 text-valence-subtle" />
          <p className="mt-2 text-sm text-valence-muted">No comments yet. Be the first to log context.</p>
        </div>
      ) : (
        <ol className="space-y-3">
          {rows.map(c => (
            <li key={c.id} className="flex items-start gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-valence-ink text-[11px] font-semibold text-white shrink-0">
                {initials(c.author)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="rounded-xl rounded-tl-sm border border-valence-border bg-valence-elevated px-4 py-2.5">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-semibold text-valence-text">{c.author}</span>
                    <span className="text-valence-subtle">· {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-valence-text whitespace-pre-wrap">
                    {renderMentions(c.body, c.content_json)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <MentionEditor
            key={editorKey}
            onChange={(payload) => { editorPayload.current = payload }}
            onSubmit={(payload) => post(payload)}
            placeholder="Leave a note for the team… (⌘↵ to send) · Type @ to tag a teammate"
          />
        </div>
        <button
          type="button"
          onClick={() => post()}
          disabled={submitting}
          className="vl-btn-primary-sm shrink-0"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

const MENTION_CLASS = "inline-flex items-center rounded-md bg-valence-blue-soft px-1 py-0 text-valence-blue-deep font-semibold"

function renderMentions(text, contentJson) {
  // Highlight the exact `@Full Name` strings from the comment's mention nodes
  // so multi-word names aren't split mid-name. Falls back to the single-word
  // @word pattern for legacy comments stored without content_json.
  const labels = extractMentionLabels(contentJson)
  if (!labels.length) {
    return text.split(/(@\w+)/g).map((p, i) =>
      /^@\w+$/.test(p)
        ? <span key={i} className={MENTION_CLASS}>{p}</span>
        : <span key={i}>{p}</span>
    )
  }
  const tokens = new Set(labels.map(l => `@${l}`))
  const escaped = [...tokens].map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${escaped.join('|')})`, 'g')
  return text.split(re).map((p, i) =>
    tokens.has(p)
      ? <span key={i} className={MENTION_CLASS}>{p}</span>
      : <span key={i}>{p}</span>
  )
}

function initials(name = '') {
  return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
}
