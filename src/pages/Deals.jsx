import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  Plus, Search, Briefcase, FileText, ExternalLink, Edit3, Trash2,
  Filter as FilterIcon, Circle, Table as TableIcon, LayoutGrid, TrendingUp,
  Mail, Users as UsersIcon, FolderOpen, Activity as ActivityIcon, Sparkles, Info, Download,
  ListChecks, MessageSquare, UserCircle
} from 'lucide-react'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import { logActivity } from '../lib/activity.js'
import { STAGES, STAGE_IDS, stageMeta, stageToneClasses, ACTIVE_STAGES } from '../lib/stages.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import Drawer from '../components/Drawer.jsx'
import Modal from '../components/Modal.jsx'
import EmptyState from '../components/EmptyState.jsx'
import DealKanban from '../components/DealKanban.jsx'
import FileVault from '../components/FileVault.jsx'
import Contacts from '../components/Contacts.jsx'
import ActivityTimeline from '../components/ActivityTimeline.jsx'
import DealBrief from '../components/DealBrief.jsx'
import EmailComposer from '../components/EmailComposer.jsx'
import SimilarDeals from '../components/SimilarDeals.jsx'
import TeaserImport from '../components/TeaserImport.jsx'
import CIMGenerator from '../components/CIMGenerator.jsx'
import TargetList from '../components/TargetList.jsx'
import FinancialsCard from '../components/FinancialsCard.jsx'
import ShareManager from '../components/ShareManager.jsx'
import GmailSyncButton from '../components/GmailSyncButton.jsx'
import StageGate from '../components/StageGate.jsx'
import DealTeam from '../components/DealTeam.jsx'
import DealComments from '../components/DealComments.jsx'
import ConflictBanner from '../components/ConflictBanner.jsx'
import { useToast } from '../components/Toast.jsx'
import { useConfirm } from '../components/ConfirmDialog.jsx'
import { useCurrency } from '../hooks/useCurrency.jsx'

const NDA    = ['Signed', 'Pending', 'Not Required']
const TYPES  = ['M&A', 'ECM', 'PE/VC', 'DCM']
const SIDES  = ['Buy-side', 'Sell-side', 'Advisory']

const SECTORS = [
  'Healthcare','BFSI','Fintech','Infrastructure','Consumer','Consumer Tech',
  'EdTech','Energy','Real Estate','Logistics','Technology','Other'
]

