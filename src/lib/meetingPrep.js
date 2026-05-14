// Meeting Prep — pulls together everything a partner needs in the 60
// seconds before walking into a meeting:
//
//   * Persona for the attendee (how to talk, what they care about,
//     favours bank, mutuals)
//   * The two most recent interactions with this counterparty
//   * Any open mandate(s) the counterparty is associated with
//   * Suggested talking points derived from the above
//
// Returns a structured object so the renderer can lay it out as a
// diligence card (not free-form prose). Works without Gemini by default —
// when a key is set we layer a 2-sentence AI synthesis at the top.

import { supabase, isSupabaseConfigured } from './supabase.js'
import { isGeminiConfigured } from './gemini.js'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

/**
 * Build a prep brief for a meeting. Inputs:
 *   meeting: { title, attendee_name, attendee_email?, time, date }
 * Returns:
 *   { people, deals, interactions, talkingPoints, summary, source }
 *   - people:        array of matched persona rows
 *   - deals:         array of related deals (by counterparty / contact)
 *   - interactions:  recent interactions with this counterparty (max 3)
 *   - talkingPoints: bullet array surfaced as the next-move hint
 *   - summary:       short 1-2 sentence read; AI-generated when a Gemini
 *                    key is set, otherwise a deterministic synthesis
 *   - source:        'ai' | 'heuristic'
 */
export async function buildMeetingPrep(meeting) {
  if (!isSupabaseConfigured) return emptyPrep('Supabase not configured')
  const attendeeName  = String(meeting?.attendee_name || '').trim()
  const attendeeEmail = String(meeting?.attendee_email || '').trim()

  // 1. Try to find a person by email first (deterministic), then by name
  //    fuzzy match. attendee_name often holds two names joined by " · ".
  let people = []
  if (attendeeEmail) {
    const { data } = await supabase.from('people').select('*').eq('email', attendeeEmail).limit(1)
    if (data?.length) people = data
  }
  if (people.length === 0 && attendeeName) {
    const firstName = attendeeName.split(/[,·]/)[0].trim()
    if (firstName.length >= 2) {
      const { data } = await supabase.from('people').select('*').ilike('full_name', `%${firstName}%`).limit(3)
      people = data || []
    }
  }

  // 2. Pull the 3 most recent interactions with this counterparty so the
  //    partner walks in knowing where the conversation left off.
  let interactions = []
  if (attendeeName) {
    const firstName = attendeeName.split(/[,·]/)[0].trim()
    if (firstName.length >= 2) {
      const { data } = await supabase
        .from('interactions')
        .select('id, counterparty_name, counterparty_company, type, outcome, notes, deal_id, created_at')
        .ilike('counterparty_name', `%${firstName}%`)
        .order('created_at', { ascending: false })
        .limit(3)
      interactions = data || []
    }
  }

  // 3. Related deals — interactions point at deal_id; we also try the
  //    person → linked deals path. Dedupe by id.
  const dealIds = new Set(interactions.map(i => i.deal_id).filter(Boolean))
  if (people[0]?.id) {
    const { data: linked } = await supabase
      .from('deals')
      .select('id, client_name, stage, sector, deal_type, deal_subtype')
      .or(`counterparty_name.ilike.%${(people[0].full_name || '').split(' ')[0]}%`)
      .limit(5)
    for (const d of linked || []) dealIds.add(d.id)
  }
  let deals = []
  if (dealIds.size > 0) {
    const { data } = await supabase
      .from('deals')
      .select('id, client_name, stage, sector, deal_type, deal_subtype, target_close, nda_status, ticket_size_usd_m, target_raise_usd_m, lead_owner')
      .in('id', Array.from(dealIds))
    deals = data || []
  }

  // 4. Talking points — derived from persona + last interaction + deal stage.
  const talkingPoints = buildTalkingPoints({ people, interactions, deals })

  // 5. Summary line — deterministic by default, AI-enhanced when configured.
  let summary = heuristicSummary({ meeting, people, deals, interactions })
  let source  = 'heuristic'
  if (isGeminiConfigured) {
    try {
      summary = await aiSummary({ meeting, people, deals, interactions })
      source  = 'ai'
    } catch {
      /* fall through to heuristic */
    }
  }

  return { people, deals, interactions, talkingPoints, summary, source }
}

