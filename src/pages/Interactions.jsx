import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, formatDistanceToNowStrict, parseISO, differenceInCalendarDays } from 'date-fns'
import { Plus, Search, Filter, Sparkles, ArrowRight, AlertCircle, MessageSquare, Download } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import {
  PURPOSES, CONTEXT_GROUPS, DEMO_INTERACTIONS, purposeLabel, typeLabel, outcomeLabel, outcomeTone
} from '../lib/interactions.js'
import { toCSV, downloadCSV, timestampedFilename } from '../lib/csvExport.js'
import { useViewMode } from '../hooks/useViewMode.jsx'
import ConfigBanner from '../components/ConfigBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'
import InteractionDrawer from '../components/InteractionDrawer.jsx'
import ViewModeToggle from '../components/ViewModeToggle.jsx'
import { useToast } from '../components/Toast.jsx'
import WikilinkText from '../components/WikilinkText.jsx'

export default function Interactions() {
  const toast = useToast()
  const { isDetailed } = useViewMode('interactions')
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [purpose, setPurpose]     = useState('All')
  const [q, setQ]                 = useState('')
  const [needsFollowUp, setNeedsFollowUp] = useState(false)
  const [drawer, setDrawer] = useState(null)   // null | 'new' | { row }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setLoadError(null)
    if (!isSupabaseConfigured) { setRows(DEMO_INTERACTIONS); setLoading(false); return }
    try {
      const fetchPromise = supabase.from('interactions').select('*').order('created_at', { ascending: false })
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out — check your connection or Supabase status.')), 10_000)
      )
      const { data, error } = await Promise.race([fetchPromise, timeoutPromise])
      if (error) throw error
      setRows(data || [])
    } catch (err) {
      console.error(err)
      setLoadError(err?.message || 'Couldn\'t load interactions.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  async function save(payload, existingId) {
    if (!isSupabaseConfigured) {
      // demo mode — just push into local state
      if (existingId) {
        setRows(prev => prev.map(r => r.id === existingId ? { ...r, ...payload, updated_at: new Date().toISOString() } : r))
      } else {
        setRows(prev => [{ id: `local-${Date.now()}`, created_at: new Date().toISOString(), ...payload }, ...prev])
      }
      setDrawer(null)
      toast.success(existingId ? 'Interaction updated' : 'Interaction logged')
      return
    }
    if (existingId) {
      const { error } = await supabase.from('interactions').update(payload).eq('id', existingId)
      if (error) return toast.error(error.message)
      toast.success('Interaction updated')
    } else {
      const { error } = await supabase.from('interactions').insert(payload)
      if (error) return toast.error(error.message)
      toast.success('Interaction logged')
    }
    setDrawer(null)
    load()
  }

  function exportFilteredCSV() {
    if (filtered.length === 0) {
      toast.error('No rows to export — clear a filter first.')
      return
    }
    const columns = [
      { key: 'created_at',          label: 'Logged at' },
      { key: 'date',                label: 'Date' },
      { key: 'counterparty_name',   label: 'Counterparty' },
      { key: 'counterparty_company',label: 'Company' },
      { key: 'counterparty_role',   label: 'Role' },
      { key: 'interaction_type',    label: 'Type' },
      { key: 'interaction_purpose', label: 'Purpose' },
      { key: 'outcome',             label: 'Outcome' },
      { key: 'follow_up_date',      label: 'Follow-up date' },
      { key: 'lead_owner',          label: 'Owner' },
      { key: 'notes',               label: 'Notes' }
    ]
    const csv = toCSV(filtered, columns)
    const stem = purpose === 'All' ? 'interactions' : `interactions-${purpose}`
    const ok = downloadCSV(timestampedFilename(stem), csv)
    if (ok) toast.success(`Exported ${filtered.length} interactions.`)
    else toast.error('Download failed.')
  }

  async function convertToOrigination(row) {
    // Stub: opens Deal Logger pre-filled. Until the deal modal accepts a deeplinked draft,
    // we just hand off to /deals?new with the counterparty as the prospective client name.
    const params = new URLSearchParams({ new: '1', client_name: row.counterparty_company || row.counterparty_name, lead_owner: row.lead_owner || '' })
    window.location.href = `/deals?${params.toString()}`
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (purpose !== 'All' && r.interaction_purpose !== purpose) return false
      if (needsFollowUp) {
        if (!r.follow_up_date) return false
        const due = typeof r.follow_up_date === 'string' ? parseISO(r.follow_up_date) : new Date(r.follow_up_date)
        if (Number.isNaN(due.getTime())) return false
        if (differenceInCalendarDays(due, new Date()) > 0) return false  // not yet due
      }
      if (!needle) return true
      return [r.counterparty_name, r.counterparty_company, r.counterparty_role, r.notes, r.lead_owner]
        .some(v => (v || '').toLowerCase().includes(needle))
    })
  }, [rows, purpose, q, needsFollowUp])

  return (
    <div className="space-y-6">
      <ConfigBanner />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vl-eyebrow-ink">Interactions</p>
          <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
            The pre-mandate funnel.
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <ViewModeToggle pageKey="interactions" />
          <button
            onClick={exportFilteredCSV}
            disabled={loading || filtered.length === 0}
            title="Export currently filtered rows as CSV"
            className="vl-btn-secondary-sm"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button onClick={() => setDrawer('new')} className="vl-btn-primary">
            <Plus className="h-4 w-4" /> Log interaction
          </button>
        </div>
      </div>

      {/* Filter strip — Context grouped by mandate lifecycle stage */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Filter className="h-3 w-3" /> Context</span>
          <PurposeChip label="All" active={purpose === 'All'} onClick={() => setPurpose('All')} />
        </div>
        {CONTEXT_GROUPS.map(g => {
          const items = PURPOSES.filter(p => p.group === g.id)
          return (
            <div key={g.id} className="flex flex-wrap items-center gap-2 pl-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-valence-subtle min-w-[110px]">{g.label}</span>
              {items.map(p => (
                <PurposeChip key={p.id} label={p.label} active={purpose === p.id} onClick={() => setPurpose(p.id)} />
              ))}
            </div>
          )
        })}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setNeedsFollowUp(v => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
              needsFollowUp ? 'border-valence-warning/40 bg-valence-warning/10 text-valence-warning' : 'border-valence-border bg-white text-valence-muted hover:text-valence-text'
            }`}
          >
            <AlertCircle className="h-3 w-3" /> Needs follow-up
          </button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-valence-subtle" />
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search counterparty, company, notes…"
              className="vl-input h-8 w-72 pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Main content */}
      {loading ? (
        <ListSkeleton />
      ) : loadError ? (
        <EmptyState icon={MessageSquare} title="Couldn't load interactions" description={loadError} action={<button onClick={load} className="vl-btn-primary">Retry</button>} sampleEligible={false} />
      ) : rows.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No interactions yet" description="Log your first touchpoint to start building the funnel." action={<button onClick={() => setDrawer('new')} className="vl-btn-primary"><Plus className="h-4 w-4" /> Log interaction</button>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No interactions match your filters" description="Clear a filter, or log a new touchpoint." action={<button onClick={() => setDrawer('new')} className="vl-btn-primary"><Plus className="h-4 w-4" /> Log interaction</button>} sampleEligible={false} />
      ) : (
        <ul className="vl-card divide-y divide-valence-border/60 overflow-hidden">
          {filtered.map(r => (
            <InteractionRow
              key={r.id}
              row={r}
              isDetailed={isDetailed}
              onOpen={() => setDrawer({ row: r })}
              onConvert={() => convertToOrigination(r)}
            />
          ))}
        </ul>
      )}

      {/* Drawer */}
      <InteractionDrawer
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        existing={drawer && drawer !== 'new' ? drawer.row : null}
        onSubmit={(payload, id) => save(payload, id)}
      />
    </div>
  )
}

function PurposeChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
        active
          ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text'
          : 'border-valence-border bg-white text-valence-muted hover:text-valence-text'
      }`}
    >{label}</button>
  )
}

