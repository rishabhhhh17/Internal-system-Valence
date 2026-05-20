import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Building2, AlertTriangle, ChevronRight, X, UserCog, Plus } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import {
  getAdminConsumptionOverview,
  getOrgConsumptionDetail,
  planMetersAi,
  openCycle,
  PLANS
} from '../lib/billing.js'
import { getActiveOrgSeat, setActiveOrgSeat } from '../lib/aiMeter.js'
import { useToast } from '../components/Toast.jsx'

// Internal admin view — what every customer is burning. Shows actions,
// tokens, dollar cost we incurred, current cycle invoice, storage flags.
// Not customer-facing — link from somewhere internal-only.

function fmtUsd(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)
}

function fmtBytes(n) {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = Number(n), i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

function fmtInt(n) {
  return new Intl.NumberFormat('en-US').format(Number(n) || 0)
}

export default function AdminBilling() {
  const toast = useToast()
  const [rows, setRows]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [drawerOrg, setDrawerOrg] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actingAs, setActingAs] = useState(() => getActiveOrgSeat())
  const [seeding, setSeeding] = useState(false)

  async function load() {
    if (!isSupabaseConfigured) {
      setError('Supabase not configured — admin view needs a live DB.')
      setLoading(false)
      return
    }
    setLoading(true); setError(null)
    try {
      const data = await getAdminConsumptionOverview(supabase)
      setRows(data)
    } catch (e) {
      setError(e?.message || 'Failed to load admin overview')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Pick which org's seat the meter records against. Persisted via
  // aiMeter's localStorage so future page loads remember.
  async function actAs(orgId) {
    if (!orgId) { setActiveOrgSeat({ orgId: null, seatId: null }); setActingAs({ orgId: null, seatId: null }); return }
    // Resolve a default seat for the org so recordAiAction has a row to point at.
    const { data: seats } = await supabase
      .from('seats')
      .select('id')
      .eq('org_id', orgId)
      .eq('active', true)
      .limit(1)
    const seatId = seats?.[0]?.id || null
    if (!seatId) {
      toast.error('That org has no active seats — create one first.')
      return
    }
    setActiveOrgSeat({ orgId, seatId })
    setActingAs({ orgId, seatId })
    const org = rows.find(r => r.orgId === orgId)
    toast.success(`Now acting as ${org?.orgName || orgId}. AI calls will record into this org.`)
  }

  // Create a test customer end-to-end so the admin dashboard has
  // something to drive against without going through the onboarding
  // route. Two seats + an open cycle + sets actingAs to the new org.
  async function seedTestOrg() {
    setSeeding(true)
    try {
      const stamp = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short' })
      const { data: org, error: orgErr } = await supabase
        .from('orgs')
        .insert({ name: `Test customer · ${stamp}`, plan: 'we_run_ai', cycle_anchor_day: 1 })
        .select()
        .single()
      if (orgErr) throw orgErr
      const { data: seats, error: seatErr } = await supabase
        .from('seats')
        .insert([
          { org_id: org.id, email: 'partner@test.example',  billable_from: '2020-01-01' },
          { org_id: org.id, email: 'analyst@test.example',  billable_from: '2020-01-01' }
        ])
        .select()
      if (seatErr) throw seatErr
      await openCycle(supabase, org.id)
      setActiveOrgSeat({ orgId: org.id, seatId: seats[0].id })
      setActingAs({ orgId: org.id, seatId: seats[0].id })
      toast.success(`Created ${org.name} · 2 seats · acting as them now.`)
      await load()
    } catch (err) {
      toast.error(err?.message || 'Seed failed')
    } finally {
      setSeeding(false)
    }
  }

  async function openDrawer(org) {
    setDrawerOrg(org)
    setDetail(null)
    setDetailLoading(true)
    try {
      const d = await getOrgConsumptionDetail(supabase, org.orgId)
      setDetail(d)
    } catch (e) {
      setError(e?.message || 'Failed to load org detail')
    } finally {
      setDetailLoading(false)
    }
  }

  function closeDrawer() {
    setDrawerOrg(null); setDetail(null)
  }

  // Org-level totals across the visible table
  const totals = rows.reduce((acc, r) => ({
    customers:   acc.customers + 1,
    seats:       acc.seats + (r.seatCount || 0),
    actions:     acc.actions + (r.aiActionsTotal || 0),
    tokens:      acc.tokens + (r.aiTokensUsed || 0),
    providerCost: acc.providerCost + (r.aiEstimatedCostUsd || 0),
    invoice:     acc.invoice + (r.cycleInvoiceUsd || 0)
  }), { customers: 0, seats: 0, actions: 0, tokens: 0, providerCost: 0, invoice: 0 })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="vl-eyebrow-ink">Admin · Internal</p>
          <h1 className="font-display text-feature font-bold text-valence-text">Consumption</h1>
          <p className="text-xs text-valence-muted mt-1">
            What every customer is burning — AI actions, tokens, our provider cost, their cycle invoice, storage. Not customer-facing.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="vl-btn-secondary-sm">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-valence-danger">{error}</div>
      )}

      {/* Acting-as switcher — the meter records every Gemini call into
          whichever org is selected here. Without auth wired yet this is
          our manual way to drive the dashboard. */}
      <div className="vl-card p-4 flex flex-wrap items-center gap-3">
        <span className="vl-eyebrow-ink inline-flex items-center gap-1.5 shrink-0">
          <UserCog className="h-3 w-3 text-valence-blue" /> Acting as
        </span>
        <select
          value={actingAs.orgId || ''}
          onChange={e => actAs(e.target.value || null)}
          className="h-8 rounded-md border border-valence-border bg-valence-elevated px-2.5 text-xs text-valence-text focus:border-valence-blue outline-none flex-1 min-w-[200px]"
        >
          <option value="">— Not acting as any org (meter off) —</option>
          {rows.map(r => (
            <option key={r.orgId} value={r.orgId}>
              {r.orgName} · {r.plan} · {r.seatCount} seat{r.seatCount === 1 ? '' : 's'}
            </option>
          ))}
        </select>
        <button
          onClick={seedTestOrg}
          disabled={seeding}
          className="vl-btn-secondary-sm shrink-0"
          title="Create a test customer end-to-end (org + 2 seats + open cycle) and become them"
        >
          {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Seed test customer
        </button>
        {actingAs.orgId && (
          <p className="text-[11px] text-valence-muted basis-full">
            Every AI call you make now (Ask, Deal Brief, Meeting Summary, etc.) records into this org's billing cycle and shows up in the table below.
          </p>
        )}
      </div>

      {/* Top-line totals — sum across every org */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Stat label="Customers"        value={fmtInt(totals.customers)} />
        <Stat label="Total seats"      value={fmtInt(totals.seats)} />
        <Stat label="AI actions"       value={fmtInt(totals.actions)} />
        <Stat label="Tokens"           value={fmtInt(totals.tokens)} />
        <Stat label="Our provider $"   value={fmtUsd(totals.providerCost)} tone="danger" hint="What WE pay AI providers" />
        <Stat label="Cycle billed $"   value={fmtUsd(totals.invoice)} tone="primary" hint="What customers owe this cycle" />
      </div>

      {loading ? (
        <div className="vl-card p-8 text-center text-xs text-valence-muted">
          <Loader2 className="h-4 w-4 mx-auto animate-spin mb-2" /> Loading customers…
        </div>
      ) : rows.length === 0 ? (
        <div className="vl-card p-8 text-center text-xs text-valence-muted">
          No orgs yet. Create the first one via SQL or the (future) onboarding flow.
        </div>
      ) : (
        <div className="vl-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-[0.14em] text-valence-subtle">
              <tr className="border-b border-valence-border">
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-left">Plan</th>
                <th className="px-3 py-2 text-right">Seats</th>
                <th className="px-3 py-2 text-right">AI actions</th>
                <th className="px-3 py-2 text-right">Tokens</th>
                <th className="px-3 py-2 text-right">Our $ cost</th>
                <th className="px-3 py-2 text-right">Cycle billed</th>
                <th className="px-3 py-2 text-right">Storage</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const overFraction = r.aiAllowanceTotal > 0 ? r.aiActionsTotal / r.aiAllowanceTotal : 0
                const meter = Math.min(1, overFraction)
                return (
                  <tr key={r.orgId} className="border-b border-valence-border/40 hover:bg-valence-surface/40 transition cursor-pointer" onClick={() => openDrawer(r)}>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-valence-text">
                        <Building2 className="h-3.5 w-3.5 text-valence-blue" />
                        {r.orgName}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <PlanChip plan={r.plan} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.seatCount)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {planMetersAi(r.plan) ? (
                        <div className="inline-flex flex-col items-end gap-0.5 min-w-[110px]">
                          <span className="tabular-nums text-valence-text">
                            {fmtInt(r.aiActionsTotal)}<span className="text-valence-subtle"> / {fmtInt(r.aiAllowanceTotal)}</span>
                          </span>
                          <span className="block w-full h-1 rounded bg-valence-surface overflow-hidden">
                            <span className={`block h-full ${overFraction >= 1 ? 'bg-valence-danger' : overFraction >= 0.8 ? 'bg-valence-warning' : 'bg-valence-blue'}`} style={{ width: `${meter * 100}%` }} />
                          </span>
                          {r.aiActionsOverage > 0 && (
                            <span className="text-[9px] text-valence-danger">+{fmtInt(r.aiActionsOverage)} overage</span>
                          )}
                        </div>
                      ) : <span className="text-valence-subtle">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-valence-muted">
                      {r.aiTokensUsed ? fmtInt(r.aiTokensUsed) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-valence-danger">
                      {r.aiEstimatedCostUsd ? fmtUsd(r.aiEstimatedCostUsd) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-valence-text">
                      {fmtUsd(r.cycleInvoiceUsd)}
                      {r.cycleFloorApplied && <span className="ml-1 text-[9px] text-valence-warning">FLOOR</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className="text-valence-muted">{fmtBytes(r.storageBytes)}</span>
                      {r.storageReviewFlagged && (
                        <span className="ml-1 inline-flex items-center gap-1 text-[9px] font-semibold text-valence-warning">
                          <AlertTriangle className="h-2.5 w-2.5" /> review
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <ChevronRight className="h-3.5 w-3.5 text-valence-subtle" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {drawerOrg && (
        <OrgDetailDrawer org={drawerOrg} detail={detail} loading={detailLoading} onClose={closeDrawer} />
      )}
    </div>
  )
}

function Stat({ label, value, tone = 'neutral', hint }) {
  const toneClass = tone === 'danger'
    ? 'border-valence-danger/30 bg-valence-danger/5'
    : tone === 'primary'
    ? 'border-valence-blue/30 bg-valence-blue-soft/30'
    : 'border-valence-border bg-valence-elevated'
  return (
    <div className={`rounded-lg border ${toneClass} px-3 py-2.5`}>
      <p className="text-[10px] uppercase tracking-[0.12em] text-valence-subtle">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-valence-text">{value}</p>
      {hint && <p className="text-[10px] text-valence-subtle mt-0.5">{hint}</p>}
    </div>
  )
}

function PlanChip({ plan }) {
  const map = {
    [PLANS.WE_RUN_AI]: { label: 'We run AI', cls: 'border-valence-blue/40 bg-valence-blue-soft text-valence-blue-deep' },
    [PLANS.BYO_KEY]:   { label: 'BYO key',   cls: 'border-valence-border bg-valence-surface text-valence-muted' },
    [PLANS.OWN_KEY]:   { label: 'Own key',   cls: 'border-valence-border bg-valence-surface text-valence-muted' }
  }
  const m = map[plan] || { label: plan || '—', cls: 'border-valence-border bg-valence-surface text-valence-muted' }
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0 text-[10px] font-semibold ${m.cls}`}>{m.label}</span>
}

function OrgDetailDrawer({ org, detail, loading, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-valence-ink/30 backdrop-blur-sm" />
      <div className="relative ml-auto h-full w-full max-w-md bg-valence-elevated border-l border-valence-border shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between px-5 py-3 bg-valence-elevated border-b border-valence-border">
          <div>
            <p className="vl-eyebrow-ink">Customer detail</p>
            <h2 className="text-base font-semibold text-valence-text">{org.orgName}</h2>
          </div>
          <button onClick={onClose} className="vl-btn-ghost"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Plan"        value={<PlanChip plan={org.plan} />} />
            <Stat label="Seats"       value={fmtInt(org.seatCount)} />
            <Stat label="Cycle billed" value={fmtUsd(org.cycleInvoiceUsd)} tone="primary" />
            <Stat label="Our provider $" value={fmtUsd(org.aiEstimatedCostUsd)} tone="danger" />
          </div>

          {loading ? (
            <div className="text-xs text-valence-muted text-center py-6">
              <Loader2 className="h-4 w-4 mx-auto animate-spin" />
            </div>
          ) : !detail ? (
            <p className="text-xs text-valence-muted">No detail.</p>
          ) : !detail.cycle ? (
            <p className="text-xs text-valence-muted">No open cycle for this org yet.</p>
          ) : (
            <>
              <div>
                <p className="vl-eyebrow-ink">Invoice lines · {detail.cycle.period_start} → {detail.cycle.period_end}</p>
                {detail.lines.length === 0 ? (
                  <p className="text-xs text-valence-muted mt-2">No lines yet.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-valence-border/60 rounded-lg border border-valence-border">
                    {detail.lines.map(l => (
                      <li key={l.id} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold text-valence-text truncate">{l.description}</p>
                          <p className="text-[10px] text-valence-subtle">{l.kind}</p>
                        </div>
                        <span className="tabular-nums font-semibold text-valence-text">{fmtUsd(l.amount_usd)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs font-semibold text-valence-text text-right">
                  Total: {fmtUsd(detail.invoiceTotalUsd)}
                </p>
              </div>

              <div>
                <p className="vl-eyebrow-ink">Recent AI calls (last 50)</p>
                {detail.recentActions.length === 0 ? (
                  <p className="text-xs text-valence-muted mt-2">No AI calls recorded yet.</p>
                ) : (
                  <ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-valence-border/60 rounded-lg border border-valence-border">
                    {detail.recentActions.map(a => (
                      <li key={a.id} className="px-3 py-1.5 flex items-center justify-between gap-2 text-[11px]">
                        <span className="min-w-0">
                          <span className={`mr-1.5 inline-flex items-center px-1 rounded text-[9px] font-semibold ${a.classification === 'overage' ? 'bg-valence-danger/10 text-valence-danger' : 'bg-valence-blue-soft text-valence-blue-deep'}`}>
                            {a.classification}
                          </span>
                          <span className="text-valence-text">{a.action_type || 'action'}</span>
                        </span>
                        <span className="text-valence-muted tabular-nums shrink-0">
                          {a.tokens_used ? `${fmtInt(a.tokens_used)} tok` : ''}
                          {a.estimated_cost_usd ? ` · ${fmtUsd(a.estimated_cost_usd)}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
