import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Filter, LayoutGrid, Table as TableIcon, UserCircle, ArrowUpRight, MapPin, Mail, Phone } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { TAG_SUGGESTIONS, DEMO_PEOPLE, locationLine } from '../lib/people.js'
import { useViewMode } from '../hooks/useViewMode.jsx'
import ConfigBanner from '../components/ConfigBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ViewModeToggle from '../components/ViewModeToggle.jsx'
import PersonDrawer from '../components/PersonDrawer.jsx'
import { useToast } from '../components/Toast.jsx'

export default function People() {
  const toast = useToast()
  const { isSimple } = useViewMode('people')
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [view, setView]           = useState('grid')
  const [q, setQ]                 = useState('')
  const [tagFilter, setTagFilter] = useState('All')
  const [drawer, setDrawer]       = useState(null) // null | 'new' | { row }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setLoadError(null)
    if (!isSupabaseConfigured) { setRows(DEMO_PEOPLE); setLoading(false); return }
    try {
      const fetchPromise = supabase.from('people').select('*').order('full_name')
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out — check your connection or Supabase status.')), 10_000)
      )
      const { data, error } = await Promise.race([fetchPromise, timeoutPromise])
      if (error) throw error
      setRows(data || [])
    } catch (err) {
      console.error(err)
      setLoadError(err?.message || 'Couldn\'t load people.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  async function save(payload, existingId) {
    if (!isSupabaseConfigured) {
      if (existingId) setRows(prev => prev.map(r => r.id === existingId ? { ...r, ...payload } : r))
      else setRows(prev => [{ id: `local-${Date.now()}`, created_at: new Date().toISOString(), ...payload }, ...prev])
      setDrawer(null); toast.success(existingId ? 'Person updated' : 'Person added'); return
    }
    if (existingId) {
      const { error } = await supabase.from('people').update(payload).eq('id', existingId)
      if (error) return toast.error(error.message)
      toast.success('Person updated')
    } else {
      const { error } = await supabase.from('people').insert(payload)
      if (error) return toast.error(error.message)
      toast.success('Person added')
    }
    setDrawer(null); load()
  }

  const allTags = useMemo(() => {
    const set = new Set()
    for (const p of rows) for (const t of (p.tags || [])) set.add(t)
    return Array.from(set).sort()
  }, [rows])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(p => {
      if (tagFilter !== 'All' && !(p.tags || []).includes(tagFilter)) return false
      if (!needle) return true
      return [p.full_name, p.role, p.company, p.city, p.country, p.email, p.how_to_talk, p.what_they_care_about]
        .some(v => (v || '').toString().toLowerCase().includes(needle))
    })
  }, [rows, q, tagFilter])

  return (
    <div className="space-y-6">
      <ConfigBanner />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vl-eyebrow-ink">People CRM</p>
          <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
            Every person we know.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-valence-muted">
            Persona-driven. How to talk to them. Who they're close to. What they care about. Every team member sees every field.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewModeToggle pageKey="people" />
          {!isSimple && (
            <div className="inline-flex items-center rounded-full border border-valence-border bg-white p-0.5">
              <button onClick={() => setView('grid')}  className={`rounded-full px-2.5 py-1 transition ${view === 'grid'  ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`} title="Card view"><LayoutGrid className="h-3.5 w-3.5" /></button>
              <button onClick={() => setView('table')} className={`rounded-full px-2.5 py-1 transition ${view === 'table' ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`} title="Table view"><TableIcon className="h-3.5 w-3.5" /></button>
            </div>
          )}
          <button onClick={() => setDrawer('new')} className="vl-btn-primary"><Plus className="h-4 w-4" /> Add person</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Filter className="h-3 w-3" /> Tag</span>
        <button onClick={() => setTagFilter('All')} className={chipClass(tagFilter === 'All')}>All</button>
        {allTags.map(t => (
          <button key={t} onClick={() => setTagFilter(t)} className={chipClass(tagFilter === t)}>{t}</button>
        ))}
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-valence-subtle" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search name, company, city, persona…"
            className="vl-input h-8 w-72 pl-8 text-xs"
          />
        </div>
      </div>

      {loading ? (
        <GridSkeleton />
      ) : loadError ? (
        <EmptyState icon={UserCircle} title="Couldn't load people" description={loadError} action={<button onClick={load} className="vl-btn-primary">Retry</button>} />
      ) : rows.length === 0 ? (
        <EmptyState icon={UserCircle} title="No people yet" description="Add the first persona to start the CRM." action={<button onClick={() => setDrawer('new')} className="vl-btn-primary"><Plus className="h-4 w-4" /> Add person</button>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={UserCircle} title="No people match your filters" description="Clear a tag or broaden your search." />
      ) : isSimple || view === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(p => <PersonCard key={p.id} person={p} onOpen={() => setDrawer({ row: p })} />)}
        </div>
      ) : (
        <PersonTable rows={filtered} onOpen={p => setDrawer({ row: p })} />
      )}

      <PersonDrawer
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        existing={drawer && drawer !== 'new' ? drawer.row : null}
        onSubmit={(payload, id) => save(payload, id)}
      />
    </div>
  )
}

function chipClass(active) {
  return `rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
    active
      ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text'
      : 'border-valence-border bg-white text-valence-muted hover:text-valence-text'
  }`
}

function PersonCard({ person, onOpen }) {
  return (
    <button onClick={onOpen} className="vl-card vl-card-hover group block p-5 text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-valence-text truncate">{person.full_name}</p>
          <p className="mt-0.5 text-[11px] text-valence-muted">{[person.role, person.company].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        {person.tags?.length > 0 && (
          <span className="inline-flex items-center rounded-full border border-valence-border bg-valence-surface px-2 py-0.5 text-[10px] font-semibold text-valence-muted shrink-0">
            {person.tags[0]}
          </span>
        )}
      </div>
      {person.how_to_talk && (
        <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-valence-muted italic">"{person.how_to_talk}"</p>
      )}
      <div className="mt-3 flex items-center justify-between text-[11px] text-valence-muted">
        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {locationLine(person) || '—'}</span>
        <span className="inline-flex items-center gap-1 text-valence-subtle group-hover:text-valence-blue transition">
          Open <ArrowUpRight className="h-3 w-3" />
        </span>
      </div>
    </button>
  )
}

function PersonTable({ rows, onOpen }) {
  return (
    <div className="vl-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-valence-subtle">
            <th className="px-5 py-3">Name</th>
            <th className="px-3 py-3">Role / Company</th>
            <th className="px-3 py-3">Location</th>
            <th className="px-3 py-3">Tags</th>
            <th className="px-3 py-3">Email</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.id} className="border-t border-valence-border/60 hover:bg-valence-surface/60">
              <td className="px-5 py-3 font-semibold text-valence-text">{p.full_name}</td>
              <td className="px-3 py-3 text-valence-muted">{[p.role, p.company].filter(Boolean).join(' · ') || '—'}</td>
              <td className="px-3 py-3 text-valence-muted">{locationLine(p) || '—'}</td>
              <td className="px-3 py-3 text-valence-muted truncate max-w-[200px]">{(p.tags || []).join(' · ') || '—'}</td>
              <td className="px-3 py-3 text-valence-muted">{p.email || '—'}</td>
              <td className="px-5 py-3 text-right">
                <button onClick={() => onOpen(p)} className="text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover">Open <ArrowUpRight className="inline h-3 w-3" /></button>
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
