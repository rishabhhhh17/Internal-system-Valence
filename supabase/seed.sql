-- ValenceOS — rich demo data.
-- Re-runnable: clears the demo rows first (by known client_name / title) then
-- reinserts. Safe to run multiple times. Preserves any real data you've added.

-- ============ CLEAR demo rows ============
delete from public.deals where client_name in (
  'Nimbus Health','Arclight Capital','Quantum Edge','Helios Infra','LumenAI',
  'Kavya Foods','Meridian EdTech','Polaris Energy','Veda Biotech','Orion Realty',
  'Zenith Payments','Aster Logistics','Solstice Financial','Crescent Pharma',
  'Nordwind Aviation','Indus Semiconductors','Falcon Defence','Saffron Retail',
  'Lattice Cloud','Meridian Hospitality','Mirage Renewables','Sentinel Cyber',
  'Coastline Shipping','Opal Luxury','Vanguard BioPharma','Terraform Agri',
  'Pinnacle Realty Trust','Cobalt Mining','Celeste Jewellers','Radiant Media'
);
delete from public.documents where title in (
  'M&A Process Playbook','ECM Roadshow Framework','Healthcare Sector Memo — Q1',
  'BFSI Deal Note Template','NDA — Sell-side Standard','DCM Pricing Reference',
  'Healthcare M&A Playbook','Fintech Sector Thesis 2026','Infrastructure Capital Stack Primer',
  'EdTech Consolidation Landscape','PE/VC Term Sheet Checklist','LOI Template — Sell-side',
  'Engagement Letter Template','Valence Credentials Slide','Consumer Sector Primer',
  'Renewable Energy Mandate Playbook','Regulatory Primer — SEBI for M&A','Comparable Company Analysis Framework'
);
delete from public.comps where target in (
  'CareHub Diagnostics','NorthStar Fintech','Greenline Power','LearnKart',
  'Maple Consumer Brands','Artemis Infra Bonds','Silverline Healthcare','Aurora Payments',
  'Sparrow Logistics','Beacon EdTech','Redwood REIT','Clearwave Cyber','Pioneer Renewables',
  'Heritage Hospitality','Quantum Biotech'
);

-- Clean orphaned knowledge_chunks (chunks whose source row was deleted in a
-- previous run). Without this, repeated seed runs leave duplicate results in
-- the Ask / Search tabs.
delete from public.knowledge_chunks
where (source_type = 'document'  and source_id not in (select id from public.documents))
   or (source_type = 'comp'      and source_id not in (select id from public.comps))
   or (source_type = 'deal'      and source_id not in (select id from public.deals))
   or (source_type = 'file'      and source_id not in (select id from public.knowledge_files))
   or (source_type = 'deal_file' and source_id not in (select id from public.deal_files));

-- ============ DEALS ============
insert into public.deals
  (client_name, deal_type, stage, nda_status, side, sector, ticket_size_usd_m, fee_retainer_usd, fee_success_pct, target_close, lead_owner, deck_url, notes, created_at)
