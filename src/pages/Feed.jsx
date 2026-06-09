import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNowStrict } from 'date-fns'
import {
  Activity as ActivityIcon, MessageSquare, Briefcase, Calendar, FileText,
  Inbox, Sparkles, Loader2, ArrowUpRight, RefreshCw, Filter as FilterIcon
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import EmptyState from '../components/EmptyState.jsx'
import ConfigBanner from '../components/ConfigBanner.jsx'
// Phase 26 — paint interaction rows with the same founder/investor/general
// rail used on the Interactions page and Calendar chips. Keeps the scan
// pattern identical across pages.
import { railClass as ctyRail, chipClass as ctyChip, labelFor as ctyLabel } from '../lib/counterpartyColors.js'

// Firm-wide activity feed. Streams from five sources in parallel:
//   * activities          — anything the deal logger / brief generator stamped
//   * interactions        — newest meeting notes
//   * intake_submissions  — newest inbound submissions (AI-screened)
//   * deals               — recently created mandates
//   * daily_notes         — newest daily notes touched
//
// All five are merged into one timeline, sorted by recency, filterable by
// source. Partners read this like Bloomberg: passive awareness of what the
// firm did today.

const SOURCE_META = {
  activity:    { label: 'Activity',     icon: ActivityIcon,    color: 'text-valence-blue',     bg: 'bg-valence-blue-soft'  },
  interaction: { label: 'Interaction',  icon: MessageSquare,   color: 'text-emerald-700',      bg: 'bg-emerald-50'         },
  intake:      { label: 'Inbound',      icon: Inbox,           color: 'text-amber-700',        bg: 'bg-amber-50'           },
  deal:        { label: 'New deal',     icon: Briefcase,       color: 'text-violet-700',       bg: 'bg-violet-50'          },
  daily:       { label: 'Daily note',   icon: Calendar,        color: 'text-valence-muted',    bg: 'bg-valence-surface'    }
}

const FILTERS = [
  ['all',         'Everything'],
  ['activity',    'Deal activity'],
  ['interaction', 'Interactions'],
  ['intake',      'Inbound'],
  ['deal',        'New deals'],
  ['daily',       'Daily notes']
]

export default function Feed() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [source, setSource]   = useState('all')

  async function load() {
    if (!isSupabaseConfigured) { setItems([]); setLoading(false); return }
    setLoading(true); setError('')
    try {
      const [act, intr, intk, dl, dn] = await Promise.all([
        supabase.from('activities').select('id, deal_id, kind, body, created_at, deals(client_name)').order('created_at', { ascending: false }).limit(40),
        supabase.from('interactions').select('id, counterparty_name, counterparty_company, counterparty_type, type, outcome, notes, deal_id, created_at').order('created_at', { ascending: false }).limit(40),
        supabase.from('intake_submissions').select('id, contact_name, company_name, sector, status, ai_screener_output, created_at').order('created_at', { ascending: false }).limit(20),
        supabase.from('deals').select('id, client_name, stage, sector, deal_types, deal_subtype, created_at, lead_owner').order('created_at', { ascending: false }).limit(15),
        supabase.from('daily_notes').select('user_id, date, body, updated_at').order('updated_at', { ascending: false }).limit(15)
      ])
      const merged = []
      for (const a of (act.data || [])) merged.push({
        id: `a-${a.id}`,
        source: 'activity',
        title: a.deals?.client_name ? `${a.deals.client_name} · ${labelKind(a.kind)}` : labelKind(a.kind),
        body:  a.body || '',
        to:    a.deal_id ? `/deals?open=${a.deal_id}` : '/deals',
        at:    a.created_at
      })
      for (const i of (intr.data || [])) merged.push({
        id: `i-${i.id}`,
        source: 'interaction',
        title: `${i.counterparty_name || 'Contact'} · ${labelKind(i.type)}`,
        body:  i.notes ? trim(i.notes, 200) : (i.outcome ? `Outcome: ${labelKind(i.outcome)}` : ''),
        to:    i.deal_id ? `/deals?open=${i.deal_id}` : '/interactions',
        at:    i.created_at,
        // Surfaces the rail colour + counterparty chip on the feed row.
        cty:   i.counterparty_type || null,
        meta:  { outcome: i.outcome, company: i.counterparty_company }
      })
      for (const s of (intk.data || [])) merged.push({
        id: `s-${s.id}`,
        source: 'intake',
        title: `${s.company_name || 'Inbound submission'} · ${s.sector || 'unsectored'}`,
        body:  s.ai_screener_output?.one_line || `From ${s.contact_name || 'unknown'} — status ${s.status || 'new'}`,
        to:    '/inbox/intake',
        at:    s.created_at,
        meta:  { verdict: s.ai_screener_output?.verdict, score: s.ai_screener_output?.score }
      })
      for (const d of (dl.data || [])) merged.push({
        id: `d-${d.id}`,
        source: 'deal',
        title: `${d.client_name} · ${d.stage || 'new'}`,
        body:  [d.sector, dealTypeLabel(d), d.lead_owner ? `lead ${d.lead_owner}` : null].filter(Boolean).join(' · '),
        to:    `/deals?open=${d.id}`,
        at:    d.created_at
      })
      for (const n of (dn.data || [])) {
        if (!n.body?.trim()) continue
        merged.push({
          id: `n-${n.user_id}-${n.date}`,
          source: 'daily',
          title: `Daily note · ${n.date}`,
          body:  trim(stripWikilinks(n.body), 220),
          to:    '/',
          at:    n.updated_at
        })
      }
      merged.sort((a, b) => new Date(b.at) - new Date(a.at))
      setItems(merged)
    } catch (e) {
      setError(e?.message || 'Feed failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (source === 'all') return items
    return items.filter(i => i.source === source)
  }, [items, source])

  return (
    <div className="space-y-5">
      <ConfigBanner />

      <section className="vl-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
              <ActivityIcon className="h-3 w-3 text-valence-blue" /> Firm pulse
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-valence-text">
              Everything the firm did, in order.
            </h2>
            <p className="mt-1 text-[12px] text-valence-muted">
              Interactions, new deals, inbound submissions, deal activity, daily notes. Updated as you reload.
            </p>
          </div>
          <button onClick={load} className="vl-btn-secondary text-[12px]" disabled={loading}>
            {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Refreshing</> : <><RefreshCw className="h-3.5 w-3.5" /> Refresh</>}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-valence-subtle">
            <FilterIcon className="inline h-3 w-3 mr-1" /> Show
          </span>
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSource(id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                source === id
                  ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-blue'
                  : 'border-valence-border bg-valence-surface text-valence-muted hover:text-valence-text'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-[11px] tabular-nums text-valence-subtle">{filtered.length} item{filtered.length === 1 ? '' : 's'}</span>
        </div>
      </section>

      {error && (
        <p className="rounded-lg border border-valence-danger/30 bg-valence-danger/10 px-3 py-2 text-[12px] text-valence-danger">{error}</p>
      )}

      {loading && items.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-valence-surface animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ActivityIcon} title="No activity yet" description="As the team logs interactions, generates briefs, and moves deals, this stream lights up. Load a sample firm from Settings → Data to preview a populated feed." />
      ) : (
        <ul className="space-y-1.5">
          {filtered.map(it => <FeedRow key={it.id} item={it} />)}
        </ul>
      )}
    </div>
  )
}

