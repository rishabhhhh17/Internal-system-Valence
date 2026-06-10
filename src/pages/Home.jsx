import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  TrendingDown, Flame, Banknote, Layers, ArrowRight, Briefcase, Building2,
  AlertTriangle, FileWarning, Snowflake, Sparkles, Users, Target
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useCurrency } from '../hooks/useCurrency.jsx'
import { stageMeta, activeStagesForMode } from '../lib/stages.js'
import { dropoffByOwner } from '../lib/insights.js'
import { docCompletion } from '../lib/diligenceDocs.js'
import { countRecentCaptures } from '../lib/autoCapture.js'
import ConfigBanner from '../components/ConfigBanner.jsx'

const STALL_DAYS = 21
const COLD_WARMTH = new Set(['cold', 'dormant'])

// Home — the firm-level intelligence landing. Mode-agnostic: shows Founders
// (deal flow) and LPs (fundraising) side by side so a GP opens the app and
// sees the state of the fund, not a to-do list. Read-only; derived from the
// same data the rest of the app writes.
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

  // ── Founders / deal-flow ──
  const founders = useMemo(() => {
    const active = company.filter(d => !stageMeta(d.stage).terminal)
    const reached = company.filter(d => d.stage === 'Diligence').length
    const passed = company.filter(d => d.stage === 'Passed').length
    const resolved = reached + passed
    const dropoffRate = resolved ? Math.round((passed / resolved) * 100) : null
    // funnel counts across the company active funnel
    const funnel = activeStagesForMode('company').map(s => ({
      id: s.id, label: s.short, count: company.filter(d => d.stage === s.id).length
    }))
    const stalled = active.filter(d => {
      const t = new Date(d.updated_at || d.created_at || 0).getTime()
      return t > 0 && (Date.now() - t) > STALL_DAYS * 86400000
    })
    // diligence readiness across active deals
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

  // ── LPs / fundraising ──
  const lps = useMemo(() => {
    const sum = arr => arr.reduce((s, d) => s + (Number(d.ticket_size_usd_m) || 0), 0)
    const committed = lp.filter(d => d.stage === 'Diligence')
    const softCircle = lp.filter(d => d.stage === 'LP Soft Circle')
    const inDD = lp.filter(d => d.stage === 'LP Due Diligence')
    const active = lp.filter(d => !stageMeta(d.stage).terminal)
    const funnel = activeStagesForMode('lp').map(s => ({
      id: s.id, label: s.short, count: lp.filter(d => d.stage === s.id).length
    }))
    // coverage by archetype + geography from the LP relationship book
    const byArchetype = tally(lpFunds.map(f => f.fund_type))
    const byGeo = tally(lpFunds.flatMap(f => f.geographies || []))
    const cold = lpFunds.filter(f => COLD_WARMTH.has(f.warmth))
    return {
      committedCapital: sum(committed), softCapital: sum(softCircle), pipelineCapital: sum(active),
      committedCount: committed.length, softCount: softCircle.length, ddCount: inDD.length,
      funnel, byArchetype, byGeo, cold
    }
  }, [lp, lpFunds])

  // ── Needs you today (ranked) ──
  const actions = useMemo(() => {
    const out = []
    for (const d of founders.stalled.slice(0, 3)) {
      out.push({ icon: AlertTriangle, tone: 'warning', text: `${d.client_name} — no movement in ${STALL_DAYS}+ days`, to: `/deals?open=${d.id}` })
    }
    if (founders.outstanding > 0) {
      out.push({ icon: FileWarning, tone: 'danger', text: `${founders.outstanding} diligence document${founders.outstanding === 1 ? '' : 's'} outstanding across active deals`, to: '/mandates' })
    }
    for (const f of lps.cold.slice(0, 2)) {
      out.push({ icon: Snowflake, tone: 'info', text: `${f.name} (LP) is going cold — re-engage`, to: '/funds' })
    }
    return out.slice(0, 6)
  }, [founders, lps])

  return (
    <div className="space-y-7">
      <ConfigBanner />

      <header>
        <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Home</p>
        <h1 className="mt-2 font-display text-feature font-bold text-valence-text">The fund, at a glance.</h1>
        <p className="mt-2 text-sm text-valence-muted">Where deals are leaking, where capital is landing, and what needs you — founders and LPs in one view.</p>
      </header>

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-valence-border bg-valence-border md:grid-cols-4">
        <Kpi label="Active deals" value={founders.activeCount} sub="In evaluation" icon={Briefcase} accent />
        <Kpi label="Reaching diligence" value={founders.reached} sub={founders.dropoffRate != null ? `${founders.dropoffRate}% drop-off` : 'Graduated'} icon={Target} />
        <Kpi label="Committed LP capital" value={money(lps.committedCapital)} sub={`${lps.committedCount} committed`} icon={Banknote} accent />
        <Kpi label="LP pipeline" value={money(lps.pipelineCapital)} sub={`${lps.softCount} soft-circled · ${lps.ddCount} in DD`} icon={Layers} />
      </section>

      {/* Two-column intelligence */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* FOUNDERS — deal-flow & drop-off */}
        <section className="vl-card p-6 space-y-5">
          <Head icon={Briefcase} title="Founders — deal flow" to="/deals" cta="Pipeline" />
          <FunnelBars funnel={founders.funnel} terminalLabel="Diligence" terminalCount={founders.reached} />
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Drop-off rate" value={founders.dropoffRate != null ? `${founders.dropoffRate}%` : '—'} tone={founders.dropoffRate >= 40 ? 'danger' : 'muted'} icon={TrendingDown} />
            <MiniStat label="Data-room ready" value={`${founders.readiness}%`} tone={founders.readiness >= 60 ? 'success' : 'warning'} icon={FileWarning} />
            <MiniStat label="Stalled" value={founders.stalled.length} tone={founders.stalled.length ? 'warning' : 'muted'} icon={AlertTriangle} />
          </div>
          {founders.owners.length > 0 && (
            <div>
              <p className="vl-eyebrow-ink mb-2 inline-flex items-center gap-1.5"><Flame className="h-3 w-3" /> Where deals leak — by owner</p>
              <ul className="space-y-1">
                {founders.owners.map(o => (
                  <li key={o.owner} className="flex items-center justify-between rounded-lg border border-valence-border bg-valence-elevated px-3 py-1.5 text-xs">
                    <span className="font-semibold text-valence-text">{o.owner}</span>
                    <span className="tabular-nums text-valence-muted">
                      <span className="text-valence-success font-semibold">{o.reached}</span> reached ·
                      <span className="text-valence-danger font-semibold"> {o.passed}</span> passed
                      {o.passRate != null && <span className={`ml-1 ${o.passRate >= 50 ? 'text-valence-danger' : 'text-valence-muted'}`}>· {o.passRate}%</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* LPs — capital & fundraising */}
        <section className="vl-card p-6 space-y-5">
          <Head icon={Building2} title="LPs — fundraising" to="/funds" cta="LP book" />
          <FunnelBars funnel={lps.funnel} terminalLabel="Committed" terminalCount={lps.committedCount} />
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Committed" value={money(lps.committedCapital)} tone="success" icon={Banknote} />
            <MiniStat label="Soft-circled" value={money(lps.softCapital)} tone="muted" icon={Layers} />
            <MiniStat label="Going cold" value={lps.cold.length} tone={lps.cold.length ? 'warning' : 'muted'} icon={Snowflake} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Breakdown title="By archetype" items={lps.byArchetype} />
            <Breakdown title="By geography" items={lps.byGeo} />
          </div>
        </section>
      </div>

      {/* Relationship-intelligence band */}
      <section className="vl-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-valence-blue-soft text-valence-blue ring-1 ring-valence-blue/20"><Users className="h-4 w-4" /></span>
          <div>
            <p className="text-sm font-semibold text-valence-text">Relationship intelligence</p>
            <p className="text-[11px] text-valence-muted">
              <span className="font-semibold text-valence-text tabular-nums">{captures.total}</span> interactions auto-captured this week ·
              <span className="font-semibold text-valence-text tabular-nums"> {lps.cold.length}</span> LP relationship{lps.cold.length === 1 ? '' : 's'} at risk
            </p>
          </div>
        </div>
        <Link to="/interactions" className="vl-btn-secondary shrink-0">Open relationships <ArrowRight className="h-4 w-4" /></Link>
      </section>

      {/* Needs you today */}
      {actions.length > 0 && (
        <section className="vl-card p-6">
          <p className="vl-eyebrow-ink mb-3 inline-flex items-center gap-1.5"><Target className="h-3 w-3" /> Needs you today</p>
          <ul className="space-y-1.5">
            {actions.map((a, i) => (
              <li key={i}>
                <Link to={a.to} className="group flex items-center gap-3 rounded-lg border border-valence-border bg-valence-elevated px-3 py-2.5 transition hover:border-valence-ink/30">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${toneBg(a.tone)}`}><a.icon className="h-3.5 w-3.5" /></span>
                  <span className="flex-1 text-sm text-valence-text">{a.text}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-valence-subtle group-hover:text-valence-blue" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading && <p className="text-center text-xs text-valence-subtle">Loading the firm…</p>}
    </div>
  )
}

function Kpi({ label, value, sub, icon: Icon, accent = false }) {
  return (
    <div className={`bg-valence-elevated p-5 ${accent ? 'ring-1 ring-valence-blue/20' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="vl-eyebrow-ink">{label}</span>
        <Icon className={`h-3.5 w-3.5 ${accent ? 'text-valence-blue' : 'text-valence-subtle'}`} />
      </div>
      <p className="mt-3 font-display text-2xl font-bold tracking-[-0.02em] text-valence-text tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-[10px] text-valence-muted">{sub}</p>}
    </div>
  )
}

function Head({ icon: Icon, title, to, cta }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="vl-section-title inline-flex items-center gap-2"><Icon className="h-4 w-4 text-valence-blue" /> {title}</h2>
      <Link to={to} className="text-xs font-semibold text-valence-blue hover:text-valence-blue-hover inline-flex items-center gap-1">{cta} <ArrowRight className="h-3 w-3" /></Link>
    </div>
  )
}

function FunnelBars({ funnel, terminalLabel, terminalCount }) {
  const rows = [...funnel, { id: '_grad', label: terminalLabel, count: terminalCount, grad: true }]
  const max = Math.max(1, ...rows.map(r => r.count))
  return (
    <div className="space-y-1.5">
      {rows.map(r => (
        <div key={r.id} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-[11px] text-valence-muted truncate">{r.label}</span>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-valence-surface">
            <div className={`h-full rounded ${r.grad ? 'bg-valence-success' : 'bg-gradient-to-r from-valence-blue/40 to-valence-blue'}`} style={{ width: `${(r.count / max) * 100}%` }} />
            <span className="absolute inset-y-0 right-2 flex items-center text-[10px] font-semibold tabular-nums text-valence-text">{r.count}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function MiniStat({ label, value, tone = 'muted', icon: Icon }) {
  const tc = tone === 'danger' ? 'text-valence-danger' : tone === 'success' ? 'text-valence-success' : tone === 'warning' ? 'text-valence-warning' : 'text-valence-text'
  return (
    <div className="rounded-lg border border-valence-border bg-valence-surface px-3 py-2.5">
      <p className="vl-eyebrow-ink inline-flex items-center gap-1"><Icon className="h-3 w-3" /> {label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${tc}`}>{value}</p>
    </div>
  )
}

function Breakdown({ title, items }) {
  const top = items.slice(0, 4)
  const max = Math.max(1, ...top.map(i => i.count))
  return (
    <div>
      <p className="vl-eyebrow-ink mb-2">{title}</p>
      {top.length === 0 ? <p className="text-[11px] text-valence-subtle">—</p> : (
        <ul className="space-y-1.5">
          {top.map(i => (
            <li key={i.key} className="text-[11px]">
              <div className="flex items-center justify-between"><span className="text-valence-text truncate">{i.key}</span><span className="tabular-nums text-valence-muted">{i.count}</span></div>
              <div className="mt-0.5 h-1 rounded-full bg-valence-surface overflow-hidden"><div className="h-full rounded-full bg-valence-blue/60" style={{ width: `${(i.count / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function tally(values) {
  const m = new Map()
  for (const v of values) { if (!v) continue; m.set(v, (m.get(v) || 0) + 1) }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
}

function toneBg(tone) {
  if (tone === 'danger') return 'bg-valence-danger/10 text-valence-danger'
  if (tone === 'warning') return 'bg-valence-warning/10 text-valence-warning'
  if (tone === 'info') return 'bg-valence-blue-soft text-valence-blue'
  return 'bg-valence-surface text-valence-muted'
}
