-- ValenceOS · Demo mandates pack
-- 22 additional deals spread across all 6 live stages (Mandate, Preparation,
-- Marketing, Diligence, Negotiation, Closing) so the /mandates page is full.
-- Idempotent on duplicates: each row has a unique client_name.

insert into public.deals (
  client_name, deal_type, stage, nda_status, side, sector,
  ticket_size_usd_m, fee_retainer_usd, fee_success_pct, target_close,
  expected_close_date, lead_owner, origination_source, notes, created_at, updated_at
) values
  -- Mandate (4)
  ('Banyan Power',           'M&A',   'Mandate',     'Signed',  'Sell-side', 'Renewables',     140, 40000,  2.10, current_date + 180, current_date + 180, 'Neha Jain',       'Existing client',  'Engagement letter signed last week. Teaser drafting.',                          now() - interval '5 days',  now() - interval '5 days'),
  ('Cobalt Mobility',        'PE/VC', 'Mandate',     'Signed',  'Sell-side', 'Mobility',       55,  25000,  3.00, current_date + 200, current_date + 200, 'Priya Mehta',     'Outbound',         'EV charging infrastructure scale-up. Series C in scope.',                       now() - interval '10 days', now() - interval '10 days'),
  ('Verdant Agritech',       'M&A',   'Mandate',     'Signed',  'Sell-side', 'Consumer',       95,  35000,  2.25, current_date + 165, current_date + 165, 'Oliver Hayes',    'Referral',         'Vertically-integrated farm-to-shelf player. Sell-side mandate.',                now() - interval '3 days',  now() - interval '3 days'),
  ('Lattice Cloud',          'PE/VC', 'Mandate',     'Pending', 'Sell-side', 'Fintech',        70,  30000,  2.75, current_date + 195, current_date + 195, 'James Whitfield', 'Sponsor network',  'B2B SaaS billing platform. Series C raise being scoped.',                       now() - interval '7 days',  now() - interval '7 days'),

  -- Preparation (4)
  ('Astra Diagnostics',      'M&A',   'Preparation', 'Signed',  'Sell-side', 'Healthcare',     220, 60000,  2.00, current_date + 150, current_date + 150, 'Neha Jain',       'Existing client',  'Building IM and management presentation. Buyer outreach starts in 3 weeks.',    now() - interval '22 days', now() - interval '22 days'),
  ('Northwind Marine',       'PE/VC', 'Preparation', 'Signed',  'Sell-side', 'Logistics',      310, 80000,  1.65, current_date + 175, current_date + 175, 'Oliver Hayes',    'Sponsor network',  'Container shipping carve-out. Working through Bain QoE before going live.',     now() - interval '18 days', now() - interval '18 days'),
  ('Maple Insurance',        'M&A',   'Preparation', 'Signed',  'Sell-side', 'BFSI',           400, 100000, 1.50, current_date + 160, current_date + 160, 'Sophie Laurent',  'Inbound / RFP',    'P&C insurance carve-out from a listed parent. Data room being assembled.',      now() - interval '14 days', now() - interval '14 days'),
  ('Helios Finance',         'PE/VC', 'Preparation', 'Signed',  'Buy-side',  'Fintech',        85,  30000,  2.50, current_date + 140, current_date + 140, 'Priya Mehta',     'Existing client',  'Buy-side scoping for a digital lending bolt-on.',                                now() - interval '11 days', now() - interval '11 days'),

  -- Marketing (4)
  ('Crescent Pharma',        'M&A',   'Marketing',   'Signed',  'Sell-side', 'Healthcare',     220, 60000,  2.10, current_date + 130, current_date + 130, 'Neha Jain',       'Referral',         'OTC carve-out. NDAs out to 12 strategics + 6 sponsors.',                        now() - interval '35 days', now() - interval '35 days'),
  ('Sigma Industrials',      'M&A',   'Marketing',   'Signed',  'Sell-side', 'Industrials',    180, 50000,  2.20, current_date + 110, current_date + 110, 'James Whitfield', 'Outbound',         'Specialty chemicals divestiture. 8 sponsors in active outreach.',               now() - interval '28 days', now() - interval '28 days'),
  ('Pinnacle Hospitality',   'PE/VC', 'Marketing',   'Signed',  'Sell-side', 'Hospitality',    270, 70000,  1.80, current_date + 125, current_date + 125, 'Oliver Hayes',    'Existing client',  'Premium hotels portfolio. Sponsor + REIT outreach in flight.',                  now() - interval '42 days', now() - interval '42 days'),
  ('Tarana SaaS',            'PE/VC', 'Marketing',   'Signed',  'Sell-side', 'SaaS',           60,  25000,  3.00, current_date + 115, current_date + 115, 'Priya Mehta',     'Sponsor network',  'Vertical SaaS. Process letter live; first round bids due in 4 weeks.',          now() - interval '20 days', now() - interval '20 days'),

  -- Diligence (4)
  ('Halcyon Pharma',         'M&A',   'Diligence',   'Signed',  'Sell-side', 'Healthcare',     520, 120000, 1.85, current_date + 80,  current_date + 80,  'Neha Jain',       'Existing client',  'Sponsor + strategic short-list of 4 in DD. Management meetings scheduled.',     now() - interval '60 days', now() - interval '60 days'),
  ('Ridgeway Realty',        'M&A',   'Diligence',   'Signed',  'Sell-side', 'Real Estate',    430, 100000, 1.55, current_date + 65,  current_date + 65,  'Oliver Hayes',    'Inbound / RFP',    'Logistics warehouse portfolio. 3 buyers in deep DD with Q&A round 2.',          now() - interval '55 days', now() - interval '55 days'),
  ('Auro Power',             'PE/VC', 'Diligence',   'Signed',  'Sell-side', 'Renewables',     360, 90000,  1.70, current_date + 90,  current_date + 90,  'James Whitfield', 'Sponsor network',  'Operating wind portfolio. Two infrastructure funds + a sovereign in DD.',       now() - interval '70 days', now() - interval '70 days'),
  ('Indigo Edu',             'PE/VC', 'Diligence',   'Signed',  'Sell-side', 'EdTech',         85,  30000,  2.75, current_date + 55,  current_date + 55,  'Priya Mehta',     'Outbound',         'Series C raise. Three growth funds in DD; commercial DD complete.',             now() - interval '48 days', now() - interval '48 days'),

  -- Negotiation (3)
  ('Saffron Retail',         'M&A',   'Negotiation', 'Signed',  'Sell-side', 'Consumer',       180, 50000,  2.00, current_date + 35,  current_date + 35,  'Sophie Laurent',  'Outbound',         'Down to a single sponsor. Term-sheet exchanges this week.',                     now() - interval '85 days', now() - interval '85 days'),
  ('Stellar Pharma',         'M&A',   'Negotiation', 'Signed',  'Sell-side', 'Healthcare',     310, 75000,  2.10, current_date + 28,  current_date + 28,  'Neha Jain',       'Existing client',  'Strategic in exclusivity. SPA being papered.',                                  now() - interval '95 days', now() - interval '95 days'),
  ('Granite Logistics',      'M&A',   'Negotiation', 'Signed',  'Sell-side', 'Logistics',      240, 60000,  1.95, current_date + 40,  current_date + 40,  'Oliver Hayes',    'Existing client',  'Sponsor LOI countersigned. Working through reps & warranties.',                 now() - interval '78 days', now() - interval '78 days'),

  -- Closing (3)
  ('Aurora Hotels',          'M&A',   'Closing',     'Signed',  'Sell-side', 'Hospitality',    280, 70000,  1.85, current_date + 18,  current_date + 18,  'Oliver Hayes',    'Referral',         'Definitive agreement signed. Funds-flow scheduled for end of next week.',       now() - interval '110 days',now() - interval '110 days'),
  ('Beacon Renewables',      'PE/VC', 'Closing',     'Signed',  'Sell-side', 'Renewables',     420, 100000, 1.60, current_date + 12,  current_date + 12,  'James Whitfield', 'Sponsor network',  'Closing conditions cleared. Final regulatory consent expected this week.',      now() - interval '125 days',now() - interval '125 days'),
  ('Cedar Edu',              'PE/VC', 'Closing',     'Signed',  'Sell-side', 'EdTech',         60,  25000,  3.25, current_date + 9,   current_date + 9,   'Priya Mehta',     'Outbound',         'Series C wire transfer set for Friday. Fund admin checks running.',             now() - interval '90 days', now() - interval '90 days');
