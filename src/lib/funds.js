// Fund CRM — Valence's most differentiated dataset. Knowing which funds will
// write checks for which deals is the entire game in capital advisory.

export const FUND_TYPES = [
  'VC', 'PE', 'Growth', 'Family Office', 'Sovereign', 'Hedge Fund', 'Strategic Corp Dev', 'Other'
]

export const WARMTH_LEVELS = ['hot', 'warm', 'cold', 'dormant']

// Funding rounds for the Founders relationship CRM (/funds). Stored in the
// `stages` array column (first element = the company's current round).
export const FOUNDER_STAGES = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E+']

// Current funding round of a founder row — stages[0] by convention.
export function founderStage(row) {
  return Array.isArray(row?.stages) && row.stages.length ? row.stages[0] : null
}

// ── LP relationships (the same /funds page in LP mode) ───────────────────
// LP archetype is stored in fund_type; geographies in the geographies[] array.
export const LP_ARCHETYPES = ['Family Office', 'Endowment', 'Foundation', 'Pension Fund', 'Corporate Venture']
// Basic geographies offered as a starting set — the user can free-type more.
export const LP_GEOGRAPHIES = ['North America', 'Europe', 'India', 'MENA', 'SE Asia', 'China', 'LatAm']

export function lpArchetype(row) { return row?.fund_type || null }
export function lpGeographies(row) { return Array.isArray(row?.geographies) ? row.geographies : [] }

// Demo fallback for the LP relationships view (no Supabase configured).
export const DEMO_LPS = [
  { id: 'lp1', kind: 'lp', name: 'Cedar Foundation',        fund_type: 'Foundation',       geographies: ['North America'],          warmth: 'hot',     last_touched_at: daysAgo(5),   notes: 'Anchor interest; wants quarterly updates.' },
  { id: 'lp2', kind: 'lp', name: 'Evergreen Endowment',     fund_type: 'Endowment',        geographies: ['North America','Europe'], warmth: 'hot',     last_touched_at: daysAgo(8),   notes: '' },
  { id: 'lp3', kind: 'lp', name: 'Maple Pension Fund',      fund_type: 'Pension Fund',     geographies: ['North America'],          warmth: 'warm',    last_touched_at: daysAgo(14),  notes: '' },
  { id: 'lp4', kind: 'lp', name: 'Gulf Sovereign Capital',  fund_type: 'Family Office',    geographies: ['MENA'],                   warmth: 'warm',    last_touched_at: daysAgo(20),  notes: '' },
  { id: 'lp5', kind: 'lp', name: 'Horizon Fund-of-Funds',   fund_type: 'Family Office',    geographies: ['India','SE Asia'],        warmth: 'cold',    last_touched_at: daysAgo(45),  notes: '' },
  { id: 'lp6', kind: 'lp', name: 'Tata Corporate Ventures', fund_type: 'Corporate Venture', geographies: ['India'],                 warmth: 'warm',    last_touched_at: daysAgo(18),  notes: '' },
  { id: 'lp7', kind: 'lp', name: 'Lotus Family Office',     fund_type: 'Family Office',    geographies: ['India','MENA'],           warmth: 'dormant', last_touched_at: daysAgo(120), notes: '' }
]

// Demo fallback for the Founders CRM page when Supabase isn't configured.
// (DEMO_FUNDS below stays as-is — the fund-match screener and its tests
// still score against investor funds.)
export const DEMO_FOUNDERS = [
  { id: 'fc1',  name: 'HoV Mushrooms',     hq_city: 'Mumbai',    hq_country: 'India', sectors: ['Consumer','AgriTech'],      stages: ['Series A'], warmth: 'hot',     last_touched_at: daysAgo(3),   notes: 'Founder very responsive; expanding to Dubai.' },
  { id: 'fc2',  name: 'Quantia Tech',      hq_city: 'Bengaluru', hq_country: 'India', sectors: ['Fintech','SaaS'],           stages: ['Series B'], warmth: 'hot',     last_touched_at: daysAgo(6),   notes: '' },
  { id: 'fc3',  name: 'NovaHealth',        hq_city: 'Mumbai',    hq_country: 'India', sectors: ['Healthcare'],               stages: ['Series C'], warmth: 'warm',    last_touched_at: daysAgo(12),  notes: '' },
  { id: 'fc4',  name: 'Lighthouse Capital',hq_city: 'Singapore', hq_country: 'Singapore', sectors: ['Fintech'],              stages: ['Seed'],     warmth: 'warm',    last_touched_at: daysAgo(18),  notes: '' },
  { id: 'fc5',  name: 'Orbit Foods',       hq_city: 'Delhi',     hq_country: 'India', sectors: ['Consumer','D2C'],           stages: ['Pre-seed'], warmth: 'cold',    last_touched_at: daysAgo(40),  notes: '' },
  { id: 'fc6',  name: 'Saffron Retail',    hq_city: 'Mumbai',    hq_country: 'India', sectors: ['Consumer Tech','Retail'],   stages: ['Series D'], warmth: 'cold',    last_touched_at: daysAgo(75),  notes: '' },
  { id: 'fc7',  name: 'MedPlus Diagnostics', hq_city: 'Hyderabad', hq_country: 'India', sectors: ['Healthcare','Diagnostics'], stages: ['Series E+'], warmth: 'dormant', last_touched_at: daysAgo(140), notes: '' }
]