values
  ('Nimbus Health',          'M&A',   'Mandate',   'Signed',       'Sell-side','Healthcare',     180, 50000, 1.75, current_date + 75,  'Neha Jain',    'https://example.com/nimbus.pdf',  'Founders open to strategic exit; EBITDA ~12M. 3 strategics engaged.',                         now() - interval '42 days'),
  ('Arclight Capital',       'PE/VC', 'Origination', 'Pending',      'Buy-side', 'Infrastructure', 120, null,  2.00, current_date + 120, 'Rohan Gupta',  null,                              'Early conversations. Thesis fit on Series B infra.',                                          now() - interval '9 days'),
  ('Quantum Edge',           'ECM',   'Mandate',   'Signed',       'Sell-side','Fintech',        250, 75000, 2.50, current_date + 60,  'Arjun Mehta',  'https://example.com/qedge.pdf',   'Pre-IPO roadshow kicking off Q2. Anchor investor list being built. 12 one-on-ones scheduled.', now() - interval '60 days'),
  ('Helios Infra',           'DCM',   'Closed',      'Signed',       'Sell-side','Infrastructure', 150, 40000, 0.80, current_date - 15,  'Rishi Kapoor', 'https://example.com/helios.pdf',  'INR 1,200 Cr bond issuance closed last week. AA+ rated. Oversubscribed 2.3x.',                now() - interval '95 days'),
  ('LumenAI',                'PE/VC', 'On Hold',     'Signed',       'Sell-side','Consumer Tech',   45, 25000, 3.00, current_date + 180, 'Vikram Patel', null,                              'Waiting on updated financials before next round. Founders may raise internally.',              now() - interval '50 days'),
  ('Kavya Foods',            'M&A',   'Pitching',       'Not Required', 'Sell-side','Consumer',        80, null,  2.00, current_date + 150, 'Priya Sharma', null,                              'Family business — first contact made. Promoter open to partial exit.',                        now() - interval '7 days'),
  ('Meridian EdTech',        'PE/VC', 'Mandate', 'Signed',       'Sell-side','EdTech',          35, 20000, 3.50, current_date + 90,  'Ananya Roy',   null,                              'Series C. 5 funds in diligence; shortlist of 2. LOIs expected next week.',                     now() - interval '55 days'),
  ('Polaris Energy',         'DCM',   'Mandate', 'Signed',       'Sell-side','Energy',         200, 60000, 1.25, current_date + 50,  'Karan Singh',  null,                              'USD notes issuance. Investor docs in final review. Moody''s rating meeting scheduled.',        now() - interval '28 days'),
  ('Veda Biotech',           'M&A',   'Mandate',     'Signed',       'Sell-side','Healthcare',      65, 30000, 2.75, current_date + 110, 'Neha Jain',    null,                              'Engagement letter signed last week. Teaser drafting in progress.',                             now() - interval '12 days'),
  ('Orion Realty',           'PE/VC', 'Mandate',     'Signed',       'Buy-side', 'Real Estate',    320, 80000, 1.50, current_date + 30,  'Vikram Patel', null,                              'Term sheet agreed. Final SPA negotiations. Expected close end of month.',                      now() - interval '110 days'),
  ('Zenith Payments',        'M&A',   'Lost',        'Signed',       'Sell-side','Fintech',         90, 35000, 2.50, current_date - 45,  'Arjun Mehta',  null,                              'Competing process won by regional boutique. Maintain relationship.',                           now() - interval '140 days'),
  ('Aster Logistics',        'M&A',   'Mandate',   'Signed',       'Sell-side','Logistics',      110, 40000, 2.00, current_date + 85,  'Rohan Gupta',  null,                              'Pan-India last-mile network. 3 strategic acquirers in deep diligence.',                        now() - interval '35 days'),
  ('Solstice Financial',     'ECM',   'Mandate', 'Signed',       'Sell-side','BFSI',           450, 120000,2.25, current_date + 70,  'Rishi Kapoor', null,                              'Rights issue for capital adequacy. DRHP under SEBI review.',                                   now() - interval '22 days'),
  ('Crescent Pharma',        'M&A',   'Mandate',   'Signed',       'Sell-side','Healthcare',      75, 30000, 2.50, current_date + 95,  'Neha Jain',    null,                              'Speciality generics. Teaser out to 14 strategic + 6 financial. 9 NDAs signed so far.',         now() - interval '38 days'),
  ('Nordwind Aviation',      'PE/VC', 'Mandate',     'Signed',       'Sell-side','Transport',      140, 50000, 2.50, current_date + 130, 'Karan Singh',  null,                              'Regional airline. Carve-out of MRO subsidiary. Engagement just signed.',                       now() - interval '6 days'),
  ('Indus Semiconductors',   'PE/VC', 'Mandate', 'Signed',       'Buy-side', 'Technology',     220, 55000, 2.00, current_date + 40,  'Vikram Patel', null,                              'Mid-cap fabless designer. LOI at $220M EV. Confirmatory diligence in flight.',                 now() - interval '65 days'),
  ('Falcon Defence',         'M&A',   'Origination', 'Pending',      'Sell-side','Defence',         95, null,  null, null,               'Rohan Gupta',  null,                              'Government approval pre-clearance needed. Early soundings with strategic primes.',             now() - interval '4 days'),
  ('Saffron Retail',         'ECM',   'Mandate',   'Signed',       'Sell-side','Consumer',       165, 60000, 2.25, current_date + 55,  'Priya Sharma', null,                              'D2C lifestyle brand IPO. Anchor book 60% covered.',                                            now() - interval '40 days'),
  ('Lattice Cloud',          'PE/VC', 'Mandate',   'Signed',       'Sell-side','Technology',      80, 30000, 3.00, current_date + 100, 'Ananya Roy',   null,                              'SaaS DevOps. 3 PE firms in VDR. Q&A round 2 this week.',                                       now() - interval '30 days'),
  ('Meridian Hospitality',   'M&A',   'Pitching',       'Not Required', 'Sell-side','Hospitality',     55, null,  2.50, current_date + 160, 'Neha Jain',    null,                              'Boutique hotel chain. Second pitch with family office next Monday.',                           now() - interval '5 days'),
  ('Mirage Renewables',      'DCM',   'Mandate',     'Signed',       'Sell-side','Energy',         300, 95000, 1.00, current_date + 20,  'Rishi Kapoor', null,                              'Green bond issuance. Regulatory clearance done. Final syndication.',                           now() - interval '88 days'),
  ('Sentinel Cyber',         'PE/VC', 'Mandate',   'Signed',       'Sell-side','Cybersecurity',   45, 20000, 3.50, current_date + 80,  'Arjun Mehta',  null,                              'Series B round. Teaser shared with 18 funds. Management roadshow starts next week.',           now() - interval '20 days'),
  ('Coastline Shipping',     'DCM',   'Mandate', 'Signed',       'Sell-side','Logistics',      180, 45000, 1.00, current_date + 65,  'Karan Singh',  null,                              'Ship-finance backed bonds. Underwriter commitment letters in draft.',                          now() - interval '25 days'),
  ('Opal Luxury',            'M&A',   'Origination', 'Pending',      'Buy-side', 'Consumer',       160, null,  2.00, current_date + 170, 'Priya Sharma', null,                              'Searching for premium jewellery target for global consumer fund. Long-list building.',         now() - interval '11 days'),
  ('Vanguard BioPharma',     'ECM',   'Mandate',     'Signed',       'Sell-side','Healthcare',     400, 100000,2.00, current_date + 105, 'Neha Jain',    null,                              'Pre-IPO. Prospectus drafting kicking off. US listing under consideration.',                    now() - interval '14 days'),
  ('Terraform Agri',         'PE/VC', 'On Hold',     'Signed',       'Sell-side','AgriTech',        25, 12000, 4.00, null,               'Ananya Roy',   null,                              'Paused pending monsoon impact assessment. Expect to reactivate in Q3.',                        now() - interval '80 days'),
  ('Pinnacle Realty Trust',  'DCM',   'Mandate',   'Signed',       'Sell-side','Real Estate',    240, 70000, 1.20, current_date + 60,  'Vikram Patel', null,                              'REIT follow-on debt round. Portfolio coverage due diligence by S&P.',                          now() - interval '33 days'),
  ('Cobalt Mining',          'M&A',   'Closed',      'Signed',       'Sell-side','Energy',         190, 55000, 2.25, current_date - 30,  'Karan Singh',  null,                              'Critical minerals miner acquired by integrated metals group. SPA executed, payment received.', now() - interval '150 days'),
  ('Celeste Jewellers',      'M&A',   'Pitching',       'Not Required', 'Sell-side','Consumer',        42, null,  2.50, current_date + 120, 'Priya Sharma', null,                              'Regional jeweller exploring PE investment. Pitch book in final draft.',                        now() - interval '3 days'),
  ('Radiant Media',          'PE/VC', 'Mandate', 'Signed',       'Sell-side','Media',           68, 25000, 3.00, current_date + 45,  'Ananya Roy',   null,                              'Digital media rollup candidate. LOI received at $68M EV. Negotiating earn-out structure.',     now() - interval '48 days');

