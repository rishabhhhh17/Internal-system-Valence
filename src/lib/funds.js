// Fund CRM — Valence's most differentiated dataset. Knowing which funds will
// write checks for which deals is the entire game in capital advisory.

export const FUND_TYPES = [
  'VC', 'PE', 'Growth', 'Family Office', 'Sovereign', 'Hedge Fund', 'Strategic Corp Dev', 'Other'
]

export const WARMTH_LEVELS = ['hot', 'warm', 'cold', 'dormant']

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

// Score a fund's fit against a deal. 0-100. Heuristic, not ML.
export function scoreFundForDeal(fund, deal) {
  if (!fund || !deal) return 0
  let score = 0
  const reasons = []

  // Sector match: 35 points if exact, 0 otherwise.
  const fundSectors = (fund.sectors || []).map(normalize)
  const dealSector = normalize(deal.sector)
  if (dealSector && fundSectors.includes(dealSector)) {
    score += 35; reasons.push(`Active in ${deal.sector}`)
  }

  // Stage match: 20 points if explicit; 10 points if "any stage".
  const fundStages = (fund.stages || []).map(normalize)
  const dealStage = normalize(deal.stage)
  if (dealStage && fundStages.length === 0) {
    score += 10; reasons.push('Stage-agnostic')
  } else if (dealStage && fundStages.includes(dealStage)) {
    score += 20; reasons.push(`Active in ${deal.stage}`)
  }

  // Cheque-size band: 25 points if deal ticket sits inside the band.
  // Skipped entirely for M&A deals (the ask is a spec, not a number) and
  // for Advisory-only mandates (no fund-match makes sense).
  const ticket = ticketFromDeal(deal)
  const min = Number(fund.check_size_min_usd_m) || 0
  const max = Number(fund.check_size_max_usd_m) || Infinity
  if (ticket > 0 && ticket >= min && ticket <= max) {
    score += 25
    reasons.push(`Writes $${formatRange(min, max)}M cheques`)
  } else if (ticket > 0 && (ticket < min * 0.7 || ticket > max * 1.3)) {
    score -= 10
    reasons.push(`Cheque size mismatch ($${formatRange(min, max)}M)`)
  }

  // Warmth boost: 12 hot, 8 warm, 4 cold, 0 dormant.
  score += ({ hot: 12, warm: 8, cold: 4, dormant: 0 })[fund.warmth] || 0
  if (['hot', 'warm'].includes(fund.warmth)) reasons.push(`${fund.warmth} relationship`)

  // Recency: +6 if last_touched_at within 90 days.
  if (fund.last_touched_at) {
    const days = (Date.now() - new Date(fund.last_touched_at).getTime()) / 86_400_000
    if (days <= 90) { score += 6; reasons.push('Touched in last 90d') }
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons }
}

// Whether fund-matching makes sense for this deal at all.
export function isFundMatchApplicable(deal) {
  const types = Array.isArray(deal?.deal_types) ? deal.deal_types : []
  // Advisory-only mandates aren't fund-matchable.
  if (!types.includes('transaction')) return false
  // M&A is conceptually a buyer/strategic match, not a fund match. Still
  // useful for buy-side (sponsor as acquirer) and sell-side (sponsor as
  // potential exit), so we keep it on; the heuristic just won't filter on
  // cheque size.
  return true
}

