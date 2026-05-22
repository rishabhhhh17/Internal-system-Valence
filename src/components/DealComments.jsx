import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Send, Loader2, MessageSquare } from 'lucide-react'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.js'
import { humanError } from '../lib/userError.js'
import { useToast } from './Toast.jsx'
import WikilinkTextarea from './WikilinkTextarea.jsx'
import WikilinkText from './WikilinkText.jsx'

export default function DealComments({ deal }) {
  const toast = useToast()
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!deal?.id) return
    if (!isSupabaseConfigured) { setRows([]); setLoading(false); return }
    load()
    return subscribeTable('deal_comments', load)
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

  async function post(e) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setSubmitting(true)
    const author = profile?.name || profile?.email || 'Anonymous'
    const mentions = Array.from(text.matchAll(/@(\w+)/g)).map(m => m[1])
    if (!isSupabaseConfigured) {
      setRows(prev => [...prev, { id: `local-${Date.now()}`, deal_id: deal.id, author, body: text, mentions, created_at: new Date().toISOString() }])
      setBody(''); setSubmitting(false); return
    }
    const { data, error } = await supabase.from('deal_comments').insert({
      deal_id: deal.id, author, body: text, mentions
    }).select().single()
    if (error) { toast.error(humanError(error, 'Could not post comment')); setSubmitting(false); return }
    setRows(prev => [...prev, data])
    setBody(''); setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-valence-text">Deal discussion</p>
        <p className="mt-0.5 text-xs text-valence-muted">
          Internal thread for this mandate. Use <span className="vl-kbd">@name</span> to tag a teammate. Everything is timestamped and kept with the deal.
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
                    {renderMentions(c.body)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={post} className="flex items-start gap-2">
        <WikilinkTextarea
          value={body}
          onChange={setBody}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post(e) } }}
          placeholder="Leave a note for the team… (⌘↵ to send) · Type [[ to link people / funds / mandates"
          className="vl-input min-h-[72px] resize-y flex-1"
        />
        <button type="submit" disabled={!body.trim() || submitting} className="vl-btn-primary-sm shrink-0">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  )
}

function renderMentions(text) {
  return text.split(/(@\w+)/g).map((p, i) =>
    /^@\w+$/.test(p)
      ? <span key={i} className="inline-flex items-center rounded-md bg-valence-blue-soft px-1 py-0 text-valence-blue-deep font-semibold">{p}</span>
      : <span key={i}>{p}</span>
  )
}

function initials(name = '') {
  return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
}
