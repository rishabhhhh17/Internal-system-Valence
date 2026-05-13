// Knowledge Base library — folder templates per deal type, mentions
// parser, and helpers used by the KB tree + note editor.
//
// Two distinct linking mechanisms inside a note body:
//   [[type:id|display]] — global cross-link to a People / Fund / Mandate
//                          entity. Parsed and upserted into kb_mentions on
//                          save so every entity profile has a Mentions tab.
//   #tag                 — folder-local. Lives in kb_notes.tags array.
//                          Never leaks across folders.

// ============ DEFAULT FOLDER TEMPLATES ============
// Locked-in proposals from the v2 spec, sign-off given. When a mandate is
// created, Deals.jsx auto-spawns this structure under the mandate root.
//
// Shape: array of { name, children: [{ name, children: [...] }] }.
// Two-level depth max (activity → category). Spec says 2–3 layers; we go 2.

const TEMPLATE_FUNDRAISE = [
  { name: 'Investor Meetings', children: [
    { name: 'Notes' }, { name: 'Documents' }, { name: 'Feedback' }
  ]},
  { name: 'Internal' },
  { name: 'Client Communication' },
  { name: 'Diligence' }
]

const TEMPLATE_MA_SELL = [
  { name: 'Buyer Meetings', children: [
    { name: 'Notes' }, { name: 'Documents' }, { name: 'Feedback' }
  ]},
  { name: 'Diligence' },
  { name: 'Internal' },
  { name: 'Client Communication' }
]

const TEMPLATE_MA_BUY = [
  { name: 'Target Research' },
  { name: 'Acquisition Targets', children: [
    { name: 'Notes' }, { name: 'Documents' }, { name: 'Feedback' }
  ]},
  { name: 'Diligence' },
  { name: 'Internal' },
  { name: 'Client Communication' }
]

const TEMPLATE_EXIT = [
  { name: 'Counterparty Meetings', children: [
    { name: 'Notes' }, { name: 'Documents' }, { name: 'Feedback' }
  ]},
  { name: 'Internal' },
  { name: 'Client Communication' },
  { name: 'Diligence' }
]

const TEMPLATE_ADVISORY = [
  { name: 'Engagement Notes' },
  { name: 'Research' },
  { name: 'Deliverables' },
  { name: 'Client Communication' },
  { name: 'Internal' }
]

// Resolve the default template for a deal, picking by deal_types + deal_subtype.
// "Both" mandates get the union of the transaction-subtype template and the
// advisory template, deduped by name.
export function defaultTemplateFor(deal) {
  if (!deal) return TEMPLATE_ADVISORY
  const types  = Array.isArray(deal.deal_types) ? deal.deal_types : []
  const isTxn  = types.includes('transaction')
  const isAdv  = types.includes('advisory')

  let txnTemplate = null
  if (isTxn) {
    if (deal.deal_subtype === 'fundraise') txnTemplate = TEMPLATE_FUNDRAISE
    else if (deal.deal_subtype === 'm_and_a') {
      txnTemplate = deal.ma_side === 'buy' ? TEMPLATE_MA_BUY : TEMPLATE_MA_SELL
    }
    else if (deal.deal_subtype === 'exit') txnTemplate = TEMPLATE_EXIT
  }

  if (txnTemplate && isAdv) return mergeTemplates(txnTemplate, TEMPLATE_ADVISORY)
  if (txnTemplate)          return txnTemplate
  return TEMPLATE_ADVISORY  // pure-advisory or unset → advisory default
}

function mergeTemplates(a, b) {
  const byName = new Map()
  for (const node of [...a, ...b]) {
    if (byName.has(node.name)) continue
    byName.set(node.name, node)
  }
  return Array.from(byName.values())
}

// ============ AUTO-SPAWN ON MANDATE CREATION ============
// Inserts a mandate root + the template tree under it. Returns the root id.
// Called from Deals.jsx after a deal is inserted. Best-effort — if Supabase
// is unconfigured, no-op (the demo path renders without folders).
export async function spawnMandateFolders(supabase, deal) {
  if (!deal?.id) return null
  // Don't double-spawn
  const existing = await supabase.from('kb_folders').select('id').eq('mandate_id', deal.id).eq('folder_type', 'mandate_root').maybeSingle()
  if (existing.data) return existing.data.id

  const { data: root, error } = await supabase.from('kb_folders').insert({
    mandate_id: deal.id,
    name: deal.client_name || 'Mandate',
    folder_type: 'mandate_root',
    sort_order: 0
  }).select('id').single()
  if (error || !root) return null

  const tree = defaultTemplateFor(deal)
  let order = 0
  for (const node of tree) {
    order += 10
    const { data: act } = await supabase.from('kb_folders').insert({
      parent_id: root.id, mandate_id: deal.id, name: node.name, folder_type: 'activity', sort_order: order
    }).select('id').single()
    if (!act || !node.children) continue
    let childOrder = 0
    for (const child of node.children) {
      childOrder += 10
      await supabase.from('kb_folders').insert({
        parent_id: act.id, mandate_id: deal.id, name: child.name, folder_type: 'category', sort_order: childOrder
      })
    }
  }
  return root.id
}

