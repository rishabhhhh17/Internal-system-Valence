// ValenceOS — client-side demo seeder.
//
// Mirrors supabase/demo-partner-pack.sql but runs from the React app so a
// cold customer landing on a blank demo can populate the firm with one
// click instead of pasting SQL.
//
// Idempotent guards: each insert phase short-circuits if the table is
// already populated, so re-running this function is safe.
//
// Persona-flavoured data — Kedaara, Bain, Multiples, Renuka, Sumant — so
// the demo feels like a real IB firm, not a generic CRM.

const FUNDS = [
  { name: 'Kedaara Capital',           fund_type: 'PE',           hq_city: 'Mumbai',    hq_country: 'India',          aum_usd_m: 5500, check_size_min_usd_m: 50,  check_size_max_usd_m: 200, sectors: ['Consumer','Fintech','Healthcare'],          stage_focus: ['Growth','Buyout'],    warmth: 'hot',  persona_notes: 'Sumant Sinha leads consumer; lengthy DD; pays par' },
  { name: 'ChrysCapital',              fund_type: 'PE',           hq_city: 'Mumbai',    hq_country: 'India',          aum_usd_m: 5800, check_size_min_usd_m: 60,  check_size_max_usd_m: 180, sectors: ['Healthcare','BFSI','Consumer Tech'],        stage_focus: ['Buyout','Growth'],    warmth: 'warm', persona_notes: 'Long memory — never forget a passed look' },
  { name: 'Bain Capital India',        fund_type: 'PE',           hq_city: 'Mumbai',    hq_country: 'India',          aum_usd_m: 8000, check_size_min_usd_m: 75,  check_size_max_usd_m: 300, sectors: ['Consumer','Healthcare','Industrials'],      stage_focus: ['Buyout'],             warmth: 'warm', persona_notes: 'Pavninder is tough on price; Rishi softer on quality assets' },
  { name: 'Peak XV Partners',          fund_type: 'VC',           hq_city: 'Singapore', hq_country: 'Singapore',      aum_usd_m: 9000, check_size_min_usd_m: 10,  check_size_max_usd_m: 60,  sectors: ['Consumer Tech','Fintech','SaaS'],           stage_focus: ['Series B','Series C'], warmth: 'hot', persona_notes: 'Premji-style picks; rapid first meetings' },
  { name: 'Lightspeed India',          fund_type: 'VC',           hq_city: 'Bangalore', hq_country: 'India',          aum_usd_m: 3200, check_size_min_usd_m: 5,   check_size_max_usd_m: 25,  sectors: ['Consumer Tech','Fintech','SaaS','EdTech'],  stage_focus: ['Series A','Series B'], warmth: 'warm', persona_notes: 'Solid follow-on rate; Hemant runs consumer' },
  { name: 'GIC Private Limited',       fund_type: 'Sovereign',    hq_city: 'Singapore', hq_country: 'Singapore',      aum_usd_m: 700000, check_size_min_usd_m: 100, check_size_max_usd_m: 500, sectors: ['Infrastructure','Real Estate','Tech'],      stage_focus: ['Growth','Buyout'],    warmth: 'warm', persona_notes: 'Long horizon; co-invest happy' },
  { name: 'Temasek Holdings',          fund_type: 'Sovereign',    hq_city: 'Singapore', hq_country: 'Singapore',      aum_usd_m: 300000, check_size_min_usd_m: 150, check_size_max_usd_m: 600, sectors: ['Healthcare','Consumer','Tech','Sustainability'], stage_focus: ['Growth','Late stage'], warmth: 'hot', persona_notes: 'Active in India consumer health' },
  { name: 'Premji Invest',             fund_type: 'Family Office',hq_city: 'Bangalore', hq_country: 'India',          aum_usd_m: 1200, check_size_min_usd_m: 20,  check_size_max_usd_m: 100, sectors: ['Consumer','Healthcare','Tech'],             stage_focus: ['Series C','Growth'],  warmth: 'warm', persona_notes: 'Family-office mindset; less price-sensitive' },
  { name: 'Mubadala Investment Co',    fund_type: 'Sovereign',    hq_city: 'Abu Dhabi', hq_country: 'UAE',            aum_usd_m: 300000, check_size_min_usd_m: 100, check_size_max_usd_m: 500, sectors: ['Tech','Healthcare','Renewables'],           stage_focus: ['Growth','Buyout'],    warmth: 'warm', persona_notes: 'Strategic capital; cares about UAE jobs / co-location' },
  { name: 'Multiples Alternate Asset', fund_type: 'PE',           hq_city: 'Mumbai',    hq_country: 'India',          aum_usd_m: 3000, check_size_min_usd_m: 30,  check_size_max_usd_m: 120, sectors: ['Consumer','BFSI','Healthcare'],             stage_focus: ['Growth','Buyout'],    warmth: 'hot',  persona_notes: 'Renuka rapid decisions; pays for quality' },
  { name: 'Norwest Venture Partners',  fund_type: 'VC',           hq_city: 'Mumbai',    hq_country: 'India',          aum_usd_m: 12500, check_size_min_usd_m: 25, check_size_max_usd_m: 100, sectors: ['Consumer','Fintech','SaaS','Healthcare'],   stage_focus: ['Growth','Late stage'], warmth: 'warm', persona_notes: 'Niren leads India growth; long-cycle' }
]

