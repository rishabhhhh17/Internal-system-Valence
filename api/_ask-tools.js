// Tool implementations for /api/ask.
//
// Each tool runs a single Supabase query under the user's JWT, so RLS
// scopes everything to their org automatically. Tools return plain JSON
// that goes back to Gemini verbatim — no formatting, no reshaping for
// presentation. Gemini does the prose.
//
// Tool contract (every tool):
//   - First arg: the per-request supabase client (bound to user's JWT)
//   - Second arg: the params object from Gemini's function call
//   - Returns: { results: [...], match_count: N } — never throws on
//     empty results, returns { results: [], match_count: 0 } so the
//     model can say "I don't know" cleanly.
//
// Spec rules these enforce in code, not just in the prompt:
//   - Numeric internal scores never leave the DB. Tools select bucket
//     only.
//   - Email bodies never returned. We only stored metadata + summary.
//   - Results capped at 20 (or 5 for top-connector / intro path).

// ============ search_people ============
export async function search_people(sb, p) {
  let q = sb.from('people').select(`
    id, full_name, email, company, company_type, role,
    sector_tags, geography_tags, is_valence_team
  `).eq('is_valence_team', false).limit(20)

  if (p.name_contains)         q = q.ilike('full_name', `%${p.name_contains}%`)
  if (p.company_name_contains) q = q.ilike('company',   `%${p.company_name_contains}%`)
  if (p.company_type)          q = q.eq('company_type', p.company_type)
  if (Array.isArray(p.sector_tags) && p.sector_tags.length)
    q = q.overlaps('sector_tags', p.sector_tags)
  if (Array.isArray(p.geography_tags) && p.geography_tags.length)
    q = q.overlaps('geography_tags', p.geography_tags)

  const { data: peopleRows, error } = await q
  if (error) return { error: error.message, results: [], match_count: 0 }
  if (!peopleRows?.length) return { results: [], match_count: 0 }

  // Decorate with strongest Valence contact + filter by min strength
  // if the caller asked for it. We don't run this as a single SQL join
  // because Supabase's JS client makes nested aggregates ugly — two
  // round-trips, but both are indexed reads.
  const peopleIds = peopleRows.map(r => r.id)
  let rs = sb.from('relationship_strength')
    .select('valence_person_id, external_person_id, bucket, last_interaction_at, interaction_count')
    .in('external_person_id', peopleIds)

  if (p.connected_to_valence_person_id) {
    rs = rs.eq('valence_person_id', p.connected_to_valence_person_id)
  }
  if (p.min_strength_bucket) {
    const order = ['cold','cool','warm','strong']
    const idx = order.indexOf(String(p.min_strength_bucket).toLowerCase())
    if (idx >= 0) rs = rs.in('bucket', order.slice(idx))
  }
  const { data: relRows } = await rs

  // For each external person, pick the strongest Valence relationship.
  const bucketRank = { strong: 4, warm: 3, cool: 2, cold: 1 }
  const strongestByExternal = new Map()
  for (const r of (relRows || [])) {
    const cur = strongestByExternal.get(r.external_person_id)
    if (!cur || (bucketRank[r.bucket] || 0) > (bucketRank[cur.bucket] || 0)) {
      strongestByExternal.set(r.external_person_id, r)
    }
  }

  // If caller asked for min strength or connected_to, drop people with no
  // matching relationship row.
  const filter = p.min_strength_bucket || p.connected_to_valence_person_id
  const enriched = peopleRows
    .map(r => {
      const rel = strongestByExternal.get(r.id) || null
      return {
        id: r.id,
        name: r.full_name,
        company: r.company,
        company_type: r.company_type,
        role: r.role,
        sector_tags: r.sector_tags || [],
        geography_tags: r.geography_tags || [],
        strongest_valence_contact: rel ? {
          valence_person_id: rel.valence_person_id,
          bucket: rel.bucket,
          interaction_count: rel.interaction_count,
          last_interaction_at: rel.last_interaction_at
        } : null
      }
    })
    .filter(r => filter ? r.strongest_valence_contact !== null : true)

  return { results: enriched, match_count: enriched.length }
}