-- ============ COUNTERPARTIES ============
insert into public.contacts (deal_id, name, email, phone, company, role, notes, created_at)
select d.id, v.name, v.email, v.phone, v.company, v.role, v.notes, now() - (v.ago || ' days')::interval from public.deals d
join (values
  ('Nimbus Health',        'Rohit Bansal',      'rohit@nimbushealth.com',       '+91 98200 12345',   'Nimbus Health',           'Founder / CEO',      'Primary decision-maker. Prefers strategic buyer.', 35),
  ('Nimbus Health',        'Meera Krishnan',    'meera@nimbushealth.com',       '+91 98200 12346',   'Nimbus Health',           'CFO',                'Running diligence responses.',                      30),
  ('Nimbus Health',        'Amit Dua',          'amit.dua@asianhospital.co',    null,                'Asian Hospital Group',    'Strategy Director',  'Active acquirer. Deep pockets.',                    18),
  ('Arclight Capital',     'Serena D''Souza',   'serena@arclightcap.com',       '+44 20 7946 0101',  'Arclight Capital',        'Fund Partner',       'London-based. Leads infra investments.',           9),
  ('Quantum Edge',         'Aditya Mehra',      'aditya@quantumedge.co',        '+91 99100 55522',   'Quantum Edge',            'Founder / CEO',      'Pre-IPO. Wants anchor book done by quarter-end.',  55),
  ('Quantum Edge',         'Pooja Iyer',        'pooja@quantumedge.co',         null,                'Quantum Edge',            'CFO',                'Oversees investor relations.',                     45),
  ('Meridian EdTech',      'Vikas Subramanian', 'vikas@meridianedu.com',        '+91 98100 76543',   'Meridian EdTech',         'Founder',            'Flexible on structure, valuation-focused.',         54),
  ('Meridian EdTech',      'Priyanka Shah',     'priyanka@globalcap.com',       null,                'Global Capital Advisors', 'Buy-side Advisor',   'Representing lead investor.',                      22),
  ('Orion Realty',         'Mark Rutherford',   'mark@orionrealty.co.uk',       '+44 20 7946 0200',  'Orion Realty',            'Managing Director',  'London HQ. UK REIT transaction.',                 105),
  ('Aster Logistics',      'Ganesh Iyer',       'ganesh@asterlogistics.in',     '+91 98454 00911',   'Aster Logistics',         'CEO',                'Founder. Running operations + strategy.',          34),
  ('Aster Logistics',      'Catherine Wong',    'cwong@strategicapac.com',      null,                'Strategic APAC Holdings', 'Corp Dev Lead',      'Active strategic acquirer in logistics.',          20),
  ('Solstice Financial',   'Reshma Bhatia',     'reshma@solstice.fin',          '+91 98201 00234',   'Solstice Financial',      'CFO',                'Leads the capital raise committee.',               21),
  ('Crescent Pharma',      'Arvind Kulkarni',   'arvind@crescentpharma.in',     '+91 98213 99990',   'Crescent Pharma',         'Managing Director',  'Founder-MD. Open to partial exit.',                36),
  ('Nordwind Aviation',    'Olaf Lindqvist',    'olaf@nordwind.aero',           null,                'Nordwind Aviation',       'Group CEO',          'Carve-out discussion lead.',                        6),
  ('Indus Semiconductors', 'Rakesh Talwar',     'rakesh@indussemi.com',         '+91 80400 12221',   'Indus Semiconductors',    'CEO',                'Fabless designer. Advising acquirer.',             58),
  ('Indus Semiconductors', 'Erik Johansson',    'erik@cirrusfund.com',          null,                'Cirrus PE',               'Partner',            'Buyer-side lead partner. Nordic mid-cap fund.',    62),
  ('Saffron Retail',       'Ishita Verma',      'ishita@saffronretail.in',      '+91 99672 44100',   'Saffron Retail',          'Founder / CEO',      'Brand founder. Strong consumer storytelling.',     39),
  ('Lattice Cloud',        'Nikhil Rao',        'nikhil@latticecloud.io',       '+91 80111 22233',   'Lattice Cloud',           'Co-founder / CTO',   'Technical co-founder. Leads VDR.',                 28),
  ('Sentinel Cyber',       'Aman Bhatia',       'aman@sentinelcyber.io',        '+91 98111 66555',   'Sentinel Cyber',          'CEO',                'Early-stage founder.',                             19),
  ('Vanguard BioPharma',   'Shalini Nair',      'shalini@vanguardbio.com',      '+91 98400 55667',   'Vanguard BioPharma',      'CFO',                'US listing coordination.',                         13),
  ('Pinnacle Realty Trust','James Whitaker',    'james@pinnacletrust.com',      '+65 6808 1200',     'Pinnacle Realty Trust',   'Head of Treasury',   'Runs the capital markets function.',               30),
  ('Radiant Media',        'Nitika Oberoi',     'nitika@radiantmedia.in',       null,                'Radiant Media',           'Founder / CEO',      'Running sell-side process.',                       45)
) as v(client, name, email, phone, company, role, notes, ago)
on v.client = d.client_name;

-- ============ ACTIVITY LOG ============
insert into public.activities (deal_id, kind, body, created_at)
select d.id, v.kind, v.body, now() - (v.ago || ' days')::interval from public.deals d
join (values
  -- Nimbus
  ('Nimbus Health',    'created',      'Mandate originated by Neha Jain.', 42),
  ('Nimbus Health',    'nda_signed',   'Mutual NDA executed with 3 strategic buyers.', 35),
  ('Nimbus Health',    'teaser_sent',  'Teaser circulated to shortlist of 8.', 30),
  ('Nimbus Health',    'meeting',      'Management presentation to Asian Hospital Group.', 18),
  ('Nimbus Health',    'note',         'Founders aligned on price range $170M-200M EV.', 14),
  ('Nimbus Health',    'stage_change', 'Marketing → Diligence', 10),
  ('Nimbus Health',    'file_upload',  'IM: Nimbus Health v3.pdf', 9),
  -- Quantum Edge
  ('Quantum Edge',     'created',      'Mandate originated by Arjun Mehta.', 60),
  ('Quantum Edge',     'nda_signed',   'Anchor-investor NDAs collected.', 50),
  ('Quantum Edge',     'teaser_sent',  'Roadshow deck shared with 12 institutional investors.', 40),
  ('Quantum Edge',     'meeting',      'Anchor one-on-one — Fidelity.', 12),
  ('Quantum Edge',     'meeting',      'Anchor one-on-one — T. Rowe.', 9),
  ('Quantum Edge',     'note',         'Price band narrowed to INR 480-520.', 4),
  -- Meridian EdTech
  ('Meridian EdTech',  'created',      'Mandate originated by Ananya Roy.', 55),
  ('Meridian EdTech',  'stage_change', 'Diligence → Negotiation — LOIs received from 2 funds.', 7),
  ('Meridian EdTech',  'note',         'LOI shortlist: Global Capital and Accel. Indicative $270M and $295M.', 5),
  -- Helios Infra (closed)
  ('Helios Infra',     'created',      'Mandate originated.', 95),
  ('Helios Infra',     'stage_change', 'Marketing → Diligence', 60),
  ('Helios Infra',     'stage_change', 'Diligence → Negotiation', 40),
  ('Helios Infra',     'stage_change', 'Negotiation → Closing', 20),
  ('Helios Infra',     'stage_change', 'Closing → Closed', 15),
  ('Helios Infra',     'note',         'Oversubscribed 2.3x. Strong performance.', 14),
  -- Aster Logistics
  ('Aster Logistics',  'created',      'Mandate originated.', 35),
  ('Aster Logistics',  'teaser_sent',  'Teaser shared with 11 strategic acquirers.', 28),
  ('Aster Logistics',  'nda_signed',   'NDAs signed by Strategic APAC + 2 others.', 22),
  ('Aster Logistics',  'meeting',      'Strategic APAC site visit at Delhi hub.', 9),
  -- Crescent Pharma
  ('Crescent Pharma',  'created',      'Mandate originated by Neha Jain.', 38),
  ('Crescent Pharma',  'teaser_sent',  'Teaser released to 20 targets.', 32),
  ('Crescent Pharma',  'nda_signed',   '9 NDAs signed.', 26),
  -- Indus Semi
  ('Indus Semiconductors', 'created',      'Buy-side mandate originated.', 65),
  ('Indus Semiconductors', 'meeting',      'Management meet with Indus Semi team.', 42),
  ('Indus Semiconductors', 'note',         'Cirrus submitted non-binding LOI at $210M EV.', 20),
  ('Indus Semiconductors', 'stage_change', 'Diligence → Negotiation', 8),
  -- Lattice Cloud
  ('Lattice Cloud',    'created',      'Mandate originated.', 30),
  ('Lattice Cloud',    'nda_signed',   '3 PE firms executed NDAs.', 24),
  ('Lattice Cloud',    'meeting',      'Management Q&A round 1.', 15),
  -- Sentinel Cyber
  ('Sentinel Cyber',   'created',      'Series B mandate originated.', 20),
  ('Sentinel Cyber',   'teaser_sent',  'Teaser shared with 18 funds.', 14),
  -- Orion Realty
  ('Orion Realty',     'created',      'Buy-side mandate originated.', 110),
  ('Orion Realty',     'stage_change', 'Negotiation → Closing', 12),
  -- Zenith (lost)
  ('Zenith Payments',  'created',      'Mandate originated.', 140),
  ('Zenith Payments',  'stage_change', 'Marketing → Lost', 45),
  ('Zenith Payments',  'note',         'Competing process won by regional boutique. Relationship maintained.', 44)
) as v(client, kind, body, ago)
on v.client = d.client_name;

