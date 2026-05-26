// /portfolio — PE/VC Portfolio company tracker.
//
// Each row in public.portfolio_companies is a company you own (PE) or
// have invested in (VC). Tracks ownership %, board seats, last update,
// next review, current valuation, status. Inline add + click row to
// view detail (later).
//
// Gated by `portfolio_tracker` feature flag — sidebar entry only
// renders for PE/VC by default.

import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Loader2, TrendingUp, Calendar, Building, ChevronRight, X } from 'lucide-react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useToast } from '../components/Toast.jsx'
import { humanError } from '../lib/userError.js'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import MetricCard from '../components/ui/MetricCard.jsx'

const STATUS_TONE = { active: 'success', exited: 'progress', written_off: 'danger' }

export default function Portfolio() {
  const toast = useToast()
  const [rows, setRows]   = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(false)
  const [draft, setDraft]     = useState(emptyDraft())

  async function load() {
    if (!isSupabaseConfigured) { setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('portfolio_companies').select('*').order('invested_at', { ascending: false })
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      toast.error(humanError(e, 'Could not load portfolio.'))
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function save() {
    if (!draft.company_name.trim()) return
    try {
      const { error } = await supabase.from('portfolio_companies').insert({
        company_name:    draft.company_name.trim(),
        sector:          draft.sector || null,
        geography:       draft.geography || null,
        invested_at:     draft.invested_at || null,
        ownership_pct:   draft.ownership_pct === '' ? null : Number(draft.ownership_pct),
        board_seats:     draft.board_seats === '' ? null : Number(draft.board_seats),
        current_valuation_usd_m: draft.current_valuation_usd_m === '' ? null : Number(draft.current_valuation_usd_m),
        thesis_brief:    draft.thesis_brief || null,
      })
      if (error) throw error
      setDraft(emptyDraft()); setAdding(false)
      await load()
    } catch (e) {
      toast.error(humanError(e, 'Could not save portfolio company.'))
    }
  }

  const stats = useMemo(() => {
    const active = rows.filter(r => r.status === 'active')
    const exited = rows.filter(r => r.status === 'exited').length
    const totalNav = active.reduce((sum, r) => sum + (Number(r.current_valuation_usd_m) || 0) * (Number(r.ownership_pct) || 0) / 100, 0)
    const stale = active.filter(r => {
      if (!r.last_update_at) return true
      return differenceInDays(new Date(), parseISO(r.last_update_at)) > 60
    }).length
    return { active: active.length, exited, totalNav, stale }
  }, [rows])

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Portfolio"
        title="Companies you own"
        sub="Active investments, board seats, current marks. Click any row to manage the value-creation plan."
        right={
          <button onClick={() => setAdding(v => !v)} className="vl-btn-primary">
            <Plus className="h-4 w-4" /> Add company
          </button>
        }
      />

      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Active"   value={stats.active} icon={TrendingUp} />
          <MetricCard label="Exited"   value={stats.exited} tone="success" />
          <MetricCard label="NAV (USD M)" value={stats.totalNav ? stats.totalNav.toFixed(1) : '—'} sub="Ownership × current valuation" tone="blue" />
          <MetricCard label="Stale > 60d" value={stats.stale} sub="No update logged" tone={stats.stale > 0 ? 'warning' : 'default'} />
        </div>
      )}

      {adding && (
        <div className="vl-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-valence-text">Add portfolio company</h3>
            <button onClick={() => { setAdding(false); setDraft(emptyDraft()) }} className="vl-btn-ghost text-xs">
              <X className="h-3 w-3" /> Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Company *">
              <input className="vl-input" value={draft.company_name}
                     onChange={e => setDraft(d => ({ ...d, company_name: e.target.value }))} />
            </Field>
            <Field label="Sector">
              <input className="vl-input" value={draft.sector}
                     onChange={e => setDraft(d => ({ ...d, sector: e.target.value }))} />
            </Field>
            <Field label="Geography">
              <input className="vl-input" value={draft.geography}
                     onChange={e => setDraft(d => ({ ...d, geography: e.target.value }))} />
            </Field>
            <Field label="Invested at">
              <input type="date" className="vl-input" value={draft.invested_at}
                     onChange={e => setDraft(d => ({ ...d, invested_at: e.target.value }))} />
            </Field>
            <Field label="Ownership %">
              <input type="number" min="0" max="100" step="0.1" className="vl-input" value={draft.ownership_pct}
                     onChange={e => setDraft(d => ({ ...d, ownership_pct: e.target.value }))} />
            </Field>
            <Field label="Board seats">
              <input type="number" min="0" className="vl-input" value={draft.board_seats}
                     onChange={e => setDraft(d => ({ ...d, board_seats: e.target.value }))} />
            </Field>
            <Field label="Current valuation (USD M)">
              <input type="number" min="0" step="0.1" className="vl-input" value={draft.current_valuation_usd_m}
                     onChange={e => setDraft(d => ({ ...d, current_valuation_usd_m: e.target.value }))} />
            </Field>
            <Field label="Thesis brief">
              <input className="vl-input" placeholder="One-line thesis"
                     value={draft.thesis_brief}
                     onChange={e => setDraft(d => ({ ...d, thesis_brief: e.target.value }))} />
            </Field>
          </div>
          <div className="flex justify-end">
            <button onClick={save} disabled={!draft.company_name.trim()} className="vl-btn-primary">
              Save
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="vl-card p-10 text-center text-sm text-valence-muted">
          <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading portfolio…
        </div>
      ) : rows.length === 0 ? (
        <div className="vl-card p-10 text-center">
          <Building className="h-8 w-8 text-valence-subtle mx-auto mb-3" />
          <p className="text-sm font-semibold text-valence-text">No portfolio companies yet</p>
          <p className="text-xs text-valence-muted mt-1">Add your first active investment to populate this page.</p>
          <button onClick={() => setAdding(true)} className="vl-btn-primary mt-4">
            <Plus className="h-4 w-4" /> Add company
          </button>
        </div>
      ) : (
        <div className="vl-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-valence-surface/40 text-[10px] uppercase tracking-wider text-valence-subtle">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Company</th>
                <th className="text-left px-4 py-2.5 font-semibold">Sector</th>
                <th className="text-right px-4 py-2.5 font-semibold">Ownership</th>
                <th className="text-right px-4 py-2.5 font-semibold">Board</th>
                <th className="text-right px-4 py-2.5 font-semibold">Valuation</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                <th className="text-left px-4 py-2.5 font-semibold">Last update</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-valence-border/40 hover:bg-valence-surface/40 transition cursor-pointer">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-valence-text">{r.company_name}</p>
                    {r.thesis_brief && <p className="text-[11px] text-valence-muted mt-0.5 truncate max-w-md">{r.thesis_brief}</p>}
                  </td>
                  <td className="px-4 py-3 text-valence-muted">{r.sector || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.ownership_pct != null ? `${r.ownership_pct}%` : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.board_seats ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.current_valuation_usd_m != null ? `$${r.current_valuation_usd_m}M` : '—'}</td>
                  <td className="px-4 py-3">
                    <StatusPill tone={STATUS_TONE[r.status] || 'neutral'} subtle>{r.status}</StatusPill>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-valence-muted">
                    {r.last_update_at
                      ? format(parseISO(r.last_update_at), 'd MMM yyyy')
                      : <span className="text-valence-warning">never</span>}
                  </td>
                  <td className="px-2">
                    <ChevronRight className="h-4 w-4 text-valence-subtle" />
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

function emptyDraft() {
  return {
    company_name: '', sector: '', geography: '', invested_at: '',
    ownership_pct: '', board_seats: '', current_valuation_usd_m: '', thesis_brief: ''
  }
}

function Field({ label, children }) {
  return (
    <label className="space-y-1.5">
      <span className="vl-label">{label}</span>
      {children}
    </label>
  )
}
