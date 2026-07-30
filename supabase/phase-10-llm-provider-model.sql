-- Phase 10 — Record which LLM provider + model served each AI action.
-- =========================================================================
-- Up until now ai_actions only knew the action_type and (later) the token
-- count + estimated cost. With multi-LLM support a customer can pick any
-- of Gemini / OpenAI / Anthropic / Vercel AI Gateway / a custom OpenAI-
-- compatible endpoint per call. We now persist:
--   - provider : the slug (matches src/lib/llmProviders.js PROVIDERS[i].id)
--   - model    : the model id within that provider (e.g. "gpt-4o-mini")
-- Both nullable so legacy / heuristic rows that never touched a provider
-- still record cleanly. Admin Billing surfaces these so we can see, per
-- customer, which provider's bill we're carrying.
-- =========================================================================

alter table public.ai_actions
  add column if not exists provider text,
  add column if not exists model    text;

create index if not exists ai_actions_org_provider_idx
  on public.ai_actions (org_id, provider);
