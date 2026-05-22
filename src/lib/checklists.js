// Templated checklist for each stage of the new 7-stage Valence pipeline.
// The old execution-phase stages (Preparation, Marketing, Diligence,
// Negotiation, Closing) collapsed into "Mandate", so all of their items now
// live under Mandate as a single execution checklist.

export const STAGE_CHECKLISTS = {
  Origination: [
    { key: 'first_contact',    label: 'First contact logged',           required: true  },
    { key: 'prospect_note',    label: 'Prospect profile note captured', required: false }
  ],
  Pitching: [
    { key: 'pitch_deck',       label: 'Pitch deck drafted',                        required: true  },
    { key: 'intro_call',       label: 'Intro call held with counterparty',         required: true  },
    { key: 'firm_creds',       label: 'Valence credentials shared',                required: false }
  ],
  'Pre-Mandate': [
    { key: 'fee_terms',        label: 'Pricing and fee terms negotiated',          required: true  },
    { key: 'nda_signed',       label: 'NDA signed',                                required: true  },
    { key: 'engagement_letter',label: 'Engagement letter drafted',                 required: true  },
    { key: 'el_countersigned', label: 'Engagement letter countersigned',           required: true  }
  ],
  Mandate: [
    { key: 'kickoff',            label: 'Internal kickoff held',                   required: true  },
    { key: 'materials',          label: 'Core materials prepared (teaser / IM / brief)', required: true  },
    { key: 'outreach',           label: 'Outreach to counterparties begun',        required: false },
    { key: 'mgmt_presentations', label: 'Management or counterparty meetings held',required: false },
    { key: 'shortlist',          label: 'Counterparty shortlist segmented',        required: false },
    { key: 'definitive_terms',   label: 'Definitive terms / LOIs progressed',      required: false },
    { key: 'closing_docs',       label: 'Closing documents executed',              required: false }
  ],
  Closed: [
    { key: 'invoice',          label: 'Success fee invoice issued',                required: true  },
    { key: 'case_study',       label: 'Internal case study logged',                required: false },
    { key: 'testimonial',      label: 'Client testimonial captured',               required: false }
  ],
  'On Hold': [
    { key: 'reason_noted',     label: 'Reason for hold noted in activity',         required: true  },
    { key: 'revive_trigger',   label: 'Trigger to resume documented',              required: false }
  ],
  Lost: [
    { key: 'loss_reason',      label: 'Loss reason captured for PM review',        required: true  },
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
