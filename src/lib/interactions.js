// Interactions — touchpoints that aren't yet deals. Pre-mandate funnel.
// Purpose drives which outcomes are valid and which color tone they render in.

export const PURPOSES = [
  { id: 'pitch_for_mandate',    label: 'Pitch for mandate',     blurb: 'Active outreach to win a mandate' },
  { id: 'counterparty_outreach', label: 'Counterparty outreach', blurb: 'Funds, strategics, family offices' },
  { id: 'relationship_building', label: 'Relationship building', blurb: 'Long-arc relationship-keeping' },
  { id: 'referral',              label: 'Referral',              blurb: 'Inbound or outbound referral' }
]

export const TYPES = [
  { id: 'intro_call',    label: 'Intro call' },
  { id: 'pitch_meeting', label: 'Pitch meeting' },
  { id: 'coffee',        label: 'Coffee' },
  { id: 'email_thread',  label: 'Email thread' },
  { id: 'referral_in',   label: 'Referral in' },
  { id: 'referral_out',  label: 'Referral out' },
  { id: 'event',         label: 'Event' },
  { id: 'phone_call',    label: 'Phone call' },
  { id: 'other',         label: 'Other' }
]

const OUTCOME_LABELS = {
  to_followup:           'To follow up',
  in_progress:           'In progress',
  converted_to_mandate:  'Converted to mandate',
  pitched_lost:          'Pitched and lost',
  interested:            'Interested',
  passed:                'Passed',
  referred_out:          'Referred out',
  stay_warm:             'Stay warm',
  closed:                'Closed'
}

// Valid outcomes per purpose — drives the dynamic select in InteractionDrawer.
const OUTCOMES_BY_PURPOSE = {
  pitch_for_mandate:    ['to_followup', 'in_progress', 'converted_to_mandate', 'pitched_lost'],
  counterparty_outreach:['in_progress', 'interested', 'passed', 'closed'],
  relationship_building:['to_followup', 'stay_warm'],
  referral:             ['in_progress', 'referred_out', 'closed']
}

const OUTCOME_TONE_CLASSES = {
  to_followup:          'bg-valence-warning/10 text-valence-warning border-valence-warning/30',
  in_progress:          'bg-valence-blue-soft text-valence-blue border-valence-blue/30',
  converted_to_mandate: 'bg-valence-success/10 text-valence-success border-valence-success/30',
  pitched_lost:         'bg-valence-danger/10 text-valence-danger border-valence-danger/30',
  interested:           'bg-valence-success/10 text-valence-success border-valence-success/30',
  passed:               'bg-valence-muted/10 text-valence-muted border-valence-border',
  referred_out:         'bg-valence-blue-soft text-valence-blue border-valence-blue/30',
  stay_warm:            'bg-valence-warning/10 text-valence-warning border-valence-warning/30',
  closed:               'bg-valence-muted/10 text-valence-muted border-valence-border'
}

export function outcomesForPurpose(purpose) {
  return OUTCOMES_BY_PURPOSE[purpose] || []
}

export function outcomeLabel(outcome) {
  return OUTCOME_LABELS[outcome] || outcome
}

export function outcomeTone(outcome) {
  return OUTCOME_TONE_CLASSES[outcome] || 'bg-valence-surface text-valence-muted border-valence-border'
}

export function purposeLabel(purpose) {
  return PURPOSES.find(p => p.id === purpose)?.label || purpose
}

export function typeLabel(type) {
  return TYPES.find(t => t.id === type)?.label || type
}

// Outcomes that signal a touchpoint deserves to become a pipeline deal.
export function isConvertibleToOrigination(outcome) {
  return outcome === 'converted_to_mandate'
}

