import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Filter, LayoutGrid, Table as TableIcon, UserCircle, ArrowUpRight, MapPin, Mail, Phone, Building2, GripVertical, UserPlus, X } from 'lucide-react'
import BulkAddPeoplePanel from '../components/BulkAddPeoplePanel.jsx'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import {
  TAG_SUGGESTIONS,
  DEMO_PEOPLE,
  locationLine,
  extractCompanies,
  applyCompanyAssignment,
  wouldChangeCompany
} from '../lib/people.js'
import { scoreAllPeople } from '../lib/relationships.js'
import { useViewMode } from '../hooks/useViewMode.jsx'
import ConfigBanner from '../components/ConfigBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ViewModeToggle from '../components/ViewModeToggle.jsx'
import PersonDrawer from '../components/PersonDrawer.jsx'
import WarmthChip from '../components/WarmthChip.jsx'
// Phase 26 — derive founder/investor/general from person.tags so the
// People grid and table light up with the same colour cue as Calendar /
// Interactions / Team. Single source of truth keeps the three places in
// sync; if we ever rename a tag, every surface updates with this file.
import { typeFromPersonTags, dotClass as ctyDot, labelFor as ctyLabel, railClass as ctyRail } from '../lib/counterpartyColors.js'
import { useToast } from '../components/Toast.jsx'
import { humanError } from '../lib/userError.js'

