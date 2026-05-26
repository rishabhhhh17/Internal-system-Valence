// PE tool — Diligence workstreams.
//
// Per-deal grid of diligence streams (commercial / financial / legal /
// operational) with status, owner, provider, due date, doc link.
// Backed by public.diligence_workstreams. Used on the Deal drawer for
// PE deals in Diligence stage.

import { useEffect, useState } from 'react'
import { Plus, Trash2, ExternalLink, ClipboardList } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useToast } from './Toast.jsx'
import { humanError } from '../lib/userError.js'
import StatusPill from './ui/StatusPill.jsx'

const STATUSES = ['not_started', 'in_progress', 'review', 'blocked', 'done']
const STATUS_TONE = {
  not_started: 'neutral', in_progress: 'progress', review: 'progress',
  blocked: 'warning', done: 'success'
}
const DEFAULT_STREAMS = ['Commercial', 'Financial', 'Legal', 'Operational', 'Tax', 'Tech']

export default function DiligencePanel({ deal }) {
  const toast = useToast()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)

  async function load() {
    if (!isSupabaseConfigured) { setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('diligence_workstreams').select('*')
        .eq('deal_id', deal.id).order('created_at', { ascending: true })
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      toast.error(humanError(e, 'Could not load workstreams.'))
    } finally { setLoading(false) }
  }
  useEffect(() => { if (deal?.id) load() }, [deal?.id])

  async function seedDefaults() {
    setSeeding(true)
    try {
      const inserts = DEFAULT_STREAMS.map(s => ({ deal_id: deal.id, workstream: s }))
      const { error } = await supabase.from('diligence_workstreams').insert(inserts)
      if (error) throw error
      await load()
    } catch (e) {
      toast.error(humanError(e, 'Could not seed workstreams.'))
    } finally { setSeeding(false) }
  }

  async function addRow() {
    const name = prompt('New workstream name:')
    if (!name?.trim()) return
    try {
      const { error } = await supabase.from('diligence_workstreams').insert({
        deal_id: deal.id, workstream: name.trim()
      })
      if (error) throw error
      await load()
    } catch (e) { toast.error(humanError(e, 'Could not add.')) }
  }

  async function update(row, patch) {
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...patch } : r))
    try {
      const { error } = await supabase.from('diligence_workstreams').update(patch).eq('id', row.id)
      if (error) throw error
    } catch (e) { toast.error(humanError(e, 'Could not save.')); load() }
  }

  async function remove(row) {
    try {
      const { error } = await supabase.from('diligence_workstreams').delete().eq('id', row.id)
      if (error) throw error
      await load()
    } catch (e) { toast.error(humanError(e, 'Could not remove.')) }
  }

  const done = rows.filter(r => r.status === 'done').length

  return (
    <div className="vl-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-valence-blue" />
            <h3 className="text-sm font-semibold text-valence-text">Diligence workstreams</h3>
            {rows.length > 0 && (
              <span className="text-xs text-valence-muted">{done} / {rows.length} done</span>
            )}
          </div>
          <p className="text-xs text-valence-muted mt-0.5">
            Track each diligence stream: status, owner, external provider, document link.
          </p>
        </div>
        {rows.length > 0 && (
          <button onClick={addRow} className="vl-btn-ghost text-xs">
            <Plus className="h-3 w-3" /> Add
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-valence-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface/30 py-8 text-center text-xs text-valence-muted">
          No workstreams yet.{' '}
          <button onClick={seedDefaults} disabled={seeding} className="font-semibold text-valence-blue hover:underline">
            {seeding ? 'Seeding…' : 'Seed the 6 standard streams'}
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-valence-border">
          <table className="w-full text-xs">
            <thead className="bg-valence-surface/40 text-[10px] uppercase tracking-wider text-valence-subtle">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Workstream</th>
                <th className="text-left px-3 py-2 font-semibold">Status</th>
                <th className="text-left px-3 py-2 font-semibold">Owner</th>
                <th className="text-left px-3 py-2 font-semibold">Provider</th>
                <th className="text-left px-3 py-2 font-semibold">Due</th>
                <th className="text-left px-3 py-2 font-semibold">Doc</th>
                <th className="w-7"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-valence-border/40">
                  <td className="px-3 py-2 font-semibold text-valence-text">{r.workstream}</td>
                  <td className="px-3 py-2">
                    <select value={r.status} onChange={e => update(r, { status: e.target.value })}
                            className="vl-input text-[11px] py-0.5">
                      {STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input value={r.owner || ''} onChange={e => update(r, { owner: e.target.value || null })}
                           placeholder="—" className="vl-input text-[11px] py-0.5" />
                  </td>
                  <td className="px-3 py-2">
                    <input value={r.provider || ''} onChange={e => update(r, { provider: e.target.value || null })}
                           placeholder="—" className="vl-input text-[11px] py-0.5" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="date" value={r.due_date || ''}
                           onChange={e => update(r, { due_date: e.target.value || null })}
                           className="vl-input text-[11px] py-0.5" />
                  </td>
                  <td className="px-3 py-2">
                    {r.doc_url
                      ? <a href={r.doc_url} target="_blank" rel="noreferrer" className="text-valence-blue text-[11px] hover:underline inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />Open</a>
                      : <input placeholder="paste link"
                               onBlur={e => e.target.value && update(r, { doc_url: e.target.value })}
                               className="vl-input text-[11px] py-0.5" />}
                  </td>
                  <td className="px-2">
                    <button onClick={() => remove(r)} className="p-1 text-valence-subtle hover:text-valence-danger">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