function InteractionRow({ row, onOpen, onConvert, isDetailed = true }) {
  const ago = row.created_at ? formatDistanceToNowStrict(new Date(row.created_at), { addSuffix: true }) : ''
  const due = row.follow_up_date ? format(parseISO(row.follow_up_date), 'd MMM') : null
  const overdue = row.follow_up_date ? differenceInCalendarDays(parseISO(row.follow_up_date), new Date()) < 0 : false
  return (
    <li className="group">
      <div className="flex items-start gap-4 px-5 py-4 hover:bg-valence-surface transition">
        <button onClick={onOpen} className="flex-1 min-w-0 text-left">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="text-sm font-semibold text-valence-text">{row.counterparty_name}</p>
            {row.counterparty_company && <p className="text-xs text-valence-muted">· {row.counterparty_company}</p>}
            {row.counterparty_role && <p className="text-xs text-valence-subtle">· {row.counterparty_role}</p>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-valence-muted">
            <span className="inline-flex items-center gap-1 rounded-full border border-valence-border bg-white px-2 py-0.5 font-semibold text-valence-text">
              {purposeLabel(row.interaction_purpose)}
            </span>
            <span className="text-valence-subtle">·</span>
            <span>{typeLabel(row.type)}</span>
            <span className="text-valence-subtle">·</span>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${outcomeTone(row.outcome)}`}>
              {outcomeLabel(row.outcome)}
            </span>
            {row.lead_owner && <><span className="text-valence-subtle">·</span><span>{row.lead_owner}</span></>}
            {due && (
              <><span className="text-valence-subtle">·</span>
              <span className={overdue ? 'font-semibold text-valence-danger' : 'text-valence-muted'}>
                Follow up {due}{overdue ? ' (overdue)' : ''}
              </span></>
            )}
          </div>
          {row.notes && (
            <p className={`mt-2 ${isDetailed ? 'line-clamp-3' : 'line-clamp-2'} text-xs leading-relaxed text-valence-muted`}>
              <WikilinkText>{row.notes}</WikilinkText>
            </p>
          )}
        </button>
        <div className="flex flex-col items-end gap-2 shrink-0 text-[11px] text-valence-subtle">
          <span>{ago}</span>
          {row.outcome === 'converted_to_mandate' && (
            <button onClick={onConvert} className="vl-btn-ghost text-[11px]">
              <Sparkles className="h-3 w-3" /> Convert to origination <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

function ListSkeleton() {
  return (
    <ul className="vl-card divide-y divide-valence-border/60 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-start gap-4 px-5 py-4">
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-valence-surface animate-pulse" />
            <div className="h-2.5 w-1/2 rounded bg-valence-surface animate-pulse" />
            <div className="h-2.5 w-2/3 rounded bg-valence-surface animate-pulse" />
          </div>
          <div className="h-2 w-12 rounded bg-valence-surface animate-pulse" />
        </li>
      ))}
    </ul>
  )
}