export function warmthTone(warmth) {
  return ({
    hot:     'bg-valence-danger/10 text-valence-danger border-valence-danger/30',
    warm:    'bg-valence-warning/10 text-valence-warning border-valence-warning/30',
    cold:    'bg-valence-blue-soft text-valence-blue border-valence-blue/30',
    dormant: 'bg-valence-surface text-valence-muted border-valence-border'
  })[warmth] || 'bg-valence-surface text-valence-muted border-valence-border'
}

export function fundTypeLabel(type) { return type || 'Other' }

// Pick the best signal for "ticket" from the new deal-type model. Fundraise
// uses target_raise_usd_m; Exit uses target_exit_usd_m; M&A leaves it null
// (cheque-band match is skipped) since the ask is a spec, not a number.
function ticketFromDeal(deal) {
  if (!deal) return 0
  if (deal.deal_subtype === 'fundraise') return Number(deal.target_raise_usd_m) || 0
  if (deal.deal_subtype === 'exit')      return Number(deal.target_exit_usd_m)  || 0
  return 0
}

// What the screener is matching FOR — varies by deal subtype. Drives the
// fund-type whitelist, the heuristic weighting, and the UI labels.
//   fundraise  → "investors"        any check-writer
//   m_and_a    → "acquirers"        strategic + PE buyers
//   exit       → "secondary buyers" large PE / sovereigns / family offices
//   advisory   → null               no fund match makes sense
export function screenerModeForDeal(deal) {
  const types = Array.isArray(deal?.deal_types) ? deal.deal_types : []
  if (!types.includes('transaction')) return null
  if (deal.deal_subtype === 'fundraise') return 'fundraise'
  if (deal.deal_subtype === 'm_and_a')   return 'm_and_a'
  if (deal.deal_subtype === 'exit')      return 'exit'
  return null
}

// Human label for the matched audience — used in screener output ("Top funds"
// vs "Top acquirers" vs "Top secondary buyers").
export function audienceLabelFor(mode) {
  if (mode === 'fundraise') return { plural: 'investors',        verb: 'will write checks' }
  if (mode === 'm_and_a')   return { plural: 'acquirers',        verb: 'are likely buyers' }
  if (mode === 'exit')      return { plural: 'secondary buyers', verb: 'buy LP / secondary positions' }
  return { plural: 'funds', verb: 'might engage' }
}

// Which fund_type values are even eligible for a given screener mode.
// We score the rest as zero so the heuristic doesn't waste rank slots.
function eligibleTypesFor(mode) {
  if (mode === 'fundraise') return null // any type
  if (mode === 'm_and_a')   return new Set(['PE', 'Strategic Corp Dev', 'Growth', 'Sovereign'])
  if (mode === 'exit')      return new Set(['PE', 'Growth', 'Sovereign', 'Family Office', 'Hedge Fund', 'Other'])
  return null
}

