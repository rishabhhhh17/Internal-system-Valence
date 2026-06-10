import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Filter, LayoutGrid, Table as TableIcon, Building2, ArrowUpRight } from 'lucide-react'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import { FOUNDER_STAGES, LP_ARCHETYPES, WARMTH_LEVELS, warmthTone, founderStage, lpArchetype, lpGeographies, DEMO_FOUNDERS, DEMO_LPS } from '../lib/funds.js'
import { useViewMode } from '../hooks/useViewMode.jsx'
import { usePipelineMode } from '../hooks/usePipelineMode.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'
import FundDrawer from '../components/FundDrawer.jsx'
import ViewModeToggle from '../components/ViewModeToggle.jsx'
import { useToast } from '../components/Toast.jsx'
import { humanError } from '../lib/userError.js'

export default function Funds() {
  const toast = useToast()
  const { isSimple } = useViewMode('funds')
  // The same Relationships section serves two audiences, driven by the global
  // toggle: Founders (companies) and LPs (limited partners). They share the
  // `funds` table, discriminated by `kind` ('founder' | 'lp').
  const [pipelineMode] = usePipelineMode()
  const isLp = pipelineMode === 'lp'
  const kind = isLp ? 'lp' : 'founder'
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [view, setView] = useState('grid')
  const [q, setQ] = useState('')
  // Founder filters
  const [stageFilter, setStageFilter] = useState('All')
  const [sectorFilter, setSectorFilter] = useState('All')
  // LP filters
  const [geoFilter, setGeoFilter] = useState('All')
  const [archetypeFilter, setArchetypeFilter] = useState('All')
  // Shared
  const [warmthFilter, setWarmthFilter] = useState('All')
  const [drawer, setDrawer] = useState(null) // null | 'new' | { row }
  const [params, setParams] = useSearchParams()

  // Reload + reset filters when the audience toggle flips.
  useEffect(() => {
    setStageFilter('All'); setSectorFilter('All'); setGeoFilter('All'); setArchetypeFilter('All'); setWarmthFilter('All')
    load()
  }, [pipelineMode])

  // Live sync — teammate's new row / warmth change shows up without reload.
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const off = subscribeTable('funds', load)
    return () => off()
  }, [pipelineMode])

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
    if (!isSupabaseConfigured) { setRows(isLp ? DEMO_LPS : DEMO_FOUNDERS); setLoading(false); return }
    try {
      const fetchPromise = supabase.from('funds').select('*').eq('kind', kind).order('name', { ascending: true })
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

  // Sector (founder) and geography (LP) chips are derived from the data, so
  // whatever the user types into a row becomes a filter automatically.
  const sectorOptions = useMemo(() =>
    [...new Set(rows.flatMap(r => r.sectors || []))].sort(), [rows])
  const geoOptions = useMemo(() =>
    [...new Set(rows.flatMap(r => r.geographies || []))].sort(), [rows])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (isLp) {
        if (geoFilter !== 'All' && !(r.geographies || []).includes(geoFilter)) return false
        if (archetypeFilter !== 'All' && lpArchetype(r) !== archetypeFilter) return false
      } else {
        if (stageFilter !== 'All' && founderStage(r) !== stageFilter) return false
        if (sectorFilter !== 'All' && !(r.sectors || []).includes(sectorFilter)) return false
      }
      if (warmthFilter !== 'All' && r.warmth !== warmthFilter) return false
      if (!needle) return true
      return [r.name, r.hq_city, r.hq_country, ...(r.sectors || []), ...(r.stages || []), ...(r.geographies || []), r.fund_type]
        .some(v => (v || '').toString().toLowerCase().includes(needle))
    })
  }, [rows, q, isLp, stageFilter, sectorFilter, geoFilter, archetypeFilter, warmthFilter])

  return (
    <div className="space-y-6">
      <ConfigBanner />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vl-eyebrow-ink">{isLp ? 'LPs' : 'Founders'}</p>
          <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
            {isLp ? 'The LPs we’re building.' : 'The founders on our radar.'}
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
          <button onClick={() => setDrawer('new')} className="vl-btn-primary"><Plus className="h-4 w-4" /> {isLp ? 'New LP' : 'New founder'}</button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          {isLp ? (
            <FilterRow label="Archetype" value={archetypeFilter} onChange={setArchetypeFilter} options={['All', ...LP_ARCHETYPES]} />
          ) : (
            <FilterRow label="Stage" value={stageFilter} onChange={setStageFilter} options={['All', ...FOUNDER_STAGES]} />
          )}
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-valence-subtle" />
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder={isLp ? 'Search LP, geography, archetype…' : 'Search founder, company, sector…'}
              className="vl-input h-8 w-72 pl-8 text-xs"
            />
          </div>
        </div>
        {isLp ? (
          geoOptions.length > 0 && <FilterRow label="Geography" value={geoFilter} onChange={setGeoFilter} options={['All', ...geoOptions]} />
        ) : (
          sectorOptions.length > 0 && <FilterRow label="Sector" value={sectorFilter} onChange={setSectorFilter} options={['All', ...sectorOptions]} />
        )}
        <FilterRow label="Warmth" value={warmthFilter} onChange={setWarmthFilter} options={['All', ...WARMTH_LEVELS]} />
      </div>

      {loading ? (
        <GridSkeleton />
      ) : loadError ? (
        <EmptyState icon={Building2} title={isLp ? "Couldn't load LPs" : "Couldn't load founders"} description={loadError} action={<button onClick={load} className="vl-btn-primary">Retry</button>} sampleEligible={false} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Building2} title={isLp ? 'No LPs yet' : 'No founders yet'} description={`Add your first ${isLp ? 'LP' : 'founder'} to start the relationship CRM.`} action={<button onClick={() => setDrawer('new')} className="vl-btn-primary"><Plus className="h-4 w-4" /> {isLp ? 'New LP' : 'New founder'}</button>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Building2} title={isLp ? 'No LPs match your filters' : 'No founders match your filters'} description="Clear a filter or broaden your search." sampleEligible={false} />
      ) : isSimple || view === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(f => <FundCard key={f.id} fund={f} isLp={isLp} onOpen={() => setDrawer({ row: f })} />)}
        </div>
      ) : (
        <FundTable rows={filtered} isLp={isLp} onOpen={f => setDrawer({ row: f })} />
      )}

      <FundDrawer
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        mode={kind}
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

