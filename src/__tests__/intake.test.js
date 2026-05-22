import { describe, it, expect } from 'vitest'
import { composeTeaserFromForm } from '../pages/Intake.jsx'

describe('composeTeaserFromForm — fundraise', () => {
  const form = {
    company_name: 'Quantum Edge',
    sector: 'Fintech',
    deal_types: ['transaction'],
    deal_subtype: 'fundraise',
    target_raise_usd_m: '80',
    target_valuation_usd_m: '320',
    company_stage: 'Series C',
    ma_side: 'sell', acquisition_brief: '',
    target_exit_usd_m: '', target_exit_valuation_usd_m: '', exit_investor_name: '',
    engagement_brief: '',
    situation: 'Pre-IPO cap raise.'
  }

  it('includes all relevant fundraise fields in the teaser', () => {
    const text = composeTeaserFromForm(form)
    expect(text).toMatch(/Quantum Edge/)
    expect(text).toMatch(/Fintech/)
    expect(text).toMatch(/Sub-type: fundraise/)
    expect(text).toMatch(/Target raise: USD 80M/)
    expect(text).toMatch(/Target valuation: USD 320M/)
    expect(text).toMatch(/Series C/)
    expect(text).toMatch(/Pre-IPO cap raise/)
  })

  it('omits M&A-only fields when subtype is fundraise', () => {
    const text = composeTeaserFromForm(form)
    expect(text).not.toMatch(/Acquisition brief/)
    expect(text).not.toMatch(/M&A side/)
  })
})

describe('composeTeaserFromForm — m_and_a', () => {
  const form = {
    company_name: 'Crescent Pharma',
    sector: 'Healthcare',
    deal_types: ['transaction'],
    deal_subtype: 'm_and_a',
    target_raise_usd_m: '', target_valuation_usd_m: '', company_stage: '',
    ma_side: 'sell',
    acquisition_brief: 'Carve-out of OTC division. EBITDA ~USD 18M.',
    target_exit_usd_m: '', target_exit_valuation_usd_m: '', exit_investor_name: '',
    engagement_brief: '',
    situation: 'Looking for a sell-side advisor.'
  }

  it('includes the acquisition brief verbatim', () => {
    const text = composeTeaserFromForm(form)
    expect(text).toMatch(/Carve-out of OTC division/)
    expect(text).toMatch(/M&A side: sell/)
  })

  it('omits fundraise / exit numbers', () => {
    const text = composeTeaserFromForm(form)
    expect(text).not.toMatch(/Target raise/)
    expect(text).not.toMatch(/Target exit/)
  })
})

describe('composeTeaserFromForm — advisory', () => {
  const form = {
    company_name: 'Saffron Studios',
    sector: 'Media',
    deal_types: ['advisory'],
    deal_subtype: 'fundraise', // ignored when transaction not in deal_types
    target_raise_usd_m: '', target_valuation_usd_m: '', company_stage: '',
    ma_side: 'sell', acquisition_brief: '',
    target_exit_usd_m: '', target_exit_valuation_usd_m: '', exit_investor_name: '',
    engagement_brief: 'Help us raise project finance for the next slate.',
    situation: 'Slate financing.'
  }

  it('includes the engagement brief but no transaction fields', () => {
    const text = composeTeaserFromForm(form)
    expect(text).toMatch(/Engagement brief: Help us raise project finance/)
    expect(text).not.toMatch(/Sub-type/)
    expect(text).not.toMatch(/Target raise/)
  })
})

describe('composeTeaserFromForm — both transaction + advisory', () => {
  const form = {
    company_name: 'HoV Mushrooms',
    sector: 'Consumer',
    deal_types: ['transaction', 'advisory'],
    deal_subtype: 'fundraise',
    target_raise_usd_m: '12',
    target_valuation_usd_m: '60',
    company_stage: 'Series A',
    ma_side: 'sell', acquisition_brief: '',
    target_exit_usd_m: '', target_exit_valuation_usd_m: '', exit_investor_name: '',
    engagement_brief: 'D2C → B2B expansion + Dubai entry.',
    situation: 'Started as raise, broadened.'
  }

  it('includes both fundraise + advisory fields', () => {
    const text = composeTeaserFromForm(form)
    expect(text).toMatch(/Target raise: USD 12M/)
    expect(text).toMatch(/Series A/)
    expect(text).toMatch(/Engagement brief: D2C → B2B expansion/)
  })
})

describe('composeTeaserFromForm — deck text', () => {
  const form = {
    company_name: 'Quantum Edge',
    sector: 'Fintech',
    deal_types: ['transaction'],
    deal_subtype: 'fundraise',
    target_raise_usd_m: '80', target_valuation_usd_m: '', company_stage: '',
    ma_side: 'sell', acquisition_brief: '',
    target_exit_usd_m: '', target_exit_valuation_usd_m: '', exit_investor_name: '',
    engagement_brief: '', situation: ''
  }

  it('appends parsed deck text under a separator', () => {
    const text = composeTeaserFromForm(form, 'A B C')
    expect(text).toMatch(/--- DECK TEXT ---\nA B C/)
  })

  it('truncates deck text at 6000 characters', () => {
    const big = 'x'.repeat(8000)
    const text = composeTeaserFromForm(form, big)
    const deckPart = text.split('--- DECK TEXT ---\n')[1]
    expect(deckPart.length).toBeLessThanOrEqual(6000)
  })
})
