-- ============================================================================
-- ValenceOS · Phase 18b — interactions table fix + legacy bridge
-- ----------------------------------------------------------------------------
-- Two unrelated fixes bundled together because both block Phase 19 scoring:
--
-- 1. interactions table was missing the `updated_by` column that the global
--    set_audit_update() trigger references. Every other table using that
--    trigger (deals, documents, comps, etc.) has both updated_at and
--    updated_by. The missing column meant ANY direct UPDATE on interactions
--    errored with "record 'new' has no field 'updated_by'".
--    Note: backfill_interaction_fks() works around this with
--    `set local session_replication_role = 'replica'`, which disables
--    triggers for that one function. Direct UPDATEs still hit the bug.
--
-- 2. The 14 legacy interactions in the demo org (3fff2bc2-...) were created
--    before the new auto-capture columns existed (valence_person_id,
--    interaction_type, occurred_at) and ALSO have created_by = NULL, so
--    backfill_interaction_fks() can't auto-resolve valence_person_id via
--    the seats table. One-time scoped UPDATE fills those columns by
--    assumption (the org has exactly one Valence team person: Rishabh).
--    Scoped explicitly to that org_id so future client orgs onboard cleanly.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

alter table public.interactions add column if not exists updated_by uuid;

update public.interactions
set
  valence_person_id = coalesce(valence_person_id, 'bf01533f-57be-449b-a7f5-0c6a88c7b632'::uuid),
  occurred_at       = coalesce(occurred_at, created_at),
  interaction_type  = coalesce(
    interaction_type,
    case lower(type)
      when 'phone_call'    then 'call_logged'
      when 'pitch_meeting' then 'meeting'
      when 'intro_call'    then 'meeting'
      when 'coffee'        then 'meeting'
      when 'event'         then 'meeting'
      when 'email_thread'  then 'email_received'   -- a thread implies a reply landed
      else null                                     -- referral_in/out / other → not scoreable
    end
  )
where org_id = '3fff2bc2-e9d8-4e96-b314-c76fb30568a1'
  and (valence_person_id is null or interaction_type is null or occurred_at is null);