export default function People() {
  const toast = useToast()
  const { isSimple } = useViewMode('people')
  const [rows, setRows]           = useState([])
  const [interactions, setInteractions] = useState([])
  const [deals, setDeals]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [view, setView]           = useState('grid')
  const [q, setQ]                 = useState('')
  const [tagFilter, setTagFilter] = useState('All')
  const [drawer, setDrawer]       = useState(null) // null | 'new' | { row }
  const [params, setParams]       = useSearchParams()

  // Per-person warmth score — derived from interactions + deal involvement.
  // Recomputed only when one of the three source arrays changes.
  const scoreMap = useMemo(
    () => scoreAllPeople(rows, interactions, deals),
    [rows, interactions, deals]
  )

  useEffect(() => { load() }, [])

  // Live sync — when another teammate adds, edits, or deletes a person
  // in the same org, refresh so the change appears here without a manual
  // reload. Same realtime channel pattern Deals/Planner/Knowledge use.
  // Cleanup unsubscribes on unmount.
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const offPeople        = subscribeTable('people', load)
    const offInteractions  = subscribeTable('interactions', load)
    return () => { offPeople(); offInteractions() }
  }, [])

  // Deep-link from clickable wikilink chips: /people?open=<uuid>
  // Drains the param so back/forward doesn't keep re-opening the drawer.
  useEffect(() => {
    const id = params.get('open')
    if (!id || rows.length === 0) return
    const person = rows.find(p => p.id === id)
    if (person) {
      setDrawer({ row: person })
      const next = new URLSearchParams(params); next.delete('open'); setParams(next, { replace: true })
    }
  }, [params, rows])

  async function load() {
    setLoading(true); setLoadError(null)
    if (!isSupabaseConfigured) { setRows(DEMO_PEOPLE); setLoading(false); return }
    try {
      // People is the primary source; interactions + deals feed the
      // warmth scorer. We fetch them in parallel and only block the page
      // on the people query — the score quietly populates after.
      const fetchPromise = Promise.all([
        supabase.from('people').select('*').order('full_name'),
        supabase.from('interactions')
          .select('id, counterparty_name, counterparty_company, outcome, deal_id, created_at')
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase.from('deals')
          .select('id, client_name, counterparty_name')
      ])
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out — check your connection or Supabase status.')), 10_000)
      )
      const [peopleRes, intRes, dealRes] = await Promise.race([fetchPromise, timeoutPromise])
      if (peopleRes.error) throw peopleRes.error
      setRows(peopleRes.data || [])
      setInteractions(intRes.data || [])
      setDeals(dealRes.data || [])
    } catch (err) {
      console.error(err)
      setLoadError(err?.message || 'Couldn\'t load people.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  async function assignCompany(personId, newCompany) {
    if (!wouldChangeCompany(rows, personId, newCompany)) return
    const before = rows
    const target = rows.find(p => p.id === personId)
    setRows(prev => applyCompanyAssignment(prev, personId, newCompany))
    if (!isSupabaseConfigured) {
      toast.success(`${target.full_name} → ${newCompany}`)
      return
    }
    const { error } = await supabase
      .from('people')
      .update({ company: newCompany || null })
      .eq('id', personId)
    if (error) {
      setRows(before)
      toast.error(humanError(error, 'Could not move contact'))
      return
    }
    toast.success(`${target.full_name} → ${newCompany}`)
  }

  async function save(payload, existingId) {
    if (!isSupabaseConfigured) {
      if (existingId) setRows(prev => prev.map(r => r.id === existingId ? { ...r, ...payload } : r))
      else setRows(prev => [{ id: `local-${Date.now()}`, created_at: new Date().toISOString(), ...payload }, ...prev])
      setDrawer(null); toast.success(existingId ? 'Person updated' : 'Person added'); return
    }
    if (existingId) {
      const { error } = await supabase.from('people').update(payload).eq('id', existingId)
      if (error) return toast.error(humanError(error, 'Could not save person'))
      toast.success('Person updated')
    } else {
      const { error } = await supabase.from('people').insert(payload)
      if (error) return toast.error(humanError(error, 'Could not add person'))
      toast.success('Person added')
    }
    setDrawer(null); load()
  }

  const allTags = useMemo(() => {
    const set = new Set()
    for (const p of rows) for (const t of (p.tags || [])) set.add(t)
    return Array.from(set).sort()
  }, [rows])

  const companies = useMemo(() => extractCompanies(rows), [rows])

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
    <div className="space-y-4">
      <ConfigBanner />

      {/* Page hero collapsed — title lives in the topbar so a second
          giant heading just steals vertical space. Just the action row. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ViewModeToggle pageKey="people" />
        {!isSimple && (
          <div className="inline-flex items-center rounded-full border border-valence-border bg-valence-elevated p-0.5">
            <button onClick={() => setView('grid')}  className={`rounded-full px-2.5 py-1 transition ${view === 'grid'  ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`} title="Card view"><LayoutGrid className="h-3.5 w-3.5" /></button>
            <button onClick={() => setView('table')} className={`rounded-full px-2.5 py-1 transition ${view === 'table' ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`} title="Table view"><TableIcon className="h-3.5 w-3.5" /></button>
          </div>
        )}
        <button onClick={() => setDrawer('new')} className="vl-btn-primary-sm"><Plus className="h-4 w-4" /> Add person</button>
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
        <EmptyState icon={UserCircle} title="Couldn't load people" description={loadError} action={<button onClick={load} className="vl-btn-primary">Retry</button>} sampleEligible={false} />
      ) : rows.length === 0 ? (
        <EmptyState icon={UserCircle} title="No people yet" description="Add the first persona to start the CRM." action={<button onClick={() => setDrawer('new')} className="vl-btn-primary"><Plus className="h-4 w-4" /> Add person</button>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={UserCircle} title="No people match your filters" description="Clear a tag or broaden your search." sampleEligible={false} />
      ) : isSimple || view === 'grid' ? (
        <>
          <CompaniesRail companies={companies} onDropPerson={assignCompany} onAfterBulkAdd={load} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map(p => (
              <PersonCard
                key={p.id}
                person={p}
                score={scoreMap.get(p.id)}
                onOpen={() => setDrawer({ row: p })}
              />
            ))}
          </div>
        </>
      ) : (
        <PersonTable rows={filtered} scoreMap={scoreMap} onOpen={p => setDrawer({ row: p })} />
      )}

      <PersonDrawer
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        existing={drawer && drawer !== 'new' ? drawer.row : null}
        onSubmit={(payload, id) => save(payload, id)}
        onRename={async (id, full_name) => {
          if (isSupabaseConfigured) {
            const { error } = await supabase.from('people').update({ full_name }).eq('id', id)
            if (error) { toast.error(humanError(error, 'Could not rename person')); throw error }
          }
          setRows(prev => prev.map(p => p.id === id ? { ...p, full_name } : p))
          setDrawer(prev => prev && prev.row?.id === id ? { ...prev, row: { ...prev.row, full_name } } : prev)
          toast.success('Renamed.')
        }}
      />
    </div>
  )
}

function chipClass(active) {
  return `rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
    active
      ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text'
      : 'border-valence-border bg-valence-elevated text-valence-muted hover:text-valence-text'
  }`
}

function PersonCard({ person, score, onOpen }) {
  const [dragging, setDragging] = useState(false)
  const cty = typeFromPersonTags(person.tags)

  function onDragStart(e) {
    if (!person?.id) return
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-valence-person', String(person.id))
    // Generic mime so other apps don't accidentally accept a drop on us.
    e.dataTransfer.setData('text/plain', person.full_name)
    setDragging(true)
  }

  function onDragEnd() {
    setDragging(false)
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`relative group ${dragging ? 'opacity-50' : ''}`}
    >
      {/* Phase 26 — left rail in the person's counterparty colour. Same
          visual as Interaction/Calendar event rails so a glance across the
          People grid surfaces who's a founder vs investor vs general
          contact without reading any tags. */}
      <button onClick={onOpen} className={`vl-card vl-card-hover block w-full p-5 text-left ${cty ? ctyRail(cty) : ''}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {cty && (
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${ctyDot(cty)}`}
                  title={ctyLabel(cty)}
                  aria-label={ctyLabel(cty)}
                />
              )}
              <p className="text-sm font-semibold text-valence-text truncate">{person.full_name}</p>
            </div>
            <p className="mt-0.5 text-[11px] text-valence-muted">{[person.role, person.company].filter(Boolean).join(' · ') || '—'}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {score && <WarmthChip score={score} />}
            {person.tags?.length > 0 && (
              <span className="inline-flex items-center rounded-full border border-valence-border bg-valence-surface px-2 py-0.5 text-[10px] font-semibold text-valence-muted">
                {person.tags[0]}
              </span>
            )}
          </div>
        </div>
        {person.how_to_talk ? (
          <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-valence-muted italic">"{person.how_to_talk}"</p>
        ) : (
          // Empty-state placeholder so incomplete cards have the same
          // height as filled ones and invite the user to complete the
          // persona section. Otherwise the grid looks janky.
          <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-valence-subtle italic opacity-70">
            No persona notes yet — tap to add.
          </p>
        )}
        <div className="mt-3 flex items-center justify-between text-[11px] text-valence-muted">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {locationLine(person) || '—'}</span>
          <span className="inline-flex items-center gap-1 text-valence-subtle group-hover:text-valence-blue transition">
            Open <ArrowUpRight className="h-3 w-3" />
          </span>
        </div>
      </button>
      <span
        className="absolute top-2 right-2 hidden group-hover:inline-flex items-center justify-center rounded-md bg-white/95 border border-valence-border p-1 text-valence-subtle cursor-grab active:cursor-grabbing"
        title="Drag onto a company to attach"
      >
        <GripVertical className="h-3 w-3" />
      </span>
    </div>
  )
}

