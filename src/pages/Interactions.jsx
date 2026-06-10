import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format, formatDistanceToNowStrict, parseISO, differenceInCalendarDays } from 'date-fns'
import { Plus, Search, Sparkles, ArrowRight, AlertCircle, MessageSquare, Download } from 'lucide-react'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import { DEMO_INTERACTIONS, typeLabel } from '../lib/interactions.js'

// Pretty label for the new mandate_link_mode column. Falls back to the
// legacy Purpose for any row still on the old shape.
function mandateModeLabel(row) {
  switch (row.mandate_link_mode) {
    case 'self':     return 'Self'
    case 'general':  return 'General'
    case 'multi':    return 'Multiple deals'
    case 'specific': return 'Deal-linked'
    default:         return row.interaction_purpose ? 'Legacy' : 'General'
  }
}
import { toCSV, downloadCSV, timestampedFilename } from '../lib/csvExport.js'
import { railClass as ctyRail, chipClass as ctyChip, labelFor as ctyLabel, dotClass as ctyDot } from '../lib/counterpartyColors.js'
import { useViewMode } from '../hooks/useViewMode.jsx'
import ConfigBanner from '../components/ConfigBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'
import InteractionDrawer from '../components/InteractionDrawer.jsx'
import AutoCaptureCard from '../components/AutoCaptureCard.jsx'
import ViewModeToggle from '../components/ViewModeToggle.jsx'
import { useToast } from '../components/Toast.jsx'
import { humanError } from '../lib/userError.js'
import WikilinkText from '../components/WikilinkText.jsx'

