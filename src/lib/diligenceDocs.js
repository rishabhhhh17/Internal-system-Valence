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

export const FOUNDER_DOCS = [
  { key: 'nda',                label: 'NDA' },
  { key: 'pitch_deck',         label: 'Pitch Deck' },
  { key: 'financial_model',    label: 'Financial Model' },
  { key: 'cap_table',          label: 'Cap Table (fully diluted)' },
  { key: 'customer_contracts', label: 'Customer Contracts' },
  { key: 'ip_assignment',      label: 'IP Assignment Agreements' },
  { key: 'incorporation',      label: 'Incorporation Documents' },
  { key: 'option_plan',        label: 'Option / Equity Plan' }
]

export const LP_DOCS = [
  { key: 'nda',                 label: 'NDA' },
  { key: 'investor_collateral', label: 'Investor Collateral (Deck / PPM)' },
  { key: 'lpa_side_letter',     label: 'Fund LPA / Side Letter' },
  { key: 'track_record',        label: 'Track Record / Performance' },
  { key: 'ddq',                 label: 'DDQ (Due Diligence Questionnaire)' },
  { key: 'kyc_aml',             label: 'KYC / AML Docs' }
]

export function docsForMode(mode) {
  return mode === 'lp' ? LP_DOCS : FOUNDER_DOCS
}

// The status a document cell shows. Click cycles through them in this order.
export const DOC_STATUSES = ['received', 'pending', 'na']

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