function CompaniesRail({ companies, onDropPerson, onAfterBulkAdd }) {
  const [bulkCompany, setBulkCompany] = useState('')
  const [open, setOpen] = useState(false)
  if (!companies || companies.length === 0) return null
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 rounded-md border border-valence-border bg-valence-elevated px-2.5 h-8 text-[11px] font-semibold text-valence-muted hover:text-valence-text hover:border-valence-ink/30 transition"
      >
        <Building2 className="h-3 w-3" />
        Companies <span className="tabular-nums text-valence-subtle">{companies.length}</span>
        <span className="text-valence-subtle">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="vl-card-subtle p-3 flex flex-wrap gap-2">
          {companies.map(c => (
            <CompanyDropChip
              key={c.name}
              company={c}
              onDropPerson={onDropPerson}
              onQuickAdd={() => setBulkCompany(bulkCompany === c.name ? '' : c.name)}
              expanded={bulkCompany === c.name}
            />
          ))}
        </div>
      )}
      {bulkCompany && (
        <div className="space-y-2 pt-2 border-t border-valence-border/60">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-valence-text">
              Quick-add people under <span className="text-valence-blue">{bulkCompany}</span>
            </p>
            <button type="button" onClick={() => setBulkCompany('')} className="vl-btn-ghost" aria-label="Close quick-add">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <BulkAddPeoplePanel
            initialCompany={bulkCompany}
            compact
            onAfterImport={() => { setBulkCompany(''); onAfterBulkAdd?.() }}
          />
        </div>
      )}
    </div>
  )
}