const PEOPLE = [
  { full_name: 'Sumant Sinha',       role: 'Managing Director',          company: 'Kedaara Capital',           city: 'Mumbai',    country: 'India',           email: 'sumant@kedaara.com',         how_to_talk: 'Direct, data-led. Bring the cohort math up front.',                   what_they_care_about: 'Unit economics, cohort retention, repeat purchase.',  favours_bank: true,  mutuals: ['Anand Iyer','Vikram Patel'], tags: ['fund-principal','consumer'] },
  { full_name: 'Rishi Mandawat',     role: 'Managing Director',          company: 'Bain Capital India',        city: 'Mumbai',    country: 'India',           email: 'rishi.mandawat@bain.com',    how_to_talk: 'Patient, quality-over-price. Soft-pitch first.',                      what_they_care_about: 'Brand moats, founder-quality, audited PNL.',          favours_bank: false, mutuals: ['Anand Iyer'],                tags: ['fund-principal','quality-led'] },
  { full_name: 'Pavninder Singh',    role: 'Managing Director',          company: 'Bain Capital India',        city: 'Mumbai',    country: 'India',           email: 'pavninder@bain.com',         how_to_talk: 'Tough on valuation. Bring comps.',                                     what_they_care_about: 'Margins, cap structure, defensible unit economics.',  favours_bank: false, mutuals: [],                            tags: ['fund-principal'] },
  { full_name: 'Hemant Mohapatra',   role: 'Partner',                    company: 'Lightspeed India',          city: 'Bangalore', country: 'India',           email: 'hemant@lsvp.com',            how_to_talk: 'Crisp, sub-15-min calls. Loves a clean cap table.',                   what_they_care_about: 'Distribution, founder velocity, repeat purchase.',    favours_bank: true,  mutuals: ['Neha Jain'],                  tags: ['fund-principal','vc'] },
  { full_name: 'Renuka Ramnath',     role: 'Founder, Managing Director', company: 'Multiples Alternate Asset', city: 'Mumbai',    country: 'India',           email: 'renuka@multiplesequity.com', how_to_talk: 'Decisive, women-founder-aware. Land the why-now hard.',                what_they_care_about: 'Governance, exit thesis, downside-protection.',       favours_bank: true,  mutuals: ['Anand Iyer'],                tags: ['fund-principal'] },
  { full_name: 'Niren Shah',         role: 'Managing Director',          company: 'Norwest Venture Partners',  city: 'Mumbai',    country: 'India',           email: 'niren@nvp.com',              how_to_talk: 'Long-cycle thinker. Don\'t push for fast closes.',                     what_they_care_about: 'Compounders, India-domestic-demand stories.',          favours_bank: false, mutuals: [],                            tags: ['fund-principal','growth'] },
  { full_name: 'Sailesh Tulshan',    role: 'Managing Director',          company: 'Peak XV Partners',          city: 'Singapore', country: 'Singapore',       email: 'sailesh@peakxv.com',         how_to_talk: 'Tech-first; show the platform thesis early.',                          what_they_care_about: 'Network effects, TAM expansion, founder-edge.',       favours_bank: true,  mutuals: ['Neha Jain','Rohan Gupta'],   tags: ['fund-principal','vc'] },
  { full_name: 'Vivek Mehra',        role: 'Partner',                    company: 'Premji Invest',             city: 'Bangalore', country: 'India',           email: 'vivek@premjiinvest.com',     how_to_talk: 'Quiet, mission-aligned. Bring impact data.',                           what_they_care_about: 'Long-term compounding, sustainability angle.',        favours_bank: true,  mutuals: ['Anand Iyer'],                tags: ['family-office'] },
  { full_name: 'Ankit Agarwal',      role: 'Director',                   company: 'GIC Private Limited',       city: 'Singapore', country: 'Singapore',       email: 'ankit.a@gic.com.sg',         how_to_talk: 'Process-driven; expect IC memos.',                                     what_they_care_about: 'Long-hold quality, co-invest economics.',             favours_bank: false, mutuals: [],                            tags: ['swf'] },
  { full_name: 'Anand Iyer',         role: 'Founder, CEO',               company: 'Nimbus Health',             city: 'Bangalore', country: 'India',           email: 'anand@nimbushealth.com',     how_to_talk: 'Detail-obsessed founder. Brings his CFO to every meeting.',           what_they_care_about: 'Clean cap table; conservative dilution; strategic over financial.', favours_bank: false, mutuals: ['Sumant Sinha','Vivek Mehra'], tags: ['founder','client'] },
  { full_name: 'Devika Kapoor',      role: 'Founder, CEO',               company: 'Quantum Edge',              city: 'Mumbai',    country: 'India',           email: 'devika@quantumedge.in',      how_to_talk: 'Hard-charging fintech founder. Wants speed.',                          what_they_care_about: 'Speed-to-term-sheet, Series C-grade investor signal.',favours_bank: true,  mutuals: ['Niren Shah'],                 tags: ['founder','client'] },
  { full_name: 'Karthik Ranganathan', role: 'Founder',                    company: 'HoV Mushrooms',             city: 'Chennai',   country: 'India',           email: 'karthik@hovmushrooms.com',   how_to_talk: 'First-time founder; coachable but anxious. Lots of hand-holding.',     what_they_care_about: 'Hand-holding through DD; investor-fit beats valuation.', favours_bank: true, mutuals: ['Renuka Ramnath'],            tags: ['founder','client'] },
  { full_name: 'Priyanka Saxena',    role: 'CEO',                        company: 'Saffron Studios',           city: 'Mumbai',    country: 'India',           email: 'priyanka@saffronstudios.in', how_to_talk: 'Story-led pitch. Pull her back to numbers.',                           what_they_care_about: 'Brand IP, content slate value, strategic acquirer.',  favours_bank: false, mutuals: [],                            tags: ['founder','client'] },
  { full_name: 'Daniel Cheng',       role: 'Head of M&A',                company: 'Brookfield',                city: 'London',    country: 'United Kingdom',  email: 'daniel.cheng@brookfield.com', how_to_talk: 'Direct UK-style; doesn\'t hide his price.',                            what_they_care_about: 'Operational synergies, asset quality, exit IRR.',     favours_bank: false, mutuals: [],                            tags: ['strategic-buyer'] },
  { full_name: 'Zia Mody',           role: 'Founding Partner',           company: 'AZB & Partners',            city: 'Mumbai',    country: 'India',           email: 'z.mody@azbpartners.com',     how_to_talk: 'Senior counsel; only respond at decision points.',                     what_they_care_about: 'Clean docs, no surprises during diligence.',          favours_bank: true,  mutuals: [],                            tags: ['lawyer','external-counsel'] }
]