// Demo data — populated when Supabase isn't configured. Mirrors the seed rows.
export const DEMO_INTERACTIONS = [
  { id: 'i1',  interaction_purpose: 'pitch_for_mandate',     type: 'pitch_meeting', counterparty_name: 'Rohit Bansal',     counterparty_company: 'Nimbus Health',     counterparty_role: 'CEO',                outcome: 'in_progress',          notes: 'Walked through credentials. Founders open to a sell-side pitch in Q3.',                            follow_up_date: addDays(7),  lead_owner: 'Neha Jain',       created_at: daysAgo(3) },
  { id: 'i2',  interaction_purpose: 'counterparty_outreach', type: 'intro_call',    counterparty_name: 'Anand Iyer',       counterparty_company: 'Peak XV Partners',  counterparty_role: 'Principal',          outcome: 'interested',           notes: 'Mapped fund mandate. Healthcare + consumer thesis active for 2026.',                              follow_up_date: addDays(14), lead_owner: 'Priya Mehta',     created_at: daysAgo(5) },
  { id: 'i3',  interaction_purpose: 'pitch_for_mandate',     type: 'pitch_meeting', counterparty_name: 'Ishaan Kapoor',    counterparty_company: 'Saffron Retail',    counterparty_role: 'Founder',            outcome: 'converted_to_mandate', notes: 'Engagement letter signed. Sell-side process kicks off Aug.',                                       follow_up_date: null,        lead_owner: 'Oliver Hayes',    created_at: daysAgo(12) },
  { id: 'i4',  interaction_purpose: 'relationship_building', type: 'coffee',        counterparty_name: 'Devika Rao',       counterparty_company: 'Catamaran Ventures', counterparty_role: 'Investment Director',outcome: 'stay_warm',            notes: 'Shared market view. No live deal but worth quarterly touch.',                                      follow_up_date: addDays(60), lead_owner: 'Neha Jain',       created_at: daysAgo(8) },
  { id: 'i5',  interaction_purpose: 'referral',              type: 'referral_in',   counterparty_name: 'James Whitfield',  counterparty_company: 'Whitfield & Co.',   counterparty_role: 'Partner',            outcome: 'in_progress',          notes: 'Inbound intro to a Hyderabad CPG founder via James. Diligence call scheduled.',                    follow_up_date: addDays(4),  lead_owner: 'James Whitfield', created_at: daysAgo(2) },
  { id: 'i6',  interaction_purpose: 'pitch_for_mandate',     type: 'phone_call',    counterparty_name: 'Sandeep Kale',     counterparty_company: 'Aegis Logistics',   counterparty_role: 'CFO',                outcome: 'pitched_lost',         notes: 'Lost on fee. Going with bulge-bracket. Worth re-pitch in 2027 if they spin off cold-chain.',       follow_up_date: addDays(180),lead_owner: 'Oliver Hayes',    created_at: daysAgo(20) },
  { id: 'i7',  interaction_purpose: 'counterparty_outreach', type: 'email_thread',  counterparty_name: 'Stephen Walker',   counterparty_company: 'Fidelity',          counterparty_role: 'Director, Capital Markets', outcome: 'in_progress',  notes: 'Anchor conversation for Quantum Edge ECM. Indicative interest at band.',                          follow_up_date: addDays(2),  lead_owner: 'James Whitfield', created_at: daysAgo(1) },
  { id: 'i8',  interaction_purpose: 'relationship_building', type: 'event',         counterparty_name: 'Naina Lal',        counterparty_company: 'Premji Invest',     counterparty_role: 'MD',                 outcome: 'to_followup',          notes: 'Met at IVCA Conclave. Loop in on next infrastructure mandate.',                                    follow_up_date: addDays(21), lead_owner: 'Priya Mehta',     created_at: daysAgo(6) },
  { id: 'i9',  interaction_purpose: 'referral',              type: 'referral_out',  counterparty_name: 'Aditya Sahay',     counterparty_company: 'Sahay Family Office', counterparty_role: 'Principal',         outcome: 'referred_out',         notes: 'Passed a smaller mid-cap mandate to Avendus — out of our deal-size band.',                         follow_up_date: null,        lead_owner: 'Neha Jain',       created_at: daysAgo(15) },
  { id: 'i10', interaction_purpose: 'pitch_for_mandate',     type: 'pitch_meeting', counterparty_name: 'Vikas Subramanian',counterparty_company: 'Meridian EdTech',   counterparty_role: 'Founder & CEO',      outcome: 'converted_to_mandate', notes: 'Sell-side mandate signed last week. Five funds now in DD.',                                        follow_up_date: null,        lead_owner: 'Priya Mehta',     created_at: daysAgo(45) },
  { id: 'i11', interaction_purpose: 'counterparty_outreach', type: 'coffee',        counterparty_name: 'Mark Rutherford',  counterparty_company: 'Brookfield Asset Mgmt', counterparty_role: 'VP',             outcome: 'interested',           notes: 'Real estate + infra coverage. Wants to see Orion deck.',                                           follow_up_date: addDays(7),  lead_owner: 'Oliver Hayes',    created_at: daysAgo(4) },
  { id: 'i12', interaction_purpose: 'relationship_building', type: 'coffee',        counterparty_name: 'Rhea Mathur',      counterparty_company: 'Lightspeed India',  counterparty_role: 'Partner',            outcome: 'stay_warm',            notes: 'Catch-up. No live overlap — biotech focus is still a stretch for them.',                           follow_up_date: addDays(45), lead_owner: 'Neha Jain',       created_at: daysAgo(11) },
  { id: 'i13', interaction_purpose: 'pitch_for_mandate',     type: 'intro_call',    counterparty_name: 'Tara Krishnan',    counterparty_company: 'Solstice Solar',    counterparty_role: 'CFO',                outcome: 'to_followup',          notes: 'Series C raise being scoped. Send a credentials memo + sample teaser.',                            follow_up_date: addDays(3),  lead_owner: 'Neha Jain',       created_at: daysAgo(1) },
  { id: 'i14', interaction_purpose: 'counterparty_outreach', type: 'pitch_meeting', counterparty_name: 'Karthik Iyer',     counterparty_company: 'Blume Ventures',    counterparty_role: 'Partner',            outcome: 'passed',               notes: 'Stage too late for them. Asked to be looped in on Series A rounds we touch.',                      follow_up_date: addDays(90), lead_owner: 'Priya Mehta',     created_at: daysAgo(9) },
  { id: 'i15', interaction_purpose: 'referral',              type: 'email_thread',  counterparty_name: 'Sophie Laurent',   counterparty_company: 'Laurent Capital',   counterparty_role: 'Founder',            outcome: 'closed',               notes: 'Closed referral loop — they took the mandate to a Paris boutique. Polite no.',                     follow_up_date: null,        lead_owner: 'Sophie Laurent',  created_at: daysAgo(30) },
  { id: 'i16', interaction_purpose: 'pitch_for_mandate',     type: 'event',         counterparty_name: 'Niharika Joshi',   counterparty_company: 'Evermark Retail',   counterparty_role: 'Group CFO',          outcome: 'in_progress',          notes: 'Met at consumer summit. They like the case studies. Process kick-off being scheduled.',            follow_up_date: addDays(10), lead_owner: 'Sophie Laurent',  created_at: daysAgo(7) },
  { id: 'i17', interaction_purpose: 'counterparty_outreach', type: 'phone_call',    counterparty_name: 'Daniel Cheng',     counterparty_company: 'Tiger Global',      counterparty_role: 'Director',           outcome: 'in_progress',          notes: 'Tracking growth-stage fintech mandates. Mentioned Quantum Edge — wants briefing.',                 follow_up_date: addDays(5),  lead_owner: 'James Whitfield', created_at: daysAgo(2) },
  { id: 'i18', interaction_purpose: 'relationship_building', type: 'coffee',        counterparty_name: 'Hemant Sahni',     counterparty_company: 'Chiratae Ventures', counterparty_role: 'Partner',            outcome: 'to_followup',          notes: 'Long-arc relationship. Send our Q1 healthcare snapshot when ready.',                                follow_up_date: addDays(14), lead_owner: 'Neha Jain',       created_at: daysAgo(13) },
  { id: 'i19', interaction_purpose: 'pitch_for_mandate',     type: 'pitch_meeting', counterparty_name: 'Maya Iyengar',     counterparty_company: 'Kestrel Biotech',   counterparty_role: 'Founder',            outcome: 'in_progress',          notes: 'Buy-side scoping for licensing-deal acquisitions. Stage 2 conversation scheduled.',                follow_up_date: addDays(8),  lead_owner: 'James Whitfield', created_at: daysAgo(6) },
  { id: 'i20', interaction_purpose: 'counterparty_outreach', type: 'email_thread',  counterparty_name: 'Nina Kapoor',      counterparty_company: 'GIC',               counterparty_role: 'Senior Investment Officer', outcome: 'in_progress',  notes: 'Sovereign coverage map updated. They\'re live for infra + renewables in India.',                  follow_up_date: addDays(11), lead_owner: 'Oliver Hayes',    created_at: daysAgo(4) },
  { id: 'i21', interaction_purpose: 'referral',              type: 'referral_in',   counterparty_name: 'Rajat Bhatia',     counterparty_company: 'Bhatia Family Office', counterparty_role: 'Principal',       outcome: 'in_progress',          notes: 'Inbound from existing client. Looking for sell-side advice on a niche logistics asset.',           follow_up_date: addDays(3),  lead_owner: 'Priya Mehta',     created_at: daysAgo(2) },
  { id: 'i22', interaction_purpose: 'pitch_for_mandate',     type: 'intro_call',    counterparty_name: 'Arvind Kulkarni',  counterparty_company: 'Crescent Pharma',   counterparty_role: 'CFO',                outcome: 'to_followup',          notes: 'Carve-out of OTC division being scoped. Wants comparative case studies.',                          follow_up_date: addDays(5),  lead_owner: 'Neha Jain',       created_at: daysAgo(2) },
  { id: 'i23', interaction_purpose: 'relationship_building', type: 'coffee',        counterparty_name: 'Yash Anand',       counterparty_company: 'Kalaari Capital',   counterparty_role: 'Partner',            outcome: 'stay_warm',            notes: 'Brand recall meeting. Not deploying actively in our segments.',                                    follow_up_date: addDays(75), lead_owner: 'Priya Mehta',     created_at: daysAgo(22) },
  { id: 'i24', interaction_purpose: 'pitch_for_mandate',     type: 'pitch_meeting', counterparty_name: 'Anuj Goyal',       counterparty_company: 'Brightline Mobility', counterparty_role: 'Founder',          outcome: 'pitched_lost',         notes: 'Lost to founder going direct. Logged as relationship for next round.',                              follow_up_date: addDays(120),lead_owner: 'Priya Mehta',     created_at: daysAgo(35) },
  { id: 'i25', interaction_purpose: 'counterparty_outreach', type: 'event',         counterparty_name: 'Lara Petrov',      counterparty_company: 'Sequoia Capital India', counterparty_role: 'Principal',     outcome: 'interested',           notes: 'Met at fintech roundtable. Wants to be on our distribution list.',                                  follow_up_date: addDays(20), lead_owner: 'James Whitfield', created_at: daysAgo(9) }
]

function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString()
}
function addDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10)
}
