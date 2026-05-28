// =============================================================================
// /reports/aging — Aging Report (Phase 22)
// =============================================================================
// Surfaces stalled deals. Default sort: days-in-current-stage descending so
// the deal that's been sitting in Pitching for 90 days bubbles to the top.
//
// Data:
//   - public.deals (current state)
//   - public.deal_stage_history (open row per deal = current window;
//                                closed rows aggregated = total days)
//
// Columns:
//   Deal | Current Stage | Days in Stage | Total Days | Stage Breakdown | Owner
//
// Stage Breakdown is a tiny inline-bar of the deal's full history,
// proportional by days_in_stage, coloured by stage.
//
// Filters: pipeline type · stage · owner.
// CSV export is inline (no papaparse dep) since the codebase has avoided
// new packages where a 20-line vanilla impl is enough.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, ArrowDownAZ, Clock, Briefcase, AlertTriangle } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

const STALLED_THRESHOLD_DAYS = 30

const STAGE_COLORS = {
  'Origination':  '#3399FF',
  'Pitching':     '#6F7BFF',
  'Pre-Mandate':  '#A06FFF',
  'Mandate':      '#10B981',
  'Closed':       '#16A34A',
  'On Hold':      '#F59E0B',
  'Lost':         '#EF4444'
}
function colorForStage(s) { return STAGE_COLORS[s] || '#94A3B8' }