// ============ MENTIONS PARSING ============
// Note body uses [[type:id|display]] tokens. Parser returns a deduped list
// of { entity_type, entity_id }. The display segment is optional; we don't
// store it server-side, the editor renders it from the live entity.
const MENTION_RE = /\[\[(person|fund|mandate|note):([^|\]\s]+)(?:\|[^\]]+)?\]\]/gi

// Replace every [[type:id|display]] token in `body` with just `display` (or a
// short type label when display is missing). Use for any list / preview /
// snippet surface where pill rendering isn't available — the goal is "no
// raw UUIDs ever leak into view".
export function stripWikilinkTokens(body) {
  if (!body) return ''
  return body.replace(
    /\[\[(person|fund|mandate|note):[^|\]\s]+(?:\|([^\]]+))?\]\]/gi,
    (_, type, display) => display || `@${type}`
  )
}

export function parseMentions(body) {
  const out = []
  const seen = new Set()
  if (!body) return out
  // Local copy of the regex so a global lastIndex on the module-level instance
  // doesn't corrupt re-entrant calls (parseMentions can be called from inside
  // a render that's already iterating the same regex elsewhere).
  const re = new RegExp(MENTION_RE.source, MENTION_RE.flags)
  let m
  while ((m = re.exec(body)) !== null) {
    const entity_type = m[1].toLowerCase()
    const entity_id   = m[2].toLowerCase()
    const key = `${entity_type}:${entity_id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ entity_type, entity_id })
  }
  return out
}

// Sync mentions for a note: nuke any rows that aren't in the new set, insert
// the new ones. Idempotent — running twice on the same note body is a no-op.
export async function syncMentions(supabase, noteId, body) {
  if (!noteId) return
  const next = parseMentions(body)
  // Wipe and re-insert: simpler than diffing, fine at note-save scale.
  await supabase.from('kb_mentions').delete().eq('note_id', noteId)
  if (next.length === 0) return
  // Drop self-references — a note mentioning itself shouldn't show up in its
  // own backlinks panel. Cheap to filter here than special-case in the UI.
  const rows = next
    .filter(n => !(n.entity_type === 'note' && n.entity_id === noteId))
    .map(n => ({ note_id: noteId, entity_type: n.entity_type, entity_id: n.entity_id }))
  if (rows.length === 0) return
  await supabase.from('kb_mentions').insert(rows)
}

// Fetch the notes that wikilink TO a given note. Returns rows enriched with
// the source note's folder + mandate context so the editor can render a
// "Linked from · <Mandate> · <Folder>" panel without further round-trips.
export async function fetchBacklinks(supabase, noteId) {
  if (!noteId) return []
  // Pull mention rows where this note is the target. embedded kb_notes
  // gives us the SOURCE note (the one doing the linking).
  const { data: mentions, error } = await supabase
    .from('kb_mentions')
    .select('id, note_id, kb_notes(id, title, body, folder_id, updated_at)')
    .eq('entity_type', 'note')
    .eq('entity_id', noteId)
  if (error || !mentions) return []
  const sourceNotes = mentions.map(m => m.kb_notes).filter(Boolean)
  if (sourceNotes.length === 0) return []

  // Pull folder + mandate context in a single round-trip each.
  const folderIds = Array.from(new Set(sourceNotes.map(n => n.folder_id).filter(Boolean)))
  let folderMap = {}, mandateMap = {}
  if (folderIds.length > 0) {
    const { data: folders } = await supabase
      .from('kb_folders').select('id, name, mandate_id').in('id', folderIds)
    for (const f of folders || []) folderMap[f.id] = f
    const mandateIds = Array.from(new Set((folders || []).map(f => f.mandate_id).filter(Boolean)))
    if (mandateIds.length > 0) {
      const { data: deals } = await supabase
        .from('deals').select('id, client_name').in('id', mandateIds)
      for (const d of deals || []) mandateMap[d.id] = d.client_name
    }
  }
  return sourceNotes
    .map(n => {
      const f = folderMap[n.folder_id]
      return {
        id: n.id,
        title: n.title,
        body: n.body,
        updated_at: n.updated_at,
        folderName: f?.name || null,
        mandateId: f?.mandate_id || null,
        mandateName: f?.mandate_id ? (mandateMap[f.mandate_id] || 'Mandate') : 'Firm-wide'
      }
    })
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
}

// ============ FOLDER-LOCAL TAGS ============
// `#tag` extraction from note body. Used to populate kb_notes.tags so they're
// queryable per folder without leaking across the database.
const TAG_RE = /(?:^|\s)#([\w-]{2,40})/g

export function parseTags(body) {
  const out = []
  const seen = new Set()
  if (!body) return out
  let m
  while ((m = TAG_RE.exec(body)) !== null) {
    const tag = m[1]
    if (seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
  }
  return out
}

// Render the linked entity name for display when showing a saved note. The
// editor and viewer both call this with the live entities map so renames
// reflect immediately without rewriting note bodies.
export function renderMentionToken(entityType, entityId, lookups) {
  const map = lookups?.[entityType] || {}
  return map[entityId] || `${entityType}:${entityId.slice(0, 8)}…`
}

// ============ QUICK NOTES — shared firm-wide folder ============
// Quick notes don't belong to any one mandate — they're written from a
// Person or Fund profile. We park them in a single firm-wide folder so
// they're discoverable in the global KB search, mentions still cross-link
// to the entity they're about, and a partner can browse "Quick notes from
// People" inside the Knowledge tree.

const QUICK_NOTES_FOLDER_NAME = 'Quick notes'

export async function ensureQuickNotesFolder(supabase) {
  // Idempotent: returns the existing firm-wide Quick-notes folder, or
  // creates one and returns it.
  const { data: existing } = await supabase
    .from('kb_folders')
    .select('*')
    .is('mandate_id', null)
    .eq('folder_type', 'firm_wide')
    .eq('name', QUICK_NOTES_FOLDER_NAME)
    .maybeSingle()
  if (existing) return existing
  const { data, error } = await supabase
    .from('kb_folders')
    .insert({ name: QUICK_NOTES_FOLDER_NAME, folder_type: 'firm_wide', mandate_id: null, sort_order: 0 })
    .select()
    .single()
  if (error) throw error
  return data
}

// Quick-create a note about a specific entity. Pre-pends a wikilink to the
// entity so kb_mentions resolves the link and the note shows up on the
// entity's Mentions tab automatically.
export async function createQuickNoteForEntity(supabase, { entityType, entityId, entityName, title, body }) {
  if (!entityType || !entityId) throw new Error('Missing entity reference')
  const folder = await ensureQuickNotesFolder(supabase)
  // Prefix the body with the wikilink. If the user already included one,
  // don't double-up.
  const wikilink = `[[${entityType}:${entityId}|${entityName || entityType}]]`
  const finalBody = (body && body.includes(wikilink)) ? body : `${wikilink}\n\n${body || ''}`.trim()
  const { data, error } = await supabase
    .from('kb_notes')
    .insert({ folder_id: folder.id, title: title || 'Untitled note', body: finalBody, tags: parseTags(finalBody) })
    .select()
    .single()
  if (error) throw error
  // Sync mentions + embed in the background. Failures don't block; the row exists.
  try { await syncMentions(supabase, data.id, finalBody) } catch (e) { console.warn('mentions sync failed', e) }
  try { await embedNote(supabase, data) } catch (e) { console.warn('embed failed', e) }
  return data
}

// ============ EMBEDDING + HYBRID SEARCH ============
import { embedText, embedQuery, embeddingsEnabled } from './embeddings.js'

// Generate a fresh embedding for a saved note and write it back. Best-effort
// — embeddings need a Gemini key; without one we skip silently and rely on
// the keyword half of the hybrid search.
export async function embedNote(supabase, note) {
  if (!note?.id) return
  if (!embeddingsEnabled()) return
  const text = [note.title, note.body, note.transcript].filter(Boolean).join('\n\n')
  if (!text.trim()) return
  try {
    const vec = await embedText(text)
    if (!vec) return
    await supabase.from('kb_notes').update({ embedding: vec }).eq('id', note.id)
  } catch (e) {
    console.warn('embedNote failed', e)
  }
}

// Hybrid search across kb_notes. Calls the search_kb_notes RPC defined in
// phase-2.5-kb-extras.sql. When a Gemini key is set we send a query
// embedding for the vector half; otherwise the RPC falls back to keyword
// matching only.
//
// Optional folderFilterIds scopes the search to one mandate's folder tree
// (the page passes the entire tree of folder IDs for the active mandate).
export async function searchKbNotes(supabase, queryText, { folderFilterIds = null, matchCount = 12 } = {}) {
  let queryEmbedding = null
  if (embeddingsEnabled() && queryText && queryText.trim().length > 2) {
    try { queryEmbedding = await embedQuery(queryText) }
    catch (e) { console.warn('embedQuery failed, falling back to keyword-only', e) }
  }

  const { data, error } = await supabase.rpc('search_kb_notes', {
    query_text: queryText || '',
    query_embedding: queryEmbedding,
    folder_filter_ids: folderFilterIds,
    match_count: matchCount
  })
  if (error) {
    console.warn('search_kb_notes RPC failed', error)
    return []
  }
  return data || []
}

// ============ DEMO FALLBACK ============
// When Supabase isn't configured the KB UI shows this minimal in-memory tree
// so the page renders. It's a single mandate (HoV Mushrooms) with the both
// transaction + advisory template applied.
export function demoFolderTree() {
  return [
    {
      id: 'demo-root',
      name: 'HoV Mushrooms',
      folder_type: 'mandate_root',
      children: defaultTemplateFor({ deal_types: ['transaction','advisory'], deal_subtype: 'fundraise' })
        .map((node, i) => ({
          id: `demo-act-${i}`,
          name: node.name,
          folder_type: 'activity',
          children: (node.children || []).map((c, j) => ({
            id: `demo-cat-${i}-${j}`,
            name: c.name,
            folder_type: 'category'
          }))
        }))
    }
  ]
}
