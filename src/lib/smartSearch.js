// Client-side entity search that complements searchKnowledge().
//
// `searchKnowledge` indexes documents / files / comps / deal chunks via the
// `knowledge_chunks` table. That's great for written memos and files, but
// the partner's most valuable institutional knowledge lives in:
//
//   * interactions  — notes written after a meeting/call ("Renuka only
//                     invests in seed A or B above $30M revenue")
//   * people         — persona fields (how_to_talk, what_they_care_about)
//   * funds          — persona_notes ("Sumant pays par; lengthy DD")
//
// This module runs a fast Postgres ILIKE search across those three tables
// and shapes the rows into the same { source_type, source_id, title,
// snippet, score, metadata } envelope that the Knowledge search UI
// already renders. The output is meant to be MERGED with searchKnowledge's
// results so a single search bar surfaces "the VC that only does Seed A/B
// > $30M revenue" the same way it surfaces a memo about renewables.
//
// No pgvector required — keyword ILIKE is enough for the partner's case
// because the criteria they're after lives word-for-word in their own
// notes. Score is a simple keyword-hit count weighted by source type, so
// interaction matches outrank a name match on a fund (the conversation
// captured the criteria, the fund row didn't).

import { supabase, isSupabaseConfigured } from './supabase.js'

const MAX_PER_SOURCE = 8

