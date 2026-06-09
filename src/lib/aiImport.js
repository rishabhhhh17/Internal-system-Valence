// AI-assisted data import.
//
// Given a chunk of text (extracted from PDF / DOCX / XLSX / CSV / pasted
// input), classify the content into structured entities the app can file
// into the right tables: deals, people, funds, interactions. Returns a
// proposal the user reviews + edits before we commit anything.
//
// Why classify on the client and not server-side:
//   - Reuses the multi-LLM proxy (`/api/llm` via src/lib/gemini.js#llmCall).
//     The proxy handles BYO key, managed key, per-provider billing — we
//     don't want a separate ingest path that bypasses any of that.
//   - The user always sees a preview before write. AI proposes; user
//     commits. We never silently insert what the model made up.
//
// Entity shapes match the destination tables. Fields the model couldn't
// determine come back null; the user fills them in or leaves them blank.

import { llmCall } from './gemini.js'
import { supabase, isSupabaseConfigured } from './supabase.js'

// ============ PROMPT ============
// We ask the model for a single JSON envelope. The shape is intentionally
// flat — one array of entities — so the UI can show one row per item
// regardless of kind.
function buildPrompt(text, hint) {
  return `You are reading a document for an investment-advisory firm. Identify every distinct ENTITY that should land in their CRM / pipeline. Be conservative — only include entities you can support with concrete evidence in the text. Never invent names, numbers, or relationships.

Return STRICT JSON with this exact shape:
{
  "summary": "one sentence describing what kind of document this is",
  "entities": [
    {
      "kind": "deal" | "person" | "fund" | "interaction" | "company",
      "confidence": 0.0-1.0,
      "fields": { ... see schemas below ... },
      "source": "short pointer back into the document, e.g. 'row 3' or 'page 2 paragraph 1'"
    }
  ]
}

Schemas per kind (omit fields you can't determine; never fabricate):

PERSON fields (the firm's CRM contacts and counterparties):
  full_name        — required
  email            — string
  phone            — string
  company          — current employer (string)
  title            — job title at that company
  role             — categorisation: 'partner','associate','founder','investor','lawyer','banker','other'
  notes            — short note (under 200 chars)

DEAL fields (live mandates the firm is running):
  client_name        — required, who the firm is advising
  deal_type          — 'M&A','ECM','PE/VC','DCM','Advisory'
  deal_subtype       — 'fundraise','m_and_a','exit','advisory'
  side               — 'Buy-side','Sell-side','Advisory'
  sector             — sector tag
  stage              — 'Sourced','Information Received','Analyst Call','Partner Call','Memo','Diligence','Passed'
  ticket_size_usd_m  — number, enterprise value in USD millions
  notes              — short context (under 300 chars)

FUND fields (investor universe — VCs, PE firms, sovereigns, family offices):
  name             — required
  fund_type        — 'VC','Growth','PE','Sovereign','Family Office','Hedge Fund','Strategic'
  sectors          — array of sector strings
  check_size_min_usd_m — number
  check_size_max_usd_m — number
  hq_city          — string
  warmth           — 'warm','cold','prior_business'
  notes            — short note (under 200 chars)

INTERACTION fields (logged touchpoints with a counterparty):
  counterparty_name    — required
  counterparty_company — string
  type                 — 'meeting','call','email','intro','pitch','followup','other'
  outcome              — 'positive','neutral','negative','unknown'
  notes                — short summary (under 400 chars)
  date                 — YYYY-MM-DD

COMPANY fields (referenced businesses that aren't deals or funds themselves):
  name             — required
  sector           — string
  size_employees   — number
  hq_city          — string
  notes            — short context

${hint ? `Document hint from the user: ${hint}\n\n` : ''}DOCUMENT:
"""
${text.slice(0, 18000)}
"""

Return the JSON object now, with no preamble.`
}

// ============ CLASSIFY ============
// Calls the active LLM and parses the response. On parse failure, returns
// a single "raw" entity so the user can at least see what came back.
export async function classifyImport(text, { hint = '', actionType = 'ai_import' } = {}) {
  if (!text || !text.trim()) {
    return { summary: 'Empty input.', entities: [] }
  }
  const prompt = buildPrompt(text, hint)
  let raw
  try {
    raw = await llmCall(prompt, {
      temperature: 0.2,
      maxOutputTokens: 4000,
      actionType,
      responseMimeType: 'application/json'
    })
  } catch (err) {
    throw new Error(`AI classification failed — ${err?.message || err}`)
  }
  return parseEnvelope(raw)
}

function parseEnvelope(raw) {
  const cleaned = String(raw || '').replace(/^```json\s*|\s*```$/g, '').trim()
  let obj = null
  try { obj = JSON.parse(cleaned) } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) { try { obj = JSON.parse(m[0]) } catch { /* fall through */ } }
  }
  if (!obj || typeof obj !== 'object') {
    return { summary: 'Model returned unparseable response.', entities: [], _raw: cleaned }
  }
  const entities = Array.isArray(obj.entities) ? obj.entities : []
  // Normalise + assign a stable client-side id for the preview UI.
  return {
    summary: String(obj.summary || ''),
    entities: entities.map((e, i) => ({
      id: `proposed_${i}_${Math.random().toString(36).slice(2, 7)}`,
      kind: String(e.kind || '').toLowerCase(),
      confidence: clampConfidence(e.confidence),
      fields: e.fields && typeof e.fields === 'object' ? e.fields : {},
      source: String(e.source || ''),
      action: 'create'  // user can flip to 'skip' from the preview UI
    }))
  }
}

