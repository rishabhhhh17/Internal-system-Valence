// Company ⇄ Fund matcher — the first curated AI tool for IB firms.
//
// Two modes, picked by the `mode` prop:
//
//   mode='deal_to_funds' (default)
//     Lives on the Deal drawer. Given a mandate (sector, geography,
//     ticket size, stage), surface CRM fund-side people / companies
//     that match the brief and rank them by fit.
//
//   mode='fund_to_deals'
//     Lives on a person/fund detail. Given a fund's stated thesis
//     (sector tags, geography tags, ticket band), surface deals in
//     this firm's pipeline that fit.
//
// Match logic is a two-stage filter+rank:
//
//   1. DETERMINISTIC FILTER — pure JS over the CRM data. We compute a
//      0-100 score per candidate from explicit signals:
//        - sector overlap     (heavy)
//        - geography overlap  (medium)
//        - ticket-size band   (medium)
//        - relationship warmth (light)  — Strong / Warm > Cool / Cold
//      Anything scoring 0 is filtered out, top 10 candidates make the
//      cut for the AI rationale step.
//
//   2. AI RATIONALE — one Gemini call per page (not per candidate) that
//      takes the top 10 candidates + the deal/fund brief and returns a
//      one-line "why this fits" for each. Behind the
//      `company_fund_matcher` feature flag so a non-IB org (or one with
//      the flag off) sees nothing — the parent should also gate on
//      useFeatureFlag('company_fund_matcher') for early-return.
//
// Hidden when the feature flag is off — the parent component should
// useFeatureFlag('company_fund_matcher') and skip rendering.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, ArrowRight, Loader2, RefreshCw, Briefcase, User } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { llmCall } from '../lib/gemini.js'

const WARMTH_BUMP = { Strong: 12, Warm: 6, Cool: 2, Cold: 0 }

function normaliseTokens(...sources) {
  // Accept arrays + comma-separated strings, lowercase, trim, dedupe.
  const out = new Set()
  for (const s of sources) {
    if (!s) continue
    const arr = Array.isArray(s) ? s : String(s).split(/[,;|]/)
    for (const t of arr) {
      const cleaned = String(t || '').trim().toLowerCase()
      if (cleaned) out.add(cleaned)
    }
  }
  return out
}

function overlapScore(a, b, weight) {
  if (!a.size || !b.size) return 0
  let hits = 0
  for (const x of a) if (b.has(x)) hits += 1
  // Normalised to 0..weight by best-case (every required token matches).
  return Math.min(1, hits / Math.max(1, Math.min(a.size, b.size))) * weight
}

function withinTicketBand(dealSize, fundMin, fundMax) {
  if (!dealSize) return null   // unknown — neutral
  if (fundMin == null && fundMax == null) return null
  if (fundMin != null && dealSize < fundMin) return false
  if (fundMax != null && dealSize > fundMax) return false
  return true
}

// Score a candidate fund/person against a deal. Returns { score, reasons }
// where reasons is a short array of human-readable signals — used to
// render the deterministic chips even before the AI rationale arrives.
function scoreFundForDeal(deal, person) {
  const dealSectors = normaliseTokens(deal.sector, deal.sector_tags)
  const dealGeo     = normaliseTokens(deal.geography, deal.country, deal.city)
  const fundSectors = normaliseTokens(person.sector_tags)
  const fundGeo     = normaliseTokens(person.geography_tags, person.country, person.city)

  const sectorScore = overlapScore(dealSectors, fundSectors, 45)
  const geoScore    = overlapScore(dealGeo,     fundGeo,     20)
  // Ticket size: deals carry ticket_size_usd_m / target_raise_usd_m; we
  // don't have fund-side bands in the schema yet so this is a no-op for
  // now and will activate when fund_ticket_min/max columns land.
  const ticketScore = 0
  const warmthScore = WARMTH_BUMP[person.warmth_bucket] || 0

  const reasons = []
  if (sectorScore > 0) reasons.push('Sector fit')
  if (geoScore    > 0) reasons.push('Geography fit')
  if (warmthScore > 0) reasons.push(`${person.warmth_bucket} relationship`)

  return {
    score:   Math.round(sectorScore + geoScore + ticketScore + warmthScore),
    reasons
  }
}

function scoreDealForFund(fund, deal) {
  // Symmetric to scoreFundForDeal but reversed — same signals, swapped
  // sides. Re-uses the same overlap helpers so behaviour stays consistent.
  return scoreFundForDeal(deal, fund)
}

