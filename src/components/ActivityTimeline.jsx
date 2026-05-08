import { useEffect, useState } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Plus, Sparkles, FileUp, PenLine, Handshake, Mail, Users as UsersIcon,
  ArrowRightCircle, FileSignature, CalendarClock, CircleDot, MessageSquare
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { logActivity, ACTIVITY_LABELS } from '../lib/activity.js'
import { typeLabel as interactionTypeLabel, outcomeLabel as interactionOutcomeLabel } from '../lib/interactions.js'
import WikilinkTextarea from './WikilinkTextarea.jsx'
import WikilinkText from './WikilinkText.jsx'

const KIND_ICON = {
  created:         Sparkles,
  stage_change:    ArrowRightCircle,
  note:            PenLine,
  nda_signed:      FileSignature,
  teaser_sent:     Handshake,
  meeting:         CalendarClock,
  file_upload:     FileUp,
  email_drafted:   Mail,
  contact_added:   UsersIcon,
  brief_generated: Sparkles,
  interaction:     MessageSquare
}

export default function ActivityTimeline({ dealId }) {
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote]       = useState('')

  useEffect(() => {
    if (!dealId) return
    if (!isSupabaseConfigured) { setItems([]); setLoading(false); return }
    load()
  }, [dealId])

  async function load() {
    setLoading(true)
    const [a, i] = await Promise.all([
      supabase.from('activities').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }),
      supabase.from('interactions').select('*').eq('deal_id', dealId).order('created_at', { ascending: false })
    ])
    const interactionItems = (i.data || []).map(row => ({
      id: `int-${row.id}`,
      kind: 'interaction',
      body: [
        `${interactionTypeLabel(row.type)} with ${row.counterparty_name}${row.counterparty_company ? ` (${row.counterparty_company})` : ''}`,
        row.notes
      ].filter(Boolean).join(' — '),
      meta: interactionOutcomeLabel(row.outcome),
      created_at: row.created_at
    }))
    const merged = [...(a.data || []), ...interactionItems]
      .sort((x, y) => new Date(y.created_at) - new Date(x.created_at))
    setItems(merged)
    setLoading(false)
  }

  async function addNote(e) {
    e.preventDefault()
    if (!note.trim()) return
    if (!isSupabaseConfigured) {
      setItems(prev => [{ id: `local-${Date.now()}`, kind: 'note', body: note.trim(), created_at: new Date().toISOString() }, ...prev])
    } else {
      const row = await logActivity({ dealId, kind: 'note', body: note.trim() })
      if (row) setItems(prev => [row, ...prev])
    }
    setNote(''); setNoteOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-valence-muted">Every move on this deal — NDAs signed, files dropped, notes added.</p>
        <button onClick={() => setNoteOpen(o => !o)} className="vl-btn-ghost">
          <Plus className="h-3.5 w-3.5" /> Add note
        </button>
      </div>

      {noteOpen && (
        <form onSubmit={addNote} className="space-y-2 rounded-lg border border-valence-border bg-valence-surface p-3">
          <WikilinkTextarea
            value={note} onChange={setNote}
            className="vl-input min-h-[72px]" placeholder="Log a note — what changed, what was agreed, what's next… Type [[ to link people / funds / mandates"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setNoteOpen(false); setNote('') }} className="vl-btn-secondary">Cancel</button>
            <button type="submit" className="vl-btn-primary">Log note</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-valence-surface animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-valence-border bg-valence-surface px-5 py-6 text-center">
          <CircleDot className="mx-auto h-4 w-4 text-valence-subtle" />
          <p className="mt-2 text-sm text-valence-muted">Timeline is empty. Activity appears here automatically as you work.</p>
        </div>
      ) : (
        <ol className="relative space-y-3 border-l border-valence-border pl-6">
          {items.map(item => {
            const Icon = KIND_ICON[item.kind] || CircleDot
            return (
              <li key={item.id} className="relative">
                <div className="absolute -left-[31px] top-1 grid h-6 w-6 place-items-center rounded-full border border-valence-border bg-valence-surface">
                  <Icon className="h-3 w-3 text-valence-blue" />
                </div>
                <div className="rounded-lg border border-valence-border bg-valence-surface px-4 py-2.5">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-valence-blue">
                    {ACTIVITY_LABELS[item.kind] || item.kind}
                    {item.meta && <span className="rounded-full bg-white border border-valence-border px-1.5 py-0 text-[10px] font-semibold text-valence-muted">{item.meta}</span>}
                    <span className="text-valence-subtle font-normal normal-case tracking-normal">· {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
                  </div>
                  {item.body && <p className="mt-1 text-sm text-valence-text leading-relaxed">{item.body}</p>}
                  <p className="mt-1 text-[10px] text-valence-subtle">{format(new Date(item.created_at), 'd MMM yyyy · HH:mm')}</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