function clampConfidence(c) {
  const n = Number(c)
  if (Number.isNaN(n)) return 0.5
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

// ============ COMMIT ============
// Takes the user's reviewed list and inserts into the right tables.
// org_id is injected from the caller's seat (via current_user_org_id()
// RLS, which we satisfy by sending the column explicitly). Returns a
// per-entity result list so the UI can mark which ones landed.
//
// Tables we currently file into:
//   person       → public.people
//   deal         → public.deals
//   fund         → public.funds
//   interaction  → public.interactions
//   company      → public.people (with a synthetic "Company" person — IB
//                  firms don't have a distinct companies table today)
export async function commitEntities(entities, { orgId }) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured.')
  if (!orgId) throw new Error('orgId required — open a team first.')

  const toCommit = entities.filter(e => e.action !== 'skip')
  const results = []
  for (const e of toCommit) {
    try {
      const row = await insertEntity(e, orgId)
      results.push({ id: e.id, ok: true, kind: e.kind, row })
    } catch (err) {
      results.push({ id: e.id, ok: false, kind: e.kind, error: err?.message || 'insert failed' })
    }
  }
  return results
}

async function insertEntity(e, orgId) {
  const f = e.fields || {}
  switch (e.kind) {
    case 'person': {
      const payload = {
        org_id: orgId,
        full_name: f.full_name || 'Unnamed',
        email: f.email || null,
        phone: f.phone || null,
        company: f.company || null,
        role: f.role || null,
        notes: f.notes || null
      }
      const { data, error } = await supabase.from('people').insert(payload).select().single()
      if (error) throw error
      return data
    }
    case 'deal': {
      // Map to the live deal model (deal_types[]/deal_subtype/ma_side) and use
      // constraint-legal values: nda_status must be Signed/Pending/Not Required
      // (was 'Unknown', which 400'd the whole insert); ma_side must normalise
      // to buy/sell/undecided/null.
      const maSide = (() => {
        const s = String(f.ma_side || f.side || '').toLowerCase()
        if (s.startsWith('sell')) return 'sell'
        if (s.startsWith('buy'))  return 'buy'
        return null
      })()
      const payload = {
        org_id: orgId,
        client_name: f.client_name || 'Unnamed',
        deal_types:  Array.isArray(f.deal_types) && f.deal_types.length ? f.deal_types : ['transaction'],
        deal_subtype: f.deal_subtype || null,
        ma_side:     maSide,
        sector:      f.sector      || null,
        stage:       f.stage       || 'Sourced',
        ticket_size_usd_m: numOrNull(f.ticket_size_usd_m),
        notes:       f.notes       || null,
        nda_status:  'Pending'
      }
      const { data, error } = await supabase.from('deals').insert(payload).select().single()
      if (error) throw error
      return data
    }
    case 'fund': {
      const payload = {
        org_id: orgId,
        name: f.name || 'Unnamed',
        fund_type: f.fund_type || 'VC',
        sectors:   Array.isArray(f.sectors) ? f.sectors : (f.sectors ? [String(f.sectors)] : []),
        check_size_min_usd_m: numOrNull(f.check_size_min_usd_m),
        check_size_max_usd_m: numOrNull(f.check_size_max_usd_m),
        hq_city: f.hq_city || null,
        warmth:  f.warmth  || 'cold',
        notes:   f.notes   || null
      }
      const { data, error } = await supabase.from('funds').insert(payload).select().single()
      if (error) throw error
      return data
    }
    case 'interaction': {
      const payload = {
        org_id: orgId,
        counterparty_name: f.counterparty_name || 'Unnamed',
        counterparty_company: f.counterparty_company || null,
        type:    f.type    || 'other',
        outcome: f.outcome || 'unknown',
        notes:   f.notes   || null,
        created_at: f.date ? isoFromDate(f.date) : new Date().toISOString()
      }
      const { data, error } = await supabase.from('interactions').insert(payload).select().single()
      if (error) throw error
      return data
    }
    case 'company': {
      // We don't have a dedicated companies table — store as a "company
      // record" person row tagged with role='company'. This is fine for
      // the first cut; a real companies table can come later.
      const payload = {
        org_id: orgId,
        full_name: f.name || 'Unnamed Company',
        company:   f.name || null,
        role:      'company',
        notes:     [
          f.sector ? `Sector: ${f.sector}` : null,
          f.size_employees ? `~${f.size_employees} employees` : null,
          f.hq_city ? `HQ: ${f.hq_city}` : null,
          f.notes || null
        ].filter(Boolean).join(' · ') || null
      }
      const { data, error } = await supabase.from('people').insert(payload).select().single()
      if (error) throw error
      return data
    }
    default:
      throw new Error(`Unsupported kind: ${e.kind}`)
  }
}

function numOrNull(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function isoFromDate(dateLike) {
  if (!dateLike) return new Date().toISOString()
  const d = new Date(String(dateLike))
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

// ============ KIND METADATA ============
// Used by the preview UI for icons, labels, and which fields to show
// inline for each entity kind.
export const KIND_META = {
  person:      { label: 'Person',      table: 'people',       primary: 'full_name' },
  deal:        { label: 'Deal',        table: 'deals',        primary: 'client_name' },
  fund:        { label: 'Fund',        table: 'funds',        primary: 'name' },
  interaction: { label: 'Interaction', table: 'interactions', primary: 'counterparty_name' },
  company:     { label: 'Company',     table: 'people',       primary: 'name' }
}