const DEALS = [
  { client_name: 'Nimbus Health',     sector: 'Healthcare',     stage: 'Mandate',     deal_type: 'transaction', deal_subtype: 'fundraise', counterparty_name: 'Anand Iyer',         counterparty_company: 'Nimbus Health',     ev_usd_m: 75,  fee_estimate_usd_m: 1.5 },
  { client_name: 'Quantum Edge',      sector: 'Fintech',        stage: 'Mandate',     deal_type: 'transaction', deal_subtype: 'fundraise', counterparty_name: 'Devika Kapoor',      counterparty_company: 'Quantum Edge',      ev_usd_m: 240, fee_estimate_usd_m: 4.8 },
  { client_name: 'HoV Mushrooms',     sector: 'Consumer',       stage: 'Pre-Mandate', deal_type: 'transaction', deal_subtype: 'fundraise', counterparty_name: 'Karthik Ranganathan',counterparty_company: 'HoV Mushrooms',     ev_usd_m: 30,  fee_estimate_usd_m: 0.6 },
  { client_name: 'Helios Infra',      sector: 'Infrastructure', stage: 'Closed',      deal_type: 'transaction', deal_subtype: 'm_and_a',    ma_side: 'sell', counterparty_name: 'Daniel Cheng',      counterparty_company: 'Brookfield',        ev_usd_m: 850, fee_estimate_usd_m: 12  },
  { client_name: 'Saffron Studios',   sector: 'Consumer',       stage: 'Pitching',    deal_type: 'transaction', deal_subtype: 'm_and_a',    ma_side: 'sell', counterparty_name: 'Priyanka Saxena',   counterparty_company: 'Saffron Studios',   ev_usd_m: 80,  fee_estimate_usd_m: 1.6 },
  { client_name: 'Crescent Pharma',   sector: 'Healthcare',     stage: 'Origination', deal_type: 'transaction', deal_subtype: 'm_and_a',    ma_side: 'sell', counterparty_name: 'Aditya Sharma',     counterparty_company: 'Crescent Pharma',   ev_usd_m: 150, fee_estimate_usd_m: 3   }
]

