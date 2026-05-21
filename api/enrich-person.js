// /api/enrich-person — classify a person (or all unenriched people in
// the caller's org) by company_type, sector_tags, geography_tags. Powers
// the super_connectors views and the AI tool find_top_connectors.
//
// Auth: Bearer <supabase_access_token> — RLS scopes writes to the
// caller's org. No service-role bypass; if you want a server-side cron,
// give the cron a real user JWT.
//
// Request shapes:
//   POST {}                          — enrich up to LIMIT unenriched
//                                      external people in the caller's
//                                      org. "Unenriched" = company_type
//                                      is null OR last_enriched_at older
//                                      than 90 days.
//   POST { person_id: 'uuid' }       — enrich one specific person.
//   POST { batch: N }                — same as {} with a custom cap (max 50).
//
// Response:
//   { ok: true, enriched: N, skipped: N, errors: [...], details: [...] }
//
// Cost note: each enrichment is one Gemini 2.0 Flash call (~250 input /
// ~80 output tokens). At current pricing about $0.00006 per person.
// 25 people per batch ≈ $0.0015. Cheap.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = 'gemini-2.0-flash'
const GEMINI_HOST = 'https://generativelanguage.googleapis.com/v1beta'

const COMPANY_TYPES = new Set([
  'pe_fund','vc_fund','investment_bank','family_office',
  'corporate_buyer','founder','lawyer','banker','other'
])

const DEFAULT_BATCH = 25
const MAX_BATCH = 50

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return res.status(204).end()
  }
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(503).json({ error: 'Supabase not configured on server' })
  }
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Gemini not configured — set GEMINI_API_KEY on the server.' })
  }

  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return res.status(401).json({ error: 'Missing bearer token' })

  // Per-request Supabase client — RLS clamps reads + writes to the caller's org.
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  })

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  body = body || {}

  try {
    // Pick the work set.
    let people = []
    if (body.person_id) {
      const { data, error } = await sb.from('people')
        .select('id, full_name, role, company, email, is_valence_team')
        .eq('id', body.person_id)
        .limit(1)
      if (error) return res.status(500).json({ error: error.message })
      people = data || []
      if (people.length === 0) return res.status(404).json({ error: 'Person not found in your org' })
    } else {
      const cap = Math.min(MAX_BATCH, Math.max(1, Number(body.batch) || DEFAULT_BATCH))
      // Enrich external people (is_valence_team=false) who are unclassified
      // or whose enrichment is older than 90 days.
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400 * 1000).toISOString()
      const { data, error } = await sb.from('people')
        .select('id, full_name, role, company, email, is_valence_team, last_enriched_at, company_type')
        .eq('is_valence_team', false)
        .or(`company_type.is.null,last_enriched_at.is.null,last_enriched_at.lt.${ninetyDaysAgo}`)
        .limit(cap)
      if (error) return res.status(500).json({ error: error.message })
      people = data || []
    }

    if (people.length === 0) {
      return res.status(200).json({ ok: true, enriched: 0, skipped: 0, errors: [], note: 'Nothing to enrich.' })
    }

    const results = await Promise.allSettled(people.map(p => enrichOne(sb, p)))

    const details = []
    let enriched = 0
    let skipped = 0
    const errors = []
    results.forEach((r, i) => {
      const personId = people[i].id
      if (r.status === 'fulfilled' && r.value) {
        enriched += 1
        details.push({ person_id: personId, ...r.value })
      } else {
        skipped += 1
        const msg = r.status === 'rejected' ? (r.reason?.message || String(r.reason)) : 'no result'
        errors.push({ person_id: personId, error: msg })
      }
    })

    return res.status(200).json({ ok: true, enriched, skipped, errors, details })
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Enrichment failed' })
  }
}

// ============ ONE PERSON ============
async function enrichOne(sb, person) {
  const classification = await classifyWithGemini(person)
  if (!classification) throw new Error('Gemini returned no usable classification')

  // Validate / sanitise enum + arrays before writing.
  const company_type = COMPANY_TYPES.has(classification.company_type)
    ? classification.company_type
    : 'other'
  const sector_tags = Array.isArray(classification.sector_tags)
    ? classification.sector_tags.filter(s => typeof s === 'string' && s.length > 0 && s.length < 60).slice(0, 8)
    : []
  const geography_tags = Array.isArray(classification.geography_tags)
    ? classification.geography_tags.filter(s => typeof s === 'string' && s.length > 0 && s.length < 60).slice(0, 8)
    : []

  const { error } = await sb.from('people')
    .update({
      company_type,
      sector_tags,
      geography_tags,
      last_enriched_at: new Date().toISOString()
    })
    .eq('id', person.id)
  if (error) {
    // Log the raw error server-side so we keep the debug detail, but
    // return a sanitised message to the client. The frontend then routes
    // it through humanError() which falls back to a friendly default.
    console.error('[enrich-person] update failed:', error)
    throw new Error('Could not save enrichment for this person.')
  }

  return { company_type, sector_tags, geography_tags, reasoning: classification.reasoning || null }
}

// ============ GEMINI ============
async function classifyWithGemini(person) {
  const prompt = buildPrompt(person)
  const url = `${GEMINI_HOST}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,            // factual classification — low temp
        maxOutputTokens: 200,
        responseMimeType: 'application/json'
      }
    })
  })
  if (!upstream.ok) {
    const txt = await upstream.text().catch(() => '')
    throw new Error(`Gemini ${upstream.status}: ${txt.slice(0, 200)}`)
  }
  const json = await upstream.json()
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (!text) return null
  // Gemini sometimes wraps JSON in markdown fences even with responseMimeType
  // set, so strip defensively.
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

function buildPrompt(person) {
  // Single-shot, JSON-only. No system role because Gemini Flash doesn't
  // distinguish system vs user. Instructions baked into the prompt.
  return `You are classifying a contact for a capital advisory firm's CRM. Return ONLY a JSON object — no prose, no markdown.

Schema:
{
  "company_type": one of ["pe_fund","vc_fund","investment_bank","family_office","corporate_buyer","founder","lawyer","banker","other"],
  "sector_tags": array of 0-5 short industry tags (e.g. ["Healthcare","Fintech","Consumer"]),
  "geography_tags": array of 0-5 short geographic tags (e.g. ["Mumbai","India","US","Singapore"]),
  "reasoning": one short sentence justifying company_type
}

Contact:
  Name: ${person.full_name || '(unknown)'}
  Role: ${person.role || '(unknown)'}
  Company: ${person.company || '(unknown)'}
  Email: ${person.email || '(unknown)'}

Rules:
- If you have no real information about the company, set company_type="other" and leave tags empty arrays. Do not guess.
- sector_tags are industries the company operates IN (e.g. "Healthcare"), not what the company DOES (e.g. "Investing").
- geography_tags use cities first, then countries (e.g. ["Mumbai","India"]).
- Founders of operating companies → "founder". Founders of funds → "pe_fund" or "vc_fund".
- Family Office / Sovereign Wealth → "family_office".
- Corporate M&A teams / strategics → "corporate_buyer".
- Outside counsel → "lawyer". Sell-side or buy-side coverage bankers → "banker" (unless at a full IB → "investment_bank").

Return the JSON now.`
}
