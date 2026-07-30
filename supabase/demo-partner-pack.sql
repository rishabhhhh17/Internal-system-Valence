-- ValenceOS · Demo seed pack
-- Idempotent. Paste end-to-end into Supabase SQL Editor.
--
-- The live database has very few rows (4 deals, 0 funds, 0 interactions,
-- etc.) which makes /funds, /interactions, /inbox-intake, /analytics,
-- /screener and /planner all look like empty shells when a partner walks
-- a potential customer through the product. This pack seeds enough
-- realistic data to make every page feel populated WITHOUT being so noisy
-- that the customer doubts whether they're seeing a live system.
--
-- Every insert uses ON CONFLICT DO NOTHING so re-running is safe.
-- Every row is realistic for Valence Growth Partners' India + UK + SEA
-- mid-market IB focus. Cheque sizes in USD M. Cities Mumbai / London /
-- Singapore / Dubai. Sectors that match the firm's coverage.

-- ============================================================================
-- 1. FUNDS — 12 across PE / VC / Growth / SWF / Family Office
-- ============================================================================
insert into public.funds (id, name, fund_type, hq_city, hq_country, aum_usd_m, check_size_min_usd_m, check_size_max_usd_m, sectors, stage_focus, warmth, persona_notes) values
  (gen_random_uuid(), 'Kedaara Capital',            'pe',           'Mumbai',    'India',         5500, 50,  200, ARRAY['Consumer','Fintech','Healthcare'],          ARRAY['Growth','Buyout'],   'hot',     'Sumant Sinha leads consumer; lengthy DD; pays par'),
  (gen_random_uuid(), 'ChrysCapital',               'pe',           'Mumbai',    'India',         5800, 60,  180, ARRAY['Healthcare','BFSI','Consumer Tech'],        ARRAY['Buyout','Growth'],   'warm',    'Long memory — never forget a passed look'),
  (gen_random_uuid(), 'Bain Capital India',         'pe',           'Mumbai',    'India',         8000, 75,  300, ARRAY['Consumer','Healthcare','Industrials'],      ARRAY['Buyout'],            'warm',    'Pavninder is tough on price; Rishi softer on quality assets'),
  (gen_random_uuid(), 'Peak XV Partners',           'vc',           'Singapore', 'Singapore',     9000, 10,  60,  ARRAY['Consumer Tech','Fintech','SaaS'],           ARRAY['Series B','Series C'], 'hot',    'Premji-style picks; rapid first meetings'),
  (gen_random_uuid(), 'Lightspeed India',           'vc',           'Bangalore', 'India',         3200, 5,   25,  ARRAY['Consumer Tech','Fintech','SaaS','EdTech'],  ARRAY['Series A','Series B'], 'warm',    'Solid follow-on rate; Hemant runs consumer'),
  (gen_random_uuid(), 'Apollo Global Management',   'pe',           'London',    'United Kingdom',5e5, 200, 800, ARRAY['Infrastructure','Real Estate','BFSI'],      ARRAY['Buyout'],            'cold',    'UK / EMEA infra; rarely looks south of Suez'),
  (gen_random_uuid(), 'GIC Private Limited',        'swf',          'Singapore', 'Singapore',     7e5, 100, 500, ARRAY['Infrastructure','Real Estate','Tech'],      ARRAY['Growth','Buyout'],   'warm',    'Long horizon; co-invest happy'),
  (gen_random_uuid(), 'Temasek Holdings',           'swf',          'Singapore', 'Singapore',     3e5, 150, 600, ARRAY['Healthcare','Consumer','Tech','Sustainability'], ARRAY['Growth','Late stage'], 'hot', 'Active in India consumer health'),
  (gen_random_uuid(), 'Premji Invest',              'family_office','Bangalore', 'India',         1200, 20,  100, ARRAY['Consumer','Healthcare','Tech'],             ARRAY['Series C','Growth'], 'warm',    'Family-office mindset; less price-sensitive'),
  (gen_random_uuid(), 'Mubadala Investment Co',     'swf',          'Abu Dhabi', 'UAE',           3e5, 100, 500, ARRAY['Tech','Healthcare','Renewables'],           ARRAY['Growth','Buyout'],   'warm',    'Strategic capital; cares about UAE jobs / co-location'),
  (gen_random_uuid(), 'Multiples Alternate Asset',  'pe',           'Mumbai',    'India',         3000, 30,  120, ARRAY['Consumer','BFSI','Healthcare'],             ARRAY['Growth','Buyout'],   'hot',     'Renuka rapid decisions; pays for quality'),
  (gen_random_uuid(), 'Norwest Venture Partners',   'vc',           'Mumbai',    'India',         12500, 25, 100, ARRAY['Consumer','Fintech','SaaS','Healthcare'], ARRAY['Growth','Late stage'], 'warm',  'Niren leads India growth; long-cycle')