-- ============ DOCUMENTS (richer memos so Ask tab returns substantive answers) ============
insert into public.documents (title, content, tags, sector, created_at) values
  ('M&A Process Playbook',
   'The Valence sell-side M&A process runs through eight stages: mandate signing, teaser preparation, NDA and buyer outreach, IM distribution, first-round indicative offers, shortlisting for management presentations, confirmatory diligence and LOI, final negotiation and SPA, and closing. Each stage has an owner, a documentation standard, and a review gate. The IM is the single most important marketing document; every factual claim in it must be footnoted to a source in the data room. Buyer outreach lists are segmented into strategic, financial, and stretch, with tailored teasers per segment.',
   ARRAY['playbook','M&A','process'], 'General', now() - interval '120 days'),
  ('Healthcare M&A Playbook',
   'Healthcare mandates at Valence require an extra regulatory pre-screen: FDA-equivalent approvals in target geographies, drug price control exposure, and pending litigation disclosures. Valuation drivers typically include a sum-of-parts view, with generics and specialty arms valued separately. EBITDA normalisation must strip out one-time R&D spikes and pricing concessions. Indian hospital chains typically trade at 12-16x forward EBITDA, while speciality pharma is wider — 14-22x depending on pipeline.',
   ARRAY['playbook','Healthcare','M&A'], 'Healthcare', now() - interval '90 days'),
  ('Healthcare Sector Memo — Q1',
   'Thesis: consolidation wave across hospital chains and diagnostics, driven by insurance penetration growth, medical tourism tailwinds, and fragmented ownership. We see three themes worth investing behind: specialty clinic roll-ups, diagnostics chain integration, and tier-2 city hospital platforms. Watchlist includes eight targets currently in active conversations. Pricing benchmarks: 14x forward EBITDA on average, 18x for high-acuity specialty plays.',
   ARRAY['thesis','Healthcare','Q1'], 'Healthcare', now() - interval '75 days'),
  ('Fintech Sector Thesis 2026',
   'India fintech is bifurcating into two camps: payments infrastructure (compressed margins but scale) and embedded finance (higher margins, narrower distribution). 2026 will be defined by the first meaningful consolidation between wallets and lending platforms. UPI as plumbing has commoditised the transaction layer; value is migrating up-stack to underwriting, collections, and SME credit. Pre-IPO pricing has reset from 2022 peaks; current benchmarks cluster at 6-9x forward revenue.',
   ARRAY['thesis','Fintech'], 'Fintech', now() - interval '40 days'),
  ('ECM Roadshow Framework',
   'Standard roadshow cadence for IPO and FPO mandates: anchor investor one-on-ones in week one, institutional group meetings in week two, retail syndicate alignment in week three. Messaging pillars are locked in a two-page brief shared with all participants. Q&A prep covers fifteen standard questions drawn from the last ten IPO roadshows. Every one-on-one produces a follow-up memo within 24 hours.',
   ARRAY['ECM','roadshow','IPO','playbook'], 'Capital Markets', now() - interval '85 days'),
  ('Infrastructure Capital Stack Primer',
   'Typical infrastructure transaction capital stacks in India: 65-75% senior debt (banks + bonds), 15-20% mezzanine or subordinated debt, 10-15% equity. For greenfield assets equity requirement rises to 25-30%. Tenor is matched to asset life — 15-20 year bonds for power and roads, 20-25 year for ports. AAA issuers price at G-sec + 75-100 bps; AA+ at G-sec + 110-140 bps.',
   ARRAY['DCM','infrastructure','reference'], 'Capital Markets', now() - interval '110 days'),
  ('EdTech Consolidation Landscape',
   'Post-2022 correction, the EdTech category has rationalised into three credible platforms in K-12, two in test-prep, and a long tail of niche upskilling firms. M&A activity is accelerating: five transactions above $100M closed in 2025. We expect 2026 to see a further 8-10 transactions as independent players run out of runway. Sector pricing: 5-7x forward revenue for growth-stage; 10-14x for profitable scaled platforms.',
   ARRAY['thesis','EdTech','consolidation'], 'EdTech', now() - interval '30 days'),
  ('PE/VC Term Sheet Checklist',
   'Non-negotiables on the Valence side: anti-dilution framing as broad-based weighted-average, not full ratchet. Liquidation preference capped at 1x non-participating unless there is a distressed context. Board composition with founder-favourable tie-breaks. Drag-along triggers tied to time + minimum price, not solely investor discretion. Information rights quarterly (not monthly) for non-lead investors.',
   ARRAY['template','PE','VC','legal'], 'Legal', now() - interval '150 days'),
  ('NDA — Sell-side Standard',
   'Mutual, 2-year tail. Carve-outs for pre-existing knowledge and regulator-mandated disclosure. Permitted recipients limited to employees and advisors with need-to-know. Clean team required when buyer is a direct competitor. Return-or-destroy obligation on request. Governed by the laws of England & Wales for cross-border, Indian law for domestic.',
   ARRAY['legal','template','NDA'], 'Legal', now() - interval '180 days'),
  ('LOI Template — Sell-side',
   'Key elements: indicative EV range with clearly stated basis (cash-free, debt-free, normalised working capital). Exclusivity window typically 45-60 days. Price reset mechanisms tied to material adverse change — narrowly defined. Diligence workstreams listed with target completion dates. No financing contingency unless explicitly agreed upfront.',
   ARRAY['template','legal','LOI'], 'Legal', now() - interval '170 days'),
  ('Engagement Letter Template',
   'Standard Valence engagement structure: retainer drawn monthly, success fee percentage declines in brackets (higher % for smaller deals). Tail period of 18 months on any counterparty introduced during the mandate. Mutual termination for cause; sole discretion termination requires 30-day notice. Expenses billed at cost with pre-approval above $5,000.',
   ARRAY['template','legal'], 'Legal', now() - interval '200 days'),
  ('DCM Pricing Reference',
   'Reference grid for INR corporate bond issuances by rating band. AAA 10Y benchmark spread: 85-100 bps. AA+ 10Y: 115-135 bps. AA 10Y: 150-175 bps. A+ and below require enhanced investor education and often partial credit guarantees. Benchmark G-sec is 10Y for corporate bonds, 5Y for shorter-dated commercial paper. Watch for liquidity premium shifts quarter-over-quarter.',
   ARRAY['DCM','pricing','reference'], 'Capital Markets', now() - interval '95 days'),
  ('Consumer Sector Primer',
   'India consumer is a three-speed market: premium (growing 18-22% CAGR, small base), mass-premium (12-14% CAGR, dominant volume), and value (6-8% CAGR, structurally pressured). Brand premiums remain defensible if the brand has pricing power and omni-channel presence. D2C brands trading at 3-5x revenue if scaled past $25M; strategic acquirers increasingly active.',
   ARRAY['thesis','Consumer'], 'Consumer', now() - interval '55 days'),
  ('Renewable Energy Mandate Playbook',
   'Renewables mandates require upfront diligence on PPA tariff economics, land title, connectivity assurance, and equipment supplier warranties. Valuation is enterprise-value-to-MW for operating assets (benchmark: $0.9-1.2M per MW for solar, $1.4-1.7M for wind, higher for hybrid). Development-stage assets discount by 30-50% depending on execution risk.',
   ARRAY['playbook','Energy','Renewables'], 'Energy', now() - interval '65 days'),
  ('Regulatory Primer — SEBI for M&A',
   'SEBI compliance checkpoints for listed-company M&A: Regulation 10 takeover exemption tests, Regulation 23 related-party procedure, Regulation 30 disclosure timing (within 24 hours of unambiguous decisions), and SEBI PIT Regulations for insider-trading windows. Open-offer triggers at 25% voting rights or 5% creeping acquisition in any financial year.',
   ARRAY['regulatory','SEBI','M&A'], 'Legal', now() - interval '100 days'),
  ('BFSI Deal Note Template',
   'Standard internal note structure for BFSI mandates: regulatory context (RBI, SEBI, IRDAI as applicable), capital adequacy snapshot (CAR, Tier 1, leverage ratio), portfolio quality (GNPA, NNPA, SMA book), growth levers (distribution, product mix, geography), and comparable transactions within 24 months.',
   ARRAY['template','BFSI'], 'BFSI', now() - interval '125 days'),
  ('Valence Credentials Slide',
   'Valence Growth Partners is a global investment advisory firm with offices in Mumbai and London. We advise founders on capital raises, strategic sales, and cross-border transactions across M&A, ECM, DCM, and PE/VC. Our senior team has closed over $X billion of transactions across India, the UK, and select emerging markets. We work exclusively on mandates where we can be senior-person-in-the-room.',
   ARRAY['credentials','firm'], 'General', now() - interval '365 days'),
  ('Comparable Company Analysis Framework',
   'Valence comp analysis standard: select 5-8 peers per target based on geography, size band, product mix, and margin profile. Trim outliers that trade on distressed or special-situation narratives. Use forward EBITDA multiples as primary metric; revenue multiples only for high-growth SaaS and consumer brands. Always sanity-check against most recent precedent transaction multiples in the comps library.',
   ARRAY['framework','valuation'], 'General', now() - interval '160 days');

