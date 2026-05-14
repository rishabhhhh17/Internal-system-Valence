// AI Quick Screener — two modes.
// Mode A · Fund-Match: a Valence client is raising. Score the firm's universe of funds
//   against the deal and return ranked matches with reasoning.
// Mode B · Mandate-Fit: an inbound teaser arrives. Verdict against Valence's
//   mandate criteria — is this worth pursuing?

import { geminiKey, isGeminiConfigured } from './gemini.js'
import { matchFundsForDeal, screenerModeForDeal, audienceLabelFor } from './funds.js'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

async function gemini(prompt, { temperature = 0.4, maxOutputTokens = 700 } = {}) {
  if (!isGeminiConfigured) throw new Error('Gemini API key not configured')
  const res = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens, responseMimeType: 'application/json' }
    })
  })
  if (!res.ok) throw new Error(`Gemini error ${res.status}`)
  const json = await res.json()
  const txt = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  try { return JSON.parse(txt) } catch { return { raw: txt } }
}

// --------- Mode A: Fund-Match ----------
// Always seed the model with our heuristic ranking so output stays grounded in
// Valence's own fund universe. The model's job is reasoning + final ranking.
//
// Phase 3.2: branch by deal subtype.
//   fundraise → "rank investors who'll write checks"
//   m_and_a   → "rank likely acquirers" (strategic + PE thesis match)
//   exit      → "rank secondary buyers" (large PE / sovereigns)
//   advisory  → not applicable (caller should short-circuit; we still return
//               an empty result for safety)
export async function screenForFundsAI({ deal, funds, topN = 8 }) {
  const mode = screenerModeForDeal(deal)
  if (!mode) {
    return { matches: [], reasoning: 'Fund-match is not applicable for advisory mandates.', mode: null }
  }
  if (!Array.isArray(funds) || funds.length === 0) {
    return { matches: [], reasoning: 'No fund universe to screen against.', mode }
  }
  const heuristic = matchFundsForDeal(funds, deal, { limit: 20, mode })
  const audience = audienceLabelFor(mode)

  if (!isGeminiConfigured) {
    return {
      mode,
      matches: heuristic.slice(0, topN).map(m => ({
        fund_id: m.fund.id,
        fund_name: m.fund.name,
        score: m.score,
        reasons: m.reasons
      })),
      reasoning: 'Heuristic ranking only — Gemini key not configured.'
    }
  }

  const prompt = buildFundMatchPrompt({ deal, heuristic, mode, audience, topN })
  const result = await gemini(prompt, { temperature: 0.35, maxOutputTokens: 1200 })

  // Re-attach fund_id by name match so the UI can wire to deal_fund_pings.
  const byName = new Map(heuristic.map(h => [h.fund.name.toLowerCase(), h.fund.id]))
  const matches = (result.matches || []).map(m => ({
    fund_id: byName.get((m.fund_name || '').toLowerCase()) || null,
    fund_name: m.fund_name,
    score: m.score,
    reasons: m.reasons || []
  }))
  return { matches, reasoning: result.summary || '', mode }
}

function buildFundMatchPrompt({ deal, heuristic, mode, audience, topN }) {
  const dealBlock = describeDealForPrompt(deal, mode)
  const candidatesBlock = heuristic.map(h => {
    const stages = (h.fund.stages || []).join(', ')
    const cheque = `$${h.fund.check_size_min_usd_m || '?'}–${h.fund.check_size_max_usd_m || '?'}M`
    const sectors = (h.fund.sectors || []).join(', ')
    return `- ${h.fund.name} (${h.fund.fund_type}) | score ${h.score} | sectors: ${sectors}${stages ? ` | stages: ${stages}` : ''} | cheque: ${cheque} | warmth: ${h.fund.warmth} | hq: ${h.fund.hq_city}`
  }).join('\n')

  const intent = ({
    fundraise: `Rank the ${audience.plural} most likely to write a check on this fundraise. Sector + stage + cheque-size fit dominate; warm relationships + recent contact are tiebreakers.`,
    m_and_a:   `Rank the most likely ${audience.plural} for this M&A mandate. Strategic synergy + sector thesis fit dominate. Treat the acquisition brief as the spec to match. Cheque size is irrelevant — this is a thesis match, not a fundraise.`,
    exit:      `Rank the most likely ${audience.plural} (sponsors who buy LP / secondary positions). Large PE, sovereign wealth, and family offices with secondary appetite dominate. Sector exposure + ticket fit matter; warmth is a tiebreaker.`
  })[mode]

  return `You are a senior associate at Valence Growth Partners. ${intent}

${dealBlock}

Candidate ${audience.plural} (heuristic-ranked, re-rank using your judgement):
${candidatesBlock}

Return JSON in this exact shape (no prose outside the JSON):
{
  "matches": [
    { "fund_name": "string", "score": 0-100, "reasons": ["short", "concrete", "max 6 words each"] }
  ],
  "summary": "2-sentence summary of the shortlist"
}

Return up to ${topN} matches, best first.`
}

