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

// Tokenise the query into words (≥2 chars), drop common stopwords. We OR
// the tokens in Postgres so "seed B 30M revenue" matches an interaction
// note containing any combination. Keep 2-letter tokens so "B" in "Series
// B" survives the filter.
const STOPWORDS = new Set(['the','and','for','with','that','this','they','their','what','when','from','have','will','only','above','below','more','less','who','can','our','are','out','its','one','any'])
function tokenise(q) {
  return String(q || '')
    .toLowerCase()
    .split(/[\s,\.;:/!?()]+/)
    .map(w => w.replace(/['"]/g, ''))
    .filter(w => w.length >= 2 && !STOPWORDS.has(w))
    .slice(0, 8)
}

// Score a row by counting keyword hits across both scalar columns and any
// array-valued columns (sectors, stage_focus, tags). Arrays are joined into
// a single haystack so "Series A" inside `stage_focus: ['Series A','Growth']`
// still scores like a column-level hit.
function hitCountWithArrays(row, scalarCols, arrayCols, tokens) {
  let blob = scalarCols.map(c => row[c] || '').join(' ')
  for (const col of arrayCols) {
    const arr = row[col]
    if (Array.isArray(arr)) blob += ' ' + arr.join(' ')
  }
  blob = blob.toLowerCase()
  let hits = 0
  for (const t of tokens) {
    const re = new RegExp(escapeRegExp(t), 'gi')
    const m = blob.match(re)
    if (m) hits += m.length
  }
  return hits
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
    // Pull ALL people (typically a few hundred per firm). Filter and score
    // client-side so we can hit the `tags` array along with the scalar
    // persona fields — PostgREST's array filtering is unwieldy here.
    tasks.push(
      supabase
        .from('people')
        .select('id, full_name, role, company, city, country, how_to_talk, what_they_care_about, tags')
        .limit(500)
        .then(({ data, error }) => {
          if (error || !data) return []
          const scored = data
            .map(p => {
              const hits = hitCountWithArrays(p,
                ['full_name','role','company','city','country','how_to_talk','what_they_care_about'],
                ['tags'],
                tokens)
              if (hits === 0) return null
              const score = 1.0 + hits * 0.5
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
            .filter(Boolean)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_PER_SOURCE)
          return scored
        })
    )
  }

  if (wantFunds) {
    // Same approach as people: pull every fund (universes are typically
    // <500) and score across the FULL fund profile — including the array
    // columns `sectors` and `stage_focus` so a query like "series a
    // investor" surfaces funds whose stage_focus contains 'Series A'.
    tasks.push(
      supabase
        .from('funds')
        .select('id, name, fund_type, hq_city, hq_country, warmth, persona_notes, sectors, stage_focus, check_size_min_usd_m, check_size_max_usd_m')
        .limit(500)
        .then(({ data, error }) => {
          if (error || !data) return []
          const scored = data
            .map(f => {
              const hits = hitCountWithArrays(f,
                ['name','fund_type','hq_city','hq_country','persona_notes','warmth'],
                ['sectors','stage_focus'],
                tokens)
              if (hits === 0) return null
              const score = 1.1 + hits * 0.5
              // Build a snippet that highlights WHY this fund matched —
              // prefer the field that actually contained the query terms.
              const stageMatch  = (f.stage_focus || []).find(s => tokens.some(t => s.toLowerCase().includes(t)))
              const sectorMatch = (f.sectors || []).find(s => tokens.some(t => s.toLowerCase().includes(t)))
              const snippet = [
                f.persona_notes,
                stageMatch  ? `Stage focus · ${(f.stage_focus || []).join(' · ')}` : null,
                sectorMatch ? `Sectors · ${(f.sectors || []).join(' · ')}` : null,
                (f.check_size_min_usd_m || f.check_size_max_usd_m) ? `Cheque · $${f.check_size_min_usd_m ?? '?'}–${f.check_size_max_usd_m ?? '?'}M` : null
              ].filter(Boolean).join(' · ')
              return {
                source_type: 'fund',
                source_id:   f.id,
                title:       f.name,
                snippet:     highlight(snippet || f.hq_city || '', tokens),
                score,
                metadata:    {
                  warmth: f.warmth,
                  fund_type: f.fund_type,
                  hq_city: f.hq_city,
                  sectors: f.sectors || [],
                  stage_focus: f.stage_focus || []
                }
              }
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_PER_SOURCE)
          return scored
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