const demo = [
  { id: 'd1', client_name: 'Nimbus Health',    deal_type: 'M&A',   stage: 'Diligence',   nda_status: 'Signed',      side: 'Sell-side', sector: 'Healthcare',     ticket_size_usd_m: 180, fee_retainer_usd: 50000, fee_success_pct: 1.75, target_close: '2026-07-01', lead_owner: 'Neha Jain',    deck_url: 'https://example.com/nimbus.pdf',  notes: 'Founders open to strategic exit; EBITDA ~12M.', created_at: new Date().toISOString() },
  { id: 'd2', client_name: 'Arclight Capital', deal_type: 'PE/VC', stage: 'Origination', nda_status: 'Pending',     side: 'Buy-side',  sector: 'Infrastructure', ticket_size_usd_m: 120, fee_retainer_usd: null,  fee_success_pct: 2.00, target_close: '2026-08-15', lead_owner: 'Rohan Gupta',  deck_url: null,                              notes: 'Early conversations. Thesis fit on Series B infra.', created_at: new Date().toISOString() },
  { id: 'd3', client_name: 'Quantum Edge',     deal_type: 'ECM',   stage: 'Marketing',   nda_status: 'Signed',      side: 'Sell-side', sector: 'Fintech',        ticket_size_usd_m: 250, fee_retainer_usd: 75000, fee_success_pct: 2.50, target_close: '2026-06-10', lead_owner: 'Arjun Mehta',  deck_url: 'https://example.com/qedge.pdf',   notes: 'Pre-IPO roadshow kicking off Q2.', created_at: new Date().toISOString() },
  { id: 'd4', client_name: 'Helios Infra',     deal_type: 'DCM',   stage: 'Closed',      nda_status: 'Signed',      side: 'Sell-side', sector: 'Infrastructure', ticket_size_usd_m: 150, fee_retainer_usd: 40000, fee_success_pct: 0.80, target_close: '2026-03-20', lead_owner: 'Rishi Kapoor', deck_url: 'https://example.com/helios.pdf',  notes: 'INR 1,200 Cr bond issuance closed last week.', created_at: new Date().toISOString() },
  { id: 'd5', client_name: 'LumenAI',          deal_type: 'PE/VC', stage: 'On Hold',     nda_status: 'Signed',      side: 'Sell-side', sector: 'Consumer Tech',  ticket_size_usd_m:  45, fee_retainer_usd: 25000, fee_success_pct: 3.00, target_close: '2026-10-01', lead_owner: 'Vikram Patel', deck_url: null,                              notes: 'Waiting on updated financials before next round.', created_at: new Date().toISOString() },
  { id: 'd6', client_name: 'Kavya Foods',      deal_type: 'M&A',   stage: 'Pitch',       nda_status: 'Not Required',side: 'Sell-side', sector: 'Consumer',       ticket_size_usd_m:  80, fee_retainer_usd: null,  fee_success_pct: 2.00, target_close: '2026-09-10', lead_owner: 'Priya Sharma', deck_url: null,                              notes: 'Family business — first contact made.', created_at: new Date().toISOString() },
  { id: 'd7', client_name: 'Meridian EdTech',  deal_type: 'PE/VC', stage: 'Negotiation', nda_status: 'Signed',      side: 'Sell-side', sector: 'EdTech',         ticket_size_usd_m:  35, fee_retainer_usd: 20000, fee_success_pct: 3.50, target_close: '2026-07-20', lead_owner: 'Ananya Roy',   deck_url: null,                              notes: 'Series C. 5 funds in diligence; shortlist of 2.', created_at: new Date().toISOString() },
  { id: 'd8', client_name: 'Polaris Energy',   deal_type: 'DCM',   stage: 'Preparation', nda_status: 'Signed',      side: 'Sell-side', sector: 'Energy',         ticket_size_usd_m: 200, fee_retainer_usd: 60000, fee_success_pct: 1.25, target_close: '2026-06-05', lead_owner: 'Karan Singh',  deck_url: null,                              notes: 'USD notes issuance. Investor docs in review.', created_at: new Date().toISOString() },
  { id: 'd9', client_name: 'Veda Biotech',     deal_type: 'M&A',   stage: 'Mandate',     nda_status: 'Signed',      side: 'Sell-side', sector: 'Healthcare',     ticket_size_usd_m:  65, fee_retainer_usd: 30000, fee_success_pct: 2.75, target_close: '2026-08-05', lead_owner: 'Neha Jain',    deck_url: null,                              notes: 'Engagement letter signed last week. Teaser drafting.', created_at: new Date().toISOString() },
  { id: 'd10', client_name: 'Orion Realty',    deal_type: 'PE/VC', stage: 'Closing',     nda_status: 'Signed',      side: 'Buy-side',  sector: 'Real Estate',    ticket_size_usd_m: 320, fee_retainer_usd: 80000, fee_success_pct: 1.50, target_close: '2026-05-12', lead_owner: 'Vikram Patel', deck_url: null,                              notes: 'Term sheet agreed. Final SPA negotiations.', created_at: new Date().toISOString() }
]