on conflict do nothing;

-- ============================================================================
-- 2. PEOPLE — 18 (fund principals + founders + lawyers)
-- ============================================================================
insert into public.people (id, full_name, role, company, city, country, email, phone, how_to_talk, what_they_care_about, favours_bank, mutuals, tags) values
  (gen_random_uuid(), 'Sumant Sinha',       'Managing Director',           'Kedaara Capital',           'Mumbai',    'India',         'sumant@kedaara.com',       NULL, 'Direct, data-led. Bring the cohort math up front.',                       'Unit economics, cohort retention, repeat purchase.', true,  ARRAY['Anand Iyer','Vikram Patel'],                ARRAY['fund-principal','consumer']),
  (gen_random_uuid(), 'Rishi Mandawat',     'Managing Director',           'Bain Capital India',         'Mumbai',    'India',         'rishi.mandawat@bain.com',  NULL, 'Patient, quality-over-price. Soft-pitch first.',                          'Brand moats, founder-quality, audited PNL.',          false, ARRAY['Anand Iyer'],                                ARRAY['fund-principal','quality-led']),
  (gen_random_uuid(), 'Pavninder Singh',    'Managing Director',           'Bain Capital India',         'Mumbai',    'India',         'pavninder@bain.com',       NULL, 'Tough on valuation. Bring comps.',                                          'Margins, cap structure, defensible unit economics.',  false, ARRAY[]::text[],                                    ARRAY['fund-principal']),
  (gen_random_uuid(), 'Hemant Mohapatra',   'Partner',                     'Lightspeed India',           'Bangalore', 'India',         'hemant@lsvp.com',           NULL, 'Crisp, sub-15-min calls. Loves a clean cap table.',                       'Distribution, founder velocity, repeat purchase.',    true,  ARRAY['Neha Jain'],                                ARRAY['fund-principal','vc']),
  (gen_random_uuid(), 'Renuka Ramnath',     'Founder, Managing Director',  'Multiples Alternate Asset',  'Mumbai',    'India',         'renuka@multiplesequity.com', NULL,'Decisive, women-founder-aware. Land the why-now hard.',                  'Governance, exit thesis, downside-protection.',       true,  ARRAY['Anand Iyer'],                                ARRAY['fund-principal']),
  (gen_random_uuid(), 'Niren Shah',         'Managing Director',           'Norwest Venture Partners',   'Mumbai',    'India',         'niren@nvp.com',             NULL, 'Long-cycle thinker. Don''t push for fast closes.',                         'Compounders, India-domestic-demand stories.',         false, ARRAY[]::text[],                                    ARRAY['fund-principal','growth']),
  (gen_random_uuid(), 'Sailesh Tulshan',    'Managing Director',           'Peak XV Partners',           'Singapore', 'Singapore',     'sailesh@peakxv.com',        NULL, 'Tech-first; show the platform thesis early.',                              'Network effects, TAM expansion, founder-edge.',       true,  ARRAY['Neha Jain','Rohan Gupta'],                  ARRAY['fund-principal','vc']),
  (gen_random_uuid(), 'Vivek Mehra',        'Partner',                     'Premji Invest',              'Bangalore', 'India',         'vivek@premjiinvest.com',    NULL, 'Quiet, mission-aligned. Bring impact data.',                               'Long-term compounding, sustainability angle.',        true,  ARRAY['Anand Iyer'],                                ARRAY['family-office']),
  (gen_random_uuid(), 'Ankit Agarwal',      'Director',                    'GIC Private Limited',        'Singapore', 'Singapore',     'ankit.a@gic.com.sg',        NULL, 'Process-driven; expect IC memos.',                                          'Long-hold quality, co-invest economics.',             false, ARRAY[]::text[],                                    ARRAY['swf']),
  -- Founders / clients
  (gen_random_uuid(), 'Anand Iyer',         'Founder, CEO',                'Nimbus Health',             'Bangalore', 'India',         'anand@nimbushealth.com',    NULL, 'Detail-obsessed founder. Brings his CFO to every meeting.',                'Clean cap table; conservative dilution; strategic over financial.', false, ARRAY['Sumant Sinha','Vivek Mehra'], ARRAY['founder','client']),
  (gen_random_uuid(), 'Devika Kapoor',      'Founder, CEO',                'Quantum Edge',              'Mumbai',    'India',         'devika@quantumedge.in',     NULL, 'Hard-charging fintech founder. Wants speed.',                              'Speed-to-term-sheet, Series C-grade investor signal.',true,  ARRAY['Niren Shah'],                                ARRAY['founder','client']),
  (gen_random_uuid(), 'Karthik Ranganathan','Founder',                     'HoV Mushrooms',             'Chennai',   'India',         'karthik@hovmushrooms.com',  NULL, 'First-time founder; coachable but anxious. Lots of hand-holding.',         'Hand-holding through DD; investor-fit beats valuation.', true, ARRAY['Renuka Ramnath'],                            ARRAY['founder','client']),
  (gen_random_uuid(), 'Priyanka Saxena',    'CEO',                         'Saffron Studios',           'Mumbai',    'India',         'priyanka@saffronstudios.in',NULL, 'Story-led pitch. Pull her back to numbers.',                                'Brand IP, content slate value, strategic acquirer.',  false, ARRAY[]::text[],                                    ARRAY['founder','client']),
  (gen_random_uuid(), 'Daniel Cheng',       'Head of M&A',                 'Brookfield',                'London',    'United Kingdom','daniel.cheng@brookfield.com',NULL,'Direct UK-style; doesn''t hide his price.',                                'Operational synergies, asset quality, exit IRR.',     false, ARRAY[]::text[],                                    ARRAY['strategic-buyer']),
  -- Lawyers / external counsel
  (gen_random_uuid(), 'Zia Mody',           'Founding Partner',            'AZB & Partners',            'Mumbai',    'India',         'z.mody@azbpartners.com',    NULL, 'Senior counsel; only respond at decision points.',                          'Clean docs, no surprises during diligence.',          true,  ARRAY[]::text[],                                    ARRAY['lawyer','external-counsel']),
  (gen_random_uuid(), 'Cyril Shroff',       'Managing Partner',            'Cyril Amarchand Mangaldas','Mumbai',    'India',         'c.shroff@cam.law',          NULL, 'Old-school formal. Email > calls.',                                         'Regulatory cover, governance, defensive drafting.',   true,  ARRAY[]::text[],                                    ARRAY['lawyer','external-counsel']),
  (gen_random_uuid(), 'Aarti Khanna',       'Investment Manager',          'Temasek Holdings',          'Singapore', 'Singapore',     'aarti.k@temasek.com.sg',    NULL, 'Process-driven; data-first.',                                               'Domain leadership in India consumer-health.',         true,  ARRAY[]::text[],                                    ARRAY['fund-principal']),
  (gen_random_uuid(), 'James Whitaker',     'Head of EMEA Origination',    'Apollo Global Management',  'London',    'United Kingdom','j.whitaker@apollo.com',     NULL, 'Distant and selective; not interested in <$200M EV.',                       'Large, defensible cash-flowing assets.',              false, ARRAY[]::text[],                                    ARRAY['fund-principal','cold'])
