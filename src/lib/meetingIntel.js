// Meeting Intelligence — paste a transcript, get back the four pillars an
// associate writes after every founder meeting: highlights, red flags,
// claims to verify, and action items. Plus a tight 3-sentence summary.

import { isGeminiConfigured, llmCall } from './gemini.js'

export const TRANSCRIPT_SOURCES = [
  { id: 'otter',     label: 'Otter.ai' },
  { id: 'fireflies', label: 'Fireflies' },
  { id: 'granola',   label: 'Granola' },
  { id: 'manual',    label: 'Manual notes' },
  { id: 'other',     label: 'Other' }
]

async function gemini(prompt) {
  const txt = await llmCall(prompt, {
    temperature: 0.35,
    maxOutputTokens: 1600,
    responseMimeType: 'application/json',
    actionType: 'meeting_intel'
  })
  try { return JSON.parse(txt) } catch { return null }
}

export async function extractMeetingIntelligence({ deal, transcript }) {
  if (!transcript || !transcript.trim()) {
    return { founder_highlights: [], red_flags: [], claims_to_verify: [], action_items: [], summary: '' }
  }
  if (!isGeminiConfigured) {
    return {
      founder_highlights: [],
      red_flags: [],
      claims_to_verify: [],
      action_items: [],
      summary: 'Gemini key not configured — paste-only mode. The transcript has been saved; extraction is skipped.'
    }
  }
  const prompt = `You are a senior associate at Valence Growth Partners writing a post-meeting brief on a live mandate. Read the transcript and return JSON only.

Mandate context:
- Client: ${deal?.client_name || '—'}
- Sector: ${deal?.sector || '—'}
- Stage:  ${deal?.stage   || '—'}

Transcript (truncate-safe):
"""${String(transcript).slice(0, 12000)}"""

Return JSON in this exact shape (each array can be empty if nothing fits):
{
  "summary": "3 tight sentences that an MD could read in 15 seconds",
  "founder_highlights": [
    "concrete claim or stat the founder was clearly proud of"
  ],
  "red_flags": [
    "anything that should give us pause — vague answers, deflections, attribution issues"
  ],
  "claims_to_verify": [
    "specific numbers, customer names, contracts, dates that we should diligence"
  ],
  "action_items": [
    "immediate next steps for our team — who, what, by when if mentioned"
  ]
}

Keep each array item under 20 words. Do not invent facts; if the transcript is silent on something, leave that array empty.`

  const result = await gemini(prompt)
  if (!result) {
    return { founder_highlights: [], red_flags: [], claims_to_verify: [], action_items: [], summary: 'Could not parse Gemini response.' }
  }
  return {
    summary: result.summary || '',
    founder_highlights: arr(result.founder_highlights),
    red_flags:          arr(result.red_flags),
    claims_to_verify:   arr(result.claims_to_verify),
    action_items:       arr(result.action_items)
  }
}

function arr(v) { return Array.isArray(v) ? v.filter(Boolean) : [] }
