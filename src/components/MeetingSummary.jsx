import { useEffect, useState } from 'react'
import { format, parseISO, addDays } from 'date-fns'
import { Sparkles, CheckCircle2, Loader2, FileEdit, ListTodo, X } from 'lucide-react'
import Modal from './Modal.jsx'
import { summariseMeeting, isGeminiConfigured } from '../lib/gemini.js'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { logActivity } from '../lib/activity.js'
import { useToast } from './Toast.jsx'

export default function MeetingSummary({ open, onClose, meeting, deals = [] }) {
  const toast = useToast()
  const [notes, setNotes] = useState('')
  const [dealId, setDealId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setNotes(''); setResult(null); setDealId(meeting?.deal_id || '')
  }, [open, meeting?.id])

  async function summarise() {
    if (!notes.trim()) return
    if (!isGeminiConfigured) {
      toast.error('Gemini API key needed for meeting summaries.')
      return
    }
    setLoading(true); setResult(null)
    try {
      const r = await summariseMeeting({
        title:     meeting?.title || '',
        notes,
        dateLabel: meeting?.date ? format(parseISO(meeting.date), 'EEEE, d MMMM yyyy') : '',
        attendees: meeting ? [meeting.attendee_name].filter(Boolean) : []
      })
      // Prefill action item checked state
      r.action_items = (r.action_items || []).map(a => ({ ...a, _selected: true }))
      setResult(r)
    } catch (e) {
      toast.error(e.message || 'Summary failed')
    } finally {
      setLoading(false)
    }
  }

  async function saveToWorkspace() {
    if (!result) return
    if (!isSupabaseConfigured) return toast.error('Supabase is not configured.')
    setSaving(true)
    try {
      const selectedActions = (result.action_items || []).filter(a => a._selected && a.title?.trim())
      // Insert tasks
      if (selectedActions.length) {
        const rows = selectedActions.map(a => ({
          title: a.title.trim(),
          due_date: a.due_date && /^\d{4}-\d{2}-\d{2}$/.test(a.due_date) ? a.due_date : null,
          completed: false
        }))
        const { error } = await supabase.from('tasks').insert(rows)
        if (error) throw error
      }
      // Log activity on the deal
      if (dealId) {
        await logActivity({
          dealId,
          kind: 'meeting',
          body: result.summary + (selectedActions.length ? `\n\nAction items added: ${selectedActions.map(a => a.title).join('; ')}` : '')
        })
      }
      toast.success(`${selectedActions.length} task${selectedActions.length === 1 ? '' : 's'} created${dealId ? ' and note logged' : ''}.`)
      onClose?.()
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function toggleAction(i) {
    setResult(r => ({
      ...r,
      action_items: r.action_items.map((a, idx) => idx === i ? { ...a, _selected: !a._selected } : a)
    }))
  }

  function updateAction(i, patch) {
    setResult(r => ({
      ...r,
      action_items: r.action_items.map((a, idx) => idx === i ? { ...a, ...patch } : a)
    }))
  }

  function removeAction(i) {
    setResult(r => ({ ...r, action_items: r.action_items.filter((_, idx) => idx !== i) }))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Summarise meeting"
      description="Paste your notes or a transcript. AI extracts a summary, decisions, and action items — then files them as tasks."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <label className="vl-label">Link to deal <span className="normal-case tracking-normal text-valence-subtle">(optional)</span></label>
            <select className="vl-input" value={dealId} onChange={e => setDealId(e.target.value)}>
              <option className="bg-valence-surface" value="">— Not linked —</option>
              {deals.map(d => <option key={d.id} className="bg-valence-surface" value={d.id}>{d.client_name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="vl-label">Meeting notes / transcript</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={loading}
            placeholder="Paste raw notes from the meeting. Include attendees, key points, decisions, anything agreed or needing follow-up…"
            className="vl-input min-h-[200px] leading-relaxed"
            autoFocus
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="vl-btn-secondary">Cancel</button>
          <button onClick={summarise} disabled={!notes.trim() || loading || !isGeminiConfigured} className="vl-btn-primary">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Working…' : 'Summarise'}
          </button>
        </div>

        {result && (
          <div className="space-y-4 rounded-xl border border-valence-border bg-valence-surface p-4">
            <div>
              <p className="vl-label">Summary</p>
              <p className="mt-1 text-sm leading-relaxed text-valence-text">{result.summary}</p>
            </div>

            {(result.decisions || []).length > 0 && (
              <div>
                <p className="vl-label">Decisions</p>
                <ul className="mt-1 space-y-1">
                  {result.decisions.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-valence-text">
                      <CheckCircle2 className="h-3.5 w-3.5 text-valence-blue mt-0.5 shrink-0" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(result.action_items || []).length > 0 && (
              <div>
                <p className="vl-label flex items-center gap-2">
                  <ListTodo className="h-3 w-3" /> Action items
                  <span className="normal-case tracking-normal text-valence-subtle">— uncheck to skip</span>
                </p>
                <ul className="mt-2 space-y-1.5">
                  {result.action_items.map((a, i) => (
                    <li key={i} className="group flex items-center gap-2 rounded-lg border border-valence-border bg-valence-surface px-3 py-2">
                      <input
                        type="checkbox"
                        checked={a._selected}
                        onChange={() => toggleAction(i)}
                        className="accent-valence-blue"
                      />
                      <input
                        value={a.title || ''}
                        onChange={e => updateAction(i, { title: e.target.value })}
                        className="flex-1 bg-transparent text-sm text-valence-text outline-none"
                      />
                      <input
                        type="date"
                        value={a.due_date || ''}
                        onChange={e => updateAction(i, { due_date: e.target.value })}
                        className="rounded border border-valence-border bg-valence-surface px-2 py-1 text-xs text-valence-muted outline-none"
                      />
                      <button onClick={() => removeAction(i)} className="vl-btn-ghost" aria-label="Remove">
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(result.follow_up_questions || []).length > 0 && (
              <div>
                <p className="vl-label">Open questions</p>
                <ul className="mt-1 list-disc list-inside space-y-0.5 text-sm text-valence-muted">
                  {result.follow_up_questions.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setResult(null)} className="vl-btn-secondary">
                <FileEdit className="h-4 w-4" /> Redo
              </button>
              <button onClick={saveToWorkspace} disabled={saving} className="vl-btn-primary">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {saving ? 'Saving…' : 'File to workspace'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
