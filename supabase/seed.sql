-- Optional seed data for ValanceOS demo.

insert into public.deals (client_name, deal_type, stage, nda_status, side, sector, ticket_size_usd_m, fee_retainer_usd, fee_success_pct, target_close, lead_owner, deck_url, notes) values
  ('Nimbus Health',    'M&A',   'Diligence',   'Signed',      'Sell-side', 'Healthcare',      180, 50000, 1.75, current_date + 75,  'Neha Jain',    'https://example.com/nimbus.pdf', 'Founders open to strategic exit; EBITDA ~12M. 3 strategics engaged.'),
  ('Arclight Capital', 'PE/VC', 'Origination', 'Pending',     'Buy-side',  'Infrastructure',  120, null,  2.00, current_date + 120, 'Rohan Gupta',  null,                             'Early conversations. Thesis fit on Series B infra.'),
  ('Quantum Edge',     'ECM',   'Marketing',   'Signed',      'Sell-side', 'Fintech',         250, 75000, 2.50, current_date + 60,  'Arjun Mehta',  'https://example.com/qedge.pdf',  'Pre-IPO roadshow kicking off Q2. Anchor investor list being built.'),
  ('Helios Infra',     'DCM',   'Closed',      'Signed',      'Sell-side', 'Infrastructure',  150, 40000, 0.80, current_date - 15,  'Rishi Kapoor', 'https://example.com/helios.pdf', 'INR 1,200 Cr bond issuance closed last week. AA+ rated.'),
  ('LumenAI',          'PE/VC', 'On Hold',     'Signed',      'Sell-side', 'Consumer Tech',    45, 25000, 3.00, current_date + 180, 'Vikram Patel', null,                             'Waiting on updated financials before next round.'),
  ('Kavya Foods',      'M&A',   'Pitch',       'Not Required','Sell-side', 'Consumer',         80, null,  2.00, current_date + 150, 'Priya Sharma', null,                             'Family business — first contact made. Promoter open to partial exit.'),
  ('Meridian EdTech',  'PE/VC', 'Negotiation', 'Signed',      'Sell-side', 'EdTech',           35, 20000, 3.50, current_date + 90,  'Ananya Roy',   null,                             'Series C mandate. 5 funds in diligence. Shortlist of 2.'),
  ('Polaris Energy',   'DCM',   'Preparation','Signed',       'Sell-side', 'Energy',          200, 60000, 1.25, current_date + 50,  'Karan Singh',  null,                             'USD notes issuance. Investor docs in final review.'),
  ('Veda Biotech',     'M&A',   'Mandate',     'Signed',      'Sell-side', 'Healthcare',       65, 30000, 2.75, current_date + 110, 'Neha Jain',    null,                             'Engagement letter signed last week. Teaser drafting in progress.'),
  ('Orion Realty',     'PE/VC', 'Closing',     'Signed',      'Buy-side',  'Real Estate',     320, 80000, 1.50, current_date + 30,  'Vikram Patel', null,                             'Term sheet agreed. Final SPA negotiations.'),
  ('Zenith Payments',  'M&A',   'Lost',        'Signed',      'Sell-side', 'Fintech',          90, 35000, 2.50, current_date - 45,  'Arjun Mehta',  null,                             'Competing process won by regional boutique. Maintain relationship.');

insert into public.contacts (deal_id, name, email, phone, company, role, notes)
select d.id, v.name, v.email, v.phone, v.company, v.role, v.notes from public.deals d
join (values
  ('Nimbus Health',    'Rohit Bansal',      'rohit@nimbushealth.com',     '+91 98200 12345', 'Nimbus Health',            'Founder / CEO',       'Primary decision-maker. Strong preference for strategic buyer.'),
  ('Nimbus Health',    'Meera Krishnan',    'meera@nimbushealth.com',     '+91 98200 12346', 'Nimbus Health',            'CFO',                 'Running diligence responses.'),
  ('Arclight Capital', 'Serena D''Souza',   'serena@arclightcap.com',     '+44 20 7946 0101','Arclight Capital',         'Fund Partner',        'London-based. Leads infra investments.'),
  ('Quantum Edge',     'Aditya Mehra',      'aditya@quantumedge.co',      null,              'Quantum Edge',             'Founder / CEO',       'Pre-IPO mandate. Wants anchor book done by end of quarter.'),
  ('Meridian EdTech',  'Vikas Subramanian', 'vikas@meridianedu.com',      '+91 98100 76543', 'Meridian EdTech',          'Founder',             'Flexible on structure, valuation-focused.'),
  ('Meridian EdTech',  'Priyanka Shah',     'priyanka@globalcap.com',     null,              'Global Capital Advisors',  'Buy-side Advisor',    'Representing lead investor.'),
  ('Orion Realty',     'Mark Rutherford',   'mark@orionrealty.co.uk',     '+44 20 7946 0200','Orion Realty',             'Managing Director',   'London HQ. UK REIT transaction.')
) as v(client, name, email, phone, company, role, notes)
on v.client = d.client_name;