function CompanyDropChip({ company, onDropPerson, onQuickAdd, expanded }) {
  const [hot, setHot] = useState(false)

  function onDragOver(e) {
    const types = Array.from(e.dataTransfer.types || [])
    if (!types.includes('application/x-valence-person')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!hot) setHot(true)
  }

  function onDragLeave() {
    setHot(false)
  }

  function onDrop(e) {
    e.preventDefault()
    const id = e.dataTransfer.getData('application/x-valence-person')
    setHot(false)
    if (id) onDropPerson(id, company.name)
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`inline-flex items-center rounded-full border text-[11px] font-semibold transition overflow-hidden ${
        hot
          ? 'border-valence-blue bg-valence-blue text-white shadow-[0_0_0_3px_rgba(51,153,255,0.18)]'
          : expanded
            ? 'border-valence-blue/60 bg-valence-blue-soft text-valence-text'
            : 'border-valence-border bg-valence-elevated text-valence-text hover:border-valence-ink/30'
      }`}
    >
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5">
        <Building2 className="h-3 w-3" />
        <span>{company.name}</span>
        <span className={`tabular-nums ${hot ? 'text-white/80' : 'text-valence-subtle'}`}>{company.count}</span>
      </span>
      <button
        type="button"
        onClick={onQuickAdd}
        title={`Bulk add to ${company.name}`}
        className={`inline-flex items-center justify-center h-full px-2 py-1.5 transition border-l ${
          hot
            ? 'border-white/20 hover:bg-white/10'
            : expanded
              ? 'border-valence-blue/40 bg-valence-blue text-white'
              : 'border-valence-border bg-valence-surface text-valence-muted hover:text-valence-text'
        }`}
      >
        {expanded ? <X className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
      </button>
    </div>
  )
}

function PersonTable({ rows, scoreMap, onOpen }) {
  return (
    <div className="vl-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-valence-subtle">
            <th className="px-5 py-3">Name</th>
            <th className="px-3 py-3">Role / Company</th>
            <th className="px-3 py-3">Warmth</th>
            <th className="px-3 py-3">Location</th>
            <th className="px-3 py-3">Tags</th>
            <th className="px-3 py-3">Email</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map(p => {
            // Tiny coloured dot prepended to the name cell — same logic as
            // the grid card. Cheap visual cue for "what kind of person am
            // I scrolling past" in the dense table view.
            const cty = typeFromPersonTags(p.tags)
            return (
            <tr key={p.id} className="border-t border-valence-border/60 hover:bg-valence-surface/60">
              <td className="px-5 py-3 font-semibold text-valence-text">
                <span className="inline-flex items-center gap-2">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${cty ? ctyDot(cty) : 'bg-valence-border'}`}
                    title={cty ? ctyLabel(cty) : 'Unclassified'}
                    aria-label={cty ? ctyLabel(cty) : 'Unclassified'}
                  />
                  {p.full_name}
                </span>
              </td>
              <td className="px-3 py-3 text-valence-muted">{[p.role, p.company].filter(Boolean).join(' · ') || '—'}</td>
              <td className="px-3 py-3">{scoreMap?.get(p.id) ? <WarmthChip score={scoreMap.get(p.id)} showScore /> : '—'}</td>
              <td className="px-3 py-3 text-valence-muted">{locationLine(p) || '—'}</td>
              <td className="px-3 py-3 text-valence-muted truncate max-w-[200px]">{(p.tags || []).join(' · ') || '—'}</td>
              <td className="px-3 py-3 text-valence-muted">{p.email || '—'}</td>
              <td className="px-5 py-3 text-right">
                <button onClick={() => onOpen(p)} className="text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover">Open <ArrowUpRight className="inline h-3 w-3" /></button>
              </td>
            </tr>
            )
          })}
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