on conflict do nothing;

-- ============================================================================
-- 3. INTAKE SUBMISSIONS — 4 inbound mandates in the inbox
-- ============================================================================
insert into public.intake_submissions (id, submitter_name, submitter_email, submitter_role, company_name, sector, deal_type, deal_subtype, ma_side, ticket_size_usd_m, valuation_usd_m, geography, summary, status, ai_screener_output) values
  (gen_random_uuid(), 'Aditya Sharma',  'aditya@crescentpharma.com',       'Founder',  'Crescent Pharma',   'Healthcare',     'transaction','m_and_a',   'sell', NULL, 150, 'India · Mumbai',     'Family-owned pharma manufacturer. Three plants. Looking to exit to a strategic acquirer. EBITDA ~25Cr, growing 22% YoY.',                                                                                          'new',      jsonb_build_object('verdict','pursue','score', 78,'one_line','Strong fit — fits Valence''s mid-market sell-side sweet spot.','lines', ARRAY['EBITDA $3M / Rev $12M comfortably inside Valence''s $50–750M EV band','Sector match: Healthcare manufacturing fits the firm coverage','Mumbai-based founder; on-the-ground access easy for Vikram','Sell-side mandate aligns to firm''s M&A practice','Founder presence; cap table likely clean'])),
  (gen_random_uuid(), 'Maya Iyer',      'maya@brightlinemobility.in',      'CFO',      'Brightline Mobility','Logistics',     'transaction','fundraise',  NULL,   60,  240, 'India · Bangalore',  'Series B EV last-mile logistics. Asking $60M at $240M post. Strong unit economics in 4 cities. Looking for growth investor with strategic value.',                                                                  'new',      jsonb_build_object('verdict','review','score', 55,'one_line','Borderline — within band but logistics is adjacent to firm coverage.','lines', ARRAY['$60M raise fits the $50–750M target','Series B is growth stage — Valence does growth too','Logistics is adjacent, not core sector','EV-specific play needs investor with EV thesis','Recommend handing to a specialist if Valence passes'])),
  (gen_random_uuid(), 'Vikrant Singh',  'vikrant@saffronstudios.in',       'COO',      'Saffron Studios',   'Media',          'transaction','m_and_a',   'sell', NULL, 80,  'India · Mumbai',     'Content studio, three OTT-original titles in development. Founder wants to exit to a streaming major. Valuation expectation $80M.',                                                                                'new',      jsonb_build_object('verdict','review','score', 48,'one_line','Cautious — Media isn''t a Valence-coverage sector.','lines', ARRAY['Sell-side mandate matches the firm''s execution playbook','Sector: Media is outside the core Healthcare / BFSI / Consumer / Infra circle','$80M EV is on the lower end of the band','Founder is high-profile — may bring inbound attention','Recommend pass unless partner has a Media-pivot interest'])),
  (gen_random_uuid(), 'Niharika Reddy', 'niharika@solaceinfra.com',        'CEO',      'Solace Infrastructure','Infrastructure','transaction','fundraise',NULL,    200, 850, 'India · Hyderabad',  'Project-finance for a Hyderabad-Pune solar corridor. Targeting $200M of equity at $850M EV. Strong PPA backbook.',                                                                                                  'new',      jsonb_build_object('verdict','pursue','score', 82,'one_line','Strong match — Infrastructure + project-finance fits Helios precedent.','lines', ARRAY['$200M raise inside the firm''s $50–750M sweet spot','Sector: Infrastructure is a coverage strength (see Helios Infra precedent)','Project-finance + PPA structure is plays the firm''s playbook','Hyderabad geography is reachable from Mumbai','High-quality founder + cap structure'])))
