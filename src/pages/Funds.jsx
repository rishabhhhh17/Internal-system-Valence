import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Filter, LayoutGrid, Table as TableIcon, Building2, ArrowUpRight } from 'lucide-react'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import { FUND_TYPES, WARMTH_LEVELS, warmthTone, fundTypeLabel, DEMO_FUNDS } from '../lib/funds.js'
import { useViewMode } from '../hooks/useViewMode.jsx'
import { useCurrency } from '../hooks/useCurrency.jsx'
import ConfigBanner from '../components/ConfigBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'
import FundDrawer from '../components/FundDrawer.jsx'
import ViewModeToggle from '../components/ViewModeToggle.jsx'
import { useToast } from '../components/Toast.jsx'
import { humanError } from '../lib/userError.js'

function chequeRange(fund, money) {
  const lo = fund?.check_size_min_usd_m
  const hi = fund?.check_size_max_usd_m
  if (lo == null && hi == null) return 'Cheque size n/a'
  if (lo != null && hi != null) return `${money(lo)}–${money(hi)} cheques`
  if (lo != null)               return `from ${money(lo)} cheques`
  return `up to ${money(hi)} cheques`
}

export default function Funds() {
  const toast = useToast()
  const { isSimple } = useViewMode('funds')
  const { money } = useCurrency()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [view, setView] = useState('grid')
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [warmthFilter, setWarmthFilter] = useState('All')
  const [drawer, setDrawer] = useState(null) // null | 'new' | { row }
  const [params, setParams] = useSearchParams()

  useEffect(() => { load() }, [])

  // Live sync — teammate's new fund / warmth change shows up without reload.
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const off = subscribeTable('funds', load)
    return () => off()
  }, [])

  // Deep-link from clickable wikilink chips: /funds?open=<uuid>
  useEffect(() => {
    const id = params.get('open')
    if (!id || rows.length === 0) return
    const fund = rows.find(f => f.id === id)
    if (fund) {
      setDrawer({ row: fund })
      const next = new URLSearchParams(params); next.delete('open'); setParams(next, { replace: true })
    }
  }, [params, rows])

  async function load() {
    setLoading(true); setLoadError(null)
    if (!isSupabaseConfigured) { setRows(DEMO_FUNDS); setLoading(false); return }
    try {
      const fetchPromise = supabase.from('funds').select('*').order('name', { ascending: true })
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out — check your connection or Supabase status.')), 10_000)
      )
      const { data, error } = await Promise.race([fetchPromise, timeoutPromise])
      if (error) throw error
      setRows(data || [])
    } catch (err) {
      console.error(err)
      setLoadError(err?.message || 'Couldn\'t load funds.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  async function save(payload, existingId) {
    if (!isSupabaseConfigured) {
      if (existingId) setRows(prev => prev.map(r => r.id === existingId ? { ...r, ...payload } : r))
      else setRows(prev => [{ id: `local-${Date.now()}`, ...payload }, ...prev])
      setDrawer(null); toast.success(existingId ? 'Fund updated' : 'Fund saved'); return
    }
    if (existingId) {
      const { error } = await supabase.from('funds').update(payload).eq('id', existingId)
      if (error) return toast.error(humanError(error, 'Could not save fund'))
      toast.success('Fund updated')
    } else {
      const { error } = await supabase.from('funds').insert(payload)
      if (error) return toast.error(humanError(error, 'Could not add fund'))
      toast.success('Fund saved')
    }
    setDrawer(null); load()
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (typeFilter !== 'All' && r.fund_type !== typeFilter) return false
      if (warmthFilter !== 'All' && r.warmth !== warmthFilter) return false
      if (!needle) return true
      return [r.name, r.hq_city, r.hq_country, ...(r.sectors || []), ...(r.stages || []), ...(r.geographies || [])]
        .some(v => (v || '').toString().toLowerCase().includes(needle))
    })
  }, [rows, q, typeFilter, warmthFilter])

  return (
    <div className="space-y-6">
      <ConfigBanner />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vl-eyebrow-ink">Firm</p>
          <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
            Who writes the cheques.
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <ViewModeToggle pageKey="funds" />
          {!isSimple && (
            <div className="inline-flex items-center rounded-full border border-valence-border bg-valence-elevated p-0.5">
              <button onClick={() => setView('grid')}  className={`rounded-full px-2.5 py-1 transition ${view === 'grid'  ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`} title="Card view"><LayoutGrid className="h-3.5 w-3.5" /></button>
              <button onClick={() => setView('table')} className={`rounded-full px-2.5 py-1 transition ${view === 'table' ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`} title="Table view"><TableIcon className="h-3.5 w-3.5" /></button>
            </div>
          )}
          <button onClick={() => setDrawer('new')} className="vl-btn-primary"><Plus className="h-4 w-4" /> New fund</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FilterRow label="Type" value={typeFilter} onChange={setTypeFilter} options={['All', ...FUND_TYPES]} />
        <FilterRow label="Warmth" value={warmthFilter} onChange={setWarmthFilter} options={['All', ...WARMTH_LEVELS]} />
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-valence-subtle" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search fund, city, sector…"
            className="vl-input h-8 w-72 pl-8 text-xs"
          />
        </div>
      </div>

      {loading ? (
        <GridSkeleton />
      ) : loadError ? (
        <EmptyState icon={Building2} title="Couldn't load funds" description={loadError} action={<button onClick={load} className="vl-btn-primary">Retry</button>} sampleEligible={false} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Building2} title="No funds yet" description="Add your first fund to start the relationship CRM." action={<button onClick={() => setDrawer('new')} className="vl-btn-primary"><Plus className="h-4 w-4" /> New fund</button>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Building2} title="No funds match your filters" description="Clear a filter or broaden your search." sampleEligible={false} />
      ) : isSimple || view === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(f => <FundCard key={f.id} fund={f} onOpen={() => setDrawer({ row: f })} />)}
        </div>
      ) : (
        <FundTable rows={filtered} onOpen={f => setDrawer({ row: f })} />
      )}

      <FundDrawer
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        existing={drawer && drawer !== 'new' ? drawer.row : null}
        onSubmit={(payload, id) => save(payload, id)}
        onRename={async (id, name) => {
          if (isSupabaseConfigured) {
            const { error } = await supabase.from('funds').update({ name }).eq('id', id)
            if (error) { toast.error(humanError(error, 'Could not rename fund')); throw error }
          }
          setRows(prev => prev.map(r => r.id === id ? { ...r, name } : r))
          setDrawer(prev => prev && prev.row?.id === id ? { ...prev, row: { ...prev.row, name } } : prev)
          toast.success('Renamed.')
        }}
      />
    </div>
  )
}

