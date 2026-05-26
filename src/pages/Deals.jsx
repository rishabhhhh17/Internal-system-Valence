import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  Plus, Search, Briefcase, FileText, ExternalLink, Edit3, Trash2,
  Filter as FilterIcon, Circle, Table as TableIcon, LayoutGrid, TrendingUp,
  GanttChartSquare,
  Mail, Users as UsersIcon, FolderOpen, Activity as ActivityIcon, Sparkles, Info, Download,
  ListChecks, MessageSquare, UserCircle, Building2, Settings2
} from 'lucide-react'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import { humanError } from '../lib/userError.js'
import { logActivity } from '../lib/activity.js'
import { spawnMandateFolders, stripWikilinkTokens } from '../lib/kb.js'
import { uploadDealFile } from '../lib/storage.js'
import DealDocumentsUploader from '../components/DealDocumentsUploader.jsx'
import { STAGES, STAGE_IDS, stageMeta, stageToneClasses, ACTIVE_STAGES } from '../lib/stages.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import Drawer from '../components/Drawer.jsx'
import Modal from '../components/Modal.jsx'
import EmptyState from '../components/EmptyState.jsx'
import DealKanban from '../components/DealKanban.jsx'
import DealGantt from '../components/DealGantt.jsx'
import CompanyFundMatcher from '../components/CompanyFundMatcher.jsx'
import { useFeatureFlag } from '../hooks/useFeatureFlag.js'
import FileVault from '../components/FileVault.jsx'
import Contacts from '../components/Contacts.jsx'
import WikilinkTextarea from '../components/WikilinkTextarea.jsx'
import WikilinkText from '../components/WikilinkText.jsx'
import ActivityTimeline from '../components/ActivityTimeline.jsx'
import StageHistorySpine from '../components/StageHistorySpine.jsx'
import DealBrief from '../components/DealBrief.jsx'
import EntityMentions from '../components/EntityMentions.jsx'
import { AtSign } from 'lucide-react'
import EmailComposer from '../components/EmailComposer.jsx'
import SimilarDeals from '../components/SimilarDeals.jsx'
import CIMGenerator from '../components/CIMGenerator.jsx'
import TargetList from '../components/TargetList.jsx'
import FinancialsCard from '../components/FinancialsCard.jsx'
import ShareManager from '../components/ShareManager.jsx'
import DealIntroPaths from '../components/DealIntroPaths.jsx'
import FundShortlist from '../components/FundShortlist.jsx'
import MeetingIntelligence from '../components/MeetingIntelligence.jsx'
import GmailSyncButton from '../components/GmailSyncButton.jsx'
import StageGate from '../components/StageGate.jsx'
import DealTeam from '../components/DealTeam.jsx'
import DealComments from '../components/DealComments.jsx'
import ConflictBanner from '../components/ConflictBanner.jsx'
import InlineEditableText from '../components/InlineEditableText.jsx'
import { useToast } from '../components/Toast.jsx'
import { useConfirm } from '../components/ConfirmDialog.jsx'
import { useCurrency } from '../hooks/useCurrency.jsx'

const NDA = ['Signed', 'Pending', 'Not Required']

// Stages that count as a "live mandate" — i.e. firm is actively
// engaged. The old /mandates page filtered to this set; we honour
// the same shape when navigated to /deals?filter=live.
const LIVE_MANDATE_STAGES = new Set([
  'Mandate', 'Preparation', 'Marketing', 'Diligence', 'Negotiation', 'Closing'
])

// New deal-type taxonomy. A mandate can be Transaction, Advisory, or both.
// Transaction requires a sub-type (fundraise / m_and_a / exit).
const TOP_TYPES   = [
  { id: 'transaction', label: 'Transaction', blurb: 'Fundraise, M&A, or exit — the deal closes a transaction.' },
  { id: 'advisory',    label: 'Advisory',    blurb: 'Consulting work — geography expansion, vertical entry, distribution, etc.' }
]
const SUBTYPES = [
  { id: 'fundraise', label: 'Fundraise', blurb: 'Equity, fund, or project capital.' },
  { id: 'm_and_a',   label: 'M&A',       blurb: 'Buy-side or sell-side advisory.' },
  { id: 'exit',      label: 'Exit',      blurb: 'Liquidity for an existing investor.' }
]
const MA_SIDES = [
  { id: 'sell',      label: 'Sell-side' },
  { id: 'buy',       label: 'Buy-side' },
  { id: 'undecided', label: 'Not yet decided' }
]

const SECTORS = [
  'Healthcare','BFSI','Fintech','Infrastructure','Consumer','Consumer Tech',
  'EdTech','Energy','Real Estate','Logistics','Technology','Other'
]