on conflict do nothing;

-- ============================================================================
-- 4. SCREENER RUNS — 3 runs to populate analytics + show the Quick Screener has been used
-- ============================================================================
insert into public.screener_runs (id, mode, input_text, output_json, created_at) values
  (gen_random_uuid(), 'fund_match',  'Nimbus Health — consumer health DTC, $15M raise',    jsonb_build_object('matches', jsonb_build_array(jsonb_build_object('fund_name','Multiples Alternate Asset','score',88,'reason','Consumer sector match; Renuka likes founder-led DTC'),jsonb_build_object('fund_name','Kedaara Capital','score',82,'reason','Consumer + healthcare crossover'),jsonb_build_object('fund_name','Premji Invest','score',77,'reason','Mission-aligned; long horizon')), 'mode', 'fund_match'), now() - interval '3 days'),
  (gen_random_uuid(), 'mandate_fit', 'Crescent Pharma — sell-side, ₹150 Cr EV',             jsonb_build_object('verdict','pursue','score',78,'one_line','Fits sweet spot','lines', ARRAY['Healthcare sector match','EBITDA in band','Mumbai geography easy']), now() - interval '1 day'),
  (gen_random_uuid(), 'fund_match',  'Quantum Edge — fintech Series C, $80M raise',         jsonb_build_object('matches', jsonb_build_array(jsonb_build_object('fund_name','Peak XV Partners','score',92,'reason','Fintech focus, Series C stage'),jsonb_build_object('fund_name','Norwest Venture Partners','score',85,'reason','Late-stage growth, India domestic-demand')), 'mode', 'fund_match'), now() - interval '6 hours')
