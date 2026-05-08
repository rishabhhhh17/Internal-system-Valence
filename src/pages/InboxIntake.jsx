import { useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { Inbox, Filter, Sparkles, Check, X, AlertTriangle, ArrowRight, ExternalLink } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { useToast } from '../components/Toast.jsx'

const STATUSES = ['new', 'reviewed', 'converted', 'passed', 'spam']

export default function InboxIntake() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('new')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setLoadError(null)
    if (!isSupabaseConfigured) { setRows(DEMO_INTAKES); setLoading(false); return }
    try {
      const { data, error } = await supabase.from('intake_submissions').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setRows(data || [])
    } catch (err) {
      console.error(err)
      setLoadError(err?.message || 'Couldn\'t load intake queue.')
    } finally { setLoading(false) }
  }

  async function setStatus(row, status) {
    if (!isSupabaseConfigured) {
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, status } : r))
      return
    }
    const { error } = await supabase.from('intake_submissions').update({ status }).eq('id', row.id)
    if (error) return toast.error(error.message)
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, status } : r))
    toast.success(`Marked ${status}`)
  }

  function convertToDeal(row) {
    const params = new URLSearchParams({
      new: '1',
      client_name: row.company_name || '',
      sector: row.sector || '',
      stage: 'Origination',
      // legacy
      side:   row.deal_side || 'Sell-side',
      ticket_size_usd_m: row.ev_ask_usd_m || '',
      // new deal-type model
      deal_types:    Array.isArray(row.deal_types) ? row.deal_types.join(',') : '',
      deal_subtype:  row.deal_subtype || '',
      ma_side:       row.ma_side || '',
      acquisition_brief: row.acquisition_brief || '',
      engagement_brief:  row.engagement_brief  || '',
      target_raise_usd_m:    row.target_raise_usd_m    ?? '',
      target_valuation_usd_m: row.target_valuation_usd_m ?? '',
      company_stage:         row.company_stage         || '',
      target_exit_usd_m:     row.target_exit_usd_m     ?? '',
      target_exit_valuation_usd_m: row.target_exit_valuation_usd_m ?? '',
      exit_investor_name:    row.exit_investor_name    || '',
      notes: [
        row.situation || '',
        row.contact_name ? `Contact: ${row.contact_name} <${row.contact_email}>` : '',
        row.deck_url ? `Deck: ${row.deck_url}` : ''
      ].filter(Boolean).join('\n')
    })
    setStatus(row, 'converted')
    window.location.href = `/deals?${params.toString()}`
  }

  const filtered = useMemo(() => rows.filter(r => statusFilter === 'all' || r.status === statusFilter), [rows, statusFilter])

  return (
    <div className="space-y-6">
      <ConfigBanner />

      <div>
        <p className="vl-eyebrow-ink">Intake review</p>
        <h1 className="mt-2 font-display text-feature font-bold text-valence-text">Inbound submissions.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-valence-muted">
          Public intake form at <span className="vl-kbd">/intake</span>. Each submission gets the AI Mandate-Fit verdict pre-attached. Convert promising ones into pipeline deals; pass the rest with a clean status.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Filter className="h-3 w-3" /> Status</span>
        {['all', ...STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize transition ${
              statusFilter === s
                ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text'
                : 'border-valence-border bg-white text-valence-muted hover:text-valence-text'
            }`}
          >{s}</button>
        ))}
      </div>

      {loading ? (
        <div className="vl-card p-8 text-sm text-valence-muted">Loading inbox…</div>
      ) : loadError ? (
        <EmptyState icon={Inbox} title="Couldn't load intake" description={loadError} action={<button onClick={load} className="vl-btn-primary">Retry</button>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Inbox} title="Inbox is clear" description="Nothing to triage in this status." />
      ) : (
        <ul className="space-y-4">
          {filtered.map(r => <SubmissionCard key={r.id} row={r} onStatus={setStatus} onConvert={convertToDeal} />)}
        </ul>
      )}
    </div>
  )
}

function SubmissionCard({ row, onStatus, onConvert }) {
  const verdict = row.ai_screener_output?.verdict
  const verdictTone = ({ pursue: 'border-valence-success/30 bg-valence-success/10 text-valence-success', pass: 'border-valence-danger/30 bg-valence-danger/10 text-valence-danger', watch: 'border-valence-warning/30 bg-valence-warning/10 text-valence-warning' })[verdict] || 'border-valence-border bg-valence-surface text-valence-muted'
  const types = Array.isArray(row.deal_types) ? row.deal_types : []
  const subtypeLabel = row.deal_subtype === 'm_and_a' ? 'M&A' : (row.deal_subtype || '').replace(/_/g, ' ')
  const askChip = (() => {
    if (row.deal_subtype === 'fundraise' && row.target_raise_usd_m) return `Raise USD ${row.target_raise_usd_m}M${row.target_valuation_usd_m ? ` @ USD ${row.target_valuation_usd_m}M val` : ''}`
    if (row.deal_subtype === 'exit'      && row.target_exit_usd_m)  return `Exit USD ${row.target_exit_usd_m}M${row.exit_investor_name ? ` · ${row.exit_investor_name}` : ''}`
    if (row.deal_subtype === 'm_and_a')                              return `M&A · ${row.ma_side === 'buy' ? 'Buy-side' : row.ma_side === 'sell' ? 'Sell-side' : row.ma_side === 'undecided' ? 'Side TBD' : ''}`.trim()
    if (row.ev_ask_usd_m) return `USD ${row.ev_ask_usd_m}M EV`
    return null
  })()
  return (
    <li className="vl-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-base font-semibold text-valence-text">{row.company_name}</h2>
            {row.sector && <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-0.5 text-[11px] text-valence-muted">{row.sector}</span>}
            {types.map(t => (
              <span key={t} className="rounded-full border border-valence-blue/30 bg-valence-blue-soft px-2 py-0.5 text-[11px] capitalize text-valence-blue">{t}</span>
            ))}
            {subtypeLabel && <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-0.5 text-[11px] capitalize text-valence-muted">{subtypeLabel}</span>}
            {askChip && <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-0.5 text-[11px] text-valence-muted">{askChip}</span>}
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${verdictTone}`}>AI: {verdict || 'no verdict'}</span>
          </div>
          <p className="mt-1 text-[11px] text-valence-muted">
            From <span className="font-semibold text-valence-text">{row.contact_name}</span> &lt;{row.contact_email}&gt;
            {row.contact_phone ? ` · ${row.contact_phone}` : ''} · {row.source || 'unknown source'} · {formatDistanceToNowStrict(new Date(row.created_at), { addSuffix: true })}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-valence-subtle">Status</span>
          <span className="rounded-full border border-valence-border bg-white px-2 py-0.5 font-semibold capitalize text-valence-muted">{row.status}</span>
        </div>
      </div>

      {row.acquisition_brief && (
        <div className="mt-3 rounded-lg border border-valence-border bg-valence-surface/60 px-3 py-2">
          <p className="vl-eyebrow-ink">Acquisition brief</p>
          <p className="mt-1 text-[13px] leading-relaxed text-valence-text whitespace-pre-wrap">{row.acquisition_brief}</p>
        </div>
      )}
      {row.engagement_brief && (
        <div className="mt-3 rounded-lg border border-valence-warning/30 bg-valence-warning/5 px-3 py-2">
          <p className="vl-eyebrow-ink">Engagement brief</p>
          <p className="mt-1 text-[13px] leading-relaxed text-valence-text whitespace-pre-wrap">{row.engagement_brief}</p>
        </div>
      )}
      {row.situation && <p className="mt-3 text-sm leading-relaxed text-valence-muted whitespace-pre-wrap">{row.situation}</p>}

      {row.ai_screener_output?.lines?.length > 0 && (
        <div className="mt-3 rounded-lg border border-valence-blue/30 bg-valence-blue-soft/30 p-3">
          <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-valence-blue" /> AI screen</p>
          {row.ai_screener_output.one_line && <p className="mt-1.5 text-sm text-valence-text">{row.ai_screener_output.one_line}</p>}
          <ol className="mt-2 list-decimal pl-5 space-y-1 text-[12px] leading-relaxed text-valence-muted">
            {row.ai_screener_output.lines.slice(0, 5).map((l, i) => l ? <li key={i}>{l}</li> : null)}
          </ol>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {row.deck_url && <a href={row.deck_url} target="_blank" rel="noreferrer" className="vl-btn-ghost text-[11px]"><ExternalLink className="h-3 w-3" /> Open deck</a>}
        <button onClick={() => onConvert(row)} className="vl-btn-primary text-[11px]"><ArrowRight className="h-3 w-3" /> Convert to deal</button>
        <button onClick={() => onStatus(row, 'passed')} className="vl-btn-secondary text-[11px]"><X className="h-3 w-3" /> Pass</button>
        <button onClick={() => onStatus(row, 'reviewed')} className="vl-btn-secondary text-[11px]"><Check className="h-3 w-3" /> Mark reviewed</button>
        <button onClick={() => onStatus(row, 'spam')} className="vl-btn-ghost text-[11px] text-valence-muted"><AlertTriangle className="h-3 w-3" /> Spam</button>
      </div>
    </li>
  )
}

const DEMO_INTAKES = [
  {
    id: 'in1', company_name: 'Crescent Pharma', contact_name: 'Arvind Kulkarni', contact_email: 'arvind@crescentpharma.in',
    sector: 'Healthcare', source: 'Referral', status: 'new', created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    deal_types: ['transaction'], deal_subtype: 'm_and_a', ma_side: 'sell',
    acquisition_brief: 'Carve-out of OTC division. EBITDA ~USD 18M. Looking for strategic acquirers in EU + US with OTC distribution.',
    situation: 'Carve-out of OTC division. Looking for a sell-side advisor with healthcare buyer relationships in EU + US.',
    deal_side: 'Sell-side', ev_ask_usd_m: 220,
    ai_screener_output: { verdict: 'pursue', score: 78, one_line: 'Strong fit — healthcare carve-outs sit squarely in our sweet spot.', lines: [
      'Healthcare matches our top-three sectors.', 'Ticket band is right at our centre of gravity (USD 220M).',
      'Carve-out from a listed parent — clear motivation, real timeline.', 'Risk: parent board approvals can stall sell-sides.', 'Recommend a 30-min intro with Neha; loop in Oliver if it advances.'
    ] }
  },
  {
    id: 'in2', company_name: 'Brightline Mobility', contact_name: 'Anuj Goyal', contact_email: 'anuj@brightline.io',
    sector: 'Mobility', source: 'Found you online', status: 'new', created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    deal_types: ['transaction'], deal_subtype: 'fundraise',
    target_raise_usd_m: 35, target_valuation_usd_m: 140, company_stage: 'Series B',
    situation: 'Series B — looking for sector-specialist advisor.',
    deal_side: 'Capital raise', ev_ask_usd_m: 35,
    ai_screener_output: { verdict: 'watch', score: 48, one_line: 'Below our typical band — interesting but unlikely to clear our minimum.', lines: [
      'Mobility is adjacent to our Infrastructure book.', 'Raise size USD 35M is below our USD 50M threshold.',
      'Founder is reasonable — would consider for a Series C revisit.', 'Risk: opportunity cost given our Q3 capacity.', 'Pass politely, offer to revisit at Series C with a stronger thesis.'
    ] }
  },
  {
    id: 'in3', company_name: 'Saffron Studios', contact_name: 'Manav Kapoor', contact_email: 'manav@saffronstudios.in',
    sector: 'Media', source: 'Existing relationship', status: 'new', created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    deal_types: ['advisory'],
    engagement_brief: 'Need a partner who can help us raise project finance for the next slate — equity capital, not debt. Five films over two years, Hindi + regional. Looking for non-dilutive structures with revenue-share kickers.',
    situation: 'Slate financing for a film studio. Equity, not debt. Open to creative structures.',
    deal_side: 'Strategic advisory',
    ai_screener_output: { verdict: 'pursue', score: 65, one_line: 'Adjacent to our existing media work — worth a meeting.', lines: [
      'Slate financing isn\'t a vanilla raise — falls under advisory.', 'We\'ve done media work; the partner network exists.',
      'Project finance for content is a niche but solvable problem.', 'Risk: revenue-share structures take longer to paper.', 'Recommend an exploratory chat with Manav before committing.'
    ] }
  }
]
