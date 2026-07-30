// Lightweight conflicts check run at new-deal creation time. Not RLS-grade
// compliance — just flags obvious overlaps for the banker to double-check.
//
// Surfaces:
//   1. Same client name on another live deal (sometimes intentional, sometimes not)
//   2. Client is also a counterparty on another live deal (classic conflict)
//   3. Same sector + opposite side (possible Chinese-wall concern)

import { supabase, isSupabaseConfigured } from './supabase.js'
import { ACTIVE_STAGES } from './stages.js'

export async function checkConflicts({ clientName, sector, side }) {
  if (!isSupabaseConfigured || !clientName) return { hits: [] }

  const needle = clientName.trim()
  if (!needle) return { hits: [] }

  const hits = []
  try {
    // 1. Existing deal with same client
    const { data: nameDeals } = await supabase
      .from('deals').select('id, client_name, stage, ma_side, side')
      .ilike('client_name', needle)
      .limit(3)
    for (const d of (nameDeals || [])) {
      hits.push({
        severity: 'warn',
        title:    `An active mandate with the same client already exists`,
        detail:   `${d.client_name} · ${d.stage} · ${d.ma_side || d.side || 'Advisory'}`,
        dealId:   d.id
      })
    }

    // 2. Client name appears in contacts (counterparty to another mandate)
    const { data: contactHits } = await supabase
      .from('contacts').select('deal_id, name, company')
      .or(`name.ilike.${needle},company.ilike.${needle}`)
      .limit(5)
    if (contactHits?.length) {
      const byDeal = new Map()
      for (const c of contactHits) {
        if (!c.deal_id) continue
        if (!byDeal.has(c.deal_id)) byDeal.set(c.deal_id, c)
      }
      if (byDeal.size > 0) {
        const dealIds = Array.from(byDeal.keys())
        const { data: dealRows } = await supabase
          .from('deals').select('id, client_name, stage').in('id', dealIds)
        for (const d of (dealRows || [])) {
          const c = byDeal.get(d.id)
          hits.push({
            severity: 'high',
            title:    `"${clientName}" is logged as a counterparty on another mandate`,
            detail:   `On ${d.client_name} (${d.stage}) as ${c.company || c.name}. Review for conflict of interest.`,
            dealId:   d.id
          })
        }
      }
    }

    // 3. Same sector, opposite side — possible Chinese-wall concern
    if (sector && side) {
      const { data: crossRows } = await supabase
        .from('deals').select('id, client_name, stage, ma_side, sector')
        .eq('sector', sector)
        .neq('ma_side', side)
        .in('stage', ACTIVE_STAGES.map(s => s.id))
        .limit(3)
      for (const d of (crossRows || [])) {
        hits.push({
          severity: 'low',
          title:    `Active ${d.ma_side || 'Advisory'} mandate in the same sector`,
          detail:   `${d.client_name} (${d.stage}, ${d.sector}). Confirm no Chinese-wall breach.`,
          dealId:   d.id
        })
      }
    }
  } catch {
    // Silent — conflicts check is advisory, should not block deal creation.
  }

  return { hits }
}