on conflict do nothing;

-- ============================================================================
-- 5. INTERACTIONS — 12 across deals + funds + founders
-- Linked to people via lookup, since fund_id isn't on the table.
-- ============================================================================
insert into public.interactions (id, counterparty_name, counterparty_company, person_id, deal_id, type, outcome, notes, follow_up_date, lead_owner, created_at)
select
  gen_random_uuid(),
  i.counterparty_name, i.counterparty_company,
  (select id from public.people where full_name = i.person_name limit 1),
  (select id from public.deals  where client_name = i.deal_name  limit 1),
  i.type, i.outcome, i.notes, i.follow_up_date::date, i.lead_owner,
  now() - (i.days_ago || ' days')::interval
from (values
  ('Sumant Sinha',   'Kedaara Capital',           'Sumant Sinha',   'Nimbus Health',  'pitch',           'in_progress',           'First Zoom. Sumant liked the unit economics, asked for the cohort retention curve. Owes us next-steps by Friday.',                       (current_date + 4)::text,  'Vikram Patel',  2),
  ('Hemant Mohapatra','Lightspeed India',          'Hemant Mohapatra','Quantum Edge',  'screening_call',  'converted_to_mandate',  'Quick fit-check call. Hemant said he''d take a meeting once we tee up the Series C round. Logged as mandate-fit pursue.',                NULL,                        'Neha Jain',     5),
  ('Renuka Ramnath', 'Multiples Alternate Asset', 'Renuka Ramnath', 'HoV Mushrooms', 'intro_meeting',   'in_progress',           'Renuka warmed up after the founder story. Wants the unit economics deck before her IC.',                                                  (current_date + 2)::text,  'Rohan Gupta',   7),
  ('Niren Shah',     'Norwest Venture Partners',  'Niren Shah',     'Quantum Edge',  'pitch',           'in_progress',           'Niren is sceptical of fintech valuations. Wants more proof on contribution margin.',                                                       (current_date + 6)::text,  'Neha Jain',     3),
  ('Pavninder Singh','Bain Capital India',         'Pavninder Singh','Nimbus Health',  'pitch',           'passed',                'Pavninder passed: too early-stage for Bain India PE.',                                                                                     NULL,                        'Vikram Patel',  9),
  ('Sailesh Tulshan','Peak XV Partners',           'Sailesh Tulshan','Quantum Edge',  'intro_meeting',   'in_progress',           'Sailesh is engaged. Asking for diligence-room access.',                                                                                    (current_date + 1)::text,  'Neha Jain',     4),
  ('Vivek Mehra',    'Premji Invest',              'Vivek Mehra',    'Nimbus Health',  'intro_meeting',   'in_progress',           'Vivek loved Anand''s mission-fit. Will discuss with the family principal.',                                                                (current_date + 10)::text, 'Vikram Patel',  6),
  ('Daniel Cheng',   'Brookfield',                 'Daniel Cheng',   'Helios Infra',   'pitch',           'converted_to_mandate',  'Cheng made an oral offer at 1.4x EV/Asset. Worth pursuing — handed over engagement letter.',                                              NULL,                        'Rishi Kapoor',  14),
  ('Ankit Agarwal',  'GIC Private Limited',        'Ankit Agarwal',  'Helios Infra',   'screening_call',  'in_progress',           'GIC interested as a co-investor on the bonds; would join if Brookfield leads.',                                                            (current_date + 5)::text,  'Rishi Kapoor',  12),
  ('Anand Iyer',     'Nimbus Health',              'Anand Iyer',     'Nimbus Health',  'founder_check_in','in_progress',           'Anand is anxious about dilution. Walked him through the cap-table waterfall again.',                                                       (current_date - 1)::text,  'Vikram Patel',  1),
  ('Devika Kapoor',  'Quantum Edge',               'Devika Kapoor',  'Quantum Edge',  'founder_check_in','in_progress',           'Devika is impatient — wants term sheets in two weeks.',                                                                                    (current_date + 0)::text,  'Neha Jain',     2),
  ('Karthik Ranganathan','HoV Mushrooms',          'Karthik Ranganathan','HoV Mushrooms','founder_check_in','in_progress',         'Karthik is feeling out of his depth on the diligence questions. Pulled in Cyril Amarchand to coach him.',                                  (current_date + 3)::text,  'Rohan Gupta',   5)
) as i(counterparty_name, counterparty_company, person_name, deal_name, type, outcome, notes, follow_up_date, lead_owner, days_ago)
where not exists (
  select 1 from public.interactions x
  where x.counterparty_name = i.counterparty_name and x.notes = i.notes
);

