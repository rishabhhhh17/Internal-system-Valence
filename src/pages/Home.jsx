import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  TrendingDown, Flame, Banknote, Layers, ArrowRight, Briefcase, Building2,
  AlertTriangle, FileWarning, Snowflake, Users, Target, ArrowUpRight, Sparkles
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useCurrency } from '../hooks/useCurrency.jsx'
import { stageMeta, activeStagesForMode } from '../lib/stages.js'
import { dropoffByOwner } from '../lib/insights.js'
import { docCompletion } from '../lib/diligenceDocs.js'
import { countRecentCaptures } from '../lib/autoCapture.js'
import { generateFirmBrief, isGeminiConfigured } from '../lib/gemini.js'
import ConfigBanner from '../components/ConfigBanner.jsx'

const STALL_DAYS = 21
const COLD_WARMTH = new Set(['cold', 'dormant'])

// Home — the firm-level intelligence landing. Mode-agnostic: Founders (deal
// flow) and LPs (fundraising) side by side so a GP opens the app and sees the
// state of the fund. Read-only; derived from the same data the app writes.
// Visual language is intentionally restrained — institutional, flat, neutral.
export default function Home() {
  const { money } = useCurrency()
  const [company, setCompany] = useState([])
  const [lp, setLp] = useState([])
  const [lpFunds, setLpFunds] = useState([])
  const [captures, setCaptures] = useState({ total: 0, calendar: 0, gmail: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    let alive = true
    ;(async () => {
      const [c, l, f, caps] = await Promise.all([
        supabase.from('deals').select('*').eq('kind', 'company'),
        supabase.from('deals').select('*').eq('kind', 'lp'),
        supabase.from('funds').select('name, fund_type, geographies, warmth, last_touched_at').eq('kind', 'lp'),
        countRecentCaptures({ days: 7 }).catch(() => ({ total: 0, calendar: 0, gmail: 0 }))
      ])
      if (!alive) return
      setCompany(c.data || []); setLp(l.data || []); setLpFunds(f.data || [])
      setCaptures(caps); setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  const founders = useMemo(() => {
    const active = company.filter(d => !stageMeta(d.stage).terminal)
    const reached = company.filter(d => d.stage === 'Diligence').length
    const passed = company.filter(d => d.stage === 'Passed').length
    const resolved = reached + passed
    const dropoffRate = resolved ? Math.round((passed / resolved) * 100) : null
    const funnel = activeStagesForMode('company').map(s => ({ id: s.id, label: s.short, count: company.filter(d => d.stage === s.id).length }))
    const stalled = active.filter(d => {
      const t = new Date(d.updated_at || d.created_at || 0).getTime()
      return t > 0 && (Date.now() - t) > STALL_DAYS * 86400000
    })
    let ready = 0, applicable = 0, outstanding = 0
    for (const d of active) {
      const { received, applicable: ap } = docCompletion(d, 'company')
      applicable += 1
      if (ap > 0 && received === ap) ready += 1
      outstanding += Math.max(0, ap - received)
    }
    const readiness = applicable ? Math.round((ready / applicable) * 100) : 0
    const owners = dropoffByOwner(company).filter(o => o.reached + o.passed > 0).slice(0, 4)
    return { activeCount: active.length, reached, dropoffRate, funnel, stalled, readiness, outstanding, owners }
  }, [company])

  const lps = useMemo(() => {
    const sum = arr => arr.reduce((s, d) => s + (Number(d.ticket_size_usd_m) || 0), 0)
    const committed = lp.filter(d => d.stage === 'Diligence')
    const softCircle = lp.filter(d => d.stage === 'LP Soft Circle')
    const inDD = lp.filter(d => d.stage === 'LP Due Diligence')
    const active = lp.filter(d => !stageMeta(d.stage).terminal)
    const funnel = activeStagesForMode('lp').map(s => ({ id: s.id, label: s.short, count: lp.filter(d => d.stage === s.id).length }))
    const byArchetype = tally(lpFunds.map(f => f.fund_type))
    const byGeo = tally(lpFunds.flatMap(f => f.geographies || []))
    const cold = lpFunds.filter(f => COLD_WARMTH.has(f.warmth))
    return {
      committedCapital: sum(committed), softCapital: sum(softCircle), pipelineCapital: sum(active),
      committedCount: committed.length, softCount: softCircle.length, ddCount: inDD.length,
      funnel, byArchetype, byGeo, cold
    }
  }, [lp, lpFunds])

  const briefSummary = useMemo(() => ({
    activeCount: founders.activeCount, reached: founders.reached, dropoffRate: founders.dropoffRate,
    readiness: founders.readiness, stalled: founders.stalled.length, outstanding: founders.outstanding,
    committedCapital: lps.committedCapital, committedCount: lps.committedCount, pipelineCapital: lps.pipelineCapital,
    cold: lps.cold.length, captures: captures.total
  }), [founders, lps, captures])

  const actions = useMemo(() => {
    const out = []
    for (const d of founders.stalled.slice(0, 3)) out.push({ icon: AlertTriangle, text: `${d.client_name} — no movement in ${STALL_DAYS}+ days`, meta: 'Founder · stalled', to: `/deals?open=${d.id}` })
    if (founders.outstanding > 0) out.push({ icon: FileWarning, text: `${founders.outstanding} diligence document${founders.outstanding === 1 ? '' : 's'} outstanding`, meta: 'Across active deals', to: '/mandates' })
    for (const f of lps.cold.slice(0, 2)) out.push({ icon: Snowflake, text: `${f.name} is going cold`, meta: 'LP · re-engage', to: '/funds' })
    return out.slice(0, 6)
  }, [founders, lps])

  return (
    <div className="space-y-8 pb-6">
      <ConfigBanner />

      {/* Hero */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-valence-border pb-6">
        <div>
          <p className="vl-eyebrow-ink">Firm overview</p>
          <h1 className="mt-2.5 font-display text-3xl font-bold tracking-tight text-valence-text">The fund, at a glance</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-valence-muted">Where deals are moving, where capital is landing, and what needs attention — founders and LPs in one view.</p>
        </div>
        <span className="text-[11px] text-valence-subtle">Updated {format(new Date(), 'd MMM yyyy · HH:mm')}</span>
      </header>

      {/* AI daily brief */}
      <FirmBrief summary={briefSummary} ready={!loading} />

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Briefcase} label="Active deals"         value={founders.activeCount} sub="In evaluation" />
        <Kpi icon={Target}    label="Reaching diligence"    value={founders.reached} sub={founders.dropoffRate != null ? `${founders.dropoffRate}% drop-off` : 'Graduated'} alert={founders.dropoffRate >= 40} />
        <Kpi icon={Banknote}  label="Committed LP capital"  value={money(lps.committedCapital)} sub={`${lps.committedCount} committed`} />
        <Kpi icon={Layers}    label="LP pipeline"           value={money(lps.pipelineCapital)} sub={`${lps.softCount} soft · ${lps.ddCount} in DD`} />
      </section>

      {/* Two-column intelligence */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* FOUNDERS */}
        <section className="vl-card p-6">
          <CardHead icon={Briefcase} title="Founders" subtitle="Deal flow & where it stalls" to="/deals" cta="Pipeline" />
          <Funnel funnel={founders.funnel} gradLabel="Diligence" gradCount={founders.reached} />
          <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-valence-border bg-valence-border">
            <Tile label="Drop-off" value={founders.dropoffRate != null ? `${founders.dropoffRate}%` : '—'} alert={founders.dropoffRate >= 40} />
            <Tile label="Data-room ready" value={`${founders.readiness}%`} />
            <Tile label="Stalled" value={founders.stalled.length} alert={founders.stalled.length > 0} />
          </div>
          {founders.owners.length > 0 && (
            <div className="mt-6">
              <p className="vl-eyebrow-ink mb-3">Where deals stall, by owner</p>
              <ul className="space-y-2.5">
                {founders.owners.map(o => (
                  <li key={o.owner} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-[13px] text-valence-text">{o.owner}</span>
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-valence-surface">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-valence-ink/70" style={{ width: `${pct(o.reached, o.reached + o.passed)}%` }} />
                    </div>
                    <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-valence-muted">{o.reached} reached · {o.passed} lost</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* LPs */}
        <section className="vl-card p-6">
          <CardHead icon={Building2} title="LPs" subtitle="Fundraising & capital" to="/funds" cta="LP book" />
          <Funnel funnel={lps.funnel} gradLabel="Committed" gradCount={lps.committedCount} />
          <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-valence-border bg-valence-border">
            <Tile label="Committed" value={money(lps.committedCapital)} />
            <Tile label="Soft-circled" value={money(lps.softCapital)} />
            <Tile label="Going cold" value={lps.cold.length} alert={lps.cold.length > 0} />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-6">
            <Breakdown title="By archetype" items={lps.byArchetype} />
            <Breakdown title="By geography" items={lps.byGeo} />
          </div>
        </section>
      </div>

      {/* Relationship-intelligence band */}
      <section className="vl-card flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <Users className="h-4 w-4 text-valence-subtle" />
          <p className="text-[13px] text-valence-muted">
            <b className="font-semibold text-valence-text tabular-nums">{captures.total}</b> interactions auto-captured this week
            <span className="mx-2 text-valence-border">|</span>
            <b className="font-semibold text-valence-text tabular-nums">{lps.cold.length}</b> LP relationship{lps.cold.length === 1 ? '' : 's'} at risk
          </p>
        </div>
        <Link to="/interactions" className="inline-flex items-center gap-1 text-xs font-semibold text-valence-blue hover:text-valence-blue-hover">Relationships <ArrowRight className="h-3 w-3" /></Link>
      </section>

      {/* Needs attention */}
      {actions.length > 0 && (
        <section>
          <p className="vl-eyebrow-ink mb-3">Needs attention</p>
          <div className="overflow-hidden rounded-xl border border-valence-border divide-y divide-valence-border">
            {actions.map((a, i) => (
              <Link key={i} to={a.to} className="group flex items-center gap-3.5 bg-valence-elevated px-4 py-3 transition hover:bg-valence-surface">
                <a.icon className={`h-4 w-4 shrink-0 ${a.icon === AlertTriangle || a.icon === FileWarning ? 'text-valence-muted' : 'text-valence-subtle'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-valence-text">{a.text}</p>
                  <p className="text-[11px] text-valence-subtle">{a.meta}</p>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-valence-subtle transition group-hover:text-valence-text" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {loading && <p className="text-center text-xs text-valence-subtle">Loading…</p>}
    </div>
  )
}

function FirmBrief({ summary, ready }) {
  const [text, setText] = useState('')
  const done = useRef(false)
  useEffect(() => {
    if (!ready || done.current) return
    done.current = true
    const cacheKey = `valence.firmbrief.${new Date().toISOString().slice(0, 10)}`
    let cached = null
    try { cached = localStorage.getItem(cacheKey) } catch { /* private */ }
    if (cached) { setText(cached); return }
    let alive = true
    generateFirmBrief(summary).then(t => {
      if (!alive || !t) return
      setText(t)
      try { localStorage.setItem(cacheKey, t) } catch { /* private */ }
    }).catch(() => {})
    return () => { alive = false }
  }, [ready, summary])

  if (!text) return null
  return (
    <section className="rounded-2xl border border-valence-border bg-valence-elevated p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-valence-blue-soft text-valence-blue"><Sparkles className="h-3.5 w-3.5" /></span>
        <div>
          <p className="mb-1 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-valence-muted">
            Daily brief
            {isGeminiConfigured && <span className="rounded-full bg-valence-blue-soft px-1.5 py-0 text-[9px] font-semibold tracking-normal text-valence-blue">AI</span>}
          </p>
          <p className="text-[15px] leading-relaxed text-valence-text">{text}</p>
        </div>
      </div>
    </section>
  )
}

function Kpi({ icon: Icon, label, value, sub, alert = false }) {
  return (
    <div className="vl-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-valence-muted">{label}</p>
        <Icon className="h-3.5 w-3.5 text-valence-subtle" />
      </div>
      <p className="mt-3 font-display text-[26px] font-bold leading-none tracking-[-0.02em] text-valence-text tabular-nums">{value}</p>
      {sub && <p className={`mt-2.5 text-[11px] ${alert ? 'text-valence-danger' : 'text-valence-subtle'}`}>{sub}</p>}
    </div>
  )
}

function CardHead({ icon: Icon, title, subtitle, to, cta }) {
  return (
    <div className="mb-5 flex items-start justify-between">
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-valence-subtle" />
        <div>
          <h2 className="text-[15px] font-semibold text-valence-text">{title}</h2>
          <p className="text-[12px] text-valence-muted">{subtitle}</p>
        </div>
      </div>
      <Link to={to} className="inline-flex items-center gap-1 text-xs font-semibold text-valence-blue hover:text-valence-blue-hover">{cta} <ArrowRight className="h-3 w-3" /></Link>
    </div>
  )
}

function Funnel({ funnel, gradLabel, gradCount }) {
  const rows = [...funnel, { id: '_grad', label: gradLabel, count: gradCount, grad: true }]
  const max = Math.max(1, ...rows.map(r => r.count))
  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.id} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-[11px] text-valence-muted truncate">{r.label}</span>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-valence-surface">
            <div className={`h-full rounded ${r.grad ? 'bg-valence-ink' : 'bg-valence-ink/45'}`} style={{ width: `${Math.max(r.count > 0 ? 6 : 0, (r.count / max) * 100)}%` }} />
            <span className="absolute inset-y-0 right-2.5 flex items-center text-[11px] font-semibold tabular-nums text-valence-text">{r.count}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function Tile({ label, value, alert = false }) {
  return (
    <div className="bg-valence-elevated px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-valence-muted">{label}</p>
      <p className={`mt-1.5 font-display text-lg font-bold tabular-nums ${alert ? 'text-valence-danger' : 'text-valence-text'}`}>{value}</p>
    </div>
  )
}

function Breakdown({ title, items }) {
  const top = items.slice(0, 4)
  const max = Math.max(1, ...top.map(i => i.count))
  return (
    <div>
      <p className="vl-eyebrow-ink mb-2.5">{title}</p>
      {top.length === 0 ? <p className="text-[11px] text-valence-subtle">—</p> : (
        <ul className="space-y-2">
          {top.map(i => (
            <li key={i.key} className="text-[11px]">
              <div className="flex items-center justify-between gap-2"><span className="truncate text-valence-text">{i.key}</span><span className="tabular-nums text-valence-subtle">{i.count}</span></div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-valence-surface"><div className="h-full rounded-full bg-valence-ink/40" style={{ width: `${(i.count / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function pct(n, d) { return d ? Math.round((n / d) * 100) : 0 }
function tally(values) {
  const m = new Map()
  for (const v of values) { if (!v) continue; m.set(v, (m.get(v) || 0) + 1) }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
}