function FundCard({ fund, isLp, onOpen }) {
  const touched = fund.last_touched_at ? new Date(fund.last_touched_at) : null
  // Founder: lead chip = funding round, tags = sectors.
  // LP: lead chip = archetype, tags = geographies.
  const lead = isLp ? lpArchetype(fund) : founderStage(fund)
  const tags = isLp ? lpGeographies(fund) : (fund.sectors || [])
  const subtitle = isLp
    ? lpGeographies(fund).join(', ')
    : [fund.hq_city, fund.hq_country].filter(Boolean).join(', ')
  return (
    <button onClick={onOpen} className="vl-card vl-card-hover group block p-5 text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-valence-text truncate">{fund.name}</p>
          <p className="mt-0.5 text-[11px] text-valence-muted">{[lead, subtitle].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize shrink-0 ${warmthTone(fund.warmth)}`}>{fund.warmth}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {lead && <span className="rounded-full border border-valence-blue/30 bg-valence-blue-soft px-2 py-0.5 text-[10px] font-semibold text-valence-blue">{lead}</span>}
        {tags.slice(0, 4).map(s => (
          <span key={s} className="rounded-full border border-valence-border bg-valence-surface px-2 py-0.5 text-[10px] text-valence-muted">{s}</span>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-valence-muted">
        <span>{touched ? `Last touch ${touched.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'No touch logged'}</span>
        <span className="inline-flex items-center gap-1 text-valence-subtle group-hover:text-valence-blue transition">
          Open <ArrowUpRight className="h-3 w-3" />
        </span>
      </div>
    </button>
  )
}

function FundTable({ rows, isLp, onOpen }) {
  return (
    <div className="vl-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-valence-subtle">
            <th className="px-5 py-3">{isLp ? 'LP' : 'Company'}</th>
            <th className="px-3 py-3">{isLp ? 'Archetype' : 'Stage'}</th>
            <th className="px-3 py-3">{isLp ? 'Geographies' : 'HQ'}</th>
            {!isLp && <th className="px-3 py-3">Sectors</th>}
            <th className="px-3 py-3">Warmth</th>
            <th className="px-3 py-3">Last touched</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map(f => (
            <tr key={f.id} className="border-t border-valence-border/60 hover:bg-valence-surface/60">
              <td className="px-5 py-3 font-semibold text-valence-text">{f.name}</td>
              <td className="px-3 py-3 text-valence-muted">{(isLp ? lpArchetype(f) : founderStage(f)) || '—'}</td>
              <td className="px-3 py-3 text-valence-muted truncate max-w-[260px]">{isLp ? (lpGeographies(f).join(' · ') || '—') : ([f.hq_city, f.hq_country].filter(Boolean).join(', ') || '—')}</td>
              {!isLp && <td className="px-3 py-3 text-valence-muted truncate max-w-[260px]">{(f.sectors || []).slice(0, 4).join(' · ') || '—'}</td>}
              <td className="px-3 py-3"><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${warmthTone(f.warmth)}`}>{f.warmth}</span></td>
              <td className="px-3 py-3 text-valence-muted tabular-nums">{f.last_touched_at ? new Date(f.last_touched_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
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