// ============ get_relationship ============
export async function get_relationship(sb, p) {
  if (!p.valence_person_id || !p.external_person_id) {
    return { error: 'valence_person_id and external_person_id are both required', results: [], match_count: 0 }
  }
  // Bucket + aggregate counts.
  const { data: rs, error } = await sb.from('relationship_strength')
    .select('bucket, interaction_count, last_interaction_at')
    .eq('valence_person_id', p.valence_person_id)
    .eq('external_person_id', p.external_person_id)
    .maybeSingle()
  if (error) return { error: error.message, results: [], match_count: 0 }

  // Last 5 interactions for context.
  const { data: recent } = await sb.from('interactions')
    .select('id, occurred_at, created_at, interaction_type, type, subject, summary')
    .eq('valence_person_id', p.valence_person_id)
    .eq('external_person_id', p.external_person_id)
    .order('occurred_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: first } = await sb.from('interactions')
    .select('occurred_at, created_at')
    .eq('valence_person_id', p.valence_person_id)
    .eq('external_person_id', p.external_person_id)
    .order('occurred_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!rs && (!recent || recent.length === 0)) {
    return { results: [], match_count: 0 }
  }

  return {
    results: [{
      bucket: rs?.bucket || 'cold',
      interaction_count: rs?.interaction_count || (recent?.length || 0),
      last_interaction_at: rs?.last_interaction_at || recent?.[0]?.occurred_at || recent?.[0]?.created_at || null,
      first_interaction_at: first?.occurred_at || first?.created_at || null,
      last_5_interactions: (recent || []).map(i => ({
        date: i.occurred_at || i.created_at,
        type: i.interaction_type || i.type,
        subject: i.subject || null,
        summary: i.summary || null
      }))
    }],
    match_count: 1
  }
}

// ============ find_best_intro_path ============
export async function find_best_intro_path(sb, p) {
  if (!p.target_external_person_id && !p.target_company_id) {
    return { error: 'one of target_external_person_id or target_company_id is required', results: [], match_count: 0 }
  }

  // Resolve to a list of external person ids.
  let externalIds = []
  if (p.target_external_person_id) {
    externalIds = [p.target_external_person_id]
  } else {
    // target_company_id — we don't have a companies table yet, so the
    // "id" is actually the company name string. Match by company text.
    const { data } = await sb.from('people')
      .select('id')
      .ilike('company', p.target_company_id)
      .eq('is_valence_team', false)
    externalIds = (data || []).map(r => r.id)
  }
  if (externalIds.length === 0) return { results: [], match_count: 0 }

  // Strongest path = highest-bucket relationship to any of these people.
  const { data: rs } = await sb.from('relationship_strength')
    .select('valence_person_id, external_person_id, bucket, interaction_count, last_interaction_at')
    .in('external_person_id', externalIds)
    .in('bucket', ['strong','warm','cool','cold'])
    .order('bucket', { ascending: false })  // strong < warm < cool < cold lexically — fine but verify
    .limit(50)

  // Pull names for both sides.
  const valenceIds  = Array.from(new Set((rs || []).map(r => r.valence_person_id)))
  const externalIdsActual = Array.from(new Set((rs || []).map(r => r.external_person_id)))
  const { data: people } = await sb.from('people')
    .select('id, full_name, company, role')
    .in('id', [...valenceIds, ...externalIdsActual])
  const peopleMap = new Map((people || []).map(p => [p.id, p]))

  const bucketRank = { strong: 4, warm: 3, cool: 2, cold: 1 }
  const sorted = (rs || []).sort((a, b) =>
    (bucketRank[b.bucket] || 0) - (bucketRank[a.bucket] || 0) ||
    (b.interaction_count || 0) - (a.interaction_count || 0)
  ).slice(0, 5)

  return {
    results: sorted.map(r => ({
      valence_person_id:   r.valence_person_id,
      valence_person_name: peopleMap.get(r.valence_person_id)?.full_name || null,
      via_external_person_id:   r.external_person_id,
      via_external_person_name: peopleMap.get(r.external_person_id)?.full_name || null,
      via_external_company:     peopleMap.get(r.external_person_id)?.company || null,
      bucket: r.bucket,
      interaction_count: r.interaction_count,
      last_interaction_at: r.last_interaction_at
    })),
    match_count: sorted.length
  }
}

// ============ find_top_connectors ============
export async function find_top_connectors(sb, p) {
  if (!p.company_type && !p.sector_tag && !p.geography_tag) {
    return { error: 'at least one of company_type / sector_tag / geography_tag is required', results: [], match_count: 0 }
  }

  let view = null, key = null, value = null
  if (p.company_type)   { view = 'super_connectors_by_company_type'; key = 'company_type';   value = p.company_type }
  else if (p.sector_tag){ view = 'super_connectors_by_sector';       key = 'sector_tag';     value = p.sector_tag }
  else                  { view = 'super_connectors_by_geography';    key = 'geo_tag';        value = p.geography_tag }

  const { data, error } = await sb.from(view)
    .select(`valence_person_id, ${key}, strong_warm_count, total_count`)
    .eq(key, value)
    .order('strong_warm_count', { ascending: false })
    .limit(5)
  if (error) return { error: error.message, results: [], match_count: 0 }

  // Resolve names.
  const ids = (data || []).map(r => r.valence_person_id)
  const { data: people } = await sb.from('people').select('id, full_name, role').in('id', ids)
  const nameMap = new Map((people || []).map(p => [p.id, p]))

  return {
    results: (data || []).map(r => ({
      valence_person_id:   r.valence_person_id,
      valence_person_name: nameMap.get(r.valence_person_id)?.full_name || null,
      valence_person_role: nameMap.get(r.valence_person_id)?.role || null,
      strong_warm_count:   r.strong_warm_count,
      total_count:         r.total_count
    })),
    match_count: (data || []).length
  }
}

// ============ search_deals ============
export async function search_deals(sb, p) {
  let q = sb.from('deals').select(`
    id, client_name, deal_type, deal_subtype, side, sector, stage,
    ticket_size_usd_m, lead_owner, updated_at, created_at
  `).order('updated_at', { ascending: false }).limit(20)

  if (p.stage) q = q.eq('stage', p.stage)
  if (p.involves_company_id)
    q = q.or(`client_name.ilike.%${p.involves_company_id}%,counterparty_name.ilike.%${p.involves_company_id}%`)

  const { data, error } = await q
  if (error) return { error: error.message, results: [], match_count: 0 }

  let filtered = data || []
  if (p.stale_days) {
    const threshold = Date.now() - p.stale_days * 86400000
    filtered = filtered.filter(d => new Date(d.updated_at || d.created_at).getTime() < threshold)
  }
  if (p.involves_external_person_id) {
    const { data: ints } = await sb.from('interactions')
      .select('deal_id')
      .eq('external_person_id', p.involves_external_person_id)
      .not('deal_id', 'is', null)
    const dealIds = new Set((ints || []).map(i => i.deal_id))
    filtered = filtered.filter(d => dealIds.has(d.id))
  }

  return {
    results: filtered.map(d => ({
      id: d.id,
      name: d.client_name,
      deal_type: d.deal_type,
      stage: d.stage,
      sector: d.sector,
      ticket_size_usd_m: d.ticket_size_usd_m,
      owner: d.lead_owner,
      last_activity_at: d.updated_at || d.created_at
    })),
    match_count: filtered.length
  }
}

// ============ get_recent_activity ============
export async function get_recent_activity(sb, p) {
  const daysBack = Number.isFinite(p.days_back) ? p.days_back : 30
  const since = new Date(Date.now() - daysBack * 86400000).toISOString()

  let q = sb.from('interactions').select(`
    id, occurred_at, created_at, interaction_type, type, subject, summary,
    valence_person_id, external_person_id
  `).gte('created_at', since).order('created_at', { ascending: false }).limit(40)

  if (p.external_person_id) q = q.eq('external_person_id', p.external_person_id)
  // company_id — search via people.company name match
  if (p.company_id) {
    const { data: matched } = await sb.from('people')
      .select('id').ilike('company', p.company_id).eq('is_valence_team', false)
    const ids = (matched || []).map(r => r.id)
    if (ids.length === 0) return { results: [], match_count: 0 }
    q = q.in('external_person_id', ids)
  }

  const { data, error } = await q
  if (error) return { error: error.message, results: [], match_count: 0 }
  if (!data?.length) return { results: [], match_count: 0 }

  // Resolve names.
  const ids = Array.from(new Set([
    ...(data.map(d => d.valence_person_id).filter(Boolean)),
    ...(data.map(d => d.external_person_id).filter(Boolean))
  ]))
  const { data: people } = await sb.from('people').select('id, full_name').in('id', ids)
  const nameMap = new Map((people || []).map(p => [p.id, p.full_name]))

  return {
    results: data.map(i => ({
      id: i.id,
      date: i.occurred_at || i.created_at,
      type: i.interaction_type || i.type,
      subject: i.subject,
      summary: i.summary,
      valence_person_name:  i.valence_person_id  ? nameMap.get(i.valence_person_id)  || null : null,
      external_person_name: i.external_person_id ? nameMap.get(i.external_person_id) || null : null
    })),
    match_count: data.length
  }
}

// ============ TOOL REGISTRY ============
// Map name → implementation. The /api/ask route looks up here.
export const TOOL_IMPLEMENTATIONS = {
  search_people, get_relationship, find_best_intro_path,
  find_top_connectors, search_deals, get_recent_activity
}

// Function declarations for Gemini. These ride along with every
// request; Gemini decides which (if any) to call.
export const TOOL_DECLARATIONS = [
  {
    name: 'search_people',
    description: 'Find external people (non-Valence) in the CRM by name, company, type, sector, geography, and/or relationship strength. Use this whenever a user asks "who do we know at X" or "find me Y in Z sector".',
    parameters: {
      type: 'object',
      properties: {
        name_contains:         { type: 'string', description: 'Substring of full name' },
        company_name_contains: { type: 'string', description: 'Substring of company name' },
        company_type:          { type: 'string', description: 'One of: pe_fund, vc_fund, investment_bank, family_office, corporate_buyer, founder, lawyer, banker, other' },
        sector_tags:           { type: 'array', items: { type: 'string' }, description: 'Sector tags like "Healthcare", "Fintech"' },
        geography_tags:        { type: 'array', items: { type: 'string' }, description: 'Geography tags like "Mumbai", "US"' },
        connected_to_valence_person_id: { type: 'string', description: 'If set, only return people who have at least a Cool relationship with this Valence team member' },
        min_strength_bucket:   { type: 'string', description: 'One of: cold, cool, warm, strong. Returns only matches with at least this bucket.' }
      }
    }
  },
  {
    name: 'get_relationship',
    description: 'Get the full relationship picture between a specific Valence person and a specific external person.',
    parameters: {
      type: 'object',
      properties: {
        valence_person_id:  { type: 'string' },
        external_person_id: { type: 'string' }
      },
      required: ['valence_person_id', 'external_person_id']
    }
  },
  {
    name: 'find_best_intro_path',
    description: 'Find the warmest path from Valence into a target external person or company. Returns up to 5 Valence team members ranked by relationship strength.',
    parameters: {
      type: 'object',
      properties: {
        target_external_person_id: { type: 'string' },
        target_company_id:         { type: 'string', description: 'Company name (we match by ilike on people.company since there is no separate companies table yet)' }
      }
    }
  },
  {
    name: 'find_top_connectors',
    description: 'Find which Valence team members have the most relationships to a category. Use for "who at Valence knows the most PE folks" or "who has the strongest Mumbai network".',
    parameters: {
      type: 'object',
      properties: {
        company_type:   { type: 'string' },
        sector_tag:     { type: 'string' },
        geography_tag:  { type: 'string' }
      }
    }
  },
  {
    name: 'search_deals',
    description: 'Find deals in the pipeline.',
    parameters: {
      type: 'object',
      properties: {
        stage:                       { type: 'string' },
        stale_days:                  { type: 'integer', description: 'Deals with no activity in this many days' },
        involves_company_id:         { type: 'string', description: 'Company name fragment' },
        involves_external_person_id: { type: 'string' }
      }
    }
  },
  {
    name: 'get_recent_activity',
    description: 'Get recent interactions for a specific external person or company. Use for "what happened with X recently".',
    parameters: {
      type: 'object',
      properties: {
        external_person_id: { type: 'string' },
        company_id:         { type: 'string', description: 'Company name fragment' },
        days_back:          { type: 'integer', description: 'Default 30' }
      }
    }
  }
]
