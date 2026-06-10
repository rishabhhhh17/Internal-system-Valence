-- ============================================================================
-- Phase 41 — Seed auto-captured interactions (demo)
-- ============================================================================
-- The auto-capture engine (src/lib/autoCapture.js) turns connected Gmail +
-- Calendar into interaction rows tagged source='calendar'|'gmail'. The demo
-- Google account has a thin inbox, so seed a realistic set against real People
-- rows (counterparty_name MUST equal the person's full_name so warmth, which
-- groups by name, freshens). Dates spread over ~12 days; ~9 land in the last
-- week so the Today / capture-card weekly count reads full.
--
-- Notes: source/source_id drive dedup + the "Auto · Calendar/Gmail" badge.
-- `type` must be in the interactions_type_check enum (event / email_thread).
-- org_id set explicitly (service-role insert; set_org_id trigger only fills
-- nulls). Idempotent via the source_id NOT EXISTS guard.
-- ============================================================================

insert into public.interactions
  (person_id, counterparty_name, counterparty_company, counterparty_type, source, source_id, type, interaction_type, subject, summary, occurred_at, created_at, is_complete, lead_owner, org_id)
select p.id, p.full_name, p.company, v.ctype, v.source, v.source_id, v.type, v.type, v.subject,
       (case when v.source='calendar' then 'Meeting: ' else 'Email: ' end) || v.subject,
       now() - (v.days_ago || ' days')::interval,
       now() - (v.days_ago || ' days')::interval,
       true, 'Aarav Mehta', 'dec0ffee-0000-4000-8000-000000000001'
from (values
  ('13819e29-9a36-435c-88ba-90e7fa8099b4'::uuid, 'founder',  'calendar', 'cal:seed-1',  'event',        'Partner call — Quantia Tech Series B', 1),
  ('13819e29-9a36-435c-88ba-90e7fa8099b4'::uuid, 'founder',  'gmail',    'gmail:seed-1','email_thread', 'Re: Quantia data room access',          4),
  ('24e922a2-51ff-467d-b16b-8fe668135e30'::uuid, 'founder',  'calendar', 'cal:seed-2',  'event',        'Orbit Foods — product & GTM review',    2),
  ('1cdb8d94-9692-4ec1-8a15-636587485ebd'::uuid, 'founder',  'gmail',    'gmail:seed-2','email_thread', 'Re: Orbit Foods cap table',             6),
  ('84ca1dd1-5e78-4423-b048-eb4a4c11435b'::uuid, 'founder',  'calendar', 'cal:seed-3',  'event',        'Northstar — analyst intro call',        3),
  ('84ca1dd1-5e78-4423-b048-eb4a4c11435b'::uuid, 'founder',  'gmail',    'gmail:seed-3','email_thread', 'Re: Northstar metrics pack',            9),
  ('61235de6-da58-4803-85a9-a37842acdf15'::uuid, 'founder',  'gmail',    'gmail:seed-4','email_thread', 'Re: Northstar reference intros',        7),
  ('54b11306-f812-4395-8028-594cdc90febf'::uuid, 'founder',  'calendar', 'cal:seed-4',  'event',        'Lighthouse Capital — IC prep',          0),
  ('d19594cc-296f-4087-98fb-251a0f6704c2'::uuid, 'investor', 'calendar', 'cal:seed-5',  'event',        'Maru Family Office — LP catch-up',      2),
  ('d19594cc-296f-4087-98fb-251a0f6704c2'::uuid, 'investor', 'gmail',    'gmail:seed-5','email_thread', 'Re: Maru — fund deck & DDQ',            5),
  ('2b0d97db-d425-414b-910f-aac7884e85c1'::uuid, 'investor', 'gmail',    'gmail:seed-6','email_thread', 'Re: Tigerleap — co-invest in Quantia?', 8),
  ('93fb079d-8c72-4b33-8add-1cfc14fe79b5'::uuid, 'investor', 'calendar', 'cal:seed-6',  'event',        'Emberline — quarterly LP update',       10),
  ('ffa1e9cc-4179-4e31-8675-111467e46531'::uuid, 'investor', 'gmail',    'gmail:seed-7','email_thread', 'Re: Catalyst — allocation timing',      6),
  ('ff5ad141-bd56-4657-91aa-ace90b11f9e9'::uuid, 'investor', 'calendar', 'cal:seed-7',  'event',        'Banyan Equity — intro coffee',          11)
) as v(person_id, ctype, source, source_id, type, subject, days_ago)
join public.people p on p.id = v.person_id
where not exists (select 1 from public.interactions i where i.source_id = v.source_id);
