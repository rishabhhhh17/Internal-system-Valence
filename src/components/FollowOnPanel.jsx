// VC tool — Follow-on signals.
//
// Lives on the Portfolio company detail (or as a top-of-Portfolio
// banner). Tracks active rounds: round size, lead, our pro-rata
// math, action needed. Backed by public.follow_on_signals.

import { useEffect, useState } from 'react'
import { Plus, Trash2, TrendingUp } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useToast } from './Toast.jsx'
import { humanError } from '../lib/userError.js'
import StatusPill from './ui/StatusPill.jsx'

const ACTIONS = ['review','commit','pass','negotiating','done']
const ACTION_TONE = {
  review: 'progress', commit: 'success', pass: 'danger',
  negotiating: 'warning', done: 'success'
}

export default function FollowOnPanel({ portcoId, portcoName }) {
  const toast = useToast()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(false)
  const [draft, setDraft]     = useState(emptyDraft())

  async function load() {
    if (!isSupabaseConfigured || !portcoId) { setLoading(false); return }
    try {
      const { data, error } = await supabase.from('follow_on_signals')
        .select('*').eq('portco_id', portcoId).order('signal_date', { ascending: false })
      if (error) throw error
      setRows(data || [])
    } catch (e) { toast.error(humanError(e, 'Could not load follow-on signals.')) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [portcoId])

  async function save() {
    try {
      const { error } = await supabase.from('follow_on_signals').insert({
        portco_id:        portcoId,
        signal_date:      draft.signal_date,
        round_size_usd_m: draft.round_size_usd_m === '' ? null : Number(draft.round_size_usd_m),
        lead_investor:    draft.lead_investor || null,
        pro_rata_usd_m:   draft.pro_rata_usd_m === '' ? null : Number(draft.pro_rata_usd_m),
        action_needed:    draft.action_needed,
        notes:            draft.notes || null,
      })
      if (error) throw error
      setDraft(emptyDraft()); setAdding(false)
      await load()
    } catch (e) { toast.error(humanError(e, 'Could not log signal.')) }
  }

  async function remove(row) {
    try {
      const { error } = await supabase.from('follow_on_signals').delete().eq('id', row.id)
      if (error) throw error
      await load()
    } catch (e) { toast.error(humanError(e, 'Could not remove.')) }
  }

  return (
    <div className="vl-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-valence-blue" />
            <h3 className="text-sm font-semibold text-valence-text">Follow-on signals</h3>
            {portcoName && <span className="text-xs text-valence-muted">· {portcoName}</span>}
          </div>
          <p className="text-xs text-valence-muted mt-0.5">
            New rounds, pro-rata math, action needed.
          </p>
        </div>
        <button onClick={() => setAdding(v => !v)} className="vl-btn-secondary text-xs">
          <Plus className="h-3 w-3" /> Log signal
        </button>
      </div>

      {adding && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-lg border border-valence-border p-3">
          <input type="date" className="vl-input text-xs" value={draft.signal_date}
                 onChange={e => setDraft(d => ({ ...d, signal_date: e.target.value }))} />
          <input type="number" min="0" step="0.1" placeholder="Round size $M" className="vl-input text-xs"
                 value={draft.round_size_usd_m} onChange={e => setDraft(d => ({ ...d, round_size_usd_m: e.target.value }))} />
          <input placeholder="Lead investor" className="vl-input text-xs"
                 value={draft.lead_investor} onChange={e => setDraft(d => ({ ...d, lead_investor: e.target.value }))} />
          <input type="number" min="0" step="0.1" placeholder="Pro-rata $M" className="vl-input text-xs"
                 value={draft.pro_rata_usd_m} onChange={e => setDraft(d => ({ ...d, pro_rata_usd_m: e.target.value }))} />
          <select className="vl-input text-xs" value={draft.action_needed}
                  onChange={e => setDraft(d => ({ ...d, action_needed: e.target.value }))}>
            {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={save} className="vl-btn-primary-sm">Save</button>
        </div>
      )}

      {loading ? (
        <div className="py-4 text-center text-xs text-valence-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface/30 py-6 text-center text-xs text-valence-muted">
          No follow-on signals yet.
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={r.id} className="grid grid-cols-[110px_1fr_120px_30px] gap-2 items-center rounded-lg border border-valence-border bg-valence-surface/50 px-3 py-2">
              <span className="text-[11px] text-valence-muted">{r.signal_date ? format(parseISO(r.signal_date), 'd MMM') : '—'}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-valence-text">
                  {r.round_size_usd_m != null ? `$${r.round_size_usd_m}M round` : 'Round size TBD'}
                  {r.lead_investor && <span className="text-valence-muted"> · led by {r.lead_investor}</span>}
                </p>
                <p className="text-[10px] text-valence-muted">
                  Pro-rata: {r.pro_rata_usd_m != null ? `$${r.pro_rata_usd_m}M` : '—'}
                  {r.notes && ` · ${r.notes}`}
                </p>
              </div>
              <StatusPill tone={ACTION_TONE[r.action_needed] || 'neutral'} subtle>{r.action_needed}</StatusPill>
              <button onClick={() => remove(r)} className="p-1 text-valence-subtle hover:text-valence-danger">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function emptyDraft() {
  return { signal_date: new Date().toISOString().slice(0,10),
    round_size_usd_m: '', lead_investor: '', pro_rata_usd_m: '',
    action_needed: 'review', notes: '' }
}