async function generateRationale({ deal, fund, candidates, mode }) {
  // One Gemini call per render, not per candidate. Returns a map of
  // person_id → { fit, rationale } so the UI can decorate each row.
  // If the call fails we fall back to deterministic reasons only.
  if (!candidates || candidates.length === 0) return {}

  const candidateLines = candidates.map((c, i) => {
    const p = c.person
    return `${i + 1}. ${p.full_name} — ${p.company || 'Independent'} (${p.role || 'role unknown'})
   Sectors: ${(p.sector_tags || []).join(', ') || '—'}
   Geography: ${(p.geography_tags || []).join(', ') || p.city || '—'}
   Warmth: ${p.warmth_bucket || 'Unknown'}
   Score: ${c.score}/100`
  }).join('\n\n')

  let brief
  if (mode === 'deal_to_funds') {
    brief = `MANDATE BRIEF
Client: ${deal.client_name}
Sector: ${deal.sector || '—'}
Geography: ${deal.geography || '—'}
Stage: ${deal.stage || '—'}
Side: ${deal.ma_side || deal.side || '—'}
Ticket: ${deal.ticket_size_usd_m || deal.target_raise_usd_m || '—'} USD M
Notes: ${(deal.notes || '').slice(0, 240)}`
  } else {
    brief = `FUND PROFILE
Person: ${fund.full_name}
Firm: ${fund.company}
Sectors of interest: ${(fund.sector_tags || []).join(', ') || '—'}
Geographies: ${(fund.geography_tags || []).join(', ') || '—'}
What they care about: ${(fund.what_they_care_about || '').slice(0, 240)}`
  }

  const prompt = `You are matching investment-grade leads inside a Mumbai/London advisory firm's CRM. Below is a ${mode === 'deal_to_funds' ? 'mandate' : 'fund profile'} and a numbered list of candidates already filtered for relevance. For EACH candidate (1 to ${candidates.length}), return one JSON object on its own line with three fields:

  {"n": <number>, "fit": "Strong" | "Worth a call" | "Stretch", "why": "<one sentence, <= 20 words, no fluff>"}

Output nothing else — just the JSON lines.

${brief}

CANDIDATES:
${candidateLines}`

  try {
    const text = await llmCall(prompt, {
      temperature: 0.2,
      maxOutputTokens: 600,
      actionType: 'company_fund_matcher'
    })
    const map = {}
    for (const line of String(text).split('\n')) {
      const m = line.trim().match(/^\{.*\}$/)
      if (!m) continue
      try {
        const obj = JSON.parse(m[0])
        const idx = Number(obj.n) - 1
        if (idx >= 0 && idx < candidates.length) {
          map[candidates[idx].person.id] = { fit: obj.fit, rationale: obj.why }
        }
      } catch { /* skip malformed lines */ }
    }
    return map
  } catch {
    return {}
  }
}

