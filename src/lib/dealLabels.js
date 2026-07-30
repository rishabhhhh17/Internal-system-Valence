// Human-readable deal descriptors derived from the LIVE deal model
// (deal_types[] + deal_subtype + ma_side). The legacy singular `deal_type`
// and `side` columns are no longer written by the deal form, so always
// derive from the current fields — reading the legacy columns directly
// yields blank/"Advisory" on real data. Legacy values are kept only as a
// last-resort fallback for any un-migrated rows.

export function dealTypeLabel(deal) {
  if (!deal) return ''
  if (deal.deal_subtype === 'm_and_a')   return 'M&A'
  if (deal.deal_subtype === 'fundraise') return 'Fundraise'
  if (deal.deal_subtype === 'exit')      return 'Exit'
  const types = deal.deal_types || []
  if (types.includes('advisory'))        return 'Advisory'
  if (types.includes('transaction'))     return 'Transaction'
  return deal.deal_type || ''
}

// 'Buy-side' / 'Sell-side' / '' — normalises ma_side ('buy'/'sell') and the
// legacy `side` ('Buy-side'/'Sell-side') into one display form.
export function dealSideLabel(deal) {
  const s = String(deal?.ma_side || deal?.side || '').toLowerCase()
  if (s.startsWith('sell')) return 'Sell-side'
  if (s.startsWith('buy'))  return 'Buy-side'
  return ''
}