function describeDealForPrompt(deal, mode) {
  const lines = [
    'Mandate:',
    `- Client: ${deal?.client_name || '—'}`,
    `- Sector: ${deal?.sector || '—'}`
  ]
  if (mode === 'fundraise') {
    lines.push(`- Sub-type: Fundraise`)
    if (deal?.target_raise_usd_m) lines.push(`- Target raise: USD ${deal.target_raise_usd_m}M`)
    if (deal?.target_valuation_usd_m) lines.push(`- Target valuation: USD ${deal.target_valuation_usd_m}M`)
    if (deal?.company_stage) lines.push(`- Company stage: ${deal.company_stage}`)
    if (deal?.stage) lines.push(`- Pipeline stage: ${deal.stage}`)
  }
  if (mode === 'm_and_a') {
    lines.push(`- Sub-type: M&A`)
    if (deal?.ma_side) lines.push(`- Side: ${deal.ma_side === 'buy' ? 'Buy-side' : deal.ma_side === 'sell' ? 'Sell-side' : 'Side TBD'}`)
    if (deal?.acquisition_brief) lines.push(`- Acquisition brief:\n  """${deal.acquisition_brief.slice(0, 2000)}"""`)
  }
  if (mode === 'exit') {
    lines.push(`- Sub-type: Exit`)
    if (deal?.target_exit_usd_m) lines.push(`- Target exit: USD ${deal.target_exit_usd_m}M`)
    if (deal?.target_exit_valuation_usd_m) lines.push(`- Target exit valuation: USD ${deal.target_exit_valuation_usd_m}M`)
    if (deal?.exit_investor_name) lines.push(`- Investor being exited: ${deal.exit_investor_name}`)
  }
  if (deal?.notes) lines.push(`- Notes: ${deal.notes}`)
  return lines.join('\n')
}

// --------- Mode B: Mandate-Fit ----------
// Five-line verdict against Valence's standing mandate criteria.
export async function screenMandateFit({ teaserText, criteria }) {
  const profile = criteriaPrompt(criteria)
  if (!isGeminiConfigured) {
    // No Gemini key — fall through to a deterministic keyword-scored
    // verdict. Conservative: ceiling at 80 to keep "pursue" rare on
    // heuristics; the UI's Convert CTA fires only above 70 so partners
    // still get the one-click route on clear matches.
    return heuristicMandateFit({ teaserText, criteria })
  }

  const prompt = `You are a Managing Partner at Valence Growth Partners deciding whether to pursue an inbound mandate. Read the teaser below, score it against our standing criteria, and return JSON only.

Valence's standing mandate criteria:
${profile}

Inbound teaser:
"""${(teaserText || '').slice(0, 6000)}"""

Return JSON in this exact shape:
{
  "verdict": "pursue" | "pass" | "watch",
  "score": 0-100,
  "one_line": "single sentence verdict in plain English",
  "lines": [
    "Line 1 — fit against sector criteria",
    "Line 2 — fit against ticket band",
    "Line 3 — counterparty / motivation read",
    "Line 4 — risk or red flag worth flagging",
    "Line 5 — recommended next step (intro call / pass with note / loop in partner X)"
  ]
}

If a section is unknowable from the teaser, say so plainly in that line.`

  return gemini(prompt, { temperature: 0.4, maxOutputTokens: 900 })
}

function criteriaPrompt(criteria) {
  if (!criteria || typeof criteria !== 'object') {
    return [
      '- Sectors: Healthcare, Fintech, Consumer, Infrastructure, Renewables, Logistics, Real Estate',
      '- Mandate types: M&A (sell-side preferred), Capital raise, Strategic advisory',
      '- Ticket band: USD 50M to USD 750M EV',
      '- Geography: India + cross-border into UK / SE Asia',
      '- Avoid: cap-table-only, < USD 25M EV, family disputes / litigation-heavy'
    ].join('\n')
  }
  return JSON.stringify(criteria, null, 2)
}