function emptyPrep(reason) {
  return { people: [], deals: [], interactions: [], talkingPoints: [], summary: reason || '', source: 'heuristic' }
}

function buildTalkingPoints({ people, interactions, deals }) {
  const out = []
  const p = people[0]
  if (p?.what_they_care_about) {
    out.push(`Lead with what they care about: ${p.what_they_care_about}`)
  }
  if (p?.how_to_talk) {
    out.push(`Tone: ${p.how_to_talk}`)
  }
  if (interactions[0]?.notes) {
    out.push(`Pick up from last meeting: "${trim(interactions[0].notes, 120)}"`)
  }
  const stuck = deals.find(d => ['Pitching','Pre-Mandate','Mandate'].includes(d.stage))
  if (stuck) {
    out.push(`Mandate context: ${stuck.client_name} (${stuck.stage}) — confirm the next gate before closing.`)
  }
  if (p?.mutuals?.length > 0) {
    out.push(`Mutuals to drop in conversation: ${p.mutuals.slice(0, 2).join(', ')}.`)
  }
  if (out.length === 0) {
    out.push('No persona on file yet — log the interaction afterwards so the next prep is sharper.')
  }
  return out.slice(0, 5)
}

function heuristicSummary({ meeting, people, deals, interactions }) {
  const name = people[0]?.full_name || meeting?.attendee_name || 'this counterparty'
  const co   = people[0]?.company   ? ` from ${people[0].company}` : ''
  const role = people[0]?.role      ? `, ${people[0].role}` : ''
  const lastTouch = interactions[0]?.created_at
    ? ` Last touched ${daysAgo(interactions[0].created_at)} ago via ${labelType(interactions[0].type)}.`
    : ''
  const dealLine = deals[0]?.client_name
    ? ` Open mandate context: ${deals[0].client_name} (${deals[0].stage || 'unstaged'}).`
    : ''
  return `${name}${role}${co}.${lastTouch}${dealLine}`.trim()
}

async function aiSummary({ meeting, people, deals, interactions }) {
  const key = import.meta.env.VITE_GEMINI_API_KEY
  if (!key) throw new Error('no key')
  const prompt = `You are a senior associate at Valence Growth Partners briefing a partner who walks into a meeting in 60 seconds. Write a tight 2-sentence read on the counterparty: who they are, where the relationship stands, the single thing to lead with. No emojis, no bullets, no headers. Crisp IB tone.

Meeting: "${meeting?.title || ''}" at ${meeting?.time || ''} on ${meeting?.date || ''}.

Counterparty:
${(people[0] ? [
  `- Name: ${people[0].full_name}`,
  people[0].company ? `- Company: ${people[0].company}` : null,
  people[0].role ? `- Role: ${people[0].role}` : null,
  people[0].how_to_talk ? `- How to talk: ${people[0].how_to_talk}` : null,
  people[0].what_they_care_about ? `- What they care about: ${people[0].what_they_care_about}` : null
].filter(Boolean).join('\n') : '- No persona on file')}

Recent interactions (${interactions.length}):
${interactions.map(i => `- ${i.created_at?.slice(0,10)}: ${i.type} → ${i.outcome}. ${trim(i.notes || '', 200)}`).join('\n') || '- none'}

Active mandates (${deals.length}):
${deals.map(d => `- ${d.client_name} · ${d.stage} · ${d.sector || ''}`).join('\n') || '- none'}

Write the 2-sentence brief now.`
  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.55, maxOutputTokens: 220 } })
  })
  if (!res.ok) throw new Error('gemini error')
  const json = await res.json()
  return (json?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
}

function trim(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
function daysAgo(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days`
}
function labelType(t) {
  return String(t || 'interaction').replace(/_/g, ' ')
}