-- ============ COMPS ============
insert into public.comps (target, acquirer, year, sector, deal_type, ev_usd_m, revenue_multiple, ebitda_multiple, notes, created_at) values
  ('CareHub Diagnostics',     'Asian Hospital Group',     2024, 'Healthcare',      'M&A',    420, 3.8,  14.2, 'Strategic roll-up. 65-clinic footprint.',                                   now() - interval '40 days'),
  ('NorthStar Fintech',       'Everlast PE',              2024, 'Fintech',         'PE/VC',  680, 8.5,  null, 'Series D at $680M EV. 2x jump from prior round.',                           now() - interval '80 days'),
  ('Greenline Power',         'Sovereign Infra Fund',     2023, 'Energy',          'M&A',   1250, 2.1,  11.4, '60% stake. Regulated utility, stable cashflows.',                           now() - interval '120 days'),
  ('LearnKart',               'Global EdTech PLC',        2024, 'EdTech',          'M&A',    290, 6.2,  null, 'Cross-border. Primarily India + SEA footprint.',                            now() - interval '60 days'),
  ('Maple Consumer Brands',   'Regional Strategics Ltd',  2023, 'Consumer',        'M&A',    185, 2.4,  12.8, 'Premium staples. Founder 2-year lock-in.',                                  now() - interval '150 days'),
  ('Artemis Infra Bonds',     null,                       2024, 'Infrastructure',  'DCM',    500, null, null, '10Y INR bonds. 7.85% coupon. AAA rated.',                                   now() - interval '70 days'),
  ('Silverline Healthcare',   'Prism Hospitals',          2025, 'Healthcare',      'M&A',    310, 4.1,  15.6, 'Multi-specialty hospital chain. 80% stake.',                                now() - interval '20 days'),
  ('Aurora Payments',         'Coastal Ventures IV',      2025, 'Fintech',         'PE/VC',  225, 7.2,  null, 'Series C. Embedded payments platform.',                                     now() - interval '15 days'),
  ('Sparrow Logistics',       'Gateway Global',           2024, 'Logistics',       'M&A',    175, 1.9,  10.8, 'Last-mile B2B. Pan-India coverage.',                                        now() - interval '95 days'),
  ('Beacon EdTech',           'Atlas Private Equity',     2025, 'EdTech',          'PE/VC',  140, 5.4,  null, 'Test-prep platform. Growth equity round.',                                  now() - interval '10 days'),
  ('Redwood REIT',            null,                       2024, 'Real Estate',     'DCM',    800, null, null, 'Commercial REIT follow-on bond issuance.',                                  now() - interval '55 days'),
  ('Clearwave Cyber',         'Harbor Tech',              2025, 'Cybersecurity',   'M&A',    165, 9.6,  null, 'Category-leading XDR player acquired by strategic.',                         now() - interval '25 days'),
  ('Pioneer Renewables',      'Aqua Infra Fund',          2024, 'Energy',          'M&A',    920, 2.7,  13.1, '2.5 GW operating solar + wind portfolio.',                                  now() - interval '100 days'),
  ('Heritage Hospitality',    'Global Leisure Trust',     2023, 'Hospitality',     'M&A',    380, 3.6,  16.9, 'Luxury hotel portfolio. Strategic acquirer.',                               now() - interval '170 days'),
  ('Quantum Biotech',         null,                       2025, 'Healthcare',      'ECM',    650, 11.2, null, 'IPO on listed exchange. Anchor book 85% covered at band.',                   now() - interval '5 days');

