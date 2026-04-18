// Templated checklist for each stage of the Valence advisory funnel.
// Ticked-state is persisted in deal_checklist; item vocabulary lives here.

export const STAGE_CHECKLISTS = {
  Origination: [
    { key: 'first_contact',    label: 'First contact logged',           required: true  },
    { key: 'prospect_note',    label: 'Prospect profile note captured', required: false }
  ],
  Pitch: [
    { key: 'pitch_deck',       label: 'Pitch deck drafted',                        required: true  },
    { key: 'intro_call',       label: 'Intro call held with counterparty',         required: true  },
    { key: 'firm_creds',       label: 'Valence credentials shared',                required: false }
  ],
  Mandate: [
    { key: 'engagement_letter',label: 'Engagement letter signed',                  required: true  },
    { key: 'fee_scope',        label: 'Scope and fees locked internally',          required: true  },
    { key: 'kickoff',          label: 'Internal kickoff held',                     required: false }
  ],
  Preparation: [
    { key: 'teaser',           label: 'Teaser drafted',                            required: true  },
    { key: 'im_outline',       label: 'IM outlined',                               required: true  },
    { key: 'model',            label: 'Financial model built',                     required: true  },
    { key: 'vdr',              label: 'Data room opened',                          required: true  },
    { key: 'buyer_list',       label: 'Buyer / investor long-list compiled',       required: true  }
  ],
  Marketing: [
    { key: 'teaser_sent',      label: 'Teaser sent to shortlist',                  required: true  },
    { key: 'nda_signed',       label: 'At least one NDA countersigned',            required: true  },
    { key: 'im_sent',          label: 'IM distributed to NDA signers',             required: false },
    { key: 'shortlist',        label: 'Shortlist segmented (strategic / financial)', required: false }
  ],
  Diligence: [
    { key: 'mgmt_presentations', label: 'Management presentations completed',      required: true  },
    { key: 'vdr_qa',             label: 'VDR Q&A rounds logged',                   required: true  },
    { key: 'site_visits',        label: 'Site visits (if relevant)',               required: false }
  ],
  Negotiation: [
    { key: 'loi_received',     label: 'LOI(s) received',                           required: true  },
    { key: 'shortlist_chosen', label: 'Preferred counterparty selected',           required: true  },
    { key: 'exclusivity',      label: 'Exclusivity window agreed',                 required: false }
  ],
  Closing: [
    { key: 'spa',              label: 'Definitive SPA executed',                   required: true  },
    { key: 'regulatory',       label: 'Regulatory approvals received',             required: true  },
    { key: 'funds_flow',       label: 'Funds flow confirmed',                      required: true  }
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
