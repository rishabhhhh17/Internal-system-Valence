-- ============================================================================
-- Phase 39 — Repurpose the funds CRM into the Founders relationship CRM
-- ============================================================================
-- A VC's relationship list is founders, not other investors. The /funds page
-- now renders founder companies: name = company, stages[0] = funding round
-- (Pre-seed → Series E+), sectors = free-entry sector tags (auto-become page
-- filters), warmth + last_touched_at unchanged. fund_type stays NOT NULL from
-- the old schema — founder rows carry 'Other'.
--
-- Replaces the phase-38 investor-fund seed for the demo org. Includes the
-- pipeline companies (Quantia Tech, NovaHealth, …) so the CRM and the deal
-- board tell one story.

delete from public.funds where org_id = 'dec0ffee-0000-4000-8000-000000000001';

insert into public.funds (name, fund_type, hq_city, hq_country, sectors, stages, warmth, last_touched_at, notes, org_id)
values
('Quantia Tech',        'Other', 'Bengaluru', 'India',     '{"Fintech","SaaS"}',            '{"Series B"}',  'hot',     '2026-06-08', 'In partner review — founder ships weekly.', 'dec0ffee-0000-4000-8000-000000000001'),
('NovaHealth',          'Other', 'Mumbai',    'India',     '{"Healthcare"}',                '{"Series C"}',  'hot',     '2026-06-05', 'Memo in progress; strong clinical data.',   'dec0ffee-0000-4000-8000-000000000001'),
('MedPlus Diagnostics', 'Other', 'Hyderabad', 'India',     '{"Healthcare","Diagnostics"}',  '{"Series B"}',  'warm',    '2026-06-02', null, 'dec0ffee-0000-4000-8000-000000000001'),
('Orbit Foods',         'Other', 'Delhi',     'India',     '{"Consumer","D2C"}',            '{"Series A"}',  'warm',    '2026-05-30', null, 'dec0ffee-0000-4000-8000-000000000001'),
('Saffron Retail',      'Other', 'Mumbai',    'India',     '{"Consumer Tech","Retail"}',    '{"Series A"}',  'warm',    '2026-05-27', null, 'dec0ffee-0000-4000-8000-000000000001'),
('Lighthouse Capital',  'Other', 'Singapore', 'Singapore', '{"Fintech"}',                   '{"Seed"}',      'warm',    '2026-05-24', null, 'dec0ffee-0000-4000-8000-000000000001'),
('Northstar Ventures',  'Other', 'Bengaluru', 'India',     '{"SaaS","AI"}',                 '{"Seed"}',      'hot',     '2026-06-07', 'Analyst call done; sharp team out of Stripe.', 'dec0ffee-0000-4000-8000-000000000001'),
('Xero Degrees',        'Other', 'Gurugram',  'India',     '{"Consumer","QSR"}',            '{"Pre-seed"}',  'cold',    '2026-04-20', null, 'dec0ffee-0000-4000-8000-000000000001'),
('Green Protein',       'Other', 'Pune',      'India',     '{"FoodTech","Consumer"}',       '{"Seed"}',      'warm',    '2026-05-18', null, 'dec0ffee-0000-4000-8000-000000000001'),
('White Whale',         'Other', 'Mumbai',    'India',     '{"Logistics","SaaS"}',          '{"Series A"}',  'cold',    '2026-04-28', null, 'dec0ffee-0000-4000-8000-000000000001'),
('Forj Capital',        'Other', 'Bengaluru', 'India',     '{"Fintech","Lending"}',         '{"Series B"}',  'cold',    '2026-04-12', null, 'dec0ffee-0000-4000-8000-000000000001'),
('Varanium Capital',    'Other', 'Mumbai',    'India',     '{"Fintech"}',                   '{"Series C"}',  'dormant', '2026-02-15', null, 'dec0ffee-0000-4000-8000-000000000001'),
('HoV Mushrooms',       'Other', 'Mumbai',    'India',     '{"Consumer","AgriTech"}',       '{"Series A"}',  'hot',     '2026-06-09', 'Dubai expansion underway; founder very responsive.', 'dec0ffee-0000-4000-8000-000000000001'),
('Cloudbyte',           'Other', 'Chennai',   'India',     '{"SaaS","Infrastructure"}',     '{"Series D"}',  'warm',    '2026-05-21', null, 'dec0ffee-0000-4000-8000-000000000001'),
('Aurelia Beauty',      'Other', 'Mumbai',    'India',     '{"Consumer","D2C"}',            '{"Series E+"}', 'dormant', '2026-01-30', null, 'dec0ffee-0000-4000-8000-000000000001'),
('Kite Mobility',       'Other', 'Bengaluru', 'India',     '{"Mobility","EV"}',             '{"Pre-seed"}',  'warm',    '2026-06-01', null, 'dec0ffee-0000-4000-8000-000000000001');
