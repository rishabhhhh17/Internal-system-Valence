import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  TrendingDown, Flame, Banknote, Layers, ArrowRight, Briefcase, Building2,
  AlertTriangle, FileWarning, Snowflake, Sparkles, Users, Target, ArrowUpRight
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

// Home — the firm-level intelligence landing. Mode-agnostic: Founders (deal
// flow) and LPs (fundraising) side by side so a GP opens the app and sees the
// state of the fund. Read-only; derived from the same data the app writes.
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

  const actions = useMemo(() => {
    const out = []
    for (const d of founders.stalled.slice(0, 3)) out.push({ icon: AlertTriangle, tone: 'warning', text: `${d.client_name} — no movement in ${STALL_DAYS}+ days`, meta: 'Founder · stalled', to: `/deals?open=${d.id}` })
    if (founders.outstanding > 0) out.push({ icon: FileWarning, tone: 'danger', text: `${founders.outstanding} diligence document${founders.outstanding === 1 ? '' : 's'} outstanding`, meta: 'Across active deals', to: '/mandates' })
    for (const f of lps.cold.slice(0, 2)) out.push({ icon: Snowflake, tone: 'info', text: `${f.name} is going cold`, meta: 'LP · re-engage', to: '/funds' })
    return out.slice(0, 6)
  }, [founders, lps])

  return (
    <div className="space-y-8 pb-4">
      <ConfigBanner />

      {/* Hero */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vl-eyebrow inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Firm overview</p>
          <h1 className="mt-3 font-display text-feature font-bold tracking-tight text-valence-text">The fund, at a glance.</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-valence-muted">Where deals are leaking, where capital is landing, and what needs you — founders and LPs in one view.</p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-valence-border bg-valence-elevated px-3 py-1.5 text-[11px] text-valence-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-valence-success shadow-[0_0_6px_#22c55e]" /> Live · {format(new Date(), 'd MMM, HH:mm')}
        </span>
      </header>

      {/* KPI cards */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Briefcase} tint="blue"  label="Active deals"        value={founders.activeCount} sub="In evaluation" />
        <Kpi icon={Target}    tint="violet" label="Reaching diligence"  value={founders.reached} sub={founders.dropoffRate != null ? `${founders.dropoffRate}% drop-off` : 'Graduated'} subTone={founders.dropoffRate >= 40 ? 'danger' : 'muted'} />
        <Kpi icon={Banknote}  tint="emerald" label="Committed LP capital" value={money(lps.committedCapital)} sub={`${lps.committedCount} committed`} subTone="success" />
        <Kpi icon={Layers}    tint="amber"  label="LP pipeline"          value={money(lps.pipelineCapital)} sub={`${lps.softCount} soft · ${lps.ddCount} in DD`} />
      </section>

      {/* Two-column intelligence */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* FOUNDERS */}
        <section className="vl-card vl-card-hover p-7 space-y-6">
          <CardHead icon={Briefcase} tint="blue" title="Founders" subtitle="Deal flow & where it leaks" to="/deals" cta="Pipeline" />
          <Funnel funnel={founders.funnel} gradLabel="Diligence" gradCount={founders.reached} accent="blue" />
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Drop-off" value={founders.dropoffRate != null ? `${founders.dropoffRate}%` : '—'} tone={founders.dropoffRate >= 40 ? 'danger' : 'muted'} icon={TrendingDown} />
            <Tile label="Data-room ready" value={`${founders.readiness}%`} tone={founders.readiness >= 60 ? 'success' : 'warning'} icon={FileWarning} />
            <Tile label="Stalled" value={founders.stalled.length} tone={founders.stalled.length ? 'warning' : 'success'} icon={AlertTriangle} />
          </div>
          {founders.owners.length > 0 && (
            <div className="space-y-2.5">
              <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Flame className="h-3 w-3" /> Where deals leak, by owner</p>
              <ul className="space-y-2">
                {founders.owners.map(o => (
                  <li key={o.owner} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-[13px] font-medium text-valence-text">{o.owner}</span>
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-valence-surface">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-valence-success/70" style={{ width: `${pct(o.reached, o.reached + o.passed)}%` }} />
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-valence-muted">
                      <span className="font-semibold text-valence-success">{o.reached}</span> / <span className="font-semibold text-valence-danger">{o.passed}</span>
                      {o.passRate != null && <span className={`ml-1.5 font-semibold ${o.passRate >= 50 ? 'text-valence-danger' : 'text-valence-subtle'}`}>{o.passRate}%</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-valence-subtle">Bar = reached diligence · numbers are reached / passed.</p>
            </div>
          )}
        </section>

        {/* LPs */}
        <section className="vl-card vl-card-hover p-7 space-y-6">
          <CardHead icon={Building2} tint="emerald" title="LPs" subtitle="Fundraising & capital" to="/funds" cta="LP book" />
          <Funnel funnel={lps.funnel} gradLabel="Committed" gradCount={lps.committedCount} accent="emerald" />
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Committed" value={money(lps.committedCapital)} tone="success" icon={Banknote} />
            <Tile label="Soft-circled" value={money(lps.softCapital)} tone="muted" icon={Layers} />
            <Tile label="Going cold" value={lps.cold.length} tone={lps.cold.length ? 'warning' : 'success'} icon={Snowflake} />
          </div>
          <div className="grid grid-cols-2 gap-5">
            <Breakdown title="By archetype" items={lps.byArchetype} />
            <Breakdown title="By geography" items={lps.byGeo} />
          </div>
        </section>
      </div>

      {/* Relationship-intelligence band */}
      <section className="overflow-hidden rounded-2xl border border-valence-blue/20 bg-valence-blue-soft/40">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3.5">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/70 text-valence-blue ring-1 ring-valence-blue/20"><Users className="h-5 w-5" /></span>
            <div>
              <p className="text-sm font-semibold text-valence-text">Relationship intelligence</p>
              <p className="mt-0.5 text-[12px] text-valence-muted">
                <b className="text-valence-text tabular-nums">{captures.total}</b> interactions auto-captured this week
                <span className="mx-1.5 text-valence-subtle">·</span>
                <b className="text-valence-text tabular-nums">{lps.cold.length}</b> LP relationship{lps.cold.length === 1 ? '' : 's'} at risk
              </p>
            </div>
          </div>
          <Link to="/interactions" className="vl-btn-secondary-sm shrink-0">Open relationships <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      </section>

      {/* Needs you today */}
      {actions.length > 0 && (
        <section>
          <p className="vl-eyebrow-ink mb-3 inline-flex items-center gap-1.5"><Target className="h-3 w-3" /> Needs you today</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {actions.map((a, i) => (
              <Link key={i} to={a.to} className="group vl-card vl-card-hover flex items-center gap-3.5 p-4">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${toneBg(a.tone)}`}><a.icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-valence-text">{a.text}</p>
                  <p className="text-[11px] text-valence-subtle">{a.meta}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-valence-subtle transition group-hover:text-valence-blue" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {loading && <p className="text-center text-xs text-valence-subtle">Loading the firm…</p>}
    </div>
  )
}

const TINT = {
  blue:    'bg-valence-blue-soft text-valence-blue',
  violet:  'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
  emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  amber:   'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300'
}

function Kpi({ icon: Icon, tint = 'blue', label, value, sub, subTone = 'muted' }) {
  const st = subTone === 'danger' ? 'text-valence-danger' : subTone === 'success' ? 'text-valence-success' : 'text-valence-subtle'
  return (
    <div className="vl-card vl-card-hover p-5">
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${TINT[tint]}`}><Icon className="h-4 w-4" /></span>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-valence-muted">{label}</p>
      <p className="mt-1 font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-valence-text tabular-nums">{value}</p>
      {sub && <p className={`mt-2 text-[11px] font-medium ${st}`}>{sub}</p>}
    </div>
  )
}

function CardHead({ icon: Icon, tint = 'blue', title, subtitle, to, cta }) {
  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${TINT[tint]}`}><Icon className="h-5 w-5" /></span>
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-valence-text">{title}</h2>
          <p className="text-[12px] text-valence-muted">{subtitle}</p>
        </div>
      </div>
      <Link to={to} className="inline-flex items-center gap-1 text-xs font-semibold text-valence-blue hover:text-valence-blue-hover">{cta} <ArrowRight className="h-3 w-3" /></Link>
    </div>
  )
}

function Funnel({ funnel, gradLabel, gradCount, accent = 'blue' }) {
  const rows = [...funnel, { id: '_grad', label: gradLabel, count: gradCount, grad: true }]
  const max = Math.max(1, ...rows.map(r => r.count))
  const barCls = accent === 'emerald'
    ? 'bg-gradient-to-r from-emerald-400/60 to-emerald-500'
    : 'bg-gradient-to-r from-valence-blue/50 to-valence-blue'
  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.id} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-[11px] font-medium text-valence-muted truncate">{r.label}</span>
          <div className="relative h-6 flex-1 overflow-hidden rounded-lg bg-valence-surface">
            <div className={`h-full rounded-lg transition-all ${r.grad ? 'bg-valence-success' : barCls}`} style={{ width: `${Math.max(r.count > 0 ? 8 : 0, (r.count / max) * 100)}%` }} />
            <span className="absolute inset-y-0 right-2.5 flex items-center text-[11px] font-semibold tabular-nums text-valence-text">{r.count}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function Tile({ label, value, tone = 'muted', icon: Icon }) {
  const tc = tone === 'danger' ? 'text-valence-danger' : tone === 'success' ? 'text-valence-success' : tone === 'warning' ? 'text-valence-warning' : 'text-valence-text'
  return (
    <div className="rounded-xl bg-valence-surface px-3.5 py-3">
      <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-valence-muted"><Icon className="h-3 w-3" /> {label}</p>
      <p className={`mt-1.5 font-display text-xl font-bold tabular-nums ${tc}`}>{value}</p>
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
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-valence-surface"><div className="h-full rounded-full bg-valence-blue/50" style={{ width: `${(i.count / max) * 100}%` }} /></div>
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
function toneBg(tone) {
  if (tone === 'danger') return 'bg-valence-danger/10 text-valence-danger'
  if (tone === 'warning') return 'bg-valence-warning/10 text-valence-warning'
  if (tone === 'info') return 'bg-valence-blue-soft text-valence-blue'
  return 'bg-valence-surface text-valence-muted'
}
