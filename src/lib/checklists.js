// Templated checklist for each stage of the pre-diligence investor funnel
// (src/lib/stages.js): Sourced → Information Received → Analyst Call →
// Partner Call → Memo → Diligence (graduation) / Passed (drop-off).

export const STAGE_CHECKLISTS = {
  Sourced: [
    { key: 'first_contact',    label: 'First contact logged',           required: true  },
    { key: 'prospect_note',    label: 'Company profile note captured',  required: false }
  ],
  'Information Received': [
    { key: 'materials_in',     label: 'Deck / materials received',                 required: true  },
    { key: 'first_look',       label: 'First look completed',                      required: false }
  ],
  'Analyst Call': [
    { key: 'analyst_call',     label: 'Analyst call held with company',            required: true  },
    { key: 'fit_screen',       label: 'Thesis / fit screen documented',            required: true  },
    { key: 'firm_creds',       label: 'Fund overview shared',                      required: false }
  ],
  'Partner Call': [
    { key: 'partner_call',     label: 'Partner call held',                         required: true  },
    { key: 'data_request',     label: 'Data / metrics request sent',               required: true  },
    { key: 'nda_signed',       label: 'NDA signed',                                required: false }
  ],
  Memo: [
    { key: 'memo_drafted',       label: 'Investment memo drafted',                 required: true  },
    { key: 'key_metrics',        label: 'Key metrics and model assembled',         required: true  },
    { key: 'references',         label: 'Customer / reference calls done',         required: false },
    { key: 'ic_scheduled',       label: 'IC review scheduled',                      required: false }
  ],
  Diligence: [
    { key: 'dd_kickoff',       label: 'Diligence kickoff held',                    required: true  },
    { key: 'dd_workstreams',   label: 'Diligence workstreams assigned',            required: false },
    { key: 'case_study',       label: 'Internal case study logged',                required: false }
  ],
  Passed: [
    { key: 'pass_reason',      label: 'Pass reason captured for review',           required: true  },
    { key: 'relationship_logged', label: 'Relationship-maintenance next step logged', required: false }
  ]
}

export function progress(doneKeys, stage) {
  const items = STAGE_CHECKLISTS[stage] || []
  const required = items.filter(i => i.required)
  const total = items.length
  const done = items.filter(i => doneKeys.has(i.key)).length
  const doneRequired = required.filter(i => doneKeys.has(i.key)).length
  return {
    total,
    done,
    required: required.length,
    doneRequired,
    percent: total === 0 ? 100 : Math.round((done / total) * 100),
    blocked: doneRequired < required.length
  }
}