export default function Deals() {
  const toast = useToast()
  const confirm = useConfirm()
  const { money } = useCurrency()
  const [params, setParams] = useSearchParams()
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [q, setQ] = useState('')
  const [fStage, setFStage] = useState('All')
  const [fType, setFType]   = useState('All')
  const [fNda, setFNda]     = useState('All')
  const [fSide, setFSide]   = useState('All')
  const [view, setView]     = useState('board') // 'board' | 'table'

  const [drawer, setDrawer] = useState(null)
  const [modal, setModal]   = useState(null) // null | 'new' | {edit: deal}
  const [composer, setComposer] = useState(null) // { deal, contact }

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!isSupabaseConfigured) return
    return subscribeTable('deals', load)
  }, [])

  // Keep the drawer's deal object in sync when the underlying data changes
  useEffect(() => {
    if (!drawer) return
    const fresh = deals.find(d => d.id === drawer.id)
    if (fresh && fresh !== drawer) setDrawer(fresh)
    if (!fresh && deals.length > 0) setDrawer(null)
  }, [deals])

  // Deep-link from Command Palette: /deals?open=<id>
  useEffect(() => {
    const id = params.get('open')
    if (!id || deals.length === 0) return
    const d = deals.find(x => x.id === id)
    if (d) {
      setDrawer(d)
      const next = new URLSearchParams(params); next.delete('open'); setParams(next, { replace: true })
    }
  }, [params, deals])

  async function load() {
    setLoading(true)
    setLoadError(null)
    if (!isSupabaseConfigured) {
      setDeals(demo); setLoading(false); return
    }
    try {
      // Race the Supabase fetch against a 10s timeout so the skeleton never hangs.
      const fetchPromise = supabase.from('deals').select('*').order('created_at', { ascending: false })
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out — check your connection or Supabase status.')), 10_000)
      )
      const { data, error } = await Promise.race([fetchPromise, timeoutPromise])
      if (error) throw error
      setDeals(data || [])
    } catch (err) {
      console.error(err)
      setLoadError(err?.message || 'Couldn\'t load deals.')
      setDeals([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return deals.filter(d =>
      (fStage === 'All' || d.stage === fStage) &&
      (fType  === 'All' || d.deal_type === fType) &&
      (fNda   === 'All' || d.nda_status === fNda) &&
      (fSide  === 'All' || d.side === fSide) &&
      (!needle ||
        d.client_name.toLowerCase().includes(needle) ||
        (d.notes   || '').toLowerCase().includes(needle) ||
        (d.sector  || '').toLowerCase().includes(needle) ||
        (d.lead_owner || '').toLowerCase().includes(needle))
    )
  }, [deals, q, fStage, fType, fNda, fSide])

  const metrics = useMemo(() => {
    const active = deals.filter(d => !stageMeta(d.stage).terminal)
    const pipelineValue = active.reduce((s, d) => s + (Number(d.ticket_size_usd_m) || 0), 0)
    const closed = deals.filter(d => d.stage === 'Closed')
    const closedValue = closed.reduce((s, d) => s + (Number(d.ticket_size_usd_m) || 0), 0)
    return {
      total: deals.length,
      active: active.length,
      closed: closed.length,
      pipelineValue,
      closedValue
    }
  }, [deals])

  async function saveDeal(payload, id) {
    if (!isSupabaseConfigured) {
      setDeals(prev => id
        ? prev.map(d => d.id === id ? { ...d, ...payload } : d)
        : [{ id: `local-${Date.now()}`, created_at: new Date().toISOString(), ...payload }, ...prev])
      setModal(null)
      toast.success(id ? 'Deal updated.' : 'Deal logged.')
      return
    }
    if (id) {
      const { error } = await supabase.from('deals').update(payload).eq('id', id)
      if (error) return toast.error(error.message)
      await logActivity({ dealId: id, kind: 'note', body: 'Deal details updated.' })
      toast.success('Deal updated.')
    } else {
      const { data, error } = await supabase.from('deals').insert(payload).select().single()
      if (error) return toast.error(error.message)
      await logActivity({ dealId: data.id, kind: 'created', body: `${payload.deal_type} · ${payload.side || 'Advisory'}` })
      toast.success(`${payload.client_name} logged.`)
    }
    setModal(null)
    load()
  }

  async function deleteDeal(deal) {
    const ok = await confirm({
      title: 'Delete this deal?',
      body: `${deal.client_name} — this will permanently remove the deal, its files, counterparties, and activity timeline.`,
      destructive: true,
      confirmLabel: 'Delete deal'
    })
    if (!ok) return
    if (!isSupabaseConfigured) {
      setDeals(prev => prev.filter(d => d.id !== deal.id))
    } else {
      const { error } = await supabase.from('deals').delete().eq('id', deal.id)
      if (error) return toast.error(error.message)
      load()
    }
    setDrawer(null)
    toast.success(`${deal.client_name} deleted.`)
  }

  async function changeStage(id, newStage) {
    const deal = deals.find(d => d.id === id)
    if (!deal || deal.stage === newStage) return
    // Optimistic
    setDeals(prev => prev.map(d => d.id === id ? { ...d, stage: newStage } : d))
    if (!isSupabaseConfigured) return
    const { error } = await supabase.from('deals').update({ stage: newStage }).eq('id', id)
    if (error) {
      toast.error(error.message); load(); return
    }
    await logActivity({ dealId: id, kind: 'stage_change', body: `${deal.stage} → ${newStage}` })
    toast.success(`${deal.client_name} → ${newStage}`)
  }

  return (
    <div className="space-y-6">
      <ConfigBanner />

      {/* Pipeline metrics */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <BigStat label="Pipeline value" value={money(metrics.pipelineValue)} sub={`${metrics.active} active deal${metrics.active === 1 ? '' : 's'}`} accent icon={TrendingUp} />
        <BigStat label="Closed value"   value={money(metrics.closedValue)} sub={`${metrics.closed} closed`} icon={Briefcase} />
        <BigStat label="Active funnel"  value={metrics.active} sub="Currently in play" icon={ActivityIcon} />
        <BigStat label="Total mandates" value={metrics.total} sub="All-time" icon={FolderOpen} />
      </div>

      {/* Toolbar */}
      <div className="vl-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-1 min-w-[240px] items-center gap-2 rounded-lg border border-valence-border bg-valence-surface px-3 py-2">
            <Search className="h-3.5 w-3.5 text-valence-subtle" />
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search by client, sector, lead, or notes…"
              className="flex-1 bg-transparent text-sm text-valence-text placeholder:text-valence-subtle outline-none"
            />
          </div>

          <FilterPill label="Stage" value={fStage} onChange={setFStage} options={STAGE_IDS} />
          <FilterPill label="Type"  value={fType}  onChange={setFType}  options={TYPES} />
          <FilterPill label="Side"  value={fSide}  onChange={setFSide}  options={SIDES} />
          <FilterPill label="NDA"   value={fNda}   onChange={setFNda}   options={NDA} />

          <div className="flex items-center rounded-lg border border-valence-border bg-valence-surface p-0.5">
            <button onClick={() => setView('board')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${view === 'board' ? 'bg-valence-blue-soft text-valence-text' : 'text-valence-muted hover:text-valence-text'}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Board
            </button>
            <button onClick={() => setView('table')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${view === 'table' ? 'bg-valence-blue-soft text-valence-text' : 'text-valence-muted hover:text-valence-text'}`}>
              <TableIcon className="h-3.5 w-3.5" /> Table
            </button>
          </div>

          <button onClick={() => exportCSV(filtered)} className="vl-btn-secondary" title="Download filtered pipeline as CSV">
            <Download className="h-4 w-4" /> Export
          </button>
          <button onClick={() => setModal('new')} className="vl-btn-primary">
            <Plus className="h-4 w-4" /> New deal
          </button>
        </div>
      </div>

      {/* Main content */}
      {loading ? (
        <TableSkeleton />
      ) : loadError ? (
        <EmptyState
          icon={Briefcase}
          title="Couldn't load deals"
          description={loadError}
          action={<button onClick={load} className="vl-btn-primary">Retry</button>}
        />
      ) : deals.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No deals yet"
          description="Log your first mandate to populate the pipeline."
          action={<button onClick={() => setModal('new')} className="vl-btn-primary"><Plus className="h-4 w-4" /> New deal</button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No deals match your filters"
          description="Try clearing a filter, or log your first mandate."
          action={<button onClick={() => setModal('new')} className="vl-btn-primary"><Plus className="h-4 w-4" /> New deal</button>}
        />
      ) : view === 'board' ? (
        <DealKanban deals={filtered} onOpen={setDrawer} onStageChange={changeStage} />
      ) : (
        <DealTable deals={filtered} onOpen={setDrawer} />
      )}

      {/* Drawer with tabs */}
      <Drawer
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        title={drawer?.client_name || ''}
      >
        {drawer && (
          <DealDrawerBody
            deal={drawer}
            onEdit={() => setModal({ edit: drawer })}
            onDelete={() => deleteDeal(drawer)}
            onComposeEmail={(contact) => setComposer({ deal: drawer, contact })}
          />
        )}
      </Drawer>

      {/* New / edit modal */}
      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title={modal?.edit ? 'Edit deal' : 'New deal'}
        description={modal?.edit ? 'Update the details of this mandate.' : 'Log a new mandate into the pipeline.'}
        size="xl"
      >
        <DealForm
          initial={modal?.edit}
          onCancel={() => setModal(null)}
          onSubmit={(payload) => saveDeal(payload, modal?.edit?.id)}
        />
      </Modal>

      {/* Email composer */}
      <EmailComposer
        open={Boolean(composer)}
        onClose={() => setComposer(null)}
        deal={composer?.deal}
        contact={composer?.contact}
      />
    </div>
  )
}

// ============ DRAWER BODY ============
function DealDrawerBody({ deal, onEdit, onDelete, onComposeEmail }) {
  const [tab, setTab] = useState('overview')
  const tabRefs = useRef({})
  const tabs = [
    { id: 'overview',   label: 'Overview',       icon: Briefcase },
    { id: 'gate',       label: 'Checklist',      icon: ListChecks },
    { id: 'team',       label: 'Deal team',      icon: UserCircle },
    { id: 'financials', label: 'Financials',     icon: TrendingUp },
    { id: 'files',      label: 'Files',          icon: FolderOpen },
    { id: 'contacts',   label: 'Counterparties', icon: UsersIcon },
    { id: 'activity',   label: 'Activity',       icon: ActivityIcon },
    { id: 'comments',   label: 'Discussion',     icon: MessageSquare },
    { id: 'similar',    label: 'Similar',        icon: Sparkles },
    { id: 'targets',    label: 'Targets',        icon: UsersIcon },
    { id: 'cim',        label: 'CIM',            icon: FileText },
    { id: 'brief',      label: 'AI Brief',       icon: Sparkles },
    { id: 'share',      label: 'Share',          icon: ExternalLink }
  ]

  useEffect(() => {
    tabRefs.current[tab]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [tab])

  return (
    <div className="space-y-5">
      <DealHeader deal={deal} onEdit={onEdit} onDelete={onDelete} onCompose={() => onComposeEmail(null)} />

      <div className="relative">
        <div className="flex items-center gap-1 rounded-lg border border-valence-border bg-valence-surface p-1 overflow-x-auto scrollbar-hide">
          {tabs.map(t => (
            <button
              key={t.id}
              ref={el => (tabRefs.current[t.id] = el)}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                tab === t.id ? 'bg-white text-valence-text shadow-sm' : 'text-valence-muted hover:text-valence-text'
              }`}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>
        {/* Edge fades so users know the tab list scrolls */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent" aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent" aria-hidden />
      </div>

      <div>
        {tab === 'overview'   && <DealOverview deal={deal} />}
        {tab === 'gate'       && <StageGate deal={deal} />}
        {tab === 'team'       && <DealTeam deal={deal} />}
        {tab === 'financials' && <FinancialsCard deal={deal} />}
        {tab === 'files'      && <FileVault dealId={deal.id} />}
        {tab === 'contacts'   && <Contacts dealId={deal.id} onOpenComposer={onComposeEmail} />}
        {tab === 'activity'   && <ActivityTimeline dealId={deal.id} />}
        {tab === 'comments'   && <DealComments deal={deal} />}
        {tab === 'similar'    && <SimilarDeals deal={deal} />}
        {tab === 'targets'    && <TargetList deal={deal} />}
        {tab === 'cim'        && <CIMGenerator deal={deal} />}
        {tab === 'brief'      && <DealBrief deal={deal} />}
        {tab === 'share'      && <ShareManager deal={deal} />}
      </div>
    </div>
  )
}

function DealHeader({ deal, onEdit, onDelete, onCompose }) {
  const meta = stageMeta(deal.stage)
  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/20">
          <Briefcase className="h-5 w-5 text-valence-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${stageToneClasses(deal.stage)}`} title={meta.desc}>
              {deal.stage}
            </span>
            <span className="vl-chip">{deal.deal_type}</span>
            {deal.side && <span className="vl-chip">{deal.side}</span>}
            <NdaBadge status={deal.nda_status} />
          </div>
          <p className="mt-1 text-[11px] text-valence-muted" title={meta.desc}>
            <Info className="inline h-3 w-3 mr-1 -mt-0.5" />
            {meta.desc}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <GmailSyncButton dealId={deal.id} />
          <button onClick={onEdit} className="vl-btn-ghost" aria-label="Edit"><Edit3 className="h-4 w-4" /></button>
          <button onClick={onDelete} className="vl-btn-ghost text-valence-subtle hover:text-valence-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  )
}

function DealOverview({ deal }) {
  const money = deal.ticket_size_usd_m ? `$${Number(deal.ticket_size_usd_m).toLocaleString()}M` : '—'
  const fee = [
    deal.fee_retainer_usd  ? `$${Number(deal.fee_retainer_usd).toLocaleString()} retainer` : null,
    deal.fee_success_pct   ? `${deal.fee_success_pct}% success` : null
  ].filter(Boolean).join(' + ') || '—'
  const progressDeals = ACTIVE_STAGES.findIndex(s => s.id === deal.stage)
  const progress = progressDeals >= 0 ? ((progressDeals + 1) / ACTIVE_STAGES.length) * 100 : 0

  return (
    <div className="space-y-5">
      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-valence-muted">Pipeline progress</span>
          <span className="text-valence-muted">{stageMeta(deal.stage).terminal ? deal.stage : `${Math.round(progress)}%`}</span>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-valence-surface overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${stageMeta(deal.stage).terminal
              ? (deal.stage === 'Closed' ? 'bg-valence-success' : deal.stage === 'Lost' ? 'bg-valence-danger' : 'bg-valence-warning')
              : 'bg-gradient-to-r from-valence-blue/50 to-valence-blue'}`}
            style={{ width: stageMeta(deal.stage).terminal ? '100%' : `${progress}%` }}
          />
        </div>
      </div>

      {/* Grid of fields */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sector"         value={deal.sector || '—'} />
        <Field label="Lead owner"     value={deal.lead_owner || '—'} />
        <Field label="Deal size"      value={money} accent />
        <Field label="Fee structure"  value={fee} />
        <Field label="Target close"   value={deal.target_close ? format(parseISO(deal.target_close), 'd MMM yyyy') : '—'} />
        <Field label="Logged"         value={format(new Date(deal.created_at), 'd MMM yyyy')} />
      </div>

      <div>
        <p className="vl-label">Notes</p>
        <p className="whitespace-pre-wrap rounded-lg border border-valence-border bg-valence-surface px-4 py-3 text-sm leading-relaxed text-valence-text">
          {deal.notes || <span className="text-valence-subtle">No notes yet.</span>}
        </p>
      </div>

      {deal.deck_url && (
        <div>
          <p className="vl-label">Linked deck</p>
          <a href={deal.deck_url} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-2 rounded-lg border border-valence-border bg-valence-surface px-4 py-2.5 text-sm font-semibold text-valence-blue hover:border-valence-blue/40">
            <FileText className="h-4 w-4" /> Open deck <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, accent = false }) {
  return (
    <div className={`rounded-lg border border-valence-border ${accent ? 'bg-valence-blue-soft/40' : 'bg-valence-surface'} px-3 py-2.5`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-valence-muted">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${accent ? 'text-valence-text' : 'text-valence-text'}`}>{value}</p>
    </div>
  )
}

// ============ TABLE VIEW ============
function DealTable({ deals, onOpen }) {
  return (
    <div className="vl-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-valence-border text-left text-[11px] font-semibold uppercase tracking-wider text-valence-muted">
              <th className="px-5 py-3.5">Client</th>
              <th className="px-5 py-3.5">Stage</th>
              <th className="px-5 py-3.5">Type</th>
              <th className="px-5 py-3.5">Side</th>
              <th className="px-5 py-3.5">Sector</th>
              <th className="px-5 py-3.5">Size</th>
              <th className="px-5 py-3.5">Lead</th>
              <th className="px-5 py-3.5">NDA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-valence-border">
            {deals.map(d => (
              <tr key={d.id} onClick={() => onOpen(d)} className="cursor-pointer transition hover:bg-valence-surface">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-valence-blue-soft ring-1 ring-valence-blue/20">
                      <Briefcase className="h-4 w-4 text-valence-blue" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-valence-text">{d.client_name}</p>
                      <p className="text-[11px] text-valence-muted line-clamp-1 max-w-[260px]">{d.notes || '—'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${stageToneClasses(d.stage)}`} title={stageMeta(d.stage).desc}>
                    {d.stage}
                  </span>
                </td>
                <td className="px-5 py-4"><span className="vl-chip">{d.deal_type}</span></td>
                <td className="px-5 py-4 text-xs text-valence-muted">{d.side || '—'}</td>
                <td className="px-5 py-4 text-xs text-valence-muted">{d.sector || '—'}</td>
                <td className="px-5 py-4 text-xs font-semibold text-valence-blue">{d.ticket_size_usd_m ? money(d.ticket_size_usd_m) : '—'}</td>
                <td className="px-5 py-4 text-xs text-valence-muted">{d.lead_owner || '—'}</td>
                <td className="px-5 py-4"><NdaBadge status={d.nda_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============ FORM ============
function DealForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    client_name:      initial?.client_name      || '',
    deal_type:        initial?.deal_type        || 'M&A',
    stage:            initial?.stage            || 'Origination',
    nda_status:       initial?.nda_status       || 'Pending',
    side:             initial?.side             || 'Sell-side',
    sector:           initial?.sector           || '',
    ticket_size_usd_m:initial?.ticket_size_usd_m ?? '',
    fee_retainer_usd: initial?.fee_retainer_usd ?? '',
    fee_success_pct:  initial?.fee_success_pct  ?? '',
    target_close:     initial?.target_close     || '',
    lead_owner:       initial?.lead_owner       || '',
    deck_url:         initial?.deck_url         || '',
    notes:            initial?.notes            || ''
  })
  const [submitting, setSubmitting] = useState(false)

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.client_name.trim()) return
    setSubmitting(true)
    const payload = {
      ...form,
      ticket_size_usd_m: form.ticket_size_usd_m === '' ? null : Number(form.ticket_size_usd_m),
      fee_retainer_usd:  form.fee_retainer_usd  === '' ? null : Number(form.fee_retainer_usd),
      fee_success_pct:   form.fee_success_pct   === '' ? null : Number(form.fee_success_pct),
      target_close:      form.target_close || null,
      sector:            form.sector.trim() || null,
      lead_owner:        form.lead_owner.trim() || null,
      deck_url:          form.deck_url.trim() || null,
      notes:             form.notes.trim() || null
    }
    await onSubmit(payload)
    setSubmitting(false)
  }

  function applyExtracted(data) {
    setForm(s => ({
      ...s,
      client_name:      data.client_name || s.client_name,
      deal_type:        data.deal_type   || s.deal_type,
      side:             data.side        || s.side,
      sector:           data.sector      || s.sector,
      ticket_size_usd_m:data.ticket_size_usd_m != null ? String(data.ticket_size_usd_m) : s.ticket_size_usd_m,
      notes:            data.notes       || s.notes
    }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!initial && <TeaserImport onExtracted={applyExtracted} />}
      {!initial && (
        <ConflictBanner clientName={form.client_name} sector={form.sector} side={form.side} />
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="vl-label">Client name</label>
          <input value={form.client_name} onChange={e => set('client_name', e.target.value)} className="vl-input" placeholder="e.g. Nimbus Health" required autoFocus />
        </div>
        <div>
          <label className="vl-label">Deal type</label>
          <select className="vl-input" value={form.deal_type} onChange={e => set('deal_type', e.target.value)}>
            {TYPES.map(t => <option key={t} className="bg-valence-surface" value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="vl-label">Side</label>
          <select className="vl-input" value={form.side} onChange={e => set('side', e.target.value)}>
            {SIDES.map(s => <option key={s} className="bg-valence-surface" value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="vl-label">Stage</label>
          <select className="vl-input" value={form.stage} onChange={e => set('stage', e.target.value)}>
            {STAGES.map(s => <option key={s.id} className="bg-valence-surface" value={s.id} title={s.desc}>{s.id}</option>)}
          </select>
          <p className="mt-1 text-[10px] text-valence-subtle leading-relaxed">{stageMeta(form.stage).desc}</p>
        </div>
        <div>
          <label className="vl-label">NDA status</label>
          <select className="vl-input" value={form.nda_status} onChange={e => set('nda_status', e.target.value)}>
            {NDA.map(n => <option key={n} className="bg-valence-surface" value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="vl-label">Sector</label>
          <input className="vl-input" list="sectors" value={form.sector} onChange={e => set('sector', e.target.value)} placeholder="e.g. Healthcare" />
          <datalist id="sectors">{SECTORS.map(s => <option key={s} value={s} />)}</datalist>
        </div>
        <div>
          <label className="vl-label">Lead owner</label>
          <input className="vl-input" value={form.lead_owner} onChange={e => set('lead_owner', e.target.value)} placeholder="Name of the lead banker" />
        </div>
        <div>
          <label className="vl-label">Deal size <span className="text-valence-subtle normal-case tracking-normal">(USD M)</span></label>
          <input className="vl-input" type="number" step="1" value={form.ticket_size_usd_m} onChange={e => set('ticket_size_usd_m', e.target.value)} placeholder="e.g. 180" />
        </div>
        <div>
          <label className="vl-label">Retainer <span className="text-valence-subtle normal-case tracking-normal">(USD)</span></label>
          <input className="vl-input" type="number" step="1000" value={form.fee_retainer_usd} onChange={e => set('fee_retainer_usd', e.target.value)} placeholder="e.g. 50000" />
        </div>
        <div>
          <label className="vl-label">Success fee %</label>
          <input className="vl-input" type="number" step="0.05" value={form.fee_success_pct} onChange={e => set('fee_success_pct', e.target.value)} placeholder="e.g. 2.00" />
        </div>
        <div>
          <label className="vl-label">Target close</label>
          <input className="vl-input" type="date" value={form.target_close} onChange={e => set('target_close', e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="vl-label">Deck URL</label>
          <input className="vl-input" value={form.deck_url} onChange={e => set('deck_url', e.target.value)} placeholder="https://…" type="url" />
        </div>
        <div className="col-span-2">
          <label className="vl-label">Internal notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} className="vl-input min-h-[100px] resize-y" placeholder="Context, next steps, stakeholders…" />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="vl-btn-secondary">Cancel</button>
        <button type="submit" disabled={submitting} className="vl-btn-primary">
          {submitting ? 'Saving…' : (initial ? 'Save changes' : 'Log deal')}
        </button>
      </div>
    </form>
  )
}

// ============ UTIL COMPONENTS ============
function BigStat({ label, value, sub, icon: Icon, accent = false }) {
  return (
    <div className={`vl-card relative overflow-hidden p-5 ${accent ? 'ring-1 ring-valence-blue/20' : ''}`}>
      {accent && <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-valence-blue/10 blur-2xl" aria-hidden />}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-valence-muted">{label}</span>
        {Icon && <Icon className={`h-4 w-4 ${accent ? 'text-valence-blue' : 'text-valence-subtle'}`} />}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-valence-text">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-valence-muted">{sub}</p>}
    </div>
  )
}

function FilterPill({ label, value, onChange, options }) {
  return (
    <label className="group relative flex items-center gap-2 rounded-lg border border-valence-border bg-valence-surface pl-3 pr-2 py-2 text-xs font-medium text-valence-muted transition focus-within:border-valence-blue focus-within:ring-2 focus-within:ring-valence-blue-ring">
      <FilterIcon className="h-3 w-3" />
      <span className="text-[11px] uppercase tracking-wider">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="bg-transparent pr-1 text-sm font-semibold text-valence-text outline-none">
        <option className="bg-valence-surface text-valence-text" value="All">All</option>
        {options.map(o => <option key={o} className="bg-valence-surface text-valence-text" value={o}>{o}</option>)}
      </select>
    </label>
  )
}

function NdaBadge({ status }) {
  const map = { Signed: 'text-valence-success', Pending: 'text-valence-warning', 'Not Required': 'text-valence-muted' }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${map[status] || 'text-valence-muted'}`}>
      <Circle className="h-1.5 w-1.5 fill-current" /> NDA {status}
    </span>
  )
}

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString()
}

function exportCSV(deals) {
  if (!deals?.length) return
  const header = ['Client','Type','Side','Stage','Sector','Ticket (USDm)','Retainer (USD)','Success %','NDA','Lead','Target close','Notes']
  const rows = deals.map(d => [
    d.client_name || '', d.deal_type || '', d.side || '', d.stage || '',
    d.sector || '', d.ticket_size_usd_m ?? '', d.fee_retainer_usd ?? '',
    d.fee_success_pct ?? '', d.nda_status || '', d.lead_owner || '',
    d.target_close || '', (d.notes || '').replace(/\s+/g, ' ')
  ])
  const csv = [header, ...rows].map(r =>
    r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',')
  ).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `valence_pipeline_${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function TableSkeleton() {
  return (
    <div className="vl-card overflow-hidden">
      <div className="divide-y divide-valence-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
            <div className="h-9 w-9 rounded-lg bg-valence-surface" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-40 rounded bg-valence-surface" />
              <div className="h-2.5 w-64 rounded bg-valence-surface" />
            </div>
            <div className="h-5 w-16 rounded-full bg-valence-surface" />
          </div>
        ))}
      </div>
    </div>
  )
}