const KNOWLEDGE_FILES = [
  { name: 'Sector deep-dive — India consumer health Q1 2026.pdf', path: 'demo://memos/consumer-health-q1.pdf', char_count: 32000, sector: 'Healthcare',     tags: ['memo','sector','consumer-health'],     summary: 'Argues for a structural shift in OTC + nutraceuticals. 3 sub-themes: D2C nutrition, branded generics, telehealth-D2C bundles.' },
  { name: 'Infrastructure sell-side playbook v3.pdf',             path: 'demo://memos/infra-sellside.pdf',     char_count: 48000, sector: 'Infrastructure', tags: ['playbook','sell-side'],                summary: 'Canonical Valence playbook for sell-side infrastructure mandates. Stage gates, IM template, teaser DOs/DON\'Ts.' },
  { name: 'Renewables IC memo — Helios Infra.pdf',                path: 'demo://memos/helios-ic.pdf',          char_count: 25000, sector: 'Infrastructure', tags: ['ic-memo','helios','renewables'],       summary: 'Internal IC memo when Valence accepted the Helios mandate. Notes Brookfield interest, fee structure.' },
  { name: 'Fund coverage — Q1 2026 update.pdf',                   path: 'demo://memos/fund-coverage-q1.pdf',   char_count: 18000, sector: 'BFSI',           tags: ['coverage','funds','quarterly'],         summary: 'Refreshed warmth ratings for 38 funds. Notes on Kedaara consumer thesis change, Bain India team rebuild.' },
  { name: 'NDA standard templates — 2026.md',                     path: 'demo://memos/nda-templates.md',       char_count: 8000,  sector: null,             tags: ['template','nda','legal'],               summary: 'Two-way and one-way NDAs with our standard carve-outs. Use these as starting points.' }
]

