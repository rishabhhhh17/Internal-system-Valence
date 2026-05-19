-- Phase 9 — Add tokens + estimated provider cost to the AI ledger.
-- =========================================================================
-- Each ai_actions row already records that a call happened. This extends
-- it to record:
--   - tokens_used         — provider-reported token count for the call
--   - estimated_cost_usd  — our marginal cost for serving that call
-- Both nullable so callers that don't know either can still record a
-- classification-only row. The admin consumption view (src/pages/
-- AdminBilling.jsx) sums these per org so we can see — on our end —
-- exactly what each customer is burning in tokens and money.
-- =========================================================================

alter table public.ai_actions
  add column if not exists tokens_used        int,
  add column if not exists estimated_cost_usd numeric;

create index if not exists ai_actions_org_occurred_idx
  on public.ai_actions (org_id, occurred_at desc);