function FeedRow({ item }) {
  const meta = SOURCE_META[item.source] || SOURCE_META.activity
  const Icon = meta.icon
  return (
    <li>
      <Link
        to={item.to || '#'}
        className={`group flex items-start gap-3 rounded-xl border border-valence-border bg-valence-elevated px-4 py-3 transition hover:border-valence-border-strong hover:shadow-valence ${item.cty ? ctyRail(item.cty) : ''}`}
      >
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${meta.bg} ${meta.color} ring-1 ring-valence-border`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-semibold text-valence-text truncate group-hover:text-valence-blue transition">{item.title}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="inline-flex items-center rounded-full border border-valence-border bg-valence-surface px-1.5 py-0 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-valence-muted">
                {meta.label}
              </span>
              {item.cty && (
                <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[9.5px] font-semibold uppercase tracking-[0.14em] ${ctyChip(item.cty)}`}>
                  {ctyLabel(item.cty)}
                </span>
              )}
              {item.meta?.verdict && (
                <span className={`inline-flex items-center rounded-full px-1.5 py-0 text-[9.5px] font-semibold uppercase tracking-[0.14em] ${
                  item.meta.verdict === 'pursue' ? 'border border-emerald-300/50 bg-emerald-50 text-emerald-700'
                : item.meta.verdict === 'pass'   ? 'border border-rose-300/50 bg-rose-50 text-rose-700'
                :                                   'border border-amber-300/50 bg-amber-50 text-amber-700'
                }`}>
                  {item.meta.verdict} · {item.meta.score}
                </span>
              )}
            </div>
          </div>
          {item.body && <p className="mt-0.5 text-[12px] leading-relaxed text-valence-muted line-clamp-2">{item.body}</p>}
          <p className="mt-1 text-[10.5px] text-valence-subtle">
            {item.at ? formatDistanceToNowStrict(new Date(item.at), { addSuffix: true }) : ''}
          </p>
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 text-valence-subtle opacity-0 group-hover:opacity-100 transition shrink-0 mt-1" />
      </Link>
    </li>
  )
}

function labelKind(k) {
  return String(k || '').replace(/_/g, ' ')
}
// Readable deal-type from the live model (deal_subtype + deal_types[]); the
// legacy singular `deal_type` column is no longer written.
function dealTypeLabel(d) {
  if (d.deal_subtype === 'm_and_a')  return 'M&A'
  if (d.deal_subtype === 'fundraise') return 'Fundraise'
  if (d.deal_subtype === 'exit')      return 'Exit'
  const types = d.deal_types || []
  if (types.includes('advisory'))     return 'Advisory'
  if (types.includes('transaction'))  return 'Transaction'
  return null
}
function trim(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
function stripWikilinks(body) {
  return String(body || '').replace(/\[\[(?:person|fund|mandate|note):[^|\]\s]+(?:\|([^\]]+))?\]\]/gi, (_, n) => n || '@')
}
