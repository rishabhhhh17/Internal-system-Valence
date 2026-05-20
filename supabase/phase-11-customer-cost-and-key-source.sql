-- Phase 11 — Track customer-billed cost + which key served each call.
-- =========================================================================
-- Multi-LLM means customers can pick any provider (Gemini / OpenAI /
-- Claude / Vercel AI Gateway / custom). For each provider they have a
-- choice: let US supply the key (managed — they pay us our markup) or
-- bring their own (BYO — they pay the upstream provider directly, we
-- bill nothing for AI tokens).
--
-- Each ai_actions row now records:
--   - customer_cost_usd : what we'll bill the customer for THIS call.
--                         Zero when key_source = 'byo' (we don't double-
--                         bill). Non-zero only on managed calls.
--   - key_source        : 'managed' (we keyed the upstream) | 'byo'
--                         (customer's own key keyed the upstream).
-- Both nullable so legacy / heuristic rows stay valid.
-- =========================================================================

alter table public.ai_actions
  add column if not exists customer_cost_usd numeric,
  add column if not exists key_source        text;

create index if not exists ai_actions_org_key_source_idx
  on public.ai_actions (org_id, key_source);