// Score a fund's fit against a deal. 0-100. Heuristic, not ML.
// `mode` selects the scoring strategy. When omitted, we infer from the deal.
export function scoreFundForDeal(fund, deal, mode) {
  if (!fund || !deal) return { score: 0, reasons: [] }
  const m = mode || screenerModeForDeal(deal)
  const allowed = eligibleTypesFor(m)
  if (allowed && !allowed.has(fund.fund_type)) {
    return { score: 0, reasons: [`Not a ${m === 'm_and_a' ? 'likely acquirer' : 'likely secondary buyer'}`] }
  }

  let score = 0
  const reasons = []

  // Sector match — weighted heaviest because thesis fit is the spine of the
  // judgement for every subtype.
  const fundSectors = (fund.sectors || []).map(normalize)
  const dealSector = normalize(deal.sector)
  if (dealSector && fundSectors.includes(dealSector)) {
    const points = m === 'm_and_a' ? 45 : 35
    score += points; reasons.push(`Active in ${deal.sector}`)
  }

  // Stage match (fundraise only — for M&A / exit, fund "stages" don't map cleanly).
  if (m === 'fundraise') {
    const fundStages = (fund.stages || []).map(normalize)
    const dealStage = normalize(deal.stage)
    if (dealStage && fundStages.length === 0) {
      score += 10; reasons.push('Stage-agnostic')
    } else if (dealStage && fundStages.includes(dealStage)) {
      score += 20; reasons.push(`Active in ${deal.stage}`)
    }
  }

  // Cheque-size band — only meaningful for fundraise + exit (where the
  // mandate has a numeric ask). M&A asks are a spec, not a number.
  if (m === 'fundraise' || m === 'exit') {
    const ticket = ticketFromDeal(deal)
    const min = Number(fund.check_size_min_usd_m) || 0
    const max = Number(fund.check_size_max_usd_m) || Infinity
    if (ticket > 0 && ticket >= min && ticket <= max) {
      score += 25; reasons.push(`Writes $${formatRange(min, max)}M cheques`)
    } else if (ticket > 0 && (ticket < min * 0.7 || ticket > max * 1.3)) {
      score -= 10; reasons.push(`Cheque size mismatch ($${formatRange(min, max)}M)`)
    }
  }

  // M&A-specific bonuses — strategic acquirers get a boost (sector synergy
  // beats financial logic for them); large-cap PE gets a bump (thesis-driven
  // platform plays).
  if (m === 'm_and_a') {
    if (fund.fund_type === 'Strategic Corp Dev') {
      score += 18; reasons.push('Strategic acquirer')
    } else if (fund.fund_type === 'PE') {
      score += 12; reasons.push('PE platform thesis')
    }
  }

  // Exit-specific bonus — large PE and sovereigns are the typical secondary
  // buyers; family offices write smaller secondary tickets.
  if (m === 'exit') {
    if (fund.fund_type === 'Sovereign') { score += 14; reasons.push('Sovereign secondary appetite') }
    else if (fund.fund_type === 'PE')    { score += 10; reasons.push('PE secondary platform') }
  }

  // Warmth boost: 12 hot, 8 warm, 4 cold, 0 dormant.
  score += ({ hot: 12, warm: 8, cold: 4, dormant: 0 })[fund.warmth] || 0
  if (['hot', 'warm'].includes(fund.warmth)) reasons.push(`${fund.warmth} relationship`)

  // Recency: +6 if last_touched_at within 90 days.
  if (fund.last_touched_at) {
    const days = (Date.now() - new Date(fund.last_touched_at).getTime()) / 86_400_000
    if (days <= 90) { score += 6; reasons.push('Interacted in last 90d') }
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons }
}

// Whether fund-matching makes sense for this deal at all.
export function isFundMatchApplicable(deal) {
  return screenerModeForDeal(deal) !== null
}

