-- ValenceOS · Demo mandates pack (v2 — new schema)
-- 22 deals across the new 7-stage pipeline + new Transaction/Advisory model.
-- Uses the new columns: deal_types[], deal_subtype, plus per-subtype
-- conditional fields (target_raise_usd_m, ma_side, acquisition_brief,
-- engagement_brief, etc.). Idempotent on duplicate client_name.

insert into public.deals (
  client_name, stage, nda_status, sector,
  deal_types, deal_subtype, ma_side, acquisition_brief,
  target_raise_usd_m, target_valuation_usd_m, company_stage,
  target_exit_usd_m, exit_investor_name,
  engagement_brief,
  target_close, expected_close_date, lead_owner, notes, created_at, updated_at
) values
  -- Pre-Mandate (4) — paperwork in flight
  ('Banyan Power',           'Pre-Mandate', 'Signed',  'Renewables',
   array['transaction'], 'fundraise', null, null,
   140, null, 'Series C',
   null, null,
   null,
   current_date + 180, current_date + 180, 'Neha Jain',       'Engagement letter being negotiated. Teaser drafting starts on signature.',                          now() - interval '5 days',  now() - interval '5 days'),

  ('Cobalt Mobility',        'Pre-Mandate', 'Signed',  'Mobility',
   array['transaction'], 'fundraise', null, null,
   55, 220, 'Series C',
   null, null,
   null,
   current_date + 200, current_date + 200, 'Priya Mehta',     'EV charging infrastructure scale-up. NDA signed; pricing under discussion.',                       now() - interval '10 days', now() - interval '10 days'),

  ('Verdant Agritech',       'Pre-Mandate', 'Signed',  'Consumer',
   array['transaction'], 'm_and_a',   'sell', 'Vertically-integrated farm-to-shelf player. Looking for strategic buyer at $80–120M EV.',
   null, null, null,
   null, null,
   null,
   current_date + 165, current_date + 165, 'Oliver Hayes',    'Engagement letter sent. Awaiting countersignature.',                                                now() - interval '3 days',  now() - interval '3 days'),

  ('Lattice Cloud',          'Pre-Mandate', 'Pending', 'Fintech',
   array['transaction'], 'fundraise', null, null,
   70, 250, 'Series C',
   null, null,
   null,
   current_date + 195, current_date + 195, 'James Whitfield', 'B2B SaaS billing platform. NDA out, EL drafting.',                                                  now() - interval '7 days',  now() - interval '7 days'),

  -- Mandate (15) — active execution
  ('Astra Diagnostics',      'Mandate', 'Signed',  'Healthcare',
   array['transaction'], 'm_and_a',   'sell', 'Diagnostics chain. Looking for strategic buyer or PE rollup. $150–250M EV target.',
   null, null, null, null, null, null,
   current_date + 150, current_date + 150, 'Neha Jain',       'Building IM and management presentation. Buyer outreach starts in 3 weeks.',                       now() - interval '22 days', now() - interval '22 days'),

  ('Northwind Marine',       'Mandate', 'Signed',  'Logistics',
   array['transaction'], 'm_and_a',   'sell', 'Container shipping carve-out from a listed parent. $250–350M EV.',
   null, null, null, null, null, null,
   current_date + 175, current_date + 175, 'Oliver Hayes',    'Working through Bain QoE before going to market.',                                                  now() - interval '18 days', now() - interval '18 days'),

  ('Maple Insurance',        'Mandate', 'Signed',  'BFSI',
   array['transaction'], 'm_and_a',   'sell', 'P&C insurance carve-out from a listed parent. $300–500M EV; strategic + sponsor universe.',
   null, null, null, null, null, null,
   current_date + 160, current_date + 160, 'Sophie Laurent',  'Data room being assembled. Sponsor list scoped.',                                                   now() - interval '14 days', now() - interval '14 days'),

  ('Helios Finance',         'Mandate', 'Signed',  'Fintech',
   array['transaction'], 'm_and_a',   'buy',  'Buy-side scoping for a digital lending bolt-on. $50–100M EV. India only.',
   null, null, null, null, null, null,
   current_date + 140, current_date + 140, 'Priya Mehta',     'Long-list of 22 targets being narrowed.',                                                            now() - interval '11 days', now() - interval '11 days'),

  ('Crescent Pharma',        'Mandate', 'Signed',  'Healthcare',
   array['transaction'], 'm_and_a',   'sell', 'OTC carve-out from a Mumbai-listed pharma. EBITDA ~$25M, EV $200–250M.',
   null, null, null, null, null, null,
   current_date + 130, current_date + 130, 'Neha Jain',       'NDAs out to 12 strategics + 6 sponsors.',                                                            now() - interval '35 days', now() - interval '35 days'),

  ('Sigma Industrials',      'Mandate', 'Signed',  'Industrials',
   array['transaction'], 'm_and_a',   'sell', 'Specialty chemicals divestiture. Three lines bundled. EV $150–200M.',
   null, null, null, null, null, null,
   current_date + 110, current_date + 110, 'James Whitfield', '8 sponsors in active outreach.',                                                                     now() - interval '28 days', now() - interval '28 days'),

  ('Pinnacle Hospitality',   'Mandate', 'Signed',  'Hospitality',
   array['transaction'], 'fundraise', null, null,
   80, 270, 'Growth',
   null, null, null,
   current_date + 125, current_date + 125, 'Oliver Hayes',    'Premium hotels portfolio raise. Sponsor + REIT outreach in flight.',                                now() - interval '42 days', now() - interval '42 days'),

  ('Tarana SaaS',            'Mandate', 'Signed',  'SaaS',
   array['transaction'], 'fundraise', null, null,
   25, 180, 'Series C',
   null, null, null,
   current_date + 115, current_date + 115, 'Priya Mehta',     'Vertical SaaS. Process letter live; first round bids due in 4 weeks.',                              now() - interval '20 days', now() - interval '20 days'),

  ('Halcyon Pharma',         'Mandate', 'Signed',  'Healthcare',
   array['transaction'], 'm_and_a',   'sell', 'Speciality pharma. Sponsor + strategic short-list. EV target $400–600M.',
   null, null, null, null, null, null,
   current_date + 80,  current_date + 80,  'Neha Jain',       '4 buyers in DD. Management meetings scheduled.',                                                    now() - interval '60 days', now() - interval '60 days'),

  ('Ridgeway Realty',        'Mandate', 'Signed',  'Real Estate',
   array['transaction'], 'exit',      null, null,
   null, null, null,
   430, 'KKR',
   null,
   current_date + 65,  current_date + 65,  'Oliver Hayes',    'Liquidity for KKR. Three buyers in deep DD with Q&A round 2.',                                       now() - interval '55 days', now() - interval '55 days'),

  ('Auro Power',             'Mandate', 'Signed',  'Renewables',
   array['transaction'], 'exit',      null, null,
   null, null, null,
   360, 'Brookfield',
   null,
   current_date + 90,  current_date + 90,  'James Whitfield', 'Operating wind portfolio. Two infra funds + a sovereign in DD.',                                    now() - interval '70 days', now() - interval '70 days'),

  ('Indigo Edu',             'Mandate', 'Signed',  'EdTech',
   array['transaction'], 'fundraise', null, null,
   45, 220, 'Series C',
   null, null, null,
   current_date + 55,  current_date + 55,  'Priya Mehta',     'Three growth funds in DD; commercial DD complete.',                                                  now() - interval '48 days', now() - interval '48 days'),

  ('Saffron Retail',         'Mandate', 'Signed',  'Consumer',
   array['transaction','advisory'], 'm_and_a',   'sell', 'Premium D2C consumer brand. Sole sponsor in exclusivity at $180M EV.',
   null, null, null, null, null,
   'Also helping the founder with Dubai market entry plan + a vending-machine distribution play for premium Q-commerce dark stores.',
   current_date + 35,  current_date + 35,  'Sophie Laurent',  'Term sheet exchanges this week.',                                                                    now() - interval '85 days', now() - interval '85 days'),

  ('Stellar Pharma',         'Mandate', 'Signed',  'Healthcare',
   array['transaction'], 'm_and_a',   'sell', 'Cardiovascular speciality pharma. Single strategic in exclusivity. EV $300M+.',
   null, null, null, null, null, null,
   current_date + 28,  current_date + 28,  'Neha Jain',       'SPA being papered.',                                                                                  now() - interval '95 days', now() - interval '95 days'),

  ('Granite Logistics',      'Mandate', 'Signed',  'Logistics',
   array['transaction'], 'm_and_a',   'sell', 'Cold-chain carve-out. EV $200–280M.',
   null, null, null, null, null, null,
   current_date + 40,  current_date + 40,  'Oliver Hayes',    'Sponsor LOI countersigned. Working through reps & warranties.',                                       now() - interval '78 days', now() - interval '78 days'),

  ('Aurora Hotels',          'Mandate', 'Signed',  'Hospitality',
   array['transaction'], 'fundraise', null, null,
   100, 280, 'Growth',
   null, null, null,
   current_date + 18,  current_date + 18,  'Oliver Hayes',    'Definitive agreement signed. Funds-flow scheduled for end of next week.',                            now() - interval '110 days', now() - interval '110 days'),

  ('Beacon Renewables',      'Mandate', 'Signed',  'Renewables',
   array['transaction'], 'fundraise', null, null,
   180, 420, 'Project finance',
   null, null, null,
   current_date + 12,  current_date + 12,  'James Whitfield', 'Closing conditions cleared. Final regulatory consent expected this week.',                          now() - interval '125 days', now() - interval '125 days'),

  ('Cedar Edu',              'Mandate', 'Signed',  'EdTech',
   array['transaction'], 'fundraise', null, null,
   30, 200, 'Series C',
   null, null, null,
   current_date + 9,   current_date + 9,   'Priya Mehta',     'Series C wire transfer set for Friday. Fund admin checks running.',                                  now() - interval '90 days',  now() - interval '90 days'),

  -- Plus a couple of pure-Advisory examples to round out the demo
  ('HoV Mushrooms',          'Mandate', 'Signed',  'Consumer',
   array['transaction','advisory'], 'fundraise', null, null,
   12, 60, 'Series A',
   null, null,
   'D2C → B2B expansion (restaurants, hotels, grocers). Dubai market entry. New product line: peppers for premium Q-commerce dark stores.',
   current_date + 90,  current_date + 90,  'Trishant Patel',  'Started as a fundraise, broadened into Dubai entry + product-line work.',                            now() - interval '60 days',  now() - interval '60 days'),

  ('Saffron Studios',        'Mandate', 'Signed',  'Media',
   array['advisory'],    null,        null, null,
   null, null, null, null, null,
   'Helping a film studio raise project finance for their next slate. Equity capital, not debt.',
   current_date + 75,  current_date + 75,  'Manav Kapoor',    'Project capital — equity slate finance for the studio.',                                              now() - interval '40 days',  now() - interval '40 days');
