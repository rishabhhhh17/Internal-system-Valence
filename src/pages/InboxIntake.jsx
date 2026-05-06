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
      client_name: row.company_name,
      sector: row.sector || '',
      side:   row.deal_side || 'Sell-side',
      stage:  'Origination',
      ticket_size_usd_m: row.ev_ask_usd_m || '',
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
  return (
    <li className="vl-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-base font-semibold text-valence-text">{row.company_name}</h2>
            {row.sector && <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-0.5 text-[11px] text-valence-muted">{row.sector}</span>}
            {row.deal_side && <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-0.5 text-[11px] text-valence-muted">{row.deal_side}</span>}
            {row.ev_ask_usd_m && <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-0.5 text-[11px] text-valence-muted">USD {row.ev_ask_usd_m}M EV</span>}
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
    sector: 'Healthcare', deal_side: 'Sell-side', ev_ask_usd_m: 220, situation: 'Carve-out of OTC division. Looking for a sell-side advisor with healthcare buyer relationships in EU + US.',
    source: 'Referral', status: 'new', created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    ai_screener_output: { verdict: 'pursue', score: 78, one_line: 'Strong fit — healthcare carve-outs sit squarely in our sweet spot.', lines: [
      'Healthcare matches our top-three sectors.', 'Ticket band is right at our centre of gravity (USD 220M).',
      'Carve-out from a listed parent — clear motivation, real timeline.', 'Risk: parent board approvals can stall sell-sides.', 'Recommend a 30-min intro with Neha; loop in Oliver if it advances.'
    ] }
  },
  {
    id: 'in2', company_name: 'Brightline Mobility', contact_name: 'Anuj Goyal', contact_email: 'anuj@brightline.io',
    sector: 'Mobility', deal_side: 'Capital raise', ev_ask_usd_m: 35, situation: 'Series B — looking for sector-specialist advisor.',
    source: 'Found you online', status: 'new', created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    ai_screener_output: { verdict: 'watch', score: 48, one_line: 'Below our typical band — interesting but unlikely to clear our minimum.', lines: [
      'Mobility is adjacent to our Infrastructure book.', 'Cheque size USD 35M is below our USD 50M threshold.',
      'Founder is reasonable — would consider for a Series C revisit.', 'Risk: opportunity cost given our Q3 capacity.', 'Pass politely, offer to revisit at Series C with a stronger thesis.'
    ] }
  }
]
