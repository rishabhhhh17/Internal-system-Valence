-- ============================================================================
-- Phase 3.6 — Interactions: expand contexts beyond the pre-mandate funnel
-- ============================================================================
-- The DB column stays `interaction_purpose` for backwards compatibility, but
-- the UI relabels to "Context" and grows from 4 → 12 options spanning the
-- full mandate lifecycle:
--
--   Pre-mandate (existing 4):
--     pitch_for_mandate · counterparty_outreach · relationship_building · referral
--   Live mandate execution (new 5):
--     client_update · investor_buyer_engagement · diligence_session ·
--     negotiation · closing_coordination
--   Post / cross-cutting (new 3):
--     post_close_followup · co_advisor_sync · industry_intel
--
-- New outcomes added: action_required · completed · blocked · signed.
-- Existing outcomes stay valid.
--
-- Idempotent. Safe to run on a project that already has the original
-- constraints from Phase 1.
-- ============================================================================

-- Drop old CHECK constraints if they exist
alter table public.interactions
  drop constraint if exists interactions_interaction_purpose_check,
  drop constraint if exists interactions_outcome_check;

-- Re-add wider CHECK on interaction_purpose (the column name stays the same)
alter table public.interactions
  add constraint interactions_interaction_purpose_check
    check (interaction_purpose in (
      'pitch_for_mandate',
      'counterparty_outreach',
      'relationship_building',
      'referral',
      'client_update',
      'investor_buyer_engagement',
      'diligence_session',
      'negotiation',
      'closing_coordination',
      'post_close_followup',
      'co_advisor_sync',
      'industry_intel'
    ));

-- Re-add wider CHECK on outcome
alter table public.interactions
  add constraint interactions_outcome_check
    check (outcome in (
      'to_followup',
      'in_progress',
      'converted_to_mandate',
      'pitched_lost',
      'interested',
      'passed',
      'referred_out',
      'stay_warm',
      'closed',
      'action_required',
      'completed',
      'blocked',
      'signed'
    ));