function FilterRow({ label, value, onChange, options }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Filter className="h-3 w-3" /> {label}</span>
      {options.map(o => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize transition ${
            value === o
              ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text'
              : 'border-valence-border bg-valence-elevated text-valence-muted hover:text-valence-text'
          }`}
        >{o}</button>
      ))}
    </div>
  )
}

function FundCard({ fund, onOpen }) {
  const { money } = useCurrency()
  return (
    <button onClick={onOpen} className="vl-card vl-card-hover group block p-5 text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-valence-text truncate">{fund.name}</p>
          <p className="mt-0.5 text-[11px] text-valence-muted">{fundTypeLabel(fund.fund_type)} · {[fund.hq_city, fund.hq_country].filter(Boolean).join(', ') || '—'}</p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize shrink-0 ${warmthTone(fund.warmth)}`}>{fund.warmth}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {(fund.sectors || []).slice(0, 4).map(s => (
          <span key={s} className="rounded-full border border-valence-border bg-valence-surface px-2 py-0.5 text-[10px] text-valence-muted">{s}</span>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-valence-muted">
        <span>{chequeRange(fund, money)}</span>
        <span className="inline-flex items-center gap-1 text-valence-subtle group-hover:text-valence-blue transition">
          Open <ArrowUpRight className="h-3 w-3" />
        </span>
      </div>
    </button>
  )
}

function FundTable({ rows, onOpen }) {
  return (
    <div className="vl-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-valence-subtle">
            <th className="px-5 py-3">Fund</th>
            <th className="px-3 py-3">Type</th>
            <th className="px-3 py-3">HQ</th>
            <th className="px-3 py-3">AUM (USD M)</th>
            <th className="px-3 py-3">Cheque ($M)</th>
            <th className="px-3 py-3">Sectors</th>
            <th className="px-3 py-3">Warmth</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map(f => (
            <tr key={f.id} className="border-t border-valence-border/60 hover:bg-valence-surface/60">
              <td className="px-5 py-3 font-semibold text-valence-text">{f.name}</td>
              <td className="px-3 py-3 text-valence-muted">{fundTypeLabel(f.fund_type)}</td>
              <td className="px-3 py-3 text-valence-muted">{[f.hq_city, f.hq_country].filter(Boolean).join(', ') || '—'}</td>
              <td className="px-3 py-3 tabular-nums text-valence-muted">{f.aum_usd_m ? f.aum_usd_m.toLocaleString() : '—'}</td>
              <td className="px-3 py-3 tabular-nums text-valence-muted">{f.check_size_min_usd_m == null && f.check_size_max_usd_m == null ? '—' : `${f.check_size_min_usd_m ?? '?'}–${f.check_size_max_usd_m ?? '?'}`}</td>
              <td className="px-3 py-3 text-valence-muted truncate max-w-[260px]">{(f.sectors || []).slice(0, 4).join(' · ') || '—'}</td>
              <td className="px-3 py-3"><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${warmthTone(f.warmth)}`}>{f.warmth}</span></td>
              <td className="px-5 py-3 text-right">
                <button onClick={() => onOpen(f)} className="text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover">Open <ArrowUpRight className="inline h-3 w-3" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="vl-card p-5 space-y-3">
          <div className="h-3 w-2/3 rounded bg-valence-surface animate-pulse" />
          <div className="h-2.5 w-1/2 rounded bg-valence-surface animate-pulse" />
          <div className="h-12 w-full rounded bg-valence-surface animate-pulse" />
        </div>
      ))}
    </div>
  )
}