// Highlight wrapper that matches the convention searchKnowledge uses for
// `snippet` HTML — `&lt;&lt;…&gt;&gt;` around the matched span. Keeps the
// existing `cleanSnippet` renderer working unchanged.
function highlight(text, terms) {
  if (!text) return ''
  let out = String(text)
  for (const t of terms) {
    if (!t) continue
    const re = new RegExp(`(${escapeRegExp(t)})`, 'gi')
    out = out.replace(re, '<<$1>>')
  }
  // Trim around the first match for readability.
  const idx = out.indexOf('<<')
  if (idx > 60) out = '…' + out.slice(idx - 50)
  if (out.length > 240) out = out.slice(0, 240).trim() + '…'
  return out
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Tokenise the query into words (≥3 chars), drop common stopwords. We OR
// the tokens in Postgres so "seed B 30M revenue" matches an interaction
// note containing any combination.
const STOPWORDS = new Set(['the','and','for','with','that','this','they','their','what','when','from','have','will','only','above','below','more','less'])
function tokenise(q) {
  return String(q || '')
    .toLowerCase()
    .split(/[\s,\.;:/!?()]+/)
    .map(w => w.replace(/['"]/g, ''))
    .filter(w => w.length >= 3 && !STOPWORDS.has(w))
    .slice(0, 8)
}

function ilikePattern(token) {
  return `%${token.replace(/[%_]/g, c => '\\' + c)}%`
}

// Build an `or` filter for a list of (column, terms). PostgREST `or` takes
// comma-separated predicates: e.g. `or=(name.ilike.%seed%,notes.ilike.%seed%)`
// We keep it small per request because PostgREST gets unhappy with very
// long URLs.
function orFilter(columns, tokens) {
  const parts = []
  for (const col of columns) {
    for (const t of tokens) {
      parts.push(`${col}.ilike.${ilikePattern(t)}`)
    }
  }
  return parts.join(',')
}

// Count hits across a row's searchable text for a crude relevance score.
function hitCount(row, columns, tokens) {
  const blob = columns.map(c => row[c] || '').join(' ').toLowerCase()
  let hits = 0
  for (const t of tokens) {
    const re = new RegExp(escapeRegExp(t), 'gi')
    const m = blob.match(re)
    if (m) hits += m.length
  }
  return hits
}

/**
 * Search across the entity tables that knowledge_chunks doesn't cover.
 * Returns an array of result envelopes mergeable with searchKnowledge().
 *
 *   {
 *     source_type: 'person' | 'fund' | 'interaction',
 *     source_id:   string,
 *     title:       string,        // counterparty / fund / person display name
 *     snippet:     string,        // with <<term>> highlights
 *     score:       number,        // higher = better
 *     metadata:    object         // type-specific extras for downstream
 *   }
 */
export async function smartEntitySearch(query, { sourceFilter = null } = {}) {
  if (!isSupabaseConfigured) return []
  const tokens = tokenise(query)
  if (tokens.length === 0) return []

  // Run requested sources in parallel. `sourceFilter` is the same shape the
  // Knowledge search UI passes (`['document']` etc); if it doesn't include
  // an entity type, we skip that lookup.
  const wantPeople       = !sourceFilter || sourceFilter.includes('person')
  const wantFunds        = !sourceFilter || sourceFilter.includes('fund')
  const wantInteractions = !sourceFilter || sourceFilter.includes('interaction')

  const tasks = []

  if (wantPeople) {
    const filter = orFilter(['full_name','role','company','how_to_talk','what_they_care_about'], tokens)
    tasks.push(
      supabase
        .from('people')
        .select('id, full_name, role, company, city, country, how_to_talk, what_they_care_about, tags')
        .or(filter)
        .limit(MAX_PER_SOURCE)
        .then(({ data, error }) => {
          if (error || !data) return []
          return data.map(p => {
            const score = 1.0 + hitCount(p, ['full_name','role','company','how_to_talk','what_they_care_about'], tokens) * 0.4
            // Pick whichever persona line actually contains the search
            // terms for the snippet — that's what the partner came for.
            const snippetSource = [p.how_to_talk, p.what_they_care_about, p.role, p.company]
              .find(s => s && tokens.some(t => String(s).toLowerCase().includes(t))) || p.how_to_talk || p.what_they_care_about || p.company || ''
            return {
              source_type: 'person',
              source_id:   p.id,
              title:       p.full_name,
              snippet:     highlight(snippetSource, tokens),
              score,
              metadata:    { company: p.company, role: p.role, tags: p.tags || [] }
            }
          })
        })
    )
  }

  if (wantFunds) {
    const filter = orFilter(['name','persona_notes','hq_city'], tokens)
    tasks.push(
      supabase
        .from('funds')
        .select('id, name, fund_type, hq_city, warmth, persona_notes, sectors, check_size_min_usd_m, check_size_max_usd_m')
        .or(filter)
        .limit(MAX_PER_SOURCE)
        .then(({ data, error }) => {
          if (error || !data) return []
          return data.map(f => {
            const score = 1.1 + hitCount(f, ['name','persona_notes','hq_city'], tokens) * 0.4
            const snippet = f.persona_notes || (f.sectors || []).join(' · ') || f.hq_city || ''
            return {
              source_type: 'fund',
              source_id:   f.id,
              title:       f.name,
              snippet:     highlight(snippet, tokens),
              score,
              metadata:    { warmth: f.warmth, fund_type: f.fund_type, hq_city: f.hq_city, sectors: f.sectors || [] }
            }
          })
        })
    )
  }

  if (wantInteractions) {
    const filter = orFilter(['counterparty_name','counterparty_company','notes','type','outcome'], tokens)
    tasks.push(
      supabase
        .from('interactions')
        .select('id, counterparty_name, counterparty_company, type, outcome, notes, lead_owner, person_id, deal_id, created_at')
        .or(filter)
        .order('created_at', { ascending: false })
        .limit(MAX_PER_SOURCE)
        .then(({ data, error }) => {
          if (error || !data) return []
          return data.map(i => {
            // Interactions get the highest base score — the partner's
            // tribal knowledge is captured here, and a match means a real
            // conversation exists in the firm about this exact thing.
            const score = 1.3 + hitCount(i, ['counterparty_name','counterparty_company','notes','type','outcome'], tokens) * 0.5
            return {
              source_type: 'interaction',
              source_id:   i.id,
              title:       `${i.counterparty_name}${i.counterparty_company ? ' · ' + i.counterparty_company : ''}`,
              snippet:     highlight(i.notes || `${i.type} · ${i.outcome}`, tokens),
              score,
              metadata:    {
                type:      i.type,
                outcome:   i.outcome,
                person_id: i.person_id,
                deal_id:   i.deal_id,
                date:      i.created_at
              }
            }
          })
        })
    )
  }

  const buckets = await Promise.all(tasks)
  return buckets.flat()
}

/**
 * One-shot helper for callers that want everything merged + ranked.
 * Returns the raw list (caller can groupResults / dedupe as needed).
 */
export function mergeAndRank(knowledgeResults = [], entityResults = []) {
  const all = [...(knowledgeResults || []), ...(entityResults || [])]
  return all.sort((a, b) => (b.score || 0) - (a.score || 0))
}
