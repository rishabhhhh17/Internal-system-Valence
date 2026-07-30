-- ValenceOS · Phase 0 v2 — FIXUP 2: drop NOT NULL on legacy columns that
-- have been replaced by the new model.
--
-- The original deals table had `deal_type text NOT NULL`; the new model
-- replaces it with deal_types text[] + deal_subtype, so the NOT NULL
-- constraint blocks any insert that doesn't supply a legacy deal_type.
--
-- Idempotent. Run once; safe to re-run.

alter table public.deals
  alter column deal_type  drop not null,
  alter column nda_status drop not null;
