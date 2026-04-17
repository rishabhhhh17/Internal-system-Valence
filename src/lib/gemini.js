const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

export const geminiKey = import.meta.env.VITE_GEMINI_API_KEY
export const isGeminiConfigured = Boolean(geminiKey)

async function gemini(prompt, { temperature = 0.55, maxOutputTokens = 320 } = {}) {
  if (!isGeminiConfigured) throw new Error('Gemini API key not configured')
  const res = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens }
    })
  })
  if (!res.ok) throw new Error(`Gemini error ${res.status}`)
  const json = await res.json()
  return json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
}

export async function generateDaySummary({ meetings, tasks, dateLabel }) {
  const prompt = `You are the personal assistant for a senior professional at Valence Growth Partners, a global investment advisory firm. Write a short, confident summary of their day ahead — tight, 3 to 4 sentences maximum. No bullet lists, no emojis, no headings. Keep it professional and calm, the voice of a discreet chief-of-staff. Mention the most important meeting first and how many tasks are open.

Date: ${dateLabel}

Meetings today (${meetings.length}):
${meetings.map(m => `- ${m.time} · ${m.title} with ${m.attendee_name} (${m.status})`).join('\n') || '- none'}

Open tasks (${tasks.filter(t => !t.completed).length}):
${tasks.filter(t => !t.completed).map(t => `- ${t.title}`).join('\n') || '- none'}

Write the summary now.`
  return gemini(prompt, { temperature: 0.55, maxOutputTokens: 260 })
}

export async function draftMeetingMessage({ title, date, time, attendeeName }) {
  const prompt = `You are the personal assistant for a senior advisor at Valence Growth Partners, a global investment advisory firm based in Mumbai and London. Draft a short, professional email message proposing a meeting to the opposing partner. The tone should be warm but precise — the voice of a discreet chief-of-staff. No placeholders like [Your Name], no subject line, no greeting boilerplate other than "Hi {first name},". Keep it 3 to 5 sentences. Do not mention that an AI wrote it.

Meeting title: ${title}
Proposed date: ${date}
Proposed time: ${time}
Attendee: ${attendeeName}

Write the message now.`
  return gemini(prompt, { temperature: 0.6, maxOutputTokens: 320 })
}

// ============ DEAL BRIEFER ============
export async function generateDealBrief({ deal, contacts = [], files = [], activities = [] }) {
  const money = deal.ticket_size_usd_m ? `USD ${deal.ticket_size_usd_m}M EV` : 'EV not disclosed'
  const fees  = [
    deal.fee_retainer_usd   ? `$${Number(deal.fee_retainer_usd).toLocaleString()} retainer` : null,
    deal.fee_success_pct    ? `${deal.fee_success_pct}% success fee` : null
  ].filter(Boolean).join(' + ') || 'Fee structure TBD'

  const prompt = `You are a senior associate at Valence Growth Partners preparing a one-page internal brief on a live mandate. Write crisp, pragmatic, investment-banking-grade prose. No emojis, no fluff, no bullet headers. Produce four short labelled sections exactly in this order, each 1–2 sentences:

SITUATION — the core of the mandate.
COMMERCIALS — deal size, fee structure, stage, target close.
COUNTERPARTIES — who's on the other side, any notable external parties.
NEXT STEPS — 2 practical actions to move this forward this week.

Use plain labels "SITUATION:", "COMMERCIALS:", "COUNTERPARTIES:", "NEXT STEPS:" at the start of each paragraph (no markdown). Keep the whole brief under 180 words.

Here is the live data:

CLIENT: ${deal.client_name}
TYPE: ${deal.deal_type}   SIDE: ${deal.side || 'Advisory'}   SECTOR: ${deal.sector || '—'}
STAGE: ${deal.stage}       NDA: ${deal.nda_status}
COMMERCIALS: ${money}; ${fees}${deal.target_close ? `; target close ${deal.target_close}` : ''}
LEAD: ${deal.lead_owner || 'unassigned'}
NOTES: ${deal.notes || '—'}

COUNTERPARTIES (${contacts.length}):
${contacts.map(c => `- ${c.name}${c.role ? ' · ' + c.role : ''}${c.company ? ' · ' + c.company : ''}`).join('\n') || '- none logged'}

FILES IN DATA ROOM (${files.length}):
${files.map(f => `- [${f.category || 'Other'}] ${f.name}`).join('\n') || '- none'}

RECENT ACTIVITY (${activities.length}):
${activities.slice(0, 8).map(a => `- ${a.kind}: ${a.body || ''}`).join('\n') || '- none'}

Write the brief now.`

  return gemini(prompt, { temperature: 0.45, maxOutputTokens: 520 })
}

// ============ EMAIL SCENARIOS ============
const EMAIL_SCENARIOS = {
  intro: {
    label: 'Introduction',
    instruction: 'a warm, specific introduction email to this counterparty to initiate the relationship and reference the mandate context. Request a brief exploratory call.'
  },
  followup: {
    label: 'Follow-up',
    instruction: 'a polite follow-up email nudging for a response or next step. Reference the most recent activity if relevant. Be concise, never pushy.'
  },
  status: {
    label: 'Status update',
    instruction: 'a short status update to the counterparty reflecting where the mandate currently stands and the immediate next step. Professional and transparent.'
  },
  decline: {
    label: 'Polite decline',
    instruction: 'a diplomatic decline message — declining or pausing engagement without burning the relationship. Leave the door open for the future.'
  },
  propose_meeting: {
    label: 'Propose meeting',
    instruction: 'a short message proposing a specific time to meet to discuss the mandate. Request confirmation.'
  },
  nda_request: {
    label: 'Request NDA',
    instruction: 'a clean, concise request to move to NDA so that materials can be shared. Offer to send across the Valence standard mutual NDA.'
  }
}

export function emailScenarios() { return EMAIL_SCENARIOS }

export async function draftEmail({ scenario, deal, contact }) {
  const spec = EMAIL_SCENARIOS[scenario] || EMAIL_SCENARIOS.intro
  const first = (contact?.name || '').split(' ')[0] || 'there'
  const prompt = `You are the chief-of-staff for a senior advisor at Valence Growth Partners, a global investment advisory firm based in Mumbai and London. Draft ${spec.instruction}

The tone is professional, warm but precise. No emojis, no placeholders like [Your Name]. Start directly with "Hi ${first}," and sign off simply with "Best, Valence Growth Partners". Keep the body to 3–6 short sentences. Do not mention that an AI wrote it.

Context:
- Mandate: ${deal.client_name} — ${deal.deal_type} (${deal.side || 'Advisory'})
- Stage: ${deal.stage}
- Sector: ${deal.sector || '—'}
- NDA: ${deal.nda_status}
- Counterparty: ${contact?.name || 'the counterparty'}${contact?.role ? ' (' + contact.role + ')' : ''}${contact?.company ? ', ' + contact.company : ''}
- Internal notes: ${deal.notes || '—'}

Write the email now.`
  return gemini(prompt, { temperature: 0.65, maxOutputTokens: 420 })
}