export function matchFundsForDeal(funds, deal, { limit = 12, mode } = {}) {
  if (!Array.isArray(funds) || !deal) return []
  const m = mode || screenerModeForDeal(deal)
  if (!m) return []
  const scored = funds.map(f => ({ fund: f, ...scoreFundForDeal(f, deal, m) }))
  return scored
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function normalize(v) { return (v || '').toString().toLowerCase().trim() }
function formatRange(min, max) {
  if (max === Infinity || !Number.isFinite(max)) return `${min}+`
  return `${min}–${max}`
}

// Demo data — used when Supabase isn't configured. ~32 funds across geos.
export const DEMO_FUNDS = [
  // Indian VC / Growth
  { id: 'f1',  name: 'Peak XV Partners',     fund_type: 'VC',          hq_city: 'Bengaluru', hq_country: 'India',        aum_usd_m: 9000, check_size_min_usd_m: 5,   check_size_max_usd_m: 100, sectors: ['Fintech','Consumer','Healthcare','SaaS'], stages: ['Seed','Series A','Series B'], geographies: ['India','SE Asia'], warmth: 'hot',     last_touched_at: daysAgo(8) },
  { id: 'f2',  name: 'Accel India',          fund_type: 'VC',          hq_city: 'Bengaluru', hq_country: 'India',        aum_usd_m: 4000, check_size_min_usd_m: 2,   check_size_max_usd_m: 60,  sectors: ['Fintech','SaaS','Consumer'],              stages: ['Seed','Series A','Series B'],             geographies: ['India'],         warmth: 'warm',    last_touched_at: daysAgo(22) },
  { id: 'f3',  name: 'Lightspeed India',     fund_type: 'VC',          hq_city: 'Mumbai',    hq_country: 'India',        aum_usd_m: 3000, check_size_min_usd_m: 3,   check_size_max_usd_m: 80,  sectors: ['Fintech','EdTech','Consumer Tech'],       stages: ['Seed','Series A','Series B'],             geographies: ['India','US'],    warmth: 'warm',    last_touched_at: daysAgo(35) },
  { id: 'f4',  name: 'Blume Ventures',       fund_type: 'VC',          hq_city: 'Mumbai',    hq_country: 'India',        aum_usd_m: 700,  check_size_min_usd_m: 0.5, check_size_max_usd_m: 12,  sectors: ['SaaS','Fintech','Consumer Tech'],         stages: ['Seed','Series A','Series B'],                         geographies: ['India'],         warmth: 'cold',    last_touched_at: daysAgo(120) },
  { id: 'f5',  name: 'Kalaari Capital',      fund_type: 'VC',          hq_city: 'Bengaluru', hq_country: 'India',        aum_usd_m: 740,  check_size_min_usd_m: 1,   check_size_max_usd_m: 15,  sectors: ['Consumer','Healthcare','SaaS'],           stages: ['Seed','Series A','Series B'],                         geographies: ['India'],         warmth: 'cold',    last_touched_at: daysAgo(78) },
  { id: 'f6',  name: 'Chiratae Ventures',    fund_type: 'VC',          hq_city: 'Bengaluru', hq_country: 'India',        aum_usd_m: 1200, check_size_min_usd_m: 1,   check_size_max_usd_m: 25,  sectors: ['Healthcare','Fintech','Consumer'],        stages: ['Seed','Series A','Series B'],             geographies: ['India'],         warmth: 'warm',    last_touched_at: daysAgo(40) },
  { id: 'f7',  name: 'Elevation Capital',    fund_type: 'Growth',      hq_city: 'Gurugram',  hq_country: 'India',        aum_usd_m: 2000, check_size_min_usd_m: 5,   check_size_max_usd_m: 50,  sectors: ['Fintech','Consumer','SaaS'],              stages: ['Series B','Growth'],           geographies: ['India'],         warmth: 'warm',    last_touched_at: daysAgo(18) },
  { id: 'f8',  name: 'Stellaris Venture Partners', fund_type: 'VC',    hq_city: 'Bengaluru', hq_country: 'India',        aum_usd_m: 600,  check_size_min_usd_m: 1,   check_size_max_usd_m: 12,  sectors: ['SaaS','EdTech','Consumer Tech'],          stages: ['Seed','Series A','Series B'],                         geographies: ['India'],         warmth: 'cold',    last_touched_at: daysAgo(95) },
  { id: 'f9',  name: 'Matrix Partners India', fund_type: 'VC',         hq_city: 'Mumbai',    hq_country: 'India',        aum_usd_m: 1500, check_size_min_usd_m: 2,   check_size_max_usd_m: 30,  sectors: ['Consumer','SaaS','Fintech'],              stages: ['Seed','Series A','Series B'],             geographies: ['India'],         warmth: 'cold',    last_touched_at: daysAgo(110) },
  { id: 'f10', name: 'Nexus Venture Partners',     fund_type: 'VC',    hq_city: 'Mumbai',    hq_country: 'India',        aum_usd_m: 2400, check_size_min_usd_m: 3,   check_size_max_usd_m: 40,  sectors: ['SaaS','Consumer Tech','Fintech'],         stages: ['Seed','Series A','Series B'],             geographies: ['India','US'],    warmth: 'warm',    last_touched_at: daysAgo(50) },
  // Global VC/Growth
  { id: 'f11', name: 'Sequoia Capital',      fund_type: 'VC',          hq_city: 'Menlo Park',hq_country: 'USA',          aum_usd_m: 85000,check_size_min_usd_m: 10,  check_size_max_usd_m: 250, sectors: ['SaaS','Fintech','Consumer Tech','AI'],    stages: ['Seed','Series A','Series B'],           geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(150) },
  { id: 'f12', name: 'Andreessen Horowitz (a16z)', fund_type: 'VC',    hq_city: 'Menlo Park',hq_country: 'USA',          aum_usd_m: 35000,check_size_min_usd_m: 10,  check_size_max_usd_m: 300, sectors: ['Fintech','SaaS','AI','Consumer Tech'],    stages: ['Seed','Series A','Series B'],           geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(180) },
  { id: 'f13', name: 'Tiger Global',         fund_type: 'Growth',      hq_city: 'New York',  hq_country: 'USA',          aum_usd_m: 60000,check_size_min_usd_m: 25,  check_size_max_usd_m: 500, sectors: ['Fintech','SaaS','Consumer Tech'],         stages: ['Series B','Growth'], geographies: ['Global'],   warmth: 'warm',    last_touched_at: daysAgo(28) },
  { id: 'f14', name: 'SoftBank Vision Fund', fund_type: 'Growth',      hq_city: 'Tokyo',     hq_country: 'Japan',        aum_usd_m: 100000,check_size_min_usd_m: 50, check_size_max_usd_m: 1000,sectors: ['Consumer Tech','Fintech','AI'],           stages: ['Series B','Growth'],                     geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(220) },
  { id: 'f15', name: 'General Atlantic',     fund_type: 'Growth',      hq_city: 'New York',  hq_country: 'USA',          aum_usd_m: 76000,check_size_min_usd_m: 50,  check_size_max_usd_m: 600, sectors: ['Fintech','Healthcare','Consumer','SaaS'], stages: ['Series B','Growth'],           geographies: ['Global'],        warmth: 'warm',    last_touched_at: daysAgo(60) },
  { id: 'f16', name: 'Insight Partners',     fund_type: 'Growth',      hq_city: 'New York',  hq_country: 'USA',          aum_usd_m: 80000,check_size_min_usd_m: 30,  check_size_max_usd_m: 500, sectors: ['SaaS','Fintech'],                          stages: ['Series B','Growth'],           geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(140) },
  { id: 'f17', name: 'Coatue Management',    fund_type: 'Hedge Fund',  hq_city: 'New York',  hq_country: 'USA',          aum_usd_m: 50000,check_size_min_usd_m: 25,  check_size_max_usd_m: 400, sectors: ['Fintech','Consumer Tech','SaaS'],         stages: ['Growth','Pre-IPO'],           geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(165) },
  // Global PE
  { id: 'f18', name: 'KKR',                  fund_type: 'PE',          hq_city: 'New York',  hq_country: 'USA',          aum_usd_m: 540000,check_size_min_usd_m: 100,check_size_max_usd_m: 2000, sectors: ['Infrastructure','Healthcare','Consumer','Real Estate','Energy'], stages: ['Growth','Buyout'], geographies: ['Global'],        warmth: 'warm',    last_touched_at: daysAgo(20) },
  { id: 'f19', name: 'Blackstone',           fund_type: 'PE',          hq_city: 'New York',  hq_country: 'USA',          aum_usd_m: 1000000,check_size_min_usd_m: 100,check_size_max_usd_m: 3000, sectors: ['Real Estate','Infrastructure','Healthcare','Consumer'],         stages: ['Growth','Buyout'], geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(105) },
  { id: 'f20', name: 'Carlyle Group',        fund_type: 'PE',          hq_city: 'Washington',hq_country: 'USA',          aum_usd_m: 425000,check_size_min_usd_m: 75, check_size_max_usd_m: 1500, sectors: ['Healthcare','Consumer','Industrials'],    stages: ['Growth','Buyout'],         geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(170) },
  { id: 'f21', name: 'Brookfield Asset Mgmt',fund_type: 'PE',          hq_city: 'Toronto',   hq_country: 'Canada',       aum_usd_m: 925000,check_size_min_usd_m: 100,check_size_max_usd_m: 2500, sectors: ['Infrastructure','Real Estate','Renewables'],                    stages: ['Growth','Buyout'], geographies: ['Global'],        warmth: 'warm',    last_touched_at: daysAgo(15) },
  { id: 'f22', name: 'TPG Capital',          fund_type: 'PE',          hq_city: 'San Francisco', hq_country: 'USA',      aum_usd_m: 224000,check_size_min_usd_m: 75, check_size_max_usd_m: 1000, sectors: ['Healthcare','Consumer','Tech'],           stages: ['Growth','Buyout'],         geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(95) },
  { id: 'f23', name: 'Bain Capital',         fund_type: 'PE',          hq_city: 'Boston',    hq_country: 'USA',          aum_usd_m: 185000,check_size_min_usd_m: 50, check_size_max_usd_m: 1500, sectors: ['Healthcare','Consumer','Industrials','Tech'],                    stages: ['Growth','Buyout'], geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(190) },
  // Sovereign + family offices
  { id: 'f24', name: 'GIC',                  fund_type: 'Sovereign',   hq_city: 'Singapore', hq_country: 'Singapore',    aum_usd_m: 770000,check_size_min_usd_m: 100,check_size_max_usd_m: 2000, sectors: ['Infrastructure','Real Estate','Renewables','Healthcare'],       stages: ['Growth','Buyout'], geographies: ['India','SE Asia','Global'], warmth: 'warm', last_touched_at: daysAgo(30) },
  { id: 'f25', name: 'Temasek',              fund_type: 'Sovereign',   hq_city: 'Singapore', hq_country: 'Singapore',    aum_usd_m: 380000,check_size_min_usd_m: 50, check_size_max_usd_m: 1500, sectors: ['Healthcare','Tech','Fintech','Consumer'], stages: ['Growth','Buyout'],           geographies: ['India','Global'],warmth: 'warm',    last_touched_at: daysAgo(45) },
  { id: 'f26', name: 'ADIA',                 fund_type: 'Sovereign',   hq_city: 'Abu Dhabi', hq_country: 'UAE',          aum_usd_m: 780000,check_size_min_usd_m: 100,check_size_max_usd_m: 3000, sectors: ['Infrastructure','Real Estate','Energy'],  stages: ['Growth','Buyout'],         geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(125) },
  { id: 'f27', name: 'Premji Invest',        fund_type: 'Family Office',hq_city: 'Bengaluru',hq_country: 'India',        aum_usd_m: 12000, check_size_min_usd_m: 10, check_size_max_usd_m: 200, sectors: ['Healthcare','Consumer','SaaS','Fintech'], stages: ['Series A','Growth'],           geographies: ['India','US'],    warmth: 'hot',     last_touched_at: daysAgo(12) },
  { id: 'f28', name: 'Catamaran Ventures',   fund_type: 'Family Office',hq_city: 'Bengaluru',hq_country: 'India',        aum_usd_m: 1500,  check_size_min_usd_m: 2,  check_size_max_usd_m: 50,  sectors: ['Consumer','Healthcare','SaaS'],           stages: ['Series A','Growth'],             geographies: ['India'],         warmth: 'warm',    last_touched_at: daysAgo(38) },
  { id: 'f29', name: 'RNT Capital',          fund_type: 'Family Office',hq_city: 'Mumbai',   hq_country: 'India',        aum_usd_m: 800,   check_size_min_usd_m: 1,  check_size_max_usd_m: 25,  sectors: ['Consumer','Tech','Renewables'],           stages: ['Series A','Growth'],             geographies: ['India','Global'],warmth: 'warm',    last_touched_at: daysAgo(55) },
  { id: 'f30', name: 'Reliance Family Office',fund_type:'Family Office',hq_city: 'Mumbai',   hq_country: 'India',        aum_usd_m: 5000,  check_size_min_usd_m: 25, check_size_max_usd_m: 500, sectors: ['Energy','Telecom','Consumer','Infrastructure'],                  stages: ['Series A','Growth'], geographies: ['India','Global'],warmth: 'cold', last_touched_at: daysAgo(160) },
  // Strategic corp dev
  { id: 'f31', name: 'Tata Capital — Corp Dev',fund_type: 'Strategic Corp Dev',hq_city: 'Mumbai',hq_country: 'India',     aum_usd_m: null,  check_size_min_usd_m: 25, check_size_max_usd_m: 500, sectors: ['Consumer','Industrials','Tech'],         stages: ['Buyout'],         geographies: ['India','UK'],   warmth: 'warm',    last_touched_at: daysAgo(30) },
  { id: 'f32', name: 'Reliance Industries — M&A',fund_type:'Strategic Corp Dev',hq_city: 'Mumbai',hq_country: 'India',    aum_usd_m: null,  check_size_min_usd_m: 50, check_size_max_usd_m: 1000,sectors: ['Telecom','Energy','Consumer','Tech'],     stages: ['Buyout'],         geographies: ['India'],        warmth: 'cold',    last_touched_at: daysAgo(200) }
]

function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0,10) }
