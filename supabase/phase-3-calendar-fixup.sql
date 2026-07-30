-- ============================================================================
-- Phase 3.3 fixup — add updated_by columns for the audit trigger
-- ============================================================================
-- The set_audit_update() trigger writes new.updated_by := auth.uid() on every
-- UPDATE. Without an `updated_by` column, the trigger throws and the UPDATE
-- fails with "record has no field updated_by". Idempotent.
--
-- Apply AFTER phase-3-calendar.sql.
-- ============================================================================

alter table public.team_calendars  add column if not exists updated_by uuid;
alter table public.calendar_events add column if not exists updated_by uuid;