// Demo dataset — used when Supabase isn't configured. Mirrors the new schema.
const demo = [
  { id: 'd1', client_name: 'Nimbus Health',    stage: 'Mandate',     nda_status: 'Signed',      sector: 'Healthcare',     deal_types: ['transaction'],            deal_subtype: 'm_and_a',  ma_side: 'sell', acquisition_brief: null,                                                                                                  target_raise_usd_m: null, target_valuation_usd_m: null, company_stage: null, target_exit_usd_m: null, exit_investor_name: null, engagement_brief: null, target_close: '2026-07-01', lead_owner: 'Neha Jain',       notes: 'Founders open to strategic exit; EBITDA ~12M.',       created_at: new Date().toISOString() },
  { id: 'd2', client_name: 'Arclight Capital', stage: 'Origination', nda_status: 'Pending',     sector: 'Infrastructure', deal_types: ['transaction'],            deal_subtype: 'm_and_a',  ma_side: 'buy',  acquisition_brief: 'Looking for $100–250M EV infra assets in renewables. Operating, not greenfield. India + SEA only.',          target_raise_usd_m: null, target_valuation_usd_m: null, company_stage: null, target_exit_usd_m: null, exit_investor_name: null, engagement_brief: null, target_close: '2026-08-15', lead_owner: 'Rohan Gupta',     notes: 'Early conversations. Thesis fit on Series B infra.',  created_at: new Date().toISOString() },
  { id: 'd3', client_name: 'Quantum Edge',     stage: 'Mandate',     nda_status: 'Signed',      sector: 'Fintech',        deal_types: ['transaction'],            deal_subtype: 'fundraise', ma_side: null,  acquisition_brief: null,                                                                                                  target_raise_usd_m: 80,   target_valuation_usd_m: 250,  company_stage: 'Series C', target_exit_usd_m: null, exit_investor_name: null, engagement_brief: null, target_close: '2026-06-10', lead_owner: 'Arjun Mehta',    notes: 'Pre-IPO roadshow kicking off Q2.',                    created_at: new Date().toISOString() },
  { id: 'd4', client_name: 'Helios Infra',     stage: 'Closed',      nda_status: 'Signed',      sector: 'Infrastructure', deal_types: ['transaction'],            deal_subtype: 'fundraise', ma_side: null,  acquisition_brief: null,                                                                                                  target_raise_usd_m: 150,  target_valuation_usd_m: null, company_stage: 'Project finance', target_exit_usd_m: null, exit_investor_name: null, engagement_brief: null, target_close: '2026-03-20', lead_owner: 'Rishi Kapoor',    notes: 'INR 1,200 Cr bond issuance closed last week.',        created_at: new Date().toISOString() },
  { id: 'd5', client_name: 'LumenAI',          stage: 'On Hold',     nda_status: 'Signed',      sector: 'Consumer Tech',  deal_types: ['transaction'],            deal_subtype: 'fundraise', ma_side: null,  acquisition_brief: null,                                                                                                  target_raise_usd_m: 45,   target_valuation_usd_m: 120,  company_stage: 'Series B', target_exit_usd_m: null, exit_investor_name: null, engagement_brief: null, target_close: '2026-10-01', lead_owner: 'Vikram Patel',   notes: 'Waiting on updated financials before next round.',    created_at: new Date().toISOString() },
  { id: 'd6', client_name: 'Kavya Foods',      stage: 'Pitching',    nda_status: 'Not Required', sector: 'Consumer',      deal_types: ['transaction','advisory'], deal_subtype: 'm_and_a',  ma_side: 'sell', acquisition_brief: 'Family business open to strategic acquirer; wants $80M+ EV.',                                          target_raise_usd_m: null, target_valuation_usd_m: null, company_stage: null, target_exit_usd_m: null, exit_investor_name: null, engagement_brief: 'Also helping the founder design a vending-machine distribution play for premium Q-commerce dark stores.', target_close: '2026-09-10', lead_owner: 'Priya Sharma', notes: 'Family business — first contact made.',                created_at: new Date().toISOString() },
  { id: 'd7', client_name: 'Meridian EdTech',  stage: 'Mandate',     nda_status: 'Signed',      sector: 'EdTech',         deal_types: ['transaction'],            deal_subtype: 'fundraise', ma_side: null,  acquisition_brief: null,                                                                                                  target_raise_usd_m: 35,   target_valuation_usd_m: 120,  company_stage: 'Series C', target_exit_usd_m: null, exit_investor_name: null, engagement_brief: null, target_close: '2026-07-20', lead_owner: 'Ananya Roy',     notes: 'Series C. 5 funds in diligence; shortlist of 2.',     created_at: new Date().toISOString() },
  { id: 'd8', client_name: 'Polaris Energy',   stage: 'Mandate',     nda_status: 'Signed',      sector: 'Energy',         deal_types: ['transaction'],            deal_subtype: 'fundraise', ma_side: null,  acquisition_brief: null,                                                                                                  target_raise_usd_m: 200,  target_valuation_usd_m: null, company_stage: 'Project finance', target_exit_usd_m: null, exit_investor_name: null, engagement_brief: null, target_close: '2026-06-05', lead_owner: 'Karan Singh',    notes: 'USD notes issuance. Investor docs in review.',         created_at: new Date().toISOString() },
  { id: 'd9', client_name: 'Veda Biotech',     stage: 'Pre-Mandate', nda_status: 'Signed',      sector: 'Healthcare',     deal_types: ['transaction'],            deal_subtype: 'm_and_a',  ma_side: 'sell', acquisition_brief: 'Looking for strategic acquirer in oncology diagnostics. Open to PE rollup option as plan B.',           target_raise_usd_m: null, target_valuation_usd_m: null, company_stage: null, target_exit_usd_m: null, exit_investor_name: null, engagement_brief: null, target_close: '2026-08-05', lead_owner: 'Neha Jain',       notes: 'Engagement letter signed last week. Teaser drafting.', created_at: new Date().toISOString() },
  { id: 'd10', client_name: 'Orion Realty',    stage: 'Mandate',     nda_status: 'Signed',      sector: 'Real Estate',    deal_types: ['transaction'],            deal_subtype: 'exit',     ma_side: null,  acquisition_brief: null,                                                                                                  target_raise_usd_m: null, target_valuation_usd_m: null, company_stage: null, target_exit_usd_m: 320, exit_investor_name: 'Brookfield', engagement_brief: null, target_close: '2026-05-12', lead_owner: 'Vikram Patel',                                                                                                              notes: 'Term sheet agreed. Final SPA negotiations.',           created_at: new Date().toISOString() },
  { id: 'd11', client_name: 'HoV Mushrooms',   stage: 'Mandate',     nda_status: 'Signed',      sector: 'Consumer',       deal_types: ['transaction','advisory'], deal_subtype: 'fundraise', ma_side: null,  acquisition_brief: null,                                                                                                  target_raise_usd_m: 12,   target_valuation_usd_m: 60,   company_stage: 'Series A',  target_exit_usd_m: null, exit_investor_name: null, engagement_brief: 'D2C → B2B expansion (restaurants, hotels, grocers). Dubai market entry. New product line: peppers for premium Q-commerce dark stores.', target_close: '2026-09-30', lead_owner: 'Trishant Patel', notes: 'Started as a fundraise, broadened into Dubai entry + product-line work.', created_at: new Date().toISOString() },
  { id: 'd12', client_name: 'Saffron Studios', stage: 'Mandate',     nda_status: 'Signed',      sector: 'Media',          deal_types: ['advisory'],               deal_subtype: null,        ma_side: null,  acquisition_brief: null,                                                                                                  target_raise_usd_m: null, target_valuation_usd_m: null, company_stage: null, target_exit_usd_m: null, exit_investor_name: null, engagement_brief: 'Helping a film studio raise project finance for their next slate. Equity capital, not debt.', target_close: '2026-07-15', lead_owner: 'Manav Kapoor',   notes: 'Project capital — equity slate finance for the studio.', created_at: new Date().toISOString() }
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
  const [fTopType, setFTopType] = useState('All')   // 'All' | 'transaction' | 'advisory'
  const [fSubtype, setFSubtype] = useState('All')   // 'All' | 'fundraise' | 'm_and_a' | 'exit'
  const [fNda, setFNda]     = useState('All')
  // Live-mandate macro filter. Either 'all' (show every deal) or 'live'
  // (restrict to LIVE_MANDATE_STAGES). Toggled by the segmented control
  // beside the search box, and pre-set when the user lands via
  // /deals?filter=live (i.e. coming from the retired /mandates URL).
  const [fLive, setFLive]   = useState(params.get('filter') === 'live' ? 'live' : 'all')
  const [view, setView]     = useState('board') // 'board' | 'table' | 'gantt'

  const [drawer, setDrawer] = useState(null)
  // Keyboard-focused row on the Table view (separate from open drawer so
  // partners can scan rows with j/k without opening each one).
  const [focusedDealId, setFocusedDealId] = useState(null)
  // Modal shape: null | 'new' | 'new-advanced' | { edit: deal }.
  // 'new'           — quick capture; just the form
  // 'new-advanced'  — full creator with document attachments captured upfront
  const [modal, setModal]   = useState(null)
  const [composer, setComposer] = useState(null) // { deal, contact }
  // Pending documents staged by the Advanced creator before the deal exists.
  // Uploaded after the deal insert returns the new id; cleared on close.
  const [pendingFiles, setPendingFiles] = useState([])

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

  // Convert flow from Quick Screener / Intake inbox: /deals?new=1&client_name=…&sector=…&notes=…
  // Opens the new-deal modal pre-filled with what the convert flow knew about
  // the inbound mandate so the partner only has to confirm + click save.
  useEffect(() => {
    if (params.get('new') !== '1') return
    const prefill = {
      client_name:  params.get('client_name')  || '',
      sector:       params.get('sector')       || '',
      stage:        params.get('stage')        || 'Origination',
      deal_types:   (params.get('deal_types')  || '').split(',').filter(Boolean),
      deal_subtype: params.get('subtype')      || null,
      ma_side:      params.get('ma_side')      || null,
      notes:        params.get('notes')        || '',
      // Carry the intake deck URL through so the new-deal flow can attach it
      // to deal_files after the deal is created (handled in DealForm submit).
      __intake_deck_url:  params.get('deck_url')  || null,
      __intake_deck_name: params.get('deck_name') || null
    }
    setModal({ prefill })
    // Drain the params so reload / back-nav doesn't keep re-opening the modal.
    const next = new URLSearchParams(params)
    ;['new','client_name','sector','stage','deal_types','subtype','ma_side','notes','deck_url','deck_name'].forEach(k => next.delete(k))
    setParams(next, { replace: true })
  }, [params])

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
      setLoadError(humanError(err, "Couldn't load deals — refresh the page."))
      setDeals([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return deals.filter(d => {
      const types = Array.isArray(d.deal_types) ? d.deal_types : []
      if (fLive === 'live'   && !LIVE_MANDATE_STAGES.has(d.stage)) return false
      if (fStage !== 'All'   && d.stage !== fStage) return false
      if (fTopType !== 'All' && !types.includes(fTopType)) return false
      if (fSubtype !== 'All' && d.deal_subtype !== fSubtype) return false
      if (fNda   !== 'All'   && d.nda_status !== fNda) return false
      if (!needle) return true
      return (d.client_name || '').toLowerCase().includes(needle)
        || (d.notes || '').toLowerCase().includes(needle)
        || (d.sector || '').toLowerCase().includes(needle)
        || (d.lead_owner || '').toLowerCase().includes(needle)
        || (d.acquisition_brief || '').toLowerCase().includes(needle)
        || (d.engagement_brief || '').toLowerCase().includes(needle)
    })
  }, [deals, q, fStage, fTopType, fSubtype, fNda, fLive])

  const metrics = useMemo(() => {
    const active      = deals.filter(d => !stageMeta(d.stage).terminal)
    const origination = deals.filter(d => d.stage === 'Origination')
    const preMandate  = deals.filter(d => d.stage === 'Pre-Mandate')
    const closed      = deals.filter(d => d.stage === 'Closed')
    return {
      total: deals.length,
      active: active.length,
      origination: origination.length,
      preMandate: preMandate.length,
      closed: closed.length
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
      if (error) return toast.error(humanError(error))
      await logActivity({ dealId: id, kind: 'note', body: 'Deal details updated.' })
      toast.success('Deal updated.')
    } else {
      const { data, error } = await supabase.from('deals').insert(payload).select().single()
      if (error) return toast.error(humanError(error))
      const typeLabel = (payload.deal_types || []).join(' + ') || 'mandate'
      const subtypeLabel = payload.deal_subtype ? ` · ${payload.deal_subtype}` : ''
      await logActivity({ dealId: data.id, kind: 'created', body: `New ${typeLabel}${subtypeLabel}` })
      // Auto-spawn the default KB folder structure for this mandate. Best-effort —
      // if the kb_folders table isn't present yet (Phase 2 SQL not applied) the
      // call is a no-op error swallow and the deal still saves cleanly.
      try { await spawnMandateFolders(supabase, data) } catch (e) { console.warn('kb folder spawn skipped', e) }

      // Advanced flow: upload any pre-creation documents the user staged.
      // Each upload also logs a file_upload activity so the timeline + drawer
      // pick up the docs immediately. Continue on individual failures so one
      // bad file doesn't lose the rest.
      if (pendingFiles.length > 0) {
        let ok = 0, fail = 0
        for (const { file, category } of pendingFiles) {
          try {
            await uploadDealFile({ dealId: data.id, file, category })
            await logActivity({ dealId: data.id, kind: 'file_upload', body: `${category}: ${file.name}` })
            ok++
          } catch (err) {
            console.warn('upload failed for', file?.name, err)
            fail++
          }
        }
        if (fail > 0) toast.error(`${ok} uploaded · ${fail} failed`)
        else if (ok > 0) toast.success(`${ok} file${ok === 1 ? '' : 's'} attached.`)
        setPendingFiles([])
      }

      toast.success(`${payload.client_name} logged.`)
      // Open the new deal's drawer so the user lands on the result.
      setDrawer(data)
    }
    setModal(null)
    load()
  }

  // Wipe staged docs when the user cancels the Advanced flow without saving.
  function closeModal() {
    setModal(null)
    setPendingFiles([])
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
      if (error) return toast.error(humanError(error))
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
      toast.error(humanError(error, 'Could not change stage — try again.')); load(); return
    }
    await logActivity({ dealId: id, kind: 'stage_change', body: `${deal.stage} → ${newStage}` })
    toast.success(`${deal.client_name} → ${newStage}`)
  }

  return (
    <div className="space-y-6">
      <ConfigBanner />

      <div>
        <p className="vl-eyebrow-ink">Deal Status</p>
        <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
          {fLive === 'live' ? 'Live mandates' : 'Every deal in the pipeline'}
        </h1>
      </div>

      {/* Pipeline counters — operational, not money */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <BigStat label="Active mandates"  value={metrics.active} sub="Engaged through Mandate" accent icon={TrendingUp} />
        <BigStat label="In origination"   value={metrics.origination} sub="Talks have started" icon={Briefcase} />
        <BigStat label="In pre-mandate"   value={metrics.preMandate} sub="Paperwork underway" icon={ActivityIcon} />
        <BigStat label="Closed"           value={metrics.closed} sub="All-time wins" icon={FolderOpen} />
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

          <FilterPill label="Stage"   value={fStage}   onChange={setFStage}   options={STAGE_IDS} />
          <FilterPill label="Type"    value={fTopType} onChange={setFTopType} options={['transaction', 'advisory']} />
          <FilterPill label="Subtype" value={fSubtype} onChange={setFSubtype} options={['fundraise', 'm_and_a', 'exit']} />
          <FilterPill label="NDA"     value={fNda}     onChange={setFNda}     options={NDA} />

          {/* All / Live macro filter. Replaces the standalone Live Mandates
              page — same set of stages, just toggled here. */}
          <div className="flex items-center rounded-lg border border-valence-border bg-valence-surface p-0.5">
            <button onClick={() => setFLive('all')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${fLive === 'all' ? 'bg-valence-blue-soft text-valence-text' : 'text-valence-muted hover:text-valence-text'}`}>
              All deals
            </button>
            <button onClick={() => setFLive('live')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${fLive === 'live' ? 'bg-valence-blue-soft text-valence-text' : 'text-valence-muted hover:text-valence-text'}`}>
              Live mandates
            </button>
          </div>

          <div data-tour="deals-view-toggle" className="flex items-center rounded-lg border border-valence-border bg-valence-surface p-0.5">
            <button onClick={() => setView('board')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${view === 'board' ? 'bg-valence-blue-soft text-valence-text' : 'text-valence-muted hover:text-valence-text'}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Board
            </button>
            <button onClick={() => setView('table')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${view === 'table' ? 'bg-valence-blue-soft text-valence-text' : 'text-valence-muted hover:text-valence-text'}`}>
              <TableIcon className="h-3.5 w-3.5" /> Table
            </button>
            <button onClick={() => setView('gantt')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${view === 'gantt' ? 'bg-valence-blue-soft text-valence-text' : 'text-valence-muted hover:text-valence-text'}`}>
              <GanttChartSquare className="h-3.5 w-3.5" /> Gantt
            </button>
          </div>

          <button onClick={() => exportCSV(filtered)} className="vl-btn-secondary" title="Download filtered pipeline as CSV">
            <Download className="h-4 w-4" /> Export
          </button>
          {/* Quick capture — just the form. Lowest-friction path for "this just came in". */}
          <button data-tour="deals-new" onClick={() => setModal('new')} className="vl-btn-primary">
            <Plus className="h-4 w-4" /> New deal
          </button>
          {/* Advanced flow — attach NDA / engagement letter / deck / etc. upfront. */}
          <button data-tour="deals-new-advanced" onClick={() => setModal('new-advanced')} className="vl-btn-secondary" title="New deal with documents attached upfront">
            <Settings2 className="h-4 w-4" /> Advanced
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
          sampleEligible={false}
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
          sampleEligible={false}
        />
      ) : view === 'board' ? (
        <DealKanban deals={filtered} onOpen={setDrawer} onStageChange={changeStage} />
      ) : view === 'gantt' ? (
        <DealGantt deals={filtered} onOpen={setDrawer} />
      ) : (
        <DealTable deals={filtered} onOpen={setDrawer} focusedId={focusedDealId} onFocus={setFocusedDealId} />
      )}

      {/* Power-user keyboard nav scoped to /deals Table view. j/k moves the
          focus ring up/down across rows, o/Enter opens the drawer for the
          focused row. Skipped when typing in any input. */}
      <DealsKeyboardNav
        enabled={view === 'table' && filtered.length > 0 && !drawer && !modal}
        deals={filtered}
        focusedId={focusedDealId}
        setFocusedId={setFocusedDealId}
        onOpen={setDrawer}
      />

      {/* Drawer with tabs. The title is click-to-edit — rename the deal
          inline without opening the full Edit modal. */}
      <Drawer
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        title={
          drawer
            ? <InlineEditableText
                value={drawer.client_name}
                onSave={async (next) => {
                  if (isSupabaseConfigured) {
                    const { error } = await supabase.from('deals').update({ client_name: next }).eq('id', drawer.id)
                    if (error) { toast.error(humanError(error, 'Could not save the new name.')); throw error }
                    await logActivity({ dealId: drawer.id, kind: 'note', body: `Renamed to "${next}"` })
                  }
                  setDeals(prev => prev.map(d => d.id === drawer.id ? { ...d, client_name: next } : d))
                  setDrawer(prev => prev && prev.id === drawer.id ? { ...prev, client_name: next } : prev)
                  toast.success('Renamed.')
                }}
              />
            : ''
        }
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

      {/* New / edit / new-advanced modal. The 'new-advanced' shape mounts
          the documents uploader above the form so the user can stage files
          (NDA, engagement letter, deck, etc.) BEFORE the deal exists; they
          upload after the insert returns a deal id. */}
      <Modal
        open={Boolean(modal)}
        onClose={closeModal}
        title={
          modal?.edit          ? 'Edit deal' :
          modal === 'new-advanced' ? 'New deal — advanced'
                                   : 'New deal'
        }
        description={
          modal?.edit              ? 'Update the details of this mandate.' :
          modal === 'new-advanced' ? 'Capture the deal and attach any docs you already have. Everything saves together.'
                                   : 'Log a new mandate into the pipeline.'
        }
        size="xl"
      >
        {modal === 'new-advanced' && (
          <div className="mb-6 pb-6 border-b border-valence-border">
            <DealDocumentsUploader files={pendingFiles} onChange={setPendingFiles} />
          </div>
        )}
        <DealForm
          initial={modal?.edit || modal?.prefill}
          onCancel={closeModal}
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
    { id: 'intros',     label: 'Intros',         icon: Sparkles },
    { id: 'funds',      label: 'Funds',          icon: Building2 },
    { id: 'meeting',    label: 'Meeting intel',  icon: Sparkles },
    { id: 'activity',   label: 'Activity',       icon: ActivityIcon },
    { id: 'comments',   label: 'Discussion',     icon: MessageSquare },
    { id: 'similar',    label: 'Similar',        icon: Sparkles },
    { id: 'targets',    label: 'Targets',        icon: UsersIcon },
    { id: 'cim',        label: 'CIM',            icon: FileText },
    { id: 'brief',      label: 'AI Brief',       icon: Sparkles },
    { id: 'mentions',   label: 'Mentions',       icon: AtSign },
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
                tab === t.id ? 'bg-valence-elevated text-valence-text shadow-sm' : 'text-valence-muted hover:text-valence-text'
              }`}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>
        {/* Edge fades so users know the tab list scrolls */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-valence-elevated to-transparent" aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-valence-elevated to-transparent" aria-hidden />
      </div>

      <div>
        {tab === 'overview'   && <DealOverview deal={deal} />}
        {tab === 'gate'       && <StageGate deal={deal} />}
        {tab === 'team'       && <DealTeam deal={deal} />}
        {tab === 'financials' && <FinancialsCard deal={deal} />}
        {tab === 'files'      && <FileVault dealId={deal.id} />}
        {tab === 'contacts'   && <Contacts dealId={deal.id} onOpenComposer={onComposeEmail} />}
        {tab === 'intros'     && <DealIntroPaths deal={deal} />}
        {tab === 'funds'      && <FundShortlist deal={deal} />}
        {tab === 'meeting'    && <MeetingIntelligence deal={deal} />}
        {tab === 'activity'   && <ActivityTimeline dealId={deal.id} />}
        {tab === 'comments'   && <DealComments deal={deal} />}
        {tab === 'similar'    && <SimilarDeals deal={deal} />}
        {tab === 'targets'    && <TargetList deal={deal} />}
        {tab === 'cim'        && <CIMGenerator deal={deal} />}
        {tab === 'brief'      && <DealBrief deal={deal} />}
        {tab === 'mentions'   && <EntityMentions entityType="mandate" entityId={deal.id} entityName={deal.client_name} />}
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
            {(Array.isArray(deal.deal_types) ? deal.deal_types : []).map(t => (
              <span key={t} className="vl-chip capitalize">{t === 'm_and_a' ? 'M&A' : t}</span>
            ))}
            {deal.deal_subtype && <span className="vl-chip">{deal.deal_subtype === 'm_and_a' ? 'M&A' : deal.deal_subtype.replace(/_/g, ' ')}</span>}
            {deal.ma_side && deal.deal_subtype === 'm_and_a' && <span className="vl-chip">{deal.ma_side === 'sell' ? 'Sell-side' : deal.ma_side === 'buy' ? 'Buy-side' : 'Side TBD'}</span>}
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
  const progressDeals = ACTIVE_STAGES.findIndex(s => s.id === deal.stage)
  const progress = progressDeals >= 0 ? ((progressDeals + 1) / ACTIVE_STAGES.length) * 100 : 0

  const types = Array.isArray(deal.deal_types) ? deal.deal_types : []
  const isTransaction = types.includes('transaction')
  const isAdvisory    = types.includes('advisory')

  // The Company⇄Fund matcher is gated on the feature flag. Default-on
  // for IB orgs, off for PE/VC unless the user toggled it in Settings.
  const showMatcher = useFeatureFlag('company_fund_matcher')

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

      {/* Stage-by-stage history — when we entered each, how long we sat there */}
      <StageHistorySpine deal={deal} />

      {/* Universal fields */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sector"       value={deal.sector || '—'} />
        <Field label="Lead owner"   value={deal.lead_owner || '—'} />
        <Field label="Type"         value={types.length ? types.map(t => t === 'm_and_a' ? 'M&A' : (t.charAt(0).toUpperCase() + t.slice(1))).join(' + ') : '—'} accent />
        <Field label="Subtype"      value={deal.deal_subtype ? humanSubtype(deal.deal_subtype) : '—'} />
        <Field label="Target close" value={deal.target_close ? format(parseISO(String(deal.target_close).slice(0,10)), 'd MMM yyyy') : '—'} />
        <Field label="Logged"       value={format(new Date(deal.created_at), 'd MMM yyyy')} />
      </div>

      {/* Transaction-conditional blocks */}
      {isTransaction && deal.deal_subtype === 'fundraise' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target raise (USD M)"     value={deal.target_raise_usd_m ?? '—'} />
          <Field label="Target valuation (USD M)" value={deal.target_valuation_usd_m ?? '—'} />
          <Field label="Company stage"            value={deal.company_stage || '—'} />
        </div>
      )}
      {isTransaction && deal.deal_subtype === 'm_and_a' && (
        <div className="space-y-3">
          <Field label="M&A side" value={deal.ma_side ? humanSide(deal.ma_side) : '—'} />
          <div>
            <p className="vl-label">Acquisition brief</p>
            <p className="whitespace-pre-wrap rounded-lg border border-valence-border bg-valence-surface px-4 py-3 text-sm leading-relaxed text-valence-text">
              {deal.acquisition_brief || <span className="text-valence-subtle">No brief captured.</span>}
            </p>
          </div>
        </div>
      )}
      {isTransaction && deal.deal_subtype === 'exit' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target exit (USD M)"           value={deal.target_exit_usd_m ?? '—'} />
          <Field label="Target exit valuation (USD M)" value={deal.target_exit_valuation_usd_m ?? '—'} />
          <Field label="Investor being exited"         value={deal.exit_investor_name || '—'} />
        </div>
      )}

      {/* Advisory-conditional block */}
      {isAdvisory && (
        <div>
          <p className="vl-label">Engagement brief</p>
          <p className="whitespace-pre-wrap rounded-lg border border-valence-border bg-valence-surface px-4 py-3 text-sm leading-relaxed text-valence-text">
            {deal.engagement_brief || <span className="text-valence-subtle">No engagement brief captured.</span>}
          </p>
        </div>
      )}

      <div>
        <p className="vl-label">Notes</p>
        <p className="whitespace-pre-wrap rounded-lg border border-valence-border bg-valence-surface px-4 py-3 text-sm leading-relaxed text-valence-text">
          {deal.notes ? <WikilinkText>{deal.notes}</WikilinkText> : <span className="text-valence-subtle">No notes yet.</span>}
        </p>
      </div>

      {/* IB-curated tool. Gated on the company_fund_matcher feature flag.
          Default-on for IB orgs; hidden everywhere else unless the user
          flipped it in Settings → Advanced → Features. */}
      {showMatcher && <CompanyFundMatcher mode="deal_to_funds" deal={deal} />}
    </div>
  )
}

function humanSubtype(s) {
  if (s === 'm_and_a')   return 'M&A'
  if (s === 'fundraise') return 'Fundraise'
  if (s === 'exit')      return 'Exit'
  return s
}
function humanSide(s) {
  if (s === 'buy')       return 'Buy-side'
  if (s === 'sell')      return 'Sell-side'
  if (s === 'undecided') return 'Not yet decided'
  return s
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
function DealTable({ deals, onOpen, focusedId = null, onFocus = () => {} }) {
  // Auto-scroll focused row into view when the partner navigates with j/k.
  const rowRefs = useRef({})
  useEffect(() => {
    const el = focusedId ? rowRefs.current[focusedId] : null
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusedId])
  return (
    <div className="vl-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-valence-border text-left text-[11px] font-semibold uppercase tracking-wider text-valence-muted">
              <th className="px-5 py-3.5">Client</th>
              <th className="px-5 py-3.5">Stage</th>
              <th className="px-5 py-3.5">Type</th>
              <th className="px-5 py-3.5">Subtype</th>
              <th className="px-5 py-3.5">Sector</th>
              <th className="px-5 py-3.5">Lead</th>
              <th className="px-5 py-3.5">NDA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-valence-border">
            {deals.map(d => (
              <tr
                key={d.id}
                ref={el => { if (el) rowRefs.current[d.id] = el }}
                onClick={() => { onFocus(d.id); onOpen(d) }}
                onMouseEnter={() => onFocus(d.id)}
                className={`cursor-pointer transition ${focusedId === d.id ? 'bg-valence-blue-soft/50 ring-2 ring-valence-blue/30 ring-inset' : 'hover:bg-valence-surface'}`}
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-valence-blue-soft ring-1 ring-valence-blue/20">
                      <Briefcase className="h-4 w-4 text-valence-blue" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-valence-text">{d.client_name}</p>
                      <p className="text-[11px] text-valence-muted line-clamp-1 max-w-[260px]">{stripWikilinkTokens(d.notes) || '—'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${stageToneClasses(d.stage)}`} title={stageMeta(d.stage).desc}>
                    {d.stage}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-1">
                    {(Array.isArray(d.deal_types) ? d.deal_types : []).map(t => (
                      <span key={t} className="vl-chip capitalize">{t === 'm_and_a' ? 'M&A' : t}</span>
                    ))}
                    {(!d.deal_types || d.deal_types.length === 0) && <span className="text-xs text-valence-subtle">—</span>}
                  </div>
                </td>
                <td className="px-5 py-4 text-xs text-valence-muted">{d.deal_subtype === 'm_and_a' ? 'M&A' : (d.deal_subtype ? d.deal_subtype.replace(/_/g, ' ') : '—')}</td>
                <td className="px-5 py-4 text-xs text-valence-muted">{d.sector || '—'}</td>
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
    client_name:                  initial?.client_name        || '',
    stage:                        initial?.stage              || 'Origination',
    nda_status:                   initial?.nda_status         || 'Pending',
    sector:                       initial?.sector             || '',
    deal_types:                   initial?.deal_types         || ['transaction'],
    deal_subtype:                 initial?.deal_subtype       || 'fundraise',
    target_raise_usd_m:           initial?.target_raise_usd_m ?? '',
    target_valuation_usd_m:       initial?.target_valuation_usd_m ?? '',
    company_stage:                initial?.company_stage      || '',
    ma_side:                      initial?.ma_side            || 'sell',
    acquisition_brief:            initial?.acquisition_brief  || '',
    target_exit_usd_m:            initial?.target_exit_usd_m  ?? '',
    target_exit_valuation_usd_m:  initial?.target_exit_valuation_usd_m ?? '',
    exit_investor_name:           initial?.exit_investor_name || '',
    engagement_brief:             initial?.engagement_brief   || '',
    target_close:                 initial?.target_close       || '',
    lead_owner:                   initial?.lead_owner         || '',
    notes:                        initial?.notes              || ''
  })
  const [submitting, setSubmitting] = useState(false)
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  function toggleType(id) {
    setForm(s => {
      const has = s.deal_types.includes(id)
      const next = has ? s.deal_types.filter(t => t !== id) : [...s.deal_types, id]
      // ensure at least one type stays selected
      return { ...s, deal_types: next.length ? next : s.deal_types }
    })
  }

  const isTransaction = form.deal_types.includes('transaction')
  const isAdvisory    = form.deal_types.includes('advisory')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.client_name.trim()) return
    setSubmitting(true)
    const num = (v) => v === '' || v == null ? null : Number(v)
    const txt = (v) => (v || '').trim() || null

    const payload = {
      client_name:        form.client_name.trim(),
      stage:              form.stage,
      nda_status:         form.nda_status,
      sector:             txt(form.sector),
      deal_types:         form.deal_types,
      deal_subtype:       isTransaction ? form.deal_subtype : null,
      target_close:       form.target_close || null,
      lead_owner:         txt(form.lead_owner),
      notes:              txt(form.notes),
      // transaction · fundraise
      target_raise_usd_m:           isTransaction && form.deal_subtype === 'fundraise' ? num(form.target_raise_usd_m) : null,
      target_valuation_usd_m:       isTransaction && form.deal_subtype === 'fundraise' ? num(form.target_valuation_usd_m) : null,
      company_stage:                isTransaction && form.deal_subtype === 'fundraise' ? txt(form.company_stage) : null,
      // transaction · m_and_a
      ma_side:                      isTransaction && form.deal_subtype === 'm_and_a'   ? form.ma_side : null,
      acquisition_brief:            isTransaction && form.deal_subtype === 'm_and_a'   ? txt(form.acquisition_brief) : null,
      // transaction · exit
      target_exit_usd_m:            isTransaction && form.deal_subtype === 'exit'      ? num(form.target_exit_usd_m) : null,
      target_exit_valuation_usd_m:  isTransaction && form.deal_subtype === 'exit'      ? num(form.target_exit_valuation_usd_m) : null,
      exit_investor_name:           isTransaction && form.deal_subtype === 'exit'      ? txt(form.exit_investor_name) : null,
      // advisory
      engagement_brief:             isAdvisory ? txt(form.engagement_brief) : null
    }
    await onSubmit(payload)
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!initial && <ConflictBanner clientName={form.client_name} sector={form.sector} />}

      {/* Universal block */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="vl-label">Client / company name</label>
          <input value={form.client_name} onChange={e => set('client_name', e.target.value)} className="vl-input" placeholder="e.g. HoV Mushrooms" required autoFocus />
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
          <input className="vl-input" list="sectors" value={form.sector} onChange={e => set('sector', e.target.value)} placeholder="e.g. Consumer" />
          <datalist id="sectors">{SECTORS.map(s => <option key={s} value={s} />)}</datalist>
        </div>
        <div>
          <label className="vl-label">Lead owner</label>
          <input className="vl-input" value={form.lead_owner} onChange={e => set('lead_owner', e.target.value)} placeholder="Name of the lead banker" />
        </div>
        <div>
          <label className="vl-label">Target close</label>
          <input className="vl-input" type="date" value={form.target_close} onChange={e => set('target_close', e.target.value)} />
        </div>
      </div>

      {/* Deal type chips */}
      <div>
        <label className="vl-label">Mandate type</label>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {TOP_TYPES.map(t => {
            const active = form.deal_types.includes(t.id)
            return (
              <button
                type="button"
                key={t.id}
                onClick={() => toggleType(t.id)}
                aria-pressed={active}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                  active
                    ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text'
                    : 'border-valence-border bg-valence-elevated text-valence-muted hover:text-valence-text'
                }`}
              >
                <p className="font-semibold">{t.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-valence-subtle">{t.blurb}</p>
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-valence-muted">A mandate can be one or both. Both is fine.</p>
      </div>

      {/* Transaction-conditional block */}
      {isTransaction && (
        <div className="space-y-4 rounded-xl border border-valence-blue/20 bg-valence-blue-soft/20 p-4">
          <div>
            <label className="vl-label">Transaction sub-type</label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {SUBTYPES.map(s => {
                const active = form.deal_subtype === s.id
                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => set('deal_subtype', s.id)}
                    aria-pressed={active}
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                      active
                        ? 'border-valence-blue/40 bg-valence-elevated text-valence-text shadow-sm'
                        : 'border-valence-border bg-white/60 text-valence-muted hover:text-valence-text'
                    }`}
                  >
                    <p className="font-semibold">{s.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-valence-subtle">{s.blurb}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {form.deal_subtype === 'fundraise' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="vl-label">Target raise (USD M)</label>
                <input type="number" className="vl-input" value={form.target_raise_usd_m} onChange={e => set('target_raise_usd_m', e.target.value)} placeholder="e.g. 80" />
              </div>
              <div>
                <label className="vl-label">Target valuation (USD M)</label>
                <input type="number" className="vl-input" value={form.target_valuation_usd_m} onChange={e => set('target_valuation_usd_m', e.target.value)} placeholder="e.g. 250" />
              </div>
              <div className="col-span-2">
                <label className="vl-label">Company stage</label>
                <input className="vl-input" value={form.company_stage} onChange={e => set('company_stage', e.target.value)} placeholder="Seed · Series A · Growth · Project finance · …" />
              </div>
            </div>
          )}

          {form.deal_subtype === 'm_and_a' && (
            <>
              <div>
                <label className="vl-label">M&A side</label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {MA_SIDES.map(s => {
                    const active = form.ma_side === s.id
                    return (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => set('ma_side', s.id)}
                        aria-pressed={active}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                          active ? 'border-valence-blue/40 bg-valence-elevated text-valence-text shadow-sm' : 'border-valence-border bg-white/60 text-valence-muted hover:text-valence-text'
                        }`}
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="vl-label flex items-center gap-2">
                  Acquisition brief
                  <span className="text-[10px] font-normal normal-case tracking-normal text-valence-muted">
                    Type <span className="vl-kbd">[[</span> to link entities
                  </span>
                </label>
                <WikilinkTextarea
                  className="vl-input min-h-[120px] leading-relaxed"
                  value={form.acquisition_brief}
                  onChange={v => set('acquisition_brief', v)}
                  placeholder='e.g. "$100M topline IT services company, $5–10M EBITDA, serving financial services clients, NOT Web3, cybersecurity acceptable."'
                />
                <p className="mt-1 text-[11px] text-valence-muted">M&A asks are usually a spec, not a number. Be specific about what they want.</p>
              </div>
            </>
          )}

          {form.deal_subtype === 'exit' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="vl-label">Target exit (USD M)</label>
                <input type="number" className="vl-input" value={form.target_exit_usd_m} onChange={e => set('target_exit_usd_m', e.target.value)} placeholder="e.g. 320" />
              </div>
              <div>
                <label className="vl-label">Target exit valuation (USD M)</label>
                <input type="number" className="vl-input" value={form.target_exit_valuation_usd_m} onChange={e => set('target_exit_valuation_usd_m', e.target.value)} placeholder="optional" />
              </div>
              <div className="col-span-2">
                <label className="vl-label">Investor being exited</label>
                <input className="vl-input" value={form.exit_investor_name} onChange={e => set('exit_investor_name', e.target.value)} placeholder="e.g. Brookfield" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advisory-conditional block */}
      {isAdvisory && (
        <div className="space-y-3 rounded-xl border border-valence-warning/20 bg-valence-warning/5 p-4">
          <label className="vl-label flex items-center gap-2">
            Engagement brief
            <span className="text-[10px] font-normal normal-case tracking-normal text-valence-muted">
              Type <span className="vl-kbd">[[</span> to link entities
            </span>
          </label>
          <WikilinkTextarea
            className="vl-input min-h-[120px] leading-relaxed bg-valence-elevated"
            value={form.engagement_brief}
            onChange={v => set('engagement_brief', v)}
            placeholder='e.g. "Help break into Dubai market — distribution + first-customer outreach. Also exploring vending-machine product line for premium Q-commerce dark stores."'
          />
          <p className="text-[11px] text-valence-muted">What does the client actually need? Geography, vertical, product, distribution — describe it the way they said it.</p>
        </div>
      )}

      <div>
        <label className="vl-label flex items-center gap-2">
          Internal notes
          <span className="text-[10px] font-normal normal-case tracking-normal text-valence-muted">
            Type <span className="vl-kbd">[[</span> to link people / funds / mandates
          </span>
        </label>
        <WikilinkTextarea
          value={form.notes}
          onChange={v => set('notes', v)}
          className="vl-input min-h-[100px] resize-y"
          placeholder="Context, next steps, stakeholders…"
        />
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

// Power-user keyboard nav for /deals Table view. Listens at the window
// level; ignores keystrokes inside any input/textarea so partners typing
// in the search box aren't accidentally jumping rows.
//
//   j / ↓  →  move focus to next row (wraps)
//   k / ↑  →  move focus to previous row (wraps)
//   o / ↵  →  open drawer for focused row
//   Esc    →  clear row focus
function DealsKeyboardNav({ enabled, deals, focusedId, setFocusedId, onOpen }) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const idx = deals.findIndex(d => d.id === focusedId)
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        const next = idx < 0 ? 0 : (idx + 1) % deals.length
        setFocusedId(deals[next]?.id || null)
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = idx < 0 ? deals.length - 1 : (idx - 1 + deals.length) % deals.length
        setFocusedId(deals[prev]?.id || null)
      } else if (e.key === 'o' || e.key === 'Enter') {
        if (focusedId) {
          const row = deals.find(d => d.id === focusedId)
          if (row) { e.preventDefault(); onOpen(row) }
        }
      } else if (e.key === 'Escape') {
        if (focusedId) { e.preventDefault(); setFocusedId(null) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, deals, focusedId, setFocusedId, onOpen])
  return null
}