-- ============ MEETINGS ============
insert into public.meetings (title, date, time, attendee_name, attendee_email, status) values
  ('Nimbus Health — management update',    current_date,       '11:00', 'Rohit Bansal',        'rohit@nimbushealth.com',       'Confirmed'),
  ('Arclight Capital — thesis review',      current_date,       '15:30', 'Serena D''Souza',     'serena@arclightcap.com',       'Proposed'),
  ('Quantum Edge — anchor call (Fidelity)', current_date,       '17:00', 'Stephen Walker',      'swalker@fidelity.com',         'Confirmed'),
  ('Meridian EdTech — LOI discussion',      current_date + 1,   '10:00', 'Vikas Subramanian',   'vikas@meridianedu.com',        'Confirmed'),
  ('Crescent Pharma — buyer intro',         current_date + 1,   '14:00', 'Arvind Kulkarni',     'arvind@crescentpharma.in',     'Confirmed'),
  ('Orion Realty — closing sync',           current_date + 2,   '09:30', 'Mark Rutherford',     'mark@orionrealty.co.uk',       'Confirmed'),
  ('Lattice Cloud — Q&A round 2',           current_date + 3,   '11:30', 'Nikhil Rao',          'nikhil@latticecloud.io',       'Proposed'),
  ('Saffron Retail — anchor pitch',         current_date + 4,   '15:00', 'Ishita Verma',        'ishita@saffronretail.in',      'Proposed');

-- ============ TASKS ============
insert into public.tasks (title, due_date, completed) values
  ('Follow up with Nimbus Health founders',           current_date,     false),
  ('Review Arclight teaser v2',                        current_date,     false),
  ('Send Quantum Edge roadshow brief to anchor list',  current_date,     false),
  ('Prep Q&A deck for Quantum Edge one-on-ones',       current_date + 1, false),
  ('Circulate Helios close memo internally',           current_date + 1, false),
  ('Meridian EdTech — consolidate LOI comparison',     current_date + 2, false),
  ('Aster Logistics — update data room with Q3 data',  current_date + 2, false),
  ('Crescent Pharma — shortlist buyers for MP round',  current_date + 3, false),
  ('Nordwind — draft engagement scope memo',           current_date + 4, false),
  ('Polaris Energy — reconcile bond syndicate list',   current_date + 5, false),
  ('Review draft DRHP for Solstice Financial',         current_date + 6, false),
  ('Update CRM activity for Veda Biotech',             current_date,     true),
  ('File Helios closing certificates',                 current_date - 2, true);

