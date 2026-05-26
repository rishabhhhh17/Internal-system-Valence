// /passes — VC tool combining Pass tracker + Anti-portfolio.
//
// Same underlying table (public.passed_deals). Two tabs:
//   - Pass log: every deal you passed on + the reason
//   - Anti-portfolio: passes whose outcome later became outperformed
//     or unicorn (filtered view of the same data)
//
// Honest learning surface — partners log the reason at the moment of
// passing, then revisit annually.

import { useEffect, useState, useMemo } from 'react'
import { Plus, Loader2, X, AlertTriangle, TrendingUp } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useToast } from '../components/Toast.jsx'
import { humanError } from '../lib/userError.js'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import MetricCard from '../components/ui/MetricCard.jsx'

const REASONS = ['thesis_mismatch','stage_mismatch','geography','team','traction','valuation','timing','competitive','other']
const OUTCOMES = ['unknown','still_growing','flat','failed','outperformed','unicorn']
const OUTCOME_TONE = {
  unknown: 'neutral', still_growing: 'progress', flat: 'neutral', failed: 'danger',
  outperformed: 'warning', unicorn: 'warning'
}

export default function Passes() {
  const toast = useToast()
  const [tab, setTab]   = useState('log')   // 'log' | 'anti'
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(false)
  const [draft, setDraft]     = useState(emptyDraft())

  useEffect(() => { load() }, [])
  async function load() {
    if (!isSupabaseConfigured) { setLoading(false); return }
    try {
      const { data, error } = await supabase
        .from('passed_deals').select('*').order('passed_at', { ascending: false })
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      toast.error(humanError(e, 'Could not load passes.'))
    } finally { setLoading(false) }
  }

  async function save() {
    if (!draft.company_name.trim()) return
    try {
      const { error } = await supabase.from('passed_deals').insert({
        company_name:  draft.company_name.trim(),
        sector:        draft.sector || null,
        geography:     draft.geography || null,
        passed_at:     draft.passed_at || new Date().toISOString().slice(0,10),
        reason:        draft.reason,
        reason_detail: draft.reason_detail || null,
      })
      if (error) throw error
      setDraft(emptyDraft()); setAdding(false)
      await load()
    } catch (e) { toast.error(humanError(e, 'Could not save pass.')) }
  }

  async function updateOutcome(row, outcome) {
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, outcome } : r))
    try {
      const { error } = await supabase.from('passed_deals').update({ outcome }).eq('id', row.id)
      if (error) throw error
    } catch (e) { toast.error(humanError(e, 'Could not update outcome.')); load() }
  }

  const stats = useMemo(() => {
    // All three metrics live on the same denominator (rows from this year)
    // so the partner sees a coherent picture instead of "5 passes this year,
    // 2 outperformed all-time" which conflates time windows.
    const yearPrefix = String(new Date().getFullYear())
    const thisYear   = rows.filter(r => r.passed_at?.startsWith(yearPrefix))
    const outperformed = thisYear.filter(r => r.outcome === 'outperformed' || r.outcome === 'unicorn').length
    const reasonsMap = {}
    for (const r of thisYear) reasonsMap[r.reason] = (reasonsMap[r.reason] || 0) + 1
    const topReason = Object.entries(reasonsMap).sort((a, b) => b[1] - a[1])[0]
    return {
      totalThisYear: thisYear.length,
      outperformed,
      topReason: topReason ? `${topReason[0].replace('_',' ')} (${topReason[1]})` : '—'
    }
  }, [rows])

  const visible = tab === 'anti'
    ? rows.filter(r => r.outcome === 'outperformed' || r.outcome === 'unicorn')
    : rows

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Passes"
        title={tab === 'anti' ? 'Anti-portfolio' : 'Pass log'}
        sub={tab === 'anti'
          ? 'Deals you passed on that later outperformed. Cheap learning.'
          : 'Every deal you passed + the reason. Honest pattern-mining over the year.'}
        right={
          <button onClick={() => setAdding(v => !v)} className="vl-btn-primary">
            <Plus className="h-4 w-4" /> Log a pass
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricCard label="Passes this year" value={stats.totalThisYear} />
        <MetricCard label="Outperformed since pass"  value={stats.outperformed} tone={stats.outperformed > 0 ? 'warning' : 'default'} icon={AlertTriangle} />
        <MetricCard label="Top reason" value={stats.topReason} />
      </div>

      <div className="inline-flex items-center rounded-lg border border-valence-border bg-valence-surface p-0.5">
        <button onClick={() => setTab('log')}
                className={`text-xs px-3 py-1.5 rounded-md font-semibold ${tab === 'log' ? 'bg-valence-blue-soft text-valence-text' : 'text-valence-muted'}`}>
          Pass log
        </button>
        <button onClick={() => setTab('anti')}
                className={`text-xs px-3 py-1.5 rounded-md font-semibold ${tab === 'anti' ? 'bg-valence-blue-soft text-valence-text' : 'text-valence-muted'}`}>
          Anti-portfolio
        </button>
      </div>

      {adding && (
        <div className="vl-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-valence-text">Log a pass</h3>
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
            <Field label="Passed at">
              <input type="date" className="vl-input" value={draft.passed_at}
                     onChange={e => setDraft(d => ({ ...d, passed_at: e.target.value }))} />
            </Field>
            <Field label="Reason">
              <select className="vl-input" value={draft.reason}
                      onChange={e => setDraft(d => ({ ...d, reason: e.target.value }))}>
                {REASONS.map(r => <option key={r} value={r}>{r.replace('_',' ')}</option>)}
              </select>
            </Field>
            <Field label="Detail (optional)">
              <input className="vl-input" placeholder="One sentence"
                     value={draft.reason_detail}
                     onChange={e => setDraft(d => ({ ...d, reason_detail: e.target.value }))} />
            </Field>
          </div>
          <div className="flex justify-end">
            <button onClick={save} disabled={!draft.company_name.trim()} className="vl-btn-primary">Save</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="vl-card p-8 text-center text-xs text-valence-muted">
          <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : visible.length === 0 ? (
        <div className="vl-card p-10 text-center">
          <p className="text-sm font-semibold text-valence-text">
            {tab === 'anti' ? 'No anti-portfolio entries yet' : 'No passes logged yet'}
          </p>
          <p className="text-xs text-valence-muted mt-1">
            {tab === 'anti'
              ? 'Update an existing pass\'s outcome to "outperformed" or "unicorn" — it\'ll appear here.'
              : 'Logging every pass + reason makes pattern-mining possible at year-end.'}
          </p>
        </div>
      ) : (
        <div className="vl-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-valence-surface/40 text-[10px] uppercase tracking-wider text-valence-subtle">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Company</th>
                <th className="text-left px-4 py-2.5 font-semibold">Sector / geo</th>
                <th className="text-left px-4 py-2.5 font-semibold">Passed</th>
                <th className="text-left px-4 py-2.5 font-semibold">Reason</th>
                <th className="text-left px-4 py-2.5 font-semibold">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id} className="border-t border-valence-border/40 hover:bg-valence-surface/40 transition">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-valence-text">{r.company_name}</p>
                    {r.reason_detail && <p className="text-[11px] text-valence-muted mt-0.5 truncate max-w-md">{r.reason_detail}</p>}
                  </td>
                  <td className="px-4 py-3 text-valence-muted">
                    {r.sector || '—'} {r.geography ? `· ${r.geography}` : ''}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-valence-muted">
                    {r.passed_at ? format(parseISO(r.passed_at), 'd MMM yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-valence-text">{r.reason.replace('_',' ')}</td>
                  <td className="px-4 py-3">
                    <select value={r.outcome || 'unknown'} onChange={e => updateOutcome(r, e.target.value)}
                            className="vl-input text-[11px] py-0.5">
                      {OUTCOMES.map(o => <option key={o} value={o}>{o.replace('_',' ')}</option>)}
                    </select>
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
  return { company_name: '', sector: '', geography: '', passed_at: new Date().toISOString().slice(0,10),
    reason: 'thesis_mismatch', reason_detail: '' }
}
function Field({ label, children }) {
  return (<label className="space-y-1.5"><span className="vl-label">{label}</span>{children}</label>)
}