export default function AgingReport() {
  const [rows, setRows]   = useState([])
  const [loading, setLoading] = useState(true)
  const [pipelineFilter, setPipelineFilter] = useState('all')   // 'all' | 'transaction' | 'advisory'
  const [stageFilter, setStageFilter]       = useState('all')
  const [ownerFilter, setOwnerFilter]       = useState('all')

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        // Pull every deal + its full stage history. Two queries, joined
        // client-side because Supabase's nested-select on a 1-to-many
        // relation returns the parent twice if we ask for it via the
        // foreign-table shortcut.
        const [dealsRes, historyRes] = await Promise.all([
          supabase
            .from('deals')
            .select('id, client_name, stage, sector, deal_types, lead_owner, created_at'),
          supabase
            .from('deal_stage_history')
            .select('deal_id, stage, entered_at, exited_at')
            .order('entered_at', { ascending: true })
        ])
        if (cancelled) return

        const deals    = dealsRes?.data    || []
        const rawHist  = historyRes?.data  || []

        // Compute days_in_stage client-side. Generated column was dropped
        // from the migration because Postgres rejects volatile (now())
        // expressions in GENERATED ALWAYS AS. Cheap to compute here.
        const MS_PER_DAY = 24 * 60 * 60 * 1000
        const daysBetween = (a, b) => Math.max(0, Math.floor((b - a) / MS_PER_DAY))
        const nowMs = Date.now()
        const history = rawHist.map(h => ({
          ...h,
          days_in_stage: daysBetween(new Date(h.entered_at).getTime(),
                                     h.exited_at ? new Date(h.exited_at).getTime() : nowMs)
        }))

        // Index history by deal so we can compute totals + the current
        // (open) row per deal in one pass.
        const byDeal = new Map()
        for (const h of history) {
          if (!byDeal.has(h.deal_id)) byDeal.set(h.deal_id, [])
          byDeal.get(h.deal_id).push(h)
        }

        const composed = deals.map(d => {
          const hist = byDeal.get(d.id) || []
          const open = hist.find(h => !h.exited_at)
          const totalDays = hist.reduce((s, h) => s + (h.days_in_stage || 0), 0)
          return {
            ...d,
            history:        hist,
            daysInStage:    open?.days_in_stage ?? 0,
            currentEntered: open?.entered_at ?? d.created_at,
            totalDays
          }
        })
        // Default sort: stalled-first.
        composed.sort((a, b) => b.daysInStage - a.daysInStage)
        setRows(composed)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Build filter dropdown options from the data so we don't hard-code
  // stages/owners that might drift.
  const stageOptions = useMemo(() => {
    const set = new Set(rows.map(r => r.stage).filter(Boolean))
    return ['all', ...Array.from(set).sort()]
  }, [rows])
  const ownerOptions = useMemo(() => {
    const set = new Set(rows.map(r => r.lead_owner).filter(Boolean))
    return ['all', ...Array.from(set).sort()]
  }, [rows])

  const filtered = useMemo(() => rows.filter(r => {
    if (stageFilter !== 'all' && r.stage !== stageFilter) return false
    if (ownerFilter !== 'all' && r.lead_owner !== ownerFilter) return false
    if (pipelineFilter !== 'all') {
      const types = r.deal_types || []
      if (!types.includes(pipelineFilter)) return false
    }
    return true
  }), [rows, stageFilter, ownerFilter, pipelineFilter])

  const stalledCount = filtered.filter(r => r.daysInStage >= STALLED_THRESHOLD_DAYS).length

  function exportCsv() {
    const headers = ['Deal', 'Current Stage', 'Days in Current Stage', 'Total Days', 'Sector', 'Owner', 'Pipeline']
    const cells = filtered.map(r => [
      r.client_name,
      r.stage,
      r.daysInStage,
      r.totalDays,
      r.sector || '',
      r.lead_owner || '',
      (r.deal_types || []).join('+')
    ])
    const escape = (v) => {
      const s = String(v ?? '')
      // Standard CSV quoting: if it contains a comma, quote, or newline,
      // wrap in double quotes and double any internal quotes.
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const csv = [headers, ...cells].map(row => row.map(escape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `aging-report-${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="vl-eyebrow-ink">Reports</p>
          <h1 className="font-display text-3xl font-bold text-valence-text mt-2">Aging</h1>
          <p className="mt-2 max-w-2xl text-sm text-valence-muted">
            How long every mandate has been sitting in its current stage. Stalled deals (≥{STALLED_THRESHOLD_DAYS} days idle) sort to the top.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stalledCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-valence-warning/15 text-valence-warning px-3 py-1 text-xs font-semibold">
              <AlertTriangle className="h-3 w-3" />
              {stalledCount} stalled
            </span>
          )}
          <button onClick={exportCsv} className="vl-btn-ghost text-xs" title="Download CSV">
            <Download className="h-3 w-3" /> CSV
          </button>
        </div>
      </header>

      {/* Filter row */}
      <div className="mb-5 flex flex-wrap gap-2">
        <FilterSelect
          label="Pipeline"
          value={pipelineFilter}
          onChange={setPipelineFilter}
          options={[
            { value: 'all',         label: 'All' },
            { value: 'transaction', label: 'Transaction' },
            { value: 'advisory',    label: 'Advisory' }
          ]}
        />
        <FilterSelect
          label="Stage"
          value={stageFilter}
          onChange={setStageFilter}
          options={stageOptions.map(s => ({ value: s, label: s === 'all' ? 'All stages' : s }))}
        />
        <FilterSelect
          label="Owner"
          value={ownerFilter}
          onChange={setOwnerFilter}
          options={ownerOptions.map(o => ({ value: o, label: o === 'all' ? 'All owners' : o }))}
        />
      </div>

      {loading ? (
        <div className="rounded-xl border border-valence-border bg-valence-elevated px-6 py-16 text-center text-sm text-valence-muted">
          Loading aging data…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-valence-border bg-valence-elevated px-6 py-16 text-center">
          <div className="mb-3 inline-grid h-10 w-10 place-items-center rounded-full bg-valence-surface ring-1 ring-valence-border">
            <Briefcase className="h-4 w-4 text-valence-subtle" />
          </div>
          <h3 className="text-base font-semibold text-valence-text">No deals match these filters</h3>
          <p className="mt-1 text-sm text-valence-muted">Clear filters or add deals from <Link to="/deals" className="text-valence-blue hover:underline">Deal Logger</Link>.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-valence-border bg-valence-elevated overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-valence-surface text-valence-muted">
              <tr>
                <Th>Deal</Th>
                <Th>Current Stage</Th>
                <Th className="text-right">
                  <span className="inline-flex items-center gap-1"><ArrowDownAZ className="h-3 w-3" /> Days in Stage</span>
                </Th>
                <Th className="text-right">Total Days</Th>
                <Th>Stage Breakdown</Th>
                <Th>Owner</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const stalled = r.daysInStage >= STALLED_THRESHOLD_DAYS
                return (
                  <tr key={r.id} className="border-t border-valence-border/60 hover:bg-valence-surface/40">
                    <Td>
                      <Link to={`/deals?open=${r.id}`} className="font-semibold text-valence-text hover:text-valence-blue">
                        {r.client_name}
                      </Link>
                      {r.sector && <p className="text-[11px] text-valence-muted">{r.sector}</p>}
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colorForStage(r.stage) }} />
                        <span className="text-valence-text">{r.stage}</span>
                      </span>
                    </Td>
                    <Td className="text-right">
                      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                        stalled ? 'bg-valence-warning/15 text-valence-warning' : 'text-valence-text'
                      }`}>
                        {stalled && <Clock className="h-3 w-3" />}
                        {r.daysInStage}d
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums text-valence-muted">{r.totalDays}d</Td>
                    <Td>
                      <StageBreakdownBar history={r.history} totalDays={r.totalDays} />
                    </Td>
                    <Td className="text-valence-muted">{r.lead_owner || '—'}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-[11px] text-valence-subtle">
        Stalled threshold is currently {STALLED_THRESHOLD_DAYS} days across all stages. Per-stage thresholds will land in a follow-up.
      </p>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs">
      <span className="text-valence-muted">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="rounded-md border border-valence-border bg-valence-elevated px-2 py-1 text-xs font-medium text-valence-text"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

function Th({ children, className = '' }) {
  return <th className={`px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] ${className}`}>{children}</th>
}
function Td({ children, className = '' }) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>
}

// Inline horizontal bar showing each stage as a coloured segment
// proportional to its days_in_stage. Total width caps at 160px so the
// column doesn't blow out the layout. The current (open) segment gets a
// subtle hash overlay so it reads as "in progress".
function StageBreakdownBar({ history, totalDays }) {
  if (!history || history.length === 0 || totalDays <= 0) {
    return <span className="text-[11px] text-valence-subtle">—</span>
  }
  return (
    <div className="flex h-2.5 w-40 overflow-hidden rounded-full border border-valence-border bg-valence-surface">
      {history.map((h, i) => {
        const pct = Math.max(2, Math.round((h.days_in_stage / totalDays) * 100))
        const isOpen = !h.exited_at
        return (
          <div
            key={`${h.deal_id}-${i}`}
            title={`${h.stage} · ${h.days_in_stage}d`}
            className="h-full"
            style={{
              width: `${pct}%`,
              backgroundColor: colorForStage(h.stage),
              backgroundImage: isOpen
                ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 4px, transparent 4px 8px)'
                : undefined
            }}
          />
        )
      })}
    </div>
  )
}
