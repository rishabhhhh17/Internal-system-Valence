// Document tracker — the checklist of documents that need to change hands while
// a deal is live. Two document sets, one per pipeline mode:
//   company ('Founders') — what the fund needs to RECEIVE from a potential
//                          portfolio company to evaluate it (diligence docs).
//   lp                   — what the fund needs to SHARE with a prospective LP
//                          (and collect back) during fundraising.
//
// Each document's state for a deal lives in the deals.dd_docs jsonb column as
//   { [docKey]: { status: 'received'|'pending'|'na', date: 'YYYY-MM-DD'|null } }
// An absent key defaults to 'pending' so a fresh deal reads as "nothing in yet"
// without needing every key pre-seeded.

// `short` is the column header in the matrix view; `label` is the full name
// (used in tooltips / the legend).
export const FOUNDER_DOCS = [
  { key: 'nda',                short: 'NDA',       label: 'NDA' },
  { key: 'pitch_deck',         short: 'Deck',      label: 'Pitch Deck' },
  { key: 'financial_model',    short: 'Model',     label: 'Financial Model' },
  { key: 'cap_table',          short: 'Cap Table', label: 'Cap Table (fully diluted)' },
  { key: 'customer_contracts', short: 'Contracts', label: 'Customer Contracts' },
  { key: 'ip_assignment',      short: 'IP',        label: 'IP Assignment Agreements' },
  { key: 'incorporation',      short: 'Incorp.',   label: 'Incorporation Documents' },
  { key: 'option_plan',        short: 'Options',   label: 'Option / Equity Plan' }
]

export const LP_DOCS = [
  { key: 'nda',                 short: 'NDA',        label: 'NDA' },
  { key: 'investor_collateral', short: 'Collateral', label: 'Investor Collateral (Deck / PPM)' },
  { key: 'lpa_side_letter',     short: 'LPA',        label: 'Fund LPA / Side Letter' },
  { key: 'track_record',        short: 'Track Rec.', label: 'Track Record / Performance' },
  { key: 'ddq',                 short: 'DDQ',        label: 'DDQ (Due Diligence Questionnaire)' },
  { key: 'kyc_aml',             short: 'KYC / AML',  label: 'KYC / AML Docs' }
]

export function docsForMode(mode) {
  return mode === 'lp' ? LP_DOCS : FOUNDER_DOCS
}

// The status a document cell shows. Click cycles through them in this order,
// so the primary action (an outstanding doc arriving) is a single click:
//   Pending → Received → N/A → Pending
export const DOC_STATUSES = ['pending', 'received', 'na']

export function nextDocStatus(status) {
  const i = DOC_STATUSES.indexOf(status || 'pending')
  return DOC_STATUSES[(i + 1) % DOC_STATUSES.length]
}

// Read a single doc's state off a deal, defaulting absent keys to 'pending'.
export function docState(deal, key) {
  const v = deal?.dd_docs?.[key]
  if (!v) return { status: 'pending', date: null }
  return { status: v.status || 'pending', date: v.date || null }
}

export function docStatusMeta(status) {
  switch (status) {
    case 'received':
      return { label: 'Received', dot: 'bg-valence-success', text: 'text-valence-success' }
    case 'na':
      return { label: 'N/A', dot: 'bg-valence-subtle', text: 'text-valence-muted' }
    case 'pending':
    default:
      return { label: 'Pending', dot: 'bg-valence-danger', text: 'text-valence-danger' }
  }
}

// How many of the (applicable) docs are received, for a per-deal summary.
// N/A docs drop out of the denominator so "5/6" reads as "of what we need".
export function docCompletion(deal, mode) {
  const docs = docsForMode(mode)
  let received = 0, applicable = 0
  for (const d of docs) {
    const { status } = docState(deal, d.key)
    if (status === 'na') continue
    applicable += 1
    if (status === 'received') received += 1
  }
  return { received, applicable, complete: applicable > 0 && received === applicable }
}
