// People CRM — persona-driven. Every team member sees every persona field.
// Top-level module; lives next to Funds in the Relationships sidebar group.

export const TAG_SUGGESTIONS = [
  'Investor', 'Strategic', 'Founder', 'Family Office', 'Operator',
  'Lawyer', 'Co-advisor', 'Sovereign', 'PE', 'VC',
  'Hot', 'Warm', 'Distant'
]

export function fullDisplayName(p) {
  if (!p) return ''
  return [p.full_name, p.role && `(${p.role})`].filter(Boolean).join(' ')
}

export function locationLine(p) {
  if (!p) return ''
  return [p.city, p.country].filter(Boolean).join(', ')
}

// ============ DRAG-TO-ATTACH HELPERS ============
// Used by the Companies rail on /people. Pure functions so the page
// component stays a thin orchestrator — tests live next to the lib.

export function extractCompanies(people) {
  if (!Array.isArray(people)) return []
  const counts = new Map()
  for (const p of people) {
    const c = (p?.company || '').trim()
    if (!c) continue
    counts.set(c, (counts.get(c) || 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function applyCompanyAssignment(people, personId, newCompany) {
  if (!Array.isArray(people) || !personId) return people
  const next = typeof newCompany === 'string' ? newCompany.trim() : ''
  return people.map(p =>
    p?.id === personId ? { ...p, company: next || null } : p
  )
}

// Indicates whether a drop would change anything — lets the UI suppress
// pointless no-op writes.
export function wouldChangeCompany(people, personId, newCompany) {
  if (!Array.isArray(people) || !personId) return false
  const target = people.find(p => p?.id === personId)
  if (!target) return false
  const next = typeof newCompany === 'string' ? newCompany.trim() : ''
  return (target.company || '') !== next
}

// ============ BULK ADD PEOPLE ============
// One-line-per-person parser. Supports several free-text shapes, all of
// which a partner might paste in from email / a notebook / a deal team
// roster. We tolerate inconsistent delimiters because the user's not going
// to clean their input before pasting.
//
// Recognized line formats (first match wins):
//   "Alice Smith"
//   "Alice Smith <alice@x.com>"
//   "Alice Smith — CEO"               (em / en dash + role)
//   "Alice Smith - CEO at Acme"       (— accepts ' at <company>' tail)
//   "Alice Smith | CEO | alice@x.com" (pipe-separated)
//   "Alice Smith, CEO, alice@x.com"   (comma-separated)
//   "Alice Smith\tCEO\talice@x.com"   (tab-separated)
//
// Blank lines and lines starting with `#` are skipped (comment convention).
// Returns `{ rows, skipped }` where rows is `{ raw, full_name, email, role,
// company, errors }`. Rows missing a full_name surface an error so the UI
// can highlight them.

const EMAIL_REGEX = /<?([\w.+-]+@[\w-]+\.[\w.-]+)>?/

function splitOnDelimiter(line) {
  if (line.includes('\t')) return line.split('\t').map(s => s.trim()).filter(Boolean)
  if (line.includes('|'))  return line.split('|').map(s => s.trim()).filter(Boolean)
  if (line.includes(',') && !EMAIL_REGEX.test(line)) {
    return line.split(',').map(s => s.trim()).filter(Boolean)
  }
  // Pull an email out first so commas in roles don't confuse us; then
  // split the remainder on commas.
  const emailMatch = line.match(EMAIL_REGEX)
  if (line.includes(',') && emailMatch) {
    const without = line.replace(EMAIL_REGEX, '').replace(/<>|\s{2,}/g, ' ').trim()
    const parts = without.split(',').map(s => s.trim()).filter(Boolean)
    return [...parts, emailMatch[1]]
  }
  return [line.trim()]
}

function looksLikeEmail(s) {
  return EMAIL_REGEX.test(s)
}

function parseLine(line) {
  const raw = line
  const out = { raw, full_name: '', email: '', role: '', company: '', errors: [] }

  // First: pull an email out if present (regardless of position)
  const emailMatch = line.match(EMAIL_REGEX)
  if (emailMatch) {
    out.email = emailMatch[1]
    line = line.replace(EMAIL_REGEX, '').replace(/<\s*>/g, '').trim()
  }

  // Detect "X at Y" company tail BEFORE splitting (so " at " doesn't get
  // chopped). Handles "CEO at Acme" or "- CEO at Acme".
  const atMatch = line.match(/\s+at\s+(.+)$/i)
  if (atMatch) {
    out.company = atMatch[1].trim()
    line = line.slice(0, atMatch.index).trim()
  }

  // Strip surrounding dashes / em-dashes that mean "name — role" so we can
  // walk the remainder as positional segments.
  line = line.replace(/\s+[-–—]\s+/g, ' | ')

  const parts = splitOnDelimiter(line)

  // Name is the first non-email segment. Remaining segments get classified
  // as role / company by position. (User can paste in either order; the
  // parser bias is: 1st extra = role, 2nd extra = company.)
  const extras = []
  for (const p of parts) {
    if (!p) continue
    if (looksLikeEmail(p) && !out.email) { out.email = p; continue }
    if (!out.full_name) { out.full_name = p; continue }
    extras.push(p)
  }
  if (extras[0] && !out.role)    out.role    = extras[0]
  if (extras[1] && !out.company) out.company = extras[1]

  if (!out.full_name) out.errors.push('Missing name')
  return out
}

export function parseBulkPeople(text, { defaultCompany = '' } = {}) {
  const lines = String(text || '').split(/\r?\n/)
  const rows = []
  let skipped = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { skipped += 1; continue }
    if (trimmed.startsWith('#')) { skipped += 1; continue }
    const parsed = parseLine(trimmed)
    if (defaultCompany && !parsed.company) parsed.company = defaultCompany
    rows.push(parsed)
  }
  return { rows, skipped }
}

// Returns the subset of parsed rows that are safe to insert (have a
// full_name, no errors). Strips internal-only fields and produces a
// payload ready for supabase.from('people').insert().
export function buildInsertableBulk(rows, { defaultCompany = '' } = {}) {
  if (!Array.isArray(rows)) return []
  return rows
    .filter(r => r && r.full_name && (!r.errors || r.errors.length === 0))
    .map(r => {
      const payload = { full_name: r.full_name }
      if (r.email)   payload.email   = r.email
      if (r.role)    payload.role    = r.role
      const co = r.company || defaultCompany
      if (co)        payload.company = co
      return payload
    })
}

// Demo data — used when Supabase is unconfigured. ~30 personas across
// Indian + global funds, founders, and lawyers Valence actually deals with.
export const DEMO_PEOPLE = [
  // Fund partners
  { id: 'p1',  full_name: 'Anand Iyer',         role: 'Principal',                    company: 'Peak XV Partners',         email: 'anand@peakxv.com',          phone: '+91 98201 11111', city: 'Bengaluru',     country: 'India',     how_to_talk: 'Direct, asks "what\'s the cheque size in 30 seconds." Skip preamble.',                     relationship_history: 'Met at IVCA 2019 via Trishant. Closed 2 deals together.',         what_they_care_about: 'Founder optionality. Path-to-IPO clarity.',         favours_bank: 'Will move fast for us. 2 of ~3 favours used.',     things_to_avoid: 'Don\'t pitch on Mondays. Treats them as planning days.',          mutuals: 'Close to Trishant. Distant from Manav.',         tags: ['Investor','VC','Hot'],          last_touched_at: '2026-04-29' },
  { id: 'p2',  full_name: 'Devika Rao',         role: 'Investment Director',          company: 'Catamaran Ventures',       email: 'devika@catamaran.in',       phone: '+91 98202 22222', city: 'Bengaluru',     country: 'India',     how_to_talk: 'Warm, prefers narrative pitches. Good at the strategic question.',                          relationship_history: 'Quarterly catch-up since 2021. Helped close Project Saffron.', what_they_care_about: 'Brand quality. Founder coachability.',                what_they_care_about_2: null, favours_bank: '1 of ~3 used. Last favour: warm intro to Premji team.', things_to_avoid: 'Don\'t bring junior team without warning.',                          mutuals: 'Close to Naina Lal.',                            tags: ['Investor','Family Office','Warm'], last_touched_at: '2026-04-25' },
  { id: 'p3',  full_name: 'James Whitfield',    role: 'Partner',                      company: 'Whitfield & Co.',          email: 'james@whitfield.co.uk',     phone: '+44 20 7123 4567',city: 'London',        country: 'UK',        how_to_talk: 'Old-school British. Drinks-on-the-Strand style. Long lunches.',                              relationship_history: 'Inbound referrals only. Sent us Hyderabad CPG founder in Q1.',     what_they_care_about: 'Reciprocity. Send him deals back.',                  favours_bank: 'Owes us 2. Delicate balance — his ego matters.',          things_to_avoid: 'Never call without an email first.',                                mutuals: 'Plays golf with the Solstice founders.',         tags: ['Co-advisor','Distant'],         last_touched_at: '2026-04-30' },
  { id: 'p4',  full_name: 'Naina Lal',          role: 'Managing Director',            company: 'Premji Invest',            email: 'naina@premjiinvest.com',    phone: '+91 98203 33333', city: 'Bengaluru',     country: 'India',     how_to_talk: 'Sharp and fast. Loves data. No fluff. Pre-read or no meeting.',                              relationship_history: 'Knew her from BCG days. Met again at IVCA Conclave 2024.',          what_they_care_about: 'Unit economics. Path to defensibility.',              favours_bank: '0 used. Hot relationship — guard it.',                    things_to_avoid: 'No weekend emails. Don\'t over-pitch.',                              mutuals: 'Close to Hemant Sahni.',                          tags: ['Investor','Family Office','Hot'], last_touched_at: '2026-05-01' },
  { id: 'p5',  full_name: 'Stephen Walker',     role: 'Director, Capital Markets',    company: 'Fidelity',                 email: 'swalker@fidelity.com',      phone: '+1 617 555 0101', city: 'Boston',        country: 'USA',       how_to_talk: 'Process-driven. Wants written briefs ahead of every call.',                                  relationship_history: 'Anchor on Quantum Edge. Continuing dialogue.',                       what_they_care_about: 'Anchor allocation transparency. Aftermarket support.',           favours_bank: '1 of ~2 used.',                                                things_to_avoid: 'Don\'t share unverified financials.',                                  mutuals: 'Close to Karthik Iyer (Blume).',                  tags: ['Investor','Hot'],                last_touched_at: '2026-05-06' },
  { id: 'p6',  full_name: 'Karthik Iyer',       role: 'Partner',                      company: 'Blume Ventures',           email: 'karthik@blume.vc',          phone: '+91 98204 44444', city: 'Mumbai',        country: 'India',     how_to_talk: 'Thoughtful. Will spend 90 minutes on a pitch if interested.',                                relationship_history: 'Warm but stage too late for them historically.',                     what_they_care_about: 'Founder team chemistry. Tech-led defensibility.',     favours_bank: '0 used.',                                                       things_to_avoid: 'Don\'t pitch later-stage rounds.',                                     mutuals: 'Close to Stephen Walker.',                        tags: ['Investor','VC','Warm'],          last_touched_at: '2026-04-28' },
  { id: 'p7',  full_name: 'Rhea Mathur',        role: 'Partner',                      company: 'Lightspeed India',         email: 'rhea@lightspeed.com',       phone: '+91 98205 55555', city: 'Mumbai',        country: 'India',     how_to_talk: 'Casual, quick. Good at separating signal from noise.',                                       relationship_history: 'Met at TiE Mumbai 2022. Quarterly catch-up.',                        what_they_care_about: 'Capital efficiency. Indian-born global stories.',     favours_bank: '0 used. Worth saving.',                                          things_to_avoid: 'Don\'t bring biotech.',                                                mutuals: '—',                                                tags: ['Investor','VC','Warm'],          last_touched_at: '2026-04-26' },
  { id: 'p8',  full_name: 'Hemant Sahni',       role: 'Partner',                      company: 'Chiratae Ventures',        email: 'hemant@chiratae.com',       phone: '+91 98206 66666', city: 'Bengaluru',     country: 'India',     how_to_talk: 'Warm and patient. Good listener. Will engage on early-stage stories.',                       relationship_history: 'Long-arc relationship since 2019.',                                  what_they_care_about: 'Healthcare deep tech. India-first stories.',          favours_bank: '0 of ~3.',                                                       things_to_avoid: 'Don\'t pitch consumer tech without a clear MOAT.',                     mutuals: 'Close to Naina Lal.',                              tags: ['Investor','VC','Warm'],          last_touched_at: '2026-04-24' },
  { id: 'p9',  full_name: 'Mark Rutherford',    role: 'VP',                           company: 'Brookfield Asset Mgmt',    email: 'mark@brookfield.com',       phone: '+1 416 555 0202', city: 'Toronto',       country: 'Canada',    how_to_talk: 'Formal. Wants institutional-grade IMs. No shortcuts.',                                       relationship_history: 'Real estate + infra coverage. Met at MIPIM 2024.',                   what_they_care_about: 'Yield. Counterparty quality. Regulatory clarity.',    favours_bank: '0 used.',                                                       things_to_avoid: 'Don\'t pitch sub-$100M EV deals.',                                     mutuals: '—',                                                tags: ['Investor','PE','Warm'],           last_touched_at: '2026-05-03' },
  { id: 'p10', full_name: 'Daniel Cheng',       role: 'Director',                     company: 'Tiger Global',             email: 'daniel@tigerglobal.com',    phone: '+1 212 555 0303', city: 'New York',      country: 'USA',       how_to_talk: 'Fast, transactional. Treats every meeting like a dealflow filter.',                          relationship_history: 'Loose dialogue since 2020. Tracking growth-stage fintech.',          what_they_care_about: 'Growth rate. TAM. Unit economics.',                    favours_bank: '0 used.',                                                       things_to_avoid: 'No biotech. No early-stage.',                                          mutuals: '—',                                                tags: ['Investor','Hot'],                last_touched_at: '2026-05-05' },
  // Founders
  { id: 'p11', full_name: 'Rohit Bansal',       role: 'CEO',                          company: 'Nimbus Health',            email: 'rohit@nimbushealth.com',    phone: '+91 98207 77777', city: 'Mumbai',        country: 'India',     how_to_talk: 'Founder pace. Texts late. Treats us like an extension of team.',                              relationship_history: 'Sell-side mandate signed Q2.',                                       what_they_care_about: 'Strategic acquirer over PE. Family legacy.',          favours_bank: 'N/A — client.',                                                  things_to_avoid: 'Don\'t go to PE-only buyers without clearance.',                       mutuals: '—',                                                tags: ['Founder','Hot'],                  last_touched_at: '2026-05-04' },
  { id: 'p12', full_name: 'Vikas Subramanian',  role: 'Founder & CEO',                company: 'Meridian EdTech',          email: 'vikas@meridianedu.com',     phone: '+91 98208 88888', city: 'Bengaluru',     country: 'India',     how_to_talk: 'Earnest, careful. Wants weekly written updates.',                                            relationship_history: 'Series C mandate signed last month.',                                  what_they_care_about: 'Mission-aligned investors. EdTech-friendly term sheets.',          favours_bank: 'N/A — client.',                                                  things_to_avoid: 'Don\'t bring growth funds with media reputations for being aggressive.',mutuals: '—',                                                tags: ['Founder','Hot'],                  last_touched_at: '2026-05-02' },
  { id: 'p13', full_name: 'Tara Krishnan',      role: 'CFO',                          company: 'Solstice Solar',           email: 'tara@solsticesolar.in',     phone: '+91 98209 99999', city: 'Hyderabad',     country: 'India',     how_to_talk: 'Numbers-first. Wants the P&L story and the unit economics in slide one.',                    relationship_history: 'Series C raise in scoping. Sent credentials memo.',                  what_they_care_about: 'Long-tenor capital. Strategic acquirers as plan B.',  favours_bank: 'N/A — client.',                                                  things_to_avoid: 'No PR before closing.',                                                mutuals: 'Plays golf with James Whitfield.',                tags: ['Founder','Warm'],                last_touched_at: '2026-05-06' },
  { id: 'p14', full_name: 'Maya Iyengar',       role: 'Founder',                      company: 'Kestrel Biotech',          email: 'maya@kestrelbio.com',       phone: '+91 98210 00001', city: 'Bengaluru',     country: 'India',     how_to_talk: 'Scientific. Loves the technical deep dive. Pitch in pre-clinical milestones.',                relationship_history: 'Buy-side scoping for licensing-deal acquisitions.',                  what_they_care_about: 'Science before terms. Long-term partner mindset.',     favours_bank: 'N/A — client.',                                                  things_to_avoid: 'Don\'t reduce her pitch to financials.',                              mutuals: '—',                                                tags: ['Founder','Warm'],                last_touched_at: '2026-04-30' },
  { id: 'p15', full_name: 'Ishaan Kapoor',      role: 'Founder',                      company: 'Saffron Retail',           email: 'ishaan@saffronretail.in',   phone: '+91 98211 00002', city: 'Mumbai',        country: 'India',     how_to_talk: 'Salesperson. High-energy. Loves the deal-chase part.',                                       relationship_history: 'Sell-side mandate. Sponsor in exclusivity.',                          what_they_care_about: 'Headline number. Media coverage post-close.',          favours_bank: 'N/A — client.',                                                  things_to_avoid: 'Don\'t under-promise.',                                                mutuals: '—',                                                tags: ['Founder','Hot'],                  last_touched_at: '2026-05-01' },
  { id: 'p16', full_name: 'Niharika Joshi',     role: 'Group CFO',                    company: 'Evermark Retail',          email: 'niharika@evermark.in',      phone: '+91 98212 00003', city: 'Delhi',         country: 'India',     how_to_talk: 'Calm, deliberate. Will say "let me come back to you" rather than commit on calls.',           relationship_history: 'Met at consumer summit Q4. Process kickoff scheduled.',              what_they_care_about: 'Strategic fit > valuation peak.',                       favours_bank: 'N/A — client.',                                                  things_to_avoid: 'Don\'t loop in junior team during early conversations.',               mutuals: '—',                                                tags: ['Founder','Warm'],                last_touched_at: '2026-04-30' },
  // Sovereign + family office
  { id: 'p17', full_name: 'Nina Kapoor',        role: 'Senior Investment Officer',    company: 'GIC',                      email: 'nina@gic.com.sg',           phone: '+65 6555 0404',   city: 'Singapore',     country: 'Singapore', how_to_talk: 'Institutional. Documents everything. Wants regulatory clarity in writing.',                  relationship_history: 'Sovereign coverage map. Active for India infra + renewables.',        what_they_care_about: 'Long-tenor stable yields. ESG.',                       favours_bank: '0 of 1.',                                                       things_to_avoid: 'Don\'t pitch consumer or tech.',                                       mutuals: '—',                                                tags: ['Investor','Sovereign','Warm'],   last_touched_at: '2026-05-03' },
  { id: 'p18', full_name: 'Aditya Sahay',       role: 'Principal',                    company: 'Sahay Family Office',      email: 'aditya@sahayfo.com',        phone: '+91 98213 00004', city: 'Mumbai',        country: 'India',     how_to_talk: 'Casual but structured. Brings the family principal in only when he\'s sure.',               relationship_history: 'Long-arc. Sent us small mid-cap mandate that we passed back.',         what_they_care_about: 'Generational wealth preservation.',                    favours_bank: '0 used.',                                                       things_to_avoid: 'Don\'t bring deals < $25M EV.',                                        mutuals: '—',                                                tags: ['Investor','Family Office','Warm'], last_touched_at: '2026-04-22' },
  { id: 'p19', full_name: 'Rajat Bhatia',       role: 'Principal',                    company: 'Bhatia Family Office',     email: 'rajat@bhatia.fo',           phone: '+91 98214 00005', city: 'Mumbai',        country: 'India',     how_to_talk: 'Direct. Wants thesis in 5 lines.',                                                            relationship_history: 'Inbound from existing client.',                                       what_they_care_about: 'Niche logistics. Single-asset exposure.',              favours_bank: 'N/A — fresh relationship.',                                      things_to_avoid: 'Don\'t bring large funds; he prefers privacy.',                        mutuals: '—',                                                tags: ['Investor','Family Office','Warm'], last_touched_at: '2026-05-05' },
  // Co-advisors / lawyers / strategics
  { id: 'p20', full_name: 'Sophie Laurent',     role: 'Founder',                      company: 'Laurent Capital',          email: 'sophie@laurentcap.fr',      phone: '+33 1 555 0505',  city: 'Paris',         country: 'France',    how_to_talk: 'Continental. Polite passes. Long emails.',                                                    relationship_history: 'Loose referral loop. Closed an inbound out to a Paris boutique.',     what_they_care_about: 'Cross-border France-India.',                            favours_bank: '0 of 1.',                                                       things_to_avoid: '—',                                                                    mutuals: '—',                                                tags: ['Co-advisor','Distant'],          last_touched_at: '2026-04-07' },
  { id: 'p21', full_name: 'Anuj Goyal',         role: 'Founder',                      company: 'Brightline Mobility',      email: 'anuj@brightline.io',        phone: '+91 98215 00006', city: 'Bengaluru',     country: 'India',     how_to_talk: 'Bullish. Thinks every deal is the deal.',                                                    relationship_history: 'Lost mandate but maintain relationship.',                              what_they_care_about: 'Validation. PR.',                                       favours_bank: '0 used.',                                                       things_to_avoid: 'Don\'t over-praise — he reads it as desperate.',                       mutuals: '—',                                                tags: ['Founder','Warm'],                last_touched_at: '2026-04-02' },
  { id: 'p22', full_name: 'Lara Petrov',        role: 'Principal',                    company: 'Sequoia Capital India',    email: 'lara@sequoia.com',          phone: '+91 98216 00007', city: 'Bengaluru',     country: 'India',     how_to_talk: 'Curious. Asks broad questions before zooming in.',                                            relationship_history: 'Met at fintech roundtable.',                                          what_they_care_about: 'Distribution as a moat.',                              favours_bank: '0 used.',                                                       things_to_avoid: '—',                                                                    mutuals: '—',                                                tags: ['Investor','VC','Warm'],          last_touched_at: '2026-04-28' },
  { id: 'p23', full_name: 'Yash Anand',         role: 'Partner',                      company: 'Kalaari Capital',          email: 'yash@kalaari.com',          phone: '+91 98217 00008', city: 'Bengaluru',     country: 'India',     how_to_talk: 'Polite, brand-conscious.',                                                                    relationship_history: 'Brand recall meetings.',                                              what_they_care_about: 'Founder pedigree.',                                     favours_bank: '0 used.',                                                       things_to_avoid: 'Don\'t pitch what they\'re not deploying for.',                        mutuals: '—',                                                tags: ['Investor','VC','Distant'],       last_touched_at: '2026-04-15' },
  { id: 'p24', full_name: 'Sandeep Kale',       role: 'CFO',                          company: 'Aegis Logistics',          email: 'sandeep@aegislog.in',       phone: '+91 98218 00009', city: 'Mumbai',        country: 'India',     how_to_talk: 'Numbers-only. Skip narrative.',                                                                relationship_history: 'Lost — went with bulge bracket.',                                     what_they_care_about: 'Fee compression.',                                       favours_bank: 'N/A.',                                                          things_to_avoid: 'Don\'t pitch on retainer-heavy structures.',                          mutuals: '—',                                                tags: ['Founder','Distant'],             last_touched_at: '2026-04-17' },
  { id: 'p25', full_name: 'Arvind Kulkarni',    role: 'CFO',                          company: 'Crescent Pharma',          email: 'arvind@crescentpharma.in',  phone: '+91 98219 00010', city: 'Hyderabad',     country: 'India',     how_to_talk: 'Methodical. Sends Excel before every call.',                                                  relationship_history: 'OTC carve-out scoping.',                                              what_they_care_about: 'Strategic vs financial buyer mix.',                    favours_bank: 'N/A — prospect.',                                                things_to_avoid: 'Don\'t skip the regulatory diligence questions.',                      mutuals: '—',                                                tags: ['Founder','Warm'],                last_touched_at: '2026-05-05' },
  // Internal-team demo rows — generic names + example.com emails so the
  // demo data doesn't ship any single firm's real partners.
  { id: 'p26', full_name: 'Alex Chen',          role: 'Managing Partner',             company: 'Internal',                 email: 'alex@example.com',          phone: '+91 98220 00011', city: 'Mumbai',        country: 'India',     how_to_talk: 'N/A — internal.',                                                                              relationship_history: 'Founder. Internal.',                                                  what_they_care_about: '—',                                                     favours_bank: '—',                                                              things_to_avoid: '—',                                                                    mutuals: '—',                                                tags: ['Operator'],                       last_touched_at: '2026-05-07' },
  { id: 'p27', full_name: 'Jordan Patel',       role: 'Partner',                      company: 'Internal',                 email: 'jordan@example.com',        phone: '+91 98221 00012', city: 'London',        country: 'UK',        how_to_talk: 'N/A — internal.',                                                                              relationship_history: 'Internal.',                                                            what_they_care_about: '—',                                                     favours_bank: '—',                                                              things_to_avoid: '—',                                                                    mutuals: '—',                                                tags: ['Operator'],                       last_touched_at: '2026-05-07' }
]

// Look up a person by id from the DEMO_PEOPLE set, used as fallback when
// Supabase is unconfigured.
export function findDemoPerson(id) {
  return DEMO_PEOPLE.find(p => p.id === id) || null
}