insert into public.activities (deal_id, kind, body)
select d.id, v.kind, v.body from public.deals d
join (values
  ('Nimbus Health',    'created',     'Mandate originated by Neha Jain.'),
  ('Nimbus Health',    'nda_signed',  'Mutual NDA executed with 3 strategic buyers.'),
  ('Nimbus Health',    'teaser_sent', 'Teaser circulated to shortlist of 8.'),
  ('Nimbus Health',    'meeting',     'Management presentation to Asian Hospital Group.'),
  ('Nimbus Health',    'note',        'Founders aligned on price range $170–200M EV.'),
  ('Quantum Edge',     'created',     'Mandate originated by Arjun Mehta.'),
  ('Quantum Edge',     'nda_signed',  'Anchor-investor NDAs collected.'),
  ('Quantum Edge',     'teaser_sent', 'Roadshow deck shared with 12 institutional investors.'),
  ('Meridian EdTech',  'stage_change','Progressed to Negotiation — LOIs received from 2 funds.')
) as v(client, kind, body)
on v.client = d.client_name;

insert into public.documents (title, content, tags, sector) values
  ('M&A Process Playbook',
   'End-to-end M&A workflow used across Valence engagements: mandate, teaser, NDA, IM, management presentations, LOI, diligence, SPA, close. Emphasizes synchronized buy- and sell-side hygiene and data room discipline.',
   ARRAY['playbook','M&A','process'], 'General'),
  ('ECM Roadshow Framework',
   'Standard roadshow cadence for IPO/FPO mandates: anchor meetings, institutional one-on-ones, retail syndicate alignment. Includes messaging pillars and Q&A prep templates.',
   ARRAY['ECM','roadshow','IPO'], 'Capital Markets'),
  ('Healthcare Sector Memo — Q1',
   'Thesis: consolidation wave across hospital chains + diagnostics. Key tailwinds: insurance penetration, medical tourism, specialty clinic roll-ups. Watchlist included.',
   ARRAY['thesis','healthcare'], 'Healthcare'),
  ('BFSI Deal Note Template',
   'Standard internal note structure for BFSI mandates: regulatory context, capital adequacy snapshot, portfolio quality, growth levers, comparable transactions.',
   ARRAY['template','BFSI'], 'BFSI'),
  ('NDA — Sell-side Standard',
   'Valence standard sell-side NDA. Mutual, 2-year tail, carve-outs for pre-existing knowledge and regulator disclosure.',
   ARRAY['legal','template','NDA'], 'Legal'),
  ('DCM Pricing Reference',
   'Reference grid for recent INR corporate bond issuances by rating band. Use as starting benchmark for indicative pricing discussions with issuers.',
   ARRAY['DCM','pricing','reference'], 'Capital Markets');

insert into public.tasks (title, due_date, completed) values
  ('Follow up with Nimbus Health founders',     current_date,                false),
  ('Review Arclight teaser v2',                  current_date,                false),
  ('Circulate Helios close memo internally',     current_date + 1,            false),
  ('Prep Q&A for Quantum Edge roadshow',         current_date + 2,            false);

insert into public.meetings (title, date, time, attendee_name, attendee_email, status) values
  ('Nimbus Health — management update',   current_date, '11:00', 'Rohit Bansal',    'rohit@nimbushealth.com',   'Confirmed'),
  ('Arclight Capital — thesis review',    current_date, '15:30', 'Serena D''Souza', 'serena@arclightcap.com',   'Proposed');

insert into public.comps (target, acquirer, year, sector, deal_type, ev_usd_m, revenue_multiple, ebitda_multiple, notes) values
  ('CareHub Diagnostics',   'Asian Hospital Group',   2024, 'Healthcare',      'M&A',   420,  3.8, 14.2, 'Strategic roll-up. 65-clinic footprint.'),
  ('NorthStar Fintech',     'Everlast PE',             2024, 'Fintech',         'PE/VC', 680,  8.5, null, 'Series D at $680M EV. 2x jump from prior round.'),
  ('Greenline Power',       'Sovereign Infra Fund',    2023, 'Energy',          'M&A',  1250,  2.1, 11.4, '60% stake. Regulated utility, stable cashflows.'),
  ('LearnKart',             'Global EdTech PLC',       2024, 'EdTech',          'M&A',   290,  6.2, null, 'Cross-border. Primarily India + SEA footprint.'),
  ('Maple Consumer Brands', 'Regional Strategics Ltd', 2023, 'Consumer',        'M&A',   185,  2.4, 12.8, 'Premium staples. Founder 2-year lock-in.'),
  ('Artemis Infra Bonds',   null,                      2024, 'Infrastructure',  'DCM',   500,  null, null, '10Y INR bonds. 7.85% coupon. AAA rated.');
