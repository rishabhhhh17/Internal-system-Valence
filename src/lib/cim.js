// AI CIM / Teaser / Information Memorandum generator — the "40-hour analyst task"
// reduced to one button press. Generates a section-by-section draft grounded in
// the deal's own data (notes, counterparties, files, activity, comps).

import { searchKnowledge } from './knowledge.js'
import { isGeminiConfigured, llmStream } from './gemini.js'

export const CIM_SECTIONS = [
  { id: 'executive_summary',  label: 'Executive Summary',    hint: 'High-level situation, why now, headline asks.' },
  { id: 'company_overview',   label: 'Company Overview',     hint: 'What the business does, history, geographies.' },
  { id: 'industry',           label: 'Industry & Market',    hint: 'TAM, growth dynamics, structural tailwinds.' },
  { id: 'financial_summary',  label: 'Financial Summary',    hint: 'Revenue, EBITDA, margins, capital structure.' },
  { id: 'growth_strategy',    label: 'Growth Strategy',      hint: 'Levers, geographies, product expansion.' },
  { id: 'competitive',        label: 'Competitive Positioning', hint: 'Moats, differentiation, named peers.' },
  { id: 'management',         label: 'Management Team',      hint: 'Key people, track record, equity story.' },
  { id: 'transaction',        label: 'Transaction Rationale', hint: 'Why sell/raise, use of proceeds, ideal partner.' },
  { id: 'next_steps',         label: 'Next Steps & Process', hint: 'Indicative timeline, milestones, contacts.' }
]

function buildPrompt({ deal, sections, contacts, files, activities, compsContext, financials }) {
  const sectionBlock = sections.map(s => `### ${s.label}\n${s.hint}`).join('\n\n')

  const fin = financials
    ? `FINANCIAL SNAPSHOT (as supplied):\n${JSON.stringify(financials, null, 2)}`
    : 'FINANCIAL SNAPSHOT: not supplied — note the gap and move on.'

  return `You are a senior associate at Valence Growth Partners drafting an initial Confidential Information Memorandum (CIM) for an internal partner review. Produce a high-quality draft, section by section, using only the facts supplied below. If a fact is missing, say so plainly in the relevant section — do not invent numbers, people, or agreements.

Voice: crisp, declarative, boutique-advisory. Plain paragraphs. No bullet lists. No emojis. No markdown headings other than the exact section labels listed below. Do NOT include sub-sub-headings.

Format the output as:

## Executive Summary
...prose...

## Company Overview
...prose...

(and so on, in the exact order requested)

Sections requested (in this order):
${sectionBlock}

================= DEAL FACTS =================
CLIENT:       ${deal.client_name}
DEAL TYPE:    ${deal.deal_type}   SIDE: ${deal.side || 'Advisory'}
SECTOR:       ${deal.sector || 'n/a'}
STAGE:        ${deal.stage}       NDA: ${deal.nda_status}
EV RANGE:     ${deal.ticket_size_usd_m ? `~$${deal.ticket_size_usd_m}M` : 'tbd'}
TARGET CLOSE: ${deal.target_close || 'tbd'}
LEAD:         ${deal.lead_owner || 'unassigned'}
INTERNAL NOTES: ${deal.notes || '—'}

${fin}

COUNTERPARTIES (${contacts?.length || 0}):
${(contacts || []).map(c => `- ${c.name}${c.role ? ' · ' + c.role : ''}${c.company ? ' · ' + c.company : ''}`).join('\n') || '- none'}

FILES ON RECORD (${files?.length || 0}):
${(files || []).map(f => `- [${f.category || 'Other'}] ${f.name}`).join('\n') || '- none'}

RECENT ACTIVITY (${activities?.length || 0}):
${(activities || []).slice(0, 10).map(a => `- ${a.kind}: ${a.body || ''}`).join('\n') || '- none'}

${compsContext ? `RELEVANT PRECEDENT / KNOWLEDGE CONTEXT:\n${compsContext}\n` : ''}
================================================

Write the full draft now.`
}

export async function generateCIM({
  deal, contacts = [], files = [], activities = [], financials = null,
  sections = CIM_SECTIONS,
  onChunk, onDone, onError
}) {
  if (!isGeminiConfigured) {
    const err = new Error('Gemini API key not configured — add VITE_GEMINI_API_KEY to unlock CIM drafting.')
    onError?.(err); throw err
  }

  // Pull relevant knowledge context (sector memos, comps, playbooks)
  let compsContext = ''
  try {
    const q = [deal.sector, deal.deal_type, deal.client_name].filter(Boolean).join(' ')
    if (q) {
      const { results } = await searchKnowledge(q, { matchCount: 6 })
      compsContext = (results || []).map((r, i) => `[${i + 1}] ${r.title}: ${(r.content || r.snippet || '').slice(0, 400)}`).join('\n\n')
    }
  } catch { /* keep going without context */ }

  const prompt = buildPrompt({ deal, sections, contacts, files, activities, compsContext, financials })

  // Stream through the multi-provider proxy. Same `data: TEXT\n\n` shape
  // regardless of which LLM the customer has picked — for CIMs we lean
  // higher on maxOutputTokens because the doc covers 9 sections.
  let full = ''
  try {
    const result = await llmStream(prompt, {
      temperature: 0.35,
      maxOutputTokens: 2400,
      actionType: 'cim_draft',
      onChunk: (text, fullSoFar) => { full = fullSoFar; onChunk?.(text, fullSoFar) }
    })
    full = result.text || full
  } catch (err) {
    onError?.(err); throw err
  }

  onDone?.(full)
  return full
}

// Parse "## Section\n\n...\n\n## Section\n..." into structured blocks
export function parseCIM(text) {
  if (!text) return []
  const blocks = []
  const lines = text.split('\n')
  let current = null
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/)
    if (m) {
      if (current) blocks.push(current)
      current = { title: m[1].trim(), body: '' }
    } else if (current) {
      current.body += line + '\n'
    }
  }
  if (current) blocks.push(current)
  return blocks.map(b => ({ ...b, body: b.body.trim() }))
}