export default function Interactions() {
  const toast = useToast()
  const { isDetailed } = useViewMode('interactions')
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState(null)
  // Phase 3 redesign — filter dropdown is now "Associated Mandate" not
  // Purpose. Values: 'All' | 'self' | 'general' | 'multi' | 'specific'
  // | '<deal-uuid>'. The latter lets the partner drill into one mandate.
  const [mandateFilter, setMandateFilter] = useState('All')
  const [deals, setDeals]                 = useState([])
  const [q, setQ]                 = useState('')
  const [needsFollowUp, setNeedsFollowUp] = useState(false)
  const [drawer, setDrawer] = useState(null)   // null | 'new' | { row }
  // Deep-link support: /interactions?open=<id> opens that interaction's
  // drawer. Today's Priorities rows link here so a click jumps straight
  // to the interaction instead of the generic list.
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => { load() }, [])

  // When ?open=<id> is present and rows have loaded, open that drawer ONCE.
  // Strip the param the moment we open — otherwise any later `rows` change
  // (realtime tick, save→load) re-fires this effect and reopens a drawer
  // the user already dismissed.
  useEffect(() => {
    const openId = searchParams.get('open')
    if (!openId || rows.length === 0) return
    const row = rows.find(r => String(r.id) === String(openId))
    if (row) {
      setDrawer({ row })
      searchParams.delete('open')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, rows])

  // Pull active mandates for the filter dropdown's per-deal options.
  useEffect(() => {
    if (!isSupabaseConfigured) { setDeals([]); return }
    supabase.from('deals')
      .select('id, client_name, stage')
      .not('stage', 'in', '("Diligence","Passed","Sourced")')
      .order('client_name')
      .then(({ data }) => setDeals(data || []))
  }, [])

  // Live sync — teammate's new interaction shows up here without reload.
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const off = subscribeTable('interactions', load)
    return () => off()
  }, [])

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
      if (error) return toast.error(humanError(error, 'Could not update interaction'))
      toast.success('Interaction updated')
    } else {
      const { error } = await supabase.from('interactions').insert(payload)
      if (error) return toast.error(humanError(error, 'Could not log interaction'))
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
    // Column order mirrors the partner's Mastersheet so the export drops
    // straight back into their format.
    const columns = [
      { key: 'occurred_at',         label: 'Date' },
      { key: 'counterparty_name',   label: 'Name' },
      { key: 'counterparty_company',label: 'Company' },
      { key: 'context',             label: 'Context' },
      { key: 'mandate_link_mode',   label: 'Associated deal' },
      { key: 'type',                label: 'Interaction Type' },
      { key: 'origination',         label: 'Origination' },
      { key: 'lead_owner',          label: 'Owner' },
      { key: 'takeaways',           label: 'Takeaways' },
      { key: 'next_steps',          label: 'Next Steps' },
      { key: 'follow_up_date',      label: 'Deadline' },
      { key: 'is_complete',         label: 'Complete?' },
      { key: 'counterparty_role',   label: 'Role' }
    ]
    const csv = toCSV(filtered, columns)
    const stem = mandateFilter === 'All' ? 'interactions' : `interactions-${mandateFilter.replace(/[^a-z0-9]+/gi, '_')}`
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
      if (mandateFilter !== 'All') {
        const isMode  = ['self', 'general', 'multi', 'specific'].includes(mandateFilter)
        if (isMode) {
          if (r.mandate_link_mode !== mandateFilter) return false
        } else {
          // Specific deal UUID — match if the deal appears anywhere in the
          // interaction's links: the primary deal_id, the multi-mandate
          // deal_ids[] array (Phase 5), OR a self-mode row whose company
          // matches the deal's client_name. This is the "multiple linkages"
          // behaviour — a multi-mandate chat shows under EVERY mandate it
          // touched.
          const d = deals.find(x => x.id === mandateFilter)
          const isOnDeal = r.deal_id === mandateFilter
          const isInDealIds = Array.isArray(r.deal_ids) && r.deal_ids.includes(mandateFilter)
          const isSelfMatch = r.mandate_link_mode === 'self' && d
            && (r.counterparty_company || '').toLowerCase().trim() === (d.client_name || '').toLowerCase().trim()
          if (!isOnDeal && !isInDealIds && !isSelfMatch) return false
        }
      }
      if (needsFollowUp) {
        if (!r.follow_up_date) return false
        if (r.is_complete) return false
        const due = typeof r.follow_up_date === 'string' ? parseISO(r.follow_up_date) : new Date(r.follow_up_date)
        if (Number.isNaN(due.getTime())) return false
        if (differenceInCalendarDays(due, new Date()) > 0) return false  // not yet due
      }
      if (!needle) return true
      return [r.counterparty_name, r.counterparty_company, r.counterparty_role, r.notes, r.lead_owner]
        .some(v => (v || '').toLowerCase().includes(needle))
    })
  }, [rows, mandateFilter, deals, q, needsFollowUp])

  // Header stat ribbon — turns the page from "raw list" into "here's the
  // state of the funnel" in one line.
  const summary = useMemo(() => {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 864e5)
    let needFollowUp = 0, week = 0
    for (const r of rows) {
      if (r.follow_up_date && !r.is_complete) {
        const due = parseISO(String(r.follow_up_date))
        if (!Number.isNaN(due.getTime()) && differenceInCalendarDays(due, now) <= 0) needFollowUp++
      }
      if (r.occurred_at && new Date(r.occurred_at) >= weekAgo) week++
    }
    return { total: rows.length, needFollowUp, week }
  }, [rows])

  return (
    <div className="space-y-6">
      <ConfigBanner />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vl-eyebrow-ink">Interactions</p>
          <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
            Every interaction, in one funnel.
          </h1>
          <p className="mt-1.5 text-sm text-valence-muted tabular-nums">
            {summary.total} logged
            {summary.needFollowUp > 0 && <> · <span className="font-semibold text-valence-warning">{summary.needFollowUp} need follow-up</span></>}
            {summary.week > 0 && <> · {summary.week} this week</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <button onClick={() => setDrawer('new')} className="vl-btn-primary-sm">
            <Plus className="h-4 w-4" /> Log interaction
          </button>
        </div>
      </div>

      {/* Filter strip — single row: context dropdown + needs-follow-up
          toggle + search. Was three rows of chips with eyebrow labels;
          collapsed into a native select so the page reads at-a-glance. */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={mandateFilter}
          onChange={e => setMandateFilter(e.target.value)}
          className="h-8 rounded-md border border-valence-border bg-valence-elevated px-2.5 text-xs font-medium text-valence-text focus:border-valence-blue outline-none"
          aria-label="Deal filter"
        >
          <option value="All">All deals</option>
          <optgroup label="By mode">
            <option value="self">Self — the company itself</option>
            <option value="general">General — no deal link</option>
            <option value="multi">Multiple deals</option>
            <option value="specific">Specific (any linked)</option>
          </optgroup>
          {deals.length > 0 && (
            <optgroup label="Active deals">
              {deals.map(d => <option key={d.id} value={d.id}>{d.client_name} · {d.stage}</option>)}
            </optgroup>
          )}
        </select>
        <button
          onClick={() => setNeedsFollowUp(v => !v)}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 h-8 text-[11px] font-semibold transition ${
            needsFollowUp ? 'border-valence-warning/40 bg-valence-warning/10 text-valence-warning' : 'border-valence-border bg-valence-elevated text-valence-muted hover:text-valence-text'
          }`}
        >
          <AlertCircle className="h-3 w-3" /> Needs follow-up
        </button>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-valence-subtle" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search contact, company, notes…"
            className="vl-input h-8 w-72 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Auto-capture — passive Gmail + Calendar logging. */}
      <AutoCaptureCard onCaptured={load} />

      {/* Main content */}
      {loading ? (
        <ListSkeleton />
      ) : loadError ? (
        <EmptyState icon={MessageSquare} title="Couldn't load interactions" description={loadError} action={<button onClick={load} className="vl-btn-primary">Retry</button>} sampleEligible={false} />
      ) : rows.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No interactions yet" description="Log your first interaction to start building the funnel." action={<button onClick={() => setDrawer('new')} className="vl-btn-primary"><Plus className="h-4 w-4" /> Log interaction</button>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No interactions match your filters" description="Clear a filter, or log a new interaction." action={<button onClick={() => setDrawer('new')} className="vl-btn-primary"><Plus className="h-4 w-4" /> Log interaction</button>} sampleEligible={false} />
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
        onClose={() => {
          setDrawer(null)
          // Drop the deep-link param so reopening the list doesn't
          // immediately re-open the same drawer.
          if (searchParams.get('open')) {
            searchParams.delete('open')
            setSearchParams(searchParams, { replace: true })
          }
        }}
        existing={drawer && drawer !== 'new' ? drawer.row : null}
        onSubmit={(payload, id) => save(payload, id)}
      />
    </div>
  )
}

// Counterparty name — links to the person's profile when the interaction
// is tied to a People record, so the list behaves like a CRM (click a
// name → see the person) instead of a flat log. stopPropagation keeps the
// row's own open-the-drawer click from also firing.
function CounterpartyName({ row, className = '' }) {
  if (row.person_id) {
    return (
      <Link
        to={`/people?open=${row.person_id}`}
        onClick={e => e.stopPropagation()}
        className={`text-valence-text hover:text-valence-blue hover:underline decoration-valence-blue/40 underline-offset-2 ${className}`}
      >
        {row.counterparty_name}
      </Link>
    )
  }
  return <p className={`text-valence-text ${className}`}>{row.counterparty_name}</p>
}

function InteractionRow({ row, onOpen, onConvert, isDetailed = true }) {
  const ago = row.created_at ? formatDistanceToNowStrict(new Date(row.created_at), { addSuffix: true }) : ''
  const due = row.follow_up_date ? format(parseISO(row.follow_up_date), 'd MMM') : null
  const overdue = row.follow_up_date ? differenceInCalendarDays(parseISO(row.follow_up_date), new Date()) < 0 : false
  // Phase 26 — counterparty-type accent on the left rail + chip on the
  // metadata row. Lets the partner skim a list and pattern-match against
  // founder vs investor density at a glance.
  const railCls = ctyRail(row.counterparty_type)
  const when = row.occurred_at ? format(new Date(row.occurred_at), 'd MMM') : null

  // SIMPLE view (default) — deliberately sparse so the list is scannable:
  //   row 1: colour dot · Name · Company        type-chip      date
  //   row 2: → Next: …  (one clamped line, only if there's a next step)
  // Everything else (mandate pill, interaction type, origination, owner,
  // takeaways, context) is hidden here and only shown in Detailed.
  if (!isDetailed) {
    return (
      <li className="group">
        <div onClick={onOpen} className={`flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left hover:bg-valence-surface transition ${railCls}`}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              {row.counterparty_type && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${ctyDot(row.counterparty_type)}`} title={ctyLabel(row.counterparty_type)} />}
              <CounterpartyName row={row} className="text-sm font-semibold truncate" />
              {row.counterparty_company && <span className="text-xs text-valence-muted truncate shrink-0 max-w-[40%]">· {row.counterparty_company}</span>}
            </div>
            {row.next_steps && (
              <p className="mt-0.5 truncate text-xs text-valence-muted">
                <span className="font-semibold text-valence-blue">Next: </span>{row.next_steps}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            {when && <p className="text-[11px] tabular-nums text-valence-subtle">{when}</p>}
            {due && overdue && !row.is_complete && (
              <p className="text-[10px] font-semibold text-valence-danger">overdue</p>
            )}
            {row.is_complete && <p className="text-[10px] font-semibold text-valence-success">✓ done</p>}
          </div>
        </div>
      </li>
    )
  }

  // DETAILED view — the full record.
  return (
    <li className="group">
      <div className={`flex items-start gap-4 px-5 py-4 hover:bg-valence-surface transition ${railCls}`}>
        <div onClick={onOpen} className="flex-1 min-w-0 cursor-pointer text-left">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <CounterpartyName row={row} className="text-sm font-semibold" />
            {row.counterparty_company && <p className="text-xs text-valence-muted">· {row.counterparty_company}</p>}
            {row.counterparty_role && <p className="text-xs text-valence-subtle">· {row.counterparty_role}</p>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-valence-muted">
            {row.counterparty_type && (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${ctyChip(row.counterparty_type)}`}>
                {ctyLabel(row.counterparty_type)}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full border border-valence-border bg-valence-elevated px-2 py-0.5 font-semibold text-valence-text">
              {mandateModeLabel(row)}
            </span>
            <span className="text-valence-subtle">·</span>
            <span>{typeLabel(row.type)}</span>
            {(row.source === 'calendar' || row.source === 'gmail') && (
              <span className="inline-flex items-center gap-1 rounded-full border border-valence-blue/30 bg-valence-blue-soft px-2 py-0.5 font-semibold text-valence-blue" title="Captured automatically from your connected Google account">
                <Sparkles className="h-2.5 w-2.5" /> Auto · {row.source === 'calendar' ? 'Calendar' : 'Gmail'}
              </span>
            )}
            {row.origination && (<><span className="text-valence-subtle">·</span><span className="capitalize">{row.origination}</span></>)}
            {row.is_complete && (<><span className="text-valence-subtle">·</span><span className="text-valence-success font-semibold">✓ Complete</span></>)}
            {row.lead_owner && <><span className="text-valence-subtle">·</span><span>{row.lead_owner}</span></>}
            {due && (
              <><span className="text-valence-subtle">·</span>
              <span className={overdue ? 'font-semibold text-valence-danger' : 'text-valence-muted'}>
                Follow up {due}{overdue ? ' (overdue)' : ''}
              </span></>
            )}
          </div>
          {(row.context || row.takeaways || row.next_steps) ? (
            <div className="mt-2 space-y-1.5">
              {row.context && <p className="text-xs font-medium text-valence-text">{row.context}</p>}
              {row.takeaways && (
                <p className="line-clamp-3 text-xs leading-relaxed text-valence-muted">
                  <WikilinkText>{row.takeaways}</WikilinkText>
                </p>
              )}
              {row.next_steps && (
                <div className="flex items-start gap-1.5 rounded-md border border-valence-blue/25 bg-valence-blue-soft/40 px-2 py-1.5">
                  <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-valence-blue" />
                  <p className="text-xs font-medium leading-relaxed text-valence-text">
                    <span className="text-valence-blue font-semibold">Next: </span>
                    <WikilinkText>{row.next_steps}</WikilinkText>
                  </p>
                </div>
              )}
            </div>
          ) : row.notes ? (
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-valence-muted">
              <WikilinkText>{row.notes}</WikilinkText>
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0 text-[11px] text-valence-subtle">
          <span>{ago}</span>
          {row.outcome === 'converted_to_mandate' && (
            <button onClick={onConvert} className="vl-btn-ghost text-[11px]">
              <Sparkles className="h-3 w-3" /> Convert to deal <ArrowRight className="h-3 w-3" />
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
