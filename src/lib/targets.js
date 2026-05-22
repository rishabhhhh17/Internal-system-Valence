// Target List generator — for a given deal, suggests ranked buyers or investors
// with rationale. Uses firm contacts, comps, and public-domain market knowledge.

import { searchKnowledge } from './knowledge.js'
import { supabase, isSupabaseConfigured } from './supabase.js'
import { llmCall } from './gemini.js'

// Returns JSON: [{ name, kind: 'Strategic' | 'Financial', rationale, warmth }]
export async function suggestTargets(deal) {

  // Gather relevant firm context
  let firmContext = ''
  let internalContacts = []
  try {
    const q = [deal.sector, deal.deal_type, deal.side].filter(Boolean).join(' ')
    if (q) {
      const { results } = await searchKnowledge(q, { matchCount: 8 })
      firmContext = (results || []).map((r, i) => `[${i + 1}] ${r.title}: ${(r.content || r.snippet || '').slice(0, 300)}`).join('\n\n')
    }
    if (isSupabaseConfigured) {
      const { data } = await supabase.from('contacts').select('name, company, role').limit(200)
      internalContacts = data || []
    }
  } catch {}

  const kind = deal.side === 'Buy-side'
    ? 'targets to acquire or invest in'
    : deal.deal_type === 'PE/VC'
      ? 'investors (PE/VC funds and strategic minorities)'
      : 'strategic buyers and financial sponsors'

  const prompt = `You are a senior associate at Valence Growth Partners preparing an outreach shortlist of ${kind} for the mandate below. Return STRICT JSON — no preamble, no trailing commentary. Produce 10-15 entries ranked by fit.

Schema:
{
  "targets": [
    {
      "name": "Entity name",
      "kind": "Strategic" | "Financial" | "Family Office" | "Sovereign",
      "geography": "short — e.g. 'India' or 'APAC' or 'US/EU'",
      "rationale": "two-sentence why-fit, specific to this deal",
      "warmth": "Warm" | "Cold" | "Internal relationship",
      "internal_contact": "name of Valence-internal person who may know them, or empty"
    }
  ]
}

Rules:
- Prefer names the industry would recognise. Avoid fabricated-sounding entities.
- Spread: ~60% most plausible fits, ~30% credible stretch fits, ~10% unusual but interesting.
- If the Valence internal contacts list shows someone at the target, set warmth to "Internal relationship" and fill in internal_contact.
- No ranking numbers inside the list; the array order is the ranking.
- Never include Valence itself.

================= MANDATE =================
CLIENT: ${deal.client_name}
TYPE: ${deal.deal_type}   SIDE: ${deal.side || 'Advisory'}
SECTOR: ${deal.sector || 'n/a'}
SIZE: ${deal.ticket_size_usd_m ? `~$${deal.ticket_size_usd_m}M EV` : 'tbd'}
STAGE: ${deal.stage}
NOTES: ${deal.notes || ''}

${firmContext ? 'FIRM CONTEXT / SECTOR MEMOS:\n' + firmContext + '\n' : ''}

VALENCE-INTERNAL CONTACTS (sample):
${internalContacts.slice(0, 40).map(c => `- ${c.name}${c.company ? ' (' + c.company + ')' : ''}${c.role ? ', ' + c.role : ''}`).join('\n') || '- none'}

Return JSON only.`

  const raw = await llmCall(prompt, { temperature: 0.45, maxOutputTokens: 1400, actionType: 'targets' })
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').trim()
  try {
    const obj = JSON.parse(cleaned)
    return Array.isArray(obj) ? obj : (obj.targets || [])
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) { try { return JSON.parse(m[0]).targets || [] } catch {} }
    throw new Error('Could not parse target list JSON.')
  }
}
