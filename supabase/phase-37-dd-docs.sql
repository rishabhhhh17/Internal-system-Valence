-- ============================================================================
-- Phase 37 — Document tracker (deals.dd_docs)
-- ============================================================================
-- The Active Deals page now has a Document tracker: per deal, which diligence
-- documents the fund has received (Founders) / shared (LPs) and which are
-- still outstanding. State lives in a single jsonb column:
--   dd_docs = { "<docKey>": { "status": "received|pending|na", "date": "YYYY-MM-DD"|null } }
-- An absent key reads as 'pending', so the column can default to '{}'.
--
-- Doc keys (see src/lib/diligenceDocs.js):
--   company: nda, pitch_deck, financial_model, cap_table, customer_contracts,
--            ip_assignment, incorporation, option_plan
--   lp:      nda, investor_collateral, lpa_side_letter, track_record, ddq, kyc_aml
--
-- Below we seed the on-screen (live-stage) active deals with a realistic mix so
-- the tracker reads as a working board on the demo — later-stage deals are more
-- complete; the IP assignment lag is the classic Series-A red flag. Each UPDATE
-- only touches rows still at the default '{}' so it's idempotent and never
-- clobbers a status the user has since clicked.
-- ============================================================================

alter table public.deals add column if not exists dd_docs jsonb not null default '{}'::jsonb;

-- ── Founders (kind='company') ──────────────────────────────────────────────
-- Memo — furthest along; everything in bar the IP assignments (still chasing).
update public.deals set dd_docs = '{
  "nda":{"status":"received","date":"2026-04-28"},
  "pitch_deck":{"status":"received","date":"2026-04-28"},
  "financial_model":{"status":"received","date":"2026-04-29"},
  "cap_table":{"status":"received","date":"2026-04-30"},
  "customer_contracts":{"status":"received","date":"2026-05-02"},
  "ip_assignment":{"status":"pending","date":null},
  "incorporation":{"status":"received","date":"2026-04-28"},
  "option_plan":{"status":"received","date":"2026-05-03"}
}'::jsonb
where kind='company' and stage='Memo' and dd_docs = '{}'::jsonb;

-- Partner Call — core financials in, commercial + IP still outstanding.
update public.deals set dd_docs = '{
  "nda":{"status":"received","date":"2026-05-01"},
  "pitch_deck":{"status":"received","date":"2026-05-01"},
  "financial_model":{"status":"received","date":"2026-05-04"},
  "cap_table":{"status":"received","date":"2026-05-04"},
  "customer_contracts":{"status":"pending","date":null},
  "ip_assignment":{"status":"pending","date":null},
  "incorporation":{"status":"received","date":"2026-05-02"},
  "option_plan":{"status":"na","date":null}
}'::jsonb
where kind='company' and stage='Partner Call' and dd_docs = '{}'::jsonb;

-- Analyst Call — early; just NDA + deck so far.
update public.deals set dd_docs = '{
  "nda":{"status":"received","date":"2026-05-05"},
  "pitch_deck":{"status":"received","date":"2026-05-05"},
  "financial_model":{"status":"pending","date":null},
  "cap_table":{"status":"pending","date":null},
  "customer_contracts":{"status":"pending","date":null},
  "ip_assignment":{"status":"pending","date":null},
  "incorporation":{"status":"pending","date":null},
  "option_plan":{"status":"pending","date":null}
}'::jsonb
where kind='company' and stage='Analyst Call' and dd_docs = '{}'::jsonb;

-- ── LPs (kind='lp') ────────────────────────────────────────────────────────
-- Soft-circled — almost there; only KYC outstanding.
update public.deals set dd_docs = '{
  "nda":{"status":"received","date":"2026-04-26"},
  "investor_collateral":{"status":"received","date":"2026-04-27"},
  "lpa_side_letter":{"status":"received","date":"2026-05-03"},
  "track_record":{"status":"received","date":"2026-04-29"},
  "ddq":{"status":"received","date":"2026-05-05"},
  "kyc_aml":{"status":"pending","date":null}
}'::jsonb
where kind='lp' and stage='LP Soft Circle' and dd_docs = '{}'::jsonb;

-- Fund DD — running their diligence; LPA + DDQ + KYC still in flight.
update public.deals set dd_docs = '{
  "nda":{"status":"received","date":"2026-04-30"},
  "investor_collateral":{"status":"received","date":"2026-05-01"},
  "lpa_side_letter":{"status":"pending","date":null},
  "track_record":{"status":"received","date":"2026-05-02"},
  "ddq":{"status":"pending","date":null},
  "kyc_aml":{"status":"pending","date":null}
}'::jsonb
where kind='lp' and stage='LP Due Diligence' and dd_docs = '{}'::jsonb;

-- Meeting — opening collateral shared, the rest to follow.
update public.deals set dd_docs = '{
  "nda":{"status":"received","date":"2026-05-06"},
  "investor_collateral":{"status":"received","date":"2026-05-06"},
  "lpa_side_letter":{"status":"pending","date":null},
  "track_record":{"status":"pending","date":null},
  "ddq":{"status":"pending","date":null},
  "kyc_aml":{"status":"pending","date":null}
}'::jsonb
where kind='lp' and stage='LP Meeting' and dd_docs = '{}'::jsonb;