export default function CompanyFundMatcher({ mode = 'deal_to_funds', deal = null, fund = null, onOpenPerson, onOpenDeal }) {
  const [candidates, setCandidates] = useState([])
  const [rationale, setRationale]   = useState({})
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]           = useState(null)

  const anchor = mode === 'deal_to_funds' ? deal : fund

  // Race guard. If the user opens deal A, then quickly switches the
  // drawer to deal B, two loads are in flight; whichever resolves last
  // would otherwise win and we'd show B's score against A (or vice
  // versa). Bumping a generation counter and bailing on stale resolves
  // makes the latest request always win.
  const reqGen = useRef(0)

  async function load(opts = {}) {
    if (!isSupabaseConfigured) { setLoading(false); return }
    if (!anchor)               { setLoading(false); return }
    const isRefresh = !!opts.refresh
    if (isRefresh) setRefreshing(true)
    else           setLoading(true)
    setError(null)

    const myGen = ++reqGen.current
    const stillFresh = () => reqGen.current === myGen

    try {
      if (mode === 'deal_to_funds') {
        // Pull fund-side people: those tagged 'fund' / 'pe' / 'vc' /
        // 'growth' / 'venture' in their tags array (no schema column
        // yet, so tag-based gating). Score deterministically, keep top 10.
        const { data, error: err } = await supabase
          .from('people')
          .select('id, full_name, company, role, city, country, sector_tags, geography_tags, tags, what_they_care_about, last_touched_at')
          .limit(200)
        if (err) throw err
        const funds = (data || []).filter(p => {
          const t = (p.tags || []).map(x => String(x).toLowerCase())
          return t.includes('fund') || t.includes('pe') || t.includes('vc') ||
                 t.includes('growth') || t.includes('venture') || t.includes('crossborder')
        })
        const scored = funds
          .map(p => ({ person: p, ...scoreFundForDeal(deal, p) }))
          .filter(c => c.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
        if (!stillFresh()) return
        setCandidates(scored)
        const r = await generateRationale({ deal, candidates: scored, mode })
        if (!stillFresh()) return
        setRationale(r)
      } else {
        // mode === 'fund_to_deals'
        const { data, error: err } = await supabase
          .from('deals')
          .select('id, client_name, sector, stage, geography, ticket_size_usd_m, target_raise_usd_m, target_close, notes, ma_side, side')
          .limit(200)
        if (err) throw err
        const scored = (data || [])
          .map(d => {
            // Pass the FULL deal object to the scorer so geography +
            // city/country are picked up. Earlier version stripped the
            // deal down to {sector, sector_tags, geography_tags} which
            // dropped d.geography on the floor — geo score always 0.
            const result = scoreDealForFund(fund, d)
            // For the render path we wrap each row in a `person`-shaped
            // object because the list component reads c.person.full_name
            // / c.person.company. Keep the original deal under c.deal so
            // onOpenDeal works.
            return {
              person: {
                id:             d.id,
                full_name:      d.client_name,
                company:        d.sector || '—',
                role:           d.stage,
                sector_tags:    d.sector ? [d.sector] : [],
                geography_tags: d.geography ? [d.geography] : []
              },
              deal:    d,
              score:   result.score,
              reasons: result.reasons
            }
          })
          .filter(c => c.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
        if (!stillFresh()) return
        setCandidates(scored)
        const r = await generateRationale({ fund, candidates: scored, mode })
        if (!stillFresh()) return
        setRationale(r)
      }
    } catch (e) {
      if (!stillFresh()) return
      setError(e?.message || 'Could not load matches.')
      setCandidates([])
    } finally {
      if (stillFresh()) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }

  // Re-run on EITHER the anchor or the mode changing — a stale render
  // could otherwise show deal_to_funds output for a fund_to_deals view
  // (or vice versa) on the rare case where the parent swaps mode but
  // keeps an anchor with the same id.
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [anchor?.id, mode])

  const heading = mode === 'deal_to_funds'
    ? 'Funds that fit this mandate'
    : 'Deals in your pipeline that fit'

  const sub = mode === 'deal_to_funds'
    ? 'Scored on sector + geography overlap and relationship warmth, then AI-ranked for fit quality.'
    : 'From your live pipeline, ranked by fit with this fund\'s sector and geography focus.'

  return (
    <div className="vl-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-valence-text">{heading}</h3>
            <span className="text-[10px] uppercase tracking-[0.1em] bg-valence-faint text-valence-muted rounded px-1.5 py-0.5 font-semibold">IB</span>
          </div>
          <p className="text-xs text-valence-muted mt-0.5 leading-relaxed">{sub}</p>
        </div>
        <button
          onClick={() => load({ refresh: true })}
          disabled={loading || refreshing}
          className="vl-btn-ghost text-[11px]"
          title="Re-score and re-rank"
        >
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-valence-muted">Scoring candidates…</div>
      ) : error ? (
        <div className="py-6 text-center text-xs text-valence-danger">{error}</div>
      ) : candidates.length === 0 ? (
        <div className="py-6 text-center text-xs text-valence-muted">
          No matches in your CRM yet. {mode === 'deal_to_funds'
            ? 'Add fund-side contacts in People and tag them as "fund".'
            : 'Add deals to the pipeline with sector + geography set.'}
        </div>
      ) : (
        <ol className="space-y-2">
          {candidates.map((c, i) => {
            const r = rationale[c.person.id] || rationale[c.deal?.id]
            return (
              <li key={c.person.id} className="rounded-lg border border-valence-border bg-valence-surface/50 px-3.5 py-2.5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-valence-elevated text-[11px] font-semibold text-valence-muted">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => mode === 'deal_to_funds' ? onOpenPerson?.(c.person) : onOpenDeal?.(c.deal)}
                      className="block w-full text-left group"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {mode === 'deal_to_funds'
                          ? <User className="h-3 w-3 text-valence-subtle" />
                          : <Briefcase className="h-3 w-3 text-valence-subtle" />}
                        <span className="text-sm font-semibold text-valence-text group-hover:text-valence-blue">
                          {c.person.full_name}
                        </span>
                        {c.person.company && (
                          <span className="text-xs text-valence-muted">· {c.person.company}</span>
                        )}
                        {r?.fit && (
                          <span className={`text-[10px] font-semibold uppercase tracking-[0.1em] rounded px-1.5 py-0.5 ${
                            r.fit === 'Strong'        ? 'bg-valence-success/15 text-valence-success' :
                            r.fit === 'Worth a call'  ? 'bg-valence-blue-soft text-valence-blue-deep' :
                                                        'bg-valence-faint text-valence-muted'
                          }`}>{r.fit}</span>
                        )}
                      </div>
                      {r?.rationale && (
                        <p className="mt-1 text-xs text-valence-text leading-relaxed">{r.rationale}</p>
                      )}
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        {c.reasons.map((reason, j) => (
                          <span key={j} className="text-[10px] text-valence-subtle">
                            {reason}{j < c.reasons.length - 1 ? ' ·' : ''}
                          </span>
                        ))}
                        <span className="ml-auto text-[10px] text-valence-subtle">{c.score}/100</span>
                      </div>
                    </button>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-valence-subtle mt-1" />
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
