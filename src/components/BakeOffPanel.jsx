// IB tool — Bake-off mode.
//
// When VGP is one of several advisors pitching for a mandate, we
// track competitors + the decision date. Lives on the Deal drawer.
// Backend: public.bake_off_competitors.

import { useEffect, useState } from 'react'
import { Plus, Trash2, Trophy, Calendar, Sword } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useToast } from './Toast.jsx'
import { humanError } from '../lib/userError.js'
import StatusPill from './ui/StatusPill.jsx'
import { format, parseISO, differenceInDays } from 'date-fns'

const STATUS_TONE = {
  pitching:    'progress',
  shortlisted: 'progress',
  won:         'success',
  lost:        'danger',
  withdrawn:   'neutral',
}
const STATUSES = ['pitching', 'shortlisted', 'won', 'lost', 'withdrawn']

export default function BakeOffPanel({ deal }) {
  const toast = useToast()
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [adding, setAdding]     = useState(false)
  const [draftName, setDraftName] = useState('')
  const [decisionDate, setDecisionDate] = useState('')

  async function load() {
    if (!isSupabaseConfigured) { setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('bake_off_competitors')
        .select('*')
        .eq('deal_id', deal.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      toast.error(humanError(e, 'Could not load bake-off.'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (deal?.id) load() }, [deal?.id])

  async function add() {
    const name = draftName.trim()
    if (!name) return
    try {
      const { error } = await supabase.from('bake_off_competitors').insert({
        deal_id:       deal.id,
        competitor_name: name,
        decision_date:   decisionDate || null
      })
      if (error) throw error
      setDraftName(''); setAdding(false)
      await load()
    } catch (e) {
      toast.error(humanError(e, 'Could not add competitor.'))
    }
  }

  async function update(row, patch) {
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...patch } : r))
    try {
      const { error } = await supabase.from('bake_off_competitors').update(patch).eq('id', row.id)
      if (error) throw error
    } catch (e) {
      toast.error(humanError(e, 'Could not save change.')); load()
    }
  }

  async function remove(row) {
    try {
      const { error } = await supabase.from('bake_off_competitors').delete().eq('id', row.id)
      if (error) throw error
      await load()
    } catch (e) {
      toast.error(humanError(e, 'Could not remove.'))
    }
  }

  const nearestDecision = rows
    .filter(r => r.decision_date && ['pitching','shortlisted'].includes(r.status))
    .map(r => r.decision_date)
    .sort()[0]
  const daysOut = nearestDecision
    ? differenceInDays(parseISO(nearestDecision), new Date())
    : null

  return (
    <div className="vl-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Sword className="h-4 w-4 text-valence-blue" />
            <h3 className="text-sm font-semibold text-valence-text">Bake-off</h3>
            {rows.length > 0 && (
              <span className="text-xs text-valence-muted">· {rows.length} competitor{rows.length === 1 ? '' : 's'}</span>
            )}
          </div>
          <p className="text-xs text-valence-muted mt-0.5">
            Who else is pitching for this mandate. Track each + the decision date.
          </p>
        </div>
        <button onClick={() => setAdding(v => !v)} className="vl-btn-secondary text-xs">
          <Plus className="h-3 w-3" /> Add competitor
        </button>
      </div>

      {daysOut !== null && (
        <div className="flex items-center gap-2 rounded-lg bg-valence-blue-soft/60 px-3 py-2 text-xs">
          <Calendar className="h-3.5 w-3.5 text-valence-blue" />
          <span className="text-valence-text">
            Decision in <strong>{daysOut < 0 ? `${Math.abs(daysOut)} day${Math.abs(daysOut) === 1 ? '' : 's'} ago` : `${daysOut} day${daysOut === 1 ? '' : 's'}`}</strong>
            <span className="text-valence-muted"> · {format(parseISO(nearestDecision), 'd MMM yyyy')}</span>
          </span>
        </div>
      )}

      {adding && (
        <div className="grid grid-cols-[1fr_140px_auto] gap-2">
          <input autoFocus className="vl-input text-sm" placeholder="Competitor firm name"
                 value={draftName} onChange={e => setDraftName(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && add()} />
          <input type="date" className="vl-input text-sm"
                 value={decisionDate} onChange={e => setDecisionDate(e.target.value)} />
          <button onClick={add} className="vl-btn-primary-sm">Add</button>
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-xs text-valence-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface/30 py-8 text-center text-xs text-valence-muted">
          No competitors logged. Add who else is pitching to track the bake-off.
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={r.id} className="grid grid-cols-[1fr_120px_140px_28px] gap-2 items-center rounded-lg border border-valence-border bg-valence-surface/50 px-3 py-2">
              <div className="min-w-0 flex items-center gap-2">
                {r.status === 'won' && <Trophy className="h-3.5 w-3.5 text-valence-success shrink-0" />}
                <span className="truncate text-sm font-semibold text-valence-text">{r.competitor_name}</span>
              </div>
              <select value={r.status} onChange={e => update(r, { status: e.target.value })} className="vl-input text-[11px] py-1">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input type="date" value={r.decision_date || ''}
                     onChange={e => update(r, { decision_date: e.target.value || null })}
                     className="vl-input text-[11px] py-1" />
              <button onClick={() => remove(r)} className="vl-btn-ghost p-1 text-valence-subtle hover:text-valence-danger">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