-- ============================================================================
-- 6. CALENDAR EVENTS — sync-able events on team_calendars (if any exist)
-- Skipped — we let Google sync populate these in the real demo.
-- ============================================================================

-- ============================================================================
-- 7. KNOWLEDGE MEMOS — 5 firm-shared docs
-- ============================================================================
insert into public.knowledge_files (id, name, path, char_count, sector, tags, summary, created_at)
select gen_random_uuid(), m.name, m.path, m.char_count, m.sector, m.tags, m.summary, m.created_at
from (values
  ('Sector deep-dive — India consumer health Q1 2026.pdf',       'demo://memos/consumer-health-q1.pdf',   32000, 'Healthcare',     ARRAY['memo','sector','consumer-health'],          'Argues for a structural shift in OTC + nutraceuticals. 3 sub-themes: D2C nutrition, branded generics, telehealth-D2C bundles.',           now() - interval '20 days'),
  ('Infrastructure sell-side playbook v3.pdf',                   'demo://memos/infra-sellside.pdf',         48000, 'Infrastructure', ARRAY['playbook','sell-side'],                     'Canonical Valence playbook for sell-side infrastructure mandates. Stage gates, IM template, teaser DOs/DON''Ts.',                          now() - interval '60 days'),
  ('Renewables IC memo — Helios Infra.pdf',                      'demo://memos/helios-ic.pdf',              25000, 'Infrastructure', ARRAY['ic-memo','helios','renewables'],            'Internal IC memo when Valence accepted the Helios mandate. Notes Brookfield interest, fee structure.',                                     now() - interval '90 days'),
  ('Fund coverage — Q1 2026 update.pdf',                         'demo://memos/fund-coverage-q1.pdf',       18000, 'BFSI',           ARRAY['coverage','funds','quarterly'],             'Refreshed warmth ratings for 38 funds. Notes on Kedaara consumer thesis change, Bain India team rebuild.',                                  now() - interval '14 days'),
  ('NDA standard templates — 2026.md',                           'demo://memos/nda-templates.md',           8000,  NULL,             ARRAY['template','nda','legal'],                   'Two-way and one-way NDAs with our standard carve-outs. Use these as starting points.',                                                      now() - interval '40 days')
) as m(name, path, char_count, sector, tags, summary, created_at)
where not exists (
  select 1 from public.knowledge_files where name = m.name
);

