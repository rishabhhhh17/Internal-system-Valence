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
// Produces an IB-diligence-style internal brief in four labelled sections.
// Commercials (size, fees, stage) are surfaced as chips in the UI, so the
// prose stays focused on judgement: thesis, counterparties, risks, next
// moves. The prompt forbids bullets / markdown so the renderer can rely on
// the four labels for structure.
//
// Falls back to a deterministic heuristic brief when no Gemini key is set
// (see `heuristicDealBrief` below). The fallback uses the same four labels
// so the renderer doesn't need to know the difference. This is what keeps
// the cold-demo experience working without an API key.
export async function generateDealBrief({ deal, contacts = [], files = [], activities = [] }) {
  if (!isGeminiConfigured) {
    return heuristicDealBrief({ deal, contacts, files, activities })
  }
  const money = deal.ticket_size_usd_m ? `USD ${deal.ticket_size_usd_m}M EV` : 'EV not disclosed'
  const fees  = [
    deal.fee_retainer_usd   ? `$${Number(deal.fee_retainer_usd).toLocaleString()} retainer` : null,
    deal.fee_success_pct    ? `${deal.fee_success_pct}% success fee` : null
  ].filter(Boolean).join(' + ') || 'Fee structure TBD'

  const prompt = `You are a senior associate at Valence Growth Partners preparing an internal one-pager on a live mandate, the kind a partner would scan five minutes before walking into a meeting. Tone: crisp, pragmatic, investment-banking-grade. No emojis, no markdown, no bullet markers in prose — the renderer styles structure from the section labels.

Produce four short labelled sections in this exact order, each 2–3 sentences:

THESIS — what's the core opportunity here. Why is this mandate worth running. The "why now" angle.
COUNTERPARTIES — who's on the other side that matters. Name names, note temperature where you can.
RISKS — what could derail this. Be specific: counterparty risk, structuring risk, market timing, founder dynamics.
NEXT MOVES — 2 concrete actions for this week. Verb-led ("Send teaser to X by Friday", "Schedule pitch with Y"). Numbered 1. / 2.

Use plain labels "THESIS:", "COUNTERPARTIES:", "RISKS:", "NEXT MOVES:" at the start of each paragraph. Keep the whole brief under 220 words.

Live data:

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

  return gemini(prompt, { temperature: 0.45, maxOutputTokens: 620 })
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

// ============ MEETING → ACTION ITEMS ============
export async function summariseMeeting({ title, notes, dateLabel, attendees = [] }) {
  const prompt = `You are a senior associate at Valence Growth Partners. The user just had a meeting and pasted their raw notes below. Produce a concise, professional summary AND a structured list of action items.

Return STRICT JSON matching this schema, and nothing else:
{
  "summary": "2-4 sentence summary of what was discussed and decided",
  "decisions": ["one-line decisions, if any"],
  "action_items": [
    { "title": "short imperative task (e.g. 'Send IM to Arclight')", "owner": "name or empty", "due_date": "YYYY-MM-DD or empty" }
  ],
  "follow_up_questions": ["open items or questions to resolve, if any"]
}

Meeting: ${title || '(untitled)'}
Date: ${dateLabel || ''}
Attendees: ${attendees.join(', ') || ''}

Notes:
${notes}`

  const text = await gemini(prompt, { temperature: 0.2, maxOutputTokens: 900 })
  const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    // Model sometimes wraps with stray text; try to extract the JSON block
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) { try { return JSON.parse(m[0]) } catch {} }
    return { summary: cleaned, decisions: [], action_items: [], follow_up_questions: [] }
  }
}

// ============ TEASER → DEAL FIELDS ============
export async function extractDealFromTeaser(text) {
  const prompt = `You are a senior associate at Valence Growth Partners ingesting an external teaser or information memorandum. Extract the fields below from the text and return STRICT JSON only.

Schema (null where unknown):
{
  "client_name": "company name being advised / for sale",
  "deal_type": "M&A | ECM | PE/VC | DCM",
  "side": "Buy-side | Sell-side | Advisory",
  "sector": "Healthcare | BFSI | Fintech | Infrastructure | Consumer | Consumer Tech | EdTech | Energy | Real Estate | Technology | Other",
  "ticket_size_usd_m": number or null,
  "notes": "3-4 sentence internal brief capturing the situation"
}

Teaser text (truncated):
${text.slice(0, 9000)}`

  const raw = await gemini(prompt, { temperature: 0.15, maxOutputTokens: 600 })
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').trim()
  try { return JSON.parse(cleaned) }
  catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) { try { return JSON.parse(m[0]) } catch {} }
    throw new Error('Could not parse AI response as JSON')
  }
}

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

// ============ HEURISTIC FALLBACKS ============
// These run when no Gemini key is configured so the demo still works
// end-to-end — cold customers don't need to provision an API key just to
// see what the surface looks like populated.

// Deterministic Deal Brief in the same four-section shape as the LLM
// output. Rules of thumb encoded here mirror what a senior associate
// would write on the back of an envelope.
export function heuristicDealBrief({ deal, contacts = [], files = [], activities = [] }) {
  const sector       = deal.sector || 'this sector'
  const stage        = deal.stage  || 'Origination'
  const dealType     = (deal.deal_type || 'transaction').toLowerCase()
  const subtype      = (deal.deal_subtype || '').replace(/_/g, ' ')
  const side         = deal.ma_side ? `${deal.ma_side}-side` : (deal.side || 'advisory').toLowerCase()
  const ev           = deal.ticket_size_usd_m
                       ? `USD ${deal.ticket_size_usd_m}M EV`
                       : (deal.target_raise_usd_m ? `USD ${deal.target_raise_usd_m}M raise` : 'undisclosed economics')
  const lead         = deal.lead_owner || 'the lead banker'
  const targetClose  = deal.target_close ? new Date(deal.target_close) : null
  const nda          = deal.nda_status || 'Unknown'
  const noteLine     = deal.notes ? ` ${trimSentence(deal.notes)}` : ''

  // ---- THESIS ----
  const thesisBits = []
  thesisBits.push(`${deal.client_name || 'The client'} is running a ${subtype || dealType} mandate in ${sector} at ${ev}.`)
  if (side && side !== 'advisory') thesisBits.push(`Side: ${side}.`)
  if (deal.acquisition_brief) thesisBits.push(trimSentence(deal.acquisition_brief))
  else if (noteLine) thesisBits.push(noteLine)
  const thesis = thesisBits.join(' ')

  // ---- COUNTERPARTIES ----
  let counterparties
  if (contacts.length === 0) {
    counterparties = `No counterparties logged yet. Add the lead from the other side under the Counterparties tab so the rest of this brief can sharpen on the next regenerate.`
  } else {
    const named = contacts.slice(0, 4).map(c => {
      const role = c.role ? ` (${c.role})` : ''
      const co   = c.company ? `, ${c.company}` : ''
      return `${c.name}${role}${co}`
    }).join('; ')
    counterparties = `${contacts.length} counterpart${contacts.length === 1 ? 'y' : 'ies'} logged: ${named}.`
    if (contacts.length > 4) counterparties += ` Plus ${contacts.length - 4} more.`
  }

  // ---- RISKS ----
  const risks = []
  // Staleness: no activity in 21+ days
  const lastTouch = activities.length
    ? new Date(activities[0].created_at)
    : (deal.updated_at ? new Date(deal.updated_at) : null)
  if (lastTouch) {
    const days = Math.floor((Date.now() - lastTouch.getTime()) / 86400000)
    if (days >= 21) risks.push(`No activity logged in ${days} days — momentum risk; counterparty cool-off likely.`)
  }
  if (nda === 'Pending' && (stage === 'Pre-Mandate' || stage === 'Mandate'))
    risks.push(`NDA still pending at ${stage} — blocks diligence room sharing and slows pricing work.`)
  if (!deal.fee_retainer_usd && !deal.fee_success_pct && stage === 'Mandate')
    risks.push(`Fee structure not set on a live mandate — revisit the engagement letter before next stage.`)
  if (contacts.length === 0)
    risks.push(`No counterparty logged — relationship is in ${lead}'s head only, not the firm's.`)
  if (targetClose) {
    const daysToClose = Math.floor((targetClose.getTime() - Date.now()) / 86400000)
    if (daysToClose < 0) risks.push(`Target close was ${Math.abs(daysToClose)} days ago — refresh the timeline with the counterparty.`)
    else if (daysToClose <= 14) risks.push(`Target close in ${daysToClose} days — confirm both sides are aligned on the closing checklist.`)
  }
  if (risks.length === 0) risks.push(`Standard execution risks for ${sector} at ${stage}: counterparty diligence pace, market windows, and any pending regulatory approvals.`)
  const risksText = risks.slice(0, 3).join(' ')

  // ---- NEXT MOVES ----
  // Stage-aware playbook. Verb-led, two concrete actions for this week.
  const moves = nextMovesFor(stage, deal, contacts)
  const nextMoves = moves.map((m, i) => `${i + 1}. ${m}`).join(' ')

  return [
    `THESIS: ${thesis}`,
    `COUNTERPARTIES: ${counterparties}`,
    `RISKS: ${risksText}`,
    `NEXT MOVES: ${nextMoves}`
  ].join('\n\n')
}

function nextMovesFor(stage, deal, contacts) {
  const counterpartyName = contacts[0]?.name || 'the lead counterparty'
  const lead             = deal.lead_owner || 'the lead banker'
  switch (stage) {
    case 'Origination':
      return [
        `Confirm the engagement framing with ${counterpartyName} this week — scope, fees, timeline.`,
        `Spin up the data room template for ${deal.sector || 'the sector'} and seed it with the top three precedent comps.`
      ]
    case 'Pitching':
      return [
        `Walk ${counterpartyName} through the pitch deck and capture two objections to address before the IC.`,
        `Shortlist five fund counterparties whose persona fits and warm-intro by Friday.`
      ]
    case 'Pre-Mandate':
      return [
        `Close out the NDA${deal.nda_status === 'Pending' ? ' — currently pending' : ''} so diligence work isn't blocked.`,
        `Draft the engagement letter (retainer + success fee) and circulate internally for ${lead} to sign off.`
      ]
    case 'Mandate':
      return [
        `Refresh the live pipeline of interested counterparties — add new touches under the Interactions tab.`,
        `Run a mid-mandate diligence checklist: docs, comps, model, regulatory. Flag any gaps to ${lead}.`
      ]
    case 'Closed':
      return [
        `Log the final fee position and close-out memo under the Files tab.`,
        `Schedule the 30-day post-close debrief with ${counterpartyName} to seed the next mandate.`
      ]
    case 'On Hold':
      return [
        `Confirm the hold trigger (market, counterparty, internal) and set a calendar reminder to revisit in 30 days.`,
        `Park the data room and notify any active funds so they de-prioritise without going cold.`
      ]
    case 'Lost':
      return [
        `Write the loss reason into the Activity log so the firm learns from this counterparty.`,
        `Stay in touch every quarter — losses today are mandates tomorrow.`
      ]
    default:
      return [
        `Move the mandate forward by logging the next concrete action under Activity.`,
        `Re-confirm scope, timing, and economics with ${counterpartyName}.`
      ]
  }
}

function trimSentence(s) {
  const t = String(s || '').trim()
  if (!t) return ''
  // Take the first sentence (or 180 chars) so the brief stays tight.
  const period = t.search(/[.!?](\s|$)/)
  const first = period > 0 ? t.slice(0, period + 1) : t
  return first.length > 200 ? first.slice(0, 197) + '…' : first
}