-- ============ INTERACTIONS (Phase 1.1) ============
insert into public.interactions (interaction_purpose, type, counterparty_name, counterparty_company, counterparty_role, outcome, notes, follow_up_date, lead_owner, created_at) values
  ('pitch_for_mandate',     'pitch_meeting', 'Rohit Bansal',     'Nimbus Health',                 'CEO',                            'in_progress',          'Walked through credentials. Founders open to a sell-side pitch in Q3.',                              current_date + 7,   'Neha Jain',       now() - interval '3 days'),
  ('counterparty_outreach', 'intro_call',    'Anand Iyer',       'Peak XV Partners',              'Principal',                      'interested',           'Mapped fund mandate. Healthcare + consumer thesis active for 2026.',                                  current_date + 14,  'Priya Mehta',     now() - interval '5 days'),
  ('pitch_for_mandate',     'pitch_meeting', 'Ishaan Kapoor',    'Saffron Retail',                'Founder',                        'converted_to_mandate', 'Engagement letter signed. Sell-side process kicks off Aug.',                                          null,               'Oliver Hayes',    now() - interval '12 days'),
  ('relationship_building', 'coffee',        'Devika Rao',       'Catamaran Ventures',            'Investment Director',            'stay_warm',            'Shared market view. No live deal but worth quarterly touch.',                                         current_date + 60,  'Neha Jain',       now() - interval '8 days'),
  ('referral',              'referral_in',   'James Whitfield',  'Whitfield & Co.',               'Partner',                        'in_progress',          'Inbound intro to a Hyderabad CPG founder via James. Diligence call scheduled.',                       current_date + 4,   'James Whitfield', now() - interval '2 days'),
  ('pitch_for_mandate',     'phone_call',    'Sandeep Kale',     'Aegis Logistics',               'CFO',                            'pitched_lost',         'Lost on fee. Going with bulge-bracket. Worth re-pitch in 2027 if they spin off cold-chain.',          current_date + 180, 'Oliver Hayes',    now() - interval '20 days'),
  ('counterparty_outreach', 'email_thread',  'Stephen Walker',   'Fidelity',                      'Director, Capital Markets',      'in_progress',          'Anchor conversation for Quantum Edge ECM. Indicative interest at band.',                              current_date + 2,   'James Whitfield', now() - interval '1 day'),
  ('relationship_building', 'event',         'Naina Lal',        'Premji Invest',                 'MD',                             'to_followup',          'Met at IVCA Conclave. Loop in on next infrastructure mandate.',                                       current_date + 21,  'Priya Mehta',     now() - interval '6 days'),
  ('referral',              'referral_out',  'Aditya Sahay',     'Sahay Family Office',           'Principal',                      'referred_out',         'Passed a smaller mid-cap mandate to Avendus — out of our deal-size band.',                            null,               'Neha Jain',       now() - interval '15 days'),
  ('pitch_for_mandate',     'pitch_meeting', 'Vikas Subramanian','Meridian EdTech',               'Founder & CEO',                  'converted_to_mandate', 'Sell-side mandate signed last week. Five funds now in DD.',                                           null,               'Priya Mehta',     now() - interval '45 days'),
  ('counterparty_outreach', 'coffee',        'Mark Rutherford',  'Brookfield Asset Management',   'VP',                             'interested',           'Real estate + infra coverage. Wants to see Orion deck.',                                              current_date + 7,   'Oliver Hayes',    now() - interval '4 days'),
  ('relationship_building', 'coffee',        'Rhea Mathur',      'Lightspeed India',              'Partner',                        'stay_warm',            'Catch-up. No live overlap — biotech focus is still a stretch for them.',                              current_date + 45,  'Neha Jain',       now() - interval '11 days'),
  ('pitch_for_mandate',     'intro_call',    'Tara Krishnan',    'Solstice Solar',                'CFO',                            'to_followup',          'Series C raise being scoped. Send a credentials memo + sample teaser.',                               current_date + 3,   'Neha Jain',       now() - interval '1 day'),
  ('counterparty_outreach', 'pitch_meeting', 'Karthik Iyer',     'Blume Ventures',                'Partner',                        'passed',               'Stage too late for them. Asked to be looped in on Series A rounds we touch.',                         current_date + 90,  'Priya Mehta',     now() - interval '9 days'),
  ('referral',              'email_thread',  'Sophie Laurent',   'Laurent Capital',               'Founder',                        'closed',               'Closed referral loop — they took the mandate to a Paris boutique. Polite no.',                        null,               'Sophie Laurent',  now() - interval '30 days'),
  ('pitch_for_mandate',     'event',         'Niharika Joshi',   'Evermark Retail',               'Group CFO',                      'in_progress',          'Met at consumer summit. They like the case studies. Process kick-off being scheduled.',               current_date + 10,  'Sophie Laurent',  now() - interval '7 days'),
  ('counterparty_outreach', 'phone_call',    'Daniel Cheng',     'Tiger Global',                  'Director',                       'in_progress',          'Tracking growth-stage fintech mandates. Mentioned Quantum Edge — wants briefing.',                    current_date + 5,   'James Whitfield', now() - interval '2 days'),
  ('relationship_building', 'coffee',        'Hemant Sahni',     'Chiratae Ventures',             'Partner',                        'to_followup',          'Long-arc relationship. Send our Q1 healthcare snapshot when ready.',                                   current_date + 14,  'Neha Jain',       now() - interval '13 days'),
  ('pitch_for_mandate',     'pitch_meeting', 'Maya Iyengar',     'Kestrel Biotech',               'Founder',                        'in_progress',          'Buy-side scoping for licensing-deal acquisitions. Stage 2 conversation scheduled.',                   current_date + 8,   'James Whitfield', now() - interval '6 days'),
  ('counterparty_outreach', 'email_thread',  'Nina Kapoor',      'GIC',                           'Senior Investment Officer',      'in_progress',          'Sovereign coverage map updated. They are live for infra + renewables in India.',                       current_date + 11,  'Oliver Hayes',    now() - interval '4 days'),
  ('referral',              'referral_in',   'Rajat Bhatia',     'Bhatia Family Office',          'Principal',                      'in_progress',          'Inbound from existing client. Looking for sell-side advice on a niche logistics asset.',              current_date + 3,   'Priya Mehta',     now() - interval '2 days'),
  ('pitch_for_mandate',     'intro_call',    'Arvind Kulkarni',  'Crescent Pharma',               'CFO',                            'to_followup',          'Carve-out of OTC division being scoped. Wants comparative case studies.',                             current_date + 5,   'Neha Jain',       now() - interval '2 days'),
  ('relationship_building', 'coffee',        'Yash Anand',       'Kalaari Capital',               'Partner',                        'stay_warm',            'Brand recall meeting. Not deploying actively in our segments.',                                       current_date + 75,  'Priya Mehta',     now() - interval '22 days'),
  ('pitch_for_mandate',     'pitch_meeting', 'Anuj Goyal',       'Brightline Mobility',           'Founder',                        'pitched_lost',         'Lost to founder going direct. Logged as relationship for next round.',                                current_date + 120, 'Priya Mehta',     now() - interval '35 days'),
  ('counterparty_outreach', 'event',         'Lara Petrov',      'Sequoia Capital India',         'Principal',                      'interested',           'Met at fintech roundtable. Wants to be on our distribution list.',                                    current_date + 20,  'James Whitfield', now() - interval '9 days');