-- ============================================================================
-- 8. DAILY NOTE — today's row pre-populated with a sample partner brief
-- ============================================================================
insert into public.daily_notes (user_id, date, body, updated_at)
values (
  '00000000-0000-0000-0000-000000000000',
  current_date,
  E'Quick read of today:\n\n- Nimbus Health pitch deck v3 ready — Vikram to walk Sumant through the cohort math.\n- Helios Infra — Brookfield oral at 1.4x, GIC keen as co-invest. Engagement letter draft in progress.\n- HoV Mushrooms diligence coaching call with Karthik @ 4pm.\n- New inbound from Crescent Pharma — AI verdict: pursue. Schedule first-look call this week.\n',
  now()
)
on conflict (user_id, date) do nothing;

-- ============================================================================
-- 9. ACTIVITIES — extra activity log to populate Timeline + Analytics heatmap
-- ============================================================================
insert into public.activities (id, deal_id, kind, body, created_at)
select gen_random_uuid(), d.id, a.kind, a.body, now() - (a.days_ago || ' days')::interval
from (values
  ('Nimbus Health',  'nda_signed',     'NDA executed with Kedaara Capital',                              4),
  ('Nimbus Health',  'teaser_sent',    'Teaser sent to Multiples + Premji',                              8),
  ('Nimbus Health',  'meeting',        'Pitch call with Sumant Sinha (Kedaara)',                         2),
  ('Quantum Edge',   'meeting',        'Sailesh Tulshan (Peak XV) intro call',                           4),
  ('Quantum Edge',   'teaser_sent',    'Teaser to Peak XV + Norwest + Lightspeed',                       7),
  ('Helios Infra',   'teaser_sent',    'Confidential offer letter sent to Brookfield',                  18),
  ('Helios Infra',   'meeting',        'Brookfield London follow-up with Cheng',                        15),
  ('Helios Infra',   'nda_signed',     'NDA with GIC co-invest team',                                   10),
  ('HoV Mushrooms',  'meeting',        'Renuka Ramnath (Multiples) intro meeting',                       7),
  ('HoV Mushrooms',  'file_upload',    'Q3 cohort retention deck',                                       3),
  ('Helios Infra',   'brief_generated','AI brief regenerated after Brookfield offer',                    1)
) as a(deal_name, kind, body, days_ago)
join public.deals d on d.client_name = a.deal_name
where not exists (
  select 1 from public.activities x
  where x.deal_id = d.id and x.body = a.body
);

-- ============================================================================
-- DONE. Recommended next step:
-- 1. Verify counts with:   select 'funds', count(*) from public.funds
--                          union all select 'people', count(*) from public.people
--                          union all select 'interactions', count(*) from public.interactions
--                          union all select 'intake_submissions', count(*) from public.intake_submissions
--                          union all select 'screener_runs', count(*) from public.screener_runs;
-- 2. Pull live and open /funds, /interactions, /inbox/intake — should be populated now.
-- ============================================================================