const INTAKE = [
  { submitter_name: 'Aditya Sharma',  submitter_email: 'aditya@crescentpharma.com',   submitter_role: 'Founder',  company_name: 'Crescent Pharma',      sector: 'Healthcare',     deal_type: 'transaction', deal_subtype: 'm_and_a',    ma_side: 'sell', valuation_usd_m: 150, geography: 'India · Mumbai',     summary: 'Family-owned pharma manufacturer. Three plants. Looking to exit to a strategic acquirer.',                              status: 'new', ai_screener_output: { verdict: 'pursue', score: 78, one_line: 'Strong fit — fits Valence\'s mid-market sell-side sweet spot.', lines: ['EBITDA $3M / Rev $12M inside the firm\'s band','Sector match','Mumbai geography easy','Founder reachable'] } },
  { submitter_name: 'Maya Iyer',      submitter_email: 'maya@brightlinemobility.in',  submitter_role: 'CFO',      company_name: 'Brightline Mobility',  sector: 'Logistics',      deal_type: 'transaction', deal_subtype: 'fundraise',  ticket_size_usd_m: 60,  valuation_usd_m: 240, geography: 'India · Bangalore', summary: 'Series B EV last-mile logistics. Asking $60M at $240M post.',                                                            status: 'new', ai_screener_output: { verdict: 'review', score: 55, one_line: 'Borderline — adjacent sector.', lines: ['$60M raise fits band','Logistics adjacent, not core','EV-specific play','Hand to a specialist if Valence passes'] } },
  { submitter_name: 'Niharika Reddy', submitter_email: 'niharika@solaceinfra.com',    submitter_role: 'CEO',      company_name: 'Solace Infrastructure',sector: 'Infrastructure', deal_type: 'transaction', deal_subtype: 'fundraise',  ticket_size_usd_m: 200, valuation_usd_m: 850, geography: 'India · Hyderabad', summary: 'Project-finance for a Hyderabad-Pune solar corridor. Targeting $200M of equity at $850M EV.',                            status: 'new', ai_screener_output: { verdict: 'pursue', score: 82, one_line: 'Strong match — Infrastructure + project-finance fits Helios precedent.', lines: ['Inside band','Infrastructure coverage','Helios precedent','PPA structure'] } }
]

const SCREENER_RUNS = [
  { mode: 'fund_match',  output_json: { matches: [
      { fund_name: 'Multiples Alternate Asset', score: 88, reason: 'Consumer match; Renuka likes founder-led DTC' },
      { fund_name: 'Kedaara Capital',           score: 82, reason: 'Consumer + healthcare crossover' },
      { fund_name: 'Premji Invest',             score: 77, reason: 'Mission-aligned; long horizon' }
    ], mode: 'fund_match' }, days_ago: 3 },
  { mode: 'mandate_fit', output_json: { verdict: 'pursue', score: 78, one_line: 'Fits sweet spot', lines: ['Healthcare match','EBITDA in band','Mumbai easy'] }, days_ago: 1 }
]

const DAILY_NOTE_BODY =
  'Quick read of today:\n\n' +
  '- Nimbus Health pitch deck v3 ready — Vikram to walk Sumant through the cohort math.\n' +
  '- Helios Infra — Brookfield oral at 1.4x, GIC keen as co-invest. Engagement letter draft in progress.\n' +
  '- HoV Mushrooms diligence coaching call with Karthik @ 4pm.\n' +
  '- New inbound from Crescent Pharma — AI verdict: pursue. Schedule first-look call this week.\n'

// ----------------------------------------------------------------------------

