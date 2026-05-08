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
    return {
      verdict: 'pursue',
      one_line: 'Gemini key not configured — verdict not generated.',
      lines: [
        'Mandate-Fit needs a Gemini key to run.',
        'Set VITE_GEMINI_API_KEY in your environment.',
        'Until then this is a no-op and the form just records the upload.',
        '',
        ''
      ]
    }
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
