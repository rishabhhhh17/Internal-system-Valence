import { useEffect, useMemo, useState } from 'react'
import { Plus, User2, Trash2, Percent } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { humanError } from '../lib/userError.js'
import { useToast } from './Toast.jsx'
import { useConfirm } from './ConfirmDialog.jsx'

const ROLES = ['Lead Partner', 'Deputy', 'Associate', 'Analyst', 'Legal', 'Co-advisor']

export default function DealTeam({ deal }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!deal?.id) return
    if (!isSupabaseConfigured) { setRows([]); setLoading(false); return }
    load()
  }, [deal?.id])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('deal_team').select('*').eq('deal_id', deal.id).order('created_at')
    if (error) toast.error(humanError(error, 'Could not load team'))
    setRows(data || [])
    setLoading(false)
  }

  async function add(form) {
    if (!isSupabaseConfigured) {
      setRows(prev => [...prev, { id: `local-${Date.now()}`, deal_id: deal.id, ...form }])
      setAdding(false)
      return
    }
    const { data, error } = await supabase.from('deal_team').insert({ deal_id: deal.id, ...form }).select().single()
    if (error) return toast.error(humanError(error, 'Could not add team member'))
    setRows(prev => [...prev, data])
    setAdding(false)
    toast.success(`${form.name} added to the team.`)
  }

  async function update(row, patch) {
    if (!isSupabaseConfigured) {
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...patch } : r))
      return
    }
    const { error } = await supabase.from('deal_team').update(patch).eq('id', row.id)
    if (error) return toast.error(humanError(error, 'Could not update team member'))
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...patch } : r))
  }

  async function remove(row) {
    const ok = await confirm({ title: 'Remove from team?', body: `${row.name} will be removed from this deal.`, destructive: true, confirmLabel: 'Remove' })
    if (!ok) return
    if (!isSupabaseConfigured) { setRows(prev => prev.filter(r => r.id !== row.id)); return }
    const { error } = await supabase.from('deal_team').delete().eq('id', row.id)
    if (error) return toast.error(humanError(error, 'Could not remove team member'))
    setRows(prev => prev.filter(r => r.id !== row.id))
    toast.success('Removed.')
  }

  const totalShare = useMemo(() =>
    rows.reduce((s, r) => s + (Number(r.share_pct) || 0), 0),
  [rows])

  const lead = rows.find(r => r.role === 'Lead Partner') || rows[0]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-valence-text">Internal deal team</p>
          <p className="text-xs text-valence-muted mt-0.5">
            Valence side of the deal. Track roles + origination / execution credit.
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="vl-btn-ghost">
          <Plus className="h-3.5 w-3.5" /> Add member
        </button>
      </div>

      {adding && <AddForm onCancel={() => setAdding(false)} onSubmit={add} suggestedLead={!lead} />}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-valence-surface animate-pulse" />)}
        </div>
      ) : rows.length === 0 && !adding ? (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-6 text-center">
          <User2 className="mx-auto h-4 w-4 text-valence-subtle" />
          <p className="mt-2 text-sm text-valence-muted">No team assigned yet.</p>
          <p className="mt-1 text-[11px] text-valence-subtle">Add the Lead Partner and supporting staff.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {rows.map(r => (
              <li key={r.id} className="group rounded-lg border border-valence-border bg-valence-elevated px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-valence-blue to-[#1a66cc] text-[11px] font-semibold text-white ring-1 ring-valence-border-strong shrink-0">
                    {initials(r.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-valence-text">{r.name}</p>
                      <span className="vl-chip-blue">{r.role}</span>
                    </div>
                    {r.email && <p className="mt-0.5 text-[11px] text-valence-muted truncate">{r.email}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 rounded-md border border-valence-border bg-valence-surface px-2 py-1 text-[11px]">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="5"
                        value={r.share_pct ?? ''}
                        onChange={e => update(r, { share_pct: e.target.value === '' ? null : Number(e.target.value) })}
                        className="w-10 bg-transparent text-right font-semibold tabular-nums text-valence-text outline-none"
                        placeholder="—"
                      />
                      <Percent className="h-3 w-3 text-valence-subtle" />
                    </label>
                    <button onClick={() => remove(r)} className="vl-btn-ghost text-valence-subtle hover:text-valence-danger opacity-0 group-hover:opacity-100 transition" aria-label="Remove">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between rounded-lg border border-valence-border bg-valence-surface px-4 py-3 text-xs">
            <span className="text-valence-muted">Credit split</span>
            <span className={`font-semibold tabular-nums ${Math.abs(totalShare - 100) < 0.5 ? 'text-valence-success' : totalShare > 0 ? 'text-valence-warning' : 'text-valence-muted'}`}>
              {totalShare.toFixed(0)}% allocated
              {totalShare > 0 && Math.abs(totalShare - 100) >= 0.5 && (
                <span className="ml-1 text-valence-subtle">({100 - totalShare}% unassigned)</span>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function AddForm({ onSubmit, onCancel, suggestedLead }) {
  const [form, setForm] = useState({
    name: '',
    role: suggestedLead ? 'Lead Partner' : 'Associate',
    email: '',
    share_pct: ''
  })
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    await onSubmit({
      name: form.name.trim(),
      role: form.role,
      email: form.email.trim() || null,
      share_pct: form.share_pct === '' ? null : Number(form.share_pct)
    })
  }
  return (
    <form onSubmit={submit} className="rounded-lg border border-valence-border bg-valence-surface p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Name" className="vl-input" required autoFocus />
        <select value={form.role} onChange={e => set('role', e.target.value)} className="vl-input">
          {ROLES.map(r => <option key={r} className="bg-valence-elevated" value={r}>{r}</option>)}
        </select>
        <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="Email (optional)" type="email" className="vl-input" />
        <input value={form.share_pct} onChange={e => set('share_pct', e.target.value)} placeholder="Credit %" type="number" min="0" max="100" step="5" className="vl-input" />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="vl-btn-secondary-sm">Cancel</button>
        <button type="submit" className="vl-btn-primary-sm">Add</button>
      </div>
    </form>
  )
}

function initials(name) {
  // Default to '' first — caller may pass null/undefined, not just '',
  // which would bypass the parameter default and crash on .split.
  const n = (name || '').trim()
  if (!n) return '?'
  return n.split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase()
}