export function matchFundsForDeal(funds, deal, { limit = 12 } = {}) {
  if (!Array.isArray(funds) || !deal) return []
  const scored = funds.map(f => ({ fund: f, ...scoreFundForDeal(f, deal) }))
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
  { id: 'f1',  name: 'Peak XV Partners',     fund_type: 'VC',          hq_city: 'Bengaluru', hq_country: 'India',        aum_usd_m: 9000, check_size_min_usd_m: 5,   check_size_max_usd_m: 100, sectors: ['Fintech','Consumer','Healthcare','SaaS'], stages: ['Mandate','Marketing','Diligence'], geographies: ['India','SE Asia'], warmth: 'hot',     last_touched_at: daysAgo(8) },
  { id: 'f2',  name: 'Accel India',          fund_type: 'VC',          hq_city: 'Bengaluru', hq_country: 'India',        aum_usd_m: 4000, check_size_min_usd_m: 2,   check_size_max_usd_m: 60,  sectors: ['Fintech','SaaS','Consumer'],              stages: ['Mandate','Marketing'],             geographies: ['India'],         warmth: 'warm',    last_touched_at: daysAgo(22) },
  { id: 'f3',  name: 'Lightspeed India',     fund_type: 'VC',          hq_city: 'Mumbai',    hq_country: 'India',        aum_usd_m: 3000, check_size_min_usd_m: 3,   check_size_max_usd_m: 80,  sectors: ['Fintech','EdTech','Consumer Tech'],       stages: ['Mandate','Marketing'],             geographies: ['India','US'],    warmth: 'warm',    last_touched_at: daysAgo(35) },
  { id: 'f4',  name: 'Blume Ventures',       fund_type: 'VC',          hq_city: 'Mumbai',    hq_country: 'India',        aum_usd_m: 700,  check_size_min_usd_m: 0.5, check_size_max_usd_m: 12,  sectors: ['SaaS','Fintech','Consumer Tech'],         stages: ['Mandate'],                         geographies: ['India'],         warmth: 'cold',    last_touched_at: daysAgo(120) },
  { id: 'f5',  name: 'Kalaari Capital',      fund_type: 'VC',          hq_city: 'Bengaluru', hq_country: 'India',        aum_usd_m: 740,  check_size_min_usd_m: 1,   check_size_max_usd_m: 15,  sectors: ['Consumer','Healthcare','SaaS'],           stages: ['Mandate'],                         geographies: ['India'],         warmth: 'cold',    last_touched_at: daysAgo(78) },
  { id: 'f6',  name: 'Chiratae Ventures',    fund_type: 'VC',          hq_city: 'Bengaluru', hq_country: 'India',        aum_usd_m: 1200, check_size_min_usd_m: 1,   check_size_max_usd_m: 25,  sectors: ['Healthcare','Fintech','Consumer'],        stages: ['Mandate','Marketing'],             geographies: ['India'],         warmth: 'warm',    last_touched_at: daysAgo(40) },
  { id: 'f7',  name: 'Elevation Capital',    fund_type: 'Growth',      hq_city: 'Gurugram',  hq_country: 'India',        aum_usd_m: 2000, check_size_min_usd_m: 5,   check_size_max_usd_m: 50,  sectors: ['Fintech','Consumer','SaaS'],              stages: ['Marketing','Diligence'],           geographies: ['India'],         warmth: 'warm',    last_touched_at: daysAgo(18) },
  { id: 'f8',  name: 'Stellaris Venture Partners', fund_type: 'VC',    hq_city: 'Bengaluru', hq_country: 'India',        aum_usd_m: 600,  check_size_min_usd_m: 1,   check_size_max_usd_m: 12,  sectors: ['SaaS','EdTech','Consumer Tech'],          stages: ['Mandate'],                         geographies: ['India'],         warmth: 'cold',    last_touched_at: daysAgo(95) },
  { id: 'f9',  name: 'Matrix Partners India', fund_type: 'VC',         hq_city: 'Mumbai',    hq_country: 'India',        aum_usd_m: 1500, check_size_min_usd_m: 2,   check_size_max_usd_m: 30,  sectors: ['Consumer','SaaS','Fintech'],              stages: ['Mandate','Marketing'],             geographies: ['India'],         warmth: 'cold',    last_touched_at: daysAgo(110) },
  { id: 'f10', name: 'Nexus Venture Partners',     fund_type: 'VC',    hq_city: 'Mumbai',    hq_country: 'India',        aum_usd_m: 2400, check_size_min_usd_m: 3,   check_size_max_usd_m: 40,  sectors: ['SaaS','Consumer Tech','Fintech'],         stages: ['Mandate','Marketing'],             geographies: ['India','US'],    warmth: 'warm',    last_touched_at: daysAgo(50) },
  // Global VC/Growth
  { id: 'f11', name: 'Sequoia Capital',      fund_type: 'VC',          hq_city: 'Menlo Park',hq_country: 'USA',          aum_usd_m: 85000,check_size_min_usd_m: 10,  check_size_max_usd_m: 250, sectors: ['SaaS','Fintech','Consumer Tech','AI'],    stages: ['Marketing','Diligence'],           geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(150) },
  { id: 'f12', name: 'Andreessen Horowitz (a16z)', fund_type: 'VC',    hq_city: 'Menlo Park',hq_country: 'USA',          aum_usd_m: 35000,check_size_min_usd_m: 10,  check_size_max_usd_m: 300, sectors: ['Fintech','SaaS','AI','Consumer Tech'],    stages: ['Marketing','Diligence'],           geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(180) },
  { id: 'f13', name: 'Tiger Global',         fund_type: 'Growth',      hq_city: 'New York',  hq_country: 'USA',          aum_usd_m: 60000,check_size_min_usd_m: 25,  check_size_max_usd_m: 500, sectors: ['Fintech','SaaS','Consumer Tech'],         stages: ['Marketing','Diligence','Negotiation'], geographies: ['Global'],   warmth: 'warm',    last_touched_at: daysAgo(28) },
  { id: 'f14', name: 'SoftBank Vision Fund', fund_type: 'Growth',      hq_city: 'Tokyo',     hq_country: 'Japan',        aum_usd_m: 100000,check_size_min_usd_m: 50, check_size_max_usd_m: 1000,sectors: ['Consumer Tech','Fintech','AI'],           stages: ['Negotiation'],                     geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(220) },
  { id: 'f15', name: 'General Atlantic',     fund_type: 'Growth',      hq_city: 'New York',  hq_country: 'USA',          aum_usd_m: 76000,check_size_min_usd_m: 50,  check_size_max_usd_m: 600, sectors: ['Fintech','Healthcare','Consumer','SaaS'], stages: ['Marketing','Diligence'],           geographies: ['Global'],        warmth: 'warm',    last_touched_at: daysAgo(60) },
  { id: 'f16', name: 'Insight Partners',     fund_type: 'Growth',      hq_city: 'New York',  hq_country: 'USA',          aum_usd_m: 80000,check_size_min_usd_m: 30,  check_size_max_usd_m: 500, sectors: ['SaaS','Fintech'],                          stages: ['Marketing','Diligence'],           geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(140) },
  { id: 'f17', name: 'Coatue Management',    fund_type: 'Hedge Fund',  hq_city: 'New York',  hq_country: 'USA',          aum_usd_m: 50000,check_size_min_usd_m: 25,  check_size_max_usd_m: 400, sectors: ['Fintech','Consumer Tech','SaaS'],         stages: ['Marketing','Diligence'],           geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(165) },
  // Global PE
  { id: 'f18', name: 'KKR',                  fund_type: 'PE',          hq_city: 'New York',  hq_country: 'USA',          aum_usd_m: 540000,check_size_min_usd_m: 100,check_size_max_usd_m: 2000, sectors: ['Infrastructure','Healthcare','Consumer','Real Estate','Energy'], stages: ['Diligence','Negotiation'], geographies: ['Global'],        warmth: 'warm',    last_touched_at: daysAgo(20) },
  { id: 'f19', name: 'Blackstone',           fund_type: 'PE',          hq_city: 'New York',  hq_country: 'USA',          aum_usd_m: 1000000,check_size_min_usd_m: 100,check_size_max_usd_m: 3000, sectors: ['Real Estate','Infrastructure','Healthcare','Consumer'],         stages: ['Diligence','Negotiation'], geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(105) },
  { id: 'f20', name: 'Carlyle Group',        fund_type: 'PE',          hq_city: 'Washington',hq_country: 'USA',          aum_usd_m: 425000,check_size_min_usd_m: 75, check_size_max_usd_m: 1500, sectors: ['Healthcare','Consumer','Industrials'],    stages: ['Diligence','Negotiation'],         geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(170) },
  { id: 'f21', name: 'Brookfield Asset Mgmt',fund_type: 'PE',          hq_city: 'Toronto',   hq_country: 'Canada',       aum_usd_m: 925000,check_size_min_usd_m: 100,check_size_max_usd_m: 2500, sectors: ['Infrastructure','Real Estate','Renewables'],                    stages: ['Diligence','Negotiation'], geographies: ['Global'],        warmth: 'warm',    last_touched_at: daysAgo(15) },
  { id: 'f22', name: 'TPG Capital',          fund_type: 'PE',          hq_city: 'San Francisco', hq_country: 'USA',      aum_usd_m: 224000,check_size_min_usd_m: 75, check_size_max_usd_m: 1000, sectors: ['Healthcare','Consumer','Tech'],           stages: ['Diligence','Negotiation'],         geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(95) },
  { id: 'f23', name: 'Bain Capital',         fund_type: 'PE',          hq_city: 'Boston',    hq_country: 'USA',          aum_usd_m: 185000,check_size_min_usd_m: 50, check_size_max_usd_m: 1500, sectors: ['Healthcare','Consumer','Industrials','Tech'],                    stages: ['Diligence','Negotiation'], geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(190) },
  // Sovereign + family offices
  { id: 'f24', name: 'GIC',                  fund_type: 'Sovereign',   hq_city: 'Singapore', hq_country: 'Singapore',    aum_usd_m: 770000,check_size_min_usd_m: 100,check_size_max_usd_m: 2000, sectors: ['Infrastructure','Real Estate','Renewables','Healthcare'],       stages: ['Diligence','Negotiation'], geographies: ['India','SE Asia','Global'], warmth: 'warm', last_touched_at: daysAgo(30) },
  { id: 'f25', name: 'Temasek',              fund_type: 'Sovereign',   hq_city: 'Singapore', hq_country: 'Singapore',    aum_usd_m: 380000,check_size_min_usd_m: 50, check_size_max_usd_m: 1500, sectors: ['Healthcare','Tech','Fintech','Consumer'], stages: ['Marketing','Diligence'],           geographies: ['India','Global'],warmth: 'warm',    last_touched_at: daysAgo(45) },
  { id: 'f26', name: 'ADIA',                 fund_type: 'Sovereign',   hq_city: 'Abu Dhabi', hq_country: 'UAE',          aum_usd_m: 780000,check_size_min_usd_m: 100,check_size_max_usd_m: 3000, sectors: ['Infrastructure','Real Estate','Energy'],  stages: ['Diligence','Negotiation'],         geographies: ['Global'],        warmth: 'cold',    last_touched_at: daysAgo(125) },
  { id: 'f27', name: 'Premji Invest',        fund_type: 'Family Office',hq_city: 'Bengaluru',hq_country: 'India',        aum_usd_m: 12000, check_size_min_usd_m: 10, check_size_max_usd_m: 200, sectors: ['Healthcare','Consumer','SaaS','Fintech'], stages: ['Marketing','Diligence'],           geographies: ['India','US'],    warmth: 'hot',     last_touched_at: daysAgo(12) },
  { id: 'f28', name: 'Catamaran Ventures',   fund_type: 'Family Office',hq_city: 'Bengaluru',hq_country: 'India',        aum_usd_m: 1500,  check_size_min_usd_m: 2,  check_size_max_usd_m: 50,  sectors: ['Consumer','Healthcare','SaaS'],           stages: ['Mandate','Marketing'],             geographies: ['India'],         warmth: 'warm',    last_touched_at: daysAgo(38) },
  { id: 'f29', name: 'RNT Capital',          fund_type: 'Family Office',hq_city: 'Mumbai',   hq_country: 'India',        aum_usd_m: 800,   check_size_min_usd_m: 1,  check_size_max_usd_m: 25,  sectors: ['Consumer','Tech','Renewables'],           stages: ['Mandate','Marketing'],             geographies: ['India','Global'],warmth: 'warm',    last_touched_at: daysAgo(55) },
  { id: 'f30', name: 'Reliance Family Office',fund_type:'Family Office',hq_city: 'Mumbai',   hq_country: 'India',        aum_usd_m: 5000,  check_size_min_usd_m: 25, check_size_max_usd_m: 500, sectors: ['Energy','Telecom','Consumer','Infrastructure'],                  stages: ['Diligence','Negotiation'], geographies: ['India','Global'],warmth: 'cold', last_touched_at: daysAgo(160) },
  // Strategic corp dev
  { id: 'f31', name: 'Tata Capital — Corp Dev',fund_type: 'Strategic Corp Dev',hq_city: 'Mumbai',hq_country: 'India',     aum_usd_m: null,  check_size_min_usd_m: 25, check_size_max_usd_m: 500, sectors: ['Consumer','Industrials','Tech'],         stages: ['Diligence','Negotiation'],         geographies: ['India','UK'],   warmth: 'warm',    last_touched_at: daysAgo(30) },
  { id: 'f32', name: 'Reliance Industries — M&A',fund_type:'Strategic Corp Dev',hq_city: 'Mumbai',hq_country: 'India',    aum_usd_m: null,  check_size_min_usd_m: 50, check_size_max_usd_m: 1000,sectors: ['Telecom','Energy','Consumer','Tech'],     stages: ['Diligence','Negotiation'],         geographies: ['India'],        warmth: 'cold',    last_touched_at: daysAgo(200) }
]

function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0,10) }
