// Temporary preview page — renders FitCard against four representative
// entities so we can visually sign off the component before wiring it into
// Deals / InboxIntake / etc. Remove this file (and the route in App.jsx)
// once the FitCard is plugged into its real homes.

import FitCard from '../components/FitCard.jsx'

const SAMPLES = [
  {
    title: 'Strong fit',
    blurb: 'Healthcare mandate at $250M EV, India — hits all three dimensions.',
    entityType: 'deal',
    entity: {
      id: 'preview-strong',
      sector: 'Healthcare',
      target_valuation_usd_m: 250,
      geography: 'India'
    }
  },
  {
    title: 'Partial fit',
    blurb: 'Right sector + UK coverage, but EV is well above the $750M cap.',
    entityType: 'deal',
    entity: {
      id: 'preview-partial',
      sector: 'Fintech',
      target_valuation_usd_m: 1500,
      geography: 'UK'
    }
  },
  {
    title: 'Hard exclude',
    blurb: 'Defence sector triggers the override — verdict locks to Excluded.',
    entityType: 'deal',
    entity: {
      id: 'preview-excluded',
      sector: 'Defence',
      target_valuation_usd_m: 200,
      geography: 'India'
    },
    criteria: {
      id: 'local-defence-excluded',
      name: 'Default Valence criteria',
      sectors: ['Healthcare', 'Fintech', 'Consumer', 'Infrastructure', 'Renewables', 'Logistics', 'Real Estate'],
      excluded_sectors: ['Defence', 'Tobacco'],
      ev_min_usd_m: 50,
      ev_max_usd_m: 750,
      geographies: ['India', 'UK', 'SE Asia']
    }
  },
  {
    title: 'Unknown intake',
    blurb: 'Anonymous inbound — sector and geography not specified.',
    entityType: 'intake',
    entity: {
      id: 'preview-unknown',
      sector: null,
      ev_ask_usd_m: null,
      geography: null
    }
  }
]

export default function FitPreview() {
  return (
    <div className="space-y-8 py-6">
      <div>
        <span className="vl-eyebrow-ink">Phase 3.5 preview</span>
        <h1 className="vl-section-title mt-1">Fit Engine — FitCard variants</h1>
        <p className="vl-section-kicker max-w-2xl">
          Sign off the component layout, action buttons, and breakdown bars here before we plug it
          into Deals · InboxIntake · Mandates. This route is temporary.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {SAMPLES.map(s => (
          <div key={s.entity.id}>
            <div className="mb-2">
              <p className="text-sm font-semibold text-valence-text">{s.title}</p>
              <p className="text-xs text-valence-muted">{s.blurb}</p>
            </div>
            <FitCard
              entity={s.entity}
              entityType={s.entityType}
              criteria={s.criteria}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