async function safeInsert(supabase, table, rows, label) {
  if (!rows || rows.length === 0) return { table, inserted: 0 }
  const { error, data } = await supabase.from(table).insert(rows).select('id')
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[demoSeed] ${label} insert failed:`, error.message)
    return { table, inserted: 0, error: error.message }
  }
  return { table, inserted: data?.length || 0 }
}

async function tableIsEmpty(supabase, table) {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true })
  if (error) return false
  return (count ?? 0) === 0
}

/**
 * Seed a sample IB firm into the connected Supabase project.
 * Skips any table that already has data, so re-running this is safe.
 * Returns a summary of what was inserted.
 */
export async function seedSampleFirm(supabase) {
  if (!supabase) throw new Error('Supabase not configured')
  const summary = []

  // Funds
  if (await tableIsEmpty(supabase, 'funds')) summary.push(await safeInsert(supabase, 'funds', FUNDS, 'funds'))

  // People (kept second so interactions can reference person_id via lookup)
  let peopleByName = {}
  if (await tableIsEmpty(supabase, 'people')) {
    summary.push(await safeInsert(supabase, 'people', PEOPLE, 'people'))
  }
  // Always reload people IDs so we can wire interactions even if people were already there.
  const { data: peopleRows } = await supabase.from('people').select('id, full_name')
  peopleByName = Object.fromEntries((peopleRows || []).map(p => [p.full_name, p.id]))

  // Deals
  let dealsByName = {}
  if (await tableIsEmpty(supabase, 'deals')) summary.push(await safeInsert(supabase, 'deals', DEALS, 'deals'))
  const { data: dealRows } = await supabase.from('deals').select('id, client_name')
  dealsByName = Object.fromEntries((dealRows || []).map(d => [d.client_name, d.id]))

  // Intake submissions
  if (await tableIsEmpty(supabase, 'intake_submissions')) {
    summary.push(await safeInsert(supabase, 'intake_submissions', INTAKE, 'intake'))
  }

  // Knowledge files
  if (await tableIsEmpty(supabase, 'knowledge_files')) {
    const rows = KNOWLEDGE_FILES.map(k => ({ ...k, created_at: new Date(Date.now() - (Math.random() * 60 + 10) * 86400000).toISOString() }))
    summary.push(await safeInsert(supabase, 'knowledge_files', rows, 'knowledge_files'))
  }

  // Screener runs
  if (await tableIsEmpty(supabase, 'screener_runs')) {
    const now = Date.now()
    const rows = SCREENER_RUNS.map(r => ({
      mode: r.mode,
      output_json: r.output_json,
      created_at: new Date(now - r.days_ago * 86400000).toISOString()
    }))
    // input_text column doesn't exist on the demo project — column-omit-friendly insert.
    summary.push(await safeInsert(supabase, 'screener_runs', rows, 'screener_runs'))
  }

  // Interactions — needs people + deal IDs resolved.
  if (await tableIsEmpty(supabase, 'interactions')) {
    const interactions = [
      { counterparty_name: 'Sumant Sinha',    counterparty_company: 'Kedaara Capital',          person_id: peopleByName['Sumant Sinha'],     deal_id: dealsByName['Nimbus Health'],  type: 'pitch',            outcome: 'in_progress',          notes: 'First Zoom. Sumant liked the unit economics, asked for the cohort retention curve.', lead_owner: 'Vikram Patel', days_ago: 2 },
      { counterparty_name: 'Renuka Ramnath',  counterparty_company: 'Multiples Alternate Asset',person_id: peopleByName['Renuka Ramnath'],   deal_id: dealsByName['HoV Mushrooms'],  type: 'intro_meeting',    outcome: 'in_progress',          notes: 'Renuka warmed up after the founder story. Wants the unit economics deck before her IC.', lead_owner: 'Rohan Gupta', days_ago: 7 },
      { counterparty_name: 'Niren Shah',      counterparty_company: 'Norwest Venture Partners', person_id: peopleByName['Niren Shah'],        deal_id: dealsByName['Quantum Edge'],   type: 'pitch',            outcome: 'in_progress',          notes: 'Niren is sceptical of fintech valuations. Wants more proof on contribution margin.', lead_owner: 'Neha Jain', days_ago: 3 },
      { counterparty_name: 'Pavninder Singh', counterparty_company: 'Bain Capital India',       person_id: peopleByName['Pavninder Singh'],   deal_id: dealsByName['Nimbus Health'],  type: 'pitch',            outcome: 'passed',               notes: 'Pavninder passed: too early-stage for Bain India PE.', lead_owner: 'Vikram Patel', days_ago: 9 },
      { counterparty_name: 'Sailesh Tulshan', counterparty_company: 'Peak XV Partners',         person_id: peopleByName['Sailesh Tulshan'],   deal_id: dealsByName['Quantum Edge'],   type: 'intro_meeting',    outcome: 'in_progress',          notes: 'Sailesh is engaged. Asking for diligence-room access.', lead_owner: 'Neha Jain', days_ago: 4 },
      { counterparty_name: 'Daniel Cheng',    counterparty_company: 'Brookfield',                person_id: peopleByName['Daniel Cheng'],     deal_id: dealsByName['Helios Infra'],   type: 'pitch',            outcome: 'converted_to_mandate', notes: 'Cheng made an oral offer at 1.4x EV/Asset. Worth pursuing — handed over engagement letter.', lead_owner: 'Rishi Kapoor', days_ago: 14 },
      { counterparty_name: 'Anand Iyer',      counterparty_company: 'Nimbus Health',             person_id: peopleByName['Anand Iyer'],       deal_id: dealsByName['Nimbus Health'],  type: 'founder_check_in', outcome: 'in_progress',          notes: 'Anand is anxious about dilution. Walked him through the cap-table waterfall again.', lead_owner: 'Vikram Patel', days_ago: 1 }
    ].map(i => ({
      counterparty_name: i.counterparty_name,
      counterparty_company: i.counterparty_company,
      person_id: i.person_id || null,
      deal_id:   i.deal_id   || null,
      type: i.type,
      outcome: i.outcome,
      notes: i.notes,
      lead_owner: i.lead_owner,
      created_at: new Date(Date.now() - i.days_ago * 86400000).toISOString()
    }))
    summary.push(await safeInsert(supabase, 'interactions', interactions, 'interactions'))
  }

  // Daily note for today (one-per-user-per-date). Anon user id is fine here —
  // the demo's RLS is open and the seeded note is just a sample.
  const today = new Date().toISOString().slice(0, 10)
  const { data: existingNote } = await supabase.from('daily_notes').select('user_id').eq('date', today).limit(1)
  if (!existingNote || existingNote.length === 0) {
    summary.push(await safeInsert(supabase, 'daily_notes', [
      { user_id: '00000000-0000-0000-0000-000000000000', date: today, body: DAILY_NOTE_BODY, updated_at: new Date().toISOString() }
    ], 'daily_notes'))
  }

  return { ok: true, summary, totalInserted: summary.reduce((s, x) => s + (x.inserted || 0), 0) }
}

/**
 * Best-effort wipe — deletes every row from the demo tables so a partner
 * can reset and start over. Anon RLS must allow DELETE for this to work
 * (the demo project does; production locks DELETE down).
 */
export async function resetSampleFirm(supabase) {
  if (!supabase) throw new Error('Supabase not configured')
  // Order matters — children before parents.
  const order = ['activities','interactions','screener_runs','intake_submissions','kb_mentions','kb_files','kb_folders','kb_notes','knowledge_files','daily_notes','calendar_events','team_calendars','deals','funds','people']
  const out = []
  for (const t of order) {
    const { error } = await supabase.from(t).delete().not('id', 'is', null)
    out.push({ table: t, ok: !error, error: error?.message })
  }
  return { ok: true, summary: out }
}