-- ============ FUNDS (Phase 1.4) ============
insert into public.funds (name, fund_type, hq_city, hq_country, aum_usd_m, check_size_min_usd_m, check_size_max_usd_m, sectors, stages, geographies, warmth, last_touched_at) values
  ('Peak XV Partners',              'VC',                  'Bengaluru',     'India',     9000,    5,    100,  array['Fintech','Consumer','Healthcare','SaaS'], array['Mandate','Mandate','Diligence'], array['India','SE Asia'], 'hot',     current_date - 8),
  ('Accel India',                   'VC',                  'Bengaluru',     'India',     4000,    2,    60,   array['Fintech','SaaS','Consumer'],              array['Mandate','Marketing'],             array['India'],           'warm',    current_date - 22),
  ('Lightspeed India',              'VC',                  'Mumbai',        'India',     3000,    3,    80,   array['Fintech','EdTech','Consumer Tech'],       array['Mandate','Marketing'],             array['India','US'],      'warm',    current_date - 35),
  ('Blume Ventures',                'VC',                  'Mumbai',        'India',     700,     0.5,  12,   array['SaaS','Fintech','Consumer Tech'],         array['Mandate'],                         array['India'],           'cold',    current_date - 120),
  ('Kalaari Capital',               'VC',                  'Bengaluru',     'India',     740,     1,    15,   array['Consumer','Healthcare','SaaS'],           array['Mandate'],                         array['India'],           'cold',    current_date - 78),
  ('Chiratae Ventures',             'VC',                  'Bengaluru',     'India',     1200,    1,    25,   array['Healthcare','Fintech','Consumer'],        array['Mandate','Marketing'],             array['India'],           'warm',    current_date - 40),
  ('Elevation Capital',             'Growth',              'Gurugram',      'India',     2000,    5,    50,   array['Fintech','Consumer','SaaS'],              array['Mandate','Diligence'],           array['India'],           'warm',    current_date - 18),
  ('Stellaris Venture Partners',    'VC',                  'Bengaluru',     'India',     600,     1,    12,   array['SaaS','EdTech','Consumer Tech'],          array['Mandate'],                         array['India'],           'cold',    current_date - 95),
  ('Matrix Partners India',         'VC',                  'Mumbai',        'India',     1500,    2,    30,   array['Consumer','SaaS','Fintech'],              array['Mandate','Marketing'],             array['India'],           'cold',    current_date - 110),
  ('Nexus Venture Partners',        'VC',                  'Mumbai',        'India',     2400,    3,    40,   array['SaaS','Consumer Tech','Fintech'],         array['Mandate','Marketing'],             array['India','US'],      'warm',    current_date - 50),
  ('Sequoia Capital',               'VC',                  'Menlo Park',    'USA',       85000,   10,   250,  array['SaaS','Fintech','Consumer Tech','AI'],    array['Mandate','Diligence'],           array['Global'],          'cold',    current_date - 150),
  ('Andreessen Horowitz (a16z)',    'VC',                  'Menlo Park',    'USA',       35000,   10,   300,  array['Fintech','SaaS','AI','Consumer Tech'],    array['Mandate','Diligence'],           array['Global'],          'cold',    current_date - 180),
  ('Tiger Global',                  'Growth',              'New York',      'USA',       60000,   25,   500,  array['Fintech','SaaS','Consumer Tech'],         array['Mandate','Mandate','Negotiation'], array['Global'],      'warm',    current_date - 28),
  ('SoftBank Vision Fund',          'Growth',              'Tokyo',         'Japan',     100000,  50,   1000, array['Consumer Tech','Fintech','AI'],           array['Negotiation'],                     array['Global'],          'cold',    current_date - 220),
  ('General Atlantic',              'Growth',              'New York',      'USA',       76000,   50,   600,  array['Fintech','Healthcare','Consumer','SaaS'], array['Mandate','Diligence'],           array['Global'],          'warm',    current_date - 60),
  ('Insight Partners',              'Growth',              'New York',      'USA',       80000,   30,   500,  array['SaaS','Fintech'],                          array['Mandate','Diligence'],           array['Global'],          'cold',    current_date - 140),
  ('Coatue Management',             'Hedge Fund',          'New York',      'USA',       50000,   25,   400,  array['Fintech','Consumer Tech','SaaS'],         array['Mandate','Diligence'],           array['Global'],          'cold',    current_date - 165),
  ('KKR',                           'PE',                  'New York',      'USA',       540000,  100,  2000, array['Infrastructure','Healthcare','Consumer','Real Estate','Energy'], array['Mandate','Negotiation'], array['Global'], 'warm', current_date - 20),
  ('Blackstone',                    'PE',                  'New York',      'USA',       1000000, 100,  3000, array['Real Estate','Infrastructure','Healthcare','Consumer'],         array['Mandate','Negotiation'], array['Global'], 'cold', current_date - 105),
  ('Carlyle Group',                 'PE',                  'Washington',    'USA',       425000,  75,   1500, array['Healthcare','Consumer','Industrials'],    array['Mandate','Negotiation'],         array['Global'],          'cold',    current_date - 170),
  ('Brookfield Asset Management',   'PE',                  'Toronto',       'Canada',    925000,  100,  2500, array['Infrastructure','Real Estate','Renewables'], array['Mandate','Negotiation'],      array['Global'],          'warm',    current_date - 15),
  ('TPG Capital',                   'PE',                  'San Francisco', 'USA',       224000,  75,   1000, array['Healthcare','Consumer','Tech'],           array['Mandate','Negotiation'],         array['Global'],          'cold',    current_date - 95),
  ('Bain Capital',                  'PE',                  'Boston',        'USA',       185000,  50,   1500, array['Healthcare','Consumer','Industrials','Tech'], array['Mandate','Negotiation'],     array['Global'],          'cold',    current_date - 190),
  ('GIC',                           'Sovereign',           'Singapore',     'Singapore', 770000,  100,  2000, array['Infrastructure','Real Estate','Renewables','Healthcare'], array['Mandate','Negotiation'], array['India','SE Asia','Global'], 'warm', current_date - 30),
  ('Temasek',                       'Sovereign',           'Singapore',     'Singapore', 380000,  50,   1500, array['Healthcare','Tech','Fintech','Consumer'], array['Mandate','Diligence'],           array['India','Global'],  'warm',    current_date - 45),
  ('ADIA',                          'Sovereign',           'Abu Dhabi',     'UAE',       780000,  100,  3000, array['Infrastructure','Real Estate','Energy'],  array['Mandate','Negotiation'],         array['Global'],          'cold',    current_date - 125),
  ('Premji Invest',                 'Family Office',       'Bengaluru',     'India',     12000,   10,   200,  array['Healthcare','Consumer','SaaS','Fintech'], array['Mandate','Diligence'],           array['India','US'],      'hot',     current_date - 12),
  ('Catamaran Ventures',            'Family Office',       'Bengaluru',     'India',     1500,    2,    50,   array['Consumer','Healthcare','SaaS'],           array['Mandate','Marketing'],             array['India'],           'warm',    current_date - 38),
  ('RNT Capital',                   'Family Office',       'Mumbai',        'India',     800,     1,    25,   array['Consumer','Tech','Renewables'],           array['Mandate','Marketing'],             array['India','Global'],  'warm',    current_date - 55),
  ('Reliance Family Office',        'Family Office',       'Mumbai',        'India',     5000,    25,   500,  array['Energy','Telecom','Consumer','Infrastructure'], array['Mandate','Negotiation'], array['India','Global'],   'cold',    current_date - 160),
  ('Tata Capital — Corp Dev',       'Strategic Corp Dev',  'Mumbai',        'India',     null,    25,   500,  array['Consumer','Industrials','Tech'],          array['Mandate','Negotiation'],         array['India','UK'],      'warm',    current_date - 30),
  ('Reliance Industries — M&A',     'Strategic Corp Dev',  'Mumbai',        'India',     null,    50,   1000, array['Telecom','Energy','Consumer','Tech'],     array['Mandate','Negotiation'],         array['India'],           'cold',    current_date - 200);