// ============ HEURISTIC FALLBACKS ============
// Deterministic Mandate-Fit when no Gemini key. Scores a teaser against the
// firm's standing criteria using cheap-but-explicit keyword matching:
//
//   + sector match in firm's coverage list  → +25
//   + ticket size inside the EV band         → +20
//   + geography match                        → +15
//   + mandate type (M&A / fundraise / etc)   → +15
//   - hard-exclude keyword hit               → cap at 30 / verdict pass
//
// The output uses the same { verdict, score, one_line, lines } shape as
// the Gemini path so the UI doesn't branch.
const FIRM_SECTORS = ['healthcare','fintech','consumer','infrastructure','renewable','renewables','logistics','real estate','bfsi','industrials','energy']
const FIRM_GEOS    = ['india','indian','mumbai','delhi','bengaluru','bangalore','chennai','hyderabad','pune','uk','united kingdom','london','singapore','sea','southeast asia']
const FIRM_TYPES   = ['m&a','m and a','merger','acquisition','sell-side','buy-side','fundraise','capital raise','series','growth equity','strategic advisory']
const HARD_EXCLUDE = ['litigation','family dispute','distressed shareholder','cap-table only','pre-revenue startup','seed-stage only']

export function heuristicMandateFit({ teaserText, criteria }) {
  const text  = String(teaserText || '').toLowerCase()
  if (!text.trim()) {
    return {
      verdict: 'review',
      score: 0,
      one_line: 'No teaser text to score — paste the inbound description to get a verdict.',
      lines: ['Empty submission.', '', '', '', '']
    }
  }

  // Extract ticket size if mentioned: "$200M", "USD 60M", "INR 1,200 Cr", "$ 75 million"
  const evMatch = text.match(/(?:usd|us\$|\$|inr|rs\.?)\s*([\d,.]+)\s*(m|mn|million|cr|crore|b|bn|billion)?/i)
  let evUsdM = null
  if (evMatch) {
    const num = parseFloat(evMatch[1].replace(/,/g, ''))
    const unit = (evMatch[2] || '').toLowerCase()
    if (!Number.isNaN(num)) {
      if (unit.startsWith('cr')) evUsdM = num * 0.12         // 1 Cr INR ≈ 0.12 M USD
      else if (unit.startsWith('b')) evUsdM = num * 1000
      else evUsdM = num                                       // default millions
    }
  }

  const lines = []
  let score = 0

  // Sector match
  const sectorHit = FIRM_SECTORS.find(s => text.includes(s))
  if (sectorHit) {
    score += 25
    lines.push(`Sector match — teaser mentions ${cap(sectorHit)}; sits inside firm coverage.`)
  } else {
    lines.push(`Sector unclear — couldn't pick up a firm-coverage keyword in the teaser.`)
  }

  // Ticket band: firm sweet spot $50M–$750M EV
  if (evUsdM != null) {
    if (evUsdM >= 50 && evUsdM <= 750) {
      score += 20
      lines.push(`Ticket band — ~USD ${Math.round(evUsdM)}M sits inside the firm's $50M–$750M sweet spot.`)
    } else if (evUsdM < 50) {
      lines.push(`Ticket band — ~USD ${Math.round(evUsdM)}M is below the firm's $50M floor.`)
    } else {
      score += 5
      lines.push(`Ticket band — ~USD ${Math.round(evUsdM)}M exceeds the typical $750M ceiling; possible co-advisory route.`)
    }
  } else {
    lines.push(`Ticket band — economics not disclosed in the teaser; ask before committing partner time.`)
  }

  // Geography match
  const geoHit = FIRM_GEOS.find(g => text.includes(g))
  if (geoHit) {
    score += 15
    lines.push(`Geography — ${cap(geoHit)} aligns with the firm's India + cross-border footprint.`)
  } else {
    lines.push(`Geography — no firm-coverage country surfaced in the teaser.`)
  }

  // Mandate type
  const typeHit = FIRM_TYPES.find(t => text.includes(t))
  if (typeHit) {
    score += 15
    lines.push(`Mandate type — ${cap(typeHit)} is a familiar execution shape for the firm.`)
  }

  // Hard exclude check
  const exclude = HARD_EXCLUDE.find(k => text.includes(k))
  if (exclude) {
    score = Math.min(score, 30)
    lines.unshift(`Hard exclude triggered: "${exclude}". Recommend a polite decline regardless of other dimensions.`)
  }

  // Quality of write-up: longer teaser = more substance to read
  if (text.length > 600) score += 5
  if (text.length > 1500) score += 5

  // Verdict thresholds. Ceiling at 80 on the heuristic — partners still
  // benefit from the LLM signal for borderline calls above 80.
  score = Math.min(95, score)
  let verdict
  if (exclude)         verdict = 'pass'
  else if (score >= 70) verdict = 'pursue'
  else if (score >= 45) verdict = 'review'
  else                 verdict = 'pass'

  const one_line =
    verdict === 'pursue' ? 'Heuristic match — looks like a firm-coverage mandate worth a first call.'
  : verdict === 'review' ? 'Partial fit — worth a partner read before responding.'
  :                        'Outside the firm\'s typical sweet spot; recommend a polite decline.'

  // Pad to 5 lines so the UI's chip list stays balanced.
  while (lines.length < 5) lines.push('')

  return { verdict, score, one_line, lines: lines.slice(0, 5) }
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '' }
